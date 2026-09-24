// M3b: igloos — where they go (snowy plains, taigas and slopes, one per region), how they're laid out (a random turn
// about the ladder's column, a basement half the time 4-11 shaft segments down, every piece moved to the ground at
// the doorstep), the three templates in every turn (the dome sealed, the trapdoor under the third carpet or a snow
// block where there's no basement, the ladder all the way down, the basement's brewing stand, cauldron, chest,
// carpets, torches, iron bars and cells), the villager and zombie villager, curing one with what the igloo holds,
// the loot, /locate, and the real igloo nearest 0,0 for seed 12345.

import { load, check, blockName, pieceLevel, ticks, exitWithStatus } from './lib.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 300000).unref();

const { m, close } = await load([
  '/src/world/gen/igloo.ts', '/src/world/gen/jigsaw.ts', '/src/entity/villager.ts', '/src/entity/zombieVillager.ts', '/src/entity/player.ts',
  '/src/entity/thrownPotion.ts', '/src/item/potions.ts',
]);
const SEED = '12345';
const gen = new m.ChunkGenerator(SEED);
const T = gen.temples;
const STEP = { north: [0, -1], east: [1, 0], south: [0, 1], west: [-1, 0] };
const TURNED = ['north', 'east', 'south', 'west'];
/** what the template's north is after `rot` clockwise quarter turns, and so on round */
const turned = (d, rot) => TURNED[(TURNED.indexOf(d) + rot) & 3];
/** a random that turns it `rot` times, and gives it a basement `depth` segments down (or none) */
const fixed = (rot, depth) => ({ nextInt: (n) => (n === 4 ? rot : depth - 4), nextDouble: () => (depth ? 0.25 : 0.75) });
const pieceOf = (pieces, part) => pieces.find((p) => p.part === part);

// ---------------------------------------------------------------------------------------------------------------
// Placement

{
  const fake = (biome, height = () => 70) => new m.Temples(987654321n, { firstFreeHeight: height, oceanFloorHeight: height, quartBiome: () => biome });
  const t = fake(m.B.snowy_plains);
  let all = true, inWindow = true, basements = 0, n = 0;
  const depths = new Set(), rots = [0, 0, 0, 0];
  for (let rx = -8; rx < 8; rx++)
    for (let rz = -8; rz < 8; rz++) {
      const s = t.stub('igloo', rx, rz);
      if (!s) {
        all = false;
        continue;
      }
      if (s.cx < rx * 32 || s.cx > rx * 32 + 23 || s.cz < rz * 32 || s.cz > rz * 32 + 23) inWindow = false;
      const st = t.start('igloo', rx, rz);
      n++;
      rots[st.pieces[0].turns]++;
      if (st.pieces.length > 1) {
        basements++;
        depths.add(st.pieces.filter((p) => p.part === 'middle').length + 1);
      }
    }
  check('placement: an igloo in every region of an all-snowy-plains world, each in its region\'s 24 x 24 window', all && inWindow);
  check('placement: snowy taigas and snowy slopes have them too', !!fake(m.B.snowy_taiga).stub('igloo', 0, 0) && !!fake(m.B.snowy_slopes).stub('igloo', 0, 0));
  check('placement: plains, taigas, frozen peaks and ice spikes don\'t', ['plains', 'taiga', 'frozen_peaks', 'ice_spikes'].every((b) => !fake(m.B[b]).stub('igloo', 0, 0)));
  check('placement: no lowest-ground rule (an igloo on ground under sea level)', !!fake(m.B.snowy_plains, () => 40).stub('igloo', 0, 0));
  const same = (k) => [0, 1, 2, 3].every((i) => t.potentialChunk('igloo', i, i).join() === t.potentialChunk(k, i, i).join());
  check('placement: its own salt (14357618)', !same('desert_pyramid') && !same('jungle_pyramid') && !same('swamp_hut'));
  console.log(`     (${n} igloos: ${basements} with basements; turns ${rots.join('/')}; shaft segments seen ${[...depths].sort((a, b) => a - b).join(',')})`);
  check('layout: about half with a basement', basements / n > 0.4 && basements / n < 0.6, `${basements}/${n}`);
  check('layout: every one of the four turns', rots.every((c) => c > n / 8));
  check('layout: basements 4 to 11 shaft segments down, all of them seen', depths.size === 8 && Math.min(...depths) === 4 && Math.max(...depths) === 11);
}

{
  // the pieces: the basement first, then the shaft top-down, then the dome; stacked without a gap; the ladder's column
  // the same in every piece whichever way it's turned
  let order = true, stacked = true, column = true, ground = true;
  for (let rot = 0; rot < 4; rot++) {
    // the ground: 70 everywhere but 75 at the doorstep, which is where the height is taken
    const pieces0 = m.iglooPieces(fixed(rot, 7), 1600, 3200, () => 70);
    const top0 = pieceOf(pieces0, 'top');
    const [dx, , dz] = top0.pos(3, 0, 0);
    const pieces = m.iglooPieces(fixed(rot, 7), 1600, 3200, (x, z) => (x === dx && z === dz ? 75 : 70));
    const parts = pieces.map((p) => p.part).join();
    if (parts !== ['bottom', ...Array(6).fill('middle'), 'top'].join()) order = false;
    const top = pieceOf(pieces, 'top'), bottom = pieceOf(pieces, 'bottom');
    if (top.y !== 74) ground = false;
    const middles = pieces.filter((p) => p.part === 'middle');
    let y = top.y - 1;
    for (const p of middles) {
      if (p.y + 2 !== y) stacked = false;
      y = p.y - 1;
    }
    if (bottom.y + 5 !== y) stacked = false;
    const [cx, , cz] = top.pos(3, 0, 5);
    for (const p of middles) {
      const [x, , z] = p.pos(1, 0, 1);
      if (x !== cx || z !== cz) column = false;
    }
    const [bx, , bz] = bottom.pos(3, 0, 7);
    if (bx !== cx || bz !== cz) column = false;
  }
  check('layout: the basement first, then the shaft\'s segments from the top down, then the dome (vanilla\'s order)', order);
  check('layout: the dome\'s floor is the top block of the ground at its doorstep, turned whichever way', ground);
  check('layout: the segments stacked under the dome\'s floor down to the basement\'s top, without a gap', stacked);
  check('layout: the trapdoor, the shaft and the basement\'s ladder in one column, turned whichever way', column);
}

// ---------------------------------------------------------------------------------------------------------------
// The templates in all four turns, on flat snowy ground (dirt below y 70)

const G = 70;
const iglooLevels = [];
for (let rot = 0; rot < 4; rot++) {
  const pieces = m.iglooPieces(fixed(rot, 4 + rot * 2), 1600 + rot * 64, 3200, () => G);
  const built = pieceLevel(m, pieces, { ground: G, under: 'dirt', biome: m.B.snowy_plains });
  const { world, ctxs } = built;
  iglooLevels.push({ rot, pieces, ...built });
  const d = TURNED[rot];
  const top = pieceOf(pieces, 'top'), bottom = pieceOf(pieces, 'bottom');
  const at = (p, x, y, z) => world.getState(...p.pos(x, y, z));
  const name = (p, x, y, z) => blockName(m, at(p, x, y, z));
  const get = (p, x, y, z, prop) => m.blockOf(at(p, x, y, z)).get(at(p, x, y, z), prop);
  const tag = `(turned ${rot}, ${d})`;

  // every block of every template where it should be, turned (the trapdoor's and the marker's places aside)
  let placed = 0, wrong = 0;
  for (const p of pieces) {
    const b = p.template.blocks;
    for (let i = 0; i < b.length; i += 4) {
      const st = world.getState(...p.pos(b[i], b[i + 1], b[i + 2]));
      if (st === m.rotateState(b[i + 3], rot)) placed++;
      else wrong++;
    }
  }
  check(`igloo ${tag}: all ${placed} blocks of its templates placed and turned, across the chunks it spans`, wrong === 0, `${wrong} wrong`);
  check(`dome ${tag}: its floor replaces the ground's top block`, top.y === G - 1 && name(top, 3, 0, 0) === 'snow_block');
  check(`dome ${tag}: the doorway and the tunnel in front of it clear, the third carpet in over the trapdoor`,
    name(top, 3, 1, 1) === 'air' && name(top, 3, 1, 2) === 'air' && name(top, 3, 2, 2) === 'air' && [3, 4, 5].every((z) => name(top, 3, 1, z) === 'white_carpet') && name(top, 3, 0, 5) === 'oak_trapdoor');
  // the bed: the head a step on from the foot, the way it faces
  const [fx, , fz] = top.pos(1, 1, 5), [hx, , hz] = top.pos(1, 1, 6);
  const bedFacing = get(top, 1, 1, 5, 'facing');
  check(`dome ${tag}: a red bed, its head beyond its foot the way it faces`, name(top, 1, 1, 5) === 'red_bed' && get(top, 1, 1, 5, 'part') === 'foot' && get(top, 1, 1, 6, 'part') === 'head' && STEP[bedFacing][0] === hx - fx && STEP[bedFacing][1] === hz - fz && get(top, 1, 1, 6, 'facing') === bedFacing);
  check(`dome ${tag}: a crafting table, a furnace with its block entity, two ice windows`, name(top, 5, 1, 5) === 'crafting_table' && name(top, 5, 1, 6) === 'furnace' && world.getBlockEntity(...top.pos(5, 1, 6))?.id === 'furnace' && name(top, 0, 2, 4) === 'ice' && name(top, 6, 2, 4) === 'ice');
  const tf = get(top, 3, 2, 6, 'facing');
  const [tx, ty, tz] = top.pos(3, 2, 6);
  check(`dome ${tag}: a redstone torch on the back wall`, name(top, 3, 2, 6) === 'redstone_wall_torch' && tf === turned('north', rot) && blockName(m, world.getState(tx - STEP[tf][0], ty, tz - STEP[tf][1])) === 'snow_block');
  // sealed: from inside, with the doorway shut, the air reaches nowhere outside the dome
  {
    const [x0, y0, z0] = top.pos(3, 2, 4);
    const shut = new Set([top.pos(3, 1, 2).join(), top.pos(3, 2, 2).join()]);
    const seen = new Set([[x0, y0, z0].join()]);
    const queue = [[x0, y0, z0]];
    let leak = false;
    while (queue.length && !leak) {
      const [x, y, z] = queue.pop();
      for (const [ax, ay, az] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
        const k = [x + ax, y + ay, z + az];
        const key = k.join();
        if (seen.has(key) || shut.has(key) || world.getState(...k) !== 0) continue;
        if (!top.box.isInside(...k)) leak = true;
        seen.add(key);
        queue.push(k);
      }
    }
    check(`dome ${tag}: sealed but for its doorway`, !leak && seen.size > 20, `${seen.size}`);
  }
  // the shaft
  const depth = 4 + rot * 2;
  const [lx, ly, lz] = top.pos(3, 0, 5);
  const lf = turned('north', rot);
  let ladders = 0, held = true;
  for (let y = ly - 1; y > bottom.y; y--) {
    const st = world.getState(lx, y, lz);
    if (blockName(m, st) !== 'ladder') break;
    ladders++;
    if (m.blockOf(st).get(st, 'facing') !== lf || !m.solidRender(world.getState(lx - STEP[lf][0], y, lz - STEP[lf][1]))) held = false;
  }
  check(`shaft ${tag}: a ladder from under the trapdoor to the basement's floor (${depth} segments)`, ladders === 3 * (depth - 1) + 5 && ladders === ly - 1 - bottom.y && held, `${ladders}`);
  let infested = 0, bricks = 0;
  for (const p of pieces.filter((q) => q.part !== 'top'))
    for (let x = p.box.minX; x <= p.box.maxX; x++)
      for (let y = p.box.minY; y <= p.box.maxY; y++)
        for (let z = p.box.minZ; z <= p.box.maxZ; z++) {
          const nm = blockName(m, world.getState(x, y, z));
          if (nm === 'infested_stone_bricks') infested++;
          if (nm === 'stone_bricks') bricks++;
        }
  check(`shaft and basement ${tag}: stone bricks, some of them infested`, infested >= 2 * (depth - 1) + 3 && bricks > infested * 5);
  // the basement
  const bs = world.getBlockEntity(...bottom.pos(5, 2, 7));
  const potion = bs?.container.get(0);
  check(`basement ${tag}: a brewing stand holding a splash potion of weakness, on a table of upside-down stairs`,
    name(bottom, 5, 2, 7) === 'brewing_stand' && get(bottom, 5, 2, 7, 'has_bottle_0') === true && potion?.item.id === 'splash_potion' && potion?.tag?.potion?.potion === 'weakness' &&
      name(bottom, 5, 1, 7) === 'spruce_stairs' && get(bottom, 5, 1, 7, 'half') === 'top' && get(bottom, 4, 1, 7, 'half') === 'top');
  check(`basement ${tag}: a potted cactus by it, and a cauldron two-thirds full beside the table (left of the ladder, facing it)`, name(bottom, 4, 2, 7) === 'potted_cactus' && name(bottom, 5, 1, 6) === 'water_cauldron' && get(bottom, 5, 1, 6, 'level') === 2);
  const chestBe = ctxs.flatMap((c) => c.blockEntities).find((e) => e.id === 'chest');
  const [kx, ky, kz] = bottom.pos(2, 1, 7);
  check(`basement ${tag}: a chest with chests/igloo_chest right of the ladder, the data marker over it gone to air`,
    name(bottom, 2, 1, 7) === 'chest' && chestBe?.x === kx && chestBe?.y === ky && chestBe?.z === kz && chestBe.data.lootTable === 'chests/igloo_chest' && name(bottom, 2, 2, 7) === 'air');
  let bars = 0, rugs = 0;
  for (const [x, z] of [[1, 3], [2, 3], [4, 3], [5, 3]]) for (const y of [1, 2]) if (name(bottom, x, y, z) === 'iron_bars') bars++;
  for (let x = 2; x <= 4; x++) for (let z = 4; z <= 6; z++) if (name(bottom, x, 1, z) === 'red_carpet') rugs++;
  check(`basement ${tag}: iron bars in front of the two cells, a red rug, two torches on the walls`, bars === 8 && rugs === 9 && name(bottom, 1, 2, 5) === 'wall_torch' && name(bottom, 5, 2, 5) === 'wall_torch' && get(bottom, 1, 2, 5, 'facing') === turned('east', rot));
  // the villager and the zombie villager, each in its own cell
  const ents = ctxs.flatMap((c) => c.entities);
  const v = ents.find((e) => e.id === 'villager'), zv = ents.find((e) => e.id === 'zombie_villager');
  const cellOf = (e) => [Math.floor(e.x), Math.floor(e.y), Math.floor(e.z)];
  const inCell = (e, cx) => [0, 1].some((a) => [1, 2].some((c) => bottom.pos(cx + a, 1, c).join() === cellOf(e).join()));
  check(`basement ${tag}: a plains villager and a plains zombie villager without jobs, persistent, in the two cells`,
    ents.length === 2 && v && zv && v.persistent === true && zv.persistent === true && v.data.vtype === 'plains' && zv.data.vtype === 'plains' && v.data.profession === 'none' && zv.data.profession === 'none' && inCell(v, 1) && inCell(zv, 4));
  // the cells keep them apart: the air round the villager doesn't reach the zombie villager's
  {
    const start = cellOf(v), goal = cellOf(zv).join();
    const seen = new Set([start.join()]);
    const queue = [start];
    let met = false;
    while (queue.length) {
      const [x, y, z] = queue.pop();
      for (const [ax, ay, az] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
        const k = [x + ax, y + ay, z + az];
        if (seen.has(k.join()) || world.getState(...k) !== 0) continue;
        if (k.join() === goal) met = true;
        seen.add(k.join());
        queue.push(k);
      }
    }
    check(`basement ${tag}: the villager's cell shut off from the room and from the zombie villager's`, !met && seen.size === 12, `${seen.size}`);
  }
}

{
  // without a basement: a snow block where the trapdoor was, and nothing under the dome
  const pieces = m.iglooPieces(fixed(1, 0), 1600, 3200, () => G);
  const { world } = pieceLevel(m, pieces, { ground: G, under: 'dirt', biome: m.B.snowy_plains });
  const top = pieces[0];
  check('no basement: just the dome', pieces.length === 1 && top.part === 'top');
  check('no basement: a snow block in the trapdoor\'s place under the third carpet', blockName(m, world.getState(...top.pos(3, 0, 5))) === 'snow_block' && blockName(m, world.getState(...top.pos(3, 1, 5))) === 'white_carpet');
  // over a cave (air under the trapdoor's place), vanilla leaves the trapdoor
  const pieces2 = m.iglooPieces(fixed(0, 0), 1600, 3200, () => G);
  const [cx, cy, cz] = pieces2[0].pos(3, 0, 5);
  const blocks = new Uint16Array(m.COLUMN_VOLUME);
  for (let y = m.MIN_Y; y < G; y++) for (let a = 0; a < 16; a++) for (let b = 0; b < 16; b++) blocks[m.colIndex(a, y, b)] = y === cy - 1 && a === (cx & 15) && b === (cz & 15) ? 0 : m.S('dirt');
  const ctx = new m.GenContext(cx >> 4, cz >> 4, blocks, new Uint8Array(256));
  pieces2[0].postProcess(ctx, new m.BoundingBox(ctx.x0, m.MIN_Y + 1, ctx.z0, ctx.x0 + 15, m.MAX_Y - 1, ctx.z0 + 15), new m.Rand(1, 1));
  check('no basement: over a hollow, the trapdoor is left (as vanilla)', blockName(m, ctx.getOrAir(cx, cy, cz)) === 'oak_trapdoor');
}

// ---------------------------------------------------------------------------------------------------------------
// The villagers loaded, and the cure the igloo holds

{
  const { level, ctxs, pieces } = iglooLevels[0];
  const bottom = pieceOf(pieces, 'bottom');
  const ents = ctxs.flatMap((c) => c.entities);
  const v = m.loadEntity(ents.find((e) => e.id === 'villager'), level);
  const zv = m.loadEntity(ents.find((e) => e.id === 'zombie_villager'), level);
  check('villagers: the villager loads as a plains villager without a job, which doesn\'t despawn', v instanceof m.Villager && v.villagerType === 'plains' && v.profession === 'none' && v.persistenceRequired === true);
  check('villagers: the zombie villager loads as a plains zombie villager, not being cured, which doesn\'t despawn', zv instanceof m.ZombieVillager && zv.villagerType === 'plains' && zv.persistenceRequired === true && !zv.converting);
  level.addEntity(zv);
  // the splash potion from the brewing stand, thrown down onto the zombie villager from above
  const bs = level.world.getBlockEntity(...bottom.pos(5, 2, 7));
  const player = new m.Player(level);
  player.gameMode = 'survival';
  const thrown = new m.ThrownPotion(level, player, bs.container.get(0).copy());
  thrown.moveTo(zv.x, zv.y + 2.6, zv.z, 0, 0);
  thrown.dx = 0;
  thrown.dy = -0.5;
  thrown.dz = 0;
  level.addEntity(thrown);
  ticks(level, 6);
  check('cure: the splash potion of weakness from the brewing stand weakens the zombie villager', zv.hasEffect('weakness'));
  // the chest's loot always has a golden apple
  const chest = level.world.getBlockEntity(...bottom.pos(2, 1, 7));
  chest.unpackLoot();
  const apple = chest.container.items.find((s) => s?.item.id === 'golden_apple');
  player.inventory.setSelectedItem(apple);
  const r = zv.interact(player, apple);
  check('cure: the golden apple from the chest starts the cure', r === 'success' && zv.converting === true);
}

// ---------------------------------------------------------------------------------------------------------------
// Loot

{
  const r = new m.Rand(7, 3);
  let apples = true, stacks = 0, n = 0;
  const seen = new Set();
  for (let i = 0; i < 400; i++) {
    const items = m.rollLoot('chests/igloo_chest', r);
    if (items.filter((s) => s.item.id === 'golden_apple').length !== 1) apples = false;
    for (const s of items) seen.add(s.item.id);
    stacks += items.length - 1;
    n++;
  }
  check('loot: every igloo chest has one golden apple', apples);
  check('loot: and 2-8 of apples, coal, gold nuggets, a stone axe, rotten flesh, an emerald or wheat', stacks / n > 4 && stacks / n < 6 && ['apple', 'coal', 'gold_nugget', 'stone_axe', 'rotten_flesh', 'emerald', 'wheat'].every((x) => seen.has(x)), (stacks / n).toFixed(2));
}

// ---------------------------------------------------------------------------------------------------------------
// seed 12345

let nearest = null;
{
  let n = 0, ok = true, basements = 0;
  const SNOWY = [m.B.snowy_taiga, m.B.snowy_plains, m.B.snowy_slopes];
  for (let rx = -12; rx < 12; rx++)
    for (let rz = -12; rz < 12; rz++) {
      const s = T.stub('igloo', rx, rz);
      if (!s) continue;
      n++;
      if (!SNOWY.includes(gen.quartBiome(s.cx * 16 + 8, s.cz * 16 + 8))) ok = false;
      if (T.start('igloo', rx, rz).pieces.length > 1) basements++;
    }
  nearest = T.nearest('igloo', 0, 0);
  console.log(`     (seed ${SEED}, 24 x 24 regions: ${n} igloos, ${basements} with basements; nearest to 0,0 at ${nearest})`);
  check('seed 12345: every igloo in a snowy plain, taiga or slope', ok && n > 0);
  const chat = [];
  const game = (x, z, dim = m.OVERWORLD) => ({ meta: { allowCommands: true }, chat: (s) => chat.push(s), world: { dim }, player: { x, z }, level: { seed: SEED } });
  m.executeCommand(game(0, 0), 'locate structure minecraft:igloo');
  m.executeCommand(game(0, 0), 'locate structure igloo');
  check('/locate igloo', chat[0]?.includes(`[${nearest[0]}, ~, ${nearest[1]}]`) && chat[1] === chat[0], chat[0]);
  // the real one, generated as the chunk workers do
  const cx = nearest[0] >> 4, cz = nearest[1] >> 4;
  const outs = [];
  for (let x = cx - 1; x <= cx + 1; x++) for (let z = cz - 1; z <= cz + 1; z++) outs.push(gen.generate(x, z));
  const st = T.startsNear('igloo', cx, cz)[0];
  const top = pieceOf(st.pieces, 'top');
  const inside = (e) => st.bounds.isInside(Math.floor(e.x), Math.floor(e.y), Math.floor(e.z));
  const bes = outs.flatMap((o) => o.blockEntities).filter(inside);
  const ents = outs.flatMap((o) => o.entities).filter(inside);
  const hasBasement = st.pieces.length > 1;
  check('real igloo: its furnace, and with a basement its brewing stand, chest, villager and zombie villager',
    bes.some((b) => b.id === 'furnace') && (!hasBasement || (bes.some((b) => b.id === 'brewing_stand') && bes.some((b) => b.id === 'chest') && ents.length === 2)));
  console.log(`     (the real igloo: turned ${top.turns}, floor at y ${top.y}, ${hasBasement ? `basement ${st.pieces.length - 2} segments down, its floor at y ${pieceOf(st.pieces, 'bottom').y}` : 'no basement'})`);
}

await exitWithStatus(close);
