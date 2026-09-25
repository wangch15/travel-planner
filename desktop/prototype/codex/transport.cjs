'use strict';

const { spawn } = require('node:child_process');
const { EventEmitter } = require('node:events');
const { TextDecoder } = require('node:util');

const CLIENT_INFO = Object.freeze({ name: 'travel_planner_desktop', title: 'Travel Planner', version: '0.1.0' });
const MAX_PENDING = 128;
const MAX_TIMER = 2 ** 31 - 1;
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const validId = (id) => typeof id === 'string' || Number.isSafeInteger(id);
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function failure(code, message) {
  return Object.assign(new Error(message), { code });
}

function positiveInteger(value, name, max = MAX_TIMER) {
  if (!Number.isInteger(value) || value < 1 || value > max) throw new TypeError(`${name} must be an integer between 1 and ${max}`);
  return value;
}

/** Newline-delimited app-server protocol. Command/context must come from the trusted main process. */
class CodexTransport extends EventEmitter {
  constructor({ command, args = [], cwd, env, requestTimeoutMs = 15000, maxLineBytes = 1024 * 1024, shutdownGraceMs = 250 } = {}) {
    super();
    if (typeof command !== 'string' || !command || !Array.isArray(args) || args.some((arg) => typeof arg !== 'string')) {
      throw new TypeError('A trusted command and string arguments are required');
    }
    this._spawnOptions = { command, args: [...args], cwd, env: env ? { ...env } : undefined };
    this._requestTimeoutMs = positiveInteger(requestTimeoutMs, 'requestTimeoutMs');
    this._maxLineBytes = positiveInteger(maxLineBytes, 'maxLineBytes', 64 * 1024 * 1024);
    this._shutdownGraceMs = positiveInteger(shutdownGraceMs, 'shutdownGraceMs', MAX_TIMER / 4 | 0);
    this._record = null;
    this._state = 'stopped';
    this._nextId = 1;
    this._pending = new Map();
    this._startPromise = null;
  }

  get state() { return this._state; }

  // Concurrent and already-running starts share the one initialization promise.
  // A new process can only start after the previous process has exited.
  start() {
    if (this._state === 'stopping') return Promise.reject(failure('STOPPING', 'The app-server is still stopping'));
    if (this._record) return this._startPromise;
    const { command, args, cwd, env } = this._spawnOptions;
    let child;
    try {
      child = spawn(command, args, { cwd, env, shell: false, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    } catch {
      return Promise.reject(failure('CHILD_ERROR', 'Unable to start the app-server'));
    }
    const record = { child, buffer: Buffer.alloc(0), finished: false, timers: [], stopPromise: null };
    record.exitPromise = new Promise((resolve) => { record.resolveExit = resolve; });
    this._record = record;
    this._state = 'starting';
    child.on('error', () => {
      const error = failure('CHILD_ERROR', 'The app-server process failed');
      if (!child.pid) this._finish(record, error, null, null);
      else this._fail(record, error);
    });
    child.on('exit', (code, signal) => {
      const finish = () => this._finish(record, failure('CHILD_EXIT', 'The app-server process exited'), code, signal);
      // A startup exit explains itself on stderr; let that drain before the pipes are closed.
      if (this._state !== 'starting' || child.stderr.readableEnded) { finish(); return; }
      const timer = setTimeout(finish, 200); record.timers.push(timer);
      child.stderr.once('end', () => { clearTimeout(timer); finish(); });
    });
    child.on('disconnect', () => this._fail(record, failure('CHILD_DISCONNECTED', 'The app-server disconnected')));
    child.stdin.on('error', () => this._fail(record, failure('CHILD_DISCONNECTED', 'The app-server input closed')));
    child.stdout.on('error', () => this._fail(record, failure('CHILD_DISCONNECTED', 'The app-server output failed')));
    child.stdout.on('data', (chunk) => this._read(record, chunk));
    child.stdout.on('end', () => {
      // Give a normal exit its own event; EOF from a live child is a disconnect.
      if (!record.finished && this._state !== 'stopping') {
        record.timers.push(setTimeout(() => this._fail(record, failure('CHILD_DISCONNECTED', 'The app-server output closed')), 10));
      }
    });
    // Drain stderr without forwarding potentially sensitive diagnostics. Only the opening
    // lines during startup are kept, to recognise an older Codex rejecting the App's config.
    record.stderrHead = '';
    record.stderrClosed = new Promise((resolve) => child.stderr.once('close', resolve));
    child.stderr.on('data', (chunk) => {
      if (this._state === 'starting' && record.stderrHead.length < 4096) record.stderrHead += chunk.toString('utf8').slice(0, 4096 - record.stderrHead.length);
    });
    child.stderr.on('error', () => {});
    child.stderr.resume();

    let startupTimer;
    const deadline = new Promise((resolve, reject) => {
      startupTimer = setTimeout(() => reject(failure('REQUEST_TIMEOUT', 'The app-server initialization timed out')), this._requestTimeoutMs);
      record.timers.push(startupTimer);
    });
    const handshake = this._sendRequest('initialize', { clientInfo: CLIENT_INFO }, {}).then(async (result) => {
      if (this._record !== record || this._state !== 'starting') throw failure('STOPPED', 'The app-server was stopped');
      await this._write(record, { method: 'initialized' });
      return result;
    });
    // Receiving initialize is only half the handshake: a blocked stdin can leave
    // initialized queued indefinitely even after the request's own timer clears.
    this._startPromise = Promise.race([handshake, deadline]).then((result) => {
      if (this._record !== record || this._state !== 'starting') throw failure('STOPPED', 'The app-server was stopped');
      this._state = 'ready';
      return result;
    }).catch(async (error) => {
      // Failed initialization must not leave a live process available for later requests.
      if (this._record === record) await this.stop().catch(() => {});
      // --strict-config makes an older Codex exit on settings it does not know yet.
      await Promise.race([record.stderrClosed, new Promise((resolve) => setTimeout(resolve, 500))]);
      if (/unknown configuration field/i.test(record.stderrHead)) throw failure('CLI_OUTDATED', 'The installed Codex is older than the App configuration');
      throw error;
    }).finally(() => clearTimeout(startupTimer));
    return this._startPromise;
  }

  request(method, params, options = {}) {
    if (this._state !== 'ready') return Promise.reject(failure('NOT_RUNNING', 'The app-server is not ready'));
    if (typeof method !== 'string' || !method || method === 'initialize' || method === 'initialized') {
      return Promise.reject(failure('INVALID_REQUEST', 'The request method is invalid or reserved'));
    }
    return this._sendRequest(method, params, options);
  }

  _sendRequest(method, params, options) {
    let timeoutMs;
    try { timeoutMs = positiveInteger(options.timeoutMs ?? this._requestTimeoutMs, 'timeoutMs'); }
    catch (error) { return Promise.reject(error); }
    if (this._pending.size >= MAX_PENDING) return Promise.reject(failure('BACKPRESSURE', 'Too many pending app-server requests'));
    const record = this._record;
    const id = this._nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this._pending.delete(id);
        reject(failure(options.uncertainOnTimeout ? 'UNKNOWN_RESULT' : 'REQUEST_TIMEOUT', options.uncertainOnTimeout
          ? 'The request timed out; its result is unknown. Do not retry automatically.'
          : 'The app-server request timed out'));
      }, timeoutMs);
      this._pending.set(id, { resolve, reject, timer });
      this._write(record, { id, method, ...(params === undefined ? {} : { params }) }).catch((error) => {
        const pending = this._pending.get(id);
        if (!pending) return;
        clearTimeout(pending.timer);
        this._pending.delete(id);
        pending.reject(error);
      });
    });
  }

  _write(record, message) {
    if (!record || record.finished || this._record !== record || this._state === 'stopping') {
      return Promise.reject(failure('STOPPED', 'The app-server was stopped'));
    }
    let line;
    try { line = `${JSON.stringify(message)}\n`; }
    catch { return Promise.reject(failure('INVALID_REQUEST', 'Request parameters are not JSON serializable')); }
    const bytes = Buffer.byteLength(line);
    if (bytes - 1 > this._maxLineBytes) return Promise.reject(failure('REQUEST_TOO_LARGE', 'The request exceeds the message limit'));
    if (record.child.stdin.writableLength + bytes > this._maxLineBytes * 4) {
      return Promise.reject(failure('BACKPRESSURE', 'The app-server input buffer is full'));
    }
    return new Promise((resolve, reject) => {
      record.child.stdin.write(line, (error) => {
        if (error) {
          const disconnected = failure('CHILD_DISCONNECTED', 'Unable to write to the app-server');
          reject(disconnected);
          this._fail(record, disconnected);
        } else resolve();
      });
    });
  }

  _read(record, chunk) {
    if (this._record !== record || this._state === 'stopping') return;
    let offset = 0;
    while (offset < chunk.length) {
      const newline = chunk.indexOf(10, offset);
      const end = newline === -1 ? chunk.length : newline;
      const piece = chunk.subarray(offset, end);
      if (record.buffer.length + piece.length > this._maxLineBytes) {
        this._fail(record, failure('PROTOCOL_ERROR', 'The app-server message exceeds the size limit'));
        return;
      }
      record.buffer = Buffer.concat([record.buffer, piece]);
      if (newline === -1) return;
      let message;
      try { message = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(record.buffer)); }
      catch {
        this._fail(record, failure('PROTOCOL_ERROR', 'The app-server sent an invalid JSON message'));
        return;
      }
      record.buffer = Buffer.alloc(0);
      if (!this._receive(record, message)) return;
      offset = newline + 1;
    }
  }

  _receive(record, message) {
    const invalid = () => {
      this._fail(record, failure('PROTOCOL_ERROR', 'The app-server sent an invalid protocol message'));
      return false;
    };
    if (!isObject(message) || (own(message, 'jsonrpc') && message.jsonrpc !== '2.0')) return invalid();
    if (own(message, 'method')) {
      if (typeof message.method !== 'string' || !message.method || own(message, 'result') || own(message, 'error')) return invalid();
      if (own(message, 'id')) {
        if (!validId(message.id)) return invalid();
        // No server-initiated operation is supported; never silently approve one.
        this._write(record, { id: message.id, error: { code: -32601, message: 'Client method not supported' } })
          .catch((error) => this._fail(record, error));
      } else this.emit('notification', message.method, message.params);
      return this._record === record && this._state !== 'stopping';
    }
    if (!own(message, 'id') || !validId(message.id) || own(message, 'result') === own(message, 'error')) return invalid();
    if (own(message, 'error') && (!isObject(message.error) || !Number.isSafeInteger(message.error.code) || typeof message.error.message !== 'string')) return invalid();
    const pending = this._pending.get(message.id);
    // A response may arrive after its timeout. It must not resolve another request.
    if (!pending) return true;
    this._pending.delete(message.id);
    clearTimeout(pending.timer);
    if (own(message, 'error')) {
      const error = failure(message.error.code, message.error.message);
      if (own(message.error, 'data')) error.data = message.error.data;
      pending.reject(error);
    } else pending.resolve(message.result);
    return true;
  }

  _rejectPending(error) {
    for (const pending of this._pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this._pending.clear();
  }

  _fail(record, error) {
    if (this._record !== record || record.finished || this._state === 'stopping') return;
    this._rejectPending(error);
    const stopping = this.stop();
    // Deliberately not EventEmitter's special 'error' event: listeners are optional.
    this.emit('transportError', error);
    stopping.catch((stopError) => this.emit('transportError', stopError));
  }

  _finish(record, error, code, signal) {
    if (record.finished) return;
    record.finished = true;
    for (const timer of record.timers) clearTimeout(timer);
    record.buffer = Buffer.alloc(0);
    if (this._record === record) {
      this._rejectPending(error);
      this._record = null;
      this._state = 'stopped';
    }
    // Descendants must not keep our local pipe handles open after the child exits.
    record.child.stdin.destroy();
    record.child.stdout.destroy();
    record.child.stderr.destroy();
    record.resolveExit();
    this.emit('close', { code, signal });
  }

  stop() {
    const record = this._record;
    if (!record) return Promise.resolve();
    if (record.stopPromise) return record.stopPromise;
    this._state = 'stopping';
    this._rejectPending(failure('STOPPED', 'The app-server was stopped'));
    record.buffer = Buffer.alloc(0);
    record.stopPromise = new Promise((resolve, reject) => {
      record.exitPromise.then(resolve);
      const kill = (signal) => {
        if (!record.finished) {
          try { record.child.kill(signal); } catch { /* The final deadline reports failure to exit. */ }
        }
      };
      record.timers.push(setTimeout(() => kill('SIGTERM'), this._shutdownGraceMs));
      record.timers.push(setTimeout(() => kill('SIGKILL'), this._shutdownGraceMs * 2));
      record.timers.push(setTimeout(() => reject(failure('SHUTDOWN_TIMEOUT', 'The app-server did not exit after termination')), this._shutdownGraceMs * 4));
      record.child.stdin.end();
    });
    return record.stopPromise;
  }
}

module.exports = { CodexTransport };
