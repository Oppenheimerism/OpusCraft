// Headless checks for the armour stand (node tests/survival-blocks/armor-stand.mjs): the item (sixteen to a stack, its
// sprite, the functional blocks), its recipe (six sticks round a smooth stone slab, found by holding the slab);
// placing it (on the block clicked or in one that's built over, turned to face the placer to the nearest eighth, on a
// slab's top, not where a block or any entity is, not on a block's underside, not in adventure mode; its sound,
// ENTITY_PLACE, one used, its name from the item); dressing it (armour to its slot, one off a stack, swapped, a copy
// in creative, taken off by where it's clicked, a hand only with its arms shown, a shield to the off hand, a pumpkin
// and a head on the head; DisabledSlots; a name tag; a marker ignores it all); breaking it (two quick blows, a shake
// between them, a creative blow, an adventurer's does nothing, an arrow at once, a blast leaves only its gear, an
// invisible or invulnerable one; the drops, its name kept, doTileDrops); fire burning it down; falling (the clatter
// from high up, no damage, NoGravity, a marker stays put); /summon's entity data; dispensers; saving; the sounds; and
// drawing it (the parts in their poses, the arms, the plate, invisible, small, what it wears and holds).
import { load, check, exitWithStatus, flatLevel } from '../redstone2/lib.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 240000).unref();

const { m, close } = await load([
  '/src/entity/player.ts', '/src/game/interaction.ts', '/src/entity/armorStand.ts', '/src/game/itemBehavior.ts', '/src/inventory/recipeBook.ts',
  '/src/textures/items.ts', '/src/audio/synth.ts', '/src/game/spawner.ts', '/src/game/commands.ts', '/src/entity/arrow.ts', '/src/game/explosion.ts',
  '/src/render/armorStandRenderer.ts', '/src/render/entityRenderer.ts', '/src/render/model.ts', '/src/item/inventory.ts', '/src/game/redstone/dispenseItems.ts',
  '/src/entity/minecart.ts', '/src/core/math.ts',
]);
const { ItemStack } = m;
const G = 64;
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;

// ---------------------------------------------------------------------------
// the item, the recipe, the names
{
  const it = m.ITEMS.get('armor_stand');
  check('item: sixteen to a stack, its sprite, the functional blocks', it?.maxStack === 16 && it.texture === 'armor_stand' && it.creativeTab === 'functional' && m.ITEM_TEXTURES['armor_stand']?.().w === 16);
  const r = m.RECIPES.filter((x) => x.result === 'armor_stand');
  check('recipe: six sticks round a smooth stone slab, one made', r.length === 1 && r[0].pattern.join('|') === '///| / |/_/' && r[0].key['/'] === 'stick' && r[0].key._ === 'smooth_stone_slab' && r[0].count === 1);
  const grid = (cells) => {
    const g = new Array(9).fill(null);
    for (const [i, id] of cells) g[i] = ItemStack.of(id);
    return g;
  };
  const full = [[0, 'stick'], [1, 'stick'], [2, 'stick'], [4, 'stick'], [6, 'stick'], [7, 'smooth_stone_slab'], [8, 'stick']];
  check('recipe: made on a table', m.findRecipe(grid(full), 3, 3)?.result === 'armor_stand');
  check('recipe: not with a stone slab, not missing a stick', m.findRecipe(grid(full.map(([i, id]) => [i, id === 'smooth_stone_slab' ? 'stone_slab' : id])), 3, 3)?.result !== 'armor_stand' && m.findRecipe(grid(full.slice(1)), 3, 3)?.result !== 'armor_stand');
  const book = m.BOOK_BY_ID.get('armor_stand');
  check('recipe book: found by holding a smooth stone slab (not the sticks), with the misc', !!book && [...book.unlockBy].join() === 'smooth_stone_slab' && book.category === 'crafting_misc', `${book && [...book.unlockBy]} ${book?.category}`);
  check('names: summonable, "Armor Stand"', m.summonableTypes().includes('armor_stand') && m.entityDisplayName('armor_stand') === 'Armor Stand');
}

// ---------------------------------------------------------------------------
// a level to stand them in
const { level, sounds } = flatLevel(m, -2, -2, 3, 3);
const events = [];
const gameEvent = level.gameEvent.bind(level);
level.gameEvent = (e, x, y, z, ctx) => {
  events.push({ e, entity: ctx?.entity, x, y, z });
  gameEvent(e, x, y, z, ctx);
};
const p = new m.Player(level);
p.setGameMode('survival');
p.moveTo(0.5, G, 0.5, 0, 0);
level.player = p;
level.addEntity(p);
const inter = new m.Interaction(level, p);
const heard = (n) => sounds.filter((s) => s.name === n).length;
const lastSound = (n) => [...sounds].reverse().find((s) => s.name === n);
const stands = () => level.entities.filter((e) => e.type === 'armor_stand' && !e.removed);
const drops = () => level.entities.filter((e) => e.type === 'item' && !e.removed);
const clearDrops = () => drops().forEach((e) => e.remove());
const hold = (s) => {
  p.inventory.main[0] = s;
  p.inventory.selected = 0;
  p.inventory.offhand = null;
};
const tick = (n = 1) => {
  for (let i = 0; i < n; i++) level.tick();
};
/** a stand of our own, stood at (x, G, z) facing north (the player's way), already ticked */
function stand(x = 0.5, z = 2.5, f = (s) => s) {
  const s = new m.ArmorStand(level);
  s.moveTo(x, G, z, 180, 0);
  f(s);
  level.addEntity(s);
  s.tickCount = 5;
  return s;
}
/** the player 2 blocks north of `s`, looking at the point `h` up its front */
function aimAt(s, h) {
  p.moveTo(s.x, G, s.z - 2, 0, 0);
  const ey = p.y + p.eyeHeight;
  p.pitch = (Math.atan2(ey - (s.y + h), s.bb.minZ - p.z) * 180) / Math.PI;
  p.pitchO = p.pitch;
}
/** a right-click at what's looked at */
function useAt() {
  p.swinging = false;
  inter.pick(p.x, p.y + p.eyeHeight, p.z, p.yaw, p.pitch);
  inter.use(true, true);
  inter.rightClickDelay = 0;
}
/** a left-click at what's looked at */
function attackAt() {
  p.swinging = false;
  inter.pick(p.x, p.y + p.eyeHeight, p.z, p.yaw, p.pitch);
  inter.startAttack();
}
const hitOn = (x, y, z, face = 1) => ({ x, y, z, face, state: level.getState(x, y, z), dist: 1 });
const place = (hit, st = ItemStack.of('armor_stand')) => {
  hold(st);
  return m.itemBehaviorOf('armor_stand').useOn(level, p, st, hit);
};

// ---------------------------------------------------------------------------
// placing it
{
  hold(ItemStack.of('armor_stand', 3));
  p.moveTo(0.5, G, 0.5, 0, 0);
  // (looking down at the top of the ground two blocks south)
  p.pitch = (Math.atan2(p.eyeHeight, 2) * 180) / Math.PI;
  const e0 = events.length, s0 = heard('entity.armor_stand.place');
  p.swinging = false;
  inter.pick(p.x, p.y + p.eyeHeight, p.z, p.yaw, p.pitch);
  inter.use(true, true);
  inter.rightClickDelay = 0;
  const st = stands()[0];
  check('placed: on the top of the ground clicked, in the middle of the block', stands().length === 1 && near(st.x, 0.5) && near(st.y, G) && near(st.z, 2.5), st && `${st.x} ${st.y} ${st.z}`);
  check('placed: turned to face the placer (north, the player looking south)', st && near(Math.abs(st.yaw), 180) && near(st.bodyYaw, st.yaw));
  const snd = lastSound('entity.armor_stand.place');
  check('placed: its sound at 0.75, pitch 0.8', heard('entity.armor_stand.place') === s0 + 1 && snd.volume === 0.75 && snd.pitch === 0.8);
  check('placed: ENTITY_PLACE by the player, one used, the hand swung', events.slice(e0).some((e) => e.e === 'entity_place' && e.entity === p) && p.inventory.main[0]?.count === 2 && p.swinging);
  check('placed: a stand as it comes (no arms, a base plate, full size, 20 health)', st && !st.showArms && !st.noBasePlate && !st.small && !st.marker && near(st.width, 0.5) && near(st.height, 1.975) && st.health === 20);
  st.remove();
  // the turn, to the nearest eighth
  // (the placer's yaw less 180, wrapped, to the eighth below it plus half: vanilla floor((wrap(yaw - 180) + 22.5) / 45))
  const turns = [[0, -180], [30, -135], [-30, 135], [100, -90], [-112, 90], [180, 0], [205, 45], [-170, 0]];
  const got = [];
  for (const [yaw] of turns) {
    p.yaw = yaw;
    place(hitOn(4, G - 1, 4));
    const s = stands().pop();
    got.push(s ? m.wrapDegrees(s.yaw) : null);
    s?.remove();
  }
  p.yaw = 0;
  check('placed: turned to the nearest eighth toward the placer', got.every((y, i) => y !== null && near(m.wrapDegrees(y - turns[i][1]), 0)), got.join());
  // where it can't go
  level.world.setState(4, G + 1, 4, m.S('stone'));
  check('not placed: a block in the way (its box two high)', place(hitOn(4, G - 1, 4)) === 'fail' && stands().length === 0);
  level.world.setState(4, G + 1, 4, 0);
  const item = new m.ItemEntity(level, ItemStack.of('dirt'));
  item.moveTo(4.5, G, 4.5, 0, 0);
  level.addEntity(item);
  check('not placed: where any entity is (a dropped item too)', place(hitOn(4, G - 1, 4)) === 'fail' && stands().length === 0);
  item.remove();
  check('not placed: on a block\'s underside', place(hitOn(4, G + 3, 4, 0)) === 'fail' && stands().length === 0);
  p.setGameMode('adventure');
  check('not placed: in adventure mode (passed on)', place(hitOn(4, G - 1, 4)) === 'pass' && stands().length === 0);
  p.setGameMode('creative');
  const cs = ItemStack.of('armor_stand', 2);
  place(hitOn(4, G - 1, 4), cs);
  check('placed in creative: none used', stands().length === 1 && cs.count === 2);
  stands().forEach((s) => s.remove());
  p.setGameMode('survival');
  // in grass (built over), on a slab
  level.world.setState(3, G, 5, m.S('short_grass'));
  place(hitOn(3, G, 5, 2));
  const g = stands()[0];
  check('placed: in the grass clicked (it\'s built over), whatever face', !!g && near(g.x, 3.5) && near(g.y, G) && near(g.z, 5.5));
  g?.remove();
  level.world.setState(3, G, 5, 0);
  level.world.setState(-1, G, 5, m.S('smooth_stone_slab'));
  place(hitOn(-1, G, 5, 1));
  const sl = stands()[0];
  check('placed: on a slab\'s top, half a block up', !!sl && near(sl.y, G + 0.5), sl && `${sl.y}`);
  sl?.remove();
  level.world.setState(-1, G, 5, 0);
  // on the side of a block in the air: a block lower (vanilla's offset looks two blocks down), then down it falls
  level.world.setState(-2, G + 4, -2, m.S('stone'));
  place(hitOn(-2, G + 4, -2, 5));
  const air = stands()[0];
  check('placed: on a block\'s side in the air, a block lower', !!air && near(air.y, G + 3) && near(air.x, -0.5), air && `${air.x} ${air.y}`);
  tick(40);
  check('placed: and it falls to the ground', !!air && near(air.y, G) && air.onGround, air && `${air.y}`);
  air?.remove();
  level.world.setState(-2, G + 4, -2, 0);
  const named = ItemStack.of('armor_stand');
  named.tag = { customName: 'Hat Stand' };
  place(hitOn(4, G - 1, 4), named);
  const ns = stands()[0];
  check('placed: named as its item is', ns?.customName === 'Hat Stand' && !ns.customNameVisible);
  ns?.remove();
}

// ---------------------------------------------------------------------------
// dressing it
{
  const s = stand();
  const e0 = events.length;
  hold(ItemStack.of('iron_chestplate'));
  aimAt(s, 1.2);
  useAt();
  check('dressed: a chestplate goes on its chest, from the hand, the hand swung', s.armorItems[2]?.item.id === 'iron_chestplate' && !p.inventory.main[0] && p.swinging);
  check('dressed: the iron\'s equip sound, and EQUIP', lastSound('item.armor.equip_iron') && events.slice(e0).some((e) => e.e === 'equip'));
  hold(ItemStack.of('golden_helmet', 3));
  useAt();
  check('dressed: one helmet off a stack goes on its head (wherever clicked)', s.armorItems[3]?.item.id === 'golden_helmet' && s.armorItems[3].count === 1 && p.inventory.main[0]?.count === 2);
  useAt();
  check('dressed: a stack against a worn helmet: nothing (the click spent, no swing)', p.inventory.main[0]?.count === 2 && !p.swinging && s.armorItems[3].count === 1);
  hold(ItemStack.of('diamond_chestplate'));
  useAt();
  check('dressed: a single piece swaps with the worn one', s.armorItems[2]?.item.id === 'diamond_chestplate' && p.inventory.main[0]?.item.id === 'iron_chestplate');
  hold(ItemStack.of('leather_boots'));
  useAt();
  hold(ItemStack.of('chainmail_leggings'));
  useAt();
  check('dressed: boots and leggings on', s.armorItems[0]?.item.id === 'leather_boots' && s.armorItems[1]?.item.id === 'chainmail_leggings');
  // taken off by where it's clicked
  const off = (h) => {
    hold(null);
    aimAt(s, h);
    const e1 = events.length;
    useAt();
    const got = p.inventory.main[0]?.item.id ?? null;
    return [got, events.slice(e1).some((e) => e.e === 'unequip')];
  };
  const [feet, unequip] = off(0.3);
  check('undressed: clicked low down, the boots come off into the hand (UNEQUIP)', feet === 'leather_boots' && !s.armorItems[0] && unequip && p.swinging);
  check('undressed: at the knees, the leggings', off(0.7)[0] === 'chainmail_leggings' && !s.armorItems[1]);
  check('undressed: at the chest, the chestplate', off(1.3)[0] === 'diamond_chestplate' && !s.armorItems[2]);
  check('undressed: at the top, the helmet', off(1.8)[0] === 'golden_helmet' && !s.armorItems[3]);
  hold(null);
  aimAt(s, 1.3);
  useAt();
  check('undressed: nothing there, nothing happens (no swing)', !p.inventory.main[0] && !p.swinging);
  // hands
  hold(ItemStack.of('iron_sword'));
  p.inventory.offhand = ItemStack.of('bread');
  useAt();
  check('hands: no arms, a sword isn\'t taken (the click spent: the off hand\'s bread not eaten either)', !s.mainHand && p.inventory.main[0]?.item.id === 'iron_sword' && p.inventory.offhand?.count === 1 && !p.isUsingItem() && !p.swinging);
  p.inventory.offhand = null;
  s.showArms = true;
  useAt();
  check('hands: arms shown, the sword goes in its (right) hand', s.mainHand?.item.id === 'iron_sword' && !p.inventory.main[0]);
  hold(ItemStack.of('shield'));
  useAt();
  check('hands: a shield goes in its off hand', s.offHand?.item.id === 'shield' && !p.inventory.main[0]);
  hold(null);
  aimAt(s, 1.3);
  useAt();
  check('hands: an empty hand at the chest (nothing worn) takes what its hand holds', p.inventory.main[0]?.item.id === 'iron_sword' && !s.mainHand);
  hold(null);
  useAt();
  check('hands: then (its main hand empty) the off hand\'s', p.inventory.main[0]?.item.id === 'shield' && !s.offHand);
  hold(ItemStack.of('carved_pumpkin'));
  useAt();
  hold(ItemStack.of('elytra'));
  useAt();
  check('worn: a carved pumpkin on the head, an elytra on the chest', s.armorItems[3]?.item.id === 'carved_pumpkin' && s.armorItems[2]?.item.id === 'elytra');
  s.setItemSlot('head', null);
  hold(ItemStack.of('skeleton_skull'));
  useAt();
  check('worn: a head on the head', s.armorItems[3]?.item.id === 'skeleton_skull');
  // creative
  p.setGameMode('creative');
  s.setItemSlot('head', null);
  const cp = ItemStack.of('netherite_helmet');
  hold(cp);
  useAt();
  check('creative: a copy goes on, the helmet kept', s.armorItems[3]?.item.id === 'netherite_helmet' && p.inventory.main[0] === cp && cp.count === 1);
  hold(null);
  aimAt(s, 1.8);
  useAt();
  check('creative: taken off into the empty hand', p.inventory.main[0]?.item.id === 'netherite_helmet' && !s.armorItems[3]);
  p.setGameMode('survival');
  // DisabledSlots: the head (4) disabled outright; the chest (3) can't be taken (+8); the feet (1) can't be put (+16)
  s.disabledSlots = (1 << 4) | (1 << (3 + 8)) | (1 << (1 + 16));
  s.setItemSlot('chest', ItemStack.of('iron_chestplate'));
  hold(ItemStack.of('iron_helmet'));
  useAt();
  check('disabled: the head can\'t be dressed', !s.armorItems[3] && p.inventory.main[0]?.item.id === 'iron_helmet' && !p.swinging);
  hold(null);
  aimAt(s, 1.3);
  useAt();
  check('disabled: the chestplate can\'t be taken', s.armorItems[2]?.item.id === 'iron_chestplate' && !p.inventory.main[0]);
  hold(ItemStack.of('iron_boots'));
  useAt();
  check('disabled: boots can\'t be put on', !s.armorItems[0] && p.inventory.main[0]?.item.id === 'iron_boots');
  hold(ItemStack.of('diamond_chestplate'));
  useAt();
  check('disabled: nor the chestplate swapped (it can\'t be taken)', s.armorItems[2]?.item.id === 'iron_chestplate' && p.inventory.main[0]?.item.id === 'diamond_chestplate');
  s.disabledSlots = 0;
  // a name tag
  const tag = ItemStack.of('name_tag');
  tag.tag = { customName: 'Sir Stand' };
  hold(tag);
  useAt();
  check('name tag: named, the tag used up, its name not shown', s.customName === 'Sir Stand' && !p.inventory.main[0] && !s.customNameVisible);
  hold(ItemStack.of('name_tag'));
  useAt();
  check('name tag: a blank one does nothing', s.customName === 'Sir Stand' && p.inventory.main[0]?.item.id === 'name_tag');
  // a marker: not there to click (a stick, which it would take in its hand if it were)
  s.showArms = true;
  s.setItemSlot('mainhand', null);
  s.setMarker(true);
  hold(ItemStack.of('stick'));
  useAt();
  check('marker: not picked, not dressed', !s.isPickable() && inter.entityHit !== s && !s.mainHand && p.inventory.main[0]?.item.id === 'stick');
  check('marker: its own interact passes too', s.playerInteract(p, p.inventory.main[0]) === false && !s.mainHand);
  s.remove();
}

// ---------------------------------------------------------------------------
// breaking it
{
  clearDrops();
  const s = stand(0.5, 2.5, (x) => x.setCustomName('Sir Stand'));
  s.setItemSlot('head', ItemStack.of('iron_helmet'));
  s.showArms = true;
  s.setItemSlot('mainhand', ItemStack.of('stick'));
  hold(null);
  aimAt(s, 1);
  const e0 = events.length, h0 = heard('entity.armor_stand.hit');
  tick(10);
  attackAt();
  const hs = lastSound('entity.armor_stand.hit');
  check('struck: it shakes (the knock at 0.3), ENTITY_DAMAGE, still standing', !s.removed && heard('entity.armor_stand.hit') === h0 + 1 && hs.volume === 0.3 && s.lastHit === level.gameTime && events.slice(e0).some((e) => e.e === 'entity_damage' && e.entity === p));
  check('struck: no harm done', s.health === 20);
  tick(8);
  attackAt();
  check('struck again after five ticks: only shakes again', !s.removed && heard('entity.armor_stand.hit') === h0 + 2 && s.lastHit === level.gameTime);
  tick(3);
  const b0 = heard('entity.armor_stand.break'), e1 = events.length;
  attackAt();
  check('struck twice in quick succession: broken (its sound, ENTITY_DIE)', s.removed && heard('entity.armor_stand.break') === b0 + 1 && events.slice(e1).some((e) => e.e === 'entity_die'));
  const d = drops().map((e) => e.stack);
  const standItem = d.find((x) => x.item.id === 'armor_stand');
  check('broken: drops itself (its name kept), its helmet and what it held', !!standItem && standItem.tag?.customName === 'Sir Stand' && d.some((x) => x.item.id === 'iron_helmet') && d.some((x) => x.item.id === 'stick') && d.length === 3, d.map((x) => x.item.id).join());
  clearDrops();
  // creative, adventure
  const c = stand();
  c.setItemSlot('head', ItemStack.of('iron_helmet'));
  p.setGameMode('creative');
  aimAt(c, 1);
  attackAt();
  check('creative: one blow breaks it, dropping nothing', c.removed && drops().length === 0 && lastSound('entity.armor_stand.break'));
  p.setGameMode('adventure');
  const a = stand();
  aimAt(a, 1);
  const n0 = heard('entity.player.attack.nodamage');
  attackAt();
  tick(2);
  attackAt();
  check('adventure: blows do nothing (no damage)', !a.removed && heard('entity.player.attack.nodamage') === n0 + 2 && a.lastHit < 0);
  p.setGameMode('survival');
  a.remove();
  // an arrow; a blast
  const t = stand(2.5, 2.5);
  t.setItemSlot('feet', ItemStack.of('iron_boots'));
  const arrow = new m.Arrow(level, p);
  arrow.moveTo(2.5, G + 1, 0.5, 0, 0);
  arrow.shoot(0, 0, 1, 1.5, 0);
  level.addEntity(arrow);
  tick(6);
  const ad = drops().map((e) => e.stack.item.id);
  check('an arrow: breaks it at once, dropping it and its boots', t.removed && ad.includes('armor_stand') && ad.includes('iron_boots'), ad.join());
  clearDrops();
  const x = stand(-1.5, 2.5);
  x.setItemSlot('chest', ItemStack.of('golden_chestplate'));
  // (the player well out of the blasts)
  p.moveTo(40.5, G, 40.5, 0, 0);
  m.explode(level, null, -1.5, G, 3.5, 3, false, 'none');
  const xd = drops().map((e) => e.stack.item.id);
  check('a blast: breaks it, dropping its gear but not itself', x.removed && xd.includes('golden_chestplate') && !xd.includes('armor_stand'), xd.join());
  clearDrops();
  // invisible, invulnerable
  const iv = stand(0.5, 2.5, (q) => (q.invisible = true));
  aimAt(iv, 1);
  attackAt();
  tick(2);
  attackAt();
  check('invisible: blows do nothing', !iv.removed && iv.isInvisible() && iv.isPickable());
  p.moveTo(40.5, G, 40.5, 0, 0);
  m.explode(level, null, 0.5, G, 3.5, 3, false, 'none');
  check('invisible: nor a blast (nor is it moved)', !iv.removed && near(iv.dx, 0) && near(iv.dz, 0));
  iv.hurt(Number.MAX_VALUE / 2, 'genericKill');
  check('invisible: /kill takes it (nothing dropped)', iv.removed && drops().length === 0);
  const inv = stand(0.5, 2.5, (q) => (q.invulnerable = true));
  aimAt(inv, 1);
  attackAt();
  tick(2);
  attackAt();
  check('invulnerable: a survival player\'s blows do nothing', !inv.removed);
  p.setGameMode('creative');
  attackAt();
  check('invulnerable: a creative player\'s breaks it', inv.removed);
  p.setGameMode('survival');
  // doTileDrops (vanilla Block.popResource asks it)
  level.gameRules.doTileDrops = false;
  const nd = stand();
  nd.setItemSlot('head', ItemStack.of('iron_helmet'));
  aimAt(nd, 1);
  attackAt();
  tick(1);
  attackAt();
  check('doTileDrops off: broken, nothing dropped', nd.removed && drops().length === 0);
  level.gameRules.doTileDrops = true;
  // the void
  const v = stand();
  v.moveTo(0.5, level.world.dim.minY - 70, 2.5);
  tick(1);
  check('the void: gone', v.removed);
}

// ---------------------------------------------------------------------------
// fire and falls
{
  clearDrops();
  const f = stand(0.5, 2.5);
  f.setItemSlot('head', ItemStack.of('leather_helmet'));
  f.igniteForSeconds(10);
  tick(1);
  const h1 = f.health;
  tick(20);
  check('alight: burning takes 4 a second (ENTITY_DAMAGE)', f.isOnFire() && near(h1, 16) && near(f.health, 12) && events.some((e) => e.e === 'entity_damage'), `${h1} ${f.health}`);
  tick(80);
  const fd = drops().map((e) => e.stack.item.id);
  check('alight: burnt down in five seconds, its gear dropped, not itself', f.removed && fd.includes('leather_helmet') && !fd.includes('armor_stand'), `${f.health} ${fd.join()}`);
  clearDrops();
  const fire = stand(2.5, 0.5);
  level.world.setState(2, G, 0, m.S('fire'));
  tick(2);
  check('in fire: set alight', fire.isOnFire() && !fire.removed);
  tick(200);
  check('in fire: burnt down', fire.removed);
  level.world.setState(2, G, 0, 0);
  clearDrops();
  const high = stand(-1.5, 0.5);
  high.moveTo(-1.5, G + 6, 0.5);
  const f0 = heard('entity.armor_stand.fall');
  tick(40);
  check('falling: down to the ground from six blocks, landing with a clatter, unharmed', near(high.y, G) && heard('entity.armor_stand.fall') === f0 + 1 && high.health === 20 && !high.removed);
  high.moveTo(-1.5, G + 2, 0.5);
  tick(30);
  check('falling: from two blocks, no clatter', near(high.y, G) && heard('entity.armor_stand.fall') === f0 + 1);
  high.noGravityFlag = true;
  high.moveTo(-1.5, G + 3, 0.5);
  high.dy = 0;
  tick(20);
  check('NoGravity: stays up', near(high.y, G + 3));
  high.noGravityFlag = false;
  high.setMarker(true);
  tick(20);
  check('a marker: stays put (no box, no moving)', near(high.y, G + 3) && high.bb.maxY - high.bb.minY === 0);
  high.remove();
  // not pushed about; small
  const sm = stand(1.5, -1.5, (q) => q.setSmall(true));
  check('small: half size (0.25 x 0.9875)', near(sm.width, 0.25) && near(sm.height, 0.9875) && near(sm.eyeHeight, 0.9875));
  check('not pushable, not a target, no potions', !sm.isPushable() && !sm.canBeSeenAsEnemy() && !sm.isAffectedByPotions() && sm.pickResult() === 'armor_stand');
  sm.remove();
}

// ---------------------------------------------------------------------------
// /summon's entity data
{
  const chats = [];
  const game = { meta: { allowCommands: true }, chat: (t) => chats.push(t), player: p, playerName: 'Tester', level, world: level.world, sound: { play() {} } };
  p.moveTo(0.5, G, 0.5, 0, 0);
  m.executeCommand(game, 'summon minecraft:armor_stand ~ ~ ~2 {Small:1b,ShowArms:1b,NoBasePlate:1b,Invisible:1b,NoGravity:1b,Pose:{Head:[10f,20f,30f],RightArm:[-90f,0f,400f],LeftLeg:[5f,0f,0f]},ArmorItems:[{},{},{},{id:"minecraft:diamond_helmet",count:1}],HandItems:[{id:"minecraft:iron_sword",count:1},{}],DisabledSlots:4144959,CustomName:\'"Bob"\',CustomNameVisible:1b,Rotation:[90f,0f]}');
  const s = stands().pop();
  check('summon: the flags', !!s && s.small && s.showArms && s.noBasePlate && s.invisible && s.noGravityFlag && !s.marker, chats.join(' | '));
  check('summon: the pose (each part, modulo 360; the rest as they come)', !!s && s.headPose.join() === '10,20,30' && s.rightArmPose.join() === '-90,0,40' && s.leftLegPose.join() === '5,0,0' && s.leftArmPose.join() === '-10,0,-10' && s.bodyPose.join() === '0,0,0');
  check('summon: the gear, DisabledSlots, the name shown, turned by Rotation', !!s && s.armorItems[3]?.item.id === 'diamond_helmet' && s.mainHand?.item.id === 'iron_sword' && s.disabledSlots === 4144959 && s.customName === 'Bob' && s.customNameVisible && near(s.yaw, 90) && near(s.bodyYaw, 90));
  check('summon: small, half the box', !!s && near(s.bb.maxY - s.bb.minY, 0.9875) && near(s.y, G) && near(s.z, 2.5));
  s?.remove();
  m.executeCommand(game, 'summon armor_stand ~ ~ ~ {Marker:1b}');
  const mk = stands().pop();
  check('summon: a marker has no box and isn\'t picked', !!mk && mk.marker && mk.width === 0 && mk.height === 0 && !mk.isPickable());
  mk?.remove();
  m.executeCommand(game, 'summon armor_stand ~ ~ ~');
  const plain = stands().pop();
  check('summon: without data, facing south, as it comes', !!plain && near(plain.yaw, 0) && !plain.showArms && plain.leftArmPose.join() === '-10,0,-10');
  plain?.remove();
}

// ---------------------------------------------------------------------------
// dispensers
{
  const dispense = (stack, facing, x = 2, y = G, z = -2) => {
    const src = { level, x, y, z, facing, be: { addItem: () => -1 }, success: false };
    return m.dispenseBehaviorFor(stack)(src, stack);
  };
  const out = dispense(ItemStack.of('armor_stand', 2), m.SOUTH);
  const d = stands().pop();
  check('dispenser: a stand stood in front, facing out, one used', !!d && near(d.x, 2.5) && near(d.y, G) && near(d.z, -0.5) && near(m.wrapDegrees(d.yaw), 0) && out?.count === 1);
  const helmet = dispense(ItemStack.of('iron_helmet'), m.SOUTH);
  check('dispenser: armour put on a stand in front (its equip sound)', d?.armorItems[3]?.item.id === 'iron_helmet' && helmet === null);
  d.disabledSlots = 1 << 1;
  dispense(ItemStack.of('iron_boots'), m.SOUTH);
  check('dispenser: not into a disabled slot (thrown out instead)', !d.armorItems[0] && drops().some((e) => e.stack.item.id === 'iron_boots'));
  d.remove();
  clearDrops();
  dispense(ItemStack.of('armor_stand'), m.WEST, 2, G, 0);
  const w = stands().pop();
  check('dispenser: facing west, turned west', !!w && near(m.wrapDegrees(w.yaw), 90) && near(w.x, 1.5));
  w?.remove();
}

// ---------------------------------------------------------------------------
// saving
{
  const s = stand(1.5, 1.5, (q) => {
    q.small = true;
    q.showArms = true;
    q.noBasePlate = true;
    q.invisible = true;
    q.noGravityFlag = true;
    q.disabledSlots = 0x10;
    q.invulnerable = true;
    q.headPose = [5, 6, 7];
    q.rightLegPose = [1, 2, 3];
    q.refreshDimensions();
  });
  s.setItemSlot('chest', ItemStack.of('diamond_chestplate'));
  s.setItemSlot('mainhand', ItemStack.of('torch'));
  s.setItemSlot('offhand', ItemStack.of('shield'));
  s.setCustomName('Saved');
  s.customNameVisible = true;
  s.moveTo(1.5, G + 2, 1.5, 45, 0);
  s.health = 12;
  const rec = JSON.parse(JSON.stringify(m.saveEntity(s)));
  check('saved: kept with its chunk', m.isChunkSaved(s) && rec.id === 'armor_stand');
  const l = m.loadEntity(rec, level);
  check('loaded: its flags', l instanceof m.ArmorStand && l.small && l.showArms && l.noBasePlate && l.invisible && l.noGravityFlag && l.invulnerable && l.disabledSlots === 0x10 && !l.marker);
  check('loaded: its pose (the rest as they come)', l.headPose.join() === '5,6,7' && l.rightLegPose.join() === '1,2,3' && l.leftArmPose.join() === '-10,0,-10');
  check('loaded: its gear, name, place, turn and health', l.armorItems[2]?.item.id === 'diamond_chestplate' && l.mainHand?.item.id === 'torch' && l.offHand?.item.id === 'shield' && l.customName === 'Saved' && l.customNameVisible && near(l.y, G + 2) && near(l.yaw, 45) && near(l.bodyYaw, 45) && l.health === 12 && near(l.height, 0.9875));
  const plain = stand();
  const pr = m.saveEntity(plain);
  check('saved: a plain stand keeps nothing extra', !pr.data.pose && !pr.data.small && !pr.armor && !pr.hand);
  plain.remove();
  s.remove();
}

// ---------------------------------------------------------------------------
// the sounds
{
  const bad = [];
  for (const ev of ['place', 'hit', 'break', 'fall']) {
    const g = m.SOUNDS[`entity.armor_stand.${ev}`];
    if (!g || g.variants !== 4) bad.push(ev);
    else for (let v = 0; v < 4; v++) {
      const b = g.generate(v, 22050);
      if (!b.length || b.some((x) => !Number.isFinite(x)) || !b.some((x) => Math.abs(x) > 0.3)) bad.push(`${ev}${v}`);
    }
  }
  check('sounds: place, hit, break and fall, four takes each, all heard', bad.length === 0, bad.join());
}

// ---------------------------------------------------------------------------
// drawing it
{
  const calls = [];
  const batch = { begin: (st) => calls.push(['begin', st]), quad: () => calls.push(['quad']), flush() {}, setOverlay() {} };
  const gl = new Proxy({}, { get: (_t, k) => (typeof k === 'string' && /^[A-Z_0-9]+$/.test(k) ? 0 : () => ({})) });
  const layers = [];
  const items = { render: (_b, _p, st, ctx, left) => layers.push(`${st.item.id}@${ctx}${left ? '<' : ''}`) };
  const armor = { render: (_b, _p, _root, worn, baby) => layers.push(`armor:${worn.map((w) => w?.item.id ?? '-').join('/')}${baby ? ':small' : ''}`) };
  const elytra = { render: (_b, _p, _e, chest) => chest?.item.id === 'elytra' && layers.push('elytra') };
  const r = new m.ArmorStandRenderer(gl, items, armor, elytra);
  const pose = new m.PoseStack();
  const s = stand(0.5, 2.5);
  const draw = (spectator = false) => {
    calls.length = 0;
    layers.length = 0;
    r.render(batch, pose, s, 0, 0, 0, 1, spectator);
    return calls.filter((c) => c[0] === 'quad').length;
  };
  check('drawn: the stand without arms: eight boxes', draw() === 8 * 6);
  s.showArms = true;
  check('drawn: with its arms: ten', draw() === 10 * 6);
  s.noBasePlate = true;
  check('drawn: no base plate: nine', draw() === 9 * 6);
  s.headPose = [30, 0, 0];
  s.bodyPose = [0, 45, 0];
  s.rightArmPose = [-90, 0, 0];
  const root = r.setupAnim(s);
  check('posed: the head, the body (its sticks too) and an arm turned as the pose says', near(root.child('head').xRot, Math.PI / 6) && near(root.child('body').yRot, Math.PI / 4) && near(root.child('shoulder_stick').yRot, Math.PI / 4) && near(root.child('right_arm').xRot, -Math.PI / 2));
  s.invisible = true;
  check('invisible: the stand isn\'t drawn', draw() === 0);
  const ghost = draw(true);
  check('invisible: a spectator sees its ghost (see-through)', ghost === 9 * 6 && calls.find((c) => c[0] === 'begin')?.[1].blend === true);
  s.invisible = false;
  s.setItemSlot('head', ItemStack.of('iron_helmet'));
  s.setItemSlot('chest', ItemStack.of('elytra'));
  s.setItemSlot('mainhand', ItemStack.of('iron_sword'));
  s.setItemSlot('offhand', ItemStack.of('shield'));
  draw();
  check('drawn: its armour, what its hands hold (the sword on the right), its elytra', layers.includes('armor:-/-/elytra/iron_helmet') && layers.includes('iron_sword@thirdperson_righthand') && layers.includes('shield@thirdperson_lefthand<') && layers.includes('elytra'), layers.join());
  s.showArms = false;
  draw();
  check('drawn: held things show without its arms too', layers.includes('iron_sword@thirdperson_righthand'));
  s.setItemSlot('head', ItemStack.of('carved_pumpkin'));
  draw();
  check('drawn: a carved pumpkin on the head as an item (not armour)', layers.includes('carved_pumpkin@head'));
  s.setSmall(true);
  // (no arms, no base plate: the head, the body, two legs and three sticks, as big a count small or not)
  check('small: a head a size up on a half-size body (the armour small too)', draw() === 7 * 6 && layers.some((l) => l.endsWith(':small')));
  check('render distance: four times its size, a marker\'s as a block\'s', near(m.armorStandRenderSize(s), ((0.25 + 0.9875 + 0.25) / 3) * 4) && (s.setMarker(true), m.armorStandRenderSize(s) === 4));
  s.customName = 'Bob';
  check('name: shown only when set to', !m.armorStandShowsName(s, 1) && ((s.customNameVisible = true), m.armorStandShowsName(s, 1)) && !m.armorStandShowsName(s, 65 * 65));
  s.remove();
}

await exitWithStatus(close);
