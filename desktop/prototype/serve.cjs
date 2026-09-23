// Browser UI preview only: no filesystem bridge, credentials, or imported project.
const http = require('node:http');
const { CSP, readAsset } = require('./assets.cjs');

function createServer() {
  return http.createServer(async (request, response) => {
    try {
      if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405).end(); return; }
      const asset = await readAsset(new URL(request.url, 'http://127.0.0.1').pathname);
      if (!asset) { response.writeHead(404).end(); return; }
      response.writeHead(200, { 'Content-Type': asset.type, 'Content-Security-Policy': CSP,
        'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' });
      response.end(request.method === 'HEAD' ? undefined : asset.body);
    } catch { response.writeHead(500).end(); }
  });
}
module.exports = { createServer };
if (require.main === module) {
  const port = Number(process.env.TRAVEL_PREVIEW_PORT || 4174);
  createServer().listen(port, '127.0.0.1', () => console.log(`Travel Planner browser preview: http://127.0.0.1:${port}`));
}
