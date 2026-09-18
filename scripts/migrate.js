#!/usr/bin/env node
// 把行程資料升到引擎的 SCHEMA_VERSION：node scripts/migrate.js <slug>
const fs = require('node:fs');
const path = require('node:path');
const { tripDir, resolveSlug } = require('./lib/paths.js');
const { SCHEMA_VERSION } = require('./lib/schema.js');

function migrateTrip(slug) {
  const dir = tripDir(slug);
  if (!fs.existsSync(dir)) throw new Error(`找不到行程資料夾：trips/${slug}`);
  const cfgPath = path.join(dir, 'trip.config.json');
  const readVersion = () => (fs.existsSync(cfgPath) ? (JSON.parse(fs.readFileSync(cfgPath, 'utf8')).schemaVersion || 0) : 0);

  let from = readVersion();
  if (from === SCHEMA_VERSION) return { from, to: from, steps: [] };
  if (from > SCHEMA_VERSION) throw new Error(`資料的 schemaVersion（${from}）比引擎（${SCHEMA_VERSION}）新：先更新引擎 git merge upstream/main`);

  const steps = [];
  while (from < SCHEMA_VERSION) {
    const step = path.join(__dirname, 'migrate', `${from}-to-${from + 1}.js`);
    if (!fs.existsSync(step)) throw new Error(`缺少遷移腳本：scripts/migrate/${from}-to-${from + 1}.js`);
    steps.push({ step: `${from} → ${from + 1}`, notes: require(step).migrate(dir) });
    const next = readVersion();
    if (next <= from) throw new Error(`遷移 ${from} → ${from + 1} 後版本沒有前進，停止`);
    from = next;
  }
  return { from: steps.length ? Number(steps[0].step.split(' ')[0]) : from, to: from, steps };
}

module.exports = { migrateTrip };

if (require.main === module) {
  try {
    const slug = resolveSlug(process.argv.slice(2));
    const r = migrateTrip(slug);
    if (!r.steps.length) {
      console.log(`✓ ${slug} 已經是 schemaVersion ${SCHEMA_VERSION}，不需要遷移`);
    } else {
      r.steps.forEach(({ step, notes }) => {
        console.log(`\n schemaVersion ${step}`);
        notes.forEach((n) => console.log('  - ' + n));
      });
      console.log(`\n✓ ${slug} 已升到 schemaVersion ${r.to}。接著跑 npm run check -- ${slug}`);
    }
  } catch (e) {
    console.error('✗ ' + e.message);
    process.exit(1);
  }
}
