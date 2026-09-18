'use strict';
/* 地圖動線的線型：drive 實線、transit 虛線、walk 點線。
   render.js 的 MODE_ICON 管的是文字列的圖示，這裡管的是地圖上的線。 */
const MODE_LINE = {
  drive:   { dash: null,       width: 2.2 },
  taxi:    { dash: null,       width: 2.2 },
  transit: { dash: '7 5',      width: 2.2 },
  walk:    { dash: '1.5 4',    width: 2.0 },
  ferry:   { dash: '10 4 2 4', width: 2.0 },
};
const legStyle = (mode) => MODE_LINE[mode] || MODE_LINE.drive;
