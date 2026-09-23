const { ResearchBrowser, publicTools, privateTools } = require('./research-browser.cjs');
const { startResearchServer } = require('./research-mcp.cjs');
const { PrivateSources } = require('./private-sources.cjs');

const SERVER_NAME = 'travel_research';

// Owns the two browser profiles, the connected private sites and the loopback MCP server.
// The public profile never logs in; the private one can only open sites the user connected.
function createResearchTools({ electron, stateDirectory, makeBrowser = options => new ResearchBrowser(options), startServer = startResearchServer }) {
  const sources = new PrivateSources(stateDirectory);
  const loaded = sources.load();
  const publicBrowser = makeBrowser({ electron, partition: 'persist:tp-research' });
  const privateBrowser = makeBrowser({ electron, partition: 'persist:tp-private', allowPage: url => sources.allows(url) });
  const tools = [...publicTools(publicBrowser), ...privateTools(privateBrowser, sources)];
  let server = null;
  return {
    sources, publicBrowser, privateBrowser, serverName: SERVER_NAME, toolNames: tools.map(t => t.name),
    async endpoint() {
      await loaded;
      if (!server) server = startServer({ tools });
      const { url, token } = await server;
      return { name: SERVER_NAME, url, token, tools: tools.map(t => t.name) };
    },
    // Evidence is checked against text the App itself rendered during research.
    findPage(url) { return publicBrowser.findPage(url) || privateBrowser.findPage(url); },
    async ready() { await loaded; return sources.list(); },
    async close() { publicBrowser.close(); privateBrowser.close(); if (server) await (await server).close(); server = null; },
  };
}

module.exports = { createResearchTools, SERVER_NAME };
