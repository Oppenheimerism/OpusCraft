// The music discs (vanilla Items.MUSIC_DISC_*, JukeboxSongs, data/minecraft/jukebox_song): all nineteen, each a
// "Music Disc" with its song's description under it, its rarity, one to a stack and in the Tools & Utilities tab in
// vanilla's order, drawn (11 cracked); every song's length and comparator number; a jukebox playing each disc; a
// creeper killed by one of #skeletons (for an arrow, whoever shot it) dropping one disc of #creeper_drop_music_discs,
// and by anyone or anything else none; and the eleven discs' songs, rendered one at a time as the jukebox asks for
// them: about as long as vanilla's, levelled like the others, never silent for long, 11 cut off dead at the end.

import { load, check, exitWithStatus, flatLevel, addPlayer } from '../fixes/lib.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 600000).unref();

const { m, close } = await load([
  '/src/game/jukebox.ts', '/src/game/blockBehavior.ts', '/src/item/item.ts', '/src/item/jukeboxSongs.ts', '/src/entity/monsters.ts', '/src/entity/biomeMonsters.ts',
  '/src/entity/bogged.ts', '/src/entity/arrow.ts', '/src/entity/itemEntity.ts', '/src/world/blockEntity.ts', '/src/textures/items.ts', '/src/audio/synth.ts',
  '/src/audio/gen/discSongs.ts',
]);

/**
 * vanilla 1.21's discs in CreativeModeTabs.TOOLS_AND_UTILITIES' order: [id, description, the rarity the game gives it,
 * length_in_seconds, comparator_output]. (The rarities are 1.21.2's, as the rest of the game's are: Pigstep, otherside
 * and Creator rare, the others uncommon; 5 is still rare here, as every disc was in 1.21 itself.)
 */
const DISCS = [
  ['music_disc_13', 'C418 - 13', 'uncommon', 178, 1], ['music_disc_cat', 'C418 - cat', 'uncommon', 185, 2],
  ['music_disc_blocks', 'C418 - blocks', 'uncommon', 345, 3], ['music_disc_chirp', 'C418 - chirp', 'uncommon', 185, 4],
  ['music_disc_far', 'C418 - far', 'uncommon', 174, 5], ['music_disc_mall', 'C418 - mall', 'uncommon', 197, 6],
  ['music_disc_mellohi', 'C418 - mellohi', 'uncommon', 96, 7], ['music_disc_stal', 'C418 - stal', 'uncommon', 150, 8],
  ['music_disc_strad', 'C418 - strad', 'uncommon', 188, 9], ['music_disc_ward', 'C418 - ward', 'uncommon', 251, 10],
  ['music_disc_11', 'C418 - 11', 'uncommon', 71, 11], ['music_disc_creator_music_box', 'Lena Raine - Creator (Music Box)', 'uncommon', 73, 11],
  ['music_disc_wait', 'C418 - wait', 'uncommon', 238, 12], ['music_disc_creator', 'Lena Raine - Creator', 'rare', 176, 12],
  ['music_disc_precipice', 'Aaron Cherof - Precipice', 'uncommon', 299, 13], ['music_disc_otherside', 'Lena Raine - otherside', 'rare', 195, 14],
  ['music_disc_relic', 'Aaron Cherof - Relic', 'uncommon', 218, 14], ['music_disc_5', 'Samuel Åberg - 5', 'rare', 178, 15],
  ['music_disc_pigstep', 'Lena Raine - Pigstep', 'rare', 149, 13],
];
const NEW = ['blocks', 'chirp', 'far', 'mall', 'mellohi', 'stal', 'strad', 'ward', '11', 'wait', 'relic'].map((d) => `music_disc_${d}`);
/** vanilla #creeper_drop_music_discs and #skeletons */
const CREEPER_DISCS = ['13', 'cat', 'blocks', 'chirp', 'far', 'mall', 'mellohi', 'stal', 'strad', 'ward', '11', 'wait'].map((d) => `music_disc_${d}`);
const SKELETONS = ['skeleton', 'stray', 'wither_skeleton', 'skeleton_horse', 'bogged'];

// ---------------------------------------------------------------------------------------------------------------
// the items and their songs

for (const [id, desc, rarity] of DISCS) {
  const it = m.ITEMS.get(id);
  check(`${id}: "Music Disc", "${desc}" under it, ${rarity}, one to a stack, a tool`, it?.name === 'Music Disc' && it.lore?.join('|') === desc && it.rarity === rarity && it.maxStack === 1 && it.creativeTab === 'tools',
    it && `${it.name} ${it.lore} ${it.rarity} ${it.maxStack} ${it.creativeTab}`);
}
const tools = m.ITEM_LIST.filter((x) => x.creativeTab === 'tools' && x.id.startsWith('music_disc_')).map((x) => x.id);
check('the Tools & Utilities tab has all nineteen in vanilla\'s order', tools.join() === DISCS.map((d) => d[0]).join(), tools.join());
{
  const img = (id) => m.ITEM_TEXTURES[m.ITEMS.get(id)?.texture]?.();
  const all = DISCS.map(([id]) => img(id));
  check('every disc is drawn, 16 by 16', all.every((t) => t && t.w === 16 && t.h === 16 && t.data.length === 16 * 16 * 4));
  const same = (a, b) => a.data.every((v, i) => v === b.data[i]);
  check('each new disc\'s label is its own colour (no two drawn alike)', NEW.every((a, i) => NEW.every((b, j) => i === j || !same(img(a), img(b)))));
  // (11 is broken: its crack's dark pixels run across the label where 13's is whole)
  const at = (t, x, y) => t.data[(y * 16 + x) * 4];
  check('11 is drawn cracked: a dark line through its label that 13 hasn\'t', at(img('music_disc_11'), 8, 5) < 0x10 && at(img('music_disc_13'), 8, 5) > 0x10);
}

for (const [id, desc, , secs, comp] of DISCS) {
  const s = m.JUKEBOX_SONGS[id];
  check(`${id}'s song: music_disc.${id.slice(11)}, ${secs} s, a comparator reads ${comp}`, s?.sound === `music_disc.${id.slice(11)}` && s.description === desc && s.lengthSeconds === secs && s.comparatorOutput === comp,
    JSON.stringify(s));
}
check('nothing else is a disc (nineteen songs)', Object.keys(m.JUKEBOX_SONGS).length === DISCS.length);
check('every song is a music pool the synth can play (synth.MUSIC_POOLS, what the jukebox asks the audio worker for)', DISCS.every(([id]) => m.MUSIC_POOLS[m.JUKEBOX_SONGS[id].sound] === 1));
check('the eleven discs\' songs are listed with vanilla\'s lengths (audio/gen/discSongs.ts)', NEW.every((id) => m.DISC_SONG_SECONDS[m.JUKEBOX_SONGS[id].sound] === m.JUKEBOX_SONGS[id].lengthSeconds));
check('#creeper_drop_music_discs: C418\'s twelve', m.CREEPER_DROP_MUSIC_DISCS.join() === CREEPER_DISCS.join() && CREEPER_DISCS.every((id) => m.ITEMS.has(id)));
check('#skeletons: skeleton, stray, wither skeleton, skeleton horse, bogged', [...m.SKELETONS].sort().join() === [...SKELETONS].sort().join());

// ---------------------------------------------------------------------------------------------------------------
// a jukebox playing each

const { world, level } = flatLevel(m, -1, -1, 1, 1, 64, 'stone', 'discs');
const p = addPlayer(m, level, 3.5, 64, 0.5);
const heard = [], stopped = [], shown = [];
level.sound.playJukeboxSong = (event, x, y, z) => heard.push({ event, x, y, z });
level.sound.stopJukeboxSong = (x, y, z) => stopped.push({ x, y, z });
m.setNowPlayingListener((_l, d) => shown.push(d));
const X = 0, Y = 64, Z = 0;
level.setBlock(X, Y, Z, m.S('jukebox'));
const st = () => world.getState(X, Y, Z);
const beh = () => m.behaviorOf(st());
const be = () => world.getBlockEntity(X, Y, Z);
const ctx = { player: p, face: 1, hx: X + 0.5, hy: Y + 1, hz: Z + 0.5, hand: 'main' };
/** right-click the jukebox holding `stack` (null: an empty hand), as Interaction does: useItemOn, then use */
function click(stack) {
  p.inventory.main[p.inventory.selected] = stack;
  if (stack) {
    const r = beh().useItemOn(level, X, Y, Z, st(), stack, ctx);
    if (r === 'success' || r === 'consume') return r;
  }
  return beh().use(level, X, Y, Z, st(), ctx) ? 'used' : 'pass';
}
const clearDrops = () => { for (const e of level.entities) if (e.type === 'item' && !e.removed) e.remove(); };

for (const [id, desc, , , comp] of DISCS) {
  heard.length = shown.length = 0;
  const r = click(m.ItemStack.of(id));
  const playing = r === 'success' && heard.length === 1 && heard[0].event === m.JUKEBOX_SONGS[id].sound && shown.join() === desc;
  const reads = beh().analogOutput(level, X, Y, Z, st());
  const signal = beh().getSignal(world, X, Y, Z, st(), 'up');
  click(null);
  const out = level.entities.filter((e) => e.type === 'item' && !e.removed);
  check(`a jukebox plays ${id} ("Now Playing: ${desc}"), a comparator reads ${comp}, and gives it back`, playing && reads === comp && signal === 15 && out.length === 1 && out[0].stack.item.id === id && beh().analogOutput(level, X, Y, Z, st()) === 0,
    `${r} ${JSON.stringify(heard)} ${shown} ${reads} ${signal} ${out.map((e) => e.stack.item.id)}`);
  clearDrops();
}
{
  // (vanilla JukeboxSongPlayer: the song stops the tick after it has run a second past its length)
  const len = 71 * 20;
  click(m.ItemStack.of('music_disc_11'));
  stopped.length = 0;
  for (let i = 0; i < len + 20; i++) level.tick();
  const still = be().songPlayer.isPlaying() && stopped.length === 0;
  level.tick();
  check('11 plays 71 seconds and one more, then stops; the disc stays in and the comparator still reads 11', still && !be().songPlayer.isPlaying() && stopped.length === 1 && be().getTheItem()?.item.id === 'music_disc_11' && beh().analogOutput(level, X, Y, Z, st()) === 11);
  click(null);
  clearDrops();
}

// ---------------------------------------------------------------------------------------------------------------
// creepers' discs

p.setGameMode('creative');
const spawned = [];
const addEntity = level.addEntity.bind(level);
level.addEntity = (e) => (spawned.push(e), addEntity(e));
const CX = 12.5, CZ = 0.5;
function creeper() {
  const c = new m.Creeper(level);
  c.moveTo(CX, 64, CZ, 0, 0);
  addEntity(c);
  return c;
}
/** a creeper killed by `attacker` (the damage source's entity) through `direct`: the ids of what it dropped */
function killedBy(attacker, source = 'mob', direct = null) {
  const c = creeper();
  spawned.length = 0;
  c.hurt(1000, source, attacker, direct);
  const ids = spawned.filter((e) => e.type === 'item').map((e) => e.stack.item.id);
  for (const e of spawned) e.remove();
  c.remove();
  return ids;
}
const discsIn = (ids) => ids.filter((id) => id.startsWith('music_disc_'));

{
  // a skeleton's own arrow: shot at a creeper with a heart left, it kills it
  const sk = new m.Skeleton(level);
  sk.moveTo(CX - 7, 64, CZ, -90, 0);
  addEntity(sk);
  const c = creeper();
  c.health = 1;
  spawned.length = 0;
  const a = new m.Arrow(level, sk);
  a.shoot(c.x - a.x, c.y + c.height / 2 - a.y, c.z - a.z, 2.5, 0);
  level.addEntity(a);
  for (let i = 0; i < 20 && c.health > 0; i++) level.tick();
  const ids = spawned.filter((e) => e.type === 'item').map((e) => e.stack.item.id);
  const discs = discsIn(ids);
  check(`a creeper shot dead by a skeleton's arrow drops one disc of the tag (${ids.join(', ')})`, c.health <= 0 && discs.length === 1 && CREEPER_DISCS.includes(discs[0]) && ids.every((id) => id === 'gunpowder' || id === discs[0]));
  for (const e of spawned) e.remove();
  c.remove();
  sk.remove();
  a.remove();
}
{
  const by = (type) => new m[type](level);
  for (const type of ['Skeleton', 'Stray', 'Bogged', 'WitherSkeleton']) {
    const shooter = by(type);
    const arrow = new m.Arrow(level, shooter);
    const ids = type === 'WitherSkeleton' ? killedBy(shooter, 'mob') : killedBy(shooter, 'arrow', arrow);
    check(`killed by a ${shooter.type} (${type === 'WitherSkeleton' ? 'its sword' : 'its arrow'}): one disc (${discsIn(ids).join()})`, discsIn(ids).length === 1 && CREEPER_DISCS.includes(discsIn(ids)[0]));
  }
  check('killed by a player: no disc', discsIn(killedBy(p, 'player')).length === 0);
  check('by a zombie: no disc', discsIn(killedBy(by('Zombie'), 'mob')).length === 0);
  const loose = new m.Arrow(level, null);
  check('by an arrow nobody shot (a dispenser\'s): no disc', discsIn(killedBy(loose, 'arrow', loose)).length === 0);
  check('by a player\'s arrow: no disc', discsIn(killedBy(p, 'arrow', new m.Arrow(level, p))).length === 0);
  check('by falling or lava: no disc', discsIn(killedBy(null, 'fall')).length === 0 && discsIn(killedBy(null, 'lava')).length === 0);

  // a thousand and more: each one disc, every one of the twelve, nothing else, about evenly
  const count = Object.fromEntries(CREEPER_DISCS.map((id) => [id, 0]));
  let wrong = 0;
  const N = 1200;
  const sk = by('Skeleton');
  for (let i = 0; i < N; i++) {
    const d = discsIn(killedBy(sk, 'arrow', new m.Arrow(level, sk)));
    if (d.length !== 1 || !(d[0] in count)) wrong++;
    else count[d[0]]++;
  }
  check(`${N} creepers killed by skeletons: one disc each, all twelve, none outside the tag, each about a twelfth (${Object.values(count).join(' ')})`,
    wrong === 0 && Object.values(count).every((n) => n >= 60 && n <= 140));

  level.gameRules.doMobLoot = false;
  const none = killedBy(sk, 'arrow', new m.Arrow(level, sk));
  check('with doMobLoot off, nothing drops', none.length === 0, none.join());
  level.gameRules.doMobLoot = true;
}

// ---------------------------------------------------------------------------------------------------------------
// the eleven songs, one at a time (as the jukebox asks for them, at the game's rate), each let go before the next

const SR = 44100;
/**
 * a song's length, peak, RMS (dBFS), bad samples, the longest run of near-silent seconds (a second's RMS 40 dB under
 * the song's) before the last five (where it may be fading out), and the last 50 ms' peak
 */
function measure(x) {
  let peak = 0, sum = 0, bad = 0;
  for (let i = 0; i < x.length; i++) {
    const v = x[i];
    if (!Number.isFinite(v)) {
      bad++;
      continue;
    }
    peak = Math.max(peak, Math.abs(v));
    sum += v * v;
  }
  const rms = Math.sqrt(sum / Math.max(1, x.length));
  let run = 0, longest = 0;
  for (let i = 0; i + SR <= x.length - 5 * SR; i += SR) {
    let e = 0;
    for (let j = i; j < i + SR; j++) e += x[j] * x[j];
    run = Math.sqrt(e / SR) < rms * 0.01 ? run + 1 : 0;
    longest = Math.max(longest, run);
  }
  let tail = 0;
  for (let i = x.length - Math.round(0.05 * SR); i < x.length; i++) tail = Math.max(tail, Math.abs(x[i]));
  return { secs: x.length / SR, peak, db: 20 * Math.log10(rms), bad, longest, tail };
}
for (const id of NEW) {
  const song = m.JUKEBOX_SONGS[id];
  const t0 = Date.now();
  let x = m.generatePoolMusic(song.sound, 0, SR);
  const s = measure(x);
  x = null;
  const took = ((Date.now() - t0) / 1000).toFixed(1);
  const L = song.lengthSeconds;
  const ends = id === 'music_disc_11' ? s.tail > 0.1 : s.tail < 0.01;
  check(`${song.sound}: ${s.secs.toFixed(1)} s of vanilla's ${L}, peak ${s.peak.toFixed(2)}, ${s.db.toFixed(1)} dB, rendered in ${took} s`,
    s.secs <= L + 0.01 && s.secs >= L - 6 && s.peak > 0.25 && s.peak <= 0.6 + 1e-6 && s.db > -24 && s.db < -18 && s.bad === 0);
  check(`${song.sound}: never silent for more than 2 s before its last five (${s.longest} s), and ${id === 'music_disc_11' ? 'cut off dead at the end' : 'faded out at the end'} (last 50 ms peak ${s.tail.toFixed(3)})`, s.longest <= 2 && ends);
}

await exitWithStatus(close);
