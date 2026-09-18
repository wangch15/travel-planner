# `trip.config.json`

## 這個檔負責什麼

一趟行程的全域設定：標題、日期、地理範圍、交通方式、人數、要開哪些區塊、部署到哪裡。
引擎只從這裡讀「引擎需要的欄位」，不要放個人資料（訂房確認信、聯絡方式、家人的飲食限制都屬於 `trips/<slug>/docs/`）。

天數不在這裡設定——它是從 `data.js` 的 `DAYS` 長度推出來的。

## 欄位表

| 欄位 | 必填 | 型別 | 說明 | 範例 |
|---|---|---|---|---|
| `schemaVersion` | ✔ | number | 必須等於引擎的 `SCHEMA_VERSION`（目前是 `1`）。不相符時 `check` 會要你跑 `npm run migrate`。 | `1` |
| `title` | ✔ | string | 進 `<title>` 與 meta。 | `"範例行程手帳"` |
| `heading` | ✘ | string | 頁首 h1；省略時用 `title`。 | `"山寺・銀山・松島"` |
| `subtitle` | ✘ | string | 頁首副標。 | `"三天兩夜　自駕＋電車"` |
| `description` | ✔ | string | meta description 的一句話。 | `"三天兩夜，含地形圖與逐段交通。"` |
| `lang` | ✔ | string | `<html lang>`，同時決定地圖標籤的語言 fallback 鏈。 | `"zh-Hant"` |
| `dates.start` / `dates.end` | ✔ | string | `YYYY-MM-DD`。 | `"2026-10-11"` |
| `region.country` | ✔ | string | ISO 國碼，`basemap.dem: "auto"` 用它決定高程來源。 | `"JP"` |
| `region.bbox` | ✔ | number[4] | `[lngMin, latMin, lngMax, latMax]`。同時給底圖範圍與座標驗證用。 | `[139.95, 37.85, 141.45, 39.0]` |
| `transport` | ✔ | string[] | 這趟用到的交通方式，供 skill 判斷要查什麼。 | `["drive", "transit"]` |
| `party` | ✔ | number | 同行人數，只用來算「N 人約 …」的餐費乘數。 | `2` |
| `currency` | ✔ | string | 金額前綴符號。 | `"¥"` |
| `sections.overview` | ✔ | boolean | 是否渲染總覽分頁。 | `true` |
| `sections.dining` | ✔ | boolean | 開啟時每天至少要有一餐，否則 `check` 會擋。 | `true` |
| `sections.mapLists` | ✔ | boolean | 開啟時每天的 Maps 清單必須涵蓋當天所有地點。 | `false` |
| `sections.checklist` | ✔ | boolean | 開啟且 `CHECKLIST` 為空時 `check` 會擋。 | `true` |
| `theme.accent` | ✔ | string | 主色，hex。更細的調整用 `theme.css`。 | `"#B0552D"` |
| `theme.favicon` | ✔ | string | 一個 emoji，build 時轉成 SVG favicon。 | `"🗾"` |
| `basemap.dem` | ✔ | string | `auto`（JP → 国土地理院，其他 → Terrarium）、`gsi`、`terrarium`。 | `"auto"` |
| `basemap.detail` | ✔ | string | `low` \| `normal` \| `high`，控制簡化容差。 | `"normal"` |
| `basemap.contourLevels` | ✔ | number \| null | `null` 時自動選層級。 | `null` |
| `deploy.name` | ✔ | string | Worker 或 Pages 專案名稱，也是 localStorage 的前綴。 | `"example-trip"` |
| `deploy.target` | ✔ | string | `workers`（預設）或 `pages`。 | `"workers"` |

## 完整範例

```json
{
  "schemaVersion": 1,
  "title": "範例行程手帳",
  "heading": "山寺・銀山・松島",
  "subtitle": "三天兩夜　自駕＋電車",
  "description": "travel-planner 的去識別化範例行程。",
  "lang": "zh-Hant",
  "dates": { "start": "2026-10-11", "end": "2026-10-13" },
  "region": { "country": "JP", "bbox": [139.95, 37.85, 141.45, 39.0] },
  "transport": ["drive", "transit"],
  "party": 2,
  "currency": "¥",
  "sections": { "overview": true, "dining": true, "mapLists": false, "checklist": true },
  "theme": { "accent": "#B0552D", "favicon": "🗾" },
  "basemap": { "dem": "auto", "detail": "normal", "contourLevels": null },
  "deploy": { "name": "example-trip", "target": "workers" }
}
```

## 常見錯誤

- `trip.config.schemaVersion 是 0，引擎需要 1：跑 npm run migrate -- <slug>`
  舊格式的資料。跑 migrate，然後把它回報的人工待辦做完。
- `PLACES.xxx 座標超出 region.bbox`
  bbox 太小，或座標查錯了。先確認座標，再考慮放大 bbox。
- `basemap 的 bbox 與 trip.config 不符：…；重跑 npm run basemap`
  改過 bbox 但沒重新產底圖。
