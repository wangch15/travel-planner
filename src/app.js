(function(){
'use strict';

const $ = (s, r) => (r || document).querySelector(s);
const el = (t, c, txt) => { const n = document.createElement(t); if (c) n.className = c; if (txt != null) n.textContent = txt; return n; };
const reduced = () => matchMedia('(prefers-reduced-motion:reduce)').matches;

/* ── 投影 ── */
const R = Math.PI / 180;
const prj = (lng, lat) => [lng, Math.log(Math.tan(Math.PI / 4 + lat * R / 2)) / R];

/* ── 地圖 ── */
const mapBox = $('#map'), svg = $('#svg'), pinsBox = $('#pins');
const NS = 'http://www.w3.org/2000/svg';
let view = { x:0, y:0, w:1, h:1 }, fitTarget = null, routeLayer = null;
let pins = [], townPins = [], currentPoints = [], currentPad = .34, active = null;

function d(line) {
  let s = '';
  for (let i = 0; i < line.length; i++) {
    const q = prj(line[i][0], line[i][1]);
    s += (i ? 'L' : 'M') + q[0].toFixed(5) + ',' + (-q[1]).toFixed(5);
  }
  return s;
}
const shape = (tag, attrs) => { const n = document.createElementNS(NS, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); return n; };

function drawBase() {
  svg.textContent = '';
  const g = shape('g', {});
  const pen = (lines, stroke, w, op) => lines.forEach((l) => g.appendChild(shape('path', {
    d: d(l), fill:'none', stroke, 'stroke-width':w, opacity:op,
    'stroke-linejoin':'round', 'stroke-linecap':'round', 'vector-effect':'non-scaling-stroke',
  })));

  g.appendChild(shape('path', { d: d(BASEMAP.sea) + 'Z', fill:'var(--sea)' }));
  // 等高線：越高畫得越實，山勢自然浮現
  Object.keys(BASEMAP.contour).sort((a, b) => a - b).forEach((lv) => {
    const n = +lv;
    pen(BASEMAP.contour[lv], 'var(--contour)', n >= 1000 ? 1 : .8, .34 + Math.min(n, 1600) / 1600 * .42);
  });
  pen(BASEMAP.river, 'var(--river)', 1, .7);
  BASEMAP.lake.forEach((l) => g.appendChild(shape('path', { d: d(l) + 'Z', fill:'var(--river)', opacity:.85 })));
  BASEMAP.islands.forEach((l) => g.appendChild(shape('path', {
    d: d(l) + 'Z', fill:'var(--land)', stroke:'var(--sea-line)', 'stroke-width':.7, 'vector-effect':'non-scaling-stroke',
  })));
  g.appendChild(shape('path', { d: d(BASEMAP.sea), fill:'none', stroke:'var(--sea-line)', 'stroke-width':1.1, 'vector-effect':'non-scaling-stroke' }));
  BASEMAP.border.forEach((l) => g.appendChild(shape('path', {
    d: d(l), fill:'none', stroke:'var(--border-line)', 'stroke-width':1, opacity:.5,
    'stroke-dasharray':'5 4', 'vector-effect':'non-scaling-stroke',
  })));
  pen(BASEMAP.trunk, 'var(--road-lo)', 1.5, 1);
  pen(BASEMAP.primary, 'var(--road-mid)', 1.5, .95);
  pen(BASEMAP.motorway, 'var(--road-hi)', 2.3, .9);
  svg.appendChild(g);
  routeLayer = shape('g', {});
  svg.appendChild(routeLayer);
}

function setView(v) {
  view = v;
  svg.setAttribute('viewBox', `${v.x} ${v.y} ${v.w} ${v.h}`);
  placePins();
  drawScale();
}
function fitTo(points, padRatio) {
  if (!points.length) return;
  const xs = [], ys = [];
  points.forEach((p) => { const q = prj(p.lng, p.lat); xs.push(q[0]); ys.push(-q[1]); });
  const x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs);
  const y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
  const r = svg.getBoundingClientRect(), ar = (r.width || 600) / (r.height || 400);
  const pad = padRatio == null ? .3 : padRatio;
  let w = Math.max(x1 - x0, .012) * (1 + pad * 2);
  let h = Math.max(y1 - y0, .012) * (1 + pad * 2);
  if (w / h < ar) w = h * ar; else h = w / ar;
  fitTarget = { x:(x0 + x1) / 2 - w / 2, y:(y0 + y1) / 2 - h / 2, w, h };
  setView(fitTarget);
}
function zoom(k, cx, cy) {
  const r = svg.getBoundingClientRect();
  const fx = cx == null ? .5 : (cx - r.left) / r.width;
  const fy = cy == null ? .5 : (cy - r.top) / r.height;
  const w = Math.min(Math.max(view.w * k, .004), 4), h = w * (view.h / view.w);
  setView({ x:view.x + (view.w - w) * fx, y:view.y + (view.h - h) * fy, w, h });
}
function drawScale() {
  const r = svg.getBoundingClientRect();
  if (!r.width) return;
  const kmPerDeg = 111.32 * Math.cos(38.4 * R);
  const kmPerPx = view.w * kmPerDeg / r.width;
  const nice = [1, 2, 5, 10, 20, 50, 100, 200];
  let pick = nice[0];
  for (const n of nice) { pick = n; if (n / kmPerPx >= 62) break; }
  $('#scaleline').style.width = Math.round(pick / kmPerPx) + 'px';
  $('#scaletext').textContent = pick + ' km';
}

function placePins() {
  const r = svg.getBoundingClientRect();
  if (!r.width) return;
  const all = pins.concat(townPins);
  all.forEach((pin) => {
    const q = prj(pin.p.lng, pin.p.lat);
    const px = (q[0] - view.x) / view.w * r.width;
    const py = (-q[1] - view.y) / view.h * r.height;
    const off = px < -60 || px > r.width + 60 || py < -40 || py > r.height + 40;
    pin.node.style.display = off ? 'none' : '';
    pin.node.style.left = px.toFixed(1) + 'px';
    pin.node.style.top = py.toFixed(1) + 'px';
    pin.node.classList.toggle('flip', px > r.width * .6);
  });
  if (routeLayer) routeLayer.setAttribute('stroke-dasharray', (view.w * .011).toFixed(4) + ' ' + (view.w * .0085).toFixed(4));
  layoutLabels();
}

/* 標籤避讓：選取中 > 住宿 > 行程順序 > 城鎮 */
function layoutLabels() {
  const host = pinsBox.getBoundingClientRect();
  if (!host.width) return;
  const rel = (b) => ({ l:b.left - host.left, t:b.top - host.top, r:b.right - host.left, b:b.bottom - host.top });
  const hits = (a, b) => !(a.r < b.l - 3 || a.l > b.r + 3 || a.b < b.t - 3 || a.t > b.b + 3);
  const all = pins.concat(townPins);
  const vis = all.filter((p) => p.node.style.display !== 'none');
  vis.forEach((p) => p.node.classList.remove('nolb'));
  const taken = pins.filter((p) => p.node.style.display !== 'none').map((p) => rel($('.mk', p.node).getBoundingClientRect()));
  vis.map((p, i) => ({ p, i }))
    .sort((a, b) => {
      const s = (x) => (x.p.key === active ? 8 : 0) + (x.p.town ? -4 : 0)
        + (x.p.node.dataset.stay ? 2 : 0) + (x.p.node.classList.contains('lab') ? 1 : 0);
      return s(b) - s(a) || a.i - b.i;
    })
    .forEach(({ p }) => {
      if (!p.node.classList.contains('lab') && p.key !== active) return;
      const box = rel($('.lb', p.node).getBoundingClientRect());
      if (taken.some((t) => hits(box, t))) p.node.classList.add('nolb'); else taken.push(box);
    });
}

/* 拖曳、滾輪與雙指縮放 */
let drag = null, pinchD = 0;
svg.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'touch' && e.isPrimary === false) return;
  drag = { x:e.clientX, y:e.clientY, id:e.pointerId };
  svg.setPointerCapture(e.pointerId); svg.classList.add('drag');
});
svg.addEventListener('pointermove', (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  const r = svg.getBoundingClientRect();
  setView({ x:view.x - (e.clientX - drag.x) / r.width * view.w, y:view.y - (e.clientY - drag.y) / r.height * view.h, w:view.w, h:view.h });
  drag.x = e.clientX; drag.y = e.clientY;
});
const endDrag = (e) => { if (drag && e.pointerId === drag.id) { drag = null; svg.classList.remove('drag'); } };
svg.addEventListener('pointerup', endDrag);
svg.addEventListener('pointercancel', endDrag);
svg.addEventListener('wheel', (e) => { e.preventDefault(); zoom(e.deltaY > 0 ? 1.18 : 1 / 1.18, e.clientX, e.clientY); }, { passive:false });
svg.addEventListener('touchmove', (e) => {
  if (e.touches.length !== 2) return;
  e.preventDefault();
  const a = e.touches[0], b = e.touches[1];
  const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  if (pinchD) zoom(pinchD / dist, (a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2);
  pinchD = dist;
}, { passive:false });
svg.addEventListener('touchend', () => { pinchD = 0; });
$('#zin').onclick = () => zoom(1 / 1.5);
$('#zout').onclick = () => zoom(1.5);
$('#zfit').onclick = () => { if (fitTarget) setView(fitTarget); };

let rt = 0;
addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => fitTo(currentPoints, currentPad), 140); });

/* ── 手機：地圖捲出畫面後浮出按鈕，按下把同一個地圖搬進全螢幕燈箱 ── */
const fab = $('#fab'), mapDlg = $('#mapdlg'), mapDlgBody = $('#mapdlgBody');
const mapWrap = $('.mapwrap'), mapHome = mapWrap.parentElement, mapHomeNext = mapWrap.nextElementSibling;
const isPhone = () => innerWidth < 920;
const mapInDialog = () => mapDlg.contains(mapWrap);
let fabArmed = false;
function openMapDialog() {
  if (mapInDialog()) return;
  const day = DAYS.find((x) => x.id === cur);
  $('#mapdlgLabel').textContent = day ? 'Day ' + day.id + '・' + day.date.slice(0, 5) + '　' + day.title : '全程總覽';
  mapDlg.style.setProperty('--dc', day ? day.color : 'var(--accent)');
  mapDlgBody.appendChild(mapWrap);
  mapDlg.showModal();
  fab.classList.remove('show');
  // 進場動畫期間量到的尺寸不準（標籤會壓到標記），動畫結束後再 fit 一次
  requestAnimationFrame(() => requestAnimationFrame(() => fitTo(currentPoints, currentPad)));
  const refit = () => fitTo(currentPoints, currentPad);
  mapDlg.addEventListener('animationend', refit, { once: true });
  setTimeout(refit, 380);
}
/* 把地圖搬回原位。可重複呼叫；不依賴 dialog 的 close 事件（有些瀏覽器不會發） */
function restoreMap() {
  if (!mapInDialog()) return;
  mapHome.insertBefore(mapWrap, mapHomeNext);
  requestAnimationFrame(() => { fitTo(currentPoints, currentPad); updateFab(); });
}
function closeMapDialog() { if (mapDlg.open) mapDlg.close(); restoreMap(); }
mapDlg.addEventListener('close', restoreMap);
mapDlg.addEventListener('cancel', (e) => { e.preventDefault(); closeMapDialog(); });
mapDlg.addEventListener('click', (e) => { if (e.target === mapDlg) closeMapDialog(); });
$('#mapdlgClose').onclick = closeMapDialog;
fab.onclick = openMapDialog;

/* 地圖整個離開視窗（被捲到頁首上方）才顯示按鈕；桌機與燈箱開啟時不顯示。
   直接量地圖位置，不依賴 IntersectionObserver 的回呼時機 */
function updateFab() {
  const gone = !mapInDialog() && mapBox.getBoundingClientRect().bottom < 0;
  fab.classList.toggle('show', isPhone() && gone && !$('#lb').open);
}
let fabTick = false;
function armFab() {
  if (fabArmed) return; fabArmed = true;
  const onScroll = () => { if (fabTick) return; fabTick = true; requestAnimationFrame(() => { fabTick = false; updateFab(); }); };
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', onScroll);
  updateFab();
}

/* ── 依分頁畫標記與連線 ── */
function renderMap(day) {
  pinsBox.textContent = '';
  routeLayer.textContent = '';
  pins = []; townPins = [];
  const color = day ? day.color : 'var(--accent)';

  BASEMAP.towns.forEach((t) => {
    const node = el('div', 'pin town');
    node.appendChild(el('div', 'mk'));
    node.appendChild(el('div', 'lb', t.n));
    node.setAttribute('aria-hidden', 'true');
    pinsBox.appendChild(node);
    townPins.push({ p:{ lng:t.x, lat:t.y }, node, key:'town:' + t.n, town:true });
  });

  const seq = [], seen = {};
  const push = (key, stay) => { if (seen[key]) return; seen[key] = 1; seq.push({ key, stay }); };
  if (day) day.stops.forEach((s) => push(s.place, s.kind === 'stay'));
  else OVERVIEW_ROUTE.forEach((k) => push(k, PLACES[k].cat === 'stay'));

  const pts = seq.map((s) => PLACES[s.key]);
  if (pts.length > 1) {
    routeLayer.appendChild(shape('path', {
      d: d(pts.map((p) => [p.lng, p.lat])), fill:'none', stroke:color, 'stroke-width':2.2, opacity:.7,
      'stroke-linejoin':'round', 'stroke-linecap':'round', 'vector-effect':'non-scaling-stroke',
    }));
  }
  // 候選餐廳／超市只加標記，不接到主路線上。
  if (day) (day.meals || []).forEach(meal => {
    [...meal.places, ...(meal.backupPlaces || [])].forEach(key => {
      if (!seen[key]) { push(key, PLACES[key].cat === 'stay'); pts.push(PLACES[key]); }
    });
  });
  seq.forEach((s, i) => {
    const p = PLACES[s.key];
    const diningPin = !!DINING.venues[s.key];
    const node = el('div', 'pin' + (s.stay || !day ? ' lab' : ''));
    node.style.setProperty('--pc', color);
    if (s.stay) node.dataset.stay = '1';
    if (diningPin) node.dataset.dining = '1';
    const mk = el('div', 'mk');
    if (s.stay) mk.innerHTML = ico('i-bed');
    else if (diningPin) mk.textContent = p.cat === 'shop' ? '購' : '餐';
    else mk.textContent = String(i + 1);
    node.appendChild(mk);
    node.appendChild(el('div', 'lb', p.name));
    node.tabIndex = 0;
    node.setAttribute('role', 'button');
    node.setAttribute('aria-label', p.name + (diningPin ? '，查看餐食詳細資訊' : '，在行程中檢視'));
    const go = () => {
      if (diningPin) {
        if (mapInDialog()) { closeMapDialog(); setTimeout(() => openDetail(s.key, fab), 60); }
        else openDetail(s.key, node);
        return;
      }
      if (mapInDialog()) { closeMapDialog(); setTimeout(() => focusPlace(s.key, { zoom:true, scroll:true }), 60); }
      else focusPlace(s.key, { zoom:true, scroll:true });
    };
    node.onclick = go;
    node.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } };
    node.style.transitionDelay = Math.min(i * 34, 500) + 'ms';
    pinsBox.appendChild(node);
    pins.push({ p, node, key:s.key });
  });

  currentPoints = pts; currentPad = day ? .34 : .16;
  fitTo(pts, currentPad);

  // 當日路線逐點落下，是這頁唯一一段刻意的動態
  if (!reduced()) {
    mapBox.classList.add('anim');
    requestAnimationFrame(() => requestAnimationFrame(() => mapBox.classList.remove('anim')));
  }
}

let suppressSpy = 0;
function focusPlace(key, opt) {
  opt = opt || {};
  active = key;
  pins.forEach((pin) => {
    const on = pin.key === key;
    pin.node.classList.toggle('on', on);
    if (on) pin.node.classList.remove('nolb');
  });
  document.querySelectorAll('.stop').forEach((n) => n.classList.toggle('on', n.dataset.place === key));
  const p = PLACES[key];
  if (p) {
    const q = prj(p.lng, p.lat), cx = q[0], cy = -q[1];
    const inside = cx > view.x + view.w * .12 && cx < view.x + view.w * .88
                && cy > view.y + view.h * .12 && cy < view.y + view.h * .88;
    if (opt.zoom) {
      const w = Math.min(view.w, .085), h = w * (view.h / view.w);
      setView({ x:cx - w / 2, y:cy - h / 2, w, h });
    } else if (!inside) {
      setView({ x:cx - view.w / 2, y:cy - view.h / 2, w:view.w, h:view.h });
    } else {
      layoutLabels();
    }
  }
  if (opt.scroll) {
    const t = document.querySelector('.stop[data-place="' + CSS.escape(key) + '"]');
    if (t) {
      suppressSpy = Date.now() + 700;
      t.scrollIntoView({ block:'center', behavior: reduced() ? 'auto' : 'smooth' });
    }
  }
}

/* 捲動時自動點亮地圖上對應的點 */
let spy = null;
function startSpy() {
  if (spy) spy.disconnect();
  const topPct = Math.min(70, Math.round(130 / innerHeight * 100) + 6);
  spy = new IntersectionObserver((entries) => {
    if (Date.now() < suppressSpy) return;
    const hit = entries.filter((e) => e.isIntersecting)
      .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
    if (hit) focusPlace(hit.target.dataset.place, {});
  }, { rootMargin: `-${topPct}% 0px -${Math.max(12, 94 - topPct)}% 0px`, threshold:0 });
  document.querySelectorAll('.stop').forEach((n) => spy.observe(n));
}

/* ── 面板 ── */
const panel = $('#panel');

/* ── 詳細燈箱 ── */
const lb = $('#lb'), lbTrack = $('#lbTrack'), lbDots = $('#lbDots'), lbBody = $('#lbBody');
const lbPrev = $('#lbPrev'), lbNext = $('#lbNext');
let lbOpener = null;
function openDetail(key, opener) {
  const p = PLACES[key], d = DETAILS[key];
  if (!p || !d) return;
  lbOpener = opener || document.activeElement;
  const photos = PHOTOS[key] || [];
  // 沒有餐廳照片時直接呈現菜單與訂位資訊，不佔半個螢幕留白。
  lbTrack.closest('.lb-slider').hidden = !!d.dining && photos.length === 0;

  lbTrack.innerHTML = photos.length
    ? photos.map((ph, i) => '<figure><img src="' + esc(ph.src) + '" alt="' + esc(p.name) + '" loading="' + (i ? 'lazy' : 'eager') + '" decoding="async">'
        + '<figcaption>' + esc(ph.credit) + (ph.page ? '・<a href="' + esc(ph.page) + '" target="_blank" rel="noopener">' + (ph.commons ? 'Wikimedia Commons' : '來源') + '</a>' : '') + '</figcaption></figure>').join('')
    : '<div class="lb-nophoto">這個地點沒有可用的免費授權照片。<br>參考連結裡的官方網站有相簿。</div>';
  lbDots.innerHTML = photos.length > 1 ? photos.map((_, i) => '<i' + (i ? '' : ' class="on"') + '></i>').join('') : '';
  lbPrev.hidden = lbNext.hidden = photos.length < 2;

  lbBody.innerHTML = detailBodyHTML(key);

  if (!lb.open) lb.showModal();
  fab.classList.remove('show');
  // dialog 未顯示時設定 scrollLeft 不會生效，要在 showModal 之後、且等版面算好再歸零；
  // scroll-snap 也可能把舊位置吸回去，所以連續兩個 frame 都設一次
  const rewind = () => { lbTrack.scrollTo({ left: 0, behavior: 'auto' }); lbBody.scrollTop = 0; markDot(0); };
  rewind(); requestAnimationFrame(() => { rewind(); requestAnimationFrame(rewind); });
  // file:// 或 data: 來源不允許改網址，失敗就略過，不影響燈箱本身
  try { if (location.hash !== '#p=' + key) history.replaceState(null, '', '#p=' + key); } catch (e) {}
  lb.focus();
}
/* 關閉後的收尾。可重複呼叫；不依賴 dialog 的 close 事件 */
function afterDetailClose() {
  updateFab();
  try { if (/^#p=/.test(location.hash)) history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
  lbTrack.innerHTML = '';
  if (lbOpener && lbOpener.focus && document.contains(lbOpener)) lbOpener.focus();
  lbOpener = null;
}
function closeDetail() { if (lb.open) lb.close(); afterDetailClose(); }
lb.addEventListener('close', afterDetailClose);
lb.addEventListener('cancel', (e) => { e.preventDefault(); closeDetail(); });
lb.addEventListener('click', (e) => { if (e.target === lb) closeDetail(); });
$('#lbClose').onclick = closeDetail;

/* 相片滑動 */
const slideCount = () => lbTrack.children.length;
const curSlide = () => Math.round(lbTrack.scrollLeft / Math.max(1, lbTrack.clientWidth));
const slideTo = (i) => {
  const n = slideCount(); if (!n) return;
  const k = ((i % n) + n) % n;
  lbTrack.scrollTo({ left: k * lbTrack.clientWidth, behavior: reduced() ? 'auto' : 'smooth' });
};
lbPrev.onclick = () => slideTo(curSlide() - 1);
lbNext.onclick = () => slideTo(curSlide() + 1);
const markDot = (i) => [].forEach.call(lbDots.children, (dot, j) => dot.classList.toggle('on', j === i));
lbTrack.addEventListener('scroll', () => markDot(curSlide()), { passive: true });
lb.addEventListener('keydown', (e) => {
  if (e.target.closest && e.target.closest('input,textarea')) return;
  if (e.key === 'ArrowLeft') { e.preventDefault(); slideTo(curSlide() - 1); }
  if (e.key === 'ArrowRight') { e.preventDefault(); slideTo(curSlide() + 1); }
});

/* 網址 #p=地點 直接開燈箱，家人可以分享單一景點 */
function openFromHash() {
  const m = location.hash.match(/^#p=([A-Za-z0-9_]+)$/);
  if (m && DETAILS[m[1]]) openDetail(m[1], null);
  else if (!m) closeDetail();
}
addEventListener('hashchange', openFromHash);

/* ── 分頁 ── */
const tabsBox = $('#tabs');
let cur = 0, firstRender = true;
function buildTabs() {
  const mk = (id, label, color) => {
    const b = el('button', 'tab');
    b.type = 'button';
    b.setAttribute('role', 'tab');
    b.id = 'tab-' + id;
    b.setAttribute('aria-controls', 'panel');
    b.dataset.day = id;
    b.style.setProperty('--tc', color);
    b.appendChild(el('span', 'd'));
    b.appendChild(el('span', null, label));
    b.onclick = () => show(id);
    tabsBox.appendChild(b);
  };
  mk(0, '全程總覽', 'var(--accent)');
  DAYS.forEach((dy) => mk(dy.id, 'Day ' + dy.id + '　' + dy.date.slice(0, 5), dy.color));
}
tabsBox.addEventListener('keydown', (e) => {
  const step = { ArrowRight:1, ArrowLeft:-1, Home:-99, End:99 }[e.key];
  if (step == null) return;
  e.preventDefault();
  const n = DAYS.length + 1;
  const next = step === -99 ? 0 : step === 99 ? n - 1 : Math.min(n - 1, Math.max(0, cur + step));
  show(next);
  $('#tab-' + next).focus();
});

function show(id) {
  cur = id;
  [].forEach.call(tabsBox.children, (b) => {
    const on = +b.dataset.day === id;
    b.setAttribute('aria-selected', String(on));
    b.tabIndex = on ? 0 : -1;
    if (on) b.scrollIntoView({ inline:'nearest', block:'nearest', behavior: reduced() ? 'auto' : 'smooth' });
  });
  const day = DAYS.find((x) => x.id === id) || null;
  panel.innerHTML = day ? dayHTML(day) : overviewHTML();
  if (firstRender) { const n = panel.firstElementChild; if (n) n.classList.add('first'); firstRender = false; }
  panel.setAttribute('aria-labelledby', 'tab-' + id);
  active = null;
  renderMap(day);
  if (!day) restoreChecks();
  panel.querySelectorAll('[data-detail]').forEach((n) => { n.onclick = () => openDetail(n.dataset.detail, n); });
  panel.querySelectorAll('[data-day]').forEach((n) => { n.onclick = () => { show(+n.dataset.day); scrollTo({ top:0, behavior: reduced() ? 'auto' : 'smooth' }); }; });
  panel.querySelectorAll('.stop').forEach((n) => {
    n.addEventListener('click', (e) => { if (e.target.closest('a,button')) return; focusPlace(n.dataset.place, {}); });
  });
  startSpy();
  if (fabArmed) requestAnimationFrame(updateFab);
  try { localStorage.setItem(CONFIG.deploy.name + '.tab', String(id)); } catch (e) {}
}

/* ── 勾選狀態 ── */
function readChecks() { try { return JSON.parse(localStorage.getItem(CONFIG.deploy.name + '.checks') || '{}'); } catch (e) { return {}; } }
function restoreChecks() {
  const saved = readChecks();
  const boxes = panel.querySelectorAll('.checks input');
  const sync = () => {
    const n = [].filter.call(boxes, (b) => b.checked).length;
    $('#ptext').textContent = n + ' / ' + boxes.length;
    $('#pfill').style.transform = 'scaleX(' + (boxes.length ? n / boxes.length : 0) + ')';
  };
  boxes.forEach((box, i) => {
    box.checked = !!saved[i];
    box.onchange = () => {
      const cur2 = readChecks();
      cur2[i] = box.checked;
      try { localStorage.setItem(CONFIG.deploy.name + '.checks', JSON.stringify(cur2)); } catch (e) {}
      sync();
    };
  });
  sync();
}

/* ── 外觀 ── */
function applyTheme(t) {
  if (t) document.documentElement.setAttribute('data-theme', t);
  else document.documentElement.removeAttribute('data-theme');
  try { t ? localStorage.setItem(CONFIG.deploy.name + '.theme', t) : localStorage.removeItem(CONFIG.deploy.name + '.theme'); } catch (e) {}
}
$('#theme').onclick = () => {
  const now = document.documentElement.getAttribute('data-theme');
  const dark = now ? now === 'dark' : matchMedia('(prefers-color-scheme:dark)').matches;
  applyTheme(dark ? 'light' : 'dark');
};
try { const t = localStorage.getItem(CONFIG.deploy.name + '.theme'); if (t) applyTheme(t); } catch (e) {}

/* ── 頁首與地圖註記：全部由 trip.config 與 basemap 的 meta 決定 ── */
function applyChrome() {
  $('#brandTitle').textContent = CONFIG.heading || CONFIG.title;
  $('#brandSub').textContent = CONFIG.subtitle || '';
  const meta = BASEMAP && BASEMAP.meta ? BASEMAP.meta : {};
  const levels = Object.keys(BASEMAP && BASEMAP.contour ? BASEMAP.contour : {}).map(Number).sort((a, b) => a - b);
  const step = levels.length > 1 ? levels[1] - levels[0] : levels[0];
  $('#contourNote').textContent = step ? '等高線 ' + step + ' m' : '';
  // 高程資料來源的標示由 basemap 產出時寫入，引擎不寫死任何地區的機構名稱
  $('#mapCredit').textContent = '© OpenStreetMap' + (meta.demCredit ? '・地形 © ' + meta.demCredit : '');
}

/* ── 啟動 ── */
applyChrome();
drawBase();
buildTabs();
let start = 0;
try { const v = localStorage.getItem(CONFIG.deploy.name + '.tab'); if (v != null && (+v === 0 || DAYS.some((x) => x.id === +v))) start = +v; } catch (e) {}
show(start);
armFab();
openFromHash();
addEventListener('load', () => fitTo(currentPoints, currentPad));
if (document.fonts && document.fonts.ready) document.fonts.ready.then(layoutLabels);
})();
