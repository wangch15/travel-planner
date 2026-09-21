const test = require('node:test');
const assert = require('node:assert/strict');
const { parseFlags, lanAddresses, lanChanged, watchLan, CLOUDFLARED_INSTALL, TUNNEL_URL } = require('../scripts/preview.js');

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

test('cloudflared 缺席時給得出三大平台的安裝方式', () => {
  for (const w of ['brew install cloudflared', 'winget', 'Linux', 'developers.cloudflare.com']) {
    assert.ok(CLOUDFLARED_INSTALL.includes(w), `安裝說明缺 ${w}`);
  }
});

test('cloudflared 缺席不是死路：要指出 --lan 這條退路', () => {
  assert.ok(CLOUDFLARED_INSTALL.includes('--lan'), '沒裝 cloudflared 時要提示可以改用 --lan');
  assert.ok(/不需要 Cloudflare 帳號/.test(CLOUDFLARED_INSTALL), '要講明不用辦帳號，否則使用者會以為又要註冊');
});

test('認得出 cloudflared 印的網址', () => {
  const line = '2026-09-21T05:00:00Z INF |  https://abc-def-123.trycloudflare.com  |';
  assert.equal(line.match(TUNNEL_URL)[0], 'https://abc-def-123.trycloudflare.com');
  assert.equal(TUNNEL_URL.test('https://example.com'), false);
});

test('區網位址換了才算變——順序不同不算', () => {
  assert.equal(lanChanged(['192.168.0.192'], ['192.168.0.192']), false);
  assert.equal(lanChanged(['10.0.0.2', '10.0.0.3'], ['10.0.0.3', '10.0.0.2']), false);
  assert.equal(lanChanged(['192.168.0.192'], ['192.168.0.157']), true, '換 wifi 後 IP 變了要算變');
  assert.equal(lanChanged(['192.168.0.192'], []), true, '斷線也要算變');
  assert.equal(lanChanged([], ['192.168.0.1']), true);
});

test('換 wifi 之後會重印新網址，不會讓人守著失效的那個', async () => {
  // 啟動時印一次之後就不再更新的話，使用者手上那個網址會默默失效，
  // 而畫面上還留著舊的——他只會覺得是頁面壞了。
  const seq = [['192.168.0.192'], ['192.168.0.192'], ['192.168.0.157']];
  let i = 0;
  const seen = [];
  const timer = watchLan((addrs) => seen.push(addrs), {
    read: () => seq[Math.min(i++, seq.length - 1)],
    every: 5,
  });
  await new Promise((r) => setTimeout(r, 60));
  clearInterval(timer);
  assert.deepEqual(seen[0], ['192.168.0.157'], `應該只在變動時回報一次：${JSON.stringify(seen)}`);
});
