// 每個地點的詳細說明。改這個檔之前先讀 docs/schema/details.md。
// 非 hub 的地點一律要有一筆；summary 至少 40 字、highlights 至少 2 點、refs 至少一筆。

module.exports = {
  placeKey: {
    summary: '這裡寫至少四十個字的說明：這個地方是什麼、為什麼值得去、去了會看到什麼。',
    highlights: ['**看點一**：說明。', '**看點二**：說明。'],
    stay: '60 分',
    info: [['營業時間', ''], ['費用', '']],
    refs: [{ t: '官方網站', u: 'https://' }],
  },
};
