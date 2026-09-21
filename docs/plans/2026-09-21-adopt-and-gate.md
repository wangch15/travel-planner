# Gate precedence and adopt-deploy Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 修正閘門二優先序與可行性；讓無本機紀錄的既有 Worker 經人確認後恢復正常 ship。

**Architecture:** 固定第三層先判斷，其餘才進三問。獨立 adopt-deploy 分兩次執行：inspect 唯讀查核並寫 pending 收據，confirm 重新查核，只有收據綁定的事實未變且無正式紀錄才原子建立正式紀錄。認領紀錄 url=null，ship 仍比對帳號／Worker／版本，成功後補網址。Cloudflare 只提供事實，歸屬由人判斷。

**Tech Stack:** Node.js、Git、Markdown 守門測試、注入式 wrangler runner（4.135.0）。

## Commit 1：閘門二

- tests/agent-docs.test.js：先加順序、限定段落的條件→動作、表格情境及一致性測試，確認舊文件紅燈。
- .ai/skills/tp-ship/SKILL.md：固定第三層優先；最低可行性檢查包含最後入場、停留時間、末班車、後續預約，非完整清單；加入明確情境表。
- .ai/entrypoints/project-context.md、README.md 同步例外；跑 sync:agent-assets，完整 npm test 後 commit。

## Commit 2：adopt-deploy

- tests/adopt-deploy.test.js：先紅，涵蓋 inspect 無正式寫入、confirm 二次查核、錯收據、目標／遠端事實改變、既有或損壞紀錄、權限／網路失敗、空／混合版本、CLI 及認領後正常 ship。
- scripts/lib/deployment-state.js：共用唯讀帳號與部署解析；僅有完整認領標记的 Workers 紀錄允許 url=null。
- scripts/lib/adopt-deployment.js：pending 隨機查核編號綁定 slug、target、帳號名稱／ID、Worker、deployment ID／時間／version；不同就失效。正式檔排他建立，不能蓋掉其間產生的合法紀錄。
- scripts/adopt-deploy.js、package.json：嚴格參數，只允許 slug 與 --confirm <編號>，沒有 ship force／採用旗標；不 build、不改遠端。
- .ai/skills/tp-ship/SKILL.md、which-trip、README、how-it-works：agent 只能在使用者同意查核後列事實，再等明確歸屬確認才能 confirm；網址未知明说，不捏造。
- tests 先紅後綠，全部 wrangler 使用替身。完整測試使用隔離副本，避免工作目錄 trips/ 的測試 fixtures。

## Commit 3：版本說明與交付

- 文件測試先紅，再補 CHANGELOG／README：固定 wrangler 是為輸出格式契約，代價是沒有自動安全更新；更新前跑 ship/adopt 相關測試及全套測試。
- docs/reviews/2026-09-21-adopt-and-gate-report.md 記錄 base、實作邊界、測試與 review 清單。

## 禁止與留待以後

不認領真實 example-trip、不連 Cloudflare、不部署、不 push、不 fork、不開 PR，不改工作目錄 trips/ 或放寬內容 schema。
不做 status.md、首次備份確認、noindex 文案或對外診斷去識別化。
收據不是人類身分驗證；兩次遠端讀取也不是 Cloudflare 原子鎖。Pages 認領不在此輪範圍。
