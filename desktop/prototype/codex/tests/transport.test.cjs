'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const { once } = require('node:events');
const { CodexTransport } = require('../transport.cjs');

const fixture = path.join(__dirname, 'fixtures/fake-server.cjs');
function transport(t, options = {}) {
  const instance = new CodexTransport({ command: process.execPath, args: [fixture], requestTimeoutMs: 1500, shutdownGraceMs: 50, ...options });
  t.after(() => instance.stop());
  return instance;
}

test('initializes once for concurrent and already running starts, with trusted spawn context', async (t) => {
  const server = transport(t, { cwd: __dirname, env: { ...process.env, TRANSPORT_TEST_MARKER: 'literal $(never)' } });
  const first = server.start();
  assert.equal(server.start(), first);
  assert.deepEqual(await first, { userAgent: 'fake-app-server' });
  await server.start();
  const stats = await server.request('stats');
  assert.equal(stats.initializes, 1);
  assert.equal(stats.initialized, 1);
  assert.deepEqual(stats.initializeParams, { clientInfo: { name: 'travel_planner_desktop', title: 'Travel Planner', version: '0.1.0' } });
  assert.equal(stats.cwd, __dirname);
  assert.equal(stats.marker, 'literal $(never)');
});

test('correlates responses received out of order', async (t) => {
  const server = transport(t);
  await server.start();
  assert.deepEqual(await Promise.all([server.request('hold', { value: 1 }), server.request('hold', { value: 2 })]), [{ value: 1 }, { value: 2 }]);
});

test('decodes UTF-8 split across stdout chunks and emits notifications separately', async (t) => {
  const server = transport(t);
  await server.start();
  const notice = once(server, 'notification');
  assert.equal(await server.request('chunked'), 'ok');
  assert.deepEqual(await notice, ['account/updated', { label: '旅行' }]);
});

test('returns server error code and data without closing the connection', async (t) => {
  const server = transport(t);
  await server.start();
  await assert.rejects(server.request('remote-error'), { code: -32001, message: 'Fake request rejected', data: { reason: 'fixture' } });
  assert.equal(await server.request('echo', 'still connected'), 'still connected');
});

test('rejects unknown server requests instead of approving or confusing them with replies', async (t) => {
  const server = transport(t);
  await server.start();
  const result = await server.request('approval');
  assert.equal(result.rejected.code, -32601);
});

test('timeouts are bounded and mutation timeouts are uncertain, with no retry', async (t) => {
  const server = transport(t);
  await server.start();
  await assert.rejects(server.request('hang', {}, { timeoutMs: 35 }), { code: 'REQUEST_TIMEOUT' });
  await assert.rejects(server.request('hang', {}, { timeoutMs: 35, uncertainOnTimeout: true }), { code: 'UNKNOWN_RESULT' });
  assert.equal((await server.request('stats')).calls, 3);
});

for (const method of ['malformed', 'invalid-envelope', 'invalid-utf8', 'oversized', 'oversized-line']) {
  test(`fails closed on ${method}, rejects all pending work and stops the child`, async (t) => {
    const server = transport(t, { maxLineBytes: 1024 });
    await server.start();
    const closed = once(server, 'close');
    const waiting = assert.rejects(server.request('hang'), { code: 'PROTOCOL_ERROR' });
    await assert.rejects(server.request(method), { code: 'PROTOCOL_ERROR' });
    await waiting;
    await closed;
    await assert.rejects(server.request('stats'), { code: 'NOT_RUNNING' });
  });
}

test('child exit promptly rejects pending requests including a partial trailing message', async (t) => {
  const server = transport(t);
  await server.start();
  const waiting = assert.rejects(server.request('hang'), { code: 'CHILD_EXIT' });
  await assert.rejects(server.request('partial-exit'), { code: 'CHILD_EXIT' });
  await waiting;
});

test('spawn errors reject initialization without an unhandled error event', async (t) => {
  const server = transport(t, { command: path.join(__dirname, 'does-not-exist') });
  await assert.rejects(server.start(), { code: 'CHILD_ERROR' });
  await server.stop();
});

test('initialization timeout stops the process and allows a clean subsequent failure', async (t) => {
  const server = transport(t, { args: [fixture, 'initialize-hang'], requestTimeoutMs: 80 });
  await assert.rejects(server.start(), { code: 'REQUEST_TIMEOUT' });
  await server.stop();
  await assert.rejects(server.start(), { code: 'REQUEST_TIMEOUT' });
});

test('bounds the whole handshake when initialized is queued behind a blocked stdin write', async (t) => {
  const server = transport(t, { args: [fixture, 'initialize-backpressure'], requestTimeoutMs: 100 });
  let inputPaused = false;
  server.on('notification', (method) => { if (method === 'fixture/input-paused') inputPaused = true; });
  let watchdog;
  const outcome = await Promise.race([
    server.start().then(() => 'unexpected success', (error) => error.code),
    new Promise((resolve) => { watchdog = setTimeout(() => resolve('START_STILL_PENDING'), 1000); }),
  ]);
  clearTimeout(watchdog);
  assert.equal(inputPaused, true, 'the fake server delivered its initialize response and paused stdin');
  assert.equal(outcome, 'REQUEST_TIMEOUT');
  assert.equal(server.state, 'stopped', 'failed startup must finish bounded teardown before rejecting');
});

test('stop rejects pending work, is idempotent and permits restart after exit', async (t) => {
  const server = transport(t);
  await assert.rejects(server.request('stats'), { code: 'NOT_RUNNING' });
  await server.start();
  const waiting = assert.rejects(server.request('hang'), { code: 'STOPPED' });
  const stopping = server.stop();
  assert.equal(server.stop(), stopping);
  await assert.rejects(server.start(), { code: 'STOPPING' });
  await stopping;
  await waiting;
  await server.start();
  assert.equal((await server.request('stats')).initializes, 1);
});

test('stop during initialization rejects start and waits for process exit', async (t) => {
  const server = transport(t, { args: [fixture, 'initialize-hang'] });
  const starting = assert.rejects(server.start(), { code: 'STOPPED' });
  const closed = once(server, 'close');
  await server.stop();
  await starting;
  await closed;
});

test('stop terminates a child ignoring EOF, escalating on POSIX', async (t) => {
  const server = transport(t, { args: [fixture, 'stubborn'] });
  await server.start();
  const closed = once(server, 'close');
  await server.stop();
  const closeEvent = (await closed)[0];
  // Windows terminates on SIGTERM instead of running the child's POSIX handler.
  if (process.platform !== 'win32') assert.equal(closeEvent.signal, 'SIGKILL');
  assert.equal(server.state, 'stopped');
});

test('drains and discards large stderr without blocking requests', async (t) => {
  const server = transport(t);
  await server.start();
  assert.equal(await server.request('stderr'), true);
});

test('a disconnected stdout rejects pending requests without waiting for their timeout', async (t) => {
  const server = transport(t);
  await server.start();
  await assert.rejects(server.request('close-output'), { code: 'CHILD_DISCONNECTED' });
});

test('late responses after timeout do not resolve newer requests', async (t) => {
  const server = transport(t);
  await server.start();
  await assert.rejects(server.request('late', {}, { timeoutMs: 15 }), { code: 'REQUEST_TIMEOUT' });
  const wait = assert.rejects(server.request('hang', {}, { timeoutMs: 100 }), { code: 'REQUEST_TIMEOUT' });
  await wait;
  assert.equal(await server.request('echo', 'next request'), 'next request');
});

test('limits pending requests and frees capacity when stopped', async (t) => {
  const server = transport(t);
  await server.start();
  const pending = Array.from({ length: 128 }, () => assert.rejects(server.request('hang'), { code: 'STOPPED' }));
  await assert.rejects(server.request('hang'), { code: 'BACKPRESSURE' });
  await server.stop();
  await Promise.all(pending);
  await server.start();
  assert.equal(await server.request('echo', 'new process'), 'new process');
});

test('rejects oversized, circular and reserved requests without sending them', async (t) => {
  const server = transport(t, { maxLineBytes: 1024 });
  await server.start();
  await assert.rejects(server.request('echo', 'x'.repeat(2048)), { code: 'REQUEST_TOO_LARGE' });
  const cycle = {};
  cycle.self = cycle;
  await assert.rejects(server.request('echo', cycle), { code: 'INVALID_REQUEST' });
  await assert.rejects(server.request('initialize'), { code: 'INVALID_REQUEST' });
  await assert.rejects(server.request('initialized'), { code: 'INVALID_REQUEST' });
  assert.equal((await server.request('stats')).calls, 1);
});

test('rejects invalid timer and line limits instead of unbounded or overflowing timers', async (t) => {
  for (const options of [{ requestTimeoutMs: 0 }, { requestTimeoutMs: Infinity }, { shutdownGraceMs: -1 }, { maxLineBytes: 0 }]) {
    assert.throws(() => transport(t, options), TypeError);
  }
  const server = transport(t);
  await server.start();
  await assert.rejects(server.request('stats', {}, { timeoutMs: 2 ** 31 }), TypeError);
});
