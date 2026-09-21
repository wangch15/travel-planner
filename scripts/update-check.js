#!/usr/bin/env node
// 回報引擎落後上游幾版：node scripts/update-check.js [--no-fetch]
//
// 使用者的複本是靠 git merge upstream/main 拿引擎更新的，但沒有任何東西會
// 主動通知他。這個指令就是那個通知——開工時跑一次，看一眼要不要更新。
//
// **它只回報，永遠不自己更新。** 更新有風險（merge 衝突、資料要升版），
// 而且他可能正在趕出發前的準備。要不要更新是人的決定。
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { ROOT } = require('./lib/paths.js');

const UPSTREAM = 'upstream';
const BRANCH = 'main';

function git(args, opts = {}) {
  return execFileSync('git', args, {
    cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], ...opts,
  });
}

// 「1.10.0 比 1.2.0 新」——字串比會搞錯，所以逐段比數字。
// 一般使用者的上游是 `upstream`。但模板作者自己那份複本的 origin 就是模板本身，
// 沒有 upstream——對他報「remote 沒設好」是誤判（同 b437ff5 修過的那一類）。
function pickRemote(remotes, originUrl) {
  if (remotes.includes(UPSTREAM)) return UPSTREAM;
  const isTemplate = originUrl && /[/:]wangch15\/travel-planner(\.git)?\/?$/.test(String(originUrl).trim());
  return remotes.includes('origin') && isTemplate ? 'origin' : null;
}

function compareVersions(a, b) {
  const seg = (v) => String(v).split('.').map((n) => parseInt(n, 10) || 0);
  const [x, y] = [seg(a), seg(b)];
  for (let i = 0; i < Math.max(x.length, y.length); i += 1) {
    const d = (x[i] || 0) - (y[i] || 0);
    if (d) return d;
  }
  return 0;
}

// CHANGELOG 的格式是「## 1.1.0（2026-09-21）」，每一版最後一行寫著要不要 migrate。
function parseChangelog(md) {
  const out = [];
  const re = /^## (\d+\.\d+\.\d+)（([^）]*)）$/gm;
  const heads = [...String(md).matchAll(re)];
  heads.forEach((h, i) => {
    const start = h.index + h[0].length;
    const end = i + 1 < heads.length ? heads[i + 1].index : md.length;
    const body = md.slice(start, end).trim();
    out.push({
      version: h[1],
      date: h[2],
      body,
      needsMigrate: /資料需要\s*migrate\s*[：:]\s*是/.test(body),
      // 條列的第一層當摘要，不要把整份 CHANGELOG 倒給使用者。
      highlights: body.split('\n')
        .filter((l) => l.startsWith('- ') && !/資料需要\s*migrate/.test(l))
        .map((l) => l.replace(/^-\s*/, '').replace(/\*\*/g, '').trim()),
    });
  });
  return out;
}

function entriesNewerThan(entries, local) {
  return entries.filter((e) => compareVersions(e.version, local) > 0);
}

function renderReport({ local, upstream, entries = [], error = null, remote = UPSTREAM }) {
  if (error === 'no-upstream') {
    return [
      `找不到 ${UPSTREAM} remote，所以沒辦法知道引擎有沒有更新。`,
      '',
      '這代表 remote 沒設好。補法見 tp-setup 第 3 步：',
      `  git remote add ${UPSTREAM} https://github.com/wangch15/travel-planner.git`,
      '',
      `補好之後 origin 要是使用者自己的私有 repo、${UPSTREAM} 才是模板。`,
    ].join('\n');
  }
  if (error === 'fetch-failed') {
    return [
      '連不上 GitHub，抓不到上游的最新狀態。',
      '',
      `本機引擎版本：${local}`,
      '**這不代表引擎沒有更新**——只是這次查不到。有網路的時候再跑一次。',
      '',
      '離線不影響做行程：check、build、preview、basemap 都不需要網路。',
    ].join('\n');
  }

  const cmp = compareVersions(local, upstream);
  if (cmp > 0) {
    return [
      `本機引擎 ${local} 比上游 ${upstream} 新——這是模板作者本人的複本，`,
      '有還沒推上去的改動。不需要更新。',
    ].join('\n');
  }
  if (cmp === 0 || !entries.length) {
    return `引擎已經是最新的（${local}）。`;
  }

  const migrate = entries.filter((e) => e.needsMigrate);
  const out = [
    `引擎落後 ${entries.length} 版：本機 ${local} → 上游 ${upstream}`,
    '',
  ];
  for (const e of entries) {
    out.push(`## ${e.version}（${e.date}）${e.needsMigrate ? '　⚠ 資料需要 migrate' : ''}`);
    for (const h of e.highlights.slice(0, 4)) out.push(`  - ${h}`);
    out.push('');
  }
  if (migrate.length) {
    out.push(`⚠ 其中 ${migrate.map((e) => e.version).join('、')} 需要升版資料。`);
    out.push('  合併之後要跑 npm run migrate -- <slug>，它會印出需要人判斷的待辦。');
    out.push('');
  } else {
    out.push('這幾版都不需要動到行程資料（資料需要 migrate：否）。');
    out.push('');
  }
  out.push('**要不要更新是使用者的決定，不要自己合併。**');
  out.push('把上面的重點講給他聽，問他要不要現在更新——更新有風險（merge 衝突、');
  out.push('資料升版），而他可能正在趕出發前的準備。');
  out.push('');
  out.push('他說要的話走 tp-update，不要自己拼 git 指令。');
  return out.join('\n');
}

function collect({ fetch = true } = {}) {
  const local = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;

  const remotes = (() => { try { return git(['remote']); } catch { return ''; } })()
    .split('\n').map((s) => s.trim()).filter(Boolean);
  const originUrl = (() => { try { return git(['remote', 'get-url', 'origin']); } catch { return null; } })();
  const remote = pickRemote(remotes, originUrl);
  if (!remote) return { local, upstream: null, error: 'no-upstream' };

  if (fetch) {
    try {
      git(['fetch', remote, BRANCH], { timeout: 30000 });
    } catch {
      return { local, upstream: null, error: 'fetch-failed', remote };
    }
  }
  let pkg;
  let changelog;
  try {
    pkg = git(['show', `${remote}/${BRANCH}:package.json`]);
    changelog = git(['show', `${remote}/${BRANCH}:CHANGELOG.md`]);
  } catch {
    return { local, upstream: null, error: 'fetch-failed', remote };
  }
  const upstream = JSON.parse(pkg).version;
  return { local, upstream, remote, entries: entriesNewerThan(parseChangelog(changelog), local) };
}

module.exports = { compareVersions, parseChangelog, entriesNewerThan, renderReport, collect, pickRemote };

if (require.main === module) {
  console.log(renderReport(collect({ fetch: !process.argv.includes('--no-fetch') })));
}
