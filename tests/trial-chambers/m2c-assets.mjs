// M2c: what the trial spawner and the vault look and sound like, and the rest of M2's odds and ends — every texture
// each state's model asks for (the ominous ones bluer, the lit ones brighter), the item sprites and where the
// creative tabs list them, every sound the two blocks, the item spawner and the honey bottle play (rendered, clean),
// the particles as vanilla's providers make them (and each sprite they ask for on the sheet), the honey bottle,
// block entity data given with /setblock, and what the renderers draw inside the cages.

import fs from 'node:fs';
import { load, check, flatLevel, place, playerAt, rightClick, exitWithStatus } from './lib.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 300000).unref();

const { m, close } = await load([
  '/src/textures/blocks.ts', '/src/textures/items.ts', '/src/audio/synth.ts', '/src/render/particles.ts', '/src/render/mesher.ts',
  '/src/render/particleAtlas.ts', '/src/render/trialChamberRenderers.ts', '/src/world/blockEntity.ts', '/src/game/trialChambers.ts',
  '/src/game/trialSpawner.ts', '/src/game/vault.ts', '/src/entity/ominousItemSpawner.ts', '/src/game/commands.ts', '/src/game/snbt.ts',
  '/src/entity/effects.ts', '/src/textures/trialChamberParticles.ts',
]);

const px = (t, x, y) => {
  const i = (y * t.w + x) * 4;
  return [t.data[i], t.data[i + 1], t.data[i + 2], t.data[i + 3]];
};
const lum = (t) => {
  let s = 0, n = 0;
  for (let y = 0; y < t.h; y++) for (let x = 0; x < t.w; x++) {
    const [r, g, b, a] = px(t, x, y);
    if (!a) continue;
    s += r * 0.299 + g * 0.587 + b * 0.114;
    n++;
  }
  return n ? s / n : 0;
};
/** how blue it is against red, over its drawn pixels */
const blueness = (t) => {
  let r = 0, b = 0;
  for (let i = 0; i < t.data.length; i += 4) if (t.data[i + 3]) {
    r += t.data[i];
    b += t.data[i + 2];
  }
  return b / (r + 1);
};
const drawn = (t) => t.data.filter((v, i) => i % 4 === 3 && v > 0).length;
const same = (a, b) => a.w === b.w && a.h === b.h && a.data.every((v, i) => v === b.data[i]);
const still = (t) => (t && t.frames ? { w: t.w, h: t.h, data: t.frames[0] } : t);
const tex = (n) => still(m.BLOCK_TEXTURES[n]?.());

/** the textures a state's model asks the atlas for */
const asked = new Set();
m.initMesher(new Proxy({}, { get: (_, n) => (asked.add(n), { u0: 0, v0: 0, u1: 1, v1: 1 }) }));
function texturesOf(st) {
  asked.clear();
  const models = m.bakeChoice(m.getBlock(m.BLOCKS[m.STATE_BLOCK[st]].name).s.model(m.STATE_VIEWS[st]));
  return { names: [...asked].filter((n) => typeof n === 'string' && n !== 'missing'), particle: models.variants[0]?.particle };
}

// ---------------------------------------------------------------------------------------------------------------
// Block textures

{
  const missing = [];
  let states = 0;
  for (const n of ['trial_spawner', 'vault']) {
    const b = m.getBlock(n);
    for (let st = b.baseState; st < b.baseState + b.stateCount; st++) {
      states++;
      const { names, particle } = texturesOf(st);
      for (const t of [...names, particle]) if (!m.BLOCK_TEXTURES[t]) missing.push(`${n}:${t}`);
      if (!names.length) missing.push(`${n}: no textures`);
    }
  }
  check(`textures: every state of the trial spawner and the vault (${states} states) has its textures`, states === 12 + 32 && missing.length === 0, [...new Set(missing)].slice(0, 8).join(' '));
  const all = Object.keys(m.BLOCK_TEXTURES).filter((n) => /^(trial_spawner|vault)_/.test(n));
  check(`textures: all ${all.length} of them 16x16`, all.length === 11 + 16 && all.every((n) => tex(n).w === 16 && tex(n).h === 16), all.filter((n) => tex(n).w !== 16).join());
  check('textures: each one different from the others', all.every((a, i) => all.every((b, j) => j <= i || !same(tex(a), tex(b)))));
  // the ominous ones soul-fire blue, the normal ones orange
  const pairs = all.filter((n) => n.endsWith('_ominous')).map((n) => [n.slice(0, -8), n]);
  check('textures: the ominous ones bluer than the normal ones', pairs.length === 13 && pairs.every(([a, b]) => blueness(tex(b)) > blueness(tex(a)) * 1.2),
    pairs.map(([a, b]) => `${a} ${blueness(tex(a)).toFixed(2)}/${blueness(tex(b)).toFixed(2)}`).filter((_, i) => i < 3).join(', '));
  for (const o of ['', '_ominous']) {
    check(`textures: the${o ? ' ominous' : ''} trial spawner's lit top and sides brighter than its dark ones`,
      lum(tex(`trial_spawner_top_active${o}`)) > lum(tex(`trial_spawner_top_inactive${o}`)) + 3 && lum(tex(`trial_spawner_side_active${o}`)) > lum(tex(`trial_spawner_side_inactive${o}`)) + 3);
    check(`textures: the${o ? ' ominous' : ''} vault's front lit when it's on and ejecting, its sides lit when it's on`,
      lum(tex(`vault_front_on${o}`)) > lum(tex(`vault_front_off${o}`)) + 3 && lum(tex(`vault_front_ejecting${o}`)) > lum(tex(`vault_front_off${o}`)) + 3 && lum(tex(`vault_side_on${o}`)) > lum(tex(`vault_side_off${o}`)) + 3);
  }
  // a cage: the far side shows through its gaps (clear pixels), and the model draws its inner faces too
  check('textures: the trial spawner\'s sides and top are a cage (clear gaps)', ['trial_spawner_side_active', 'trial_spawner_top_inactive'].every((n) => tex(n).data.some((v, i) => i % 4 === 3 && v === 0)));
  const faces = m.bakeChoice(m.getBlock('trial_spawner').s.model(m.STATE_VIEWS[m.getBlock('trial_spawner').defaultState])).variants[0].quads.length;
  check('textures: the cage has its inner faces (12 quads)', faces === 12, `${faces}`);
  // vanilla TrialSpawnerState.lightLevel and VaultState's
  const light = (n, props) => m.getBlock(n).s.light?.({ get: (k) => props[k] });
  const tl = ['inactive', 'waiting_for_players', 'active', 'waiting_for_reward_ejection', 'ejecting_reward', 'cooldown'].map((s) => light('trial_spawner', { trial_spawner_state: s, ominous: false }));
  check('light: the trial spawner 0, 4, 8, 8, 8, 0 by state', tl.join() === '0,4,8,8,8,0', tl.join());
}

// ---------------------------------------------------------------------------------------------------------------
// Item sprites and the creative tabs

{
  const bad = [];
  for (const id of ['trial_spawner', 'vault', 'honey_bottle', 'flow_armor_trim_smithing_template', 'bolt_armor_trim_smithing_template']) {
    const it = m.ITEMS.get(id);
    if (!it) { bad.push(`${id}: no item`); continue; }
    if (!it.texture) {
      if (!it.block) bad.push(`${id}: no sprite`);
      continue;
    }
    const img = it.texture.startsWith('block:') ? m.BLOCK_TEXTURES[it.texture.slice(6)]?.() : m.ITEM_TEXTURES[it.texture]?.();
    if (!img || img.w !== 16 || img.h !== 16) bad.push(`${id}: ${it.texture}`);
  }
  check('items: the trial spawner, the vault, the honey bottle and the two templates have their icons', bad.length === 0, bad.join(' '));
  const spr = (id) => m.ITEM_TEXTURES[m.ITEMS.get(id).texture]();
  const [honey, flow, bolt, upgrade] = ['honey_bottle', 'flow_armor_trim_smithing_template', 'bolt_armor_trim_smithing_template', 'netherite_upgrade_smithing_template'].map(spr);
  check('items: the sprites have clear corners and something drawn', [honey, flow, bolt].every((t) => px(t, 0, 0)[3] === 0 && drawn(t) > 30));
  check('items: the honey bottle golden (more red and green than blue)', (() => {
    let r = 0, g = 0, b = 0;
    for (let i = 0; i < honey.data.length; i += 4) if (honey.data[i + 3]) { r += honey.data[i]; g += honey.data[i + 1]; b += honey.data[i + 2]; }
    return r > b * 1.5 && g > b * 1.2;
  })());
  check('items: the flow and bolt templates each their own, not the netherite upgrade\'s', !same(flow, bolt) && !same(flow, upgrade) && !same(bolt, upgrade));
  const it = (id) => m.ITEMS.get(id);
  const tab = (id) => it(id).creativeTab;
  const next = (id) => m.ITEM_LIST[m.ITEM_LIST.indexOf(it(id)) + 1]?.id;
  check('creative: the trial spawner right after the spawner, with the functional blocks', tab('trial_spawner') === 'functional' && next('spawner') === 'trial_spawner');
  check('creative: the vault right after the end portal frame', tab('vault') === 'functional' && next('end_portal_frame') === 'vault');
  check('creative: the honey bottle after the milk bucket, 16 to a stack', tab('honey_bottle') === 'food' && next('milk_bucket') === 'honey_bottle' && it('honey_bottle').maxStack === 16);
  check('creative: the flow then bolt templates after the netherite upgrade, uncommon', next('netherite_upgrade_smithing_template') === 'flow_armor_trim_smithing_template' &&
    next('flow_armor_trim_smithing_template') === 'bolt_armor_trim_smithing_template' && it('bolt_armor_trim_smithing_template').rarity === 'uncommon');
}

// ---------------------------------------------------------------------------------------------------------------
// Sounds

{
  const events = ['break', 'step', 'place', 'hit', 'fall'];
  check('sounds: the trial spawner\'s and the vault\'s sound groups, each with break, step, place, hit and fall',
    m.getBlock('trial_spawner').sound === 'trial_spawner' && m.getBlock('vault').sound === 'vault' && ['trial_spawner', 'vault'].every((g) => events.every((e) => m.SOUNDS[`block.${g}.${e}`])));
  const played = new Set();
  for (const f of ['src/game/trialSpawner.ts', 'src/game/vault.ts', 'src/entity/ominousItemSpawner.ts', 'src/game/honeyBottle.ts'])
    for (const [, n] of fs.readFileSync(f, 'utf8').matchAll(/'((?:block|item|entity|event)\.[a-z_.]+[a-z])'/g)) played.add(n);
  const missing = [...played].filter((n) => !m.SOUNDS[n]);
  check(`sounds: every event the two blocks, the item spawner and the honey bottle play is there (${played.size})`, played.size >= 24 && missing.length === 0, missing.join());
  const names = Object.keys(m.SOUNDS).filter((n) => /^(block\.(trial_spawner|vault)\.|item\.honey_bottle\.|event\.mob_effect\.trial_omen)/.test(n));
  const bad = [];
  for (const n of names) {
    const g = m.SOUNDS[n];
    for (let v = 0; v < g.variants; v++) {
      const b = g.generate(v, 44100);
      let peak = 0;
      for (const x of b) peak = Math.max(peak, Math.abs(x));
      if (!(b.length > 441 && b.length < 44100 * 3 && peak > 0.05 && peak <= 1 && b.every(Number.isFinite))) bad.push(`${n}#${v} ${(b.length / 44100).toFixed(2)}s ${peak.toFixed(2)}`);
    }
  }
  check(`sounds: all ${names.length} of them render, clean and under three seconds`, names.length >= 30 && bad.length === 0, bad.join());
}

// ---------------------------------------------------------------------------------------------------------------
// Particles

{
  const { world } = flatLevel(m, -1, -1, 0, 0);
  const pe = new m.ParticleEngine({ sprites: {} }, world, () => 0xffffff);
  const list = () => pe.sprites;
  const of = (kind) => list().filter((p) => p.kind === kind);
  const KINDS = ['trial_spawner_detection', 'trial_spawner_detection_ominous', 'ominous_spawning', 'vault_connection', 'small_flame', 'trial_omen', 'flame', 'soul_fire_flame', 'smoke'];
  for (let i = 0; i < 200; i++) for (const k of KINDS) pe.spawn(k, 0.5, 70, 0.5, k === 'ominous_spawning' || k === 'vault_connection' ? 1 : 0, 0.5, 0);
  check('particles: each kind the trial chambers spawn is made', KINDS.every((k) => of(k).length === 200), KINDS.filter((k) => of(k).length !== 200).join());
  // every sprite they ask for is on the sheet (vanilla particles/*.json)
  const glProxy = new Proxy({}, { get: (_, k) => (typeof k === 'string' && /^[A-Z_0-9]+$/.test(k) ? 0 : () => ({})) });
  const { rects } = m.buildParticleAtlas(glProxy);
  const frames = new Set(list().filter((p) => KINDS.includes(p.kind)).flatMap((p) => p.frames));
  const off = [...frames].filter((f) => !rects[f]);
  check(`particles: every sprite they ask for is on the sheet (${frames.size})`, frames.size >= 14 && off.length === 0, off.join());
  // vanilla TrialSpawnerDetectionParticle: 12-24 ticks, full bright, upright facing the camera, animated by age
  const det = [...of('trial_spawner_detection'), ...of('trial_spawner_detection_ominous')];
  const lives = det.map((p) => p.lifetime);
  check('particles: detection wisps last 12 to 24 ticks, rise, glow and stand upright', Math.min(...lives) >= 12 && Math.max(...lives) <= 24 && det.every((p) => p.fullBright && p.upright && p.gravity < 0 && p.frames.length === 5 && p.frame === -1),
    `${Math.min(...lives)}-${Math.max(...lives)}`);
  // vanilla FlyStraightTowardsParticle (ominous_spawning): 25-29 ticks, blue fading to white, flying in to where it was sent from
  const om = of('ominous_spawning');
  check('particles: the ominous spawning sparks fly straight in over 25-29 ticks, blue to white', om.every((p) => p.lifetime >= 25 && p.lifetime <= 29 && p.straight && Math.abs(p.x - 1.5) < 1e-9 && p.colorLerp?.[5] === 1 && Math.abs(p.b - 0xfe / 255) < 1e-6));
  // vanilla FlyTowardsPositionParticle.VaultConnectionProvider: 30-39 ticks, fading in, pale blue-white
  const vc = of('vault_connection');
  check('particles: the vault\'s sparks fly in over 30-39 ticks, fading in, pale', vc.every((p) => p.lifetime >= 30 && p.lifetime <= 39 && p.alpha === 0 && p.lifetimeAlpha && Math.abs(p.r / p.b - 0.9) < 1e-6 && p.enchant));
  // vanilla FlameParticle.SmallFlameProvider: a flame half the size
  const avg = (a) => a.reduce((s, p) => s + p.size, 0) / a.length;
  check('particles: a small flame is a flame at half size', Math.abs(avg(of('small_flame')) / avg(of('flame')) - 0.5) < 0.06 && of('small_flame').every((p) => p.frames[0] === 'flame'), (avg(of('small_flame')) / avg(of('flame'))).toFixed(3));
  // the sprites: 8x8, each detection frame smaller than the one before (a flame dying to an ember)
  const src = m.trialChamberParticleTextures();
  const imgs = Object.fromEntries(Object.entries(src).map(([k, f]) => [k, f()]));
  check('particles: their 13 sprites are 8x8 with something drawn', Object.keys(imgs).length === 13 && Object.values(imgs).every((t) => t.w === 8 && t.h === 8 && drawn(t) > 0));
  const shrink = (k) => [0, 1, 2, 3, 4].map((i) => drawn(imgs[`${k}_${i}`]));
  check('particles: the detection wisp shrinks frame by frame', ['trial_spawner_detection', 'trial_spawner_detection_ominous'].every((k) => shrink(k).every((n, i, a) => !i || n < a[i - 1])), shrink('trial_spawner_detection').join());
  check('particles: the ominous wisp blue, the normal one orange', blueness(imgs.trial_spawner_detection_ominous_0) > 1 && blueness(imgs.trial_spawner_detection_0) < 0.5);
  check('particles: Trial Omen swirls its own teal curl (vanilla ParticleTypes.TRIAL_OMEN)', m.MOB_EFFECTS.trial_omen?.particle === 'trial_omen');
}

// ---------------------------------------------------------------------------------------------------------------
// The honey bottle

{
  const { level, sounds } = flatLevel(m, -1, -1, 0, 0);
  const p = playerAt(m, level, 0.5, 64, 0.5, { held: 'honey_bottle' });
  p.inventory.main[0].count = 3;
  p.food.level = 20;
  p.food.saturation = 0;
  p.addEffect(new m.MobEffectInstance(m.MOB_EFFECTS.poison, 400, 0));
  p.addEffect(new m.MobEffectInstance(m.MOB_EFFECTS.speed, 400, 0));
  const inter = rightClick(m, level, p);
  check('honey: drunk even when full, over two seconds', p.useItem?.item.id === 'honey_bottle' && p.useItemRemaining === 40 && m.itemBehaviorOf('honey_bottle')?.useAnim === 'drink');
  for (let i = 0; i < 39; i++) inter.tickUsingItem();
  const before = p.inventory.main[0]?.count;
  inter.tickUsingItem();
  check('honey: finished on the 40th tick, one of the three gone', before === 3 && p.inventory.main[0]?.count === 2 && !p.useItem);
  check('honey: 6 food and 1.2 saturation', p.food.level === 20 && Math.abs(p.food.saturation - 1.2) < 1e-6, `${p.food.level} ${p.food.saturation}`);
  check('honey: cures poison, and nothing else', !p.getEffect('poison') && !!p.getEffect('speed'));
  check('honey: the glass bottle goes in the inventory', p.inventory.main.some((s) => s?.item.id === 'glass_bottle'));
  const gulps = sounds.filter((s) => s.name === 'item.honey_bottle.drink').length;
  check('honey: slurped as it goes (its own gulps: vanilla getDrinkingSound), then the burp', gulps >= 7 && !sounds.some((s) => s.name === 'entity.generic.drink') && sounds.some((s) => s.name === 'entity.player.burp'), `${gulps} slurps`);
  // the last one: the bottle in the hand
  p.inventory.main[0].count = 1;
  p.food.level = 10;
  const i2 = rightClick(m, level, p);
  for (let i = 0; i < 40; i++) i2.tickUsingItem();
  check('honey: the last one leaves the bottle in the hand', p.inventory.main[0]?.item.id === 'glass_bottle' && p.food.level === 16);
  // creative: kept, and no bottle
  const c = playerAt(m, level, 0.5, 64, 2.5, { held: 'honey_bottle', creative: true });
  const i3 = rightClick(m, level, c);
  for (let i = 0; i < 40; i++) i3.tickUsingItem();
  check('honey: in creative it\'s kept and there\'s no bottle', c.inventory.main[0]?.item.id === 'honey_bottle' && c.inventory.main[0].count === 1 && !c.inventory.main.some((s) => s?.item.id === 'glass_bottle'));
  // A Balanced Diet counts it
  const consumed = [];
  p.inventory.main[0] = new m.ItemStack(m.ITEMS.get('honey_bottle'), 1);
  const i5 = new m.Interaction(level, p);
  i5.onConsumed = (id) => consumed.push(id);
  rightClick(m, level, p, i5);
  for (let i = 0; i < 40; i++) i5.tickUsingItem();
  check('honey: counts as eaten (A Balanced Diet)', consumed.includes('honey_bottle'));
}

// ---------------------------------------------------------------------------------------------------------------
// Block entity data given with /setblock

{
  const { level } = flatLevel(m, -1, -1, 0, 0);
  const chat = [];
  const game = { meta: { allowCommands: true }, chat: (s) => chat.push(s), world: level.world, level, player: { x: 0.5, y: 64, z: 0.5 } };
  const run = (line) => {
    chat.length = 0;
    m.executeCommand(game, line);
    return chat.join(' | ');
  };
  const be = (x, y, z) => level.world.getBlockEntity(x, y, z);
  let out = run('setblock 2 64 0 minecraft:vault[ominous=true]{config:{key_item:{id:"minecraft:ominous_trial_key"},loot_table:"minecraft:chests/trial_chambers/reward_ominous"}}');
  const v = be(2, 64, 0);
  check('setblock: an ominous vault with its config', out.startsWith('Changed') && v instanceof m.VaultBlockEntity && v.config.keyItem === 'ominous_trial_key' &&
    v.config.lootTable === 'chests/trial_chambers/reward_ominous' && v.config.activationRange === 4 && m.blockOf(level.getState(2, 64, 0)).get(level.getState(2, 64, 0), 'ominous') === true, out);
  out = run('setblock 3 64 0 vault{config:{key_item:{id:"minecraft:diamond",count:1},activation_range:6.5d,deactivation_range:7d}}');
  check('setblock: a vault keyed to something else, with its ranges', be(3, 64, 0)?.config.keyItem === 'diamond' && be(3, 64, 0).config.activationRange === 6.5 && be(3, 64, 0).config.deactivationRange === 7, out);
  out = run('setblock 4 64 0 minecraft:trial_spawner{normal_config: "minecraft:trial_chamber/melee/zombie/normal", ominous_config: "minecraft:trial_chamber/melee/zombie/ominous"} replace');
  const t = be(4, 64, 0);
  check('setblock: a trial spawner with its configs (spaces in the data, the mode after it)', out.startsWith('Changed') && t instanceof m.TrialSpawnerBlockEntity &&
    t.normalConfig === 'trial_chamber/melee/zombie/normal' && t.ominousConfig === 'trial_chamber/melee/zombie/ominous' && t.normalConfigDef.simultaneousMobs === 3, out);
  out = run('setblock 5 64 0 trial_spawner{spawn_data:{entity:{id:"minecraft:husk"}},required_player_range:20,target_cooldown_length:200}');
  const t2 = be(5, 64, 0);
  check('setblock: a trial spawner of husks with its range and cooldown', t2?.nextSpawnData?.entity.id === 'husk' && t2.requiredPlayerRange === 20 && t2.targetCooldownLength === 200 && !t2.normalConfig, out);
  out = run('setblock 5 64 0 trial_spawner[trial_spawner_state=cooldown]{required_player_range:500}');
  check('setblock: data makes the spawner anew, its range at most 128', be(5, 64, 0) === t2 && t2.requiredPlayerRange === 128 && t2.targetCooldownLength === 36000 && !t2.nextSpawnData, out);
  out = run('setblock 4 64 0 minecraft:trial_spawner{normal_config: "x"} keep');
  check('setblock: keep after the data still refuses a taken spot', out.includes('Could not set the block') && t.normalConfig === 'trial_chamber/melee/zombie/normal', out);
  out = run('setblock 6 64 0 stone{foo:1b}');
  check('setblock: data on a block with no block entity is ignored', out.startsWith('Changed') && m.blockOf(level.getState(6, 64, 0)).name === 'stone', out);
  const sn = m.parseSnbt('{a:1b,b:[I;1,2],c:"q\\"x",d:{e:-2.5f},f:true,\'g h\':[{i:j}]}');
  check('snbt: numbers, typed arrays, strings, compounds, booleans and lists read', JSON.stringify(sn) === JSON.stringify({ a: 1, b: [1, 2], c: 'q"x', d: { e: -2.5 }, f: true, 'g h': [{ i: 'j' }] }), JSON.stringify(sn));
}

// ---------------------------------------------------------------------------------------------------------------
// The renderers: the mob in the trial spawner's cage, the vault's display item, the item spawner's item

{
  const { level } = flatLevel(m, -1, -1, 0, 0);
  level.difficulty = 'normal';
  place(m, level, 'trial_spawner', 2, 64, 2);
  const t = level.world.getBlockEntity(2, 64, 2);
  t.readBlockEntityData('{normal_config:"minecraft:trial_chamber/melee/zombie/normal"}');
  const b = { lightS: 0, lightB: 0, setOverlay() {} };
  const drawnItems = [];
  const items = { isBlockModel: () => false, render: (_b, ps, s) => drawnItems.push({ id: s.item.id, m: [...ps.m], light: [b.lightS, b.lightB] }) };
  const mobs = [];
  const cam = { x: 0.5, y: 65, z: 0.5 };
  const frustum = { testBox: () => true };
  const r = new m.TrialChamberRenderers();
  const drawAt = (state) => {
    const st = level.getState(2, 64, 2);
    level.setBlock(2, 64, 2, m.blockOf(st).with(st, 'trial_spawner_state', state));
    mobs.length = 0;
    r.render(b, items, level, cam, 0, frustum, (mob, base) => mobs.push({ type: mob.type, base: [...base] }));
    return mobs;
  };
  const shown = ['inactive', 'waiting_for_players', 'active', 'waiting_for_reward_ejection', 'ejecting_reward', 'cooldown'].map((s) => drawAt(s).length);
  check('render: the spawner\'s mob spins in its cage only while it waits for players or fights', shown.join() === '0,1,1,0,0,0', shown.join());
  drawAt('active');
  const sc = Math.hypot(mobs[0].base[0], mobs[0].base[1], mobs[0].base[2]);
  check('render: a zombie, scaled to fit the cage (0.53125 over its height)', mobs[0].type === 'zombie' && Math.abs(sc - 0.53125 / 1.95) < 1e-3, `${mobs[0].type} ${sc.toFixed(4)}`);
  level.difficulty = 'peaceful';
  check('render: none on peaceful', drawAt('active').length === 0);
  level.difficulty = 'normal';
  // the vault: its display item while it's waiting on someone
  place(m, level, 'vault', 4, 64, 2);
  const v = level.world.getBlockEntity(4, 64, 2);
  v.displayItem = new m.ItemStack(m.ITEMS.get('diamond'), 1);
  drawnItems.length = 0;
  r.render(b, items, level, cam, 0, frustum, () => {});
  const idle = drawnItems.length;
  v.connectedPlayers.add('someone');
  r.render(b, items, level, cam, 0, frustum, () => {});
  check('render: the vault shows its display item only while someone\'s near', idle === 0 && drawnItems.length === 1 && drawnItems[0].id === 'diamond');
  // the item spawner's item: grows over 50 ticks, full bright
  const e = m.OminousItemSpawner.create(level, new m.ItemStack(m.ITEMS.get('arrow'), 1));
  e.moveTo(3.5, 66, 3.5, 0, 0);
  e.tickCount = 25;
  drawnItems.length = 0;
  r.renderItemSpawner(b, items, level, e, 3, 1, 3, 0);
  const s25 = Math.hypot(drawnItems[0].m[0], drawnItems[0].m[1], drawnItems[0].m[2]);
  e.tickCount = 80;
  r.renderItemSpawner(b, items, level, e, 3, 1, 3, 0);
  const s80 = Math.hypot(drawnItems[1].m[0], drawnItems[1].m[1], drawnItems[1].m[2]);
  check('render: the item spawner\'s item half grown at 25 ticks, whole from 50, lit full', Math.abs(s25 - 0.5) < 1e-3 && Math.abs(s80 - 1) < 1e-3 && drawnItems.every((d) => d.light[0] === 240 && d.light[1] === 240), `${s25} ${s80}`);
}

await exitWithStatus(close);
