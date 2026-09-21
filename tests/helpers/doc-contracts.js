const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '../..');
const readDoc = (file) => fs.existsSync(path.join(root, file)) ? fs.readFileSync(path.join(root, file), 'utf8') : '';
function section(text, heading) {
  const start = text.indexOf(heading + '\n');
  assert.ok(start >= 0, `缺少段落：${heading}`);
  const body = text.slice(start + heading.length + 1);
  return body.split(/^## /m)[0];
}
function row(text, condition) {
  return text.split('\n').filter((s) => s.startsWith('| '))
    .map((s) => s.split('|').slice(1, -1).map((v) => v.trim()))
    .find((cells) => cells[0] === condition);
}
module.exports = { readDoc, section, row };
