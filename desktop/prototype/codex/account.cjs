const { EventEmitter } = require('node:events');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { CodexTransport } = require('./transport.cjs');
const { prepareRuntime } = require('./policy.cjs');
const run = promisify(execFile);

class CodexAccount extends EventEmitter {
  constructor(directory, options = {}) {
    super(); this.directory = directory; this.command = options.command || process.env.TRAVEL_PLANNER_CODEX_PATH || (process.platform === 'win32' ? 'codex.exe' : 'codex');
    this.prepare = options.prepareRuntime || prepareRuntime;
    this.readVersion = options.readVersion || (async runtime => (await run(this.command, ['--version'], { env: runtime.env, cwd: runtime.work, timeout: 5000, maxBuffer: 4096 })).stdout.trim());
    this.makeTransport = options.makeTransport || (options => new CodexTransport(options));
    this.transport = null; this.connecting = null; this.loginId = null;
    this.generation = 0; this.stopping = null;
    this.authEpoch = 0; this.readSequence = 0; this.switchPromise = null;
    this.mode='normal';this.modeSwitch=null;this.cliVersion=null;
    this.account = { state: 'disconnected', label: null, version: null };
  }
  // Research mode may also attach the App's own loopback research server; a changed endpoint restarts app-server.
  async ensureMode(mode,researchTools=null){
    if(!['normal','research'].includes(mode))throw Error('invalid-runtime-mode');
    if(this.modeSwitch)await this.modeSwitch;
    const endpoint=mode==='research'&&researchTools?{name:researchTools.name,url:researchTools.url,token:researchTools.token}:null;
    if(this.mode===mode&&JSON.stringify(this.researchEndpoint||null)===JSON.stringify(endpoint))return this.connect();
    this.modeSwitch=(async()=>{await this.stop();this.mode=mode;this.researchEndpoint=endpoint;return this.connect();})();
    try{return await this.modeSwitch;}finally{this.modeSwitch=null;}
  }
  connect() {
    if (this.stopping) return Promise.reject(Error('connection-stopping'));
    if (this.connecting) return this.connecting;
    if (this.transport?.state === 'ready') return Promise.resolve(this.account);
    const generation = ++this.generation;
    this.connecting = this._connect(generation).finally(() => { this.connecting = null; });
    return this.connecting;
  }
  async _connect(generation) {
    const runtime = await this.prepare(this.directory);
    if (generation !== this.generation) throw Error('connection-canceled');
    // The app-server handshake and per-turn policy checks decide compatibility;
    // --version is diagnostic only, not a list of allowed releases.
    let version=null;
    try { version=/^codex-cli (\d+\.\d+\.\d+(?:-[\w.-]{1,50})?)$/.exec(await this.readVersion(runtime))?.[1]||null; } catch (error) { if (error.code === 'ENOENT') throw error; }
    if (generation !== this.generation) throw Error('connection-canceled');
    this.cliVersion=version;
    const research=this.mode==='research'?this.researchEndpoint:null;
    const mcpArgs=research?['-c',`mcp_servers.${research.name}.url=${JSON.stringify(research.url)}`,'-c',`mcp_servers.${research.name}.bearer_token_env_var="TP_RESEARCH_TOKEN"`]:[];
    const env={...runtime.env};if(research)env.TP_RESEARCH_TOKEN=research.token;else delete env.TP_RESEARCH_TOKEN;
    const transport = this.makeTransport({ command: this.command, args: ['app-server','--stdio','--strict-config',...(this.mode==='research'?['-c','web_search="live"','-c','features.search_tool=true','-c','features.code_mode=true','-c','features.code_mode_host=true',...mcpArgs]:[])], env, cwd: runtime.work, maxLineBytes: 4 * 1024 * 1024, requestTimeoutMs: 20000 });
    this.transport = transport;
    transport.on('notification', (method, params) => {
      if (transport !== this.transport || generation !== this.generation) return;
      if (method === 'account/login/completed') {
        if (params.loginId !== this.loginId || !this.loginId) return;
        this.loginId = null;
        if (params.success) this.refresh().catch(() => this.emit('changed', { state: 'error' }));
        else { this.account = { ...this.account, state: 'login-failed' }; this.emit('changed', this.account); }
      }
      if (method === 'account/updated' && !this.switchPromise) this.refresh().catch(() => {});
    });
    const disconnected = () => {
      if (transport !== this.transport) return;
      this.authEpoch++;
      this.loginId = null;
      this.account = { state: 'disconnected', label: null, version: this.cliVersion }; this.emit('changed', this.account);
    };
    transport.on('transportError', disconnected);
    transport.on('close', disconnected);
    try {
      const initialized = await transport.start();
      if (generation !== this.generation) throw Error('connection-canceled');
      this.runtime = runtime;
      this.platform = { family: initialized.platformFamily, os: initialized.platformOs };
      return await this.refresh();
    } catch (error) { await transport.stop().catch(() => {}); throw error; }
  }
  async refresh() {
    if (!this.transport || this.transport.state !== 'ready') return this.account;
    const transport = this.transport, epoch = this.authEpoch, sequence = ++this.readSequence;
    const response = await transport.request('account/read', { refreshToken: false });
    if (transport !== this.transport || epoch !== this.authEpoch || sequence !== this.readSequence) return this.account;
    if (response.account && response.account.type !== 'chatgpt') throw Error('unsupported-account-type');
    this.account = { state: response.account ? 'connected' : 'needs-login', label: response.account?.email || null, plan: response.account?.planType || null, version: this.cliVersion };
    this.emit('changed', this.account);
    return this.account;
  }
  async login() {
    await this.connect();
    if (this.account.state === 'connected') return { account: this.account };
    if (this.loginId) throw Error('login-already-pending');
    const transport = this.transport, generation = this.generation;
    const response = await transport.request('account/login/start', { type: 'chatgpt' }, { uncertainOnTimeout: true });
    if (transport !== this.transport || generation !== this.generation) throw Error('connection-canceled');
    if (typeof response.loginId !== 'string' || !response.loginId) throw Error('invalid-login-response');
    const url = new URL(response.authUrl);
    if (url.protocol !== 'https:' || url.hostname !== 'auth.openai.com' || url.username || url.password) {
      if (response.loginId) await this.transport.request('account/login/cancel', { loginId: response.loginId }).catch(() => {});
      throw Error('unexpected-login-url');
    }
    this.loginId = response.loginId;
    this.account = { ...this.account, state: 'waiting-login' }; this.emit('changed', this.account);
    return { authUrl: url.href, account: this.account };
  }
  async cancelLogin() {
    this.authEpoch++;
    if (this.loginId && this.transport?.state === 'ready') await this.transport.request('account/login/cancel', { loginId: this.loginId }, { uncertainOnTimeout: true });
    this.loginId = null; return this.refresh();
  }
  async models() {
    await this.connect();
    if (this.account.state !== 'connected') return [];
    const transport = this.transport, epoch = this.authEpoch;
    const result = await transport.request('model/list', { includeHidden: false });
    if (transport !== this.transport || epoch !== this.authEpoch || this.account.state !== 'connected') return [];
    return (result.data || []).map(model => ({ id: model.id, name: model.displayName || model.id,
      isDefault: Boolean(model.isDefault), inputModalities:model.inputModalities||['text','image'], effort: model.supportedReasoningEfforts || [], defaultEffort: model.defaultReasoningEffort || null }));
  }
  switchAccount() {
    if (this.switchPromise) return this.switchPromise;
    this.switchPromise = this._switchAccount().finally(() => { this.switchPromise = null; });
    return this.switchPromise;
  }
  async _switchAccount() {
    await this.connect();
    const transport = this.transport, generation = this.generation;
    const assertCurrent = () => { if (transport !== this.transport || generation !== this.generation) throw Error('connection-canceled'); };
    this.authEpoch++;
    this.account = {state:'switching',label:null,plan:null,version:this.cliVersion};
    this.emit('changed',this.account);
    try {
      if (this.loginId) {
        const id=this.loginId; this.loginId=null;
        await transport.request('account/login/cancel',{loginId:id},{uncertainOnTimeout:true});
        assertCurrent();
      }
      await transport.request('account/logout',{}, {uncertainOnTimeout:true});
      assertCurrent();
      const checked=await transport.request('account/read',{refreshToken:false});
      assertCurrent();
      if (checked.account) throw Error('logout-not-confirmed');
      // End the old transport so no cached models or account-bound state survives.
      const restarting = ++this.generation;
      await transport.stop();
      if (this.generation !== restarting) throw Error('connection-canceled');
      this.transport=null;
      return await this.login();
    } catch(error) {
      this.account={state:'switch-failed',label:null,plan:null,version:this.cliVersion};
      this.emit('changed',this.account);
      throw error;
    }
  }
  stop() {
    if (this.stopping) return this.stopping;
    this.generation++; this.authEpoch++; this.loginId = null;
    const connecting = this.connecting;
    this.stopping = (async () => {
      await this.transport?.stop();
      if (connecting) await connecting.catch(() => {});
      await this.transport?.stop();
    })().finally(() => { this.stopping = null; });
    return this.stopping;
  }
}
module.exports = { CodexAccount };
