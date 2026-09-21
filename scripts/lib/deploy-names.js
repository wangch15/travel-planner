// 跨行程的 deploy.name 唯一性。
//
// 兩趟行程共用同一個 deploy.name 的話，後部署的會把先部署的線上網站直接換掉，
// 而且網址不變——使用者傳給家人的連結還在，內容卻變成另一趟。他多半要等到
// 人在旅途中打開才會發現。這是整個引擎裡唯一會無聲毀掉已上線內容的地方，
// 所以 check 與 ship 兩道都要擋。
const fs = require('node:fs');
const path = require('node:path');
const { ROOT, tripDir } = require('./paths.js');

// 這裡要看「全部」的行程資料夾，包含底線開頭的內建範例——_example 也部署得出去
// （模板作者的示範站就是它），撞到它一樣會覆蓋。
function allTripSlugs() {
  const dir = path.join(ROOT, 'trips');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

// 讀不到或格式壞掉的那趟直接跳過——它有自己的錯誤訊息，不該在這裡假裝成撞名。
function readDeployName(slug) {
  try {
    const c = JSON.parse(fs.readFileSync(path.join(tripDir(slug), 'trip.config.json'), 'utf8'));
    return (c.deploy && c.deploy.name) || null;
  } catch {
    return null;
  }
}

function deployUrl(slug, name) {
  try {
    const c = JSON.parse(fs.readFileSync(path.join(tripDir(slug), 'trip.config.json'), 'utf8'));
    return (c.deploy && c.deploy.target) === 'pages' ? `${name}.pages.dev` : `${name}.<你的帳號>.workers.dev`;
  } catch {
    return `${name}.<你的帳號>.workers.dev`;
  }
}

function findConflict(slug, slugs = allTripSlugs()) {
  const name = readDeployName(slug);
  if (!name) return null;
  const others = slugs.filter((s) => s !== slug && readDeployName(s) === name);
  return others.length ? { name, others } : null;
}

function conflictMessage(slug, name, others) {
  return [
    `deploy.name「${name}」已經被其他行程用了：${others.join('、')}`,
    '',
    `兩趟都會部署到 ${deployUrl(slug, name)}，後部署的會把先部署的內容整個換掉，`,
    '而網址不變——已經傳出去的連結還在，但打開會是另一趟行程。',
    '',
    `修法：把 trips/${slug}/trip.config.json 的 deploy.name 改成不一樣的名字`,
    '（小寫英數與連字號，例如加上地點或年份）。那一段會出現在他傳給家人的網址裡，',
    '所以改之前先問使用者想叫什麼。',
  ].join('\n');
}

module.exports = { allTripSlugs, readDeployName, findConflict, conflictMessage, deployUrl };
