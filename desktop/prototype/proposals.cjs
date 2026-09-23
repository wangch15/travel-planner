const fs = require('node:fs/promises');
const { constants } = require('node:fs');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const { execFile } = require('node:child_process');
const { promisify, isDeepStrictEqual } = require('node:util');
const { replaceDay } = require('../../packages/engine/day-edit.cjs');
const { changesBetween, selectChanges } = require('./proposal-diff.cjs');
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
  }
  create(target, baseline, dayId, answer) {
    if(answer.replacementDays){let source=baseline.snapshot.dataSource;for(const day of answer.replacementDays)source=replaceDay(source,day.id,day).source;return this.createSource(target,baseline,source,{label:answer.summary,kind:'save'});}
    const edit=replaceDay(baseline.snapshot.dataSource,dayId,answer.replacementDay);
    if(!edit.changed)return {changed:false,summary:answer.summary};
    return this.createSource(target,baseline,edit.source,{label:answer.summary,kind:'save'});
  }
  createSource(target,baseline,fullSource,{label='修改提案',kind='save',selectedKeys}={}) {
    if(this.saving)throw fail('SAVE_BUSY');
    if(!path.isAbsolute(target.root)||!/^[a-zA-Z0-9_-]{1,100}$/.test(target.slug)||typeof target.projectId!=='string'||!['save','restore'].includes(kind))throw fail('INVALID_TARGET');
    const changes=changesBetween(baseline.snapshot.dataSource,fullSource);
    if(!changes.length)return {changed:false,summary:'內容與目前版本相同，沒有需要修改的日程。'};
    selectedKeys ??= changes.map(c=>c.key);
    const source=selectChanges(baseline.snapshot.dataSource,fullSource,selectedKeys);
    const candidate=structuredClone(baseline.snapshot);
    candidate.trip.DAYS=parseLiteralModule(source).DAYS.map(day=>({...day,meals:candidate.trip.DINING.days?.[day.id]||[],mapList:candidate.trip.MAP_LISTS[day.id]||null}));
    let errors;try{errors=validate(candidate.trip);}catch{throw fail('INVALID_CANDIDATE');}
    if(errors.length)throw fail('INVALID_CANDIDATE');
    candidate.dataSource=source;
    const html=createRenderer(path.resolve(__dirname,'../../src'))(candidate).replace(/<link\b[^>]*href="https:\/\/fonts\.(?:googleapis|gstatic)\.com[^>]*>/g,'');
    const id=randomUUID(),token=randomUUID().replaceAll('-','');
    const active=changes.filter(c=>selectedKeys.includes(c.key));
    const artifact={token,url:`travel-preview://${token}/index.html`,digest:hash(html),snapshot:candidate,summary:baseline.summary,
      read:key=>key==='/index.html'?{body:html,type:'text/html; charset=utf-8'}:baseline.read(key)};
    this.pending={id,target:{...target},baselineDigest:baseline.digest,source,fullSource,originalSource:baseline.snapshot.dataSource,
      contextDigest:baseline.snapshot.contextDigest,artifact,baseline,seen:false,createdAt:Date.now(),kind,label:String(label).slice(0,1000),
      changes,selectedKeys:[...selectedKeys],requiresResearch:kind!=='restore'&&active.some(c=>['route','structure'].includes(c.field)),dayId:active[0]?.dayId};
    return this.view();
  }
  view(){
    const p=this.pending;if(!p)return null;
    return {id:p.id,changed:true,summary:p.label,kind:p.kind,changes:p.changes,selectedKeys:p.selectedKeys,
      changedFields:[...new Set(p.changes.filter(c=>p.selectedKeys.includes(c.key)).flatMap(c=>c.field==='route'?['stops','alts']:[c.field]))],
      requiresResearch:p.requiresResearch,previewUrl:p.artifact.url,selectedCount:p.selectedKeys.length,previewLoaded:p.seen};
  }
  select(id,keys){
    const p=this.pending;if(!p||p.id!==id)throw fail('STALE_PROPOSAL');
    return this.createSource(p.target,p.baseline,p.fullSource,{label:p.label,kind:p.kind,selectedKeys:keys});
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
      await this.checkPrivate(target.root);
      const current = await this.loadPreview(target.root, target.slug);
      if (current.digest !== proposal.baselineDigest || current.snapshot.dataSource !== proposal.originalSource) throw fail('CONTENT_CHANGED');
      writeIntent=await this.beforeWrite(proposal);
      const dir = path.join(target.root, 'trips', target.slug);
      if (await fs.realpath(dir) !== dir) throw fail('UNSAFE_PATH');
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
