// 住宿指南在桌面 App 的整條路：AI 回覆解碼 → 提案（含附件圖片）→ 預覽 → 保存 → 版本回復 → 匯出匯入 → 發布檔案。
// 資料全是合成的（_example 的虛構民宿、example.invalid 網址）。
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { parseLiteralModule } = require('@travel-planner/engine');
const { ProposalStore } = require('../proposals.cjs');
const { VersionStore } = require('../version-store.cjs');
const { buildPreview } = require('../preview.cjs');
const { publicationOutput } = require('../publication-output.cjs');
const { changesBetween, selectChanges, lostLinks } = require('../proposal-diff.cjs');
const { resolveGuideAttachments } = require('../services/guide-assets.cjs');
const { LocalArchiveService, allowed } = require('../services/local-archive.cjs');
const { decodeAnswer } = require('../codex/editor.cjs');
const { aiCapabilities, guideContext, capabilityGapText } = require('../codex/capabilities.cjs');
const { replaceStayGuides } = require('../../../packages/engine/guide-edit.cjs');

// 最小的 PNG 檔頭（簽章＋IHDR），足以通過副檔名與內容一致的檢查。
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('0000000d49484452000000010000000108060000001f15c489', 'hex')]);
const guide = (over = {}) => ({
  id: 'inn-a-guide', stay: 'innA', days: [1, 2, 3], source: { type: 'host', label: '房東提供' },
  alerts: [{ id: 'gate', text: '大門 22:00 後上鎖。', level: 'warn' }],
  sections: [{ id: 'checkin', kind: 'checkin', steps: ['15:00 後入住。'] }, { id: 'parking', kind: 'parking', steps: ['停在後方第 2 格。'] }],
  lists: [
    { id: 'shopping', kind: 'shopping', items: [{ id: 'super-a', name: '範例超市', links: [{ kind: 'official', label: '官網', url: 'https://example.invalid/super' }] }] },
    { id: 'dining', kind: 'dining', items: [{ id: 'ramen-a', name: '範例拉麵' }] },
    { id: 'onsen', kind: 'onsen', items: [{ id: 'onsen-a', name: '範例湯屋' }] },
  ],
  ...over,
});

async function fixture(t) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'travel-guide-')));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.cp(path.resolve(__dirname, '../../../trips/_example'), path.join(root, 'trips/sample'), { recursive: true });
  const baseline = await buildPreview(root, 'sample');
  const target = { projectId: 'fixture-project', root, slug: 'sample' };
  const store = new ProposalStore(path.join(root, 'app-state'), { checkPrivate: async () => {} });
  return { root, baseline, target, store, sourceFile: path.join(root, 'trips/sample/data.js') };
}

test('AI 只新增住宿指南時：提案不動任何一天，保存後 10/11–10/13 三天都有同一份入口', async t => {
  const f = await fixture(t);
  const proposal = f.store.create(f.target, f.baseline, null, { summary: '整理房東資訊', stayGuides: [guide()] });
  assert.equal(proposal.changed, true);
  assert.equal(proposal.migration, false);
  assert.deepEqual(proposal.changes.map(c => c.key), ['guide:inn-a-guide']);
  assert.match(proposal.changes[0].after, /採買 1 項：範例超市/);
  f.store.markViewed(proposal.previewUrl);
  await f.store.apply(proposal.id, f.target);
  const saved = parseLiteralModule(await fs.readFile(f.sourceFile, 'utf8'));
  assert.deepEqual(saved.DAYS, parseLiteralModule(f.baseline.snapshot.dataSource).DAYS, '時間軸原封不動');
  const after = await buildPreview(f.root, 'sample');
  assert.match(after.read('/index.html').body, /"id":"inn-a-guide"/);
  assert.equal(after.snapshot.contextDigest, f.baseline.snapshot.contextDigest, '指南屬於可回復的版本範圍，不改變其他脈絡');
});

test('附件圖片：預覽直接看得到，保存時才寫進 photos/，發布檔案也帶上它', async t => {
  const f = await fixture(t);
  const withImage = guide({ images: [{ id: 'parking-map', file: 'guide-inn-a-guide-parking-map.png', alt: '停車位置圖' }], sections: [{ id: 'parking', kind: 'parking', steps: ['停後方。'], images: ['parking-map'] }] });
  const proposal = f.store.create(f.target, f.baseline, null, { summary: '加停車圖', stayGuides: [withImage] }, { assets: [{ file: 'guide-inn-a-guide-parking-map.png', bytes: PNG }] });
  assert.deepEqual(proposal.newImages, ['guide-inn-a-guide-parking-map.png']);
  assert.equal(f.store.pending.artifact.read('/img/guide-inn-a-guide-parking-map.png').type, 'image/png');
  const imageFile = path.join(f.root, 'trips/sample/photos/guide-inn-a-guide-parking-map.png');
  await assert.rejects(fs.access(imageFile), '還沒保存就不寫檔');
  f.store.markViewed(proposal.previewUrl);
  await f.store.apply(proposal.id, f.target);
  assert.deepEqual(await fs.readFile(imageFile), PNG);
  const out = publicationOutput(await buildPreview(f.root, 'sample'));
  assert.ok(out.files.has('img/guide-inn-a-guide-parking-map.png'), '發布檔案包含指南圖片');
});

test('圖片內容與副檔名不符就不收；保存時同名檔內容不同就不覆蓋', async t => {
  const f = await fixture(t);
  const withImage = guide({ images: [{ id: 'map', file: 'guide-x.png', alt: '圖' }] });
  assert.throws(() => f.store.create(f.target, f.baseline, null, { summary: 'x', stayGuides: [withImage] }, { assets: [{ file: 'guide-x.png', bytes: Buffer.from('not an image at all') }] }), { code: 'INVALID_ASSET' });
  const proposal = f.store.create(f.target, f.baseline, null, { summary: 'x', stayGuides: [withImage] }, { assets: [{ file: 'guide-x.png', bytes: PNG }] });
  await fs.mkdir(path.join(f.root, 'trips/sample/photos'), { recursive: true });
  const other = Buffer.concat([PNG, Buffer.from('different')]);
  await fs.writeFile(path.join(f.root, 'trips/sample/photos/guide-x.png'), other);
  f.store.markViewed(proposal.previewUrl);
  await assert.rejects(f.store.apply(proposal.id, f.target), { code: 'ASSET_CONFLICT' });
  assert.deepEqual(await fs.readFile(path.join(f.root, 'trips/sample/photos/guide-x.png')), other);
  assert.equal(await fs.readFile(f.sourceFile, 'utf8'), f.baseline.snapshot.dataSource);
});

test('把第一天長文搬進指南：標成搬移提案、列出不見的連結，可只選其中一部分', async t => {
  const f = await fixture(t);
  const days = parseLiteralModule(f.baseline.snapshot.dataSource).DAYS;
  const longText = '房東說：入住 15:00 後，停車在後方。超市 https://example.invalid/super 很近，拉麵 https://example.invalid/ramen 好吃。';
  const withAlt = { ...days[0], alts: [...(days[0].alts || []), { title: '房東資訊', body: longText }] };
  const edited = f.store.create(f.target, f.baseline, 1, { summary: 'seed', replacementDay: withAlt });
  // App 自動保存時會把「需要查核」改成提醒（applyPendingNow），這裡照做。
  f.store.pending.requiresResearch = false;
  f.store.markViewed(edited.previewUrl); await f.store.apply(edited.id, f.target);
  const baseline = await buildPreview(f.root, 'sample');
  const migrated = f.store.create(f.target, baseline, null, { summary: '搬進指南', replacementDays: [days[0]], stayGuides: [guide()] });
  assert.equal(migrated.migration, true, '同時改日程與指南＝搬移，先預覽再保存');
  assert.equal(migrated.requiresResearch, false, '只搬備案文字、停留點沒變，不用先查核');
  const movedStops = structuredClone(days[0]); movedStops.stops[0].time = '12:30';
  f.store.discard();
  assert.equal(f.store.create(f.target, baseline, null, { summary: '搬移並改時間', replacementDays: [movedStops], stayGuides: [guide()] }).requiresResearch, true, '停留點變了仍要查核');
  f.store.discard();
  const migratedId = f.store.create(f.target, baseline, null, { summary: '搬進指南', replacementDays: [days[0]], stayGuides: [guide()] }).id;
  assert.deepEqual(migrated.lostLinks, ['https://example.invalid/ramen'], '拉麵連結沒有搬過去，要提醒');
  assert.deepEqual(new Set(migrated.changes.map(c => c.key)), new Set(['1:route', 'guide:inn-a-guide']));
  const onlyGuide = f.store.select(migratedId, ['guide:inn-a-guide']);
  assert.equal(onlyGuide.migration, false);
  const partial = parseLiteralModule(f.store.pending.source);
  assert.equal(partial.DAYS[0].alts.at(-1).body, longText, '沒勾的日程保留原文');
  assert.equal(partial.DAYS[0].id, 1);
  assert.equal(partial.DAYS[0].date, days[0].date);
  assert.equal(partial.STAY_GUIDES[0].id, 'inn-a-guide');
});

test('保存指南後可從版本紀錄一鍵回到修改前（脈絡雜湊不變，不需要人工對帳）', async t => {
  const f = await fixture(t);
  const versions = new VersionStore(path.join(f.root, 'app-state'));
  f.store.beforeWrite = async p => { await versions.observe(p.target, { source: p.originalSource, contextDigest: p.contextDigest }); return versions.prepare(p.target, { beforeSource: p.originalSource, afterSource: p.source, contextDigest: p.contextDigest, label: p.label, kind: p.kind }); };
  f.store.afterWrite = (p, id) => versions.finish(p.target, id, p.source);
  // 帶一張新圖片：圖片檔不能讓版本紀錄以為「別的資料被改了」而要求人工對帳。
  const withImage = guide({ images: [{ id: 'map', file: 'guide-inn-a-guide-map.png', alt: '停車圖' }] });
  const proposal = f.store.create(f.target, f.baseline, null, { summary: '指南', stayGuides: [withImage] }, { assets: [{ file: 'guide-inn-a-guide-map.png', bytes: PNG }] });
  f.store.markViewed(proposal.previewUrl);
  const result = await f.store.apply(proposal.id, f.target);
  assert.equal(result.versionRecorded, true);
  const saved = await buildPreview(f.root, 'sample');
  assert.equal(saved.snapshot.contextDigest, f.baseline.snapshot.contextDigest);
  await versions.observe(f.target, { source: saved.snapshot.dataSource, contextDigest: saved.snapshot.contextDigest });
  const history = await versions.read(f.target);
  assert.equal(history.revisions.length, 2);
  const restore = f.store.createSource(f.target, saved, history.revisions[0].source, { kind: 'restore', label: '回到 V1' });
  assert.deepEqual(restore.changes.map(c => c.key), ['guide:inn-a-guide']);
  assert.match(restore.changes[0].label, /刪除/);
  f.store.markViewed(restore.previewUrl);
  await f.store.apply(restore.id, f.target);
  assert.equal(await fs.readFile(f.sourceFile, 'utf8'), f.baseline.snapshot.dataSource);
});

test('沒勾選的指南維持原樣；其他資料被改動時照舊拒絕', () => {
  const base = replaceStayGuides('const DAYS = [];\nmodule.exports = { DAYS };\n', [guide(), guide({ id: 'inn-b-guide', stay: 'innB' })]).source;
  const full = replaceStayGuides(base, [guide({ title: '改過' })]).source;
  assert.deepEqual(changesBetween(base, full).map(c => c.key).sort(), ['guide:inn-a-guide', 'guide:inn-b-guide']);
  const kept = parseLiteralModule(selectChanges(base, full, ['guide:inn-a-guide'])).STAY_GUIDES;
  assert.deepEqual(kept.map(g => [g.id, g.title]), [['inn-a-guide', '改過'], ['inn-b-guide', undefined]]);
  assert.deepEqual(lostLinks('a https://x.invalid/1 b', 'https://x.invalid/1'), []);
  const other = 'const DAYS = [];\nconst PLACES = {};\nmodule.exports = { DAYS, PLACES };\n';
  assert.throws(() => changesBetween(other, other.replace('PLACES = {}', 'PLACES = { a: 1 }')), { code: 'UNSUPPORTED_DAY_CHANGE' });
});

test('附件圖片換成專案檔名：只收本輪附件，內容被換掉就拒絕', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'guide-att-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'a.bin'); await fs.writeFile(file, PNG);
  const ref = { id: 'att-1', kind: 'image', mime: 'image/png', size: PNG.length, sha256: createHash('sha256').update(PNG).digest('hex'), localPath: file };
  const input = [guide({ images: [{ id: 'Parking Map', attachment: 'att-1', alt: '停車圖' }] })];
  const { guides, assets } = await resolveGuideAttachments(input, [ref]);
  assert.deepEqual(guides[0].images, [{ id: 'Parking Map', alt: '停車圖', file: 'guide-inn-a-guide-parking-map.png' }]);
  assert.deepEqual(assets.map(a => a.file), ['guide-inn-a-guide-parking-map.png']);
  await assert.rejects(resolveGuideAttachments(input, []), { code: 'GUIDE_IMAGE_ATTACHMENT_MISSING' });
  const clash = [guide({ images: [{ id: 'Map', attachment: 'att-1', alt: 'a' }, { id: 'map', attachment: 'att-2', alt: 'b' }] })];
  await assert.rejects(resolveGuideAttachments(clash, [ref, { ...ref, id: 'att-2' }]), { code: 'GUIDE_IMAGE_ID_COLLISION' });
  const reused = [guide({ images: [{ id: 'map', attachment: 'att-1', alt: 'a' }]}), guide({ id: 'inn-a', images: [{ id: 'guide-map', attachment: 'att-1', alt: 'a' }] })];
  assert.equal((await resolveGuideAttachments(reused, [ref])).assets.length, 1, '同一張附件換算成同名檔可以共用');
  await assert.rejects(resolveGuideAttachments(input, [{ ...ref, sha256: '0'.repeat(64) }]), { code: 'ATTACHMENT_CHANGED' });
});

test('私人匯出／匯入保留指南圖片；不合規的檔名照舊擋下', async t => {
  assert.equal(allowed('photos/guide-inn-a-parking.webp'), true);
  assert.equal(allowed('photos/parking.png'), false);
  const f = await fixture(t);
  await fs.mkdir(path.join(f.root, 'trips/sample/photos'), { recursive: true });
  await fs.writeFile(path.join(f.root, 'trips/sample/photos/guide-inn-a-map.png'), PNG);
  await fs.writeFile(f.sourceFile, replaceStayGuides(f.baseline.snapshot.dataSource, [guide({ images: [{ id: 'map', file: 'guide-inn-a-map.png', alt: '圖' }] })]).source);
  const archives = new LocalArchiveService({ checkPrivate: async () => true });
  const outDir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'guide-archive-')));
  t.after(() => fs.rm(outDir, { recursive: true, force: true }));
  const out = path.join(outDir, 'sample.travel-planner.json');
  await archives.exportTrip({ root: f.root, slug: 'sample' }, out);
  const imported = await archives.importTrip(f.root, out, { title: '匯入測試' });
  const copy = await buildPreview(f.root, imported.slug);
  assert.equal(copy.snapshot.trip.STAY_GUIDES[0].id, 'inn-a-guide');
  assert.ok(copy.read('/img/guide-inn-a-map.png'));
});

test('AI 契約：每輪附 schemaVersion、可編輯範圍與既有指南；解碼指南、私人筆記與能力缺口', () => {
  const caps = aiCapabilities('edit-all');
  assert.equal(caps.schemaVersion, 1);
  assert.ok(caps.editable.includes('stayGuides'));
  assert.deepEqual(aiCapabilities('research').editable, []);
  const ctx = guideContext({ trip: { PLACES: { innA: { name: '民宿', cat: 'stay' } }, STAYS: [{ place: 'innA', day: 1, nights: 3, range: 'r' }], STAY_GUIDES: [guide()] } }, [{ id: 'att-1', kind: 'image', name: 'map.png' }, { id: 't', kind: 'text' }]);
  assert.deepEqual(ctx.imageAttachments, [{ id: 'att-1', name: 'map.png' }]);
  assert.deepEqual(ctx.guidePlaces, { innA: { name: '民宿', cat: 'stay' } });
  const onlyGuide = decodeAnswer(JSON.stringify({ summary: '好', replacementDaysJson: '', stayGuidesJson: JSON.stringify([guide()]), privateNotes: '門鎖 1234', missingCapability: '', handoffPrompt: '' }), { mode: 'discussion' });
  assert.equal(onlyGuide.discussion, undefined, '只改指南也算修改，不是單純討論');
  assert.equal(onlyGuide.stayGuides[0].id, 'inn-a-guide');
  assert.equal(onlyGuide.privateNotes, '門鎖 1234');
  const editDay = decodeAnswer(JSON.stringify({ summary: '好', replacementDayJson: '', stayGuidesJson: JSON.stringify([guide()]), privateNotes: '', missingCapability: '', handoffPrompt: '' }), { mode: 'edit-day' });
  assert.equal(editDay.replacementDay, undefined);
  const gap = decodeAnswer(JSON.stringify({ summary: '做不到', replacementDaysJson: '', stayGuidesJson: '', privateNotes: '', missingCapability: '指南還不支援菜單照片輪播。', handoffPrompt: '請新增 menuPhotos 欄位…', reportKind: 'feature' }), { mode: 'discussion' });
  assert.equal(gap.capabilityGap.kind, 'feature');
  assert.throws(() => decodeAnswer(JSON.stringify({ summary: 'x', replacementDaysJson: '', missingCapability: 'y', reportKind: 'urgent' }), { mode: 'discussion' }), { code: 'AI_OUTPUT_INVALID' });
  assert.equal(gap.discussion, true);
  assert.match(capabilityGapText(gap.capabilityGap), /目前還做不到：\*\*指南還不支援菜單照片輪播。[\s\S]*menuPhotos/);
  assert.throws(() => decodeAnswer(JSON.stringify({ summary: 'x', replacementDaysJson: '', stayGuidesJson: '{"id":1}' }), { mode: 'discussion' }), { code: 'AI_OUTPUT_INVALID' });
  assert.throws(() => decodeAnswer(JSON.stringify({ summary: 'x', replacementDaysJson: '', stayGuidesJson: JSON.stringify([guide(), guide()]) }), { mode: 'discussion' }), { code: 'AI_OUTPUT_INVALID' });
});

test('AI 自創欄位或把私人欄位塞進指南：資料檢查擋下並說出原因', async t => {
  const f = await fixture(t);
  assert.throws(() => f.store.create(f.target, f.baseline, null, { summary: 'x', stayGuides: [guide({ privateNotes: '1234' })] }), e => e.code === 'INVALID_CANDIDATE' && e.problems.some(p => /privateNotes/.test(p)));
  const noisy = guide({ alerts: Array.from({ length: 5 }, (_, i) => ({ id: 'w' + i, text: '注意' + i })) });
  assert.throws(() => f.store.create(f.target, f.baseline, null, { summary: 'x', stayGuides: [noisy] }), e => e.code === 'INVALID_CANDIDATE' && e.problems.some(p => /最多 3 則/.test(p)), 'AI 新寫的指南警示太多要自己精簡');
  const invented = guide(); invented.lists[0].items[0].hours = '9-21';
  assert.throws(() => f.store.create(f.target, f.baseline, null, { summary: 'x', stayGuides: [invented] }), e => e.problems.some(p => /不支援的欄位 hours/.test(p)));
});

test('一鍵搬移的提議：只挑像房東資訊的長備案，雨天備案與沒有住宿的行程不提', () => {
  const { guideSuggestions, guideSuggestion } = require('../services/guide-suggestions.cjs');
  const host = '房東說：15:00 後入住，停車在後方。' + '附近超市與溫泉資訊。'.repeat(12);
  const rain = '下雨的話改去室內的博物館，館內有常設展與特展可以看，逛完再到附近咖啡店休息。'.repeat(3);
  const trip = { PLACES: { innA: { cat: 'stay' } }, STAYS: [{ place: 'innA' }],
    DAYS: [{ id: 1, date: '10/11（日）', alts: [{ title: '下雨版', body: rain }, { title: '房東資訊', body: host }, { title: '短的', body: '房東說停後面' }] }, { id: 2, date: '10/12（一）', alts: [] }] };
  const found = guideSuggestions(trip);
  assert.deepEqual(found.map(s => [s.dayId, s.date, s.title]), [[1, '10/11', '房東資訊']]);
  assert.match(guideSuggestion(trip).request, /第 1 天備案「房東資訊」.*每一項資訊與連結都要保留.*不要改動其他天或時間/);
  assert.deepEqual(guideSuggestions({ ...trip, STAYS: [] }), []);
  assert.equal(guideSuggestion({ ...trip, STAYS: [] }), null);
  // 好幾段一次送：同一份請求列出每一段，並要求同一間住宿合併成一份
  const two = { ...trip, DAYS: [{ ...trip.DAYS[0], alts: [...trip.DAYS[0].alts, { title: '晚餐推薦', body: '房東推薦的餐廳：' + '步行可到的店。'.repeat(20) }] }] };
  const combined = guideSuggestion(two);
  assert.equal(combined.items.length, 2);
  assert.match(combined.request, /第 1 天備案「房東資訊」、第 1 天備案「晚餐推薦」.*同一間住宿的放在同一份.*這幾段備案/);
});

test('預覽摘要帶著搬移提議，App 不必自己讀檔判斷', async t => {
  const f = await fixture(t);
  const day = parseLiteralModule(f.baseline.snapshot.dataSource).DAYS[1];
  const { replaceDay } = require('../../../packages/engine/day-edit.cjs');
  await fs.writeFile(f.sourceFile, replaceDay(f.baseline.snapshot.dataSource, 2, { ...day, alts: [...(day.alts || []), { title: '民宿資訊', body: '入住後'.repeat(50) }] }).source);
  const preview = await buildPreview(f.root, 'sample');
  assert.deepEqual(preview.summary.guideSuggestion.items.map(s => [s.dayId, s.title]), [[2, '民宿資訊']]);
  assert.equal(f.baseline.summary.guideSuggestion, null, '_example 本身不會被誤判');
});

test('回報給開發者：AI 整理的建議先去掉行程名稱、地點、日期、網址與私人資訊', () => {
  const { aiIssueReport } = require('../services/ai-issue.cjs');
  const trip = { config: { title: '仙台山形手帳', deploy: { name: 'sendai-trip' } }, PLACES: { pf: { name: 'PF GUEST HOUSE', local: 'ピーエフ' } },
    DAYS: [{ title: '松島一整天' }], STAY_GUIDES: [{ title: 'PF 住宿指南', lists: [{ items: [{ name: '旬菜酒場 虎龍' }] }] }] };
  const report = aiIssueReport({
    gap: { missing: '住宿指南在 PF GUEST HOUSE 的描述太長時會爆版。', handoffPrompt: '10/11 入住時看到；旬菜酒場 虎龍那一項也一樣。參考 https://secret.example.com/booking?id=1 與 https://github.com/wangch15/travel-planner/issues/1。聯絡 owner@example.com，門鎖 4821，專案在 /Users/someone/trips。' },
    trip, slug: 'sendai-trip', codes: ['4821'], appVersion: '0.1.12', engineVersion: '1.2.1', platform: 'darwin arm64' });
  assert.match(report.id, /^[0-9a-f-]{36}$/);
  assert.equal(report.title, '[功能建議] 住宿指南在 〔地點或名稱〕 的描述太長時會爆版');
  assert.deepEqual(report.labels, ['enhancement'], '沒分類時當成功能建議');
  const ui = aiIssueReport({ gap: { missing: '入口卡的文字太長時會撐出畫面。', kind: 'ui' }, trip, slug: 'x' });
  assert.match(ui.title, /^\[畫面問題\] /); assert.deepEqual(ui.labels, ['bug']); assert.match(ui.body, /^## 畫面上的問題/);
  const bug = aiIssueReport({ gap: { missing: '發布一直失敗。', kind: 'bug' }, trip, slug: 'x' });
  assert.match(bug.title, /^\[App 錯誤\] /); assert.deepEqual(bug.labels, ['bug']);
  for (const secret of ['PF GUEST HOUSE', '旬菜酒場', 'secret.example.com', 'owner@example.com', '4821', '/Users/someone', '10/11']) assert.equal(report.body.includes(secret), false, secret);
  assert.match(report.body, /https:\/\/github\.com\/wangch15\/travel-planner\/issues\/1/, '原專案的網址保留');
  assert.match(report.body, /App 版本：0\.1\.12[\s\S]*網站引擎（旅程資料夾）：1\.2\.1/);
  assert.equal(aiIssueReport({ gap: null, trip }), null);
});

test('對話紀錄接受回報動作與草稿，格式不對就拒絕', async t => {
  const { ConversationStore } = require('../conversation-store.cjs');
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'travel-report-chat-')));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const store = new ConversationStore(root), target = { root: '/sample/project', slug: 'coast' };
  const report = { id: '11111111-1111-4111-8111-111111111111', title: '[App 建議] 標題', body: '內容' };
  await store.update(target, s => { s.messages.push({ role: 'assistant', text: '可以回報', action: 'report', report }); });
  assert.deepEqual((await new ConversationStore(root).read(target)).messages[0].report, report);
  await assert.rejects(store.update(target, s => { s.messages.push({ role: 'user', text: 'x', report }); }), { code: 'CONVERSATION_STORE_INVALID' });
  await assert.rejects(store.update(target, s => { s.messages.push({ role: 'assistant', text: 'x', report: { ...report, title: '' } }); }), { code: 'CONVERSATION_STORE_INVALID' });
});

test('AI 改全程總覽、行前清單、地點備註：一次提案、可逐項選、保存後可回復', async t => {
  const f = await fixture(t);
  const versions = new VersionStore(path.join(f.root, 'app-state'));
  f.store.beforeWrite = async p => { await versions.observe(p.target, { source: p.originalSource, contextDigest: p.contextDigest }); return versions.prepare(p.target, { beforeSource: p.originalSource, afterSource: p.source, contextDigest: p.contextDigest, label: p.label, kind: p.kind }); };
  f.store.afterWrite = (p, id) => versions.finish(p.target, id, p.source);
  const data = parseLiteralModule(f.baseline.snapshot.dataSource);
  const tripEdits = { overview: { ...data.OVERVIEW, foot: ['距離與車程是規劃時查到的，出發前再看一次。'] },
    checklist: [...data.CHECKLIST, '確認租車報到地點與最晚受理時間'], placeNotes: { stationA: '租車櫃檯在西口，實際以租車公司通知為準。' } };
  const proposal = f.store.create(f.target, f.baseline, null, { summary: '更新總覽與清單', tripEdits });
  assert.deepEqual(new Set(proposal.changes.map(c => c.key)), new Set(['overview', 'checklist', 'note:stationA']));
  assert.equal(proposal.holdForReview, false, '只新增清單項目，照一般修改直接保存');
  assert.match(proposal.changes.find(c => c.key === 'checklist').label, /新增 1 項、移除 0 項/);
  // 只勾備註：總覽與清單維持原樣
  const onlyNote = f.store.select(proposal.id, ['note:stationA']);
  const partial = parseLiteralModule(f.store.pending.source);
  assert.deepEqual(partial.OVERVIEW, data.OVERVIEW); assert.deepEqual(partial.CHECKLIST, data.CHECKLIST);
  assert.equal(partial.PLACES.stationA.note, tripEdits.placeNotes.stationA);
  assert.equal(partial.PLACES.stationA.lat, data.PLACES.stationA.lat, '座標不動');
  const all = f.store.select(onlyNote.id, proposal.changes.map(c => c.key));
  f.store.markViewed(all.previewUrl);
  await f.store.apply(all.id, f.target);
  const saved = await buildPreview(f.root, 'sample');
  assert.equal(saved.snapshot.contextDigest, f.baseline.snapshot.contextDigest, '總覽、清單、備註都在可回復的範圍');
  assert.ok(saved.snapshot.trip.CHECKLIST.includes('確認租車報到地點與最晚受理時間'));
  assert.ok(saved.read('/index.html').body.includes('距離與車程是規劃時查到的，出發前再看一次。'));
  await versions.observe(f.target, { source: saved.snapshot.dataSource, contextDigest: saved.snapshot.contextDigest });
  const history = await versions.read(f.target);
  const restore = f.store.createSource(f.target, saved, history.revisions[0].source, { kind: 'restore', label: '回到 V1' });
  f.store.markViewed(restore.previewUrl); await f.store.apply(restore.id, f.target);
  assert.equal(await fs.readFile(f.sourceFile, 'utf8'), f.baseline.snapshot.dataSource);
});

test('行前清單被刪掉項目時先留成提案給人看；格式不對或亂加地點就交回 AI 修正', async t => {
  const f = await fixture(t);
  const data = parseLiteralModule(f.baseline.snapshot.dataSource);
  const trimmed = f.store.create(f.target, f.baseline, null, { summary: '精簡清單', tripEdits: { checklist: data.CHECKLIST.slice(1) } });
  assert.equal(trimmed.holdForReview, true);
  assert.deepEqual(trimmed.removedChecklist, [data.CHECKLIST[0]]);
  f.store.discard();
  assert.throws(() => f.store.create(f.target, f.baseline, null, { summary: 'x', tripEdits: { placeNotes: { newAirport: '航廈內取車' } } }),
    e => e.code === 'INVALID_CANDIDATE' && e.problems.some(p => /沒有的地點：newAirport/.test(p)));
  assert.throws(() => f.store.create(f.target, f.baseline, null, { summary: 'x', tripEdits: { overview: { flights: '11:35' } } }),
    e => e.code === 'INVALID_CANDIDATE' && e.problems.some(p => /不支援的欄位 flights/.test(p)));
});

test('AI 契約：每輪附 data.js 的總覽、清單、地點備註；餐飲清單唯讀；解碼 tripEditsJson', () => {
  const { guideContext, aiCapabilities } = require('../codex/capabilities.cjs');
  const snapshot = { dataSource: "module.exports = { DAYS: [], OVERVIEW: { foot: ['x'] }, CHECKLIST: ['a'], PLACES: { s: { name: '車站', cat: 'hub', note: 'n', lat: 1, lng: 2 } } };",
    trip: { PLACES: { s: {}, diner: {} }, DINING: { places: { diner: {} }, checklist: ['訂位'] } } };
  const ctx = guideContext(snapshot);
  assert.deepEqual(ctx.overview, { foot: ['x'] }); assert.deepEqual(ctx.checklist, ['a']); assert.deepEqual(ctx.diningChecklist, ['訂位']);
  assert.deepEqual(ctx.placeNotes, { s: { name: '車站', cat: 'hub', note: 'n' } }, '只給名稱、分類、備註，不給座標；餐飲地點不在可改範圍');
  assert.ok(aiCapabilities('discussion').editable.includes('checklist'));
  assert.equal(aiCapabilities('edit-day').editable.includes('overview'), false);
  const answer = decodeAnswer(JSON.stringify({ summary: '已更新', replacementDaysJson: '', stayGuidesJson: '', tripEditsJson: JSON.stringify({ checklist: ['b'] }), privateNotes: '', missingCapability: '', handoffPrompt: '' }), { mode: 'discussion' });
  assert.equal(answer.discussion, undefined); assert.deepEqual(answer.tripEdits, { checklist: ['b'] });
  assert.throws(() => decodeAnswer(JSON.stringify({ summary: 'x', replacementDaysJson: '', tripEditsJson: JSON.stringify({ PLACES: {} }) }), { mode: 'discussion' }), { code: 'AI_OUTPUT_INVALID' });
});

test('預約提醒可由 AI 提案、預覽及保存，並拒絕不存在的地點與日期', async t => {
  const f = await fixture(t), data = parseLiteralModule(f.baseline.snapshot.dataSource);
  const overview = { ...data.OVERVIEW, reservations: [{ id: 'sample-reservation', place: 'yamadera', days: [1, 2], note: '示範預約提醒' }] };
  const proposal = f.store.create(f.target, f.baseline, null, { summary: '新增預約提醒', tripEdits: { overview } });
  assert.match(proposal.changes.find(c => c.key === 'overview').after, /預約提醒.*第 1、2 天.*示範預約提醒/);
  f.store.markViewed(proposal.previewUrl); await f.store.apply(proposal.id, f.target);
  const saved = await buildPreview(f.root, 'sample');
  assert.deepEqual(saved.snapshot.trip.OVERVIEW.reservations, overview.reservations);
  assert.match(saved.read('/index.html').body, /sample-reservation/);
  const context = guideContext(saved.snapshot);
  assert.equal(context.reservationPlaces.yamadera.name, saved.snapshot.trip.PLACES.yamadera.name);
  for (const update of [{ place: 'missing' }, { days: [99] }]) {
    assert.throws(() => f.store.create(f.target, saved, null, { summary: '錯誤提醒', tripEdits: { overview: { ...overview, reservations: [{ ...overview.reservations[0], ...update }] } } }),
      e => e.code === 'INVALID_CANDIDATE' && e.problems.some(p => /reservations/.test(p)));
  }
});
