const assert = require('assert/strict');
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const zlib = require('zlib');

// Public geographic fixtures, not user/device locations. Expected zones are
// from https://www.gsi.go.jp/LAW/heimencho, independently of the data builder.
const fixtures = [
  ['札幌',43.0642,141.3469,12], ['青森',40.8244,140.7400,10],
  ['盛岡',39.7036,141.1527,10], ['仙台',38.2688,140.8721,10],
  ['秋田',39.7186,140.1024,10], ['山形',38.2404,140.3633,10],
  ['福島',37.7503,140.4676,9], ['水戸',36.3418,140.4468,9],
  ['宇都宮',36.5658,139.8836,9], ['前橋',36.3912,139.0609,9],
  ['さいたま',35.8570,139.6490,9], ['千葉',35.6051,140.1233,9],
  ['東京',35.6895,139.6917,9], ['横浜',35.4478,139.6425,9],
  ['新潟',37.9025,139.0236,8], ['富山',36.6953,137.2113,7],
  ['金沢',36.5947,136.6256,7], ['福井',36.0652,136.2216,6],
  ['甲府',35.6642,138.5684,8], ['長野',36.6513,138.1810,8],
  ['岐阜',35.3912,136.7223,7], ['静岡',34.9769,138.3830,8],
  ['名古屋',35.1802,136.9066,7], ['津',34.7303,136.5086,6],
  ['大津',35.0045,135.8686,6], ['京都',35.0214,135.7556,6],
  ['大阪',34.6863,135.5200,6], ['神戸',34.6913,135.1830,5],
  ['奈良',34.6853,135.8327,6], ['和歌山',34.2261,135.1675,6],
  ['鳥取',35.5039,134.2377,5], ['松江',35.4723,133.0505,3],
  ['岡山',34.6617,133.9345,5], ['広島',34.3963,132.4596,3],
  ['山口',34.1858,131.4714,3], ['徳島',34.0658,134.5593,4],
  ['高松',34.3401,134.0434,4], ['松山',33.8416,132.7661,4],
  ['高知',33.5597,133.5311,4], ['福岡',33.6064,130.4181,2],
  ['佐賀',33.2494,130.2988,2], ['長崎',32.7503,129.8777,1],
  ['熊本',32.7898,130.7417,2], ['大分',33.2382,131.6126,2],
  ['宮崎',31.9111,131.4239,2], ['鹿児島',31.5602,130.5581,2],
  ['那覇',26.2124,127.6809,15],
  ['函館',41.7687,140.7288,11], ['小樽',43.1907,140.9946,11],
  ['伊達',42.4719,140.8647,11], ['豊浦',42.5800,140.7110,11],
  ['壮瞥',42.5535,140.8860,11], ['登別',42.4128,141.1066,12],
  ['釧路',42.9850,144.3820,13], ['網走',44.0200,144.2730,13],
  ['紋別',44.3564,143.3545,12], ['根室',43.3300,145.5830,13],
  ['奄美',28.3760,129.4930,1], ['喜界島',28.3140,129.9400,1],
  ['与論島',27.0430,128.4160,1], ['沖永良部島',27.3400,128.5790,1],
  ['徳之島',27.7310,128.9880,1], ['屋久島',30.3600,130.5300,2],
  ['種子島',30.7300,131.0000,2], ['壱岐',33.7490,129.6920,1],
  ['対馬',34.2000,129.2880,1], ['八丈島',33.1110,139.7900,9],
  ['伊豆大島',34.7500,139.3600,9], ['鳥島',30.4800,140.3000,9],
  ['父島',27.0940,142.1910,14], ['沖ノ鳥島',20.4250,136.0780,18],
  ['南鳥島',24.2880,153.9790,19], ['石垣島',24.3400,124.1550,16],
  ['南大東島',25.8280,131.2310,17],
  ['広島・監査再現点',34.3853,132.4553,3],
  ['岡山・監査再現点',34.6551,133.9195,5],
];
const context = vm.createContext({console, fetch:()=>{throw new Error('Zone lookup must be offline');}});
const start = performance.now();
for (const file of ['data/japan-plane-zones.js', 'japan-plane-zone-resolver.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname,file),'utf8'), context, {filename:file});
}
const resolver = context.EzJapanPlaneZoneResolver;
assert(resolver.ready());
for (const [name,lat,lon,zone] of fixtures) {
  const result = resolver.resolve(lat,lon);
  assert.equal(result?.zone,zone, `${name}: ${JSON.stringify(result)} expected ${zone}`);
}
assert.equal(new Set(fixtures.map(f=>f[3])).size,19);
for (const [lat,lon] of [[NaN,134],[34,NaN],[91,134],[34,181],[0,0]]) {
  assert.equal(resolver.resolve(lat,lon),null);
}
const firstPassMs = performance.now()-start;
const repeatStart = performance.now();
for (let i=0;i<1000;i++) {
  const [name,lat,lon,zone]=fixtures[i%fixtures.length];
  assert.equal(resolver.resolve(lat,lon)?.zone,zone,name);
}
const repeatMs = performance.now()-repeatStart;
// Exercise the real integration function, retaining the existing out-of-Japan
// fallback while ensuring mapped land always uses the administrative result.
const html=fs.readFileSync(path.join(__dirname,'index.html'),'utf8');
const origin=html.match(/const JAPAN_PLANE_ZONES = \[[\s\S]*?\n\];/);
const choose=html.match(/function chooseJapanPlaneZone\(lat, lon\)\{[\s\S]*?\n\}/);
assert(origin&&choose,'Locate the real zone selection implementation');
vm.runInContext(`globalThis.window=globalThis;${origin[0]}\n${choose[0]}`,context);
for (const [name,lat,lon,zone] of fixtures) assert.equal(context.chooseJapanPlaneZone(lat,lon),zone,name);
assert.throws(()=>vm.runInNewContext(choose[0]+';chooseJapanPlaneZone(34,134)',{window:{}}),/判定データ/);
assert(html.indexOf('data/japan-plane-zones.js')<html.indexOf('function chooseJapanPlaneZone'));
assert(html.indexOf('japan-plane-zone-resolver.js')<html.indexOf('function chooseJapanPlaneZone'));
const data=fs.readFileSync(path.join(__dirname,'data/japan-plane-zones.js'));
assert(data.length<4000000,'Keep the offline lookup asset bounded');
console.log(JSON.stringify({test:'offline Japan plane zones',fixtures:fixtures.length,zones:19,
  firstPassMs:Math.round(firstPassMs),queries1000Ms:Math.round(repeatMs),bytes:data.length,
  gzipBytes:zlib.gzipSync(data).length}));
