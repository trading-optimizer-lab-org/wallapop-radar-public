// Comprueba si robots.txt (grupo User-agent: *) permite una URL. Regla más larga gana; a igual longitud, gana Allow.
const cache = {};

function reglas(txt) {
  const grupos = []; let cur = null;
  for (const raw of txt.split(/\r?\n/)) {
    const l = raw.replace(/#.*/, '').trim(); if (!l) continue;
    const i = l.indexOf(':'); if (i < 0) continue;
    const k = l.slice(0, i).trim().toLowerCase(), v = l.slice(i + 1).trim();
    if (k === 'user-agent') { if (!cur || cur.rules.length) { cur = { ua: [], rules: [] }; grupos.push(cur); } cur.ua.push(v.toLowerCase()); }
    else if ((k === 'allow' || k === 'disallow') && cur) cur.rules.push([k, v]);
  }
  // Si la web tiene reglas propias para agentes de Claude que actúan por encargo de una persona, mandan esas; si no, las de '*'
  const propio = grupos.filter(g => g.ua.some(u => ['claude-user', 'claude-web', 'anthropic-ai'].includes(u)));
  return (propio.length ? propio : grupos.filter(g => g.ua.includes('*'))).flatMap(g => g.rules);
}

function casa(patron, ruta) {
  if (!patron) return false;
  const fin = patron.endsWith('$'); const p = fin ? patron.slice(0, -1) : patron;
  const re = new RegExp('^' + p.split('*').map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + (fin ? '$' : ''));
  return re.test(ruta);
}

// Webs que las herramientas web de Anthropic rechazan ("not accessible to our user agent", prueba del 17/10): no se visitan aunque su robots.txt lo permita
const VETADAS = /(^|\.)idealo\./;

export async function permitido(url) {
  const u = new URL(url);
  if (VETADAS.test(u.hostname)) return { ok: false, regla: 'la web no admite agentes de Anthropic' };
  if (!(u.origin in cache)) {
    // Sin robots.txt (404/410) = sin reglas. Si la web ni deja leerlo (403, 429, 5xx, sin respuesta) es que bloquea: no se entra.
    try { const r = await fetch(u.origin + '/robots.txt', { headers: { 'User-Agent': 'Mozilla/5.0' } }); cache[u.origin] = r.ok ? reglas(await r.text()) : [404, 410].includes(r.status) ? [] : 'HTTP ' + r.status; }
    catch { cache[u.origin] = 'sin respuesta'; }
  }
  if (typeof cache[u.origin] === 'string') return { ok: false, regla: 'robots.txt no accesible (' + cache[u.origin] + '): se trata como prohibido' };
  const ruta = u.pathname + u.search; let mejor = null;
  for (const [k, pat] of cache[u.origin]) if (casa(pat, ruta) && (!mejor || pat.length > mejor[1].length || (pat.length === mejor[1].length && k === 'allow'))) mejor = [k, pat];
  return { ok: !mejor || mejor[0] === 'allow', regla: mejor ? mejor.join(': ') : null };
}
