---
name: tp-research
description: 把確認過的逐日草案查核成五個資料檔。閘門一通過之後、要開始填地點餐廳路線資料時用。
---

# tp-research

## 什麼時候用

`docs/plan.md` **已經被使用者確認**之後（見 `tp-plan` 的閘門一）。
確認之前不要開始，行程順序一改，查好的資料有一半會作廢。

## 底線

先讀 `.ai/rules/research-integrity.md`，那是硬規則。三句話總結：

1. 每個事實都要有出處 URL 與查核日期。
2. **查不到就標「待確認」推進 `CHECKLIST`，不要編造。**
3. 你這個 agent 如果沒有瀏覽器或搜尋工具，停下來說，不要靠記憶填表。

## 要查什麼，去讀哪一份

細節都在 `references/`，不要憑印象做：

| 你要查 | 讀 |
|---|---|
| 景點的座標、名稱、營業時間、值不值得去 | `references/places.md` |
| 怎麼從 A 到 B、要開多久、坐什麼車 | `references/routes.md` |
| 自駕行程每個點的停車場 | `references/parking.md` |
| 每一餐吃什麼、備案、預算 | `references/dining.md` |
| 下雨版、走累版、店休版 | `references/alternatives.md` |
| 照片與授權 | `references/photos.md` |

改任何資料檔之前，也要先讀 `docs/schema/` 對應的那一份欄位文件
（見 `.ai/rules/data-schema-reference.md`）。

## 建議順序

1. **地點**（`places.md`）→ 填 `PLACES` 與 `details.js`。先有座標，後面的路線才查得準。
2. **路線**（`routes.md`）→ 填 `stop.leg`。這一步常常會發現某天排太滿，回頭調整。
3. **停車**（`parking.md`）→ 自駕行程才需要，填 `PLACES[key].parking`。
4. **餐飲**（`dining.md`）→ 填 `dining.js`。
5. **備案**（`alternatives.md`）→ 填 `day.alts` 與 `ADDONS`。
6. **照片**（`photos.md`）→ 填 `photos.json`，然後交給 `tp-photos`。

每做完一段就跑 `npm run check -- <slug>`，不要等到最後才一次面對幾十個錯誤。

## 完成的定義

兩個都要達成：

1. `npm run check -- <slug>` 通過
2. `trips/<slug>/docs/sources.md` 列得出每一條資料的來源與查核日期

然後接著做 `tp-basemap` 與 `tp-photos`。
