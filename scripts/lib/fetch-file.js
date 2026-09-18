// 下載單一檔案到磁碟。測試會注入 fetchImpl，所以這裡不直接綁全域 fetch。
const fs = require('node:fs');
const path = require('node:path');

const UA = 'travel-planner-photos/1.0 (+https://github.com/wangch15/travel-planner)';
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif']);

async function downloadTo(url, dest, opts = {}) {
  const { fetchImpl = fetch, headers = {} } = opts;
  const res = await fetchImpl(url, { headers: { 'user-agent': UA, ...headers }, redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const type = String(res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (!IMAGE_TYPES.has(type)) throw new Error(`回應不是圖片：${type || '未知型別'}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, buf);
  return { bytes: buf.length, type };
}

module.exports = { downloadTo, IMAGE_TYPES };
