// Spoji moje rucni labely (index -> trida) s label_map.csv -> data/labels.csv (file,label)
const fs = require('fs'), path = require('path');
const BASE = __dirname;

// index -> trida (z vizualni kontroly montazi); 'skip' = vynechat
const L = {
  1:'prumysl',2:'prumysl',3:'vhodne',4:'vhodne',5:'prumysl',6:'vhodne',7:'prumysl',8:'prumysl',
  9:'prumysl',10:'prumysl',11:'prumysl',12:'vhodne',13:'prumysl',14:'skip',15:'prumysl',16:'vhodne',
  17:'fve',18:'vhodne',19:'fve',20:'fve',21:'prumysl',22:'prumysl',23:'prumysl',24:'fve',25:'fve',
  26:'skip',27:'skip',28:'prumysl',29:'prumysl',30:'prumysl',31:'prumysl',32:'skip',33:'prumysl',
  34:'skip',35:'nevhodne',36:'fve',
  37:'vhodne',38:'nevhodne',39:'vhodne',40:'nevhodne',41:'nevhodne',42:'nevhodne',43:'nevhodne',
  44:'vhodne',45:'vhodne',46:'vhodne',47:'vhodne',48:'vhodne',49:'vhodne',50:'vhodne',51:'vhodne',
  52:'vhodne',53:'vhodne',54:'vhodne',55:'vhodne',56:'vhodne',57:'vhodne',58:'vhodne',59:'vhodne',
  60:'vhodne',61:'vhodne',62:'vhodne',63:'nevhodne',64:'vhodne',65:'vhodne',66:'nevhodne',67:'vhodne',
  68:'vhodne',69:'vhodne',70:'vhodne',71:'nevhodne',72:'vhodne',73:'vhodne',74:'vhodne',75:'vhodne',76:'vhodne'
};

const map = fs.readFileSync(path.join(BASE, 'data', 'label_map.csv'), 'utf8').split(/\r?\n/).filter(Boolean);
map.shift();
const idx2file = {};
for (const line of map) { const [i, file] = line.split(','); idx2file[i] = file; }

const out = ['file,label'];
const counts = {};
for (const [i, lab] of Object.entries(L)) {
  if (lab === 'skip') continue;
  const f = idx2file[i];
  if (!f) { console.log('chybi file pro index', i); continue; }
  out.push(`${f},${lab}`);
  counts[lab] = (counts[lab] || 0) + 1;
}
fs.writeFileSync(path.join(BASE, 'data', 'labels.csv'), out.join('\n'));
console.log('labels.csv:', out.length - 1, 'radku |', JSON.stringify(counts));
