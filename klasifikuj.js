// Klasifikace strech Litvinova natrenovanym Teachable Machine modelem (cisty JS: tfjs + WASM + pngjs).
// Pouziti:  node klasifikuj.js [limit]   (limit = volitelny pocet snimku pro test)
// Vystup:   web/klasifikace.json

const tf = require('@tensorflow/tfjs');
const wasm = require('@tensorflow/tfjs-backend-wasm');
const { PNG } = require('pngjs');
const fs = require('fs');
const path = require('path');

const BASE = __dirname;
const MODEL_JSON = path.join(BASE, 'model', 'model.json');
const INDEX_CSV = path.join(BASE, 'litvinov_strechy_index.csv');
const IMG_DIR = path.join(BASE, 'litvinov_strechy');
const ADDR_MAP = path.join(BASE, 'data', 'adresy_map.json');
const OUT_JSON = path.join(BASE, 'web', 'klasifikace.json');

const LABELS = ['vhodná střecha', 'nevhodná střecha', 'FVE instalováno', 'průmyslová hala'];
const BUCKET_KEYS = ['vhodne', 'nevhodne', 'fve', 'prumysl'];
const UNSURE_THRESHOLD = 0.60;

const LIMIT = process.argv[2] ? parseInt(process.argv[2], 10) : Infinity;

// Vlastni IOHandler: nacte model z disku (ciste tfjs neumi file:// v Node)
function fileIOHandler(modelJsonPath) {
  return {
    load: async () => {
      const modelJSON = JSON.parse(fs.readFileSync(modelJsonPath, 'utf8'));
      const dir = path.dirname(modelJsonPath);
      let weightSpecs = [];
      const buffers = [];
      for (const group of modelJSON.weightsManifest) {
        for (const p of group.paths) buffers.push(fs.readFileSync(path.join(dir, p)));
        weightSpecs = weightSpecs.concat(group.weights);
      }
      const wd = Buffer.concat(buffers);
      const weightData = wd.buffer.slice(wd.byteOffset, wd.byteOffset + wd.byteLength);
      return {
        modelTopology: modelJSON.modelTopology,
        weightSpecs,
        weightData,
        format: modelJSON.format,
        generatedBy: modelJSON.generatedBy,
        convertedBy: modelJSON.convertedBy,
        userDefinedMetadata: modelJSON.userDefinedMetadata
      };
    }
  };
}

function readIndex() {
  const lines = fs.readFileSync(INDEX_CSV, 'utf8').split(/\r?\n/).filter(Boolean);
  lines.shift();
  return lines.map(l => {
    const [file, osm_type, osm_id, lon, lat] = l.split(',');
    return { file, osm_type, osm_id, lon: parseFloat(lon), lat: parseFloat(lat) };
  });
}

function imageToTensor(fpath) {
  const png = PNG.sync.read(fs.readFileSync(fpath));
  const { width, height, data } = png;
  const buf = new Float32Array(width * height * 3);
  let j = 0;
  for (let i = 0; i < width * height; i++) {
    buf[j++] = (data[i * 4] - 127.5) / 127.5;
    buf[j++] = (data[i * 4 + 1] - 127.5) / 127.5;
    buf[j++] = (data[i * 4 + 2] - 127.5) / 127.5;
  }
  let t = tf.tensor4d(buf, [1, height, width, 3]);
  if (width !== 224 || height !== 224) {
    const r = tf.image.resizeBilinear(t.reshape([height, width, 3]), [224, 224]).expandDims(0);
    t.dispose();
    t = r;
  }
  return t;
}

async function main() {
  // backend: zkus WASM (rychly), jinak CPU
  try {
    wasm.setWasmPaths(path.join(BASE, 'node_modules', '@tensorflow', 'tfjs-backend-wasm', 'dist') + path.sep);
    await tf.setBackend('wasm');
    await tf.ready();
  } catch (e) {
    console.log('WASM nedostupny, padam na CPU:', e.message);
    await tf.setBackend('cpu');
    await tf.ready();
  }
  console.log('Backend:', tf.getBackend());

  console.log('Nacitam model...');
  const model = await tf.loadLayersModel(fileIOHandler(MODEL_JSON));
  const addrMap = fs.existsSync(ADDR_MAP) ? JSON.parse(fs.readFileSync(ADDR_MAP, 'utf8')) : {};
  const rows = readIndex().slice(0, LIMIT);
  console.log('Backend:', tf.getBackend(), '| adres:', Object.keys(addrMap).length, '| snimku:', rows.length);

  const out = [];
  const counts = { vhodne: 0, nevhodne: 0, fve: 0, prumysl: 0, nejista: 0 };
  let done = 0, missing = 0;
  const t0 = Date.now();

  for (const r of rows) {
    const fpath = path.join(IMG_DIR, r.file);
    if (!fs.existsSync(fpath)) { missing++; continue; }

    const t = imageToTensor(fpath);
    const pred = model.predict(t);
    const probs = pred.dataSync();
    tf.dispose([t, pred]);

    let topIdx = 0;
    for (let i = 1; i < probs.length; i++) if (probs[i] > probs[topIdx]) topIdx = i;
    const topProb = probs[topIdx];
    const bucket = topProb < UNSURE_THRESHOLD ? 'nejista' : BUCKET_KEYS[topIdx];
    counts[bucket]++;

    out.push({
      file: r.file, osm_type: r.osm_type, osm_id: r.osm_id, lon: r.lon, lat: r.lat,
      adresa: addrMap[`${r.osm_type}_${r.osm_id}`] || null,
      probs: {
        vhodne: +probs[0].toFixed(4), nevhodne: +probs[1].toFixed(4),
        fve: +probs[2].toFixed(4), prumysl: +probs[3].toFixed(4)
      },
      top: BUCKET_KEYS[topIdx], topProb: +topProb.toFixed(4), bucket
    });

    done++;
    if (done % 250 === 0) {
      const rate = done / ((Date.now() - t0) / 1000);
      console.log(`${done}/${rows.length}  ${rate.toFixed(1)} img/s  ${JSON.stringify(counts)}`);
    }
  }

  const meta = {
    obec: 'Litvínov', pocet: out.length, chybejici: missing,
    prah_nejista: UNSURE_THRESHOLD, counts, labels: LABELS,
    vygenerovano: new Date().toISOString()
  };
  fs.writeFileSync(OUT_JSON, JSON.stringify({ meta, strechy: out }));
  const secs = ((Date.now() - t0) / 1000).toFixed(0);
  console.log(`HOTOVO za ${secs}s. Zapsano ${OUT_JSON}`);
  console.log('Souhrn:', JSON.stringify(counts), 'chybejici:', missing);
}

main().catch(e => { console.error('CHYBA:', e); process.exit(1); });
