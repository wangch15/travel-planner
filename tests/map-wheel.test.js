const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../src/app.js'), 'utf8');
function wheel(overrides, dialog = false) {
  let handler, zooms = 0, prevented = false;
  const hint = { hidden: true };
  const ctx = { svg: { addEventListener: (_, cb) => { handler = cb; } }, $: () => hint, mapInDialog: () => dialog,
    zoom: () => { zooms++; }, clearTimeout() {}, setTimeout() { return 1; } };
  vm.runInNewContext(source.slice(source.indexOf('let wheelHintTimer'), source.indexOf("svg.addEventListener('touchmove'")), ctx);
  handler({ deltaY: 100, deltaX: 0, preventDefault: () => { prevented = true; }, ...overrides });
  return { zooms, prevented, hint: !hint.hidden };
}
test('Cmd and Ctrl wheel zoom the map without zooming the browser', () => {
  for (const key of ['metaKey', 'ctrlKey']) assert.deepEqual(wheel({ [key]: true }), { zooms: 1, prevented: true, hint: false });
});
test('plain and Shift wheel preserve page scrolling', () => {
  for (const event of [{}, { shiftKey: true }]) assert.deepEqual(wheel(event), { zooms: 0, prevented: false, hint: true });
});
test('fullscreen map retains direct wheel zoom', () => {
  assert.equal(wheel({}, true).zooms, 1);
});
