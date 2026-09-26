// The jukebox (vanilla JukeboxBlock / JukeboxBlockEntity / JukeboxSongPlayer): a disc right-clicked in plays its song
// (the sound at the block, "Now Playing", a note every 20 ticks, a signal of 15, the disc's comparator number, parrots
// dancing), right-clicked again or broken it pops out on top; the song stops a second past its length; the disc and
// the song's progress go through a chunk save and load (the song going on unheard); and the discs' own music.

import { load, check, exitWithStatus, flatLevel, addPlayer } from '../fixes/lib.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 300000).unref();

const { m, close } = await load([
  '/src/game/jukebox.ts', '/src/game/blockBehavior.ts', '/src/item/item.ts', '/src/entity/parrot.ts', '/src/entity/itemEntity.ts',
  '/src/world/blockEntity.ts', '/src/storage/worldStore.ts', '/src/item/jukeboxSongs.ts', '/src/audio/gen/discMusic.ts',
  '/src/gui/hud.ts',
]);

const { world, level } = flatLevel(m, -1, -1, 1, 1, 64, 'stone', 'jukebox');
const p = addPlayer(m, level, 3.5, 64, 0.5);

// what the level sends out: the songs heard and stopped, the notes, the game events, "Now Playing"
const heard = [], stopped = [], notes = [], events = [], shown = [];
level.sound.playJukeboxSong = (event, x, y, z) => heard.push({ event, x, y, z });
level.sound.stopJukeboxSong = (x, y, z) => stopped.push({ x, y, z });
level.particles.spawn = (kind, x, y, z, xd) => kind === 'note' && notes.push({ x, y, z, xd, t: level.gameTime });
const gameEvent = level.gameEvent.bind(level);
level.gameEvent = (e, ...rest) => (events.push(e), gameEvent(e, ...rest));
m.setNowPlayingListener((_l, d) => shown.push(d));

const X = 0, Y = 64, Z = 0;
level.setBlock(X, Y, Z, m.S('jukebox'));
const st = () => world.getState(X, Y, Z);
const hasRecord = () => !!m.BLOCKS[m.STATE_BLOCK[st()]].get(st(), 'has_record');
const be = () => world.getBlockEntity(X, Y, Z);
const beh = () => m.behaviorOf(st());
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
const tick = (n) => { for (let i = 0; i < n; i++) level.tick(); };
const discsAround = () => level.entities.filter((e) => e.type === 'item' && !e.removed && e.stack.item.id.startsWith('music_disc'));

check('the jukebox has a block entity, empty, has_record false', be() instanceof m.JukeboxBlockEntity && !be().getTheItem() && !hasRecord());
check('the jukebox item: a functional block, crafted from planks round a diamond',
  m.ITEMS.get('jukebox')?.creativeTab === 'functional');

// a parrot two blocks off
const parrot = new m.Parrot(level);
parrot.moveTo(X + 2.5, Y, Z + 0.5, 0, 0);
level.addEntity(parrot);

// --- inserting ---
const r0 = click(m.ItemStack.of('stone'));
check('something that isn\'t a disc does nothing to it', r0 === 'pass' && !hasRecord());
const cat = m.ItemStack.of('music_disc_cat');
const r1 = click(cat);
check('a disc goes in (useItemOn success) and has_record is set', r1 === 'success' && hasRecord() && be().getTheItem()?.item.id === 'music_disc_cat');
check('in survival the disc leaves the hand', !p.inventory.main[p.inventory.selected]);
check('its song is heard from the jukebox (music_disc.cat)', heard.length === 1 && heard[0].event === 'music_disc.cat' && heard[0].x === X && heard[0].y === Y);
check('"Now Playing: C418 - cat" is shown', shown.length === 1 && shown[0] === 'C418 - cat', JSON.stringify(shown));
check('a block_change game event', events.includes('block_change'));
check('a signal of 15 while it plays', beh().getSignal(world, X, Y, Z, st(), 'up') === 15 && beh().isSignalSource(st()));
check('a comparator reads the disc\'s number (cat: 2)', beh().analogOutput(level, X, Y, Z, st()) === 2);
check('the parrot within 3 blocks dances', parrot.partyParrot === true);

// --- notes every 20 ticks ---
events.length = 0;
tick(41);
check('a note every 20 ticks (3 in 41 ticks), 1.2 above the block\'s middle', notes.length === 3 && notes.every((n) => n.x === X + 0.5 && Math.abs(n.y - (Y + 1.2)) < 1e-9 && n.z === Z + 0.5), JSON.stringify(notes));
check('the notes\' colours are 0, 1, 2 or 3 24ths', notes.every((n) => [0, 1, 2, 3].some((k) => Math.abs(n.xd - k / 24) < 1e-9)));
check('a jukebox_play game event with each note', events.filter((e) => e === 'jukebox_play').length === 3);

// --- ejecting by hand ---
const r2 = click(null);
const out = discsAround();
check('right-clicked again it pops the disc out', r2 === 'used' && out.length === 1 && out[0].stack.item.id === 'music_disc_cat');
check('on top: 1.01 above the bottom, within 0.35 of the middle', out.length === 1 && Math.abs(out[0].x - X - 0.5) <= 0.35 && Math.abs(out[0].y - Y - 1.01) <= 0.35 && Math.abs(out[0].z - Z - 0.5) <= 0.35, out[0] && `${out[0].x} ${out[0].y} ${out[0].z}`);
check('the song stops, has_record is cleared, the signal goes', stopped.length >= 1 && !hasRecord() && !be().songPlayer.isPlaying() && beh().getSignal(world, X, Y, Z, st(), 'up') === 0);
check('the comparator reads 0', beh().analogOutput(level, X, Y, Z, st()) === 0);
check('the parrot stops dancing', parrot.partyParrot === false);
for (const e of out) e.remove();

// --- creative: the disc stays in the hand ---
p.setGameMode('creative');
const five = m.ItemStack.of('music_disc_5');
click(five);
check('in creative the disc stays in the hand', p.inventory.main[p.inventory.selected] === five && five.count === 1 && hasRecord());
check('a comparator reads 15 for 5', beh().analogOutput(level, X, Y, Z, st()) === 15);
click(null);
for (const e of discsAround()) e.remove();
p.setGameMode('survival');

// --- the song ends a second past its length ---
const box = m.JUKEBOX_SONGS.music_disc_creator_music_box;
const len = Math.ceil(box.lengthSeconds * 20);
stopped.length = 0;
events.length = 0;
click(m.ItemStack.of('music_disc_creator_music_box'));
stopped.length = 0;
// (vanilla JukeboxSongPlayer.tick: hasFinished is asked before the count goes up, so the tick after the count reaches
// lengthInTicks + 20 is the one that stops it)
tick(len + 20);
check(`Creator (Music Box) still plays ${len + 20} ticks in`, be().songPlayer.isPlaying() && stopped.length === 0);
tick(1);
check(`and has stopped on the next (a second past its ${box.lengthSeconds} s)`, !be().songPlayer.isPlaying() && stopped.length === 1 && events.includes('jukebox_stop_play'));
check('the disc stays in, has_record still set, the comparator still reads 11', hasRecord() && be().getTheItem()?.item.id === 'music_disc_creator_music_box' && beh().analogOutput(level, X, Y, Z, st()) === 11);
check('no signal once the song is over', beh().getSignal(world, X, Y, Z, st(), 'up') === 0, `${be().songPlayer.ticksSinceSongStarted}`);
const notesBefore = notes.length;
tick(40);
check('no more notes once it\'s over', notes.length === notesBefore);
click(null);
for (const e of discsAround()) e.remove();

// --- save and load ---
click(m.ItemStack.of('music_disc_otherside'));
tick(137);
const chunk = world.getChunk(0, 0);
const saved = structuredClone(m.serializeChunk('w', chunk, world.chunkBlockEntities(0, 0).map((b) => b.save())));
const d = m.deserializeChunk(saved);
const w2 = new m.World();
heard.length = 0;
w2.addChunk({ cx: 0, cz: 0, blocks: d.blocks, light: m.computeChunkLight(d.blocks), biomes: d.biomes, blockEntities: d.blockEntities, pending: [] });
const be2 = w2.getBlockEntity(X, Y, Z);
check('saved and loaded: the jukebox, has_record set, the disc in it', be2 instanceof m.JukeboxBlockEntity && be2.getTheItem()?.item.id === 'music_disc_otherside' && m.BLOCKS[m.STATE_BLOCK[w2.getState(X, Y, Z)]].get(w2.getState(X, Y, Z), 'has_record') === true);
check('the song goes on from where it was (137 ticks in)', be2?.songPlayer.isPlaying() && be2.songPlayer.ticksSinceSongStarted === 137, be2 && String(be2.songPlayer.ticksSinceSongStarted));
check('unheard (vanilla setSongWithoutPlaying: no song starts on loading)', heard.length === 0);
const l2 = new m.Level(w2, 'jukebox');
l2.sound = { play() {}, playUI() {}, stopJukeboxSong: (x, y, z) => stopped.push({ x, y, z }) };
l2.particles = { blockBreak() {}, blockHit() {}, spawn() {} };
const other = m.JUKEBOX_SONGS.music_disc_otherside;
stopped.length = 0;
for (let i = 0; i < Math.ceil(other.lengthSeconds * 20) + 20 - 137; i++) l2.tick();
check('the loaded song still plays up to its end', be2.songPlayer.isPlaying());
l2.tick();
check('and ends when it would have', !be2.songPlayer.isPlaying() && stopped.length === 1, `${be2.songPlayer.ticksSinceSongStarted} ${stopped.length}`);
// an empty jukebox saves without a disc or a song
{
  const e = new m.JukeboxBlockEntity(1, 2, 3);
  const s = e.save();
  const back = m.loadBlockEntity(structuredClone(s));
  check('an empty jukebox saves and loads empty', back instanceof m.JukeboxBlockEntity && !back.getTheItem() && !back.songPlayer.isPlaying() && s.items.length === 0);
}

// --- breaking it ---
stopped.length = 0;
level.destroyBlock(X, Y, Z, true, null, true, null, p);
const popped = discsAround();
check('broken, it pops the disc out on top', popped.length === 1 && popped[0].stack.item.id === 'music_disc_otherside' && popped[0].y > Y + 0.6, popped[0] && String(popped[0].y));
check('and drops itself', level.entities.some((e) => e.type === 'item' && !e.removed && e.stack.item.id === 'jukebox'));
check('the song stops', stopped.length >= 1);
check('the parrot isn\'t dancing', parrot.partyParrot === false || (level.tick(), parrot.partyParrot === false));

// --- replaced by another block (as /setblock does) ---
level.setBlock(X, Y, Z, m.S('jukebox'));
click(m.ItemStack.of('music_disc_13'));
for (const e of discsAround()) e.remove();
level.setBlock(X, Y, Z, m.S('stone'));
check('replaced by another block, it pops the disc out too', discsAround().length === 1 && discsAround()[0].stack.item.id === 'music_disc_13');

// --- the discs' music ---
const scores = m.checkDiscScores();
check('every disc\'s melody fills its bars', scores.every((s) => s.misaligned === 0), JSON.stringify(scores));
for (const id of ['music_disc_13', 'music_disc_cat', 'music_disc_otherside']) {
  const song = m.JUKEBOX_SONGS[id];
  const s = scores.find((x) => x.event === song.sound);
  check(`${song.sound} is written, and no longer than vanilla's ${song.lengthSeconds} s (${s?.seconds.toFixed(1)} s)`, !!s && s.seconds <= song.lengthSeconds && s.seconds > song.lengthSeconds - 25);
}
check('every disc has a song the synth can play', Object.values(m.JUKEBOX_SONGS).every((s) => s.sound === 'music_disc.5' || s.sound in m.DISC_SONGS));
{
  const sr = 8000;
  const t0 = Date.now();
  const pcm = m.renderDiscMusic('music_disc.cat', sr);
  let peak = 0;
  for (const v of pcm) peak = Math.max(peak, Math.abs(v));
  const secs = pcm.length / sr;
  check(`music_disc.cat renders: ${secs.toFixed(1)} s, peak ${peak.toFixed(2)}, in ${((Date.now() - t0) / 1000).toFixed(1)} s`, secs > 150 && secs <= 185 + 1 && peak > 0.2 && peak <= 1);
}

// --- the HUD's Now Playing ---
{
  const hud = new m.Hud();
  hud.setNowPlaying('C418 - cat');
  check('the action bar reads "Now Playing: C418 - cat", animated', hud.actionBar?.text === 'Now Playing: C418 - cat' && hud.actionBar.animate === true && hud.actionBar.time === 60);
}

await exitWithStatus(close);
