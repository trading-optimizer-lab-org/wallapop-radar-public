// Fuentes del buscador de precio más barato. Cada fuente devuelve ofertas:
// { tienda, pais, t (título), p (precio), envio (null si no lo indica), moneda, url, entrega, reac (reacondicionado) }
// Solo tiendas que envían a España. Reglas para no provocar bloqueos: una búsqueda por tienda y ejecución, sin reintentos,
// robots.txt respetado, incluidas las reglas para Claude-User (Amazon lo prohíbe; El Corte Inglés, eBay e idealo prohíben su buscador), y si una web muestra
// captcha o verificación se para en esa tienda.
import { permitido } from './robots.mjs';

export const BLOQUEO = /captcha|robot check|introduce los caracteres|verificación de seguridad|access denied|acceso denegado|just a moment|un momento|punish/i;
const num = s => { const m = String(s || '').replace(/\s/g, '').match(/(\d{1,3}(?:[. ]\d{3})*|\d+)(?:[,.](\d{2}))?/); return m ? +(m[1].replace(/[. ]/g, '') + '.' + (m[2] || '00')) : null; };
const REAC = /reacondicionad|renovad|refurbished|renewed|generalüberholt|reconditionn|ricondizionat|seminuevo|como nuevo|grado [abc]\b|estado [abc]\b/i;

async function ir(page, url) {
  const rb = await permitido(url);
  if (!rb.ok) throw new Error('PROHIBIDO_ROBOTS ' + rb.regla);
  const r = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(2500);
  const txt = await page.evaluate(() => document.body.innerText.slice(0, 3000));
  if ((r && r.status() >= 400) || BLOQUEO.test(txt)) throw new Error('BLOQUEO ' + (r ? r.status() : ''));
}

// Amazon: se fija la entrega en España (código postal 01001 en .es, país ES en .de/.fr/.it) antes de buscar
function amazon(tld, pais) {
  return async (page, q) => {
    await ir(page, `https://www.amazon.${tld}/`);
    await page.evaluate(async ({ tld }) => {
      const m = document.querySelector('#nav-global-location-data-modal-action');
      const tok = m ? (JSON.parse(m.getAttribute('data-a-modal') || '{}').ajaxHeaders || {})['anti-csrftoken-a2z'] : null;
      if (!tok) return;
      const body = tld === 'es' ? { locationType: 'LOCATION_INPUT', zipCode: '01001', storeContext: 'generic', deviceType: 'web', pageType: 'Gateway', actionSource: 'glow' }
        : { locationType: 'COUNTRY', district: 'ES', countryCode: 'ES', storeContext: 'generic', deviceType: 'web', pageType: 'Gateway', actionSource: 'glow' };
      await fetch('/portal-migration/hz/glow/address-change?actionSource=glow', { method: 'POST', headers: { 'anti-csrftoken-a2z': tok, 'content-type': 'application/json' }, body: JSON.stringify(body) }).catch(() => {});
    }, { tld });
    await ir(page, `https://www.amazon.${tld}/s?k=${encodeURIComponent(q)}`);
    return (await page.evaluate(() => [...document.querySelectorAll('div[data-component-type="s-search-result"]')].map(x => {
      const t = x.innerText.replace(/\s+/g, ' '); const asin = x.getAttribute('data-asin');
      return { t: (x.querySelector('h2')?.innerText || '').trim(), pTxt: x.querySelector('.a-price .a-offscreen')?.innerText || '', asin,
        envioTxt: (t.match(/([+]?\s?\d+[,.]\d{2}\s?€?\s?(?:de )?(?:envío|Versand|livraison|spedizione|delivery)[^.]{0,30})/i) || [])[0] || '',
        gratis: /env[íi]o gratis|kostenlose lieferung|livraison gratuite|spedizione gratuita|entrega gratis|gratis/i.test(t),
        noEnvia: /no se puede enviar|kann nicht.*geliefert|ne peut pas être expédié|non può essere spedito|cannot be shipped/i.test(t),
        entrega: (t.match(/(Entrega|Lieferung|Livraison|Consegna|Llega)[^.]{0,70}?(\d{1,2}[ .]+(?:de )?[A-Za-zäéû]{3,10}|mañana|morgen|demain|domani)/i) || [])[0] || null };
    }))).filter(r => r.pTxt && !r.noEnvia).map(r => ({ tienda: `Amazon.${tld}`, pais, t: r.t.slice(0, 160), p: num(r.pTxt), envio: r.gratis ? 0 : (r.envioTxt ? num(r.envioTxt) : null),
      moneda: 'EUR', url: `https://www.amazon.${tld}/dp/${r.asin}`, entrega: r.entrega, reac: REAC.test(r.t) }));
  };
}

// AliExpress: datos en JSON dentro del HTML. Moneda y país de destino fijados con la cookie aep_usuc_f.
function aliexpress(desde) {
  return async (page, q) => {
    await page.context().addCookies([{ name: 'aep_usuc_f', value: 'site=esp&c_tp=EUR&region=ES&b_locale=es_ES', domain: '.aliexpress.com', path: '/' }]);
    await ir(page, `https://es.aliexpress.com/w/wholesale-${encodeURIComponent(q.replace(/ /g, '-'))}.html${desde ? '?shipFromCountry=' + desde : ''}`);
    const h = await page.content(); const out = [], vistos = new Set(); const re = /"productId":"(\d+)"/g; let m;
    while ((m = re.exec(h))) {
      if (vistos.has(m[1])) continue; vistos.add(m[1]); const seg = h.slice(m.index, m.index + 6000);
      const t = ((seg.match(/"displayTitle":"(.*?)"/) || [])[1] || '').replace(/\\u0026/g, '&').replace(/\\"/g, '"');
      const p = parseFloat((seg.match(/"minPrice":([\d.]+)/) || [])[1] || 0); const dm = seg.match(/Entrega (?:más rápida )?en (\d+) días/);
      const envio = /Envío gratis|Free shipping/i.test(seg) ? 0 : null;
      if (t && p) out.push({ tienda: 'AliExpress' + (desde ? ' (desde ' + desde + ')' : ''), pais: desde || 'Varios', t: t.slice(0, 160), p, envio, moneda: 'EUR',
        url: `https://es.aliexpress.com/item/${m[1]}.html`, entrega: dm ? `${dm[1]} días` : null, reac: REAC.test(t), ivaIncluido: true });
    }
    return out;
  };
}

async function mediamarkt(page, q) {
  await ir(page, `https://www.mediamarkt.es/es/search.html?query=${encodeURIComponent(q)}`);
  return leerMediamarkt(page);
}

// Tarjetas de producto de una página de MediaMarkt ya cargada
export function leerMediamarkt(page) {
  return page.evaluate(() => [...document.querySelectorAll('[data-test="mms-product-card"]')].map(c => {
    const t = c.innerText.replace(/\s+/g, ' '); const precios = [...t.matchAll(/(?<![\d.])(\d[\d.]*),(\d{2}) ?€/g)].map(m => +(m[1].replace(/\./g, '') + '.' + m[2]));
    const a = c.querySelector('a[href*="/product/"]');
    return { tienda: 'MediaMarkt' + ((t.match(/Vendido y enviado por ([^.]+?)(?: Disponible| Entrega| Comparar|$)/) || [])[1] ? ' (marketplace)' : ''), pais: 'ES',
      t: (c.querySelector('[data-test="product-title"]')?.innerText || t.slice(0, 140)).trim(), p: precios.at(-1) || null, envio: null, moneda: 'EUR',
      url: a ? a.href.split('?')[0] : null, entrega: (t.match(/(Entrega [\d/]+ ?- ?[\d/]+|recíbelo mañana|Disponible online)/i) || [])[0] || null, reac: /REACONDICIONADO/i.test(t) };
  }).filter(x => x.p));
}

// Wallapop (API pública): referencia de precio en España y posible compra
async function wallapop(_page, q) {
  const H = { headers: { 'X-DeviceOS': '0' } }; const out = [];
  // Referencia de precio: anuncios más relevantes en cualquier estado (juntar.mjs usa su mediana para descartar accesorios)
  const rel = await (await fetch('https://api.wallapop.com/api/v3/search/section?keywords=' + encodeURIComponent(q) + '&source=search_box&order_by=most_relevance&section_type=organic_search_results&latitude=42.8467&longitude=-2.6716', H)).json();
  out.referencia = (rel.data?.section?.items || []).map(x => ({ t: x.title, p: x.price.amount }));
  // "Sin abrir" primero: el filtro "new" también los devuelve, así que en "nuevo" se saltan los ya vistos
  const vistos = new Set();
  for (const [c, et] of [['un_opened', 'sin abrir'], ['new', 'nuevo']]) {
    let url = 'https://api.wallapop.com/api/v3/search/section?keywords=' + encodeURIComponent(q) + '&source=search_box&order_by=price_low_to_high&section_type=organic_search_results&condition=' + c + '&latitude=42.8467&longitude=-2.6716';
    for (let pg = 0; pg < 2 && url; pg++) {
      const j = await (await fetch(url, H)).json();
      for (const x of j.data?.section?.items || []) if (!vistos.has(x.id) && vistos.add(x.id)) out.push({ tienda: 'Wallapop (particular, ' + et + ')', pais: 'ES', t: x.title.slice(0, 160), p: x.price.amount, envio: null, moneda: 'EUR',
        url: 'https://es.wallapop.com/item/' + x.web_slug, entrega: null, reac: false, wallapop: true });
      const nx = j.meta?.next_page; url = nx ? 'https://api.wallapop.com/api/v3/search/section?next_page=' + encodeURIComponent(nx) : null;
    }
  }
  return out;
}

// idealo: solo la ficha de producto (su buscador está prohibido para robots en robots.txt). Se usa si se pasa la URL /precios/.
async function idealo(page, _q, extra) {
  if (!extra?.idealo) return [];
  await ir(page, extra.idealo);
  return page.evaluate(() => [...document.querySelectorAll('[class*="productOffers-listItem"], li[class*="offerList-item"]')].map(o => {
    const t = o.innerText.replace(/\s+/g, ' ');
    const tienda = o.querySelector('img[alt]')?.getAttribute('alt') || (t.match(/Tienda: ([^ ]+)/) || [])[1] || 'tienda en idealo';
    const precios = [...t.matchAll(/(\d[\d.]*),(\d{2}) ?€/g)].map(m => +(m[1].replace(/\./g, '') + '.' + m[2]));
    const a = o.querySelector('a[href]');
    return { tienda: tienda + ' (vía idealo)', pais: 'ES', t: (o.querySelector('[class*="title"]')?.innerText || t.slice(0, 120)).trim(), p: precios[0] || null,
      envio: /env[íi]o gratis|gastos de env[íi]o incluidos/i.test(t) ? 0 : (precios[1] && precios[1] < precios[0] ? precios[1] : null), moneda: 'EUR',
      url: a ? a.href : null, entrega: (t.match(/(\d+ ?- ?\d+ días hábiles|Entrega[^€]{0,40}|En stock)/) || [])[0] || null, reac: /reacondicionad/i.test(t) };
  }).filter(x => x.p));
}

export const FUENTES = {
  'amazon-es': amazon('es', 'ES'), 'amazon-de': amazon('de', 'DE'), 'amazon-fr': amazon('fr', 'FR'), 'amazon-it': amazon('it', 'IT'),
  'aliexpress-es': aliexpress('ES'), 'aliexpress-ue': aliexpress('FR'), 'aliexpress-de': aliexpress('DE'), 'aliexpress-global': aliexpress(null),
  'mediamarkt-es': mediamarkt, 'wallapop': wallapop, 'idealo': idealo,
};
