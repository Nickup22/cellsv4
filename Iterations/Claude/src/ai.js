// ==================== AI ====================
// think() — редкое принятие решений (≈7 раз в секунду на клетку): выбирает задачу и цель.
// move()  — каждый тик: едет к цели по маршруту, держит дистанцию, скользит вдоль препятствий.
// Правила простые и нечёткие, а стаи, вожаки и тактики возникают сами.
'use strict';

const _tmp = [];
const _dir = { x: 0, y: 0 };

function thinkInterval() { return 0.12 + Math.random() * 0.08; }

// ---------- «чёрный список» целей: недостижимое или бесполезное временно игнорируем ----------
function ignored(c, o) {
  const m = c.ignore;
  if (!m) return false;
  const t = m.get(o);
  if (t === undefined) return false;
  if (t < simTime) { m.delete(o); return false; }
  return true;
}
function ignoreTarget(c, o, secs) {
  const m = c.ignore || (c.ignore = new Map());
  if (m.size > 24) for (const [k, t] of m) if (t < simTime || !k.alive) m.delete(k);
  m.set(o, simTime + secs);
}

function retaliationTarget(c) {
  const a = c.lastAttacker;
  return a && a.alive && simTime - c.lastAttackedAt < 2.5 ? a : null;
}

// ---------- оценка схватки ----------
// Клетка знает свои статы и видит чужой цвет: прикидывает, кто кого убьёт быстрее (с бронёй, критами и регеном в бою)
function dps(a, b) {
  const def = b.armor / 255, pen = a.strength / 255;
  const crit = S.critChance * (1 + pen * 0.6) * (1 - def * 0.7);
  return a.attackDamage * S.dmgMult * (1 - def * 0.55) * (1 + crit * 1.2) / a.attackCooldown;
}
function fightRegen(c) { return c.regenRate * (0.15 + 0.25 * c.regen / 255); }
// > 1 — я, скорее всего, побеждаю; < 1 — проигрываю
function fightOdds(c, o) {
  const iKillIn = o.hp / Math.max(0.5, dps(c, o) - fightRegen(o));
  const heKillsIn = c.hp / Math.max(0.5, dps(o, c) - fightRegen(c));
  return heKillsIn / iKillIn;
}

// Оценка добычи: чем меньше, тем привлекательнее
function preyScore(c, o, d) {
  let s = d * (1 + o.armor / 255 * 0.8);
  if (o.hp < o.maxHp * 0.5) s *= 0.6;
  s *= 1 + Math.max(0, o.strength - c.strength) / 150;
  return s;
}

function pickPrey(c, desperate) {
  let best = null, bestS = Infinity;
  for (const o of c.near) {
    if (o === c.teammate || ignored(c, o)) continue;
    // не лезет в заведомо проигрышный бой; смелые рискуют больше
    if (!desperate && fightOdds(c, o) < lerp(1.4, 0.6, c.courage / 255)) continue;
    // свои (почти идентичный геном) — не добыча, если только не умираешь с голоду
    if (!desperate && genomeSimilarity(c.genome, o.genome) > 0.9) continue;
    const d = Math.hypot(o.x - c.x, o.y - c.y);
    const s = preyScore(c, o, d);
    if (s < bestS) { bestS = s; best = o; }
  }
  return best;
}

function startHunt(c, target) {
  if (c.task !== 'hunt' || c.taskTarget !== target) c.huntSince = simTime;
  c.task = 'hunt'; c.taskTarget = target;
}

function huntStillValid(c, sight) {
  const t = c.taskTarget;
  if (!t || !t.alive || t === c.teammate || ignored(c, t)) return false;
  const d = Math.hypot(t.x - c.x, t.y - c.y);
  if (d > sight * 1.5) return false;
  // охотник, который давно не попадает, бросает погоню
  if (simTime - Math.max(c.huntSince, c.lastHitAt) > 10) { c.huntCooldownUntil = simTime + 6; return false; }
  // умирающий от голода не гонится за далёкой целью
  if (c.energy < c.maxEnergy * 0.08 && d > 80) return false;
  return true;
}

function findFood(c, sight, meatPref, plantPenalty) {
  const free = o => !ignored(c, o) && !insideObstacle(o.x, o.y, c.radius + 1);
  const p = plantGrid.nearest(c.x, c.y, sight, free);
  const m = meatGrid.nearest(c.x, c.y, sight, free);
  if (!p && !m) return null;
  const pd = p ? Math.hypot(p.x - c.x, p.y - c.y) * (meatPref ? 1.5 : 1) * plantPenalty : Infinity;
  const md = m ? Math.hypot(m.x - c.x, m.y - c.y) * (meatPref ? 0.6 : 1.1) : Infinity;
  return md < pd ? m : p;
}

function tryTeamUp(c, ef) {
  if (c.teammate || ef < 0.4) return;
  const want = (c.sociability / 255) * S.sociality;
  if (c.sociability < 90 || Math.random() > want * 0.2) return;
  for (const o of c.near) {
    if (o.taskTarget === c || o.energy < o.maxEnergy * 0.4 || ignored(c, o)) continue;
    if (o.teammate === c) continue;                    // уже ведёт за мной — зеркалить не надо
    const sim = genomeSimilarity(c.genome, o.genome);
    if (sim < 0.45) continue;
    if ((c.sociability / 255) * (o.sociability / 255) * sim * S.sociality < 0.12) continue;
    c.teammate = o;
    return;
  }
}

// ---------- застревание ----------
// Направление от ближайшей стены/границы (куда выбираться, когда зажало)
function awayAngle(c) {
  let ax = 0, ay = 0;
  for (const o of c.nobst) {
    const sx = o.x2 - o.x1, sy = o.y2 - o.y1, l2 = sx * sx + sy * sy;
    let u = l2 > 0 ? ((c.x - o.x1) * sx + (c.y - o.y1) * sy) / l2 : 0;
    u = u < 0 ? 0 : u > 1 ? 1 : u;
    const nx = c.x - (o.x1 + sx * u), ny = c.y - (o.y1 + sy * u), d = Math.hypot(nx, ny) || 1;
    ax += nx / d / (d + 10); ay += ny / d / (d + 10);
  }
  if (c.x < 80) ax += 1; if (c.x > world.w - 80) ax -= 1;
  if (c.y < 80) ay += 1; if (c.y > world.h - 80) ay -= 1;
  if (!ax && !ay) return Math.random() * Math.PI * 2;
  return Math.atan2(ay, ax) + (Math.random() - 0.5) * 1.2;
}

function onStuck(c) {
  const t = c.taskTarget;
  if (t && (c.task === 'hunt' || c.task === 'forage' || c.task === 'forage_meat' || c.task === 'teamup')) {
    ignoreTarget(c, t, 10);                       // цель, к которой не пробиться, — в чёрный список
    if (c.task === 'teamup') c.teammate = null;
    if (c.task === 'hunt') c.huntCooldownUntil = simTime + 4;
  }
  c.escapeUntil = simTime + 1.4;
  c.escapeAngle = awayAngle(c);
}

// ---------- исследование: идём к памяти о еде, к источнику или просто вперёд ----------
function pickExplorePoint(c, sight) {
  let x, y;
  const mem = simTime - c.memAt < 90 && Math.hypot(c.memX - c.x, c.memY - c.y) > 90 && Math.random() < 0.6;
  if (mem) { x = c.memX + rand(-70, 70); y = c.memY + rand(-70, 70); }
  else {
    let best = null, bd = sight * 3;
    for (const s of sources) {
      if (!s.alive) continue;
      const d = Math.hypot(s.x - c.x, s.y - c.y);
      if (d < bd && d > s.r + 80) { bd = d; best = s; }
    }
    if (best && Math.random() < 0.7) {
      const a = Math.random() * Math.PI * 2, r = best.r + 20 + Math.random() * S.sourceRadius * 0.8;
      x = best.x + Math.cos(a) * r; y = best.y + Math.sin(a) * r;
    } else {
      const a = c.wanderAngle + rand(-1.1, 1.1), L = rand(250, 600);
      x = c.x + Math.cos(a) * L; y = c.y + Math.sin(a) * L;
    }
  }
  const pos = findFreePos(clamp(x, 40, world.w - 40), clamp(y, 40, world.h - 40), c.radius + 4);
  c.exX = pos.x; c.exY = pos.y; c.exUntil = simTime + rand(6, 12);
  c.wanderAngle = Math.atan2(c.exY - c.y, c.exX - c.x);
}

function planHunt(c) {
  const t = c.taskTarget;
  // Синие давят противника к стене/опасности: заходят с противоположной от неё стороны
  c.press = false;
  if (c.armor > 140) {
    const p = nearestPushDir(t, 260);
    if (p) { c.press = true; c.pressX = p.nx; c.pressY = p.ny; }
  }
  const touch = c.radius + t.radius + 4;
  const tx = c.press ? t.x - c.pressX * touch : t.x, ty = c.press ? t.y - c.pressY * touch : t.y;
  planRoute(c, tx, ty);
}

// Если обхода не нашлось, цель, скорее всего, за стеной: бросаем её, а не бьёмся об препятствие
function routeGaveUp(c) {
  if (!c.routeFailed || !c.taskTarget) return false;
  ignoreTarget(c, c.taskTarget, 8);
  if (c.task === 'teamup') c.teammate = null;
  c.task = 'idle'; c.taskTarget = null; c.route.length = 0;
  return true;
}

function think(c) {
  const sight = S.sight;
  // охота закончена (жертва мертва) — короткая передышка, чтобы не вырезать всех подряд
  if (c.task === 'hunt' && c.taskTarget && !c.taskTarget.alive) {
    c.huntCooldownUntil = simTime + 3 + Math.random() * 4;
    c.task = 'idle'; c.taskTarget = null;
  }
  refreshNearObstacles(c);

  cellGrid.collect(c.x, c.y, sight, _tmp);
  const near = c.near; near.length = 0;
  let threat = null, threatD = Infinity;
  for (let i = 0; i < _tmp.length; i++) {
    const o = _tmp[i];
    if (o === c || !o.alive) continue;
    const d = Math.hypot(o.x - c.x, o.y - c.y);
    if (d >= sight) continue;
    near.push(o);
    if (o.task === 'hunt' && o.taskTarget === c && d < threatD) { threat = o; threatD = d; }
  }
  if (!threat) threat = retaliationTarget(c);

  // проверка прогресса раз в секунду: хотел ехать, а стоит на месте — значит, зажат
  c.stuck = false;
  if (simTime - c.pxAt >= 1) {
    c.stuck = c.wantsMove && Math.hypot(c.x - c.px, c.y - c.py) < 8;
    c.px = c.x; c.py = c.y; c.pxAt = simTime;
    if (c.stuck) onStuck(c);
  }

  const ef = c.energy / c.maxEnergy, hf = c.hp / c.maxHp;
  const greedy = c.greed / 255;
  const hungryThr = 0.3 + greedy * 0.45;               // прожорливые идут есть раньше
  const isHungry = ef < hungryThr;
  const veryHungry = ef < 0.22;
  // Смелые отступают при бóльших потерях HP; регенераторов потери пугают меньше
  let retreatThr = lerp(0.5, 0.1, c.courage / 255) * (1 - 0.35 * c.regen / 255);
  // проигрывает схватку — отходит раньше (смелость частично глушит это)
  if (threat) {
    const odds = fightOdds(c, threat);
    if (odds < 1) retreatThr = Math.min(0.85, retreatThr + (1 - odds) * 0.45 * (1 - c.courage / 255 * 0.6));
  }

  // ── Связи с товарищем ──
  if (c.teammate && (!c.teammate.alive || dist(c, c.teammate) > sight * 1.6 || (veryHungry && Math.random() < 0.08)))
    c.teammate = null;

  // ── 1. Отступление ──
  if (threat && (hf < retreatThr || (c.task === 'retreat' && hf < retreatThr + 0.15 && simTime < c.retreatUntil))) {
    if (c.task !== 'retreat') c.retreatUntil = simTime + 2.5;
    let fx = c.x - threat.x, fy = c.y - threat.y;
    const fl = Math.hypot(fx, fy) || 1; fx /= fl; fy /= fl;
    for (const o of near) {
      const d = Math.hypot(c.x - o.x, c.y - o.y);
      if (d < 140 && d > 0 && o !== threat) { fx += (c.x - o.x) / d * (1 - d / 140) * 0.5; fy += (c.y - o.y) / d * (1 - d / 140) * 0.5; }
    }
    const l = Math.hypot(fx, fy) || 1;
    c.fleeX = clamp(c.x + fx / l * 240, 40, world.w - 40);
    c.fleeY = clamp(c.y + fy / l * 240, 40, world.h - 40);
    // загнан в угол (некуда бежать или зажат) — отчаянно дерётся
    if (c.stuck || Math.hypot(c.fleeX - c.x, c.fleeY - c.y) < 70) {
      startHunt(c, threat); planHunt(c); return;
    }
    c.task = 'retreat'; c.taskTarget = threat;
    planRoute(c, c.fleeX, c.fleeY);
    if (c.routeFailed) { startHunt(c, threat); planHunt(c); }
    return;
  }

  // ── 2. Ответить обидчику (даже если он «друг») ──
  const rt = retaliationTarget(c);
  if (rt && c.taskTarget !== rt && Math.hypot(rt.x - c.x, rt.y - c.y) < sight && !ignored(c, rt)) {
    if (rt === c.teammate) c.teammate = null;
    startHunt(c, rt);
  }

  // ── 2б. Выбираемся из тупика ──
  if (simTime < c.escapeUntil && !rt) {
    c.task = 'explore'; c.taskTarget = null;
    c.exX = clamp(c.x + Math.cos(c.escapeAngle) * 160, 30, world.w - 30);
    c.exY = clamp(c.y + Math.sin(c.escapeAngle) * 160, 30, world.h - 30);
    c.exUntil = c.escapeUntil;
    c.route.length = 0; c.route.push(c.exX, c.exY);
    return;
  }

  // ── 3. Продолжать начатую охоту (цель не меняется, пока её не убили или не перебили приоритеты) ──
  if (c.task === 'hunt' && huntStillValid(c, sight)) {
    planHunt(c);
    if (!routeGaveUp(c)) return;
  }

  // ── 4. Помочь товарищу: бить ту же цель / того, кто бьёт его ──
  const tm = c.teammate;
  if (tm && tm.alive) {
    const assist = tm.task === 'hunt' && tm.taskTarget && tm.taskTarget.alive && tm.taskTarget !== c
      ? tm.taskTarget : retaliationTarget(tm);
    if (assist && assist !== c && assist !== tm && !ignored(c, assist) && Math.random() < (c.sociability / 255) * S.sociality * 0.6 &&
        simTime >= c.huntCooldownUntil && Math.hypot(assist.x - c.x, assist.y - c.y) < sight) {
      startHunt(c, assist); planHunt(c);
      if (!routeGaveUp(c)) return;
    }
  }

  // ── 5. Выйти на охоту ──
  // Смелость тянет в бой, стайность гасит беспричинную агрессию, голод злит
  const aggr = (c.courage / 255) * (1 - 0.55 * c.sociability / 255) * S.aggression;
  if (near.length && simTime >= c.huntCooldownUntil &&
      Math.random() < Math.pow(aggr * (isHungry ? 1.5 : 0.5), 1.5) * 0.14) {
    const prey = pickPrey(c, false);
    if (prey) { startHunt(c, prey); planHunt(c); if (!routeGaveUp(c)) return; }
  }

  // ── 6. Еда ──
  if (isHungry) {
    const meatPref = c.courage > 110 || c.regen > 150;
    let plantPenalty = 1;
    if (S.plantNerf && c.regen > 120) {
      const tot = c.meatEaten + c.plantEaten + 0.01;
      plantPenalty = 1 + (c.plantEaten / tot) * 1.5;   // регенераторы сами тянутся к мясу
    }
    let food = c.taskTarget && c.taskTarget.alive && (c.task === 'forage' || c.task === 'forage_meat') && !ignored(c, c.taskTarget) ? c.taskTarget : null;
    if (food && Math.hypot(food.x - c.x, food.y - c.y) > sight * 2.2) food = null;   // помним цель, пока обходим препятствие
    if (!food) food = findFood(c, sight, meatPref, plantPenalty);
    if (food) {
      c.task = food.life !== undefined ? 'forage_meat' : 'forage';
      c.taskTarget = food;
      planRoute(c, food.x, food.y);
      if (!routeGaveUp(c)) return;
    }
    // еды не видно: голодный отчаянно нападает на кого угодно, иначе ищет еду
    if (veryHungry && near.length && c.courage > 40 && simTime >= c.huntCooldownUntil) {
      const prey = pickPrey(c, true);
      if (prey) { startHunt(c, prey); planHunt(c); if (!routeGaveUp(c)) return; }
    }
    if (c.task !== 'explore' || simTime > c.exUntil || Math.hypot(c.exX - c.x, c.exY - c.y) < 40 || c.routeFailed) {
      c.task = 'explore'; c.taskTarget = null;
      pickExplorePoint(c, sight);
    }
    planRoute(c, c.exX, c.exY);
    if (c.routeFailed) c.exUntil = 0;
    return;
  }

  // ── 7. Держаться товарища / завести товарища ──
  tryTeamUp(c, ef);
  if (c.teammate) {
    c.task = 'teamup'; c.taskTarget = c.teammate;
    planRoute(c, c.teammate.x, c.teammate.y);
    if (!routeGaveUp(c)) return;
  }

  // ── Ничего срочного: танцуем ──
  c.task = 'idle'; c.taskTarget = null; c.route.length = 0;
}

// ==================== MOVEMENT ====================
function liveGoal(c, g) {
  // g — выходной объект {x, y, speed, hold}
  g.hold = false; g.speed = 1;
  switch (c.task) {
    case 'hunt': {
      const t = c.taskTarget;
      if (!t || !t.alive) return false;
      const dx = t.x - c.x, dy = t.y - c.y, d = Math.hypot(dx, dy) || 1;
      const touch = c.radius + t.radius + 4;
      c.kiting = false;
      // Сильные (красные) бьют и отъезжают на КД, а не стоят в противнике
      if (c.strength > 110 && c.attackTimer > 0.2 && d < touch * 3) {
        c.kiting = true;
        g.x = c.x - dx / d * 100; g.y = c.y - dy / d * 100; g.speed = 0.85;
        return true;
      }
      if (c.press) { g.x = t.x - c.pressX * touch; g.y = t.y - c.pressY * touch; }
      else { g.x = t.x; g.y = t.y; }
      if (d < touch * 0.9) g.hold = true;     // уже вплотную — не проскакиваем сквозь
      return true;
    }
    case 'forage': case 'forage_meat': {
      const t = c.taskTarget;
      if (!t || !t.alive) return false;
      g.x = t.x; g.y = t.y; g.speed = 0.8; return true;
    }
    case 'retreat': g.x = c.fleeX; g.y = c.fleeY; return true;
    case 'teamup': {
      const t = c.taskTarget;
      if (!t || !t.alive) return false;
      const d = Math.hypot(t.x - c.x, t.y - c.y);
      g.x = t.x; g.y = t.y; g.speed = d > 160 ? 1 : 0.7;
      if (d < 55) g.hold = true;
      return true;
    }
    case 'explore':
      g.x = c.exX; g.y = c.exY; g.speed = 0.8;
      if (Math.hypot(c.exX - c.x, c.exY - c.y) < 25) g.hold = true;
      return true;
    default: return false;
  }
}

const _goal = { x: 0, y: 0, speed: 1, hold: false };

function move(c, dt) {
  let dirX = 0, dirY = 0, moving = false, speedMul = 1, accelMul = 4;
  c.wantsMove = false;

  if (c.task === 'idle') {
    // Танец: ритмичное «туда-сюда», ядро пульсирует (см. рендер)
    c.dancePhase += dt * 5;
    c.wanderTimer -= dt;
    if (c.wanderTimer <= 0) { c.wanderAngle += (Math.random() - 0.5) * 2.2; c.wanderTimer = 1.5 + Math.random() * 2.5; }
    const s = Math.sin(c.dancePhase);
    dirX = Math.cos(c.wanderAngle) * s; dirY = Math.sin(c.wanderAngle) * s;
    moving = true; speedMul = 0.35; accelMul = 3;
  } else if (liveGoal(c, _goal)) {
    let gx = _goal.x, gy = _goal.y;
    const r = c.route;
    if (r.length > 2 && !c.kiting) {             // есть промежуточные точки объезда
      if (Math.hypot(r[0] - c.x, r[1] - c.y) < 16) r.splice(0, 2);
      if (r.length > 2) { gx = r[0]; gy = r[1]; }
    }
    const dx = gx - c.x, dy = gy - c.y, d = Math.hypot(dx, dy) || 1;
    dirX = dx / d; dirY = dy / d;
    speedMul = _goal.speed;
    moving = !_goal.hold;
    // «хочет ехать» (для детектора застревания): не стоит вплотную к своей цели и не держит дистанцию
    c.wantsMove = moving && !c.kiting;
    if (c.task === 'teamup' && !moving) c.dancePhase += dt * 5;
  }

  if (moving || c.task === 'hunt') {
    // Трусливые объезжают живность дальше
    const cow = 1 - c.courage / 255;
    if (cow > 0.2 && c.near.length) {
      const R0 = c.radius * 2 + cow * 60;
      let n = 0;
      for (const o of c.near) {
        if (o === c.taskTarget || o === c.teammate || !o.alive) continue;
        const ox = c.x - o.x, oy = c.y - o.y, od = Math.hypot(ox, oy);
        if (od < R0 && od > 0.1) { const k = (1 - od / R0) * cow * 1.8; dirX += ox / od * k; dirY += oy / od * k; }
        if (++n > 12) break;
      }
    }
    const dl0 = Math.hypot(dirX, dirY);
    if (dl0 > 1) { dirX /= dl0; dirY /= dl0; }
    // скольжение вдоль стен: никакого дрожания и кружения у препятствий
    _dir.x = dirX; _dir.y = dirY;
    steerAround(c, _dir);
    dirX = _dir.x; dirY = _dir.y;
    const dl = Math.hypot(dirX, dirY);
    if (dl > 1) { dirX /= dl; dirY /= dl; }
  }

  // курс меняется плавно — резкие повороты и были причиной «трясучки»
  const k = 1 - Math.exp(-dt * 9);
  c.hx += (dirX - c.hx) * k; c.hy += (dirY - c.hy) * k;

  const sp = c.speed * S.speedMult;
  if (moving) {
    c.vx += c.hx * sp * accelMul * dt;
    c.vy += c.hy * sp * accelMul * dt;
  }
  const v = Math.hypot(c.vx, c.vy), vmax = sp * speedMul;
  if (v > vmax) { c.vx *= vmax / v; c.vy *= vmax / v; }
  const fr = Math.pow(0.93, dt * 60);
  c.vx *= fr; c.vy *= fr;
  c.x += c.vx * dt; c.y += c.vy * dt;

  // стенки мира: просто не пускают
  const R = c.radius;
  if (c.x < R) { c.x = R; c.vx = Math.abs(c.vx) * 0.4; }
  if (c.x > world.w - R) { c.x = world.w - R; c.vx = -Math.abs(c.vx) * 0.4; }
  if (c.y < R) { c.y = R; c.vy = Math.abs(c.vy) * 0.4; }
  if (c.y > world.h - R) { c.y = world.h - R; c.vy = -Math.abs(c.vy) * 0.4; }

  // жёсткое выталкивание из палок и источников
  const nob = c.nobst;
  for (let i = 0; i < nob.length; i++) {
    const o = nob[i], lim = R + o.r;
    if (c.x < Math.min(o.x1, o.x2) - lim || c.x > Math.max(o.x1, o.x2) + lim ||
        c.y < Math.min(o.y1, o.y2) - lim || c.y > Math.max(o.y1, o.y2) + lim) continue;
    const sx = o.x2 - o.x1, sy = o.y2 - o.y1, l2 = sx * sx + sy * sy;
    let u = l2 > 0 ? ((c.x - o.x1) * sx + (c.y - o.y1) * sy) / l2 : 0;
    u = u < 0 ? 0 : u > 1 ? 1 : u;
    const nx = c.x - (o.x1 + sx * u), ny = c.y - (o.y1 + sy * u), d = Math.hypot(nx, ny);
    if (d < lim) {
      let ux, uy;
      if (d > 0.001) { ux = nx / d; uy = ny / d; } else { ux = 1; uy = 0; }
      c.x = o.x1 + sx * u + ux * lim; c.y = o.y1 + sy * u + uy * lim;
      const dot = c.vx * ux + c.vy * uy;
      if (dot < 0) { c.vx -= dot * ux * 1.05; c.vy -= dot * uy * 1.05; }   // гасим скорость «в стену», не отскакивая
    }
  }
}
