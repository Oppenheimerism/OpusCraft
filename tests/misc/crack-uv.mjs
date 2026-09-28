// The cracks on a block being broken (node tests/misc/crack-uv.mjs): the crack texture is laid over each face of the
// block's model in the block's own grid (vanilla SheetedDecalTextureGenerator), a whole face from one side of the
// texture to the other. Before, every corner of a face was given the same spot of the texture, a see-through one at its
// edge, so no crack was ever drawn, the player's own or anyone else's.

import { loadModules } from '../../scripts/load.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 120000).unref();
const { mods, close } = await loadModules(['/src/render/overlay.ts']);
const [overlay] = mods;
let fails = 0;
const check = (name, cond, extra = '') => { if (!cond) fails++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };

// a box's face as a model quad: its four corners (vanilla FaceInfo's order), the face's direction
const FACES = [
  [[0, 0, 1], [0, 0, 0], [1, 0, 0], [1, 0, 1]], // down
  [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]], // up
  [[1, 1, 0], [1, 0, 0], [0, 0, 0], [0, 1, 0]], // north
  [[0, 1, 1], [0, 0, 1], [1, 0, 1], [1, 1, 1]], // south
  [[0, 1, 0], [0, 0, 0], [0, 0, 1], [0, 1, 1]], // west
  [[1, 1, 1], [1, 0, 1], [1, 0, 0], [1, 1, 0]], // east
];
const quad = (dir, from = [0, 0, 0], to = [1, 1, 1]) => ({
  dir,
  pos: FACES[dir].flatMap((c) => c.map((s, a) => (s ? to[a] : from[a]))),
});
const corners = (uv) => [0, 1, 2, 3].map((k) => [uv[k * 2], uv[k * 2 + 1]]);
const near = (a, b) => Math.abs(a - b) < 1e-6;

for (let dir = 0; dir < 6; dir++) {
  const c = corners(overlay.decalUV(quad(dir)));
  const us = c.map((p) => p[0]), vs = c.map((p) => p[1]);
  const spans = near(Math.min(...us), 0) && near(Math.max(...us), 0.999) && near(Math.min(...vs), 0) && near(Math.max(...vs), 0.999);
  const distinct = new Set(c.map((p) => p.join())).size === 4;
  check(`a whole block's ${['down', 'up', 'north', 'south', 'west', 'east'][dir]} face: the crack from edge to edge, its four corners apart`, spans && distinct, JSON.stringify(c));
}

// a bottom slab's side: the bottom half of the texture's rows, as the block's own grid has it
{
  const c = corners(overlay.decalUV(quad(2, [0, 0, 0], [1, 0.5, 1])));
  const vs = c.map((p) => p[1]);
  check("a slab's side: the crack's lower half (v from 0.5 down to the bottom)", near(Math.min(...vs), 0.5) && near(Math.max(...vs), 0.999), JSON.stringify(c));
}
// a small part inside the block (a torch's side): its own part of the texture
{
  const c = corners(overlay.decalUV(quad(4, [0.4375, 0, 0.4375], [0.5625, 0.625, 0.5625])));
  const us = c.map((p) => p[0]);
  check("a torch's side: its own narrow strip of the crack", near(Math.min(...us), 0.4375) && near(Math.max(...us), 0.5625), JSON.stringify(c));
}
// a part reaching past its block (a tall model's upper half): measured from the whole block it starts in
{
  const c = corners(overlay.decalUV(quad(1, [1, 0, 1], [1.5, 1, 1.5])));
  const us = c.map((p) => p[0]);
  check('a quad past its block: from the whole block it starts in', near(Math.min(...us), 0) && near(Math.max(...us), 0.5), JSON.stringify(c));
}
// never outside the stage's tile
{
  const all = [];
  for (let dir = 0; dir < 6; dir++) all.push(...overlay.decalUV(quad(dir, [-0.2, -0.2, -0.2], [1.3, 1.3, 1.3])));
  check('never outside the stage (0 to 0.999)', all.every((v) => v >= 0 && v <= 0.999));
}

await close();
console.log(fails ? `${fails} failed` : 'all passed');
process.exit(fails ? 1 : 0);
