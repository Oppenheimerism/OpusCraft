// GUI sprites of the trading screen (vanilla container/villager.png, 276x166 of a 512x256 sheet, and the sprites in
// gui/sprites/container/villager): the panel with the list's scrollbar track, the payment and result slots and the
// arrow between them, the villager's experience bar, the scroller, the little arrow in each offer and its
// out-of-stock cross, and the line struck through a changed price.

import { TexImage, img, plot } from './tex';
import { GUI_TEXTURES, panel, inset, slotAt, playerInventory, arrowMask, drawMask } from './gui';

const G = GUI_TEXTURES;
const BLACK = 0x000000;
const WHITE = 0xffffff;
const SLOT = 0x8b8b8b;

G['container_villager'] = () => {
  const t = panel(276, 166);
  // the scrollbar's track beside the offers (the scroller is 6x27 at 94, 18..131)
  inset(t, 93, 17, 8, 141);
  slotAt(t, 136, 37);
  slotAt(t, 162, 37);
  slotAt(t, 220, 37);
  drawMask(t, 186, 38, arrowMask(22, 15, 7), SLOT);
  playerInventory(t, 84, 108);
  return t;
};

/** 28x21 red cross over the arrow when the chosen offer is sold out */
G['villager_out_of_stock'] = () => {
  const t = img(28, 21);
  for (let i = 0; i < 15; i++) {
    const x = 7 + i, y = 3 + i;
    for (const [dx, c] of [[-2, BLACK], [-1, 0xff5555], [0, 0xd81e1e], [1, 0xa01010], [2, BLACK]] as [number, number][]) {
      plot(t, x + dx, y, c);
      plot(t, 20 - i + dx, y, c);
    }
  }
  return t;
};

/** 102x5 experience bar: rounded ends, black edge, three shades inside */
function bar(rows: [number, number, number]): TexImage {
  const t = img(102, 5);
  for (let x = 0; x < 102; x++)
    for (let y = 0; y < 5; y++) {
      const ex = x === 0 || x === 101, ey = y === 0 || y === 4;
      if (ex && ey) continue;
      plot(t, x, y, ex || ey ? BLACK : rows[y - 1]);
    }
  return t;
}
G['villager_experience_bar_background'] = () => bar([0x5a5a5a, 0x484848, 0x3a3a3a]);
G['villager_experience_bar_current'] = () => bar([0xb6ff76, 0x80ff20, 0x55c511]);
/** what the offer in the result slot would add */
G['villager_experience_bar_result'] = () => bar([0xeaffc9, 0xc9f79a, 0xa6e070]);

/** 6x27 scroller: bevelled like a button, darker when there's nothing to scroll */
function scroller(face: number, hi: number, lo: number): TexImage {
  const t = img(6, 27);
  for (let y = 0; y < 27; y++)
    for (let x = 0; x < 6; x++) {
      let c = face;
      if (x === 0 || y === 0 || x === 5 || y === 26) c = BLACK;
      else if (x === 1 || y === 1) c = hi;
      else if (x === 4 || y === 25) c = lo;
      plot(t, x, y, c);
    }
  plot(t, 0, 0, BLACK, 0);
  plot(t, 5, 0, BLACK, 0);
  plot(t, 0, 26, BLACK, 0);
  plot(t, 5, 26, BLACK, 0);
  return t;
}
G['villager_scroller'] = () => scroller(0xc6c6c6, WHITE, 0x555555);
G['villager_scroller_disabled'] = () => scroller(0x8b8b8b, 0xa8a8a8, 0x5a5a5a);

/** 10x9 arrow between an offer's price and what it buys */
const ARROW = [
  '.....#....',
  '.....##...',
  '#######...',
  '########..',
  '#########.',
  '########..',
  '#######...',
  '.....##...',
  '.....#....',
];
function tradeArrow(face: number, shade: number): TexImage {
  const t = img(10, 9);
  for (let y = 0; y < 9; y++)
    for (let x = 0; x < 10; x++) {
      if (ARROW[y][x] !== '#') continue;
      const below = y + 1 < 9 && ARROW[y + 1][x] === '#';
      plot(t, x, y, below ? face : shade);
    }
  return t;
}
G['villager_trade_arrow'] = () => tradeArrow(0xe6e6e6, 0xa8a8a8);
G['villager_trade_arrow_out_of_stock'] = () => {
  const t = tradeArrow(0x7a7a7a, 0x5a5a5a);
  for (let i = 0; i < 7; i++) {
    plot(t, 1 + i, 1 + i, 0xe02020);
    plot(t, 7 - i, 1 + i, 0xe02020);
    plot(t, 2 + i, 1 + i, 0x901010);
    plot(t, 8 - i, 1 + i, 0x901010);
  }
  return t;
};

/** 9x2 red line through the price an offer had before its change */
G['villager_discount_strikethrough'] = () => {
  const t = img(9, 2);
  for (let x = 0; x < 9; x++) {
    plot(t, x, 0, 0xff5555);
    plot(t, x, 1, 0xa01010);
  }
  return t;
};
