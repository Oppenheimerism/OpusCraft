// Headless checks for the shield (node tests/illagers/shield.mjs).
import { loadModules } from '../../scripts/load.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 120000).unref();
const { mods, close } = await loadModules([
  '/src/world/blocks.ts', '/src/game/level.ts', '/src/world/world.ts', '/src/world/chunk.ts', '/src/world/block.ts',
  '/src/item/item.ts', '/src/entity/player.ts', '/src/game/itemBehavior.ts', '/src/entity/monsters.ts', '/src/entity/arrow.ts',
  '/src/inventory/recipes.ts', '/src/inventory/customRecipes.ts', '/src/item/hoverText.ts', '/src/inventory/enchantMenus.ts',
  '/src/inventory/menus.ts', '/src/entity/shield.ts', '/src/textures/shieldTextures.ts', '/src/game/banners.ts', '/src/item/equipment.ts',
  '/src/game/advancements.ts',
]);
const [, levelMod, worldMod, chunkMod, blockMod, itemMod, playerMod, ib, monsters, arrowMod, recipes, cr, ht, enchantMenus, menus, shieldMod, shTex, banners, equipment, adv] = mods;
const { S } = blockMod;
const { ItemStack } = itemMod;
let fails = 0;
const check = (name, cond, extra = '') => { if (!cond) fails++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };

const world = new worldMod.World();
for (let cx = -2; cx <= 1; cx++) for (let cz = -2; cz <= 1; cz++) { const c = new chunkMod.Chunk(cx, cz); world.chunks.set(c.key, c); }
for (let x = -32; x < 32; x++) for (let z = -32; z < 32; z++) { const c = world.getChunk(x >> 4, z >> 4); for (let y = 50; y <= 63; y++) c.setState(x & 15, y, z & 15, S('stone')); }
const level = new levelMod.Level(world, 'test');
let sounds = [];
level.sound = { play: (n, x, y, z, v, p) => sounds.push([n, v, p]), playUI() {} };
level.particles = { blockBreak() {}, spawn() {} };
const triggers = [];
level.onPlayerTrigger = (p, t, payload) => triggers.push(t);
level.difficulty = 'normal';
const player = new playerMod.Player(level);
player.moveTo(0.5, 64, 0.5, 0, 0);
player.headYaw = 0; // facing +z (south)
player.gameMode = 'survival';
level.player = player;
level.addEntity(player);
const inv = player.inventory;

// --- the item
const it = itemMod.ITEMS.get('shield');
check('the shield: one to a stack, 336 uses, combat tab', it && it.maxStack === 1 && it.maxDamage === 336 && it.creativeTab === 'combat');
const P = ItemStack.of('oak_planks'), I = ItemStack.of('iron_ingot'), SP = ItemStack.of('spruce_planks');
const r = recipes.findRecipe([P, I, SP, P, P, P, null, P, null], 3, 3);
check('crafted W#W / WWW / .W. from any planks and an iron ingot', r && r.result === 'shield' && r.count === 1);
check('repaired with planks (not iron)', enchantMenus.isValidRepairItem(it, ItemStack.of('birch_planks')) && !enchantMenus.isValidRepairItem(it, I));
check('its slot is the offhand', equipment.equipmentSlotForItem(it) === 'offhand');

// --- raising it
const shield = ItemStack.of('shield');
inv.offhand = shield;
inv.main[inv.selected] = null;
const raise = () => { inv.activeHand = 'off'; const res = ib.itemBehaviorOf('shield').use(level, player, shield); inv.activeHand = 'main'; return res; };
check('using it holds it up (72000 ticks), in the offhand', raise() === 'success' && player.useItem === shield && player.useDuration === 72000 && player.useHand === 'off');
const tick = (n) => { for (let i = 0; i < n; i++) player.useItemRemaining--; };
tick(4);
check('not blocking for the first 4 ticks', !shieldMod.isBlocking(player));
tick(1);
check('blocking from the 5th', shieldMod.isBlocking(player));

// --- a zombie in front
const zombie = new monsters.Zombie(level);
zombie.moveTo(0.5, 64, 2.5, 180, 0);
level.addEntity(zombie);
sounds = [];
player.invulnerableTime = 0;
let hp = player.health, food = player.food.exhaustion ?? player.food.exhaustionLevel;
let ok = player.hurt(4, 'mob', zombie);
check('a zombie\'s blow from in front does nothing', ok === false && player.health === hp, `ok=${ok} hp=${player.health}`);
check('the shield wears 1 + the damage (4 → 5, normal difficulty unscaled)', shield.damage === 5, `damage=${shield.damage}`);
check('the shield\'s thud, no hurt sound', sounds.length === 1 && sounds[0][0] === 'item.shield.block' && sounds[0][1] === 1 && sounds[0][2] >= 0.8 && sounds[0][2] < 1.2, JSON.stringify(sounds));
check('no red flash, but the invulnerability frames start', player.hurtTime === 0 && player.invulnerableTime === 20);
check('the zombie is remembered as the attacker', player.lastHurtByMob === zombie);
check('no knockback for the player', player.dx === 0 && player.dz === 0);
check('no food exhaustion from a blocked hit', (player.food.exhaustion ?? player.food.exhaustionLevel) === food);
check('the zombie isn\'t pushed (vanilla\'s blockedByShield pushes the defender, unseen)', zombie.dx === 0 && zombie.dz === 0);
// within the frames: returns at once, but the shield still wears (vanilla blocks before the invulnerability check)
sounds = [];
ok = player.hurt(4, 'mob', zombie);
check('a second blow in the frames: nothing, no sound, the shield wears again', ok === false && sounds.length === 0 && shield.damage === 10, `dmg=${shield.damage} ${JSON.stringify(sounds)}`);
// a weak blow (under 3) doesn't wear it
player.invulnerableTime = 0;
ok = player.hurt(2, 'mob', zombie);
check('a blow under 3 doesn\'t wear it', ok === false && shield.damage === 10);

// --- from behind
const behind = new monsters.Zombie(level);
behind.moveTo(0.5, 64, -2.5, 0, 0);
level.addEntity(behind);
player.invulnerableTime = 0;
hp = player.health;
ok = player.hurt(3, 'mob', behind);
check('a blow from behind hurts', ok === true && player.health === hp - 3 && player.hurtTime === 10, `hp ${hp} → ${player.health}`);
player.health = 20;
// from the side (exactly perpendicular: dot 0, not blocked)
const side = new monsters.Zombie(level);
side.moveTo(3.5, 64, 0.5, 0, 0);
level.addEntity(side);
player.invulnerableTime = 0;
ok = player.hurt(3, 'mob', side);
check('a blow from square to the side isn\'t blocked (the dot is 0)', ok === true);
player.health = 20;
// magic goes through
player.invulnerableTime = 0;
ok = player.hurt(3, 'magic', zombie);
check('magic isn\'t blocked (#bypasses_shield)', ok === true);
player.health = 20;
player.invulnerableTime = 0;
ok = player.hurt(3, 'inFire');
check('fire with nothing behind it isn\'t blocked (no source position)', ok === true);
player.health = 20;
player.extinguishFire?.();
player.remainingFireTicks = 0;

// --- arrows
const skeleton = new monsters.Skeleton(level);
skeleton.moveTo(0.5, 64, 10.5, 180, 0);
level.addEntity(skeleton);
const arrow = new arrowMod.Arrow(level, skeleton);
arrow.moveTo(0.5, 65, 1.2, 180, 0);
player.invulnerableTime = 0;
triggers.length = 0;
sounds = [];
ok = player.hurt(6, 'arrow', skeleton, arrow);
check('an arrow from in front is blocked', ok === false && sounds[0]?.[0] === 'item.shield.block');
check('...and counts for "Not Today, Thank You"', triggers.includes('deflected_projectile'));
const a = adv.ADVANCEMENTS.get('story/deflect_arrow');
check('the advancement takes it', a && Object.values(a.criteria)[0].t === 'deflected_projectile');
check('the skeleton isn\'t shoved (a projectile: no blockUsingShield)', skeleton.dx === 0 && skeleton.dz === 0);
const pierce = new arrowMod.Arrow(level, skeleton);
pierce.moveTo(0.5, 65, 1.2, 180, 0);
pierce.pierceLevel = 1;
player.invulnerableTime = 0;
ok = player.hurt(6, 'arrow', skeleton, pierce);
check('a piercing arrow goes through', ok === true);
player.health = 20;
// the arrow's own flight: it deflects off the shield
const shot = new arrowMod.Arrow(level, skeleton);
shot.moveTo(0.5, 65.2, 1.9, 180, 0);
shot.dx = 0; shot.dy = 0; shot.dz = -1.5;
level.addEntity(shot);
player.invulnerableTime = 0;
hp = player.health;
for (let i = 0; i < 3 && !shot.removed; i++) shot.tick();
check('a shot arrow bounces off (reversed), the player unhurt', player.health === hp && shot.dz > 0, `dz=${shot.dz} hp=${player.health}`);

// --- an axe knocks it down
const brute = new monsters.Zombie(level);
brute.moveTo(0.5, 64, 2, 180, 0);
brute.mainHand = ItemStack.of('iron_axe');
level.addEntity(brute);
player.invulnerableTime = 0;
sounds = [];
ok = player.hurt(5, 'mob', brute);
check('an axe blow is still blocked', ok === false);
check('...but the shield is knocked down: 100 ticks\' cooldown, the use stopped, the crack', player.cooldowns.get('shield') === 100 && player.cooldownTotals.get('shield') === 100 && !player.isUsingItem() && sounds.some((s) => s[0] === 'item.shield.break'), JSON.stringify(sounds));
check('it can\'t be raised while the cooldown lasts', raise() === 'pass' && !player.isUsingItem());
player.cooldowns.clear();

// --- worn through
raise();
tick(5);
shield.damage = 334;
player.invulnerableTime = 0;
sounds = [];
ok = player.hurt(4, 'mob', zombie);
check('worn through: gone from the offhand, the use stopped', ok === false && inv.offhand === null && !player.isUsingItem());
check('...with the item-break sound, then the shield\'s', sounds.map((s) => s[0]).join() === 'entity.item.break,item.shield.break,item.shield.block', JSON.stringify(sounds.map((s) => s[0])));

// --- in the main hand
const main = ItemStack.of('shield');
inv.main[inv.selected] = main;
inv.activeHand = 'main';
ib.itemBehaviorOf('shield').use(level, player, main);
tick(5);
player.invulnerableTime = 0;
ok = player.hurt(4, 'mob', zombie);
check('it blocks from the main hand too', ok === false && main.damage === 5 && player.useHand === 'main');
player.stopUsingItem();

// --- decorating it
const banner = ItemStack.of('red_banner');
banner.tag = { patterns: [{ pattern: 'stripe_bottom', color: 'blue' }, { pattern: 'cross', color: 'yellow' }] };
const plain = ItemStack.of('shield');
plain.damage = 12;
const got = cr.customRecipeFor([plain, null, banner, null], 2);
const res = got?.result;
check('shield + banner: the shield, its colour and patterns from the banner', res && res.item.id === 'shield' && res.tag?.baseColor === 'red' && res.tag.patterns?.length === 2 && res.damage === 12, JSON.stringify(res?.tag));
check('named for the colour', res?.displayName() === 'Red Shield', res?.displayName());
check('the patterns in its tooltip, grey', JSON.stringify(ht.hoverText(res)) === JSON.stringify(['§7Blue Base', '§7Yellow Saltire']), JSON.stringify(ht.hoverText(res)));
check('a plain shield is just "Shield", no tooltip lines', plain.displayName() === 'Shield' && ht.hoverText(plain).length === 0);
check('one with patterns can\'t be decorated again', cr.customRecipeFor([res, banner], 2) === null);
const tinted = ItemStack.of('shield');
tinted.tag = { baseColor: 'green' };
const again = cr.customRecipeFor([tinted, banner], 2)?.result;
check('one with only a colour can (vanilla checks the patterns)', again?.tag?.baseColor === 'red');
check('not two banners, not two shields, not alone', !cr.customRecipeFor([plain, banner, ItemStack.of('blue_banner')], 3) && !cr.customRecipeFor([plain, plain.copy(), banner], 3) && !cr.customRecipeFor([plain], 1));
const blankBanner = ItemStack.of('lime_banner');
const limeShield = cr.customRecipeFor([plain, blankBanner], 2)?.result;
check('a blank banner: just the colour', limeShield?.tag?.baseColor === 'lime' && !limeShield.tag.patterns && limeShield.displayName() === 'Lime Shield');
check('the ominous banner: white with its patterns', cr.customRecipeFor([plain, banners.ominousBanner()], 2)?.result.tag?.patterns?.length === 8);
check('a decorated shield doesn\'t stack with a plain one', !res.sameItem(plain.copy()));

// --- shift-click into the offhand
const m = new menus.InventoryMenu(player);
for (let i = 0; i < 36; i++) inv.main[i] = null;
inv.offhand = null;
inv.main[12] = ItemStack.of('shield');
m.quickMoveStack(player, 9 + 3);
check('shift-clicked from the inventory, it goes to the offhand', inv.offhand?.item.id === 'shield' && !inv.main[12]);

// --- textures
const plainTex = shTex.plainShieldTexture();
const px = (t, u, v) => [t.data[(v * 64 + u) * 4], t.data[(v * 64 + u) * 4 + 1], t.data[(v * 64 + u) * 4 + 2], t.data[(v * 64 + u) * 4 + 3]];
const isGrey = ([r, g, b]) => r === g && g === b;
check('the plain shield: an iron rim round its face', isGrey(px(plainTex, 1, 1)) && isGrey(px(plainTex, 12, 22)) && isGrey(px(plainTex, 1, 12)));
check('...wooden boards inside it', (() => { const [r, g, b] = px(plainTex, 4, 8); return r > g && g > b; })());
check('...the handle is drawn', px(plainTex, 30, 8)[3] === 255 && px(plainTex, 41, 11)[3] === 255);
const red = shTex.shieldTexture('red', [{ pattern: 'stripe_bottom', color: 'blue' }]);
const [rr, rg, rb] = px(red, 6, 3), [br, bg, bb] = px(red, 6, 21);
check('painted: red face at the top, blue stripe at the bottom', rr > rg && rr > rb && bb > br && bb > bg, `${[rr, rg, rb]} ${[br, bg, bb]}`);
check('the stripe covers the bottom third of the face (as on the banner)', (() => { const [a, , c] = px(red, 6, 1 + 14); const [d, , f] = px(red, 6, 1 + 16); return a > c && f > d; })());
check('the edges and back stay iron and wood', isGrey(px(red, 0, 5)) && px(red, 20, 8)[0] > px(red, 20, 8)[2]);
check('keys: plain vs designs', shTex.shieldKey(null, []) === 'plain' && shTex.shieldKey('red', []) !== shTex.shieldKey('blue', []) && shTex.shieldKey(null, [{ pattern: 'cross', color: 'red' }]).startsWith('white|'));

console.log(fails ? `${fails} FAILED` : 'all ok');
await close();
process.exit(fails ? 1 : 0);
