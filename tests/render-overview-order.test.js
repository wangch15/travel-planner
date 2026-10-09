const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT } = require('../scripts/lib/paths.js');
const { renderContext } = require('./helpers/render-ctx.js');
const { makeTrip } = require('./fixtures/make-trip.js');

const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

test('overview leads with the daily outline, then stays, then dining', () => {
  // Arrange
  const trip = makeTrip();
  trip.OVERVIEW = { ...trip.OVERVIEW, dining: { hint: '餐食說明', notes: ['一則'], chips: [] } };
  const ctx = renderContext(trip, [read('src/util.js'), read('src/render.js')]);

  // Act
  const html = ctx.overviewHTML();
  const at = (needle) => html.indexOf(needle);

  // Assert
  const days = at('天主軸'), stays = at('class="rail"'), dining = at('餐食與訂位');
  assert.ok(days > -1 && stays > -1 && dining > -1, 'all three sections render');
  assert.ok(days < stays, 'daily outline comes before stays');
  assert.ok(stays < dining, 'stays come before dining');
});
