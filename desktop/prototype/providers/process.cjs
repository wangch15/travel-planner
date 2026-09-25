const { spawn } = require('node:child_process');
const { StringDecoder } = require('node:string_decoder');
const failure = code => Object.assign(Error(code), { code });

// Claude may include an authorization URL or code in stderr. Retain only this
// fixed category on a failed auth command; never return its original text.
function authFailureCategory(stderr) {
  // Ordinary authorize links contain redirect/callback parameters; those are not failures.
  stderr=stderr.replace(/https?:\/\/[^\s"'<>]+/gi,'<url>').split(/\r?\n/).filter(line=>/login failed:|(?:^|\s)error:|security:|SecItem|EACCES|EPERM|ENOTFOUND|ECONN|ETIMEDOUT/i.test(line)).join('\n');
  if (/network|fetch failed|timed? ?out|ENOTFOUND|ECONN|certificate|TLS|offline/i.test(stderr)) return 'network';
  if (/managed settings|organization (?:policy|requires)|enterprise policy/i.test(stderr)) return 'managed-policy';
  if (/keychain|credential.{0,40}(?:sav|stor|persist)|(?:sav|stor|persist).{0,40}(?:credential|token)|SecItem|security framework/i.test(stderr)) return 'credential-store';
  if (/callback|redirect|authorization code|invalid (?:code|state)|oauth error/i.test(stderr)) return 'oauth-callback';
  if (/network|fetch failed|timed? ?out|ENOTFOUND|ECONN|certificate|TLS|offline/i.test(stderr)) return 'network';
  return 'login-command';
}

// The CLI owns OAuth. Only its JSON protocol and bounded status text cross this boundary.
function startProcess(command, args, runtime, { spawnProcess = spawn, input, json = false,
  onMessage = () => {}, timeoutMs = 180000, idleTimeoutMs = 0, signal, allowedExitCodes = [0], maxBytes = 2 * 1024 * 1024,
  classifyAuthFailure = false } = {}) {
  const child = spawnProcess(command, args, { cwd: runtime.work, env: runtime.env, shell: false,
    windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  let stdout = '', pending = '', bytes = 0, stderrBytes = 0, stderr = '', failed, settled = false, killTimer;
  const decoder = new StringDecoder('utf8');
  let resolve, reject;
  const done = new Promise((yes, no) => { resolve = yes; reject = no; });
  done.catch(() => {});
  // timeoutMs 是總上限；idleTimeoutMs 是「多久沒有新輸出」，每收到輸出重新計時，慢但持續回覆的不會被切斷。
  const timer = setTimeout(() => cancel('AI_RESULT_UNKNOWN'), timeoutMs);
  let idleTimer;
  const touch = () => { if (!idleTimeoutMs) return; clearTimeout(idleTimer); idleTimer = setTimeout(() => cancel('AI_RESULT_UNKNOWN'), idleTimeoutMs); };
  touch();
  function cancel(code = 'AI_CANCELED') {
    if (settled || failed) return;
    failed = failure(code); child.kill('SIGTERM');
    killTimer = setTimeout(() => child.kill('SIGKILL'), 1000);
    killTimer.unref?.();
  }
  const abort = () => cancel();
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) cancel();
  function consume(text) {
    if (!json) { stdout += text; return; }
    pending += text;
    let end;
    while ((end = pending.indexOf('\n')) !== -1) {
      const line = pending.slice(0, end).trim(); pending = pending.slice(end + 1);
      if (line) onMessage(JSON.parse(line));
    }
  }
  child.stdout.on('data', chunk => {
    if (failed) return;
    bytes += chunk.length; touch();
    if (bytes > maxBytes) return cancel('AI_OUTPUT_TOO_LARGE');
    try { consume(decoder.write(chunk)); } catch (error) { cancel(error.code || 'AI_OUTPUT_INVALID'); }
  });
  child.stderr.on('data', chunk => {
    // Do not expose stderr: authentication output may contain URLs with secrets.
    stderrBytes += chunk.length;
    if (stderrBytes > maxBytes) cancel('AI_OUTPUT_TOO_LARGE');
    else if (classifyAuthFailure) stderr += chunk.toString('utf8');
  });
  child.stdin.on('error', () => { /* Exit/close below decides the final outcome. */ });
  child.on('error', error => finish(failure(error.code === 'ENOENT' ? 'CLI_MISSING' : 'PROVIDER_UNAVAILABLE')));
  child.on('close', code => {
    if (!failed) {
      try {
        consume(decoder.end());
        if (json && pending.trim()) onMessage(JSON.parse(pending));
      } catch (error) { failed = failure(error.code || 'AI_OUTPUT_INVALID'); }
    }
    const error = failed || (!allowedExitCodes.includes(code) ? failure('AI_TURN_FAILED') : null);
    if (error && classifyAuthFailure) error.authFailure = authFailureCategory(stderr);
    stderr = '';
    finish(error, { stdout, exitCode: code });
  });
  function finish(error, value) {
    if (settled) return;
    settled = true; clearTimeout(timer); clearTimeout(idleTimer); clearTimeout(killTimer); signal?.removeEventListener('abort', abort);
    if (error) reject(error); else resolve(value);
  }
  if (input !== undefined) child.stdin.end(input);
  return { child, done, cancel, send: value => child.stdin.write(JSON.stringify(value) + '\n') };
}

module.exports = { startProcess, failure };
