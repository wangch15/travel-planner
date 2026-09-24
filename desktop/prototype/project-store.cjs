const fs = require('node:fs/promises');
const { constants } = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const THEMES = new Set(['system', 'light', 'dark']);
const providers=['codex','claude','gemini'];
const defaultsOK=v=>v&&providers.includes(v.provider)&&v.models&&typeof v.models==='object'&&!Array.isArray(v.models)&&Object.entries(v.models).every(([id,model])=>providers.includes(id)&&typeof model==='string'&&model.length<=200)&&(v.effort===undefined||['none','minimal','low','medium','high','xhigh','max'].includes(v.effort));
const empty = () => ({ schemaVersion: 1, theme: 'system', project: null });
const slugOK = value => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,100}$/.test(value);
const onboardingOK = value => value && typeof value === 'object' && typeof value.completed === 'boolean' && typeof value.cloudflareSkipped === 'boolean';
const projectOK = value => value && typeof value.id === 'string' && /^[a-zA-Z0-9-]{1,100}$/.test(value.id)
  && typeof value.root === 'string' && path.isAbsolute(value.root) && value.root.length < 4096;
const sameFile = (a, b) => a.dev === b.dev && a.ino === b.ino;
const regular = stat => stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1;

function createProjectStore(directory) {
  if (!path.isAbsolute(directory)) throw Error('invalid-store-directory');
  const file = path.join(directory, 'workspace.json');
  let queue = Promise.resolve();
  let anchor;
  async function checkDirectory() {
    let folder;
    try { folder = await fs.lstat(directory); }
    catch (error) { if (error.code === 'ENOENT' && !anchor) return false; throw Error('store-invalid'); }
    if (!folder.isDirectory() || folder.isSymbolicLink()) throw Error('store-invalid');
    const canonical = await fs.realpath(directory);
    const latest = await fs.lstat(directory);
    if (!latest.isDirectory() || latest.isSymbolicLink() || !sameFile(folder, latest)
      || !sameFile(folder, await fs.lstat(canonical))
      || canonical !== await fs.realpath(directory)
      || (anchor && (canonical !== anchor.canonical || !sameFile(folder, anchor.stat)))) throw Error('store-invalid');
    // Normalize initial OS aliases (e.g. /var -> /private/var), then pin identity.
    anchor ||= { canonical, stat: folder };
    return true;
  }
  async function removeOwned(temp, owned) {
    if (!owned) return;
    try {
      const parent = await fs.realpath(directory);
      const current = await fs.lstat(temp);
      if (regular(current) && sameFile(current, owned) && parent === await fs.realpath(directory)) await fs.unlink(temp);
    } catch { /* A moved or replaced file is no longer safe to clean up by path. */ }
  }
  async function read() {
    try {
      if (!await checkDirectory()) return { ok: true, state: empty() };
      const stat = await fs.lstat(file);
      if (!regular(stat) || stat.size > 65536) throw Error('store-invalid');
      const handle = await fs.open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
      let state;
      try {
        const opened = await handle.stat();
        if (!regular(opened) || !sameFile(opened, stat) || opened.size > 65536) throw Error('store-invalid');
        await checkDirectory();
        state = JSON.parse(await handle.readFile('utf8'));
        await checkDirectory();
      } finally { await handle.close(); }
      if (state.schemaVersion !== 1 || !THEMES.has(state.theme)
        || (state.aiDefaults!==undefined&&!defaultsOK(state.aiDefaults))
        || (state.demoHidden!==undefined&&typeof state.demoHidden!=='boolean')
        || (state.onboarding!==undefined&&!onboardingOK(state.onboarding))
        || (state.aiProvider!==undefined&&!['codex','claude','gemini'].includes(state.aiProvider))
        || (state.project !== null && (!projectOK(state.project)
          || (state.project.selectedSlug !== null && !slugOK(state.project.selectedSlug))))) throw Error('store-invalid');
      return { ok: true, state: { schemaVersion: 1, theme: state.theme,...(state.aiDefaults?{aiDefaults:state.aiDefaults}:{}),...(state.aiProvider?{aiProvider:state.aiProvider}:{}),...(state.demoHidden!==undefined?{demoHidden:state.demoHidden}:{}),...(state.onboarding?{onboarding:{completed:state.onboarding.completed,cloudflareSkipped:state.onboarding.cloudflareSkipped}}:{}), project: state.project && {
        id: state.project.id, root: state.project.root, selectedSlug: state.project.selectedSlug,
      } } };
    } catch (error) {
      if (error.code === 'ENOENT') {
        try { await checkDirectory(); return { ok: true, state: empty() }; } catch { /* Redirected parent is not an empty store. */ }
      }
      return { ok: false, code: 'store-invalid', state: empty() };
    }
  }
  function mutate(change) {
    const operation = queue.then(async () => {
      const loaded = await read();
      if (!loaded.ok) throw Error('store-invalid');
      const state = change(loaded.state);
      await fs.mkdir(directory, { recursive: true, mode: 0o700 });
      await checkDirectory();
      const temp = path.join(directory, `.workspace-${randomUUID()}.tmp`);
      let owned;
      try {
        await checkDirectory();
        const handle = await fs.open(temp, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
        try {
          owned = await handle.stat();
          if (!regular(owned)) throw Error('store-invalid');
          await checkDirectory();
          await handle.writeFile(JSON.stringify(state) + '\n'); await handle.sync();
          await checkDirectory();
        }
        finally { await handle.close(); }
        // Recheck the target before replacing; malformed data is never auto-reset.
        if (!(await read()).ok) throw Error('store-invalid');
        const latest = await fs.lstat(temp);
        if (!regular(latest) || !sameFile(latest, owned)) throw Error('store-invalid');
        await checkDirectory();
        try { await fs.rename(temp, file); }
        finally { await checkDirectory(); }
      } finally {
        await removeOwned(temp, owned);
      }
      return state;
    });
    queue = operation.catch(() => {});
    return operation;
  }
  return {
    read,
    connect: async project => {
      if (!projectOK(project)) throw Error('invalid-project');
      return mutate(state => ({ ...state, project: { id: project.id, root: project.root, selectedSlug: null } }));
    },
    select: async (projectId, slug) => {
      if (!slugOK(slug)) throw Error('invalid-slug');
      return mutate(state => {
        if (state.project?.id !== projectId) throw Error('stale-project');
        return { ...state, project: { ...state.project, selectedSlug: slug } };
      });
    },
    // 首次引導：完成與否、Cloudflare 是否先跳過。其他步驟都由實際狀態判斷，不存在這裡。
    setOnboarding: async value=>{if(!onboardingOK(value))throw Error('invalid-onboarding');return mutate(state=>({...state,onboarding:{completed:value.completed,cloudflareSkipped:value.cloudflareSkipped}}));},
    setDemoHidden: async demoHidden=>{if(typeof demoHidden!=='boolean')throw Error('invalid-demo-preference');return mutate(state=>({...state,demoHidden}));},
    setAIDefaults:async value=>{if(!defaultsOK(value))throw Error('invalid-ai-defaults');return mutate(state=>({...state,aiDefaults:{provider:value.provider,models:{...value.models},effort:value.effort??'medium'}}));},
    setAIProvider: async aiProvider=>{if(!['codex','claude','gemini'].includes(aiProvider))throw Error('invalid-provider');return mutate(state=>({...state,aiProvider}));},
    clearSelection: async()=>mutate(state=>({...state,project:state.project?{...state.project,selectedSlug:null}:null})),
    setTheme: async theme => {
      if (!THEMES.has(theme)) throw Error('invalid-theme');
      return mutate(state => ({ ...state, theme }));
    },
  };
}
module.exports = { createProjectStore };
