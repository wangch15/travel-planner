// 日文地址（選填）：給導航 App 複製用，一行文字。
const ADDR_MAX = 120;
function checkAddr(addr) {
  if (addr === undefined) return null;
  if (typeof addr !== 'string' || !addr.trim()) return '必須是非空字串';
  if (/[\r\n]/.test(addr)) return '只能有一行';
  if (addr.length > ADDR_MAX) return `超過 ${ADDR_MAX} 字`;
  return null;
}

module.exports = { checkAddr, ADDR_MAX };
