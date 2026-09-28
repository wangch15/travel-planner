// 找出「看起來是房東資訊的長段落備案」，讓 App 主動提議整理成住宿指南。
// 只看備案（alts）：房東的入住、停車、周邊推薦最常被塞在那裡；一般的雨天備案不該被誤判。
const MIN_CHARS = 120;
const MAX_SUGGESTIONS = 3;
const HOST_HINTS = /房東|入住|退房|停車|鑰匙|超市|超商|溫泉|泡湯|湯屋|民宿|check.?in|チェックイン|駐車/i;

// 送給 AI 的固定請求：交代要保留什麼、要怎麼拆；App 會把結果留成提案，先給人預覽再保存。
function migrationRequest(dayId, title) {
  return `請把第 ${dayId} 天備案「${title}」裡的住宿資訊整理成住宿指南：入住、停車、退房用條列步驟，重要提醒獨立列出；`
    + '推薦的店家按採買、餐飲、泡湯或自訂分類，每一家各自一項，網址放進連結按鈕。原文的每一項資訊與連結都要保留，'
    + '不知道的營業時間、車程不要補猜；密碼、訂房碼、電話只放私人筆記。整理好後把原本那段備案移除或縮成一句「詳見住宿指南」，'
    + '不要改動其他天或時間。';
}

function guideSuggestions(trip) {
  const hasStay = (trip.STAYS || []).some((s) => trip.PLACES?.[s.place]?.cat === 'stay');
  if (!hasStay) return [];
  const found = [];
  for (const day of trip.DAYS || []) {
    (day.alts || []).forEach((alt) => {
      const body = typeof alt?.body === 'string' ? alt.body : '';
      const title = String(alt?.title || '備案').slice(0, 40);
      if (body.length < MIN_CHARS || !HOST_HINTS.test(title + body)) return;
      found.push({ dayId: day.id, date: String(day.date || '').slice(0, 5), title, chars: body.length, request: migrationRequest(day.id, title) });
    });
  }
  return found.sort((a, b) => b.chars - a.chars).slice(0, MAX_SUGGESTIONS);
}

module.exports = { guideSuggestions, migrationRequest, MIN_CHARS };
