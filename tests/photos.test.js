const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { downloadTo } = require('../scripts/lib/fetch-file.js');
const { commonsUrl, photoJobs } = require('../scripts/photos.js');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'tp-photos-'));
const jpeg = (bytes = 32) => ({
  ok: true, status: 200,
  headers: { get: (k) => (k.toLowerCase() === 'content-type' ? 'image/jpeg' : null) },
  arrayBuffer: async () => new Uint8Array(bytes).buffer,
});

test('commonsUrl 用 Special:FilePath 並指定寬度 1024', () => {
  const u = commonsUrl('View of Yamadera.jpg');
  assert.ok(u.startsWith('https://commons.wikimedia.org/wiki/Special:FilePath/'), u);
  assert.ok(u.includes('width=1024'), u);
  assert.ok(!u.includes(' '), '檔名裡的空白要編碼');
});

test('commonsUrl 正確編碼非 ASCII 檔名', () => {
  assert.ok(commonsUrl('宝珠山立石寺.jpg').includes('%E5%AE%9D'));
});

test('downloadTo 把回應寫成檔案', async () => {
  const dest = path.join(tmp(), 'a-1.jpg');
  const r = await downloadTo('https://example.com/a.jpg', dest, { fetchImpl: async () => jpeg(64) });
  assert.equal(r.bytes, 64);
  assert.equal(fs.statSync(dest).size, 64);
});

test('downloadTo 會建立缺少的資料夾', async () => {
  const dest = path.join(tmp(), 'photos', 'a-1.jpg');
  await downloadTo('https://example.com/a.jpg', dest, { fetchImpl: async () => jpeg() });
  assert.ok(fs.existsSync(dest));
});

test('downloadTo 對非 2xx 丟錯且不留下半個檔案', async () => {
  const dest = path.join(tmp(), 'a-1.jpg');
  await assert.rejects(
    () => downloadTo('https://example.com/a.jpg', dest, {
      fetchImpl: async () => ({ ok: false, status: 404, headers: { get: () => null } }),
    }),
    /404/,
  );
  assert.ok(!fs.existsSync(dest), '失敗時不該留下檔案');
});

test('downloadTo 拒絕不是圖片的回應', async () => {
  const dest = path.join(tmp(), 'a-1.jpg');
  await assert.rejects(
    () => downloadTo('https://example.com/a.html', dest, {
      fetchImpl: async () => ({
        ok: true, status: 200,
        headers: { get: () => 'text/html' },
        arrayBuffer: async () => new Uint8Array(8).buffer,
      }),
    }),
    /不是圖片|text\/html/,
  );
  assert.ok(!fs.existsSync(dest));
});

test('photoJobs 依 manifest 產生檔名與網址，index 從 1 開始', () => {
  const dir = tmp();
  const jobs = photoJobs({
    yamadera: [
      { title: 'A.jpg', artist: '甲', license: 'CC BY-SA 4.0', page: 'https://commons.wikimedia.org/wiki/File:A.jpg' },
      { url: 'https://example.com/b.jpg', credit: '© 官網' },
    ],
  }, dir);
  assert.equal(jobs.length, 2);
  assert.equal(path.basename(jobs[0].file), 'yamadera-1.jpg');
  assert.equal(path.basename(jobs[1].file), 'yamadera-2.jpg');
  assert.ok(jobs[0].url.includes('Special:FilePath'));
  assert.equal(jobs[1].url, 'https://example.com/b.jpg');
});

test('photoJobs 預設只補缺的，--force 時全抓', () => {
  const dir = tmp();
  fs.mkdirSync(path.join(dir, 'photos'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'photos', 'yamadera-1.jpg'), 'x');
  const manifest = {
    yamadera: [
      { title: 'A.jpg', license: 'CC0', page: 'https://example.com/A' },
      { url: 'https://example.com/b.jpg', credit: 'c' },
    ],
  };
  assert.equal(photoJobs(manifest, dir).length, 1, '已存在的要跳過');
  assert.equal(photoJobs(manifest, dir, { force: true }).length, 2, 'force 時不跳過');
});

test('photoJobs 對空 manifest 回傳空陣列', () => {
  assert.deepEqual(photoJobs({}, tmp()), []);
});
