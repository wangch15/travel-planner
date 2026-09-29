const fs = require('node:fs/promises');
const { constants } = require('node:fs');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const { execFile } = require('node:child_process');
const { promisify, isDeepStrictEqual } = require('node:util');
const { replaceDay } = require('../../packages/engine/day-edit.cjs');
const { changesBetween, selectChanges, lostLinks } = require('./proposal-diff.cjs');
const { replaceStayGuides, mergeStayGuides, replaceExport, replacePlaceNote } = require('../../packages/engine/guide-edit.cjs');
const { checkOverview, checkChecklist, checkPlaceNotes, checklistDelta } = require('../../packages/engine/trip-text.cjs');
const { IMAGE_FILE, imageType, imageBytesMatch, guideImageFiles, checkGuideReadability } = require('../../packages/engine/stay-guides.cjs');
const { parseLiteralModule, validate } = require('@travel-planner/engine');
const { createRenderer } = require('@travel-planner/engine/render');
const { buildPreview } = require('./preview.cjs');
const run = promisify(execFile);
const fail = code => Object.assign(Error(code), { code });
const hash = value => createHash('sha256').update(value).digest('hex');
const sameFile = (a, b) => a.dev === b.dev && a.ino === b.ino;
const regular = stat => stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1;

async function checkDirectory(directory, expected) {
  const current = await fs.lstat(directory);
  if (!current.isDirectory() || current.isSymbolicLink() || !sameFile(current, expected)
    || await fs.realpath(directory) !== directory) throw fail('UNSAFE_PATH');
}

async function appendStatus(dir, text) {
  const docs = path.join(dir, 'docs'); const status = path.join(docs, 'status.md');
  const folder = await fs.lstat(docs);
  await checkDirectory(docs, folder);
  const note = await fs.lstat(status);
  if (!regular(note) || note.size > 4 * 1024 * 1024) throw fail('UNSAFE_PATH');
  const handle = await fs.open(status, constants.O_WRONLY | constants.O_APPEND | constants.O_NOFOLLOW);
  try {
    const opened = await handle.stat();
    if (!regular(opened) || !sameFile(opened, note) || opened.size > 4 * 1024 * 1024) throw fail('UNSAFE_PATH');
    await checkDirectory(docs, folder);
    const latest = await fs.lstat(status);
    if (!regular(latest) || !sameFile(latest, opened)) throw fail('UNSAFE_PATH');
    await handle.appendFile(text);
    await checkDirectory(docs, folder);
  } finally { await handle.close(); }
}

// AI 的總覽、行前清單、地點備註：先檢查格式，有問題就整批退回給 AI 修正（帶逐項原因），再寫進原始碼。
function applyTripEdits(source, edits) {
  const invalid = problems => Object.assign(fail('INVALID_CANDIDATE'), { problems: problems.slice(0, 5) });
  const current = parseLiteralModule(source);
  const problems = [
    ...(edits.overview !== undefined ? checkOverview(edits.overview) : []),
    ...(edits.checklist !== undefined ? checkChecklist(edits.checklist) : []),
    ...(edits.placeNotes !== undefined ? checkPlaceNotes(edits.placeNotes, current.PLACES) : []),
  ];
  if (problems.length) throw invalid(problems);
  if (edits.overview !== undefined) source = replaceExport(source, 'OVERVIEW', edits.overview, 'object').source;
  if (edits.checklist !== undefined) source = replaceExport(source, 'CHECKLIST', edits.checklist, 'array').source;
  for (const [key, note] of Object.entries(edits.placeNotes || {})) source = replacePlaceNote(source, key, note === null ? null : note.trim()).source;
  return source;
}

function checkAssets(assets) {
  if (!Array.isArray(assets) || assets.length > 12) throw fail('INVALID_ASSET');
  return assets.map(a => {
    if (!a || !IMAGE_FILE.test(a.file) || !Buffer.isBuffer(a.bytes) || a.bytes.length > 8 * 1024 * 1024 || !imageBytesMatch(a.file, a.bytes)) throw fail('INVALID_ASSET');
    return { file: a.file, bytes: a.bytes };
  });
}

// 在已核對的行程資料夾裡建立 photos/<file>；同名檔已存在時內容必須完全相同，不覆蓋。
async function writeAsset(dir, asset) {
  const photos = path.join(dir, 'photos');
  try { await fs.mkdir(photos, { mode: 0o755 }); } catch (e) { if (e.code !== 'EEXIST') throw e; }
  const folder = await fs.lstat(photos);
  await checkDirectory(photos, folder);
  const file = path.join(photos, asset.file);
  let handle;
  try { handle = await fs.open(file, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o644); }
  catch (e) {
    if (e.code !== 'EEXIST') throw e;
    const stat = await fs.lstat(file);
    if (!regular(stat) || stat.size !== asset.bytes.length || !(await fs.readFile(file)).equals(asset.bytes)) throw fail('ASSET_CONFLICT');
    return;
  }
  try { await checkDirectory(photos, folder); await handle.writeFile(asset.bytes); await handle.sync(); }
  finally { await handle.close(); }
}

async function verifyPrivateProject(root) {
  const { stdout } = await run('git', ['--no-optional-locks', '-C', root, 'remote', 'get-url', '--push', '--all', 'origin'], { timeout: 5000, maxBuffer: 4096 });
  const urls = stdout.trim().split(/\r?\n/);
  if (urls.length !== 1) throw fail('PRIVATE_REPO_REQUIRED');
  const match = urls[0].match(/^(?:https:\/\/github\.com\/|git@github\.com:)([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/);
  if (!match || `${match[1]}/${match[2]}`.toLowerCase() === 'wangch15/travel-planner') throw fail('PRIVATE_REPO_REQUIRED');
  const result = await run('gh', ['repo', 'view', `${match[1]}/${match[2]}`, '--json', 'visibility'], { timeout: 10000, maxBuffer: 4096 });
  if (JSON.parse(result.stdout).visibility !== 'PRIVATE') throw fail('PRIVATE_REPO_REQUIRED');
}

class ProposalStore {
  constructor(stateDirectory, { checkPrivate = verifyPrivateProject, loadPreview = buildPreview, beforeWrite = async()=>null, afterWrite = async()=>null } = {}) {
    this.directory = stateDirectory; this.checkPrivate = checkPrivate; this.loadPreview = loadPreview;
    this.pending = null; this.saving = false; this.beforeWrite=beforeWrite;this.afterWrite=afterWrite;
    // 寫本機檔案前的私人專案核對：同一個專案通過後 30 分鐘內不重查（AI 修改現在直接保存，每輪都查會慢、離線會失敗）。
    // 推送到 GitHub 前的核對不受影響，備份每次都重新確認。
    this.privateVerified = new Map();
  }
  // assets：本輪由附件圖片轉成的指南圖片 {file, bytes}，保存時才寫進 photos/。
  create(target, baseline, dayId, answer, {assets=[]}={}) {
    let source=baseline.snapshot.dataSource;
    if(answer.replacementDays)for(const day of answer.replacementDays)source=replaceDay(source,day.id,day).source;
    else if(answer.replacementDay)source=replaceDay(source,dayId,answer.replacementDay).source;
    if(answer.stayGuides)source=replaceStayGuides(source,mergeStayGuides(parseLiteralModule(source).STAY_GUIDES,answer.stayGuides)).source;
    if(answer.tripEdits)source=applyTripEdits(source,answer.tripEdits);
    if(source===baseline.snapshot.dataSource&&!answer.replacementDays)return {changed:false,summary:answer.summary};
    return this.createSource(target,baseline,source,{label:answer.summary,kind:'save',assets});
  }
  createSource(target,baseline,fullSource,{label='修改提案',kind='save',selectedKeys,assets=[]}={}) {
    if(this.saving)throw fail('SAVE_BUSY');
    if(!path.isAbsolute(target.root)||!/^[a-zA-Z0-9_-]{1,100}$/.test(target.slug)||typeof target.projectId!=='string'||!['save','restore'].includes(kind))throw fail('INVALID_TARGET');
    const changes=changesBetween(baseline.snapshot.dataSource,fullSource);
    if(!changes.length)return {changed:false,summary:'內容與目前版本相同，沒有需要修改的日程。'};
    selectedKeys ??= changes.map(c=>c.key);
    const source=selectChanges(baseline.snapshot.dataSource,fullSource,selectedKeys);
    const candidate=structuredClone(baseline.snapshot);
    const parsed=parseLiteralModule(source);
    candidate.trip.DAYS=parsed.DAYS.map(day=>({...day,meals:candidate.trip.DINING.days?.[day.id]||[],mapList:candidate.trip.MAP_LISTS[day.id]||null}));
    candidate.trip.STAY_GUIDES=parsed.STAY_GUIDES||[];
    // 總覽、行前清單（再併上餐飲清單，同載入時的接線）、地點備註（只動 data.js 的地點，不動座標）。
    candidate.trip.OVERVIEW=parsed.OVERVIEW||{};
    candidate.trip.CHECKLIST=[...(parsed.CHECKLIST||[]),...(candidate.trip.DINING.checklist||[])];
    for(const [key,place] of Object.entries(parsed.PLACES||{})){
      if(!candidate.trip.PLACES[key]||Object.hasOwn(candidate.trip.DINING.places||{},key))continue;
      const next={...candidate.trip.PLACES[key]};if(place?.note===undefined)delete next.note;else next.note=place.note;candidate.trip.PLACES[key]=next;
    }
    // 只留這份候選真的引用、而且專案裡還沒有的圖片。
    const referenced=new Set(guideImageFiles(candidate.trip.STAY_GUIDES));
    const known=candidate.trip.GUIDE_IMAGES||{};
    const newAssets=checkAssets(assets).filter(a=>referenced.has(a.file)&&!Object.hasOwn(known,a.file));
    candidate.trip.GUIDE_IMAGES={...known,...Object.fromEntries(newAssets.map(a=>[a.file,'img/'+a.file]))};
    let errors;try{errors=validate(candidate.trip);}catch{throw fail('INVALID_CANDIDATE');}
    // 這次新增或改過的指南、總覽、清單才套用格式規則（回復舊版本不套用）；舊資料照原樣可用。
    if(kind!=='restore'){const before=baseline.snapshot.trip.STAY_GUIDES||[];for(const g of candidate.trip.STAY_GUIDES)if(!before.some(b=>isDeepStrictEqual(b,g)))errors=[...errors,...checkGuideReadability(g)];
      const original=parseLiteralModule(baseline.snapshot.dataSource);
      if(!isDeepStrictEqual(original.OVERVIEW??{},parsed.OVERVIEW??{}))errors=[...errors,...checkOverview(parsed.OVERVIEW??{})];
      if(!isDeepStrictEqual(original.CHECKLIST??[],parsed.CHECKLIST??[]))errors=[...errors,...checkChecklist(parsed.CHECKLIST??[])];}
    // 逐項原因只在本機顯示給擁有者看，讓人知道 AI 哪裡寫錯（例如指南欄位超過字數）。
    if(errors.length)throw Object.assign(fail('INVALID_CANDIDATE'),{problems:errors.slice(0,5)});
    candidate.dataSource=source;
    const html=createRenderer(path.resolve(__dirname,'../../src'))(candidate).replace(/<link\b[^>]*href="https:\/\/fonts\.(?:googleapis|gstatic)\.com[^>]*>/g,'');
    const id=randomUUID(),token=randomUUID().replaceAll('-','');
    const active=changes.filter(c=>selectedKeys.includes(c.key));
    // 同一次同時改指南與日程＝把日程裡的長文搬進住宿指南：先給人看預覽再保存，不自動套用。
    const migration=kind!=='restore'&&active.some(c=>c.field==='guide')&&active.some(c=>c.field!=='guide');
    // 搬移只動備案文字時不需要查核；停留點本身變了才需要。
    const originalDays=parseLiteralModule(baseline.snapshot.dataSource).DAYS;
    const stopsChanged=parsed.DAYS.some(day=>!isDeepStrictEqual(day.stops,originalDays.find(d=>d.id===day.id)?.stops));
    const requiresResearch=kind!=='restore'&&active.some(c=>c.field==='structure'||(c.field==='route'&&(!migration||stopsChanged)));
    // 行前清單被刪掉的項目：先給人看過再保存，不讓重要待辦被悄悄覆蓋。
    const removedChecklist=kind!=='restore'&&active.some(c=>c.field==='checklist')?checklistDelta(parseLiteralModule(baseline.snapshot.dataSource).CHECKLIST||[],parsed.CHECKLIST||[]).removed:[];
    const artifact={token,url:`travel-preview://${token}/index.html`,digest:hash(html),snapshot:candidate,summary:baseline.summary,
      read:key=>{if(key==='/index.html')return {body:html,type:'text/html; charset=utf-8'};const asset=newAssets.find(a=>'/img/'+a.file===key);return asset?{body:asset.bytes,type:imageType(asset.file)}:baseline.read(key);}};
    this.pending={id,target:{...target},baselineDigest:baseline.digest,source,fullSource,originalSource:baseline.snapshot.dataSource,
      contextDigest:baseline.snapshot.contextDigest,artifact,baseline,seen:false,createdAt:Date.now(),kind,label:String(label).slice(0,1000),
      changes,selectedKeys:[...selectedKeys],requiresResearch,dayId:active[0]?.dayId,
      assets:newAssets,allAssets:checkAssets(assets),lostLinks:lostLinks(baseline.snapshot.dataSource,source),migration,removedChecklist};
    return this.view();
  }
  view(){
    const p=this.pending;if(!p)return null;
    return {id:p.id,changed:true,summary:p.label,kind:p.kind,changes:p.changes,selectedKeys:p.selectedKeys,
      changedFields:[...new Set(p.changes.filter(c=>p.selectedKeys.includes(c.key)).flatMap(c=>c.field==='route'?['stops','alts']:[c.field]))],
      requiresResearch:p.requiresResearch,previewUrl:p.artifact.url,selectedCount:p.selectedKeys.length,previewLoaded:p.seen,
      migration:p.migration,lostLinks:p.lostLinks.slice(0,20),newImages:p.assets.map(a=>a.file),
      removedChecklist:p.removedChecklist.slice(0,30),holdForReview:p.migration||p.removedChecklist.length>0};
  }
  select(id,keys){
    const p=this.pending;if(!p||p.id!==id)throw fail('STALE_PROPOSAL');
    return this.createSource(p.target,p.baseline,p.fullSource,{label:p.label,kind:p.kind,selectedKeys:keys,assets:p.allAssets});
  }
  draft(){const p=this.pending;return p?{baselineDigest:p.baselineDigest,originalSource:p.originalSource,proposedSource:p.fullSource,
    selectedKeys:p.selectedKeys,kind:p.kind,label:p.label,contextDigest:p.contextDigest,createdAt:new Date(p.createdAt).toISOString()}:null;}
  markViewed(url) { if (this.pending?.artifact.url === url) this.pending.seen = true; }
  discard() { if (this.saving) throw fail('SAVE_BUSY'); this.pending = null; }
  async apply(id, target) {
    const proposal = this.pending;
    if (this.saving) throw fail('SAVE_BUSY');
    if (!proposal || proposal.id !== id || !isDeepStrictEqual(proposal.target, target)) throw fail('STALE_PROPOSAL');
    if (!proposal.selectedKeys.length) throw fail('EMPTY_SELECTION');
    if (!proposal.seen) throw fail('PREVIEW_REQUIRED');
    if (proposal.requiresResearch) throw fail('RESEARCH_REQUIRED');
    if (Date.now() - proposal.createdAt > 30 * 60 * 1000) throw fail('STALE_PROPOSAL');
    this.saving = true;
    const backupId = randomUUID();
    let temporary;
    let saved = false;
    let writeIntent=null,version=null;
    try {
      if (!(this.privateVerified.get(target.root) > Date.now())) { await this.checkPrivate(target.root); this.privateVerified.set(target.root, Date.now() + 30 * 60 * 1000); }
      const current = await this.loadPreview(target.root, target.slug);
      if (current.digest !== proposal.baselineDigest || current.snapshot.dataSource !== proposal.originalSource) throw fail('CONTENT_CHANGED');
      const dir = path.join(target.root, 'trips', target.slug);
      if (await fs.realpath(dir) !== dir) throw fail('UNSAFE_PATH');
      // 指南圖片先寫：data.js 還沒指向它們，中途失敗只會留下沒人引用的圖檔。
      for (const asset of proposal.assets) await writeAsset(dir, asset);
      writeIntent=await this.beforeWrite(proposal);
      const file = path.join(dir, 'data.js'); const stat = await fs.lstat(file);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) throw fail('UNSAFE_PATH');
      const backupDir = path.join(this.directory, 'backups');
      await fs.mkdir(backupDir, { recursive: true, mode: 0o700 });
      if ((await fs.lstat(backupDir)).isSymbolicLink()) throw fail('UNSAFE_PATH');
      await fs.writeFile(path.join(backupDir, `${backupId}.js`), proposal.originalSource, { flag: 'wx', mode: 0o600 });
      const temporaryPath = path.join(dir, `.data-${id}.tmp`);
      const folder = await fs.lstat(dir);
      await checkDirectory(dir, folder);
      const handle = await fs.open(temporaryPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, stat.mode & 0o777);
      try {
        temporary = { path: temporaryPath, stat: await handle.stat(), folder, dir };
        if (!regular(temporary.stat)) throw fail('UNSAFE_PATH');
        await checkDirectory(dir, folder);
        await handle.writeFile(proposal.source); await handle.sync();
      } finally { await handle.close(); }
      const latest = await fs.lstat(file);
      if (latest.ino !== stat.ino || latest.dev !== stat.dev || latest.mtimeMs !== stat.mtimeMs
        || latest.size !== stat.size || await fs.realpath(dir) !== dir
        || await fs.readFile(file, 'utf8') !== proposal.originalSource) throw fail('CONTENT_CHANGED');
      const tempStat = await fs.lstat(temporary.path);
      if (!regular(tempStat) || !sameFile(tempStat, temporary.stat)) throw fail('CONTENT_CHANGED');
      await checkDirectory(dir, folder);
      await fs.rename(temporary.path, file); temporary = null; saved = true;
      this.pending = null;
      let versionRecorded=true;
      try{version=await this.afterWrite(proposal,writeIntent);}catch{versionRecorded=false;}
      let statusUpdated = false;
      // Only append to the existing private progress file; no user notes reach the model.
      try {
        await appendStatus(dir, `\n\n## 桌面本機修改 ${new Date().toISOString()}\n\n- 目前階段：${proposal.kind==='restore'?'日程版本回復':'日程修改提案'}已由使用者確認，保存於本機。\n- 等待確認：無（限本次修改）。\n- 阻礙：尚未異地備份。\n- 下一步：核對內容後備份至原私有專案；本次沒有部署或推送。\n`);
        statusUpdated = true;
      } catch { /* Report separately: data is saved, do not replay the write. */ }
      return { saved: true, backedUp: false, statusUpdated, backupId,versionRecorded,version };
    } catch (error) {
      if (saved) return { saved: true, backedUp: false, statusUpdated: false, backupId,versionRecorded:false,version };
      throw error;
    } finally {
      this.saving = false;
      if (temporary) {
        try {
          await checkDirectory(temporary.dir, temporary.folder);
          const current = await fs.lstat(temporary.path);
          if (regular(current) && sameFile(current, temporary.stat)) await fs.unlink(temporary.path);
        } catch { /* Only remove the temporary inode this save created in its verified directory. */ }
      }
    }
  }
}
module.exports = { ProposalStore, verifyPrivateProject };
