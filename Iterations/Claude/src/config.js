// ==================== CONFIG ====================
// Клетки 4 — итерация Claude. Все настройки живут в объекте S и описаны таблицей SETTING_DEFS:
// UI-панель настроек строится из неё автоматически, так что новая настройка = одна строка.
'use strict';

const VERSION = 'Claude-1';

const GENE_NAMES = ['Сила', 'Броня', 'Реген', 'Смелость', 'Стайность', 'Прожорливость'];

// Архетипы из cells.jsx: индекс = сила*9 + броня*3 + реген, уровни 30 / 155 / 235
const LV = [30, 155, 235];
const ARCH_NAMES = [
  'Личинка', 'Слизень', 'Пожиратель', 'Чешуйка', 'Стойкий', 'Мицелий', 'Танк', 'Бастион', 'Монолит',
  'Кусака', 'Охотник', 'Вампир', 'Воин', 'Солдат', 'Паразит', 'Страж', 'Хранитель', 'Феникс',
  'Шершень', 'Хищник', 'Чума', 'Берсерк', 'Командир', 'Вирус', 'Колосс', 'Левиафан', 'Абсолют',
];

// «Родное» ядро архетипа — характер, подходящий телу:
//  красные смелые одиночки, синие — стайные защитники, зелёные — прожорливые и не боятся ран;
//  слабые и беззащитные (Личинка, Слизень) — трусливы, держатся стаей и плодятся быстро (низкая прожорливость).
const ARCH_NUCLEUS = {
  'Личинка': [30, 220, 110], 'Слизень': [45, 200, 80], 'Пожиратель': [130, 120, 170],
  'Чешуйка': [50, 210, 70], 'Стойкий': [70, 200, 90], 'Мицелий': [90, 190, 140],
  'Танк': [110, 230, 70], 'Бастион': [120, 220, 100], 'Монолит': [140, 200, 150],
  'Кусака': [140, 150, 110], 'Охотник': [180, 110, 150], 'Вампир': [200, 80, 200],
  'Воин': [170, 170, 110], 'Солдат': [150, 210, 130], 'Паразит': [170, 140, 150],
  'Страж': [160, 230, 100], 'Хранитель': [140, 235, 140], 'Феникс': [190, 180, 150],
  'Шершень': [235, 40, 110], 'Хищник': [225, 60, 160], 'Чума': [235, 50, 170],
  'Берсерк': [245, 70, 130], 'Командир': [210, 200, 140], 'Вирус': [225, 90, 160],
  'Колосс': [220, 120, 120], 'Левиафан': [230, 130, 160], 'Абсолют': [240, 150, 160],
};
function archNucleus(i) { const n = ARCH_NUCLEUS[ARCH_NAMES[i]]; return { c: n[0], s: n[1], g: n[2] }; }

const SETTING_DEFS = [
  // group, key, label, type, min, max, step, def, restart(↻ — применится при перезапуске мира)
  { g: 'Спавн', key: 'initCells', label: 'Клеток в начале', type: 'number', min: 0, max: 3000, step: 1, def: 40, restart: true },
  { g: 'Спавн', key: 'initRadius', label: 'Радиус начального спавна', type: 'range', min: 20, max: 1500, step: 10, def: 260, restart: true },
  { g: 'Спавн', key: 'spawnMode', label: 'Тип спавна', type: 'select', def: 'random',
    options: [['random', 'Случайные (в радиусе рандомизации)'], ['exact', 'Точный геном']] },
  { g: 'Спавн', key: 'spawnSpread', label: 'Радиус рандомизации генов', type: 'range', min: 0, max: 255, step: 1, def: 255 },
  { g: 'Спавн', key: 'spawnCount', label: 'Клеток за клик', type: 'range', min: 1, max: 60, step: 1, def: 1 },
  { g: 'Спавн', key: 'spawnRadius', label: 'Радиус спавна кликом', type: 'range', min: 0, max: 400, step: 5, def: 40 },

  { g: 'Растения', key: 'initPlants', label: 'Растений в начале', type: 'number', min: 0, max: 5000, step: 1, def: 150, restart: true },
  { g: 'Растения', key: 'plantRate', label: 'Рейт спавна (шт/с)', type: 'range', min: 0, max: 30, step: 0.5, def: 3 },
  { g: 'Растения', key: 'plantEnergy', label: 'Жирность растений', type: 'range', min: 5, max: 150, step: 1, def: 28 },
  { g: 'Растения', key: 'plantMax', label: 'Лимит растений', type: 'range', min: 100, max: 6000, step: 50, def: 1800 },

  { g: 'Источники', key: 'initSources', label: 'Источников в начале', type: 'number', min: 0, max: 100, step: 1, def: 5, restart: true },
  { g: 'Источники', key: 'sourceRate', label: 'Рейт источника (шт/с)', type: 'range', min: 0, max: 10, step: 0.1, def: 1.2 },
  { g: 'Источники', key: 'sourceRadius', label: 'Радиус спавна растений', type: 'range', min: 10, max: 300, step: 5, def: 70 },
  { g: 'Источники', key: 'sourceFat', label: 'Жирность от источника ×', type: 'range', min: 0.2, max: 4, step: 0.1, def: 1 },

  { g: 'Бой', key: 'dmgMult', label: 'Множитель урона', type: 'range', min: 0.1, max: 5, step: 0.1, def: 1 },
  { g: 'Бой', key: 'critChance', label: 'Базовый шанс крита', type: 'range', min: 0, max: 1, step: 0.01, def: 0.15 },
  { g: 'Бой', key: 'knockMult', label: 'Откидывание ×', type: 'range', min: 0, max: 4, step: 0.1, def: 1 },
  { g: 'Бой', key: 'hardDmg', label: 'Хард-урон включён', type: 'bool', def: true },
  { g: 'Бой', key: 'hardMax', label: 'Макс. хард-зона (доля HP)', type: 'range', min: 0.1, max: 0.95, step: 0.05, def: 0.65 },
  { g: 'Бой', key: 'hardHealCost', label: 'Цена лечения хард-урона ×', type: 'range', min: 1, max: 40, step: 1, def: 10 },

  { g: 'Энергия и эволюция', key: 'hungerMult', label: 'Уровень голода ×', type: 'range', min: 0, max: 4, step: 0.1, def: 1 },
  { g: 'Энергия и эволюция', key: 'starveDmg', label: 'Урон от голода (HP/с)', type: 'range', min: 0, max: 60, step: 1, def: 18 },
  { g: 'Энергия и эволюция', key: 'reproChance', label: 'Шанс размножения ×', type: 'range', min: 0, max: 5, step: 0.1, def: 1 },
  { g: 'Энергия и эволюция', key: 'mutationMult', label: 'Сила мутаций ×', type: 'range', min: 0, max: 4, step: 0.1, def: 1 },
  { g: 'Энергия и эволюция', key: 'meatYield', label: 'Выход мяса ×', type: 'range', min: 0, max: 3, step: 0.1, def: 1 },
  { g: 'Энергия и эволюция', key: 'maxCells', label: 'Лимит клеток', type: 'range', min: 50, max: 4000, step: 50, def: 1500 },
  { g: 'Энергия и эволюция', key: 'autoRespawn', label: 'Возрождать, если все вымерли', type: 'bool', def: false },
  { g: 'Энергия и эволюция', key: 'plantNerf', label: 'Трава глушит реген', type: 'bool', def: true },

  { g: 'ИИ и физика', key: 'sight', label: 'Дальность зрения', type: 'range', min: 100, max: 900, step: 10, def: 350 },
  { g: 'ИИ и физика', key: 'aggression', label: 'Агрессивность ×', type: 'range', min: 0, max: 3, step: 0.1, def: 1 },
  { g: 'ИИ и физика', key: 'sociality', label: 'Общительность ×', type: 'range', min: 0, max: 3, step: 0.1, def: 1 },
  { g: 'ИИ и физика', key: 'speedMult', label: 'Скорость клеток ×', type: 'range', min: 0.3, max: 3, step: 0.1, def: 1 },

  { g: 'Мир', key: 'worldW', label: 'Ширина мира', type: 'number', min: 500, max: 10000, step: 100, def: 2000, restart: true },
  { g: 'Мир', key: 'worldH', label: 'Высота мира', type: 'number', min: 500, max: 10000, step: 100, def: 1500, restart: true },
  { g: 'Мир', key: 'cellSize', label: 'Размер клетки', type: 'range', min: 5, max: 30, step: 1, def: 12 },

  { g: 'Графика', key: 'particles', label: 'Активность частиц', type: 'range', min: 0, max: 3, step: 0.25, def: 1 },
  { g: 'Графика', key: 'heartbeat', label: 'Сердцебиение клеток', type: 'bool', def: true },
  { g: 'Графика', key: 'hpBars', label: 'Полоски HP', type: 'bool', def: true },
  { g: 'Графика', key: 'combatLines', label: 'Линии целей и товарищей', type: 'bool', def: true },
  { g: 'Графика', key: 'worldGrid', label: 'Сетка мира', type: 'bool', def: true },
];

const S = {};
for (const d of SETTING_DEFS) S[d.key] = d.def;
S.spawnGenome = [128, 128, 128, 128, 128, 128];

const SETTINGS_KEY = 'cells4.claude.settings.v1';

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    for (const d of SETTING_DEFS) {
      if (!(d.key in saved)) continue;
      const v = saved[d.key];
      if (d.type === 'bool') S[d.key] = !!v;
      else if (d.type === 'select') { if (d.options.some(o => o[0] === v)) S[d.key] = v; }
      else if (typeof v === 'number' && isFinite(v)) S[d.key] = clamp(v, d.min, d.max);
    }
    if (Array.isArray(saved.spawnGenome) && saved.spawnGenome.length === 6)
      S.spawnGenome = saved.spawnGenome.map(b => clamp(Math.round(+b) || 0, 0, 255));
  } catch (e) { /* localStorage может быть недоступен — не страшно */ }
}

function saveSettings() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(S)); } catch (e) { /* ignore */ }
}

function resetSettings() {
  for (const d of SETTING_DEFS) S[d.key] = d.def;
  S.spawnGenome = [128, 128, 128, 128, 128, 128];
  try { localStorage.removeItem(SETTINGS_KEY); } catch (e) { /* ignore */ }
}

// ==================== HELPERS ====================
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function lerp(a, b, t) { return a + (b - a) * t; }
function rand(a, b) { return a + Math.random() * (b - a); }
function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

// Цвет тела: красный = сила, синий = броня, зелёный = реген  →  rgb(сила, реген, броня)
function bodyColor(g) { return `rgb(${g[0]},${g[2]},${g[1]})`; }
// Цвет ядра: красный = смелость, синий = стайность, зелёный = прожорливость
function nucleusColor(g) { return `rgb(${g[3]},${g[5]},${g[4]})`; }

function genomeSimilarity(a, b) {
  let diff = 0;
  for (let i = 0; i < 6; i++) diff += Math.abs(a[i] - b[i]);
  return 1 - diff / (255 * 6);
}

function randomGenome() { return Array.from({ length: 6 }, () => Math.floor(Math.random() * 256)); }
