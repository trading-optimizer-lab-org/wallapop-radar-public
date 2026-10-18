// node precio/visitar.mjs <producto.json> [dominio1,dominio2...] -> out/raw-<dominio>.json
// Visita cada ficha del producto: robots.txt (incluidas reglas para Claude-User), una visita por página, pausas entre
// páginas de la misma web, y si una web muestra captcha o verificación no se vuelve a tocar en esta ejecución.
import fs from 'fs';
import { chromium } from 'playwright';
import { permitido } from './robots.mjs';
import { BLOQUEO, leerMediamarkt } from './fuentes.mjs';

// Webs que responden 403/405 a las máquinas de GitHub (prueba del 17/10) pero no a un ordenador normal:
// en GitHub no se visitan para no provocar bloqueos; se consultan ejecutando este script en local.
export const SOLO_LOCAL = ['asgoodasnew.de', 'clevertronic.de', 'kimovil.com', 'milanuncios.com', 'musicmagpie.co.uk', 'pccomponentes.com'];
const [archivo, dominiosArg] = process.argv.slice(2);
const prod = JSON.parse(fs.readFileSync(archivo, 'utf8'));
const dominio = u => new URL(u).hostname.replace(/^www\./, '');
const filtro = dominiosArg ? new Set(dominiosArg.split(',')) : null;
const fichas = prod.fichas.filter(f => !filtro || filtro.has(dominio(f.url)));
fs.mkdirSync('out', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', args: ['--disable-blink-features=AutomationControlled'] });
const ctx = await browser.newContext({ locale: 'es-ES', timezoneId: 'Europe/Madrid', viewport: { width: 1400, height: 900 },
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36' });
await ctx.route(/\.(png|jpe?g|webp|gif|svg|woff2?|mp4)(\?|$)/, r => r.abort());
const porDominio = {}, bloqueados = new Set(); let anterior = null;
for (const f of fichas) {
  const d = dominio(f.url); const raw = { ficha: f, dominio: d };
  (porDominio[d] ??= []).push(raw);
  if (bloqueados.has(d)) { raw.error = 'web bloqueada antes en esta ejecución: no se insiste'; continue; }
  if (process.env.GITHUB_ACTIONS && SOLO_LOCAL.includes(d)) { raw.error = 'solo en local: bloquea a las máquinas de GitHub'; continue; }
  const rb = await permitido(f.url); if (!rb.ok) { raw.error = 'robots.txt lo prohíbe (' + rb.regla + ')'; continue; }
  if (anterior) await new Promise(s => setTimeout(s, anterior === d ? 8000 + Math.random() * 6000 : 2000 + Math.random() * 2000));
  anterior = d;
  const page = await ctx.newPage();
  try {
    const r = await page.goto(f.url, { waitUntil: 'domcontentloaded', timeout: 40000 }); await page.waitForTimeout(4000);
    raw.http = r?.status();
    const pg = await page.evaluate(() => ({ txt: document.body.innerText, ld: [...document.querySelectorAll('script[type="application/ld+json"]')].map(s => s.textContent) }));
    if (BLOQUEO.test(pg.txt.slice(0, 4000)) || raw.http === 403 || raw.http === 429 || raw.http === 503) { raw.error = 'bloqueo o verificación (HTTP ' + raw.http + ')'; bloqueados.add(d); }
    else { raw.txt = pg.txt.replace(/\n\s*\n+/g, '\n'); raw.ld = pg.ld; if (f.lector === 'mediamarkt') raw.mm = await leerMediamarkt(page); }
  } catch (e) { raw.error = e.message.slice(0, 100); }
  await page.close();
  console.log((raw.error ? 'X ' : 'ok ') + f.fuente.padEnd(30), raw.http || '', raw.error || '');
}
for (const [d, L] of Object.entries(porDominio)) fs.writeFileSync(`out/raw-${d}.json`, JSON.stringify(L));
await browser.close();
