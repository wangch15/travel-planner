const test = require('node:test');
const assert = require('node:assert/strict');
const { parseFlags, lanAddresses, CLOUDFLARED_INSTALL, TUNNEL_URL } = require('../scripts/preview.js');

test('旗標解析', () => {
  assert.deepEqual(parseFlags(['_example']), { lan: false, tunnel: false });
  assert.deepEqual(parseFlags(['_example', '--lan']), { lan: true, tunnel: false });
  assert.deepEqual(parseFlags(['--tunnel', '_example']), { lan: false, tunnel: true });
  assert.deepEqual(parseFlags(['_example', '--lan', '--tunnel']), { lan: true, tunnel: true });
});

test('旗標不會被當成 slug', () => {
  const { resolveSlug } = require('../scripts/lib/paths.js');
  assert.equal(resolveSlug(['_example', '--lan', '--tunnel']), '_example');
});

test('區網位址不含 loopback', () => {
  const addrs = lanAddresses();
  assert.ok(Array.isArray(addrs));
  for (const a of addrs) {
    assert.ok(!a.startsWith('127.'), `不該出現 loopback：${a}`);
    assert.match(a, /^\d+\.\d+\.\d+\.\d+$/, `應該是 IPv4：${a}`);
  }
});

test('cloudflared 缺席時給得出安裝方式', () => {
  for (const w of ['brew install cloudflared', 'winget', 'developers.cloudflare.com']) {
    assert.ok(CLOUDFLARED_INSTALL.includes(w), `安裝說明缺 ${w}`);
  }
});

test('認得出 cloudflared 印的網址', () => {
  const line = '2026-09-21T05:00:00Z INF |  https://abc-def-123.trycloudflare.com  |';
  assert.equal(line.match(TUNNEL_URL)[0], 'https://abc-def-123.trycloudflare.com');
  assert.equal(TUNNEL_URL.test('https://example.com'), false);
});
