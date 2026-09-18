'use strict';
/* 產 HTML 字串的純函式，不碰 DOM。資料以自由變數取得（build 內嵌、測試用 vm 注入）。 */

function legHTML(leg, fromKey, toKey) {
  const walking = /步行/.test(leg.drive);
  const url = (fromKey && toKey && PLACES[fromKey] && PLACES[toKey] && fromKey !== toKey)
    ? routeUrl(PLACES[fromKey], PLACES[toKey], walking) : leg.url;
  return '<div class="leg">' + ico(walking ? 'i-walk' : 'i-car')
    + '<b>' + esc(leg.dist) + '</b>'
    + '<span><span class="k">地圖車程</span> <b>' + esc(leg.drive) + '</b></span>'
    + '<span><span class="k">建議預留</span> <b>' + esc(leg.buffer) + '</b></span>'
    + '<span class="road">' + esc(leg.road)
    + (url ? '<a href="' + esc(url) + '" target="_blank" rel="noopener">Google Maps 路線' + ico('i-ext') + '</a>' : '')
    + '</span></div>';
}
function stopHTML(s, i, stops) {
  const p = PLACES[s.place];
  let h = '<li class="stop" data-place="' + esc(s.place) + '"' + (s.kind === 'stay' ? ' data-stay="1"' : '') + '>';
  if (s.leg) h += legHTML(s.leg, i > 0 ? stops[i - 1].place : null, s.place);
  const title = DETAILS[s.place]
    ? '<button type="button" data-detail="' + esc(s.place) + '" aria-label="' + esc(p.name) + '，查看詳細說明">' + esc(p.name) + ico('i-open') + '</button>'
    : esc(p.name);
  h += '<div class="row"><span class="dot"></span><div class="sh"><time>' + esc(s.time) + '</time>'
    + '<h3>' + title + '</h3>'
    + '<span class="kind k-' + s.kind + '">' + KIND[s.kind] + '</span></div>'
    + '<p class="slabel">' + esc(s.label) + '</p>'
    + (s.note ? '<p class="snote">' + esc(s.note) + '</p>' : '')
    + (p.note && s.kind === 'stay' ? '<p class="snote">' + esc(p.note) + '</p>' : '')
    + '<a class="glink" href="' + esc(mapsUrl(p)) + '" target="_blank" rel="noopener">在 Google Maps 開啟' + ico('i-ext') + '</a>'
    + '</div></li>';
  return h;
}
function mealsHTML(day) {
  const mealRows = (day.meals || []).map(meal => {
    const keys = [...new Set([...meal.places, ...(meal.backupPlaces || [])])];
    const venues = keys.map(key => {
      const venue = DINING.venues[key];
      const budget = venue && PLACES[key].cat === 'shop' && meal.slot === '早餐'
        ? '早餐採買每人約 ¥300–700／五人約 ¥1,500–3,500（規劃估算）'
        : venue ? (PLACES[key].cat === 'shop' ? '熟食晚餐採買：' : '') + '每人約 ¥' + venue.budget[0].toLocaleString('en-US') + '–' + venue.budget[1].toLocaleString('en-US')
        + '／五人約 ¥' + (venue.budget[0] * 5).toLocaleString('en-US') + '–' + (venue.budget[1] * 5).toLocaleString('en-US') : '住宿餐食已含，內容與時段待確認';
      return '<li class="meal-venue"><button type="button" data-detail="' + esc(key) + '">' + esc(PLACES[key].name) + ico('i-open') + '</button>'
        + (venue ? '<span class="meal-tag">' + esc(venue.booking) + '</span>' : '')
        + '<p class="meal-facts">' + esc(budget) + '</p>'
        + (venue ? '<p><strong>餐點選擇：</strong>' + esc(venue.menu) + '</p>' : '') + '</li>';
    }).join('');
    return '<section class="meal-row"><h4>' + esc(meal.slot) + '<time>' + esc(meal.time) + '</time></h4>'
      + '<p>' + esc(meal.plan) + '</p>' + (meal.cooking ? '<p class="meal-facts"><strong>自煮五人食材約 ¥6,000–9,000</strong>（每人 ¥1,200–1,800）；下列熟食／餐廳為替代預算，不重複相加。</p>' : '') + (venues ? '<ul class="meal-venues">' + venues + '</ul>' : '')
      + '<p class="meal-fallback"><strong>備案：</strong>' + esc(meal.fallback) + '</p></section>';
  }).join('');
  const cooking = day.meals.some(meal => meal.cooking) ? '<details class="cooking"><summary>自煮採買、五人份量與設備確認</summary>'
    + ['plan', 'equipment', 'list', 'budget', 'safety', 'fallback'].map(key => '<p>' + esc(DINING.cooking[key]) + '</p>').join('')
    + '<div class="altspots">' + DINING.cooking.refs.map(ref => '<a class="chip" href="' + esc(ref.u) + '" target="_blank" rel="noopener">' + esc(ref.t) + ico('i-ext') + '</a>').join('') + '</div></details>' : '';
  return '<section class="meals" id="meals-' + day.id + '"><h3>今天怎麼吃</h3>'
    + '<p class="meal-policy">金額皆為日圓規劃估算，候選擇一、不全部相加；點店名看菜單、訂位方式與來源。' + esc(DINING.checked) + ' 查閱。</p>'
    + mealRows + cooking + '<p class="meal-legend">地圖「餐」為餐廳、「購」為超市，點標記可開詳情；候選不代表全部都去，新餐廳座標為概略位置。</p></section>';
}
function dayHTML(day) {
  let h = '<div class="dayhead">'
    + '<div class="meta"><span class="bar"></span><span>Day ' + day.id + '</span><span>' + esc(day.date) + '</span>'
    + (day.weekday ? '<span>' + esc(day.weekday) + '</span>' : '') + '</div>'
    + '<div class="day-title-row"><h2>' + esc(day.title) + '</h2>'
    + '<a class="map-list-link" href="' + esc(day.mapList.url) + '" target="_blank" rel="noopener noreferrer" aria-label="在 Google Maps 開啟 ' + esc(day.mapList.name) + ' 私人清單（新分頁）" aria-describedby="map-list-note-' + day.id + '">地圖清單</a></div>'
    + '<div class="brief"><span class="tag">家人已討論的輪廓</span><p>' + esc(day.theme) + '</p></div>'
    + '<p class="lead">' + esc(day.lead) + '</p>'
    + '<a class="meal-jump" href="#meals-' + day.id + '">查看今天三餐・價位・訂位建議 ↓</a>'
    + '<p class="map-list-note" id="map-list-note-' + day.id + '">私人清單・' + (day.mapList.placeKeys.length + (day.mapList.extraPlaces || []).length) + ' 個地點，含餐食與備案；需登入有權限的 Google 帳號。</p></div>';
  h += '<ol class="stops">' + day.stops.map((st, i) => stopHTML(st, i, day.stops)).join('') + '</ol>';
  h += mealsHTML(day);
  if (day.alts && day.alts.length) {
    h += '<details open><summary>' + ico('i-swap') + '當天可以怎麼換<span class="n">' + day.alts.length + '</span></summary>'
      + day.alts.map((a) => {
        const keys = (a.places || (a.place ? [a.place] : [])).filter((k) => PLACES[k]);
        return '<div class="alt"><h4>' + esc(a.title) + '</h4><p>' + esc(a.body) + '</p>'
          + (keys.length ? '<div class="altspots">' + keys.map((k) => DETAILS[k]
              ? '<button type="button" class="chip" data-detail="' + esc(k) + '">' + ico('i-open') + esc(PLACES[k].name) + '</button>'
              : '<a class="chip" href="' + esc(mapsUrl(PLACES[k])) + '" target="_blank" rel="noopener">' + ico('i-ext') + esc(PLACES[k].name) + '</a>').join('') + '</div>' : '')
          + '</div>';
      }).join('') + '</details>';
  }
  if (day.cautions && day.cautions.length) {
    h += '<details><summary>' + ico('i-note') + '出發前要確認的事<span class="n">' + day.cautions.length + '</span></summary><ul class="cautions">'
      + day.cautions.map((c) => '<li>' + ico('i-note') + '<span>' + esc(c) + '</span></li>').join('') + '</ul></details>';
  }
  return '<div class="panel-in" style="--dc:' + day.color + '">' + h + '</div>';
}
function overviewHTML() {
  const total = STAYS.reduce((n, s) => n + s.nights, 0);
  let h = '<div class="panel-in ov">';

  h += '<section><h3>餐食與訂位</h3><p class="hint">餐廳目前尚未預約；每天的餐點選擇、預算與備案請見詳細行程。</p>'
    + '<ul class="cautions"><li>優先：10/17 11:00 利久牛舌、10/16 11:45 さんとり茶屋午餐。現在可先詢問，尚未確認五人空位；出發前一週再確認。</li>'
    + '<li>10/12 國定假日：焰藏先問營業與候位，平田牧場晚餐建議訂位；不要把不同分店的規則混用。</li>'
    + '<li>10/13 推薦山形壽喜燒自煮，五人食材約 ¥6,000–9,000；鍋具先問房東。10/16 鹽釜可再選一晚自煮或超市熟食。</li></ul>'
    + '<div class="altspots"><button type="button" class="chip" data-detail="rikyu">牛舌店詳情</button><button type="button" class="chip" data-detail="santori">さんとり茶屋詳情</button><button type="button" class="chip" data-day="3">查看自煮日</button></div></section>';
  h += '<section><h3>六個晚上，三個落腳處</h3>'
    + '<p class="hint">入住日期、地址、餐食與入住退房時間，已於 2026/09/17 核對 Booking 訂單。色塊寬度就是住幾晚——山形三晚是這趟的重心。</p>'
    + '<div class="rail"><div class="railbar" style="grid-template-columns:' + STAYS.map((s) => s.nights + 'fr').join(' ') + '">'
    + STAYS.map((s, i) => '<button type="button" class="railseg" data-detail="' + esc(s.place) + '" style="--sc:' + DAYS[i === 0 ? 0 : (i === 1 ? 3 : 4)].color + '">'
      + ico('i-bed') + s.nights + ' 晚</button>').join('')
    + '</div><div class="raildates"><span>10/11 抵達</span><span>共 ' + total + ' 晚</span><span>10/17 返程</span></div></div>'
    + '<div class="staylist">'
    + STAYS.map((s, i) => {
      const p = PLACES[s.place], c = DAYS[i === 0 ? 0 : (i === 1 ? 3 : 4)].color;
      return '<div class="stayrow" style="--sc:' + c + '">'
        + '<div class="nm"><span class="sw"></span><h4><button type="button" data-detail="' + esc(s.place) + '">' + esc(p.name) + '</button></h4>'
        + '<span class="nights">' + s.nights + ' 晚</span></div>'
        + '<div class="det"><p class="facts"><span>' + esc(s.meals) + '</span><span>' + esc(s.role) + '</span></p>'
        + '<p class="when">' + esc(s.check) + '</p></div></div>';
    }).join('') + '</div></section>';

  h += '<section><h3>七天主軸</h3><p class="hint">點任一天可切換到該日的詳細行程與地圖。</p><div class="tablewrap"><table class="overview-table days-table" role="table" aria-label="七天主軸">'
    + '<thead role="rowgroup"><tr role="row"><th role="columnheader" scope="col">日期</th><th role="columnheader" scope="col">主題</th><th role="columnheader" scope="col">過夜</th></tr></thead><tbody role="rowgroup">'
    + DAYS.map((dy) => '<tr role="row"><td role="cell" class="entry-date"><span class="dnum" style="--dc:' + dy.color + '">Day ' + dy.id + '</span><br><span class="dchip">' + esc(dy.date) + '</span></td>'
      + '<td role="cell"><button type="button" class="lk" data-day="' + dy.id + '">' + esc(dy.title) + '</button></td>'
      + '<td role="cell"><span class="mobile-field-label" aria-hidden="true">' + (dy.id === DAYS[DAYS.length - 1].id ? '返程：' : '住宿：') + '</span>' + esc(PLACES[dy.stops[dy.stops.length - 1].place].name) + '</td></tr>').join('')
    + '</tbody></table></div></section>';

  h += '<section><h3>加點建議：為什麼放在這一天</h3>'
    + '<p class="hint">這些都不是家人已指定的必去點。時間不夠就先砍這裡，不要砍主軸。</p><div class="tablewrap"><table class="overview-table addons-table" role="table" aria-label="加點建議">'
    + '<thead role="rowgroup"><tr role="row"><th role="columnheader" scope="col">加點</th><th role="columnheader" scope="col">日期</th><th role="columnheader" scope="col">位置與價值</th><th role="columnheader" scope="col">約需時間</th></tr></thead><tbody role="rowgroup">'
    + ADDONS.map((a) => '<tr role="row"><td role="cell"><button type="button" class="lk" data-detail="' + esc(a.place) + '">' + esc(PLACES[a.place].name) + '</button></td>'
      + '<td role="cell" class="entry-date"><span class="dchip">' + esc(a.day) + '</span></td><td role="cell">' + esc(a.why) + '</td><td role="cell"><span class="mobile-field-label" aria-hidden="true">約需時間：</span><span class="dchip">' + esc(a.cost) + '</span></td></tr>').join('')
    + '</tbody></table></div></section>';

  h += '<section><h3>行前需要補齊的資料</h3>'
    + '<div class="progress"><span id="ptext">0 / ' + CHECKLIST.length + '</span><span class="ptrack"><span class="pfill" id="pfill"></span></span></div>'
    + '<p class="hint">勾選狀態只存在這台裝置的瀏覽器，不會同步到手機或其他人。</p><ul class="checks">'
    + CHECKLIST.map((c, i) => '<li><input type="checkbox" id="ck' + i + '"><label for="ck' + i + '">' + esc(c) + '</label></li>').join('')
    + '</ul></section>';

  h += '<div class="foot">'
    + '<p>距離與車程來自 2026/09/17 於 Google Maps 查詢公開地標之間的道路路線，不是直線距離，也不是 10 月旅遊當日的路況預報。車程不含休息、找車位、從停車場步行、景區接駁或臨時管制。</p>'
    + '<p>地圖為 OpenStreetMap 圖資（© OpenStreetMap 貢獻者，ODbL）與国土地理院高程資料繪製。點與點之間的虛線只表示造訪順序與相對位置，不是實際行車路線。</p>'
    + '<p>航班：星宇航空 10/11 11:35→16:00、10/17 17:20→20:10；租車：仙台機場取還，Nissan Serena。本頁不收錄訂單確認碼或門鎖密碼。</p>'
    + '</div></div>';
  return h;
}

/* 這個地點在行程裡扮演什麼角色、出現在哪幾天 */
function roleOf(key) {
  const days = [], kinds = [];
  DAYS.forEach((dy) => {
    const hit = dy.stops.find((st) => st.place === key);
    if (hit) { days.push(dy); kinds.push(hit.kind); }
    else if ((dy.meals || []).some(m => [...m.places, ...(m.backupPlaces || [])].includes(key))) { days.push(dy); kinds.push('suggest'); }
    else if ((dy.alts || []).some((a) => a.place === key || (a.places || []).includes(key))) { days.push(dy); kinds.push('alt'); }
  });
  const kind = kinds.find((k) => k === 'main') || kinds.find((k) => k === 'stay') || kinds[0] || 'alt';
  return { days, kind };
}


/* 燈箱內文。照片區塊由 app.js 另外組。 */
function detailBodyHTML(key) {
  const p = PLACES[key], d = DETAILS[key];
  const role = roleOf(key);
  const color = role.days[0] ? role.days[0].color : 'var(--accent)';
  return '<div style="--dc:' + color + '">'
    + '<div class="lb-head"><h2 id="lbTitle">' + esc(p.name) + '</h2><span class="kind k-' + role.kind + '">' + KIND[role.kind] + '</span></div>'
    + (p.jp && p.jp !== p.name ? '<p class="lb-jp">' + esc(p.jp) + '</p>' : '')
    + '<div class="lb-meta"><span class="lb-chip">' + ico('i-clock') + esc(d.stay) + '</span>'
    + role.days.map((dy) => '<span class="lb-chip day" style="--dc:' + dy.color + '">' + ico('i-cal') + 'Day ' + dy.id + '・' + esc(dy.date.slice(0, 5)) + '</span>').join('')
    + '</div>'
    + '<p class="lb-summary">' + md(d.summary) + '</p>'
    + '<div class="lb-h">' + (d.dining ? '吃什麼・怎麼安排' : '看點') + '</div><ul class="lb-hl">' + d.highlights.map((h) => '<li>' + md(h) + '</li>').join('') + '</ul>'
    + (d.info && d.info.length ? '<div class="lb-h">實用資訊</div><dl class="lb-info">' + d.info.map((r) => '<dt>' + esc(r[0]) + '</dt><dd>' + md(r[1]) + '</dd>').join('') + '</dl>' : '')
    + '<div class="lb-h">參考資料</div><ul class="lb-refs">' + d.refs.map((r) => '<li><a href="' + esc(r.u) + '" target="_blank" rel="noopener">' + esc(r.t) + ico('i-ext') + '</a></li>').join('') + '</ul>'
    + '<div class="lb-foot"><a class="glink" href="' + esc(mapsUrl(p)) + '" target="_blank" rel="noopener">在 Google Maps 開啟' + ico('i-ext') + '</a>'
    + (p.note ? '<span class="lb-note" style="margin:0">' + esc(p.note) + '</span>' : '') + '</div>'
    + '<p class="lb-note">' + (d.dining ? '餐食資料於 ' + esc(DINING.checked) + ' 整理，官網與搜尋摘要層級見參考資料；預算是規劃估算。尚未電話確認或訂位，出發前重查。' : '景點資料依官方網站與維基百科整理（2026/09/17 查閱）；營業與費用可能變動，出發前以官網為準。') + ' 照片來源標於各張下方，僅供家人旅行參考。</p>'
    + '</div>';
}
