// Render a contact sheet of a texture registry to PNG.
// usage: node scripts/preview-textures.mjs <module> <exportName> <out.png> [scale=6] [filterRegex] [tile=1]
//   e.g. node scripts/preview-textures.mjs /src/textures/blocks.ts BLOCK_TEXTURES tmp/blocks.png 6 "ore|stone" 1
// Registry values are () => TexImage | AnimTex ({w,h,data} or {w,h,frames}).
// tile=3 shows each texture tiled 3x3 (to check seams). Labels are not drawn; names are printed to stdout in order.
import { loadModules } from './load.mjs';
import { writePNG } from './png.mjs';
const [mod, exp, out, scaleArg, filterArg, tileArg] = process.argv.slice(2);
const scale = +(scaleArg ?? 6), tile = +(tileArg ?? 1);
const { mods: [m], close } = await loadModules([mod]);
let reg = m[exp];
if (typeof reg === 'function') reg = reg();
const re = filterArg ? new RegExp(filterArg) : null;
const items = [];
for (const [name, gen] of Object.entries(reg)) {
  if (re && !re.test(name)) continue;
  let t = typeof gen === 'function' ? gen() : gen;
  if (t.frames) t = { w: t.w, h: t.h, data: t.frames[0] };
  items.push([name, t]);
}
const cellW = Math.max(...items.map(([, t]) => t.w)) * tile * scale + 8;
const cellH = Math.max(...items.map(([, t]) => t.h)) * tile * scale + 8;
const cols = Math.max(1, Math.min(items.length, Math.floor(2400 / cellW)));
const rows = Math.ceil(items.length / cols);
const W = cols * cellW, H = rows * cellH;
const img = new Uint8Array(W * H * 4);
// checkerboard background to show transparency
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4; const c = ((x >> 3) + (y >> 3)) & 1 ? 70 : 90; img[i] = c; img[i + 1] = c; img[i + 2] = c; img[i + 3] = 255; }
items.forEach(([name, t], k) => {
  const ox = (k % cols) * cellW + 4, oy = Math.floor(k / cols) * cellH + 4;
  for (let ty = 0; ty < tile; ty++) for (let tx = 0; tx < tile; tx++)
    for (let y = 0; y < t.h; y++) for (let x = 0; x < t.w; x++) {
      const si = (y * t.w + x) * 4; const a = t.data[si + 3] / 255;
      for (let sy = 0; sy < scale; sy++) for (let sx = 0; sx < scale; sx++) {
        const px = ox + (tx * t.w + x) * scale + sx, py = oy + (ty * t.h + y) * scale + sy;
        const di = (py * W + px) * 4;
        for (let c = 0; c < 3; c++) img[di + c] = t.data[si + c] * a + img[di + c] * (1 - a);
      }
    }
});
writePNG(out, W, H, img);
console.log(items.map(([n], i) => `${i}:${n}`).join('  '));
await close();
