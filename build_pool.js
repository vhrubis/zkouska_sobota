// Sestavi kandidaty na olabelovani: velke budovy (haly), nahodny vzorek (rezidence), FVE predikce.
const fs = require('fs'), path = require('path');
const BASE = __dirname;

const buildings = JSON.parse(fs.readFileSync(path.join(BASE, 'data', 'budovy_litvinov.json'), 'utf8'))
  .elements.filter(e => e.bounds);
const klas = JSON.parse(fs.readFileSync(path.join(BASE, 'web', 'klasifikace.json'), 'utf8'));

// plocha budovy (m2) z bounds
const areaByKey = {};
for (const b of buildings) {
  const bb = b.bounds;
  const lat = (bb.minlat + bb.maxlat) / 2;
  const h = (bb.maxlat - bb.minlat) * 111320;
  const w = (bb.maxlon - bb.minlon) * 111320 * Math.cos(lat * Math.PI / 180);
  areaByKey[`${b.type}_${b.id}`] = w * h;
}

const rows = klas.strechy.map(r => ({
  file: r.file, area: areaByKey[`${r.osm_type}_${r.osm_id}`] || 0,
  bucket: r.bucket, fve: r.probs.fve, prumysl: r.probs.prumysl
}));

// 1) VELKE BUDOVY (haly + paneláky): nejvetsi plocha, top 16
const haly = rows.filter(r => r.area > 250).sort((a, b) => b.area - a.area).slice(0, 16);

// 2) FVE: nejvyssi pravdepodobnost fve dle modelu, top 20 (kandidati ke kontrole)
const fve = rows.slice().sort((a, b) => b.fve - a.fve).slice(0, 20);

// 3) REZIDENCE: nahodny vzorek z budov 40-250 m2, 40 ks
let resid = rows.filter(r => r.area >= 40 && r.area <= 250);
for (let i = resid.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [resid[i], resid[j]] = [resid[j], resid[i]]; }
resid = resid.slice(0, 40);

const out = {
  haly: haly.map(r => r.file),
  fve: fve.map(r => r.file),
  rezidence: resid.map(r => r.file)
};
fs.writeFileSync(path.join(BASE, 'data', 'label_pool.json'), JSON.stringify(out, null, 1));
console.log('haly:', out.haly.length, '| fve_kandidati:', out.fve.length, '| rezidence:', out.rezidence.length);
console.log('plochy hal (m2):', haly.slice(0, 5).map(r => Math.round(r.area)).join(', '), '...');
