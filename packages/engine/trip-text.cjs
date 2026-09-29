// AI 可以改的「文字類」共用內容：全程總覽（OVERVIEW）、行前清單（CHECKLIST）、地點備註（PLACES[key].note）。
// 這裡只檢查 AI 新寫的內容格式；已經存下的舊資料不在這裡擋，避免更新引擎後舊行程建不出網站。
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const LIMITS = Object.freeze({ checklistItems: 80, checklistItem: 200, note: 300, text: 400, footParagraph: 600, dayChip: 40 });
const OVERVIEW_FIELDS = new Set(['checked', 'dining', 'stays', 'addonsHint', 'foot', 'reservations']);

function checkReservations(list, trip) {
  if (list === undefined) return [];
  if (!Array.isArray(list)) return ['OVERVIEW.reservations 必須是陣列'];
  const errors = [], ids = new Set();
  if (list.length > 80) errors.push('OVERVIEW.reservations 最多 80 項');
  list.forEach((r, i) => {
    const at = `OVERVIEW.reservations[${i}]`;
    if (!isObject(r)) { errors.push(`${at} 必須是物件`); return; }
    if (Object.keys(r).some(k => !['id', 'place', 'days', 'note'].includes(k))) errors.push(`${at} 只支援 id/place/days/note`);
    if (typeof r.id !== 'string' || !/^[a-z0-9][a-z0-9-]{0,79}$/.test(r.id) || ids.has(r.id)) errors.push(`${at}.id 必須是唯一的小寫英數與連字號代號`);
    ids.add(r.id);
    if (typeof r.place !== 'string' || !r.place.trim()) errors.push(`${at}.place 必須是地點 key`);
    else if (trip && (!Object.hasOwn(trip.PLACES, r.place) || !Object.hasOwn(trip.DETAILS, r.place))) errors.push(`${at}.place 缺地點或詳細說明：${r.place}`);
    if (!Array.isArray(r.days) || !r.days.length || r.days.some(d => !Number.isSafeInteger(d) || d < 1) || new Set(r.days).size !== r.days.length) errors.push(`${at}.days 必須是非空且不重複的天數陣列`);
    else if (trip && r.days.some(id => !trip.DAYS.some(d => d.id === id))) errors.push(`${at}.days 指向不存在的日期`);
    if (typeof r.note !== 'string' || !r.note.trim() || r.note.length > 400) errors.push(`${at}.note 必須是 1–400 字的預約提醒`);
  });
  return errors;
}

function checkOverview(o) {
  const problems = [];
  const text = (v, name, max = LIMITS.text) => {
    if (v === undefined) return;
    if (typeof v !== 'string' || !v.trim()) problems.push(`OVERVIEW.${name} 必須是非空字串`);
    else if (v.length > max) problems.push(`OVERVIEW.${name} 超過 ${max} 字`);
  };
  if (!isObject(o)) return ['OVERVIEW 必須是物件'];
  for (const k of Object.keys(o)) {
    if (/^private/i.test(k)) problems.push(`OVERVIEW 不能有 ${k}：私人資訊只能放 trips/<slug>/docs/`);
    else if (!OVERVIEW_FIELDS.has(k)) problems.push(`OVERVIEW 有不支援的欄位 ${k}`);
  }
  text(o.checked, 'checked', 40);
  text(o.addonsHint, 'addonsHint');
  problems.push(...checkReservations(o.reservations));
  if (o.foot !== undefined) {
    if (!Array.isArray(o.foot)) problems.push('OVERVIEW.foot 必須是字串陣列');
    else o.foot.forEach((p, i) => text(p, `foot[${i}]`, LIMITS.footParagraph));
  }
  if (o.stays !== undefined) {
    if (!isObject(o.stays)) problems.push('OVERVIEW.stays 必須是物件');
    else for (const [k, v] of Object.entries(o.stays)) {
      if (!['title', 'hint', 'arrive', 'depart'].includes(k)) problems.push(`OVERVIEW.stays 有不支援的欄位 ${k}`);
      else text(v, `stays.${k}`);
    }
  }
  if (o.dining !== undefined) {
    const d = o.dining;
    if (!isObject(d)) problems.push('OVERVIEW.dining 必須是物件');
    else {
      for (const k of Object.keys(d)) if (!['hint', 'notes', 'chips'].includes(k)) problems.push(`OVERVIEW.dining 有不支援的欄位 ${k}`);
      text(d.hint, 'dining.hint');
      if (d.notes !== undefined && (!Array.isArray(d.notes) || d.notes.some((n) => typeof n !== 'string' || !n.trim()))) problems.push('OVERVIEW.dining.notes 必須是字串陣列');
      if (d.chips !== undefined && (!Array.isArray(d.chips) || d.chips.some((c) => !isObject(c) || typeof c.label !== 'string' || !c.label.trim() || c.label.length > LIMITS.dayChip
        || !((typeof c.detail === 'string' && c.day === undefined) || (Number.isSafeInteger(c.day) && c.detail === undefined))))) {
        problems.push('OVERVIEW.dining.chips 每項是 { detail: 地點 key, label } 或 { day: 天數, label }');
      }
    }
  }
  return problems;
}

function checkChecklist(list) {
  if (!Array.isArray(list)) return ['CHECKLIST 必須是字串陣列'];
  const problems = [];
  if (list.length > LIMITS.checklistItems) problems.push(`CHECKLIST 最多 ${LIMITS.checklistItems} 項`);
  list.forEach((c, i) => {
    if (typeof c !== 'string' || !c.trim()) problems.push(`CHECKLIST[${i}] 必須是非空字串`);
    else if (c.length > LIMITS.checklistItem) problems.push(`CHECKLIST[${i}] 超過 ${LIMITS.checklistItem} 字：拆成兩項`);
  });
  if (new Set(list).size !== list.length) problems.push('CHECKLIST 有重複的項目');
  return problems;
}

// 行前清單的差異：比較新增與移除的項目，讓預覽看得出 AI 刪掉了什麼。
function checklistDelta(before = [], after = []) {
  const a = new Set(before), b = new Set(after);
  return { added: after.filter((c) => !a.has(c)), removed: before.filter((c) => !b.has(c)) };
}

// 地點備註只能改 data.js 裡已經有的地點，不能新增地點或座標。
function checkPlaceNotes(notes, places) {
  if (!isObject(notes)) return ['placeNotes 必須是物件 { 地點 key: 備註或 null }'];
  const problems = [];
  for (const [key, note] of Object.entries(notes)) {
    if (!isObject(places?.[key])) problems.push(`placeNotes 指向 data.js 沒有的地點：${key}（只能改既有地點的備註，不能新增地點）`);
    else if (note !== null && (typeof note !== 'string' || !note.trim())) problems.push(`placeNotes.${key} 必須是非空字串，或 null 表示刪掉備註`);
    else if (typeof note === 'string' && note.length > LIMITS.note) problems.push(`placeNotes.${key} 超過 ${LIMITS.note} 字`);
  }
  return problems;
}

module.exports = { checkOverview, checkReservations, checkChecklist, checklistDelta, checkPlaceNotes, LIMITS };
