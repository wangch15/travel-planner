#!/usr/bin/env node
// build 後部署；遠端查核與成功紀錄見 deployment-state.js。
const { resolveSlug, listTrips } = require('./lib/paths.js');
const { loadTrip } = require('./lib/load-trip.js');
const { buildTrip } = require('./build.js');
const { findConflict, conflictMessage } = require('./lib/deploy-names.js');
const { deployBuiltTrip } = require('./lib/deployment-state.js');

// options.runWrangler 可替換全部外部呼叫；匯入本檔不會執行或部署。
function main(argv = process.argv.slice(2), options = {}) {
  const log = options.log || console.log;
  const error = options.error || console.error;
  try {
    const slug = resolveSlug(argv);
    // 保留 repo 內撞名的最後一道防線，遠端查核之前就拒絕。
    const conflict = findConflict(slug);
    if (conflict) throw new Error(conflictMessage(slug, conflict.name, conflict.others));
    const { config } = loadTrip(slug);
    const { outDir } = buildTrip(slug);
    const others = listTrips().filter((s) => s !== slug);
    if (others.length) log(`這份 repo 還有其他行程沒有被動到：${others.join('、')}`);
    deployBuiltTrip({ slug, config, outDir }, { ...options, log });
    return 0;
  } catch (e) {
    error('✗ ' + e.message);
    return 1;
  }
}

module.exports = { main };
if (require.main === module) process.exitCode = main();
