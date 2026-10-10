const test = require('node:test');
const assert = require('node:assert/strict');
const { validate, SCHEMA_VERSION } = require('../scripts/lib/schema.js');
const { makeTrip } = require('./fixtures/make-trip.js');

const has = (errs, re) => errs.some((e) => re.test(e));

test('SCHEMA_VERSION 是 1', () => assert.equal(SCHEMA_VERSION, 1));

test('合法行程沒有錯誤', () => assert.deepEqual(validate(makeTrip()), []));

test('schemaVersion 不符時提示跑 migrate', () => {
  const trip = makeTrip();
  trip.config.schemaVersion = 0;
  assert.ok(has(validate(trip), /migrate/));
});

test('座標超出 bbox 會被抓到', () => {
  const trip = makeTrip();
  trip.PLACES.sightA.lat = 12.3;
  assert.ok(has(validate(trip), /sightA.*座標/));
});

test('stop 引用未知地點會被抓到', () => {
  const trip = makeTrip();
  trip.DAYS[0].stops[0].place = 'nope';
  assert.ok(has(validate(trip), /nope/));
});

test('leg 缺 mode 會被抓到', () => {
  const trip = makeTrip();
  delete trip.DAYS[0].stops[1].leg.mode;
  assert.ok(has(validate(trip), /mode/));
});

test('transit 的 leg 缺 via 會被抓到', () => {
  const trip = makeTrip();
  delete trip.DAYS[1].stops[1].leg.via;
  assert.ok(has(validate(trip), /via/));
});

test('drive 的 leg 缺 dist 會被抓到', () => {
  const trip = makeTrip();
  delete trip.DAYS[0].stops[1].leg.dist;
  assert.ok(has(validate(trip), /dist/));
});

test('非 hub 地點缺 detail 會被抓到，hub 沒 detail 不擋', () => {
  const trip = makeTrip();
  delete trip.DETAILS.sightA;
  const errs = validate(trip);
  assert.ok(has(errs, /sightA/));
  assert.ok(!has(errs, /hubA/));
});

test('detail summary 太短會被抓到', () => {
  const trip = makeTrip();
  trip.DETAILS.sightA.summary = '太短';
  assert.ok(has(validate(trip), /summary/));
});

test('ref 網址不是 http(s) 會被抓到', () => {
  const trip = makeTrip();
  trip.DETAILS.sightA.refs = [{ t: '官方', u: 'ftp://example.com' }];
  assert.ok(has(validate(trip), /網址/));
});

test('STAYS.day 指向不存在的天會被抓到', () => {
  const trip = makeTrip();
  trip.STAYS[0].day = 9;
  assert.ok(has(validate(trip), /STAYS.*day/));
});

test('dining 關閉時不檢查餐食；開啟時每天至少一餐', () => {
  assert.deepEqual(validate(makeTrip()), []);
  const trip = makeTrip();
  trip.config.sections.dining = true;
  assert.ok(has(validate(trip), /Day 1.*餐/));
});

test('mapLists 開啟時清單必須涵蓋當天所有地點', () => {
  const trip = makeTrip();
  trip.config.sections.mapLists = true;
  trip.MAP_LISTS = {
    1: { name: 'D1', url: 'https://maps.example.com/1', placeKeys: ['hubA'] },
    2: { name: 'D2', url: 'https://maps.example.com/2', placeKeys: ['stayA', 'sightA'] },
  };
  trip.DAYS[0].mapList = trip.MAP_LISTS[1];
  trip.DAYS[1].mapList = trip.MAP_LISTS[2];
  assert.ok(has(validate(trip), /Day 1 的清單少了 stayA/));
});

test('basemap 的 bbox 與 config 不符會被抓到', () => {
  const trip = makeTrip();
  trip.basemap.meta.bbox = [0, 0, 1, 1];
  assert.ok(has(validate(trip), /bbox/));
});

test('天數不限，但 id 必須連號', () => {
  const trip = makeTrip();
  trip.DAYS[1].id = 5;
  assert.ok(has(validate(trip), /id/));
});

test('parking 缺座標會被抓到', () => {
  const trip = makeTrip();
  trip.PLACES.sightA.parking = { name: '停車場' };
  assert.ok(has(validate(trip), /parking/));
});

test('照片授權不明會被抓到', () => {
  const trip = makeTrip();
  trip.PHOTOS = { sightA: [{ title: 'a.jpg', artist: '某人', license: '未知', page: 'https://example.com/a' }] };
  assert.ok(has(validate(trip), /授權/));
});

test('deploy.name 必填且只能用小寫英數與連字號', () => {
  const trip = makeTrip();
  delete trip.config.deploy.name;
  assert.ok(has(validate(trip), /deploy\.name/));
  for (const bad of ['Has Upper', 'has_underscore', '-leading', 'trailing-', '有中文']) {
    const t = makeTrip();
    t.config.deploy.name = bad;
    assert.ok(has(validate(t), /deploy\.name 不合法/), `應該擋掉：${bad}`);
  }
  for (const good of ['sentai2026', 'kyoto-2027', 'a']) {
    const t = makeTrip();
    t.config.deploy.name = good;
    assert.ok(!has(validate(t), /deploy\.name 不合法/), `應該放行：${good}`);
  }
});

test('deploy.target 只能是 workers 或 pages', () => {
  const trip = makeTrip();
  trip.config.deploy.target = 'netlify';
  assert.ok(has(validate(trip), /deploy\.target 不合法/));
});

// ── 停留點的 links 與 help ──
const withStop = (extra) => {
  const trip = makeTrip();
  trip.DAYS[1].stops[0] = { ...trip.DAYS[1].stops[0], ...extra };
  return trip;
};

test('stop 的 links 與 help 合法時沒有錯誤', () => {
  const trip = withStop({
    links: [{ label: '官網', url: 'https://example.com/a' }],
    help: { title: '怎麼查', steps: ['第一步', '第二步'], links: [{ label: '公告', url: 'https://example.com/b' }] },
  });
  assert.deepEqual(validate(trip), []);
});

test('stop.links 網址不是 http(s) 會被抓到', () => {
  assert.ok(has(validate(withStop({ links: [{ label: '壞', url: 'javascript:alert(1)' }] })), /Day 2 stop 0 links\[0\].*網址/));
});

test('stop.links 缺 label 或網址會被抓到', () => {
  assert.ok(has(validate(withStop({ links: [{ url: 'https://example.com/' }] })), /links\[0\].*label/));
  assert.ok(has(validate(withStop({ links: [{ label: '只有名稱' }] })), /links\[0\].*網址/));
});

test('stop.links 超過 4 個或不是陣列會被抓到', () => {
  const five = Array.from({ length: 5 }, (_, i) => ({ label: `連結${i}`, url: 'https://example.com/' }));
  assert.ok(has(validate(withStop({ links: five })), /links.*最多 4/));
  assert.ok(has(validate(withStop({ links: 'https://example.com/' })), /links.*陣列/));
});

test('stop.links 有不支援的欄位會被抓到', () => {
  assert.ok(has(validate(withStop({ links: [{ label: '官網', url: 'https://example.com/', icon: 'x' }] })), /links\[0\].*不支援的欄位 icon/));
});

test('stop.help 缺 steps 或 steps 為空會被抓到', () => {
  assert.ok(has(validate(withStop({ help: { title: '只有標題' } })), /help.*steps/));
  assert.ok(has(validate(withStop({ help: { steps: [] } })), /help.*steps/));
});

test('stop.help 步驟太多、太長或不是字串會被抓到', () => {
  const nine = Array.from({ length: 9 }, (_, i) => `步驟${i}`);
  assert.ok(has(validate(withStop({ help: { steps: nine } })), /help.*最多 8/));
  assert.ok(has(validate(withStop({ help: { steps: ['長'.repeat(201)] } })), /help.steps\[0\].*200/));
  assert.ok(has(validate(withStop({ help: { steps: [42] } })), /help.steps\[0\]/));
});

test('stop.help 標題太長、或有不支援的欄位會被抓到', () => {
  assert.ok(has(validate(withStop({ help: { title: '標'.repeat(31), steps: ['一步'] } })), /help.title.*30/));
  assert.ok(has(validate(withStop({ help: { steps: ['一步'], body: 'x' } })), /help.*不支援的欄位 body/));
});

test('stop.help.links 同樣檢查網址', () => {
  assert.ok(has(validate(withStop({ help: { steps: ['一步'], links: [{ label: '壞', url: 'ftp://example.com' }] } })), /help.links\[0\].*網址/));
});

test('stop.links 網址需要主機名且不含空白；HTTPS 大小寫可以', () => {
  for (const url of ['https://', 'http:///x', 'https://x y', ' https://example.com/']) {
    assert.ok(has(validate(withStop({ links: [{ label: '壞', url }] })), /links\[0\].*網址/), `應擋下：${url}`);
  }
  assert.deepEqual(validate(withStop({ links: [{ label: '好', url: 'HTTPS://Example.com/a' }] })), []);
});

test('stop.help.title 是空字串或純空白時，訊息說「必須是非空字串」，不是講字數', () => {
  const errs = validate(withStop({ help: { title: '   ', steps: ['一步'] } }));
  assert.ok(has(errs, /help.title.*非空/));
  assert.ok(!has(errs, /help.title.*不能超過/));
});

test('stop.help.steps 純空白字串會被抓到', () => {
  assert.ok(has(validate(withStop({ help: { steps: ['   '] } })), /help.steps\[0\].*非空/));
});
