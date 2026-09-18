# 改資料前先讀 schema 文件

**什麼時候適用：** 你要修改 `trips/<slug>/` 底下任何一個資料檔之前。

## 規則

**不要憑印象填欄位。** 每個資料檔都有一份對應的欄位文件，裡面有必填／選填、型別、
範例，以及 `npm run check` 會吐出什麼錯誤訊息。

| 你要改的檔案 | 先讀 |
|---|---|
| `trip.config.json` | `docs/schema/trip-config.md` |
| `data.js` | `docs/schema/data.md` |
| `details.js` | `docs/schema/details.md` |
| `dining.js` | `docs/schema/dining.md` |
| `map-lists.js` | `docs/schema/map-lists.md` |
| `photos.json` | `docs/schema/photos.md` |

這份 rule 刻意**不重複**欄位表——重複就會脫節。以 `docs/schema/` 為準。

## 改完一定要跑

```
npm run check -- <slug>
```

`check` 的錯誤訊息就是你的待辦清單。**不要為了讓它過而刪掉資料或放寬規則**——
那些規則存在的原因是它們對應到頁面上真的會出錯的地方（座標畫到海裡、
燈箱點開是空的、地圖清單少一個點）。
