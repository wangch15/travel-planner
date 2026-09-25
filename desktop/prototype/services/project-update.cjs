// 在 App 裡更新私人專案的引擎（相當於 CLI 的 tp-update）。
// 目標是「和 App 內建引擎同一版」的上游 commit：這樣專案裡的備份保護程式會和 App 的可信版本一致。
// 只合併上游模板的改動，不動使用者的行程；需要時用 App 內建的遷移腳本升級資料格式。
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { compareVersions, parseChangelog } = require('../../../scripts/update-check.js');
const { SCHEMA_VERSION } = require('../../../packages/engine/schema.cjs');
const { TRUSTED_FILES, sameTrusted } = require('./backup.cjs');

const execute = promisify(execFile);
const OFFICIAL_TEMPLATE = 'https://github.com/wangch15/travel-planner.git';
const SLUG = /^[a-z0-9][a-z0-9-]{0,99}$/;
// userMessage：給使用者看的說明，App 會原樣顯示。
const fail = (code, message) => Object.assign(new Error(message || code), { code, ...(message ? { userMessage: message } : {}) });
const safeEnv = () => Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(GIT_|NODE_OPTIONS$|NODE_PATH$|LD_|DYLD_)/.test(key)));

async function defaultRun(bin, args, options = {}) {
  try {
    const out = await execute(bin, args, { ...options, env: { ...safeEnv(), GIT_TERMINAL_PROMPT: '0', GH_PROMPT_DISABLED: '1' }, timeout: options.timeout || 120000, maxBuffer: 16 * 1024 * 1024 });
    return { status: 0, stdout: out.stdout };
  } catch (error) { return { status: typeof error.code === 'number' ? error.code : 1, stdout: error.stdout || '', stderr: error.stderr || '' }; }
}

async function readJSON(file) { try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch { return null; } }
async function sameBytes(a, b) { try { return sameTrusted(await fs.readFile(a), await fs.readFile(b)); } catch { return false; } }

class ProjectUpdateService {
  constructor({ run = defaultRun, trustedRoot = path.resolve(__dirname, '../../..'), appCommit = null, engineVersion = null, templateUrl = OFFICIAL_TEMPLATE } = {}) {
    Object.assign(this, { run, trustedRoot, appCommit, engineVersion, templateUrl }); this.pending = new Map(); this.busy = false;
  }
  async git(root, args, { allowFail = false, ...options } = {}) {
    const result = await this.run('git', ['--no-replace-objects', '--no-pager', '-C', root, ...args], { cwd: root, ...options });
    if (result.status !== 0 && !allowFail) throw fail('GIT_FAILED', '更新時有一個步驟沒有完成，你的檔案沒有被改動。請再試一次；還是不行的話，請把這個畫面給幫你設定電腦的人看。');
    return allowFail ? result : String(result.stdout || '');
  }
  async appVersion() { return this.engineVersion || (await readJSON(path.join(this.trustedRoot, 'package.json')))?.version || null; }

  // 不連網的狀態：專案版本、保護程式是否一致、哪些行程的資料格式需要升級。
  async status(root) {
    const projectVersion = (await readJSON(path.join(root, 'package.json')))?.version || null, appVersion = await this.appVersion();
    const trusted = (await Promise.all(TRUSTED_FILES.map(file => sameBytes(path.join(root, file), path.join(this.trustedRoot, file))))).every(Boolean);
    const trips = [];
    for (const name of await fs.readdir(path.join(root, 'trips')).catch(() => [])) {
      if (!SLUG.test(name)) continue;
      const config = await readJSON(path.join(root, 'trips', name, 'trip.config.json'));
      if (config && config.schemaVersion !== SCHEMA_VERSION) trips.push({ slug: name, schemaVersion: Number.isSafeInteger(config.schemaVersion) ? config.schemaVersion : 0 });
    }
    const newerProject = Boolean(projectVersion && appVersion && compareVersions(projectVersion, appVersion) > 0) || trips.some(t => t.schemaVersion > SCHEMA_VERSION);
    const state = newerProject ? 'app-older' : (!trusted || trips.length || (projectVersion && appVersion && compareVersions(projectVersion, appVersion) < 0)) ? 'update-available' : 'current';
    return { state, projectVersion, appVersion, trusted, migrateTrips: trips.filter(t => t.schemaVersion < SCHEMA_VERSION).map(t => t.slug) };
  }

  // 更新一律從官方模板網址取得，不看專案裡的 upstream 設定：App 下載的私人專案通常沒有 upstream，
  // 有也可能指向別處。合併目標仍必須是官方 main 歷史裡、App 內建的那個 commit，所以來源固定不會被換掉。
  async upstream() { return this.templateUrl; }

  // 使用者行程以外的未提交改動會被合併影響，先擋下。
  async dirtyEngineFiles(root) {
    const lines = (await this.git(root, ['status', '--porcelain', '-z', '--untracked-files=all'])).split('\0').filter(Boolean);
    return lines.map(line => line.slice(3)).filter(name => !(name.startsWith('trips/') && !name.startsWith('trips/_example/')) && !name.startsWith('.local/'));
  }

  async prepare(root) {
    if (this.busy) throw fail('PROJECT_UPDATE_BUSY');
    if (typeof root !== 'string' || !path.isAbsolute(root)) throw fail('UNSAFE_PATH');
    const status = await this.status(root);
    if (status.state === 'app-older') throw fail('APP_UPDATE_REQUIRED', '這個旅程資料夾比 App 內建的版本還新，請先更新 Travel Planner App。');
    const source = await this.upstream(root);
    for (const marker of ['MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REBASE_HEAD']) {
      const file = (await this.git(root, ['rev-parse', '--git-path', marker])).trim();
      if (await fs.lstat(path.resolve(root, file)).then(() => true, () => false)) throw fail('GIT_OPERATION_ACTIVE', '這個旅程資料夾有一個還沒完成的 Git 合併（通常是其他工具留下的）。App 不會替你決定怎麼處理，這次沒有更新。請把這個畫面給幫你設定電腦的人看。');
    }
    if ((await this.git(root, ['diff', '--cached', '--name-only'])).trim()) throw fail('STAGED_CHANGES', '旅程資料夾裡有被其他工具「暫存」、準備提交的改動，這次沒有更新。先到「設定 → 備份與分享」備份一次（備份時可以按「取消暫存」），再回來更新。');
    const dirty = await this.dirtyEngineFiles(root);
    if (dirty.length) throw fail('ENGINE_FILES_CHANGED', '行程資料夾以外有被改過、還沒備份的檔案，更新可能會蓋掉它們，所以這次沒有更新：' + dirty.slice(0, 5).join('、') + '。如果不是你刻意改的，請把這個畫面給幫你設定電腦的人看。');
    const head = (await this.git(root, ['rev-parse', 'HEAD'])).trim();
    const fetched = await this.git(root, ['fetch', '--no-tags', '--no-recurse-submodules', source, 'main'], { allowFail: true });
    if (fetched.status !== 0) throw fail('UPSTREAM_FETCH_FAILED', '無法從 GitHub 取得模板更新，請確認網路後再試。');
    const latest = (await this.git(root, ['rev-parse', 'FETCH_HEAD'])).trim();
    // 優先對齊 App 內建引擎的 commit；它必須屬於上游 main 的歷史。
    let target = latest;
    if (this.appCommit && /^[0-9a-f]{40}$/.test(this.appCommit)) {
      const known = await this.git(root, ['merge-base', '--is-ancestor', this.appCommit, latest], { allowFail: true });
      if (known.status === 0) target = this.appCommit;
    }
    const upToDate = (await this.git(root, ['merge-base', '--is-ancestor', target, head], { allowFail: true })).status === 0;
    let files = [], highlights = [], targetVersion = status.projectVersion;
    if (!upToDate) {
      files = (await this.git(root, ['diff', '--name-only', '-z', `${head}...${target}`])).split('\0').filter(Boolean);
      const touched = files.filter(name => name.startsWith('trips/') && !name.startsWith('trips/_example/'));
      if (touched.length) throw fail('UPDATE_TOUCHES_TRIPS', '模板更新含有行程資料夾的改動，App 不會自動合併：' + touched.slice(0, 5).join('、'));
      const trial = await this.git(root, ['merge-tree', '--write-tree', '--name-only', '--no-messages', head, target], { allowFail: true });
      if (trial.status !== 0) {
        const conflicts = String(trial.stdout || '').split('\n').slice(1).filter(Boolean);
        throw fail('UPDATE_CONFLICTS', '這次更新和旅程資料夾裡的修改有衝突，App 不會自動解決：' + conflicts.slice(0, 5).join('、'));
      }
      targetVersion = (JSON.parse(await this.git(root, ['show', `${target}:package.json`])).version) || null;
      const changelog = await this.git(root, ['show', `${target}:CHANGELOG.md`], { allowFail: true });
      highlights = parseChangelog(String(changelog.stdout || ''))
        .filter(entry => !status.projectVersion || compareVersions(entry.version, status.projectVersion) > 0)
        .map(entry => ({ version: entry.version, date: entry.date, needsMigrate: entry.needsMigrate, highlights: entry.highlights.slice(0, 6) }));
    }
    if (upToDate && !status.migrateTrips.length) {
      return { upToDate: true, status, message: status.trusted ? '旅程資料夾已經是最新版本。' : '旅程資料夾已經是最新版本，但備份保護程式和 App 不一致；請更新 Travel Planner App。' };
    }
    const token = randomUUID();
    this.pending.clear(); this.pending.set(token, { root, head, target, files, expires: Date.now() + 10 * 60 * 1000 });
    return { token, upToDate, fromVersion: status.projectVersion, toVersion: targetVersion, changedFiles: files.length, highlights, migrateTrips: status.migrateTrips, alignedWithApp: target === this.appCommit };
  }

  async confirm(token, { migrate } = {}) {
    if (this.busy) throw fail('PROJECT_UPDATE_BUSY');
    const pending = this.pending.get(token); this.pending.delete(token);
    if (!pending || Date.now() > pending.expires) throw fail('STALE_CONFIRMATION', '確認已過期，請重新檢查更新。');
    this.busy = true;
    try {
      const { root, head, target } = pending;
      if ((await this.git(root, ['rev-parse', 'HEAD'])).trim() !== head || (await this.dirtyEngineFiles(root)).length) throw fail('CONTENT_CHANGED', '旅程資料夾在確認前有變動，請重新檢查更新。');
      let merged = false;
      if ((await this.git(root, ['merge-base', '--is-ancestor', target, head], { allowFail: true })).status !== 0) {
        const result = await this.git(root, ['merge', '--no-edit', '-m', 'Merge Travel Planner template update', target], { allowFail: true });
        if (result.status !== 0) {
          await this.git(root, ['merge', '--abort'], { allowFail: true });
          throw fail('UPDATE_MERGE_FAILED', '合併沒有完成，已還原到更新前的狀態。若提示缺少提交者，請先在備份區「設定備份署名」。');
        }
        merged = true;
      }
      const migrated = [];
      const status = await this.status(root);
      for (const slug of status.migrateTrips) migrated.push({ slug, ...(await migrate(path.join(root, 'trips', slug))) });
      const after = await this.status(root);
      return { merged, migrated, status: after, head: (await this.git(root, ['rev-parse', 'HEAD'])).trim() };
    } finally { this.busy = false; }
  }
}

// 用 App 內建的遷移腳本升級一趟行程的資料格式（和 CLI 的 npm run migrate 相同步驟）。
function migrateWithAppScripts(tripDirectory, scriptsRoot = path.resolve(__dirname, '../../../scripts/migrate')) {
  const configFile = path.join(tripDirectory, 'trip.config.json');
  const version = () => require('node:fs').existsSync(configFile) ? (JSON.parse(require('node:fs').readFileSync(configFile, 'utf8')).schemaVersion || 0) : 0;
  let from = version(); const steps = [];
  while (from < SCHEMA_VERSION) {
    const step = path.join(scriptsRoot, `${from}-to-${from + 1}.js`);
    const notes = require(step).migrate(tripDirectory);
    steps.push({ step: `${from} → ${from + 1}`, notes: Array.isArray(notes) ? notes.map(String).slice(0, 20) : [] });
    const next = version(); if (next <= from) throw fail('MIGRATE_STALLED', '資料格式升級沒有前進，已停止。'); from = next;
  }
  return { steps };
}

module.exports = { ProjectUpdateService, migrateWithAppScripts };
