const fs = require('node:fs/promises');
const path = require('node:path');
const net = require('node:net');
const { randomUUID } = require('node:crypto');

const fail = (code, hint) => Object.assign(new Error(code), { code, hint });

// Not a malware detector: blocks common impersonation tricks and sites that are not trip data.
const SHORTENERS = ['bit.ly', 't.co', 'tinyurl.com', 'goo.gl', 'reurl.cc', 'ppt.cc', 'lihi.cc', 'lihi1.com', 'is.gd', 'ow.ly', 'rebrand.ly', 'shorturl.at', 'cutt.ly', 'tiny.cc', 'rb.gy', 'maps.app.goo.gl'];
const BLOCKED = {
  mail: ['gmail.com', 'mail.google.com', 'outlook.live.com', 'outlook.office.com', 'outlook.com', 'hotmail.com', 'mail.yahoo.com', 'mail.yahoo.co.jp', 'proton.me', 'protonmail.com', 'icloud.com', 'mail.qq.com', 'mail.163.com'],
  money: ['paypal.com', 'stripe.com', 'wise.com', 'revolut.com', 'jkopay.com', 'linepay.com', 'pay.line.me', 'alipay.com', 'binance.com', 'coinbase.com'],
  secrets: ['1password.com', 'bitwarden.com', 'lastpass.com', 'dashlane.com', 'keepersecurity.com'],
  social: ['facebook.com', 'messenger.com', 'instagram.com', 'line.me', 'whatsapp.com', 'web.whatsapp.com', 'telegram.org', 'web.telegram.org', 'x.com', 'twitter.com', 'discord.com', 'wechat.com'],
  drive: ['drive.google.com', 'dropbox.com', 'onedrive.live.com', 'box.com', 'accounts.google.com', 'myaccount.google.com', 'appleid.apple.com'],
};
const BLOCKED_WORDS = /(^|[.-])(bank|banking|mail|webmail|wallet|password|passwords|crypto)([.-]|$)/;
const CATEGORY_HINTS = { mail: '網路信箱內容太廣，請改把確認信截圖貼到聊天。', money: '付款與金融網站不能讓 AI 讀取。', secrets: '密碼管理網站不能讓 AI 讀取。',
  social: '社群與私訊網站不能讓 AI 讀取。', drive: '帳號或整個雲端硬碟範圍太廣；Google 試算表請直接連接 docs.google.com。', words: '看起來是銀行、信箱或錢包類網站，不能讓 AI 讀取。' };
const BRANDS = ['booking', 'agoda', 'airbnb', 'expedia', 'klook', 'kkday', 'tripadvisor', 'rakuten', 'jalan', 'trivago', 'skyscanner', 'hostelworld', 'eztravel', 'liontravel', 'evaair', 'starlux', 'china-airlines', 'cathaypacific', 'peachair', 'tigerairtw', 'notion', 'google'];
const SECOND_LEVEL = new Set(['co', 'com', 'net', 'org', 'ne', 'or', 'ac', 'go', 'gov', 'edu']);

function distance(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]; row[0] = i;
    for (let j = 1; j <= b.length; j++) { const next = row[j]; row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = next; }
  }
  return row[b.length];
}
// The label a person reads as the site name: booking.com → booking, rakuten.co.jp → rakuten.
function siteLabel(host) {
  const labels = host.split('.');
  const suffixLength = labels.length >= 3 && SECOND_LEVEL.has(labels.at(-2)) && labels.at(-1).length === 2 ? 2 : 1;
  return labels.at(-1 - suffixLength) || '';
}
const onDomain = (host, domain) => host === domain || host.endsWith('.' + domain);

function judgeSite(raw) {
  let url;
  try { url = new URL(/^[a-z]+:\/\//i.test(String(raw).trim()) ? String(raw).trim() : 'https://' + String(raw).trim()); } catch { throw fail('PRIVATE_SITE_INVALID', '這不是有效的網址。'); }
  if (url.protocol !== 'https:') throw fail('PRIVATE_SITE_NOT_HTTPS', '只接受 https 開頭的網站。');
  if (url.username || url.password || url.port) throw fail('PRIVATE_SITE_INVALID', '網址不能包含帳號、密碼或特殊連接埠。');
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (net.isIP(host.replace(/^\[|\]$/g, '')) || host === 'localhost' || !host.includes('.') || /\.(local|internal|localhost|home\.arpa)$/.test(host)) throw fail('PRIVATE_SITE_LOCAL', '不能連接 IP 位址或內部網路。');
  if (/(^|\.)xn--/.test(host) || /[^\x00-\x7f]/.test(raw)) throw fail('PRIVATE_SITE_LOOKALIKE', '網址含有可以冒充英文字母的特殊字元，常見於仿冒網站。');
  if (SHORTENERS.some(domain => onDomain(host, domain))) throw fail('PRIVATE_SITE_SHORTENER', '這是短網址。請先在瀏覽器打開，再貼上最後停留的網址。');
  for (const [category, domains] of Object.entries(BLOCKED)) if (domains.some(domain => onDomain(host, domain))) throw fail('PRIVATE_SITE_CATEGORY', CATEGORY_HINTS[category]);
  if (BLOCKED_WORDS.test(host)) throw fail('PRIVATE_SITE_CATEGORY', CATEGORY_HINTS.words);
  const label = siteLabel(host), plain = label.replace(/0/g, 'o').replace(/1/g, 'l').replace(/3/g, 'e').replace(/5/g, 's');
  for (const brand of BRANDS) {
    if (label === brand) break;
    const near = distance(label, brand) <= (brand.length >= 7 ? 2 : 1);
    if (plain === brand || (label.length >= 4 && near) || (label.includes(brand) && label !== brand && /[-0-9]/.test(label.replace(brand, '')))) throw fail('PRIVATE_SITE_LOOKALIKE', `網址很像「${brand}」但不是官方網域，可能是仿冒網站。`);
  }
  // Allow the site and its subdomains, but never widen a narrow host (docs.google.com stays docs only).
  return { host: host.replace(/^www\./, '') };
}

class PrivateSources {
  constructor(directory, { now = () => new Date() } = {}) { this.file = path.join(directory, 'private-sources.json'); this.now = now; this.items = []; this.queue = Promise.resolve(); }
  async load() {
    try { const data = JSON.parse(await fs.readFile(this.file, 'utf8')); this.items = Array.isArray(data.sources) ? data.sources.filter(s => s && typeof s.host === 'string' && /^[a-z0-9.-]{3,253}$/.test(s.host)) : []; }
    catch (error) { if (error.code !== 'ENOENT') throw error; this.items = []; }
    return this.list();
  }
  list() { return this.items.map(item => ({ ...item })); }
  allows(raw) {
    let host;
    try { const url = new URL(raw); if (url.protocol !== 'https:') return false; host = url.hostname.toLowerCase(); } catch { return false; }
    return this.items.some(item => onDomain(host, item.host));
  }
  save() {
    const run = async () => {
      await fs.mkdir(path.dirname(this.file), { recursive: true, mode: 0o700 });
      const temp = this.file + '.' + randomUUID() + '.tmp';
      await fs.writeFile(temp, JSON.stringify({ version: 1, sources: this.items }, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
      await fs.rename(temp, this.file);
    };
    const next = this.queue.then(run); this.queue = next.catch(() => {}); return next;
  }
  async add(raw) {
    const { host } = judgeSite(raw);
    if (!this.items.some(item => item.host === host)) { this.items.push({ host, addedAt: this.now().toISOString() }); await this.save(); }
    return { host };
  }
  async remove(host) { const before = this.items.length; this.items = this.items.filter(item => item.host !== host); if (this.items.length !== before) await this.save(); return before !== this.items.length; }
}

module.exports = { judgeSite, PrivateSources, siteLabel };
