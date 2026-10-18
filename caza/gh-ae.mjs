// node caza/gh-ae.mjs <shard> <total> : AliExpress España (envío desde España) de su parte de caza/ae.json -> out/ae-<shard>.jsonl
import fs from 'fs';
import { ae, sleepRand } from '../lib.mjs';

const [shard, total] = process.argv.slice(2).map(Number);
const mio = JSON.parse(fs.readFileSync('caza/ae.json', 'utf8')).filter((_, k) => k % total === shard);
fs.mkdirSync('out', { recursive: true });
const out = fs.createWriteStream(`out/ae-${shard}.jsonl`);
let ok = 0, bloqueo = false;
for (const [k, x] of mio.entries()) {
  if (k) await sleepRand(15000, 25000);
  try {
    const items = await ae(x.q, 1);
    out.write(JSON.stringify({ id: x.id, r: items.slice(0, 15).map(it => ({ a: 'ae:' + it.id, t: it.t, p: it.p.toFixed(2).replace('.', ',') + ' €', d: it.days, s: it.sold })) }) + '\n'); ok++;
  } catch (e) { if (e.message === 'AE_BLOCK') { bloqueo = true; break; } }
}
out.end();
console.log(`aliexpress ${ok}/${mio.length} bloqueo ${bloqueo}`);
