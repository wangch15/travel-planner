const test = require('node:test');
const assert = require('node:assert/strict');
const { parseLiteralModule } = require('../literal-data.cjs');

test('literal CommonJS supports constants, shorthand, arrays and static templates', () => {
  assert.deepEqual(parseLiteralModule('const point = { lat: -2.5, title: `景點` }; const rows = [point, null, true]; module.exports = { point, rows };'), {
    point: { lat: -2.5, title: '景點' }, rows: [{ lat: -2.5, title: '景點' }, null, true],
  });
});

for (const source of [
  'require("node:fs").writeFileSync("/tmp/should-not-exist", "x"); module.exports = {};',
  'module.exports = new Date();', 'module.exports = () => 1;',
  'module.exports = { get x() { return 1; } };', 'module.exports = {...{x: 1}};',
  'module.exports = {["x"]: 1};', 'module.exports = {__proto__: {}};',
  'module.exports = {constructor: 1};', 'module.exports = {x: 1, x: 2};',
  'const x = {}; x.a = 1; module.exports = x;', 'let x = 1; module.exports = {x};',
  'module.exports = {}; module.exports = {};', 'exports.x = 1;',
  'module.exports = `${1}`;', 'module.exports = /x/;', 'module.exports = {x: undefined};',
  'module.exports = [,,];', 'const module = {}; module.exports = {};',
]) test('rejects executable or ambiguous syntax: ' + source.slice(0, 45), () => {
  assert.throws(() => parseLiteralModule(source), (e) => e.code === 'INCOMPATIBLE_DATA' && !e.message.includes(source));
});

test('bounds parser input and nesting', () => {
  assert.throws(() => parseLiteralModule(' '.repeat(4 * 1024 * 1024 + 1)), { code: 'INPUT_LIMIT' });
  assert.throws(() => parseLiteralModule('module.exports = ' + '['.repeat(150) + '1' + ']'.repeat(150)), { code: 'INPUT_LIMIT' });
});

for (const body of ['module.exports = MAP_LISTS;', '{ module.exports = MAP_LISTS; }']) test('accepts exact browser/CommonJS export guard: ' + body, () => {
  assert.deepEqual(parseLiteralModule(`const MAP_LISTS = { day1: 'example' }; if (typeof module !== 'undefined') ${body}`), { day1: 'example' });
});

for (const source of [
  "if (typeof module !== 'undefined') module.exports = {}; else module.exports = {};",
  "if (typeof module !== 'undefined') { module.exports = {}; require('node:fs'); }",
  "if (typeof module !== 'undefined') { if (true) module.exports = {}; }",
  "if (typeof module !== 'undefined') module.exports = require('node:fs');",
  "if (typeof module !== 'undefined') module.exports = {}; module.exports = {};",
  "if (typeof module != 'undefined') module.exports = {};",
  "if (typeof exports !== 'undefined') module.exports = {};",
  "if (typeof module === 'undefined') module.exports = {};",
  "if (module !== 'undefined') module.exports = {};",
  "if (typeof module !== `undefined`) module.exports = {};",
  "if (typeof module !== 'undefined' || attack()) module.exports = {};",
  "if (typeof module !== 'undefined') exports.value = {};",
]) test('rejects unsupported or executable export guard: ' + source.slice(0, 70), () => {
  assert.throws(() => parseLiteralModule(source), { code: 'INCOMPATIBLE_DATA' });
});
