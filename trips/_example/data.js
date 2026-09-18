// 範例行程的主資料。改這個檔之前先讀 docs/schema/data.md。
// 這是模板附的去識別化範例：景點與車站為公開資訊，住宿是虛構名稱，
// 不含航班、聯絡方式或任何個人資料。出發前請以官方網站為準。

const PLACES = {
  // cat: hub | stay | sight | food | shop
  stationA: {
    name: '仙台站', local: '仙台駅', lat: 38.260132, lng: 140.882408,
    gq: '仙台駅', cat: 'hub', note: '新幹線與在來線轉乘點，租車櫃檯在西口。',
  },
  yamadera: {
    name: '山寺 立石寺', local: '宝珠山立石寺', lat: 38.312222, lng: 140.437222,
    gq: '宝珠山立石寺', cat: 'sight',
    parking: { name: '山寺門前收費停車場', lat: 38.310556, lng: 140.435833, gq: '山寺 駐車場', fee: '一日 ¥500 上下', note: '旺季上午容易客滿，晚到請往河對岸的停車場找位。' },
  },
  ginzan: {
    name: '銀山溫泉街', local: '銀山温泉', lat: 38.573889, lng: 140.528611,
    gq: '銀山温泉', cat: 'sight',
    parking: { name: '銀山溫泉共同停車場', lat: 38.566389, lng: 140.523611, gq: '銀山温泉 大湯駐車場', fee: '一日 ¥1,000 上下', note: '溫泉街本身禁止一般車輛進入，停好後步行或搭接駁車。' },
  },
  matsushima: {
    name: '松島 瑞巖寺周邊', local: '瑞巌寺', lat: 38.373889, lng: 141.061389,
    gq: '瑞巌寺', cat: 'sight',
  },
  innA: {
    name: '範例民宿 A', local: 'Example Inn A', lat: 38.2554, lng: 140.8808,
    gq: '仙台駅前 宿泊', cat: 'stay', approximate: true,
    note: '座標為街區概略位置，實際地址以訂房確認信為準。',
  },
  innB: {
    name: '範例民宿 B', local: 'Example Inn B', lat: 38.3689, lng: 141.0602,
    gq: '松島海岸 宿泊', cat: 'stay', approximate: true,
    note: '座標為街區概略位置，實際地址以訂房確認信為準。',
  },
};

const DAYS = [
  {
    id: 1, date: '10/11（日）', color: '#C2683A',
    title: '抵達與山寺石階', theme: '第一天不趕路，把體力留給一千零十五階',
    lead: '中午取車後直接往山寺，傍晚回市區住下。山門到奧之院來回約需兩小時。',
    stops: [
      { time: '11:30', place: 'stationA', kind: 'main', label: '抵達與取車', note: '先確認保險與還車時間，再上路。' },
      { time: '13:30', place: 'yamadera', kind: 'main', label: '登山寺、看山門到五大堂的景',
        leg: { mode: 'drive', dist: '約 48 公里', time: '約 1 小時', buffer: '1 小時 20 分', via: '山形自動車道 → 縣道', url: 'https://www.google.com/maps/dir/?api=1&origin=38.260132,140.882408&destination=38.312222,140.437222&travelmode=driving' } },
      { time: '17:30', place: 'innA', kind: 'stay', label: '回市區入住' },
    ],
    alts: [
      { title: '下雨版：改走山下的參道與寶物館', body: '石階濕滑時不要硬上奧之院，山門一帶與根本中堂同樣值得看。', places: ['yamadera'] },
    ],
    cautions: ['石階全程約 1,015 階，穿好走的鞋。', '確認租車的還車時間與加油規定。'],
  },
  {
    id: 2, date: '10/12（一）', color: '#4F7A4A',
    title: '銀山溫泉街的一天', theme: '把車停在山下，慢慢走溫泉街',
    lead: '上午開車進山，午後泡足湯、看大正時代的木造旅館立面，傍晚點燈最好看。',
    stops: [
      { time: '09:00', place: 'innA', kind: 'stay', label: '出發' },
      { time: '11:00', place: 'ginzan', kind: 'main', label: '溫泉街散步與足湯',
        leg: { mode: 'drive', dist: '約 95 公里', time: '約 1 小時 40 分', buffer: '2 小時', via: '東北中央自動車道 → 國道 13 號', url: 'https://www.google.com/maps/dir/?api=1&origin=38.255400,140.880800&destination=38.573889,140.528611&travelmode=driving' } },
      { time: '18:30', place: 'innA', kind: 'stay', label: '回市區', 
        leg: { mode: 'drive', dist: '約 95 公里', time: '約 1 小時 40 分', buffer: '2 小時', via: '國道 13 號 → 東北中央自動車道', url: 'https://www.google.com/maps/dir/?api=1&origin=38.573889,140.528611&destination=38.255400,140.880800&travelmode=driving' } },
    ],
    alts: [
      { title: '走累版：只走到白銀公園入口就折返', body: '溫泉街本身不長，來回一小時就能看完主要立面。', places: ['ginzan'] },
      { title: '店休版：改看山寺沒走完的部分', body: '溫泉街的店家公休不一，行程可以和第一天對調。', places: ['yamadera'] },
    ],
    cautions: ['溫泉街禁止一般車輛進入，一定要停在山下停車場。', '點燈時間依季節調整，出發前查官網。'],
  },
  {
    id: 3, date: '10/13（二）', color: '#3E6B8A',
    title: '松島灣與返程', theme: '改搭電車，把停車的麻煩留給鐵路',
    lead: '早上還車後搭 JR 到松島海岸，瑞巖寺與五大堂步行可達，傍晚回車站。',
    stops: [
      { time: '09:30', place: 'stationA', kind: 'main', label: '還車、轉搭電車' },
      { time: '10:30', place: 'matsushima', kind: 'main', label: '瑞巖寺與五大堂',
        leg: { mode: 'transit', time: '約 40 分', via: 'JR 仙石線（往石卷）', fare: '¥420', url: 'https://www.google.com/maps/dir/?api=1&origin=38.260132,140.882408&destination=38.373889,141.061389&travelmode=transit' } },
      { time: '15:00', place: 'innB', kind: 'stay', label: '海岸邊走走，順路看民宿位置',
        leg: { mode: 'walk', dist: '約 600 公尺', time: '約 9 分', url: 'https://www.google.com/maps/dir/?api=1&origin=38.373889,141.061389&destination=38.368900,141.060200&travelmode=walking' } },
    ],
    alts: [
      { title: '下雨版：改去博物館與室內展示', body: '海岸步道濕滑時，瑞巖寺的寶物館可以待上一小時。', places: ['matsushima'] },
    ],
    cautions: ['還車時間與電車班次要對得上，預留 30 分。', '確認回程車票與行李寄放。'],
  },
];

const OVERVIEW_ROUTE = ['stationA', 'yamadera', 'ginzan', 'matsushima'];

const ADDONS = [
  { place: 'matsushima', day: '10/13', why: '瑞巖寺旁的五大堂走過去只要幾分鐘，灣景一次看完。', cost: '約 40 分' },
  { place: 'ginzan', day: '10/12', why: '白銀瀑布在溫泉街盡頭，願意多走十分鐘就能看到。', cost: '約 30 分' },
];

const CHECKLIST = [
  '確認租車的保險方案與還車時間',
  '查旅行當天各景點是否公休或有活動管制',
  '確認住宿的入住時間與停車位',
];

const STAYS = [
  { place: 'innA', day: 1, range: '10/11 → 10/13', nights: 2, meals: '不含餐', check: '15:00 入住／10:00 退房', role: '前兩晚的基地，走高速往山形方便' },
  { place: 'innB', day: 3, range: '10/13', nights: 1, meals: '含早餐', check: '16:00 入住／11:00 退房', role: '最後一晚靠海，隔天回程近' },
];

const OVERVIEW = {
  checked: '2026/09/18',
  dining: {
    hint: '餐廳尚未預約；每天的選擇與備案見詳細行程。',
    notes: ['熱門店家出發前一週再確認座位。'],
    chips: [{ day: 2, label: '查看第二天用餐' }],
  },
  stays: { title: '兩個晚上，兩個落腳處', hint: '色塊寬度就是住幾晚。', arrive: 'Day 1 抵達', depart: 'Day 3 返程' },
  addonsHint: '時間不夠就先砍加點，不要砍主軸。',
  foot: [
    '距離與交通時間為規劃查核當下的結果，不是旅遊當日的路況預報，也不含休息與找車位。',
    '地圖為 OpenStreetMap 圖資（© OpenStreetMap 貢獻者，ODbL）與公開高程資料繪製；點與點之間的虛線只表示造訪順序。',
    '這是範例資料，出發前請以官方網站為準。',
  ],
};

module.exports = { PLACES, DAYS, OVERVIEW_ROUTE, ADDONS, CHECKLIST, STAYS, OVERVIEW };
