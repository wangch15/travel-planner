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

test('認領規則要求先查核、原樣提問、人明確確認，不能讓查核編號取代同意', () => {
  const skill = read('.ai/skills/tp-ship/SKILL.md');
  const section = skill.split('## 既有 Worker 的兩段式認領')[1]?.split('\n## ')[0];
  assert.ok(section, '缺認領流程');
  assert.match(section, /agent 不得自行決定認領/);
  assert.match(section, /同意.*唯讀查核[\s\S]*npm run adopt-deploy -- <slug>/);
  assert.match(section, /原樣[\s\S]*明確[\s\S]*確認[\s\S]*--confirm <查核編號>/);
  assert.match(section, /查核編號不是.*同意/);
  assert.match(section, /重新查核[\s\S]*變更[\s\S]*重新.*確認/);
  assert.match(section, /url: null[\s\S]*正常.*ship/);
  assert.match(section, /已有合法紀錄[\s\S]*拒絕[\s\S]*損壞/);
});

test('認領相關文件不再宣稱完全無恢復方式，仍禁止自動認領與 force', () => {
  for (const file of ['README.md', 'docs/how-it-works.md', '.ai/rules/which-trip.md']) {
    const doc = read(file);
    assert.match(doc, /adopt-deploy/);
    assert.match(doc, /人.*確認|使用者.*確認/);
  }
  const skill = read('.ai/skills/tp-ship/SKILL.md');
  assert.ok(!skill.includes('本次沒有認領／force 功能'));
  assert.match(skill, /不.*自動認領/);
  assert.match(skill, /不.*force/);
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
