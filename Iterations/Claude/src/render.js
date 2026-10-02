// ==================== RENDER ====================
'use strict';

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d', { alpha: false });
let vw = 800, vh = 600, dpr = 1;
const cam = { x: 1000, y: 750, zoom: 1 };

// Состояние ввода, которое нужно рендеру (подсказки инструментов, hover)
const input = { tool: 'spawn', mx: 0, my: 0, over: false, wallDrag: null, hovered: null };

function resizeCanvas() {
  dpr = window.devicePixelRatio || 1;
  vw = canvas.clientWidth; vh = canvas.clientHeight;
  canvas.width = Math.round(vw * dpr); canvas.height = Math.round(vh * dpr);
}
window.addEventListener('resize', resizeCanvas);

function screenToWorld(sx, sy) { return [(sx - vw / 2) / cam.zoom + cam.x, (sy - vh / 2) / cam.zoom + cam.y]; }

function fitCamera() {
  cam.zoom = Math.min(vw / world.w, vh / world.h) * 0.96;
  cam.x = world.w / 2; cam.y = world.h / 2;
}

function zoomAt(sx, sy, factor) {
  const [bx, by] = screenToWorld(sx, sy);
  cam.zoom = clamp(cam.zoom * factor, 0.05, 8);
  const [ax, ay] = screenToWorld(sx, sy);
  cam.x += bx - ax; cam.y += by - ay;
}

// ---------- родственники ----------
function getRelatives(c) {
  const anc = [], desc = [];
  let ancTotal = 0, descTotal = 0;
  const rec = lineage.get(c.id);
  if (!rec) return { anc, desc, ancTotal, descTotal };
  let pid = rec.parent, guard = 0;
  while (pid != null && guard++ < 500) {
    const r = lineage.get(pid);
    if (!r) break;
    ancTotal++;
    if (r.cell && r.cell.alive) anc.push(r.cell);
    pid = r.parent;
  }
  const stack = rec.children.slice();
  guard = 0;
  while (stack.length && guard++ < 5000) {
    const r = lineage.get(stack.pop());
    if (!r) continue;
    descTotal++;
    if (r.cell && r.cell.alive) desc.push(r.cell);
    for (const k of r.children) stack.push(k);
  }
  return { anc, desc, ancTotal, descTotal };
}

function pickCell(wx, wy) {
  const reach = 6 / cam.zoom;
  let best = null, bestD = Infinity;
  for (const c of cellGrid.collect(wx, wy, S.cellSize + reach + 4, [])) {
    if (!c.alive) continue;
    const d = Math.hypot(c.x - wx, c.y - wy);
    if (d < c.radius + reach && d < bestD) { bestD = d; best = c; }
  }
  return best;
}

// ---------- главный рендер ----------
function circlePath(x, y, r) { ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, Math.PI * 2); }

function render(now) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, vw, vh);

  ctx.save();
  ctx.translate(vw / 2, vh / 2);
  ctx.scale(cam.zoom, cam.zoom);
  ctx.translate(-cam.x, -cam.y);

  const vx0 = cam.x - vw / 2 / cam.zoom, vx1 = cam.x + vw / 2 / cam.zoom;
  const vy0 = cam.y - vh / 2 / cam.zoom, vy1 = cam.y + vh / 2 / cam.zoom;
  const vis = (x, y, m) => x > vx0 - m && x < vx1 + m && y > vy0 - m && y < vy1 + m;

  // мир
  ctx.fillStyle = '#030306';
  ctx.fillRect(0, 0, world.w, world.h);
  if (S.worldGrid) {
    ctx.strokeStyle = '#0d0d14'; ctx.lineWidth = 1 / cam.zoom;
    ctx.beginPath();
    for (let x = 0; x <= world.w; x += 100) { ctx.moveTo(x, 0); ctx.lineTo(x, world.h); }
    for (let y = 0; y <= world.h; y += 100) { ctx.moveTo(0, y); ctx.lineTo(world.w, y); }
    ctx.stroke();
  }
  ctx.strokeStyle = '#24243c'; ctx.lineWidth = 3 / cam.zoom;
  ctx.strokeRect(0, 0, world.w, world.h);

  // растения — тремя пакетами по жирности
  for (let tier = 0; tier < 3; tier++) {
    ctx.fillStyle = tier === 0 ? 'rgba(40,120,50,0.85)' : tier === 1 ? 'rgba(50,165,60,0.9)' : 'rgba(90,215,90,0.95)';
    ctx.beginPath();
    for (const p of plants) {
      if (!p.alive || !vis(p.x, p.y, 10)) continue;
      const t = p.energy < S.plantEnergy * 0.7 ? 0 : p.energy < S.plantEnergy * 1.1 ? 1 : 2;
      if (t === tier) circlePath(p.x, p.y, p.radius);
    }
    ctx.fill();
  }

  // ошмётки
  for (const m of meats) {
    if (!m.alive || !vis(m.x, m.y, 10)) continue;
    const a = Math.min(1, m.life / 12) * 0.92;
    ctx.beginPath(); ctx.arc(m.x, m.y, m.radius, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${m.r},${m.gb},${m.gb},${a})`; ctx.fill();
    ctx.strokeStyle = `rgba(255,90,70,${a * 0.5})`; ctx.lineWidth = 0.8; ctx.stroke();
  }

  // источники растений
  const pulse = Math.sin(now / 500);
  for (const s of sources) {
    if (!s.alive || !vis(s.x, s.y, s.r * 2.5)) continue;
    const gr = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r * 2.2);
    gr.addColorStop(0, 'rgba(255,200,100,0.28)'); gr.addColorStop(1, 'rgba(255,200,100,0)');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(s.x, s.y, s.r * 2.2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fillStyle = '#e8b830'; ctx.fill();
    ctx.strokeStyle = '#ff8800'; ctx.lineWidth = 3; ctx.stroke();
    ctx.beginPath(); ctx.arc(s.x, s.y, s.r * 0.4 + pulse * 2, 0, Math.PI * 2);
    ctx.fillStyle = '#ffeeaa'; ctx.fill();
  }

  // палки
  ctx.lineCap = 'round';
  for (const w of walls) {
    if (!vis((w.x1 + w.x2) / 2, (w.y1 + w.y2) / 2, Math.hypot(w.x2 - w.x1, w.y2 - w.y1) / 2 + w.r + 5)) continue;
    ctx.strokeStyle = '#3c3f4a'; ctx.lineWidth = w.r * 2;
    ctx.beginPath(); ctx.moveTo(w.x1, w.y1); ctx.lineTo(w.x2, w.y2); ctx.stroke();
    ctx.strokeStyle = '#8a8f9c'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(w.x1, w.y1); ctx.lineTo(w.x2, w.y2); ctx.stroke();
  }
  ctx.lineCap = 'butt';

  // частицы
  for (const p of particles) {
    if (!vis(p.x, p.y, 10)) continue;
    const a = p.life / p.maxLife;
    ctx.globalAlpha = a * 0.85;
    ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(0.2, p.size * a), 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;

  // клетки
  const detail = cam.zoom > 0.3;
  for (const c of cells) {
    if (!c.alive || !vis(c.x, c.y, c.radius + 20)) continue;
    const r = c.radius * (1 + 0.09 * c.pulse);

    ctx.beginPath(); ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
    ctx.globalAlpha = 0.9; ctx.fillStyle = c.color; ctx.fill(); ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 0.8; ctx.stroke();

    // ядро; в танце пульсирует
    const beat = c.task === 'idle' ? 0.5 + 0.5 * Math.sin(c.dancePhase * 1.0) : c.pulse * 0.5;
    const nr = r * (0.3 + 0.16 * beat);
    ctx.beginPath(); ctx.arc(c.x, c.y, nr, 0, Math.PI * 2);
    ctx.globalAlpha = 0.95; ctx.fillStyle = c.nucColor; ctx.fill(); ctx.globalAlpha = 1;
    if (c.task === 'idle') { ctx.strokeStyle = `rgba(255,255,255,${0.1 + 0.25 * beat})`; ctx.lineWidth = 0.6; ctx.stroke(); }

    if (S.hpBars && detail) {
      const bw = r * 2.6, bh = 3, bx = c.x - bw / 2, by = c.y - r - 7;
      const hf = Math.max(0, c.hp / c.maxHp), hard = Math.min(1, c.hardHp / c.maxHp);
      ctx.fillStyle = '#222'; ctx.fillRect(bx, by, bw, bh);
      if (hard > 0) { ctx.fillStyle = '#7a0000'; ctx.fillRect(bx + bw * (1 - hard), by, bw * hard, bh); }
      ctx.fillStyle = hf > 0.6 ? '#3d9' : hf > 0.3 ? '#da4' : '#d33';
      ctx.fillRect(bx, by, bw * hf, bh);
    }

    if (c.leader && detail) drawCrown(c, r);

    if (S.combatLines && detail) {
      if (c.task === 'hunt' && c.taskTarget && c.taskTarget.alive) {
        ctx.strokeStyle = 'rgba(255,50,50,0.2)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(c.taskTarget.x, c.taskTarget.y); ctx.stroke();
      }
      if (c.teammate && c.teammate.alive) {
        ctx.strokeStyle = 'rgba(90,110,255,0.2)'; ctx.lineWidth = 0.6; ctx.setLineDash([3, 5]);
        ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(c.teammate.x, c.teammate.y); ctx.stroke();
        ctx.setLineDash([]);
      }
    }
  }

  drawHoverOverlay(now);
  drawToolPreview();
  ctx.restore();
}

// Корона вожака стаи: золотая, над полоской HP; на крупном зуме — размер стаи
function drawCrown(c, r) {
  const w = Math.max(5, r * 0.95), y0 = c.y - r - 12, h = w * 0.7;
  ctx.beginPath();
  ctx.moveTo(c.x - w, y0); ctx.lineTo(c.x - w, y0 - h * 0.55); ctx.lineTo(c.x - w * 0.5, y0 - h * 0.25);
  ctx.lineTo(c.x, y0 - h); ctx.lineTo(c.x + w * 0.5, y0 - h * 0.25); ctx.lineTo(c.x + w, y0 - h * 0.55);
  ctx.lineTo(c.x + w, y0); ctx.closePath();
  ctx.fillStyle = '#ffd23c'; ctx.fill();
  ctx.strokeStyle = '#a06800'; ctx.lineWidth = 0.9; ctx.stroke();
  if (cam.zoom > 0.9) {
    ctx.fillStyle = '#fff'; ctx.font = '7px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(String(c.pack + 1), c.x, y0 - h - 2);
  }
}

// ---------- подсветка наведённой клетки ----------
function ring(x, y, r, color, w) {
  ctx.strokeStyle = color; ctx.lineWidth = w / cam.zoom;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
}

function drawHoverOverlay(now) {
  const c = input.hovered;
  if (!c || !c.alive) return;
  const rel = getRelatives(c);
  c._rel = rel;

  // родословная: предки — золотые, потомки — бирюзовые
  for (const a of rel.anc) { ring(a.x, a.y, a.radius + 5, 'rgba(255,200,60,0.95)', 2); }
  for (const d of rel.desc) { ring(d.x, d.y, d.radius + 5, 'rgba(60,230,255,0.95)', 2); }
  const rec = lineage.get(c.id);
  if (rec) {
    ctx.lineWidth = 1 / cam.zoom;
    if (rec.parent != null) {
      const pr = lineage.get(rec.parent);
      if (pr && pr.cell && pr.cell.alive) {
        ctx.strokeStyle = 'rgba(255,200,60,0.5)'; ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(pr.cell.x, pr.cell.y); ctx.stroke();
      }
    }
    ctx.strokeStyle = 'rgba(60,230,255,0.4)';
    for (const k of rec.children) {
      const kr = lineage.get(k);
      if (kr && kr.cell && kr.cell.alive) { ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(kr.cell.x, kr.cell.y); ctx.stroke(); }
    }
  }

  ring(c.x, c.y, c.radius + 3, 'rgba(255,255,255,0.9)', 1.5);

  // товарищ
  if (c.teammate && c.teammate.alive) {
    ring(c.teammate.x, c.teammate.y, c.teammate.radius + 5, 'rgba(110,130,255,1)', 2.5);
    ctx.strokeStyle = 'rgba(110,130,255,0.8)'; ctx.lineWidth = 1.5 / cam.zoom; ctx.setLineDash([5 / cam.zoom, 4 / cam.zoom]);
    ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(c.teammate.x, c.teammate.y); ctx.stroke(); ctx.setLineDash([]);
  }

  // цель и построенный маршрут
  const hasGoal = c.task !== 'idle' && (c.taskTarget || c.task === 'retreat' || c.task === 'explore');
  if (hasGoal) {
    const col = c.task === 'hunt' ? '255,70,70' : c.task === 'retreat' ? '255,170,60' : c.task === 'teamup' ? '110,130,255' : '120,255,120';
    const pts = [c.x, c.y];
    const r = c.route;
    if (r.length) { for (let i = 0; i < r.length; i++) pts.push(r[i]); }
    let endX, endY;
    if (c.task === 'explore') { endX = c.x + Math.cos(c.wanderAngle) * 120; endY = c.y + Math.sin(c.wanderAngle) * 120; pts.length = 2; pts.push(endX, endY); }
    else if (c.taskTarget && c.taskTarget.alive && c.task !== 'retreat') { endX = c.taskTarget.x; endY = c.taskTarget.y; if (pts.length === 2) pts.push(endX, endY); else { pts[pts.length - 2] = endX; pts[pts.length - 1] = endY; } }
    else { endX = pts[pts.length - 2]; endY = pts[pts.length - 1]; if (pts.length === 2) { pts.push(c.fleeX, c.fleeY); endX = c.fleeX; endY = c.fleeY; } }
    ctx.strokeStyle = `rgba(${col},0.9)`; ctx.lineWidth = 2 / cam.zoom;
    ctx.setLineDash([8 / cam.zoom, 5 / cam.zoom]);
    ctx.beginPath(); ctx.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
    ctx.stroke(); ctx.setLineDash([]);
    for (let i = 2; i < pts.length - 2; i += 2) { ctx.fillStyle = `rgba(${col},0.9)`; ctx.beginPath(); ctx.arc(pts[i], pts[i + 1], 3 / cam.zoom, 0, Math.PI * 2); ctx.fill(); }
    const pr = 8 + 2 * Math.sin(now / 150);
    ring(endX, endY, pr, `rgba(${col},1)`, 2.5);
    const t = c.taskTarget;
    if (t && t.alive && c.task === 'hunt') ring(t.x, t.y, t.radius + 4, 'rgba(255,70,70,1)', 2);
  }
}

function drawToolPreview() {
  if (!input.over) return;
  const [wx, wy] = screenToWorld(input.mx, input.my);
  ctx.lineWidth = 1.5 / cam.zoom;
  const dash = () => ctx.setLineDash([6 / cam.zoom, 5 / cam.zoom]);
  switch (input.tool) {
    case 'spawn':
      ctx.strokeStyle = 'rgba(120,255,160,0.8)';
      if (S.spawnCount > 1 && S.spawnRadius > 0) { dash(); ctx.beginPath(); ctx.arc(wx, wy, S.spawnRadius, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); }
      ctx.beginPath(); ctx.arc(wx, wy, S.cellSize, 0, Math.PI * 2); ctx.stroke();
      break;
    case 'plant':
      ctx.strokeStyle = 'rgba(100,255,100,0.7)'; dash(); ctx.beginPath(); ctx.arc(wx, wy, 25, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      break;
    case 'source':
      ctx.strokeStyle = 'rgba(255,200,80,0.8)'; dash();
      ctx.beginPath(); ctx.arc(wx, wy, 18 + S.sourceRadius + 4, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      ctx.beginPath(); ctx.arc(wx, wy, 18, 0, Math.PI * 2); ctx.stroke();
      break;
    case 'wall':
      ctx.lineCap = 'round';
      if (input.wallDrag) {
        ctx.strokeStyle = 'rgba(180,185,200,0.7)'; ctx.lineWidth = 12;
        ctx.beginPath(); ctx.moveTo(input.wallDrag.x, input.wallDrag.y); ctx.lineTo(wx, wy); ctx.stroke();
      } else { ctx.strokeStyle = 'rgba(180,185,200,0.7)'; ctx.beginPath(); ctx.arc(wx, wy, 6, 0, Math.PI * 2); ctx.stroke(); }
      ctx.lineCap = 'butt';
      break;
    case 'erase':
      ctx.strokeStyle = 'rgba(255,80,80,0.8)'; ctx.beginPath(); ctx.arc(wx, wy, 35, 0, Math.PI * 2); ctx.stroke();
      break;
  }
}

// ==================== HOVER PANEL ====================
const hoverPanel = document.getElementById('hoverPanel');
const TASK_NAMES = {
  idle: '💃 Танцует', forage: '🌿 Сбор растений', forage_meat: '🥩 Сбор мяса', explore: '🧭 Поиск еды',
  hunt: '🎯 Охота', retreat: '🏃 Отступление', teamup: '🤝 Держится товарища',
};
let lastPanelUpdate = 0;

function updateHoverPanel(now) {
  const c = input.hovered;
  if (!c || !c.alive) { hoverPanel.style.display = 'none'; return; }
  if (now - lastPanelUpdate > 90) { lastPanelUpdate = now; hoverPanel.innerHTML = hoverHtml(c); }
  hoverPanel.style.display = 'block';
  // не вылезает за экран: меняет сторону от курсора у границ
  const pw = hoverPanel.offsetWidth, ph = hoverPanel.offsetHeight;
  const top = canvas.getBoundingClientRect().top;
  let px = input.mx + 18, py = input.my + 18 + top;
  if (px + pw > window.innerWidth - 4) px = input.mx - pw - 18;
  if (py + ph > window.innerHeight - 4) py = input.my + top - ph - 18;
  hoverPanel.style.left = Math.max(4, px) + 'px';
  hoverPanel.style.top = Math.max(top + 2, py) + 'px';
}

function hoverHtml(c) {
  const def = c.armor / 255, pen = c.strength / 255;
  const crit = S.critChance * (1 + pen * 0.6) * (1 - def * 0.7) * 100;
  const upkeep = c.baseUpkeep * S.hungerMult;
  const tEmpty = upkeep > 0 ? c.energy / upkeep : Infinity;
  const tDeath = S.starveDmg > 0 ? tEmpty + c.hp / S.starveDmg : Infinity;
  const hf = c.hp / c.maxHp, hardPct = c.hardHp / c.maxHp * 100;
  const hpCol = hf > 0.6 ? '#3d9' : hf > 0.3 ? '#da4' : '#d33';
  const t = c.taskTarget;
  const rel = c._rel || getRelatives(c);
  const retreatThr = lerp(0.5, 0.1, c.courage / 255) * (1 - 0.35 * c.regen / 255) * 100;
  const hungerThr = (0.3 + c.greed / 255 * 0.45) * 100;
  const f = v => (isFinite(v) ? v.toFixed(1) + 'с' : '∞');
  const row = (a, b) => `<div class="stat-row"><span>${a}</span><span>${b}</span></div>`;
  const gcol = ['rgb(%,0,0)', 'rgb(0,0,%)', 'rgb(0,%,0)', 'rgb(%,0,0)', 'rgb(0,0,%)', 'rgb(0,%,0)'];
  const genome = c.genome.map((b, i) =>
    `<div title="${GENE_NAMES[i]}: ${b}" style="background:${gcol[i].replace('%', b)};opacity:${i > 2 ? 0.75 : 1}"><i>${b}</i></div>`).join('');

  return `
    <div class="section-title">Клетка #${c.id}${c.parent ? ` · от #${c.parent}` : ' · заспавнена'} · поколение ${c.gen}</div>
    <div class="genome-bar">${genome}</div>
    ${row('❤️ HP', `${c.hp.toFixed(1)} / ${c.maxHp.toFixed(0)}`)}
    <div class="hp-bar"><div class="hp-fill" style="width:${(hf * 100).toFixed(1)}%;background:${hpCol}"></div>${c.hardHp > 0 ? `<div class="hard-zone" style="width:${hardPct.toFixed(1)}%"></div>` : ''}</div>
    ${c.hardHp > 0 ? row('<span style="color:#d44">🩸 Хард-урон</span>', `${hardPct.toFixed(0)}% · лечение ×${S.hardHealCost}`) : ''}
    ${row('⚡ Энергия', `${c.energy.toFixed(1)} / ${c.maxEnergy.toFixed(0)}`)}
    <div class="hp-bar"><div class="hp-fill" style="width:${(c.energy / c.maxEnergy * 100).toFixed(1)}%;background:#cb4"></div></div>
    ${row('💀 До 0 энергии / смерти', `${f(tEmpty)} / ${f(tDeath)}`)}
    <div class="section-title">Тело</div>
    ${row('🔴 Сила ' + c.strength, `урон ${(c.attackDamage * S.dmgMult).toFixed(1)} · КД ${c.attackCooldown.toFixed(2)}с ${c.attackTimer > 0 ? '⏳' : '✅'}`)}
    ${row('шанс крита', `${crit.toFixed(1)}%`)}
    ${row('откидывание', (c.knockback * S.knockMult / c.mass).toFixed(0))}
    ${row('🔵 Броня ' + c.armor, `−${(def * 50).toFixed(0)}% урона · масса ${c.mass.toFixed(2)}`)}
    ${row('скорость', (c.speed * S.speedMult).toFixed(0))}
    ${row('🟢 Реген ' + c.regen, `${c.regenRate.toFixed(1)} HP/с · расход ${upkeep.toFixed(2)}/с`)}
    ${row('в покое после боя', `через ${(0.5 + 4.5 * (1 - c.regen / 255) + 2).toFixed(1)}с`)}
    <div class="section-title">Ядро</div>
    ${row('🔴 Смелость ' + c.courage, `отступит при HP < ${retreatThr.toFixed(0)}%`)}
    ${row('🔵 Стайность ' + c.sociability, `${c.sociability > 90 ? 'ищет товарища' : 'одиночка'}`)}
    ${row('🟢 Прожорл. ' + c.greed, `ест при энергии < ${hungerThr.toFixed(0)}%`)}
    <div class="section-title">Поведение</div>
    ${row('Задача', TASK_NAMES[c.task] || c.task)}
    ${t && t.alive && t.id ? row('Цель', '#' + t.id) : ''}
    ${c.teammate && c.teammate.alive ? row('🤝 Товарищ', '#' + c.teammate.id) : ''}
    ${row('Возраст · убийств', `${fmtTime(c.age)} · ${c.kills}`)}
    ${c.leader ? row('<span style="color:#fc3">👑 Вожак стаи</span>', `${c.pack + 1} клеток`) : (c.packRoot && c.packRoot !== c.id && lineage.get(c.packRoot) && lineage.get(c.packRoot).cell && lineage.get(c.packRoot).cell.leader ? row('Стая вожака', '👑 #' + c.packRoot) : '')}
    <div class="section-title">Род</div>
    ${row('<span style="color:#fc3">● Предки</span>', `${rel.ancTotal} (живых ${rel.anc.length})`)}
    ${row('<span style="color:#3ef">● Потомки</span>', `${rel.descTotal} (живых ${rel.desc.length}) · детей ${c.children.length}`)}
  `;
}
