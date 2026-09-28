// replaceStayGuides／mergeStayGuides 與快照讀取指南圖片。只用合成資料與 _example 的暫存複本。
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { parseLiteralModule } = require('../literal-data.cjs');
const { replaceStayGuides, mergeStayGuides } = require('../guide-edit.cjs');
const { readTripSnapshot } = require('../snapshot.cjs');

const guide = (over = {}) => ({ id: 'inn-a-guide', stay: 'innA', days: [1, 2, 3], lists: [{ id: 'onsen', kind: 'onsen', items: [{ id: 'onsen-a', name: '範例湯屋' }] }], ...over });
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('0000000d49484452000000010000000108060000001f15c489', 'hex')]);

test('沒有 STAY_GUIDES 的 data.js：新增 const 與匯出鍵，其他原文一字不動', async () => {
  const source = await fs.readFile(path.join(__dirname, '../../../trips/_example/data.js'), 'utf8');
  const result = replaceStayGuides(source, [guide()]);
  assert.equal(result.changed, true);
  const before = parseLiteralModule(source), after = parseLiteralModule(result.source);
  assert.deepEqual(after, { ...before, STAY_GUIDES: [guide()] });
  const head = source.slice(0, source.indexOf('module.exports'));
  assert.ok(result.source.startsWith(head), '匯出前的內容（含註解）原樣保留');
});

test('已有 STAY_GUIDES：只換掉那個陣列；相同內容不算修改；清空也可以', () => {
  const start = replaceStayGuides('const DAYS = [];\nmodule.exports = { DAYS };\n', [guide()]).source;
  const renamed = replaceStayGuides(start, [guide({ title: '改名' })]);
  assert.equal(parseLiteralModule(renamed.source).STAY_GUIDES[0].title, '改名');
  assert.equal(renamed.source.split('const DAYS = [];').length, 2);
  assert.equal(replaceStayGuides(start, [guide()]).changed, false);
  assert.deepEqual(parseLiteralModule(replaceStayGuides(start, []).source).STAY_GUIDES, []);
});

test('瀏覽器／CommonJS 包裝與 CRLF 換行都支援', () => {
  const source = 'const DAYS = [];\r\nif (typeof module !== "undefined") module.exports = { DAYS };\r\n';
  const result = replaceStayGuides(source, [guide()]);
  assert.deepEqual(parseLiteralModule(result.source).STAY_GUIDES, [guide()]);
  assert.equal(/[^\r]\n/.test(result.source), false, '沿用原本的 CRLF');
});

test('拒絕無法安全修改的來源：同名 const 未匯出、陣列被別處共用、傳入非純資料', () => {
  assert.throws(() => replaceStayGuides('const STAY_GUIDES = [];\nmodule.exports = { DAYS: [] };\n', [guide()]), { code: 'INVALID_DAY_EDIT' });
  assert.throws(() => replaceStayGuides('const G = [];\nmodule.exports = { STAY_GUIDES: G, OTHER: G };\n', [guide()]), { code: 'INVALID_DAY_EDIT' });
  assert.throws(() => replaceStayGuides('module.exports = {};\n', [{ get id() { return 'x'; } }]), { code: 'INVALID_DAY_EDIT' });
  assert.throws(() => replaceStayGuides('module.exports = {};\n', { not: 'array' }), { code: 'INVALID_DAY_EDIT' });
});

test('mergeStayGuides：新增、整份取代、刪除只影響指定 id', () => {
  const current = [guide(), guide({ id: 'inn-b-guide', stay: 'innB' })];
  assert.deepEqual(mergeStayGuides(current, [guide({ title: 'x' })]).map((g) => [g.id, g.title]), [['inn-a-guide', 'x'], ['inn-b-guide', undefined]]);
  assert.deepEqual(mergeStayGuides(current, [{ id: 'inn-a-guide', remove: true }]).map((g) => g.id), ['inn-b-guide']);
  assert.deepEqual(mergeStayGuides(undefined, [guide()]).map((g) => g.id), ['inn-a-guide']);
  assert.throws(() => mergeStayGuides(current, [{ id: 'inn-a-guide', remove: true, title: 'x' }]), { code: 'INVALID_DAY_EDIT' });
  assert.throws(() => mergeStayGuides(current, [{ title: 'no id' }]), { code: 'INVALID_DAY_EDIT' });
  assert.throws(() => mergeStayGuides(current, [{ id: '../x' }]), { code: 'INVALID_DAY_EDIT' });
  assert.equal(current.length, 2, '不改動傳入的陣列');
});

test('快照讀取指南圖片：檔頭要對、改指南不影響脈絡雜湊', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'guide-snapshot-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  await fs.cp(path.join(__dirname, '../../../trips/_example'), dir, { recursive: true });
  const before = await readTripSnapshot(dir, { slug: 'sample' });
  const source = await fs.readFile(path.join(dir, 'data.js'), 'utf8');
  const withImage = guide({ images: [{ id: 'map', file: 'guide-map.png', alt: '圖' }] });
  await fs.writeFile(path.join(dir, 'data.js'), replaceStayGuides(source, [withImage]).source);
  await assert.rejects(readTripSnapshot(dir, { slug: 'sample' }), (e) => e.code === 'INVALID_TRIP' && e.problems.some((p) => /圖片檔不存在/.test(p)));
  await fs.writeFile(path.join(dir, 'photos/guide-map.png'), Buffer.from('this is not a png file'));
  await assert.rejects(readTripSnapshot(dir, { slug: 'sample' }), { code: 'UNSAFE_PATH' });
  await fs.writeFile(path.join(dir, 'photos/guide-map.png'), PNG);
  const after = await readTripSnapshot(dir, { slug: 'sample', includePhotoBytes: true });
  assert.deepEqual(after.trip.GUIDE_IMAGES, { 'guide-map.png': 'img/guide-map.png' });
  assert.ok(after.photoFiles.some((p) => p.target === 'img/guide-map.png' && p.type === 'image/png' && p.bytes.equals(PNG)));
  assert.equal(after.contextDigest, before.contextDigest);
  assert.notEqual(after.digest, before.digest);
});
