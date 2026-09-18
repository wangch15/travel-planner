---
name: tp-basemap
description: 產生行程的地形底圖。地點座標都填好之後、或改過 region.bbox 之後用。
---

# tp-basemap

## 什麼時候用

- 地點座標都填好了，要產生地圖背景（海岸線、等高線、道路、城鎮）
- 改過 `trip.config` 的 `region.bbox` 之後（`check` 會擋，要求重跑）

底圖是衍生資料，平常改行程**不需要**重跑。

## 開始前確認

`trip.config` 的 `region.bbox` 已經填好，而且**涵蓋所有地點**。
bbox 太小的話地圖會缺角，而且座標驗證會擋掉範圍外的地點。

## 跑

```
npm run basemap -- <slug>
```

第一次會下載 Overpass 的向量資料與數十張高程圖磚，大概要一兩分鐘。
兩者都會快取在 `trips/<slug>/.cache/`（已 gitignore），重跑很快。

## 看輸出

跑完會印出：

- **島數**：沿海行程才有。數字明顯不合理（幾百座）通常代表 bbox 涵蓋了大片外海。
- **等高線層級**：沒指定 `contourLevels` 時會自動選，讓層數落在 6–8 層。
  想要特定間距就在 `trip.config` 的 `basemap.contourLevels` 明確指定。
- **檔案大小**：超過 600 KB 會警告。把 `basemap.detail` 改成 `low` 重跑可以縮小。

## Overpass 失敗怎麼辦

Overpass 是公共 API，**有速率限制也會偶發逾時**。看到查詢失敗時：

1. **等幾分鐘再跑一次。** 快取還在，已經成功的部分不會重抓。
2. 指令本身會自動換鏡像重試，所以單一鏡像掛掉不用你處理。
3. 還是不行就再等久一點。尖峰時段（歐洲白天）比較容易塞。

**不要為了讓它過而縮小 bbox 或把 `detail` 降到 `low`。**
那不是解決問題，那是讓地圖失真——而且你不會發現失真了多少。

## 高程來源

`trip.config` 的 `basemap.dem`：

- `auto`（預設）：日本用国土地理院，其他地區用 Terrain Tiles
- `gsi`：強制用国土地理院（只有日本有資料）
- `terrarium`：強制用 Terrain Tiles（全球）

來源標示會自動寫進 `basemap.json` 的 `meta.demCredit`，頁面下方會顯示。

## 確認結果

```
npm run check -- <slug>
npm run preview -- <slug>
```

在瀏覽器看三件事：

1. **海陸沒有畫反**——陸地不該被填成海色。這是最重要的一項。
2. **山勢有浮現**——等高線隨高度加深。
3. 比例尺與等高線間距的註記正確。

有問題的話先確認 bbox，再看是不是高程來源選錯（非日本地區用了 `gsi` 會沒有資料）。
