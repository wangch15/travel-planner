---
name: tp-photos
description: 把 photos.json 列的照片抓進行程資料夾。照片來源查好之後用。
---

# tp-photos

## 什麼時候用

`photos.json` 已經填好（怎麼找照片與授權規則見
`tp-research/references/photos.md`），要把實際檔案抓下來。

## 下載前：授權是硬規則

**官網照片也要有明確再利用許可，credit 不是授權。**
先核對 `trips/<slug>/docs/sources.md` 的圖片來源、授權條款／許可來源、允許用途、使用條件與查核日期。
缺少證據就回 `tp-research/references/photos.md` 查核；查不到就不用，不能先下載再補 credit。

`npm run check` 只驗證欄位與授權字串格式，不保證實際授權成立：

- Commons 來源的 `license` 必須含 `CC` 或 `Public domain`，而且要有 `page`
- 直接網址必須有 `credit`

這些欄位通過不代表取得許可。**授權不明的照片不要收**，不能為了「頁面看起來比較豐富」而放寬。

## 跑

```
npm run photos -- <slug>
```

- **預設只補缺的**：已經存在的檔案會跳過，不會重抓。
- `--force` 才會全部重新下載。

檔名規則是 `<placeKey>-<n>.jpg`，`n` 對應 `photos.json` 陣列裡的順序。

## 單張失敗怎麼辦

指令不會整批中斷，它會逐張列出失敗原因：

- **HTTP 404**：Commons 檔名打錯了（注意大小寫與副檔名，`.JPG` 跟 `.jpg` 不同）
- **回應不是圖片**：網址指向的是網頁不是圖檔，找真正的圖片網址
- **連不上**：等一下再試

處理方式是**把那一筆從 `photos.json` 拿掉或換一張**，不要硬塞。

## 確認結果

```
npm run build -- <slug>
npm run preview -- <slug>
```

`build` 只會收 `trips/<slug>/photos/` 裡**實際存在**的檔案，
所以少抓幾張不會讓 build 壞掉，只是那個地點沒有照片。

在 preview 點開燈箱確認：

- 照片有載入
- 下方的 credit 正確（作者・授權）
- Commons 來源的連結點得回檔案頁面

沒有照片的地點會顯示「這個地點沒有可用的免費授權照片」，那是正常的。

## 照片會進 git

抓下來的檔案是 1024px 寬的 JPEG，一張 200–500 KB，會 commit 進 repo。
一個地點一到兩張就夠，不用貪多。
