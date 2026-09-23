const http = require('node:http');
const { randomBytes } = require('node:crypto');
const { PREVIEW_CSP } = require('./preview.cjs');

// An expiring, loopback-only view of an immutable preview. No filesystem routing.
class BrowserPreview {
  constructor({ ttl = 30 * 60 * 1000, limit = 4 } = {}) {
    this.entries = new Map(); this.ttl = ttl; this.limit = limit;
    this.server = null; this.starting = null; this.closed = false;
    this.timer = setInterval(() => this.prune(), Math.min(ttl, 60000));
    this.timer.unref();
  }
  prune() {
    for (const [key, entry] of this.entries) if (entry.expires <= Date.now()) this.entries.delete(key);
  }
  async start() {
    if (this.closed) throw Error('preview-closed');
    if (this.starting) return this.starting;
    this.server = http.createServer((request, response) => {
      this.prune();
      const reject = status => { response.writeHead(status, {'Cache-Control':'no-store'}); response.end(); };
      if (request.headers.host !== `127.0.0.1:${this.server.address()?.port}`) return reject(403);
      if (!['GET','HEAD'].includes(request.method)) return reject(405);
      // Match raw request paths, so URL normalization cannot convert traversal to a valid asset.
      const match = /^\/([a-f0-9]{48})(\/index\.html|\/img\/[a-zA-Z0-9_-]+-\d+\.jpg)$/.exec(request.url);
      const entry = match && this.entries.get(match[1]);
      const asset = entry && entry.read(match[2]);
      if (!asset) return reject(404);
      response.writeHead(200, {'Content-Type':asset.type,
        'Content-Security-Policy':PREVIEW_CSP.replace('img-src travel-preview: data:', "img-src 'self' data:"),
        'X-Content-Type-Options':'nosniff', 'Referrer-Policy':'no-referrer', 'Cache-Control':'no-store'});
      response.end(request.method === 'HEAD' ? undefined : asset.body);
    });
    this.starting = new Promise((resolve,reject) => {
      this.server.once('error',reject);
      this.server.listen(0,'127.0.0.1',() => {
        if (this.closed) { this.server.close(); reject(Error('preview-closed')); }
        else resolve();
      });
    });
    return this.starting;
  }
  async open(artifact) {
    await this.start();
    if (this.closed) throw Error('preview-closed');
    this.prune();
    while (this.entries.size >= this.limit) this.entries.delete(this.entries.keys().next().value);
    const token = randomBytes(24).toString('hex');
    this.entries.set(token, {read:artifact.read, expires:Date.now()+this.ttl});
    return `http://127.0.0.1:${this.server.address().port}/${token}/index.html`;
  }
  close() {
    this.closed=true; clearInterval(this.timer); this.entries.clear();
    this.server?.close(); this.server?.closeAllConnections();
  }
}
module.exports = { BrowserPreview };
