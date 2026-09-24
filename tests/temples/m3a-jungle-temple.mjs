// M3a: jungle temples — where they go (jungles and bamboo jungles, one per region, the lowest-Y rule over their
// 12 x 15 footprint), the height they're placed at, the piece in every orientation (the moss stone mix, the
// traps' hooks, string, dust, dispensers and vines, the lever puzzle, the chests), the loot, /locate, and in a
// ticking Level the two arrow traps going off and the lever puzzle opening the floor over the hidden chest.

import { load, check, blockName, pieceLevel, ticks, exitWithStatus } from './lib.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 300000).unref();

const { m, close } = await load(['/src/world/gen/jungleTemple.ts', '/src/entity/arrow.ts', '/src/game/redstone/dispenser.ts', '/src/game/redstone/dispenseItems.ts']);
const SEED = '12345';
const gen = new m.ChunkGenerator(SEED);
const T = gen.temples;
const HORIZONTAL = ['north', 'east', 'south', 'west'];
const STEP = { north: [0, -1], east: [1, 0], south: [0, 1], west: [-1, 0] };
const fixed = (i) => ({ nextInt: () => i });

// ---------------------------------------------------------------------------------------------------------------
// Placement

{
  const fake = (biome, height) => new m.Temples(987654321n, { firstFreeHeight: height, oceanFloorHeight: height, quartBiome: () => biome });
  const t = fake(m.B.jungle, () => 70);
  let all = true, inWindow = true;
  for (let rx = -4; rx < 4; rx++)
    for (let rz = -4; rz < 4; rz++) {
      const s = t.stub('jungle_pyramid', rx, rz);
      if (!s) all = false;
      else if (s.cx < rx * 32 || s.cx > rx * 32 + 23 || s.cz < rz * 32 || s.cz > rz * 32 + 23) inWindow = false;
    }
  check('placement: a temple in every region of an all-jungle world, each in its region\'s 24 x 24 window', all && inWindow);
  check('placement: bamboo jungles have them too', !!fake(m.B.bamboo_jungle, () => 70).stub('jungle_pyramid', 0, 0));
  check('placement: sparse jungles, plains and deserts don\'t', ['sparse_jungle', 'plains', 'desert'].every((b) => !fake(m.B[b], () => 70).stub('jungle_pyramid', 0, 0)));
  // its own salt: the regions' chunks aren't the pyramids' or the huts'
  const same = (k) => [0, 1, 2, 3].every((i) => t.potentialChunk('jungle_pyramid', i, i).join() === t.potentialChunk(k, i, i).join());
  check('placement: its own salt (14357619), apart from the desert pyramids\' and huts\'', !same('desert_pyramid') && !same('swamp_hut'));
  // getLowestY over the 12 x 15 footprint: the corners (x, z), (x, z + 15), (x + 12, z), (x + 12, z + 15)
  const [cx, cz] = t.potentialChunk('jungle_pyramid', 0, 0);
  const x0 = cx * 16, z0 = cz * 16;
  const oneCorner = (cx2, cz2) => (x, z) => (x === cx2 && z === cz2 ? 60 : 80);
  check('lowest-Y: ground at sea level everywhere is enough, one below is not', !!fake(m.B.jungle, () => 64).stub('jungle_pyramid', 0, 0) && !fake(m.B.jungle, () => 63).stub('jungle_pyramid', 0, 0));
  check('lowest-Y: a low corner at (x + 12, z + 15) rules it out', !fake(m.B.jungle, oneCorner(x0 + 12, z0 + 15)).stub('jungle_pyramid', 0, 0));
  check('lowest-Y: a low spot at (x + 15, z + 15) (past the footprint) doesn\'t', !!fake(m.B.jungle, oneCorner(x0 + 15, z0 + 15)).stub('jungle_pyramid', 0, 0));
  // the height: the average first free height under the whole of it (it fits in its start chunk), rounded down
  const bumpy = fake(m.B.jungle, (x, z) => 70 + ((x * 7 + z * 3) & 3));
  const s = bumpy.start('jungle_pyramid', 0, 0);
  const p = s.pieces[0];
  let sum = 0, n = 0;
  for (let z = p.box.minZ; z <= p.box.maxZ; z++) for (let x = p.box.minX; x <= p.box.maxX; x++) (sum += 70 + ((x * 7 + z * 3) & 3)), n++;
  check('height: its ground floor at the average ground height under it', p.box.minY === Math.trunc(sum / n) && p.box.maxY === p.box.minY + 9, `${p.box.minY} vs ${sum / n}`);
  check('height: 12 x 10 x 15, inside its start chunk', (p.box.xSpan === 12 && p.box.zSpan === 15) || (p.box.xSpan === 15 && p.box.zSpan === 12));
  check('height: inside its start chunk', p.box.minX >> 4 === s.cx && p.box.maxX >> 4 === s.cx && p.box.minZ >> 4 === s.cz && p.box.maxZ >> 4 === s.cz);
}

let nearest = null;
{
  let n = 0, ok = true, heightOk = true;
  for (let rx = -12; rx < 12; rx++)
    for (let rz = -12; rz < 12; rz++) {
      const s = T.stub('jungle_pyramid', rx, rz);
      if (!s) continue;
      n++;
      if (![m.B.jungle, m.B.bamboo_jungle].includes(gen.quartBiome(s.cx * 16 + 8, s.cz * 16 + 8))) ok = false;
      const x = s.cx * 16, z = s.cz * 16, h = (a, b) => gen.firstFreeHeight(a, b) - 1;
      if (Math.min(h(x, z), h(x, z + 15), h(x + 12, z), h(x + 12, z + 15)) < 63) heightOk = false;
    }
  nearest = T.nearest('jungle_pyramid', 0, 0);
  console.log(`     (seed ${SEED}, 24 x 24 regions: ${n} jungle temples; nearest to 0,0 at ${nearest})`);
  check('seed 12345: every temple stands in a jungle or bamboo jungle', ok && n > 0);
  check('seed 12345: every temple\'s corners are at sea level or above', heightOk);
}

// ---------------------------------------------------------------------------------------------------------------
// The piece in all four orientations, on flat ground

const layouts = [];
for (let i = 0; i < 4; i++) {
  const p = new m.JungleTemplePiece(5n, fixed(i), 1600 + i * 64, 3200);
  p.moveToY(70);
  const { world, level, ctxs } = pieceLevel(m, [p], { ground: 70, biome: m.B.jungle });
  layouts.push({ p, world, level });
  const d = HORIZONTAL[i];
  const at = (x, y, z) => world.getState(...p.worldPos(x, y, z));
  const name = (x, y, z) => blockName(m, at(x, y, z));
  const get = (x, y, z, prop) => m.blockOf(at(x, y, z)).get(at(x, y, z), prop);
  // the world direction of a local step, and the world side a local side is
  const dirOf = (lx0, lz0, lx1, lz1) => {
    const [ax, , az] = p.worldPos(lx0, 0, lz0), [bx, , bz] = p.worldPos(lx1, 0, lz1);
    return Object.keys(STEP).find((k) => STEP[k][0] === bx - ax && STEP[k][1] === bz - az);
  };
  const LOCAL = { north: [0, 1], south: [0, -1], east: [1, 0], west: [-1, 0] };
  const side = (s) => dirOf(0, 0, LOCAL[s][0], LOCAL[s][1]);
  check(`temple (${d}): facing ${d}`, p.orientation === d);

  // the moss stone: every block of the foundation cobblestone or mossy cobblestone, about 40% cobblestone
  let cobble = 0, mossy = 0, other = 0;
  for (let x = 0; x < 12; x++) for (let z = 0; z < 15; z++) for (let y = -4; y <= -4; y++) {
    const nm = name(x, y, z);
    if (nm === 'cobblestone') cobble++;
    else if (nm === 'mossy_cobblestone') mossy++;
    else other++;
  }
  let all = 0, allCobble = 0;
  for (let x = 0; x < 12; x++) for (let z = 0; z < 15; z++) for (let y = -4; y <= 9; y++) {
    const nm = name(x, y, z);
    if (nm === 'cobblestone') (allCobble++, all++);
    else if (nm === 'mossy_cobblestone') all++;
  }
  check(`temple (${d}): the foundation's bottom all cobblestone and mossy cobblestone`, other === 0 && cobble > 0 && mossy > 0);
  check(`temple (${d}): about 40% of its stone cobblestone, the rest mossy`, allCobble / all > 0.34 && allCobble / all < 0.46, (allCobble / all).toFixed(3));

  // the roof's stairs, the entrance steps and the stairway down
  check(`temple (${d}): four cobblestone stairs up to the entrance, facing out`, [4, 5, 6, 7].every((x) => name(x, 0, 0) === 'cobblestone_stairs' && get(x, 0, 0, 'facing') === side('north')));
  check(`temple (${d}): the stairway down, four steps, air over it`, [0, 1, 2, 3].every((k) => name(5, -k, 6 + k) === 'cobblestone_stairs' && get(6, -k, 6 + k, 'facing') === side('south') && name(5, -k, 7 + k) === 'air'));

  // trap 1: hooks facing each other across the passage with attached string between, dust down to the dispenser
  check(`trap 1 (${d}): the hooks face along the string, attached`, get(1, -3, 8, 'facing') === dirOf(1, 8, 2, 8) && get(4, -3, 8, 'facing') === dirOf(4, 8, 3, 8) && get(1, -3, 8, 'attached') === true);
  check(`trap 1 (${d}): the string strung along it, attached`, [2, 3].every((x) => name(x, -3, 8) === 'tripwire' && get(x, -3, 8, side('east')) === true && get(x, -3, 8, side('west')) === true && get(x, -3, 8, side('north')) === false && get(x, -3, 8, 'attached') === true));
  check(`trap 1 (${d}): dust from the hook's block to the mossy cobblestone under the dispenser`, [7, 6, 5, 4, 3, 2].every((z) => name(5, -3, z) === 'redstone_wire' && get(5, -3, z, side('north')) === 'side') && get(5, -3, 1, side('west')) === 'side' && get(4, -3, 1, side('east')) === 'side' && name(3, -3, 1) === 'mossy_cobblestone');
  check(`trap 1 (${d}): the dispenser faces up the passage, behind a vine hung on it`, name(3, -2, 1) === 'dispenser' && get(3, -2, 1, 'facing') === side('north') && name(3, -2, 2) === 'vine' && get(3, -2, 2, side('south')) === true);
  // trap 2
  check(`trap 2 (${d}): hooks and string across the room`, get(7, -3, 1, 'facing') === side('north') && get(7, -3, 5, 'facing') === side('south') && [2, 3, 4].every((z) => get(7, -3, z, side('north')) === true && get(7, -3, z, side('south')) === true));
  check(`trap 2 (${d}): dust round and up the mossy cobblestone to the dispenser`, get(8, -3, 6, side('east')) === 'side' && get(9, -3, 6, side('south')) === 'side' && get(9, -3, 5, side('south')) === 'up' && name(9, -3, 4) === 'mossy_cobblestone' && name(9, -2, 4) === 'redstone_wire');
  check(`trap 2 (${d}): the dispenser faces across the room, vines hung on it and above`, get(9, -2, 3, 'facing') === side('west') && get(8, -2, 3, side('east')) === true && get(8, -1, 3, side('east')) === true);
  // the puzzle
  const levers = [8, 9, 10].every((x) => name(x, -2, 12) === 'lever' && get(x, -2, 12, 'face') === 'wall' && get(x, -2, 12, 'facing') === side('north') && name(x, -2, 11) === 'chiseled_stone_bricks');
  check(`puzzle (${d}): three levers on chiseled stone bricks, facing the passage`, levers);
  check(`puzzle (${d}): sticky pistons up at (9, -2, 8), and toward it at (10, -2, 8) and (10, -1, 8)`, name(9, -2, 8) === 'sticky_piston' && get(9, -2, 8, 'facing') === 'up' && get(10, -2, 8, 'facing') === side('west') && get(10, -1, 8, 'facing') === side('west'));
  check(`puzzle (${d}): a repeater from the left lever's bricks, dust from the right lever's`, name(10, -2, 10) === 'repeater' && get(10, -2, 10, 'facing') === side('north') && get(8, -2, 9, side('north')) === 'side' && name(10, -1, 9) === 'redstone_wire');
  // chests and dispensers with their loot tables
  const bes = ctxs.flatMap((c) => c.blockEntities);
  const beAt = (x, y, z) => {
    const [wx, wy, wz] = p.worldPos(x, y, z);
    return bes.find((b) => b.x === wx && b.y === wy && b.z === wz);
  };
  check(`temple (${d}): two chests with chests/jungle_temple, by the second trap and in the puzzle`, bes.filter((b) => b.id === 'chest').length === 2 && beAt(8, -3, 3)?.data.lootTable === 'chests/jungle_temple' && beAt(9, -3, 10)?.data.lootTable === 'chests/jungle_temple');
  check(`temple (${d}): two dispensers with chests/jungle_temple_dispenser`, bes.filter((b) => b.id === 'dispenser').length === 2 && beAt(3, -2, 1)?.data.lootTable === 'chests/jungle_temple_dispenser' && beAt(9, -2, 3)?.data.lootTable === 'chests/jungle_temple_dispenser');
  check(`temple (${d}): the loaded block entities are a chest and a dispenser that roll their loot`, world.getBlockEntity(...p.worldPos(9, -2, 3)) instanceof m.DispenserBlockEntity && world.getBlockEntity(...p.worldPos(9, -3, 10))?.lootTable === 'chests/jungle_temple');
}

// ---------------------------------------------------------------------------------------------------------------
// The traps and the puzzle at work (a ticking Level)

function flip(level, p, x, y, z) {
  const [wx, wy, wz] = p.worldPos(x, y, z);
  const st = level.getState(wx, wy, wz);
  m.behaviorOf(st).use(level, wx, wy, wz, st, { player: { gameMode: 'survival' }, face: 1, hx: wx + 0.5, hy: wy + 0.5, hz: wz + 0.5 });
}
const arrows = (level) => level.entities.filter((e) => !e.removed && e instanceof m.Arrow);

for (const { p, level } of layouts) {
  const d = p.orientation;
  const at = (x, y, z) => level.getState(...p.worldPos(x, y, z));
  const name = (x, y, z) => blockName(m, at(x, y, z));
  // a zombie walks into the first trap's string
  const [zx, zy, zz] = p.worldPos(2, -3, 8);
  const z1 = new m.Zombie(level);
  z1.moveTo(zx + 0.5, zy, zz + 0.5, 0, 0);
  level.addEntity(z1);
  ticks(level, 2);
  z1.remove();
  const hook = m.blockOf(at(1, -3, 8)).get(at(1, -3, 8), 'powered');
  ticks(level, 8);
  const a1 = arrows(level);
  const [dx0, , dz0] = p.worldPos(3, -2, 1), [dx1, , dz1] = p.worldPos(3, -2, 2);
  // (flying that way, give or take the dispenser's spread)
  const along = (a, sx, sz) => a.dx * sx + a.dz * sz > 0.9 * Math.hypot(a.dx, a.dz);
  check(`trap 1 (${d}): stepping in the string powers the hooks and the dispenser shoots an arrow up the passage`, hook === true && a1.length === 1 && along(a1[0], dx1 - dx0, dz1 - dz0), `${hook} ${a1.length} ${a1[0]?.dx},${a1[0]?.dz}`);
  for (const a of a1) a.remove();
  // the second trap
  const [tx, ty, tz] = p.worldPos(7, -3, 3);
  const z2 = new m.Zombie(level);
  z2.moveTo(tx + 0.5, ty, tz + 0.5, 0, 0);
  level.addEntity(z2);
  ticks(level, 2);
  z2.remove();
  ticks(level, 8);
  const a2 = arrows(level);
  const [ex0, , ez0] = p.worldPos(9, -2, 3), [ex1, , ez1] = p.worldPos(8, -2, 3);
  check(`trap 2 (${d}): stepping in its string, the other dispenser shoots across the room`, a2.length === 1 && along(a2[0], ex1 - ex0, ez1 - ez0), `${a2.length} ${a2[0]?.dx},${a2[0]?.dz}`);
  for (const a of a2) a.remove();
  const disp = level.world.getBlockEntity(...p.worldPos(3, -2, 1));
  const left = disp.container.items.filter(Boolean).reduce((a, s) => a + s.count, 0);
  check(`trap (${d}): the dispenser's arrows came from its loot (2-7 a stack, one or two stacks, one used)`, disp.lootTable === null && left >= 1 && left <= 13, `${left}`);

  // the puzzle: the lever furthest from the stairs, the nearest, the nearest back, the furthest back
  const floor = at(8, 0, 8);
  const FAR = 10, NEAR = 8;
  flip(level, p, FAR, -2, 12);
  ticks(level, 10);
  const pushed = name(8, -2, 8) === 'sticky_piston' && name(9, -2, 8) === 'piston_head';
  flip(level, p, NEAR, -2, 12);
  ticks(level, 10);
  const up = m.blockOf(at(8, -2, 8)).get(at(8, -2, 8), 'extended') === true && name(8, -1, 8) === 'piston_head';
  flip(level, p, NEAR, -2, 12);
  ticks(level, 10);
  const pulled = name(8, 0, 8) === 'air' && at(8, -1, 8) === floor;
  flip(level, p, FAR, -2, 12);
  ticks(level, 10);
  check(`puzzle (${d}): the far lever pushes the upward piston over under the dust`, pushed);
  check(`puzzle (${d}): the near lever powers it through the dust, and it pushes up`, up);
  check(`puzzle (${d}): the near lever back, it pulls the ground floor's block down`, pulled);
  const open = name(8, 0, 8) === 'air' && name(8, -1, 8) === 'air' && name(8, -2, 8) === 'air' && name(8, -3, 8) !== 'air' && name(8, 1, 8) === 'air';
  check(`puzzle (${d}): the far lever back, the pistons draw back and the way down from the ground floor is open`, open && name(9, -2, 8) === 'sticky_piston' && at(9, -1, 8) === floor);
  check(`puzzle (${d}): the hidden chest is there at the bottom of it`, name(9, -3, 10) === 'chest' && name(9, -3, 9) === 'air' && name(9, -2, 9) === 'air');
}

{
  // the wrong order: nearest first, then the far one on and off, then the near one off — the floor's block only
  // drops a block, and the way down stays shut
  const p = new m.JungleTemplePiece(5n, fixed(0), 1600, 3200);
  p.moveToY(70);
  const { level } = pieceLevel(m, [p], { ground: 70, biome: m.B.jungle });
  const name = (x, y, z) => blockName(m, level.getState(...p.worldPos(x, y, z)));
  for (const x of [8, 10, 10, 8]) {
    flip(level, p, x, -2, 12);
    ticks(level, 10);
  }
  check('puzzle: the wrong order (near, far, far, near) leaves a hole a block deep with the block under it', name(8, 0, 8) === 'air' && name(8, -1, 8) !== 'air' && name(8, -2, 8) === 'sticky_piston');
  // the middle lever works nothing
  const before = [];
  for (let y = -3; y <= 0; y++) for (let x = 8; x <= 10; x++) for (let z = 8; z <= 10; z++) before.push(name(x, y, z));
  flip(level, p, 9, -2, 12);
  ticks(level, 10);
  const after = [];
  for (let y = -3; y <= 0; y++) for (let x = 8; x <= 10; x++) for (let z = 8; z <= 10; z++) after.push(name(x, y, z));
  check('puzzle: the middle lever works nothing', before.join() === after.join());
}

// ---------------------------------------------------------------------------------------------------------------
// Loot

{
  const r = new m.Rand(42, 1);
  let stacks = 0, rolls = 0, books = 0, plainBooks = 0, arrowsOk = true, arrowStacks = [0, 0, 0];
  const seen = new Set();
  for (let i = 0; i < 400; i++) {
    const items = m.rollLoot('chests/jungle_temple', r);
    stacks += items.length;
    rolls++;
    for (const s of items) {
      seen.add(s.item.id);
      if (s.item.id === 'enchanted_book') books += Object.keys(s.tag?.stored ?? {}).length > 0 ? 1 : 0;
      if (s.item.id === 'book') plainBooks++;
    }
    const a = m.rollLoot('chests/jungle_temple_dispenser', r);
    arrowStacks[a.length]++;
    if (!a.every((s) => s.item.id === 'arrow' && s.count >= 2 && s.count <= 7)) arrowsOk = false;
  }
  check('loot: jungle temple chests hold its things (bones, rotten flesh, gold, iron, diamonds)', ['bone', 'rotten_flesh', 'gold_ingot', 'iron_ingot', 'diamond', 'emerald', 'saddle'].every((x) => seen.has(x)), [...seen].join());
  check('loot: its book comes enchanted (enchant_with_levels 30)', books > 0 && plainBooks === 0);
  check('loot: 2-6 rolls a chest (bamboo, which the game hasn\'t yet, rolls nothing)', stacks / rolls > 2.5 && stacks / rolls < 4.5, (stacks / rolls).toFixed(2));
  check('loot: a trap dispenser gets one or two stacks of 2-7 arrows', arrowsOk && arrowStacks[0] === 0 && arrowStacks[1] > 100 && arrowStacks[2] > 100, arrowStacks.join());
}

// ---------------------------------------------------------------------------------------------------------------
// /locate

{
  const chat = [];
  const game = (x, z, dim = m.OVERWORLD) => ({ meta: { allowCommands: true }, chat: (s) => chat.push(s), world: { dim }, player: { x, z }, level: { seed: SEED } });
  m.executeCommand(game(0, 0), 'locate structure minecraft:jungle_pyramid');
  m.executeCommand(game(0, 0), 'locate structure jungle_pyramid');
  check('/locate jungle_pyramid', chat[0]?.includes(`[${nearest[0]}, ~, ${nearest[1]}]`) && chat[1] === chat[0], chat[0]);
}

// ---------------------------------------------------------------------------------------------------------------
// The real temple nearest 0,0 for seed 12345, generated as the chunk workers do

{
  const cx = nearest[0] >> 4, cz = nearest[1] >> 4;
  const outs = [];
  for (let x = cx - 1; x <= cx + 1; x++) for (let z = cz - 1; z <= cz + 1; z++) outs.push(gen.generate(x, z));
  const bes = outs.flatMap((o) => o.blockEntities);
  const start = T.startsNear('jungle_pyramid', cx, cz)[0];
  const p = start.pieces[0];
  // (the cellar is under the piece's box, as in vanilla: the box is the part above ground)
  const inBox = (b) => p.box.isInside(b.x, Math.min(b.y + 4, p.box.maxY), b.z);
  check('real temple: its two chests and two dispensers', bes.filter((b) => inBox(b) && b.id === 'chest').length === 2 && bes.filter((b) => inBox(b) && b.id === 'dispenser').length === 2);
  console.log(`     (the real temple: ${p.orientation}, ground floor at y ${p.box.minY}, box ${p.box.minX},${p.box.minZ} to ${p.box.maxX},${p.box.maxZ})`);
}

await exitWithStatus(close);
