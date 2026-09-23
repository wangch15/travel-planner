const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('travelDesktop', Object.freeze({
  platform: process.platform,
  feature: (action,input={}) => ipcRenderer.invoke('feature:'+action,input),
  onAuthProgress: callback => {const listener=(_event,value)=>callback(value);ipcRenderer.on('feature:auth-progress',listener);return ()=>ipcRenderer.removeListener('feature:auth-progress',listener);},
  onProviderAccount:callback=>{const listener=(_event,value)=>callback(value);ipcRenderer.on('feature:provider-account',listener);return()=>ipcRenderer.removeListener('feature:provider-account',listener);},
  onToolProgress: callback=>{const listener=(_event,value)=>callback(value);ipcRenderer.on('feature:tool-progress',listener);return()=>ipcRenderer.removeListener('feature:tool-progress',listener);},
  onUpdateState: callback => {if(typeof callback!=='function')throw new TypeError('Expected callback');const listener=(_event,value)=>callback(value);ipcRenderer.on('feature:update-state',listener);return ()=>ipcRenderer.removeListener('feature:update-state',listener);},
  onClosing: callback => {const listener=()=>callback();ipcRenderer.on('app:closing',listener);return ()=>ipcRenderer.removeListener('app:closing',listener);},
  onJobResult: callback => {const listener=(_event,value)=>callback(value);ipcRenderer.on('feature:job-result',listener);return ()=>ipcRenderer.removeListener('feature:job-result',listener);},
  openPreviewInBrowser: url => ipcRenderer.invoke('preview:open-browser', url),
  listVersions: input => ipcRenderer.invoke('versions:list',input),
  restoreVersion: input => ipcRenderer.invoke('versions:restore',input),
  selectProposalChanges: input => ipcRenderer.invoke('proposal:select',input),
  readConversation: input => ipcRenderer.invoke('conversation:read',input),
  saveConversationPreferences: input => ipcRenderer.invoke('conversation:preferences',input),
  restartConversation: input => ipcRenderer.invoke('conversation:restart',input),
  chooseProject: () => ipcRenderer.invoke('project:choose'),
  setTheme: mode => ipcRenderer.invoke('appearance:set-theme', mode),
  readWorkspace: () => ipcRenderer.invoke('workspace:read'),
  selectTrip: input => ipcRenderer.invoke('workspace:select', input),
  buildPreview: input => ipcRenderer.invoke('preview:build', input),
  connectCodex: () => ipcRenderer.invoke('codex:connect'),
  refreshCodex: () => ipcRenderer.invoke('codex:refresh'),
  loginCodex: () => ipcRenderer.invoke('codex:login'),
  cancelCodexLogin: () => ipcRenderer.invoke('codex:cancel-login'),
  switchCodexAccount: () => ipcRenderer.invoke('codex:switch-account'),
  copyCodexLoginLink: () => ipcRenderer.invoke('codex:copy-login-link'),
  codexModels: () => ipcRenderer.invoke('codex:models'),
  generateProposal: input => ipcRenderer.invoke('ai:generate', input),
  stopGeneration: () => ipcRenderer.invoke('ai:stop'),
  discardProposal: () => ipcRenderer.invoke('proposal:discard'),
  applyProposal: input => ipcRenderer.invoke('proposal:apply', input),
  proposalStatus: () => ipcRenderer.invoke('proposal:status'),
  onAIProgress: callback => {
    if (typeof callback !== 'function') throw new TypeError('Expected callback');
    const listener = (_event,value) => callback(value);
    ipcRenderer.on('ai:progress',listener);
    return () => ipcRenderer.removeListener('ai:progress',listener);
  },
  onCodexAccountChanged: callback => {
    if (typeof callback !== 'function') throw new TypeError('Expected callback');
    const listener = (_event, value) => callback(value);
    ipcRenderer.on('codex:account-changed', listener);
    return () => ipcRenderer.removeListener('codex:account-changed', listener);
  },
}));
