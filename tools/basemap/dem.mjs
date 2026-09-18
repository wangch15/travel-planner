// 高程圖磚：範圍計算、解碼成高程網格。
// 移植自 SENTAI2026 contours.py 的前半段與 README 裡的 curl 步驟。
export const Z = 10;
const TILE = 256;

const lng2tile = (lng, z) => (lng + 180) / 360 * (1 << z);
const lat2tile = (lat, z) => {
  const s = Math.sin(lat * Math.PI / 180);
  return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * (1 << z);
};

export function tileRange(bbox) {
  const [lngMin, latMin, lngMax, latMax] = bbox;
  return {
    z: Z,
    x0: Math.floor(lng2tile(lngMin, Z)), x1: Math.floor(lng2tile(lngMax, Z)),
    y0: Math.floor(lat2tile(latMax, Z)), y1: Math.floor(lat2tile(latMin, Z)),
  };
}

// 国土地理院 dem_png：v = R·65536 + G·256 + B，h = v < 2^23 ? v·0.01 : (v − 2^24)·0.01
export function decodeGSI(rgb) {
  const out = new Float32Array(rgb.length / 3);
  for (let i = 0, j = 0; i < rgb.length; i += 3, j += 1) {
    const r = rgb[i], g = rgb[i + 1], b = rgb[i + 2];
    if (r === 128 && g === 0 && b === 0) { out[j] = NaN; continue; }
    const v = r * 65536 + g * 256 + b;
    out[j] = v < 2 ** 23 ? v * 0.01 : (v - 2 ** 24) * 0.01;
  }
  return out;
}

// Terrarium：h = R·256 + G + B/256 − 32768
export function decodeTerrarium(rgb) {
  const out = new Float32Array(rgb.length / 3);
  for (let i = 0, j = 0; i < rgb.length; i += 3, j += 1) {
    out[j] = rgb[i] * 256 + rgb[i + 1] + rgb[i + 2] / 256 - 32768;
  }
  return out;
}

const SOURCES = {
  gsi: {
    id: 'gsi',
    url: (z, x, y) => `https://cyberjapandata.gsi.go.jp/xyz/dem_png/${z}/${x}/${y}.png`,
    credit: '国土地理院',
    decode: decodeGSI,
  },
  terrarium: {
    id: 'terrarium',
    url: (z, x, y) => `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`,
    credit: 'Terrain Tiles（AWS Open Data）',
    decode: decodeTerrarium,
  },
};

export function demSource(config) {
  const want = (config.basemap && config.basemap.dem) || 'auto';
  if (want !== 'auto') {
    if (!SOURCES[want]) throw new Error(`basemap.dem 不合法：${want}（可用 auto、gsi、terrarium）`);
    return SOURCES[want];
  }
  return config.region.country === 'JP' ? SOURCES.gsi : SOURCES.terrarium;
}

// 缺圖磚（多半是外海）視為 0 公尺
export function buildGrid(tiles, range) {
  const cols = range.x1 - range.x0 + 1, rows = range.y1 - range.y0 + 1;
  const w = cols * TILE, h = rows * TILE;
  const grid = new Float32Array(w * h);
  for (let ty = range.y0; ty <= range.y1; ty += 1) {
    for (let tx = range.x0; tx <= range.x1; tx += 1) {
      const tile = tiles.get(`${tx}_${ty}`);
      if (!tile) continue;
      const ox = (tx - range.x0) * TILE, oy = (ty - range.y0) * TILE;
      for (let r = 0; r < TILE; r += 1) {
        for (let c = 0; c < TILE; c += 1) {
          const v = tile[r * TILE + c];
          grid[(oy + r) * w + ox + c] = Number.isNaN(v) ? 0 : v;
        }
      }
    }
  }
  return { grid, w, h };
}

export function gridToLngLat(col, row, range) {
  const n = TILE * (1 << range.z);
  const gx = (range.x0 * TILE + col) / n;
  const gy = (range.y0 * TILE + row) / n;
  return [gx * 360 - 180, Math.atan(Math.sinh(Math.PI * (1 - 2 * gy))) * 180 / Math.PI];
}
