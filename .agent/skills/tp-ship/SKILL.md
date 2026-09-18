---
name: tp-ship
description: 把行程部署上線，以及上線後的維護。使用者說「可以了」「上線吧」或要改已經上線的內容時用。
---

# tp-ship

## 什麼時候用

資料查完、底圖與照片都好了，要讓使用者在手機上打開。
或者網站已經上線，使用者要改東西。

## 流程

```
npm run check -- <slug>     # 資料驗證
npm run build -- <slug>     # 產出單一 HTML
npm run preview -- <slug>   # 起本機伺服器
```

然後**閘門二**（見下），確認過才：

```
npm run ship -- <slug>
```

最後把網址回報給使用者。

## 閘門二：請人看過才能 ship

**不要自己判斷「看起來沒問題」就部署。**

在 preview 打開 `http://localhost:4173`，**明確請使用者看這幾個地方**：

1. **總覽頁**——住宿色條的天數對不對、每日主軸表的過夜地點對不對
2. **任選一天的詳細行程**——交通段落的時間與距離、餐食安排
3. **任一個燈箱**——點地點名稱打開，看照片、看點、參考資料
4. **手機寬度**——把瀏覽器縮到手機大小，或直接用手機開

告訴他要看什麼，不要只丟一個網址說「你看一下」。
他不知道該看哪裡，你知道。

## 第一次部署

要先登入 Cloudflare：

```
npx wrangler login
```

**這一步是人類必做的**——會開瀏覽器請使用者授權，你不能代勞。

**沒登入就不要硬試。** 直接回報「需要先登入 Cloudflare，請跑 `npx wrangler login`」
然後停下來等。

新帳號第一次部署會被問要不要註冊 workers.dev 子網域，**選是**。
網址會是 `<deploy.name>.<帳號>.workers.dev`。

## 部署目標

`trip.config` 的 `deploy.target`：

- `workers`（預設）：Cloudflare Workers 靜態資源
- `pages`：Cloudflare Pages，給已經有 Pages 專案、不想換網址的情況

## 維護模式

網站上線後，使用者會說「餐廳改成另一家」「第三天加一個點」。流程：

1. **對應到哪個資料檔**——用 `docs/schema/` 的對照表判斷要改哪一個
   （見 `.ai/rules/data-schema-reference.md`）
2. 改。新增地點的話記得 `details.js` 也要補一筆（非 `hub` 一律要有）
3. `npm run check` → `npm run build` → `npm run preview`
4. **再走一次閘門二**——改動也要人看過才 ship
5. `npm run ship`

改動如果牽涉到新地點的座標，而且新座標超出 `region.bbox`，
要放大 bbox 並重跑 `npm run basemap`。
