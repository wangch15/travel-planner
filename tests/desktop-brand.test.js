const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { PNG } = require('pngjs');
const { readAsset } = require('../desktop/prototype/assets.cjs');
const { createServer } = require('../desktop/prototype/serve.cjs');

const root = path.join(__dirname, '../desktop/prototype');
const brand = path.join(root, 'assets/brand');
test('original v2 transparent marks match their source checksums', async () => {
  const checks = JSON.parse(await fs.readFile(path.join(brand, 'source-checksums.json'), 'utf8'));
  assert.deepEqual(Object.keys(checks).sort(), ['travel-planner-mark-on-dark-v2.svg', 'travel-planner-mark-on-light-v2.svg']);
  for (const [name, hash] of Object.entries(checks)) {
    const bytes = await fs.readFile(path.join(brand, name));
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), hash);
    assert.match(bytes.toString(), /viewBox="0 0 614 592"/);
    assert.doesNotMatch(bytes.toString(), /<rect|<filter/);
  }
});
test('both manifests reference decodable PNG headers with declared dimensions', async () => {
  for (const mode of ['light', 'dark']) {
    const manifest = JSON.parse((await readAsset(`/manifest-${mode}.webmanifest`)).body);
    assert.equal(manifest.icons.length, 2);
    for (const icon of manifest.icons) {
      const { body, type } = await readAsset(`/${icon.src}`);
      assert.equal(type, 'image/png');
      assert.equal(body.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
      assert.equal(`${body.readUInt32BE(16)}x${body.readUInt32BE(20)}`, icon.sizes);
      assert.equal(icon.purpose, 'any');
    }
    for (const size of [16, 20, 24, 32, 40, 48, 64, 128, 180, 192, 256, 512, 1024]) {
      const png = await fs.readFile(path.join(brand, mode, `icon-${size}.png`));
      assert.equal(png.readUInt32BE(16), size); assert.equal(png.readUInt32BE(20), size);
      const decoded = PNG.sync.read(png);
      const background = mode === 'light' ? 255 : 25;
      assert.deepEqual([...decoded.data.subarray(0, 4)], [background, background, background, 255]);
      let markPixels = 0;
      for (let i = 0; i < decoded.data.length; i += 4) {
        assert.equal(decoded.data[i + 3], 255, 'platform tiles must have an opaque background');
        if (Math.abs(decoded.data[i] - background) > 50) markPixels++;
      }
      assert.ok(markPixels > size * size * .15, `${mode} ${size}px mark must render, not just its background`);
    }
  }
});
test('favicon tiles embed untouched v2 source with proportional padding', async () => {
  for (const mode of ['light', 'dark']) {
    const { body } = await readAsset(`/assets/brand/favicon-${mode}.svg`);
    const svg = body.toString();
    assert.match(svg, /viewBox="0 0 1024 1024"/);
    assert.match(svg, /preserveAspectRatio="xMidYMid meet"/);
    const embedded = svg.match(/data:image\/svg\+xml;base64,([^"]+)/)[1];
    assert.deepEqual(Buffer.from(embedded, 'base64'), await fs.readFile(path.join(brand, `travel-planner-mark-on-${mode}-v2.svg`)));
  }
});
test('platform icon containers contain complete original PNG representations', async () => {
  for (const mode of ['light', 'dark']) {
    const ico = await fs.readFile(path.join(brand, mode, 'app.ico'));
    assert.equal(ico.readUInt16LE(2), 1); assert.equal(ico.readUInt16LE(4), 7);
    for (let i = 0; i < 7; i++) {
      const entry = 6 + 16 * i; const size = ico[entry] || 256;
      const png = await fs.readFile(path.join(brand, mode, `icon-${size}.png`));
      const offset = ico.readUInt32LE(entry + 12); const length = ico.readUInt32LE(entry + 8);
      assert.deepEqual(ico.subarray(offset, offset + length), png);
    }
    const icns = await fs.readFile(path.join(brand, mode, 'app.icns'));
    assert.equal(icns.subarray(0, 4).toString(), 'icns'); assert.equal(icns.readUInt32BE(4), icns.length);
  }
});
test('browser preview serves only allowlisted UI assets with the expected MIME and CSP', async t => {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const page = await fetch(base);
  assert.equal(page.status, 200); assert.ok(page.headers.get('content-security-policy').includes("manifest-src 'self'"));
  assert.equal((await fetch(`${base}/assets/brand/travel-planner-mark-on-light-v2.svg`)).headers.get('content-type'), 'image/svg+xml');
  assert.equal((await fetch(`${base}/manifest-dark.webmanifest`)).status, 200);
  for (const file of ['/main.cjs', '/package.json', '/assets/brand/../../main.cjs', '/trips/private/data.js']) assert.equal((await fetch(base + file)).status, 404);
  assert.equal((await fetch(base, { method: 'POST' })).status, 405);
});

test('macOS icons have transparent outer margins and rounded corners with the mark intact',async()=>{
 for(const mode of ['light','dark']){
  for(const size of [16,32,128,256,512,1024]){
   const image=PNG.sync.read(await fs.readFile(path.join(brand,mode,`macos-icon-${size}.png`)));
   assert.equal(image.width,size);assert.equal(image.height,size);
   const alpha=(x,y)=>image.data[(y*size+x)*4+3];
   assert.equal(alpha(0,0),0);assert.equal(alpha(size-1,size-1),0);
   assert.equal(alpha(Math.floor(size*.08),Math.floor(size*.08)),0,'rounded corners must remain transparent');
   assert.ok(alpha(Math.floor(size/2),Math.floor(size*.15))>240,'top edge of background must be present');
   assert.ok(alpha(Math.floor(size/2),Math.floor(size/2))>240,'center must contain the icon');
  }
 }
});
