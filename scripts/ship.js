#!/usr/bin/env node
// build 後部署：node scripts/ship.js <slug>
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { resolveSlug, listTrips } = require('./lib/paths.js');
const { loadTrip } = require('./lib/load-trip.js');
const { buildTrip } = require('./build.js');

const slug = resolveSlug(process.argv.slice(2));
const { config } = loadTrip(slug);
const { outDir } = buildTrip(slug);
const target = (config.deploy && config.deploy.target) || 'workers';
const args = target === 'pages'
  ? ['pages', 'deploy', path.join(outDir, 'site'), '--project-name', config.deploy.name]
  : ['deploy', '--config', path.join(outDir, 'wrangler.json')];

// 部署會直接覆蓋掉 deploy.name 對應的線上網站。有多趟行程時，slug 帶錯的代價是
// 另一趟的網址被換掉而且不會有任何警告，所以這裡把要動的東西攤開來講。
const url = target === 'pages'
  ? `${config.deploy.name}.pages.dev`
  : `${config.deploy.name}.<你的帳號>.workers.dev`;
console.log(`即將部署：${slug}${config.title ? `（${config.title}）` : ''}`);
console.log(`目標網址：${url}　—— 會覆蓋這個網址上現有的內容`);
const others = listTrips().filter((s) => s !== slug);
if (others.length) console.log(`這份 repo 還有其他行程沒有被動到：${others.join('、')}`);
console.log(`wrangler ${args.join(' ')}\n`);
const r = spawnSync('npx', ['wrangler', ...args], { stdio: 'inherit' });
if (r.status !== 0) {
  console.error('✗ 部署失敗。第一次部署要先跑 npx wrangler login；新帳號會被問要不要註冊 workers.dev 子網域，選是。');
  process.exit(r.status || 1);
}
