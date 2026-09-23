const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {prepareRuntime,claudeFlags}=require('../runtime.cjs');
async function fixture(t){const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'tp-keychain-test-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));return root;}
test('Claude owns subscription authentication in its app profile, even inside a host-managed parent',async t=>{
  const key='CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST',previous=process.env[key];
  process.env[key]='1';
  t.after(()=>{if(previous===undefined)delete process.env[key];else process.env[key]=previous;});
  const runtime=await prepareRuntime(await fixture(t),'claude');
  assert.equal(runtime.env[key],undefined,'host-managed auth tells Claude to ignore its own stored OAuth login');
  assert.equal(runtime.env.CLAUDE_CONFIG_DIR,runtime.home);
  assert.equal(runtime.env.CLAUDE_CODE_SAFE_MODE,'1');
  assert.ok(claudeFlags(runtime).includes('--restricted'));
  assert.equal(runtime.env.CLAUDE_SECURESTORAGE_CONFIG_DIR,undefined);
  for(const key of ['ANTHROPIC_API_KEY','ANTHROPIC_AUTH_TOKEN','CLAUDE_CODE_OAUTH_TOKEN','CLAUDE_CODE_HOST_AUTH_ENV_VAR'])assert.equal(runtime.env[key],undefined);
  await runtime.assertPolicy();
});
test('macOS Claude keeps system home for Keychain while all provider configuration remains app-specific',{skip:process.platform!=='darwin'},async t=>{const root=await fixture(t),runtime=await prepareRuntime(root,'claude');assert.equal(runtime.env.HOME,os.userInfo().homedir,'isolating HOME breaks the macOS default Keychain');assert.equal(runtime.env.CLAUDE_CONFIG_DIR,runtime.home);assert.notEqual(runtime.home,runtime.env.HOME);assert.equal(runtime.env.ANTHROPIC_CONFIG_DIR,path.join(runtime.home,'.config','anthropic'));assert.equal(runtime.work,path.join(root,'claude-work'));assert.ok(claudeFlags(runtime).includes('--safe-mode'));assert.ok(claudeFlags(runtime).includes('--restricted'));for(const key of ['ANTHROPIC_API_KEY','ANTHROPIC_AUTH_TOKEN','CLAUDE_CODE_OAUTH_TOKEN'])assert.equal(runtime.env[key],undefined);await runtime.assertPolicy();});
test('Gemini retains its isolated home and its own configuration location',async t=>{const runtime=await prepareRuntime(await fixture(t),'gemini');assert.equal(runtime.env.HOME,runtime.home);assert.equal(runtime.env.GEMINI_CLI_HOME,runtime.home);assert.equal(runtime.env.CLAUDE_CONFIG_DIR,undefined);await runtime.assertPolicy();});

test('shared Anthropic profile directory cannot be redirected outside the app profile',async t=>{const root=await fixture(t),runtime=await prepareRuntime(root,'claude'),external=path.join(root,'outside');await fs.mkdir(external);await fs.rmdir(runtime.env.ANTHROPIC_CONFIG_DIR);await fs.symlink(external,runtime.env.ANTHROPIC_CONFIG_DIR,process.platform==='win32'?'junction':'dir');await assert.rejects(runtime.assertPolicy(),{code:'POLICY_MISMATCH'});});
