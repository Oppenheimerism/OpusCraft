// Frost Walker (vanilla enchantment.frost_walker, FrostedIceBlock): walking on the ground in the boots, each step to
// another block freezes the still water one block down within 2 + the level of it into frosted ice (a source, air over
// it, nothing standing in it), which a block_place game event; walking on across a pond leaves a path of it. It ages
// 0 to 3 and melts from the edges, only where light enough reaches it (not at night away from a torch); frosted ice
// left with fewer than 2 of it around melts when a neighbour does. Broken it's water again, with nothing dropped, and it
// has no item. The boots keep the feet from burning on a magma block or a campfire; a magma block burns anything else
// alive on it (hotFloor, 1 a time) unless it's sneaking.

import { load, check, exitWithStatus, ticks } from '../bastions/lib.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 300000).unref();

const { m, close } = await load(['/src/entity/living.ts', '/src/game/frostWalker.ts', '/src/entity/monsters.ts', '/src/textures/blocklib/fluids.ts', '/src/game/villageBlocks.ts']);

// stone to y 63 (its top at 64), a pond of water sources x -8..8, z 5..25 at y 63, lit as it is (chunks -1..1)
const world = new m.World();
const STONE = m.S('stone'), WATER = m.S('water');
for (let cx = -1; cx <= 1; cx++)
  for (let cz = -1; cz <= 2; cz++) {
    const blocks = new Uint16Array(m.COLUMN_VOLUME);
    for (let y = m.MIN_Y; y < 64; y++)
      for (let lz = 0; lz < 16; lz++)
        for (let lx = 0; lx < 16; lx++) {
          const x = cx * 16 + lx, z = cz * 16 + lz;
          blocks[m.colIndex(lx, y, lz)] = y === 63 && x >= -8 && x <= 8 && z >= 5 && z <= 25 ? WATER : STONE;
        }
    world.addChunk({ cx, cz, blocks, light: m.computeChunkLight(blocks), biomes: new Uint8Array(256).fill(m.B.plains), pending: [] });
  }
const level = new m.Level(world, 'frost');
level.sound = { play() {}, playUI() {} };
level.particles = { blockBreak() {}, blockHit() {}, poof() {}, blockParticle() {}, fallingDust() {}, spawn() {}, dust() {} };
const events = [];
const ge = level.gameEvent.bind(level);
level.gameEvent = (ev, x, y, z, ctx) => { events.push({ ev, x, y, z }); return ge(ev, x, y, z, ctx); };
level.dayTime = 6000;
level.doDaylightCycle = false;

const name = (x, y, z) => m.BLOCKS[m.STATE_BLOCK[world.getState(x, y, z)]].name;
const age = (x, y, z) => m.getBlock('frosted_ice').get(world.getState(x, y, z), 'age');
const refill = () => { for (let x = -8; x <= 8; x++) for (let z = 5; z <= 25; z++) world.setState(x, 63, z, WATER); };
const frozen = () => { const out = []; for (let x = -8; x <= 8; x++) for (let z = 5; z <= 25; z++) if (name(x, 63, z) === 'frosted_ice') out.push([x, z]); return out; };

const NONE = { forward: false, back: false, left: false, right: false, jump: false, sneak: false, sprint: false };
let p = null;
function fresh(x, y, z, boots = null, mode = 'survival') {
  p?.remove();
  p = new m.Player(level);
  p.setGameMode(mode);
  p.moveTo(x, y, z, 0, 0);
  level.player = p;
  level.addEntity(p);
  p.input = { ...NONE };
  p.inventory.armor.fill(null);
  if (boots) p.inventory.armor[0] = boots;
  p.hurts = [];
  const hurt = p.hurt.bind(p);
  p.hurt = (amount, source, ...rest) => { const r = hurt(amount, source, ...rest); if (r) p.hurts.push(source); return r; };
  return p;
}
const boots = (lvl, enchant = 'frost_walker') => {
  const s = m.ItemStack.of('diamond_boots');
  if (lvl) s.tag = { enchantments: { [enchant]: lvl } };
  return s;
};

// --- the disk: a stone to stand on in the middle of the pond
world.setState(0, 63, 15, STONE);
fresh(0.5, 64, 15.5, boots(1));
m.FEET_HOOKS.frostWalk(p, 1);
const f1 = frozen();
check('Frost Walker I freezes the water one block down within 3 of its feet (the 24 around the stone)', f1.length === 24 && f1.every(([x, z]) => x * x + (z - 15) ** 2 < 9), String(f1.length));
check('...into frosted ice, age 0', f1.every(([x, z]) => age(x, 63, z) === 0));
check('...each a block_place game event', events.filter((e) => e.ev === 'block_place').length === 24);
refill();
world.setState(0, 63, 15, STONE);
m.FEET_HOOKS.frostWalk(p, 2);
const f2 = frozen();
let want2 = 0;
for (let dx = -4; dx <= 4; dx++) for (let dz = -4; dz <= 4; dz++) if (dx * dx + dz * dz < 16 && (dx || dz)) want2++;
check('Frost Walker II: within 4', f2.length === want2 && f2.every(([x, z]) => x * x + (z - 15) ** 2 < 16), `${f2.length} of ${want2}`);

// only still water with air over it and nothing in it
refill();
world.setState(0, 63, 15, STONE);
world.setState(1, 63, 15, m.getBlock('water').with(WATER, 'level', 2));
world.setState(-1, 64, 15, m.S('oak_slab'));
const z = new m.Zombie(level);
z.moveTo(0.5, 63.2, 16.5, 0, 0);
level.addEntity(z);
m.FEET_HOOKS.frostWalk(p, 1);
check('flowing water stays water', name(1, 63, 15) === 'water');
check('water under a block stays water', name(-1, 63, 15) === 'water');
check('water something stands in stays water', name(0, 63, 16) === 'water');
check('the rest freezes', name(0, 63, 14) === 'frosted_ice' && name(-1, 63, 14) === 'frosted_ice');
z.remove();
world.setState(1, 63, 15, WATER);
world.setState(-1, 64, 15, m.S('air'));
world.setState(0, 63, 15, WATER);
refill();

// --- walking across the pond
fresh(0.5, 64, 2.5, boots(1));
ticks(level, 2);
p.yaw = 0;
p.input = { ...NONE, forward: true };
for (let i = 0; i < 200 && p.z < 20; i++) ticks(level, 1);
p.input = { ...NONE };
check('walking on in the boots, it walks across the pond on its own ice', p.z >= 20 && p.y >= 63.99 && p.onGround && !p.inWater, `${p.z.toFixed(2)} ${p.y}`);
check('...frozen under its path all the way', Array.from({ length: 13 }, (_, i) => name(0, 63, 6 + i)).every((n) => n === 'frosted_ice'));
check('...and 2 either side', [-2, -1, 1, 2].every((x) => name(x, 63, 12) === 'frosted_ice'));
refill();
fresh(0.5, 64, 2.5);
ticks(level, 2);
p.yaw = 0;
p.input = { ...NONE, forward: true };
ticks(level, 60);
p.input = { ...NONE };
check('without the boots, it walks into the water', frozen().length === 0 && p.inWater);
refill();
fresh(0.5, 64, 2.5, boots(2, 'depth_strider'));
ticks(level, 2);
p.input = { ...NONE, forward: true };
ticks(level, 60);
p.input = { ...NONE };
check('other boots do nothing to it', frozen().length === 0);

// --- melting
refill();
world.setState(0, 63, 15, STONE);
fresh(0.5, 64, 15.5, boots(2));
m.FEET_HOOKS.frostWalk(p, 2);
p.remove();
p = null;
const n0 = frozen().length;
const ages = new Set();
let left = n0, t = 0;
const at = [];
for (t = 0; t < 2400 && left > 0; t++) {
  ticks(level, 1);
  const fz = frozen();
  for (const [x, zz] of fz) ages.add(age(x, 63, zz));
  left = fz.length;
  if (t === 59) at.push(left);
}
check('in daylight, it melts away (in a minute or two)', left === 0 && t > 60, `${left} left after ${t} ticks, of ${n0}`);
check('...none of it before its first tick 3 seconds on', at[0] === n0);
check('...ageing through 0 to 3 as it goes', [0, 1, 2, 3].every((a) => ages.has(a)), [...ages].join(' '));
check('...back to water', name(0, 63, 13) === 'water' && name(2, 63, 16) === 'water');

// at night it keeps
level.dayTime = 18000;
ticks(level, 1);
refill();
world.setState(0, 63, 15, STONE);
fresh(0.5, 64, 15.5, boots(2));
m.FEET_HOOKS.frostWalk(p, 2);
p.remove();
p = null;
const night0 = frozen().length;
ticks(level, 1200);
check('at night, away from any light, it doesn\'t melt', frozen().length === night0 && night0 > 0, `${frozen().length} of ${night0}`);
// a lone one, its only frosted neighbour gone: it melts with it
refill();
level.setBlock(3, 63, 20, m.S('frosted_ice'));
level.setBlock(4, 63, 20, m.S('frosted_ice'));
level.setBlock(4, 63, 20, WATER);
check('frosted ice left with fewer than 2 of it around melts when a neighbour goes', name(3, 63, 20) === 'water');
level.dayTime = 6000;
ticks(level, 1);

// --- breaking it, and no item
refill();
level.setBlock(2, 63, 3, m.S('frosted_ice'));
fresh(2.5, 64, 1.5);
p.pitch = 60;
p.yaw = 0;
const inter = new m.Interaction(level, p);
const drops0 = level.entities.filter((e) => e.type === 'item').length;
inter.destroyBlock(2, 63, 3);
check('broken by a survival player, frosted ice over something solid is water again', name(2, 63, 3) === 'water');
check('frosted ice has no item', !m.itemForBlock('frosted_ice'));
check('...and drops nothing broken', level.entities.filter((e) => e.type === 'item').length === drops0);
world.setState(2, 63, 3, STONE);

// --- hot floors
world.setState(30, 63, 30, m.S('magma_block'));
fresh(30.5, 64, 30.5);
ticks(level, 30);
check('a magma block burns whoever stands on it (hotFloor)', p.hurts.includes('hotFloor'), p.hurts.join(' '));
fresh(30.5, 64, 30.5);
p.input = { ...NONE, sneak: true };
ticks(level, 30);
check('...unless they\'re sneaking', !p.hurts.includes('hotFloor'), p.hurts.join(' '));
fresh(30.5, 64, 30.5, boots(1));
ticks(level, 30);
check('...and not in Frost Walker boots', !p.hurts.includes('hotFloor'), p.hurts.join(' '));
{
  const zb = new m.Zombie(level);
  zb.moveTo(30.5, 64, 30.5, 0, 0);
  level.addEntity(zb);
  const h = zb.health;
  ticks(level, 30);
  check('a zombie on it burns too', zb.health < h);
  zb.remove();
}
world.setState(26, 63, 30, STONE);
world.setState(26, 64, 30, m.getBlock('campfire').with(m.S('campfire'), 'lit', true));
fresh(26.5, 64.5, 30.5, boots(1));
ticks(level, 30);
check('Frost Walker boots keep the feet from a campfire too', !p.hurts.includes('campfire'), p.hurts.join(' '));
fresh(26.5, 64.5, 30.5);
ticks(level, 30);
check('...which burns without them', p.hurts.includes('campfire'), p.hurts.join(' '));

// --- its look
{
  const tex = [0, 1, 2, 3].map((a) => m.frostedIce(a));
  const ice = m.ice();
  const diff = (a, b) => a.data.some((v, i) => v !== b.data[i]);
  check('frosted ice has four textures, cracking more with age', tex.every((t, i) => t.w === 16 && diff(t, ice) && (i === 0 || diff(t, tex[i - 1]))));
}

await exitWithStatus(close);
