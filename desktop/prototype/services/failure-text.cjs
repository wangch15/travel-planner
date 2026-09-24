// 服務丟出的錯誤常附有給人看的中文說明（例如 fail('ADOPTION_REQUIRED', '網站名稱已存在…')）。
// 錯誤碼沒收進 main.cjs 的對照表時，要顯示這段說明，不能換成看不出原因的預設訊息。
// 只採用中文說明：英文或系統原始錯誤（路徑、stack、指令輸出）不直接給使用者看。
const MAX_LENGTH = 400;
function userFacingMessage(error) {
  const text = typeof error?.message === 'string' ? error.message.trim() : '';
  if (!text || text === error.code || text.length > MAX_LENGTH) return null;
  return /[㐀-鿿]/u.test(text) ? text : null;
}
module.exports = { userFacingMessage };
