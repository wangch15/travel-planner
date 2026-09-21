// contrib-check 與 PUBLIC pre-push 共用的唯一歷史掃描／路徑政策。
const { execFileSync } = require('node:child_process');
const OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i;
const BLOCKED = [
  { re: /^trips\/_profile\.md$/, why: '跨行程的私人偏好（同行的人、飲食限制）' },
  { re: /^trips\/(?!_example\/)/, why: '某個人的行程資料與私人筆記' },
  { re: /^dist\//, why: 'build 產物，不該進 git' },
  { re: /(?:^|\/)\.cache\//, why: '快取，不該進 git' },
];

function classifyPaths(paths) {
  const blocked = [], engine = [];
  for (const p of paths) (BLOCKED.some((b) => b.re.test(p)) ? blocked : engine).push(p);
  return { blocked, engine };
}

function gitRead(args, root) {
  try {
    // 機器輸出不可混入使用者的簽章說明／顏色／pager，replace refs 也不能隱藏真正歷史。
    return execFileSync('git', ['--no-replace-objects', '--no-pager', '-c', 'log.showSignature=false', '-c', 'color.ui=false', ...args], {
      cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 10000, maxBuffer: 50 * 1024 * 1024,
    });
  } catch {
    throw new Error(`無法讀取完整 Git 歷史（${args[0]}）；請先取得完整歷史與所需的基準 commit。`);
  }
}

function resolveCommit(ref, root) {
  const id = gitRead(['rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`], root).trim();
  if (!OID.test(id)) throw new Error('無法確認歷史範圍的 commit。');
  return id;
}

function scanHistory(base, tip = 'HEAD', { root = process.cwd() } = {}) {
  if (gitRead(['rev-parse', '--is-shallow-repository'], root).trim() !== 'false') {
    throw new Error('shallow 或未知深度，不能確認完整歷史；請先取得完整歷史再查核。');
  }
  const end = resolveCommit(tip, root);
  const start = base === null ? null : resolveCommit(base, root);
  const range = start ? `${start}..${end}` : end;
  // 原 contrib-check 的掃描：兩點完整新增歷史、merge 每個 parent、改名前後、NUL 路徑。
  const out = gitRead(['log', '--format=', '--name-only', '-z', '--no-renames', '-m', '--root',
    '--end-of-options', range, '--'], root);
  const paths = [...new Set(out.split('\0').filter(Boolean))].sort();
  const classified = classifyPaths(paths);
  // 只有找到禁止路徑才定位 commit。literal pathspec 防止檔名被當成 glob／排除條件。
  const violations = classified.blocked.map((file) => {
    const commit = gitRead(['--literal-pathspecs', 'log', '--format=%H', '--no-patch', '--no-renames',
      '-m', '--root', '--full-history', '-1', '--end-of-options', range, '--', file], root).trim().split('\n')[0];
    if (!OID.test(commit)) throw new Error('已找到禁止路徑，但無法確認對應 commit；停止，不得視為乾淨。');
    return { path: file, commit };
  });
  return { ...classified, violations, paths, base: start, tip: end };
}

module.exports = { BLOCKED, classifyPaths, scanHistory, gitRead, resolveCommit };
