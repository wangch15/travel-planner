#!/usr/bin/env node
// 把行程的公開網站下線：node scripts/unship.js <slug> [--confirm <查核編號>]
// 只動 Cloudflare 上那份公開 HTML，不動任何行程資料。
const fs = require('node:fs');
const path = require('node:path');
const { ROOT, tripDir } = require('./lib/paths.js');
const { unshipTrip } = require('./lib/unship.js');

function main(argv = process.argv.slice(2), options = {}) {
  try {
    const [slug, flag, receipt] = argv;
    if (!/^_?[a-z0-9][a-z0-9-]*$/.test(slug || '') ||
      !(argv.length === 1 || (argv.length === 3 && flag === '--confirm' && /^[a-f0-9]{64}$/.test(receipt)))) {
      throw new Error('用法：npm run unship -- <slug>；人確認後才用 --confirm <查核編號>。不接受 force。');
    }
    const config = JSON.parse(fs.readFileSync(path.join(tripDir(slug), 'trip.config.json'), 'utf8'));
    unshipTrip({ slug, config }, { root: ROOT, ...options, confirm: receipt });
    return 0;
  } catch (e) {
    (options.error || console.error)('✗ ' + e.message);
    return 1;
  }
}

module.exports = { main };
if (require.main === module) process.exitCode = main();
