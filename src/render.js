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
      + (meal.cooking && total ? '<p class="meal-facts"><strong>自煮 ' + CONFIG.party + ' 人食材約 ' + esc(money(total)) + '</strong>；下列熟食／餐廳為替代預算，不重複相加。</p>' : '')
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
    + (hasList ? '<a class="map-list-link" href="' + esc(day.mapList.url) + '" target="_blank" rel="noopener noreferrer" aria-label="在 Google Maps 開啟 ' + esc(day.mapList.name) + ' 私人清單（新分頁）" aria-describedby="map-list-note-' + day.id + '">地圖清單</a>' : '')
    + '</div>'
    + '<div class="brief"><span class="tag">這天的輪廓</span><p>' + esc(day.theme) + '</p></div>'
    + '<p class="lead">' + esc(day.lead) + '</p>'
    + (hasMeals ? '<a class="meal-jump" href="#meals-' + day.id + '">查看今天的餐食・價位・訂位建議 ↓</a>' : '')
    + (hasList ? '<p class="map-list-note" id="map-list-note-' + day.id + '">私人清單・' + (day.mapList.placeKeys.length + (day.mapList.extraPlaces || []).length) + ' 個地點，含餐食與備案；需登入有權限的 Google 帳號。</p>' : '')
    + '</div>';
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
        + '<p class="when">' + esc(s.check) + '</p></div></div>';
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
    + ovDiningHTML() + ovStaysHTML() + ovDaysHTML() + ovAddonsHTML() + ovChecklistHTML()
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
