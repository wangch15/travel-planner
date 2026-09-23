'use strict';

const readline = require('node:readline');
const mode = process.argv[2] || 'normal';
let initializes = 0;
let initialized = 0;
let initializeParams;
let calls = 0;
const held = [];
const send = (message) => process.stdout.write(`${JSON.stringify(message)}\n`);

if (mode === 'stubborn') {
  process.on('SIGTERM', () => {});
  setInterval(() => {}, 1000);
}

readline.createInterface({ input: process.stdin }).on('line', (line) => {
  const message = JSON.parse(line);
  if (message.method === 'initialize') {
    initializes += 1;
    initializeParams = message.params;
    if (mode === 'initialize-backpressure') {
      process.stdin.pause();
      setInterval(() => {}, 1000);
      send({ id: 'x'.repeat(500000), method: 'unsupported/request' });
    }
    if (mode !== 'initialize-hang') send({ id: message.id, result: { userAgent: 'fake-app-server' } });
    if (mode === 'initialize-backpressure') send({ method: 'fixture/input-paused' });
    return;
  }
  if (message.method === 'initialized') {
    initialized += 1;
    return;
  }
  calls += 1;
  switch (message.method) {
    case 'stats':
      send({ id: message.id, result: { initializes, initialized, initializeParams, calls, cwd: process.cwd(), marker: process.env.TRANSPORT_TEST_MARKER } });
      break;
    case 'hold':
      held.push(message);
      if (held.length === 2) {
        send({ id: held[1].id, result: held[1].params });
        send({ id: held[0].id, result: held[0].params });
      }
      break;
    case 'chunked': {
      const bytes = Buffer.from(`${JSON.stringify({ method: 'account/updated', params: { label: '旅行' } })}\n${JSON.stringify({ id: message.id, result: 'ok' })}\n`);
      const split = bytes.indexOf(Buffer.from('旅行')) + 1;
      process.stdout.write(bytes.subarray(0, split));
      setTimeout(() => process.stdout.write(bytes.subarray(split)), 10);
      break;
    }
    case 'remote-error':
      send({ id: message.id, error: { code: -32001, message: 'Fake request rejected', data: { reason: 'fixture' } } });
      break;
    case 'approval':
      // Deliberately reuse the client request ID: this is a server request, not its response.
      send({ id: message.id, method: 'item/commandExecution/requestApproval', params: { command: 'never execute' } });
      break;
    case 'malformed':
      process.stdout.write('{broken json\n');
      break;
    case 'invalid-envelope':
      send({ id: message.id, result: true, error: { code: -1, message: 'ambiguous' } });
      break;
    case 'invalid-utf8':
      process.stdout.write(Buffer.from([0x22, 0xff, 0x22, 0x0a]));
      break;
    case 'oversized':
      process.stdout.write('x'.repeat(2048));
      break;
    case 'oversized-line':
      process.stdout.write(`${'x'.repeat(2048)}\n`);
      break;
    case 'partial-exit':
      process.stdout.write('{"id":');
      process.exit(7);
      break;
    case 'exit':
      process.exit(7);
      break;
    case 'hang':
      break;
    case 'late':
      setTimeout(() => send({ id: message.id, result: 'late response' }), 60);
      break;
    case 'close-output':
      process.stdout.end();
      break;
    case 'stderr':
      process.stderr.write('private fixture data'.repeat(65536), () => send({ id: message.id, result: true }));
      break;
    default:
      if (message.error) send({ id: message.id, result: { rejected: message.error } });
      else send({ id: message.id, result: message.params });
  }
});
