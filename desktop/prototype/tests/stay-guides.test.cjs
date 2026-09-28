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
  assert.deepEqual(migrated.lostLinks, ['https://example.invalid/ramen'], '拉麵連結沒有搬過去，要提醒');
  assert.deepEqual(new Set(migrated.changes.map(c => c.key)), new Set(['1:route', 'guide:inn-a-guide']));
  const onlyGuide = f.store.select(migrated.id, ['guide:inn-a-guide']);
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
  const gap = decodeAnswer(JSON.stringify({ summary: '做不到', replacementDaysJson: '', stayGuidesJson: '', privateNotes: '', missingCapability: '指南還不支援菜單照片輪播。', handoffPrompt: '請新增 menuPhotos 欄位…' }), { mode: 'discussion' });
  assert.equal(gap.discussion, true);
  assert.match(capabilityGapText(gap.capabilityGap), /目前還做不到：\*\*指南還不支援菜單照片輪播。[\s\S]*menuPhotos/);
  assert.throws(() => decodeAnswer(JSON.stringify({ summary: 'x', replacementDaysJson: '', stayGuidesJson: '{"id":1}' }), { mode: 'discussion' }), { code: 'AI_OUTPUT_INVALID' });
  assert.throws(() => decodeAnswer(JSON.stringify({ summary: 'x', replacementDaysJson: '', stayGuidesJson: JSON.stringify([guide(), guide()]) }), { mode: 'discussion' }), { code: 'AI_OUTPUT_INVALID' });
});

test('AI 自創欄位或把私人欄位塞進指南：資料檢查擋下並說出原因', async t => {
  const f = await fixture(t);
  assert.throws(() => f.store.create(f.target, f.baseline, null, { summary: 'x', stayGuides: [guide({ privateNotes: '1234' })] }), e => e.code === 'INVALID_CANDIDATE' && e.problems.some(p => /privateNotes/.test(p)));
  const invented = guide(); invented.lists[0].items[0].hours = '9-21';
  assert.throws(() => f.store.create(f.target, f.baseline, null, { summary: 'x', stayGuides: [invented] }), e => e.problems.some(p => /不支援的欄位 hours/.test(p)));
});
