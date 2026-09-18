#!/usr/bin/env node
// build 後起一個最小靜態伺服器：node scripts/preview.js <slug>
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { resolveSlug } = require('./lib/paths.js');
const { buildTrip } = require('./build.js');

const TYPES = { '.html':'text/html; charset=utf-8', '.jpg':'image/jpeg', '.png':'image/png', '.txt':'text/plain; charset=utf-8' };
const slug = resolveSlug(process.argv.slice(2));
const { outDir } = buildTrip(slug);
const root = path.join(outDir, 'site');

http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
  const file = path.join(root, rel);
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('找不到檔案');
    return;
  }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}).listen(4173, '127.0.0.1', () => {
  console.log(`預覽：http://localhost:4173　（Ctrl+C 結束）`);
});
