// Render the original SVGs with Chromium; never rewrite their paths or colors.
const { app, BrowserWindow, nativeTheme } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { markFile } = require('./brand-marks.cjs');

const brand = path.join(__dirname, 'assets/brand');
const sizes = [16, 20, 24, 32, 40, 48, 64, 128, 180, 192, 256, 512, 1024];
app.on('window-all-closed', () => {});
app.whenReady().then(async () => {
  const hashes = JSON.parse(await fs.readFile(path.join(brand, 'source-checksums.json'), 'utf8'));
  const win = new BrowserWindow({ show: false, width: 1024, height: 1024,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
  await win.loadURL('data:text/html,<html><body></body></html>');
  for (const mode of ['light', 'dark']) {
    nativeTheme.themeSource = mode;
    const dir = path.join(brand, mode);
    await fs.mkdir(dir, { recursive: true });
    // Platform icons get their own square tile. The original transparent SVG is
    // embedded unchanged and fitted proportionally inside a padded viewport.
    // 小尺寸用 v2、32px 以上用 v3，由 markFile 決定。
    const background = mode === 'dark' ? '#191919' : '#ffffff';
    const markSource = async size => {
      const file = markFile(mode, size);
      const svg = await fs.readFile(path.join(brand, file));
      if (crypto.createHash('sha256').update(svg).digest('hex') !== hashes[file]) throw Error(`Original SVG changed: ${file}`);
      return `data:image/svg+xml;base64,${svg.toString('base64')}`;
    };
    const tile = mark => `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024"><rect width="1024" height="1024" fill="${background}"/><image x="96" y="96" width="832" height="832" preserveAspectRatio="xMidYMid meet" href="${mark}"/></svg>`;
    const macTile = mark => `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024"><rect x="64" y="64" width="896" height="896" rx="200" fill="${background}"/><image x="144" y="144" width="736" height="736" preserveAspectRatio="xMidYMid meet" href="${mark}"/></svg>`;
    // favicon 在分頁上只有 16–32px，用小尺寸版本。
    await fs.writeFile(path.join(brand, `favicon-${mode}.svg`), tile(await markSource(16)) + '\n');
    const encode = svg => `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
    for (const [prefix, makeTile] of [['icon', tile], ['macos-icon', macTile]]) {
    for (const size of sizes) {
      const imageSource = encode(makeTile(await markSource(size)));
      const data = await win.webContents.executeJavaScript(`(async () => {
        const image = new Image(); image.src = ${JSON.stringify(imageSource)}; await image.decode();
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = ${size};
        canvas.getContext('2d').drawImage(image, 0, 0, ${size}, ${size});
        return canvas.toDataURL('image/png').split(',')[1];
      })()`);
      await fs.writeFile(path.join(dir, `${prefix}-${size}.png`), Buffer.from(data, 'base64'));
    }
    }
    const icoSizes = [16, 24, 32, 48, 64, 128, 256];
    const pngs = await Promise.all(icoSizes.map(size => fs.readFile(path.join(dir, `icon-${size}.png`))));
    const header = Buffer.alloc(6 + 16 * pngs.length);
    header.writeUInt16LE(1, 2); header.writeUInt16LE(pngs.length, 4);
    let offset = header.length;
    pngs.forEach((png, i) => {
      const entry = 6 + i * 16;
      header[entry] = header[entry + 1] = icoSizes[i] === 256 ? 0 : icoSizes[i];
      header.writeUInt16LE(1, entry + 4); header.writeUInt16LE(32, entry + 6);
      header.writeUInt32LE(png.length, entry + 8); header.writeUInt32LE(offset, entry + 12);
      offset += png.length;
    });
    await fs.writeFile(path.join(dir, 'app.ico'), Buffer.concat([header, ...pngs]));
    if (process.platform === 'darwin') {
      const iconset = path.join(dir, 'app.iconset');
      await fs.mkdir(iconset, { recursive: true });
      for (const size of [16, 32, 128, 256, 512]) {
        await fs.copyFile(path.join(dir, `macos-icon-${size}.png`), path.join(iconset, `icon_${size}x${size}.png`));
        await fs.copyFile(path.join(dir, `macos-icon-${size * 2}.png`), path.join(iconset, `icon_${size}x${size}@2x.png`));
      }
      execFileSync('iconutil', ['-c', 'icns', iconset, '-o', path.join(dir, 'app.icns')]);
      await fs.rm(iconset, { recursive: true });
    }
    await fs.writeFile(path.join(__dirname, `manifest-${mode}.webmanifest`), JSON.stringify({
      id: './', name: 'Travel Planner', short_name: 'Travel Planner', lang: 'zh-Hant',
      start_url: './index.html', scope: './', display: 'standalone',
      background_color: mode === 'dark' ? '#191919' : '#ffffff',
      theme_color: mode === 'dark' ? '#191919' : '#ffffff',
      icons: [192, 512].map(size => ({ src: `assets/brand/${mode}/icon-${size}.png`, sizes: `${size}x${size}`, type: 'image/png', purpose: 'any' })),
    }, null, 2) + '\n');
  }
  win.destroy();
  console.log('Original SVGs preserved; light/dark PNG, ICO, macOS ICNS and manifests exported.');
  app.exit(0);
}).catch(error => { console.error(error); app.exit(1); });
