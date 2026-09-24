const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { randomUUID } = require('node:crypto');
const { execFile, spawn: spawnDefault } = require('node:child_process');
const { StringDecoder } = require('node:string_decoder');
const PINNED_WRANGLER = '4.135.0';
const fail = code => Object.assign(new Error(code), { code });
const cleanName = value => String(value || '').replace(/[\x00-\x1f\x7f]/g, '').trim().slice(0, 160);
const PROVIDERS = new Set(['github', 'cloudflare']);
function sanitizeAccounts(info) {
  if (!info || info.loggedIn !== true || !Array.isArray(info.accounts) || info.accounts.length > 100) return [];
  if (info.accounts.some(account => !account || !/^[a-f0-9]{32}$/i.test(account.id) || typeof account.name !== 'string')) throw fail('INVALID_ACCOUNT_RESPONSE');
  return info.accounts.map(account => ({ id: account.id, name: cleanName(account.name) }));
}
const { wranglerArgs } = require('./wrangler-launch.cjs');
function installedWrangler() {
  const manifest = require('wrangler/package.json');
  if (manifest.version !== PINNED_WRANGLER) throw fail('WRANGLER_VERSION_REQUIRED');
  // The official bin wrapper spawns another Node process; own the actual CLI for cancellation.
  return path.join(path.dirname(require.resolve('wrangler/package.json')), 'wrangler-dist', 'cli.js');
}
async function defaultRun(bin, args, options) {
  return new Promise(resolve => {
    const child = execFile(bin, args, { ...options, timeout: 10000, maxBuffer: 128 * 1024, encoding: 'utf8', windowsHide: true }, (error, stdout, stderr) => resolve({
      status: error ? (typeof error.code === 'number' ? error.code : null) : 0, stdout, stderr, ...(error ? { error } : {}),
    })); child.stdin?.end();
  });
}
class AuthTools {
  constructor({ run = defaultRun, spawn = spawnDefault, onProgress = () => {}, env = process.env, wranglerPath, timeoutMs = 300000 } = {}) {
    this.run = run; this.spawn = spawn; this.onProgress = onProgress; this.env = { ...env }; this.wranglerPath = wranglerPath;
    this.timeoutMs = Math.max(1, Math.min(timeoutMs, 300000)); this.active = null; this.starting = false; this.closed = false;
  }
  provider(value) { if (!PROVIDERS.has(value)) throw fail('INVALID_AUTH_PROVIDER'); return value; }
  environment(provider, login = false) {
    const env = Object.fromEntries(Object.entries(this.env).filter(([key]) => !/^(NODE_OPTIONS$|NODE_PATH$|LD_|DYLD_|GIT_|CI$|GH_PROMPT_DISABLED$)/.test(key)));
    Object.assign(env, { NO_COLOR: '1', FORCE_COLOR: '0' });
    if (provider === 'github') { env.GH_HOST = 'github.com'; if (!login) env.GH_PROMPT_DISABLED = '1'; }
    else Object.assign(env, { ELECTRON_RUN_AS_NODE: '1', WRANGLER_SEND_METRICS: 'false' });
    return env;
  }
  async workspace() {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'travel-auth-')); await fs.chmod(directory, 0o700);
    const config = path.join(directory, 'wrangler.json');
    await fs.writeFile(config, JSON.stringify({ name: 'travel-planner-auth', compatibility_date: '2026-09-22' }), { flag: 'wx', mode: 0o600 });
    return { directory, config };
  }
  command(provider, action, workspace) {
    if (provider === 'github') return { bin: process.platform === 'win32' ? 'gh.exe' : 'gh', args: action === 'login'
      ? ['auth', 'login', '--hostname', 'github.com', '--git-protocol', 'https', '--web', '--skip-ssh-key']
      : ['auth', 'status', '--hostname', 'github.com'] };
    return { bin: process.execPath, args: wranglerArgs(this.wranglerPath || installedWrangler(), [action === 'login' ? 'login' : 'whoami', ...(action === 'login' ? [] : ['--json']), '--config', workspace.config]) };
  }
  async status(provider) {
    this.provider(provider); let workspace;
    try {
      workspace = await this.workspace();
      const command = this.command(provider, 'status', workspace);
      const result = await this.run(command.bin, command.args, { cwd: workspace.directory, env: this.environment(provider) });
      const success = Boolean(result) && !result.error && (result.status === undefined || result.status === 0);
      if (provider === 'github') return { provider, connected: success, accounts: [], sharedWithCLI: true };
      if (!success) return { provider, connected: false, accounts: [], sharedWithCLI: true };
      const info = JSON.parse(result.stdout), accounts = sanitizeAccounts(info);
      return { provider, connected: info.loggedIn === true, accounts, sharedWithCLI: true };
    } catch { return { provider, connected: false, accounts: [], sharedWithCLI: true, message: '尚未確認登入；請檢查工具安裝、授權與網路。' }; }
    finally { if (workspace) await fs.rm(workspace.directory, { recursive: true, force: true }).catch(() => {}); }
  }
  emit(value) { try { this.onProgress(value); } catch { /* UI observer failure cannot change the auth result. */ } }
  async start(provider) {
    this.provider(provider);
    if (this.closed) throw fail('AUTH_CLOSED');
    if (this.active || this.starting) throw fail('AUTH_BUSY');
    const override = provider === 'github' ? ['GH_TOKEN', 'GITHUB_TOKEN'] : ['CLOUDFLARE_API_TOKEN', 'CF_API_TOKEN', 'CLOUDFLARE_API_KEY', 'CF_API_KEY'];
    if (override.some(key => this.env[key])) return { started: false, provider, state: 'environment-auth', sharedWithCLI: true, message: '目前由環境變數提供認證；請先移除該設定，再透過瀏覽器登入。' };
    this.starting = true; let workspace;
    try {
      workspace = await this.workspace(); if (this.closed) throw fail('AUTH_CLOSED'); const command = this.command(provider, 'login', workspace);
      const child = this.spawn(command.bin, command.args, { cwd: workspace.directory, env: this.environment(provider, true), stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
      let complete;
      const active = { id: randomUUID(), provider, child, workspace, reason: null, settled: false, tail: '', outputBytes: 0, entered: false, deviceCode: null,
        decoder: new StringDecoder('utf8'), done: new Promise(resolve => { complete = resolve; }), complete };
      // `complete` is assigned during Promise construction, before the active session is published.
      active.complete = complete; this.active = active;
      const finish = async (code, error = false) => {
        if (active.settled) return; active.settled = true; clearTimeout(active.timer); clearTimeout(active.forceTimer); clearTimeout(active.finishTimer);
        const actual = await this.status(provider);
        const state = active.reason || (error || code !== 0 ? 'failed' : actual.connected ? 'connected' : 'needs-login');
        const result = { ...actual, id: active.id, state, message: state === 'connected' ? '官方工具登入已確認。' : state === 'canceled' ? '已停止這次登入，並重新檢查目前帳號狀態。' : state === 'timed-out' ? '登入等待已到期；請重新開始並在官方頁面完成授權。' : '登入尚未確認完成；請檢查工具與官方授權頁。' };
        active.tail = ''; await fs.rm(workspace.directory, { recursive: true, force: true }).catch(() => {});
        if (this.active === active) this.active = null; this.emit(result); active.complete(result);
      };
      active.finish = finish;
      const receive = bytes => {
        if (active.settled) return; active.outputBytes += Buffer.byteLength(bytes);
        if (active.outputBytes > 256 * 1024) { this.terminate(active, 'failed'); return; }
        active.tail = (active.tail + active.decoder.write(Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes))).replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').slice(-4096);
        if (provider === 'github') {
          const match = /(?:one[- ]time code|device code)[^\r\n]{0,80}?\b([A-Z0-9]{4}-[A-Z0-9]{4})\b/i.exec(active.tail);
          if (match && active.deviceCode !== match[1]) {
            active.deviceCode = match[1].toUpperCase();
            this.emit({ provider, id: active.id, state: 'waiting-browser', deviceCode: active.deviceCode, deviceUrl: 'https://github.com/login/device', sharedWithCLI: true, message: '請在 GitHub 官方頁面輸入一次性代碼，親自完成授權。' });
          }
          if (!active.entered && /press enter to open|press enter.*browser/i.test(active.tail)) { active.entered = true; try { child.stdin?.write('\n'); } catch {} }
        }
      };
      child.stdout?.on('data', receive); child.stderr?.on('data', receive);
      child.once('error', () => { finish(null, true).catch(() => {}); });
      child.once('close', code => { finish(code).catch(() => {}); });
      active.timer = setTimeout(() => this.terminate(active, 'timed-out'), this.timeoutMs); active.timer.unref?.();
      const result = { started: true, id: active.id, provider, state: 'waiting-browser', sharedWithCLI: true, message: '請在開啟的官方網頁親自完成登入。這份授權與本機 CLI 共用。' };
      this.emit(result); return result;
    } catch (error) { if (workspace) await fs.rm(workspace.directory, { recursive: true, force: true }).catch(() => {}); throw fail(['WRANGLER_VERSION_REQUIRED', 'AUTH_CLOSED'].includes(error.code) ? error.code : 'AUTH_START_FAILED'); }
    finally { this.starting = false; }
  }
  terminate(active, reason) {
    if (active !== this.active || active.settled || active.reason) return;
    active.reason = reason;
    try { active.child.kill('SIGTERM'); } catch {}
    active.forceTimer = setTimeout(() => { if (!active.settled) { try { active.child.kill('SIGKILL'); } catch {} } }, 1000); active.forceTimer.unref?.();
    active.finishTimer = setTimeout(() => { if (!active.settled) active.finish(null, true).catch(() => {}); }, 2000); active.finishTimer.unref?.();
  }
  async cancel(provider) {
    this.provider(provider); const active = this.active;
    if (!active || active.provider !== provider) return { ...await this.status(provider), state: 'idle' };
    this.terminate(active, 'canceled'); return active.done;
  }
  async close() { this.closed = true; if (this.active) return this.cancel(this.active.provider); return null; }
}
module.exports = { AuthTools, sanitizeAccounts, installedWrangler };
