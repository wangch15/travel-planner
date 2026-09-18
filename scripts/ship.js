#!/usr/bin/env node
// build 後部署：node scripts/ship.js <slug>
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { resolveSlug } = require('./lib/paths.js');
const { loadTrip } = require('./lib/load-trip.js');
const { buildTrip } = require('./build.js');

const slug = resolveSlug(process.argv.slice(2));
const { config } = loadTrip(slug);
const { outDir } = buildTrip(slug);
const target = (config.deploy && config.deploy.target) || 'workers';
const args = target === 'pages'
  ? ['pages', 'deploy', path.join(outDir, 'site'), '--project-name', config.deploy.name]
  : ['deploy', '--config', path.join(outDir, 'wrangler.json')];

console.log(`部署 ${slug} → ${target}：wrangler ${args.join(' ')}`);
const r = spawnSync('npx', ['wrangler', ...args], { stdio: 'inherit' });
if (r.status !== 0) {
  console.error('✗ 部署失敗。第一次部署要先跑 npx wrangler login；新帳號會被問要不要註冊 workers.dev 子網域，選是。');
  process.exit(r.status || 1);
}
