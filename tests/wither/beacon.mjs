// Headless checks for the beacon (node tests/wither/beacon.mjs; the beacon, milestone 2): the block (its numbers, its
// model of glass case, obsidian and heart, its texture, its item, its recipe, its creative place); the pyramid under
// it counted tier by tier; its beam scanned up its column (stained glass colouring it, opaque blocks cutting it off,
// bedrock and see-through blocks not), lit only with a pyramid; the powers it gives (by tier, the range, the time,
// up as high as the world, II with all four tiers, the secondary, nobody in spectator, nothing with no power chosen
// or the beam cut); its sounds (powering up and down, its hum, the selection); Bring Home the Beacon and Beaconator
// for those near as it lights; saving (Levels counted again after loading); its menu (the payment slot, the powers
// chosen and paid for, the payment given back) and screen (buttons by tier, touch); its beam's renderer.
import { loadModules } from '../../scripts/load.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 900000).unref();
const P = [
  '/src/world/blocks.ts', '/src/game/level.ts', '/src/world/world.ts', '/src/world/chunk.ts', '/src/world/block.ts', '/src/entity/player.ts',
  '/src/item/item.ts', '/src/world/gen/biomes.ts', '/src/game/beacon.ts', '/src/game/blockBehavior.ts', '/src/world/blockEntity.ts',
  '/src/game/advancements.ts', '/src/inventory/recipes.ts', '/src/entity/effects.ts', '/src/textures/blocks.ts', '/src/textures/beacon.ts',
  '/src/render/beaconRenderer.ts', '/src/render/entityRenderer.ts', '/src/audio/synth.ts', '/src/game/blockRules.ts', '/src/gui/screens/creative.ts',
];
const { mods, close } = await loadModules(P);
const M = Object.fromEntries(P.map((p, i) => [p.replace(/^\/src\//, '').replace(/\.ts$/, ''), mods[i]]));
const { S, BLOCKS, STATE_BLOCK, OPACITY, getBlock } = M['world/block'];
const { ITEMS, ItemStack } = M['item/item'];
const { B } = M['world/gen/biomes'];
const BC = M['game/beacon'];
const { BeaconBlockEntity, pyramidLevels, beamColor, averageColor, BEACON_EFFECTS } = BC;
const { behaviorOf } = M['game/blockBehavior'];
let fails = 0;
const check = (name, cond, extra = '') => { if (!cond) fails++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const nameAt = (level, x, y, z) => BLOCKS[STATE_BLOCK[level.getState(x, y, z)]].name;

/** flat grass at y 63 on stone, for x, z in [-64, 64); day; a creative player at (px, 64, pz) */
function setup({ px = 0.5, pz = 8.5 } = {}) {
  const world = new M['world/world'].World();
  for (let cx = -4; cx < 4; cx++) for (let cz = -4; cz < 4; cz++) { const c = new M['world/chunk'].Chunk(cx, cz); c.biomes.fill(B.plains); world.chunks.set(c.key, c); }
  const st = S('stone'), t = S('grass_block');
  for (let x = -64; x < 64; x++) for (let z = -64; z < 64; z++) {
    const c = world.getChunk(x >> 4, z >> 4);
    for (let y = 50; y < 63; y++) c.setState(x & 15, y, z & 15, st);
    c.setState(x & 15, 63, z & 15, t);
  }
  for (const c of world.chunks.values()) c.recomputeHeightmap();
  const level = new M['game/level'].Level(world, 'beacons');
  const sounds = [], triggers = [];
  level.sound = { play(n, x, y, z, v, p) { sounds.push({ n, x, y, z, v, p, t: level.gameTime }); }, playUI() {} };
  level.particles = { blockBreak() {}, blockHit() {}, blockParticle() {}, spawn() {}, entityEffect() {}, poof() {}, dust() {}, emitAround() {}, spell() {}, fallingDust() {} };
  level.onPlayerTrigger = (p, type, payload) => triggers.push({ p, type, payload });
  level.doDaylightCycle = false;
  level.dayTime = 6000;
  level.simulationDistance = 4;
  const player = new M['entity/player'].Player(level);
  player.moveTo(px, 64, pz, 0, 0);
  player.setGameMode('creative');
  level.player = player;
  level.addEntity(player);
  return { level, world, player, sounds, triggers };
}
const run = (level, n) => { for (let i = 0; i < n; i++) level.tick(); };
/** on to the next four-second count (vanilla gameTime % 80 == 0), and the tick after */
const toCount = (level) => { do level.tick(); while (level.gameTime % 80 !== 0); level.tick(); };
/** a pyramid of `tiers` (of `block`) with its top under (x, y, z) */
function pyramid(level, x, y, z, tiers, block = 'iron_block') {
  for (let j = 1; j <= tiers; j++) for (let dx = -j; dx <= j; dx++) for (let dz = -j; dz <= j; dz++) level.setBlock(x + dx, y - j, z + dz, S(block));
}
/** a beacon at (x, y, z) on a pyramid of `tiers`, the beacon's block entity returned */
function beaconAt(level, x, y, z, tiers, block) {
  if (tiers) pyramid(level, x, y, z, tiers, block);
  level.setBlock(x, y, z, S('beacon'));
  return level.world.getBlockEntity(x, y, z);
}

// ===========================================================================
// the block
{
  const b = getBlock('beacon');
  check('the block: strength 3 (and 3 against blasts), light 15, stone\'s sounds, see-through but for 1', b.hardness === 3 && b.resistance === 3 && M['world/block'].EMISSION[b.defaultState] === 15 && b.sound === 'stone' && OPACITY[b.defaultState] === 1, `${b.hardness} ${b.resistance} ${b.sound} ${OPACITY[b.defaultState]}`);
  const model = b.s.model ? b.s.model(b.defaultState)?.model : null;
  const els = model?.elements ?? [];
  check('its model: the glass case (no face culled), the obsidian slab, the heart (vanilla block/beacon)', els.length === 3 && Object.values(els[0].faces).every((f) => f.tex === 'glass' && !f.cull) && els[1].faces.up.tex === 'obsidian' && els[1].from[1] === 0.1 && els[2].faces.north.tex === 'beacon' && els[2].to[1] === 14 && JSON.stringify(els[2].faces.north.uv) === '[3,2,13,13]');
  const tex = M['textures/blocks'].BLOCK_TEXTURES.beacon?.();
  check('...its heart\'s texture drawn (16x16)', !!tex && tex.w === 16 && tex.h === 16);
  const it = ITEMS.get('beacon');
  check('its item: rare (an aqua name)', it?.rarity === 'rare');
  check('...in the functional blocks (after the bell, by the tab\'s order)', it?.creativeTab === 'functional');
  const R = M['inventory/recipes'];
  const g = (...ids) => ids.map((i) => (i ? ItemStack.of(i) : null));
  const made = R.findRecipe(g('glass', 'glass', 'glass', 'glass', 'nether_star', 'glass', 'obsidian', 'obsidian', 'obsidian'), 3, 3);
  check('its recipe: five glass round a nether star over three obsidian', made?.result === 'beacon' && made.count === 1, made?.result);
  check('...nothing with the star elsewhere', !R.findRecipe(g('glass', 'nether_star', 'glass', 'glass', 'glass', 'glass', 'obsidian', 'obsidian', 'obsidian'), 3, 3));
  const { level } = setup();
  level.setBlock(0, 64, 0, S('beacon'));
  check('placed: its block entity', level.world.getBlockEntity(0, 64, 0) instanceof BeaconBlockEntity);
}

// ===========================================================================
// the pyramid
{
  const { level } = setup();
  for (let t = 1; t <= 4; t++) {
    pyramid(level, t * 20 - 40, 60, 0, t);
    check(`a pyramid of ${t} tier${t > 1 ? 's' : ''}: ${t}`, pyramidLevels(level, t * 20 - 40, 60, 0) === t);
  }
  check('nothing under it: 0', pyramidLevels(level, 40, 64, 40) === 0);
  pyramid(level, 30, 70, 30, 4);
  for (const [dx, dz, b] of [[-1, 0, 'gold_block'], [0, 1, 'emerald_block'], [1, 1, 'diamond_block'], [-1, -1, 'netherite_block']]) level.setBlock(30 + dx, 69, 30 + dz, S(b));
  check('...any mix of iron, gold, emerald, diamond and netherite blocks', pyramidLevels(level, 30, 70, 30) === 4);
  level.setBlock(32, 68, 30, S('stone'));
  check('...one block wrong in the second tier: the first tier only', pyramidLevels(level, 30, 70, 30) === 1);
  level.setBlock(32, 68, 30, S('iron_block'));
  level.setBlock(34, 66, 34, S('air'));
  check('...the fourth tier\'s corner gone: three', pyramidLevels(level, 30, 70, 30) === 3);
}

// ===========================================================================
// the beam
{
  const { level } = setup();
  const be = beaconAt(level, 0, 64, 0, 1);
  run(level, 2);
  check('the beam: white from the beacon up (one length, the beacon\'s colour)', be.beamSections.length === 1 && be.beamSections[0].color === beamColor(S('beacon')) && be.beamSections[0].color === 0xf9fffe);
  check('...not shown while it\'s dark (no count yet)', be.levels === 0 && be.shownBeam().length === 0);
  toCount(level);
  check('...lit at the next count (every 80 ticks): one tier, the beam shown', be.levels === 1 && be.shownBeam().length === 1);
  level.setBlock(0, 66, 0, S('red_stained_glass'));
  run(level, 2);
  check('red glass above: white to it, then red (the first glass its own colour)', be.beamSections.length === 2 && be.beamSections[0].height === 2 && be.beamSections[1].color === 0xb02e26, JSON.stringify(be.beamSections));
  level.setBlock(0, 67, 0, S('red_stained_glass'));
  run(level, 2);
  check('...a second red: the same length goes on', be.beamSections.length === 2);
  level.setBlock(0, 68, 0, S('blue_stained_glass_pane'));
  run(level, 2);
  check('...a blue pane: red and blue mixed half and half', be.beamSections.length === 3 && be.beamSections[2].color === averageColor(0xb02e26, 0x3c44aa) && be.beamSections[2].color === 0x763968, (be.beamSections[2]?.color ?? 0).toString(16));
  level.setBlock(0, 70, 0, S('oak_leaves'));
  level.setBlock(0, 71, 0, S('bedrock'));
  level.setBlock(0, 72, 0, S('glass'));
  run(level, 3);
  check('...leaves, bedrock and glass let it through', be.beamSections.length === 3, JSON.stringify(be.beamSections));
  level.setBlock(0, 74, 0, S('tinted_glass'));
  run(level, 3);
  check('...tinted glass (opaque to light) cuts it off', be.beamSections.length === 0);
  level.setBlock(0, 74, 0, S('air'));
  run(level, 3);
  level.setBlock(0, 69, 0, S('stone'));
  run(level, 3);
  check('...stone over it: no beam', be.beamSections.length === 0 && be.shownBeam().length === 0);
}

// ===========================================================================
// lighting up, the sounds, the advancements
{
  const { level, player, sounds, triggers } = setup({ px: 0.5, pz: 8.5 });
  const far = new M['entity/player'].Player(level);
  far.moveTo(0.5, 64, 15.5, 0, 0);
  level.addEntity(far);
  const spec = new M['entity/player'].Player(level);
  spec.moveTo(-3.5, 64, 0.5, 0, 0);
  spec.setGameMode('spectator');
  level.addEntity(spec);
  const be = beaconAt(level, 0, 64, 0, 4);
  toCount(level);
  check('lit with four tiers: its power-up sound from its middle', be.levels === 4 && sounds.some((s) => s.n === 'block.beacon.activate' && s.x === 0.5 && s.y === 64.5 && s.z === 0.5));
  check('...Bring Home the Beacon and Beaconator for the player near it (within 10 across)', triggers.some((t) => t.p === player && t.type === 'construct_beacon' && t.payload.beaconLevel === 4));
  check('...not for one 15 off, nor one in spectator', !triggers.some((t) => t.p === far || t.p === spec));
  const A = M['game/advancements'];
  const adv = new A.PlayerAdvancements();
  adv.trigger('construct_beacon', { beaconLevel: 2 });
  check('...two tiers: Bring Home the Beacon, not Beaconator', adv.isDone(A.ADVANCEMENTS.get('nether/create_beacon')) && !adv.isDone(A.ADVANCEMENTS.get('nether/create_full_beacon')));
  adv.trigger('construct_beacon', { beaconLevel: 4 });
  check('...four: Beaconator', adv.isDone(A.ADVANCEMENTS.get('nether/create_full_beacon')));
  sounds.length = 0;
  toCount(level);
  check('lit: it hums each count (block.beacon.ambient)', sounds.some((s) => s.n === 'block.beacon.ambient'));
  const n = triggers.length;
  level.setBlock(4, 60, 4, S('stone'));
  sounds.length = 0;
  toCount(level);
  check('a corner of the bottom tier gone: three tiers, still lit, no sound, no trigger', be.levels === 3 && !sounds.some((s) => /activate/.test(s.n)) && triggers.length === n);
  for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) level.setBlock(dx, 63, dz, S('dirt'));
  sounds.length = 0;
  toCount(level);
  check('the top tier gone: dark, its power-down sound', be.levels === 0 && sounds.some((s) => s.n === 'block.beacon.deactivate') && be.shownBeam().length === 0);
  sounds.length = 0;
  level.setBlock(0, 64, 0, S('air'));
  check('broken: its power-down sound (whether lit or not)', sounds.some((s) => s.n === 'block.beacon.deactivate') && !level.world.getBlockEntity(0, 64, 0));
}

// ===========================================================================
// its powers
{
  const { level, player } = setup({ px: 0.5, pz: 19.5 });
  player.setGameMode('survival');
  const out = new M['entity/player'].Player(level);
  out.moveTo(0.5, 64, 22.5, 0, 0);
  out.setGameMode('survival');
  level.addEntity(out);
  const high = new M['entity/player'].Player(level);
  high.moveTo(5.5, 250, 5.5, 0, 0);
  high.setGameMode('survival');
  high.flying = true;
  level.addEntity(high);
  const be = beaconAt(level, 0, 64, 0, 1);
  toCount(level);
  check('lit with no power chosen: nothing given', !player.hasEffect('speed') && !player.hasEffect('haste'));
  be.setPowers(level, 'speed', null);
  toCount(level);
  const sp = player.getEffect('speed');
  check('speed chosen (one tier): speed I for 11 s (9 + 2 a tier), ambient, to a player 19 off', sp?.amplifier === 0 && sp.duration >= 219 && sp.duration <= 220 && sp.ambient === true, `${sp?.amplifier} ${sp?.duration} ${sp?.ambient}`);
  check('...not to one 22 off (range 20 with one tier)', !out.hasEffect('speed'));
  check('...to one far above it (the box up as high as the world)', high.hasEffect('speed'));
  be.setPowers(level, 'regeneration', 'strength');
  toCount(level);
  check('a power above its tier still works as vanilla\'s (the host refuses it from a guest\'s screen; regeneration as primary here)', player.hasEffect('regeneration'));
  check('...the secondary not given below four tiers', !player.getEffect('strength'));
  level.setBlock(0, 66, 0, S('stone'));
  player.removeAllEffects?.();
  for (const id of ['speed', 'regeneration', 'strength']) player.removeEffect?.(id);
  toCount(level);
  check('the beam cut off: no powers given', !player.hasEffect('regeneration'));
  level.setBlock(0, 66, 0, S('air'));
  const four = beaconAt(level, 40, 64, 40, 4);
  player.moveTo(40.5, 64, 40.5 + 49, 0, 0);
  four.setPowers(level, 'haste', 'haste');
  toCount(level);
  toCount(level);
  const h = player.getEffect('haste');
  check('four tiers, haste twice: haste II for 17 s, 49 off (range 50)', h?.amplifier === 1 && h.duration >= 339 && h.duration <= 340, `${h?.amplifier} ${h?.duration}`);
  four.setPowers(level, 'resistance', 'regeneration');
  toCount(level);
  check('...resistance and regeneration: both, I', player.getEffect('resistance')?.amplifier === 0 && player.getEffect('regeneration')?.amplifier === 0);
  const spec = new M['entity/player'].Player(level);
  spec.moveTo(40.5, 64, 45.5, 0, 0);
  spec.setGameMode('spectator');
  level.addEntity(spec);
  toCount(level);
  check('...nobody in spectator', !spec.hasEffect('resistance'));
  check('only a beacon\'s own powers kept (vanilla filterEffect)', BC.filterEffect('minecraft:speed') === 'speed' && BC.filterEffect('wither') === null && BC.filterEffect('night_vision') === null);
  check('its powers by tier: speed or haste; resistance or jump boost; strength; regeneration', JSON.stringify(BEACON_EFFECTS) === '[["speed","haste"],["resistance","jump_boost"],["strength"],["regeneration"]]');
}

// ===========================================================================
// saving
{
  const { level } = setup();
  const be = beaconAt(level, 0, 64, 0, 2);
  toCount(level);
  be.setPowers(level, 'jump_boost', null);
  be.customName = 'Lighthouse';
  const saved = be.save();
  check('saved: its powers, its tiers, its name (vanilla primary_effect, secondary_effect, Levels, CustomName)', saved.data.primary_effect === 'jump_boost' && saved.data.Levels === 2 && saved.data.CustomName === 'Lighthouse' && saved.data.secondary_effect === undefined, JSON.stringify(saved.data));
  const copy = new BeaconBlockEntity(0, 64, 0);
  copy.load({ ...saved, data: { ...saved.data, secondary_effect: 'minecraft:night_vision' } });
  check('...loaded: its powers and name back, a power no beacon gives dropped', copy.primary === 'jump_boost' && copy.secondary === null && copy.customName === 'Lighthouse');
  check('...its tiers not read back: counted again (vanilla), dark till then', copy.levels === 0 && copy.shownBeam().length === 0);
}

// ===========================================================================
// its beam's renderer (with a stand-in batch)
{
  const { level } = setup();
  const be = beaconAt(level, 0, 64, 0, 1);
  level.setBlock(0, 66, 0, S('lime_stained_glass'));
  toCount(level);
  const verts = [];
  const batch = { setOverlay() {}, begin() {}, flush() {}, vertexRaw(x, y, z, u, v, r, g, b, a) { verts.push({ x, y, z, r, g, b, a }); }, lightB: 0, lightS: 0 };
  const gl = null;
  const R = new M['render/beaconRenderer'].BeaconRenderer(gl);
  R.tex = {};
  const frustum = { testBox: () => true };
  R.render(batch, level.world, level.gameTime, 0.5, 70, 10.5, frustum, 0);
  const lime = verts.filter((v) => Math.abs(v.g - 0xc7 / 255) < 1e-6);
  check('the beam drawn: two lengths (white, then lime up 1024), a core and a glow each (4 sides, 2 triangles)', verts.length === 2 * 2 * 4 * 6 && lime.length === 2 * 4 * 6, `${verts.length}`);
  check('...the glow faint (alpha 32), the core opaque', verts.some((v) => Math.abs(v.a - 32 / 255) < 1e-6) && verts.some((v) => v.a === 1));
  check('...the top length reaching 1024 above where it starts', Math.max(...verts.map((v) => v.y)) > 1000);
  const dark = beaconAt(level, 20, 64, 20, 0);
  run(level, 3);
  verts.length = 0;
  R.render(batch, level.world, level.gameTime, 20.5, 70, 30.5, { testBox: (x) => x > 10 }, 0);
  check('...nothing for a dark beacon', verts.length === 0 && dark.shownBeam().length === 0);
  const t = M['textures/beacon'].beaconBeamTexture();
  check('the beam\'s texture: 16x16, near white, half see-through to solid', t.w === 16 && t.h === 16 && [...t.data].filter((_, i) => i % 4 === 3).every((a) => a >= 120));
}

await close();
console.log(fails ? `${fails} FAILED` : 'all ok');
process.exit(fails ? 1 : 0);
