const path = require('node:path');
const fs = require('node:fs/promises');

const CSP = "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-src 'self' about: travel-preview:; connect-src 'self'; manifest-src 'self'; base-uri 'none'; form-action 'none'; object-src 'none'";
const assets = new Map([
  ['/index.html', 'text/html; charset=utf-8'], ['/style.css', 'text/css; charset=utf-8'],
  ['/menus.js', 'text/javascript; charset=utf-8'], ['/app.js', 'text/javascript; charset=utf-8'], ['/features.js','text/javascript; charset=utf-8'], ['/settings.js','text/javascript; charset=utf-8'], ['/onboarding.js','text/javascript; charset=utf-8'], ['/actions.js','text/javascript; charset=utf-8'], ['/markdown.js','text/javascript; charset=utf-8'],
]);
for (const mode of ['light', 'dark']) {
  assets.set(`/assets/brand/travel-planner-mark-on-${mode}-v2.svg`, 'image/svg+xml');
  assets.set(`/assets/brand/favicon-${mode}.svg`, 'image/svg+xml');
}
for (const mode of ['light', 'dark']) {
  assets.set(`/manifest-${mode}.webmanifest`, 'application/manifest+json');
  for (const size of [16, 20, 24, 32, 40, 48, 64, 128, 180, 192, 256, 512, 1024]) assets.set(`/assets/brand/${mode}/icon-${size}.png`, 'image/png');
}
async function readAsset(urlPath) {
  const name = urlPath === '/' ? '/index.html' : urlPath;
  const type = assets.get(name);
  if (!type) return null;
  return { body: await fs.readFile(path.join(__dirname, name.slice(1))), type };
}
module.exports = { CSP, readAsset };
