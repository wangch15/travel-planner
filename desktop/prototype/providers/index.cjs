const { CliAccount } = require('./account.cjs');
const { CliEditor } = require('./editor.cjs');
const { failure } = require('./process.cjs');

function createProvider(id, directory, options = {}) {
  if (!['claude', 'gemini'].includes(id)) throw failure('PROVIDER_UNAVAILABLE');
  const account = new CliAccount(id, directory, options);
  const editor = new CliEditor(account, options);
  const capabilities = Object.freeze({ modes: ['discussion', 'edit-day', 'edit-all', 'planning', 'materialize', 'research'],
    images: false, effort: false, research: true, materialize: true, hostHistory: true,
    nativeSessions: false, recover: false, switchAccount: id === 'claude', loginBrowser: true });
  return { account, editor, capabilities };
}
module.exports = { createProvider };
