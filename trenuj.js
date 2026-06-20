// Pretrenovani hlavy klasifikatoru na rucne olabelovanych REALNYCH snimcich.
// - zmrazeny MobileNet zaklad (sequential_1) -> embedding 1280
// - nova hlava (linearni probe, softmax 4) trenovana s vahami trid + augmentaci
// - hold-out vyhodnoceni + reklasifikace vsech 8282 -> web/klasifikace.json
const tf = require('@tensorflow/tfjs');
const wasm = require('@tensorflow/tfjs-backend-wasm');
const { PNG } = require('pngjs');
const fs = require('fs');
const path = require('path');

const BASE = __dirname;
const MODEL_JSON = path.join(BASE, 'model', 'model.json');
const IMG_DIR = path.join(BASE, 'litvinov_strechy');
const LABELS = path.join(BASE, 'data', 'labels.csv');
const INDEX_CSV = path.join(BASE, 'litvinov_strechy_index.csv');
const ADDR_MAP = path.join(BASE, 'data', 'adresy_map.json');
const OUT_JSON = path.join(BASE, 'web', 'klasifikace.json');

// poradi trid = jako puvodni model: vhodne, nevhodne, fve, prumysl
const CLASSES = ['vhodne', 'nevhodne', 'fve', 'prumysl'];
const LABEL_NAMES = ['vhodná střecha', 'nevhodná střecha', 'FVE instalováno', 'průmyslová hala'];
const UNSURE = 0.60;

function fileIOHandler(p) {
  return { load: async () => {
    const m = JSON.parse(fs.readFileSync(p, 'utf8')); const dir = path.dirname(p);
    let ws = []; const bufs = [];
    for (const g of m.weightsManifest) { for (const pa of g.paths) bufs.push(fs.readFileSync(path.join(dir, pa))); ws = ws.concat(g.weights); }
    const wd = Buffer.concat(bufs);
    return { modelTopology: m.modelTopology, weightSpecs: ws, weightData: wd.buffer.slice(wd.byteOffset, wd.byteOffset + wd.byteLength), format: m.format };
  } };
}
function imgTensor(fpath) {
  const png = PNG.sync.read(fs.readFileSync(fpath));
  const { width, height, data } = png;
  const buf = new Float32Array(width * height * 3);
  let j = 0;
  for (let i = 0; i < width * height; i++) { buf[j++] = (data[i*4]-127.5)/127.5; buf[j++] = (data[i*4+1]-127.5)/127.5; buf[j++] = (data[i*4+2]-127.5)/127.5; }
  let t = tf.tensor4d(buf, [1, height, width, 3]);
  if (width !== 224 || height !== 224) { const r = tf.image.resizeBilinear(t.reshape([height, width, 3]), [224,224]).expandDims(0); t.dispose(); t = r; }
  return t;
}
function readIndex() {
  const lines = fs.readFileSync(INDEX_CSV, 'utf8').split(/\r?\n/).filter(Boolean); lines.shift();
  return lines.map(l => { const [file, osm_type, osm_id, lon, lat] = l.split(','); return { file, osm_type, osm_id, lon: +lon, lat: +lat }; });
}

async function main() {
  try { wasm.setWasmPaths(path.join(BASE,'node_modules','@tensorflow','tfjs-backend-wasm','dist')+path.sep); await tf.setBackend('wasm'); await tf.ready(); }
  catch (e) { await tf.setBackend('cpu'); await tf.ready(); }
  console.log('Backend:', tf.getBackend());

  const full = await tf.loadLayersModel(fileIOHandler(MODEL_JSON));
  const emb = tf.model({ inputs: full.inputs, outputs: full.getLayer('sequential_1').output });
  console.log('Embedding model OK, vystup:', emb.outputs[0].shape);

  function embedOf(t) { return tf.tidy(() => emb.predict(t)); } // [1,1280]

  // --- nacti labely ---
  const rows = fs.readFileSync(LABELS, 'utf8').split(/\r?\n/).filter(Boolean); rows.shift();
  let data = rows.map(r => { const [file, label] = r.split(','); return { file, y: CLASSES.indexOf(label) }; })
                 .filter(d => d.y >= 0 && fs.existsSync(path.join(IMG_DIR, d.file)));
  // shuffle (deterministicky bez Math.random neni nutne)
  for (let i = data.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [data[i], data[j]] = [data[j], data[i]]; }

  // stratifikovany hold-out ~15 %
  const val = [], train = [];
  const perClassVal = {};
  for (const d of data) {
    const c = d.y; perClassVal[c] = perClassVal[c] || 0;
    const cap = Math.max(1, Math.round(data.filter(x => x.y === c).length * 0.15));
    if (perClassVal[c] < cap) { val.push(d); perClassVal[c]++; } else train.push(d);
  }
  console.log('train:', train.length, 'val:', val.length);

  // --- embeddingy + augmentace (orig, hflip, vflip, 180) pro train; orig pro val ---
  function variants(t) {
    return [t, tf.reverse(t, [2]), tf.reverse(t, [1]), tf.reverse(t, [1, 2])];
  }
  function buildXY(items, augment) {
    const xs = [], ys = [];
    for (const d of items) {
      const t = imgTensor(path.join(IMG_DIR, d.file));
      const vs = augment ? variants(t) : [t];
      for (const v of vs) { const e = embedOf(v); xs.push(e.dataSync()); e.dispose(); ys.push(d.y); }
      vs.forEach(v => { if (v !== t) v.dispose(); }); t.dispose();
    }
    const X = tf.tensor2d(xs, [xs.length, 1280]);
    const Y = tf.oneHot(tf.tensor1d(ys, 'int32'), 4);
    return { X, Y, n: xs.length };
  }
  console.log('Pocitam embeddingy (train s augmentaci)...');
  const tr = buildXY(train, true);
  const va = buildXY(val, false);
  console.log('train vzorku po augmentaci:', tr.n, '| val:', va.n);

  // --- vahy trid ---
  const counts = [0,0,0,0]; train.forEach(d => counts[d.y]++);
  const N = train.length, K = 4;
  const classWeight = {}; for (let c=0;c<K;c++) classWeight[c] = counts[c] ? N/(K*counts[c]) : 1;
  console.log('counts(train):', counts, 'vahy:', classWeight);

  // --- hlava: linearni probe s L2 ---
  const head = tf.sequential();
  head.add(tf.layers.dense({ inputShape:[1280], units:4, activation:'softmax', kernelRegularizer: tf.regularizers.l2({l2:0.02}) }));
  head.compile({ optimizer: tf.train.adam(0.001), loss:'categoricalCrossentropy', metrics:['accuracy'] });

  await head.fit(tr.X, tr.Y, {
    epochs: 200, batchSize: 32, shuffle: true, classWeight,
    validationData: [va.X, va.Y], verbose: 0,
    callbacks: { onEpochEnd: (ep, logs) => { if ((ep+1)%50===0) console.log(`epoch ${ep+1}: loss=${logs.loss.toFixed(3)} acc=${logs.acc.toFixed(3)} val_acc=${(logs.val_acc||0).toFixed(3)}`); } }
  });

  // --- vyhodnoceni na val: confusion ---
  const valPred = tf.tidy(() => head.predict(va.X).argMax(1).dataSync());
  const valTrue = val.map(d => d.y);
  const conf = Array.from({length:4},()=>[0,0,0,0]);
  let correct = 0;
  valTrue.forEach((t,i)=>{ conf[t][valPred[i]]++; if (t===valPred[i]) correct++; });
  console.log('VAL accuracy:', (correct/valTrue.length).toFixed(3));
  console.log('Confusion (radek=skutecnost, sloupec=predikce) poradi', CLASSES.join(','));
  conf.forEach((r,i)=>console.log(' ', CLASSES[i].padEnd(9), r.join(' ')));

  // --- reklasifikace vsech 8282 ---
  console.log('Reklasifikuji vsech 8282...');
  const addrMap = fs.existsSync(ADDR_MAP) ? JSON.parse(fs.readFileSync(ADDR_MAP,'utf8')) : {};
  const all = readIndex();
  const out = []; const cnt = { vhodne:0, nevhodne:0, fve:0, prumysl:0, nejista:0 };
  let done=0; const t0=Date.now();
  for (const r of all) {
    const fp = path.join(IMG_DIR, r.file); if (!fs.existsSync(fp)) continue;
    const probs = tf.tidy(() => { const t=imgTensor(fp); const e=emb.predict(t); return head.predict(e).dataSync(); });
    let top=0; for (let i=1;i<4;i++) if (probs[i]>probs[top]) top=i;
    const bucket = probs[top] < UNSURE ? 'nejista' : CLASSES[top]; cnt[bucket]++;
    out.push({ file:r.file, osm_type:r.osm_type, osm_id:r.osm_id, lon:r.lon, lat:r.lat,
      adresa: addrMap[`${r.osm_type}_${r.osm_id}`]||null,
      probs:{ vhodne:+probs[0].toFixed(4), nevhodne:+probs[1].toFixed(4), fve:+probs[2].toFixed(4), prumysl:+probs[3].toFixed(4) },
      top:CLASSES[top], topProb:+probs[top].toFixed(4), bucket });
    done++; if (done%1000===0) console.log(`${done}/${all.length} ${JSON.stringify(cnt)}`);
  }
  const meta = { obec:'Litvínov', pocet:out.length, prah_nejista:UNSURE, counts:cnt, labels:LABEL_NAMES,
    model:'pretrénováno na reálných snímcích', trenovano_na: train.length+val.length, val_accuracy:+(correct/valTrue.length).toFixed(3),
    vygenerovano: new Date().toISOString() };
  fs.writeFileSync(OUT_JSON, JSON.stringify({ meta, strechy: out }));
  console.log('HOTOVO za', ((Date.now()-t0)/1000).toFixed(0)+'s. Souhrn:', JSON.stringify(cnt));

  // uloz hlavu pro reprodukovatelnost (vlastni handler - ciste tfjs neumi file://)
  try {
    const dir = path.join(BASE, 'model_retrained'); fs.mkdirSync(dir, { recursive: true });
    await head.save({ save: async (artifacts) => {
      const wm = [{ paths: ['weights.bin'], weights: artifacts.weightSpecs }];
      const modelJSON = { modelTopology: artifacts.modelTopology, format: artifacts.format, generatedBy: artifacts.generatedBy, convertedBy: artifacts.convertedBy, weightsManifest: wm };
      fs.writeFileSync(path.join(dir, 'model.json'), JSON.stringify(modelJSON));
      fs.writeFileSync(path.join(dir, 'weights.bin'), Buffer.from(artifacts.weightData));
      return { modelArtifactsInfo: { dateSaved: new Date(), modelTopologyType: 'JSON' } };
    } });
    console.log('Hlava ulozena do model_retrained/');
  } catch (e) { console.log('Ulozeni hlavy preskoceno:', e.message); }
}
main().catch(e => { console.error('CHYBA:', e); process.exit(1); });
