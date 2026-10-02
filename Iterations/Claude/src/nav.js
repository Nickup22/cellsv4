// ==================== NAVIGATION ====================
// Препятствия — «палки» (капсулы) и источники (круги = вырожденные капсулы).
// Маршрут строится жадно: если прямая до цели упирается в препятствие,
// клетка выбирает ближайший угол обхода и повторяет это для остатка пути.
'use strict';

let obst = [];          // { x1,y1,x2,y2,r }
let obstDirty = true;

function rebuildObstacles() {
  obst.length = 0;
  for (const w of walls) obst.push(w);
  for (const s of sources) if (s.alive) obst.push({ x1: s.x, y1: s.y, x2: s.x, y2: s.y, r: s.r, src: s });
  buildObstGrid();
  obstDirty = false;
}

// Крупная сетка препятствий: запросы «что рядом с этим отрезком» не перебирают все палки мира
const OG = 150;
let ogW = 1, ogH = 1, ogCells = [], ogStamp = 0;
const _ob = [];

function buildObstGrid() {
  ogW = Math.ceil(world.w / OG) + 1; ogH = Math.ceil(world.h / OG) + 1;
  ogCells = new Array(ogW * ogH).fill(null);
  for (const o of obst) {
    const x0 = clamp(((Math.min(o.x1, o.x2) - o.r) / OG) | 0, 0, ogW - 1), x1 = clamp(((Math.max(o.x1, o.x2) + o.r) / OG) | 0, 0, ogW - 1);
    const y0 = clamp(((Math.min(o.y1, o.y2) - o.r) / OG) | 0, 0, ogH - 1), y1 = clamp(((Math.max(o.y1, o.y2) + o.r) / OG) | 0, 0, ogH - 1);
    for (let gy = y0; gy <= y1; gy++) for (let gx = x0; gx <= x1; gx++) {
      const i = gy * ogW + gx;
      (ogCells[i] || (ogCells[i] = [])).push(o);
    }
  }
}

// Уникальные препятствия, чьи корзины пересекают прямоугольник
function obstInBox(x0, y0, x1, y1, out) {
  out.length = 0;
  if (obst.length === 0) return out;
  ogStamp++;
  const gx0 = clamp((x0 / OG) | 0, 0, ogW - 1), gx1 = clamp((x1 / OG) | 0, 0, ogW - 1);
  const gy0 = clamp((y0 / OG) | 0, 0, ogH - 1), gy1 = clamp((y1 / OG) | 0, 0, ogH - 1);
  for (let gy = gy0; gy <= gy1; gy++) for (let gx = gx0; gx <= gx1; gx++) {
    const arr = ogCells[gy * ogW + gx];
    if (!arr) continue;
    for (let k = 0; k < arr.length; k++) {
      const o = arr[k];
      if (o.q !== ogStamp) { o.q = ogStamp; out.push(o); }
    }
  }
  return out;
}

// ---------- геометрия ----------
function distPointSeg(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy;
  let t = l2 > 0 ? ((px - x1) * dx + (py - y1) * dy) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(px - (x1 + dx * t), py - (y1 + dy * t));
}

function segsIntersect(ax, ay, bx, by, cx, cy, dx, dy) {
  const d1 = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  const d2 = (bx - ax) * (dy - ay) - (by - ay) * (dx - ax);
  const d3 = (dx - cx) * (ay - cy) - (dy - cy) * (ax - cx);
  const d4 = (dx - cx) * (by - cy) - (dy - cy) * (bx - cx);
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
}

function segSegDist(ax, ay, bx, by, cx, cy, dx, dy) {
  if (segsIntersect(ax, ay, bx, by, cx, cy, dx, dy)) return 0;
  return Math.min(
    distPointSeg(ax, ay, cx, cy, dx, dy), distPointSeg(bx, by, cx, cy, dx, dy),
    distPointSeg(cx, cy, ax, ay, bx, by), distPointSeg(dx, dy, ax, ay, bx, by));
}

const _ib = [];
function insideObstacle(x, y, margin) {
  if (obst.length === 0) return false;
  const list = obstInBox(x - margin, y - margin, x + margin, y + margin, _ib);
  for (let i = 0; i < list.length; i++) {
    const o = list[i];
    if (distPointSeg(x, y, o.x1, o.y1, o.x2, o.y2) < o.r + margin) return true;
  }
  return false;
}

function inBounds(x, y, m) { return x >= m && x <= world.w - m && y >= m && y <= world.h - m; }

// Ближайшая допустимая точка рядом с (x,y): не внутри препятствия и не за границей мира
function findFreePos(x, y, margin) {
  if (inBounds(x, y, margin) && !insideObstacle(x, y, margin)) return { x, y, ok: true };
  for (let k = 0; k < 60; k++) {
    const a = k * 0.7, d = 6 + k * 3;
    const nx = x + Math.cos(a) * d, ny = y + Math.sin(a) * d;
    if (inBounds(nx, ny, margin) && !insideObstacle(nx, ny, margin)) return { x: nx, y: ny, ok: true };
  }
  return { x, y, ok: false };
}

// ---------- маршрут ----------
const _fb = [];
function firstBlocker(sx, sy, tx, ty, clear) {
  let best = null, bestD = Infinity;
  const list = obstInBox(Math.min(sx, tx) - clear - 8, Math.min(sy, ty) - clear - 8, Math.max(sx, tx) + clear + 8, Math.max(sy, ty) + clear + 8, _fb);
  for (let i = 0; i < list.length; i++) {
    const o = list[i];
    if (segSegDist(sx, sy, tx, ty, o.x1, o.y1, o.x2, o.y2) < o.r + clear) {
      const d = distPointSeg(sx, sy, o.x1, o.y1, o.x2, o.y2);
      if (d < bestD) { bestD = d; best = o; }
    }
  }
  return best;
}

const _cand = [];
function detourCandidates(o, sx, sy, R) {
  _cand.length = 0;
  const dx = o.x2 - o.x1, dy = o.y2 - o.y1, L = Math.hypot(dx, dy);
  if (L < 1) {
    // круг: две точки по бокам относительно направления «от клетки к центру»
    let ux = o.x1 - sx, uy = o.y1 - sy;
    const ul = Math.hypot(ux, uy) || 1; ux /= ul; uy /= ul;
    _cand.push(o.x1 - uy * R, o.y1 + ux * R, o.x1 + uy * R, o.y1 - ux * R);
  } else {
    const ax = dx / L, ay = dy / L, px = -ay, py = ax;
    for (let e = 0; e < 2; e++) {
      const ex = e ? o.x2 : o.x1, ey = e ? o.y2 : o.y1, s = e ? 1 : -1;
      for (let side = -1; side <= 1; side += 2) {
        _cand.push(ex + (ax * s + px * side) * R * 0.72, ey + (ay * s + py * side) * R * 0.72);
      }
    }
  }
  return _cand;
}

function buildRoute(sx, sy, tx, ty, clear, out, depth) {
  const o = depth > 0 ? firstBlocker(sx, sy, tx, ty, clear) : null;
  if (!o) { out.push(tx, ty); return; }
  const R = (o.r + clear) * 1.5 + 4;
  const cand = detourCandidates(o, sx, sy, R);
  let bx = 0, by = 0, bestCost = Infinity;
  // клетка, прижатая к препятствию, уже ближе порога — требуем лишь не приближаться к нему
  const thr = Math.min((o.r + clear) * 0.85, distPointSeg(sx, sy, o.x1, o.y1, o.x2, o.y2) * 0.92);
  for (let i = 0; i < cand.length; i += 2) {
    const wx = cand[i], wy = cand[i + 1];
    if (Math.abs(wx - sx) + Math.abs(wy - sy) < 12) continue;      // не топчемся на месте
    if (!inBounds(wx, wy, 6) || insideObstacle(wx, wy, clear * 0.8)) continue;
    // первый отрезок не должен упираться в это же препятствие
    if (segSegDist(sx, sy, wx, wy, o.x1, o.y1, o.x2, o.y2) < thr) continue;
    const cost = Math.hypot(wx - sx, wy - sy) + Math.hypot(tx - wx, ty - wy);
    if (cost < bestCost) { bestCost = cost; bx = wx; by = wy; }
  }
  if (bestCost === Infinity) { out.push(tx, ty); return; }   // тупик — едем прямо, спасёт локальное отталкивание
  out.push(bx, by);
  buildRoute(bx, by, tx, ty, clear, out, depth - 1);
}

function planRoute(c, tx, ty) {
  const r = c.route;
  r.length = 0;
  if (obst.length === 0) { r.push(tx, ty); return; }
  // трусливые обходят препятствия дальше
  const clear = c.radius + 4 + (1 - c.courage / 255) * 14;
  buildRoute(c.x, c.y, tx, ty, clear, r, 3);
}

// Короткий список препятствий поблизости (обновляется в think) — чтобы физика не перебирала все палки мира
function refreshNearObstacles(c) {
  const list = c.nobst, R = c.radius + 130;
  list.length = 0;
  const cand = obstInBox(c.x - R, c.y - R, c.x + R, c.y + R, _nb);
  for (let i = 0; i < cand.length; i++) {
    const o = cand[i];
    if (c.x < Math.min(o.x1, o.x2) - o.r - R || c.x > Math.max(o.x1, o.x2) + o.r + R ||
        c.y < Math.min(o.y1, o.y2) - o.r - R || c.y > Math.max(o.y1, o.y2) + o.r + R) continue;
    list.push(o);
  }
}
const _nb = [];

// Локальное отталкивание от препятствий и границ мира (страховка, если маршрут не помог)
function localAvoid(c, out) {
  let rx = 0, ry = 0;
  const pad = c.radius + 10, list = c.nobst;
  for (let i = 0; i < list.length; i++) {
    const o = list[i];
    const lim = o.r + pad;
    if (c.x < Math.min(o.x1, o.x2) - lim || c.x > Math.max(o.x1, o.x2) + lim ||
        c.y < Math.min(o.y1, o.y2) - lim || c.y > Math.max(o.y1, o.y2) + lim) continue;
    // ближайшая точка на капсуле
    const sx = o.x2 - o.x1, sy = o.y2 - o.y1, l2 = sx * sx + sy * sy;
    let u = l2 > 0 ? ((c.x - o.x1) * sx + (c.y - o.y1) * sy) / l2 : 0;
    u = u < 0 ? 0 : u > 1 ? 1 : u;
    const nx = c.x - (o.x1 + sx * u), ny = c.y - (o.y1 + sy * u);
    const d = Math.hypot(nx, ny);
    if (d < lim && d > 0.01) { const k = (1 - d / lim) * 2.5; rx += nx / d * k; ry += ny / d * k; }
  }
  const bm = 30;
  if (c.x < bm) rx += (1 - c.x / bm) * 2;
  if (c.x > world.w - bm) rx -= (1 - (world.w - c.x) / bm) * 2;
  if (c.y < bm) ry += (1 - c.y / bm) * 2;
  if (c.y > world.h - bm) ry -= (1 - (world.h - c.y) / bm) * 2;
  out.x = rx; out.y = ry;
}

// Куда лучше всего «выталкивать» цель ударами: к ближайшей стене/границе (для синих-танков)
const _pd = [];
function nearestPushDir(t, maxD) {
  let bd = maxD, nx = 0, ny = 0;
  // границы мира: расстояние и направление к границе
  if (t.x < bd) { bd = t.x; nx = -1; ny = 0; }
  if (world.w - t.x < bd) { bd = world.w - t.x; nx = 1; ny = 0; }
  if (t.y < bd) { bd = t.y; nx = 0; ny = -1; }
  if (world.h - t.y < bd) { bd = world.h - t.y; nx = 0; ny = 1; }
  const near = obstInBox(t.x - maxD, t.y - maxD, t.x + maxD, t.y + maxD, _pd);
  for (let i = 0; i < near.length; i++) {
    const o = near[i];
    const d = distPointSeg(t.x, t.y, o.x1, o.y1, o.x2, o.y2) - o.r;
    if (d < bd) {
      const sx = o.x2 - o.x1, sy = o.y2 - o.y1, l2 = sx * sx + sy * sy;
      let u = l2 > 0 ? ((t.x - o.x1) * sx + (t.y - o.y1) * sy) / l2 : 0;
      u = u < 0 ? 0 : u > 1 ? 1 : u;
      const vx = o.x1 + sx * u - t.x, vy = o.y1 + sy * u - t.y, vl = Math.hypot(vx, vy) || 1;
      bd = d; nx = vx / vl; ny = vy / vl;
    }
  }
  return bd < maxD ? { nx, ny, d: bd } : null;
}
