// M2b: the vault, in a hand-made room. Set down facing whoever placed it, half lit and idle; a player within 4 blocks
// (creative too, not a spectator) lights it up, with something it may give spinning inside, a new roll each second,
// and sparks drawn to the keyhole; it goes idle again past 4.5. Its trial key, used on it, is taken, and its reward comes
// out of the top an item a second after a short pause, the sound rising as it runs out; that player is remembered and
// never rewarded by it again (another player still is). Anything else, a renamed key, or a rewarded player's key gets a
// refusing clunk, at most every 15 ticks. The ominous vault takes the ominous trial key and gives the ominous reward.
// The advancements Under Lock and Key and Revaulting, the 128 players it remembers, and saving.

import { load, check, flatLevel, place, prop, ticks, playerAt, rightClick, exitWithStatus } from './lib.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 300000).unref();

const { m, close } = await load(['/src/world/blockEntity.ts', '/src/game/vault.ts', '/src/game/trialSpawner.ts', '/src/game/loot.ts']);
const G = 64;
const stack = (id, n = 1) => new m.ItemStack(m.ITEMS.get(id), n);
const vstate = (level) => prop(m, level, 0, G, 0, 'vault_state');

function room(level, R = 10, H = 6) {
  const STONE = m.S('stone');
  for (let x = -R; x <= R; x++)
    for (let z = -R; z <= R; z++) {
      level.setBlock(x, G + H, z, STONE, 2);
      if (Math.abs(x) === R || Math.abs(z) === R) for (let y = G; y < G + H; y++) level.setBlock(x, y, z, STONE, 2);
    }
}

/** turn the player to look at (x, y, z) */
function lookAt(p, x, y, z) {
  const dx = x - p.x, dy = y - (p.y + p.eyeHeight), dz = z - p.z;
  p.yaw = (Math.atan2(dz, dx) * 180) / Math.PI - 90;
  p.pitch = (-Math.atan2(dy, Math.hypot(dx, dz)) * 180) / Math.PI;
}

function otherPlayer(level, x, y, z) {
  const p = new m.Player(level);
  p.moveTo(x, y, z, 0, 0);
  level.addEntity(p);
  return p;
}

function until(level, cond, max) {
  for (let i = 1; i <= max; i++) {
    level.tick();
    if (cond()) return i;
  }
  return -1;
}

/** use what `p` holds (in the main hand) on the vault, as a right click */
function useOnVault(level, p, held) {
  p.inventory.main[p.inventory.selected] = held;
  lookAt(p, 0.5, G + 0.5, 0.5);
  rightClick(m, level, p);
}

/** a vault at (0, G, 0) placed by a player at (0.5, G, 3.5) looking at it, in a room */
function setup(seed = 'vault') {
  const s = flatLevel(m, -2, -2, 2, 2, G, seed);
  room(s.level);
  const p = playerAt(m, s.level, 0.5, G, 3.5, { yaw: 180 });
  place(m, s.level, 'vault', 0, G, 0, { yaw: 180 });
  const be = s.level.world.getBlockEntity(0, G, 0);
  return { ...s, p, be };
}

const soundCount = (sounds, name) => sounds.filter((s) => s.name === `block.vault.${name}`).length;

// ---------------------------------------------------------------------------------------------------------------
// Placing, lighting up, going idle

{
  const { level, sounds, particles, p, be } = setup('light');
  check('place: a vault, facing the one who placed it, with its block entity', prop(m, level, 0, G, 0, 'facing') === 'south' && be instanceof m.VaultBlockEntity);
  check('place: the default config (vanilla VaultConfig.DEFAULT: the trial key, chests/trial_chambers/reward, 4 and 4.5)', be.config.keyItem === 'trial_key' && be.config.lootTable === 'chests/trial_chambers/reward' && be.config.activationRange === 4 && be.config.deactivationRange === 4.5);
  check('place: inactive, half lit (6)', vstate(level) === 'inactive' && m.EMISSION[level.getState(0, G, 0)] === 6);
  const n = until(level, () => vstate(level) === 'active', 21);
  check('activate: a player 3 blocks off lights it up within a second', n > 0 && m.EMISSION[level.getState(0, G, 0)] === 12, `${n}`);
  check('activate: its sound, smoke and small flames in the cage', soundCount(sounds, 'activate') === 1 && particles.some((q) => q.kind === 'small_flame'));
  check('activate: the player is connected', be.connectedPlayers.has(p.uuid));
  check('activate: something it may give shows inside', be.displayItem !== null);
  const shown = new Set();
  const objs = new Set();
  for (let i = 0; i < 200; i++) {
    level.tick();
    if (be.displayItem) {
      shown.add(be.displayItem.item.id);
      objs.add(be.displayItem);
    }
  }
  check('display: a new roll of its table every second', objs.size >= 9 && objs.size <= 11 && shown.size >= 3, `${objs.size} ${[...shown]}`);
  check('display: it spins 10 degrees a tick', Math.abs(((be.spin - be.oSpin + 540) % 360) - 180) === 10);
  const sparks = particles.filter((q) => q.kind === 'vault_connection');
  check('display: sparks from the keyhole (over its front face) toward the player, each second', sparks.length >= 20 && sparks.every((q) => q.x === 0.5 && q.y === G + 1.75 && q.z === 1 && q.dz > 0), `${sparks.length}`);
  // hysteresis: a player at 4 keeps it lit but wouldn't light it
  p.moveTo(0.5, G, 4.5, 0, 0);
  ticks(level, 40);
  check('range: at 4 blocks it stays lit (deactivation range 4.5)', vstate(level) === 'active');
  p.moveTo(0.5, G, 5.5, 0, 0);
  const k = until(level, () => vstate(level) === 'inactive', 21);
  check('range: at 5 it goes idle within a second, its sound and flames drifting out', k > 0 && soundCount(sounds, 'deactivate') === 1 && be.displayItem === null);
  p.moveTo(0.5, G, 4.5, 0, 0);
  ticks(level, 40);
  check('range: at 4 it doesn\'t light up again (activation range 4: closer than it)', vstate(level) === 'inactive');
  p.gameMode = 'creative';
  p.moveTo(0.5, G, 3.5, 0, 0);
  check('range: a creative player lights it up too (vanilla PlayerDetector.INCLUDING_CREATIVE_PLAYERS)', until(level, () => vstate(level) === 'active', 21) > 0);
  p.gameMode = 'spectator';
  check('range: a spectator doesn\'t', until(level, () => vstate(level) === 'inactive', 21) > 0);
  // no line of sight needed
  p.gameMode = 'survival';
  for (let x = -3; x <= 3; x++) for (let y = G; y < G + 4; y++) level.setBlock(x, y, 2, m.S('stone'), 2);
  check('range: nor does it need to see the player (a wall between)', until(level, () => vstate(level) === 'active', 21) > 0);
}

// ---------------------------------------------------------------------------------------------------------------
// The key, the reward, once per player

{
  const { level, sounds, particles, triggers, p, be } = setup('key');
  until(level, () => vstate(level) === 'active', 21);
  // (vanilla's last_insert_fail_timestamp starts at 0: no clunk in a world's first 15 ticks)
  ticks(level, 20);
  // the wrong thing first
  const stone = stack('stone', 5);
  useOnVault(level, p, stone);
  check('refuse: anything else gets the insert_item_fail clunk, kept (and not placed)', soundCount(sounds, 'insert_item_fail') === 1 && stone.count === 5 && vstate(level) === 'active' && level.getBlockName(0, G, 1) === 'air');
  useOnVault(level, p, stone);
  check('refuse: not again within 15 ticks', soundCount(sounds, 'insert_item_fail') === 1);
  ticks(level, 15);
  useOnVault(level, p, stone);
  check('refuse: ... but after', soundCount(sounds, 'insert_item_fail') === 2);
  const renamed = stack('trial_key');
  renamed.tag = { customName: 'Key' };
  ticks(level, 15);
  useOnVault(level, p, renamed);
  check('refuse: a renamed trial key won\'t do (vanilla: the same item with the same components)', soundCount(sounds, 'insert_item_fail') === 3 && renamed.count === 1 && vstate(level) === 'active');
  ticks(level, 15);
  useOnVault(level, p, stack('ominous_trial_key'));
  check('refuse: nor the ominous trial key', soundCount(sounds, 'insert_item_fail') === 4 && vstate(level) === 'active');
  // the key
  const keys = stack('trial_key', 2);
  const t0 = level.gameTime;
  useOnVault(level, p, keys);
  check('key: taken (one of two)', keys.count === 1);
  check('key: it unlocks, the insert_item sound', vstate(level) === 'unlocking' && soundCount(sounds, 'insert_item') === 1);
  const total = be.itemsToEject.length;
  check('key: its reward rolled: 2 to 5 stacks (a rare or common roll, 1 to 3 common, a unique a quarter of the time)', total >= 2 && total <= 5 && be.totalEjectionsNeeded === total, `${total}`);
  check('key: the player is remembered and no longer waited on', be.rewardedPlayers.includes(p.uuid) && !be.connectedPlayers.has(p.uuid));
  check('key: what comes out first shows inside', be.displayItem === be.itemsToEject[be.itemsToEject.length - 1]);
  const order = [...be.itemsToEject].reverse().map((s) => s.item.id);
  const items0 = level.entities.filter((e) => e.type === 'item').length;
  const n = until(level, () => vstate(level) === 'ejecting', 30);
  check('eject: 14 ticks on it starts ejecting (the open_shutter sound)', level.gameTime - t0 === 14 && soundCount(sounds, 'open_shutter') === 1, `${level.gameTime - t0} ${n}`);
  until(level, () => vstate(level) !== 'ejecting', 400);
  const ejects = sounds.filter((s) => s.name === 'block.vault.eject_item');
  check('eject: an item a second, the first 20 ticks after it opened', ejects.length === total && ejects.every((s, i) => s.t === t0 + 14 + 20 + 20 * i), JSON.stringify(ejects.map((s) => s.t - t0)));
  check('eject: the sound rises from 0.8 to 1.2 as it runs out', Math.abs(ejects[0].volume - 1) < 1e-9 && Math.abs(ejects[0].pitch - (total === 1 ? 1.2 : 0.8)) < 1e-6 && Math.abs(ejects.at(-1).pitch - 1.2) < 1e-6);
  const items = level.entities.filter((e) => e.type === 'item').slice(items0);
  check('eject: the items come out of its top, in order', items.map((e) => e.stack.item.id).join() === order.join() && items.every((e) => Math.abs(e.x - 0.5) < 1 && Math.abs(e.z - 0.5) < 1 && e.y > G + 0.9), JSON.stringify({ got: items.map((e) => [e.stack.item.id, e.x.toFixed(2), e.y.toFixed(2), e.z.toFixed(2)]), order }));
  check('eject: small flames and smoke with each (level event 3017)', particles.filter((q) => q.kind === 'small_flame').length >= total * 20);
  check('eject: 20 ticks after the last it closes (close_shutter) and, the player rewarded, goes idle', vstate(level) === 'inactive' && soundCount(sounds, 'close_shutter') === 1 && level.gameTime - ejects.at(-1).t === 20);
  check('eject: its reward all out, nothing shown', be.itemsToEject.length === 0 && be.totalEjectionsNeeded === 0 && be.displayItem === null);
  ticks(level, 40);
  check('once: the rewarded player standing by doesn\'t light it up', vstate(level) === 'inactive');
  const again = stack('trial_key');
  useOnVault(level, p, again);
  check('once: their next key on the idle vault does nothing (the click passes on)', again.count === 1 && vstate(level) === 'inactive');
  // another player lights it; the first player's key is refused
  const q = otherPlayer(level, 2.5, G, 2.5);
  check('once: another player lights it up', until(level, () => vstate(level) === 'active', 21) > 0 && be.connectedPlayers.has(q.uuid) && !be.connectedPlayers.has(p.uuid));
  useOnVault(level, p, again);
  check('once: the rewarded player\'s key gets reject_rewarded_player, kept', soundCount(sounds, 'reject_rewarded_player') === 1 && again.count === 1 && vstate(level) === 'active');
  q.inventory.main[0] = stack('trial_key');
  q.inventory.selected = 0;
  lookAt(q, 0.5, G + 0.5, 0.5);
  level.player = q;
  rightClick(m, level, q);
  level.player = p;
  check('once: the other player\'s key opens it for them', vstate(level) === 'unlocking' && be.rewardedPlayers.length === 2 && !(q.inventory.main[0]?.count > 0));
  // the advancements
  const adv = new m.PlayerAdvancements();
  for (const t of triggers.filter((x) => x.payload.usedOnBlock?.item !== 'trial_key')) adv.trigger(t.type, t.payload);
  check('advancement: no Under Lock and Key for stone or the ominous key', !adv.isDone(m.ADVANCEMENTS.get('adventure/under_lock_and_key')));
  const advRenamed = new m.PlayerAdvancements();
  const firstKey = triggers.find((x) => x.payload.usedOnBlock?.item === 'trial_key');
  advRenamed.trigger(firstKey.type, firstKey.payload);
  check('advancement: ... but a renamed trial key, refused, counts (vanilla: the click is taken, and the criterion only asks for the item)', triggers.indexOf(firstKey) === 3 && advRenamed.isDone(m.ADVANCEMENTS.get('adventure/under_lock_and_key')));
  const adv2 = new m.PlayerAdvancements();
  for (const t of triggers) adv2.trigger(t.type, t.payload);
  check('advancement: Under Lock and Key for a trial key on a vault', adv2.isDone(m.ADVANCEMENTS.get('adventure/under_lock_and_key')) && !adv2.isDone(m.ADVANCEMENTS.get('adventure/revaulting')));
  const renamedUse = triggers.find((t) => t.payload.usedOnBlock?.item === 'trial_key');
  check('advancement: the use is told with the vault\'s state (vanilla\'s ominous: false)', renamedUse?.payload.usedOnBlock.block === 'vault' && renamedUse.payload.usedOnBlock.props.ominous === false);
}

{
  // creative: the key isn't taken, but it's still once
  const { level, sounds, p, be } = setup('creative');
  p.gameMode = 'creative';
  until(level, () => vstate(level) === 'active', 21);
  const key = stack('trial_key');
  useOnVault(level, p, key);
  check('creative: the key isn\'t taken, the vault opens', key.count === 1 && vstate(level) === 'unlocking');
  until(level, () => vstate(level) === 'inactive', 400);
  const q = otherPlayer(level, -2.5, G, 2.5);
  until(level, () => vstate(level) === 'active', 21);
  useOnVault(level, p, key);
  check('creative: still once per player', soundCount(sounds, 'reject_rewarded_player') === 1);
  void q;
}

// ---------------------------------------------------------------------------------------------------------------
// The ominous vault

{
  const { level, sounds, particles, triggers, p, be } = setup('ominous');
  level.setBlock(0, G, 0, m.getBlock('vault').state({ facing: 'south', ominous: true }), 2);
  be.config = { ...m.OMINOUS_VAULT_CONFIG };
  until(level, () => vstate(level) === 'active', 21);
  ticks(level, 20);
  check('ominous: lights up with blue flames', particles.some((q) => q.kind === 'soul_fire_flame') && !particles.some((q) => q.kind === 'small_flame'));
  useOnVault(level, p, stack('trial_key'));
  check('ominous: a plain trial key is refused', soundCount(sounds, 'insert_item_fail') === 1 && vstate(level) === 'active');
  const key = stack('ominous_trial_key');
  useOnVault(level, p, key);
  check('ominous: the ominous trial key opens it', key.count === 0 && vstate(level) === 'unlocking');
  const got = be.itemsToEject.map((s) => s.item.id);
  const OMINOUS = new Set(['emerald', 'wind_charge', 'tipped_arrow', 'diamond', 'ominous_bottle', 'emerald_block', 'iron_block', 'crossbow', 'golden_apple', 'diamond_axe', 'diamond_chestplate', 'enchanted_book', 'diamond_block', 'enchanted_golden_apple', 'flow_armor_trim_smithing_template', 'flow_banner_pattern', 'music_disc_creator', 'heavy_core']);
  check('ominous: its reward is from reward_ominous', got.length >= 2 && got.every((id) => OMINOUS.has(id)), got.join(','));
  const adv = new m.PlayerAdvancements();
  for (const t of triggers) adv.trigger(t.type, t.payload);
  check('advancement: Revaulting for the ominous trial key on an ominous vault', adv.isDone(m.ADVANCEMENTS.get('adventure/revaulting')));
  check('advancement: not Under Lock and Key for a plain key on an ominous vault', !adv.isDone(m.ADVANCEMENTS.get('adventure/under_lock_and_key')));
}

{
  // the odds of the reward: a unique roll a quarter of the time (vanilla random_chance 0.25), 3 in 4 for ominous; its
  // items the game doesn't have yet (the trim templates) roll nothing
  const odds = (table, unique, chance) => {
    const r = new m.Rand(42);
    const weights = { ...unique };
    const have = Object.entries(weights).filter(([id]) => m.ITEMS.get(id)).reduce((a, [, w]) => a + w, 0);
    const all = Object.values(weights).reduce((a, w) => a + w, 0);
    let n = 0, sizes = 0;
    const N = 4000;
    for (let i = 0; i < N; i++) {
      const got = m.rollLoot(table, r);
      sizes += got.length;
      if (got.some((s) => s.item.id in weights && s.item.id !== 'golden_apple' && s.item.id !== 'enchanted_golden_apple' && s.item.id !== 'heavy_core')) n++;
    }
    const noApples = Object.entries(weights).filter(([id]) => m.ITEMS.get(id) && !['golden_apple', 'enchanted_golden_apple', 'heavy_core'].includes(id)).reduce((a, [, w]) => a + w, 0);
    return { n: n / N, wantN: (chance * noApples) / all, size: sizes / N, wantSize: 1 + 2 + (chance * have) / all };
  };
  const a = odds('chests/trial_chambers/reward', { golden_apple: 4, bolt_armor_trim_smithing_template: 3, guster_banner_pattern: 2, music_disc_precipice: 2, trident: 1 }, 0.25);
  check('reward: a unique item a quarter of the time (vanilla random_chance 0.25)', Math.abs(a.n - a.wantN) < 0.02, `${a.n.toFixed(3)} vs ${a.wantN.toFixed(3)}`);
  check('reward: 2 to 5 stacks, 1 + 2 + the unique on average', Math.abs(a.size - a.wantSize) < 0.06, `${a.size.toFixed(3)} vs ${a.wantSize.toFixed(3)}`);
  // (the ominous unique pool's golden apples and heavy core come from elsewhere too: only the rest are counted)
  const b = odds('chests/trial_chambers/reward_ominous', { enchanted_golden_apple: 3, flow_armor_trim_smithing_template: 3, flow_banner_pattern: 2, music_disc_creator: 1, heavy_core: 1 }, 0.75);
  check('reward: ominous: a unique item three times in four', Math.abs(b.n - b.wantN) < 0.025, `${b.n.toFixed(3)} vs ${b.wantN.toFixed(3)}`);
  check('reward: ominous: 1 + 2 + the unique stacks on average', Math.abs(b.size - b.wantSize) < 0.06, `${b.size.toFixed(3)} vs ${b.wantSize.toFixed(3)}`);
}

// ---------------------------------------------------------------------------------------------------------------
// Remembering 128 players, saving

{
  const { level, be } = setup('many');
  for (let i = 0; i < 130; i++) be.rewardedPlayers.push(`p${i}`);
  // (as addToRewardedPlayers keeps it)
  while (be.rewardedPlayers.length > 128) be.rewardedPlayers.shift();
  check('remember: the last 128 (vanilla MAX_REWARD_PLAYERS)', be.rewardedPlayers.length === 128 && be.rewardedPlayers[0] === 'p2');
  const saved = JSON.parse(JSON.stringify(be.save()));
  const b2 = m.loadBlockEntity(saved);
  check('save: its rewarded players come back', b2.rewardedPlayers.length === 128 && b2.rewardedPlayers[127] === 'p129');
  void level;
}

{
  const { level, p, be } = setup('save');
  until(level, () => vstate(level) === 'active', 21);
  useOnVault(level, p, stack('trial_key'));
  ticks(level, 30);
  const saved = JSON.parse(JSON.stringify(be.save()));
  const b2 = m.loadBlockEntity(saved);
  check('save: mid-ejection, what\'s left to come out and when come back', b2.itemsToEject.length === be.itemsToEject.length && b2.itemsToEject.every((s, i) => s.item.id === be.itemsToEject[i].item.id && s.count === be.itemsToEject[i].count) && b2.totalEjectionsNeeded === be.totalEjectionsNeeded && b2.stateUpdatingResumesAt === be.stateUpdatingResumesAt);
  check('save: the display item and connected players too', b2.displayItem?.item.id === be.displayItem?.item.id && b2.connectedPlayers.size === be.connectedPlayers.size);
  const b3 = m.loadBlockEntity({ id: 'vault', x: 0, y: 0, z: 0, items: [], data: { config: JSON.stringify({ loot_table: 'minecraft:chests/trial_chambers/reward_ominous', key_item: { id: 'minecraft:ominous_trial_key', count: 1 } }) } });
  check('save: a structure\'s vanilla config reads in (ominous key and table, default ranges)', b3.config.lootTable === 'chests/trial_chambers/reward_ominous' && b3.config.keyItem === 'ominous_trial_key' && b3.config.activationRange === 4);
}

exitWithStatus(close);
