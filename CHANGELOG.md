# 變更紀錄

## 0.3.0（2026-09-18）

- 新增 `npm run photos -- <slug>`：把 `photos.json` 列的 Commons 與官網照片抓進 `trips/<slug>/photos/`，預設只補缺的，`--force` 全部重抓；單張失敗只記錄原因，不中斷整批。
- 地圖動線改為逐段繪製，線型依 `leg.mode`：自駕實線、大眾運輸虛線、步行點線、渡輪點劃線。
- 有 `parking` 的停留點會在每天的頁尾彙整成一張表，含費用、注意事項與導航到停車場的連結；沒有停車資料的日子不會出現空區塊。
- `trips/_example` 附三張 CC BY-SA 授權的實際照片。
- 資料需要 migrate：否。

尚未實作：agent skills 與 `.ai/`。

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
