// 每輪 AI 上下文都附的「能力說明」與編輯模式共用的額外輸出欄位（住宿指南、私人筆記、能力缺口）。
// Codex 與 Claude／Gemini 共用，確保兩邊的契約一致。
const { SCHEMA_VERSION } = require('@travel-planner/engine');
const { STAY_GUIDE_SPEC } = require('../../../packages/engine/stay-guides.cjs');

const EDIT_MODES = new Set(['discussion', 'edit-day', 'edit-all']);
const string = { type: 'string' };
// 編輯模式的輸出一律多這四個字串欄位；沒有內容就填空字串（structured output 需要全部必填）。
const EDIT_EXTRA_PROPERTIES = Object.freeze({ stayGuidesJson: string, privateNotes: string, missingCapability: string, handoffPrompt: string });
const EDIT_EXTRA_KEYS = Object.keys(EDIT_EXTRA_PROPERTIES);
const withEditExtras = (schema) => ({ ...schema, properties: { ...schema.properties, ...EDIT_EXTRA_PROPERTIES }, required: [...schema.required, ...EDIT_EXTRA_KEYS] });

const CONTENT_BLOCKS = Object.freeze({
  'days.meta': '每日標題、行程重點、說明、代表色（title/theme/lead/color）',
  'days.stops': '每日停留點與交通（stops），只能引用已有的 PLACES',
  'days.alts': '當天可以怎麼換（alts：title/body/places）',
  'days.cautions': '出發前要確認的事（cautions）',
  stayGuides: '住宿指南／共用清單（STAY_GUIDES）：入住與停車步驟、重要警示、圖片、採買／餐飲／泡湯／自訂分類清單',
});
const READ_ONLY = Object.freeze(['PLACES（新增地點與座標）', 'details.js 地點說明', 'dining.js 餐飲', 'STAYS 住宿區間', 'map-lists.js', 'photos.json 地點照片', 'trip.config.json', 'OVERVIEW／ADDONS／CHECKLIST', 'theme.css／extra.js']);

function aiCapabilities(mode) {
  const editable = mode === 'edit-day' ? ['days.meta', 'days.stops', 'days.alts', 'days.cautions', 'stayGuides']
    : EDIT_MODES.has(mode) ? Object.keys(CONTENT_BLOCKS) : [];
  return { schemaVersion: SCHEMA_VERSION, contentBlocks: CONTENT_BLOCKS, editable, readOnly: READ_ONLY, stayGuideSpec: STAY_GUIDE_SPEC };
}

// 住宿指南需要的最小上下文：住宿、既有指南，以及指南能引用的地點名稱。
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
  };
}

const GUIDE_INSTRUCTIONS = '住宿指南：同一住宿連住多天的房東資訊（入住方式、停車、周邊採買／餐飲／泡湯推薦）寫進 stayGuidesJson，不要塞進 alts.body 或 lead 變成長段落；指南不新增 stops、不改每日時間。stayGuidesJson 是 JSON 陣列字串，每個元素是一份要新增或整份取代的完整指南（格式見 capabilities.stayGuideSpec，既有內容見 stayGuides），要刪除一份指南就放 {"id":"…","remove":true}；沒有改指南就填空字串。警示只放漏看會出事的（level:warn 最多 3 則），其他補充用 level:info，已寫在步驟裡的不要重複成警示，「推薦只是候選」這類說明頁面已經有、不要寫；每一家店各自一個 item，有穩定 id，來源和整份指南相同就不要逐項填 source，tags 只放 summary 裡沒有的特色；不知道的欄位省略，不捏造座標、營業時間、價格或交通時間；房東推薦用 source.type=host，只有真的查到的 fact 才填 checked；網址放 links，不要寫在文字裡。圖片：用 imageAttachments 裡的圖片時，images 的元素寫 {"id","attachment":"附件 id","alt","caption"}，App 會存成檔案。把既有長文搬進指南時，要在同一輪同時修改那一天（移除或縮短原文）並保留所有資訊與連結，App 會先給使用者預覽再保存。privateNotes：門鎖或保險箱密碼、Wi-Fi 密碼、訂房碼、電話、Email 等私人資訊只寫這裡（純文字），App 存到私人筆記，不進網站；沒有就填空字串。missingCapability／handoffPrompt：使用者要的東西超出 capabilities.editable 或 stayGuideSpec 支援的欄位時，不要自創欄位、也不要改寫成長篇文字硬塞，missingCapability 用一兩句說明缺什麼功能，handoffPrompt 寫一段可以直接交給模板作者或開發用 AI 的繁體中文需求說明（要做什麼、為什麼、驗收方式）；做得到就兩個都填空字串。';

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

module.exports = { aiCapabilities, guideContext, withEditExtras, decodeEditExtras, capabilityGapText, EDIT_EXTRA_KEYS, EDIT_MODES, GUIDE_INSTRUCTIONS };
