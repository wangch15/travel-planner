# 變更紀錄

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
