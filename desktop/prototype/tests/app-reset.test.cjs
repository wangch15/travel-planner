const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { requestReset, applyPendingReset, MARKER } = require('../services/app-reset.cjs');

function tempState(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'app-reset-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const state = path.join(root, 'Travel Planner');
  fs.mkdirSync(path.join(state, 'conversations'), { recursive: true });
  fs.writeFileSync(path.join(state, 'workspace.json'), '{}');
  return { root, state };
}

test('without a reset request, startup keeps all App data', t => {
  const { state } = tempState(t);
  assert.equal(applyPendingReset(state), false);
  assert.ok(fs.existsSync(path.join(state, 'workspace.json')));
});

test('a requested reset removes the whole App data folder on next startup only', t => {
  const { root, state } = tempState(t);
  const sibling = path.join(root, 'my-trips');
  fs.mkdirSync(sibling);
  requestReset(state);
  assert.ok(fs.existsSync(path.join(state, 'workspace.json')), 'request alone must not delete');
  assert.equal(applyPendingReset(state), true);
  assert.equal(fs.existsSync(state), false);
  assert.ok(fs.existsSync(sibling), 'folders outside App data are untouched');
});

test('a marker naming another folder is ignored', t => {
  const { state } = tempState(t);
  fs.writeFileSync(path.join(state, MARKER), path.join(path.dirname(state), 'other') + '\n');
  assert.equal(applyPendingReset(state), false);
  assert.ok(fs.existsSync(path.join(state, 'workspace.json')));
});

test('refuses relative, root and shallow directories', () => {
  for (const bad of ['relative/dir', path.parse(process.cwd()).root, path.join(path.parse(process.cwd()).root, 'Users')]) {
    assert.throws(() => requestReset(bad), { code: 'UNSAFE_RESET_DIRECTORY' });
    assert.throws(() => applyPendingReset(bad), { code: 'UNSAFE_RESET_DIRECTORY' });
  }
});
