const { Worker } = require('node:worker_threads');
const { randomBytes } = require('node:crypto');
const path = require('node:path');

const PREVIEW_CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src travel-preview: data:; font-src 'none'; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; sandbox allow-scripts";

function buildPreview(projectRoot, slug) {
  if (!path.isAbsolute(projectRoot) || !/^[a-zA-Z0-9_-]{1,100}$/.test(slug)) return Promise.reject(Error('invalid-preview-target'));
  return new Promise((resolve, reject) => {
    const worker = new Worker(path.join(__dirname, 'preview-worker.cjs'), {
      workerData: { projectRoot, slug }, resourceLimits: { maxOldGenerationSizeMb: 384, stackSizeMb: 8 },
    });
    let settled = false;
    const done = (error, value) => {
      if (settled) return; settled = true; clearTimeout(timer); worker.terminate();
      if (error) reject(error); else resolve(value);
    };
    const timer = setTimeout(() => done(Error('preview-timeout')), 30000);
    worker.once('error', () => done(Error('preview-worker-failed')));
    worker.once('exit', code => { if (!settled) done(Error(`preview-worker-exit-${code}`)); });
    worker.once('message', result => {
      if (!result.ok) { const error = Error(result.message); error.code = result.code; done(error); return; }
      const token = randomBytes(24).toString('hex');
      const assets = new Map([['/index.html', { body: result.html, type: 'text/html; charset=utf-8' }]]);
      for (const photo of result.photos) {
        if (!/^img\/[a-zA-Z0-9_-]+-\d+\.jpg$/.test(photo.name)) { done(Error('invalid-preview-photo')); return; }
        assets.set(`/${photo.name}`, { body: Buffer.from(photo.bytes), type: 'image/jpeg' });
      }
      done(null, { token, url: `travel-preview://${token}/index.html`, digest: result.digest, summary: result.summary, snapshot: result.snapshot,
        read: pathname => assets.get(pathname) || null });
    });
  });
}
module.exports = { buildPreview, PREVIEW_CSP };
