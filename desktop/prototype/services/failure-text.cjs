// 服務丟出的錯誤常附有給人看的中文說明（例如 fail('ADOPTION_REQUIRED', '網站名稱已存在…')）。
// 錯誤碼沒收進 main.cjs 的對照表時，要顯示這段說明，不能換成看不出原因的預設訊息。
// 只採用中文說明：英文或系統原始錯誤（路徑、stack、指令輸出）不直接給使用者看。
const MAX_LENGTH = 400;
function userFacingMessage(error) {
  const text = typeof error?.message === 'string' ? error.message.trim() : '';
  if (!text || text === error.code || text.length > MAX_LENGTH) return null;
  return /[㐀-鿿]/u.test(text) ? text : null;
}
// 最後的預設訊息：只附一個可回報的代碼。錯誤碼要像代碼（英文字母開頭）才照用，
// 數字（例如 git 的退出碼）改成 EXIT_n，其餘（程式內部訊息、路徑）一律 INTERNAL。
function failureCode(error) {
  const bare = typeof error?.message === 'string' && /^[A-Z][A-Z0-9_]{2,59}$/.test(error.message) ? error.message : undefined;
  const code = error?.code ?? bare;
  if (Number.isInteger(code)) return `EXIT_${code}`;
  return typeof code === 'string' && /^[A-Za-z][A-Za-z0-9_-]{1,59}$/.test(code) ? code : 'INTERNAL';
}
function unexpectedFailureMessage(error) {
  return `這次操作沒有完成，你的檔案沒有被這次操作改動，可以再試一次。如果一直發生，請把代碼告訴幫你設定的人：${failureCode(error)}。`;
}
module.exports = { userFacingMessage, unexpectedFailureMessage, failureCode };
