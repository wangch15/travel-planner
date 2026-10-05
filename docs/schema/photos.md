# `photos.json`

## 這個檔負責什麼

每個地點的照片清單。`npm run photos -- <slug>` 依這份清單下載到 `trips/<slug>/photos/`，build 時只收實際存在的檔案。

檔名規則：`<placeKey>-<n>.jpg`，`n` 從 1 開始，對應陣列順序。

**`check` 只驗證欄位與授權字串格式，不保證實際授權成立：**
- Commons 來源：`license` 必須符合 `/CC|Public domain/i`，而且要有 `page`。
- 直接網址：必須有 `credit`。

**官網照片也必須有明確再利用許可，credit 不是授權。**
下載前先核對條款是否允許下載、處理及在網站公開；把圖片來源、授權條款／許可來源、
允許用途、使用條件與查核日期記進 `trips/<slug>/docs/sources.md`。許可不明就不用。
這是 agent 的查核責任，不是新增 schema 欄位，也不能用 check 通過代替查核。

## 欄位表

### Commons 來源

| 欄位 | 必填 | 說明 |
|---|---|---|
| `title` | ✔ | Commons 的檔名，例如 `Yamadera.jpg`。 |
| `artist` | ✘ | 作者，會顯示在照片下方。 |
| `license` | ✔ | 授權，必須含 `CC` 或 `Public domain`。 |
| `page` | ✔ | Commons 的檔案頁面連結。 |

### 直接網址

| 欄位 | 必填 | 說明 |
|---|---|---|
| `url` | ✔ | 圖片網址。 |
| `credit` | ✔ | 來源標註，會顯示在照片下方。 |
| `page` | ✘ | 來源頁面連結。 |

## 完整範例

以下為虛構格式範例；直接網址那筆假設已核對 CC BY 4.0 再利用許可並記入 sources.md，
不是看到官網圖片或署名就可以下載。

```json
{
  "yamadera": [
    { "title": "Yamadera_Risshakuji.jpg", "artist": "Example Author", "license": "CC BY-SA 4.0", "page": "https://commons.wikimedia.org/wiki/File:Yamadera_Risshakuji.jpg" }
  ],
  "innA": [
    { "url": "https://example.com/photo.jpg", "credit": "範例作者・CC BY 4.0", "page": "https://example.com/photo-license" }
  ]
}
```

沒有照片時 `{}` 就好，燈箱會顯示「這個地點沒有可用的免費授權照片」。

## 常見錯誤

- `PHOTOS.xxx[0] 授權不明：未知` — 授權查不出來就不要收。
- `PHOTOS.xxx[0] 直接網址缺 credit` — 非 Commons 的照片一定要標來源。
- `PHOTOS.xxx 引用未知地點` — key 在 `PLACES` 裡不存在。

## 每日行程卡片的景點預覽

`cat: 'sight'` 的停留點若有照片與詳情，卡片左側會顯示建置後第一張可用照片的方形預覽。
點擊圖片或地點名稱都可開啟原有詳情與圖片署名。圖片以裁切方式適應方框，不改動原檔；
請把最能代表景點的照片排在最前面。沒有照片、沒有詳情或圖片載入失敗時，保留文字卡片。
此功能不新增資料欄位，不需要遷移。已有自訂縮圖 CSS 的行程，更新時應移除重複的縮圖樣式。
