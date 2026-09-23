const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseLiteralModule } = require('../literal-data.cjs');
const { replaceDay } = require('../day-edit.cjs');

const day = { id: 1, date: '10/11（日）', title: '抵達', stops: [], cautions: [] };
const next = { ...day, title: '散步', cautions: ['先確認開放時間'] };
const literal = JSON.stringify(day);
const other = { ...day, id: 2, date: '10/12（一）' };
const inline = `/* file */ module.exports = { PLACES: {}, DAYS: [/* before */ ${literal} /* after */, ${JSON.stringify(other)}], CHECKLIST: ['保留'] }; // end`;

test('changes only the chosen expression and preserves every surrounding byte', () => {
  const result = replaceDay(inline, 1, next);
  const start = inline.indexOf(literal);
  assert.equal(result.source.slice(0, start), inline.slice(0, start));
  assert.ok(result.source.endsWith(inline.slice(start + literal.length)));
  assert.deepEqual(result.before, day);
  assert.deepEqual(result.after, next);
  assert.equal(result.changed, true);
  assert.deepEqual(parseLiteralModule(result.source), { PLACES: {}, DAYS: [next, other], CHECKLIST: ['保留'] });
});

for (const wrap of [
  `const DAYS = [${literal}]; module.exports = { DAYS };`,
  `const one = ${literal}; const alias = one; const rows = [alias]; const DAYS = rows; const output = { DAYS }; module.exports = output;`,
  `const DAYS = [${literal}]; if (typeof module !== 'undefined') { module.exports = { DAYS }; }`,
]) test('supports exclusive constants and guarded exports: ' + wrap.slice(0, 35), () => {
  assert.deepEqual(parseLiteralModule(replaceDay(wrap, 1, next).source).DAYS, [next]);
});

test('unchanged proposal retains the original text exactly', () => {
  assert.deepEqual(replaceDay(inline, 1, day), { source: inline, before: day, after: day, changed: false });
});

test('edits a copy of the public template data without changing other exported data', () => {
  const source = fs.readFileSync(path.join(__dirname, '../../../trips/_example/data.js'), 'utf8');
  const before = parseLiteralModule(source);
  const replacement = { ...before.DAYS[1], title: '較輕鬆的一天' };
  const after = parseLiteralModule(replaceDay(source, 2, replacement).source);
  assert.deepEqual(after, { ...before, DAYS: [before.DAYS[0], replacement, ...before.DAYS.slice(2)] });
});

for (const proposal of [
  { ...next, id: 2 }, { ...next, id: '1' }, { ...next, date: 'tomorrow' },
  { ...next, title: [] }, { ...next, theme: 5 }, { ...next, lead: null }, { ...next, color: false },
  { ...next, stops: {} }, { ...next, alts: 'x' }, { ...next, cautions: {} },
  { ...next, unexpected: true }, { ...next, stops: [undefined] },
  { ...next, stops: [NaN] }, { ...next, stops: [new Date()] },
  { ...next, stops: [() => true] }, { ...next, stops: [1n] },
  JSON.parse('{"id":1,"date":"10/11（日）","__proto__":{}}'),
  { ...next, stops: [JSON.parse('{"constructor":1}')] },
]) test('rejects invalid or unsafe replacement data ' + String(Object.keys(proposal).join(',')), () => {
  assert.throws(() => replaceDay(inline, 1, proposal));
});

test('allows original custom fields and known optional fields', () => {
  const original = { ...day, custom: 'retained' };
  const replacement = { ...original, lead: '新描述', alts: [] };
  assert.deepEqual(replaceDay(`module.exports = { DAYS: [${JSON.stringify(original)}] };`, 1, replacement).after, replacement);
});

test('preserves negative zero and other JSON values when editing a title', () => {
  const source = `module.exports = { DAYS: [{ id: 1, date: '10/11（日）', title: '抵達', custom: -0,
    stops: [], alts: [], cautions: [], values: [-0, 0, -1.5, 1e30, null, true, false,
    { nested: -0, empty: {}, list: [], text: '"negative": -0 \\n \\"' }] }] };`;
  const original = parseLiteralModule(source);
  const replacement = { ...original.DAYS[0], title: '散步' };
  const result = replaceDay(source, 1, replacement);
  assert.equal(result.changed, true);
  assert.deepEqual(parseLiteralModule(result.source).DAYS[0], replacement);
  assert.ok(Object.is(parseLiteralModule(result.source).DAYS[0].custom, -0));
  assert.ok(Object.is(parseLiteralModule(result.source).DAYS[0].values[0], -0));
  assert.ok(Object.is(parseLiteralModule(result.source).DAYS[0].values[7].nested, -0));
});

test('rejects accessors without running them', () => {
  let called = false;
  const proposal = { ...next };
  Object.defineProperty(proposal, 'lead', { enumerable: true, get() { called = true; return 'x'; } });
  assert.throws(() => replaceDay(inline, 1, proposal));
  assert.equal(called, false);
});

test('rejects proxies without invoking their traps', () => {
  let called = false;
  const proposal = new Proxy(next, { ownKeys() { called = true; return []; } });
  assert.throws(() => replaceDay(inline, 1, proposal));
  assert.equal(called, false);
});

test('rejects non-JSON array and object properties', () => {
  const extraArray = []; extraArray.custom = true;
  const symbolic = { ...next, [Symbol('hidden')]: true };
  const hidden = { ...next };
  Object.defineProperty(hidden, 'lead', { value: 'hidden' });
  for (const proposal of [symbolic, hidden, { ...next, stops: [,] }, { ...next, stops: extraArray }]) {
    assert.throws(() => replaceDay(inline, 1, proposal));
  }
});

test('retains CRLF outside the selected day and detaches returned data', () => {
  const source = `const DAYS = [\r\n  ${literal},\r\n  ${JSON.stringify(other)}\r\n];\r\nmodule.exports = { DAYS };\r\n`;
  const proposal = { ...next, stops: [{ place: 'public-example' }] };
  const result = replaceDay(source, 1, proposal);
  assert.equal(result.source.replace(/\r\n/g, '').includes('\n'), false);
  proposal.stops[0].place = 'mutated';
  assert.equal(result.after.stops[0].place, 'public-example');
});

test('rejects cycles, excessive depth and oversized text', () => {
  const cycle = { ...next }; cycle.stops = [cycle];
  assert.throws(() => replaceDay(inline, 1, cycle));
  let nested = {};
  for (let i = 0; i < 140; i++) nested = { child: nested };
  assert.throws(() => replaceDay(inline, 1, { ...next, stops: [nested] }));
  assert.throws(() => replaceDay(inline, 1, { ...next, lead: 'x'.repeat(4 * 1024 * 1024 + 1) }));
});

for (const source of [
  `const d = ${literal}; module.exports = { DAYS: [d], OTHER: d };`,
  `const d = ${literal}; const unused = d; module.exports = { DAYS: [d] };`,
  `const rows = [${literal}]; module.exports = { DAYS: rows, OTHER: rows };`,
  `module.exports = { DAYS: [${literal}, ${literal}] };`,
  'module.exports = { DAYS: attack() };',
  'module.exports = { DAYS: [] };',
]) test('rejects ambiguous references, duplicate IDs and executable source: ' + source.slice(0, 40), () => {
  assert.throws(() => replaceDay(source, 1, next));
});

test('rejects absent IDs and invalid ID argument types', () => {
  for (const id of [3, '1', 1.5, null, undefined]) assert.throws(() => replaceDay(inline, id, next));
});
