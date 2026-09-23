// Explicit release recipe: signs an allowlisted runtime through electron-builder,
// then creates DMG+ZIP or NSIS via --prepackaged. Never publishes or installs.
const fs=require('node:fs/promises');const path=require('node:path');const os=require('node:os');const {spawn}=require('node:child_process');
const BUILDER_VERSION='26.15.3';const ROOT=path.resolve(__dirname,'../../..');
function run(command,args,opts={}){return new Promise((resolve,reject)=>{const child=spawn(command,args,{stdio:'inherit',...opts});child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(Error('Installer build failed; no release was published')));});}
function requirements(platform,env){if(!['darwin','win32'].includes(platform))throw Error('Build installers on native macOS or Windows');if(!env.CSC_LINK&&!env.CSC_NAME)throw Error('The release owner must provide CSC_LINK or CSC_NAME for signing');if(platform==='darwin'&&!((env.APPLE_ID&&env.APPLE_APP_SPECIFIC_PASSWORD&&env.APPLE_TEAM_ID)||(env.APPLE_API_KEY&&env.APPLE_API_KEY_ID&&env.APPLE_API_ISSUER)))throw Error('The release owner must provide Apple notarization credentials');if(platform==='win32'&&!env.TRAVEL_PLANNER_WINDOWS_PUBLISHER)throw Error('TRAVEL_PLANNER_WINDOWS_PUBLISHER must match the signing certificate');}
async function buildInstallers({platform=process.platform,root=ROOT,env=process.env}={}){
  requirements(platform,env);const tools=await fs.mkdtemp(path.join(os.tmpdir(),'travel-builder-'));const output=path.join(root,'.local/installers');const runtime=platform==='darwin'?path.join(root,'.local/distribution/Travel Planner.app/Contents/Resources/app'):path.join(root,'.local/distribution','Travel Planner-win-'+process.arch,'resources/app');
  await fs.access(path.join(runtime,'package.json'));await fs.mkdir(output,{recursive:true});
  try{
    await run(platform==='win32'?'npm.cmd':'npm',['install','--prefix',tools,'--registry','https://registry.npmjs.org','--ignore-scripts','--no-audit','--no-fund','--save-exact','electron-builder@'+BUILDER_VERSION],{env});
    const pkg=JSON.parse(await fs.readFile(path.join(tools,'node_modules/electron-builder/package.json'),'utf8'));if(pkg.version!==BUILDER_VERSION)throw Error('Unexpected electron-builder version');
    const cli=path.join(tools,'node_modules/electron-builder/cli.js');const config=path.join(__dirname,'electron-builder.config.cjs');const dist=path.join(path.dirname(require.resolve('electron/package.json')),'dist');const common=['--projectDir',runtime,'--config',config,'--config.directories.output='+output,'--config.electronDist='+dist,'--publish','never'];
    // --dir performs signing/notarization before prepackaged artifact generation.
    await run(process.execPath,[cli,...common,'--dir',platform==='darwin'?'--mac':'--win'],{env});
    const archSuffix=process.arch==='x64'?'':'-'+process.arch;const packaged=platform==='darwin'?path.join(output,'mac'+archSuffix,'Travel Planner.app'):path.join(output,'win'+archSuffix+'-unpacked');
    await fs.access(packaged);await run(process.execPath,[cli,...common,'--prepackaged',packaged,...(platform==='darwin'?['--mac','dmg','zip']:['--win','nsis'])],{env});
    const metadata=path.join(output,platform==='darwin'?'latest-mac.yml':'latest.yml');await fs.access(metadata);return {output,metadata,published:false,signed:true};
  }finally{await fs.rm(tools,{recursive:true,force:true});}
}
module.exports={requirements,buildInstallers,BUILDER_VERSION};
if(require.main===module)buildInstallers().then(r=>console.log(JSON.stringify(r))).catch(e=>{console.error(e.message);process.exitCode=1;});
