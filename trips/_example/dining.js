// 餐飲規劃。改這個檔之前先讀 docs/schema/dining.md。
// places 會在載入時併進 PLACES 並標為 approximate（座標是街區概略位置）。
// 使用者的飲食限制只用來挑店，不寫進這個檔——那屬於 trips/<slug>/docs/。

module.exports = {
  checked: '2026/09/18',

  places: {
    diner: { name: '範例食堂', local: 'Example Diner', lat: 38.2612, lng: 140.8795, gq: '仙台駅前 定食', cat: 'food' },
    grocery: { name: '範例超市', local: 'Example Grocery', lat: 38.2588, lng: 140.8831, gq: '仙台駅前 スーパー', cat: 'shop' },
  },

  venues: {
    diner: {
      menu: '定食為主，主菜配飯與湯；也有單點的小菜。',
      booking: '不接受訂位',
      budget: [900, 1600],
      hours: '範例值：11:00–14:00、17:00–20:00',
      route: '車站步行約 5 分鐘。',
    },
    grocery: {
      menu: '熟食便當、配菜、麵包與飲料；傍晚熟食有折扣。',
      booking: '不需訂位',
      budget: [500, 1000],
      hours: '範例值：09:00–22:00',
      route: '車站步行約 7 分鐘。',
    },
  },

  days: {
    1: [
      { slot: '午餐', time: '12:00', plan: '取車前在車站周邊吃定食，出發前不要吃太飽。', fallback: '車站內的便當帶著走。', places: ['diner'] },
      { slot: '晚餐', time: '19:00', plan: '回市區後在超市買熟食，回住宿吃。', fallback: '住宿附近的便利商店。', places: ['grocery'] },
    ],
    2: [
      { slot: '早餐', time: '08:00', plan: '前一晚在超市買好麵包與飲料。', fallback: '便利商店。', places: ['grocery'], budget: [300, 700] },
      { slot: '晚餐', time: '19:30', plan: '回程較晚，直接在車站周邊吃定食。', fallback: '超市熟食。', places: ['diner'], backupPlaces: ['grocery'] },
    ],
    3: [
      { slot: '午餐', time: '12:30', plan: '松島海岸周邊用餐，時間抓鬆一點。', fallback: '車站周邊的定食。', places: ['diner'] },
      { slot: '晚餐', time: '18:30', plan: '回程前在超市買熟食，或視時間改成外食。', fallback: '便利商店。', places: ['grocery'] },
    ],
  },

  checklist: ['出發前一週確認餐廳公休日與營業時間'],
};
