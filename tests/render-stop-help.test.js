const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT } = require('../scripts/lib/paths.js');
const { renderContext } = require('./helpers/render-ctx.js');
const { makeTrip } = require('./fixtures/make-trip.js');

const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const ctxFor = (trip) => renderContext(trip, [read('src/util.js'), read('src/render.js')]);
const stopOf = (trip, extra) => {
  trip.DAYS[1].stops[0] = { ...trip.DAYS[1].stops[0], ...extra };
  return ctxFor(trip).dayHTML(trip.DAYS[1]);
};

test('沒有 links 與 help 的停留點不輸出任何相關標記', () => {
  const trip = makeTrip();
  const html = ctxFor(trip).dayHTML(trip.DAYS[1]);
  assert.ok(!html.includes('stop-links'));
  assert.ok(!html.includes('stop-help'));
});

test('links 輸出成新分頁、noopener 的連結，帶標籤文字', () => {
  const html = stopOf(makeTrip(), { links: [{ label: '即時鏡頭', url: 'https://example.com/cam' }] });
  assert.ok(html.includes('class="stop-links"'));
  assert.ok(html.includes('href="https://example.com/cam"'));
  assert.ok(html.includes('target="_blank"'));
  assert.ok(html.includes('rel="noopener"'));
  assert.ok(html.includes('即時鏡頭'));
});

test('links 與 help 掛在該停留點之內，不是頁尾', () => {
  const html = stopOf(makeTrip(), {
    links: [{ label: '官網', url: 'https://example.com/a' }],
    help: { steps: ['先看天氣'] },
  });
  const stopsStart = html.indexOf('class="stops"');
  const stopsEnd = html.indexOf('</ol>', stopsStart);
  for (const marker of ['stop-links', 'stop-help']) {
    const at = html.indexOf(marker);
    assert.ok(at > stopsStart && at < stopsEnd, `${marker} 必須落在停留點列表之內`);
  }
});

test('不是 http(s) 的網址不會被渲染成連結', () => {
  const html = stopOf(makeTrip(), { links: [{ label: '壞連結', url: 'javascript:alert(1)' }] });
  assert.ok(!html.includes('javascript:'));
  assert.ok(!html.includes('stop-links'));
});

test('連結標籤與網址會跳脫，不能夾帶 HTML 或跳出屬性', () => {
  const html = stopOf(makeTrip(), { links: [{ label: '<b>x</b>', url: 'https://example.com/?a="b"' }] });
  assert.ok(!html.includes('<b>x</b>'));
  assert.ok(html.includes('&lt;b&gt;x&lt;/b&gt;'));
  assert.ok(html.includes('href="https://example.com/?a=&quot;b&quot;"'), '網址裡的引號要跳脫，不能提早結束屬性');
  assert.ok(html.includes('aria-label="&lt;b&gt;x&lt;/b&gt;（新分頁）"'), 'aria-label 裡的標籤也要跳脫');
});

test('網址判斷：HTTPS 大小寫可以；沒有主機名、含空白、前導空白、data:、非字串一律略過', () => {
  const bad = ['https://', 'http:///x', 'https://x y', ' https://example.com/', 'data:text/html,hi', 'HTTPS:/example.com', 42, null];
  for (const url of bad) {
    const html = stopOf(makeTrip(), { links: [{ label: '壞', url }] });
    assert.ok(!html.includes('stop-links'), `不該渲染：${String(url)}`);
  }
  const ok = stopOf(makeTrip(), { links: [{ label: '好', url: 'HTTPS://Example.com/a?b=1#c' }] });
  assert.ok(ok.includes('stop-links') && ok.includes('Example.com'));
});

test('links 不是陣列、或項目壞掉時，渲染安全略過而不是丟錯', () => {
  assert.ok(!stopOf(makeTrip(), { links: 'https://example.com/' }).includes('stop-links'));
  assert.ok(!stopOf(makeTrip(), { links: [null, 'x', { label: '沒網址' }] }).includes('stop-links'));
  const html = stopOf(makeTrip(), { help: { steps: ['一步'], links: [{ label: '壞', url: 'javascript:alert(1)' }] } });
  assert.ok(html.includes('stop-help') && !html.includes('javascript:') && !html.includes('sh-links'));
});

test('help 輸出成可展開的「？」按鈕，預設收合', () => {
  const html = stopOf(makeTrip(), { help: { title: '怎麼查天氣', steps: ['先開鏡頭', '再看道路'] } });
  assert.ok(html.includes('<details class="stop-help">'), '要用 details，預設收合');
  assert.ok(!html.includes('<details class="stop-help" open'), '預設不能展開');
  assert.ok(html.includes('class="sh-q"'), '要有「？」圓圈');
  assert.ok(html.includes('怎麼查天氣'));
  assert.ok(html.includes('<li>先開鏡頭</li>') && html.includes('<li>再看道路</li>'));
});

test('help 沒寫 title 時用預設文字；summary 不寫死「展開」之類的動作，狀態交給原生 details', () => {
  const html = stopOf(makeTrip(), { help: { steps: ['一步'] } });
  const start = html.indexOf('<summary>');
  assert.ok(start > -1, 'summary 不帶 aria-label，名稱就是可見文字');
  const summary = html.slice(start, html.indexOf('</summary>', start));
  assert.ok(summary.includes('詳細說明'));
  assert.ok(summary.includes('aria-hidden="true">?</span>'), '「？」圓圈對閱讀器隱藏，避免念出問號');
  assert.ok(!html.includes('展開：'));
});

test('help 裡的連結出現在展開內容裡', () => {
  const html = stopOf(makeTrip(), { help: { steps: ['看這裡'], links: [{ label: '公告', url: 'https://example.com/notice' }] } });
  const start = html.indexOf('<details class="stop-help">');
  const end = html.indexOf('</details>', start);
  const body = html.slice(start, end);
  assert.ok(body.includes('href="https://example.com/notice"'));
});

test('help 的步驟文字會跳脫', () => {
  const html = stopOf(makeTrip(), { help: { steps: ['<img src=x onerror=alert(1)>'] } });
  assert.ok(!html.includes('<img src=x'));
  assert.ok(html.includes('&lt;img'));
});

test('help 沒有任何步驟時不輸出空殼', () => {
  const html = stopOf(makeTrip(), { help: { steps: [] } });
  assert.ok(!html.includes('stop-help'));
});
