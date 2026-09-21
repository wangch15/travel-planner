// 只決定 PUBLIC 推送的範圍；掃描與禁止路徑判斷全部重用 contribution-history。
const { scanHistory, gitRead, resolveCommit } = require('./contribution-history.js');
const OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i;
const zero = (s) => /^0+$/.test(s);

function parseUpdates(input) {
  if (typeof input !== 'string' || !input.trim()) throw new Error('缺少推送 ref 更新，無法確認範圍。');
  return input.trim().split(/\r?\n/).map((line) => {
    const parts = line.trim().split(/\s+/);
    if (parts.length !== 4 || !OID.test(parts[1]) || !OID.test(parts[3]) || parts[1].length !== parts[3].length ||
      !parts[2].startsWith('refs/') || (zero(parts[1]) && zero(parts[3]))) {
      throw new Error('推送 ref 更新格式無法判讀，不能確認範圍。');
    }
    return { localRef: parts[0], local: parts[1], remoteRef: parts[2], remote: parts[3] };
  });
}

function inspectPublicPush(input, { root = process.cwd() } = {}) {
  const updates = parseUpdates(input);
  const violations = [], ranges = [];
  let fallback;
  function newBranchBase() {
    if (fallback) return fallback;
    const ref = 'refs/remotes/upstream/main';
    const refs = gitRead(['for-each-ref', '--format=%(refname)', ref], root).trim().split('\n');
    if (refs.includes(ref)) {
      // 不能只信 ref 的名字：若有人誤把私人歷史設成 upstream/main，也不能將它排除。
      const audit = scanHistory(null, ref, { root });
      if (audit.violations.length) {
        violations.push(...audit.violations);
        return null;
      }
      fallback = audit.tip;
      return fallback;
    }
    // 只用 Git 此次 stdin 已確認屬於「這個目的地」的既有 ref，不猜 origin/main 或 remote 名稱。
    for (const update of updates) {
      if (zero(update.remote)) continue;
      try { fallback = resolveCommit(update.remote, root); return fallback; }
      catch { /* 另一個已知目的地 ref 可能有可用物件；全部失敗仍拒絕。 */ }
    }
    throw new Error('新分支沒有可信基準；請先取得 upstream/main 的完整公開模板歷史。');
  }
  for (const update of updates) {
    if (zero(update.local)) continue; // 刪除不帶入新物件；呼叫者仍先查可見度。
    const base = zero(update.remote) ? newBranchBase() : update.remote;
    if (base === null) break; // 不可信 upstream 的禁止路徑已記錄，整次拒絕。
    const audit = scanHistory(base, update.local, { root });
    violations.push(...audit.violations);
    ranges.push({ ref: update.remoteRef, base: audit.base, tip: audit.tip });
  }
  return { ranges, violations };
}

module.exports = { inspectPublicPush, parseUpdates };
