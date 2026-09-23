const test = require('node:test');
const assert = require('node:assert/strict');
const { publicationOutput } = require('../publication-output.cjs');

function fixture() {
  const image = Buffer.from([1, 2, 3]);
  const photos = { first: [{ src: 'img/sample-1.jpg' }] };
  const assets = new Map([
    ['/index.html', { body: '<html>sample</html>', type: 'text/html' }],
    ['/img/sample-1.jpg', { body: image, type: 'image/jpeg' }],
    ['/private.txt', { body: 'must not publish', type: 'text/plain' }],
  ]);
  return { image, photos, assets, artifact: { snapshot: { photos }, read: name => assets.get(name) } };
}
test('publication captures only approved output bytes, independent of later artifact mutation', () => {
  const f = fixture(), captured = publicationOutput(f.artifact);
  assert.deepEqual([...captured.files.keys()].sort(), ['_headers', 'img/sample-1.jpg', 'index.html', 'robots.txt']);
  assert.match(captured.files.get('_headers').toString(), /noindex/);
  f.image.fill(9);
  assert.deepEqual(captured.files.get('img/sample-1.jpg'), Buffer.from([1, 2, 3]));
  assert.notEqual(publicationOutput(f.artifact).digest, captured.digest);
});
test('digest ignores duplicate references but binds the deployed path as well as bytes', () => {
  const f = fixture(), original = publicationOutput(f.artifact).digest;
  f.photos.second = [{ src: 'img/sample-1.jpg' }];
  assert.equal(publicationOutput(f.artifact).digest, original);
  f.assets.set('/img/renamed-1.jpg', f.assets.get('/img/sample-1.jpg'));
  f.photos.first[0].src = 'img/renamed-1.jpg'; delete f.photos.second;
  assert.notEqual(publicationOutput(f.artifact).digest, original);
});
test('publication refuses missing images and unsafe paths', () => {
  const f = fixture(); f.assets.delete('/img/sample-1.jpg');
  assert.throws(() => publicationOutput(f.artifact), { code: 'INVALID_PREVIEW' });
  f.photos.first[0].src = '../private.txt';
  assert.throws(() => publicationOutput(f.artifact), { code: 'INVALID_PREVIEW' });
});
