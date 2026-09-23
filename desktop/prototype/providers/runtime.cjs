const fs = require('node:fs/promises');
const { constants } = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { userInfo } = require('node:os');
const { execFile } = require('node:child_process');
const { failure } = require('./process.cjs');

const VERSIONS = { gemini: '0.46.0' }; // Legacy Gemini adapter only.
async function assertNoExternalPolicy(provider) {
  const systemRoot = provider === 'gemini'
    ? process.platform === 'darwin' ? '/Library/Application Support/GeminiCli/policies' : process.platform === 'win32' ? 'C:\\ProgramData\\gemini-cli\\policies' : '/etc/gemini-cli/policies'
    : process.platform === 'darwin' ? '/Library/Application Support/ClaudeCode' : process.platform === 'win32' ? 'C:\\Program Files\\ClaudeCode' : '/etc/claude-code';
  const candidates = provider === 'claude'
    ? ['managed-settings.json', 'managed-settings.d', 'managed-mcp.json'].map(name => path.join(systemRoot, name))
    : [systemRoot];
  if (provider === 'claude' && process.platform === 'darwin') {
    candidates.push('/Library/Managed Preferences/com.anthropic.claudecode.plist', '/Library/Preferences/com.anthropic.claudecode.plist');
    if (process.env.USER) candidates.push(path.join('/Library/Managed Preferences', process.env.USER, 'com.anthropic.claudecode.plist'));
  }
  for (const file of candidates) {
    try { await fs.lstat(file); throw failure('EXTERNAL_PROVIDER_POLICY'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  if (provider === 'claude' && process.platform === 'win32') {
    // Only ask whether a managed key exists; never read or return registry values.
    const script = "$ErrorActionPreference='Stop'; if ((Test-Path -LiteralPath 'HKLM:\\SOFTWARE\\Policies\\ClaudeCode') -or (Test-Path -LiteralPath 'HKCU:\\SOFTWARE\\Policies\\ClaudeCode')) { 'present' } else { 'absent' }; exit 0";
    let result;
    try {
      result = await new Promise((resolve, reject) => {
        const child = execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script],
          { timeout: 15000, maxBuffer: 1024, windowsHide: true },
          (error, stdout) => error ? reject(error) : resolve({ stdout }));
        // This is a one-shot query, never an interactive terminal. Give the
        // Windows host EOF and an explicit exit instead of leaving stdin open.
        child.stdin?.on('error', () => {});
        child.stdin?.end();
      });
    }
    catch { throw failure('EXTERNAL_PROVIDER_POLICY'); }
    if (result.stdout.trim() !== 'absent') throw failure('EXTERNAL_PROVIDER_POLICY');
  }
}
const CLAUDE_SETTINGS = { forceLoginMethod: 'claudeai', disableAllHooks: true, autoMemoryEnabled: false,
  enabledPlugins: {}, permissions: { defaultMode: 'dontAsk', disableBypassPermissionsMode: 'disable' } };
function geminiSettings(research) {
  return { security: { auth: { selectedType: 'oauth-personal', enforcedType: 'oauth-personal' } },
    general: { enableAutoUpdate: false, enableAutoUpdateNotification: false },
    model: { maxSessionTurns: research ? 8 : 1 },
    context: { fileName: [], memoryBoundaryMarkers: [], includeDirectoryTree: false, discoveryMaxDirs: 0,
      includeDirectories: [], loadMemoryFromIncludeDirectories: false },
    tools: { core: research ? ['google_web_search'] : [], allowed: [], useRipgrep: false },
    mcpServers: {}, hooks: {}, hooksConfig: { enabled: false }, skills: { enabled: false },
    admin: { mcp: { enabled: false }, extensions: { enabled: false }, skills: { enabled: false } },
    experimental: { enableAgents: false, autoMemory: false, extensionReloading: false },
    ide: { enabled: false }, telemetry: { enabled: false }, advanced: { ignoreLocalEnv: true } };
}

async function safeDirectory(directory) {
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  const stat = await fs.lstat(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw failure('POLICY_MISMATCH');
}
async function writeConfig(file, text) {
  const temporary = file + '.' + randomUUID() + '.tmp';
  await fs.writeFile(temporary, text, { flag: 'wx', mode: 0o600 });
  await fs.rename(temporary, file);
}
async function readConfig(file) {
  const handle = await fs.open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.nlink !== 1 || stat.size > 65536) throw failure('POLICY_MISMATCH');
    return await handle.readFile('utf8');
  } finally { await handle.close(); }
}

async function prepareRuntime(directory, provider) {
  if (!path.isAbsolute(directory) || !['claude','gemini'].includes(provider)) throw failure('INVALID_INPUT');
  await assertNoExternalPolicy(provider);
  await safeDirectory(directory);
  const root = await fs.realpath(directory);
  const home = path.join(root, provider + '-profile'), work = path.join(root, provider + '-work');
  const profileDirectories=[home,work,path.join(home,'.gemini'),path.join(work,'.gemini'),...(provider==='claude'?[path.join(home,'.config'),path.join(home,'.config','anthropic')]:[])];
  for(const dir of profileDirectories)await safeDirectory(dir);
  const env = {};
  for (const key of ['PATH', 'SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP', 'TMPDIR', 'LANG', 'LC_ALL', 'USER', 'LOGNAME']) {
    if (process.env[key]) env[key] = process.env[key];
  }
  // macOS Security resolves the login Keychain through the OS user's home.
  // Claude's official config directory isolates credentials/settings without changing it.
  const processHome=provider==='claude'&&process.platform==='darwin'?userInfo().homedir:home;
  Object.assign(env, { HOME: processHome, USERPROFILE: processHome, APPDATA: path.join(home, 'AppData'),
    XDG_CONFIG_HOME: path.join(home, '.config'), DISABLE_AUTOUPDATER: '1', DISABLE_TELEMETRY: '1' });
  const files = new Map();
  const add = async (name, text) => { const file = path.join(root, name); await writeConfig(file, text); files.set(file, text); return file; };
  const settings = await add(provider + '-settings.json', JSON.stringify(provider === 'claude' ? CLAUDE_SETTINGS : geminiSettings(false)));
  const researchSettings = provider === 'gemini' ? await add('gemini-research-settings.json', JSON.stringify(geminiSettings(true))) : settings;
  let loginSettings = settings;
  if (provider === 'gemini') {
    const login = geminiSettings(false);
    // ACP must initialize without authenticating on startup. Only authenticate RPC starts OAuth.
    login.security.auth = { selectedType: '', enforcedType: 'oauth-personal', useExternal: true };
    loginSettings = await add('gemini-login-settings.json', JSON.stringify(login));
  }
  const normalPolicy = await add(provider + '-deny.toml', '[[rule]]\ntoolName = "*"\ndecision = "deny"\npriority = 998\n');
  const researchPolicy = await add(provider + '-search.toml', '[[rule]]\ntoolName = "*"\ndecision = "deny"\npriority = 998\n\n[[rule]]\ntoolName = "google_web_search"\ndecision = "allow"\npriority = 999\n');
  const emptyEnv = path.join(work, '.gemini', '.env');
  await writeConfig(emptyEnv, ''); files.set(emptyEnv, '');
  // The official CLI owns OAuth in this isolated profile. Host-managed auth would
  // skip its stored credentials and expect the App to supply a token instead.
  if (provider === 'claude') Object.assign(env, { CLAUDE_CONFIG_DIR: home, ANTHROPIC_CONFIG_DIR: path.join(home,'.config','anthropic'),
    CLAUDE_CODE_SAFE_MODE: '1' });
  else Object.assign(env, { GEMINI_CLI_HOME: home, GEMINI_FORCE_FILE_STORAGE: 'true',
    GEMINI_CLI_SYSTEM_SETTINGS_PATH: settings, GEMINI_CLI_SYSTEM_DEFAULTS_PATH: settings,
    GEMINI_CLI_TRUSTED_FOLDERS_PATH: path.join(home, '.gemini', 'trustedFolders.json'), NO_BROWSER: '1' });
  const identity = await fs.lstat(root);
  const assertPolicy = async () => {
    await assertNoExternalPolicy(provider);
    const stat = await fs.lstat(directory);
    if (stat.isSymbolicLink() || stat.dev !== identity.dev || stat.ino !== identity.ino || await fs.realpath(directory) !== root) throw failure('POLICY_MISMATCH');
    for (const dir of profileDirectories) {
      const item = await fs.lstat(dir);
      if (!item.isDirectory() || item.isSymbolicLink() || await fs.realpath(dir) !== dir) throw failure('POLICY_MISMATCH');
    }
    for (const [file, expected] of files) if (await readConfig(file) !== expected) throw failure('POLICY_MISMATCH');
  };
  return { root, home, work, env, settings, researchSettings, loginSettings, normalPolicy, researchPolicy, assertPolicy };
}

// Safe mode also disables --mcp-config servers, so research turns that use the App's own
// research server drop it; restricted mode, empty setting sources, strict MCP and the
// App-only config directory still keep user customizations out.
function claudeFlags(runtime, researchTools = null) {
  const mcp = researchTools ? { mcpServers: { [researchTools.name]: { type: 'http', url: researchTools.url, headers: { Authorization: 'Bearer ' + researchTools.token } } } } : { mcpServers: {} };
  return [...(researchTools ? [] : ['--safe-mode']), '--restricted', '--setting-sources', '', '--settings', runtime.settings,
    '--strict-mcp-config', '--mcp-config', JSON.stringify(mcp), '--disable-slash-commands', '--no-chrome'];
}
function geminiFlags(runtime, research = false) {
  return ['--extensions', 'none', '--approval-mode', 'default', '--admin-policy', research ? runtime.researchPolicy : runtime.normalPolicy];
}
module.exports = { VERSIONS, prepareRuntime, claudeFlags, geminiFlags, geminiSettings };
