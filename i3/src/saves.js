// ==================== SAVE / LOAD ====================
// Полный снимок мира: настройки, клетки (с геномом, HP, энергией, родословной), растения, мясо,
// палки, источники, история статистики. Слоты — в localStorage, плюс экспорт/импорт файла.
'use strict';

const SAVE_VERSION = 1;
const SLOT_COUNT = 3;
const r1 = v => Math.round(v * 10) / 10;

function serializeWorld() {
  return {
    v: SAVE_VERSION, ver: VERSION, savedAt: Date.now(),
    t: simTime, nextId, world: { w: world.w, h: world.h }, scenario: currentScenario,
    S: JSON.parse(JSON.stringify(S)), stats: { ...stats },
    cam: { x: cam.x, y: cam.y, zoom: cam.zoom },
    cells: cells.map(c => [
      c.id, r1(c.x), r1(c.y), r1(c.vx), r1(c.vy), c.genome, r1(c.hp), r1(c.hardHp), r1(c.energy), r1(c.age), c.gen,
      c.parent, c.kills, r1(c.meatEaten), r1(c.plantEaten), c.teammate && c.teammate.alive ? c.teammate.id : 0,
      c.children, r1(Math.min(c.combatTimer, 99)),
    ]),
    plants: plants.map(p => [r1(p.x), r1(p.y), r1(p.radius), r1(p.energy)]),
    meats: meats.filter(m => m.alive).map(m => [r1(m.x), r1(m.y), r1(m.vx), r1(m.vy), r1(m.radius), r1(m.energy), r1(m.life), r1(m.maxLife), m.r, m.gb]),
    walls: walls.map(w => [r1(w.x1), r1(w.y1), r1(w.x2), r1(w.y2), w.r]),
    sources: sources.filter(s => s.alive).map(s => [s.id, r1(s.x), r1(s.y), s.r, s.spawned]),
    lineage: [...lineage.values()].map(r => [r.id, r.parent, r.children, r.gen]),
    genAcc: genAcc.map(a => (a ? [a.n, a.sum] : null)),
    hist, histInterval, lastSample,
  };
}

function loadWorld(d) {
  if (!d || d.v !== SAVE_VERSION || !Array.isArray(d.cells)) throw new Error('Неизвестный формат сейва');
  // настройки: только известные ключи нужного типа
  for (const k in S) {
    if (!(k in d.S)) continue;
    if (Array.isArray(S[k])) { if (Array.isArray(d.S[k]) && d.S[k].length === S[k].length) S[k] = d.S[k].slice(); }
    else if (typeof d.S[k] === typeof S[k]) S[k] = d.S[k];
  }
  resetWorldState();
  world.w = d.world.w; world.h = d.world.h;
  cellGrid.resize(world.w, world.h); plantGrid.resize(world.w, world.h); meatGrid.resize(world.w, world.h);
  simTime = d.t; nextId = d.nextId;
  if (d.scenario) currentScenario = getScenario(d.scenario).id;
  Object.assign(stats, d.stats);

  const byId = new Map();
  for (const a of d.cells) {
    const c = createCell(a[1], a[2], a[5], null, a[0]);
    c.vx = a[3]; c.vy = a[4]; c.hp = a[6]; c.hardHp = a[7]; c.energy = a[8]; c.age = a[9]; c.gen = a[10];
    c.parent = a[11]; c.kills = a[12]; c.meatEaten = a[13]; c.plantEaten = a[14];
    c.children = Array.isArray(a[16]) ? a[16] : []; c.combatTimer = a[17];
    c.px = c.x; c.py = c.y; c.pxAt = simTime;
    cells.push(c); byId.set(c.id, c);
  }
  d.cells.forEach(a => { if (a[15]) byId.get(a[0]).teammate = byId.get(a[15]) || null; });
  for (const a of d.plants) plants.push({ x: a[0], y: a[1], radius: a[2], energy: a[3], alive: true });
  for (const a of d.meats) meats.push({ x: a[0], y: a[1], vx: a[2], vy: a[3], radius: a[4], energy: a[5], life: a[6], maxLife: a[7], r: a[8], gb: a[9], alive: true });
  for (const a of d.walls) walls.push({ x1: a[0], y1: a[1], x2: a[2], y2: a[3], r: a[4] });
  for (const a of d.sources) sources.push({ id: a[0], x: a[1], y: a[2], r: a[3], spawned: a[4], spawnTimer: Math.random(), alive: true });
  for (const r of d.lineage) lineage.set(r[0], { id: r[0], parent: r[1], children: r[2], cell: byId.get(r[0]) || null, gen: r[3] });
  genAcc.length = 0;
  for (const a of d.genAcc) genAcc.push(a ? { n: a[0], sum: a[1] } : undefined);
  for (const k in hist) hist[k] = Array.isArray(d.hist[k]) ? d.hist[k] : [];
  histInterval = d.histInterval || 1; lastSample = d.lastSample || 0;
  if (d.cam) { cam.x = d.cam.x; cam.y = d.cam.y; cam.zoom = d.cam.zoom; }
  particles.length = 0;
  obstDirty = true; rebuildObstacles();
  computePacks();
  saveSettings();
}

// ---------- слоты в localStorage ----------
const slotKey = i => 'cells4.claude.slot.' + i;
const slotMetaKey = i => 'cells4.claude.slotmeta.' + i;

function slotMeta(i) {
  try { return JSON.parse(localStorage.getItem(slotMetaKey(i))); } catch (e) { return null; }
}

function saveSlot(i) {
  const d = serializeWorld();
  const json = JSON.stringify(d);
  try {
    localStorage.setItem(slotKey(i), json);
    localStorage.setItem(slotMetaKey(i), JSON.stringify({ at: d.savedAt, t: d.t, cells: d.cells.length, plants: d.plants.length, kb: Math.round(json.length / 1024) }));
    return null;
  } catch (e) { return 'Не влезло в хранилище браузера (' + Math.round(json.length / 1024) + ' КБ) — скачайте файл'; }
}

function loadSlot(i) {
  let raw;
  try { raw = localStorage.getItem(slotKey(i)); } catch (e) { return 'Хранилище браузера недоступно'; }
  if (!raw) return 'Слот пуст';
  try { loadWorld(JSON.parse(raw)); return null; } catch (e) { return 'Ошибка загрузки: ' + e.message; }
}

function deleteSlot(i) {
  try { localStorage.removeItem(slotKey(i)); localStorage.removeItem(slotMetaKey(i)); } catch (e) { /* ignore */ }
}

// ---------- файлы ----------
function downloadSave() {
  const blob = new Blob([JSON.stringify(serializeWorld())], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'cells4-save-' + new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-') + '.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

async function loadSaveFile(file) {
  try { loadWorld(JSON.parse(await file.text())); return null; } catch (e) { return 'Ошибка загрузки: ' + e.message; }
}
