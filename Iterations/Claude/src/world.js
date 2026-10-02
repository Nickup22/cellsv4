// ==================== WORLD STATE ====================
'use strict';

const world = { w: 2000, h: 1500 };

let cells = [];
let plants = [];
let meats = [];      // ошмётки убитых клеток
let particles = [];
let walls = [];      // палки: { x1, y1, x2, y2, r }
let sources = [];    // точки спавна растений
let simTime = 0;
let nextId = 1;
let paused = false;
let timeScale = 1;

// Всё, что считает статистика и показывает итоговый экран
const stats = {
  kills: 0, births: 0, starve: 0, erased: 0, spawned: 0,
  maxAge: 0, maxAgeId: 0, maxKills: 0, maxKillsId: 0, maxKids: 0, maxKidsId: 0, maxGen: 0,
};

// ==================== SPATIAL GRID ====================
// Равномерная сетка корзин. Используется для клеток, растений и мяса,
// чтобы ИИ не перебирал весь мир, а смотрел только в окрестности.
class Grid {
  constructor(cs) { this.cs = cs; this.gw = 1; this.gh = 1; this.b = [[]]; this.used = []; }
  resize(w, h) {
    this.gw = Math.ceil(w / this.cs) + 1;
    this.gh = Math.ceil(h / this.cs) + 1;
    this.b = new Array(this.gw * this.gh);
    for (let i = 0; i < this.b.length; i++) this.b[i] = [];
    this.used.length = 0;
  }
  clear() {
    for (let k = 0; k < this.used.length; k++) this.b[this.used[k]].length = 0;
    this.used.length = 0;
  }
  add(o) {
    let gx = (o.x / this.cs) | 0, gy = (o.y / this.cs) | 0;
    if (gx < 0) gx = 0; else if (gx >= this.gw) gx = this.gw - 1;
    if (gy < 0) gy = 0; else if (gy >= this.gh) gy = this.gh - 1;
    const i = gy * this.gw + gx;
    const arr = this.b[i];
    if (arr.length === 0) this.used.push(i);
    arr.push(o);
  }
  // Все объекты из корзин, пересекающих квадрат со стороной 2r (грубо, без точной проверки расстояния)
  collect(x, y, r, out) {
    out.length = 0;
    const cs = this.cs;
    const x0 = Math.max(0, ((x - r) / cs) | 0), x1 = Math.min(this.gw - 1, ((x + r) / cs) | 0);
    const y0 = Math.max(0, ((y - r) / cs) | 0), y1 = Math.min(this.gh - 1, ((y + r) / cs) | 0);
    for (let gy = y0; gy <= y1; gy++) {
      const row = gy * this.gw;
      for (let gx = x0; gx <= x1; gx++) {
        const arr = this.b[row + gx];
        for (let k = 0; k < arr.length; k++) out.push(arr[k]);
      }
    }
    return out;
  }
  // Ближайший живой объект в радиусе r, удовлетворяющий pred
  nearest(x, y, r, pred) {
    const cs = this.cs;
    const x0 = Math.max(0, ((x - r) / cs) | 0), x1 = Math.min(this.gw - 1, ((x + r) / cs) | 0);
    const y0 = Math.max(0, ((y - r) / cs) | 0), y1 = Math.min(this.gh - 1, ((y + r) / cs) | 0);
    let best = null, bestD = r * r;
    for (let gy = y0; gy <= y1; gy++) {
      const row = gy * this.gw;
      for (let gx = x0; gx <= x1; gx++) {
        const arr = this.b[row + gx];
        for (let k = 0; k < arr.length; k++) {
          const o = arr[k];
          if (!o.alive) continue;
          const dx = o.x - x, dy = o.y - y, d2 = dx * dx + dy * dy;
          if (d2 < bestD && (!pred || pred(o))) { bestD = d2; best = o; }
        }
      }
    }
    return best;
  }
}

const cellGrid = new Grid(100);
const plantGrid = new Grid(100);
const meatGrid = new Grid(100);

function rebuildGrids() {
  cellGrid.clear(); plantGrid.clear(); meatGrid.clear();
  for (const c of cells) if (c.alive) cellGrid.add(c);
  for (const p of plants) if (p.alive) plantGrid.add(p);
  for (const m of meats) if (m.alive) meatGrid.add(m);
}

// ==================== LINEAGE ====================
// Родословная: id → { id, parent, children[], cell, gen }. Хранится и для умерших,
// чтобы подсвечивать живых предков/потомков через мёртвых промежуточных.
const lineage = new Map();
const LINEAGE_CAP = 40000;

function pruneLineage() {
  if (lineage.size <= LINEAGE_CAP) return;
  for (const [id, rec] of lineage) {
    if (!rec.cell) lineage.delete(id);
    if (lineage.size <= LINEAGE_CAP * 0.8) break;
  }
}

// Средние гены по поколениям (при рождении) — для графиков эволюции
const genAcc = [];
function recordGeneration(gen, genome) {
  let a = genAcc[gen];
  if (!a) a = genAcc[gen] = { n: 0, sum: [0, 0, 0, 0, 0, 0] };
  a.n++;
  for (let i = 0; i < 6; i++) a.sum[i] += genome[i];
  if (gen > stats.maxGen) stats.maxGen = gen;
}

// ==================== CELL ====================
// fixedId/restore — при загрузке сейва: сохраняем прежний id и не трогаем родословную (она восстанавливается отдельно)
function createCell(x, y, genome, parent, fixedId) {
  const g = (genome || randomGenome()).slice();
  const strength = g[0], armor = g[1], regen = g[2];
  const mass = 1 + armor / 255 * 1.8;
  const maxHp = 90 + armor * 0.6;
  const maxEnergy = 140 + strength * 0.4;
  const gen = parent ? parent.gen + 1 : 0;

  const c = {
    id: fixedId || nextId++,
    x, y, vx: 0, vy: 0,
    radius: S.cellSize,
    genome: g,
    color: bodyColor(g), nucColor: nucleusColor(g),
    // тело
    strength, armor, regen,
    // ядро
    courage: g[3], sociability: g[4], greed: g[5],
    // физиология
    mass, maxHp, hp: maxHp, hardHp: 0,
    maxEnergy, energy: maxEnergy * 0.7,
    speed: (300 - armor * 0.5) / mass,
    attackDamage: 6 + strength / 255 * 40,
    attackCooldown: 0.25 + strength / 255 * 1.4,
    knockback: 60 + strength * 0.15,
    regenRate: regen / 255 * 38,
    baseUpkeep: 1.2 + regen / 255 * 1.5 + (regen > 150 ? 0.5 : 0),
    // состояние
    alive: true, age: 0, gen,
    parent: parent ? parent.id : null,
    children: [],
    kills: 0,
    attackTimer: 0,
    combatTimer: 99,        // секунд с последнего боя
    lastAttacker: null, lastAttackedAt: -99,
    lastHitAt: -99,
    meatEaten: 0, plantEaten: 0,
    // ИИ
    task: 'idle', taskTarget: null, teammate: null,
    thinkTimer: Math.random() * 0.15,
    huntSince: 0, huntCooldownUntil: 0, retreatUntil: 0,
    route: [],              // [x0,y0,x1,y1,...] — путь к цели, последняя пара — сама цель
    near: [],               // соседи в зоне видимости (обновляется в think)
    nobst: [],              // препятствия поблизости (обновляется в think)
    wanderAngle: Math.random() * Math.PI * 2, wanderTimer: 0,
    dancePhase: Math.random() * 6.28,
    fleeX: x, fleeY: y,
    pressX: 0, pressY: 0, press: false,
    kiting: false,
    ignore: null,           // Map цель → до какого времени игнорируем
    escapeUntil: 0, escapeAngle: 0, stuck: false, wantsMove: false,
    px: x, py: y, pxAt: 0,  // для детектора застревания
    hx: 0, hy: 0,           // сглаженный курс
    memX: 0, memY: 0, memAt: -999,   // где в последний раз ела
    exX: x, exY: y, exUntil: 0,      // точка исследования
    routeFailed: false,
    pack: 0, leader: false, packRoot: 0,   // стая: размер, вожак ли, id вожака
    // визуал
    heartTimer: Math.random() * 3, pulse: 0,
  };

  if (fixedId) return c;
  recordGeneration(gen, g);
  const rec = { id: c.id, parent: c.parent, children: [], cell: c, gen };
  lineage.set(c.id, rec);
  if (parent) {
    const pr = lineage.get(parent.id);
    if (pr) pr.children.push(c.id);
    parent.children.push(c.id);
  }
  return c;
}

function refreshCellRadius() { for (const c of cells) c.radius = S.cellSize; }

// ==================== PLANTS / MEAT / SOURCES ====================
function createPlant(x, y, fat) {
  return {
    x, y, radius: 3.5 + Math.random() * 2.5, alive: true,
    energy: S.plantEnergy * (0.5 + Math.random() * 0.5) * (fat || 1),
  };
}

function createSource(x, y) {
  return { id: nextId++, x, y, r: 18, spawnTimer: Math.random(), alive: true, spawned: 0 };
}

// Ошмётки: чем больше у клетки было энергии, тем их больше и тем они жирнее
function spawnMeatDrops(c) {
  const ratio = clamp(c.energy / c.maxEnergy, 0, 1);
  const count = Math.floor(2 + ratio * 15);
  const total = Math.max(0, c.energy) * S.meatYield;
  if (total < 1) return;
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const spd = 30 + Math.random() * 110;
    const life = 90 + ratio * 120 + Math.random() * 40;
    meats.push({
      x: c.x + Math.cos(a) * (c.radius * 0.6), y: c.y + Math.sin(a) * (c.radius * 0.6),
      vx: Math.cos(a) * spd, vy: Math.sin(a) * spd,
      radius: 2.5 + ratio * 3 + Math.random() * 1.5,
      energy: Math.max(3, (total / count) * (0.5 + Math.random())),
      life, maxLife: life, alive: true,
      r: 170 + Math.floor(c.genome[0] * 0.33), gb: 25 + Math.floor(c.genome[2] * 0.2),
    });
  }
  if (meats.length > 2500) meats.splice(0, meats.length - 2500);
}

// ==================== PARTICLES ====================
function spawnParticles(x, y, count, color, life, speed, size) {
  count = Math.round(count * S.particles);
  if (count <= 0) return;
  const cap = 1500 * S.particles + 200;
  if (particles.length > cap) return;
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const spd = speed * (0.3 + Math.random() * 0.7);
    particles.push({
      x, y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd,
      life: life * (0.5 + Math.random() * 0.5), maxLife: life,
      color, size: size || (1 + Math.random() * 2),
    });
  }
}

function resetWorldState() {
  cells = []; plants = []; meats = []; particles = []; walls = []; sources = [];
  lineage.clear(); genAcc.length = 0;
  simTime = 0; nextId = 1;
  for (const k in stats) stats[k] = 0;
  world.w = S.worldW; world.h = S.worldH;
  cellGrid.resize(world.w, world.h); plantGrid.resize(world.w, world.h); meatGrid.resize(world.w, world.h);
  obst.length = 0; buildObstGrid(); obstDirty = true;
}
