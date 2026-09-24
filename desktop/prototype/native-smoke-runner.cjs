'use strict';

// Own temporary state outside Electron so Windows can release its profile DBs
// before the test directory is removed.
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

// 所有 Electron smoke 都經過這裡：卡住時會被強制結束並回報失敗，不會無限期卡住後面的測試。
const allowed = new Set(['updater-smoke.cjs', 'navigation-smoke.cjs', 'settings-smoke.cjs',
  'session-settings-smoke.cjs', 'menu-smoke.cjs', 'onboarding-smoke.cjs', 'smoke.cjs', 'real-preview-smoke.cjs',
  'workflow-smoke.cjs', 'paste-smoke.cjs', 'research-smoke.cjs', 'versions-smoke.cjs', 'batch-smoke.cjs',
  'batch-safety-smoke.cjs', 'stop-continuation-smoke.cjs']);
// 較長的流程給比較多時間；其餘 90 秒。
const LIMIT_SECONDS = { 'workflow-smoke.cjs': 240, 'batch-smoke.cjs': 180, 'batch-safety-smoke.cjs': 180, 'versions-smoke.cjs': 180, 'research-smoke.cjs': 180 };
const limit = (LIMIT_SECONDS[process.argv[2]] || 90) * 1000;
const script = process.argv[2];
if (!allowed.has(script)) throw Error('Unknown native smoke test');

async function run(root) {
  const env = { ...process.env, TRAVEL_PLANNER_TEST_ROOT: root };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(require('electron'), [path.join(__dirname, script)], {
    cwd: __dirname, stdio: 'inherit', env,
  });
  let timedOut = false;
  const outcome = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => resolve({ code, signal }));
  });
  const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, limit);
  const forward = () => child.kill('SIGINT');
  process.on('SIGINT', forward); process.on('SIGTERM', forward);
  try {
    const result = await Promise.race([outcome, new Promise((_, reject) => {
      const watchdog = setTimeout(() => reject(Error('Native smoke did not exit after timeout')), limit + 10000);
      outcome.finally(() => clearTimeout(watchdog)).catch(() => {});
    })]);
    if (timedOut) throw Error(`${script} exceeded ${limit / 1000} seconds`);
    return result;
  } finally {
    clearTimeout(timer);
    process.off('SIGINT', forward); process.off('SIGTERM', forward);
  }
}

(async () => {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'travel-native-smoke-')));
  let result;
  try { result = await run(root); }
  finally { await fs.rm(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 200 }); }
  if (result.signal) throw Error(`${script} exited on ${result.signal}`);
  process.exitCode = result.code ?? 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
