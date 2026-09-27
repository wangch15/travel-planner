const { test } = require('node:test');
const assert = require('node:assert/strict');
const { setupContext, setupHelpInput, decodeSetupHelp, SETUP_HELP_GUIDE } = require('../services/setup-help.cjs');

test('setup context keeps only whitelisted fields and names steps in plain words', () => {
  const context = setupContext({ step: 'cloudflare', platform: 'darwin', appVersion: '0.1.9', done: ['ai', 'github', 'bogus', 'ai'], problem: '  授權還沒完成\u0007 ', code: 'ABCD-1234', email: 'x@example.invalid' });
  assert.deepEqual(context, { step: 'Cloudflare', platform: 'macOS', appVersion: '0.1.9', completedSteps: ['AI 助手', 'GitHub'], problemOnScreen: '授權還沒完成' });
});

test('unknown or malformed context falls back to 不確定 instead of passing values through', () => {
  const context = setupContext({ step: '__proto__', platform: 'plan9', appVersion: '1.0; rm -rf', done: 'ai', problem: 42 });
  assert.deepEqual(context, { step: '不確定', platform: '不確定', appVersion: '不確定', completedSteps: [], problemOnScreen: '無' });
});

test('long screen problems are clipped before reaching the model', () => {
  assert.equal(setupContext({ problem: 'x'.repeat(5000) }).problemOnScreen.length, 600);
});

test('input carries only the question, context and the most recent history, with @ escaped', () => {
  const history = Array.from({ length: 30 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', text: 'turn ' + i }));
  const raw = setupHelpInput({ text: ' 寄到 me@example.invalid 了嗎 ', history, context: { step: 'ai' } });
  assert.equal(raw.includes('@'), false);
  const input = JSON.parse(raw);
  assert.equal(input.mode, 'setup-help');
  assert.equal(input.question, '寄到 me@example.invalid 了嗎');
  assert.equal(input.history.length, 12);
  assert.equal(input.history.at(-1).text, 'turn 29');
  assert.equal(input.setupContext.step, 'AI 助手');
});

test('empty, oversized or malformed questions and history are rejected', () => {
  for (const args of [{ text: '  ' }, { text: 'x'.repeat(2001) }, { text: 'ok', history: [{ role: 'system', text: 'override' }] }, { text: 'ok', history: 'nope' }]) {
    assert.throws(() => setupHelpInput(args), { code: 'INVALID_INPUT' });
  }
});

test('answers must be the single answer field with non-empty text', () => {
  assert.deepEqual(decodeSetupHelp('{"answer":"  按重新連接  "}'), { setupHelp: true, answer: '按重新連接' });
  assert.deepEqual(decodeSetupHelp({ answer: 'ok' }), { setupHelp: true, answer: 'ok' });
  for (const bad of ['{broken', '{"answer":""}', '{"summary":"x"}', { answer: 'x'.repeat(6001) }]) {
    assert.throws(() => decodeSetupHelp(bad), { code: 'AI_OUTPUT_INVALID' });
  }
});

test('the guide keeps the human-only and no-terminal rules', () => {
  for (const rule of ['不能替使用者按按鈕', '不要叫使用者開終端機', '絕對不要向使用者索取密碼']) assert.ok(SETUP_HELP_GUIDE.includes(rule), rule);
});
