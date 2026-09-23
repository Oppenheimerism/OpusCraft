// The enchanting table's book (vanilla textures/entity/enchanting_table_book.png,
// 64x32, laid out for BookModel's box UVs): leather covers and spine, the two
// page blocks and the flipping page, with faint lines of script on the pages.

import { TexImage, img, setPx, mixC, Rand } from './tex';
import { hashString } from '../core/rng';

const LEATHER = [0x3b2210, 0x4e2e16, 0x61391c, 0x734525, 0x86542e];
const LINING = [0x6f4a28, 0x83592f, 0x966838];
const PAPER = [0xcdc3a4, 0xd9d0b2, 0xe6dec3, 0xf1ead3];
const INK = 0x9a8f78;

function rect(t: TexImage, x0: number, y0: number, w: number, h: number, pick: (x: number, y: number) => number): void {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) setPx(t, x, y, pick(x - x0, y - y0));
}

export function enchantingBookTexture(): TexImage {
  const t = img(64, 32);
  const r = new Rand(hashString('enchanting_table_book'), 5);
  const grain = () => r.nextInt(3);
  // cover outsides (left at 6..12, right at 22..28) and spine (12..14): tooled leather with a dark border
  const outside = (x0: number, w: number) =>
    rect(t, x0, 0, w, 10, (x, y) => {
      const edge = x === 0 || y === 0 || x === w - 1 || y === 9;
      const inner = w > 2 && (x === 1 || y === 1 || x === w - 2 || y === 8);
      if (edge) return LEATHER[0];
      if (inner) return LEATHER[1 + (grain() === 0 ? 1 : 0)];
      return LEATHER[2 + grain() % 2 + (r.chance(0.08) ? 1 : 0)];
    });
  outside(6, 6);
  outside(22, 6);
  outside(12, 2);
  // cover insides (left at 0..6, right at 16..22) and the spine's inside (14..16): lighter lining
  const inside = (x0: number, w: number) =>
    rect(t, x0, 0, w, 10, (x, y) => (x === 0 || y === 0 || x === w - 1 || y === 9 ? LEATHER[2] : LINING[grain()]));
  inside(0, 6);
  inside(16, 6);
  inside(14, 2);
  // page blocks: left at (0,10), right at (12,10) (5x8x1 boxes), the flipping page at (24,10) (5x8)
  const page = (x0: number, y0: number, w: number, h: number, lines: boolean) =>
    rect(t, x0, y0, w, h, (x, y) => {
      let c = PAPER[1 + (r.chance(0.3) ? (r.chance(0.5) ? 1 : -1) : 0)];
      if (lines && y % 2 === 1 && y < h - 1 && x > 0 && x < w - 1 && r.chance(0.72)) c = mixC(c, INK, 0.55);
      return c;
    });
  for (const x0 of [0, 12]) {
    page(x0 + 1, 10, 5, 1, false); // top edge
    page(x0 + 6, 10, 5, 1, false); // bottom edge
    rect(t, x0, 11, 1, 8, (_x, y) => (y % 2 ? PAPER[0] : PAPER[2])); // fore-edge
    rect(t, x0 + 6, 11, 1, 8, (_x, y) => (y % 2 ? PAPER[0] : PAPER[2]));
    page(x0 + 1, 11, 5, 8, true);
    page(x0 + 7, 11, 5, 8, true);
  }
  page(24, 10, 5, 8, true);
  page(29, 10, 5, 8, true);
  return t;
}
