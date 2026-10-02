// Генерирует ../../../atlas.html — атлас архетипов (бывший cells.jsx) как обычную страницу без React.
// Тексты берутся из cells.jsx, «родное» ядро — из config.js, сила в симуляции — из balance.json.
// Запуск: node Iterations/Claude/src/build-atlas.js
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..', '..', '..');
const jsx = fs.readFileSync(path.join(root, 'cells.jsx'), 'utf8');
const a = jsx.indexOf('const CELLS = ['), b = jsx.indexOf('];', a);
const CELLS = Function('return ' + jsx.slice(a + 'const CELLS = '.length, b + 1))();
const ctx = { localStorage: null };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'config.js'), 'utf8') + ';this.N=ARCH_NUCLEUS;this.LV=LV;', ctx);
const bal = JSON.parse(fs.readFileSync(path.join(__dirname, 'balance.json'), 'utf8'));
const data = CELLS.map(c => ({ ...c, nuc: ctx.N[c.name], fit: bal.fitness[c.name] }));
const tpl = fs.readFileSync(path.join(__dirname, 'atlas.template.html'), 'utf8');
const html = tpl.replace('/*@DATA@*/', () => `const CELLS = ${JSON.stringify(data)};\nconst LV = ${JSON.stringify(ctx.LV)};\nconst BAL_NOTE = ${JSON.stringify(bal.note)};`);
fs.writeFileSync(path.join(root, 'atlas.html'), html);
console.log('atlas.html', (html.length / 1024).toFixed(1), 'KB,', data.length, 'архетипов');
