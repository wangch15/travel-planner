# 變更紀錄

## 1.1.4（2026-09-24）

- **電腦上用滑鼠滾輪捲過地圖，不再被地圖搶走。** 原本滾輪經過地圖就會縮放，頁面捲不下去；現在一般滾動是捲動頁面，
  按住 Shift 再滾動（或觸控板雙指縮放）才縮放地圖，並在地圖上短暫提示。放大檢視的地圖視窗裡照舊直接縮放；手機雙指縮放不變。
- 資料需要 migrate：否。

## 1.1.3（2026-09-24）

- **新的 Cloudflare 帳號第一次部署：講清楚要先設定 workers.dev 網址名稱。** 原本只顯示「部署失敗（退出碼 1）」並要人查核遠端；現在辨識這個情況，說明到 Cloudflare 網頁「Workers 和 Pages」設定一次即可，並標明這次沒有上線任何內容、不寫部署紀錄。
- 資料需要 migrate：否。

## 1.1.2（2026-09-24）

- **切換分頁後回到頁首。** 手機上從總覽捲到下方再點 Day 分頁（或總覽裡的某一天），原本會停在同一個捲動位置；現在會回到最上方。
- 資料需要 migrate：否。

## 1.1.1（2026-09-24）

- **手機版全程總覽的卡片排版優化。** 加點建議改成標題與日期同一列（日期靠右），說明與約需時間在下方；
  逐日主軸縮小卡片間距，標題不再內縮，住宿行改小字。只在 639px 以下生效，桌面表格不變。
- 資料需要 migrate：否。

## 1.1.0（2026-09-21）

- **修正 PUBLIC 貢獻流程被 hook 封死。** 現在 PUBLIC 逐 ref 查核 remote-sha..local-sha 的完整新增歷史，
  與 contrib-check 共用政策；乾淨引擎歷史放行，私人路徑列出 path／commit 後拒絕。新分支必須有可信基準，
  缺物件、shallow 或無法判斷就拒絕，多 ref 任一不乾淨整批拒絕。沒有 fork／remote 名稱白名單。
  PRIVATE 不掃歷史；INTERNAL、未知與查核錯誤仍拒絕。刪除仍查目的地，但不掃不存在的新增歷史。
  `--fork-name` 的 fork → push → PR 仍未端到端驗證。

- **新增 pre-push 最後一道目的地檢查。** npm install 的 prepare 設定 repo-local `core.hooksPath` 指向 `.githooks`，
  不覆蓋已有其他設定；非 Git 環境靜默跳過。hook 只認 Git 傳入的實際 URL，除模板目錄條件例外外，
  每次查核目的地可見度，包含 README-only 與刪除分支；未登入、格式錯誤或 10 秒逾時都拒絕。
  初版曾一律擋公開 contrib fork；已由上述 PUBLIC 歷史查核修正，不能把本機通過當成人類授權。
  原本 agent 規則保留作第一道；`--no-verify`、未安裝或不執行 Git hooks 的工具仍能繞過，不是萬無一失。

- **補記 wrangler 固定版本的理由與代價（9ad6658）。** 從 `^4.133.0` 固定為 `4.135.0`，
  因為部署保護解析 CLI 的 JSON 形狀、錯誤碼及 stdout 網址／版本；未核對的更新可能破壞安全判斷。
  代價是使用者**不會自動取得 wrangler 的安全更新**。模板維護者需主動追蹤修補，
  更新前核對新輸出、調整替身 fixtures，再跑 ship／adopt 相關測試及全套測試；不能只改版本號。
- **修正閘門二的例外優先序。** 固定第三層先判斷，再進入三問；補最後入場、停留時間、
  末班車與後續預約銜接，明示可行性清單不完整。守門測試增加條件→動作案例與變異檢查。
- **新增獨立 `adopt-deploy` 兩段式認領。** 修復既有網站沒有本機紀錄就無法部署的升級阻斷：
  先唯讀列事實，等人確認，再以查核編號重新查核。事實變更即失效，不覆蓋既有紀錄；
  網址留空，下一次正常 ship 才補上，不新增 force 或自動認領。真實 Cloudflare 端到端驗證尚待授權。

- **分享模式改為「公開模板 + 使用者私有複本」。** 取得專案的方式從 `gh repo fork`
  改成 clone 公開模板再用 `gh repo create --private` 開一份自己的私有 repo。
  公開 repo 的 fork 一定是公開的（GitHub 不允許改成私有），而 `trips/<slug>/docs/`
  裡有訂房資訊與私人筆記，所以不能用 fork。使用者對模板沒有寫入權，
  誤把行程推進模板在物理上就不可能。
- **`npm run preview` 新增 `--lan` 與 `--tunnel`。** 原本只綁 `127.0.0.1`，
  等於使用者在確認階段看不到這個頁面真正要用的樣子（手機）。`--lan` 讓同一個
  wifi 的手機打得開；`--tunnel` 用 `cloudflared` 產生臨時公開網址，不需要
  Cloudflare 帳號，沒裝時會印出安裝方式而不是靜默失敗。
- **閘門二縮小範圍。** 第一次上線與結構性變更仍要人看過；改文字、換一家餐廳
  這類小修改由 agent 跑完 `check` 直接 ship，但必須回報改了什麼與網址。
- **新增 `npm run trips`。** 列出所有行程、資料驗證結果與部署網址。
  有兩趟以上時每個指令都要帶 slug，帶錯的話 `ship` 會無聲覆蓋另一趟的線上網站；
  `ship` 現在也會在部署前印出即將覆蓋的網址。
- **新增 `npm run new -- <slug> --from <舊slug>`。** 沿用上一趟的偏好欄位與
  `theme.css`，但不沿用日期、bbox、標題與 `deploy.name`。
- **新增 `trips/_profile.md`。** 跨行程不變的條件（同行的人、體力、飲食限制、
  節奏偏好），`tp-plan` 先讀它，第二趟起只問這趟特有的。不進 build 產物。
- **`--lan` 換網路後會重印新網址。** 區網位址只在啟動時印一次的話，使用者換了
  wifi（或 VPN 連上、斷開）之後手上那個網址就默默失效，而畫面上還留著舊的——
  他只會覺得是頁面壞了。現在每三秒重掃，變了就印一行警告加新網址。
- **`npm run trips` 在模板 repo 裡不再叫人開行程。** 空的 `trips/` 原本一律回
  「先跑 npm run new」，但 origin 是模板本身的時候那正是硬規則禁止的事。現在會
  分辨 origin，並把 `repo-ownership` 的兩種情況攤開來讓 agent 判斷。
- **新增 `docs/how-it-works.md`。** 一個公開模板怎麼扇出成很多份私有複本、
  分岔為什麼發生在 repo 層級而不是 branch 層級、「進 git」與「進產物」差在哪、
  引擎更新怎麼流過去。README 從技術細節那一節連過去，不占開頭篇幅。
- **新增 `npm run update-check`。** 比對上游，回報落後幾版、每一版改了什麼、
  哪幾版需要 `migrate`。使用者的複本原本沒有任何東西會通知他引擎更新了，
  只有 AGENTS.md 裡一句「跑 git log 看看」。**它只回報，不會自己更新**——
  要不要更新是人的決定。模板作者本人（origin 就是上游、沒有 upstream）
  不會被誤報成「remote 沒設好」。
- **新增回饋管道：`npm run contrib-check`、`.ai/rules/contributing-upstream.md`
  與 PR 模板。** 判準是「能不能用『現在的行為是錯的』來描述」——可以就開 PR，
  只能說「這樣比較好」的就開 issue。`contrib-check` 是那道安全閘門：模板的
  fork 一定是公開的，分支裡夾帶一個 `trips/` 檔案就等於公開使用者的訂房資訊，
  而且 git 歷史刪不掉。
- **修正：`deploy.name` 撞名根本沒有被擋。** README 寫著「`check` 會擋」，
  但 `check` 只載入一趟，`schema` 只驗名稱格式，沒有任何地方做跨行程比對。
  兩趟共用同一個名字的話，後部署的會把先部署的線上網站整個換掉而網址不變——
  已經傳給家人的連結還在，打開卻是另一趟。現在 `check` 與 `ship` 兩道都擋，
  比對含內建的 `_example`（示範站也部署得出去）。撞名在資料驗證之前就先報，
  資料還沒填完的行程也看得到。
- **新增 `.ai/rules/which-trip.md`：有多趟時不准猜是哪一趟。** 指令那一層本來
  就安全（沒帶 slug 會報錯），但**檔案編輯不經過任何指令**——agent 可以直接改
  某一趟的 `dining.js`，改完跑同一個猜錯的 slug 去 `check` 還會過（前後一致地錯），
  然後 `ship` 把另一趟已上線的網站換掉。規則給出判斷順序與怎麼把候選唸給使用者選。
- **`npm run trips` 加上「最後更新」**（最後一個碰到那個資料夾的 commit），
  讓「我上次在弄的那個」有答案而不用猜；多趟時的 footer 改成明講要問使用者。
- **閘門二改用影響範圍分層，取代「改了什麼東西」的分類。** 原本的表格把
  「換一家餐廳」無條件列為免確認——但新餐廳在城市另一頭的話，那天的車程、
  抵達時間與停車全部作廢，而規則授權 agent 直接上線。現在依序問三個問題：
  有沒有動到人會照著走的資訊 → 那天的路線與可行性有沒有變 → 不確定就當結構性。
  另給出「走不走得通」的四條升級判準（移動時間變了、抵達落在營業時間外、
  多出預約等前提、順序或過夜地點變了），混合改動採最高層級。
- **修正：貢獻流程的 fork 指令帶了 `gh` 不接受的旗標。** 文件寫的
  `gh repo fork ... --remote=false` 會直接被拒絕（`the --remote flag is
  unsupported when a repository argument is provided`），也就是每個想貢獻的
  人第一行就卡住。拿掉該旗標，並註明帶 repo 參數時 `gh` 不動 remote，
  所以 `git remote add contrib` 要自己補。
- **貢獻流程的驗證範圍改成實測結果。** `contrib-check` → pre-push hook →
  `git push`（新分支）→ `gh pr create` → PR 模板整段已在真實 GitHub 跑通。
  仍未驗的是 `gh repo fork` 與跨帳號 push，**原因是 GitHub 的硬限制**：
  同一個帳號不能同時擁有 parent 與 fork，所以模板作者永遠 fork 不了自己的 repo，
  要驗必須有第二個帳號。文件寫明這一點，免得下一輪又有人試著去驗。
- **`tp-plan` 分清楚「這趟特有」與「永久改變」。** `_profile.md` 整個 repo 只有
  一份、所有行程共用，但原本只寫「只改真的變了的部分」。使用者說「這次只有兩個人去」
  時，agent 可能去改共用 profile 的人數，下一趟就用錯的前提開始問。補上對照表與
  判準（下一趟還會是這樣嗎），並明講這趟特有的差異寫進那趟的 `trip.config.json`、
  `_profile.md` 一個字都不要動。
- **`--from` 講明帶過來的是複本不是連動。** 每趟有自己的 `trip.config.json`，
  改新行程不影響舊行程；但每一項仍要跟使用者核對，不能當成已確認的事實。
- **修正：`deploy.target: "pages"` 的第二次部署會發佈未編譯的模板。**
  `wrangler pages deploy` 會在 cwd 產生 `wrangler.jsonc`（`assets.directory: "src"`），
  那個檔案一存在，之後每次 Pages 部署都改去發佈 `src/`，而 `ship` 仍回報成功
  （實測第二次部署產出 6 KB 的 `<title>/*__TITLE__*/</title>`）。改成以產出目錄
  為 cwd——`dist/` 整個 gitignore，產生的設定無害。`wrangler.jsonc` 與
  `wrangler.toml` 也加進 `.gitignore`。
- **修正：Pages 的部署網址驗證對不上現在的 Cloudflare。** Pages 已併進 Workers，
  `wrangler pages deploy` 回的是 `<name>.<帳號>.workers.dev` 而不是
  `<name>.pages.dev`，所以每次都停在「無法辨識唯一的真實網址」、本機部署紀錄
  永遠寫不進去，認領與防撞保護跟著失效。現在兩種形式都接受。
- **`deploy.target: "pages"` 標為過時**，附遷移步驟。特別講明舊的
  `<name>.pages.dev` 是獨立的 Pages 專案，不會跟著更新，遷移後線上會有兩份；
  刪掉舊專案是使用者自己去 Cloudflare 做的事，agent 不代刪。
- **`tp-setup` 的名稱衝突改建議中立名稱。** 原本建議 `travel-planner-2`，
  看不出是什麼；改成 `my-trips` 這類不含目的地的名稱，並說明模板作者本人
  一定會撞到這一條、那不是走錯路。
- **`tp-setup` 補上多帳號的 git 憑證陷阱**：`gh auth switch` 不換 git 憑證，
  切換後 push 會回 `Repository not found`，要補跑 `gh auth setup-git`。
- **`stage-backup.md` 講明 force 是規則層的禁止，`pre-push` hook 不會擋它**，
  免得有人因為 hook 放行就以為 force 是允許的。
- **新增 `npm run unship -- <slug>`：旅程結束後把公開網站下線。** 原本完全沒有
  這條路——`grep` 遍整個 repo 找不到任何下線、刪除網站或取消部署的說明。
  那個網址拿到的人就打得開，內容是每天住哪、幾號到幾號不在家；旅程結束之後
  資料的價值歸零但風險不變，而沒有人告訴使用者這件事可以關、也沒說怎麼關。
  **只移除 Cloudflare 上那份公開 HTML**，`trips/<slug>/` 的資料、照片、`docs/`
  筆記與私有 repo 完全不動，之後 `ship` 就能重新上線。兩段式確認（同
  `adopt-deploy`）：第一段唯讀，印出即將失效的網址與不會被刪的東西；agent
  不得自行決定，要人明確點頭。沒有本機部署紀錄會被擋（先 `adopt-deploy`），
  `pages` 目標不支援。**刪完會再查一次遠端**確認 Worker 真的不存在——
  wrangler 的退出碼不夠可信；還在就誠實回報沒刪成功並保留紀錄，不謊報下線。
  `tp-ship` 也要求在**第一次部署時就告知這件事可以關**，不要等使用者想起來。
- **修正：`update-check` 只比版本號，會謊報「已經是最新」。** 實測一份落後
  2 個 commit 的複本，因為兩邊 `package.json` 都是 `1.1.0`，它回報「引擎已經
  是最新的」。這個專案把改動併進未 tag 的版本，所以**每個同版本的使用者都會
  被告知自己最新，卻少了幾十個 commit**。現在同時比 `git rev-list --count`：
  落後就講落後幾個；算不出來（淺複製、缺物件）就明說「無法確認」並給出自己
  查的指令，**不再把未知當成最新**。
- **修正：取得專案的流程會留下一個追蹤公開模板的 `main`。** `git clone` 模板再
  `git remote rename origin upstream` 之後，`main` 追蹤的是 `upstream/main`。
  用 CLI 明確指定 `git push origin` 的人不會發現；**用 GitHub Desktop 這類 GUI
  的人一按 Push，預設目標就是公開模板**——pre-push hook 會擋，但看到的是一個
  看不懂的錯誤。實測時模板作者本人就踩到了。`tp-setup` 與 `tp-update` 的救援
  路徑都補上 `git branch -u origin/main main`。
- **pre-push hook 的訊息補上最可能的原因。** 推向模板被擋時先提示「分支追蹤的是
  upstream 而不是 origin」與修法，而不是只叫人去讀 repo-ownership；私有查核
  失敗時提示多帳號要先 `gh auth switch`——GUI 客戶端不會幫你切，而它的錯誤
  訊息只說「認證失敗」。
- 刪除 `HANDOFF.md`：五個實作階段都已完成，內容已與現況不符且會誤導 agent。
- 資料需要 migrate：否。

## 1.0.1（2026-09-18）

- **修正：海域多邊形會淹沒整張地圖。** bbox 邊上「同一條邊進、同一條邊出」的小碎片
  （半島、被邊界切到的島）會讓接環演算法找不到下一段而繞遍整個周界，
  結果整個 bbox 都被填成海色。改成每個環走回自己的起點就閉合，剩下的另起新環。
- `basemap.json` 的 `sea` 由「單一環」改為「環的陣列」（一個 bbox 內可能有數塊不相連的海域）。
  `src/app.js` 相容舊格式，但建議重跑 `npm run basemap -- <slug>`。
- 修正自煮食材預算重複「每人約」前綴。
- 資料需要 migrate：否（但 basemap 建議重新產生）。

## 1.0.0（2026-09-18）

- 加入 `.ai/`：agent 文件的唯一來源，`npm run sync:agent-assets` 同步出 `AGENTS.md` 與 `CLAUDE.md`；`GEMINI.md` 為手寫指路檔（Gemini CLI 目前不讀 AGENTS.md）。
- 八個 skill：tp-setup、tp-plan、tp-research（含六份 reference）、tp-basemap、tp-photos、tp-ship、tp-update、tp-maps-lists。
- 四份 rules：引擎／內容邊界、schema 指路、研究誠信、隱私。
- 加入 bug 與 feature 兩個 issue 模板；feature 模板要求先說明為什麼兩個插槽做不到。
- 新增文件守門測試：確保每個 npm 指令、每個 skill、三道人類閘門都真的寫進文件。
- 資料需要 migrate：否。

## 0.3.0（2026-09-18）

- 新增 `npm run photos -- <slug>`：把 `photos.json` 列的 Commons 與官網照片抓進 `trips/<slug>/photos/`，預設只補缺的，`--force` 全部重抓；單張失敗只記錄原因，不中斷整批。
- 地圖動線改為逐段繪製，線型依 `leg.mode`：自駕實線、大眾運輸虛線、步行點線、渡輪點劃線。
- 有 `parking` 的停留點會在每天的頁尾彙整成一張表，含費用、注意事項與導航到停車場的連結；沒有停車資料的日子不會出現空區塊。
- `trips/_example` 附三張 CC BY-SA 授權的實際照片。
- 資料需要 migrate：否。

## 0.2.0（2026-09-18）

- 新增 `npm run basemap -- <slug>`：純 Node 產生地形底圖，不再需要 Python。
- 海域改用 bbox 周界閉合演算法，任何地區都成立（舊版寫死外海座標，只對日本東岸成立）。
- 等高線層級可自動選擇（在 100／200／250／500／1000 m 中選使層數落在 6–8 的間距），也可在 `trip.config` 明確指定。
- 高程來源：日本用国土地理院，其他地區用 Terrain Tiles；來源標示寫進 `basemap.json` 的 `meta.demCredit`，頁面自動顯示。
- Overpass 與高程圖磚都快取在 `trips/<slug>/.cache/`；Overpass 限流時會換鏡像重試。
- 新增執行期相依套件 `pngjs`（解碼高程圖磚用）。
- `trips/_example` 換上真實底圖，與 SENTAI2026 的比對見 `docs/superpowers/notes/2026-09-18-basemap-parity.md`。
- 資料需要 migrate：否。

## 0.1.0（2026-09-18）

- 引擎骨架：`trips/<slug>/` 內容與引擎分離，指令為 check／build／preview／ship／new／migrate。
- 資料 schema v1：`leg.mode` 支援自駕、大眾運輸、步行、計程車、渡輪；地點可帶 `parking`。
- 版面改由 `trip.config.json` 與 `OVERVIEW` 驅動，天數與住宿數不再寫死。
- 附去識別化範例行程 `trips/_example`。
- 資料需要 migrate：是（schemaVersion 0 → 1，跑 `npm run migrate -- <slug>`）。
