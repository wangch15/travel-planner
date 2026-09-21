#!/usr/bin/env node
// 獨立、兩段式的本機紀錄認領；不 build、不 deploy、不改任何遠端資源。
const fs = require('node:fs');
const path = require('node:path');
const { tripDir } = require('./lib/paths.js');
const { findConflict, conflictMessage } = require('./lib/deploy-names.js');
const { adoptDeployment } = require('./lib/adopt-deployment.js');

function main(argv = process.argv.slice(2), options = {}) {
  try {
    const [slug, flag, receipt] = argv;
    if (!/^_?[a-z0-9][a-z0-9-]*$/.test(slug || '') ||
      !(argv.length === 1 || (argv.length === 3 && flag === '--confirm' && /^[a-f0-9]{64}$/.test(receipt)))) {
      throw new Error('用法：npm run adopt-deploy -- <slug>；人確認後才用 --confirm <查核編號>。不接受 force。');
    }
    const conflict = findConflict(slug);
    if (conflict) throw new Error(conflictMessage(slug, conflict.name, conflict.others));
    const config = JSON.parse(fs.readFileSync(path.join(tripDir(slug), 'trip.config.json'), 'utf8'));
    adoptDeployment({ slug, config }, { ...options, confirm: receipt });
    return 0;
  } catch (e) {
    (options.error || console.error)('✗ ' + e.message);
    return 1;
  }
}

module.exports = { main };
if (require.main === module) process.exitCode = main();
