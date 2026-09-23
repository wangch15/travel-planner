const fs = require('node:fs');
const path = require('node:path');
const DATA_KEYS = ['PLACES', 'DAYS', 'OVERVIEW_ROUTE', 'ADDONS', 'CHECKLIST', 'STAYS', 'OVERVIEW', 'DETAILS', 'DINING', 'MAP_LISTS'];

// 資料裡的連結或文字可能含 </script，不轉義會提前關掉 script 區塊
const json = (v) => JSON.stringify(v).replace(/<\/script/gi, '<\\/script');

function documentHTML(trip, head, body) {
  const { config } = trip;
  const favicon = 'data:image/svg+xml,' + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y="82" font-size="82">${(config.theme && config.theme.favicon) || '🗺'}</text></svg>`);
  return `<!doctype html>
<html lang="${config.lang || 'zh-Hant'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex,nofollow,noarchive,noimageindex">
<meta name="description" content="${(config.description || '').replace(/"/g, '&quot;')}">
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="#F4F0E5" media="(prefers-color-scheme:light)">
<meta name="theme-color" content="#15130F" media="(prefers-color-scheme:dark)">
<link rel="icon" href="${favicon}">
<style>
:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}
img{max-width:100%}
[hidden]{display:none!important}
</style>
${head}
</head>
<body>
${body}
</body>
</html>
`;
}


// assetsRoot is owned by the application, never taken from an imported repo.
function createRenderer(assetsRoot) {
  const readEngine = (...parts) => fs.readFileSync(path.join(assetsRoot, ...parts), 'utf8');
function inline(trip, {theme = '', extra = { sections: [] }, photos = {}}) {
  const data = DATA_KEYS.map((k) => `const ${k} = ${json(trip[k])};`).join('\n')
    + `\nconst EXTRA = ${json(extra)};`;
  return readEngine('index.html')
    .replace('/*__TITLE__*/', trip.config.title)
    .replace('/*__CONFIG__*/null', json(trip.config))
    .replace('/*__BASEMAP__*/null', json(trip.basemap))
    .replace('/*__PHOTOS__*/null', json(photos))
    .replace('/*__DATA__*/', data)
    .replace('<link rel="stylesheet" href="styles.css">', `<style>\n${readEngine('styles.css')}\n${theme}</style>`)
    .replace('<script src="map-modes.js"></script>', `<script>\n${readEngine('map-modes.js')}\n</script>`)
    .replace('<script src="util.js"></script>', `<script>\n${readEngine('util.js')}\n</script>`)
    .replace('<script src="render.js"></script>', `<script>\n${readEngine('render.js')}\n</script>`)
    .replace('<script src="app.js"></script>', `<script>\n${readEngine('app.js')}\n</script>`);
}


  return ({trip, theme = '', extra = {sections: []}, photos = {}}) => {
    const filled = inline(trip, {theme, extra, photos});
    const cut = filled.indexOf('</style>');
    if (cut === -1) throw new Error('Engine template is missing the head style boundary');
    return documentHTML(trip, filled.slice(0, cut + 8), filled.slice(cut + 8).trim());
  };
}
module.exports = {createRenderer};
