#!/usr/bin/env node
// build 後起一個最小靜態伺服器：node scripts/preview.js <slug> [--lan] [--tunnel]
//
//   （無旗標）只有這台電腦打得開（127.0.0.1）
//   --lan      同一個 wifi 的手機也打得開
//   --tunnel   產生一個臨時的公開 https 網址，任何網路都打得開（需要 cloudflared）
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { resolveSlug } = require('./lib/paths.js');
const { buildTrip } = require('./build.js');

const PORT = 4173;
const TYPES = { '.html':'text/html; charset=utf-8', '.jpg':'image/jpeg', '.png':'image/png', '.txt':'text/plain; charset=utf-8' };

// cloudflared 把網址印在 stderr 的一個框框裡，只有這一段是我們要的。
const TUNNEL_URL = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/;

const CLOUDFLARED_INSTALL = [
  '找不到 cloudflared，沒辦法產生公開網址。安裝方式：',
  '  macOS        brew install cloudflared',
  '  Windows      winget install --id Cloudflare.cloudflared',
  '  其他／手動    https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/',
  '',
  '裝好之後再跑一次同樣的指令就會有公開網址。',
].join('\n');

function parseFlags(argv) {
  return { lan: argv.includes('--lan'), tunnel: argv.includes('--tunnel') };
}

// 區網 IPv4：排除 loopback 與 IPv6，通常只會有一個（有 VPN 或 docker 時會多）。
function lanAddresses() {
  return Object.values(os.networkInterfaces()).flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal)
    .map((i) => i.address);
}

function serve(root) {
  return http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
    const file = path.join(root, rel);
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('找不到檔案');
      return;
    }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
}

// 開一條 cloudflared 快速通道。不需要 Cloudflare 帳號，網址是隨機的，
// 這個行程結束（Ctrl+C）網址就失效。
function openTunnel(port, onUrl) {
  const child = spawn('cloudflared', ['tunnel', '--url', `http://127.0.0.1:${port}`], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let found = false;
  const scan = (buf) => {
    if (found) return;
    const m = String(buf).match(TUNNEL_URL);
    if (m) { found = true; onUrl(m[0]); }
  };
  child.stdout.on('data', scan);
  child.stderr.on('data', scan);
  child.on('error', (e) => {
    onUrl(null, e.code === 'ENOENT' ? CLOUDFLARED_INSTALL : `cloudflared 啟動失敗：${e.message}`);
  });
  child.on('exit', (code) => {
    if (!found && code) onUrl(null, `cloudflared 結束了（exit ${code}），沒有拿到網址。`);
  });
  const stop = () => { try { child.kill(); } catch { /* 已經結束了 */ } };
  process.on('exit', stop);
  process.on('SIGINT', () => { stop(); process.exit(0); });
  return child;
}

function main(argv) {
  const flags = parseFlags(argv);
  const slug = resolveSlug(argv);
  const { outDir } = buildTrip(slug);
  const root = path.join(outDir, 'site');
  const host = flags.lan ? '0.0.0.0' : '127.0.0.1';

  serve(root).listen(PORT, host, () => {
    console.log(`預覽：http://localhost:${PORT}　（Ctrl+C 結束）`);

    if (flags.lan) {
      const addrs = lanAddresses();
      if (addrs.length) {
        console.log('\n同一個 wifi 的手機可以開：');
        addrs.forEach((a) => console.log(`  http://${a}:${PORT}`));
        console.log('（同一個網路內的人都打得開，公共 wifi 請避免使用）');
      } else {
        console.log('\n找不到區網位址——這台電腦可能沒連上網路，或只有虛擬網卡。');
      }
    }

    if (flags.tunnel) {
      console.log('\n正在產生公開網址…');
      openTunnel(PORT, (url, err) => {
        if (url) {
          console.log(`\n公開網址：${url}`);
          console.log('任何網路都打得開，手機直接點就可以。');
          console.log('**這個網址關掉這個指令就失效**，而且拿到網址的人都看得到內容。');
        } else {
          console.log(`\n${err}`);
          if (!flags.lan) console.log('\n先用 --lan 的話，同一個 wifi 的手機一樣可以看。');
        }
      });
    }
  });
}

module.exports = { parseFlags, lanAddresses, CLOUDFLARED_INSTALL, TUNNEL_URL };

if (require.main === module) main(process.argv.slice(2));
