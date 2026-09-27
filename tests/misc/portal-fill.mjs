// A nether portal put in a block at a time stands (node tests/misc/portal-fill.mjs): vanilla NetherPortalBlock.updateShape
// minds only a change in the portal's own plane (above, below, or along its axis) of something that isn't portal
// itself, so /fill nether_portal in an obsidian frame leaves a portal, as in vanilla. Breaking the frame still puts the
// whole portal out, and a change across the portal's plane doesn't.
import { loadModules } from '../../scripts/load.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 120000).unref();
const { mods, close } = await loadModules(['/src/world/blocks.ts', '/src/world/block.ts', '/src/world/world.ts', '/src/world/chunk.ts', '/src/game/level.ts', '/src/game/commands.ts', '/src/item/inventory.ts']);
const [, blockMod, worldMod, chunkMod, levelMod, commands, invMod] = mods;
let fails = 0;
const check = (name, cond, extra = '') => { if (!cond) fails++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const { BLOCKS, STATE_BLOCK, S } = blockMod;

const world = new worldMod.World();
for (let cx = -2; cx <= 1; cx++) for (let cz = -2; cz <= 1; cz++) { const c = new chunkMod.Chunk(cx, cz); world.chunks.set(c.key, c); }
const level = new levelMod.Level(world, 'test');
level.sound = { play() {}, playUI() {} };
level.particles = { blockBreak() {}, blockHit() {}, poof() {}, blockParticle() {}, fallingDust() {}, spawn() {}, dust() {} };
const name = (x, y, z) => BLOCKS[STATE_BLOCK[world.getState(x, y, z)]].name;
const chats = [];
const game = { meta: { allowCommands: true }, chat: (m) => chats.push(m), player: { x: 0.5, y: 64, z: 0.5, inventory: new invMod.Inventory(), level }, playerName: 'Tester', level, world, sound: { play() {} }, applyGameRules() {} };
const run = (line) => { chats.length = 0; commands.executeCommand(game, line); return chats.join(' | '); };

/** an obsidian frame round the inside x0..x0+w-1, y0..y0+h-1, in the plane z = z0 (axis x) or x = x0 (axis z) */
function frame(axis, x0, y0, z0, w, h) {
  const at = (i, y) => (axis === 'x' ? [x0 + i, y, z0] : [x0, y, z0 + i]);
  for (let i = -1; i <= w; i++) for (let y = y0 - 1; y <= y0 + h; y++) {
    const inside = i >= 0 && i < w && y >= y0 && y < y0 + h;
    const [x, yy, z] = at(i, y);
    world.setState(x, yy, z, inside ? S('air') : S('obsidian'));
  }
  return (fn) => { for (let i = 0; i < w; i++) for (let y = y0; y < y0 + h; y++) fn(...at(i, y)); };
}
const all = (each, want) => { let ok = true; each((x, y, z) => { if (name(x, y, z) !== want) ok = false; }); return ok; };

// /fill in a frame along x
const inX = frame('x', 1, 41, 0, 2, 3);
const out1 = run('fill 1 41 0 2 43 0 nether_portal[axis=x]');
check('/fill nether_portal in an obsidian frame (along x): the portal stands', all(inX, 'nether_portal'), out1);
check('...and it says so', out1.includes('Successfully filled 6 block'), out1);
// and along z, a bigger one
const inZ = frame('z', 10, 41, 1, 3, 4);
const out2 = run('fill 10 41 1 10 44 3 nether_portal[axis=z]');
check('...a 3 by 4 one along z too', all(inZ, 'nether_portal'), out2);

// put in a block at a time, as a structure or a mod would
const inX2 = frame('x', 20, 41, 5, 2, 3);
inX2((x, y, z) => level.setBlock(x, y, z, S('nether_portal', { axis: 'x' })));
check('set a block at a time, the portal stands', all(inX2, 'nether_portal'));

// breaking the frame still puts it out, all of it
level.setBlock(0, 42, 0, S('air'));
check('breaking the frame (a side) puts the whole portal out', all(inX, 'air'));
level.setBlock(10, 45, 2, S('air'));
check('...or its top', all(inZ, 'air'));

// a change across the portal's plane isn't minded; one in its plane is
const floating = [];
for (let x = 30; x <= 31; x++) for (let y = 41; y <= 43; y++) floating.push([x, y, 10]);
for (const [x, y, z] of floating) level.setBlock(x, y, z, S('nether_portal', { axis: 'x' }));
const standing = () => floating.every(([x, y, z]) => name(x, y, z) === 'nether_portal');
check('portal blocks with no frame at all stand while nothing else changes by them', standing());
level.setBlock(30, 42, 11, S('stone'));
level.setBlock(31, 41, 9, S('stone'));
check('a block set in front of it or behind it (across its plane): still there', standing());
level.setBlock(29, 42, 10, S('stone'));
check('a block set beside it in its plane: no frame, so it all goes out', floating.every(([x, y, z]) => name(x, y, z) === 'air'));

console.log(fails ? `${fails} FAILED` : 'all ok');
await close();
process.exit(fails ? 1 : 0);
