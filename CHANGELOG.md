# 變更紀錄

## 1.1.0（2026-09-21）

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
