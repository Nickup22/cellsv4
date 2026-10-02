// Генерирует ../../atlas.html — атлас архетипов как обычную страницу.
// Тексты берутся из archetypes.json (извлечены из cells.jsx), «родное» ядро — из config.js, сила в симуляции — из balance.json.
// Запуск: node i3/src/build-atlas.js
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..', '..');
const CELLS = JSON.parse(fs.readFileSync(path.join(__dirname, 'archetypes.json'), 'utf8'));
const ctx = { localStorage: null };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'config.js'), 'utf8') + ';this.N=ARCH_NUCLEUS;this.LV=LV;', ctx);
const bal = JSON.parse(fs.readFileSync(path.join(__dirname, 'balance.json'), 'utf8'));
const data = CELLS.map(c => ({ ...c, nuc: ctx.N[c.name], fit: bal.fitness[c.name] }));
const tpl = fs.readFileSync(path.join(__dirname, 'atlas.template.html'), 'utf8');
const html = tpl.replace('/*@DATA@*/', () => `const CELLS = ${JSON.stringify(data)};\nconst LV = ${JSON.stringify(ctx.LV)};\nconst BAL_NOTE = ${JSON.stringify(bal.note)};`);
fs.writeFileSync(path.join(root, 'atlas.html'), html);
console.log('atlas.html', (html.length / 1024).toFixed(1), 'KB,', data.length, 'архетипов');
