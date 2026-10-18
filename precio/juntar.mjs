// node precio/juntar.mjs "<producto>" "<obligatorias>" "<excluir>" -> out/precio-resultado.json + resumen en Markdown
// (en GitHub Actions el resumen va a $GITHUB_STEP_SUMMARY). Coste puesto en Vitoria = precio + envío (+ IVA 21 % si viene de fuera de la UE).
import fs from 'fs';

const [producto, obligStr = '', excluirStr = '', minStr = ''] = process.argv.slice(2);
const compact = s => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9+]/g, '');
const palabras = s => s.split(',').map(x => compact(x)).filter(Boolean);
// Por defecto: palabras del producto con números (modelo) o la marca; el usuario puede fijarlas a mano
const auto = producto.toLowerCase().split(/\s+/).filter(w => /\d/.test(w) || w.length > 3);
const oblig = obligStr ? palabras(obligStr) : auto.map(compact);
const excluir = palabras(excluirStr);
const ACCESORIO = /funda|carcasa|protector|correa|cristal templado|cable|cargador|soporte|pegatina|skin|vinilo|adaptador|estuche|bolsa|repuesto|compatible|(?:para|per|für|pour|for) (?:la |el |il |le |die |the )?(?:iphone|samsung|xbox|ps5|ps4|playstation|switch|nintendo|ipad|macbook|airpods|apple watch|galaxy|console|consola)|mando para|base de carga|stand|monitor port[aá]til|monitor portatile|tragbarer monitor|ventilador|cubierta|polvo|bater[ií]as? para|kit de carga|play and charge|auriculares para|almohadillas|tapa|pantalla de repuesto|sticker|grip|thumb|joystick para|disco duro para|tarjeta de (?:memoria|expansi[oó]n)|cooling|refrigeraci[oó]n/i;
const UE = new Set(['ES', 'DE', 'FR', 'IT', 'PT', 'NL', 'BE', 'AT', 'IE', 'PL', 'CZ', 'Alemania', 'Francia', 'Italia', 'España', 'Portugal', 'Países Bajos', 'Bélgica', 'Polonia']);

let cambio = { EUR: 1 };
try { const j = await (await fetch('https://api.frankfurter.app/latest?from=EUR')).json(); for (const [k, v] of Object.entries(j.rates || {})) cambio[k] = 1 / v; } catch {}

const fuentes = fs.readdirSync('out').filter(f => /^precio-.*\.json$/.test(f) && f !== 'precio-resultado.json').map(f => JSON.parse(fs.readFileSync('out/' + f)));
let todas = fuentes.flatMap(f => f.ofertas.map(o => ({ ...o, fuente: f.fuente })));
todas = todas.filter(o => { const t = compact(o.t); return oblig.every(k => t.includes(k)) && !excluir.some(k => t.includes(k)) && !ACCESORIO.test(o.t); });
// Precio de referencia: mediana de los anuncios relevantes de Wallapop que coinciden; si no hay, mediana de las ofertas
const mediana = a => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)] || 0; };
const refW = fuentes.flatMap(f => f.referencia || []).filter(o => { const t = compact(o.t); return oblig.every(k => t.includes(k)) && !ACCESORIO.test(o.t); }).map(o => o.p);
const ancla = refW.length >= 5 ? mediana(refW) : mediana(todas.map(o => o.p));
const minimo = minStr ? +minStr : Math.round(ancla * 0.5);
todas = todas.filter(o => o.p >= minimo); // fuera accesorios, piezas y anuncios absurdamente baratos
for (const o of todas) {
  const tc = cambio[o.moneda] || 1; const base = o.p * tc; const env = o.envio == null ? null : o.envio * tc;
  const fueraUE = o.pais && !UE.has(o.pais) && !o.ivaIncluido && o.pais !== '?' && o.pais !== 'Varios';
  o.coste = Math.round((base + (env || 0)) * (fueraUE ? 1.21 : 1) * 100) / 100;
  o.notas = [env == null ? 'envío no indicado' : env === 0 ? 'envío gratis' : null, fueraUE ? 'fuera de la UE: +21 % IVA, posible aduana' : null, o.reac ? 'reacondicionado o usado' : null, o.wallapop ? 'particular en Wallapop' : null].filter(Boolean).join('; ');
}
todas.sort((a, b) => a.coste - b.coste);
const nuevos = todas.filter(o => !o.reac && !o.wallapop), reac = todas.filter(o => o.reac);
const estado = fuentes.map(f => ({ fuente: f.fuente, ofertas: f.ofertas.length, error: f.error }));
fs.writeFileSync('out/precio-resultado.json', JSON.stringify({ producto, obligatorias: oblig, excluir, minimo, referenciaWallapop: ancla, fecha: new Date().toISOString(), estado, nuevos, reacondicionados: reac }, null, 1));

const fila = (o, i) => `| ${i + 1} | ${o.coste.toFixed(2)} € | ${o.p.toFixed(2)} ${o.moneda} | ${o.envio == null ? '?' : o.envio.toFixed(2)} | ${o.tienda} | ${o.pais || ''} | ${o.entrega || ''} | [${o.t.replace(/\|/g, '/').slice(0, 70)}](${o.url}) | ${o.notas} |`;
const cab = '| # | Coste puesto | Precio | Envío | Tienda | Desde | Entrega | Oferta | Notas |\n|---|---|---|---|---|---|---|---|---|';
const md = [`## Precio más barato: ${producto}`, `Palabras obligatorias: \`${oblig.join(', ')}\`${excluir.length ? ' · Excluidas: `' + excluir.join(', ') + '`' : ''} · Precio mínimo considerado: ${minimo} € (mediana en Wallapop ${ancla} €) · ${new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })}`,
  '', '### Nuevo', nuevos.length ? cab + '\n' + nuevos.slice(0, 20).map(fila).join('\n') : '_Sin ofertas nuevas que coincidan._',
  '', '### Reacondicionado o usado', reac.length ? cab + '\n' + reac.slice(0, 10).map(fila).join('\n') : '_Sin ofertas reacondicionadas que coincidan._',
  '', '### En Wallapop (referencia de venta, particulares)', todas.filter(o => o.wallapop).length ? cab + '\n' + todas.filter(o => o.wallapop).slice(0, 5).map(fila).join('\n') : '_Sin anuncios nuevos que coincidan._',
  '', '### Estado de cada tienda', '| Fuente | Ofertas | Error |\n|---|---|---|', ...estado.map(e => `| ${e.fuente} | ${e.ofertas} | ${e.error || ''} |`),
  '', '_Coste puesto = precio + envío indicado por la tienda (+21 % IVA si viene de fuera de la UE). "?" = la tienda no indica el envío en el listado: revisar en la ficha. Amazon, El Corte Inglés, eBay y el buscador de idealo no se consultan porque su robots.txt lo prohíbe._'].join('\n');
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + '\n');
fs.writeFileSync('out/precio-resumen.md', md);
console.log(md.split('\n').slice(0, 12).join('\n'));
