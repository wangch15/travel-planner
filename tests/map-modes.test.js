const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { ROOT } = require('../scripts/lib/paths.js');
const { MODES } = require('../scripts/lib/schema.js');

const ctx = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(ROOT, 'src/map-modes.js'), 'utf8')
  + '\n;globalThis.MODE_LINE = MODE_LINE; globalThis.legStyle = legStyle;', ctx);

test('每個合法的 mode 都有線型', () => {
  for (const m of MODES) assert.ok(ctx.MODE_LINE[m], `${m} 沒有定義線型`);
});

test('自駕是實線、大眾運輸是虛線、步行是點線', () => {
  assert.equal(ctx.legStyle('drive').dash, null, '自駕不該有虛線樣式');
  const transit = ctx.legStyle('transit').dash;
  const walk = ctx.legStyle('walk').dash;
  assert.ok(transit && /\d/.test(transit), '大眾運輸要有 dasharray');
  assert.ok(walk && /\d/.test(walk), '步行要有 dasharray');
  assert.notEqual(transit, walk, '虛線與點線要看得出差別');
  assert.ok(parseFloat(walk) < parseFloat(transit), '步行的點要比大眾運輸的虛線短');
});

test('未知或缺少的 mode 退回自駕樣式', () => {
  assert.deepEqual(ctx.legStyle('nope'), ctx.legStyle('drive'));
  assert.deepEqual(ctx.legStyle(undefined), ctx.legStyle('drive'));
});

test('計程車沿用自駕線型，渡輪有自己的線型', () => {
  assert.equal(ctx.legStyle('taxi').dash, ctx.legStyle('drive').dash);
  assert.notEqual(ctx.legStyle('ferry').dash, ctx.legStyle('drive').dash);
});
