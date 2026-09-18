/* schemaVersion 0 的合成樣本：欄位形狀模仿舊版，內容全為假資料。 */
const PLACES = {
  hubA: { name: '節點', jp: 'Hub', lat: 38.2, lng: 140.5, gq: '節點', cat: 'hub' },
  sightA: { name: '景點甲', jp: 'Sight A', lat: 38.3, lng: 140.6, gq: '景點甲', cat: 'sight' },
  stayA: { name: '住宿甲', jp: 'Stay A', lat: 38.25, lng: 140.55, gq: '住宿甲', cat: 'stay' },
};

const DAYS = [
  { id: 1, date: '10/11（日）', color: '#C2683A', title: '第一天', theme: '主軸', lead: '引言',
    stops: [
      { time: '10:00', place: 'hubA', kind: 'main', label: '抵達' },
      { time: '12:00', place: 'stayA', kind: 'stay', label: '入住',
        leg: { dist: '20 公里', drive: '30 分', buffer: '45 分', road: '國道', url: 'https://maps.example.com/1' } },
    ], alts: [], cautions: [] },
  { id: 2, date: '10/12（一）', color: '#4F7A4A', title: '第二天', theme: '主軸', lead: '引言',
    stops: [
      { time: '09:00', place: 'stayA', kind: 'stay', label: '出發' },
      { time: '10:00', place: 'sightA', kind: 'main', label: '參觀',
        leg: { dist: '600 公尺', drive: '步行 9 分', buffer: '15 分', road: '海岸步道', url: 'https://maps.example.com/2' } },
    ], alts: [], cautions: [] },
];

const OVERVIEW_ROUTE = ['hubA', 'stayA', 'sightA'];
const ADDONS = [{ place: 'sightA', day: '10/12', why: '順路', cost: '30 分' }];
const CHECKLIST = ['確認一件事'];
const STAYS = [{ place: 'stayA', range: '10/11 → 10/12', nights: 1, meals: '不含餐', check: '15:00 入住', role: '基地' }];

/* 舊版在檔尾做接線：把餐飲地點併進 PLACES、把 meals 掛到 day、把餐飲待辦推進 CHECKLIST */
const DINING = typeof require !== 'undefined' ? require('./dining.js') : null;
if (DINING) {
  Object.entries(DINING.places).forEach(([k, p]) => { PLACES[k] = { ...p, approximate: true }; });
  DAYS.forEach((d) => { d.meals = DINING.days[d.id] || []; });
  CHECKLIST.push(...(DINING.checklist || []));
}

if (typeof module !== 'undefined') module.exports = { PLACES, DAYS, OVERVIEW_ROUTE, ADDONS, CHECKLIST, STAYS };
