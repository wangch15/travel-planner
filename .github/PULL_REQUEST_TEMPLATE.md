<!--
開 PR 之前請先跑：
  npm run contrib-check    ← 擋掉夾帶的行程資料，這一步不能跳
  npm test

完整流程與「純粹的改進 vs 設計取捨」的判準見 .ai/rules/contributing-upstream.md
-->

## 引擎版本

<!-- npm run update-check 的第一行，或 package.json 的 version -->

## 現在的行為哪裡是錯的

<!--
請用「現在的行為是錯的」來描述，不要用「這樣比較好」。
只能用後者描述的話，那是設計取捨——請改開 issue，附上這份 patch 當參考。
-->

## 為什麼兩個插槽做不到

<!--
`trips/<slug>/theme.css` 與 `trips/<slug>/extra.js` 是給使用者自訂的插槽。
如果改外觀或加區塊用插槽就能解決，就不需要動引擎。
-->

## 怎麼驗的

- [ ] `npm run contrib-check` 通過（分支裡沒有任何 `trips/` 的改動，`_example` 除外）
- [ ] `npm test` 全綠
- [ ] 改了 `.ai/` 底下的東西 → 跑過 `npm run sync:agent-assets`
- [ ] 改了資料格式 → 有對應的 `migrate` 步驟與 `schemaVersion` 升版

<!-- 補充：實際跑過什麼指令、看到什麼輸出 -->
