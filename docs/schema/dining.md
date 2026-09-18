# `dining.js`

## 這個檔負責什麼

餐飲規劃：有哪些店、每天怎麼吃、備案是什麼、預算大概多少。

載入時引擎會做三件接線（你不用自己寫）：
- `places` 併進 `PLACES` 並標 `approximate: true`
- `days[dayId]` 掛成該天的 `meals`
- `checklist` 併進 `CHECKLIST`

**隱私：** 家人的飲食限制、過敏、訂位確認碼只用來挑店，不要寫進這個檔——那些屬於 `trips/<slug>/docs/`，不會進入網站。

`trip.config` 的 `sections.dining` 為 `false` 時整個檔不驗證、不渲染。開啟時**每天至少要有一餐**。

## 欄位表

| 欄位 | 必填 | 型別 | 說明 |
|---|---|---|---|
| `checked` | ✘ | string | 餐飲資料查核日期，燈箱與三餐區塊的註記用。 |
| `places` | ✔ | object | 同 `PLACES[key]` 的形狀，`cat` 通常是 `food` 或 `shop`。 |
| `venues` | ✔ | object | 每家店的菜單與訂位資訊，key 同 `places`。 |
| `days` | ✔ | object | `{ [dayId]: meal[] }`。 |
| `cooking` | ✘ | object | 自煮說明。`total: [lo, hi]` 是食材總預算；另有 `plan`／`equipment`／`list`／`budget`／`safety`／`fallback`／`refs`。 |
| `checklist` | ✘ | string[] | 併入 `CHECKLIST` 的餐飲待辦。 |

### `venues[key]`

| 欄位 | 必填 | 說明 |
|---|---|---|
| `menu` | ✔ | 有什麼可以吃。 |
| `booking` | ✔ | 訂位方式，或「不接受訂位」。 |
| `budget` | ✘ | `[lo, hi]`，每人預算。渲染成「每人約 ¥lo–hi／N 人約 …」，幣別與人數取自 `trip.config`。 |
| `hours` | ✘ | 營業時間。 |
| `route` | ✘ | 怎麼過去。 |

### `days[dayId][i]`（一餐）

| 欄位 | 必填 | 說明 |
|---|---|---|
| `slot` | ✔ | 餐段名稱，自由填（早餐、午餐、宵夜…）。 |
| `time` | ✔ | 預計時間。 |
| `plan` | ✔ | 主要打算怎麼吃。 |
| `fallback` | ✔ | 這個計畫不成立時怎麼辦。 |
| `places` | ✘ | 主選的店，key 必須同時在 `places` 與 `details.js` 裡。 |
| `backupPlaces` | ✘ | 備案的店，同上。 |
| `budget` | ✘ | `[lo, hi]`，覆寫這一餐的每人預算。 |
| `cooking` | ✘ | 這一餐是自煮，會渲染 `cooking.total` 與自煮說明。 |

## 完整範例

```js
module.exports = {
  checked: '2026/09/18',
  places: {
    diner: { name: '範例食堂', local: 'Example Diner', lat: 38.2612, lng: 140.8795, gq: '仙台駅前 定食', cat: 'food' },
  },
  venues: {
    diner: { menu: '定食為主，主菜配飯與湯。', booking: '不接受訂位', budget: [900, 1600], hours: '11:00–14:00、17:00–20:00' },
  },
  days: {
    1: [{ slot: '午餐', time: '12:00', plan: '取車前在車站周邊吃定食。', fallback: '車站內的便當帶著走。', places: ['diner'] }],
  },
  checklist: ['出發前一週確認餐廳公休日與營業時間'],
};
```

## 常見錯誤

- `Day 2 缺餐食規劃（sections.dining 已開啟）` — 開了 dining 就每天都要有至少一餐，或把 `sections.dining` 關掉。
- `Day 1 meal 0 缺 slot/time/plan/fallback` — 四個都是必填，尤其 `fallback`：店休或客滿時要有 B 案。
- `Day 1 meal 0 地點或詳細說明不存在：cafeA` — 店要同時在 `dining.places` 與 `details.js` 裡。
