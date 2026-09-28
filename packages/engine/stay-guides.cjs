// 住宿指南（STAY_GUIDES）的欄位規格與驗證。一份指南只存一次，由 days 決定哪幾天出現入口，
// 不會變成時間軸上的停留點。欄位說明見 docs/schema/stay-guides.md。
const ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const IMAGE_FILE = /^guide-[a-z0-9][a-z0-9-]{0,80}\.(jpg|png|webp)$/;
const DATE = /^\d{4}[-/]\d{2}[-/]\d{2}$/;
const LIST_KINDS = Object.freeze({ shopping: '採買', dining: '餐飲', onsen: '泡湯', custom: '' });
const SECTION_KINDS = Object.freeze({ checkin: '入住方式', parking: '停車', checkout: '退房', custom: '' });
const SOURCE_TYPES = Object.freeze({ host: '房東提供', official: '官方資料', agent: 'AI 整理', user: '使用者提供', other: '其他來源' });
const LINK_KINDS = Object.freeze({ official: '官網', map: '地圖', other: '連結' });
const ALERT_LEVELS = new Set(['warn', 'info']);
// 長度上限刻意偏短：指南要的是能掃讀的清單，不是把長段落換個地方放。
const LIMITS = Object.freeze({ title: 60, intro: 160, summary: 120, step: 200, alert: 200, note: 300, tag: 20, label: 24, sourceLabel: 60, fact: 160, caption: 160 });

const FIELDS = {
  guide: ['id', 'stay', 'days', 'title', 'intro', 'source', 'alerts', 'sections', 'images', 'lists'],
  source: ['type', 'label', 'url', 'date'],
  alert: ['id', 'text', 'level'],
  section: ['id', 'kind', 'title', 'steps', 'images'],
  image: ['id', 'file', 'alt', 'caption', 'source'],
  list: ['id', 'kind', 'title', 'items'],
  item: ['id', 'name', 'summary', 'tags', 'place', 'links', 'source', 'facts', 'note'],
  link: ['kind', 'label', 'url'],
  fact: ['label', 'value', 'source', 'checked'],
};

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isHttp = (u) => typeof u === 'string' && /^https?:\/\/[^\s]+$/.test(u) && u.length <= 2000;

// 每份指南共用的檢查小工具；fail 訊息都以 STAY_GUIDES.<id> 開頭，方便對到哪一份。
function guideChecker(trip, where, fail) {
  const text = (value, name, max, required = false) => {
    if (value === undefined && !required) return;
    if (typeof value !== 'string' || !value.trim()) fail(`${where} ${name} 必須是非空字串`);
    else if (value.length > max) fail(`${where} ${name} 超過 ${max} 字：請拆成條列或清單項目，不要塞長段落`);
  };
  const keys = (obj, kind, name) => Object.keys(obj).forEach((k) => {
    if (/^private/i.test(k)) fail(`${where} ${name} 不能有 ${k}：私人資訊只能放 trips/<slug>/docs/`);
    else if (!FIELDS[kind].includes(k)) fail(`${where} ${name} 有不支援的欄位 ${k}`);
  });
  const object = (value, kind, name) => {
    if (!isObject(value)) { fail(`${where} ${name} 必須是物件`); return false; }
    keys(value, kind, name);
    return true;
  };
  const source = (s, name) => {
    if (s === undefined || !object(s, 'source', name)) return;
    if (!Object.hasOwn(SOURCE_TYPES, s.type)) fail(`${where} ${name}.type 不合法：${s.type}`);
    text(s.label, `${name}.label`, LIMITS.sourceLabel);
    if (s.url !== undefined && !isHttp(s.url)) fail(`${where} ${name}.url 網址不合法：${s.url}`);
    if (s.date !== undefined && !DATE.test(s.date)) fail(`${where} ${name}.date 應為 YYYY-MM-DD`);
  };
  const array = (value, name) => {
    if (value === undefined) return [];
    if (!Array.isArray(value)) { fail(`${where} ${name} 必須是陣列`); return []; }
    return value;
  };
  // 回傳合法且不重複的 id；項目不是物件或 id 不合法時各自報錯。
  const uniqueIds = (list, name, ids = new Set()) => {
    list.forEach((x, j) => {
      if (!isObject(x) || !ID.test(x.id || '')) fail(`${where} ${name}[${j}] 缺合法 id（小寫英數與連字號）`);
      else if (ids.has(x.id)) fail(`${where} ${name} 的 id 重複：${x.id}`);
      else ids.add(x.id);
    });
    return ids;
  };
  return { text, keys, object, source, array, uniqueIds };
}

function checkImages(trip, g, c, where, fail) {
  const list = c.array(g.images, 'images');
  const ids = c.uniqueIds(list, 'images');
  list.forEach((im, j) => {
    const name = `images[${j}]`;
    if (!isObject(im)) return;
    c.keys(im, 'image', name);
    if (!IMAGE_FILE.test(im.file || '')) fail(`${where} ${name}.file 必須是 guide- 開頭的 .jpg／.png／.webp 檔名：${im.file}`);
    else if (trip.GUIDE_IMAGES && !Object.hasOwn(trip.GUIDE_IMAGES, im.file)) fail(`${where} ${name} 的圖片檔不存在：photos/${im.file}`);
    c.text(im.alt, `${name}.alt`, LIMITS.caption, true);
    c.text(im.caption, `${name}.caption`, LIMITS.caption);
    c.source(im.source, `${name}.source`);
  });
  return ids;
}

function checkSteps(g, c, imageIds, where, fail) {
  const alerts = c.array(g.alerts, 'alerts');
  c.uniqueIds(alerts, 'alerts');
  alerts.forEach((a, j) => {
    if (!isObject(a)) return;
    c.keys(a, 'alert', `alerts[${j}]`);
    c.text(a.text, `alerts[${j}].text`, LIMITS.alert, true);
    if (a.level !== undefined && !ALERT_LEVELS.has(a.level)) fail(`${where} alerts[${j}].level 不合法：${a.level}`);
  });
  const sections = c.array(g.sections, 'sections');
  c.uniqueIds(sections, 'sections');
  sections.forEach((s, j) => {
    const name = `sections[${j}]`;
    if (!isObject(s)) return;
    c.keys(s, 'section', name);
    if (!Object.hasOwn(SECTION_KINDS, s.kind)) fail(`${where} ${name}.kind 不合法：${s.kind}`);
    c.text(s.title, `${name}.title`, LIMITS.title, s.kind === 'custom');
    if (!Array.isArray(s.steps) || !s.steps.length) fail(`${where} ${name}.steps 至少要有一個步驟`);
    else s.steps.forEach((st, k) => c.text(st, `${name}.steps[${k}]`, LIMITS.step, true));
    c.array(s.images, `${name}.images`).forEach((r) => { if (!imageIds.has(r)) fail(`${where} ${name}.images 引用未知圖片：${r}`); });
  });
}

function checkItem(trip, it, n, c, where, fail) {
  c.keys(it, 'item', n);
  c.text(it.name, `${n}.name`, LIMITS.title, true);
  c.text(it.summary, `${n}.summary`, LIMITS.summary);
  c.text(it.note, `${n}.note`, LIMITS.note);
  c.array(it.tags, `${n}.tags`).forEach((t, x) => c.text(t, `${n}.tags[${x}]`, LIMITS.tag, true));
  if (it.place !== undefined && !trip.PLACES[it.place]) fail(`${where} ${n}.place 指向未知地點：${it.place}`);
  c.source(it.source, `${n}.source`);
  c.array(it.links, `${n}.links`).forEach((ln, x) => {
    const name = `${n}.links[${x}]`;
    if (!c.object(ln, 'link', name)) return;
    if (!Object.hasOwn(LINK_KINDS, ln.kind)) fail(`${where} ${name}.kind 不合法：${ln.kind}`);
    c.text(ln.label, `${name}.label`, LIMITS.label, true);
    if (!isHttp(ln.url)) fail(`${where} ${name}.url 網址不合法：${ln.url}`);
  });
  c.array(it.facts, `${n}.facts`).forEach((f, x) => {
    const name = `${n}.facts[${x}]`;
    if (!c.object(f, 'fact', name)) return;
    c.text(f.label, `${name}.label`, LIMITS.label, true);
    c.text(f.value, `${name}.value`, LIMITS.fact, true);
    c.source(f.source, `${name}.source`);
    if (f.checked !== undefined && !DATE.test(f.checked)) fail(`${where} ${name}.checked 應為 YYYY-MM-DD`);
  });
}

function checkLists(trip, g, c, where, fail) {
  const lists = c.array(g.lists, 'lists');
  c.uniqueIds(lists, 'lists');
  const itemIds = new Set();
  lists.forEach((l, j) => {
    const name = `lists[${j}]`;
    if (!isObject(l)) return;
    c.keys(l, 'list', name);
    if (!Object.hasOwn(LIST_KINDS, l.kind)) fail(`${where} ${name}.kind 不合法：${l.kind}`);
    c.text(l.title, `${name}.title`, LIMITS.title, l.kind === 'custom');
    if (!Array.isArray(l.items) || !l.items.length) { fail(`${where} ${name}.items 至少要有一項`); return; }
    const before = itemIds.size;
    c.uniqueIds(l.items, `${name}.items`, itemIds);
    if (itemIds.size - before !== l.items.length) return;
    l.items.forEach((it, k) => checkItem(trip, it, `${name}.items[${k}]`, c, where, fail));
  });
}

function checkGuide(trip, g, at, dayIds, fail) {
  const where = ID.test(g.id || '') ? `STAY_GUIDES.${g.id}` : at;
  const c = guideChecker(trip, where, fail);
  c.keys(g, 'guide', '');
  const stay = trip.PLACES[g.stay];
  if (!stay) fail(`${where} stay 指向未知地點：${g.stay}`);
  else if (stay.cat !== 'stay') fail(`${where} stay 必須是住宿地點（cat: stay）：${g.stay}`);
  if (!Array.isArray(g.days) || !g.days.length) fail(`${where} days 至少要有一天`);
  else {
    if (new Set(g.days).size !== g.days.length) fail(`${where} days 有重複的天`);
    g.days.forEach((d) => { if (!dayIds.has(d)) fail(`${where} days 指向不存在的天：${d}`); });
  }
  c.text(g.title, 'title', LIMITS.title);
  c.text(g.intro, 'intro', LIMITS.intro);
  c.source(g.source, 'source');
  const imageIds = checkImages(trip, g, c, where, fail);
  checkSteps(g, c, imageIds, where, fail);
  checkLists(trip, g, c, where, fail);
}

function checkStayGuides(trip, fail) {
  const guides = trip.STAY_GUIDES;
  if (guides === undefined) return;
  if (!Array.isArray(guides)) { fail('STAY_GUIDES 必須是陣列'); return; }
  const dayIds = new Set(trip.DAYS.map((d) => d.id));
  const seen = new Set();
  guides.forEach((g, i) => {
    const at = `STAY_GUIDES[${i}]`;
    if (!isObject(g)) { fail(`${at} 必須是物件`); return; }
    if (!ID.test(g.id || '')) fail(`${at} 缺合法 id（小寫英數與連字號，用來穩定對應）`);
    else if (seen.has(g.id)) fail(`STAY_GUIDES 的 id 重複：${g.id}`);
    else seen.add(g.id);
    checkGuide(trip, g, at, dayIds, fail);
  });
}

// 指南宣告的圖片檔名（已過檔名規則的才算），讀檔與發布只收這些。
function guideImageFiles(guides) {
  if (!Array.isArray(guides)) return [];
  const files = guides.flatMap((g) => (isObject(g) && Array.isArray(g.images) ? g.images : []))
    .map((im) => (isObject(im) ? im.file : null))
    .filter((f) => typeof f === 'string' && IMAGE_FILE.test(f));
  return [...new Set(files)];
}

const IMAGE_TYPES = Object.freeze({ jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' });
const imageType = (file) => IMAGE_TYPES[file.split('.').pop()];
// 只信任檔頭：副檔名與內容不符的檔案不發布。
function imageBytesMatch(file, bytes) {
  const type = imageType(file);
  if (!Buffer.isBuffer(bytes) || bytes.length < 12) return false;
  if (type === 'image/jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (type === 'image/png') return bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (type === 'image/webp') return bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
  return false;
}

// 給 AI 的能力說明：每輪上下文都附上，讓它知道能寫哪些欄位、哪些做不到。
const STAY_GUIDE_SPEC = Object.freeze({
  purpose: '同一住宿連住多天共用一份指南：入住／停車等條列步驟、重要警示、圖片、以及採買／餐飲／泡湯／自訂分類的推薦清單。days 決定哪幾天顯示入口；指南不會新增 stops，也不改每日時間。',
  guide: { id: '穩定 ID，小寫英數與連字號，建立後不要改', stay: 'PLACES 的住宿 key（cat: stay）', days: '要顯示入口的 DAYS id 陣列', title: `選填，≤${LIMITS.title} 字`, intro: `選填，≤${LIMITS.intro} 字`, source: `選填 {type,label?(≤${LIMITS.sourceLabel}),url?,date?(YYYY-MM-DD)}`, alerts: `[{id,text(≤${LIMITS.alert}),level:warn|info}]`, sections: `[{id,kind,title?,steps:[string ≤${LIMITS.step}],images?:[imageId]}]`, images: '[{id,file,alt,caption?,source?}]', lists: '[{id,kind,title?,items:[item]}]' },
  item: { id: '穩定 ID，同一指南內不可重複', name: '店名', summary: `選填，≤${LIMITS.summary} 字的一句話`, tags: `選填，特色標籤，每個 ≤${LIMITS.tag} 字`, place: '選填，PLACES key；沒有就省略，不要捏造座標', links: '選填 [{kind:official|map|other,label,url}]，不要把網址寫進文字', source: '選填，這一項的推薦來源', facts: '選填 [{label,value,source?,checked?}]，營業時間／價格／車程各自標來源與查核日期', note: `選填，≤${LIMITS.note} 字` },
  // 每個文字欄位的字數上限（超過會被資料檢查擋下）；太長就拆成 steps、facts、tags 或 note。
  limits: { 'guide.title': LIMITS.title, 'guide.intro': LIMITS.intro, 'source.label': LIMITS.sourceLabel, 'alerts[].text': LIMITS.alert, 'sections[].title': LIMITS.title, 'sections[].steps[]': LIMITS.step, 'images[].alt': LIMITS.caption, 'images[].caption': LIMITS.caption, 'lists[].title': LIMITS.title, 'item.name': LIMITS.title, 'item.summary': LIMITS.summary, 'item.tags[]': LIMITS.tag, 'item.note': LIMITS.note, 'links[].label': LIMITS.label, 'facts[].label': LIMITS.label, 'facts[].value': LIMITS.fact },
  kinds: { lists: Object.keys(LIST_KINDS), sections: Object.keys(SECTION_KINDS), sourceTypes: Object.keys(SOURCE_TYPES), linkKinds: Object.keys(LINK_KINDS) },
  images: '圖片 file 必須是 trips/<slug>/photos/ 裡已存在、guide- 開頭的 jpg／png／webp；桌面 App 可改填 attachment（本輪附加圖片的 id），由 App 複製成檔案。',
  rules: ['房東推薦寫 source.type=host，不等於官方已查核；只有實際查到的 fact 才填 checked。', '不知道的欄位直接省略，不要捏造座標、營業時間或交通時間。', '門鎖密碼、訂房碼、電話等私人資訊只能放 privateNotes，不可寫進指南。', '把既有長段落搬進指南時，原文資訊與連結都要保留。'],
});

module.exports = { checkStayGuides, guideImageFiles, imageType, imageBytesMatch, STAY_GUIDE_SPEC, LIST_KINDS, SECTION_KINDS, SOURCE_TYPES, LINK_KINDS, IMAGE_FILE, LIMITS, ID };
