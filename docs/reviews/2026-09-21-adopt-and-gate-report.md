# 交給另一個 agent 的 review 報告

## Review 範圍

起點：`9ad6658`；範圍：`git diff 9ad6658..HEAD`。

本輪只做使用者已核准的三件事：
1. 修 ed36553 閘門二的四個 review 發現。
2. 補獨立、兩段式既有 Worker 認領，不再讓既有使用者升級後無法正常部署。
3. 補 wrangler 固定版本的理由、安全更新代價及升版測試要求。

Commits：
- `6882014`：固定第三層優先、完整日程可行性、三處摘要一致、情境與變異守門測試。
- `2918f27`：adopt-deploy 實作、共用查核解析、空網址認領紀錄及文件。
- 本報告所在的文件收尾 commit：wrangler 版本說明、額外固定清單刪除的變異測試與交付紀錄。

## A. 閘門二

來源：`.ai/skills/tp-ship/SKILL.md`、`.ai/entrypoints/project-context.md`、`README.md`。

- 固定第三層移到三問之前；明定命中就 preview，人看過才 ship，未命中才進三問。
- 保留首次上線、全域設定、天數／地點／順序、地圖／照片、theme.css／extra.js 的固定條件。
- 可行性不只看抵達時是否開門：加最後入場、停留所需時間、末班車／轉乘／還車／入住截止與後續預約，以及票額售罄／服務停駛。
- 清單明示只是最低要求、不是完整清單；混合採最高層、不確定第三層。
- 補情境表：換照片、票價更新、已過最後入場、錯字加換照片、首次文字站。
- tests/agent-docs.test.js 保留原斷言，再限定段落驗固定條件→三問順序、條件→層級→必要動作；變異測試刻意後移固定段、刪照片條件、刪混合規則、把不確定改直接 ship，確認驗證器能拒絕。
- 這是文件契約測試，不宣稱它能證明任意模型／agent 一定遵守自然語言規則。

## B. 認領的介面与資料流

新增：
- `scripts/adopt-deploy.js`：CLI；嚴格要求 slug，僅支援可選 `--confirm <64位hex查核編號>`。
- `scripts/lib/adopt-deployment.js`：兩段式認領與本機原子寫入。
- `tests/adopt-deploy.test.js`：所有 wrangler 皆為替身。

修改：
- `scripts/lib/deployment-state.js`：抽共用 accountInfo／部署列表解析，提供 inspectWorker；認領紀錄可暫無網址。
- `package.json`：`adopt-deploy` script；沒有加 ship 旗標，也沒有 force。
- `tests/ship.test.js`：認領後正常保護與補網址。
- `tests/deployment-docs.test.js`、tp-ship、which-trip、README、how-it-works：人類確認及恢復流程。

### 第一段

`npm run adopt-deploy -- <slug>`

- 先拒絕已有正式紀錄；損壞紀錄也拒絕，不當成不存在。
- 不 build，不載入行程 JS；CLI 只讀 trip.config.json 取得目標，保留 repo 內撞名檢查。
- 用 OS 暫存目錄的最小 wrangler.json 指定名稱，不讓工作目錄的隱含 wrangler 設定改變帳號。
- 唯讀 whoami --json、deployments list --name X --json；選定帳號 ID 明確傳遞給後續查詢。
- 印帳號名稱／ID、Worker 名稱、最後部署時間、版本 ID；也保留 deployment ID 作第二次比對。
- 網址未知就明說，不用佔位符、不說「這個網址」。
- 產生 crypto.randomBytes 的隨機查核編號，寫入 `.local/deployments/pending/<slug>.json`；**不建立正式紀錄**。
- 回傳 awaiting-confirmation 狀態，CLI 成功退出只表示查核完成，不代表已認領。

### 第二段

人明確確認歸屬後才跑：
`npm run adopt-deploy -- <slug> --confirm <查核編號>`

- 正式紀錄存在／損壞：拒絕。沒有 pending／編號錯／收據損壞：拒絕。
- 再做 whoami + deployments list，精確比對本機 pending 中的 slug、target、帳號名稱／ID、Worker、部署 ID／時間／版本。
- 任何變更都令舊收據失效，必須重新查核並請人確認；不是只憑上次結果落盤。
- 完整 JSON 先寫同目錄暫存檔，使用 linkSync 排他發布，EEXIST 不覆蓋；測試包含最後一刻出現既有紀錄的競態。
- 成功後清除 pending；即使清除失敗，已有正式紀錄也會阻止重用。
- 只写本機，不 deploy、不建立或刪除任何遠端資源。

### 正式紀錄與 ship 接回

格式仍是本機紀錄 schemaVersion 1；不是行程資料 schema 的變更。

```json
{
  "schemaVersion": 1,
  "slug": "trip-a",
  "target": "workers",
  "name": "trip-a",
  "accountId": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "url": null,
  "versionId": "11111111-1111-1111-1111-111111111111",
  "adoption": {
    "deploymentId": "deployment-1",
    "createdOn": "2026-09-21T00:00:00.000Z"
  }
}
```

- 只有完整 Workers 認領紀錄可 url=null；普通或不完整紀錄仍拒絕空網址。
- ship 仍核對帳號、名稱、slug、最新單一 100% 版本；認領不是豁免。
- 未取得網址就印未知，不印 `null`。
- 正常 ship 成功後保存真實 URL／新版本，並回到既有一般紀錄格式（移除 adoption）。

## 安全邊界與未驗證項目

- Cloudflare API 不證明網站屬於這趟行程；人判斷歸屬。查核編號只是本機 snapshot 關聯，不是簽章、人類身分驗證或同意證明。
- agent 規則要求先取得唯讀查核同意，再原樣列事實與提問，等明確歸屬確認後才 confirm。不能把兩次指令連跑代替等待。
- pending／正式紀錄都在既有 gitignore 目錄，不進 git／網站。不保存 whoami.email、token、登入憑證或原始輸出；pending 需要帳號顯示名稱供人核對（名稱本身可能含使用者的 email 字樣）。
- 多帳號未指定、未登入、權限／網路錯誤、空列表、不明格式、混合流量或無法辨識版本時，均停止。
- 僅支援 Workers，不新增 Pages 認領或 Pages 遠端防撞。
- 本機排他發布不等於 Cloudflare 原子鎖；第二次查核後遠端仍可能變動，下一次 ship 會再查版本。
- **没有執行真實 adopt-deploy、wrangler 或部署。example-trip 端到端驗證仍待使用者授權。**
- 本輪沒有更新 status.md、備份 commit+push 流程、noindex 措辭或錯誤訊息去識別化。

## C. wrangler 固定版本

- package 仍固定 4.135.0，沒有再升版。
- CHANGELOG 補記 9ad6658 的決策：程式依賴 JSON 形狀、錯誤碼及 stdout URL／版本。
- README 技術細節明列代價：不會自動取得 wrangler 安全更新，維護者要主動追蹤。
- 升級前須核對真實介面／fixtures，跑 ship、adopt、部署文件、deploy-names 測試及 npm test。替身測試單獨不能證明新 wrangler 的線上相容性。

## TDD 與驗證紀錄

- 起點 9ad6658：既有 284 個測試。
- 閘門二 RED：9 個預期失敗；修復後完整 291/291 通過。
- 認領 RED：26 個預期失敗（缺 API／CLI，以及原 ship 拒絕空網址認領紀錄）；修復後 targeted 63/63。
- 認領邊界／文件 RED：4 個預期失敗（錯型別名稱、npm script、兩個文件契約），修復後階段完整 323/323。
- 額外格式 RED：2 個預期失敗（非字串部署時間、缺 deploy 設定），修復後 targeted 68/68。
- wrangler 文件 RED：2 個預期失敗，修復後通過。
- 額外變異 RED：刪除固定清單的照片條件原本未被驗證器擋住，先觀察 metatest 失敗，再加固定清單精確檢查。
- 最終完整 npm test：**327/327 通過**（見最終提交後的回報）；無刪斷言、無放寬行程 schema。
- 全套測試在隔離副本执行：現有測試會建立 trips/ 測試 fixtures，因此沒有在工作目錄直接跑。只複製 _example，wrangler 全用替身。
- npm run sync:agent-assets 已執行，生成 AGENTS.md／CLAUDE.md 與四套工具 skills；不手改產物。
- 未動工作目錄 trips/，沒有部署／push／fork／PR。

## 建議 reviewer 特別檢查

1. 固定條件是否確實先於三問，測試是否能拒絕條件被刪除或後移。
2. adopted-without-url 是否只適用完整認領紀錄，且 ship 沒有認領專用 bypass。
3. 同版本但 deployment ID 或部署時間改變，confirm 是否拒絕。
4. 正式檔案的 no-clobber 原子發布、重用收據、查核後本機紀錄競態。
5. 缺紀錄和壞紀錄是否分開處理；錯誤回應是否一直 fail closed。
6. 所有外部 wrangler 呼叫是否可替換，認領路徑是否只有 whoami／deployments list。
7. 人類同意只靠 agent 規則，不能把 receipt 誤描述成可機器驗證的所有權。

可在隔離副本跑 `npm test`，或聚焦：
`node --test tests/agent-docs.test.js tests/adopt-deploy.test.js tests/ship.test.js tests/deployment-docs.test.js`。
不要把 review 測試延伸成對真實 Cloudflare 的部署或認領。
