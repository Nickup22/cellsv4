// ==================== AI ====================
// think() — редкое принятие решений (≈7 раз в секунду на клетку): выбирает задачу и цель.
// move()  — каждый тик: едет к цели по маршруту, держит дистанцию, обходит препятствия.
// Правила простые и нечёткие, а стаи, вожаки и тактики возникают сами.
'use strict';

const _tmp = [];
const _av = { x: 0, y: 0 };

function thinkInterval() { return 0.12 + Math.random() * 0.08; }

function retaliationTarget(c) {
  const a = c.lastAttacker;
  return a && a.alive && simTime - c.lastAttackedAt < 2.5 ? a : null;
}

// Оценка добычи: чем меньше, тем привлекательнее
function preyScore(c, o, d) {
  let s = d * (1 + o.armor / 255 * 0.8);
  if (o.hp < o.maxHp * 0.5) s *= 0.6;
  s *= 1 + Math.max(0, o.strength - c.strength) / 150;
  return s;
}

function pickPrey(c) {
  let best = null, bestS = Infinity;
  for (const o of c.near) {
    if (o === c.teammate) continue;
    // осторожные не лезут на заведомо более сильных
    if (o.strength - c.strength > 90 + c.courage * 0.6) continue;
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
  if (!t || !t.alive || t === c.teammate) return false;
  const d = Math.hypot(t.x - c.x, t.y - c.y);
  if (d > sight * 1.5) return false;
  // охотник, который давно не попадает, бросает погоню
  if (simTime - Math.max(c.huntSince, c.lastHitAt) > 10) { c.huntCooldownUntil = simTime + 6; return false; }
  // умирающий от голода не гонится за далёкой целью
  if (c.energy < c.maxEnergy * 0.08 && d > 80) return false;
  return true;
}

function findFood(c, sight, meatPref, plantPenalty) {
  const free = o => !insideObstacle(o.x, o.y, c.radius + 1);
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
    if (o.taskTarget === c || o.energy < o.maxEnergy * 0.4) continue;
    const sim = genomeSimilarity(c.genome, o.genome);
    if (sim < 0.45) continue;
    if ((c.sociability / 255) * (o.sociability / 255) * sim * S.sociality < 0.12) continue;
    c.teammate = o;
    return;
  }
}

function think(c) {
  const sight = S.sight;
  // охота закончена (жертва мертва) — короткая передышка, чтобы не вырезать всех подряд
  if (c.task === 'hunt' && c.taskTarget && !c.taskTarget.alive) {
    c.huntCooldownUntil = simTime + 3 + Math.random() * 4;
    c.task = 'idle'; c.taskTarget = null;
  }
  cellGrid.collect(c.x, c.y, sight, _tmp);
  refreshNearObstacles(c);
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

  const ef = c.energy / c.maxEnergy, hf = c.hp / c.maxHp;
  const greedy = c.greed / 255;
  const hungryThr = 0.3 + greedy * 0.45;               // прожорливые идут есть раньше
  const isHungry = ef < hungryThr;
  const veryHungry = ef < 0.22;
  // Смелые отступают при бóльших потерях HP; регенераторов потери пугают меньше
  const retreatThr = lerp(0.5, 0.1, c.courage / 255) * (1 - 0.35 * c.regen / 255);

  // ── Связи с товарищем ──
  if (c.teammate && (!c.teammate.alive || dist(c, c.teammate) > sight * 1.6 || (veryHungry && Math.random() < 0.08)))
    c.teammate = null;

  // ── 1. Отступление ──
  if (threat && (hf < retreatThr || (c.task === 'retreat' && hf < retreatThr + 0.15 && simTime < c.retreatUntil))) {
    if (c.task !== 'retreat') c.retreatUntil = simTime + 2.5;
    c.task = 'retreat'; c.taskTarget = threat;
    let fx = c.x - threat.x, fy = c.y - threat.y;
    const fl = Math.hypot(fx, fy) || 1; fx /= fl; fy /= fl;
    for (const o of near) {
      const d = Math.hypot(c.x - o.x, c.y - o.y);
      if (d < 140 && d > 0 && o !== threat) { fx += (c.x - o.x) / d * (1 - d / 140) * 0.5; fy += (c.y - o.y) / d * (1 - d / 140) * 0.5; }
    }
    const l = Math.hypot(fx, fy) || 1;
    c.fleeX = clamp(c.x + fx / l * 240, 40, world.w - 40);
    c.fleeY = clamp(c.y + fy / l * 240, 40, world.h - 40);
    planRoute(c, c.fleeX, c.fleeY);
    return;
  }

  // ── 2. Ответить обидчику (даже если он «друг») ──
  const rt = retaliationTarget(c);
  if (rt && c.taskTarget !== rt && Math.hypot(rt.x - c.x, rt.y - c.y) < sight) {
    if (rt === c.teammate) c.teammate = null;
    startHunt(c, rt);
  }

  // ── 3. Продолжать начатую охоту (цель не меняется, пока её не убили или не перебили приоритеты) ──
  if (c.task === 'hunt' && huntStillValid(c, sight)) {
    planHunt(c);
    return;
  }

  // ── 4. Помочь товарищу: бить ту же цель / того, кто бьёт его ──
  const tm = c.teammate;
  if (tm && tm.alive) {
    const assist = tm.task === 'hunt' && tm.taskTarget && tm.taskTarget.alive && tm.taskTarget !== c
      ? tm.taskTarget : retaliationTarget(tm);
    if (assist && assist !== c && assist !== tm && Math.random() < (c.sociability / 255) * S.sociality * 0.6 &&
        simTime >= c.huntCooldownUntil && Math.hypot(assist.x - c.x, assist.y - c.y) < sight) {
      startHunt(c, assist); planHunt(c); return;
    }
  }

  // ── 5. Выйти на охоту ──
  // Смелость тянет в бой, стайность гасит беспричинную агрессию, голод злит
  const aggr = (c.courage / 255) * (1 - 0.55 * c.sociability / 255) * S.aggression;
  if (near.length && simTime >= c.huntCooldownUntil &&
      Math.random() < Math.pow(aggr * (isHungry ? 1.5 : 0.8), 1.5) * 0.14) {
    const prey = pickPrey(c);
    if (prey) { startHunt(c, prey); planHunt(c); return; }
  }

  // ── 6. Еда ──
  if (isHungry) {
    const meatPref = c.courage > 110 || c.regen > 150;
    let plantPenalty = 1;
    if (S.plantNerf && c.regen > 120) {
      const tot = c.meatEaten + c.plantEaten + 0.01;
      plantPenalty = 1 + (c.plantEaten / tot) * 1.5;   // регенераторы сами тянутся к мясу
    }
    let food = c.taskTarget && c.taskTarget.alive && (c.task === 'forage' || c.task === 'forage_meat') ? c.taskTarget : null;
    if (food && Math.hypot(food.x - c.x, food.y - c.y) > sight * 2.2) food = null;   // помним цель, пока обходим препятствие
    if (!food) food = findFood(c, sight, meatPref, plantPenalty);
    if (food) {
      c.task = food.life !== undefined ? 'forage_meat' : 'forage';
      c.taskTarget = food;
      planRoute(c, food.x, food.y);
      return;
    }
    // еды не видно: голодный отчаянно нападает на кого угодно, иначе ищет еду
    if (veryHungry && near.length && c.courage > 40) {
      const prey = pickPrey(c) || near[0];
      if (prey) { startHunt(c, prey); planHunt(c); return; }
    }
    c.task = 'explore'; c.taskTarget = null; c.route.length = 0;
    return;
  }

  // ── 7. Держаться товарища / завести товарища ──
  tryTeamUp(c, ef);
  if (c.teammate) {
    c.task = 'teamup'; c.taskTarget = c.teammate;
    planRoute(c, c.teammate.x, c.teammate.y);
    return;
  }

  // ── Ничего срочного: танцуем ──
  c.task = 'idle'; c.taskTarget = null; c.route.length = 0;
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

// ==================== MOVEMENT ====================
function liveGoal(c, g, dt) {
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
    case 'explore': {
      c.wanderTimer -= dt;
      if (c.wanderTimer <= 0) { c.wanderAngle += (Math.random() - 0.5) * 1.6; c.wanderTimer = 1 + Math.random() * 2; }
      g.x = c.x + Math.cos(c.wanderAngle) * 120; g.y = c.y + Math.sin(c.wanderAngle) * 120;
      g.speed = 0.75; return true;
    }
    default: return false;
  }
}

const _goal = { x: 0, y: 0, speed: 1, hold: false };

function move(c, dt) {
  let dirX = 0, dirY = 0, moving = false, speedMul = 1, accelMul = 4;

  if (c.task === 'idle') {
    // Танец: ритмичное «туда-сюда», ядро пульсирует (см. рендер)
    c.dancePhase += dt * 5;
    c.wanderTimer -= dt;
    if (c.wanderTimer <= 0) { c.wanderAngle += (Math.random() - 0.5) * 2.2; c.wanderTimer = 1.5 + Math.random() * 2.5; }
    const s = Math.sin(c.dancePhase);
    dirX = Math.cos(c.wanderAngle) * s; dirY = Math.sin(c.wanderAngle) * s;
    moving = true; speedMul = 0.35; accelMul = 3;
  } else if (liveGoal(c, _goal, dt)) {
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
    if (c.task === 'explore' && (c.x < 60 || c.x > world.w - 60 || c.y < 60 || c.y > world.h - 60))
      c.wanderAngle = Math.atan2(world.h / 2 - c.y, world.w / 2 - c.x) + (Math.random() - 0.5);
    if (c.task === 'teamup' && !moving) { c.dancePhase += dt * 5; }
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
    localAvoid(c, _av);
    dirX += _av.x; dirY += _av.y;
    const dl = Math.hypot(dirX, dirY);
    if (dl > 1) { dirX /= dl; dirY /= dl; }
  }

  const sp = c.speed * S.speedMult;
  if (moving) {
    c.vx += dirX * sp * accelMul * dt;
    c.vy += dirY * sp * accelMul * dt;
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
      if (dot < 0) { c.vx -= dot * ux * 1.3; c.vy -= dot * uy * 1.3; }
    }
  }
}
