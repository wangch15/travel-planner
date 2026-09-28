const { createHash } = require('node:crypto');
const { IMAGE_FILE, imageType } = require('../../packages/engine/stay-guides.cjs');
const fail = code => Object.assign(new Error(code), { code });
const PLACE_PHOTO = /^img\/[a-zA-Z0-9_-]+-\d+\.jpg$/;
// 預覽與發布只收兩種圖片：地點照片（jpg），以及住宿指南宣告的 guide-*.jpg／png／webp。
function previewImageType(name) {
  if (PLACE_PHOTO.test(name)) return 'image/jpeg';
  const file = typeof name === 'string' && name.startsWith('img/') ? name.slice(4) : '';
  return IMAGE_FILE.test(file) ? imageType(file) : null;
}

// One allowlist for both approval hashing and the bytes written for deployment.
// Capture copies so later reads or mutations cannot change the approved output.
function publicationOutput(artifact) {
  const files = new Map();
  let total = 0;
  const add = (name, body) => {
    if (typeof body !== 'string' && !Buffer.isBuffer(body)) throw fail('INVALID_PREVIEW');
    total += Buffer.byteLength(body);
    if (total > 160 * 1024 * 1024) throw fail('PUBLICATION_TOO_LARGE');
    files.set(name, Buffer.from(body));
  };
  const index = artifact.read('/index.html');
  if (!index || !index.type?.startsWith('text/html')) throw fail('INVALID_PREVIEW');
  add('index.html', index.body);
  for (const photo of Object.values(artifact.snapshot.photos || {}).flat()) {
    if (!PLACE_PHOTO.test(photo.src)) throw fail('INVALID_PREVIEW');
    if (files.has(photo.src)) continue;
    const asset = artifact.read('/' + photo.src);
    if (!asset || asset.type !== 'image/jpeg') throw fail('INVALID_PREVIEW');
    add(photo.src, asset.body);
  }
  for (const src of Object.values(artifact.snapshot.trip?.GUIDE_IMAGES || {})) {
    if (typeof src !== 'string' || !src.startsWith('img/') || !IMAGE_FILE.test(src.slice(4))) throw fail('INVALID_PREVIEW');
    const type = imageType(src);
    if (files.has(src)) continue;
    const asset = artifact.read('/' + src);
    if (!asset || asset.type !== type) throw fail('INVALID_PREVIEW');
    add(src, asset.body);
  }
  add('robots.txt', 'User-agent: *\nDisallow: /\n');
  add('_headers', '/*\n  X-Robots-Tag: noindex, nofollow, noarchive, noimageindex\n  Referrer-Policy: no-referrer\n  X-Content-Type-Options: nosniff\n');
  const hash = createHash('sha256').update('travel-planner-publication-v1\n');
  for (const name of [...files.keys()].sort()) {
    const bytes = files.get(name);
    hash.update(JSON.stringify([name, bytes.length]) + '\n').update(bytes);
  }
  return { files, digest: hash.digest('hex') };
}
module.exports = { publicationOutput, previewImageType };
