// The lodestone compass (vanilla CompassItem.useOn, inventoryTick, isFoil and getDescriptionId; LodestoneTracker): a
// compass used on a lodestone locks onto it with its sound (for everyone, the player's sounds) and Country Lode, Take
// Me Home, becoming a glinting "Lodestone Compass"; a lone one in survival is the one changed, one off a stack (or any
// in creative) is copied off, put away or dropped; its needle points to the lodestone and spins in another dimension
// or once the lodestone's known to be gone, which a carried compass finds out in the lodestone's dimension (a loaded
// chunk's); the lodestone goes through saves, stacks with its like only, and crosses to a guest.

import { load, check, exitWithStatus, flatLevel, playerAt, rightClick, ticks } from './lib.mjs';
import { analyze } from '../../scripts/audio-lib.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 300000).unref();

const { m, close } = await load(['/src/item/compass.ts', '/src/net/items.ts', '/src/audio/synth.ts', '/src/world/dimension.ts']);

const tracker = (x, y, z, dim = 'overworld') => ({ target: { dim, pos: [x, y, z] }, tracked: true });
const lodestoneCompass = (t, n = 1) => {
  const s = m.ItemStack.of('compass', n);
  s.tag = { lodestoneTracker: t };
  return s;
};
const json = (v) => JSON.stringify(v ?? null);

// --- the item
{
  const plain = m.ItemStack.of('compass');
  const locked = lodestoneCompass(tracker(0, 65, 2));
  check('a compass is a Compass, without the glint', plain.displayName() === 'Compass' && !plain.hasGlint());
  check('one with a lodestone is a Lodestone Compass, with the glint', locked.displayName() === 'Lodestone Compass' && locked.hasGlint());
  const named = locked.copy();
  named.tag.customName = 'Home';
  check('...a name from an anvil over that', named.displayName() === 'Home');
  const gone = lodestoneCompass({ tracked: true });
  check('...and still one once its lodestone is gone', gone.displayName() === 'Lodestone Compass' && gone.hasGlint());
  check('it stacks with one locked onto the same lodestone only', locked.sameItem(lodestoneCompass(tracker(0, 65, 2))) && !locked.sameItem(lodestoneCompass(tracker(0, 66, 2))) && !locked.sameItem(lodestoneCompass(tracker(0, 65, 2, 'the_nether'))) && !locked.sameItem(plain) && !locked.sameItem(gone));
  const copy = locked.copy();
  copy.tag.lodestoneTracker.target.pos[0] = 9;
  check('a copy has a lodestone of its own', locked.tag.lodestoneTracker.target.pos[0] === 0);
  const back = [locked, gone, lodestoneCompass({ target: { dim: 'the_nether', pos: [5, 40, -3] }, tracked: false })].map((s) => m.loadStack(JSON.parse(JSON.stringify(m.saveStack(s)))));
  check('...and it goes through a save: where, which dimension, whether it looks for it, or none', json(back[0].tag.lodestoneTracker) === json(tracker(0, 65, 2)) && json(back[1].tag.lodestoneTracker) === '{"tracked":true}' && json(back[2].tag.lodestoneTracker) === '{"target":{"dim":"the_nether","pos":[5,40,-3]},"tracked":false}' && back[0].sameItem(locked));
  const wire = m.itemFromHost(m.itemToWire(locked));
  check('...and to a guest (the one in a player\'s hand)', wire.sameItem(locked) && wire.displayName() === 'Lodestone Compass');
}

// --- locking on
{
  const { level, sounds, triggers } = flatLevel(m, -1, -1, 1, 1, 64, 'lodestone');
  level.setBlock(0, 65, 2, m.S('lodestone'));
  // (the player looks straight at it, south along +z at eye height; what it drops, it throws as the game has it)
  const p = playerAt(m, level, 0.5, 64, 0.5, { held: 'compass' });
  p.dropHandler = (s) => new m.Interaction(level, p).throwItem(s);
  const held = p.inventory.main[0];
  rightClick(m, level, p);
  check('a lone compass used on a lodestone locks onto it: that compass, in the lodestone\'s dimension', held === p.inventory.main[0] && held.count === 1 && json(held.tag?.lodestoneTracker) === json(tracker(0, 65, 2)), json(held.tag));
  check('...with the lock sound, at the lodestone, full and unpitched', sounds.some((s) => s.name === 'item.lodestone_compass.lock' && s.x === 0.5 && s.y === 65.5 && s.z === 2.5 && s.volume === 1 && s.pitch === 1));
  check('...the hand swinging', p.swinging);
  check('...and the trigger for the advancement, of a compass used on a lodestone', triggers.some((t) => t.type === 'item_used_on_block' && t.payload.usedOnBlock.item === 'compass' && t.payload.usedOnBlock.block === 'lodestone'));
  const adv = m.ADVANCEMENTS.get('nether/use_lodestone');
  const pa = new m.PlayerAdvancements();
  pa.trigger('item_used_on_block', { usedOnBlock: { item: 'clock', block: 'lodestone' } });
  pa.trigger('item_used_on_block', { usedOnBlock: { item: 'compass', block: 'stone' } });
  const early = pa.isDone(adv);
  for (const t of triggers) pa.trigger(t.type, t.payload);
  check('Country Lode, Take Me Home: a compass on a lodestone (not a clock, not stone)', !early && pa.isDone(adv));

  // another lodestone: the lodestone compass moves to it
  level.setBlock(0, 65, 2, 0);
  level.setBlock(1, 65, 3, m.S('lodestone'));
  p.moveTo(1.5, 64, 1.5, 0, 0);
  rightClick(m, level, p);
  check('a lodestone compass used on another lodestone points there instead', json(held.tag.lodestoneTracker) === json(tracker(1, 65, 3)) && held.count === 1);

  // on anything else, nothing
  level.setBlock(1, 65, 3, m.S('stone'));
  p.inventory.main[0] = m.ItemStack.of('compass');
  sounds.length = 0;
  rightClick(m, level, p);
  check('on another block, a compass does nothing', !p.inventory.main[0].tag && !sounds.some((s) => s.name === 'item.lodestone_compass.lock'));
  level.setBlock(1, 65, 3, m.S('lodestone'));

  // one off a stack
  p.inventory.main[0] = m.ItemStack.of('compass', 3);
  rightClick(m, level, p);
  const rest = p.inventory.main[0];
  const made = p.inventory.main.filter((s, i) => i > 0 && s);
  check('one compass off a stack of them is copied off locked, the rest left as they were', rest.count === 2 && !rest.tag && made.length === 1 && made[0].count === 1 && json(made[0].tag.lodestoneTracker) === json(tracker(1, 65, 3)), `${rest.count} ${made.length}`);
  // (again: the new one goes onto the first)
  rightClick(m, level, p);
  check('...and the next onto it', p.inventory.main[0].count === 1 && made[0].count === 2 && p.inventory.main.filter(Boolean).length === 2);
  // a full inventory: dropped
  for (let i = 1; i < 36; i++) p.inventory.main[i] = m.ItemStack.of('dirt', 64);
  p.inventory.main[0] = m.ItemStack.of('compass', 2);
  const before = level.entities.length;
  rightClick(m, level, p);
  const dropped = level.entities.slice(before).filter((e) => e.type === 'item' && e.stack.item.id === 'compass');
  check('...dropped, with no room for it', p.inventory.main[0].count === 1 && dropped.length === 1 && dropped[0].stack.count === 1 && !!dropped[0].stack.tag?.lodestoneTracker);
  // from the other hand
  for (let i = 0; i < 36; i++) p.inventory.main[i] = null;
  p.inventory.offhand = m.ItemStack.of('compass');
  rightClick(m, level, p);
  check('a compass in the other hand locks on too', json(p.inventory.offhand?.tag?.lodestoneTracker) === json(tracker(1, 65, 3)));
  p.inventory.offhand = null;
  // a curse and a name go with the copy
  const cursed = m.ItemStack.of('compass', 2);
  cursed.tag = { enchantments: { vanishing_curse: 1 }, customName: 'Way Home' };
  p.inventory.main[0] = cursed;
  rightClick(m, level, p);
  const copied = p.inventory.main[1];
  check('...keeping what else the compass had (a curse, a name)', copied?.tag?.enchantments?.vanishing_curse === 1 && copied.tag.customName === 'Way Home' && !!copied.tag.lodestoneTracker && !cursed.tag.lodestoneTracker);

  // creative (at a lodestone of its own, the other player out of the way)
  level.setBlock(-1, 65, 3, m.S('lodestone'));
  const c = playerAt(m, level, -0.5, 64, 1.5, { held: 'compass', creative: true });
  c.dropHandler = (s) => new m.Interaction(level, c).throwItem(s);
  const own = c.inventory.main[0];
  rightClick(m, level, c);
  check('in creative the compass used stays as it was, and a lodestone compass is added', own === c.inventory.main[0] && own.count === 1 && !own.tag && c.inventory.main.filter((s) => s?.tag?.lodestoneTracker).length === 1);
  for (let i = 1; i < 36; i++) c.inventory.main[i] = m.ItemStack.of('dirt', 64);
  const n0 = level.entities.length;
  rightClick(m, level, c);
  check('...and with no room, nothing is dropped', own.count === 1 && !level.entities.slice(n0).some((e) => e.type === 'item'));
}

// --- the needle
{
  const { level } = flatLevel(m, -1, -1, 1, 1, 64, 'needle');
  const p = playerAt(m, level, 0.5, 64, 0.5);
  m.setDialViewer(p, [0, 64, -200]);
  /** the frames the needle shows over `n` ticks */
  const frames = (s, n = 120) => {
    const out = [];
    for (let i = 0; i < n; i++) {
      level.gameTime++;
      out.push(m.dialTexture(s));
    }
    return out;
  };
  const last = (s) => frames(s).at(-1);
  // (facing south, +z: a target straight ahead is needle up, compass_00; behind, compass_16)
  const ahead = lodestoneCompass(tracker(0, 64, 30)), behind = lodestoneCompass(tracker(0, 64, -30));
  check('a lodestone compass points to its lodestone: ahead, straight up', last(ahead) === 'compass_00', last(ahead));
  check('...behind, straight down', last(behind) === 'compass_16', last(behind));
  check('a compass points to the world spawn (behind)', last(m.ItemStack.of('compass')) === 'compass_16');
  const spinning = (s) => new Set(frames(s, 60)).size > 4;
  check('a lodestone compass in another dimension than its lodestone spins', spinning(lodestoneCompass(tracker(0, 64, 30, 'the_nether'))));
  check('...as does one whose lodestone is gone', spinning(lodestoneCompass({ tracked: true })));
  check('...and a compass stays steady', !spinning(m.ItemStack.of('compass')));
  level.world.dim = m.DIMENSIONS.the_nether;
  check('in the Nether, one locked onto a Nether lodestone points to it; a compass spins', last(lodestoneCompass(tracker(0, 64, 30, 'the_nether'))) === 'compass_00' && spinning(m.ItemStack.of('compass')));
}

// --- looking for the lodestone
{
  const { level } = flatLevel(m, -1, -1, 1, 1, 64, 'tracking');
  level.setBlock(4, 64, 4, m.S('lodestone'));
  const p = playerAt(m, level, 0.5, 64, 0.5);
  const kept = lodestoneCompass(tracker(4, 64, 4));
  const far = lodestoneCompass(tracker(4000, 64, 4000));
  const nether = lodestoneCompass(tracker(4, 64, 4, 'the_nether'));
  const unwatched = lodestoneCompass({ target: { dim: 'overworld', pos: [5, 64, 5] }, tracked: false });
  const outside = lodestoneCompass(tracker(4, 400, 4));
  p.inventory.main[9] = kept;
  p.inventory.main[10] = far;
  p.inventory.main[11] = nether;
  p.inventory.main[12] = unwatched;
  p.inventory.armor[0] = null;
  p.inventory.offhand = outside;
  ticks(level, 2);
  check('a carried lodestone compass whose lodestone is there keeps it', json(kept.tag.lodestoneTracker) === json(tracker(4, 64, 4)));
  check('...as does one whose lodestone is in a chunk not loaded (not known to be gone)', !!far.tag.lodestoneTracker.target);
  check('...or in another dimension', !!nether.tag.lodestoneTracker.target);
  check('...or one that doesn\'t look for its lodestone', !!unwatched.tag.lodestoneTracker.target);
  check('one pointing outside the world points nowhere', json(outside.tag.lodestoneTracker) === '{"tracked":true}');
  const v0 = p.inventory.version;
  level.setBlock(4, 64, 4, 0);
  ticks(level, 1);
  check('the lodestone broken, the compass carried in its dimension points nowhere, a lodestone compass still', json(kept.tag.lodestoneTracker) === '{"tracked":true}' && kept.displayName() === 'Lodestone Compass' && kept.hasGlint() && p.inventory.version > v0);
  level.setBlock(4, 64, 4, m.S('lodestone'));
  ticks(level, 1);
  check('...and a lodestone put back doesn\'t find it again', !kept.tag.lodestoneTracker.target);
  // a guest's copy of the world doesn't decide it
  const g = lodestoneCompass(tracker(6, 64, 6));
  p.inventory.main[13] = g;
  level.isClientSide = true;
  ticks(level, 1);
  const client = !!g.tag.lodestoneTracker.target;
  level.isClientSide = false;
  ticks(level, 1);
  check('a guest\'s copy of the world leaves that to the host', client && !g.tag.lodestoneTracker.target);
}

// --- the sound
{
  const gen = m.SOUNDS['item.lodestone_compass.lock'];
  check('the lock sound has two takes', gen?.variants === 2);
  const SR = 44100;
  const takes = [0, 1].map((v) => gen.generate(v, SR));
  const stats = takes.map((x) => analyze(x, SR));
  check('...each about a second long, sound and not clipped', stats.every((s) => s.dur > 0.8 && s.dur < 1.6 && !s.nan && !s.clip && s.peak > 0.5), stats.map((s) => s.dur.toFixed(2)).join(' '));
  // (the swell to the click near 0.17 s, then the ring still sounding half a second on)
  const rms = (x, t0, t1) => { let e = 0; const a = Math.round(t0 * SR), b = Math.round(t1 * SR); for (let i = a; i < b; i++) e += x[i] * x[i]; return Math.sqrt(e / (b - a)); };
  check('...a swell up to the click, and the ring after it, still sounding at half a second', takes.every((x) => rms(x, 0, 0.05) < rms(x, 0.1, 0.15) && rms(x, 0.15, 0.25) > rms(x, 0.1, 0.14) && rms(x, 0.5, 0.6) > rms(x, 0.15, 0.25) * 0.1));
  check('...and the two takes differ', takes[0].length !== takes[1].length || takes[0].some((v, i) => Math.abs(v - takes[1][i]) > 1e-3));
}

await exitWithStatus(close);
