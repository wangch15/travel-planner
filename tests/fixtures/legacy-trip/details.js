const details = {
  sightA: { summary: '這是一段足夠長的說明文字，用來滿足最少四十個字的驗證規則，內容本身不重要，只要長度足夠即可。',
    highlights: ['看點一', '看點二'], stay: '60 分', info: [['停車', '門前收費停車場，一日 ¥500']], refs: [{ t: '官方', u: 'https://example.com/' }] },
  stayA: { summary: '這是一段足夠長的說明文字，用來滿足最少四十個字的驗證規則，內容本身不重要，只要長度足夠即可。',
    highlights: ['看點一', '看點二'], stay: '1 晚', info: [], refs: [{ t: '官方', u: 'https://example.com/' }] },
  cafeA: { dining: true, summary: '這是一段足夠長的說明文字，用來滿足最少四十個字的驗證規則，內容本身不重要，只要長度足夠即可。',
    highlights: ['看點一', '看點二'], stay: '60 分', info: [], refs: [{ t: '官方', u: 'https://example.com/' }] },
};
if (typeof module !== 'undefined') module.exports = details;
