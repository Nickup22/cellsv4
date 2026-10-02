// Сборка: склеивает модули из src/ в один файл ../cells-claude.html (открывается двойным кликом).
// Запуск: node Iterations/Claude/src/build.js
const fs = require('fs'), path = require('path');
const order = ['config', 'world', 'nav', 'ai', 'sim', 'stats', 'render', 'ui'];
const code = order.map(n => `// ───────── ${n}.js ─────────\n` + fs.readFileSync(path.join(__dirname, n + '.js'), 'utf8')).join('\n');
// 'use strict' в каждом модуле безвреден, но оставляем один, на весь скрипт
const joined = "'use strict';\n" + code.replace(/^'use strict';\n/gm, '');
const html = fs.readFileSync(path.join(__dirname, 'index.template.html'), 'utf8').replace('//@SCRIPTS@', () => joined);
fs.writeFileSync(path.join(__dirname, '..', 'cells-claude.html'), html);
console.log('built', (html.length / 1024).toFixed(1), 'KB');
