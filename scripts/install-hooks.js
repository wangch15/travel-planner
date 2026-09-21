#!/usr/bin/env node
// prepare：只設定本 repo，不覆蓋其他 hooksPath；沒有 Git 環境時不影響 npm install。
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const normalize = (p) => { try { return fs.realpathSync(p); } catch { return path.resolve(p); } };

function installHooks({ root = path.resolve(__dirname, '..'), run = spawnSync, log = console.warn } = {}) {
  const git = (args) => run('git', args, { cwd: root, encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'pipe'] });
  let top;
  try { top = git(['rev-parse', '--show-toplevel']); }
  catch { return 'skipped'; }
  if (top.error || top.status !== 0) return 'skipped';
  const topPath = typeof top.stdout === 'string' ? top.stdout.replace(/\r?\n$/, '') : '';
  if (!topPath || !path.isAbsolute(topPath)) {
    log('pre-push 未安裝：無法判讀 Git 根目錄。請檢查 git 與專案位置後重試。');
    return 'failed';
  }
  if (normalize(topPath) !== normalize(root)) {
    log('pre-push 未安裝：這個專案不是 Git 工作目錄根目錄。請確認專案位置，避免改到外層 repo 的設定。');
    return 'failed';
  }
  try {
    // 讀有效設定（含 global/worktree），不只查 local，否則可能蓋掉使用者的既有 hooks。
    const current = git(['config', '--get', 'core.hooksPath']);
    if (!current.error && current.status === 0) {
      // 空白是路徑的一部分；只去掉 git 輸出的結尾換行，不能把另一條路徑誤認成 .githooks。
      const value = current.stdout.replace(/\r?\n$/, '');
      if (value && normalize(path.resolve(root, value)) === normalize(path.join(root, '.githooks'))) return 'already-installed';
      log('pre-push 未安裝：已有其他 core.hooksPath，沒有覆蓋。請先由人確認並整合既有 hooks，再執行 npm run prepare；在確認保護生效前不要推送。');
      return 'conflict';
    }
    if (current.error || current.status !== 1) throw new Error('cannot read config');
    const configured = git(['config', '--local', 'core.hooksPath', '.githooks']);
    if (configured.error || configured.status !== 0) throw new Error('cannot write config');
    log('已設定本機 core.hooksPath = .githooks（pre-push 私有目的地檢查）。');
    return 'installed';
  } catch {
    log('pre-push 未安裝／未生效：無法讀寫 Git hooks 設定。請檢查 repo 權限並重新執行 npm run prepare，確認後再推送。');
    return 'failed';
  }
}

module.exports = { installHooks };
if (require.main === module) installHooks();
