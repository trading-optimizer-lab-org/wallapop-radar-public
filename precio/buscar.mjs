// node precio/buscar.mjs <fuente|todas> "<producto>" [url ficha idealo] -> out/precio-<fuente>.json
import fs from 'fs';
import { chromium } from 'playwright';
import { FUENTES } from './fuentes.mjs';

const [fuente, producto, idealoUrl] = process.argv.slice(2);
if (!fuente || !producto) { console.error('Uso: node precio/buscar.mjs <fuente|todas> "<producto>" [url idealo]'); process.exit(1); }
const lista = fuente === 'todas' ? Object.keys(FUENTES) : fuente.split(',');
fs.mkdirSync('out', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', args: ['--disable-blink-features=AutomationControlled'] });
for (const f of lista) {
  const ctx = await browser.newContext({ locale: 'es-ES', timezoneId: 'Europe/Madrid', viewport: { width: 1400, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36' });
  await ctx.route(/\.(png|jpe?g|webp|gif|svg|woff2?|mp4)(\?|$)/, r => r.abort());
  const page = await ctx.newPage(); const t0 = Date.now();
  let res = { fuente: f, producto, ofertas: [], error: null };
  try { res.ofertas = await FUENTES[f](page, producto, { idealo: idealoUrl }); if (res.ofertas.referencia) res.referencia = res.ofertas.referencia; } catch (e) { res.error = e.message.slice(0, 120); }
  res.segundos = Math.round((Date.now() - t0) / 1000);
  fs.writeFileSync(`out/precio-${f}.json`, JSON.stringify(res));
  console.log(f.padEnd(18), res.error ? 'ERROR ' + res.error : res.ofertas.length + ' ofertas', res.segundos + ' s');
  await ctx.close();
  // Varias fuentes seguidas (p. ej. las 4 de AliExpress): pausa de persona entre búsquedas; si una tienda bloquea, no se insiste en ella
  if (res.error?.startsWith('BLOQUEO')) { const dom = f.split('-')[0]; for (let k = lista.indexOf(f) + 1; k < lista.length; k++) if (lista[k].startsWith(dom)) lista.splice(k--, 1); }
  if (f !== lista.at(-1)) await new Promise(s => setTimeout(s, 10000 + Math.random() * 10000));
}
await browser.close();
