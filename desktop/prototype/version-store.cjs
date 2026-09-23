const fs = require('node:fs/promises');
const {constants} = require('node:fs');
const path = require('node:path');
const {createHash,randomUUID} = require('node:crypto');
const MAX_BYTES=32*1024*1024, MAX_SOURCE=4*1024*1024, MAX_REVISIONS=100;
const error=code=>Object.assign(Error(code),{code});
const invalid=()=>error('VERSION_STORE_INVALID');
const hash=source=>createHash('sha256').update(source,'utf8').digest('hex');
const same=(a,b)=>a.dev===b.dev&&a.ino===b.ino;
const regular=s=>s.isFile()&&!s.isSymbolicLink()&&s.nlink===1;
const text=(s,max)=>typeof s==='string'&&Buffer.byteLength(s,'utf8')<=max;
const digest=s=>text(s,256)&&s.length>0;
const uuid=s=>typeof s==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(s);
const timestamp=s=>text(s,40)&&Number.isFinite(Date.parse(s));
const fields=(s,keys)=>s&&typeof s==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(s))&&Object.entries(Object.getOwnPropertyDescriptors(s)).every(([k,d])=>keys.includes(k)&&Object.hasOwn(d,'value'));
const source=s=>text(s,MAX_SOURCE);
const empty=()=>({version:1,revisions:[],draft:null,intent:null});
const sourceFields=['source','sourceHash','contextDigest'];
function validRevision(r,index){return fields(r,['id','number','createdAt','label','kind',...sourceFields])&&uuid(r.id)&&r.number===index+1&&timestamp(r.createdAt)&&text(r.label,8000)&&['initial','external','save','restore'].includes(r.kind)&&source(r.source)&&r.sourceHash===hash(r.source)&&digest(r.contextDigest);}
function validDraft(d){return d===null||(fields(d,['baselineDigest','originalSource','proposedSource','selectedKeys','kind','label','contextDigest','createdAt'])&&digest(d.baselineDigest)&&source(d.originalSource)&&source(d.proposedSource)&&Array.isArray(d.selectedKeys)&&d.selectedKeys.length<=2000&&d.selectedKeys.every(k=>text(k,200))&&new Set(d.selectedKeys).size===d.selectedKeys.length&&['save','restore'].includes(d.kind)&&text(d.label,8000)&&digest(d.contextDigest)&&timestamp(d.createdAt));}
function validIntent(i,revisions){const latest=revisions.at(-1);return i===null||(fields(i,['id','createdAt','label','kind','beforeSourceHash','afterSource','afterSourceHash','contextDigest'])&&uuid(i.id)&&!revisions.some(r=>r.id===i.id)&&timestamp(i.createdAt)&&text(i.label,8000)&&['save','restore'].includes(i.kind)&&source(i.afterSource)&&i.afterSourceHash===hash(i.afterSource)&&digest(i.contextDigest)&&latest&&i.contextDigest===latest.contextDigest&&i.beforeSourceHash===latest.sourceHash);}
function valid(s){return fields(s,['version','revisions','draft','intent'])&&s.version===1&&Array.isArray(s.revisions)&&s.revisions.length<=MAX_REVISIONS&&s.revisions.every(validRevision)&&new Set(s.revisions.map(r=>r.id)).size===s.revisions.length&&validDraft(s.draft)&&validIntent(s.intent,s.revisions);}
function checkSource(value){if(typeof value!=='string')throw invalid();if(!source(value))throw error('VERSION_LIMIT');}
function append(state,{id=randomUUID(),createdAt=new Date().toISOString(),label,kind,source:bytes,contextDigest}){
 if(state.revisions.length>=MAX_REVISIONS)throw error('VERSION_LIMIT');
 const revision={id,number:state.revisions.length+1,createdAt,label,kind,source:bytes,sourceHash:hash(bytes),contextDigest};state.revisions.push(revision);return revision;
}
function finishIntent(state){const i=state.intent;const revision=append(state,{id:i.id,createdAt:i.createdAt,label:i.label,kind:i.kind,source:i.afterSource,contextDigest:i.contextDigest});state.intent=null;state.draft=null;return revision;}
class VersionStore {
 constructor(directory){if(!path.isAbsolute(directory))throw invalid();this.parent=directory;this.directory=path.join(directory,'versions');this.queue=Promise.resolve();this.anchor=null;this.parentAnchor=null;}
 filename(target){if(!target||!path.isAbsolute(target.root)||path.normalize(target.root)!==target.root||!/^[a-zA-Z0-9_-]{1,100}$/.test(target.slug))throw invalid();return path.join(this.directory,hash(JSON.stringify([target.root,target.slug]))+'.json');}
 async checkParent(){
  try{const stat=await fs.lstat(this.parent),canonical=await fs.realpath(this.parent);if(!stat.isDirectory()||stat.isSymbolicLink()||!same(stat,await fs.lstat(canonical))||!same(stat,await fs.lstat(this.parent)))throw invalid();if(this.parentAnchor&&(!same(stat,this.parentAnchor.stat)||canonical!==this.parentAnchor.canonical))throw invalid();this.parentAnchor||={stat,canonical};return true;}catch(e){if(e.code==='ENOENT'&&!this.parentAnchor&&!this.anchor)return false;throw invalid();}
 }
 async checkDirectory(){
  if(!await this.checkParent())return false;
  try{const stat=await fs.lstat(this.directory),canonical=await fs.realpath(this.directory);if(!stat.isDirectory()||stat.isSymbolicLink()||!same(stat,await fs.lstat(canonical))||!same(stat,await fs.lstat(this.directory)))throw invalid();if(this.anchor&&(!same(stat,this.anchor.stat)||canonical!==this.anchor.canonical))throw invalid();this.anchor||={stat,canonical};await this.checkParent();return true;}catch(e){if(e.code==='ENOENT'&&!this.anchor)return false;throw invalid();}
 }
 // Node does not support opening/fsyncing directories on Windows. There the
 // guarantee is process-crash recovery, not persistence across sudden power loss.
 // POSIX directory sync failures are fatal and never reported as successful saves.
 async syncDirectory(directory,anchor){
  if(process.platform==='win32')return;
  const handle=await fs.open(directory,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_DIRECTORY);
  try{
   const stat=await handle.stat();if(!stat.isDirectory()||!same(stat,anchor.stat))throw invalid();
   await this.checkDirectory();await handle.sync();await this.checkDirectory();
   if(!same(await handle.stat(),anchor.stat))throw invalid();
  }finally{await handle.close();}
 }
 async load(target){
  const file=this.filename(target);if(!await this.checkDirectory())return {state:empty(),identity:null};let handle,found=false;
  try{
   const stat=await fs.lstat(file);found=true;if(!regular(stat)||stat.size>MAX_BYTES)throw invalid();handle=await fs.open(file,constants.O_RDONLY|constants.O_NOFOLLOW);if(!same(stat,await handle.stat()))throw invalid();await this.checkDirectory();
   const bytes=Buffer.alloc(stat.size+1);const {bytesRead}=await handle.read(bytes,0,bytes.length,0);if(bytesRead!==stat.size)throw invalid();const now=await handle.stat();if(!regular(now)||now.size!==stat.size||now.mtimeMs!==stat.mtimeMs||!same(stat,await fs.lstat(file)))throw invalid();await this.checkDirectory();
   const raw=bytes.subarray(0,bytesRead).toString('utf8');const state=JSON.parse(raw);if(!valid(state))throw invalid();return {state,identity:{stat,hash:hash(raw)}};
  }catch(e){if(e.code==='ENOENT'&&!found){await this.checkDirectory();return {state:empty(),identity:null};}throw invalid();}finally{await handle?.close();}
 }
 async read(target){return (await this.load(target)).state;}
 mutate(target,change){
  const operation=this.queue.then(async()=>{
   const initial=await this.load(target);const result=change(initial.state);if(!valid(initial.state))throw invalid();const bytes=JSON.stringify(initial.state)+'\n';if(Buffer.byteLength(bytes)>MAX_BYTES)throw error('VERSION_LIMIT');
   // Pin the existing parent before creating the private store, then recheck both.
   await this.checkParent();await fs.mkdir(this.parent,{recursive:true,mode:0o700});await this.checkParent();await fs.mkdir(this.directory,{recursive:true,mode:0o700});await this.checkDirectory();
   // Persist the versions entry in its parent before a journal can authorize a write.
   // Sync on retries too: an earlier failed sync may have left the entry visible.
   await this.syncDirectory(this.parent,this.parentAnchor);
   const temp=path.join(this.directory,`.version-${randomUUID()}.tmp`);let owned;
   try{
    const handle=await fs.open(temp,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);try{owned=await handle.stat();if(!regular(owned))throw invalid();await this.checkDirectory();await handle.writeFile(bytes);await handle.sync();}finally{await handle.close();}
    const latest=await this.load(target);if(Boolean(initial.identity)!==Boolean(latest.identity)||(initial.identity&&(!same(initial.identity.stat,latest.identity.stat)||initial.identity.hash!==latest.identity.hash)))throw error('VERSION_CONFLICT');await this.checkDirectory();const stat=await fs.lstat(temp);if(!regular(stat)||!same(stat,owned))throw invalid();await fs.rename(temp,this.filename(target));await this.checkDirectory();await this.syncDirectory(this.directory,this.anchor);return result;
   }finally{try{await this.checkDirectory();const stat=await fs.lstat(temp);if(owned&&regular(stat)&&same(stat,owned))await fs.unlink(temp);}catch{/* Only remove the temporary file still owned by this operation. */}}
  }).catch(e=>{if(['VERSION_STORE_INVALID','VERSION_LIMIT','VERSION_CONFLICT','VERSION_RECONCILIATION_REQUIRED'].includes(e.code))throw e;throw invalid();});this.queue=operation.catch(()=>{});return operation;
 }
 observe(target,{source:bytes,contextDigest,label}={}){
  return this.mutate(target,state=>{checkSource(bytes);if(!digest(contextDigest)||(label!==undefined&&!text(label,8000)))throw invalid();
   if(state.intent){const i=state.intent;if(contextDigest!==i.contextDigest)throw error('VERSION_RECONCILIATION_REQUIRED');if(hash(bytes)===i.afterSourceHash&&bytes===i.afterSource)return finishIntent(state);if(hash(bytes)!==i.beforeSourceHash||bytes!==state.revisions.at(-1).source)throw error('VERSION_RECONCILIATION_REQUIRED');state.intent=null;}
   const latest=state.revisions.at(-1);if(latest&&latest.source===bytes&&latest.contextDigest===contextDigest)return latest;
   return append(state,{label:label??(latest?'偵測到外部修改':'匯入時的初始版本'),kind:latest?'external':'initial',source:bytes,contextDigest});
  });
 }
 prepare(target,{beforeSource,afterSource,contextDigest,label,kind}={}){
  return this.mutate(target,state=>{checkSource(beforeSource);checkSource(afterSource);if(!digest(contextDigest)||!text(label,8000)||!['save','restore'].includes(kind))throw invalid();if(state.intent)throw error('VERSION_RECONCILIATION_REQUIRED');const latest=state.revisions.at(-1);if(!latest||latest.source!==beforeSource||latest.contextDigest!==contextDigest)throw error('VERSION_CONFLICT');if(state.revisions.length>=MAX_REVISIONS)throw error('VERSION_LIMIT');
   state.intent={id:randomUUID(),createdAt:new Date().toISOString(),label,kind,beforeSourceHash:hash(beforeSource),afterSource,afterSourceHash:hash(afterSource),contextDigest};return state.intent.id;
  });
 }
 finish(target,id,currentSource){return this.mutate(target,state=>{checkSource(currentSource);if(!uuid(id))throw invalid();if(!state.intent){const latest=state.revisions.at(-1);if(latest?.id===id&&latest.source===currentSource)return latest;throw error('VERSION_CONFLICT');}if(state.intent.id!==id||state.intent.afterSource!==currentSource||state.intent.afterSourceHash!==hash(currentSource))throw error('VERSION_CONFLICT');return finishIntent(state);});}
 saveDraft(target,draft){return this.mutate(target,state=>{if(!validDraft(draft))throw invalid();state.draft=draft===null?null:JSON.parse(JSON.stringify(draft));return state.draft;});}
 async flush(){await this.queue;}
}
module.exports={VersionStore};
