'use strict';
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
const ico = (id, cls) => '<svg class="ico' + (cls ? ' ' + cls : '') + '" aria-hidden="true"><use href="#' + id + '"/></svg>';
const md = (t) => esc(t).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
const KIND = { main:'已定主軸', suggest:'本版建議', optional:'加選', stay:'住宿', transit:'移動', alt:'替換' };
/* 地點連結用座標，名稱搜尋會配錯分店；有官方連結的用官方連結 */
const ll = (p) => p.lat.toFixed(6) + ',' + p.lng.toFixed(6);
const mapsUrl = (p) => p.gurl
  || (p.cat === 'stay' || p.approximate ? 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(p.gq)
    : 'https://www.google.com/maps/search/?api=1&query=' + ll(p));
/* 路線連結：起訖都用實際停留點的座標，而不是參考地標 */
const routeUrl = (from, to, mode) => 'https://www.google.com/maps/dir/?api=1&origin=' + ll(from)
  + '&destination=' + ll(to) + '&travelmode=' + (mode === 'walk' ? 'walking' : 'driving');
/* 每人／全團金額。幣別與人數取自 trip.config。 */
const money = (range) => {
  const c = CONFIG.currency, n = CONFIG.party;
  const fmt = (v) => c + v.toLocaleString('en-US');
  return '每人約 ' + fmt(range[0]) + '–' + range[1].toLocaleString('en-US')
    + '／' + n + ' 人約 ' + fmt(range[0] * n) + '–' + (range[1] * n).toLocaleString('en-US');
};
