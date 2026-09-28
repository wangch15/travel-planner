// 把 AI 在住宿指南裡引用的聊天附件圖片（{attachment:"<id>"}）換成專案內的檔名，並備好要寫入的位元組。
// 只接受本輪已附加、App 驗證過的圖片附件；讀出的內容再比對大小與雜湊，避免中途被換掉。
const fs = require('node:fs/promises');
const { createHash } = require('node:crypto');
const { IMAGE_FILE, imageBytesMatch } = require('../../../packages/engine/stay-guides.cjs');

const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
const fail = code => Object.assign(new Error(code), { code });
const slug = value => String(value).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');

function guideImageFile(guideId, imageId, mime) {
  const ext = EXT[mime];
  const base = slug(`${guideId}-${imageId}`).slice(0, 80).replace(/-+$/, '');
  const file = `guide-${base}.${ext}`;
  if (!ext || !base || !IMAGE_FILE.test(file)) throw fail('GUIDE_IMAGE_INVALID');
  return file;
}

async function resolveGuideAttachments(guides, refs = [], { readFile = fs.readFile } = {}) {
  if (!Array.isArray(guides)) return { guides, assets: [] };
  const assets = new Map();
  const resolved = [];
  for (const guide of guides) {
    if (!guide || !Array.isArray(guide.images) || !guide.images.some(im => im && Object.hasOwn(im, 'attachment'))) { resolved.push(guide); continue; }
    const images = [];
    for (const image of guide.images) {
      if (!image || !Object.hasOwn(image, 'attachment')) { images.push(image); continue; }
      const ref = refs.find(r => r && r.kind === 'image' && r.id === image.attachment);
      if (!ref) throw fail('GUIDE_IMAGE_ATTACHMENT_MISSING');
      const file = guideImageFile(guide.id, image.id, ref.mime);
      // 不同附件換算成同一個檔名（例如 id 只差大小寫）時要擋下，不能讓第二張圖默默被第一張取代。
      if (assets.has(file) && assets.get(file).source !== ref.id) throw fail('GUIDE_IMAGE_ID_COLLISION');
      if (!assets.has(file)) {
        const bytes = await readFile(ref.localPath);
        if (bytes.length !== ref.size || createHash('sha256').update(bytes).digest('hex') !== ref.sha256 || !imageBytesMatch(file, bytes)) throw fail('ATTACHMENT_CHANGED');
        assets.set(file, { file, bytes, source: ref.id });
      }
      const { attachment: _attachment, ...rest } = image;
      images.push({ ...rest, file });
    }
    resolved.push({ ...guide, images });
  }
  return { guides: resolved, assets: [...assets.values()].map(({ file, bytes }) => ({ file, bytes })) };
}

module.exports = { resolveGuideAttachments, guideImageFile };
