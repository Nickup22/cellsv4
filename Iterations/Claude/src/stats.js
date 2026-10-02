// ==================== STATISTICS ====================
// История популяции и средних генов, поколения, архетипы и универсальная отрисовка графиков.
'use strict';

const hist = {
  t: [], pop: [], plants: [], meat: [],
  str: [], arm: [], reg: [], cou: [], soc: [], gre: [],
  gen: [], births: [], kills: [], starve: [],
};
let histInterval = 1, lastSample = 0;
const HIST_MAX = 600;

function sampleStats(force) {
  if (force) {
    for (const k in hist) hist[k].length = 0;
    histInterval = 1; lastSample = 0;
  } else if (simTime - lastSample < histInterval) return;
  lastSample = simTime;

  const n = cells.length;
  let s0 = 0, s1 = 0, s2 = 0, s3 = 0, s4 = 0, s5 = 0, g = 0;
  for (const c of cells) {
    s0 += c.strength; s1 += c.armor; s2 += c.regen; s3 += c.courage; s4 += c.sociability; s5 += c.greed; g += c.gen;
  }
  const d = n || 1;
  hist.t.push(simTime); hist.pop.push(n); hist.plants.push(plants.length); hist.meat.push(meats.length);
  hist.str.push(s0 / d); hist.arm.push(s1 / d); hist.reg.push(s2 / d);
  hist.cou.push(s3 / d); hist.soc.push(s4 / d); hist.gre.push(s5 / d);
  hist.gen.push(g / d);
  hist.births.push(stats.births); hist.kills.push(stats.kills); hist.starve.push(stats.starve);

  if (hist.t.length > HIST_MAX) {      // прореживаем: вся история остаётся в окне, но реже
    for (const k in hist) hist[k] = hist[k].filter((_, i) => i % 2 === 0);
    histInterval *= 2;
  }
}

// Архетип клетки из cells.jsx: уровень каждой статы 0/1/2
function archetypeIndex(c) {
  const lv = v => (v < 85 ? 0 : v < 170 ? 1 : 2);
  return lv(c.strength) * 9 + lv(c.armor) * 3 + lv(c.regen);
}

function archetypeCounts() {
  const cnt = new Array(27).fill(0);
  for (const c of cells) cnt[archetypeIndex(c)]++;
  return cnt.map((n, i) => ({ name: ARCH_NAMES[i], n })).filter(a => a.n > 0).sort((a, b) => b.n - a.n);
}

function generationSeries() {
  const out = { gens: [], n: [], str: [], arm: [], reg: [], cou: [], soc: [], gre: [] };
  for (let g = 0; g < genAcc.length; g++) {
    const a = genAcc[g];
    out.gens.push(g);
    if (!a || !a.n) { for (const k of ['n', 'str', 'arm', 'reg', 'cou', 'soc', 'gre']) out[k].push(NaN); continue; }
    out.n.push(a.n);
    ['str', 'arm', 'reg', 'cou', 'soc', 'gre'].forEach((k, i) => out[k].push(a.sum[i] / a.n));
  }
  return out;
}

function fmtTime(t) {
  t = Math.floor(t);
  const m = Math.floor(t / 60), s = t % 60;
  return m ? `${m}м ${s}с` : `${s}с`;
}

// ==================== CHARTS ====================
function prepCanvas(cv) {
  const dpr = window.devicePixelRatio || 1;
  const w = cv.clientWidth || 300, h = cv.clientHeight || 120;
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
  }
  const g = cv.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.fillStyle = '#0a0a0e'; g.fillRect(0, 0, w, h);
  return { g, w, h };
}

function niceMax(v) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const f = v / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
}

// o: { series:[{label,color,data}], x0, x1, xFmt, yMin, yMax }
function drawChart(cv, o) {
  const { g, w, h } = prepCanvas(cv);
  const L = 34, R = 6, T = 16, B = 15;
  let mn = o.yMin, mx = o.yMax;
  if (mx == null) {
    mx = 0;
    for (const s of o.series) for (const v of s.data) if (v > mx) mx = v;
    mx = niceMax(mx);
  }
  if (mn == null) mn = 0;
  if (mx <= mn) mx = mn + 1;
  g.font = '10px sans-serif'; g.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = T + (h - T - B) * (1 - i / 4);
    g.strokeStyle = '#1a1a22'; g.beginPath(); g.moveTo(L, y); g.lineTo(w - R, y); g.stroke();
    g.fillStyle = '#667'; g.textAlign = 'right';
    const val = mn + (mx - mn) * i / 4;
    g.fillText(val >= 100 ? Math.round(val) : val.toFixed(val < 10 ? 1 : 0), L - 4, y + 3);
  }
  const xf = o.xFmt || (v => String(Math.round(v)));
  g.fillStyle = '#667'; g.textAlign = 'left'; g.fillText(xf(o.x0), L, h - 3);
  g.textAlign = 'right'; g.fillText(xf(o.x1), w - R, h - 3);

  let lx = L + 2;
  g.textAlign = 'left';
  for (const s of o.series) {
    const n = s.data.length;
    g.strokeStyle = s.color; g.lineWidth = 1.5; g.beginPath();
    let pen = false;
    for (let i = 0; i < n; i++) {
      const v = s.data[i];
      if (!isFinite(v)) { pen = false; continue; }
      const x = L + (n === 1 ? 0.5 : i / (n - 1)) * (w - L - R);
      const y = T + (h - T - B) * (1 - (v - mn) / (mx - mn));
      if (!pen) { g.moveTo(x, y); pen = true; } else g.lineTo(x, y);
    }
    g.stroke();
    g.fillStyle = s.color; g.fillRect(lx, 4, 8, 3);
    g.fillStyle = '#aab'; g.fillText(s.label, lx + 11, 9);
    lx += 16 + g.measureText(s.label).width;
  }
}

// Столбчатая диаграмма для распределений
function drawBars(cv, o) {
  const { g, w, h } = prepCanvas(cv);
  const L = 30, R = 6, T = 16, B = 15;
  let mx = 0;
  for (const s of o.series) for (const v of s.data) if (v > mx) mx = v;
  mx = niceMax(mx);
  g.font = '10px sans-serif';
  const bins = o.labels.length, bw = (w - L - R) / bins, sn = o.series.length;
  for (let i = 0; i <= 2; i++) {
    const y = T + (h - T - B) * (1 - i / 2);
    g.strokeStyle = '#1a1a22'; g.beginPath(); g.moveTo(L, y); g.lineTo(w - R, y); g.stroke();
    g.fillStyle = '#667'; g.textAlign = 'right'; g.fillText(Math.round(mx * i / 2), L - 4, y + 3);
  }
  for (let b = 0; b < bins; b++) {
    o.series.forEach((s, k) => {
      const v = s.data[b] || 0, bh = (h - T - B) * v / mx;
      g.fillStyle = s.color;
      g.fillRect(L + b * bw + 2 + k * (bw - 4) / sn, h - B - bh, (bw - 4) / sn - 1, bh);
    });
    g.fillStyle = '#667'; g.textAlign = 'center'; g.fillText(o.labels[b], L + b * bw + bw / 2, h - 3);
  }
  let lx = L + 2; g.textAlign = 'left';
  for (const s of o.series) {
    g.fillStyle = s.color; g.fillRect(lx, 4, 8, 3);
    g.fillStyle = '#aab'; g.fillText(s.label, lx + 11, 9);
    lx += 16 + g.measureText(s.label).width;
  }
}

function histogram(cells_, key, bins) {
  const out = new Array(bins).fill(0);
  for (const c of cells_) out[Math.min(bins - 1, Math.floor(c[key] / 256 * bins))]++;
  return out;
}

// Данные графиков, общие для живой панели и итогового экрана
const SERIES = {
  body: () => [
    { label: 'Сила', color: '#f55', data: hist.str },
    { label: 'Броня', color: '#58f', data: hist.arm },
    { label: 'Реген', color: '#5d5', data: hist.reg }],
  nucleus: () => [
    { label: 'Смелость', color: '#f77', data: hist.cou },
    { label: 'Стайность', color: '#79f', data: hist.soc },
    { label: 'Прожорл.', color: '#7e7', data: hist.gre }],
};

function drawLiveCharts(popCv, bodyCv) {
  const x1 = hist.t.length ? hist.t[hist.t.length - 1] : 0;
  drawChart(popCv, {
    series: [{ label: 'Клетки', color: '#4d9', data: hist.pop }],
    x0: 0, x1, xFmt: fmtTime,
  });
  drawChart(bodyCv, { series: SERIES.body(), yMin: 0, yMax: 255, x0: 0, x1, xFmt: fmtTime });
}
