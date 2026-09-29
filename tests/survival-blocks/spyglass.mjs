// Headless checks for the spyglass (node tests/survival-blocks/spyglass.mjs): the item (one to a stack, its sprite, with
// the tools after the clock), its recipe (a shard over two copper ingots, in any column of a table, not the 2x2 grid;
// found by holding a shard), using it (up at once without a swing, its sound, ITEM_INTERACT_START; a minute at most,
// then lowered; let go, lowered; its sound, ITEM_INTERACT_FINISH; nothing eaten), in either hand, not for a spectator,
// not lowered by a slot change's sound, walking at a fifth of the pace; scoping (the FOV to 0.1 in first person only,
// the mouse an eighth as fast); what it looks at (the nearest thing along the look, 100 blocks, not through walls) and
// the three advancements; the arm raised to the eye and the model drawn at the head (render/); the two sounds; the
// scope's texture; and a spyglass kept in a save.
import { load, check, exitWithStatus, flatLevel, ticks } from '../redstone2/lib.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 240000).unref();

const { m, close } = await load([
  '/src/entity/player.ts', '/src/game/interaction.ts', '/src/game/spyglass.ts', '/src/game/itemBehavior.ts', '/src/inventory/recipeBook.ts',
  '/src/inventory/menus.ts', '/src/textures/items.ts', '/src/textures/spyglass.ts', '/src/textures/gui.ts', '/src/textures/spyglassScope.ts',
  '/src/audio/synth.ts', '/src/game/advancements.ts', '/src/game/spawner.ts', '/src/render/playerPose.ts', '/src/render/model.ts',
  '/src/entity/enderDragon.ts', '/src/render/entityRenderer.ts', '/src/render/itemRenderer.ts', '/src/render/spyglassRenderer.ts', '/src/game/playerData.ts',
]);
const { ItemStack } = m;
const G = 64;
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;

// ---------------------------------------------------------------------------
// the item, the recipe
{
  const it = m.ITEMS.get('spyglass');
  check('item: one to a stack, its sprite, the tools tab', it?.maxStack === 1 && it.texture === 'spyglass' && it.creativeTab === 'tools' && m.ITEM_TEXTURES['spyglass']?.().w === 16);
  const at = m.ITEM_LIST.indexOf(it);
  check('item: listed after the clock, before the map', m.ITEM_LIST[at - 1]?.id === 'clock' && m.ITEM_LIST.indexOf(m.ITEMS.get('map')) > at);
  check('item: no wear, no block', !it.maxDamage && !it.block && !it.food);
  const r = m.RECIPES.filter((x) => x.result === 'spyglass');
  check('recipe: an amethyst shard over two copper ingots, one made', r.length === 1 && r[0].pattern.join('|') === '#|X|X' && r[0].key['#'] === 'amethyst_shard' && r[0].key.X === 'copper_ingot' && r[0].count === 1);
  const grid = (w, h, cells) => {
    const g = new Array(w * h).fill(null);
    for (const [x, y, id] of cells) g[y * w + x] = ItemStack.of(id);
    return g;
  };
  const col = (x) => [[x, 0, 'amethyst_shard'], [x, 1, 'copper_ingot'], [x, 2, 'copper_ingot']];
  check('recipe: in the middle column of a table', m.findRecipe(grid(3, 3, col(1)), 3, 3)?.result === 'spyglass');
  check('recipe: or either side column (vanilla shrinks the pattern)', m.findRecipe(grid(3, 3, col(0)), 3, 3)?.result === 'spyglass' && m.findRecipe(grid(3, 3, col(2)), 3, 3)?.result === 'spyglass');
  check('recipe: not upside down, not with iron', !m.findRecipe(grid(3, 3, [[1, 0, 'copper_ingot'], [1, 1, 'copper_ingot'], [1, 2, 'amethyst_shard']]), 3, 3) && m.findRecipe(grid(3, 3, [[1, 0, 'amethyst_shard'], [1, 1, 'iron_ingot'], [1, 2, 'iron_ingot']]), 3, 3)?.result !== 'spyglass');
  check('recipe: too tall for the inventory\'s 2x2 grid', m.findRecipe(grid(2, 2, [[0, 0, 'amethyst_shard'], [0, 1, 'copper_ingot']]), 2, 2)?.result !== 'spyglass');
  const book = m.BOOK_BY_ID.get('spyglass');
  check('recipe book: found by holding an amethyst shard (not the copper), with the equipment', !!book && [...book.unlockBy].join() === 'amethyst_shard' && book.category === 'crafting_equipment', `${book && [...book.unlockBy]} ${book?.category}`);
}

// ---------------------------------------------------------------------------
// a level to look about in
const { level, sounds } = flatLevel(m, -2, -2, 7, 2);
const events = [];
const gameEvent = level.gameEvent.bind(level);
level.gameEvent = (e, x, y, z, ctx) => {
  events.push({ e, entity: ctx?.entity });
  gameEvent(e, x, y, z, ctx);
};
const p = new m.Player(level);
p.setGameMode('survival');
p.moveTo(0.5, G, 0.5, -90, 0);
level.player = p;
level.addEntity(p);
const adv = new m.PlayerAdvancements();
level.onPlayerTrigger = (q, type, payload) => q === p && adv.trigger(type, payload);
const inter = new m.Interaction(level, p);
const heard = (n) => sounds.filter((s) => s.name === n).length;
/** a press of the use button (nothing looked at: the look is picked afresh) */
const press = () => {
  inter.pick(p.x, p.y + p.eyeHeight, p.z, p.yaw, p.pitch);
  inter.use(true, true);
};
/** a tick of the use button held (or let go), as the game's tick has it (the level ticked too, unless `still`) */
const hold = (held = true, n = 1, still = false) => {
  for (let i = 0; i < n; i++) {
    inter.use(false, held);
    inter.tickUsingItem();
    if (!still) level.tick();
  }
};
const give = (id, hand = 'main') => {
  p.inventory.main[0] = hand === 'main' && id ? ItemStack.of(id) : null;
  p.inventory.offhand = hand === 'off' && id ? ItemStack.of(id) : null;
  p.inventory.selected = 0;
};

// ---------------------------------------------------------------------------
// raised and lowered
{
  give('spyglass');
  sounds.length = 0;
  events.length = 0;
  press();
  check('use: up to the eye at once, for a minute (1200 ticks) at most', p.useItem?.item.id === 'spyglass' && p.useDuration === 1200 && p.useHand === 'main' && m.isScoping(p));
  const s = sounds.find((x) => x.name === 'item.spyglass.use');
  check('use: item.spyglass.use at the player, volume 1, pitch 1', !!s && s.x === p.x && s.y === p.y && s.z === p.z && s.volume === 1 && s.pitch === 1);
  check('use: ITEM_INTERACT_START, by the player', events.some((e) => e.e === 'item_interact_start' && e.entity === p));
  check('use: no swing of the hand (vanilla startUsingInstantly: CONSUME)', !p.swinging);
  check('scoping: the FOV to 0.1 in first person, as it is', m.scopedFov(p, true) === 0.1 && m.scopedFov(p, false) === null && m.SCOPE_FOV_MODIFIER === 0.1);
  check('scoping: the mouse turns an eighth as fast in first person', m.scopeTurnFactor(p, true) === 1 / 8 && m.scopeTurnFactor(p, false) === 1);
  hold(true, 40);
  check('held: still up 40 ticks on, no sound again', m.isScoping(p) && p.useItemRemaining === 1160 && heard('item.spyglass.use') === 1 && heard('item.spyglass.stop_using') === 0);
  events.length = 0;
  hold(false);
  check('let go: lowered, item.spyglass.stop_using heard', !p.isUsingItem() && !m.isScoping(p) && heard('item.spyglass.stop_using') === 1 && sounds.find((x) => x.name === 'item.spyglass.stop_using').volume === 1);
  check('let go: ITEM_INTERACT_FINISH', events.some((e) => e.e === 'item_interact_finish' && e.entity === p));
  check('let go: the spyglass still in the hand (nothing used up)', p.inventory.main[0]?.item.id === 'spyglass' && p.inventory.main[0].count === 1);
  check('lowered: the FOV back to normal', m.scopedFov(p, true) === null && m.scopeTurnFactor(p, true) === 1);
  // (a minute, held all along)
  sounds.length = 0;
  let consumed = 0;
  inter.onConsumed = () => consumed++;
  press();
  hold(true, 1198);
  check('a minute: still up one tick short of it', m.isScoping(p) && p.useItemRemaining === 2 && heard('item.spyglass.stop_using') === 0);
  hold(true, 2);
  check('a minute: lowered by itself after 1200 ticks, heard once', !p.isUsingItem() && heard('item.spyglass.stop_using') === 1);
  check('a minute: not eaten (no consume trigger, Husbandry not earned)', consumed === 0 && !adv.isDone(m.ADVANCEMENTS.get('husbandry/root')));
  hold(true);
  check('a minute: the button still held, up again at once (vanilla startUseItem while the key is down)', m.isScoping(p) && heard('item.spyglass.use') === 2 && heard('item.spyglass.stop_using') === 1);
  hold(false);
  check('a minute: let go, lowered', !p.isUsingItem() && heard('item.spyglass.stop_using') === 2);
  // (a slot change: dropped from the eye without a sound, as vanilla's stopUsingItem)
  press();
  p.inventory.selected = 1;
  hold(true);
  check('slot change: not scoping any more, no stop sound', !p.isUsingItem() && heard('item.spyglass.use') === 3 && heard('item.spyglass.stop_using') === 2);
  hold(false);
}

// ---------------------------------------------------------------------------
// hands, modes, pace
{
  give('spyglass', 'off');
  p.inventory.main[0] = ItemStack.of('stick');
  press();
  check('offhand: the main hand\'s stick does nothing, the spyglass in the other goes up', m.isScoping(p) && p.useHand === 'off' && p.useItem === p.inventory.offhand);
  hold(false);
  give('spyglass');
  p.setGameMode('spectator');
  const u0 = heard('item.spyglass.use');
  press();
  check('spectator: can\'t use it', !p.isUsingItem() && heard('item.spyglass.use') === u0);
  p.setGameMode('creative');
  press();
  check('creative: can', m.isScoping(p));
  hold(false);
  p.setGameMode('adventure');
  press();
  check('adventure: can', m.isScoping(p));
  hold(false);
  p.setGameMode('survival');
  // (the pace: a fifth, no sprinting)
  const walk = (scope) => {
    p.moveTo(0.5, G, 0.5, -90, 0);
    p.dx = p.dy = p.dz = 0;
    give('spyglass');
    if (scope) press();
    p.input.forward = true;
    const x0 = p.x;
    for (let i = 0; i < 30; i++) {
      p.tick();
      if (scope) inter.tickUsingItem();
      inter.use(false, scope);
    }
    p.input.forward = false;
    const d = p.x - x0;
    hold(false);
    return d;
  };
  const free = walk(false), scoped = walk(true);
  check('pace: a fifth of the walk while it\'s up', free > 3 && near(scoped / free, 0.2, 0.03), `${free.toFixed(3)} ${scoped.toFixed(3)}`);
  p.sprinting = true;
  give('spyglass');
  press();
  p.input.forward = true;
  p.tick();
  inter.tickUsingItem();
  p.input.forward = false;
  check('pace: no sprinting while it\'s up', !p.sprinting);
  hold(false);
}

// ---------------------------------------------------------------------------
// what it looks at; the advancements (the mobs kept still: the level isn't ticked)
{
  p.moveTo(0.5, G, 0.5, -90, 0);
  const eye = p.y + p.eyeHeight;
  const spawn = (type, x, y = G) => {
    const e = m.createMob(type, level);
    e.moveTo(x, y, 0.5, 0, 0);
    level.addEntity(e);
    return e;
  };
  /** the look turned (along +x) to the middle of `e`'s box */
  const aim = (e) => {
    const b = e.bb;
    p.pitch = (-Math.atan2((b.minY + b.maxY) / 2 - eye, (b.minX + b.maxX) / 2 - p.x) * 180) / Math.PI;
  };
  const scope = (n = 2) => {
    give('spyglass');
    press();
    hold(true, n, true);
  };
  const done = (k) => adv.isDone(m.ADVANCEMENTS.get(`adventure/spyglass_at_${k}`));
  const parrot = spawn('parrot', 40.5);
  const cow = spawn('cow', 20.5);
  aim(parrot);
  check('looking at: the nearest thing along the look (a cow before the parrot)', m.lookedAt(p) === cow);
  scope();
  check('advancement: not the parrot behind the cow', !done('parrot'));
  hold(false, 1, true);
  cow.remove();
  level.entities.splice(level.entities.indexOf(cow), 1);
  check('looking at: the parrot, 40 blocks off', m.lookedAt(p) === parrot);
  // (only through the spyglass)
  give('stick');
  press();
  hold(true, 3, true);
  check('advancement: looking at it without the spyglass, nothing', !done('parrot'));
  hold(false, 1, true);
  // (a wall between)
  for (let y = G; y < G + 3; y++) level.setBlock(10, y, 0, m.S('stone'));
  check('looking at: nothing through a wall', m.lookedAt(p) === null);
  scope(3);
  check('advancement: not through a wall', !done('parrot'));
  hold(false, 1, true);
  for (let y = G; y < G + 3; y++) level.setBlock(10, y, 0, 0);
  scope(1);
  check('advancement: "Is It a Bird?" through the spyglass', done('parrot'));
  hold(false, 1, true);
  parrot.remove();
  // (100 blocks is the reach)
  const far = spawn('ghast', 104.5);
  aim(far);
  scope();
  check('looking at: nothing past 100 blocks', m.lookedAt(p) === null && !done('ghast'));
  hold(false, 1, true);
  far.remove();
  const ghast = spawn('ghast', 60.5);
  aim(ghast);
  scope(1);
  check('advancement: "Is It a Balloon?"', m.lookedAt(p) === ghast && done('ghast'));
  hold(false, 1, true);
  ghast.remove();
  // (the ender dragon: its parts are what the look meets)
  const dragon = new m.EnderDragon(level);
  dragon.moveTo(50.5, G + 2, 0.5, 90, 0);
  level.addEntity(dragon);
  dragon.tick();
  aim(dragon.subEntities[2]);
  const seen = m.lookedAt(p);
  check('looking at: the dragon (one of its parts)', seen?.type === 'ender_dragon', seen?.type ?? 'nothing');
  scope(1);
  check('advancement: "Is It a Plane?"', done('dragon'));
  hold(false, 1, true);
  dragon.remove();
  check('advancements: none of the three impossible any more', ['parrot', 'ghast', 'dragon'].every((k) => Object.values(m.ADVANCEMENTS.get(`adventure/spyglass_at_${k}`).criteria).every((c) => c.t === 'using_item' && c.item === 'spyglass')));
  // (a spectator isn't seen)
  const q = new m.Player(level);
  q.setGameMode('spectator');
  q.moveTo(8.5, G, 0.5, 0, 0);
  level.addEntity(q);
  p.pitch = 0;
  check('looking at: never a spectator', m.lookedAt(p) !== q);
  q.remove();
}

// ---------------------------------------------------------------------------
// drawn: the arm raised to the eye, the spyglass at the head
{
  p.moveTo(0.5, G, 0.5, 0, 0);
  give('spyglass');
  const idle = m.playerArms(p, 'right');
  check('arm: held, not in use, an ordinary item pose', idle.right === 'item');
  press();
  const arms = m.playerArms(p, 'right');
  check('arm: in use, the spyglass pose on the using arm', arms.right === 'spyglass' && arms.usingArm === 'right' && !m.twoHanded('spyglass'));
  const root = m.playerModel();
  m.animateHumanoid(root, 0, 0, 7, 10, 20, 0, false, false, arms);
  const head = root.child('head'), arm = root.child('right_arm'), off = root.child('left_arm');
  check('arm: raised along the look (head pitch less 110°), turned in 15°, no idle sway', near(arm.xRot, head.xRot - 1.9198622) && near(arm.yRot, head.yRot - 0.2617994) && near(arm.zRot, 0), `${arm.xRot} ${arm.yRot} ${arm.zRot}`);
  check('arm: the other arm sways as ever', !near(off.zRot, 0));
  m.animateHumanoid(root, 0, 0, 7, 10, 20, 0, true, false, arms);
  check('arm: crouching, raised 15° more (the crouch adds 0.4 after)', near(root.child('right_arm').xRot, head.xRot - 1.9198622 - 0.2617994 + 0.4));
  m.animateHumanoid(root, 0, 0, 7, 10, -89, 0, false, false, arms);
  check('arm: never past 2.4 rad up', near(root.child('right_arm').xRot, -2.4));
  hold(false);
  give('spyglass', 'off');
  p.inventory.main[0] = null;
  press();
  const la = m.playerArms(p, 'right');
  check('arm: in the offhand, the left arm (turned in the other way)', la.left === 'spyglass' && la.usingArm === 'left');
  m.animateHumanoid(root, 0, 0, 7, 10, 20, 0, false, false, la);
  check('arm: left, turned in across the face', near(root.child('left_arm').yRot, root.child('head').yRot + 0.2617994));
  hold(false);
  // (the drawing: the model in the hands and at the head, the sprite elsewhere; a stand-in GL that makes nothing)
  const calls = [];
  const batch = { begin: (st) => calls.push(['begin', st]), quad: () => calls.push(['quad']), flush() {} };
  const pose = new m.PoseStack();
  const gl = new Proxy({}, { get: (_t, k) => (typeof k === 'string' && /^[A-Z_0-9]+$/.test(k) ? 0 : () => ({})) });
  new m.SpyglassRenderer(gl);
  const ir = new m.ItemRenderer(gl, { sprites: {}, texture: null }, null, new Map());
  const quads = (ctx, left = false) => {
    calls.length = 0;
    ir.render(batch, pose, ItemStack.of('spyglass'), ctx, left);
    return calls.filter((c) => c[0] === 'quad').length;
  };
  check('drawn: its model (two boxes) in the hands, either side, and at the head', ['thirdperson_righthand', 'thirdperson_lefthand', 'firstperson_righthand', 'firstperson_lefthand', 'head'].every((c) => quads(c) === 12) && quads('thirdperson_lefthand', true) === 12);
  check('drawn: its sprite in the inventory, on the ground and in a frame (not the model)', ['gui', 'ground', 'fixed'].every((c) => quads(c) === 0));
  let sr = null;
  const items = { render: (b, ps, st, ctx, left) => { sr = [st.item.id, ctx, left]; } };
  const root2 = m.playerModel();
  m.animateHumanoid(root2, 0, 0, 7, 10, 0, 0, false, false, arms);
  m.drawSpyglassAtHead(batch, items, pose, root2, ItemStack.of('spyglass'), true);
  check('drawn: in use, at the head in the head\'s context (not mirrored)', sr?.[0] === 'spyglass' && sr[1] === 'head' && sr[2] === false);
  // (and a player drawing it so: in use and not mid-swing)
  sr = null;
  give('spyglass');
  press();
  const drawnAt = [];
  const items2 = { render: (b, ps, st, ctx) => drawnAt.push(ctx) };
  m.drawPlayerHeldItems(batch, items2, pose, root2, p, 'right');
  check('drawn: a player scoping holds it at the head', drawnAt.join() === 'head');
  drawnAt.length = 0;
  p.swinging = true;
  p.swingTime = 2;
  m.drawPlayerHeldItems(batch, items2, pose, root2, p, 'right');
  check('drawn: mid-swing, in the hand', drawnAt.join() === 'thirdperson_righthand');
  p.swinging = false;
  p.swingTime = 0;
  hold(false);
  drawnAt.length = 0;
  m.drawPlayerHeldItems(batch, items2, pose, root2, p, 'right');
  check('drawn: lowered, in the hand', drawnAt.join() === 'thirdperson_righthand');
  const tex = m.spyglassModelTexture();
  check('model texture: 16 x 16, its faces opaque', tex.w === 16 && tex.h === 16 && [[0, 0], [1, 6], [2, 1], [5, 3], [8, 1], [8, 4]].every(([x, y]) => tex.data[(y * 16 + x) * 4 + 3] === 255));
}

// ---------------------------------------------------------------------------
// the sounds, the scope, a save
{
  const use = m.SOUNDS['item.spyglass.use'], stop = m.SOUNDS['item.spyglass.stop_using'];
  const loud = (g) => g.generate(0, 22050).some((v) => Math.abs(v) > 0.3);
  check('sounds: raised and lowered, one take each, not silent', use?.variants === 1 && stop?.variants === 1 && loud(use) && loud(stop));
  const scope = m.GUI_TEXTURES['spyglass_scope']?.();
  const a = (x, y) => scope.data[(y * scope.w + x) * 4 + 3];
  check('scope: 256 square, clear in the middle, black in the corners, a dark rim', scope?.w === 256 && scope.h === 256 && a(128, 128) === 0 && a(0, 0) === 255 && a(255, 255) === 255 && a(128, 3) === 255 && a(128, 20) < 128);
  const saved = m.saveStack(ItemStack.of('spyglass'));
  const back = m.loadStack(JSON.parse(JSON.stringify(saved)));
  check('save: a spyglass kept as itself', back?.item.id === 'spyglass' && back.count === 1);
  // (the use isn't kept: vanilla doesn't save it; a loaded player isn't scoping)
  const pd = m.savePlayer ? m.savePlayer(p, 'overworld', {}) : null;
  check('save: a player isn\'t saved scoping', !pd || !JSON.stringify(pd).includes('useItem'));
}

await exitWithStatus(close);
