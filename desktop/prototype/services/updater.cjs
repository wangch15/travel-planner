const {EventEmitter}=require('node:events');
const fs=require('node:fs/promises');
const path=require('node:path');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {checkForUpdates,APP_VERSION}=require('./environment.cjs');
const runDefault=promisify(execFile);
const REPO='https://github.com/wangch15/travel-planner/releases/';
const fail=code=>Object.assign(new Error(code),{code});
const manual=reason=>({automatic:false,reason});
async function detectUpdateCapability({app,platform=process.platform,resourcesPath=process.resourcesPath,executable=process.execPath,run=runDefault}={}){
  if(!app?.isPackaged)return manual('development');if(!['darwin','win32'].includes(platform))return manual('unsupported-platform');if(!resourcesPath)return manual('missing-update-config');
  let config;try{const file=path.join(resourcesPath,'app-update.yml');const stat=await fs.lstat(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1||stat.size>32768)return manual('invalid-update-config');const yaml=require(require.resolve('js-yaml',{paths:[path.dirname(require.resolve('electron-updater'))]}));config=yaml.load(await fs.readFile(file,'utf8'),{schema:yaml.JSON_SCHEMA});}catch{return manual('missing-update-config');}
  if(config?.provider!=='github'||config.owner!=='wangch15'||config.repo!=='travel-planner')return manual('unapproved-update-provider');
  if(platform==='darwin'){
    try{const bundle=path.resolve(resourcesPath,'../..');await run('/usr/bin/codesign',['--verify','--deep','--strict',bundle],{timeout:10000,maxBuffer:16384});const result=await run('/usr/bin/codesign',['--display','--verbose=4',bundle],{timeout:5000,maxBuffer:16384});const evidence=result.stderr+'\n'+result.stdout;if(!/Authority=Developer ID Application:/.test(evidence)||!/TeamIdentifier=[A-Z0-9]{10}(?:\s|$)/.test(evidence)||/Signature=adhoc/.test(evidence))return manual('unsigned');return {automatic:true,reason:null,platform,signature:'developer-id'};}catch{return manual('unsigned');}
  }
  const publishers=typeof config.publisherName==='string'?[config.publisherName]:config.publisherName;if(!Array.isArray(publishers)||!publishers.length||publishers.length>10||publishers.some(p=>typeof p!=='string'||!p.trim()||p.length>200))return manual('missing-publisher');
  try{const uninstaller=await fs.lstat(path.join(path.dirname(executable),'Uninstall Travel Planner.exe'));if(!uninstaller.isFile()||uninstaller.isSymbolicLink())return manual('portable');}catch{return manual('portable');}
  try{const script="$s=Get-AuthenticodeSignature -LiteralPath $env:TRAVEL_PLANNER_SIGNATURE_TARGET; $name=if($s.SignerCertificate){$s.SignerCertificate.GetNameInfo([System.Security.Cryptography.X509Certificates.X509NameType]::SimpleName,$false)}else{''}; @{status=$s.Status.ToString();publisher=$name}|ConvertTo-Json -Compress";const result=await run('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{timeout:10000,maxBuffer:8192,windowsHide:true,env:{...process.env,TRAVEL_PLANNER_SIGNATURE_TARGET:executable}});const signature=JSON.parse(result.stdout);if(signature.status!=='Valid'||!publishers.includes(signature.publisher))return manual('unsigned');return {automatic:true,reason:null,platform,publishers};}catch{return manual('unsigned');}
}
function nativeFactory(options,platform){const {MacUpdater,NsisUpdater}=require('electron-updater');return platform==='darwin'?new MacUpdater(options):new NsisUpdater(options);}
function approvedRelease(release,platform){
  if(!release||!/^\d+\.\d+\.\d+$/.test(release.version)||release.url!==REPO+'tag/desktop-v'+release.version||!Array.isArray(release.assets))throw fail('INVALID_UPDATE_METADATA');const base=REPO+'download/desktop-v'+release.version+'/';const assets=new Map();
  for(const a of release.assets){if(!a||typeof a.name!=='string'||a.name.includes('/')||a.name.includes('\\')||a.url!==base+encodeURIComponent(a.name)||!Number.isSafeInteger(a.size)||a.size<0)throw fail('INVALID_UPDATE_METADATA');assets.set(a.url,a);}
  const metadata=platform==='darwin'?'latest-mac.yml':'latest.yml';if(!assets.has(base+metadata))throw fail('UPDATE_METADATA_UNAVAILABLE');return {base,assets};
}
function validateUpdateInfo(info,release,platform){const approved=approvedRelease(release,platform);if(!info||info.version!==release.version||info.packages||!Array.isArray(info.files)||!info.files.length||info.files.length>30)throw fail('INVALID_UPDATE_METADATA');let installable=false;
  const validateURL=raw=>{if(typeof raw!=='string')throw fail('INVALID_UPDATE_METADATA');let u;try{u=new URL(raw,approved.base);}catch{throw fail('INVALID_UPDATE_METADATA');}if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||!approved.assets.has(u.href))throw fail('INVALID_UPDATE_METADATA');return u.href;};
  for(const f of info.files){const url=validateURL(f.url);if(typeof f.sha512!=='string'||!/^[A-Za-z0-9+/]{86}==$/.test(f.sha512)||Buffer.from(f.sha512,'base64').length!==64||!Number.isSafeInteger(f.size)||f.size!==approved.assets.get(url).size)throw fail('INVALID_UPDATE_METADATA');if(url.endsWith(platform==='darwin'?'.zip':'.exe'))installable=true;}
  if(info.path)validateURL(info.path);if(!installable)throw fail('INVALID_UPDATE_METADATA');return approved;
}
class UpdateManager extends EventEmitter{
  constructor({app,platform=process.platform,nativeFactory:makeNative=nativeFactory,checkRelease=checkForUpdates,detectCapability=detectUpdateCapability}={}){super();this.app=app;this.platform=platform;this.makeNative=makeNative;this.checkRelease=checkRelease;this.detectCapability=detectCapability;this.native=null;this.info=null;this.cancellationToken=null;this.busy=false;this.release=null;this.value={state:'idle',capability:null,release:null,progress:null,error:null};}
  status(){return structuredClone(this.value);}
  set(patch){this.value={...this.value,...patch};this.emit('changed',this.status());return this.status();}
  async operation(fn){if(this.busy)throw fail('UPDATE_BUSY');this.busy=true;try{return await fn();}catch(e){this.set({state:'error',error:typeof e.code==='string'&&/^[A-Z_]{1,80}$/.test(e.code)?e.code:'UPDATE_FAILED'});throw e;}finally{this.busy=false;}}
  check(){if(['downloaded','installing'].includes(this.value.state))return Promise.resolve(this.status());return this.operation(async()=>{
    this.set({state:'checking',error:null,progress:null});const app=this.app||require('electron').app;const capability=await this.detectCapability({app,platform:this.platform});const release=await this.checkRelease({currentVersion:app.isPackaged?(app.getVersion?.()||APP_VERSION):APP_VERSION});this.release=structuredClone(release);this.set({capability,release:this.release});
    if(!capability.automatic)return this.set({state:'manual-only'});if(release.state!=='available')return this.set({state:release.state});const approved=approvedRelease(release,this.platform);
    const provider={provider:'generic',url:approved.base,useMultipleRangeRequest:false};if(this.native){if(typeof this.native.setFeedURL!=='function')throw fail('INVALID_NATIVE_UPDATER');this.native.setFeedURL(provider);}else{this.native=this.makeNative(provider,this.platform);this.native.on('error',()=>this.set({state:'error',error:'NATIVE_UPDATE_FAILED'}));this.native.on('download-progress',p=>{if(this.value.state==='downloading')this.set({progress:Number.isFinite(p.percent)?Math.max(0,Math.min(100,p.percent)):null});});}this.native.autoDownload=false;this.native.autoInstallOnAppQuit=false;this.native.allowDowngrade=false;this.native.allowPrerelease=false;this.native.disableWebInstaller=true;this.native.disableDifferentialDownload=true;
    const result=await this.native.checkForUpdates();validateUpdateInfo(result?.updateInfo,this.release,this.platform);this.info=result.updateInfo;this.cancellationToken=result.cancellationToken||null;if(result.isUpdateAvailable===false)return this.set({state:'unavailable',error:'NATIVE_UPDATE_UNAVAILABLE'});return this.set({state:'available'});
  });}
  download(){return this.operation(async()=>{if(!this.value.capability?.automatic)throw fail('AUTOMATIC_UPDATE_UNAVAILABLE');if(this.value.state!=='available'||!this.native||!this.info)throw fail('UPDATE_NOT_AVAILABLE');const capability=await this.detectCapability({app:this.app||require('electron').app,platform:this.platform});if(!capability.automatic)throw fail('AUTOMATIC_UPDATE_UNAVAILABLE');validateUpdateInfo(this.info,this.release,this.platform);if(this.native.updateInfoAndProvider?.info)validateUpdateInfo(this.native.updateInfoAndProvider.info,this.release,this.platform);this.set({state:'downloading',progress:0,error:null});await this.native.downloadUpdate(this.cancellationToken||undefined);if(this.value.state==='error')throw fail('NATIVE_UPDATE_FAILED');return this.set({state:'downloaded',progress:100});});}
  cancelDownload(){if(this.value.state==='downloading')this.cancellationToken?.cancel?.();}
  async install(){if(this.busy)throw fail('UPDATE_BUSY');if(this.value.state!=='downloaded'||!this.native)throw fail('UPDATE_NOT_DOWNLOADED');this.set({state:'installing'});try{this.native.quitAndInstall(false,true);return this.status();}catch(e){this.set({state:'error',error:'NATIVE_UPDATE_FAILED'});throw e;}}
}
module.exports={UpdateManager,detectUpdateCapability,validateUpdateInfo};
