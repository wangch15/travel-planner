const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT } = require('../scripts/lib/paths.js');
const { renderContext } = require('./helpers/render-ctx.js');
const { makeTrip } = require('./fixtures/make-trip.js');

const util = renderContext(makeTrip(), [fs.readFileSync(path.join(ROOT, 'src/util.js'), 'utf8')]);
const at = (y, m, d, h = 9) => new Date(y, m - 1, d, h, 0, 0);

test('returns the trip day id when today falls inside the trip', () => {
  assert.equal(util.tripDayToday('2026-10-11', 7, at(2026, 10, 11)), 1);
  assert.equal(util.tripDayToday('2026-10-11', 7, at(2026, 10, 12)), 2);
  assert.equal(util.tripDayToday('2026-10-11', 7, at(2026, 10, 17, 23)), 7);
});

test('returns null before and after the trip', () => {
  assert.equal(util.tripDayToday('2026-10-11', 7, at(2026, 10, 10, 23)), null);
  assert.equal(util.tripDayToday('2026-10-11', 7, at(2026, 10, 18, 0)), null);
});

test('uses the local calendar day, not 24-hour offsets from midnight UTC', () => {
  assert.equal(util.tripDayToday('2026-10-11', 7, at(2026, 10, 13, 0)), 3);
  assert.equal(util.tripDayToday('2026-10-11', 7, at(2026, 10, 13, 23)), 3);
});

test('returns null for a missing or malformed start date', () => {
  assert.equal(util.tripDayToday(undefined, 7, at(2026, 10, 12)), null);
  assert.equal(util.tripDayToday('2026/10/11', 7, at(2026, 10, 12)), null);
});

test('counts across a month boundary', () => {
  assert.equal(util.tripDayToday('2026-10-30', 5, at(2026, 11, 2)), 4);
});

test('returns null when the trip has no days', () => {
  assert.equal(util.tripDayToday('2026-10-11', 0, at(2026, 10, 11)), null);
});

test('counts the day after a daylight-saving change correctly', () => {
  assert.equal(util.tripDayToday('2026-10-31', 3, at(2026, 11, 2, 1)), 3);
});
