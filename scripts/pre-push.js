#!/usr/bin/env node
const fs = require('node:fs');
const { checkPush, WARNING } = require('./lib/pre-push.js');

function main(argv = process.argv.slice(2), { input = () => fs.readFileSync(0, 'utf8'), error = console.error, ...options } = {}) {
  try {
    const [remoteName, remoteUrl] = argv;
    const verdict = checkPush({ remoteName, remoteUrl, updates: input(), root: process.cwd() }, options);
    if (verdict.allowed) return 0;
    error(verdict.message);
  } catch {
    error(`✗ 推送查核無法完成。\n${WARNING}\n請讓 AI 檢查 pre-push 的輸入、安裝與工具環境，修好後再試；不要跳過檢查。`);
  }
  return 1;
}

module.exports = { main };
if (require.main === module) process.exitCode = main();
