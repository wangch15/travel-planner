// 標誌版本：16–24px 的平台圖示與 favicon 沿用未切縫的 v2（摺痕縫在小尺寸會糊成雜訊），
// 32px 以上與介面一律用在摺痕切縫的 v3。
const SMALL_MARK_MAX = 24;
const markFile = (mode, size) => `travel-planner-mark-on-${mode}-${size <= SMALL_MARK_MAX ? 'v2' : 'v3'}.svg`;
module.exports = { SMALL_MARK_MAX, markFile };
