// Cloudflare 提供事實，人判斷是不是這趟網站。收據不是人類身分驗證。
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const { inspectWorker, STATE_DIR, statePath, readState } = require('./deployment-state.js');
const RECEIPT = /^[a-f0-9]{64}$/;

function ensureUnrecorded(file) {
  if (readState(file)) throw new Error('已有合法部署紀錄，拒絕認領或覆蓋；請走正常 ship。');
}

function atomicJSON(file, value, exclusive = false) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${randomBytes(16).toString('hex')}.tmp`;
  try {
    fs.writeFileSync(temporary, JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    // link 的 EEXIST 是最後一道防線：查核期間另一程序可能已寫入正式紀錄。
    if (exclusive) fs.linkSync(temporary, file);
    else fs.renameSync(temporary, file);
  } catch (e) {
    if (exclusive && e.code === 'EEXIST') throw new Error('已有部署紀錄，拒絕覆蓋。');
    throw new Error('本機認領紀錄寫入失敗；未修改遠端，請修復檔案權限後重新查核。');
  } finally {
    try { fs.rmSync(temporary, { force: true }); } catch { /* 不掩蓋寫入結果。 */ }
  }
}

function readPending(file, receipt) {
  if (!RECEIPT.test(receipt)) throw new Error('查核編號不合法；請先查核、等人確認，再帶原編號。');
  try {
    const pending = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (pending.schemaVersion !== 1 || pending.receipt !== receipt || !pending.facts) throw new Error('invalid');
    return pending;
  } catch {
    throw new Error('找不到相符的查核收據或收據已損壞；請重新查核並請人確認。');
  }
}

function queryFacts(slug, config, options) {
  // 不借用 build，不讀工作目錄的 wrangler 設定，不讓隱含的 account_id 改變查核目標。
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-adopt-probe-'));
  try {
    const file = path.join(dir, 'wrangler.json');
    const name = config.deploy?.name;
    fs.writeFileSync(file, JSON.stringify({ name }), { mode: 0o600 });
    const { accountId, accountName, latest } = inspectWorker(name, file, options);
    if (typeof accountName !== 'string' || !accountName.trim()) throw new Error('帳號名稱缺漏，停止認領，不能猜測。');
    if (!latest) throw new Error('Worker 不存在，不需認領；新網站請走正常 preview／ship 流程。');
    if (typeof latest.id !== 'string' || !latest.id || typeof latest.created_on !== 'string' ||
      latest.versions.length !== 1 || latest.versions[0].percentage !== 100) {
      throw new Error('無法確認部署 ID／時間與單一 100% 版本，停止認領。');
    }
    return { slug, target: 'workers', name: config.deploy.name, accountId, accountName,
      deploymentId: latest.id, createdOn: latest.created_on, versionId: latest.versions[0].version_id };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function adoptDeployment({ slug, config }, { confirm, stateDir = STATE_DIR, log = console.log, ...options } = {}) {
  if ((config.deploy?.target || 'workers') !== 'workers') throw new Error('adopt-deploy 只支援 Workers，不支援 Pages。');
  const record = statePath(slug, stateDir);
  const pendingFile = statePath(slug, path.join(stateDir, 'pending'));
  ensureUnrecorded(record); // 損壞紀錄也由 readState 拒絕，不當成不存在。
  const pending = confirm === undefined ? null : readPending(pendingFile, confirm);
  const facts = queryFacts(slug, config, options);
  ensureUnrecorded(record);
  if (pending) {
    if (!isDeepStrictEqual(pending.facts, facts)) {
      fs.rmSync(pendingFile, { force: true });
      throw new Error('查核事實已變更，舊編號失效；請重新查核並請人確認，不寫入紀錄。');
    }
    const { accountId, name, versionId, deploymentId, createdOn } = facts;
    const state = { schemaVersion: 1, slug, target: 'workers', name, accountId, url: null, versionId,
      adoption: { deploymentId, createdOn } };
    atomicJSON(record, state, true);
    try { fs.rmSync(pendingFile, { force: true }); }
    catch { log('正式紀錄已建立，但暫存收據未清除；再次認領仍會被既有紀錄拒絕。'); }
    log('認領紀錄已建立，沒有部署或修改遠端。網址仍未知；回到正常 preview／ship，成功後才補真實網址。');
    return { status: 'adopted', state };
  }
  const receipt = randomBytes(32).toString('hex');
  atomicJSON(pendingFile, { schemaVersion: 1, receipt, facts });
  log(`查核事實（未認領）：${JSON.stringify(facts, null, 2)}`);
  log(`Cloudflare 帳號「${facts.accountName}」（${facts.accountId}）底下已經有 Worker「${facts.name}」，最後部署時間是 ${facts.createdOn}，版本是 ${facts.versionId}。目前實際網址未知。這是你這趟行程的網站嗎？如果不是，請先改 deploy.name。`);
  log(`查核編號：${receipt}`);
  log(`請 agent 原樣轉述事實與提問，等使用者明確點頭後，才執行 npm run adopt-deploy -- ${slug} --confirm ${receipt}。查核編號不代表人已同意。`);
  return { status: 'awaiting-confirmation', receipt, facts };
}

module.exports = { adoptDeployment };
