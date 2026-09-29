'use strict';
/* 產 HTML 字串的純函式，不碰 DOM。資料以自由變數取得（build 內嵌、測試用 vm 注入）。 */

const MODE_ICON = { drive:'i-car', transit:'i-train', walk:'i-walk', taxi:'i-car', ferry:'i-ship' };
const MODE_NAME = { drive:'地圖車程', transit:'乘車時間', walk:'步行時間', taxi:'車程', ferry:'航行時間' };
function legHTML(leg, fromKey, toKey) {
  const url = (fromKey && toKey && PLACES[fromKey] && PLACES[toKey] && fromKey !== toKey)
    ? routeUrl(PLACES[fromKey], PLACES[toKey], leg.mode) : leg.url;
  return '<div class="leg">' + ico(MODE_ICON[leg.mode] || 'i-car')
    + (leg.dist ? '<b>' + esc(leg.dist) + '</b>' : '')
    + '<span><span class="k">' + MODE_NAME[leg.mode] + '</span> <b>' + esc(leg.time) + '</b></span>'
    + (leg.buffer ? '<span><span class="k">建議預留</span> <b>' + esc(leg.buffer) + '</b></span>' : '')
    + (leg.fare ? '<span><span class="k">車資</span> <b>' + esc(leg.fare) + '</b></span>' : '')
    + '<span class="road">' + esc(leg.via || '')
    + (url ? '<a href="' + esc(url) + '" target="_blank" rel="noopener">Google Maps 路線' + ico('i-ext') + '</a>' : '')
    + '</span></div>';
}

// trips/<slug>/extra.js 的自訂區塊。html 是行程擁有者自己的內容，原樣插入。
function extraHTML(where, dayId) {
  return (EXTRA.sections || [])
    .filter((s) => s.where === where && (where !== 'day' || s.day === dayId))
    .map((s) => '<section class="extra" id="extra-' + esc(s.id) + '">'
      + (s.title ? '<h3>' + esc(s.title) + '</h3>' : '') + s.html + '</section>')
    .join('');
}

/* 停留點自己的停車提醒。掛在該點下面，才知道是在講哪一個點。
   同一天重複造訪同一個地點時只在第一次出現——車只停一次。 */
function stopParkingHTML(p) {
  const pk = p.parking;
  if (!pk) return '';
  return '<div class="stop-parking">'
    + '<div class="pk-head">' + ico('i-car') + '<span class="pk-nm">' + esc(pk.name || '停車') + '</span>'
    + (pk.fee ? '<span class="pk-fee">' + esc(pk.fee) + '</span>' : '') + '</div>'
    + (pk.note ? '<p class="pk-note">' + esc(pk.note) + '</p>' : '')
    + '<a class="glink" href="https://www.google.com/maps/search/?api=1&query=' + ll(pk)
    + '" target="_blank" rel="noopener">導航到停車場' + ico('i-ext') + '</a>'
    + '</div>';
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
    + (stops.slice(0, i).some((x) => x.place === s.place) ? '' : stopParkingHTML(p))
    + '</div></li>';
  return h;
}
function mealsHTML(day) {
  const mealRows = (day.meals || []).map(meal => {
    const keys = [...new Set([...meal.places, ...(meal.backupPlaces || [])])];
    const venues = keys.map(key => {
      const venue = DINING.venues[key];
      const range = meal.budget || (venue && venue.budget);
      const budget = range
        ? (PLACES[key].cat === 'shop' ? '採買：' : '') + money(range)
        : '住宿餐食已含，內容與時段待確認';
      return '<li class="meal-venue"><button type="button" data-detail="' + esc(key) + '">' + esc(PLACES[key].name) + ico('i-open') + '</button>'
        + (venue ? '<span class="meal-tag">' + esc(venue.booking) + '</span>' : '')
        + '<p class="meal-facts">' + esc(budget) + '</p>'
        + (venue ? '<p><strong>餐點選擇：</strong>' + esc(venue.menu) + '</p>' : '') + '</li>';
    }).join('');
    const total = DINING.cooking && DINING.cooking.total;
    return '<section class="meal-row"><h4>' + esc(meal.slot) + '<time>' + esc(meal.time) + '</time></h4>'
      + '<p>' + esc(meal.plan) + '</p>'
      + (meal.cooking && total ? '<p class="meal-facts"><strong>自煮食材 ' + esc(money(total)) + '</strong>；下列熟食／餐廳為替代預算，不重複相加。</p>' : '')
      + (venues ? '<ul class="meal-venues">' + venues + '</ul>' : '')
      + '<p class="meal-fallback"><strong>備案：</strong>' + esc(meal.fallback) + '</p></section>';
  }).join('');
  const cooking = (day.meals || []).some(meal => meal.cooking) && DINING.cooking
    ? '<details class="cooking"><summary>自煮採買、' + CONFIG.party + ' 人份量與設備確認</summary>'
      + ['plan', 'equipment', 'list', 'budget', 'safety', 'fallback'].filter((key) => DINING.cooking[key]).map(key => '<p>' + esc(DINING.cooking[key]) + '</p>').join('')
      + '<div class="altspots">' + (DINING.cooking.refs || []).map(ref => '<a class="chip" href="' + esc(ref.u) + '" target="_blank" rel="noopener">' + esc(ref.t) + ico('i-ext') + '</a>').join('') + '</div></details>'
    : '';
  return '<section class="meals" id="meals-' + day.id + '"><h3>今天怎麼吃</h3>'
    + '<p class="meal-policy">金額皆為規劃估算，候選擇一、不全部相加；點店名看菜單、訂位方式與來源。'
    + (DINING.checked ? esc(DINING.checked) + ' 查閱。' : '') + '</p>'
    + mealRows + cooking + '<p class="meal-legend">地圖「餐」為餐廳、「購」為超市，點標記可開詳情；候選不代表全部都去，餐飲座標為概略位置。</p></section>';
}
function dayHTML(day) {
  const hasList = !!(day.mapList && CONFIG.sections.mapLists);
  const hasMeals = !!(CONFIG.sections.dining && (day.meals || []).length);
  let h = '<div class="dayhead">'
    + '<div class="meta"><span class="bar"></span><span>Day ' + day.id + '</span><span>' + esc(day.date) + '</span>'
    + (day.weekday ? '<span>' + esc(day.weekday) + '</span>' : '') + '</div>'
    + '<div class="day-title-row"><h2>' + esc(day.title) + '</h2>'
    + (hasList ? '<a class="map-list-link" href="' + esc(day.mapList.url) + '" target="_blank" rel="noopener noreferrer" aria-label="在 Google Maps 開啟 ' + esc(day.mapList.name) + ' 私人清單（新分頁）">地圖清單</a>' : '')
    + '</div>'
    + '<div class="brief"><span class="tag">這天的輪廓</span><p>' + esc(day.theme) + '</p></div>'
    + '<p class="lead">' + esc(day.lead) + '</p>'
    + (hasMeals ? '<a class="meal-jump" href="#meals-' + day.id + '">查看今天的餐食・價位・訂位建議 ↓</a>' : '')
    + '</div>';
  h += guideEntryHTML(day);
  h += '<ol class="stops">' + day.stops.map((st, i) => stopHTML(st, i, day.stops)).join('') + '</ol>';
  if (hasMeals) h += mealsHTML(day);
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
  h += extraHTML('day', day.id);
  return '<div class="panel-in" style="--dc:' + day.color + '">' + h + '</div>';
}
const dayColor = (id) => { const d = DAYS.find((x) => x.id === id); return d ? d.color : 'var(--accent)'; };

/* 總覽的餐食段：OVERVIEW.dining 缺席就整段不輸出 */
function ovDiningHTML() {
  const o = OVERVIEW.dining;
  if (!o) return '';
  const chips = (o.chips || []).map((c) => c.detail
    ? '<button type="button" class="chip" data-detail="' + esc(c.detail) + '">' + esc(c.label) + '</button>'
    : '<button type="button" class="chip" data-day="' + esc(c.day) + '">' + esc(c.label) + '</button>').join('');
  return '<section><h3>餐食與訂位</h3>'
    + (o.hint ? '<p class="hint">' + esc(o.hint) + '</p>' : '')
    + ((o.notes || []).length ? '<ul class="cautions">' + o.notes.map((n) => '<li>' + esc(n) + '</li>').join('') + '</ul>' : '')
    + (chips ? '<div class="altspots">' + chips + '</div>' : '') + '</section>';
}

/* 住宿段：色條寬度依 nights，顏色取 STAYS.day 對應那天 */
function ovStaysHTML() {
  if (!STAYS.length) return '';
  const o = OVERVIEW.stays || {};
  const total = STAYS.reduce((n, s) => n + s.nights, 0);
  const last = DAYS[DAYS.length - 1];
  const title = o.title || total + ' 個晚上，' + STAYS.length + ' 個落腳處';
  const arrive = o.arrive || ('Day ' + DAYS[0].id + ' ' + DAYS[0].date);
  const depart = o.depart || ('Day ' + last.id + ' ' + last.date);
  return '<section><h3>' + esc(title) + '</h3>'
    + (o.hint ? '<p class="hint">' + esc(o.hint) + '</p>' : '')
    + '<div class="rail"><div class="railbar" style="grid-template-columns:' + STAYS.map((s) => s.nights + 'fr').join(' ') + '">'
    + STAYS.map((s) => '<button type="button" class="railseg" data-detail="' + esc(s.place) + '" style="--sc:' + dayColor(s.day) + '">'
      + ico('i-bed') + s.nights + ' 晚</button>').join('')
    + '</div><div class="raildates"><span>' + esc(arrive) + '</span><span>共 ' + total + ' 晚</span><span>' + esc(depart) + '</span></div></div>'
    + '<div class="staylist">'
    + STAYS.map((s) => {
      const p = PLACES[s.place];
      return '<div class="stayrow" style="--sc:' + dayColor(s.day) + '">'
        + '<div class="nm"><span class="sw"></span><h4><button type="button" data-detail="' + esc(s.place) + '">' + esc(p.name) + '</button></h4>'
        + '<span class="nights">' + s.nights + ' 晚</span></div>'
        + '<div class="det"><p class="facts"><span>' + esc(s.meals) + '</span><span>' + esc(s.role) + '</span></p>'
        + '<p class="when">' + esc(s.check) + '</p>'
        + guidesForStay(s.place).map((g) => guideButtonHTML(g, 'guide-open compact')).join('') + '</div></div>';
    }).join('') + '</div></section>';
}

function ovDaysHTML() {
  const label = DAYS.length + ' 天主軸';
  return '<section><h3>' + label + '</h3><p class="hint">點任一天可切換到該日的詳細行程與地圖。</p>'
    + '<div class="tablewrap"><table class="overview-table days-table" role="table" aria-label="' + label + '">'
    + '<thead role="rowgroup"><tr role="row"><th role="columnheader" scope="col">日期</th><th role="columnheader" scope="col">主題</th><th role="columnheader" scope="col">過夜</th></tr></thead><tbody role="rowgroup">'
    + DAYS.map((dy) => '<tr role="row"><td role="cell" class="entry-date"><span class="dnum" style="--dc:' + dy.color + '">Day ' + dy.id + '</span><br><span class="dchip">' + esc(dy.date) + '</span></td>'
      + '<td role="cell"><button type="button" class="lk" data-day="' + dy.id + '">' + esc(dy.title) + '</button></td>'
      + '<td role="cell"><span class="mobile-field-label" aria-hidden="true">' + (dy.id === DAYS[DAYS.length - 1].id ? '返程：' : '住宿：') + '</span>' + esc(PLACES[dy.stops[dy.stops.length - 1].place].name) + '</td></tr>').join('')
    + '</tbody></table></div></section>';
}

function ovAddonsHTML() {
  if (!(ADDONS || []).length) return '';
  return '<section><h3>加點建議：為什麼放在這一天</h3>'
    + (OVERVIEW.addonsHint ? '<p class="hint">' + esc(OVERVIEW.addonsHint) + '</p>' : '')
    + '<div class="tablewrap"><table class="overview-table addons-table" role="table" aria-label="加點建議">'
    + '<thead role="rowgroup"><tr role="row"><th role="columnheader" scope="col">加點</th><th role="columnheader" scope="col">日期</th><th role="columnheader" scope="col">位置與價值</th><th role="columnheader" scope="col">約需時間</th></tr></thead><tbody role="rowgroup">'
    + ADDONS.map((a) => '<tr role="row"><td role="cell"><button type="button" class="lk" data-detail="' + esc(a.place) + '">' + esc(PLACES[a.place].name) + '</button></td>'
      + '<td role="cell" class="entry-date"><span class="dchip">' + esc(a.day) + '</span></td><td role="cell">' + esc(a.why) + '</td><td role="cell"><span class="mobile-field-label" aria-hidden="true">約需時間：</span><span class="dchip">' + esc(a.cost) + '</span></td></tr>').join('')
    + '</tbody></table></div></section>';
}

function ovReservationsHTML() {
  const reminders = OVERVIEW.reservations || [];
  if (!reminders.length) return '';
  return '<section aria-labelledby="reservation-title"><h3 id="reservation-title">預約提醒</h3>'
    + '<p class="hint">先處理可提前預約的景點與餐廳。點名稱查看詳情，點日期查看當日行程；勾選只保存在這台裝置，不代表已向店家完成預約。</p>'
    + '<ul class="reservation-list">' + reminders.map(r => {
      const dates = DAYS.filter(d => r.days.includes(d.id));
      return '<li class="reservation-item"><h4><button type="button" class="lk" data-detail="' + esc(r.place) + '">' + esc(PLACES[r.place].name) + ' · 查看詳情</button></h4>'
        + '<div class="reservation-days">' + dates.map(d => '<button type="button" class="chip" data-day="' + d.id + '">Day ' + d.id + ' · ' + esc(d.date) + '</button>').join('') + '</div>'
        + '<p>' + esc(r.note) + '</p><label class="reservation-done"><input type="checkbox" data-reservation="' + esc(r.id) + '">已處理<span class="sr-only">：' + esc(PLACES[r.place].name) + '</span></label></li>';
    }).join('') + '</ul></section>';
}

function ovChecklistHTML() {
  if (!CONFIG.sections.checklist || !(CHECKLIST || []).length) return '';
  return '<section><h3>行前需要補齊的資料</h3>'
    + '<div class="progress"><span id="ptext">0 / ' + CHECKLIST.length + '</span><span class="ptrack"><span class="pfill" id="pfill"></span></span></div>'
    + '<p class="hint">勾選狀態只存在這台裝置的瀏覽器，不會同步到手機或其他人。</p><ul class="checks">'
    + CHECKLIST.map((c, i) => '<li><input type="checkbox" id="ck' + i + '"><label for="ck' + i + '">' + esc(c) + '</label></li>').join('')
    + '</ul></section>';
}

function overviewHTML() {
  const foot = (OVERVIEW.foot || []).length
    ? '<div class="foot">' + OVERVIEW.foot.map((p) => '<p>' + esc(p) + '</p>').join('') + '</div>' : '';
  return '<div class="panel-in ov">'
    + ovReservationsHTML() + ovDiningHTML() + ovStaysHTML() + ovDaysHTML() + ovAddonsHTML() + ovChecklistHTML()
    + extraHTML('overview') + foot + '</div>';
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
function parkingHTML(p) {
  const pk = p.parking;
  if (!pk) return '';
  const url = 'https://www.google.com/maps/search/?api=1&query=' + ll(pk);
  return '<div class="lb-h">停車</div><dl class="lb-info">'
    + (pk.name ? '<dt>停車場</dt><dd>' + esc(pk.name) + '</dd>' : '')
    + (pk.fee ? '<dt>費用</dt><dd>' + md(pk.fee) + '</dd>' : '')
    + (pk.note ? '<dt>注意</dt><dd>' + md(pk.note) + '</dd>' : '')
    + '<dt>導航</dt><dd><a href="' + esc(url) + '" target="_blank" rel="noopener">在 Google Maps 開啟停車場' + ico('i-ext') + '</a></dd>'
    + '</dl>';
}
// 燈箱上方的圖片區。沒照片就整個隱藏——原本只有餐廳會隱藏，其他地點沒照片時
// 圖片區仍佔 46dvh 只放一行字。餐廳那條特例證明作者早就認定那樣不好，只是沒做全。
// 想看照片的人往下捲就有「參考資料」列著官網，不需要在這裡再提示一次。
function lightboxSliderHTML(key) {
  const p = PLACES[key];
  const photos = PHOTOS[key] || [];
  const track = photos.map((ph, i) => '<figure><img src="' + esc(ph.src) + '" alt="' + esc(p ? p.name : '') + '" loading="' + (i ? 'lazy' : 'eager') + '" decoding="async">'
    + '<figcaption>' + esc(ph.credit) + (ph.page ? '・<a href="' + esc(ph.page) + '" target="_blank" rel="noopener">' + (ph.commons ? 'Wikimedia Commons' : '來源') + '</a>' : '') + '</figcaption></figure>').join('');
  const dots = photos.length > 1 ? photos.map((_, i) => '<i' + (i ? '' : ' class="on"') + '></i>').join('') : '';
  return { hidden: photos.length === 0, track, dots, navHidden: photos.length < 2 };
}

function detailBodyHTML(key) {
  const p = PLACES[key], d = DETAILS[key];
  const role = roleOf(key);
  const color = role.days[0] ? role.days[0].color : 'var(--accent)';
  const checked = d.dining
    ? (DINING.checked ? '餐食資料於 ' + esc(DINING.checked) + ' 整理；預算是規劃估算，尚未確認或訂位，出發前重查。' : '')
    : (OVERVIEW.checked ? '景點資料於 ' + esc(OVERVIEW.checked) + ' 依官方網站整理；營業與費用可能變動，出發前以官網為準。' : '');
  return '<div style="--dc:' + color + '">'
    + '<div class="lb-head"><h2 id="lbTitle">' + esc(p.name) + '</h2><span class="kind k-' + role.kind + '">' + KIND[role.kind] + '</span></div>'
    + (p.local && p.local !== p.name ? '<p class="lb-jp">' + esc(p.local) + '</p>' : '')
    + '<div class="lb-meta"><span class="lb-chip">' + ico('i-clock') + esc(d.stay) + '</span>'
    + role.days.map((dy) => '<span class="lb-chip day" style="--dc:' + dy.color + '">' + ico('i-cal') + 'Day ' + dy.id + '・' + esc(dy.date.slice(0, 5)) + '</span>').join('')
    + '</div>'
    + '<p class="lb-summary">' + md(d.summary) + '</p>'
    + '<div class="lb-h">' + (d.dining ? '吃什麼・怎麼安排' : '看點') + '</div><ul class="lb-hl">' + d.highlights.map((h) => '<li>' + md(h) + '</li>').join('') + '</ul>'
    + (d.info && d.info.length ? '<div class="lb-h">實用資訊</div><dl class="lb-info">' + d.info.map((r) => '<dt>' + esc(r[0]) + '</dt><dd>' + md(r[1]) + '</dd>').join('') + '</dl>' : '')
    + parkingHTML(p)
    + '<div class="lb-h">參考資料</div><ul class="lb-refs">' + d.refs.map((r) => '<li><a href="' + esc(r.u) + '" target="_blank" rel="noopener">' + esc(r.t) + ico('i-ext') + '</a></li>').join('') + '</ul>'
    + '<div class="lb-foot"><a class="glink" href="' + esc(mapsUrl(p)) + '" target="_blank" rel="noopener">在 Google Maps 開啟' + ico('i-ext') + '</a>'
    + (p.note ? '<span class="lb-note" style="margin:0">' + esc(p.note) + '</span>' : '') + '</div>'
    + '<p class="lb-note">' + checked + ' 照片來源標於各張下方。</p>'
    + '</div>';
}

/* ── 住宿指南 ──
   同一份 STAY_GUIDES 只存一次；各相關日期只放一張入口卡，內容在燈箱裡展開，不進時間軸。
   來源與查核狀態逐項顯示：房東推薦不等於官方查核，查核過的只有那一條事實。 */
const GUIDE_LIST_TITLE = { shopping:'採買', dining:'餐飲', onsen:'泡湯' };
const GUIDE_SECTION_TITLE = { checkin:'入住方式', parking:'停車', checkout:'退房' };
const GUIDE_SOURCE = { host:'房東提供', official:'官方資料', agent:'AI 整理', user:'使用者提供', other:'其他來源' };
const guideList = () => (typeof STAY_GUIDES !== 'undefined' && Array.isArray(STAY_GUIDES) ? STAY_GUIDES : []);
const guideById = (id) => guideList().find((g) => g.id === id) || null;
const guidesForDay = (dayId) => guideList().filter((g) => (g.days || []).includes(dayId));
const guidesForStay = (key) => guideList().filter((g) => g.stay === key);
const guideTitle = (g) => g.title || ((PLACES[g.stay] ? PLACES[g.stay].name : '住宿') + ' 住宿指南');
const guideListTitle = (l) => l.title || GUIDE_LIST_TITLE[l.kind] || '推薦';
const guideSectionTitle = (s) => s.title || GUIDE_SECTION_TITLE[s.kind] || '說明';
const sourceLabel = (s) => (s ? s.label || GUIDE_SOURCE[s.type] || '' : '');
const GUIDE_LINK_ICON = { official:'i-globe', map:'i-map', other:'i-ext' };
/* 連結按鈕：桌面顯示文字，手機只顯示圖示（名稱在 aria-label） */
const guideBtnInner = (icon, label, trail) => ico(icon, 'g-btn-i') + '<span class="g-btn-t">' + esc(label) + '</span>' + ico(trail, 'g-btn-x');

/* 入口卡上的一行摘要：入住・停車・採買 4・餐飲 3 */
function guideDigest(g) {
  return [
    ...(g.sections || []).map(guideSectionTitle),
    ...(g.lists || []).map((l) => guideListTitle(l) + ' ' + l.items.length),
  ].join('・');
}
function guideButtonHTML(g, cls) {
  const digest = guideDigest(g);
  return '<button type="button" class="' + cls + '" data-guide="' + esc(g.id) + '" aria-label="開啟' + esc(guideTitle(g)) + (digest ? '：' + esc(digest) : '') + '">'
    + ico('i-bed') + '<span class="ge-main"><span class="ge-k">住宿指南</span><span class="ge-t">' + esc(guideTitle(g)) + '</span>'
    + (digest ? '<span class="ge-s">' + esc(digest) + '</span>' : '') + '</span>' + ico('i-open') + '</button>';
}
function guideEntryHTML(day) {
  const list = guidesForDay(day.id);
  if (!list.length) return '';
  return '<div class="guide-entry">' + list.map((g) => guideButtonHTML(g, 'guide-open')).join('') + '</div>';
}

function guideSourceHTML(s, prefix) {
  if (!s) return '';
  const label = sourceLabel(s);
  return '<span class="g-src g-src-' + esc(s.type) + '">' + esc((prefix || '') + label) + (s.date ? '・' + esc(s.date) : '')
    + (s.url ? '・<a href="' + esc(s.url) + '" target="_blank" rel="noopener" aria-label="' + esc(label) + ' 來源（新分頁）">來源' + ico('i-ext') + '</a>' : '') + '</span>';
}
/* 單一事實的查核狀態：只有這條有 checked 才算查核過 */
function guideFactHTML(f) {
  const label = sourceLabel(f.source);
  const status = f.checked
    ? '<span class="g-chk ok">' + esc((label ? label + '・' : '') + f.checked + ' 查核') + '</span>'
    : '<span class="g-chk">' + esc((label ? label + '・' : '') + '未查核') + '</span>';
  const link = f.source && f.source.url ? ' <a href="' + esc(f.source.url) + '" target="_blank" rel="noopener" aria-label="' + esc(f.label) + ' 的來源（新分頁）">來源' + ico('i-ext') + '</a>' : '';
  return '<dt>' + esc(f.label) + '</dt><dd>' + esc(f.value) + ' ' + status + link + '</dd>';
}
function guideLinksHTML(it) {
  const links = (it.links || []).slice();
  const p = it.place && PLACES[it.place];
  if (p && !links.some((l) => l.kind === 'map')) links.push({ kind: 'map', label: '地圖', url: mapsUrl(p) });
  const btns = links.map((l) => '<a class="g-btn g-btn-' + esc(l.kind) + '" href="' + esc(l.url) + '" target="_blank" rel="noopener" aria-label="' + esc(it.name) + '：' + esc(l.label) + '（新分頁）" title="' + esc(l.label) + '">'
    + guideBtnInner(GUIDE_LINK_ICON[l.kind] || 'i-ext', l.label, 'i-ext') + '</a>');
  if (it.place && DETAILS[it.place]) btns.push('<button type="button" class="g-btn" data-detail="' + esc(it.place) + '" aria-label="' + esc(it.name) + '：詳細說明" title="詳細">' + guideBtnInner('i-open', '詳細', 'i-open') + '</button>');
  return btns.length ? '<div class="gi-links">' + btns.join('') + '</div>' : '';
}
/* 清單裡每一項的推薦來源若都同一類，就只在清單標題（或整份指南）說一次，不逐項重複 */
const sourceType = (s) => (s ? s.type : null);
function listSource(l, g) {
  const types = new Set(l.items.map((it) => sourceType(it.source || g.source)));
  if (types.size !== 1 || types.has(null)) return null;
  const first = l.items.find((it) => it.source) || {};
  return first.source || g.source;
}
function guideItemHTML(it, g, shared) {
  const src = it.source || g.source;
  const badge = src && !(shared && sourceType(shared) === sourceType(src));
  // 標籤文字已經出現在介紹裡就不重複顯示
  const tags = (it.tags || []).filter((t) => !(it.summary || '').includes(t));
  const meta = (it.summary ? '<span class="gi-sum">' + esc(it.summary) + '</span>' : '')
    + tags.map((t) => '<span class="gi-tag">' + esc(t) + '</span>').join('');
  const head = '<span class="gi-title"><span class="gi-name">' + esc(it.name) + '</span>'
    + (badge ? '<span class="gi-by">' + esc(sourceLabel(src)) + '</span>' : '') + '</span>'
    + (meta ? '<span class="gi-meta">' + meta + '</span>' : '');
  const body = ((it.facts || []).length ? '<dl class="gi-facts">' + it.facts.map(guideFactHTML).join('') + '</dl>' : '')
    + (it.note ? '<p class="gi-note">' + esc(it.note) + '</p>' : '')
    // 來源標籤已在標題列；有網址或日期時才在展開後補一行，避免重複
    + (it.source && (it.source.url || it.source.date) ? '<p class="gi-srcline">推薦來源：' + guideSourceHTML(it.source) + '</p>' : '');
  return '<li class="g-item" id="gi-' + esc(g.id) + '-' + esc(it.id) + '">'
    + (body ? '<details class="gi"><summary>' + head + ico('i-chev') + '</summary><div class="gi-body">' + body + '</div></details>' : '<div class="gi gi-static">' + head + '</div>')
    + guideLinksHTML(it) + '</li>';
}
function guideImageHTML(im) {
  const src = (typeof GUIDE_IMAGES !== 'undefined' && GUIDE_IMAGES || {})[im.file];
  if (!src) return '';
  const cap = [im.caption ? esc(im.caption) : '', im.source ? guideSourceHTML(im.source) : ''].filter(Boolean).join('・');
  return '<figure class="g-fig"><button type="button" class="g-zoom" data-zoom="' + esc(src) + '" data-alt="' + esc(im.alt) + '" data-caption="' + esc(im.caption || '') + '" aria-label="放大查看：' + esc(im.alt) + '">'
    + '<img src="' + esc(src) + '" alt="' + esc(im.alt) + '" loading="lazy" decoding="async"></button>'
    + (cap ? '<figcaption>' + cap + '</figcaption>' : '') + '</figure>';
}
/* 連住的天數通常連續：合成一個標籤（Day 1–3・10/11–10/13），手機上不用佔兩行 */
function guideDaysHTML(days) {
  const chip = (text, color) => '<span class="lb-chip day" style="--dc:' + color + '">' + ico('i-cal') + esc(text) + '</span>';
  const consecutive = days.length > 1 && days.every((d, i) => i === 0 || d.id === days[i - 1].id + 1);
  if (!consecutive) return days.map((dy) => chip('Day ' + dy.id + '・' + dy.date.slice(0, 5), dy.color)).join('');
  const a = days[0], b = days[days.length - 1];
  return chip('Day ' + a.id + '–' + b.id + '・' + a.date.slice(0, 5) + '–' + b.date.slice(0, 5), a.color);
}
/* 警示分兩級：漏看會出事的用醒目框；補充說明是一小段淡色條列，不做成框 */
function guideAlertsHTML(alerts) {
  const warns = alerts.filter((a) => a.level !== 'info'), notes = alerts.filter((a) => a.level === 'info');
  return (warns.length ? '<div class="g-alerts" role="note" aria-label="重要提醒">' + warns.map((a) => '<p class="g-alert warn">' + ico('i-note') + '<span>' + esc(a.text) + '</span></p>').join('') + '</div>' : '')
    + (notes.length ? '<ul class="g-notes" aria-label="補充說明">' + notes.map((a) => '<li>' + esc(a.text) + '</li>').join('') + '</ul>' : '');
}
function guideBodyHTML(id) {
  const g = guideById(id);
  if (!g) return '';
  const days = DAYS.filter((d) => (g.days || []).includes(d.id));
  const images = g.images || [];
  const used = new Set((g.sections || []).flatMap((s) => s.images || []));
  const imageHTML = (ids) => ids.map((i) => images.find((im) => im.id === i)).filter(Boolean).map(guideImageHTML).join('');
  const sections = (g.sections || []).map((s) => '<details class="g-sec" open><summary><span class="g-h">' + esc(guideSectionTitle(s)) + '</span>'
    + '<span class="n">' + s.steps.length + ' 步</span>' + ico('i-chev') + '</summary>'
    + '<ol class="g-steps">' + s.steps.map((st) => '<li>' + esc(st) + '</li>').join('') + '</ol>' + imageHTML(s.images || []) + '</details>').join('');
  const loose = images.filter((im) => !used.has(im.id));
  const lists = (g.lists || []).map((l) => {
    const shared = listSource(l, g);
    // 整份指南已經寫了同一類來源，清單標題就不再重複
    const label = shared && sourceType(shared) !== sourceType(g.source) ? '<span class="g-by">' + esc(sourceLabel(shared)) + '</span>' : '';
    return '<details class="g-list" open><summary><span class="g-h">' + esc(guideListTitle(l)) + '</span>' + label
      + '<span class="n">' + l.items.length + ' 項</span>' + ico('i-chev') + '</summary>'
      + '<ul class="g-items">' + l.items.map((it) => guideItemHTML(it, g, shared)).join('') + '</ul></details>';
  }).join('');
  return '<div class="guide" style="--dc:' + (days[0] ? days[0].color : 'var(--accent)') + '">'
    + '<div class="lb-head"><h2 id="lbTitle">' + esc(guideTitle(g)) + '</h2><span class="kind k-stay">住宿指南</span></div>'
    + '<div class="lb-meta">' + guideDaysHTML(days) + '</div>'
    + (g.intro ? '<p class="lb-summary">' + esc(g.intro) + '</p>' : '')
    + (g.source ? '<p class="g-srcline">整份指南：' + guideSourceHTML(g.source) + '</p>' : '')
    + guideAlertsHTML(g.alerts || [])
    + sections
    + (loose.length ? '<details class="g-sec" open><summary><span class="g-h">圖片</span><span class="n">' + loose.length + ' 張</span>' + ico('i-chev') + '</summary>' + loose.map(guideImageHTML).join('') + '</details>' : '')
    + lists
    + '<p class="lb-note">推薦清單是候選，不會自動排進每日行程。標「未查核」的資訊出發前請再確認。</p>'
    + '</div>';
}
