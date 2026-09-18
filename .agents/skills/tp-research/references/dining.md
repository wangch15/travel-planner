# 查餐飲

目標：填好 `dining.js`。欄位定義見 `docs/schema/dining.md`。

## 隱私前提

**使用者的飲食限制只用來挑店，不要寫進資料檔。**

- ✓ 挑店時避開只有牛肉的店，在 `venues[key].menu` 寫「定食為主，有魚與蔬食選項」
- ✗ 在資料檔寫「因為某人不吃牛，所以選這家」

挑選的理由留在 `trips/<slug>/docs/dining-research.md`。詳見 `.ai/rules/privacy.md`。

## 每個餐段要查

| 要查 | 填進 |
|---|---|
| 主選店家 | `days[dayId][i].places` |
| 備案店家 | `days[dayId][i].backupPlaces` |
| 沒得選時怎麼辦 | `days[dayId][i].fallback`（**必填**） |
| 菜色 | `venues[key].menu` |
| 訂位方式 | `venues[key].booking` |
| 每人價位 | `venues[key].budget`（`[lo, hi]`） |
| 營業時間 | `venues[key].hours` |

`fallback` 是必填的，而且要是**真的可執行**的東西：「車站內的便當帶著走」、
「住宿附近的便利商店」。不要寫「再找別家」——那不是備案。

## 營業時間要查對日子

**公休日常常是「每週幾」而不是固定日期。** 查的時候要換算到旅行那天是星期幾。

小店的公休日還常常是「不定休」，這種就在 `CHECKLIST` 放一條
「出發前一週確認 X 的公休日」。

午休也要注意：很多日式餐廳 14:00–17:00 是不營業的，
排在 15:00 的午餐會撲空。

## 訂位

查清楚：接不接受訂位、怎麼訂（電話、網路、訂位平台）、要多久前訂、
有沒有最低人數。

**你不代訂。** 給連結或電話讓使用者自己訂，並把「要訂位」放進 `CHECKLIST`。
訂位確認碼之後也不要寫進資料檔（放 `docs/`）。

## 預算

`budget` 是 `[每人下限, 每人上限]`，頁面會自動算出「N 人約 …」。
幣別與人數取自 `trip.config` 的 `currency` 與 `party`。

超市採買的話 `cat` 填 `shop`，頁面會顯示成「採買：每人約 …」。

## 自煮

住宿有廚房的話可以規劃自煮。在該餐填 `cooking: true`，
並在 `dining.cooking.total` 填食材總預算 `[lo, hi]`，
`dining.cooking` 的 `plan`／`equipment`／`list`／`budget`／`safety`／`fallback`
填說明（都是選填，有填才渲染）。

**設備要先問房東**：有沒有鍋子、爐子幾口、有沒有調味料。
這是 `CHECKLIST` 的常客。
