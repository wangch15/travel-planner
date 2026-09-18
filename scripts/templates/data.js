// 行程主資料。改這個檔之前先讀 docs/schema/data.md。
// 每個事實都要查得到來源，查不到就寫進 CHECKLIST 標為待確認，不要編造。

const PLACES = {
  // cat: hub（交通節點）| stay（住宿）| sight（景點）| food（餐廳）| shop（商店）
  // 自駕行程的景點建議補上 parking: { name, lat, lng, gq, fee, note }
  placeKey: {
    name: '中文名稱', local: '當地語言名稱', lat: 0, lng: 0,
    gq: '給 Google Maps 搜尋用的字串', cat: 'sight',
  },
};

const DAYS = [
  // id 必須是 1、2、3… 連號；每天至少兩個 stop
  {
    id: 1, date: '', color: '#C2683A', title: '', theme: '', lead: '',
    stops: [
      { time: '', place: 'placeKey', kind: 'main', label: '' },
      // leg 是「從上一個停留點到這裡」的交通；mode 必填
      // drive 要有 dist；transit 要有 via（路線名）
      { time: '', place: 'placeKey', kind: 'main', label: '',
        leg: { mode: 'drive', dist: '', time: '', buffer: '', via: '', url: '' } },
    ],
    alts: [], cautions: [],
  },
];

const OVERVIEW_ROUTE = ['placeKey'];
const ADDONS = [];
const CHECKLIST = ['出發前要確認的第一件事'];
const STAYS = [];

const OVERVIEW = {
  checked: '',   // 景點資料查核日期，燈箱註記用
  foot: [],      // 頁尾段落；每個欄位都選填，空的就不渲染
};

module.exports = { PLACES, DAYS, OVERVIEW_ROUTE, ADDONS, CHECKLIST, STAYS, OVERVIEW };
