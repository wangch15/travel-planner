// 住宿指南的合成測試資料：形狀照「同一住宿連住三晚、房東給入住／停車／採買／餐飲／泡湯」的真實案例，
// 但名稱、網址全是假的（example.invalid），不含任何真實行程或私人資訊。
const { makeTrip } = require('./make-trip.js');

const day3 = {
  id: 3, date: '10/13（二）', color: '#2F6690', title: '第三天', theme: '主軸', lead: '引言',
  stops: [
    { time: '10:00', place: 'stayA', kind: 'stay', label: '退房' },
    { time: '12:00', place: 'hubA', kind: 'main', label: '還車',
      leg: { mode: 'drive', dist: '20 公里', time: '30 分', via: '國道' } },
  ], meals: [], alts: [], cautions: [],
};

const item = (id, name, extra = {}) => ({ id, name, summary: `${name}的一句話介紹`, source: { type: 'host', label: '房東推薦' }, ...extra });

function stayGuide(over = {}) {
  return {
    id: 'stay-a-guide', stay: 'stayA', days: [1, 2, 3],
    title: '範例民宿 住宿指南', intro: '房東提供的入住、停車與周邊推薦，三晚共用。',
    source: { type: 'host', label: '房東提供', date: '2026-09-20' },
    alerts: [{ id: 'gate', text: '大門 22:00 後會上鎖，晚歸請先告知房東。', level: 'warn' }],
    sections: [
      { id: 'checkin', kind: 'checkin', steps: ['15:00 後可入住。', '鑰匙在玄關左側的鑰匙盒。'] },
      { id: 'parking', kind: 'parking', steps: ['從縣道右轉進入小路。', '停在建物後方第 2 格。'], images: ['parking-map'] },
    ],
    images: [{ id: 'parking-map', file: 'guide-stay-a-parking.png', alt: '民宿後方停車格位置圖', caption: '房東提供的停車路線圖', source: { type: 'host' } }],
    lists: [
      { id: 'shopping', kind: 'shopping', items: [
        item('super-a', '範例超市', { tags: ['生鮮', '熟食'], links: [{ kind: 'official', label: '官網', url: 'https://example.invalid/super' }],
          facts: [
            { label: '營業時間', value: '09:00–21:00', source: { type: 'official', label: '官網', url: 'https://example.invalid/super/hours' }, checked: '2026-09-20' },
            { label: '車程', value: '約 5 分鐘', source: { type: 'host' } },
          ] }),
        item('drug-a', '範例藥妝'),
      ] },
      { id: 'dining', kind: 'dining', items: [item('ramen-a', '範例拉麵', { place: 'sightA' }), item('izakaya-a', '範例居酒屋')] },
      { id: 'onsen', kind: 'onsen', items: [item('onsen-a', '範例湯屋', { tags: ['露天'], links: [{ kind: 'map', label: 'Google Maps', url: 'https://example.invalid/map/onsen' }] })] },
    ],
    ...over,
  };
}

function makeGuideTrip(guideOver = {}) {
  const base = makeTrip();
  return {
    ...base,
    config: { ...base.config, dates: { start: '2026-10-11', end: '2026-10-13' } },
    DAYS: [...base.DAYS, day3],
    STAYS: [{ ...base.STAYS[0], range: '10/11 → 10/14', nights: 3 }],
    STAY_GUIDES: [stayGuide(guideOver)],
    GUIDE_IMAGES: { 'guide-stay-a-parking.png': 'img/guide-stay-a-parking.png' },
  };
}

module.exports = { makeGuideTrip, stayGuide };
