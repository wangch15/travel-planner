const fs = require('node:fs/promises');
const path = require('node:path');

const fail = code => Object.assign(new Error(code), { code });
const NOTES = 'private-notes.md';
const HEADER = '# 私人筆記\n\n這份檔案只在你的私人 repo，不會進公開網站。App 查核時從私人網站或截圖讀到的訂單號、確認碼等記在這裡。\n\n';
const squash = text => String(text).replace(/[.\-\s]/g, '').toUpperCase();

// Code-like strings (confirmation numbers, phone numbers, PINs with letters) worth keeping out of public files.
function extractCodes(text) {
  const codes = new Set();
  for (const raw of String(text).match(/[A-Za-z0-9](?:[A-Za-z0-9]|[.-](?=[A-Za-z0-9])){5,60}/g) || []) {
    const code = squash(raw);
    const digits = (code.match(/\d/g) || []).length;
    if (code.length < 8 || digits < 4 || /^(19|20)\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])$/.test(code)) continue;
    codes.add(code);
  }
  return [...codes];
}

const onDomain = (host, domain) => host === domain || host.endsWith('.' + domain);
// Returns a human-readable reason when candidate trip files contain private data, otherwise null.
function findPrivateData(texts, { codes = [], hosts = [] }) {
  for (const text of texts) {
    const flat = squash(text);
    const code = codes.find(value => flat.includes(value));
    if (code) return `候選內容含有私人筆記裡的代碼（…${code.slice(-4)}），可能是訂房確認碼或電話，不能寫進會公開的行程檔。`;
    for (const match of String(text).matchAll(/https?:\/\/([a-z0-9.-]+)/gi)) {
      const host = match[1].toLowerCase(), domain = hosts.find(value => onDomain(host, value));
      if (domain) return `候選內容含有你連接的私人網站網址（${domain}），不能寫進會公開的行程檔。`;
    }
  }
  return null;
}

async function realDirectory(dir) { const stat = await fs.lstat(dir); if (!stat.isDirectory() || stat.isSymbolicLink()) throw fail('UNSAFE_PRIVATE_NOTES'); }

async function appendPrivateNotes(tripDir, notes, { now = () => new Date() } = {}) {
  const text = String(notes || '').trim();
  if (!text) return false;
  await realDirectory(tripDir);
  const docs = path.join(tripDir, 'docs');
  try { await realDirectory(docs); } catch (error) { if (error.code !== 'ENOENT') throw fail('UNSAFE_PRIVATE_NOTES'); await fs.mkdir(docs, { mode: 0o700 }); }
  const file = path.join(docs, NOTES);
  let exists = true;
  try { const stat = await fs.lstat(file); if (!stat.isFile() || stat.isSymbolicLink()) throw fail('UNSAFE_PRIVATE_NOTES'); } catch (error) { if (error.code !== 'ENOENT') throw error; exists = false; }
  await fs.appendFile(file, (exists ? '' : HEADER) + `## ${now().toISOString().slice(0, 10)} 研究查核（App 自動記錄）\n\n${text.slice(0, 8000)}\n\n`, { mode: 0o600 });
  return true;
}

async function privateMarkers(tripDir, hosts = []) {
  let text = '';
  try { const file = path.join(tripDir, 'docs', NOTES); const stat = await fs.lstat(file); if (stat.isFile() && !stat.isSymbolicLink()) text = await fs.readFile(file, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  return { codes: extractCodes(text), hosts: [...hosts] };
}

module.exports = { extractCodes, findPrivateData, appendPrivateNotes, privateMarkers };
