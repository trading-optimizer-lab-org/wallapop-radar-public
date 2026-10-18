// node precio/informe.mjs <producto.json> -> out/proveedores.json + out/proveedores.md (y resumen en GitHub)
// Lee lo que dejó visitar.mjs (out/raw-*.json), añade Wallapop (API) y separa nuevo / reacondicionado / segunda mano.
import fs from 'fs';

const prod = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const COND = JSON.parse(fs.readFileSync(new URL('./condiciones.json', import.meta.url), 'utf8'));
const inc = new RegExp(prod.modelo.incluye, 'i'), exc = new RegExp(prod.modelo.excluye, 'i');
const esModelo = s => inc.test(s || '') && !exc.test(s || '');
let GBP = 1.17; try { GBP = 1 / (await (await fetch('https://api.frankfurter.app/latest?from=EUR&to=GBP')).json()).rates.GBP; } catch {}
const num = s => { s = String(s).replace(/[^\d.,]/g, ''); if (/,\d{2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.'); else s = s.replace(/,/g, ''); return parseFloat(s); };
const cap = s => { s = String(s || '').toLowerCase(); const m = s.match(/\b(64|128|256|512)\s?-?(gb|go|g)\b|\b(1|2)\s?-?(tb|to)\b/); return m ? (m[1] ? m[1] + ' GB' : m[3] + ' TB') : null; };
const condicion = fuente => { const k = Object.keys(COND).filter(k => !k.startsWith('_') && fuente.startsWith(k)).sort((a, b) => b.length - a.length)[0]; return k ? COND[k] : {}; };
const estadoDe = (e, def) => /Refurbished/i.test(e) ? 'reacondicionado' : /Used/i.test(e) ? 'segunda mano' : /New/i.test(e) ? 'nuevo' : def;
const ofertas = [];
const add = (f, estado, precio, nombre, url, extra = {}) => {
  if (!(precio > 0)) return;
  const c = cap(nombre + ' ' + (url || '')) || f.capacidad || '?';
  if (prod.capacidades && c !== '?' && !prod.capacidades.includes(c)) return; // capacidad que el modelo no tiene: es otro producto
  if (/\/redir\//.test(url || '')) url = f.url; // enlaces de salida del comparador: se enlaza su ficha
  ofertas.push({ fuente: f.fuente, pais: f.pais, estado, precio: Math.round(precio * 100) / 100, capacidad: c,
    detalle: String(nombre || '').replace(/\s+/g, ' ').slice(0, 110), url: url || f.url, ...condicion(f.fuente), ...extra });
};

// Datos estructurados schema.org: el nombre del producto pasa a sus ofertas
function leerLD(f, ld) {
  const def = f.tipo === 'comparador' ? 'nuevo' : f.tipo; const moneda = m => m === 'GBP' ? GBP : 1;
  const walk = (x, padre) => { if (!x || typeof x !== 'object') return; if (Array.isArray(x)) return x.forEach(y => walk(y, padre));
    const t = [].concat(x['@type'] || []).join(',');
    const nombre = /Product/.test(t) ? (x.name || padre?.nombre) : padre?.nombre; const est = /Product/.test(t) ? (x.itemCondition || padre?.est) : padre?.est;
    if (/Offer/.test(t)) {
      // Ofertas que se llaman solo "Negro / Impecable": heredan el nombre del producto
      const n = x.name && inc.test(x.name) ? x.name : [nombre, x.name].filter(Boolean).join(' · ');
      const u = (x.url || '').replace(/https?:\/\/[^/]+/, '').replace(/\d{4,}/g, ''); // los códigos numéricos no cuentan como modelo
      if ((n && !esModelo(n)) || (u && exc.test(u))) return;
      if (/OutOfStock|SoldOut|Discontinued/i.test(x.availability || '')) return; // agotado: no se puede comprar
      if (/AggregateOffer/.test(t)) { if (!x.offers) { add(f, estadoDe(x.itemCondition || est, def), +(x.lowPrice ?? x.price) * moneda(x.priceCurrency), (n || f.fuente) + ' (desde)', x.url); return; } }
      else add(f, estadoDe(x.itemCondition || est, def), +x.price * moneda(x.priceCurrency), n || f.fuente, x.url, { vendedor: x.seller?.name || '' });
    }
    for (const [k, v] of Object.entries(x)) if (v && typeof v === 'object') walk(v, { nombre, est });
  };
  for (const s of ld || []) { try { walk(JSON.parse(s), null); } catch {} }
}

const LECTORES = {
  prisjakt(f, t) { // PriceSpy (UK) / LeDénicheur (FR): bloque de usados/reacondicionados y lista de ofertas de tiendas
    const m = f.pais === 'UK' ? GBP : 1;
    for (const x of t.matchAll(/\n(Used|Refurbished|Reconditionné|Occasion)\n(?:from|Dès)\n£?\s?([\d.,\s ]+)\s?€?/gi)) add(f, /used|occasion/i.test(x[1]) ? 'segunda mano' : 'reacondicionado', num(x[2]) * m, x[1] + ' (desde, varias tiendas)', f.url);
    for (const x of t.matchAll(/\n([^\n]{8,160})\n(?:£?[\d.,\s ]+\s?€?\n)?£?\s?([\d.,\s ]+)\s?€?\n(?:In stock|En stock|Delivery|Stock inconnu|Livraison|Out of stock)/g))
      if (esModelo(x[1]) && !/used|occasion|reconditionn|refurb/i.test(x[1])) add(f, 'nuevo', num(x[2]) * m, x[1], f.url);
  },
  certideal(f, t) { for (const x of t.matchAll(/\n([^\n]*iPhone[^\n]+)\nVoir plus\n\s*([\d.,]+)\s?€\n([^\n]+)/g)) if (esModelo(x[1])) add(f, 'reacondicionado', num(x[2]), x[1] + ' · ' + x[3], f.url); },
  clevertronic(f, t) { // precio por estado de la configuración por defecto (primera capacidad)
    const sec = t.split('Wähle den Zustand')[1] || '';
    for (const x of sec.matchAll(/\n(Neu|Wie neu|Sehr gut|Gut)\n([\d.,]+)\s?€/g)) add(f, x[1] === 'Neu' ? 'nuevo' : 'reacondicionado', num(x[2]), f.capacidad + ' · ' + x[1], f.url);
  },
  kimovil(f, t) {
    // Selector de versiones arriba de la página: "Global ... 8GB · 256GB · A3520\n909 € 9" (precio más bajo y nº de ofertas por versión).
    // La lista de tiendas (Fnac, Amazon, MediaMarkt...) se carga aparte y Kimovil la protege con Cloudflare: no se lee.
    const cab = t.split('Ver más versiones')[0];
    for (const bloque of cab.split(/\n(?=Global\n|International\n|N\. America\n|China\n)/).slice(1)) {
      const region = bloque.split('\n')[0];
      for (const m of bloque.matchAll(/\n\d+GB · (\d+(?:GB|TB))[^\n]*\n([\d.]+) € ?(\d+)?/g))
        add({ ...f, capacidad: undefined }, 'nuevo', num(m[2]), `Versión ${region} ${m[1]} (${m[3] || '?'} ofertas en Kimovil)`, f.url);
    }
    const n = (t.match(/Nuevo, ofertas desde:\s*([\d.]+)\s?€/) || [])[1]; if (n) add(f, 'nuevo', num(n), 'Precio más bajo global en Kimovil (puede ser importación)', f.url);
    const r = (t.match(/Reacondicionad[oa]s?,? (?:ofertas )?desde:?\s*([\d.]+)\s?€/i) || [])[1]; if (r) add(f, 'reacondicionado', num(r), 'Reacondicionado (varias tiendas)', f.url);
  },
  phonehouse(f, t) {
    const sec = t.split('Opciones de compra:')[1] || '';
    for (const m of sec.matchAll(/\n(Nuevo|Reacondicionado)\n(?:Estado: [^\n]+\n)?([\d.,]+)€/g)) add(f, m[1] === 'Nuevo' ? 'nuevo' : 'reacondicionado', num(m[2]), 'Phone House ' + m[1].toLowerCase(), f.url);
    for (const m of t.matchAll(/(Reacondicionado|Nuevo)?\s*\nEstado: ([^\n]+)\n([\d.,]+)€/g)) add(f, 'reacondicionado', num(m[3]), 'Reacondicionado, estado ' + m[2].toLowerCase(), f.url);
  },
  reboxed(f, t) { for (const m of t.matchAll(/(?:Starting at|From|Now)\s£([\d.,]+)/g)) add(f, 'reacondicionado', num(m[1]) * GBP, 'Reboxed (desde)', f.url); },
  musicmagpie(f, t) { // ficha de producto: el primer precio tras "Buy Now" es el del producto (lo demás son relacionados)
    const m = t.match(/Buy Now\n£([\d.,]+)/); if (m) add(f, 'reacondicionado', num(m[1]) * GBP, 'musicMagpie (reacondicionado certificado)', f.url); },
  asgoodasnew(f, t) {
    for (const bq of t.split(/\n(?=Apple iPhone )/).slice(1)) { const nombre = bq.split('\n')[0]; if (!esModelo(nombre)) continue;
      for (const m of bq.matchAll(/\n(Neu|Wie Neu|Sehr Gut|Gut)\nab ([\d.]+),-/g)) add(f, m[1] === 'Neu' ? 'nuevo' : 'reacondicionado', num(m[2]), nombre + ' · ' + m[1], f.url); }
  },
  vinted(f, t) { for (const m of t.matchAll(/\n([^\n]{4,90})\n(?:Destacado\n)?([^\n]{3,40})\n([\d.,]+)\s?€\n([\d.,]+)\s?€\nincl/g)) if (esModelo(m[1])) add(f, 'segunda mano', num(m[4]), m[1] + ' · ' + m[2] + ' (con protección al comprador)', f.url); },
  milanuncios(f, t) { for (const m of t.matchAll(/\n([^\n]{4,90})\n([\d.]+)\s?€\n[^\n]*\n(?:[^\n]*\n)?([^\n]{0,140})/g)) if (esModelo(m[1])) add(f, 'segunda mano', num(m[2]), m[1] + ' · ' + m[3], f.url); },
  aliexpress(f, t) { for (const m of t.matchAll(/\n([^\n]{10,200})\n([\d.]+(?:,\d{1,2})?)\s?€/g)) if (esModelo(m[1])) add(f, /grado|reacondicionad|renovad|excelente|\d\d% nuevo/i.test(m[1]) ? 'reacondicionado' : 'nuevo', num(m[2]), m[1], f.url); },
};

const estado = []; // qué pasó con cada ficha
for (const file of fs.readdirSync('out').filter(x => /^raw-.*\.json$/.test(x))) for (const r of JSON.parse(fs.readFileSync('out/' + file, 'utf8'))) {
  const f = prod.fichas.find(x => x.url === r.ficha.url) || r.ficha, antes = ofertas.length; // configuración actual del producto
  if (!r.error && r.http < 400) {
    if (f.lector === 'mediamarkt') { for (const o of r.mm || []) if (esModelo(o.t)) add(f, o.reac ? 'reacondicionado' : 'nuevo', o.p, o.t, o.url, { vendedor: o.tienda.includes('marketplace') ? 'vendedor externo' : 'MediaMarkt' }); }
    else if (LECTORES[f.lector]) LECTORES[f.lector](f, r.txt || '');
    else leerLD(f, r.ld);
  }
  estado.push({ fuente: f.fuente, http: r.http || '', ofertas: ofertas.length - antes, error: r.error || (r.http >= 400 ? 'HTTP ' + r.http : '') });
}
// Wallapop por API: sin abrir y nuevo (van con los nuevos, aunque los venda un particular), como nuevo y buen estado
const H = { headers: { 'X-DeviceOS': '0' } }, vistosW = new Set(); // el filtro "new" de Wallapop también devuelve los "sin abrir"
for (const [c, et, est] of [['un_opened', 'sin abrir (particular)', 'nuevo'], ['new', 'nuevo (particular)', 'nuevo'], ['as_good_as_new', 'como nuevo', 'segunda mano'], ['good', 'buen estado', 'segunda mano']]) {
  let url = `https://api.wallapop.com/api/v3/search/section?keywords=${encodeURIComponent(prod.busqueda)}&condition=${c}&order_by=most_relevance&source=search_box&section_type=organic_search_results&latitude=42.8467&longitude=-2.6716`; const antes = ofertas.length;
  for (let pg = 0; pg < 3 && url; pg++) { const j = await (await fetch(url, H)).json().catch(() => ({}));
    for (const x of j.data?.section?.items || []) if (!vistosW.has(x.id) && vistosW.add(x.id) && esModelo(x.title)) add({ fuente: 'Wallapop · ' + et, pais: 'ES', tipo: est }, est, x.price.amount, x.title, 'https://es.wallapop.com/item/' + x.web_slug, { envio: x.shipping?.user_allows_shipping ? 'envío Wallapop' : 'solo en mano' });
    const nx = j.meta?.next_page; url = nx ? 'https://api.wallapop.com/api/v3/search/section?next_page=' + encodeURIComponent(nx) : null; }
  estado.push({ fuente: 'Wallapop · ' + et, http: 'API', ofertas: ofertas.length - antes, error: '' });
}
// Fuera piezas, accesorios y anuncios absurdos: menos del 40 % de la mediana del modelo
const med = [...ofertas].map(o => o.precio).sort((a, b) => a - b)[Math.floor(ofertas.length / 2)] || 0;
const validas = ofertas.filter(o => o.precio >= 0.4 * med).sort((a, b) => a.precio - b.precio);
fs.writeFileSync('out/proveedores.json', JSON.stringify({ producto: prod.producto, fecha: new Date().toISOString(), mediana: med, estado, ofertas: validas }, null, 1));

const CAPS = ['64 GB', '128 GB', '256 GB', '512 GB', '1 TB', '2 TB', '?'];
let md = `## Dónde comprar más barato: ${prod.producto}\n${validas.length} ofertas de ${new Set(validas.map(o => o.fuente.split(' ·')[0])).size} fuentes · ${new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })} · libras a ${GBP.toFixed(3)} €\n`;
for (const est of ['nuevo', 'reacondicionado', 'segunda mano']) {
  const E = validas.filter(o => o.estado === est); md += `\n### ${est[0].toUpperCase() + est.slice(1)} (${E.length} ofertas)\n| Capacidad | Precio | Fuente | País | Garantía | Devolución | Envío | Detalle |\n|---|---|---|---|---|---|---|---|\n`;
  for (const c of CAPS) { const vistos = new Set(); let n = 0;
    for (const o of E.filter(o => o.capacidad === c)) { const k = o.fuente.split(' ·')[0]; if (vistos.has(k) || n >= 5) continue; vistos.add(k); n++;
      md += `| ${c} | ${o.precio.toFixed(2)} € | [${o.fuente}](${o.url}) | ${o.pais || ''} | ${o.garantia || ''} | ${o.devolucion || ''} | ${o.envio || ''} | ${o.detalle.replace(/\|/g, '/').slice(0, 70)} |\n`; } }
}
md += `\n### Estado de cada fuente\n| Fuente | HTTP | Ofertas | Incidencia |\n|---|---|---|---|\n` + estado.map(e => `| ${e.fuente} | ${e.http} | ${e.ofertas} | ${e.error} |`).join('\n');
md += `\n\n_Amazon, El Corte Inglés, eBay, Back Market y los buscadores de idealo, Geizhals y PriceSpy no se consultan directamente: su robots.txt lo prohíbe o tienen verificación anti-robots. Amazon.de, Amazon UK y eBay UK aparecen dentro de Geizhals y PriceSpy. Precios de particulares (Wallapop, Vinted, Milanuncios) sin garantía: los muy bajos pueden ser timos o móviles bloqueados._\n`;
fs.writeFileSync('out/proveedores.md', md);
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
console.log(md);
