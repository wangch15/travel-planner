// 把行程的公開網站下線。**只動 Cloudflare 上那份公開 HTML，不動任何行程資料。**
//
// 旅程結束之後那個網址還在服務，內容是旅伴、每天住哪、幾號到幾號不在家。
// 資料的價值歸零但風險不變，所以要有一條把它關掉的路。
//
// 兩段式（同 adopt-deploy）：這是不可逆且對外的動作，不能讓 agent 一句話做掉。
const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const { inspectWorker, STATE_DIR, statePath, readState } = require('./deployment-state.js');

const RECEIPT = /^[a-f0-9]{64}$/;

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

// 遠端事實必須與本機紀錄一致，否則可能刪到別人的 Worker。
function verifyTarget(slug, config, state, options) {
  const name = config.deploy.name;
  const info = inspectWorker(name, path.join(options.root || '.', 'dist', slug, 'wrangler.json'), options);
  if (!info.latest) throw new Error(`Worker「${name}」在 Cloudflare 上不存在；沒有東西可以下線。`);
  if (info.accountId !== state.accountId) {
    throw new Error(`帳號不符：本機紀錄是 ${state.accountId}，這次查到 ${info.accountId}。停止，不刪任何東西。`);
  }
  const versions = info.latest.versions || [];
  if (versions.length !== 1 || versions[0].version_id !== state.versionId || versions[0].percentage !== 100) {
    throw new Error(`Worker「${name}」的線上版本不是本機紀錄的那一個，可能是別的網站或別人動過。停止，不刪任何東西。`);
  }
  return {
    slug, name, accountId: info.accountId, accountName: info.accountName,
    deploymentId: info.latest.id, createdOn: info.latest.created_on, versionId: versions[0].version_id,
  };
}

// 只改 shipped 那一行；其他欄位與使用者自己寫的筆記一律不動。
function markStatusUnshipped(root, slug, url, log) {
  const file = path.join(root, 'trips', slug, 'docs', 'status.md');
  let text;
  try { text = fs.readFileSync(file, 'utf8'); }
  catch { log(`（找不到 ${file}，沒有更新進度；網站已經下線。）`); return; }
  const line = `- shipped：已下線（原網址 ${url || '未記錄'} 已停止服務）`;
  const next = /^- shipped：.*$/m.test(text)
    ? text.replace(/^- shipped：.*$/m, line)
    : `${text.trimEnd()}\n${line}\n`;
  try { fs.writeFileSync(file, next); }
  catch { log('（status.md 寫入失敗，沒有更新進度；網站已經下線。）'); }
}

function unshipTrip({ slug, config }, {
  confirm, stateDir = STATE_DIR, root = process.cwd(), log = console.log, ...options
} = {}) {
  const target = config.deploy?.target || 'workers';
  if (target !== 'workers') {
    throw new Error('unship 只支援 Workers，不支援 Pages。Pages 專案請先照 docs/schema/trip-config.md 遷移成 workers。');
  }
  const record = statePath(slug, stateDir);
  const state = readState(record);
  if (!state) {
    throw new Error('沒有本機部署紀錄，不能下線——無法確認那個網址是不是這趟的。'
      + ` 先跑 npm run adopt-deploy -- ${slug} 認領，再回來下線。`);
  }
  const pendingFile = statePath(slug, path.join(stateDir, 'pending-unship'));
  const pending = confirm === undefined ? null : readPending(pendingFile, confirm);
  const facts = verifyTarget(slug, config, state, { ...options, root });

  if (!pending) {
    const receipt = randomBytes(32).toString('hex');
    fs.mkdirSync(path.dirname(pendingFile), { recursive: true, mode: 0o700 });
    fs.writeFileSync(pendingFile, JSON.stringify({ schemaVersion: 1, receipt, facts }, null, 2) + '\n', { mode: 0o600 });
    log(`即將下線：${slug}${config.title ? `（${config.title}）` : ''}`);
    log(`會停止服務的網址：${state.url || '（本機紀錄沒有網址；Worker 名稱是 ' + facts.name + '）'}`);
    log(`Cloudflare 帳號「${facts.accountName}」（${facts.accountId}），Worker「${facts.name}」，線上版本 ${facts.versionId}。`);
    log('');
    log('**不會被刪的東西**：');
    log(`  - trips/${slug}/ 底下全部資料（行程、照片、docs/ 的筆記）`);
    log('  - 你的私有 GitHub repo 與它的歷史');
    log('  - 之後想重新上線，npm run ship 就可以（會是一次新的首次部署）');
    log('');
    log('下線之後那個網址立刻失效，已經傳出去的連結打不開。這一步不可逆。');
    log(`查核編號：${receipt}`);
    log(`請原樣轉述上面的內容，等使用者明確點頭後，才執行 npm run unship -- ${slug} --confirm ${receipt}。查核編號不代表人已同意。`);
    return { status: 'awaiting-confirmation', receipt, facts };
  }

  if (!isDeepStrictEqual(pending.facts, facts)) {
    fs.rmSync(pendingFile, { force: true });
    throw new Error('查核事實已變更，舊編號失效；請重新查核並請人確認，不刪任何東西。');
  }

  const result = options.runWrangler(['delete', facts.name, '--config', path.join(root, 'dist', slug, 'wrangler.json')], {
    env: { ...(options.env || process.env), CLOUDFLARE_ACCOUNT_ID: facts.accountId, CF_ACCOUNT_ID: facts.accountId },
  });

  // **不要相信 wrangler 的退出碼或輸出。** 非互動模式下它的確認提示行為不明，
  // 所以刪完一定要再查一次遠端。還在就誠實回報，不謊報下線。
  let after;
  try { after = inspectWorker(facts.name, path.join(root, 'dist', slug, 'wrangler.json'), { ...options, root }); }
  catch (e) { throw new Error(`刪除指令已送出，但無法確認結果（${e.message}）。請到 Cloudflare 的 Workers & Pages 手動核對，不要盲目重試。`); }
  if (after.latest) {
    throw new Error(`wrangler 沒有刪成功：Worker「${facts.name}」仍然存在`
      + `（退出碼 ${result?.status ?? '未知'}）。本機紀錄保留不變。`
      + ' 請到 Cloudflare 的 Workers & Pages 手動刪除，或檢查權限後重試。');
  }

  fs.rmSync(pendingFile, { force: true });
  fs.rmSync(record, { force: true });
  markStatusUnshipped(root, slug, state.url, log);
  log(`已下線：Worker「${facts.name}」不再存在，${state.url || '該網址'} 已停止服務。`);
  log(`trips/${slug}/ 的資料完全沒有動。想重新上線就跑 npm run ship -- ${slug}。`);
  return { status: 'unshipped', name: facts.name, url: state.url };
}

module.exports = { unshipTrip };
