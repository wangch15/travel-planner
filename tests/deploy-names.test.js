const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { findConflict, conflictMessage } = require('../scripts/lib/deploy-names.js');
const { newTrip } = require('../scripts/new-trip.js');
const { ROOT } = require('../scripts/lib/paths.js');

const A = '_dupa';
const B = '_dupb';
const cleanup = () => [A, B].forEach((s) => fs.rmSync(path.join(ROOT, 'trips', s), { recursive: true, force: true }));
const setName = (slug, name) => {
  const p = path.join(ROOT, 'trips', slug, 'trip.config.json');
  const c = JSON.parse(fs.readFileSync(p, 'utf8'));
  c.deploy = { name, target: 'workers' };
  fs.writeFileSync(p, `${JSON.stringify(c, null, 2)}\n`);
};

test.beforeEach(cleanup);
test.afterEach(cleanup);

test('deploy.name 沒撞到就過', () => {
  newTrip(A); newTrip(B);
  setName(A, 'iceland-2027'); setName(B, 'osaka-2028');
  assert.equal(findConflict(A), null);
  assert.equal(findConflict(B), null);
});

test('兩趟共用同一個 deploy.name 要被抓到', () => {
  newTrip(A); newTrip(B);
  setName(A, 'same-name'); setName(B, 'same-name');
  const c = findConflict(A);
  assert.ok(c, 'should detect the collision');
  assert.equal(c.name, 'same-name');
  assert.deepEqual(c.others, [B]);
});

test('自己不會跟自己撞', () => {
  newTrip(A);
  setName(A, 'only-one');
  assert.equal(findConflict(A), null);
});

test('讀不到別趟的 config 不會整個掛掉', () => {
  newTrip(A); newTrip(B);
  setName(A, 'same-name');
  fs.writeFileSync(path.join(ROOT, 'trips', B, 'trip.config.json'), '{ 壞掉的 json');
  assert.doesNotThrow(() => findConflict(A));
  assert.equal(findConflict(A), null, '讀不到的那趟不該被當成撞名');
});

test('訊息要講清楚會發生什麼，而不是只說「重複」', () => {
  const m = conflictMessage(A, 'same-name', [B]);
  assert.match(m, /same-name/, '要指名是哪個 deploy.name');
  assert.match(m, new RegExp(B), '要指名跟誰撞');
  assert.match(m, /workers\.dev/, '要把網址攤開來講');
  assert.ok(/覆蓋|取代|換掉/.test(m), '要講明後果是線上網站被覆蓋');
  assert.match(m, /trip\.config\.json/, '要說去哪裡改');
});

test('check 會擋下撞名', () => {
  newTrip(A); newTrip(B);
  setName(A, 'same-name'); setName(B, 'same-name');
  const { spawnSync } = require('node:child_process');
  const r = spawnSync('node', ['scripts/check.js', A], { cwd: ROOT, encoding: 'utf8' });
  assert.notEqual(r.status, 0, 'check 應該失敗');
  assert.match(r.stdout + r.stderr, /same-name/, `輸出要提到撞名：\n${r.stdout}${r.stderr}`);
});

test('ship 也要擋——check 繞得過去', () => {
  newTrip(A); newTrip(B);
  setName(A, 'same-name'); setName(B, 'same-name');
  const { spawnSync } = require('node:child_process');
  const r = spawnSync('node', ['scripts/ship.js', A], { cwd: ROOT, encoding: 'utf8' });
  assert.notEqual(r.status, 0, 'ship 應該在部署前失敗');
  const out = r.stdout + r.stderr;
  assert.match(out, /same-name/, `要提到撞名：\n${out}`);
  assert.ok(!/wrangler deploy/.test(out), '不該走到 wrangler');
});
