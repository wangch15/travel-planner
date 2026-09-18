// 最小但合法的行程物件，供 schema 測試逐條破壞。全為合成資料。
const place = (over) => ({ name: '地點', local: 'Place', lat: 38.2, lng: 140.5, gq: '地點', cat: 'sight', ...over });
const detail = (over) => ({
  summary: '這是一段足夠長的說明文字，用來滿足最少四十個字的驗證規則，內容本身不重要，只要長度足夠即可。',
  highlights: ['看點一', '看點二'], stay: '60 分', info: [], refs: [{ t: '官方', u: 'https://example.com/' }], ...over,
});

function makeTrip(overrides = {}) {
  const base = {
    slug: '_fixture',
    config: {
      schemaVersion: 1, title: '測試行程', lang: 'zh-Hant',
      dates: { start: '2026-10-11', end: '2026-10-12' },
      region: { country: 'JP', bbox: [139.9, 37.8, 141.5, 39.0] },
      transport: ['drive'], party: 2, currency: '¥',
      sections: { overview: true, dining: false, mapLists: false, checklist: true },
      theme: { accent: '#B0552D', favicon: '🗾' },
      basemap: { dem: 'auto', detail: 'normal', contourLevels: null },
      deploy: { name: 'fixture', target: 'workers' },
    },
    PLACES: { hubA: place({ cat: 'hub' }), sightA: place(), stayA: place({ cat: 'stay' }) },
    DAYS: [
      { id: 1, date: '10/11（日）', color: '#C2683A', title: '第一天', theme: '主軸', lead: '引言',
        stops: [
          { time: '10:00', place: 'hubA', kind: 'main', label: '抵達' },
          { time: '12:00', place: 'stayA', kind: 'stay', label: '入住',
            leg: { mode: 'drive', dist: '20 公里', time: '30 分', buffer: '45 分', via: '國道', url: 'https://maps.example.com/' } },
        ], meals: [], alts: [], cautions: [] },
      { id: 2, date: '10/12（一）', color: '#4F7A4A', title: '第二天', theme: '主軸', lead: '引言',
        stops: [
          { time: '09:00', place: 'stayA', kind: 'stay', label: '出發' },
          { time: '10:00', place: 'sightA', kind: 'main', label: '參觀',
            leg: { mode: 'transit', time: '25 分', via: 'JR 線', fare: '¥420', url: 'https://maps.example.com/' } },
        ], meals: [], alts: [], cautions: [] },
    ],
    OVERVIEW_ROUTE: ['hubA', 'stayA', 'sightA'],
    ADDONS: [{ place: 'sightA', day: '10/12', why: '順路', cost: '30 分' }],
    CHECKLIST: ['確認一件事'],
    STAYS: [{ place: 'stayA', day: 1, range: '10/11 → 10/12', nights: 1, meals: '不含餐', check: '15:00 入住', role: '基地' }],
    OVERVIEW: { checked: '2026/09/18', foot: ['頁尾說明'] },
    DETAILS: { sightA: detail(), stayA: detail() },
    DINING: { checked: '2026/09/18', places: {}, venues: {}, days: {} },
    MAP_LISTS: {},
    PHOTOS: {},
    basemap: { meta: { bbox: [139.9, 37.8, 141.5, 39.0] } },
  };
  return { ...base, ...overrides };
}

module.exports = { makeTrip, place, detail };
