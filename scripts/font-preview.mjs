// Render sample text with the procedural bitmap font to a PNG.
// usage: node scripts/font-preview.mjs [out.png] [scale=4]
// Draws white text with the vanilla 25% shadow on a button-gray strip, dark
// label text (#404040, no shadow) on the container-panel gray, and a glyph grid.
import { loadModules } from './load.mjs';
import { writePNG } from './png.mjs';

const out = process.argv[2] ?? 'tmp/font.png';
const scale = +(process.argv[3] ?? 4);
const { mods: [m], close } = await loadModules(['/src/textures/font.ts']);
const F = m.FONT;

const ascii = [];
for (let c = 32; c < 127; c++) ascii.push(String.fromCharCode(c));
const extras = Object.keys(F.glyphs).filter((k) => k.charCodeAt(0) >= 127);
const lines = [
  ['The quick brown fox jumps over the lazy dog', 'shadow'],
  ['THE QUICK BROWN FOX JUMPS OVER THE LAZY DOG', 'shadow'],
  ['Singleplayer   Multiplayer   Options...   Quit Game', 'shadow'],
  ['Minecraft 1.21   Copyright Mojang AB. Do not distribute!', 'shadow'],
  ['XYZ: 123.456 / 64.00000 / -78.9   Block: -235 64 120', 'shadow'],
  ['Facing: north (Towards negative Z) (179.9 / 12.3)', 'shadow'],
  ['Crafting   Inventory   Furnace   Large Chest', 'label'],
  [ascii.slice(0, 48).join(''), 'shadow'],
  [ascii.slice(48).join(''), 'shadow'],
  [extras.join(''), 'shadow'],
  ['Render Distance: 12 chunks   GUI Scale: Auto   FOV: 70', 'shadow'],
  ['jumping quickly, gypsy wizards [ok] {x} <y> ~ @home #1 $5 50% & *', 'shadow'],
];

function adv(ch) { const g = F.glyphs[ch] ?? F.glyphs['?']; return g[0].length + 1; }
const lineH = 12;
const W0 = Math.max(...lines.map(([s]) => [...s].reduce((a, c) => a + adv(c), 0))) + 8;
const H0 = lines.length * lineH + 4;
const W = W0 * scale, H = H0 * scale;
const img = new Uint8Array(W * H * 4);
function put(x, y, r, g, b) {
  for (let sy = 0; sy < scale; sy++) for (let sx = 0; sx < scale; sx++) {
    const px = x * scale + sx, py = y * scale + sy;
    if (px < 0 || py < 0 || px >= W || py >= H) continue;
    const i = (py * W + px) * 4; img[i] = r; img[i + 1] = g; img[i + 2] = b; img[i + 3] = 255;
  }
}
lines.forEach(([s, mode], li) => {
  const bg = mode === 'label' ? 0xc6 : 0x6f;
  for (let y = li * lineH; y < (li + 1) * lineH; y++) for (let x = 0; x < W0; x++) put(x, y, bg, bg, bg);
});
function drawText(s, x0, y0, col, shadow) {
  const pass = (dx, dy, c) => {
    let x = x0;
    for (const ch of s) {
      const g = F.glyphs[ch] ?? F.glyphs['?'];
      for (let y = 0; y < 8; y++) for (let gx = 0; gx < g[0].length; gx++) if (g[y][gx] === '#') put(x + gx + dx, y0 + y + dy, c[0], c[1], c[2]);
      x += g[0].length + 1;
    }
  };
  if (shadow) pass(1, 1, col.map((v) => (v & 0xfc) >> 2));
  pass(0, 0, col);
}
lines.forEach(([s, mode], li) => {
  if (mode === 'label') drawText(s, 4, li * lineH + 2, [0x40, 0x40, 0x40], false);
  else drawText(s, 4, li * lineH + 2, [255, 255, 255], true);
});
writePNG(out, W, H, img);
console.log('glyphs:', Object.keys(F.glyphs).length, 'extras:', extras.join(''));
await close();
