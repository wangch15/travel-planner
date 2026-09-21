const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('which-trip 說清楚首次網址未知，不能把 ship 印字当成人類確認', () => {
  const rule = read('.ai/rules/which-trip.md');
  assert.match(rule, /\.local\/deployments\//);
  assert.match(rule, /首次.*未知|首次.*尚未/);
  assert.match(rule, /上次成功/);
  assert.match(rule, /不是.*確認|不代表.*確認/);
  assert.ok(!rule.includes('也會把即將覆蓋的網址印出來，把那一行唸給他聽'));
});

test('tp-ship 描述只讀失敗停止、既有 Worker 無紀錄不認領、Pages 限制', () => {
  const skill = read('.ai/skills/tp-ship/SKILL.md');
  for (const text of ['whoami', 'deployments list', '唯讀', '未登入', '網路', '權限', '停止', 'gitignore', '不保存登入憑證']) {
    assert.ok(skill.includes(text), `tp-ship 缺 ${text}`);
  }
  assert.match(skill, /沒有.*紀錄[\s\S]*不.*認領/);
  assert.match(skill, /Pages.*不.*防撞/);
  assert.match(skill, /已部署.*紀錄.*失敗/);
});

test('README 與機制說明揭露 cache 不進 Git，首次未知且跨 repo 保護僅限 Workers', () => {
  for (const file of ['README.md', 'docs/how-it-works.md']) {
    const doc = read(file);
    assert.match(doc, /\.local\/deployments\//);
    assert.match(doc, /不進 git|不進 Git|gitignore/);
    assert.match(doc, /首次.*未知|首次.*尚未/);
    assert.match(doc, /Pages.*不.*防撞/);
  }
});
