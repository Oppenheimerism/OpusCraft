// Diamonds and the badlands' gold.
//
// A chunk has four kinds of diamond vein in vanilla: small ones (7 tries of 4), buried ones (4 tries of 8, none of it
// touching air), a rare large one, and from 1.20 two more tries of 8 between y -64 and -4 (ore_diamond_medium). That
// last was missing, and with it some two fifths of the diamonds. The badlands have gold of their own up in the hills,
// 50 tries of 9 a chunk between y 32 and 256 (ore_gold_extra), where no other biome has any.

import { load, check, exitWithStatus } from '../fixes/lib.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 600000).unref();

const { m, close } = await load(['/src/world/gen/generator.ts', '/src/world/constants.ts', '/src/world/gen/biomes.ts']);
const g = new m.ChunkGenerator('test');
/** how many blocks named ...`suffix` a chunk has from y0 up to (not including) y1 */
function count(o, suffix, y0, y1) {
  let n = 0;
  for (let y = y0; y < y1; y++) for (let lz = 0; lz < 16; lz++) for (let lx = 0; lx < 16; lx++) if (m.blockOf(o.blocks[m.colIndex(lx, y, lz)]).name.endsWith(suffix)) n++;
  return n;
}

// --- diamonds: 36 chunks about the origin
let diamonds = 0, mid = 0, high = 0, goldHigh = 0, chunks = 0;
for (let cx = -3; cx < 3; cx++) for (let cz = -3; cz < 3; cz++) {
  const o = g.generate(cx, cz);
  chunks++;
  diamonds += count(o, 'diamond_ore', m.MIN_Y, 32);
  mid += count(o, 'diamond_ore', -40, -8);
  high += count(o, 'diamond_ore', 17, 64);
  goldHigh += count(o, 'gold_ore', 40, 256);
}
// (14 a chunk without the medium veins, 23 with them, on this seed)
check('some twenty diamond ore a chunk', diamonds / chunks > 19 && diamonds / chunks < 30, (diamonds / chunks).toFixed(2));
// (the medium veins are spread evenly from the bottom to y -4: the others thin out fast on the way up)
check('...a good part of it between y -40 and -8', mid / chunks > 8, (mid / chunks).toFixed(2));
check('...and none above y 16', high === 0, String(high));
check('away from the badlands there is no gold above y 40', goldHigh === 0, String(goldHigh));

// --- the badlands' gold (five badlands chunks of this seed)
const bad = new Set([m.B.badlands, m.B.eroded_badlands, m.B.wooded_badlands]);
let found = 0, gold = 0, top = -Infinity;
for (const [cx, cz] of [[24, 232], [40, 232], [16, 240], [24, 240], [40, 240]]) {
  const o = g.generate(cx, cz);
  if (!bad.has(o.biomes[8 * 16 + 8])) continue;
  found++;
  gold += count(o, 'gold_ore', 40, 256);
  for (let y = 255; y > top; y--) if (count(o, 'gold_ore', y, y + 1)) top = y;
}
check('(the chunks looked at are badlands)', found === 5, String(found));
check('badlands hills hold gold above y 40, tens of ore a chunk', gold / Math.max(found, 1) > 12, (gold / Math.max(found, 1)).toFixed(1));
check('...well up the hills', top > 70, String(top));

await exitWithStatus(close);
