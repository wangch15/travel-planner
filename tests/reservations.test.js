const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { makeTrip } = require('./fixtures/make-trip.js');
const { renderContext } = require('./helpers/render-ctx.js');
const { validate } = require('../packages/engine/schema.cjs');
const { checkOverview } = require('../packages/engine/trip-text.cjs');
const render = trip => renderContext(trip, ['util.js', 'render.js'].map(name => fs.readFileSync(path.join(__dirname, '../src', name), 'utf8'))).overviewHTML();
const reminder = () => ({ id: 'museum-entry', place: 'sightA', days: [2], note: '提前預約入場時段' });
test('reservation reminders have dates, detail actions and independent stable completion keys', () => {
  const trip = makeTrip(); trip.OVERVIEW.reservations = [reminder()];
  trip.config.sections.checklist = false;
  const html = render(trip);
  assert.match(html, /預約提醒/);
  assert.match(html, /data-reservation="museum-entry"/);
  assert.match(html, /data-day="2"[^>]*>Day 2 · 10\/12（一）/);
  assert.match(html, /data-detail="sightA"/);
  assert.match(html, /提前預約入場時段/);
  assert.doesNotMatch(html, /class="checks"/);
});
test('old trips have no reservation section and text stays escaped', () => {
  const trip = makeTrip(); assert.doesNotMatch(render(trip), /reservation-list/);
  trip.OVERVIEW.reservations = [{ ...reminder(), note: '<script>bad</script>' }];
  assert.match(render(trip), /&lt;script&gt;bad/);
});
test('reservation schema accepts explicit reminders and rejects ambiguous or broken references', () => {
  const trip = makeTrip(); trip.OVERVIEW.reservations = [reminder()];
  assert.deepEqual(checkOverview(trip.OVERVIEW), []);
  assert.deepEqual(validate(trip), []);
  for (const change of [{ place: 'missing' }, { days: [99] }, { days: [] }, { id: '' }, { note: '' }, { days: [2, 2] }]) {
    trip.OVERVIEW.reservations = [{ ...reminder(), ...change }];
    assert.ok(validate(trip).some(x => /reservations/.test(x)), JSON.stringify(change));
  }
  trip.OVERVIEW.reservations = [reminder(), reminder()];
  assert.ok(validate(trip).some(x => /reservations/.test(x)));
});
test('moving the last checklist task to reservations does not require changing section settings', () => {
  const trip = makeTrip(); trip.CHECKLIST = [];
  assert.ok(validate(trip).includes('CHECKLIST 為空'));
  trip.OVERVIEW.reservations = [reminder()];
  assert.deepEqual(validate(trip), []);
  assert.doesNotMatch(render(trip), /行前需要補齊的資料/);
  assert.match(render(trip), /預約提醒/);
});
