const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const CONFIG = `forced_login_method = "chatgpt"
model_provider = "openai"
cli_auth_credentials_store = "keyring"
approval_policy = "never"
default_permissions = "travel_preview"
project_doc_max_bytes = 0
allow_login_shell = false
web_search = "disabled"

[shell_environment_policy]
inherit = "none"
include_only = []

[features]
shell_tool = false
unified_exec = false
apply_patch_freeform = false
code_mode = false
js_repl = false
plugins = false
apps = false
connectors = false
computer_use = false
browser_use = false
multi_agent = false
hooks = false
codex_hooks = false
plugin_hooks = false
skip_host_skill_discovery = true
memories = false
memory_tool = false
remote_control = false
shell_snapshot = false
view_image = false
image_generation = false
tool_search = false
search_tool = false
request_permissions = false
request_permissions_tool = false
remote_plugin = false
workspace_dependencies = false
external_migration = false
skill_search = false
skill_mcp_dependency_install = false
tool_suggest = false
code_mode_host = false
code_mode_only = false
goals = false
send_async_message = false

[permissions.travel_preview.filesystem]
":minimal" = "read"

[permissions.travel_preview.filesystem.":workspace_roots"]
"." = "read"

[permissions.travel_preview.network]
enabled = false
`;

async function prepareRuntime(directory) {
  if (!path.isAbsolute(directory)) throw Error('invalid-runtime-directory');
  const home = path.join(directory, 'codex-profile');
  const work = path.join(directory, 'codex-work');
  for (const dir of [directory, home, work]) {
    await fs.mkdir(dir, { recursive: true, mode: 0o700 });
    const stat = await fs.lstat(dir);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw Error('unsafe-runtime-directory');
  }
  const config = path.join(home, 'config.toml');
  try { const stat = await fs.lstat(config); if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink > 1) throw Error('unsafe-runtime-config'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const temporary = path.join(home, `.config-${randomUUID()}.tmp`);
  await fs.writeFile(temporary, CONFIG, { flag: 'wx', mode: 0o600 });
  await fs.rename(temporary, config);
  const env = {};
  for (const key of ['PATH', 'HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP', 'TMPDIR', 'LANG', 'LC_ALL', 'USER', 'LOGNAME']) {
    if (process.env[key]) env[key] = process.env[key];
  }
  // CODEX_HOME is used for its official purpose: a separate, app-managed profile.
  env.CODEX_HOME = home;
  return { home, work, env };
}
const DISABLED_FEATURES = [...CONFIG.split('[features]\n')[1].split('\n[permissions.')[0].matchAll(/^(\w+) = false$/gm)].map(match => match[1]);
module.exports = { CONFIG, DISABLED_FEATURES, prepareRuntime };
