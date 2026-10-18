// Funciones comunes del barrido: lista de búsquedas, extracción de modelo, AliExpress España y Wallapop.
export const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';
const AE_COOKIE = 'aep_usuc_f=site=esp&c_tp=EUR&region=ES&b_locale=es_ES; xman_us_f=x_locale=es_ES&x_l=0&x_c_chg=1&acs_rt=';
export const sleep = ms => new Promise(r => setTimeout(r, ms));
export const sleepRand = (a, b) => sleep(a + Math.random() * (b - a));
export const MAX_DAYS = 4;

export const BRANDS = `anbernic,retroid,ayn,miyoo,powkiddy,trimui,ayaneo,gpd,mangmi,konkr,onexplayer,msi claw,rog ally,legion go,steam deck,
realme,oneplus,poco,redmi,xiaomi,honor,oppo,vivo,iqoo,nubia,redmagic,zte,tecno,infinix,ulefone,doogee,oukitel,blackview,cubot,motorola,nothing phone,cmf,tcl,meizu,huawei,samsung galaxy,google pixel,asus rog phone,sony xperia,fairphone,unihertz,hotwav,fossibot,
teclast,alldocube,headwolf,chuwi,lenovo legion,lenovo tab,xiaoxin,redmi pad,xiaomi pad,oneplus pad,honor pad,huawei matepad,doogee tab,
beelink,minisforum,geekom,gmktec,trigkey,acemagic,ninkear,firebat,
dji,fimi,potensic,walksnail,runcam,caddx,betafpv,radiomaster,emax,iflight,geprc,happymodel,foxeer,jumper,skyzone,
insta360,akaso,sjcam,hohem,zhiyun,feiyutech,hollyland,boya,saramonic,synco,rode,dji mic,dji osmo,godox,neewer,ulanzi,smallrig,
fiio,moondrop,truthear,simgot,letshuoer,kz,tangzu,topping,smsl,shanling,hiby,ifi,soundpeats,qcy,edifier,1more,earfun,
boox,bigme,xteink,meebook,pocketbook,kobo,kindle,
amazfit,kospet,zeblaze,xiaomi watch,huawei watch,garmin,coros,polar,suunto,
8bitdo,gamesir,flydigi,machenike,aula,keychron,epomaker,royal kludge,akko,wooting,attack shark,logitech,razer,
creality,elegoo,anycubic,bambu lab,flashforge,sovol,qidi,xtool,sculpfun,longer,atomstack,ortur,
dreame,roborock,ecovacs,narwal,eufy,xiaomi robot,dyson,
anker,ugreen,baseus,ecoflow,bluetti,jackery,sharge,cuktech,
kukirin,engwe,ninebot,segway,niu,dualtron,xiaomi scooter,
dangbei,xgimi,wanbo,hy300,nebula,
70mai,viofo,ddpai,
tp-link deco,glinet,xiaomi router,asus router,
meta quest,pico,xreal,viture,rokid,
lego,pokemon etb,funko,hot wheels,
nintendo switch 2,playstation 5,xbox series,dualsense,
apple airpods,apple watch,ipad,iphone,macbook,
sonos,bose,sony wh,jbl,marshall`.split(',').map(s => s.trim()).filter(Boolean);

export const CATS = ['consola retro portatil', 'consola portatil android', 'mini pc', 'gafas fpv', 'tablet android', 'tablet gaming',
  'movil version global', 'movil gaming', 'smartwatch', 'camara de accion', 'estabilizador gimbal', 'microfono inalambrico',
  'impresora 3d', 'grabadora laser', 'teclado mecanico', 'mando inalambrico', 'dron con camara', 'lector ebook', 'tinta electronica',
  'auriculares inalambricos', 'auriculares hifi', 'iem', 'amplificador dac', 'proyector', 'robot aspirador', 'aspiradora sin cable',
  'patinete electrico', 'bicicleta electrica', 'estacion de energia portatil', 'power bank', 'cargador gan', 'camara de coche',
  'router wifi 7', 'mesh wifi', 'gafas realidad virtual', 'gafas ar', 'monitor portatil', 'monitor gaming', 'ssd nvme', 'tarjeta grafica',
  'procesador amd', 'placa base', 'memoria ram ddr5', 'raton gaming', 'silla gaming', 'altavoz bluetooth', 'barra de sonido',
  'camara vigilancia', 'timbre inteligente', 'cerradura inteligente', 'freidora de aire', 'cafetera', 'robot cocina',
  'cortapelos', 'cepillo electrico', 'secador de pelo', 'herramientas electricas', 'taladro', 'soldador', 'osciloscopio',
  'telescopio', 'prismaticos', 'walkie talkie', 'radio sdr', 'detector de metales', 'camara instantanea', 'objetivo camara',
  'flash camara', 'luz video led', 'tableta grafica', 'stream deck', 'capturadora', 'webcam 4k', 'pedal guitarra', 'teclado midi',
  'sintetizador', 'auriculares gaming', 'volante simulador', 'joystick', 'arcade stick'];

const pags = n => Array.from({ length: n }, (_, i) => i + 1);
// unidades de trabajo: (búsqueda, página). Primero las páginas 1 de todo, luego las 2, etc.: si se acaba el tiempo, falta lo menos relevante
export const UNITS = pags(10).flatMap(pg => [...BRANDS.map(q => ({ q, pg, brand: true })), ...CATS.map(q => ({ q, pg, brand: false }))]);

// Hora límite de una fase: node script.mjs <shard> <total> <minutos>
export const limite = min => { const fin = Date.now() + (min || 1e6) * 60000; return () => Date.now() > fin; };

const STOP = new Set(('consola de juegos juego portatil retro smartphone telefono movil version global ' +
  'nuevo nueva original oficial con para el la los las y 5g 4g lte pantalla pulgadas mini pc tablet reloj inteligente smartwatch ' +
  'auriculares inalambricos dron drone camara gafas fpv en de del un una ue eu europea lanzamiento 2025 2026 ' +
  'android wifi bluetooth ips hd 4k nfc ai ia por sin regalo estreno modelo gaming juegos videojuegos tapa novedad ' +
  'reproductor portatiles consolas handheld game console').split(' '));
const SUFFIX = /^(pro|plus|max|ultra|mini|lite|s|x|se|fe|neo|air|v|h|sp|xl|duo|t|r|m|c)$/;

export const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9+ ]/g, ' ').replace(/\s+/g, ' ').trim();

// marca + tokens hasta el primero con dígito (máx. 3) + un sufijo opcional
export function modelOf(title, brand) {
  const t = norm(title).split(' ');
  const b = norm(brand).split(' ')[0];
  const i = t.indexOf(b);
  const raw = (i >= 0 ? t.slice(i + 1) : t).filter(w => !STOP.has(w) && w !== b);
  const rest = [];
  for (let k = 0; k < raw.length; k++) {
    if (/^[a-z]{1,3}$/.test(raw[k]) && /^\d/.test(raw[k + 1] || '')) { rest.push(raw[k] + raw[k + 1]); k++; } else rest.push(raw[k]);
  }
  const tok = [];
  for (const w of rest) {
    if (tok.length === 3) return null;
    tok.push(w);
    if (/\d/.test(w)) break;
  }
  if (!tok.length || !/\d/.test(tok[tok.length - 1])) return null;
  const nx = rest[tok.length];
  if (nx && SUFFIX.test(nx)) tok.push(nx);
  return (b + ' ' + tok.join(' ')).trim();
}

export async function ae(q, page) {
  const u = `https://es.aliexpress.com/w/wholesale-${encodeURIComponent(q.replace(/ /g, '-'))}.html?shipFromCountry=ES&page=${page}`;
  const h = await (await fetch(u, { headers: { 'User-Agent': UA, 'Accept-Language': 'es-ES', Cookie: AE_COOKIE } })).text();
  if (h.length < 5000 || /punish/.test(h.slice(0, 3000))) throw new Error('AE_BLOCK');
  const out = [], seen = new Set(), re = /"productId":"(\d+)"/g; let m;
  const idx = []; while ((m = re.exec(h))) idx.push([m.index, m[1]]);
  for (const [i, id] of idx) {
    if (seen.has(id)) continue;
    const seg = h.slice(i, i + 6000);
    const t = (seg.match(/"displayTitle":"(.*?)"/) || [])[1] || '';
    const p = parseFloat((seg.match(/"minPrice":([\d.]+)/) || [])[1] || 0);
    const dm = seg.match(/Entrega (?:más rápida )?en (\d+) días/);
    const sold = (seg.match(/"tradeDesc":"(.*?)"/) || [])[1] || '';
    if (t && p) { seen.add(id); out.push({ id, t, p, days: dm ? +dm[1] : null, sold }); }
  }
  return out;
}

export async function wp(q) {
  const u = 'https://api.wallapop.com/api/v3/search/section?keywords=' + encodeURIComponent(q) +
    '&condition=new&source=search_box&order_by=most_relevance&section_type=organic_search_results&latitude=42.8467&longitude=-2.6716';
  const r = await fetch(u, { headers: { 'X-DeviceOS': '0', 'User-Agent': UA } });
  if (!r.ok) throw new Error('WP_' + r.status);
  const j = await r.json();
  return (j.data.section.items || []).map(x => ({ t: x.title, p: x.price.amount, d: (x.description || '').slice(0, 300), res: x.reserved?.flag || false, slug: x.web_slug, c: x.created_at }));
}
