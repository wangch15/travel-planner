// 每輪 AI 上下文都附的「能力說明」與編輯模式共用的額外輸出欄位（住宿指南、私人筆記、能力缺口）。
// Codex 與 Claude／Gemini 共用，確保兩邊的契約一致。
const { SCHEMA_VERSION, parseLiteralModule } = require('@travel-planner/engine');
const { STAY_GUIDE_SPEC } = require('../../../packages/engine/stay-guides.cjs');

const EDIT_MODES = new Set(['discussion', 'edit-day', 'edit-all']);
const string = { type: 'string' };
// 編輯模式的輸出一律多這四個字串欄位；沒有內容就填空字串（structured output 需要全部必填）。
const EDIT_EXTRA_PROPERTIES = Object.freeze({ stayGuidesJson: string, tripEditsJson: string, privateNotes: string, missingCapability: string, handoffPrompt: string });
const EDIT_EXTRA_KEYS = Object.keys(EDIT_EXTRA_PROPERTIES);
const withEditExtras = (schema) => ({ ...schema, properties: { ...schema.properties, ...EDIT_EXTRA_PROPERTIES }, required: [...schema.required, ...EDIT_EXTRA_KEYS] });

const CONTENT_BLOCKS = Object.freeze({
  'days.meta': '每日標題、行程重點、說明、代表色（title/theme/lead/color）',
  'days.stops': '每日停留點與交通（stops），只能引用已有的 PLACES',
  'days.alts': '當天可以怎麼換（alts：title/body/places）',
  'days.cautions': '出發前要確認的事（cautions）',
  stayGuides: '住宿指南／共用清單（STAY_GUIDES）：入住與停車步驟、重要警示、圖片、採買／餐飲／泡湯／自訂分類清單',
  overview: '全程總覽頁的文字（OVERVIEW：checked 查核日期、stays 住宿段標題與說明、dining 餐食段說明與按鈕、addonsHint、foot 頁尾段落）',
  checklist: '行前需要補齊的資料（data.js 的 CHECKLIST 字串陣列；dining.js 的餐飲待辦不在這裡，唯讀）',
  'places.note': '既有地點的一句話備註（PLACES[key].note）；不能改名稱、座標、分類，也不能新增地點',
});
const READ_ONLY = Object.freeze(['PLACES 的名稱、座標、分類與新增地點', 'details.js 地點說明', 'dining.js 餐飲', 'STAYS 住宿區間', 'map-lists.js', 'photos.json 地點照片', 'trip.config.json', 'OVERVIEW／ADDONS／CHECKLIST', 'theme.css／extra.js']);

// edit-day 只改那一天、住宿指南與地點備註；全程總覽與行前清單要在整趟模式改。
function aiCapabilities(mode) {
  const editable = mode === 'edit-day' ? ['days.meta', 'days.stops', 'days.alts', 'days.cautions', 'stayGuides', 'places.note']
    : EDIT_MODES.has(mode) ? Object.keys(CONTENT_BLOCKS) : [];
  return { schemaVersion: SCHEMA_VERSION, contentBlocks: CONTENT_BLOCKS, editable, readOnly: READ_ONLY, stayGuideSpec: STAY_GUIDE_SPEC };
}

// 住宿指南需要的最小上下文：住宿、既有指南，以及指南能引用的地點名稱。
// 總覽、清單、備註要看 data.js 原本的樣子（載入後的 CHECKLIST 已併入餐飲待辦，不能拿來改）。
function textContext(snapshot) {
  let data = {};
  try { data = parseLiteralModule(snapshot.dataSource || ''); } catch { data = {}; }
  const dining = new Set(Object.keys(snapshot.trip?.DINING?.places || {}));
  return {
    overview: data.OVERVIEW || {},
    checklist: Array.isArray(data.CHECKLIST) ? data.CHECKLIST : [],
    diningChecklist: snapshot.trip?.DINING?.checklist || [],
    placeNotes: Object.fromEntries(Object.entries(data.PLACES || {}).filter(([k]) => !dining.has(k))
      .map(([k, p]) => [k, { name: p?.name, cat: p?.cat, ...(p?.note ? { note: p.note } : {}) }])),
  };
}

function guideContext(snapshot, attachments = []) {
  const trip = snapshot.trip || {};
  const places = trip.PLACES || {};
  const guides = Array.isArray(trip.STAY_GUIDES) ? trip.STAY_GUIDES : [];
  const keys = new Set([...(trip.STAYS || []).map((s) => s.place), ...guides.flatMap((g) => [g.stay, ...(g.lists || []).flatMap((l) => (l.items || []).map((i) => i.place))])]);
  return {
    stays: (trip.STAYS || []).map((s) => ({ place: s.place, name: places[s.place]?.name, day: s.day, nights: s.nights, range: s.range })),
    stayGuides: guides,
    guidePlaces: Object.fromEntries([...keys].filter((k) => k && places[k]).map((k) => [k, { name: places[k].name, cat: places[k].cat }])),
    imageAttachments: attachments.filter((a) => a?.kind === 'image' && typeof a.id === 'string').map((a) => ({ id: a.id, name: String(a.name || '圖片').slice(0, 200) })),
    ...textContext(snapshot),
  };
}

const GUIDE_INSTRUCTIONS = '住宿指南：同一住宿連住多天的房東資訊（入住方式、停車、周邊採買／餐飲／泡湯推薦）寫進 stayGuidesJson，不要塞進 alts.body 或 lead 變成長段落；指南不新增 stops、不改每日時間。stayGuidesJson 是 JSON 陣列字串，每個元素是一份要新增或整份取代的完整指南（格式見 capabilities.stayGuideSpec，既有內容見 stayGuides），要刪除一份指南就放 {"id":"…","remove":true}；沒有改指南就填空字串。警示只放漏看會出事的（level:warn 最多 3 則），其他補充用 level:info，已寫在步驟裡的不要重複成警示，「推薦只是候選」這類說明頁面已經有、不要寫；每一家店各自一個 item，有穩定 id，來源和整份指南相同就不要逐項填 source，tags 只放 summary 裡沒有的特色；不知道的欄位省略，不捏造座標、營業時間、價格或交通時間；房東推薦用 source.type=host，只有真的查到的 fact 才填 checked；網址放 links，不要寫在文字裡。圖片：用 imageAttachments 裡的圖片時，images 的元素寫 {"id","attachment":"附件 id","alt","caption"}，App 會存成檔案。把既有長文搬進指南時，要在同一輪同時修改那一天（移除或縮短原文）並保留所有資訊與連結，App 會先給使用者預覽再保存。全程總覽、行前清單、地點備註：改這些時填 tripEditsJson，是 JSON 物件字串，只放要改的部分：overview（整份新的 OVERVIEW 物件，沒要改的欄位照原樣保留，既有內容見 overview）、checklist（整份新的行前清單字串陣列，先比對既有的 checklist，還沒完成或沒被取代的事項一定要保留，只刪真的過時的；diningChecklist 是餐飲待辦、唯讀、不要重複寫進來）、placeNotes（{地點 key: 新備註，或 null 刪掉備註}，只能用 placeNotes 裡已有的 key，不能新增地點或改座標）；沒有要改就填空字串。已告知不等於已預約、已完成，不要把「已告知房東」寫成「已確認車位」。刪掉行前清單項目時 App 會先給使用者看過才保存。privateNotes：門鎖或保險箱密碼、Wi-Fi 密碼、訂房碼、電話、Email 等私人資訊只寫這裡（純文字），App 存到私人筆記，不進網站；沒有就填空字串。missingCapability／handoffPrompt：使用者要的東西超出 capabilities.editable 或 stayGuideSpec 支援的欄位時，不要自創欄位、也不要改寫成長篇文字硬塞，missingCapability 用一兩句說明缺什麼功能，handoffPrompt 寫一段可以直接交給模板作者或開發用 AI 的繁體中文需求說明（要做什麼、為什麼、驗收方式）；做得到就兩個都填空字串。這兩個欄位會變成公開的 GitHub issue：不要寫行程名稱、住宿或店名、地址、日期、人名、訂房或私人資訊，改用通用描述（例如「某間連住三晚的民宿」）。';

const invalid = () => Object.assign(Error('AI_OUTPUT_INVALID'), { code: 'AI_OUTPUT_INVALID' });

// 解析四個額外欄位；格式不對就整輪視為無效，不猜測。
function decodeEditExtras(answer) {
  for (const key of EDIT_EXTRA_KEYS) if (answer[key] !== undefined && typeof answer[key] !== 'string') throw invalid();
  const out = {};
  const raw = (answer.stayGuidesJson || '').trim();
  if (raw && raw !== '[]') {
    let guides;
    try { guides = JSON.parse(raw); } catch { throw invalid(); }
    if (!Array.isArray(guides) || !guides.length || guides.length > 20
      || guides.some((g) => !g || typeof g !== 'object' || Array.isArray(g) || typeof g.id !== 'string' || !g.id)
      || new Set(guides.map((g) => g.id)).size !== guides.length) throw invalid();
    out.stayGuides = guides;
  }
  const tripRaw = (answer.tripEditsJson || '').trim();
  if (tripRaw && tripRaw !== '{}') {
    let edits;
    try { edits = JSON.parse(tripRaw); } catch { throw invalid(); }
    const plain = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
    if (!plain(edits) || Object.keys(edits).some((k) => !['overview', 'checklist', 'placeNotes'].includes(k))
      || (edits.overview !== undefined && !plain(edits.overview)) || (edits.checklist !== undefined && !Array.isArray(edits.checklist))
      || (edits.placeNotes !== undefined && !plain(edits.placeNotes))) throw invalid();
    if (Object.keys(edits).length) out.tripEdits = edits;
  }
  const notes = (answer.privateNotes || '').trim();
  if (notes.length > 8000) throw invalid();
  if (notes) out.privateNotes = notes;
  const missing = (answer.missingCapability || '').trim(), handoff = (answer.handoffPrompt || '').trim();
  if (missing.length > 2000 || handoff.length > 8000) throw invalid();
  if (missing) out.capabilityGap = { missing, handoffPrompt: handoff };
  return out;
}

// 把能力缺口接在助手回覆後面，使用者可以直接複製交接提示詞。
function capabilityGapText(gap) {
  if (!gap) return '';
  return `\n\n**目前還做不到：**${gap.missing}` + (gap.handoffPrompt ? `\n\n可以把下面這段交給模板作者或開發用的 AI：\n\n\`\`\`text\n${gap.handoffPrompt}\n\`\`\`` : '');
}

module.exports = { aiCapabilities, guideContext, textContext, withEditExtras, decodeEditExtras, capabilityGapText, EDIT_EXTRA_KEYS, EDIT_MODES, GUIDE_INSTRUCTIONS };
