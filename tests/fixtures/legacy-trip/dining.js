const dining = {
  checked: '2026/09/17',
  places: { cafeA: { name: '咖啡店', jp: 'Cafe A', lat: 38.28, lng: 140.58, gq: '咖啡店', cat: 'food' } },
  venues: { cafeA: { menu: '咖啡', booking: '不用訂位', budget: [800, 1500] } },
  days: { 1: [{ slot: '午餐', time: '12:00', plan: '喝咖啡', fallback: '便利商店', places: ['cafeA'] }], 2: [] },
  checklist: ['問餐廳能不能訂位'],
};
if (typeof module !== 'undefined') module.exports = dining;
