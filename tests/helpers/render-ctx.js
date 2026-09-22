const vm = require('node:vm');

// util.js / render.js 都是 `const fn = …` 與 `function fn(){}` 的混合。vm 的頂層 const
// 不會變成 context 屬性，且分次 runInContext 彼此看不到對方的 const，所以這裡把所有
// 原始碼接成一段執行，最後再把要用的名字逐一掛上 globalThis（沒宣告的用 try 略過）。
const EXPORTS = ['esc', 'ico', 'md', 'money', 'KIND', 'll', 'mapsUrl', 'routeUrl',
  'legHTML', 'stopHTML', 'mealsHTML', 'dayHTML', 'overviewHTML', 'roleOf', 'detailBodyHTML', 'extraHTML', 'stopParkingHTML',
  'lightboxSliderHTML'];

function renderContext(trip, sources) {
  const ctx = {
    CONFIG: trip.config,
    PLACES: trip.PLACES, DAYS: trip.DAYS, DETAILS: trip.DETAILS, DINING: trip.DINING,
    PHOTOS: trip.PHOTOS, STAYS: trip.STAYS, ADDONS: trip.ADDONS, CHECKLIST: trip.CHECKLIST,
    OVERVIEW: trip.OVERVIEW, OVERVIEW_ROUTE: trip.OVERVIEW_ROUTE, MAP_LISTS: trip.MAP_LISTS,
    EXTRA: trip.EXTRA || { sections: [] },
    console,
  };
  vm.createContext(ctx);
  const expose = EXPORTS.map((n) => `try{ globalThis.${n} = ${n}; }catch(e){}`).join('');
  vm.runInContext(sources.join('\n') + '\n;' + expose, ctx);
  return ctx;
}

// 從 legacy-template.html 取出一段程式碼（含頭尾標記之間的內容）
function legacySlice(html, startMarker, endMarker) {
  const a = html.indexOf(startMarker);
  const b = html.indexOf(endMarker, a);
  if (a === -1 || b === -1) throw new Error(`找不到切片標記：${startMarker}`);
  return html.slice(a, b);
}

module.exports = { renderContext, legacySlice };
