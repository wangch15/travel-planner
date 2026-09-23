// Research browser + MCP tools against a local fixture site; no external network or model.
const { app, BrowserWindow, session } = require('electron');
const http = require('node:http');
const assert = require('node:assert/strict');
const { ResearchBrowser, publicTools, privateTools } = require('./services/research-browser.cjs');
const { startResearchServer } = require('./services/research-mcp.cjs');
app.on('window-all-closed', () => {});
let exitStatus = 0, fixture, server;
const pages = {
  '/official': '<title>官方網站</title><body><p id="t">載入中</p><script>setTimeout(()=>{document.getElementById("t").textContent="營業時間 9:00-17:00，每週三公休。"},600)</script></body>',
  '/download': '<a id="d" href="/file.zip" download>x</a><script>document.getElementById("d").click();</script>',
  '/popup': '<script>window.open("/official");navigator.geolocation&&navigator.geolocation.getCurrentPosition(()=>{document.title="LEAK"},()=>{document.title="denied"});</script>',
  '/private/trips': '<title>我的訂單</title><body>入住 2027-03-10 · 確認碼 4815.162.342</body>',
  '/private/away': '<script>location.href="/official"</script>',
};
app.whenReady().then(async () => {
  setTimeout(() => app.exit(1), 60000);
  fixture = http.createServer((req, res) => {
    if (req.url === '/file.zip') { res.writeHead(200, { 'Content-Type': 'application/zip' }); return res.end('zip'); }
    const body = pages[req.url.split('?')[0]];
    res.writeHead(body ? 200 : 404, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(body || 'missing');
  });
  await new Promise(resolve => fixture.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${fixture.address().port}`;
  // Loopback stands in for the public internet; host checks are unit-tested separately.
  const loose = raw => { const url = new URL(raw); url.hash = ''; return url; };
  const electron = { BrowserWindow, session };
  const publicBrowser = new ResearchBrowser({ electron, partition: 'research-smoke-public', hostGuard: async () => true, checkURL: loose, settleMs: 4000 });
  const privateBrowser = new ResearchBrowser({ electron, partition: 'research-smoke-private', hostGuard: async () => true, checkURL: loose, settleMs: 3000, allowPage: url => new URL(url).pathname.startsWith('/private') });

  const page = await publicBrowser.open(base + '/official#top');
  assert.equal(page.title, '官方網站'); assert.match(page.text, /每週三公休/); assert.equal(page.url, base + '/official');
  assert.equal(publicBrowser.findPage(base + '/official').text.includes('每週三公休'), true);
  assert.match(Buffer.from(await publicBrowser.screenshot(), 'base64').subarray(1, 4).toString(), /PNG/);

  let downloads = 0; session.fromPartition('research-smoke-public').on('will-download', () => downloads++);
  await publicBrowser.open(base + '/download');
  const popup = await publicBrowser.open(base + '/popup');
  assert.notEqual(popup.title, 'LEAK'); assert.equal(BrowserWindow.getAllWindows().length, 1);

  const trips = await privateBrowser.open(base + '/private/trips');
  assert.match(trips.text, /4815\.162\.342/);
  await assert.rejects(privateBrowser.open(base + '/official'), { code: 'PRIVATE_SITE_NOT_CONNECTED' });
  await assert.rejects(privateBrowser.open(base + '/private/away'), error => ['PRIVATE_LOGIN_REQUIRED', 'RESEARCH_LOAD_FAILED'].includes(error.code));
  assert.equal(privateBrowser.findPage(base + '/official'), null);

  server = await startResearchServer({ tools: [...publicTools(publicBrowser), ...privateTools(privateBrowser, { list: () => [{ host: '127.0.0.1', addedAt: '2026-09-24T00:00:00.000Z' }] })] });
  const call = async (name, args) => (await (await fetch(server.url, { method: 'POST', headers: { Authorization: 'Bearer ' + server.token, 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }) })).json()).result;
  const opened = await call('research_open', { url: base + '/official' });
  assert.equal(opened.isError, false); assert.match(JSON.parse(opened.content[0].text).text, /每週三公休/);
  const blocked = await call('private_open', { url: base + '/official' });
  assert.equal(blocked.isError, true); assert.match(blocked.content[0].text, /PRIVATE_SITE_NOT_CONNECTED/);
  const shot = await call('research_screenshot', {});
  assert.equal(shot.content[0].type, 'image'); assert.equal(shot.content[0].mimeType, 'image/png');
  assert.equal(downloads <= 1, true);
  console.log(JSON.stringify({ passed: true, jsRenderedText: true, evidenceLog: true, screenshot: true, popupDenied: true, permissionDenied: true, privateDomainLocked: true, privateRedirectDiscarded: true, mcpEndToEnd: true }));
  publicBrowser.close(); privateBrowser.close();
}).catch(error => { console.error(error); exitStatus = 1; }).finally(async () => {
  if (server) await server.close(); if (fixture) fixture.close(); app.exit(exitStatus);
});
