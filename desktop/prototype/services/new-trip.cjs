const fs=require('node:fs/promises');
const {constants}=require('node:fs');
const path=require('node:path');
const {randomUUID,createHash}=require('node:crypto');
const os=require('node:os');
const {readTripSnapshot}=require('../../../packages/engine/snapshot.cjs');
const fail=code=>Object.assign(new Error(code),{code});
const same=(a,b)=>a.dev===b.dev&&a.ino===b.ino;
const SLUG=/^[a-z0-9][a-z0-9-]{0,79}$/;
const FILES=['trip.config.json','data.js','details.js','dining.js','map-lists.js','photos.json','theme.css','extra.js'];
const validDate=s=>{if(s==='')return true;if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;const d=new Date(s+'T00:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===s;};
function form(input){
  if(!input||typeof input!=='object')throw fail('INVALID_DRAFT');
  const out={};
  for(const [key,max] of Object.entries({title:160,destination:500,startDate:10,endDate:10,notes:16000})){const value=input[key]??'';if(typeof value!=='string'||value.length>max||value.includes('\0'))throw fail('INVALID_DRAFT');out[key]=value.trim();}
  if(!out.title||!validDate(out.startDate)||!validDate(out.endDate)||(out.startDate&&out.endDate&&out.endDate<out.startDate))throw fail('INVALID_DRAFT');
  out.party=input.party??null;if(out.party!==null&&(!Number.isInteger(out.party)||out.party<1||out.party>100))throw fail('INVALID_DRAFT');
  out.transport=input.transport??[];if(!Array.isArray(out.transport)||out.transport.length>3||out.transport.some(v=>!['drive','transit','walk'].includes(v)))throw fail('INVALID_DRAFT');
  return out;
}
async function directory(file){const stat=await fs.lstat(file);if(!stat.isDirectory()||stat.isSymbolicLink())throw fail('UNSAFE_PATH');const canonical=await fs.realpath(file);if(!same(stat,await fs.lstat(file)))throw fail('UNSAFE_PATH');return {file,stat,canonical};}
async function anchored(anchors){for(const a of anchors){const s=await fs.lstat(a.file);if(!s.isDirectory()||s.isSymbolicLink()||!same(s,a.stat)||await fs.realpath(a.file)!==a.canonical)throw fail('UNSAFE_PATH');}}
async function read(file,max=2*1024*1024){const before=await fs.lstat(file);if(!before.isFile()||before.isSymbolicLink()||before.nlink!==1||before.size>max)throw fail('UNSAFE_PATH');const h=await fs.open(file,constants.O_RDONLY|constants.O_NOFOLLOW);try{if(!same(before,await h.stat()))throw fail('UNSAFE_PATH');const buffer=Buffer.alloc(before.size+1);const {bytesRead}=await h.read(buffer,0,buffer.length,0);const after=await h.stat();if(bytesRead!==before.size||!same(before,after)||after.size!==before.size||after.mtimeMs!==before.mtimeMs||after.nlink!==1)throw fail('UNSAFE_PATH');return buffer.subarray(0,bytesRead);}finally{await h.close();}}
class NewTripService{
  constructor({checkPrivate,templatesRoot=path.resolve(__dirname,'../../../scripts/templates'),afterBackup=async()=>{}}={}){if(typeof checkPrivate!=='function')throw fail('PRIVATE_CHECK_REQUIRED');this.checkPrivate=checkPrivate;this.afterBackup=afterBackup;this.templatesRoot=templatesRoot;this.queue=Promise.resolve();this.prepared=new Map();}
  run(fn){const job=this.queue.then(fn);this.queue=job.catch(()=>{});return job;}
  async roots(root,write=false){if(typeof root!=='string'||!path.isAbsolute(root))throw fail('UNSAFE_PATH');const a=await directory(root);if(write&&(await this.checkPrivate(a.canonical))===false)throw fail('PRIVATE_PROJECT_REQUIRED');const trips=path.join(root,'trips');if(write){try{await fs.mkdir(trips,{mode:0o700});}catch(e){if(e.code!=='EEXIST')throw e;}}const b=await directory(trips);await anchored([a,b]);return [a,b];}
  async target(root,slug,write=false){if(!SLUG.test(slug))throw fail('UNSAFE_PATH');const roots=await this.roots(root,write);return [...roots,await directory(path.join(root,'trips',slug)),await directory(path.join(root,'trips',slug,'docs'))];}
  create(root,input){return this.run(async()=>{
    const values=form(input);const anchors=[...await this.roots(root,true),...await this.recoveryDirectory(root,true)];const trips=anchors[1].file;
    const prefix=values.title.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,50)||'trip';
    // Random suffix plus exclusive sidecar reservation prevents cooperating app processes from colliding.
    // The final destination stays absent so directory rename also works on Windows.
    const slug=prefix+'-'+randomUUID().slice(0,8);const target=path.join(trips,slug);const stage=path.join(anchors.at(-1).file,'.planning-'+randomUUID());await fs.mkdir(stage,{mode:0o700});const staged=await directory(stage);let reservation=null;const reservationPath=path.join(trips,'.create-'+slug+'.lock');
    try{
      await fs.mkdir(path.join(stage,'docs'),{mode:0o700});const draft={version:1,...values,status:'planning',revision:1,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
      const config=JSON.parse(await read(path.join(this.templatesRoot,'trip.config.json')));delete config._readme;Object.assign(config,{title:values.title,heading:values.title,description:'',dates:{start:values.startDate,end:values.endDate},party:values.party,transport:values.transport,currency:'',region:{country:'',bbox:[]},deploy:{name:slug,target:'workers'}});
      await fs.writeFile(path.join(stage,'trip.config.json'),JSON.stringify(config,null,2)+'\n',{flag:'wx',mode:0o600});
      await fs.writeFile(path.join(stage,'data.js'),"// Planning draft: no locations or travel facts have been researched.\nconst PLACES = {};\nconst DAYS = [];\nconst OVERVIEW_ROUTE = [];\nconst ADDONS = [];\nconst CHECKLIST = ['確認逐日草案後，再開始查核地點、交通與餐食'];\nconst STAYS = [];\nconst OVERVIEW = {checked:'',foot:[]};\nmodule.exports = {PLACES,DAYS,OVERVIEW_ROUTE,ADDONS,CHECKLIST,STAYS,OVERVIEW};\n",{flag:'wx',mode:0o600});
      const empty={'details.js':'module.exports = {};\n','dining.js':'module.exports = {};\n','map-lists.js':'module.exports = {};\n','photos.json':'{}\n','theme.css':'/* Add trip-specific styles here. */\n','extra.js':'/* Add trip-specific sections here. */\n'};
      for(const [name,content] of Object.entries(empty))await fs.writeFile(path.join(stage,name),content,{flag:'wx',mode:0o600});
      await fs.writeFile(path.join(stage,'docs/planning-draft.json'),JSON.stringify(draft,null,2)+'\n',{flag:'wx',mode:0o600});await fs.writeFile(path.join(stage,'docs/status.md'),'# 旅程進度\n\n最後更新：'+draft.updatedAt+'\n\n- 目前階段：規劃；已建立可保存的旅程草稿，資料尚未查核。\n- 等待確認：逐日草案與日期、目的地等基本資料。\n- 阻礙：尚未完成行程資料，不能預覽或發布。\n- 下一步：與 AI 討論並確認逐日草案，再進行研究查核。\n',{flag:'wx',mode:0o600});
      await anchored([...anchors,staged]);const lock=await fs.open(reservationPath,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);try{reservation=await lock.stat();}finally{await lock.close();}try{await fs.lstat(target);throw fail('TRIP_EXISTS');}catch(e){if(e.code!=='ENOENT')throw e;}await anchored([...anchors,staged]);await fs.rename(stage,target);return {root:anchors[0].canonical,slug,draft,planning:true};
    }finally{if(reservation){try{await anchored(anchors);const stat=await fs.lstat(reservationPath);if(stat.isFile()&&!stat.isSymbolicLink()&&stat.nlink===1&&same(stat,reservation))await fs.unlink(reservationPath);}catch{}}try{await anchored([...anchors,staged]);await fs.rm(stage,{recursive:true});}catch{}}
  });}
  async readDraft(root,slug){const anchors=await this.target(root,slug);const raw=await read(path.join(anchors[3].file,'planning-draft.json'),100000);await anchored(anchors);const d=JSON.parse(raw);form(d);if(d.version!==1||!Number.isSafeInteger(d.revision)||!['planning','ready'].includes(d.status))throw fail('INVALID_DRAFT');return d;}
  updateDraft(root,slug,patch){return this.run(async()=>{const anchors=await this.target(root,slug,true);const before=await this.readDraft(root,slug);if(before.status!=='planning')throw fail('ALREADY_MATERIALIZED');if(patch.expectedRevision!==undefined&&patch.expectedRevision!==before.revision)throw fail('DRAFT_CHANGED');const draft={...before,...form({...before,...patch}),revision:before.revision+1,updatedAt:new Date().toISOString()};const temp=path.join(anchors[3].file,'.draft-'+randomUUID());await fs.writeFile(temp,JSON.stringify(draft,null,2)+'\n',{flag:'wx',mode:0o600});try{await anchored(anchors);if((await this.readDraft(root,slug)).revision!==before.revision)throw fail('DRAFT_CHANGED');await fs.rename(temp,path.join(anchors[3].file,'planning-draft.json'));return draft;}finally{try{await anchored(anchors);await fs.unlink(temp);}catch{}}});}
  async tree(dir,relative='',result=Object.create(null)) {
    const anchor=await directory(dir);
    for(const name of (await fs.readdir(dir)).sort()) {
      if(Object.keys(result).length>200)throw fail('PLANNING_TOO_LARGE');
      const file=path.join(dir,name), key=relative?relative+'/'+name:name;const stat=await fs.lstat(file);
      if(stat.isDirectory()&&!stat.isSymbolicLink())await this.tree(file,key,result);
      else result[key]=await read(file);
    }
    await anchored([anchor]);if(Object.values(result).reduce((sum,b)=>sum+b.length,0)>16*1024*1024)throw fail('PLANNING_TOO_LARGE');return result;
  }
  digest(files){const h=createHash('sha256');for(const key of Object.keys(files).sort())h.update(key+'\0').update(files[key]).update('\0');return h.digest('hex');}
  prepareMaterialization(root,slug,{files}={}){return this.run(async()=>{
    const anchors=await this.target(root,slug,true);const draft=await this.readDraft(root,slug);if(draft.status!=='planning')throw fail('ALREADY_MATERIALIZED');
    if(!files||typeof files!=='object'||Object.keys(files).some(k=>!FILES.includes(k))||!['trip.config.json','data.js','details.js','dining.js','map-lists.js','photos.json'].every(k=>typeof files[k]==='string')||Object.values(files).some(s=>typeof s!=='string'||Buffer.byteLength(s)>2*1024*1024))throw fail('INVALID_MATERIALIZATION');
    const config=JSON.parse(files['trip.config.json']);if(config.deploy?.name!==slug)throw fail('DEPLOY_NAME_MISMATCH');
    if(this.prepared.size>=4)throw fail('PREPARATION_LIMIT');
    const originals=await this.tree(anchors[2].file);const originalDigest=this.digest(originals);
    const previewRoot=await fs.mkdtemp(path.join(os.tmpdir(),'travel-planning-'));await fs.chmod(previewRoot,0o700);const stage=path.join(previewRoot,'trips',slug);await fs.mkdir(stage,{recursive:true,mode:0o700});
    try{
      for(const [name,bytes] of Object.entries({...originals,...files})) {const dest=path.join(stage,name);await fs.mkdir(path.dirname(dest),{recursive:true,mode:0o700});await fs.writeFile(dest,bytes,{flag:'wx',mode:0o600});}
      await readTripSnapshot(stage,{slug});
      await anchored(anchors);if(this.digest(await this.tree(anchors[2].file))!==originalDigest)throw fail('DRAFT_CHANGED');
      const token=randomUUID();const stageAnchors=[await directory(previewRoot),await directory(path.join(previewRoot,'trips')),await directory(stage)];
      this.prepared.set(token,{root,slug,anchors,previewRoot,stage,stageAnchors,originalDigest,candidateDigest:this.digest(await this.tree(stage)),draft});return {token,root:previewRoot,slug,tripDirectory:stage};
    }catch(e){await fs.rm(previewRoot,{recursive:true,force:true});throw e;}
  });}
  async recoveryDirectory(root,create=false){const anchors=[await directory(root)];for(const folder of ['.local','desktop-planning']){const next=path.join(anchors.at(-1).file,folder);if(create){try{await fs.mkdir(next,{mode:0o700});}catch(e){if(e.code!=='EEXIST')throw e;}}anchors.push(await directory(next));}await anchored(anchors);return anchors;}
  async syncDirectory(dir){let handle;try{handle=await fs.open(dir,constants.O_RDONLY);await handle.sync();}catch(e){if(process.platform!=='win32'||!['EPERM','EACCES','EINVAL','EISDIR'].includes(e.code))throw e;}finally{await handle?.close();}}
  async syncTree(dir){for(const name of await fs.readdir(dir)){const file=path.join(dir,name);const stat=await fs.lstat(file);if(stat.isDirectory()&&!stat.isSymbolicLink())await this.syncTree(file);else{if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1)throw fail('UNSAFE_PATH');const h=await fs.open(file,constants.O_RDWR|constants.O_NOFOLLOW);try{if(!same(stat,await h.stat()))throw fail('UNSAFE_PATH');await h.sync();}finally{await h.close();}}}await this.syncDirectory(dir);}
  recover(root){return this.run(async()=>{
    let anchors;try{anchors=await this.roots(root);}catch(e){if(e.code==='ENOENT')return [];throw e;}
    let recoveryAnchors;try{recoveryAnchors=await this.recoveryDirectory(root);}catch(e){if(e.code==='ENOENT')return [];throw e;}const storage=recoveryAnchors[2].file;
    const names=(await fs.readdir(storage)).filter(n=>/^\.materialization-[0-9a-f-]{36}\.json$/.test(n));if(!names.length)return [];await this.roots(root,true);const results=[];
    for(const name of names){const journalPath=path.join(storage,name);const record=JSON.parse(await read(journalPath,16384));
      if(record.version!==1||name!=='.materialization-'+record.id+'.json'||!SLUG.test(record.slug)||!/^\.materialize-[0-9a-f-]{36}$/.test(record.stage)||record.backup!=='.planning-backup-'+record.slug+'-'+record.id||!/^\.materialization-[0-9a-f-]{36}\.json$/.test('.materialization-'+record.id+'.json')||![record.originalDigest,record.candidateDigest].every(v=>typeof v==='string'&&/^[0-9a-f]{64}$/.test(v)))throw fail('MATERIALIZATION_RECOVERY_REQUIRED');
      const target=path.join(anchors[1].file,record.slug),backup=path.join(storage,record.backup);let current;
      try{current=this.digest(await this.tree(target));}catch(e){if(e.code!=='ENOENT')throw fail('MATERIALIZATION_RECOVERY_REQUIRED');}
      let state;
      if(current===record.candidateDigest)state='completed';else if(current===record.originalDigest)state='unchanged';else if(current!==undefined)throw fail('MATERIALIZATION_RECOVERY_REQUIRED');
      else {let backupDigest;try{backupDigest=this.digest(await this.tree(backup));}catch{throw fail('MATERIALIZATION_RECOVERY_REQUIRED');}if(backupDigest!==record.originalDigest)throw fail('MATERIALIZATION_RECOVERY_REQUIRED');await anchored([...anchors,...recoveryAnchors]);try{await fs.lstat(target);throw fail('MATERIALIZATION_RECOVERY_REQUIRED');}catch(e){if(e.code!=='ENOENT')throw e;}await fs.rename(backup,target);await this.syncDirectory(anchors[1].file);await this.syncDirectory(storage);state='restored';}
      await anchored([...anchors,...recoveryAnchors]);await fs.unlink(journalPath);await this.syncDirectory(storage);results.push({slug:record.slug,state});
    }return results;
  });}
  confirmMaterialization(token,{planConfirmed=false,previewConfirmed=false}={}){return this.run(async()=>{
    if(planConfirmed!==true)throw fail('PLAN_CONFIRMATION_REQUIRED');if(previewConfirmed!==true)throw fail('PREVIEW_CONFIRMATION_REQUIRED');
    const p=this.prepared.get(token);if(!p)throw fail('PREPARATION_NOT_FOUND');await this.roots(p.root,true);await anchored([...p.anchors,...p.stageAnchors]);
    if(this.digest(await this.tree(p.anchors[2].file))!==p.originalDigest||this.digest(await this.tree(p.stage))!==p.candidateDigest)throw fail('DRAFT_CHANGED');
    const recoveryAnchors=await this.recoveryDirectory(p.root,true);const storage=recoveryAnchors[2].file;const stage=path.join(storage,'.materialize-'+randomUUID());await fs.mkdir(stage,{mode:0o700});const stageAnchor=await directory(stage);const transactionId=randomUUID();const backup=path.join(storage,'.planning-backup-'+p.slug+'-'+transactionId);const journalPath=path.join(storage,'.materialization-'+transactionId+'.json');let moved=false;
    try {
      for(const [name,bytes] of Object.entries(await this.tree(p.stage))){const dest=path.join(stage,name);await fs.mkdir(path.dirname(dest),{recursive:true,mode:0o700});await fs.writeFile(dest,bytes,{flag:'wx',mode:0o600});}
      await fs.writeFile(path.join(stage,'docs/planning-draft.json'),JSON.stringify({...p.draft,status:'ready',revision:p.draft.revision+1,updatedAt:new Date().toISOString()},null,2)+'\n');
      await fs.appendFile(path.join(stage,'docs/status.md'),'\n## 桌面版資料建立\n- 目前階段：已確認逐日草案與預覽，資料格式驗證通過；格式驗證不代表事實查核完成。\n- 等待確認：來源查核結果。\n- 阻礙：尚未發布。\n- 下一步：查核完成後再發布。\n');
      await anchored([...p.anchors,...recoveryAnchors,stageAnchor]);if(this.digest(await this.tree(p.anchors[2].file))!==p.originalDigest)throw fail('DRAFT_CHANGED');
      await this.syncTree(stage);const journal={version:1,id:transactionId,slug:p.slug,stage:path.basename(stage),backup:path.basename(backup),originalDigest:p.originalDigest,candidateDigest:this.digest(await this.tree(stage))};const journalHandle=await fs.open(journalPath,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);try{await journalHandle.writeFile(JSON.stringify(journal)+'\n');await journalHandle.sync();}finally{await journalHandle.close();}await this.syncDirectory(storage);await anchored([...p.anchors,...recoveryAnchors,stageAnchor]);await fs.rename(p.anchors[2].file,backup);moved=true;await this.syncDirectory(p.anchors[1].file);await this.syncDirectory(storage);await this.afterBackup();
      try{await anchored([p.anchors[0],p.anchors[1],...recoveryAnchors,stageAnchor]);await fs.rename(stage,p.anchors[2].file);}catch(e){await fs.rename(backup,p.anchors[2].file);moved=false;throw e;}
      await this.syncDirectory(p.anchors[1].file);await fs.unlink(journalPath);await this.syncDirectory(storage);this.prepared.delete(token);await fs.rm(p.previewRoot,{recursive:true,force:true});return {root:p.anchors[0].canonical,slug:p.slug,planning:false};
    }finally{if(!moved){try{await anchored([p.anchors[0],p.anchors[1],stageAnchor]);await fs.rm(stage,{recursive:true});}catch{}}}
  });}
  discardMaterialization(token){return this.run(async()=>{const p=this.prepared.get(token);if(!p)return false;await anchored(p.stageAnchors);await fs.rm(p.previewRoot,{recursive:true});this.prepared.delete(token);return true;});}
  async materialize(root,slug,{files,planConfirmed=false,previewConfirmed=false}={}){
    if(!planConfirmed)throw fail('PLAN_CONFIRMATION_REQUIRED');const p=await this.prepareMaterialization(root,slug,{files});try{return await this.confirmMaterialization(p.token,{planConfirmed,previewConfirmed});}finally{await this.discardMaterialization(p.token);}
  }
}
module.exports={NewTripService};
