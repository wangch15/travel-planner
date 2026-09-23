const { EventEmitter } = require('node:events');
const fs = require('node:fs/promises');
const { constants } = require('node:fs');
const path = require('node:path');
const { startProcess, failure } = require('./process.cjs');
const { VERSIONS, prepareRuntime, claudeFlags, geminiFlags } = require('./runtime.cjs');

const MODELS = {
  claude: [{ id: 'sonnet', name: 'Claude Sonnet', isDefault: true }, { id: 'opus', name: 'Claude Opus' }, { id: 'haiku', name: 'Claude Haiku' }],
  gemini: [{ id: 'auto-gemini-3', name: 'Gemini 3（自動選擇）', isDefault: true }, { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro' }, { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash' }],
};
function accountEmail(value) {
  if (typeof value !== 'string' || value.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw failure('PROVIDER_AUTH_INVALID');
  return value.toLowerCase();
}

class CliAccount extends EventEmitter {
  constructor(provider, directory, options = {}) {
    super(); this.provider = provider; this.directory = directory; this.command = options.command || provider;
    this.spawnProcess = options.spawnProcess; this.resolveCommand = options.resolveCommand; this.commandArgs = [];
    this.loginExitGraceMs = options.loginExitGraceMs ?? 1000;
    this.loginStatusAttempts = options.loginStatusAttempts ?? 3;
    this.loginStatusIntervalMs = options.loginStatusIntervalMs ?? 400;
    this.runtime = null; this.connecting = null; this.loginProcess = null;
    this.epoch = 0; this.account = { provider, state: 'disconnected', label: null, version: VERSIONS[provider] };
  }
  changed(state) { this.account = { ...this.account, ...state }; this.emit('changed', this.account); return this.account; }
  connect() {
    if (this.connecting) return this.connecting;
    const epoch = this.epoch;
    this.connecting = (async () => {
      this.runtime ||= await prepareRuntime(this.directory, this.provider);
      if (this.resolveCommand) {
        const resolved = await this.resolveCommand(this.provider);
        if (!resolved || typeof resolved.command !== 'string' || !Array.isArray(resolved.args) || resolved.args.some(a => typeof a !== 'string')) throw failure('PROVIDER_UNAVAILABLE');
        this.command = resolved.command; this.commandArgs = resolved.args;
        if (typeof resolved.env?.PATH === 'string') this.runtime.env.PATH = resolved.env.PATH;
      }
      await this.runtime.assertPolicy();
      const version = await this.run(['--version'], { timeoutMs: 10000, maxBytes: 16384 });
      if (version.stdout.trim() !== VERSIONS[this.provider]) throw failure('UNSUPPORTED_PROVIDER_VERSION');
      if (epoch !== this.epoch) throw failure('AI_CANCELED');
      return await this.refresh();
    })().finally(() => { this.connecting = null; });
    return this.connecting;
  }
  run(args, options = {}) {
    return this.launch(args, this.runtime, { input: '', ...options }).done;
  }
  launch(args, runtime, options = {}) {
    return startProcess(this.command, [...this.commandArgs, ...args], runtime, { spawnProcess: this.spawnProcess, ...options });
  }
  async refresh() {
    if (!this.runtime) return this.connect();
    if (this.loginProcess) {
      if (this.provider !== 'claude') return this.account;
      const epoch = this.epoch;
      await this.runtime.assertPolicy();
      const status = await this.readClaudeStatus();
      if (epoch !== this.epoch || status.state !== 'connected') return this.account;
      return this.changed(status);
    }
    const epoch = this.epoch;
    await this.runtime.assertPolicy();
    let next;
    if (this.provider === 'claude') {
      next = await this.readClaudeStatus();
    } else {
      // Presence is a cached-login hint; only the official CLI reads/refreshed OAuth tokens.
      let cached = false;
      try {
        const stat = await fs.lstat(path.join(this.runtime.home, '.gemini', 'oauth_creds.json'));
        if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > 65536) throw failure('PROVIDER_AUTH_INVALID');
        cached = true;
      } catch (error) { if (error.code !== 'ENOENT') throw error; }
      let label = null;
      if (cached) {
        const handle = await fs.open(path.join(this.runtime.home, '.gemini', 'google_accounts.json'), constants.O_RDONLY | constants.O_NOFOLLOW);
        try {
          const stat = await handle.stat();
          if (!stat.isFile() || stat.nlink !== 1 || stat.size > 65536) throw failure('PROVIDER_AUTH_INVALID');
          label = accountEmail(JSON.parse(await handle.readFile('utf8')).active);
        } finally { await handle.close(); }
      }
      next = { state: cached ? 'connected' : 'needs-login', label, cachedAuth: cached, message: null, authFailure: null };
    }
    if (epoch !== this.epoch) return this.account;
    return this.changed(next);
  }
  async readClaudeStatus() {
    const result = await this.run([...claudeFlags(this.runtime), 'auth', 'status', '--json'], { allowedExitCodes: [0, 1], timeoutMs: 10000, maxBytes: 16384 });
    let auth; try { auth = JSON.parse(result.stdout); } catch { throw failure('PROVIDER_AUTH_INVALID'); }
    if (typeof auth?.loggedIn !== 'boolean') throw failure('PROVIDER_AUTH_INVALID');
    if (auth.loggedIn && (auth.authMethod !== 'claude.ai' || auth.apiProvider !== 'firstParty')) throw failure('SUBSCRIPTION_LOGIN_REQUIRED');
    // Teams/Enterprise can fetch remote managed hooks/settings that outrank host flags.
    if (auth.loggedIn && !['pro', 'max'].includes(auth.subscriptionType)) throw failure('EXTERNAL_PROVIDER_POLICY');
    return { state: auth.loggedIn ? 'connected' : 'needs-login', label: auth.loggedIn ? accountEmail(auth.email) : null,
      plan: auth.subscriptionType || null, message: null, authFailure: null };
  }
  async models() {
    if ((await this.connect()).state !== 'connected') return [];
    // Official CLI aliases, not a claim that the account has access to every model.
    return MODELS[this.provider].map(model => ({ ...model, inputModalities: ['text'], effort: [], defaultEffort: null }));
  }
  async login() {
    await this.connect();
    if (this.account.state === 'connected') return { account: this.account };
    if (this.loginProcess) throw failure('LOGIN_BUSY');
    const epoch = ++this.epoch;
    this.changed({ state: 'waiting-login', label: null, plan: null, message: null, authFailure: null });
    let process, authenticated = false, exitTimer;
    if (this.provider === 'claude') {
      process = this.launch([...claudeFlags(this.runtime), 'auth', 'login', '--claudeai'], this.runtime,
        { input: '', timeoutMs: 300000, maxBytes: 65536, classifyAuthFailure: true });
    } else {
      // ACP authenticate opens the browser itself. No session/prompt RPC is sent.
      const runtime = { ...this.runtime, env: { ...this.runtime.env } }; delete runtime.env.NO_BROWSER;
      runtime.env.GEMINI_CLI_SYSTEM_SETTINGS_PATH = runtime.loginSettings;
      runtime.env.GEMINI_CLI_SYSTEM_DEFAULTS_PATH = runtime.loginSettings;
      let initialized = false;
      process = this.launch([...geminiFlags(runtime), '--acp'], runtime, {
        json: true, timeoutMs: 300000, maxBytes: 65536,
        onMessage: message => {
          if (message.error) throw failure('PROVIDER_AUTH_INVALID');
          if (message.id === 1) {
            if (initialized || message.result?.agentInfo?.version !== '0.46.0'
              || !message.result?.authMethods?.some(m => m.id === 'oauth-personal')) throw failure('POLICY_MISMATCH');
            initialized = true;
            process.send({ jsonrpc: '2.0', id: 2, method: 'authenticate', params: { methodId: 'oauth-personal' } });
          } else if (message.id === 2 && initialized && !authenticated) {
            authenticated = true;
            process.child.stdin.end();
            exitTimer = setTimeout(() => process.cancel(), this.loginExitGraceMs);
          } else if (message.method && message.id !== undefined) {
            process.send({ jsonrpc: '2.0', id: message.id, error: { code: -32601, message: 'Client operations disabled' } });
          }
        },
      });
      process.send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: 1, clientInfo: { name: 'travel-planner', version: '0.1.0' }, clientCapabilities: {} } });
    }
    this.loginProcess = process;
    const finishLogin = async (success, loginError) => {
      clearTimeout(exitTimer);
      if (this.epoch !== epoch) return;
      if (this.provider === 'claude') {
        for (let attempt = 0; attempt < this.loginStatusAttempts; attempt++) {
          try {
            await this.runtime.assertPolicy();
            const status = await this.readClaudeStatus();
            if (this.epoch !== epoch) return;
            if (status.state === 'connected') { this.loginProcess = null; this.changed(status); return; }
          } catch (error) {
            if (this.epoch !== epoch) return;
            this.loginProcess = null;
            const unsupported = error.code === 'SUBSCRIPTION_LOGIN_REQUIRED' || error.code === 'EXTERNAL_PROVIDER_POLICY';
            this.changed({ state: 'error', label: null, plan: null,
              authFailure: unsupported ? 'unsupported-account' : 'status-check',
              message: error.code === 'SUBSCRIPTION_LOGIN_REQUIRED' ? '請使用 Claude Pro 或 Max 官方訂閱帳號登入；App 不會改用付費 API。'
                : error.code === 'EXTERNAL_PROVIDER_POLICY' ? '此帳號或管理原則不支援 App 的隔離設定。'
                  : '無法核對 Claude Code 的登入狀態，請按重新確認。' });
            return;
          }
          if (attempt + 1 < this.loginStatusAttempts) await new Promise(resolve => setTimeout(resolve, this.loginStatusIntervalMs));
          if (this.epoch !== epoch) return;
        }
        this.loginProcess = null;
        const reason = loginError?.authFailure || (success ? 'status-not-saved' : 'login-command');
        const messages = {
          'credential-store': 'Claude Code 無法將登入儲存到這台電腦，請檢查系統鑰匙圈後重試。',
          'oauth-callback': 'Claude Code 未收到有效的授權回傳，請重新從 App 開始登入。',
          network: 'Claude Code 登入時無法連線，請檢查網路後重試。',
          'managed-policy': '這台電腦的管理原則阻止 Claude Code 登入。',
          'status-not-saved': 'Claude Code 已結束登入，但尚未在 App 的獨立設定中找到帳號；請按重新確認。',
          'login-command': 'Claude Code 登入程序未完成，帳號尚未儲存到 App；請重試或按重新確認。',
        };
        this.changed({ state: 'login-failed', label: null, plan: null, authFailure: reason, message: messages[reason] });
        return;
      }
      this.loginProcess = null;
      if (!success && !authenticated) { this.changed({ state: 'login-failed', label: null }); return; }
      const account = await this.refresh();
      if (this.epoch !== epoch) return;
      if (account.state !== 'connected') this.changed({ state: 'login-failed' });
    };
    process.done.then(() => finishLogin(true), error => finishLogin(false, error)).catch(() => {
      if (this.epoch === epoch) { this.loginProcess = null; this.changed({ state: 'login-failed', label: null }); }
    });
    return { account: this.account, browserOpened: true };
  }
  async cancelLogin() {
    ++this.epoch;
    const process = this.loginProcess; this.loginProcess = null;
    process?.cancel(); await process?.done.catch(() => {});
    return this.refresh();
  }
  async switchAccount() {
    if (this.provider !== 'claude') throw failure('ACCOUNT_SWITCH_UNSUPPORTED');
    await this.cancelLogin();
    await this.run([...claudeFlags(this.runtime), 'auth', 'logout'], { timeoutMs: 10000, maxBytes: 16384 });
    if ((await this.refresh()).state === 'connected') throw failure('PROVIDER_LOGOUT_FAILED');
    return this.login();
  }
  async stop() {
    ++this.epoch;
    const process = this.loginProcess; this.loginProcess = null;
    process?.cancel(); await process?.done.catch(() => {});
    this.changed({ state: 'disconnected', label: null });
  }
}
module.exports = { CliAccount, MODELS };
