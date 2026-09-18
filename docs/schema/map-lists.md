# `map-lists.js`

## 這個檔負責什麼

每天的 Google Maps 私人清單。人在 Maps 上建清單、把地點加進去，agent 把清單對帳填進這個檔，`check` 會驗證一致性。

`trip.config` 的 `sections.mapLists` 為 `false` 時不需要填（`module.exports = {};` 就好）。

匯出：`module.exports = { [dayId]: { … } };`

## 欄位表

| 欄位 | 必填 | 型別 | 說明 |
|---|---|---|---|
| `name` | ✔ | string | 清單名稱，會出現在 aria-label。 |
| `url` | ✔ | string | Maps 分享連結。 |
| `placeKeys` | ✔ | string[] | 這份清單裡有哪些地點，`PLACES` 的 key。 |
| `extraPlaces` | ✘ | object[] | 清單裡有、但行程資料沒有的地點，只用來算數量。 |

**驗證規則：** `sections.mapLists` 開啟時，每天清單的 `placeKeys` 必須涵蓋當天所有 `stop`、`meal`（含 `backupPlaces`）與 `alt` 引用的地點。

## 完整範例

```js
module.exports = {
  1: {
    name: 'Day 1　山寺',
    url: 'https://maps.app.goo.gl/example1',
    placeKeys: ['stationA', 'yamadera', 'innA', 'diner', 'grocery'],
  },
};
```

## 常見錯誤

- `Day 1 的清單少了 stayA：先更新實際 Maps 清單再改 map-lists.js`
  **順序很重要**：先去 Maps 把地點加進清單，再回來改這個檔。反過來做的話，檔案通過驗證但手機上打開清單會少一個點。
- `Day 2 缺 Google Maps 清單` — 開了 `sections.mapLists` 就每天都要有一份。
