// ==================== UI ====================
'use strict';

const $ = id => document.getElementById(id);

// ---------- моды ----------
// Мод — это обычный JS, которому выдаётся объект Life. Можно подписаться на события,
// менять настройки, спавнить сущности. Загружается из файла .js или вставляется в окно.
const Life = {
  version: VERSION,
  S, world, hooks, stats, lineage,
  on(name, fn) { if (!hooks[name]) throw new Error('Нет события ' + name + '. Доступны: ' + Object.keys(hooks).join(', ')); hooks[name].push(fn); },
  get cells() { return cells; }, get plants() { return plants; }, get meats() { return meats; },
  get walls() { return walls; }, get sources() { return sources; }, get time() { return simTime; },
  spawnCell, spawnCellsAt, createCell, killCell, randomGenome, bodyColor, nucleusColor, ARCH_NAMES,
  addPlant(x, y, fat) { plants.push(createPlant(x, y, fat)); },
  addWall(x1, y1, x2, y2, r) { walls.push({ x1, y1, x2, y2, r: r || 6 }); obstDirty = true; },
  addSource(x, y) { sources.push(createSource(x, y)); obstDirty = true; },
  step: stepOnce,
};
window.Life = Life;
const loadedMods = [];

function runMod(code, name) {
  try {
    new Function('Life', code)(Life);
    loadedMods.push(name);
    setModStatus('✔ Мод «' + name + '» загружен');
  } catch (e) { setModStatus('✖ Ошибка в «' + name + '»: ' + e.message, true); }
  renderModList();
}
function setModStatus(t, bad) { const el = $('modStatus'); el.textContent = t; el.style.color = bad ? '#f66' : '#6d6'; }
function renderModList() { $('modList').textContent = loadedMods.length ? 'Загружено: ' + loadedMods.join(', ') : 'Модов нет'; }
function unloadMods() {
  for (const k in hooks) hooks[k].length = 0;
  loadedMods.length = 0; setModStatus('Хуки модов сброшены (изменённые настройки остаются)'); renderModList();
}

const MOD_EXAMPLE = `// Пример: каждая рождённая клетка с шансом 5% становится «мутантом»
Life.on('birth', (kid, parent) => {
  if (Math.random() < 0.05) { kid.genome[0] = 255; kid.strength = 255; kid.color = Life.bodyColor(kid.genome); }
});
Life.on('death', (c, cause) => { if (cause === 'kill') console.log('#' + c.id + ' убита'); });`;

// ---------- панель настроек ----------
function buildSettings() {
  const body = $('settingsBody');
  body.innerHTML = '';
  const groups = {};
  const getGroup = name => {
    if (groups[name]) return groups[name];
    const det = document.createElement('details');
    det.open = name === 'Спавн';
    det.innerHTML = `<summary>${name}</summary>`;
    body.appendChild(det);
    return (groups[name] = det);
  };

  for (const d of SETTING_DEFS) {
    const det = getGroup(d.g);
    const row = document.createElement('label');
    row.className = 'srow';
    const mark = d.restart ? ' <b title="применится при перезапуске мира">↻</b>' : '';
    row.innerHTML = `<span>${d.label}${mark}</span>`;
    let el;
    if (d.type === 'range' || d.type === 'number') {
      el = document.createElement('input');
      el.type = d.type; el.min = d.min; el.max = d.max; el.step = d.step; el.value = S[d.key];
      el.dataset.key = d.key;
      if (d.type === 'range') {
        const val = document.createElement('em'); val.textContent = S[d.key];
        el.oninput = () => { S[d.key] = parseFloat(el.value); val.textContent = S[d.key]; applySetting(d); };
        row.appendChild(el); row.appendChild(val);
      } else {
        el.onchange = () => { S[d.key] = clamp(parseFloat(el.value) || d.def, d.min, d.max); el.value = S[d.key]; applySetting(d); };
        row.appendChild(el);
      }
    } else if (d.type === 'bool') {
      el = document.createElement('input'); el.type = 'checkbox'; el.checked = S[d.key]; el.dataset.key = d.key;
      el.onchange = () => { S[d.key] = el.checked; applySetting(d); };
      row.appendChild(el);
    } else if (d.type === 'select') {
      el = document.createElement('select'); el.dataset.key = d.key;
      for (const [v, t] of d.options) { const o = document.createElement('option'); o.value = v; o.textContent = t; el.appendChild(o); }
      el.value = S[d.key];
      el.onchange = () => { S[d.key] = el.value; applySetting(d); };
      row.appendChild(el);
    }
    det.appendChild(row);
  }

  // геном спавна
  const sp = getGroup('Спавн');
  const box = document.createElement('div');
  box.className = 'genbox';
  box.innerHTML = '<div class="gtitle">Геном для спавна (центр рандомизации)</div>';
  const arch = document.createElement('select');
  arch.innerHTML = '<option value="">— архетип из атласа —</option>' + ARCH_NAMES.map((n, i) => `<option value="${i}">${n}</option>`).join('');
  box.appendChild(arch);
  const sliders = [];
  const colors = ['#f55', '#58f', '#5d5', '#f77', '#79f', '#7e7'];
  GENE_NAMES.forEach((name, i) => {
    const r = document.createElement('label'); r.className = 'srow';
    r.innerHTML = `<span style="color:${colors[i]}">${name}</span>`;
    const inp = document.createElement('input'); inp.type = 'range'; inp.min = 0; inp.max = 255; inp.value = S.spawnGenome[i];
    const val = document.createElement('em'); val.textContent = S.spawnGenome[i];
    inp.oninput = () => { S.spawnGenome[i] = +inp.value; val.textContent = inp.value; saveSettings(); };
    r.appendChild(inp); r.appendChild(val); box.appendChild(r);
    sliders.push([inp, val]);
  });
  arch.onchange = () => {
    if (arch.value === '') return;
    const i = +arch.value, lv = [Math.floor(i / 9), Math.floor(i / 3) % 3, i % 3];
    lv.forEach((l, k) => { S.spawnGenome[k] = LV[l]; sliders[k][0].value = LV[l]; sliders[k][1].textContent = LV[l]; });
    S.spawnMode = 'exact';
    const m = body.querySelector('select[data-key="spawnMode"]'); if (m) m.value = 'exact';
    saveSettings();
  };
  const rnd = document.createElement('button');
  rnd.textContent = '🎲 Случайный геном';
  rnd.onclick = () => {
    S.spawnGenome = randomGenome();
    S.spawnGenome.forEach((b, k) => { sliders[k][0].value = b; sliders[k][1].textContent = b; });
    saveSettings();
  };
  box.appendChild(rnd);
  sp.appendChild(box);

  // моды
  const md = getGroup('Моды');
  md.insertAdjacentHTML('beforeend', `
    <div class="genbox">
      <div class="gtitle">Моды (JS с объектом Life)</div>
      <textarea id="modCode" rows="7" spellcheck="false"></textarea>
      <div class="btnrow"><button id="modRun">▶ Запустить код</button><button id="modExample">Пример</button>
      <button id="modUnload">Сбросить хуки</button></div>
      <input type="file" id="modFile" accept=".js,text/javascript">
      <div id="modStatus" style="margin-top:4px"></div><div id="modList" style="opacity:.7"></div>
    </div>`);
  $('modExample').onclick = () => { $('modCode').value = MOD_EXAMPLE; };
  $('modRun').onclick = () => runMod($('modCode').value, 'код из окна');
  $('modUnload').onclick = unloadMods;
  $('modFile').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    runMod(await f.text(), f.name); e.target.value = '';
  };
  renderModList();
}

function applySetting(d) {
  if (d.key === 'cellSize') refreshCellRadius();
  saveSettings();
}

// ---------- инструменты ----------
const TOOLS = {
  spawn: ['btnSpawn', 'Спавн клеток: клик (кружок — радиус спавна)'],
  plant: ['btnPlant', 'Растения: клик сыплет несколько растений'],
  source: ['btnSource', 'Источник растений: клик ставит точку спавна'],
  wall: ['btnWall', 'Палка: зажми и потяни, отпусти — препятствие'],
  erase: ['btnErase', 'Ластик: клик по клетке, палке или источнику'],
};
function setTool(t) {
  input.tool = t; input.wallDrag = null;
  for (const k in TOOLS) $(TOOLS[k][0]).classList.toggle('active', k === t);
  $('toolIndicator').textContent = TOOLS[t][1];
}

function toolAction(wx, wy) {
  switch (input.tool) {
    case 'spawn': spawnCellsAt(wx, wy); break;
    case 'plant':
      for (let i = 0; i < 6; i++) {
        const pos = findFreePos(wx + rand(-25, 25), wy + rand(-25, 25), 4);
        if (pos.ok) plants.push(createPlant(pos.x, pos.y));
      }
      break;
    case 'source': {
      const pos = findFreePos(wx, wy, 22);
      if (pos.ok) { sources.push(createSource(pos.x, pos.y)); obstDirty = true; }
      break;
    }
    case 'erase': {
      let best = null, bd = 35, kind = '';
      for (const c of cells) { const d = Math.hypot(c.x - wx, c.y - wy) - c.radius; if (c.alive && d < bd) { bd = d; best = c; kind = 'cell'; } }
      for (const w of walls) { const d = distPointSeg(wx, wy, w.x1, w.y1, w.x2, w.y2) - w.r; if (d < bd) { bd = d; best = w; kind = 'wall'; } }
      for (const s of sources) { const d = Math.hypot(s.x - wx, s.y - wy) - s.r; if (s.alive && d < bd) { bd = d; best = s; kind = 'source'; } }
      if (kind === 'cell') killCell(best, 'erase');
      else if (kind === 'wall') { walls.splice(walls.indexOf(best), 1); obstDirty = true; }
      else if (kind === 'source') { best.alive = false; obstDirty = true; }
      break;
    }
  }
}

// ---------- ввод (мышь + касания) ----------
const ptrs = new Map();
let mode = null, pinch = null, space = false;
const keys = new Set();

function canvasPos(e) { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }

canvas.addEventListener('pointerdown', e => {
  canvas.setPointerCapture(e.pointerId);
  const [sx, sy] = canvasPos(e);
  ptrs.set(e.pointerId, { sx, sy, x: sx, y: sy, camX: cam.x, camY: cam.y, touch: e.pointerType === 'touch' });
  input.mx = sx; input.my = sy; input.over = true;

  if (ptrs.size === 2) {                       // два пальца: щипок/панорама
    const [a, b] = [...ptrs.values()];
    pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
    mode = 'pinch'; input.wallDrag = null; return;
  }
  const panBtn = e.button === 1 || e.button === 2 || (e.button === 0 && (e.shiftKey || space));
  if (panBtn) { mode = 'pan'; return; }
  const [wx, wy] = screenToWorld(sx, sy);
  if (e.pointerType === 'touch' && input.tool !== 'wall') { mode = 'tap'; return; }
  mode = 'tool';
  if (input.tool === 'wall') input.wallDrag = { x: wx, y: wy };
  else toolAction(wx, wy);
});

canvas.addEventListener('pointermove', e => {
  const [sx, sy] = canvasPos(e);
  input.mx = sx; input.my = sy; input.over = true;
  const p = ptrs.get(e.pointerId);
  if (!p) return;
  p.x = sx; p.y = sy;
  if (mode === 'pinch' && ptrs.size >= 2) {
    const [a, b] = [...ptrs.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y), cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
    if (pinch.d > 0) zoomAt(cx, cy, d / pinch.d);
    cam.x -= (cx - pinch.cx) / cam.zoom; cam.y -= (cy - pinch.cy) / cam.zoom;
    pinch = { d, cx, cy };
  } else if (mode === 'pan') {
    cam.x = p.camX - (sx - p.sx) / cam.zoom; cam.y = p.camY - (sy - p.sy) / cam.zoom;
  } else if (mode === 'tap' && Math.hypot(sx - p.sx, sy - p.sy) > 8) {
    mode = 'pan';
  }
});

function endPointer(e) {
  const p = ptrs.get(e.pointerId);
  if (!p) return;
  const [sx, sy] = canvasPos(e);
  if (mode === 'tool' && input.tool === 'wall' && input.wallDrag) {
    const [wx, wy] = screenToWorld(sx, sy), s = input.wallDrag;
    walls.push({ x1: s.x, y1: s.y, x2: Math.hypot(wx - s.x, wy - s.y) > 4 ? wx : s.x, y2: Math.hypot(wx - s.x, wy - s.y) > 4 ? wy : s.y, r: 6 });
    obstDirty = true; input.wallDrag = null;
  } else if (mode === 'tap') {
    const [wx, wy] = screenToWorld(sx, sy);
    toolAction(wx, wy);
  }
  ptrs.delete(e.pointerId);
  mode = null;
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', e => { ptrs.delete(e.pointerId); mode = null; input.wallDrag = null; });
canvas.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') input.over = false; });
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('wheel', e => {
  e.preventDefault();
  const [sx, sy] = canvasPos(e);
  zoomAt(sx, sy, e.deltaY > 0 ? 0.9 : 1.1);
}, { passive: false });

window.addEventListener('keydown', e => {
  if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
  const k = e.key.toLowerCase();
  if (k === ' ') { e.preventDefault(); space = true; togglePause(); }
  else if (k === '.') stepOnce();
  else if (k === 'f') fitCamera();
  else if (k === 'escape') { closePanels(); closeSummary(); }
  else if (k >= '1' && k <= '5') setTool(Object.keys(TOOLS)[+k - 1]);
  else if (k === '+' || k === '=') zoomAt(vw / 2, vh / 2, 1.15);
  else if (k === '-') zoomAt(vw / 2, vh / 2, 1 / 1.15);
  else keys.add(k);
});
window.addEventListener('keyup', e => { keys.delete(e.key.toLowerCase()); if (e.key === ' ') space = false; });

function handleKeys(dt) {
  let dx = 0, dy = 0;
  if (keys.has('a') || keys.has('arrowleft')) dx -= 1;
  if (keys.has('d') || keys.has('arrowright')) dx += 1;
  if (keys.has('w') || keys.has('arrowup')) dy -= 1;
  if (keys.has('s') || keys.has('arrowdown')) dy += 1;
  if (dx || dy) { cam.x += dx * 700 * dt / cam.zoom; cam.y += dy * 700 * dt / cam.zoom; }
}

// ---------- верхняя панель ----------
function togglePause() { paused = !paused; $('btnPlay').textContent = paused ? '▶' : '⏸'; $('btnPlay').classList.toggle('active', !paused); }
$('btnPlay').onclick = togglePause;
$('btnStep').onclick = () => { if (!paused) togglePause(); stepOnce(); };
$('btnFit').onclick = fitCamera;

const speed = $('speedSlider');
speed.oninput = () => { timeScale = parseFloat(speed.value); $('speedVal').textContent = timeScale.toFixed(1) + '×'; };

for (const t in TOOLS) $(TOOLS[t][0]).onclick = () => setTool(t);

function closePanels() { for (const id of ['settingsPanel', 'statsPanel', 'savesPanel']) $(id).style.display = 'none'; }
function togglePanel(id) {
  const el = $(id), show = el.style.display !== 'block';
  closePanels(); el.style.display = show ? 'block' : 'none';
}
$('btnSettings').onclick = () => togglePanel('settingsPanel');
$('btnStats').onclick = () => togglePanel('statsPanel');
$('btnSummary').onclick = openSummary;

// ---------- сейвы ----------
function saveMsg(t, bad) { const el = $('saveMsg'); el.textContent = t || ''; el.style.color = bad ? '#f66' : '#6d6'; }

function renderSlots() {
  const box = $('slotList');
  box.innerHTML = '';
  for (let i = 1; i <= SLOT_COUNT; i++) {
    const m = slotMeta(i), row = document.createElement('div');
    row.className = 'slot';
    row.innerHTML = `<div><b>Слот ${i}</b><small>${m ? `${new Date(m.at).toLocaleString()} · ${fmtTime(m.t)} · ${m.cells} клеток · ${m.kb} КБ` : 'пусто'}</small></div>
      <button data-a="save">Сохранить</button><button data-a="load" ${m ? '' : 'disabled'}>Загрузить</button><button data-a="del" ${m ? '' : 'disabled'}>✕</button>`;
    row.querySelector('[data-a=save]').onclick = () => { const e = saveSlot(i); saveMsg(e || 'Сохранено в слот ' + i, !!e); renderSlots(); };
    row.querySelector('[data-a=load]').onclick = () => { const e = loadSlot(i); saveMsg(e || 'Загружено из слота ' + i, !!e); if (!e) afterLoad(); };
    row.querySelector('[data-a=del]').onclick = () => { deleteSlot(i); renderSlots(); };
    box.appendChild(row);
  }
}

function afterLoad() {
  buildSettings(); renderSlots();
  speed.value = timeScale; $('speedVal').textContent = timeScale.toFixed(1) + '×';
}

$('btnSaves').onclick = () => { togglePanel('savesPanel'); renderSlots(); saveMsg(''); };
$('saveDownload').onclick = () => { downloadSave(); saveMsg('Файл скачан'); };
$('saveUpload').onclick = () => $('saveFile').click();
$('saveFile').onchange = async e => {
  const f = e.target.files[0]; if (!f) return;
  const err = await loadSaveFile(f); e.target.value = '';
  saveMsg(err || 'Загружено из файла', !!err); if (!err) afterLoad();
};
let autoSaveTimer = null;
$('autoSave').onchange = function () {
  clearInterval(autoSaveTimer);
  if (this.checked) autoSaveTimer = setInterval(() => { const e = saveSlot(1); if (e) saveMsg(e, true); }, 60000);
};
$('btnRestart').onclick = () => { spawnInitial(); fitCamera(); };
$('btnResetSettings').onclick = () => { resetSettings(); buildSettings(); refreshCellRadius(); };

// ---------- живая статистика ----------
function updateStatsPanel() {
  if ($('statsPanel').style.display !== 'block') return;
  $('stCells').textContent = cells.length;
  $('stPlants').textContent = plants.length;
  $('stMeat').textContent = meats.length;
  $('stSources').textContent = sources.length;
  $('stKills').textContent = stats.kills;
  $('stBirths').textContent = stats.births;
  $('stStarve').textContent = stats.starve;
  $('stGen').textContent = stats.maxGen;
  $('stPacks').textContent = packLeaders;
  $('stTime').textContent = fmtTime(simTime);
  drawLiveCharts($('popChart'), $('statChart'));
}

// ---------- итоги ----------
function closeSummary() { $('summary').style.display = 'none'; }

function openSummary() {
  closePanels();
  if (!paused) togglePause();
  const el = $('summary');
  el.style.display = 'block';
  const gs = generationSeries();
  const arche = archetypeCounts();
  const topA = arche.slice(0, 8);
  const maxA = topA.length ? topA[0].n : 1;
  const avgAge = cells.length ? cells.reduce((s, c) => s + c.age, 0) / cells.length : 0;

  el.querySelector('.sumBody').innerHTML = `
    <div class="sumTop">
      <div class="kpi"><b>${fmtTime(simTime)}</b>время</div>
      <div class="kpi"><b>${cells.length}</b>живых</div>
      <div class="kpi"><b>${stats.births}</b>рождений</div>
      <div class="kpi"><b>${stats.kills}</b>убийств</div>
      <div class="kpi"><b>${stats.starve}</b>от голода</div>
      <div class="kpi"><b>${stats.maxGen}</b>макс. поколение</div>
      <div class="kpi"><b>${fmtTime(avgAge)}</b>средний возраст</div>
    </div>
    <div class="sumRec">🏆 Дольше всех жила #${stats.maxAgeId} (${fmtTime(stats.maxAge)}) ·
      больше всех убила #${stats.maxKillsId} (${stats.maxKills}) ·
      больше всех детей у #${stats.maxKidsId} (${stats.maxKids})</div>
    <h4>Архетипы среди живых</h4>
    <div class="arch">${topA.map(a => `<div><span>${a.name}</span><i style="width:${a.n / maxA * 100}%"></i><em>${a.n}</em></div>`).join('') || 'Никого не осталось'}</div>
    <div class="charts">
      ${['c1:Популяция и ресурсы', 'c2:Средние характеристики тела (тренд)', 'c3:Средние характеристики ядра (тренд)',
         'c4:Накопительно: рождения, убийства, голод', 'c5:Среднее поколение популяции', 'c6:Тело по поколениям (среднее при рождении)',
         'c7:Ядро по поколениям (среднее при рождении)', 'c8:Сколько клеток родилось в каждом поколении',
         'c9:Распределение тела среди живых', 'c10:Распределение ядра среди живых']
        .map(s => { const [id, t] = s.split(':'); return `<div class="chartCard"><div>${t}</div><canvas id="${id}"></canvas></div>`; }).join('')}
    </div>`;

  const x1 = hist.t.length ? hist.t[hist.t.length - 1] : 0, xo = { x0: 0, x1, xFmt: fmtTime };
  drawChart($('c1'), { ...xo, series: [
    { label: 'Клетки', color: '#4d9', data: hist.pop }, { label: 'Растения', color: '#7c4', data: hist.plants }, { label: 'Мясо', color: '#e65', data: hist.meat }] });
  drawChart($('c2'), { ...xo, yMin: 0, yMax: 255, series: SERIES.body() });
  drawChart($('c3'), { ...xo, yMin: 0, yMax: 255, series: SERIES.nucleus() });
  drawChart($('c4'), { ...xo, series: [
    { label: 'Рождения', color: '#4d9', data: hist.births }, { label: 'Убийства', color: '#f55', data: hist.kills }, { label: 'Голод', color: '#ca4', data: hist.starve }] });
  drawChart($('c5'), { ...xo, series: [{ label: 'Поколение', color: '#c8f', data: hist.gen }] });
  const gx = { x0: 0, x1: Math.max(0, gs.gens.length - 1), xFmt: v => 'пок. ' + Math.round(v) };
  drawChart($('c6'), { ...gx, yMin: 0, yMax: 255, series: [
    { label: 'Сила', color: '#f55', data: gs.str }, { label: 'Броня', color: '#58f', data: gs.arm }, { label: 'Реген', color: '#5d5', data: gs.reg }] });
  drawChart($('c7'), { ...gx, yMin: 0, yMax: 255, series: [
    { label: 'Смелость', color: '#f77', data: gs.cou }, { label: 'Стайность', color: '#79f', data: gs.soc }, { label: 'Прожорл.', color: '#7e7', data: gs.gre }] });
  drawChart($('c8'), { ...gx, series: [{ label: 'Клеток', color: '#fa4', data: gs.n }] });
  const labels = ['0', '32', '64', '96', '128', '160', '192', '224'];
  drawBars($('c9'), { labels, series: [
    { label: 'Сила', color: '#f55', data: histogram(cells, 'strength', 8) },
    { label: 'Броня', color: '#58f', data: histogram(cells, 'armor', 8) },
    { label: 'Реген', color: '#5d5', data: histogram(cells, 'regen', 8) }] });
  drawBars($('c10'), { labels, series: [
    { label: 'Смелость', color: '#f77', data: histogram(cells, 'courage', 8) },
    { label: 'Стайность', color: '#79f', data: histogram(cells, 'sociability', 8) },
    { label: 'Прожорл.', color: '#7e7', data: histogram(cells, 'greed', 8) }] });
}

$('sumClose').onclick = closeSummary;
$('sumExport').onclick = () => {
  const data = { version: VERSION, time: simTime, stats, hist, generations: generationSeries(), archetypes: archetypeCounts() };
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'cells4-stats.json'; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
};

// ==================== MAIN LOOP ====================
let lastT = 0, fps = 60, uiTimer = 0;

function frame(now) {
  const dt = lastT ? (now - lastT) / 1000 : 0.016;
  lastT = now;
  fps += (1 / Math.max(dt, 0.001) - fps) * 0.05;
  handleKeys(dt);
  advance(dt);

  input.hovered = input.over ? pickCell(...screenToWorld(input.mx, input.my)) : null;
  render(now);
  updateHoverPanel(now);

  uiTimer += dt;
  if (uiTimer > 0.4) {
    uiTimer = 0;
    $('stats').textContent =
      `${cells.length} клеток · ${plants.length} раст. · ${meats.length} мяса · ${sources.length} ист. · ${fmtTime(simTime)} · ${fps.toFixed(0)} fps`;
    updateStatsPanel();
  }
  requestAnimationFrame(frame);
}

function init() {
  loadSettings();
  buildSettings();
  speed.value = timeScale; $('speedVal').textContent = timeScale.toFixed(1) + '×';
  resizeCanvas();
  spawnInitial();
  fitCamera();
  setTool('spawn');
  requestAnimationFrame(frame);
}
init();
