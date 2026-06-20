/* FVE-ÚK — dashboard inventury střech. Čistý JS, stav v localStorage. */

const CAT = {
  vhodne:   { name: 'Vhodná střecha',    short: 'Vhodné střechy',      cls: 'vhodne',   ico: '🟢' },
  nevhodne: { name: 'Nevhodná střecha',  short: 'Nevhodné střechy',    cls: 'nevhodne', ico: '🔴' },
  fve:      { name: 'FVE instalováno',   short: 'FVE instalováno',     cls: 'fve',      ico: '🔵' },
  prumysl:  { name: 'Průmyslová hala',   short: 'Průmyslové haly',     cls: 'prumysl',  ico: '🟡' },
  nejista:  { name: 'Nejistá',           short: 'Nejistá klasifikace', cls: 'nejista',  ico: '🟣' },
};
const CLASS_TABS = ['vhodne', 'nevhodne', 'fve', 'prumysl', 'nejista'];
const CONF_ORDER = ['vhodne', 'nevhodne', 'fve', 'prumysl'];
const WORK_TABS = {
  k_vyrizeni:  { short: 'K vyřízení',          ico: '📋' },
  zkontrolovat:{ short: 'Zkontrolovat ručně',  ico: '🔍' },
  hotovo:      { short: 'Hotovo',              ico: '✅' },
};
const PAGE = 60;
const STORAGE_KEY = 'fveuk_decisions_litvinov_v1';

let DATA = null;
let BYFILE = {};
let decisions = {};
let activeTab = 'vhodne';
let visibleCount = PAGE;
let currentCity = 'Litvínov';

/* ---------- stav ---------- */
function loadDecisions() {
  try { decisions = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; }
  catch (e) { decisions = {}; }
}
function saveDecisions() { localStorage.setItem(STORAGE_KEY, JSON.stringify(decisions)); }

function setDecision(file, status, label) {
  decisions[file] = { status, label, ts: Date.now() };
  saveDecisions();
  refresh();
}
function clearDecision(file) {
  delete decisions[file];
  saveDecisions();
  refresh();
}

/* ---------- vyber strech pro zalozku ---------- */
function roofsForTab(tab) {
  if (CLASS_TABS.includes(tab)) {
    return DATA.strechy.filter(r => r.bucket === tab && !decisions[r.file]);
  }
  // pracovni zalozky
  return DATA.strechy.filter(r => decisions[r.file] && decisions[r.file].status === tab);
}

function applySearchSort(list) {
  const q = document.getElementById('search').value.trim().toLowerCase();
  if (q) {
    list = list.filter(r =>
      (r.adresa && r.adresa.toLowerCase().includes(q)) ||
      String(r.osm_id).includes(q)
    );
  }
  const sort = document.getElementById('sort').value;
  list = list.slice();
  if (sort === 'conf_asc') list.sort((a, b) => a.topProb - b.topProb);
  else if (sort === 'conf_desc') list.sort((a, b) => b.topProb - a.topProb);
  else if (sort === 'addr') list.sort((a, b) => (a.adresa || 'zzz').localeCompare(b.adresa || 'zzz', 'cs'));
  return list;
}

/* ---------- vykresleni ---------- */
function pct(x) { return Math.round(x * 100); }

function confHtml(r) {
  return '<div class="conf">' + CONF_ORDER.map(k => {
    const v = r.probs[k];
    return `<div class="row">
      <span class="name">${CAT[k].name.replace(' střecha','')}</span>
      <span class="track"><span class="bg-${k}" style="width:${pct(v)}%"></span></span>
      <span class="pct">${pct(v)}%</span>
    </div>`;
  }).join('') + '</div>';
}

function addrHtml(r) {
  const map = `https://mapy.cz/letecka?x=${r.lon}&y=${r.lat}&z=19`;
  if (r.adresa) {
    return `<div class="addr">${r.adresa}, Litvínov
      <div class="coords"><a class="maplink" href="${map}" target="_blank" rel="noopener">📍 zobrazit na mapě</a></div></div>`;
  }
  return `<div class="addr">Bez evidované adresy
    <div class="coords">${r.lat.toFixed(5)}, ${r.lon.toFixed(5)} ·
    <a class="maplink" href="${map}" target="_blank" rel="noopener">📍 mapa</a></div></div>`;
}

function labelSelect(selected) {
  return `<select class="lblsel">` + CONF_ORDER.map(k =>
    `<option value="${k}" ${k === selected ? 'selected' : ''}>${CAT[k].name}</option>`).join('') + `</select>`;
}

function actionsHtml(r, tab) {
  if (tab === 'k_vyrizeni') {
    const d = decisions[r.file];
    return `<div class="actions">
      <div class="line"><span class="label-badge">${CAT[d.label].ico} ${CAT[d.label].name}</span></div>
      <div class="line">
        <button class="btn-act btn-done full" data-act="hotovo" data-file="${r.file}">Označit jako hotovo</button>
      </div>
      <div class="line"><button class="btn-act btn-undo full" data-act="vratit" data-file="${r.file}">↩ Vrátit do klasifikace</button></div>
    </div>`;
  }
  if (tab === 'hotovo') {
    const d = decisions[r.file];
    return `<div class="actions">
      <div class="line"><span class="label-badge">✅ ${CAT[d.label].name}</span></div>
      <div class="line"><button class="btn-act btn-undo full" data-act="do_fronty" data-file="${r.file}">↩ Vrátit do fronty</button></div>
    </div>`;
  }
  // klasifikacni zalozky + zkontrolovat rucne
  const def = r.top;
  return `<div class="actions">
    <div class="line">${labelSelect(def)}
      <button class="btn-act btn-confirm" data-act="potvrdit" data-file="${r.file}">Potvrdit</button></div>
    ${tab === 'zkontrolovat'
      ? `<div class="line"><button class="btn-act btn-undo full" data-act="vratit" data-file="${r.file}">↩ Vrátit do klasifikace</button></div>`
      : `<div class="line"><button class="btn-act btn-manual full" data-act="manual" data-file="${r.file}">🔍 Zkontrolovat ručně</button></div>`}
  </div>`;
}

function cardHtml(r, tab) {
  const b = r.bucket;
  return `<div class="card">
    <div class="thumb">
      <img loading="lazy" src="../litvinov_strechy/${r.file}" alt="${r.adresa || r.file}">
      <div class="tag-corner"><span class="dot bg-${b}"></span>${CAT[b].name} · ${pct(r.topProb)}%</div>
    </div>
    <div class="body">
      ${addrHtml(r)}
      ${confHtml(r)}
      ${actionsHtml(r, tab)}
    </div>
  </div>`;
}

function renderTabs() {
  const wrap = document.getElementById('tabs');
  let html = '';
  CLASS_TABS.forEach(t => {
    const n = roofsForTab(t).length;
    html += `<button class="tab ${t === activeTab ? 'active' : ''}" data-tab="${t}">
      <span class="dot bg-${t}"></span>${CAT[t].short}<span class="badge">${n}</span></button>`;
  });
  html += `<span class="tab sep">│</span>`;
  Object.keys(WORK_TABS).forEach(t => {
    const n = roofsForTab(t).length;
    html += `<button class="tab ${t === activeTab ? 'active' : ''}" data-tab="${t}">
      ${WORK_TABS[t].ico} ${WORK_TABS[t].short}<span class="badge">${n}</span></button>`;
  });
  wrap.innerHTML = html;
  wrap.querySelectorAll('.tab[data-tab]').forEach(el =>
    el.onclick = () => { activeTab = el.dataset.tab; visibleCount = PAGE; render(); });
}

function renderHero() {
  const c = DATA.meta.counts;
  const total = DATA.meta.pocet;
  const kpis = document.getElementById('kpis');
  const cards = [
    ['vhodne', 'Vhodné střechy'], ['nevhodne', 'Nevhodné'],
    ['fve', 'Již s FVE'], ['prumysl', 'Průmyslové haly'], ['nejista', 'Nejistá klasifikace'],
  ];
  kpis.innerHTML = cards.map(([k, lbl]) => {
    const v = c[k], p = total ? Math.round(v / total * 100) : 0;
    return `<div class="kpi">
      <div class="lbl"><span class="dot bg-${k}"></span> ${lbl}</div>
      <div class="big c-${k}">${p}%</div>
      <div class="lbl">${v.toLocaleString('cs')} budov</div>
      <div class="bar"><span class="bg-${k}" style="width:${p}%"></span></div>
    </div>`;
  }).join('');

  // postup
  const acted = Object.keys(decisions).length;
  const done = Object.values(decisions).filter(d => d.status === 'hotovo').length;
  const pp = total ? Math.round(acted / total * 100) : 0;
  document.getElementById('progress').innerHTML =
    `<div class="ptxt">Zpracováno <b>${acted.toLocaleString('cs')}</b> / ${total.toLocaleString('cs')} · hotovo <b>${done}</b></div>
     <div class="progress-bar"><span style="width:${pp}%"></span></div>
     <div class="ptxt">${pp}%</div>`;
}

function render() {
  const main = document.getElementById('main');
  if (currentCity !== 'Litvínov') {
    document.getElementById('hero').style.display = 'none';
    document.getElementById('tabs').style.display = 'none';
    document.getElementById('toolbar').style.display = 'none';
    main.innerHTML = `<div class="empty"><div class="ico">🏗️</div>
      <h2>Na analýze města ${currentCity} se pracuje</h2>
      <p>Klasifikace střech zatím proběhla jen pro Litvínov.<br>Další města Ústeckého kraje připravujeme.</p></div>`;
    return;
  }
  document.getElementById('hero').style.display = '';
  document.getElementById('tabs').style.display = '';
  document.getElementById('toolbar').style.display = '';

  renderHero();
  renderTabs();

  let list = applySearchSort(roofsForTab(activeTab));
  const totalN = list.length;
  const shown = list.slice(0, visibleCount);

  if (totalN === 0) {
    main.innerHTML = `<div class="empty"><div class="ico">📭</div>
      <h2>Tady nic není</h2><p>V této složce zatím nejsou žádné střechy.</p></div>`;
    return;
  }

  let html = `<div class="grid">` + shown.map(r => cardHtml(r, activeTab)).join('') + `</div>`;
  if (totalN > visibleCount) {
    html += `<div class="load-more"><button class="btn" id="loadmore">Načíst další (${totalN - visibleCount} zbývá)</button></div>`;
  }
  main.innerHTML = html;

  const lm = document.getElementById('loadmore');
  if (lm) lm.onclick = () => { visibleCount += PAGE; render(); };

  // delegace akci
  main.querySelectorAll('[data-act]').forEach(btn => {
    btn.onclick = () => {
      const file = btn.dataset.file;
      const act = btn.dataset.act;
      if (act === 'potvrdit') {
        const sel = btn.closest('.actions').querySelector('.lblsel');
        setDecision(file, 'k_vyrizeni', sel.value);
      } else if (act === 'manual') {
        setDecision(file, 'zkontrolovat', BYFILE[file].top);
      } else if (act === 'hotovo') {
        const d = decisions[file]; setDecision(file, 'hotovo', d.label);
      } else if (act === 'vratit' || act === 'do_fronty') {
        if (act === 'do_fronty') { const d = decisions[file]; setDecision(file, 'k_vyrizeni', d.label); }
        else clearDecision(file);
      }
    };
  });
}

function refresh() { render(); }

/* ---------- export CSV ---------- */
function exportCsv() {
  const list = applySearchSort(roofsForTab(activeTab));
  const rows = [['soubor', 'adresa', 'lon', 'lat', 'ai_trida', 'jistota', 'stav', 'label']];
  list.forEach(r => {
    const d = decisions[r.file];
    rows.push([
      r.file, (r.adresa || ''), r.lon, r.lat, r.bucket, r.topProb,
      d ? d.status : 'neklasifikovano', d ? d.label : r.top
    ]);
  });
  const csv = rows.map(row => row.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `fveuk_${activeTab}.csv`;
  a.click();
}

/* ---------- init ---------- */
async function init() {
  loadDecisions();
  // mesta Usteckeho kraje
  const cities = ['Litvínov', 'Ústí nad Labem', 'Most', 'Děčín', 'Teplice', 'Chomutov',
    'Louny', 'Žatec', 'Kadaň', 'Bílina', 'Litoměřice', 'Jirkov', 'Klášterec nad Ohří', 'Varnsdorf'];
  const sel = document.getElementById('city');
  sel.innerHTML = cities.map(c => `<option ${c === 'Litvínov' ? 'selected' : ''}>${c}</option>`).join('');
  sel.onchange = () => { currentCity = sel.value; activeTab = 'vhodne'; visibleCount = PAGE; render(); };

  document.getElementById('search').oninput = () => { visibleCount = PAGE; render(); };
  document.getElementById('sort').onchange = () => { visibleCount = PAGE; render(); };
  document.getElementById('export').onclick = exportCsv;
  document.getElementById('reset').onclick = () => {
    if (confirm('Opravdu vymazat všechna rozhodnutí a začít znovu?')) { decisions = {}; saveDecisions(); render(); }
  };

  try {
    const res = await fetch('klasifikace.json');
    DATA = await res.json();
    DATA.strechy.forEach(r => BYFILE[r.file] = r);
    const m = DATA.meta;
    const modelTxt = m.model ? m.model : 'Teachable Machine';
    const accTxt = (m.val_accuracy != null) ? ` · přesnost na kontrolním vzorku ${pct(m.val_accuracy)} %` : '';
    document.getElementById('geninfo').textContent =
      `Model: ${modelTxt} · ${m.pocet.toLocaleString('cs')} střech · práh nejisté < ${pct(m.prah_nejista)} %${accTxt}`;
    render();
  } catch (e) {
    document.getElementById('main').innerHTML =
      `<div class="empty"><div class="ico">⚠️</div><h2>Nepodařilo se načíst data</h2>
      <p>Spusť dashboard přes <b>spustit.bat</b> (lokální server), ne otevřením souboru přímo.</p></div>`;
  }
}
document.addEventListener('DOMContentLoaded', init);
