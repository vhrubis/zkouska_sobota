// Prostorove prirazeni adres k budovam.
// Vstup:  data/budovy_litvinov.json     (bounds + tags; vc. ~116 primych adres)
//         data/adresni_body_litvinov.json (adresni body s lat/lon)
// Vystup: data/adresy_map.json  { "way_123": "Mostecká 21", ... }

const fs = require('fs');
const path = require('path');
const BASE = __dirname;

function addrFromTags(t) {
  if (!t) return null;
  const street = t['addr:street'] || t['addr:place'];
  const hn = t['addr:housenumber'] || t['addr:conscriptionnumber'];
  if (street && hn) return `${street} ${hn}`;
  if (t['addr:conscriptionnumber']) return `č.p. ${t['addr:conscriptionnumber']}`;
  return null;
}

const buildings = JSON.parse(fs.readFileSync(path.join(BASE, 'data', 'budovy_litvinov.json'), 'utf8'))
  .elements.filter(e => e.bounds);
const addrNodes = JSON.parse(fs.readFileSync(path.join(BASE, 'data', 'adresni_body_litvinov.json'), 'utf8'))
  .elements.filter(e => e.type === 'node' && e.tags && e.tags['addr:housenumber']);

const map = {};
let direct = 0;

// 1) primé adresy z tagu budovy
for (const b of buildings) {
  const a = addrFromTags(b.tags);
  if (a) { map[`${b.type}_${b.id}`] = a; direct++; }
}

// 2) prostorovy join adresnich bodu -> nejmensi obsahujici budova
let joined = 0;
for (const n of addrNodes) {
  const lon = n.lon, lat = n.lat;
  let best = null, bestArea = Infinity;
  for (const b of buildings) {
    const bb = b.bounds;
    if (lon >= bb.minlon && lon <= bb.maxlon && lat >= bb.minlat && lat <= bb.maxlat) {
      const area = (bb.maxlon - bb.minlon) * (bb.maxlat - bb.minlat);
      if (area < bestArea) { bestArea = area; best = b; }
    }
  }
  if (best) {
    const key = `${best.type}_${best.id}`;
    if (!map[key]) { // nepřepisuj přímou adresu
      const a = addrFromTags(n.tags);
      if (a) { map[key] = a; joined++; }
    }
  }
}

fs.writeFileSync(path.join(BASE, 'data', 'adresy_map.json'), JSON.stringify(map));
console.log('budov:', buildings.length, '| adresnich bodu:', addrNodes.length);
console.log('primé adresy:', direct, '| z bodu:', joined, '| celkem budov s adresou:', Object.keys(map).length);
