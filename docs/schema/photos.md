# `photos.json`

## 這個檔負責什麼

每個地點的照片清單。`npm run photos -- <slug>` 依這份清單下載到 `trips/<slug>/photos/`，build 時只收實際存在的檔案。

檔名規則：`<placeKey>-<n>.jpg`，`n` 從 1 開始，對應陣列順序。

**授權規則（`check` 會擋）：**
- Commons 來源：`license` 必須符合 `/CC|Public domain/i`，而且要有 `page`。
- 直接網址：必須有 `credit`。官網照片請標明來源，授權不明的不要收。

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

```json
{
  "yamadera": [
    { "title": "Yamadera_Risshakuji.jpg", "artist": "Example Author", "license": "CC BY-SA 4.0", "page": "https://commons.wikimedia.org/wiki/File:Yamadera_Risshakuji.jpg" }
  ],
  "innA": [
    { "url": "https://example.com/photo.jpg", "credit": "© 範例民宿 A 官方網站", "page": "https://example.com/" }
  ]
}
```

沒有照片時 `{}` 就好，燈箱會顯示「這個地點沒有可用的免費授權照片」。

## 常見錯誤

- `PHOTOS.xxx[0] 授權不明：未知` — 授權查不出來就不要收。
- `PHOTOS.xxx[0] 直接網址缺 credit` — 非 Commons 的照片一定要標來源。
- `PHOTOS.xxx 引用未知地點` — key 在 `PLACES` 裡不存在。
