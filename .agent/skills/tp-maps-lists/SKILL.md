---
name: tp-maps-lists
description: 把人在 Google Maps 建好的每日私人清單對帳進 map-lists.js。使用者說他建好清單、或想要每天一個地圖清單時用。
---

# tp-maps-lists

## 什麼時候用

**使用者主動說**他想要「每天一個 Google Maps 清單，出門時手機打開就能導航」。

這是**選用功能，預設關閉**。`trip.config` 的 `sections.mapLists` 為 `false` 時整個跳過，
`map-lists.js` 留成 `module.exports = {};` 就好。

**不要主動推銷這個功能。** 它需要人自己先在 Google Maps 建清單、把地點一個一個加進去，
是額外的手工；沒有這份清單的行程一樣完整可用。使用者沒開口就不要開。

## 順序很重要

**人先建清單，你再對帳。** 反過來做會出事：

1. **人類必做**：在 Google Maps 建每日清單（「你的地點」→ 新增清單），
   把當天要去的地點一個一個加進去，然後取得分享連結。
2. 你才把清單內容對帳進 `trips/<slug>/map-lists.js`。

如果你先填了 `map-lists.js` 再叫使用者去建清單，檔案會通過驗證，
但他在手機上打開清單會發現少了幾個點——而且不會有人發現，直到出門那天。

## 對帳要做什麼

每一天填一筆：

```
{ name: 顯示名稱, url: 分享連結, placeKeys: [這份清單裡有哪些地點] }
```

`placeKeys` 用的是 `PLACES` 的 key。欄位細節見 `docs/schema/map-lists.md`。

`npm run check -- <slug>` 會驗證：**每天清單的 `placeKeys` 必須涵蓋當天所有
stop、meal（含備案店家）、alt 引用到的地點**。

漏了會看到這種錯誤：

```
Day 2 的清單少了 cafeA：先更新實際 Maps 清單再改 map-lists.js
```

看到它的正確反應是**回 Google Maps 把那個點加進清單**，然後才改檔案。
不要直接把 key 補進 `placeKeys` 讓驗證過關——那就失去對帳的意義了。

## 提醒使用者

私人清單需要登入有權限的 Google 帳號才打得開。
同行的人如果也要用，記得把清單分享給他們。

## 階段保存（完成條件）

啟用清單且實際對帳與 check 通過後，依 `.ai/rules/stage-backup.md` 保存本次資料改動。
每次 push 前重新確認 origin 是使用者自己的私有 repo；備份核對成功，才回報對帳階段完成。
失敗或離線就停下來，明說「目前只有本機備份，尚未異地備份」。未啟用且沒有改動時只回報略過，不為此另造 commit。
