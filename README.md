# travel-planner

把一份粗略的旅程初稿，變成一個能在手機上用的互動行程網頁——有地形圖、逐段交通、餐食與備案、行前清單——然後放到你自己的免費 Cloudflare 帳號上。

**你不需要懂程式。** 複製下面那段話貼給你的 AI 助手，剩下它會處理。

**先看看做出來會長什麼樣** → **[示範站：山寺・銀山・松島（三天兩夜）](https://example-trip.wangch2215.workers.dev)**

用手機開最準——這個東西就是做給人在旅途中用手機看的。

| 全程總覽 | 逐段交通 | 地點燈箱 | 行前清單 |
|---|---|---|---|
| <img src="docs/screenshots/overview.png" alt="總覽頁：地形底圖標出每個停留點，下面是住宿色條" width="200"> | <img src="docs/screenshots/day.png" alt="某一天的詳細行程：每段交通的距離、車程與建議預留時間，停留點附停車場資訊" width="200"> | <img src="docs/screenshots/lightbox.png" alt="點地點名稱打開的燈箱：授權合法的照片、看點、參拜時間與入山費" width="200"> | <img src="docs/screenshots/checklist.png" alt="行前清單：待確認事項的勾選清單，狀態只存在這台裝置" width="200"> |
| 地形底圖、每個停留點、住幾晚 | 距離、車程、**建議預留**、停車場 | 照片與授權、看點、實用資訊 | 待確認事項，勾選只存在你的裝置 |

（示範站是一份去識別化的範例資料，住宿是虛構名稱。）

---

## 開始：複製這段貼給你的 AI

點程式碼框右上角的複製按鈕，整段貼給你的 AI 助手：

```text
我想做一個旅程網頁。請用這個公開模板：
https://github.com/wangch15/travel-planner

我的環境已經準備好了（Node、git、gh 都裝好，GitHub 也登入了）。
我不懂程式，所以接下來也請你全部幫我處理。

請照 tp-setup 這個 skill 的步驟做，從頭開始。
取得專案那一步：clone 這個公開模板，然後幫我開一個**私有** repo 當 origin。
模板是公開的沒關係，但我的行程資料要放在我自己的私有 repo 裡。
不要用 fork——公開 repo 的 fork 一定是公開的，改不了。
拿到專案之後先讀裡面的 AGENTS.md。

需要我本人操作的步驟（在瀏覽器上按同意授權、註冊 Cloudflare 帳號），
請停下來用白話告訴我該點哪裡，等我做完再繼續。

如果你抓不下來、看不到內容、或任何一步卡住了，
直接告訴我卡在哪裡、要我做什麼，不要自己猜或跳過。
```

**就這樣。** 接下來 AI 會問你行程的事（想去哪、幾天、幾個人、有沒有訂房），你用講的回答就好。

> **還沒準備好環境？**（沒裝過 Node、git，或還沒辦 GitHub 帳號）
> 回頭跟給你這個連結的人要「前置準備」那段，那裡有一段 prompt 會帶你把環境一次弄好。
>
> **Cloudflare 帳號現在不用辦。** 那是最後要讓網站有固定網址時才需要的，
> 在那之前 AI 給你的預覽網址手機就打得開。到時候它會提醒你。

---

## 接下來會發生什麼

AI 會照這個順序帶你走，每一步都會跟你確認：

| 階段 | 它做什麼 | 你做什麼 |
|---|---|---|
| **準備環境** | 裝工具、下載專案、接上你的 GitHub | 註冊帳號、在瀏覽器按授權 |
| **聊行程** | 問你想去哪、住哪、怎麼移動，整理成逐日草案 | 用講的回答；**看過草案點頭** |
| **查資料** | 查景點、路線、停車、餐廳，每一筆都附來源 | 等（這一步最久） |
| **做地圖與照片** | 產生地形底圖、抓授權合法的照片 | 等 |
| **上線前確認** | 給你一個網址，**用手機就打得開** | **打開看過、確認沒問題** |
| **上線** | 部署到你的 Cloudflare 帳號，給你網址 | 註冊 Cloudflare、按授權 |

**有三件事 AI 一定會停下來等你**，不會自己決定：

1. 行程草案要你點頭才會開始查資料
2. 網站要你看過才會上線
3. **任何要花錢或代表你的事**——訂房、訂位、註冊帳號——它只會給你連結，不會替你做

---

### 每階段的保存與備份

AI 在草案確認、研究完成、底圖／照片產出、第一次上線及引擎更新等階段都要保存成果。
每次推送備份前，都會重新確認你的 GitHub repo 是私有的；查不到或不是私有就停止，不送資料出去。
網站上線不等於備份成功。離線、推送失敗或無法核對遠端時，它必須明說：
**「目前只有本機備份，尚未異地備份」**，不能直接說整個階段完成。

## 卡住了怎麼辦

直接把狀況貼給你的 AI 就好。下面是幾個常見的，以及可以怎麼跟它說：

**「AI 說它開不了我的 repo／沒有權限」**

> 請先跑 `gh auth login` 讓我在瀏覽器上授權，然後再試一次。模板本身是公開的，不用登入就抓得到；要登入的是「幫我開一個私有 repo」那一步。

**「AI 把專案 fork 走了，或說我的 repo 是公開的」**

> 請停下來。我的行程資料不能放在公開的 repo。請照 `.ai/rules/repo-ownership.md` 的做法，幫我改成「clone 公開模板 + 我自己的私有 repo」。

**「AI 說我電腦上沒有 git」**

> 請幫我裝 git，告訴我要按什麼。裝完再繼續。

**「AI 說它不能執行指令／沒有終端機權限」**

那個工具不適合做這件事。要用**可以在你電腦上執行指令**的 AI，例如 Claude Code、Codex CLI、Gemini CLI。

**「AI 開始自己亂改東西，或跳過問我」**

> 請停下來。照 AGENTS.md 裡寫的流程走，該問我的地方要問我。

---

## 常見問題

**這個網站別人看得到嗎？**

網站不會被搜尋引擎收錄，但**拿到網址的人就能打開**，不是密碼保護。所以不要把訂單號、門鎖密碼、電話寫進去——AI 也被規定不准把這些放進網頁，那些只放在私人筆記（`docs/`／`_profile.md`），不會進入網站；筆記會保存在你的電腦，commit 並 push 後也會備份到你的私有 GitHub repo。

**要花錢嗎？**

不用。GitHub 與 Cloudflare 的免費方案就夠。

**做好之後想改東西呢？**

跟你的 AI 說就好，例如「第三天的午餐換一家」「加一個景點」。它知道要改哪裡。

**首次上線與固定第三層條件優先**：換照片、改版面結構、地圖或全域設定，都會先請你看過。
**未命中這些例外**，才按影響範圍分純呈現、事實更新或結構性改動；不是看改了幾個字：

- 只改錯字，或只是更新了票價、營業時間這類查得到的事實，而那天照樣走得通
  —— 它自己驗過就直接更新網站，然後告訴你改了什麼、網址是什麼
- 動到天數、地點、順序、地圖、日期，或換到另一區的店（車程會變）
  —— 它會先給你一個網址、請你看過再更新

舉例：更新營業時間之後發現你原訂抵達時已經打烊、超過最後入場，或停留後趕不上末班車／後續預約，
那就**不算小修改**，它會重新安排並請你確認。一次改多樣採最高層級，不確定就先請你看過。

**做完一趟想做第二趟呢？**

不用重新來過，也不會多一個 GitHub 專案——同一份專案裡多一個行程而已。
跟你的 AI 說：

> 我想再規劃一趟新行程，這次要去大阪。請照 `tp-plan` 的步驟來。
> 上次那趟的偏好設定可以沿用（用 `npm run new -- <新名字> --from <上一趟>`），
> 但日期、地區、標題跟網址名稱都要重新問我。

兩趟會各自有一個網址，**可以同時掛在線上**，互不影響。
從第二趟開始，AI 執行行程級指令時都要指定是哪一趟；repo 級指令不帶行程名稱——它會自己處理，你不用管。

**模板有更新的話？**

跟 AI 說「模板有更新，幫我更新一下」。它會先說明變更，再合併引擎更新並保留你的行程內容。
如果資料格式需要升版，`migrate` 可能改寫行程資料檔，也可能留下需要人工處理的項目；更新後仍要驗證並預覽。

---

<details>
<summary><b>技術細節</b>（給想自己動手的人，不看也不影響使用）</summary>

## 需要什麼

- **Node.js 20+**、git、[gh](https://cli.github.com/)
- GitHub 帳號、Cloudflare 免費帳號

## 快速開始

```bash
npm install
npm test                      # 引擎自我檢查，應該全綠
npm run check -- _example     # 驗證附帶的範例行程
npm run preview -- _example   # 開 http://localhost:4173 看實際頁面
```

`trips/_example/` 是一份去識別化的三天兩夜範例：住宿是虛構名稱，沒有航班與聯絡資訊，但資料的形狀跟真實行程一模一樣。**要知道一份行程資料該長什麼樣，先看它。**

## 指令

### 行程級指令

這些指令使用 `<slug>`（行程資料夾名稱）。`new` 與 `adopt-deploy` 必須指定 slug；其餘指令只有一趟自己的行程時可省略，有多趟而沒指定時會報錯並列出可選的。

| 指令 | 做什麼 |
|---|---|
| `npm run new -- <slug>` | 建立一個新行程的骨架 |
| `npm run new -- <slug> --from <舊slug>` | 同上，但沿用舊行程的偏好設定與 `theme.css`（日期、bbox、標題、`deploy.name` 不沿用） |
| `npm run check -- <slug>` | 驗證資料：座標、交通方式、詳細說明、照片授權欄位、清單一致性；不保證實際照片使用許可 |
| `npm run build -- <slug>` | 產出 `dist/<slug>/site/index.html`（單一檔案）與 `wrangler.json` |
| `npm run preview -- <slug>` | build 後在 `localhost:4173` 開一個本機伺服器 |
| `npm run preview -- <slug> --lan` | 同上，但同一個 wifi 的手機也打得開 |
| `npm run preview -- <slug> --tunnel` | 同上，另外產生一個臨時的公開 https 網址（需要 `cloudflared`，不需要 Cloudflare 帳號） |
| `npm run ship -- <slug>` | build 後用 wrangler 部署 |
| `npm run adopt-deploy -- <slug>` | 唯讀列出既有 Worker 事實及查核編號，不認領、不部署 |
| `npm run adopt-deploy -- <slug> --confirm <查核編號>` | 人確認歸屬後重新查核，相符才建立本機紀錄；不部署 |
| `npm run basemap -- <slug>` | 從 OpenStreetMap 與公開高程資料產生地形底圖 |
| `npm run photos -- <slug>` | 依 `photos.json` 把照片抓進行程資料夾 |
| `npm run migrate -- <slug>` | 引擎更新後，把舊格式的資料升版 |

### Repo 級指令

這些指令不吃行程 slug；各自的選項如下，不要把行程名稱套上去。

| 指令 | 做什麼 |
|---|---|
| `npm run trips` | 列出所有行程、資料是否通過驗證、各自的部署網址（`--all` 連內建範例一起列） |
| `npm run update-check` | 比對上游，回報引擎落後幾版、哪幾版需要 `migrate`。**只回報，不會自己更新** |
| `npm run contrib-check` | 檢查完整新增歷史的禁止路徑；可用 `npm run contrib-check -- <base>` 指定比較基準，預設 `upstream/main` |
| `npm run sync:agent-assets` | 改過 `.ai/` 之後，重新產生 `AGENTS.md`、`CLAUDE.md` 與工具用 skills |
| `npm test` | 引擎自己的測試 |

## 部署檢查與本機紀錄

`ship` 第一次跑之前要先 `npx wrangler login`（會開瀏覽器授權）。
每個行程的 `deploy.name` 必須不一樣，否則後部署的會把先部署的線上內容換掉而網址不變。
`check` 與 `ship` 兩道都會擋（跨行程比對，含內建的 `_example`）。

Workers 的 `ship` 另外會唯讀查核帳號與遠端部署：同名 Worker 已存在、卻不符合這一趟
上次成功的本機紀錄時會停止，防止同帳號跨 repo 覆蓋。未登入、網路或權限問題也停止。
成功後，實際網址與版本存在 `.local/deployments/<slug>.json`（gitignore，不進 git 或網站，不存登入憑證）。
首次部署前網址尚未知；後續顯示上次成功的真實網址，不猜帳號子網域。
換電腦、紀錄遺失或升級前的既有網站，會因沒有紀錄而被擋，但可以走獨立的 `adopt-deploy`。
AI 先詢問是否同意唯讀查核，再把帳號名稱／ID、Worker 名稱、最後部署時間與版本列給你看；
**使用者確認那是這趟網站後**，才用查核編號重新查核並建立紀錄。中間事實變了就重新確認。
認領不部署，網址先留空，下一次成功 ship 才補上。已有合法紀錄不能覆蓋，損壞紀錄也不自動忽略；
沒有自動認領或 force 功能，查核編號不是人已同意的證明。
**Pages 不提供這道 Worker 遠端防撞保護**，只保存成功網址。這也不是防止同時部署的遠端原子鎖。

### Wrangler 版本維護

wrangler 固定為 **4.135.0**（不是浮動版本）：ship／adopt 解析它的 JSON 形狀、錯誤碼及 stdout 網址／版本。
因此使用者**不會自動取得 wrangler 的安全更新**；模板維護者需主動追蹤安全修補，核對相容性後升版。

**更新 wrangler 前**先核對新版本的輸出格式，必要時更新替身 fixtures，並重跑以下 ship／adopt 相關測試與全套測試：

```bash
node --test tests/ship.test.js tests/adopt-deploy.test.js tests/deployment-docs.test.js tests/deploy-names.test.js
npm test
```

**替身測試不能單獨證明新版本與 Cloudflare 實際輸出相容**；還需要介面查核。
真實部署或認領驗證須另取得使用者授權，不能為了升版測試自行操作線上網站。

## 這個專案是怎麼運作的

一個公開模板扇出成很多份私有複本，中間只有一條單向的 `git merge`。
每個使用者擁有自己的行程內容，沒有人的資料會流向任何人。

→ **[完整機制說明：`docs/how-it-works.md`](docs/how-it-works.md)**——
repo 與分支怎麼長、「進 git」與「進產物」差在哪、引擎更新怎麼流過去、
怎麼把改進回饋回模板。

## 目錄結構：引擎與內容的邊界

這個 repo 有一條硬邊界，**merge 不衝突全靠它**：

```
travel-planner/
├── src/         引擎前端：頁面外殼、樣式、render、互動
├── scripts/     引擎指令：check、build、preview、ship、new、migrate、photos
├── tools/       底圖產生（純 Node）
├── .ai/         agent 文件的唯一來源 → AGENTS.md / CLAUDE.md
├── docs/schema/ 六個資料檔的欄位文件 ← 改資料前先讀這裡
├── public/      _headers 與 robots.txt
└── trips/
    ├── _profile.md   跨行程不變的條件（同行的人、飲食、節奏偏好），不會進網站
    ├── _example/     模板附的範例行程
    └── <你的行程>/
        ├── trip.config.json     標題、日期、範圍、人數、部署設定
        ├── data.js              地點、每天的行程、住宿、行前清單
        ├── details.js           每個地點的詳細說明
        ├── dining.js            餐飲規劃
        ├── map-lists.js         Google Maps 每日清單（選用，預設關閉）
        ├── photos.json          照片來源與授權
        ├── theme.css            插槽：覆寫配色
        ├── extra.js             插槽：自訂區塊
        └── docs/                你的筆記，不會進入網站
```

- **引擎是模板作者維護的**，`git merge upstream/main` 會更新它。
- **`trips/<你的行程>/` 是你的**，作者永遠不會碰。
- 兩邊的檔案集合不相交，所以更新引擎不會跟你的行程資料衝突。
- 想改外觀先試 `theme.css`，想加區塊先試 `extra.js`。真的改了引擎，記得在 `trips/<slug>/docs/engine-changes.md` 寫下來。

## 隱私

- 網站帶 `noindex` 與 `robots.txt` 的 `Disallow: /`，不會被搜尋引擎收錄；但**拿到網址的人就能打開**，不是密碼保護。
- 飲食限制、訂位資訊、門鎖密碼、聯絡方式這類東西只放 `trips/<slug>/docs/`，那個資料夾不會進入網站產物（有測試把關）。
- `sections` 關閉只停用區塊顯示與對應檢查；build 仍會把全部資料物件內嵌進 HTML，**不是隱私保護**。不顯示的欄位也不能放私人資訊。
- 勾選清單的狀態只存在瀏覽器的 localStorage，不會同步、不會上傳。

## 授權與資料來源

地圖使用 OpenStreetMap 圖資（© OpenStreetMap 貢獻者，ODbL）與公開高程資料（日本為国土地理院，其他地區為 Terrain Tiles）。照片只收已核對條款的 CC／Public domain 授權，或官網照片有明確再利用許可的情況；署名不是授權，許可不明就不用。`npm run check` 只驗證授權相關欄位，不保證實際使用許可；AI 必須核對條款並記錄來源與查核日期。

</details>

---

## 回報問題與貢獻改進

**回報問題或提建議** → GitHub issue：[bug 模板](.github/ISSUE_TEMPLATE/bug.md) 或
[功能建議模板](.github/ISSUE_TEMPLATE/feature.md)。不知道怎麼開的話，
直接跟你的 AI 說「幫我回報一個問題」，它會幫你填。

**已經自己修好了，想合併回來** → 開 PR。判準是：**能不能用「現在的行為是錯的」
來描述？**可以就開 PR，只能說「這樣比較好」的話請改開 issue。

推之前一定要跑 `npm run contrib-check`——模板的 fork 一定是公開的，
分支裡夾帶一個 `trips/` 檔案就等於公開你的行程與訂房資訊，而且刪不掉。
完整流程見 [`.ai/rules/contributing-upstream.md`](.ai/rules/contributing-upstream.md)。

---

## 給模板作者

要邀請朋友來用的話，看 [`HELPER.md`](HELPER.md)——裡面有一段可以直接複製、用 LINE 或 email 傳給他們的訊息，涵蓋辦帳號與環境準備。模板是公開的，所以你不用加協作者、不用等他回報帳號，傳連結就可以了。

前置階段刻意不寫在 README，因為 README 是 agent 開始工作時會讀的東西，混在一起會干擾它。

**模板 repo 裡不放任何真實行程**——`trips/` 底下只能有 `_example`。你自己的行程跟朋友一樣，走 clone + 私有 repo 那條路。見 [`.ai/rules/repo-ownership.md`](.ai/rules/repo-ownership.md)。
