const test = require('node:test');
const assert = require('node:assert/strict');
const { userFacingMessage, unexpectedFailureMessage } = require('../services/failure-text.cjs');

test('a service error with a Chinese explanation is shown as-is', () => {
  // 發布查帳號失敗的錯誤沒有錯誤碼，以前被換成「原始行程未被本次操作修改」，看起來像「沒有修改」。
  assert.equal(userFacingMessage(new Error('帳號查核失敗（退出碼 2），不能判定目標不存在；停止，請檢查 wrangler 的錯誤。')), '帳號查核失敗（退出碼 2），不能判定目標不存在；停止，請檢查 wrangler 的錯誤。');
  assert.equal(userFacingMessage(Object.assign(Error('網站名稱已存在，請先核對並明確接管。'), { code: 'ADOPTION_REQUIRED' })), '網站名稱已存在，請先核對並明確接管。');
});

test('bare codes and raw system errors are not shown to the user', () => {
  assert.equal(userFacingMessage(Object.assign(Error('PUBLISH_BUSY'), { code: 'PUBLISH_BUSY' })), null);
  assert.equal(userFacingMessage(Error("ENOENT: no such file or directory, open '/Users/someone/x'")), null);
  assert.equal(userFacingMessage(Error('錯'.repeat(401))), null);
  assert.equal(userFacingMessage(undefined), null);
});

// 沒收進對照表、也沒有中文說明的錯誤：只給一個可回報的代碼，不把程式內部訊息（例如 x is not a function）丟給使用者。
test('unexpected failures show a short reportable code, never raw program text', () => {
  const plain = unexpectedFailureMessage(new TypeError('publisher.status is not a function'));
  assert.doesNotMatch(plain, /publisher|function/);
  assert.match(plain, /INTERNAL/);
  assert.match(unexpectedFailureMessage(Object.assign(Error('x'), { code: 'PUBLISH_BUSY' })), /PUBLISH_BUSY/);
  assert.match(unexpectedFailureMessage(Object.assign(Error('git failed'), { code: 128 })), /EXIT_128/);
  assert.match(unexpectedFailureMessage(Object.assign(Error('x'), { code: '/Users/someone/secret path' })), /INTERNAL/);
  assert.match(unexpectedFailureMessage(undefined), /INTERNAL/);
  // 很多地方寫成 throw Error('INVALID_INPUT')：代碼放在 message 裡也要認得。
  assert.match(unexpectedFailureMessage(Error('INVALID_INPUT')), /INVALID_INPUT/);
  assert.match(plain, /檔案沒有被這次操作改動/);
});
