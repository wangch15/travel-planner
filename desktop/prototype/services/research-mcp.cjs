const http = require('node:http');
const { randomBytes, timingSafeEqual } = require('node:crypto');

// Minimal MCP streamable-HTTP server (JSON responses, no SSE, stateless) for App-owned tools.
// Only the CLI processes the App launches receive the URL and bearer token.
const PROTOCOLS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const MAX_BODY = 1024 * 1024;

function startResearchServer({ tools, name = 'travel-planner-research', version = '1.0.0' }) {
  const byName = new Map(tools.map(tool => [tool.name, tool]));
  const token = randomBytes(32).toString('base64url');
  const expected = Buffer.from('Bearer ' + token);
  let port;
  const server = http.createServer((req, res) => {
    const send = (status, body) => { res.writeHead(status, body === undefined ? {} : { 'Content-Type': 'application/json' }); res.end(body === undefined ? undefined : JSON.stringify(body)); };
    if (req.url !== '/mcp') return send(404, { error: 'not-found' });
    const auth = Buffer.from(String(req.headers.authorization || ''));
    if (auth.length !== expected.length || !timingSafeEqual(auth, expected)) return send(401, { error: 'unauthorized' });
    if (req.headers.origin || req.headers.host !== '127.0.0.1:' + port) return send(403, { error: 'forbidden' });
    if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return send(405, { error: 'method-not-allowed' }); }
    const chunks = []; let size = 0, aborted = false;
    req.on('data', chunk => { size += chunk.length; if (size > MAX_BODY && !aborted) { aborted = true; send(413, { error: 'too-large' }); req.destroy(); } else chunks.push(chunk); });
    req.on('end', async () => {
      if (aborted) return;
      let message;
      try { message = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return send(400, { error: 'invalid-json' }); }
      if (!message || typeof message !== 'object' || Array.isArray(message) || message.jsonrpc !== '2.0' || typeof message.method !== 'string') return send(400, { error: 'invalid-request' });
      if (message.id === undefined) return send(202);
      const reply = result => send(200, { jsonrpc: '2.0', id: message.id, result });
      const error = (code, text) => send(200, { jsonrpc: '2.0', id: message.id, error: { code, message: text } });
      const params = message.params || {};
      if (message.method === 'initialize') return reply({ protocolVersion: PROTOCOLS.includes(params.protocolVersion) ? params.protocolVersion : PROTOCOLS[0],
        capabilities: { tools: { listChanged: false } }, serverInfo: { name, version } });
      if (message.method === 'ping') return reply({});
      if (message.method === 'tools/list') return reply({ tools: tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema, annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true } })) });
      if (message.method !== 'tools/call') return error(-32601, 'method not found');
      const tool = byName.get(params.name);
      const args = params.arguments === undefined ? {} : params.arguments;
      if (!tool || !args || typeof args !== 'object' || Array.isArray(args)) return error(-32602, 'invalid tool call');
      try { reply({ content: await tool.call(args), isError: false }); }
      catch (e) { reply({ content: [{ type: 'text', text: '工具未完成：' + (e.code || 'TOOL_FAILED') + (e.hint ? '。' + e.hint : '') }], isError: true }); }
    });
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      port = server.address().port;
      resolve({ url: `http://127.0.0.1:${port}/mcp`, token, close: () => new Promise(done => { server.closeAllConnections?.(); server.close(() => done()); }) });
    });
  });
}

module.exports = { startResearchServer };
