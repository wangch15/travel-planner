# `STAY_GUIDES`（住宿指南／共用清單）

## 這個區塊負責什麼

同一個住宿連住好幾晚時，房東常給一整包資訊：入住方式、停車路線圖、附近超市、餐廳、溫泉。
這些東西**跟某一天的時間軸無關**，塞進第一天的 `alts.body` 會變成一段難讀的長文，而且第二、三天看不到。

`STAY_GUIDES` 把它們存成**一份**結構化指南：

- `days` 列出的每一天，頁面上方都會出現同一張「住宿指南」入口卡，點開是同一份內容。
- 指南**不會**新增 stops，也不改每天的時間。推薦清單是候選，不是行程。
- 每一家店獨立一項，有自己的摘要、標籤、官網／地圖按鈕與查核狀態。

它放在 `data.js`，是選填的匯出：`module.exports = { …, STAY_GUIDES };`。沒有這個匯出的舊行程照常運作。

## 隱私

指南會公開在網站上。**門鎖密碼、保險箱密碼、Wi-Fi 密碼、訂房碼、房東電話與 Email 不能寫進來**，
只能放 `trips/<slug>/docs/`（桌面 App 會把 AI 整理出的這類資訊存進 `docs/private-notes.md`）。
欄位名稱以 `private` 開頭的一律被 `check` 擋下。

## 欄位表

### 指南本身 `STAY_GUIDES[i]`

| 欄位 | 必填 | 型別 | 說明 |
|---|---|---|---|
| `id` | ✔ | string | 穩定 ID，小寫英數與連字號。建立後不要改：網址 `#g=<id>` 與版本對照都靠它。 |
| `stay` | ✔ | string | `PLACES` 的 key，必須是 `cat: 'stay'`。 |
| `days` | ✔ | number[] | 要顯示入口的 `DAYS[].id`，至少一天、不可重複。 |
| `title` | ✘ | string | ≤60 字。省略時用「住宿名稱 住宿指南」。 |
| `intro` | ✘ | string | ≤160 字的一段簡介。 |
| `source` | ✘ | source | 整份指南的出處，例如房東提供。 |
| `alerts` | ✘ | alert[] | 重要警示，獨立顯示在最上方。 |
| `sections` | ✘ | section[] | 條列步驟：入住、停車、退房或自訂。 |
| `images` | ✘ | image[] | 圖片（例如停車路線圖），可點開放大。 |
| `lists` | ✘ | list[] | 分類推薦清單。 |

### `source`（出處）

| 欄位 | 必填 | 說明 |
|---|---|---|
| `type` | ✔ | `host`（房東提供）、`official`（官方）、`agent`（AI 整理）、`user`（使用者提供）、`other`。 |
| `label` | ✘ | ≤60 字，顯示用，例如「房東推薦」「房東 LINE 訊息」「官網」。 |
| `url` | ✘ | http(s) 網址。 |
| `date` | ✘ | `YYYY-MM-DD`，取得資料的日期。 |

**房東推薦不等於官方已查核。** 出處說的是「誰推薦的」，查核狀態寫在每一條 `facts` 上。

### `alerts[i]`

| 欄位 | 必填 | 說明 |
|---|---|---|
| `id` | ✔ | 穩定 ID。 |
| `text` | ✔ | ≤200 字。 |
| `level` | ✘ | `warn`（預設，醒目）或 `info`。 |

### `sections[i]`（條列步驟）

| 欄位 | 必填 | 說明 |
|---|---|---|
| `id` | ✔ | 穩定 ID。 |
| `kind` | ✔ | `checkin`（入住方式）、`parking`（停車）、`checkout`（退房）、`custom`。 |
| `title` | `custom` 必填 | ≤60 字；其他 kind 省略時用預設標題。 |
| `steps` | ✔ | string[]，至少一步，每步 ≤200 字。 |
| `images` | ✘ | 引用 `images[].id`，圖片會出現在這段步驟下方。 |

### `images[i]`

| 欄位 | 必填 | 說明 |
|---|---|---|
| `id` | ✔ | 穩定 ID。 |
| `file` | ✔ | `trips/<slug>/photos/` 裡的檔名，必須是 `guide-` 開頭的 `.jpg`／`.png`／`.webp`，檔頭要和副檔名一致。 |
| `alt` | ✔ | 替代文字（看不到圖的人靠它），≤160 字。 |
| `caption` | ✘ | 圖說，≤160 字。 |
| `source` | ✘ | 圖片出處。 |

沒被任何 `sections[].images` 引用的圖片，會集中顯示在「圖片」一段。
發布時圖片放在網站的 `img/<file>`。

### `lists[i]`（分類清單）

| 欄位 | 必填 | 說明 |
|---|---|---|
| `id` | ✔ | 穩定 ID。 |
| `kind` | ✔ | `shopping`（採買）、`dining`（餐飲）、`onsen`（泡湯）、`custom`。 |
| `title` | `custom` 必填 | ≤60 字。 |
| `items` | ✔ | item[]，至少一項。 |

### `lists[i].items[j]`（一家店）

| 欄位 | 必填 | 說明 |
|---|---|---|
| `id` | ✔ | 穩定 ID，整份指南內不可重複。 |
| `name` | ✔ | 店名，≤60 字。 |
| `summary` | ✘ | 一句話介紹，≤120 字。 |
| `tags` | ✘ | 特色標籤，每個 ≤20 字。 |
| `place` | ✘ | `PLACES` 的 key。有的話自動加「地圖」按鈕；有 `details.js` 說明的再加「詳細」。**沒有就省略，不要為了它捏造座標。** |
| `links` | ✘ | `{ kind: official \| map \| other, label, url }[]`。網址放這裡，不要寫進文字。 |
| `source` | ✘ | 這一項的推薦來源；省略時沿用指南的 `source`。 |
| `facts` | ✘ | `{ label, value, source?, checked? }[]`：營業時間、價格、車程各自一條。 |
| `note` | ✘ | ≤300 字補充。 |

`facts[k].checked`（`YYYY-MM-DD`）只代表**那一條**查核過；頁面上每條事實各自顯示「官網・2026-09-20 查核」或「未查核」，
不會因為查了營業時間就把整家店標成已確認。不知道的事實直接不寫，不要填猜的值。

## 完整範例

```js
const STAY_GUIDES = [{
  id: 'inn-a-guide', stay: 'innA', days: [1, 2, 3],
  intro: '房東提供的入住、停車與周邊推薦，三晚共用。',
  source: { type: 'host', label: '房東提供', date: '2026-09-20' },
  alerts: [{ id: 'gate', text: '大門 22:00 後上鎖，晚歸請先告知房東。', level: 'warn' }],
  sections: [
    { id: 'checkin', kind: 'checkin', steps: ['15:00 後可入住。', '鑰匙在玄關左側的鑰匙盒（密碼見私人筆記）。'] },
    { id: 'parking', kind: 'parking', steps: ['從縣道右轉進入小路。', '停在建物後方第 2 格。'], images: ['parking-map'] },
  ],
  images: [{ id: 'parking-map', file: 'guide-inn-a-parking.png', alt: '民宿後方停車格位置圖', caption: '房東提供的停車路線圖', source: { type: 'host' } }],
  lists: [
    { id: 'shopping', kind: 'shopping', items: [{
      id: 'super-a', name: '範例超市', summary: '生鮮與熟食齊全，晚餐採買首選。', tags: ['生鮮', '熟食'],
      source: { type: 'host', label: '房東推薦' },
      links: [{ kind: 'official', label: '官網', url: 'https://example.invalid/super' }],
      facts: [
        { label: '營業時間', value: '09:00–21:00', source: { type: 'official', label: '官網', url: 'https://example.invalid/super/hours' }, checked: '2026-09-20' },
        { label: '車程', value: '約 5 分鐘', source: { type: 'host' } },
      ],
    }] },
    { id: 'onsen', kind: 'onsen', items: [{ id: 'onsen-a', name: '範例湯屋', tags: ['露天'] }] },
  ],
}];
```

## 把既有長文搬進指南

舊行程常把房東資訊寫在某一天的 `alts.body`。搬的時候：

1. 在 `STAY_GUIDES` 建一份指南，每家店拆成一項，**原文的資訊與連結都要保留**。
2. 同一次修改把那一天的 `alts` 移除或縮短；`DAYS[].id` 與 `date` 不變。
3. `npm run check -- <slug>`，再 preview 看過。

桌面 App 裡由 AI 搬移時，App 會先留成提案、列出修改後不見的連結，讓人看過預覽再保存；
保存後也能從「版本紀錄」回到修改前。

## 常見錯誤

- `STAY_GUIDES.x stay 必須是住宿地點（cat: stay）` — `stay` 指到景點或餐廳了。
- `STAY_GUIDES.x days 指向不存在的天：4` — `days` 要對得上 `DAYS[].id`。
- `STAY_GUIDES.x lists[0].items[1].summary 超過 120 字` — 拆成 `facts`、`tags` 或 `note`，不要塞長段落。
- `STAY_GUIDES.x images[0] 的圖片檔不存在：photos/guide-….png` — 檔案沒放進 `photos/`，或檔名打錯。
- `STAY_GUIDES.x … 有不支援的欄位 hours` — 營業時間請寫成 `facts: [{ label: '營業時間', value: … }]`。
- `STAY_GUIDES.x … 不能有 privateNotes` — 私人資訊只能放 `trips/<slug>/docs/`。
