// ==================== SIMULATION ====================
// Бой, энергия, размножение, спавн и главный шаг симуляции. Шаг фиксированный (1/30 с),
// ускорение времени = больше шагов за кадр, поэтому механики не ломаются на любой скорости.
'use strict';

const FIXED_DT = 1 / 30;

// ---------- хуки для модов ----------
const hooks = { tick: [], birth: [], death: [], hit: [], spawn: [] };
function emit(name, a, b, c, d) {
  const list = hooks[name];
  for (let i = 0; i < list.length; i++) {
    try { list[i](a, b, c, d); } catch (e) { console.error('[mod]', name, e); }
  }
}

// ---------- смерть ----------
function killCell(c, cause, killer) {
  if (!c.alive) return;
  c.alive = false;
  if (cause === 'kill') {
    stats.kills++;
    if (killer) {
      killer.kills++;
      if (killer.kills > stats.maxKills) { stats.maxKills = killer.kills; stats.maxKillsId = killer.id; }
    }
  } else if (cause === 'starve') stats.starve++;
  else stats.erased++;
  if (c.age > stats.maxAge) { stats.maxAge = c.age; stats.maxAgeId = c.id; }
  const rec = lineage.get(c.id);
  if (rec) rec.cell = null;
  spawnParticles(c.x, c.y, 20, c.color, 1.6, 95, 2.4);
  spawnParticles(c.x, c.y, 8, '#fff', 0.45, 55);
  if (cause !== 'erase') spawnMeatDrops(c);
  emit('death', c, cause, killer);
}

// ---------- бой ----------
function combat(c, dt) {
  c.attackTimer -= dt;
  c.combatTimer += dt;
  if (c.task !== 'hunt') return;
  const t = c.taskTarget;
  if (!t || !t.alive) return;
  const dx = t.x - c.x, dy = t.y - c.y, d = Math.hypot(dx, dy);
  // Удар возможен только при касании и когда готов; кулдаун, а не зарядка — первый удар мгновенный
  if (d < c.radius + t.radius + 6 && c.attackTimer <= 0) attack(c, t, dx, dy, d);
}

function attack(c, t, dx, dy, d) {
  c.attackTimer = c.attackCooldown;
  c.combatTimer = 0; t.combatTimer = 0;
  c.lastHitAt = simTime;

  const pen = c.strength / 255, def = t.armor / 255;
  let dmg = c.attackDamage * S.dmgMult * (1 - def * 0.5);
  let crit = Math.random() < S.critChance * (1 + pen) * (1 - def * 0.7);
  if (def > 0.9 && pen < 0.3) { crit = false; dmg *= 0.3; }   // FULL BLOCK

  let knock = 1;
  if (crit) {
    dmg *= 2.5; knock = 2;
    if (S.hardDmg) t.hardHp = Math.min(t.maxHp * S.hardMax, t.hardHp + dmg * 0.28);
    spawnParticles(t.x, t.y, 14, '#ff2222', 0.7, 75, 2.6);
  } else {
    // добивание уже изувеченного усугубляет хард-зону
    if (S.hardDmg && t.hp < t.maxHp * 0.3 && pen > 0.3) t.hardHp = Math.min(t.maxHp * S.hardMax, t.hardHp + dmg * 0.08);
    spawnParticles(t.x, t.y, 5, '#ffaa44', 0.3, 34);
  }
  t.hp -= dmg;
  const cap = t.maxHp - t.hardHp;
  if (t.hp > cap) t.hp = cap;

  const kb = (c.knockback * knock * S.knockMult) / t.mass / (d || 1);
  t.vx += dx * kb; t.vy += dy * kb;

  t.lastAttacker = c; t.lastAttackedAt = simTime;
  if (t.teammate === c) t.teammate = null;
  if (c.teammate === t) c.teammate = null;
  emit('hit', c, t, dmg, crit);
  if (t.hp <= 0) killCell(t, 'kill', c);
}

// ---------- энергия и здоровье ----------
function economy(c, dt) {
  // пассивный расход, чуть больше при движении и в бою
  const sp = Math.hypot(c.vx, c.vy);
  let upkeep = (c.baseUpkeep + 0.5 * sp / (c.speed * S.speedMult + 1)) * S.hungerMult;
  if (c.combatTimer < 2) upkeep *= 1.3;
  c.energy -= upkeep * dt;

  // Реген: в бою сильно подавлен, но не выключен; после боя разгоняется тем быстрее, чем зеленее клетка
  const delay = 0.5 + 4.5 * (1 - c.regen / 255);
  const rf = c.combatTimer < 2 ? 0.15 : Math.min(1, 0.15 + 0.85 * (c.combatTimer - 2) / delay);
  let plantMult = 1;
  if (S.plantNerf && c.regen > 100) {
    const pr = c.plantEaten / (c.meatEaten + c.plantEaten + 0.01);
    if (pr > 0.5) plantMult = Math.max(0.12, 1 - (pr - 0.5) * 2 * (c.regen / 255) * 1.4);
  }
  const cap = c.maxHp - c.hardHp;
  if (c.hp > cap) c.hp = cap;
  if (c.hp < cap && c.regenRate > 0) {
    const rate = c.regenRate * rf * plantMult, cost = rate * 0.9 * dt;
    if (c.energy > cost) { c.hp = Math.min(cap, c.hp + rate * dt); c.energy -= cost; }
  }
  // Хард-урон лечится очень медленно, в разы дороже и только в покое
  if (c.hardHp > 0 && c.combatTimer > delay + 2) {
    const rate = c.regenRate * 0.08, cost = rate * dt * 0.9 * S.hardHealCost;
    if (rate > 0 && c.energy > cost * 3) {
      c.hardHp -= Math.min(rate * dt, c.hardHp);
      c.energy -= cost;
    }
  }

  // Подбор еды: любая клетка ест то, чего касается
  if (c.energy < c.maxEnergy * 0.97) {
    const m = meatGrid.nearest(c.x, c.y, c.radius + 8);
    if (m && Math.hypot(m.x - c.x, m.y - c.y) < c.radius + m.radius + 2) {
      c.energy = Math.min(c.maxEnergy, c.energy + m.energy);
      c.meatEaten += m.energy; m.alive = false;
      spawnParticles(m.x, m.y, 4, '#ff6644', 0.4, 20);
    }
    const p = plantGrid.nearest(c.x, c.y, c.radius + 8);
    if (p && Math.hypot(p.x - c.x, p.y - c.y) < c.radius + p.radius + 2) {
      c.energy = Math.min(c.maxEnergy, c.energy + p.energy);
      c.plantEaten += p.energy; p.alive = false;
      spawnParticles(p.x, p.y, 3, '#44ff44', 0.3, 15);
    }
  }

  // Энергия кончилась — начинает съедаться HP
  if (c.energy <= 0) {
    c.energy = 0;
    c.hp -= S.starveDmg * dt;
    if (c.hp <= 0) killCell(c, 'starve');
  }
  c.age += dt;
}

// ---------- размножение ----------
function maybeReproduce(c, dt) {
  if (cells.length >= S.maxCells) return;
  const ef = c.energy / c.maxEnergy, hf = c.hp / c.maxHp;
  // прожорливые хотят больше энергии про запас, прежде чем размножаться
  if (ef < 0.62 + c.greed / 255 * 0.3 || hf < 0.5 || c.hardHp > c.maxHp * 0.3) return;
  if (Math.random() < (0.12 + (1 - c.greed / 255) * 0.18) * S.reproChance * dt) reproduce(c);
}

function reproduce(c) {
  const condition = (c.hp / c.maxHp + c.energy / c.maxEnergy) / 2;
  c.energy -= c.maxEnergy * 0.6;
  // Чувствует себя хорошо — мутация слабая; плохо — сильнее: время рискнуть
  const mut = Math.max(0, Math.floor(((1 - condition) * 35 + 3) * S.mutationMult));
  const genome = c.genome.map(b => clamp(b + Math.floor((Math.random() - 0.5) * 2 * mut), 0, 255));
  const a = Math.random() * Math.PI * 2;
  const pos = findFreePos(c.x + Math.cos(a) * c.radius * 3, c.y + Math.sin(a) * c.radius * 3, c.radius + 2);
  const kid = createCell(pos.x, pos.y, genome, c);
  kid.energy = kid.maxEnergy * 0.3;
  cells.push(kid);
  stats.births++;
  if (c.children.length > stats.maxKids) { stats.maxKids = c.children.length; stats.maxKidsId = c.id; }
  spawnParticles(kid.x, kid.y, 10, '#fff', 0.9, 38);
  emit('birth', kid, c);
}

// ---------- спавн ----------
function genomeForSpawn() {
  const base = S.spawnGenome;
  if (S.spawnMode === 'exact') return base.slice();
  if (S.spawnSpread >= 255) return randomGenome();
  return base.map(b => clamp(Math.round(b + (Math.random() * 2 - 1) * S.spawnSpread), 0, 255));
}

function spawnCell(x, y, genome) {
  const pos = findFreePos(x, y, S.cellSize + 2);
  const c = createCell(pos.x, pos.y, genome || genomeForSpawn());
  cells.push(c);
  stats.spawned++;
  spawnParticles(c.x, c.y, 6, '#fff', 0.6, 30);
  emit('spawn', c);
  return c;
}

function spawnCellsAt(x, y) {
  const n = S.spawnCount;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, r = n === 1 ? 0 : Math.sqrt(Math.random()) * S.spawnRadius;
    spawnCell(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
}

let plantAcc = 0;
function spawnPlants(dt) {
  if (plants.length >= S.plantMax) return;
  plantAcc += S.plantRate * dt;
  while (plantAcc >= 1) {
    plantAcc -= 1;
    const pos = findFreePos(20 + Math.random() * (world.w - 40), 20 + Math.random() * (world.h - 40), 5);
    if (pos.ok) plants.push(createPlant(pos.x, pos.y));
  }
}

function spawnFromSources(dt) {
  if (plants.length >= S.plantMax * 1.3) return;
  for (const s of sources) {
    if (!s.alive) continue;
    s.spawnTimer += dt * S.sourceRate;
    while (s.spawnTimer >= 1) {
      s.spawnTimer -= 1;
      const a = Math.random() * Math.PI * 2, r = s.r + 4 + Math.sqrt(Math.random()) * S.sourceRadius;
      const pos = findFreePos(s.x + Math.cos(a) * r, s.y + Math.sin(a) * r, 4);
      if (pos.ok) { plants.push(createPlant(pos.x, pos.y, S.sourceFat)); s.spawned++; }
    }
  }
}

function spawnInitial() {
  resetWorldState();
  const cx = world.w / 2, cy = world.h / 2;
  for (let i = 0; i < S.initCells; i++) {
    const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * S.initRadius;
    spawnCell(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  stats.spawned = 0;
  for (let i = 0; i < S.initPlants; i++) {
    const pos = findFreePos(20 + Math.random() * (world.w - 40), 20 + Math.random() * (world.h - 40), 5);
    if (pos.ok) plants.push(createPlant(pos.x, pos.y));
  }
  for (let i = 0; i < S.initSources; i++) {
    const pos = findFreePos(40 + Math.random() * (world.w - 80), 40 + Math.random() * (world.h - 80), 30);
    if (pos.ok) sources.push(createSource(pos.x, pos.y));
  }
  obstDirty = true;
  particles.length = 0;
  sampleStats(true);
}

// ==================== STEP ====================
function step(dt) {
  simTime += dt;
  if (obstDirty) rebuildObstacles();
  rebuildGrids();
  spawnPlants(dt);
  spawnFromSources(dt);

  const n = cells.length;
  for (let i = 0; i < n; i++) {
    const c = cells[i];
    if (!c.alive) continue;
    c.thinkTimer -= dt;
    if (c.thinkTimer <= 0) {
      c.thinkTimer = thinkInterval();
      think(c);
      maybeReproduce(c, 0.16);
      if (!c.alive) continue;
    }
    move(c, dt);
    combat(c, dt);
    if (!c.alive) continue;
    economy(c, dt);
    if (c.pulse > 0) c.pulse = Math.max(0, c.pulse - dt * 3);
    if (S.heartbeat && c.alive) {
      c.heartTimer -= dt;
      if (c.heartTimer <= 0) {
        c.heartTimer = 1.5 + Math.random() * 2.5; c.pulse = 1;
        if (Math.random() < 0.3) spawnParticles(c.x, c.y, 1, 'rgba(255,255,255,0.3)', 0.6, 14, 1.5);
      }
    }
  }

  // частицы
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx * dt; p.y += p.vy * dt;
    const f = Math.pow(0.96, dt * 60); p.vx *= f; p.vy *= f;
    p.life -= dt;
    if (p.life <= 0) { particles[i] = particles[particles.length - 1]; particles.pop(); }
  }
  // ошмётки: разлетаются, тормозят и лежат минутами
  for (const m of meats) {
    if (!m.alive) continue;
    m.x += m.vx * dt; m.y += m.vy * dt;
    const f = Math.pow(0.94, dt * 60); m.vx *= f; m.vy *= f;
    m.x = clamp(m.x, m.radius, world.w - m.radius); m.y = clamp(m.y, m.radius, world.h - m.radius);
    m.life -= dt;
    if (m.life <= 0) m.alive = false;
  }

  compact();
  sampleStats(false);
  emit('tick', dt);
}

function compactList(list) {
  let j = 0;
  for (let i = 0; i < list.length; i++) if (list[i].alive) list[j++] = list[i];
  list.length = j;
}
function compact() {
  compactList(cells); compactList(plants); compactList(meats); compactList(sources);
  if (obstDirty === false && sources.length !== _lastSrc) obstDirty = true;
  _lastSrc = sources.length;
  pruneLineage();
}
let _lastSrc = 0;

// Накопитель времени: ускорение/замедление/пауза не влияют на сами механики
let acc = 0;
function advance(frameDt) {
  if (paused) { acc = 0; return; }
  acc += Math.min(frameDt, 0.25) * timeScale;
  const maxSteps = 24;
  let n = 0;
  while (acc >= FIXED_DT && n < maxSteps) { step(FIXED_DT); acc -= FIXED_DT; n++; }
  if (acc >= FIXED_DT) acc = 0;
}
function stepOnce() { step(FIXED_DT); }
