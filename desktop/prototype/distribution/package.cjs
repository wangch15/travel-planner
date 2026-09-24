const fs=require('node:fs/promises');
const path=require('node:path');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const run=promisify(execFile);
const ROOT=path.resolve(__dirname,'../../..');
const NAME='Travel Planner';
const ELECTRON_VERSION='44.4.3';
const RCEDIT_VERSION='5.0.2';
const RCEDIT_INTEGRITY='sha512-dgysxaeXZ4snLpPjn8aVtHvZDCx+aRcvZbaWBgl1poU6OPustMvOkj9a9ZqASQ6i5Y5szJ13LSvglEOwrmgUxA==';
async function stampWindowsIcon(executable,icon,version,{toolDirectory=process.env.TRAVEL_PLANNER_RCEDIT_DIR,run:execute=run}={}){
  if(!toolDirectory||!path.isAbsolute(toolDirectory))throw Error('RCEDIT_REQUIRED: use distribution/build-windows.ps1');
  const pkg=JSON.parse(await fs.readFile(path.join(toolDirectory,'node_modules/rcedit/package.json'),'utf8'));const lock=JSON.parse(await fs.readFile(path.join(toolDirectory,'package-lock.json'),'utf8'));
  if(pkg.version!==RCEDIT_VERSION||lock.packages?.['node_modules/rcedit']?.integrity!==RCEDIT_INTEGRITY)throw Error('RCEDIT_VERSION_MISMATCH');
  await execute(process.execPath,[path.join(__dirname,'stamp-windows.mjs'),executable,icon,version,toolDirectory],{timeout:60000,maxBuffer:8192,windowsHide:true});
}
function runtimeManifest(version){if(!/^\d+\.\d+\.\d+$/.test(version))throw Error('INVALID_APP_VERSION');return {name:'travel-planner-desktop',productName:NAME,version,private:true,main:'desktop/prototype/boot.cjs',dependencies:{'@travel-planner/engine':'1.1.0',acorn:'8.18.0',pngjs:'7.0.0',wrangler:'4.135.0','electron-updater':'6.8.9'}};}
function packageFilter(relative){const p=relative.replaceAll('\\','/');if(/(^|\/)(node_modules|tests|test|\.git|\.local|\.cache|trips)(\/|$)/.test(p)||/smoke\.cjs$|\.test\.[cm]?js$|\.map$/.test(p))return false;if(p.startsWith('desktop/prototype/distribution'))return false;if(p.startsWith('desktop/prototype/')&&/\.(md|log)$/.test(p))return false;return ['src','public','scripts/lib','scripts/templates','packages/engine','desktop/prototype','docs/schema'].some(prefix=>p===prefix||p.startsWith(prefix+'/'))||['desktop/spikes/inspect-project.cjs','.githooks/pre-push','scripts/pre-push.js','CHANGELOG.md'].includes(p)||/^scripts\/(check|build|ship|unship|adopt-deploy|migrate|photos|update-check)\.js$/.test(p)||p==='scripts/migrate'||/^scripts\/migrate\/[0-9]+-to-[0-9]+\.js$/.test(p);}
async function installed(name,from){for(let p=from;;p=path.dirname(p)){const candidate=path.join(p,'node_modules',name);try{const info=JSON.parse(await fs.readFile(path.join(candidate,'package.json'),'utf8'));return {source:await fs.realpath(candidate),location:candidate,info};}catch(e){if(e.code!=='ENOENT')throw e;}if(path.dirname(p)===p)break;}return null;}
async function collectRuntimePackages(root=ROOT){const found=new Map();async function visit(name,from,optional=false){const entry=await installed(name,from);if(!entry){if(optional)return;throw Error('Missing runtime dependency: '+name);}if(found.has(entry.location))return;const relative=path.relative(root,entry.location);if(relative.startsWith('..')||path.isAbsolute(relative))throw Error('Runtime dependency outside repository');found.set(entry.location,{name,source:entry.source,relative,version:entry.info.version});for(const [dep] of Object.entries(entry.info.dependencies||{}))await visit(dep,entry.source,false);for(const [dep] of Object.entries(entry.info.optionalDependencies||{}))await visit(dep,entry.source,true);}for(const name of ['@travel-planner/engine','acorn','pngjs','wrangler','electron-updater'])await visit(name,root);return [...found.values()];}
async function copyRuntime(destination,{root=ROOT,version=require('../package.json').version}={}){
  await fs.mkdir(destination,{recursive:true});
  for(const relative of ['src','public','scripts/lib','scripts/templates','packages/engine','desktop/prototype','desktop/spikes/inspect-project.cjs','.githooks/pre-push','scripts/pre-push.js','docs/schema','scripts/migrate','CHANGELOG.md',...['check','build','ship','unship','adopt-deploy','migrate','photos','update-check'].map(n=>'scripts/'+n+'.js')]){try{await fs.cp(path.join(root,relative),path.join(destination,relative),{recursive:true,filter:source=>packageFilter(path.relative(root,source)),dereference:false});}catch(e){if(e.code!=='ENOENT')throw e;}}
  const dependencies=await collectRuntimePackages(root);for(const dep of dependencies)await fs.cp(dep.source,path.join(destination,dep.relative),{recursive:true,dereference:false,filter:source=>{const rel=path.relative(dep.source,source).replaceAll('\\','/');return !/(^|\/)(node_modules|tests|test|\.github)(\/|$)/.test(rel)&&!rel.endsWith('.map');}});
  await fs.writeFile(path.join(destination,'package.json'),JSON.stringify(runtimeManifest(version),null,2)+'\n');
  // 打包當下的引擎版本與來源 commit：App 內「更新專案」會把專案對齊到這一版。
  let commit=null;try{commit=(await run('git',['-C',root,'rev-parse','HEAD'])).stdout.trim();}catch{}
  await fs.writeFile(path.join(destination,'desktop/prototype/build-info.json'),JSON.stringify({engineVersion:require(path.join(root,'package.json')).version,commit:/^[0-9a-f]{40}$/.test(commit||'')?commit:null})+'\n');return dependencies.map(({name,version})=>({name,version}));
}
async function plist(file,key,value){await run('/usr/libexec/PlistBuddy',['-c',`Set :${key} ${value}`,file]);}
async function packageApp({root=ROOT,platform=process.platform,output=path.join(root,'.local/distribution'),electronDist=path.join(path.dirname(require.resolve('electron/package.json')),'dist')}={}){
  if(!['darwin','win32'].includes(platform))throw Error('Only macOS and Windows packages are supported');const installedVersion=(await fs.readFile(path.join(electronDist,'version'),'utf8')).trim();if(installedVersion!==ELECTRON_VERSION)throw Error('Electron version mismatch');
  await fs.mkdir(output,{recursive:true});const version=JSON.parse(await fs.readFile(path.join(root,'desktop/prototype/package.json'),'utf8')).version;let artifact,resources;
  if(platform==='darwin'){
    artifact=path.join(output,NAME+'.app');try{await fs.lstat(artifact);throw Error('OUTPUT_EXISTS');}catch(e){if(e.code!=='ENOENT')throw e;}
    await fs.cp(path.join(electronDist,'Electron.app'),artifact,{recursive:true,verbatimSymlinks:true});resources=path.join(artifact,'Contents/Resources');const info=path.join(artifact,'Contents/Info.plist');
    for(const [key,value] of Object.entries({CFBundleDisplayName:NAME,CFBundleName:NAME,CFBundleIdentifier:'app.travelplanner.desktop',CFBundleShortVersionString:version,CFBundleVersion:version,CFBundleIconFile:'travel-planner.icns',LSApplicationCategoryType:'public.app-category.travel'}))await plist(info,key,value);
    await run('/usr/libexec/PlistBuddy',['-c','Delete :ElectronAsarIntegrity',info]).catch(()=>{});
    await fs.copyFile(path.join(root,'desktop/prototype/assets/brand/light/app.icns'),path.join(resources,'travel-planner.icns'));await fs.rm(path.join(artifact,'Contents/_CodeSignature'),{recursive:true,force:true});
  }else{artifact=path.join(output,NAME+'-win-'+process.arch);try{await fs.lstat(artifact);throw Error('OUTPUT_EXISTS');}catch(e){if(e.code!=='ENOENT')throw e;}await fs.cp(electronDist,artifact,{recursive:true});await fs.rename(path.join(artifact,'electron.exe'),path.join(artifact,NAME+'.exe'));await stampWindowsIcon(path.join(artifact,NAME+'.exe'),path.join(root,'desktop/prototype/assets/brand/light/app.ico'),version);resources=path.join(artifact,'resources');}
  await fs.rm(path.join(resources,'default_app.asar'),{force:true});const dependencies=await copyRuntime(path.join(resources,'app'),{root,version});
  const record={app:NAME,version,electron:ELECTRON_VERSION,platform,architecture:process.arch,signed:false,notarized:false,dependencies};await fs.writeFile(path.join(output,`manifest-${platform}-${process.arch}.json`),JSON.stringify(record,null,2)+'\n');return {artifact,...record};
}
module.exports={runtimeManifest,packageFilter,collectRuntimePackages,copyRuntime,packageApp,stampWindowsIcon,RCEDIT_VERSION,RCEDIT_INTEGRITY};
if(require.main===module)packageApp().then(r=>process.stdout.write(JSON.stringify(r)+'\n')).catch(e=>{process.stderr.write(e.message+'\n');process.exitCode=1;});
