// ==================== SCENARIOS (стартовые карты) ====================
// Каждая карта задаёт размер мира и экологию (поверх настроек игрока), стены, источники
// и стартовые группы клеток определённых архетипов. Новая карта = новый объект в SCENARIOS.
'use strict';

let currentScenario = 'random';

// Ключи, которые карта может переопределить; перед стартом карты они сбрасываются к умолчаниям,
// чтобы карта не наследовала условия предыдущей. «Случайный мир» их не трогает.
const SCENARIO_KEYS = ['worldW', 'worldH', 'plantRate', 'plantEnergy', 'plantMax', 'sourceRate', 'sourceRadius', 'sourceFat'];

// Геном архетипа из атласа: тело по уровням ±15, ядро — заданное или «родное» для архетипа (±20)
function archGenome(name, nuc) {
  const i = ARCH_NAMES.indexOf(name);
  if (i < 0) throw new Error('Нет архетипа ' + name);
  const jit = (v, a) => clamp(Math.round(v + (Math.random() - 0.5) * 2 * a), 0, 255);
  const n = nuc || archNucleus(i);
  const pick = v => (v == null ? Math.floor(Math.random() * 256) : jit(v, 20));
  return [jit(LV[Math.floor(i / 9)], 15), jit(LV[Math.floor(i / 3) % 3], 15), jit(LV[i % 3], 15), pick(n.c), pick(n.s), pick(n.g)];
}

function scGroup(name, n, x, y, spread, nuc) {
  for (let k = 0; k < n; k++) {
    const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * spread;
    spawnCell(x + Math.cos(a) * r, y + Math.sin(a) * r, archGenome(name, nuc));
  }
}
function scWall(x1, y1, x2, y2) { walls.push({ x1, y1, x2, y2, r: 6 }); obstDirty = true; }
function scSource(x, y) {
  rebuildObstacles();
  const p = findFreePos(x, y, 30);
  if (p.ok) sources.push(createSource(p.x, p.y));
}
function scPlants(n) {
  rebuildObstacles();
  for (let i = 0; i < n; i++) {
    const pos = findFreePos(20 + Math.random() * (world.w - 40), 20 + Math.random() * (world.h - 40), 5);
    if (pos.ok) plants.push(createPlant(pos.x, pos.y));
  }
}
function scRandomCells(n, x, y, r) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * r;
    spawnCell(x + Math.cos(a) * d, y + Math.sin(a) * d, genomeForSpawn());
  }
}
// Кольцо стен с проходами (оазис)
function scRing(cx, cy, R, gaps) {
  const seg = 12;
  for (let i = 0; i < seg; i++) {
    if (gaps.includes(i)) continue;
    const a1 = i / seg * Math.PI * 2, a2 = (i + 1) / seg * Math.PI * 2;
    scWall(cx + Math.cos(a1) * R, cy + Math.sin(a1) * R, cx + Math.cos(a2) * R, cy + Math.sin(a2) * R);
  }
}

const HERBIVORE = { c: 40, s: 220, g: 80 };    // трусливые, стайные, плодовитые
const PREDATOR = { c: 230, s: 40, g: 100 };    // смелые одиночки
const CLAN = { c: 150, s: 230, g: 120 };       // боевые стайные

const SCENARIOS = [
  {
    id: 'random', name: 'Случайный мир',
    desc: 'Классика: случайные клетки в центре, растения по всей карте и источники. Использует твои настройки спавна.',
    build() {
      scRandomCells(S.initCells, world.w / 2, world.h / 2, S.initRadius);
      scPlants(S.initPlants);
      for (let i = 0; i < S.initSources; i++) scSource(40 + Math.random() * (world.w - 80), 40 + Math.random() * (world.h - 80));
    },
  },
  {
    id: 'arena', name: 'Арена 27 архетипов', set: { worldW: 2700, worldH: 1800 },
    desc: 'Все 27 архетипов атласа по 6 клеток, каждый в своём углу сетки 9×3. Кто переживёт остальных?',
    build() {
      for (let i = 0; i < 27; i++) {
        const gx = i % 9, gy = Math.floor(i / 9);
        scGroup(ARCH_NAMES[i], 6, 150 + gx * 300, 300 + gy * 600, 50);
      }
      for (let i = 0; i < 8; i++) scSource(200 + (i % 4) * 760, 600 + Math.floor(i / 4) * 600);
      scPlants(350);
    },
  },
  {
    id: 'kingdoms', name: 'Три царства', set: { worldW: 2400, worldH: 1800 },
    desc: 'Красное, зелёное и синее царства в своих углах со своими источниками. Между ними — стены с проходами.',
    build() {
      const W = world.w, H = world.h, cx = W / 2, cy = H * 0.52;
      // три перегородки от центра с проходом посередине
      for (const a of [-Math.PI / 2, Math.PI / 6, Math.PI * 5 / 6]) {
        const ex = cx + Math.cos(a) * 1100, ey = cy + Math.sin(a) * 1100;
        scWall(cx + Math.cos(a) * 120, cy + Math.sin(a) * 120, cx + Math.cos(a) * 420, cy + Math.sin(a) * 420);
        scWall(cx + Math.cos(a) * 560, cy + Math.sin(a) * 560, clamp(ex, 0, W), clamp(ey, 0, H));
      }
      scGroup('Шершень', 8, W * 0.2, H * 0.3, 90); scGroup('Хищник', 8, W * 0.2, H * 0.3, 90); scGroup('Кусака', 6, W * 0.2, H * 0.3, 90);
      scGroup('Пожиратель', 8, W * 0.8, H * 0.3, 90); scGroup('Вампир', 6, W * 0.8, H * 0.3, 90);
      scGroup('Мицелий', 6, W * 0.8, H * 0.3, 90); scGroup('Слизень', 4, W * 0.8, H * 0.3, 90);
      scGroup('Танк', 6, W * 0.5, H * 0.85, 90); scGroup('Страж', 8, W * 0.5, H * 0.85, 90);
      scGroup('Бастион', 6, W * 0.5, H * 0.85, 90); scGroup('Чешуйка', 4, W * 0.5, H * 0.85, 90);
      scSource(W * 0.1, H * 0.15); scSource(W * 0.3, H * 0.45);
      scSource(W * 0.9, H * 0.15); scSource(W * 0.7, H * 0.45);
      scSource(W * 0.35, H * 0.9); scSource(W * 0.65, H * 0.9);
      scPlants(300);
    },
  },
  {
    id: 'herd', name: 'Стадо и хищники', set: { worldW: 2200, worldH: 1600, plantRate: 6 },
    desc: 'Большое трусливое стадо травоядных (стайные, слабые) и горстка смелых хищников-одиночек. Много травы.',
    build() {
      const W = world.w, H = world.h;
      scGroup('Слизень', 20, W * 0.5, H * 0.5, 260, HERBIVORE);
      scGroup('Стойкий', 15, W * 0.5, H * 0.5, 260, HERBIVORE);
      scGroup('Чешуйка', 15, W * 0.5, H * 0.5, 260, HERBIVORE);
      scGroup('Хищник', 4, W * 0.12, H * 0.15, 60, PREDATOR);
      scGroup('Шершень', 3, W * 0.88, H * 0.85, 60, PREDATOR);
      for (let i = 0; i < 4; i++) scSource(W * (0.25 + 0.5 * (i % 2)), H * (0.25 + 0.5 * Math.floor(i / 2)));
      scPlants(500);
    },
  },
  {
    id: 'oases', name: 'Оазисы', set: { worldW: 2400, worldH: 1800, plantRate: 0.4, sourceRate: 2, sourceRadius: 90 },
    desc: 'Пустыня: трава почти не растёт. Еда — только в пяти оазисах за кольцевыми стенами с узкими проходами.',
    build() {
      const W = world.w, H = world.h;
      const pts = [[0.2, 0.25], [0.8, 0.25], [0.5, 0.5], [0.2, 0.78], [0.8, 0.78]];
      for (const [px, py] of pts) {
        const gap = Math.floor(Math.random() * 12);
        scRing(W * px, H * py, 190, [gap, (gap + 6) % 12]);
        scSource(W * px, H * py);
      }
      scRandomCells(60, W / 2, H / 2, 700);
      scPlants(120);
    },
  },
  {
    id: 'maze', name: 'Лабиринт', set: { worldW: 2000, worldH: 1500 },
    desc: 'Сетка комнат 250×250 со случайными проходами. Проверка навигации: еда за стенами, путь не прямой.',
    build() {
      const W = world.w, H = world.h, C = 250;
      for (let x = C; x < W; x += C) for (let y = 0; y < H; y += C) {
        if (Math.random() < 0.35) continue;
        const gap = 60 + Math.random() * 60;
        scWall(x, y, x, y + (C - gap) / 2); scWall(x, y + (C + gap) / 2, x, Math.min(H, y + C));
      }
      for (let y = C; y < H; y += C) for (let x = 0; x < W; x += C) {
        if (Math.random() < 0.35) continue;
        const gap = 60 + Math.random() * 60;
        scWall(x, y, x + (C - gap) / 2, y); scWall(x + (C + gap) / 2, y, Math.min(W, x + C), y);
      }
      for (let i = 0; i < 6; i++) scSource(C / 2 + Math.floor(Math.random() * (W / C)) * C, C / 2 + Math.floor(Math.random() * (H / C)) * C);
      scRandomCells(50, W / 2, H / 2, 600);
      scPlants(250);
    },
  },
  {
    id: 'famine', name: 'Голодные времена', set: { plantRate: 3.5, plantEnergy: 24 },
    desc: 'Мало травы, она тощая, источников нет. Много клеток — выживут те, кто умеет экономить или охотиться.',
    build() {
      scRandomCells(80, world.w / 2, world.h / 2, 600);
      scPlants(150);
    },
  },
  {
    id: 'redgreen', name: 'Красные против зелёных', set: { worldW: 2400, worldH: 1300 },
    desc: 'Две половины мира, стена с двумя проходами. Слева сила (Шершень, Хищник, Кусака), справа реген (Пожиратель, Вампир, Мицелий).',
    build() {
      const W = world.w, H = world.h;
      scWall(W / 2, 0, W / 2, H * 0.25); scWall(W / 2, H * 0.38, W / 2, H * 0.62); scWall(W / 2, H * 0.75, W / 2, H);
      scGroup('Шершень', 9, W * 0.22, H * 0.5, 160); scGroup('Хищник', 9, W * 0.22, H * 0.5, 160); scGroup('Кусака', 7, W * 0.22, H * 0.5, 160);
      scGroup('Пожиратель', 9, W * 0.78, H * 0.5, 160); scGroup('Вампир', 9, W * 0.78, H * 0.5, 160); scGroup('Мицелий', 7, W * 0.78, H * 0.5, 160);
      for (const px of [0.15, 0.85]) { scSource(W * px, H * 0.25); scSource(W * px, H * 0.75); scSource(W * (px < 0.5 ? 0.35 : 0.65), H * 0.5); }
      scPlants(250);
    },
  },
  {
    id: 'packs', name: 'Войны стай', set: { worldW: 2400, worldH: 1800 },
    desc: 'Пять кланов-клонов со стайным ядром (Охотник, Солдат, Страж, Вампир, Хранитель) вокруг богатого центра.',
    build() {
      const W = world.w, H = world.h, names = ['Охотник', 'Солдат', 'Страж', 'Вампир', 'Хранитель'];
      names.forEach((n, i) => {
        const a = i / names.length * Math.PI * 2 - Math.PI / 2;
        scGroup(n, 10, W / 2 + Math.cos(a) * 650, H / 2 + Math.sin(a) * 650, 70, CLAN);
        scSource(W / 2 + Math.cos(a) * 820, H / 2 + Math.sin(a) * 820);
      });
      scSource(W / 2 - 80, H / 2); scSource(W / 2 + 80, H / 2);
      scPlants(300);
    },
  },
];

function getScenario(id) { return SCENARIOS.find(s => s.id === id) || SCENARIOS[0]; }

function startScenario(id) {
  const sc = getScenario(id);
  currentScenario = sc.id;
  if (sc.set) {
    for (const k of SCENARIO_KEYS) { const d = SETTING_DEFS.find(x => x.key === k); if (d) S[k] = d.def; }
    Object.assign(S, sc.set);
  }
  resetWorldState();
  sc.build();
  stats.spawned = 0;
  obstDirty = true;
  particles.length = 0;
  computePacks();
  sampleStats(true);
}
