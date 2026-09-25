const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const fs = require('node:fs/promises');
const { AuthTools } = require('../services/auth-tools.cjs');
function fixture(options = {}) {
  const state = { connected: false, calls: [], children: [], progress: [], spawned: [] };
  const run = async (bin, args, opts) => {
    state.calls.push({ bin, args, opts });
    return args.includes('whoami') ? { status: state.connected ? 0 : 1, stdout: JSON.stringify({ loggedIn: state.connected, email: 'PRIVATE_EMAIL', apiToken: 'SECRET_TOKEN', accounts: [{ id: 'a'.repeat(32), name: 'Personal\n Account', extra: 'SECRET' }] }) }
      : { status: state.connected ? 0 : 1, stdout: 'token: SECRET_TOKEN' };
  };
  const spawn = (bin, args, opts) => {
    const child = new EventEmitter(); child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.stdin = new PassThrough(); child.signals = []; child.input = '';
    child.stdin.on('data', bytes => { child.input += bytes; });
    child.kill = signal => { child.signals.push(signal); queueMicrotask(() => child.emit('close', null)); return true; };
    state.children.push(child); state.spawned.push({ bin, args, opts }); return child;
  };
  const tools = new AuthTools({ run, spawn, env: {}, wranglerPath: '/trusted/wrangler/cli.js', onProgress: value => state.progress.push(value), ...options });
  return { state, tools };
}
test('GitHub login returns before browser completion, exposes only device code, writes one newline', async () => {
  const f = fixture(); const started = await f.tools.start('github');
  assert.equal(started.started, true); assert.equal(started.sharedWithCLI, true);
  const command = f.state.spawned[0]; assert.deepEqual(command.args, ['auth', 'login', '--hostname', 'github.com', '--git-protocol', 'https', '--web', '--skip-ssh-key']);
  const child = f.state.children[0];
  child.stderr.write('token=ghp_SUPER_SECRET\n! First copy your one-time co');
  child.stderr.write('de: ABCD-1234\nPress Enter to open github.com in your browser\n');
  child.stderr.write('Press Enter to open github.com in your browser\n');
  assert.equal(child.input, '\n');
  const code = f.state.progress.find(p => p.deviceCode); assert.equal(code.deviceCode, 'ABCD-1234'); assert.equal(code.deviceUrl, 'https://github.com/login/device');
  const done = f.tools.active.done; f.state.connected = true; child.emit('close', 0);
  const result = await done; assert.equal(result.connected, true); assert.equal(result.state, 'connected');
  assert.doesNotMatch(JSON.stringify(f.state.progress), /SUPER_SECRET|SECRET_TOKEN/);
  await assert.rejects(fs.stat(command.opts.cwd), { code: 'ENOENT' });
});
test('Cloudflare credentials remain shared and response includes only account id/name', async () => {
  const f = fixture({ env: { NODE_OPTIONS: '--import malicious.js', CLOUDFLARE_ACCOUNT_ID: 'a'.repeat(32) } });
  const started = await f.tools.start('cloudflare'); assert.equal(started.state, 'waiting-browser');
  const command = f.state.spawned[0]; assert.equal(command.bin, process.execPath); assert.equal(command.args[0], require('../services/wrangler-launch.cjs').LAUNCHER); assert.equal(command.args[1], '/trusted/wrangler/cli.js'); assert.equal(command.args[2], 'login');
  assert.equal(command.opts.env.ELECTRON_RUN_AS_NODE, '1'); assert.equal(command.opts.env.NODE_OPTIONS, undefined);
  const child = f.state.children[0], done = f.tools.active.done; child.stdout.write('Opening OAuth URL https://example.invalid/?state=PRIVATE_TOKEN\n'); f.state.connected = true; child.emit('close', 0);
  const result = await done; assert.deepEqual(result.accounts, [{ id: 'a'.repeat(32), name: 'Personal Account' }]);
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE_EMAIL|SECRET_TOKEN|extra/);
  assert.doesNotMatch(JSON.stringify(f.state.progress), /PRIVATE_TOKEN/);
});
test('cancel terminates only its owned process and reports actual current connection', async () => {
  const f = fixture(); await f.tools.start('github');
  await assert.rejects(f.tools.start('cloudflare'), { code: 'AUTH_BUSY' });
  f.state.connected = true;
  const result = await f.tools.cancel('github');
  assert.equal(result.state, 'canceled'); assert.equal(result.connected, true);
  assert.deepEqual(f.state.children[0].signals, ['SIGTERM']); assert.equal(f.tools.active, null);
});
test('bounded timeout stops OAuth without claiming authentication success', async () => {
  const f = fixture({ timeoutMs: 5 }); await f.tools.start('cloudflare'); const done = f.tools.active.done;
  await new Promise(resolve => setTimeout(resolve, 20));
  const result = await done; assert.equal(result.state, 'timed-out'); assert.equal(result.connected, false);
  assert.equal(f.state.children[0].signals.length, 1);
});
test('environment token override and invalid provider never start an OAuth process', async () => {
  const f = fixture({ env: { GH_TOKEN: 'SECRET_TOKEN' } });
  const result = await f.tools.start('github'); assert.equal(result.started, false); assert.equal(result.state, 'environment-auth');
  assert.doesNotMatch(JSON.stringify(result), /SECRET_TOKEN/); assert.equal(f.state.children.length, 0);
  await assert.rejects(f.tools.start('arbitrary'), { code: 'INVALID_AUTH_PROVIDER' });
});
test('status failures and oversized child logs are sanitized', async () => {
  const f = fixture({ run: async () => { throw new Error('PRIVATE_STACK_AND_TOKEN'); } });
  assert.equal((await f.tools.status('cloudflare')).connected, false);
  await f.tools.start('github'); const done = f.tools.active.done; f.state.children[0].stderr.write(Buffer.alloc(256 * 1024 + 1, 65));
  const result = await done; assert.equal(result.state, 'failed'); assert.doesNotMatch(JSON.stringify(result), /PRIVATE_STACK_AND_TOKEN/);
});

test('shutdown during workspace preparation cannot start a late browser login', async () => {
  const f = fixture(), original = f.tools.workspace.bind(f.tools); let release;
  const gate = new Promise(resolve => { release = resolve; });
  f.tools.workspace = async () => { const workspace = await original(); await gate; return workspace; };
  const starting = f.tools.start('github'); await f.tools.close(); release();
  await assert.rejects(starting, { code: 'AUTH_CLOSED' }); assert.equal(f.state.children.length, 0);
});
test('GitHub login without GitHub CLI says to install it instead of a vague failure', async () => {
  const f = fixture(); await f.tools.start('github');
  const done = new Promise(resolve => { const check = () => { const last = f.state.progress.at(-1); if (last?.state === 'failed') resolve(last); else setTimeout(check, 5); }; check(); });
  f.state.children[0].emit('error', Object.assign(Error('spawn gh.exe ENOENT'), { code: 'ENOENT' }));
  const result = await done;
  assert.match(result.message, /還沒有 GitHub CLI/);
});
