# `data.js`

## 這個檔負責什麼

行程的骨幹：有哪些地點、每天走什麼、住哪裡、加點建議、行前清單、總覽文字。

**這是純資料檔。** 不要在檔尾寫接線邏輯（把餐飲併進 `PLACES`、把 meals 掛到 day）——那是 `scripts/lib/load-trip.js` 的工作。

匯出：`module.exports = { PLACES, DAYS, OVERVIEW_ROUTE, ADDONS, CHECKLIST, STAYS, OVERVIEW };`

選填的 `STAY_GUIDES`（住宿指南／共用清單）也放在這個檔，欄位見 [`stay-guides.md`](stay-guides.md)。

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
| `links` | ✘ | object[] | 直接顯示在這個停留點下面的連結，最多 4 個。見下方 `stop.links` 與 `stop.help`。 |
| `help` | ✘ | object | 一顆「？」按鈕，點開展開詳細步驟與連結。見下方。 |

### `stop.links` 與 `stop.help`

這兩個欄位給「這一站要先做某件事、但時間軸上沒地方放說明」的情況：先查天氣、先打電話確認、先訂位、要問房東什麼。
地點本身已經有 `details.js` 的燈箱（點地點名稱就開）時，不需要重複寫。

| 欄位 | 必填 | 型別 | 說明 |
|---|---|---|---|
| `links[].label` | ✔ | string | 按鈕文字，1–30 字。 |
| `links[].url` | ✔ | string | 只接受 `http://` 與 `https://`；其他一律被 `check` 擋下，渲染時也會略過。 |
| `help.title` | ✘ | string | 按鈕旁的文字，≤30 字；省略時顯示「詳細說明」。 |
| `help.steps` | ✔ | string[] | 展開後的步驟，1–8 步，每步 ≤200 字。 |
| `help.links` | ✘ | object[] | 展開內容底下的連結，格式同 `links`，最多 4 個。 |

`help` 用原生的 `<details>` 展開，預設收合，不需要 JavaScript。兩個欄位都不能夾帶其他欄位。

```js
{ time: '08:30', place: 'stayA', kind: 'stay', label: '看道路與山頂能見度後出發',
  links: [{ label: '即時鏡頭', url: 'https://example.com/camera' }],
  help: { title: '怎麼決定要不要上山', steps: ['先看鏡頭有沒有被雲蓋住。', '被蓋住就先吃早午餐，10:30 再看一次。'],
          links: [{ label: '道路公告', url: 'https://example.com/road' }] } }
```

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

房東提供的入住方式、停車圖、周邊推薦不要寫進 `role` 或某一天的 `alts.body`，用 [`STAY_GUIDES`](stay-guides.md)：資料只存一份，相關的每一天都有入口。

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
| `reservations` | 獨立的預約提醒陣列，格式見下方。不受 `sections.checklist` 開關影響；省略或空陣列不顯示。 |

### `OVERVIEW.reservations[i]`

每項 `{ id, place, days, note }`，最多 80 項：

- `id`：穩定且唯一的代號，小寫英數與連字號，1–80 字；調整排序時不要改 id。
- `place`：有 `details.js` 詳情的地點 key，可指向景點或餐廳。名稱按鈕開啟詳情燈箱。
- `days`：非空、不重複的 `DAYS[].id` 數字陣列，例如 `[2, 3]`。畫面使用該日日期，點擊切到當天。
- `note`：1–400 字，描述預約方式或需要處理的事項；依查核資料填寫，不推測是否接受預約。

例如：`{ id: 'museum-ticket', place: 'museum', days: [2], note: '可先至官網預約入場時段；票種與開放日期見詳情。' }`。

預約待辦從 `CHECKLIST`／`dining.checklist` 搬到這裡時，移除原本相同的待辦；營業時間查核等資料待辦保留。若全部搬完，有有效預約提醒時允許 `CHECKLIST` 為空，原資料清單區塊會隱藏。
舊行程不會以關鍵字自動推測或搬移。完成勾選只存裝置 localStorage，依 id 對應，不會代表店家已確認。
不儲存訂單號、確認碼、聯絡或付款資訊；私人資訊仍放 `docs/`。

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
