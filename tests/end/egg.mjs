// The dragon egg, headless: node tests/end/egg.mjs
import { loadModules } from '../../scripts/load.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 120000).unref();
const { mods: [, blockMod, worldMod, dimMod, levelMod, genMod, behMod, playerMod, fbMod, itemEntMod, itemMod], close } = await loadModules([
  '/src/world/blocks.ts', '/src/world/block.ts', '/src/world/world.ts', '/src/world/dimension.ts', '/src/game/level.ts', '/src/world/gen/theEnd.ts',
  '/src/game/blockBehavior.ts', '/src/entity/player.ts', '/src/entity/fallingBlock.ts', '/src/entity/itemEntity.ts', '/src/item/item.ts',
]);
let fails = 0;
const check = (name, cond, extra = '') => { if (!cond) fails++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const { BLOCKS, STATE_BLOCK, S } = blockMod;
const name = (st) => BLOCKS[STATE_BLOCK[st]].name;

const gen = new genMod.EndGenerator('4242');
const world = new worldMod.World();
world.reset(dimMod.THE_END);
const level = new levelMod.Level(world, '4242');
const particles = new Map();
level.sound = { play() {}, playUI() {} };
level.particles = { blockBreak() {}, blockHit() {}, spawn: (k) => particles.set(k, (particles.get(k) ?? 0) + 1), fallingDust: () => particles.set('falling_dust', (particles.get('falling_dust') ?? 0) + 1) };
for (let cz = -2; cz <= 2; cz++) for (let cx = -2; cx <= 2; cx++) world.addChunk(gen.generate(cx, cz));
const player = new playerMod.Player(level);
player.setGameMode('survival');
const top = world.heightAt(8, 8);
player.moveTo(8.5, top, 8.5, 0, 0);
level.player = player;
level.addEntity(player);
const tick = (n = 1) => { for (let i = 0; i < n; i++) level.tick(); };
const at = (x, y, z) => name(world.getState(x, y, z));
const EGG = S('dragon_egg');

// the item
const it = itemMod.ITEMS.get('dragon_egg');
check('the item is epic, among the functional blocks', it.rarity === 'epic' && it.creativeTab === 'functional', `${it.rarity} ${it.creativeTab}`);

// falls: placed four blocks up in the air, gone into a falling block after 5 ticks and back as a block on the ground
const gx = 3, gz = 3, gy = world.heightAt(gx, gz);
check('ground under the drop spot', at(gx, gy - 1, gz) === 'end_stone', at(gx, gy - 1, gz));
level.setBlock(gx, gy + 4, gz, EGG);
tick(4);
check('still there after 4 ticks', at(gx, gy + 4, gz) === 'dragon_egg');
tick(1);
const falling = level.entities.find((e) => e instanceof fbMod.FallingBlockEntity);
check('falls on the 5th tick', at(gx, gy + 4, gz) === 'air' && !!falling && name(falling.state) === 'dragon_egg');
tick(40);
check('lands as a block on the end stone', at(gx, gy, gz) === 'dragon_egg' && !level.entities.some((e) => e instanceof fbMod.FallingBlockEntity));

// the block under it goes: it follows after 5 ticks
level.setBlock(gx, gy - 1, gz, 0);
tick(5);
check('falls again when the ground under it is broken', at(gx, gy, gz) === 'air');
tick(40);
check('and lands a block lower', at(gx, gy - 1, gz) === 'dragon_egg', at(gx, gy - 1, gz));
world.setState(gx, gy - 1, gz, 0);

// on a torch: it breaks into an item
const tx = -3, tz = -3, ty = world.heightAt(tx, tz);
level.setBlock(tx, ty, tz, S('torch'));
level.setBlock(tx, ty + 3, tz, EGG);
tick(60);
const drops = level.entities.filter((e) => e instanceof itemEntMod.ItemEntity && e.stack.item.id === 'dragon_egg');
check('an egg falling onto a torch drops as an item', drops.length === 1 && at(tx, ty + 3, tz) === 'air' && at(tx, ty, tz) === 'torch', `${drops.length} ${at(tx, ty, tz)}`);
for (const d of drops) d.remove();
world.setState(tx, ty, tz, 0);

// use: it jumps to an air spot within 15 across and 7 up or down, the old spot empties, 128 portal particles
const ux = 0, uz = 0, uy = world.heightAt(ux, uz);
level.setBlock(ux, uy, uz, EGG);
tick(10);
check('sitting on the ground', at(ux, uy, uz) === 'dragon_egg');
const beh = behMod.behaviorOf(EGG);
particles.clear();
const eggs = () => { const l = []; for (let y = uy - 10; y <= uy + 10; y++) for (let z = uz - 16; z <= uz + 16; z++) for (let x = ux - 16; x <= ux + 16; x++) if (at(x, y, z) === 'dragon_egg') l.push([x, y, z]); return l; };
const r = beh.use(level, ux, uy, uz, EGG, { player, face: 1, hx: ux + 0.5, hy: uy + 1, hz: uz + 0.5 });
const found = eggs();
check('use: the egg jumps', r === true && at(ux, uy, uz) === 'air' && found.length === 1, JSON.stringify(found));
const [ex, ey, ez] = found[0];
check('within 15 across and 7 up or down', Math.abs(ex - ux) <= 15 && Math.abs(ez - uz) <= 15 && Math.abs(ey - uy) <= 7);
check('128 portal particles', particles.get('portal') === 128, String(particles.get('portal')));
// many jumps: never more than one egg, always within range of the last spot (each from the middle of the island
// again: jumping on and on, it wanders off the edge in the end and falls into the void, as vanilla's does)
let ok = true, cur = found[0], falls = 0;
for (let i = 0; i < 200; i++) {
  world.setState(cur[0], cur[1], cur[2], 0);
  const my = world.heightAt(0, 0);
  world.setState(0, my, 0, EGG);
  cur = [0, my, 0];
  const [cx, cy, cz] = cur;
  beh.attack(level, cx, cy, cz, EGG, player);
  tick(6);
  const l = [];
  for (const e of level.entities) if (e instanceof fbMod.FallingBlockEntity) falls++;
  tick(55);
  for (let y = cy - 30; y <= cy + 8; y++) for (let z = cz - 16; z <= cz + 16; z++) for (let x = cx - 16; x <= cx + 16; x++) if (at(x, y, z) === 'dragon_egg') l.push([x, y, z]);
  const items = level.entities.filter((e) => e instanceof itemEntMod.ItemEntity && e.stack.item.id === 'dragon_egg');
  if (l.length + items.length !== 1) {
    ok = false;
    console.log('lost or doubled', JSON.stringify(l), cur, items.length, 'items', level.entities.filter((e) => e instanceof fbMod.FallingBlockEntity).map((e) => [e.x, e.y, e.z].map((v) => v.toFixed(1)).join(' ')));
    break;
  }
  if (items.length) {
    // (landed on something that isn't a full block: an item, as vanilla's)
    for (const d of items) d.remove();
    l.push([0, world.heightAt(0, 0), 0]);
    world.setState(0, world.heightAt(0, 0), 0, EGG);
  }
  cur = l[0];
}
check('200 blows: one egg all along', ok, `fell ${falls} times`);
// dust: the egg in the air sifts black dust now and then
level.setBlock(ux + 20, uy + 10, uz, EGG);
particles.clear();
for (let i = 0; i < 400; i++) beh.animateTick(level, ux + 20, uy + 10, uz, EGG);
check('dust under an egg in the air', (particles.get('falling_dust') ?? 0) > 5, String(particles.get('falling_dust')));
console.log(fails ? `${fails} FAILED` : 'all ok');
await close();
process.exit(fails ? 1 : 0);
