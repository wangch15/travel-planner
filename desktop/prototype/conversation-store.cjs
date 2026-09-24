const fs = require('node:fs/promises');
const { constants } = require('node:fs');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const {validJob}=require('./services/jobs.cjs');
const SESSION_FIELDS=Object.freeze(['provider','started','messages','draft','model','dayId','thread','run','effort','handoff','job']);
const MAX_BYTES = 16 * 1024 * 1024;
const fail = () => Object.assign(Error('CONVERSATION_STORE_INVALID'), {code:'CONVERSATION_STORE_INVALID'});
const same = (a,b) => a.dev===b.dev && a.ino===b.ino;
const regular = s => s.isFile() && !s.isSymbolicLink() && s.nlink===1;
const string = (s,max) => typeof s==='string' && s.length<=max;
const empty = () => ({version:1,messages:[],draft:'',model:'',dayId:null,thread:null,run:null,pendingProposal:false,lastOutcome:'尚未產生提案。'});
function validPlan(p){return p===undefined||p===null||(p&&string(p.markdown,40000)&&(p.approvedDigest===null||string(p.approvedDigest,64)));}
function validResearch(r){return r===undefined||r===null||(r&&string(r.summary,16000)&&string(r.feasibility,12000)&&string(r.sourceHash,128)&&typeof r.confirmed==='boolean'&&(r.privateNotes===undefined||string(r.privateNotes,8000))&&Array.isArray(r.sources)&&r.sources.length<=20&&r.sources.every(v=>v&&string(v.url,4096)&&string(v.title,1000)&&string(v.evidence,500)&&string(v.checkedAt,40)&&typeof v.verified==='boolean')&&Array.isArray(r.unresolved)&&r.unresolved.length<=200&&r.unresolved.every(v=>string(v,3000)));}
function validConversations(s){const ids=[s.conversationId,...(Array.isArray(s.archives)?s.archives:[]).map(c=>c?.id)];return (s.conversationId===undefined||string(s.conversationId,100))&&(s.conversationTitle===undefined||string(s.conversationTitle,100))&&(s.conversationTitleCustom===undefined||typeof s.conversationTitleCustom==='boolean')&&(s.archives===undefined||(Array.isArray(s.archives)&&s.archives.length<=50&&s.archives.every(c=>c&&string(c.id,100)&&string(c.title,100)&&(c.titleCustom===undefined||typeof c.titleCustom==='boolean')&&typeof c.archived==='boolean'&&c.payload&&Object.keys(c.payload).every(key=>SESSION_FIELDS.includes(key))&&valid({...c.payload,version:1,pendingProposal:false,lastOutcome:'',archives:undefined,conversationId:undefined,conversationTitle:undefined}))))&&(s.conversationOrder===undefined||(Array.isArray(s.conversationOrder)&&s.conversationOrder.length===ids.length&&new Set(ids).size===ids.length&&new Set(s.conversationOrder).size===ids.length&&s.conversationOrder.every(id=>string(id,100)&&ids.includes(id))));}
function validGeneration(value){return value===undefined||(value&&typeof value==='object'&&!Array.isArray(value)&&['codex','claude','gemini'].includes(value.provider)&&string(value.model,200)&&string(value.effort,40)&&(value.resolvedEffort===undefined||string(value.resolvedEffort,40)));}
// 對話名稱仍是預設、使用者也沒改過時，才採用 AI 回覆附帶的 conversationTitle。
const DEFAULT_TITLES=Object.freeze(['旅程討論','新的討論']);
function applySuggestedTitle(state,answer){if(answer?.conversationTitle&&state.conversationTitleCustom!==true&&DEFAULT_TITLES.includes(state.conversationTitle||'旅程討論'))state.conversationTitle=answer.conversationTitle;return state;}
// 使用者訊息附帶的參考資料只存 id、名稱與種類，讓對話紀錄能顯示；內容仍在參考資料區。
function validMessageAttachments(m){return m.attachments===undefined||(m.role==='user'&&Array.isArray(m.attachments)&&m.attachments.length<=12&&m.attachments.every(a=>a&&string(a.id,200)&&string(a.name,200)&&['image','file'].includes(a.kind)));}
// AI 直接套用的修改：記下版本與前一版，聊天裡才能「查看修改對照」「回到修改前」。
const optionalString=(v,max)=>v===null||string(v,max),optionalNumber=v=>v===null||Number.isSafeInteger(v);
function validApplied(m){const a=m.applied;return a===undefined||(m.role==='assistant'&&a&&typeof a==='object'&&optionalString(a.versionId,200)&&optionalNumber(a.number)&&optionalString(a.previousId,200)&&optionalNumber(a.previousNumber)&&Array.isArray(a.labels)&&a.labels.length<=30&&a.labels.every(l=>string(l,200))&&typeof a.research==='boolean');}
function valid(s) {
  return s?.version===1 && (s.started===undefined||typeof s.started==='boolean') && (s.provider===undefined||['codex','claude','gemini'].includes(s.provider)) && validConversations(s)&&validPlan(s.plan)&&validResearch(s.research)&&validJob(s.job) && (s.effort===undefined||string(s.effort,40)) && (s.handoff===undefined||s.handoff===null||string(s.handoff,16000)) && string(s.draft,2000) && string(s.model,200) && (s.dayId===null || Number.isSafeInteger(s.dayId))
    && typeof s.pendingProposal==='boolean' && string(s.lastOutcome,1000)
    && Array.isArray(s.messages) && s.messages.length<=2000 && s.messages.every(m=>m && ['user','assistant'].includes(m.role) && string(m.text,64000)&&validGeneration(m.generation)&&(m.action===undefined||(m.role==='assistant'&&['backup','publish','project-update','research'].includes(m.action)))&&validMessageAttachments(m)&&validApplied(m))
    && (s.thread===null || (string(s.thread.id,200) && string(s.thread.accountKey,200) && (s.thread.lastTurnId===null || string(s.thread.lastTurnId,200))))
    && (s.run===null || (string(s.run.id,100) && ['pending','complete','failed','unknown','stopped'].includes(s.run.status)
      && (s.run.stopRequested===undefined||typeof s.run.stopRequested==='boolean')
      && (s.run.stopConfirmed===undefined||typeof s.run.stopConfirmed==='boolean')
      && (s.run.stopConfirmed!==true||s.run.stopRequested===true&&s.run.status==='stopped')));
}
class ConversationStore {
  constructor(directory) { if(!path.isAbsolute(directory))throw fail();this.directory=path.join(directory,'conversations');this.queue=Promise.resolve();this.anchor=null; }
  filename(target) {
    if(!target || !path.isAbsolute(target.root) || !/^[a-zA-Z0-9_-]{1,100}$/.test(target.slug))throw fail();
    return path.join(this.directory,createHash('sha256').update(JSON.stringify([target.root,target.slug])).digest('hex')+'.json');
  }
  async checkDirectory() {
    try {
      const stat=await fs.lstat(this.directory);const canonical=await fs.realpath(this.directory);
      if(!stat.isDirectory() || stat.isSymbolicLink() || !same(stat,await fs.lstat(canonical)) || !same(stat,await fs.lstat(this.directory)))throw fail();
      if(this.anchor && (!same(stat,this.anchor.stat) || canonical!==this.anchor.canonical))throw fail();
      this.anchor ||= {stat,canonical};return true;
    } catch(e) { if(e.code==='ENOENT'&&!this.anchor)return false;throw fail(); }
  }
  read(target) {
    // Readers share the mutation queue: our own atomic rename must not look like
    // an external inode replacement between lstat and open.
    const operation=this.queue.then(()=>this.load(target));
    this.queue=operation.catch(()=>{});return operation;
  }
  async load(target) {
    const file=this.filename(target);
    if(!await this.checkDirectory())return empty();
    let handle;
    try {
      const stat=await fs.lstat(file);if(!regular(stat)||stat.size>MAX_BYTES)throw fail();
      handle=await fs.open(file,constants.O_RDONLY|constants.O_NOFOLLOW);
      if(!same(stat,await handle.stat()))throw fail();
      await this.checkDirectory();
      const bytes=Buffer.alloc(stat.size+1);const {bytesRead}=await handle.read(bytes,0,bytes.length,0);
      if(bytesRead!==stat.size)throw fail();
      const current=await handle.stat();if(!regular(current)||current.size!==stat.size||current.mtimeMs!==stat.mtimeMs)throw fail();
      await this.checkDirectory();
      const state=JSON.parse(bytes.subarray(0,bytesRead).toString('utf8'));if(!valid(state))throw fail();return state;
    } catch(e) {
      if(e.code==='ENOENT'){await this.checkDirectory();return empty();}throw fail();
    } finally {await handle?.close();}
  }
  update(target, change) {
    const operation=this.queue.then(async()=>{
      const state=await this.load(target);change(state);if(!valid(state))throw fail();
      const bytes=JSON.stringify(state)+'\n';if(Buffer.byteLength(bytes)>MAX_BYTES)throw fail();
      await fs.mkdir(this.directory,{recursive:true,mode:0o700});await this.checkDirectory();
      const temp=path.join(this.directory,`.chat-${randomUUID()}.tmp`);let owned;
      try {
        const handle=await fs.open(temp,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
        try {owned=await handle.stat();await this.checkDirectory();await handle.writeFile(bytes);await handle.sync();} finally {await handle.close();}
        await this.load(target);await this.checkDirectory();
        const stat=await fs.lstat(temp);if(!regular(stat)||!same(owned,stat))throw fail();
        await fs.rename(temp,this.filename(target));await this.checkDirectory();return state;
      } finally {
        try {await this.checkDirectory();const stat=await fs.lstat(temp);if(owned&&regular(stat)&&same(stat,owned))await fs.unlink(temp);}catch{/* Never remove a replaced file. */}
      }
    });this.queue=operation.catch(()=>{});return operation;
  }
  // 永久刪除旅程時一起忘掉這趟的對話紀錄，之後同名的新旅程不會接到舊對話。
  forget(target) {
    const operation=this.queue.then(async()=>{
      const file=this.filename(target);if(!await this.checkDirectory())return;
      try{const stat=await fs.lstat(file);if(regular(stat))await fs.unlink(file);}catch(e){if(e.code!=='ENOENT')throw fail();}
    });this.queue=operation.catch(()=>{});return operation;
  }
  async flush(){await this.queue;}
}
module.exports={ConversationStore,SESSION_FIELDS,applySuggestedTitle};
