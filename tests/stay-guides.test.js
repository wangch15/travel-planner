// 住宿指南（STAY_GUIDES）：schema 驗證、頁面呈現、CLI build 與舊資料相容。全為合成資料。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT } = require('../scripts/lib/paths.js');
const { validate } = require('../scripts/lib/schema.js');
const { loadTrip } = require('../scripts/lib/load-trip.js');
const { buildTrip } = require('../scripts/build.js');
const { renderContext } = require('./helpers/render-ctx.js');
const { makeTrip } = require('./fixtures/make-trip.js');
const { makeGuideTrip } = require('./fixtures/stay-guide.js');

const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const ctxFor = (trip) => renderContext(trip, [read('src/util.js'), read('src/render.js')]);
const errorsWith = (mutate) => { const t = makeGuideTrip(); mutate(t.STAY_GUIDES[0], t); return validate(t); };
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('0000000d49484452000000010000000108060000001f15c489', 'hex')]);

test('合法的住宿指南通過驗證；沒有 STAY_GUIDES 的舊行程也照常通過', () => {
  assert.deepEqual(validate(makeGuideTrip()), []);
  const legacy = makeTrip();
  delete legacy.STAY_GUIDES;
  assert.deepEqual(validate(legacy), []);
});

test('驗證：住宿、天數、id、分類與長度', () => {
  assert.match(errorsWith((g) => { g.stay = 'sightA'; }).join('\n'), /必須是住宿地點/);
  assert.match(errorsWith((g) => { g.days = [1, 9]; }).join('\n'), /days 指向不存在的天：9/);
  assert.match(errorsWith((g) => { g.days = []; }).join('\n'), /days 至少要有一天/);
  assert.match(errorsWith((g) => { g.id = 'Bad ID'; }).join('\n'), /缺合法 id/);
  assert.match(errorsWith((g, t) => { t.STAY_GUIDES.push({ ...g }); }).join('\n'), /id 重複：stay-a-guide/);
  assert.match(errorsWith((g) => { g.lists[0].kind = 'souvenir'; }).join('\n'), /kind 不合法：souvenir/);
  assert.match(errorsWith((g) => { g.lists.push({ id: 'misc', kind: 'custom', items: [{ id: 'x', name: 'x' }] }); }).join('\n'), /title 必須是非空字串/);
  assert.match(errorsWith((g) => { g.lists[1].items[0].id = 'super-a'; }).join('\n'), /id 重複：super-a/);
  assert.match(errorsWith((g) => { g.lists[0].items[0].summary = '長'.repeat(121); }).join('\n'), /超過 120 字/);
  assert.match(errorsWith((g) => { g.sections[0].steps = []; }).join('\n'), /至少要有一個步驟/);
  // 來源標籤可以寫得具體一點（例如「房東 LINE 訊息，重複訊息已合併」），上限 60 字
  assert.deepEqual(errorsWith((g) => { g.source.label = '房東 LINE 訊息（2026/09/20 傳來，重複的內容已合併整理）'; }), []);
  assert.match(errorsWith((g) => { g.source.label = '長'.repeat(61); }).join('\n'), /source.label 超過 60 字/);
});

test('驗證：不捏造也不偷塞——未知欄位、私人欄位、壞連結、壞日期、圖片缺檔都擋', () => {
  assert.match(errorsWith((g) => { g.lists[0].items[0].hours = '9-21'; }).join('\n'), /不支援的欄位 hours/);
  assert.match(errorsWith((g) => { g.privateNotes = '門鎖 1234'; }).join('\n'), /不能有 privateNotes/);
  assert.match(errorsWith((g) => { g.lists[0].items[0].links[0].url = 'javascript:alert(1)'; }).join('\n'), /網址不合法/);
  assert.match(errorsWith((g) => { g.lists[0].items[0].facts[0].checked = '9/20'; }).join('\n'), /checked 應為 YYYY-MM-DD/);
  assert.match(errorsWith((g) => { g.lists[0].items[0].place = 'nowhere'; }).join('\n'), /place 指向未知地點/);
  assert.match(errorsWith((g) => { g.sections[1].images = ['nope']; }).join('\n'), /引用未知圖片：nope/);
  assert.match(errorsWith((g) => { g.images[0].file = 'parking.png'; }).join('\n'), /guide- 開頭/);
  assert.match(errorsWith((g, t) => { t.GUIDE_IMAGES = {}; }).join('\n'), /圖片檔不存在：photos\/guide-stay-a-parking.png/);
  // 可選欄位真的可以省略：沒有 place、facts、links 的店家照樣合法
  assert.deepEqual(errorsWith((g) => { g.lists[1].items = [{ id: 'bare', name: '只有名字的店' }]; }), []);
});

test('驗收：10/11–10/13 三天都出現同一份指南的入口，時間軸本身不變', () => {
  const trip = makeGuideTrip();
  const ctx = ctxFor(trip);
  for (const day of trip.DAYS) {
    const html = ctx.dayHTML(day);
    assert.equal((html.match(/data-guide="stay-a-guide"/g) || []).length, 1, `Day ${day.id} 要有一個入口`);
    assert.match(html, /入住方式・停車・採買 2・餐飲 2・泡湯 1/);
  }
  const plain = { ...trip, STAY_GUIDES: [] };
  const stops = (html) => html.slice(html.indexOf('<ol class="stops">'), html.indexOf('</ol>') + 5);
  const plainCtx = ctxFor(plain);
  for (const day of trip.DAYS) assert.equal(stops(ctx.dayHTML(day)), stops(plainCtx.dayHTML(day)), '停留點清單與有沒有指南無關');
  assert.equal(plainCtx.dayHTML(trip.DAYS[0]).includes('guide-entry'), false);
});

test('指南內容：警示獨立、步驟條列、每家店一項、查核狀態逐條顯示', () => {
  const trip = makeGuideTrip();
  const html = ctxFor(trip).guideBodyHTML('stay-a-guide');
  assert.match(html, /class="g-alerts" role="note" aria-label="重要提醒"/);
  assert.match(html, /<ol class="g-steps"><li>15:00 後可入住。<\/li>/);
  assert.equal((html.match(/class="g-item"/g) || []).length, 5, '5 家店各自一項');
  for (const name of ['範例超市', '範例藥妝', '範例拉麵', '範例居酒屋', '範例湯屋']) assert.match(html, new RegExp(`<span class="gi-name">${name}</span>`));
  assert.match(html, /<span class="g-chk ok">官網・2026-09-20 查核<\/span>/, '查過的那條標查核日期');
  assert.match(html, /<span class="g-chk">房東提供・未查核<\/span>/, '同一家店沒查的那條仍是未查核');
  assert.equal(html.includes('class="gi-by"'), false, '整份指南已寫「房東提供」，店家不逐項重複來源');
  assert.match(html, /整份指南：<span class="g-src g-src-host">房東提供/);
  assert.equal(/已確認/.test(html), false, '不會把整家店標成已確認');
  assert.match(html, /aria-label="範例超市：官網（新分頁）"/, '官網按鈕有無障礙標籤');
  assert.match(html, /data-detail="sightA"/, '有地點說明的店可開詳細');
  assert.match(html, /aria-label="放大查看：民宿後方停車格位置圖"/);
  assert.equal(/>https?:\/\//.test(html), false, '內文不直接顯示長網址');
  assert.equal(ctxFor(trip).guideBodyHTML('missing'), '');
  assert.match(html, /Day 1–3・10\/11–10\/13/, '連續的天數合成一個標籤');
  const gap = makeGuideTrip({ days: [1, 3] });
  assert.match(ctxFor(gap).guideBodyHTML('stay-a-guide'), /Day 1・10\/11[\s\S]*Day 3・10\/13/, '不連續就分開列');
});

test('好讀：警示分兩級、來源只說一次、標籤不重複介紹', () => {
  const trip = makeGuideTrip({ source: undefined });
  const g = trip.STAY_GUIDES[0];
  g.alerts = [{ id: 'road', text: '避開紅線窄路。' }, { id: 'note', text: '抵達當晚以入住為優先。', level: 'info' }];
  g.lists[2].items[0] = { id: 'onsen-a', name: '範例湯屋', summary: '露天風呂的平價湯屋', tags: ['露天風呂', '24 小時'] };
  const html = ctxFor(trip).guideBodyHTML('stay-a-guide');
  assert.match(html, /<p class="g-alert warn">[\s\S]*避開紅線窄路/);
  assert.match(html, /<ul class="g-notes" aria-label="補充說明"><li>抵達當晚以入住為優先。<\/li>/, '補充說明不做成警示框');
  assert.equal((html.match(/class="g-alert /g) || []).length, 1);
  assert.match(html, /<span class="g-h">採買<\/span><span class="g-by">房東推薦<\/span>/, '整份沒寫來源時，在清單標題說一次');
  assert.equal(/<span class="gi-name">範例湯屋<\/span><span class="gi-by">/.test(html), false, '沒有來源的店不標');
  const mixed = makeGuideTrip();
  mixed.STAY_GUIDES[0].lists[1].items[1] = { id: 'izakaya-a', name: '朋友推薦的店', source: { type: 'user', label: '朋友推薦' } };
  const mixedHtml = ctxFor(mixed).guideBodyHTML('stay-a-guide');
  assert.match(mixedHtml, /<span class="gi-name">範例拉麵<\/span><span class="gi-by">房東推薦<\/span>/, '同一清單來源混雜時每家各自標');
  assert.match(mixedHtml, /<span class="gi-name">朋友推薦的店<\/span><span class="gi-by">朋友推薦<\/span>/);
  assert.equal(html.includes('<span class="gi-tag">露天風呂</span>'), false, '介紹已經寫了的標籤不重複');
  assert.match(html, /<span class="gi-tag">24 小時<\/span>/);
});

test('警示太多：新寫的指南會被指出來交給 AI 精簡，舊資料照樣能建網站', () => {
  const { checkGuideReadability } = require('../packages/engine/stay-guides.cjs');
  const warn = (n) => Array.from({ length: n }, (_, i) => ({ id: 'w' + i, text: '注意事項' + i }));
  const trip = makeGuideTrip({ alerts: warn(3) });
  assert.deepEqual(checkGuideReadability(trip.STAY_GUIDES[0]), []);
  assert.match(checkGuideReadability({ ...trip.STAY_GUIDES[0], alerts: warn(4) }).join('\n'), /重要警示（level:warn）有 4 則，最多 3 則/);
  assert.match(checkGuideReadability({ ...trip.STAY_GUIDES[0], alerts: warn(5).map((a) => ({ ...a, level: 'info' })) }).join('\n'), /補充說明（level:info）最多 4 則/);
  assert.deepEqual(errorsWith((g) => { g.alerts = warn(6); }), [], '已經存下的舊指南不會因此驗證失敗');
});

test('指南文字一律跳脫，資料不能注入 HTML', () => {
  const trip = makeGuideTrip({ intro: '<img src=x onerror=alert(1)>' });
  trip.STAY_GUIDES[0].lists[0].items[0].name = '<b>店</b>';
  const html = ctxFor(trip).guideBodyHTML('stay-a-guide');
  assert.equal(html.includes('<img src=x'), false);
  assert.equal(html.includes('<b>店</b>'), false);
});

test('版面：指南入口卡不會把頁面撐寬；地圖滑過的標記名稱浮在最上層', () => {
  const css = read('src/styles.css');
  assert.match(css, /\.guide-entry\{[^}]*grid-template-columns:minmax\(0,1fr\)/, '入口卡的 grid 欄要能縮');
  assert.doesNotMatch(css.match(/\.ge-s\{[^}]*\}/)[0], /nowrap/, '摘要不能設不換行，會撐爆卡片');
  assert.match(css, /\.pin:hover,\.pin:focus-visible\{z-index:7\}/, '滑過的標記名稱不能被其他標記蓋住');
});

test('總覽的住宿列也有指南入口', () => {
  const trip = makeGuideTrip();
  assert.match(ctxFor(trip).overviewHTML(), /class="guide-open compact" data-guide="stay-a-guide"/);
});

test('CLI：check 會擋缺圖，build 把指南圖片放進 img/ 並內嵌指南資料', (t) => {
  const slug = '_guidetest';
  const dir = path.join(ROOT, 'trips', slug);
  t.after(() => { fs.rmSync(dir, { recursive: true, force: true }); fs.rmSync(path.join(ROOT, 'dist', slug), { recursive: true, force: true }); });
  const trip = makeGuideTrip();
  fs.mkdirSync(path.join(dir, 'photos'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'trip.config.json'), JSON.stringify({ ...trip.config, deploy: { name: 'guide-test', target: 'workers' } }));
  const mod = (name, value) => fs.writeFileSync(path.join(dir, name), `module.exports = ${JSON.stringify(value, null, 2)};\n`);
  mod('data.js', { PLACES: trip.PLACES, DAYS: trip.DAYS.map(({ meals, ...d }) => d), OVERVIEW_ROUTE: trip.OVERVIEW_ROUTE, ADDONS: trip.ADDONS, CHECKLIST: trip.CHECKLIST, STAYS: trip.STAYS, OVERVIEW: trip.OVERVIEW, STAY_GUIDES: trip.STAY_GUIDES });
  mod('details.js', trip.DETAILS);
  fs.writeFileSync(path.join(dir, 'basemap.json'), JSON.stringify(trip.basemap));
  assert.throws(() => loadTrip(slug), /圖片檔不存在/);
  fs.writeFileSync(path.join(dir, 'photos', 'guide-stay-a-parking.png'), PNG);
  const built = buildTrip(slug);
  assert.ok(fs.existsSync(path.join(built.outDir, 'site', 'img', 'guide-stay-a-parking.png')));
  assert.match(built.html, /"id":"stay-a-guide"/);
  assert.match(built.html, /id="zoomdlg"/);
});

test('_example 沒有指南也照常產生頁面（舊資料相容）', () => {
  // 只在記憶體裡渲染：不寫 dist/_example，避免和 build.test.js 同時改同一個資料夾。
  const { createRenderer } = require('../packages/engine/render.cjs');
  const html = createRenderer(path.join(ROOT, 'src'))({ trip: loadTrip('_example') });
  assert.match(html, /const STAY_GUIDES = \[\];/);
  assert.match(html, /const GUIDE_IMAGES = \{\};/);
  const legacy = loadTrip('_example');
  delete legacy.STAY_GUIDES; delete legacy.GUIDE_IMAGES;
  assert.match(createRenderer(path.join(ROOT, 'src'))({ trip: legacy }), /const STAY_GUIDES = \[\];/, '舊呼叫端沒給這兩個鍵也有預設值');
});
