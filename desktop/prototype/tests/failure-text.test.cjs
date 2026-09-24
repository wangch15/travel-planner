const test = require('node:test');
const assert = require('node:assert/strict');
const { userFacingMessage } = require('../services/failure-text.cjs');

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
