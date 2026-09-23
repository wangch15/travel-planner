// Run the actual package entry, not createWindow(), so a missing bootstrap fails.
const { spawn } = require('node:child_process');
const http = require('node:http');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const electronPath = require('electron');

function getTargets(port) {
  return new Promise((resolve, reject) => {
    const request = http.get({ host: '127.0.0.1', port, path: '/json/list', timeout: 1000 }, response => {
      let body = '';
      response.on('data', chunk => { body += chunk; });
      response.on('end', () => {
        try { resolve(JSON.parse(body)); } catch (error) { reject(error); }
      });
    });
    request.on('error', reject);
    request.on('timeout', () => request.destroy(Error('DevTools request timeout')));
  });
}

(async () => {
  const stateDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'travel-startup-'));
  const child = spawn(electronPath, ['.', '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0'], {
    cwd: __dirname, env: { ...process.env, TRAVEL_PLANNER_STATE_DIR: stateDirectory }, stdio: ['ignore', 'ignore', 'pipe'],
  });
  let port;
  let spawnError;
  let stderr = '';
  child.once('error', error => { spawnError = error; });
  child.stderr.on('data', chunk => {
    stderr = (stderr + chunk).slice(-4096);
    const match = stderr.match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\//);
    if (match) port = Number(match[1]);
  });
  const exited = new Promise(resolve => child.once('exit', resolve));
  try {
    const deadline = Date.now() + 10000;
    let ready = false;
    while (Date.now() < deadline) {
      if (spawnError) throw spawnError;
      if (child.exitCode !== null) throw Error(`Desktop exited before opening its page (${child.exitCode})`);
      if (port) {
        const targets = await getTargets(port);
        ready = targets.some(target => target.type === 'page'
          && target.url === 'travel-app://prototype/index.html'
          && target.title === 'Travel Planner · 接手既有旅程');
        if (ready) break;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(ready, 'Actual Electron package entry did not open the Travel Planner page');
    console.log('PASS: actual Electron package entry opened the Travel Planner page');
  } finally {
    child.kill('SIGTERM');
    const forceKill = setTimeout(() => child.kill('SIGKILL'), 2000);
    await exited;
    clearTimeout(forceKill);
    await fs.rm(stateDirectory, { recursive: true, force: true });
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
