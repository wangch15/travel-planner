# `data.js`

## 這個檔負責什麼

行程的骨幹：有哪些地點、每天走什麼、住哪裡、加點建議、行前清單、總覽文字。

**這是純資料檔。** 不要在檔尾寫接線邏輯（把餐飲併進 `PLACES`、把 meals 掛到 day）——那是 `scripts/lib/load-trip.js` 的工作。

匯出：`module.exports = { PLACES, DAYS, OVERVIEW_ROUTE, ADDONS, CHECKLIST, STAYS, OVERVIEW };`

## 欄位表

### `PLACES[key]`

| 欄位 | 必填 | 型別 | 說明 |
|---|---|---|---|
| `name` | ✔ | string | 中文名稱，畫面上顯示的。 |
| `local` | ✘ | string | 當地語言名稱，給地圖搜尋與燈箱副標用。 |
| `lat` / `lng` | ✔ | number | 座標，必須落在 `region.bbox` 內。 |
| `gq` | ✔* | string | Google Maps 搜尋字串。`gq` 與 `gurl` 至少要有一個。 |
| `gurl` | ✔* | string | 官方的 Google Maps 連結；有它就優先用它。 |
| `cat` | ✔ | string | `hub`（交通節點）、`stay`（住宿）、`sight`（景點）、`food`（餐廳）、`shop`（商店）。 |
| `note` | ✘ | string | 一句話提醒，會出現在停留點與燈箱。 |
| `approximate` | ✘ | boolean | 座標只是街區概略位置；連結改用名稱搜尋而不是座標。 |
| `parking` | ✘ | object | `{ name?, lat, lng, gq?, fee?, note? }`。有它時燈箱會多一個「停車」區，`lat`／`lng` 必填。 |

`cat` 不是 `hub` 的地點一律要有 `details.js` 裡的對應說明；`hub` 有寫就驗、沒寫不擋。

### `DAYS[i]`

| 欄位 | 必填 | 型別 | 說明 |
|---|---|---|---|
| `id` | ✔ | number | 必須是 `i + 1`，連號。天數不限。 |
| `date` | ✔ | string | 顯示用日期，例如 `10/11（日）`。 |
| `color` | ✔ | string | `#RRGGBB`，這一天的代表色。 |
| `title` / `theme` / `lead` | ✔ | string | 標題、輪廓、引言。 |
| `stops` | ✔ | object[] | 至少兩筆。 |
| `alts` | ✘ | object[] | `{ title, body, place? , places? }`，被引用的地點要有 detail。 |
| `cautions` | ✘ | string[] | 出發前要確認的事。 |

### `DAYS[i].stops[j]`

| 欄位 | 必填 | 型別 | 說明 |
|---|---|---|---|
| `time` | ✔ | string | `10:00`。 |
| `place` | ✔ | string | `PLACES` 的 key。 |
| `kind` | ✔ | string | `main`、`suggest`、`optional`、`stay`、`transit`、`alt`。 |
| `label` | ✔ | string | 在這裡做什麼。 |
| `note` | ✘ | string | 額外提醒。 |
| `leg` | ✘ | object | 從**上一個**停留點到這裡的交通。第一個 stop 通常沒有。 |

### `stop.leg`

| 欄位 | 必填 | 說明 |
|---|---|---|
| `mode` | ✔ | `drive`、`transit`、`walk`、`taxi`、`ferry`。決定圖示、導航連結的 travelmode，以及地圖線型。 |
| `time` | ✔ | 所需時間。 |
| `dist` | `drive` 必填 | 距離。 |
| `via` | `transit` 必填 | `drive` 寫道路名，`transit` 寫路線名（例如 `JR 仙山線 快速`）。 |
| `buffer` | ✘ | 建議預留時間。 |
| `fare` | ✘ | 票價，主要給 `transit`。 |
| `url` | ✘ | 備用連結；起訖地點都在 `PLACES` 時引擎會自己算座標路線。 |

### `STAYS[i]`

| 欄位 | 必填 | 說明 |
|---|---|---|
| `place` | ✔ | `PLACES` 的 key。 |
| `day` | ✔ | 入住那天的 `DAYS[].id`。住宿色條的顏色取自這一天。 |
| `range` | ✔ | 顯示用的日期區間。 |
| `nights` | ✔ | 晚數，決定色條寬度。 |
| `meals` / `check` / `role` | ✔ | 餐食、入住退房、這個落腳處的定位。 |

### `OVERVIEW_ROUTE`、`ADDONS`、`CHECKLIST`

- `OVERVIEW_ROUTE`：總覽地圖的連線順序，`PLACES` 的 key 陣列。
- `ADDONS[i]`：`{ place, day, why, cost }`，四個都必填。為空時整個區塊不渲染。
- `CHECKLIST`：字串陣列。`dining.js` 的 `checklist` 會在載入時併進來。

### `OVERVIEW`

每個欄位都選填，缺了就不渲染那一段。

| 欄位 | 說明 |
|---|---|
| `checked` | 景點資料查核日期，燈箱註記用。 |
| `dining` | `{ hint, notes: string[], chips: [{ detail: placeKey, label } \| { day: dayId, label }] }` |
| `stays` | `{ title, hint, arrive, depart }`。`title` 缺則用「N 個晚上，M 個落腳處」；`arrive`／`depart` 缺則用第一天與最後一天的日期。 |
| `addonsHint` | 加點區塊的說明。 |
| `foot` | 頁尾段落，字串陣列。 |

## 完整範例

```js
const PLACES = {
  stationA: { name: '仙台站', local: '仙台駅', lat: 38.260132, lng: 140.882408, gq: '仙台駅', cat: 'hub' },
  yamadera: {
    name: '山寺 立石寺', local: '宝珠山立石寺', lat: 38.312222, lng: 140.437222,
    gq: '宝珠山立石寺', cat: 'sight',
    parking: { name: '山寺門前收費停車場', lat: 38.310556, lng: 140.435833, fee: '一日 ¥500 上下', note: '旺季上午容易客滿。' },
  },
};

const DAYS = [{
  id: 1, date: '10/11（日）', color: '#C2683A', title: '抵達與山寺石階',
  theme: '第一天不趕路', lead: '中午取車後直接往山寺。',
  stops: [
    { time: '11:30', place: 'stationA', kind: 'main', label: '抵達與取車' },
    { time: '13:30', place: 'yamadera', kind: 'main', label: '登山寺',
      leg: { mode: 'drive', dist: '約 48 公里', time: '約 1 小時', buffer: '1 小時 20 分', via: '山形自動車道 → 縣道' } },
  ],
  alts: [{ title: '下雨版', body: '改走山下的參道。', places: ['yamadera'] }],
  cautions: ['石階全程約 1,015 階，穿好走的鞋。'],
}];

const STAYS = [{ place: 'innA', day: 1, range: '10/11 → 10/13', nights: 2, meals: '不含餐', check: '15:00 入住', role: '前兩晚的基地' }];

module.exports = { PLACES, DAYS, OVERVIEW_ROUTE, ADDONS, CHECKLIST, STAYS, OVERVIEW };
```

## 常見錯誤

- `Day 1 stop 0 引用未知地點 xxx` — `stops[].place` 打錯，或 `PLACES` 裡還沒建。
- `Day 1 stop 1 leg.mode 不合法：undefined` — `leg` 忘了填 `mode`。
- `Day 2 stop 1 大眾運輸的 leg 缺 via（路線名）` — `transit` 一定要寫是哪條線。
- `Day 1 stop 1 自駕的 leg 缺 dist` — `drive` 一定要有距離。
- `DAYS[1].id 應為 2，實際 5` — `id` 必須連號。
- `STAYS[0] 的 day 指向不存在的天：9` — `STAYS.day` 要對得上某一天的 `id`。
- `sightA 缺 detail` — 非 `hub` 的地點都要在 `details.js` 有一筆。
- `PLACES.sightA 的 parking 缺座標` — `parking` 的 `lat`／`lng` 是必填。
