// 餐飲規劃。改這個檔之前先讀 docs/schema/dining.md。
// places 會在載入時併進 PLACES 並標為 approximate。
// 飲食限制、過敏、訂位確認碼這類資訊只進 trips/__SLUG__/docs/，不要寫在這裡。

module.exports = {
  checked: '',
  places: {},
  venues: {},
  days: {
    // 1: [{ slot: '午餐', time: '12:00', plan: '', fallback: '', places: [] }],
  },
  checklist: [],
};
