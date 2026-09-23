const net = require('node:net');
const dns = require('node:dns/promises');
const { publicIPv4 } = require('./attachments.cjs');

const fail = code => Object.assign(new Error(code), { code });
const LOCAL_SUFFIXES = ['.localhost', '.local', '.internal', '.home.arpa'];

function expandIPv6(address) {
  const [head, tail = ''] = address.split('::');
  const part = s => (s ? s.split(':') : []);
  let groups = [...part(head), ...Array(8 - part(head).length - part(tail).length).fill('0'), ...part(tail)];
  if (!address.includes('::')) groups = part(address);
  return groups.map(g => parseInt(g || '0', 16));
}

function isPublicAddress(address) {
  const kind = net.isIP(address);
  if (kind === 4) return publicIPv4(address);
  if (kind !== 6) return false;
  const lower = address.toLowerCase();
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
  if (mapped) return publicIPv4(mapped[1]);
  if (lower.includes('.')) return false;
  const g = expandIPv6(lower);
  if (g.every(n => n === 0) || (g.slice(0, 7).every(n => n === 0) && g[7] === 1)) return false;
  // Only global unicast (2000::/3) is public; exclude documentation 2001:db8::/32.
  if ((g[0] & 0xe000) !== 0x2000) return false;
  return !(g[0] === 0x2001 && g[1] === 0x0db8);
}

function localName(host) {
  return host === 'localhost' || LOCAL_SUFFIXES.some(suffix => host.endsWith(suffix)) || !host.includes('.');
}

// Pages the agent may open: public http(s) only, default ports, no credentials.
function checkResearchURL(raw) {
  let url;
  try { url = new URL(raw); } catch { throw fail('RESEARCH_URL_BLOCKED'); }
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || (url.port && !['80', '443'].includes(url.port))
    || url.href.length > 4000 || localName(host) || (net.isIP(host) && !isPublicAddress(host))) throw fail('RESEARCH_URL_BLOCKED');
  url.hash = '';
  return url;
}

// The embedded browser resolves names itself; check each host before any request leaves.
function createHostGuard({ lookup = host => dns.lookup(host, { all: true, verbatim: true }), ttlMs = 60000, now = () => Date.now() } = {}) {
  const cache = new Map();
  return async function allowed(hostname) {
    const host = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
    if (!host || localName(host)) return false;
    if (net.isIP(host)) return isPublicAddress(host);
    const hit = cache.get(host);
    if (hit && hit.expires > now()) return hit.allowed;
    let result;
    try { const addresses = await lookup(host); result = addresses.length > 0 && addresses.every(a => isPublicAddress(a.address)); } catch { result = false; }
    cache.set(host, { allowed: result, expires: now() + ttlMs });
    if (cache.size > 2000) cache.delete(cache.keys().next().value);
    return result;
  };
}

module.exports = { checkResearchURL, isPublicAddress, createHostGuard };
