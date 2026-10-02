// The End Poem and credits, headless: node tests/end/credits.mjs
import { loadModules } from '../../scripts/load.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 120000).unref();
const { mods: [, blockMod, , winMod, textsMod, travelMod, dimMod, playerMod, levelMod, worldMod, fontMod, chunkMod], close } = await loadModules([
  '/src/world/blocks.ts', '/src/world/block.ts', '/src/item/item.ts', '/src/gui/screens/winScreen.ts', '/src/gui/screens/endTexts.ts', '/src/game/endTravel.ts', '/src/world/dimension.ts', '/src/entity/player.ts',
  '/src/game/level.ts', '/src/world/world.ts', '/src/textures/font.ts', '/src/world/chunk.ts',
]);
let fails = 0;
const check = (name, cond, extra = '') => { if (!cond) fails++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };

// ---- the lines
const lines = winMod.creditsLines('Steve', true);
const poemText = lines.map((l) => l.text).join('\n');
check('PLAYERNAME is the player', !poemText.includes('PLAYERNAME') && poemText.includes('§2Steve?') && poemText.includes('Steve. Player of games.'));
check('no obfuscation token left', !poemText.includes('§f§k§a§b'));
check('every line fits in 256 pixels', lines.every((l) => l.centered || winMod.textWidth(l.text) <= 256 || !l.text.includes(' ')), lines.filter((l) => !l.centered && winMod.textWidth(l.text) > 256).map((l) => l.text).join(' | '));
// the first paragraphs: one line each, then an empty line
check('starts with the first voice', lines[0].text === '§3I see the player you mean.' && lines[1].text === '' && lines[2].text === '§2Steve?' && lines[3].text === '');
// a long paragraph wraps and its colour carries on
const i9 = lines.findIndex((l) => l.text.startsWith('§3They used to hear voices.'));
check('a long paragraph wraps, each line in its voice', i9 >= 0 && lines[i9 + 1].text.startsWith('§3') && lines[i9 + 2].text.startsWith('§3') && lines[i9 + 3].text.startsWith('§3'), lines.slice(i9, i9 + 5).map((l) => JSON.stringify(l.text)).join('\n   '));
// scrambled words: white, obfuscated, 3..6 letters, then the voice again
const scr = [...poemText.matchAll(/§f§k(X+)§([23])/g)];
check('eight scrambled words, 3 to 6 letters, the voice after', scr.length === 8 && scr.every((m) => m[1].length >= 3 && m[1].length <= 6), scr.map((m) => m[1].length).join(','));
// vanilla's lengths: RandomSource.create(8124371).nextInt(4) + 3 in turn (java.util.Random's sequence)
{
  // java.util.Random in BigInt, independent of the game's
  let seed = (8124371n ^ 0x5deece66dn) & ((1n << 48n) - 1n);
  const next = (bits) => { seed = (seed * 0x5deece66dn + 0xbn) & ((1n << 48n) - 1n); return Number(BigInt.asIntN(32, seed >> BigInt(48 - bits))); };
  const want = [];
  for (let i = 0; i < 8; i++) want.push(Number((4n * BigInt(next(31))) >> 31n) + 3);
  check("the scrambled words' lengths are vanilla's", scr.map((m) => m[1].length).join() === want.join(), `${scr.map((m) => m[1].length)} want ${want}`);
}
// the poem ends with 8 empty lines, then the credits
const iWake = lines.findIndex((l) => l.text === '§2Wake up.');
check('eight empty lines after the last paragraph (and its own)', lines.slice(iWake + 1, iWake + 10).every((l) => l.text === '') && lines[iWake + 10].text === '§f============' && lines[iWake + 10].centered);
check('a section: heading, name in yellow, heading, centred', lines[iWake + 11].text === '§eMinecraft, Rebuilt in a Browser' && lines[iWake + 12].text === '§f============');
const iTitle = lines.findIndex((l) => l.text === '§7Direction and Playtesting');
check('titles grey, names white and indented 11 spaces', iTitle > 0 && !lines[iTitle].centered && lines[iTitle + 1].text === '§f           Oppenheimerism');
{
  const ip = lines.findIndex((l) => l.text.startsWith('§7NOT AN OFFICIAL'));
  const rest = lines.slice(ip);
  const n = rest.findIndex((l) => l.text === '');
  check('the post-credits after the credits (wrapped, grey), then 1 + 8 empty lines', ip > iWake && rest.slice(0, n).every((l) => l.text.startsWith('§7')) && rest.length - n === 9 && rest.slice(n).every((l) => l.text === ''), rest.map((l) => JSON.stringify(l.text)).join(' '));
}
check('the poem has 76 paragraphs', textsMod.END_POEM.length === 76);
check('no poem without it', !winMod.creditsLines('Steve', false).some((l) => l.text.includes('player you mean')));
console.log(`  ${lines.length} lines: ${(lines.length * 12 / 10 / 60).toFixed(1)} minutes at half a pixel a tick (and 2 screens more)`);

// ---- the screen: scrolling, speeding up, reversing, the end
const keys = new Set();
const music = [];
const fakeGame = {
  playerName: 'Alex',
  input: { isDown: (k) => keys.has(k) },
  sound: { keepSituationalMusic: (p) => music.push('keep ' + p), stopSituationalMusic: (p) => music.push('stop ' + p) },
};
let finished = 0;
const scr2 = new winMod.WinScreen(fakeGame, true, () => finished++);
scr2.initScreen(427, 240);
check('not a pause screen with the poem', scr2.isPauseScreen() === false);
scr2.advance(1000);
check('half a pixel a tick: 10 a second', Math.abs(scr2.scrolled - 10) < 1e-9, String(scr2.scrolled));
keys.add('Space');
scr2.advance(1000);
check('space: five times as fast', Math.abs(scr2.scrolled - 60) < 1e-9, String(scr2.scrolled));
keys.add('ControlLeft');
scr2.advance(100);
check('and each control key 15 more', Math.abs(scr2.scrolled - (60 + 2 * 0.5 * 20)) < 1e-9, String(scr2.scrolled));
keys.clear();
keys.add('ArrowUp');
scr2.advance(1000);
check('up: backwards', Math.abs(scr2.scrolled - 70) < 1e-9, String(scr2.scrolled));
scr2.advance(100000);
check('never above the start', scr2.scrolled === 0);
keys.clear();
const total = winMod.creditsLines('Alex', true).length * 12 + 240 * 2 + 24;
scr2.advance((total / 10) * 1000 - 100);
check('still going just before the end', finished === 0);
scr2.advance(200);
check('over once everything has gone by', finished === 1);
scr2.advance(200);
check('only once', finished === 1);
const scr3 = new winMod.WinScreen(fakeGame, true, () => finished++);
scr3.initScreen(427, 240);
scr3.onClose();
check('Escape ends it', finished === 2);
scr3.removed();
check('its music stops with it', music.includes('stop music.credits'));

// drawing: a fake GuiGraphics catching what's drawn
{
  const drawn = [];
  const g = { width: 427, height: 240, ctx: null, spriteWidth: () => 274, sprite: (n, x, y) => { drawn.push(['sprite', n, x, y]); return true; }, centered() {}, text: (s, x, y, c, sh) => { drawn.push(['text', s, x, y, c, sh]); return x + fontMod.textWidth(s); } };
  const s4 = new winMod.WinScreen(fakeGame, true, () => {});
  s4.initScreen(427, 240);
  s4.render(g, 0, 0, 0);
  check('the logo first, 50 below the screen', drawn.some((d) => d[0] === 'sprite' && d[1] === 'title_logo' && d[3] === 290));
  check('its music playing', music.includes('keep music.credits'));
  check('nothing on screen yet', !drawn.some((d) => d[0] === 'text'));
  // scrolled to the scrambled words' paragraph
  const ls = winMod.creditsLines('Alex', true);
  const iw = ls.findIndex((l) => l.text.includes('§f§k'));
  drawn.length = 0;
  // line iw at y = 390 + 12 iw - scroll: bring it to 100
  s4.advance(((390 + 12 * iw - 100) / 10) * 1000);
  s4.render(g, 0, 0, 0);
  const at = drawn.filter((d) => d[0] === 'text' && Math.abs(d[3] - 100) < 1);
  const white = at.filter((d) => d[4] === 0xffffff);
  check('the unreadable words drawn white, scrambled, as wide as XXXX…', white.length >= 1 && white.every((d) => !/^X+$/.test(d[1]) && fontMod.textWidth(d[1]) === fontMod.textWidth('X'.repeat(d[1].length))), JSON.stringify(at.map((d) => [d[1], d[4].toString(16)])));
  check('the rest in the voice (dark aqua), with shadows', at.some((d) => d[4] === 0x00aaaa && d[5] === true));
  check('poem lines at the left of a 256 column', at[0][2] === Math.floor(427 / 2) - 128);
}

// ---- the flow: through the exit portal the first time
{
  const world = new worldMod.World();
  world.reset(dimMod.THE_END);
  const level = new levelMod.Level(world, '1');
  const p = new playerMod.Player(level);
  p.spawnX = 10; p.spawnY = 70; p.spawnZ = -5;
  const calls = [];
  let arrive = null, screen = null;
  const g = {
    world, level, player: p,
    sound: { playUI() {}, keepSituationalMusic() {}, stopSituationalMusic() {} },
    changeDimension: (dim, x, y, z, a, portal) => { calls.push(['changeDimension', dim.id, x, y, z, portal]); arrive = a; world.reset(dim); },
    setScreen: (s) => { screen = s; calls.push(['setScreen', s?.constructor?.name ?? s?.kind ?? null]); },
    winScreenFactory: (done) => ({ kind: 'win', done }),
    receivingScreenFactory: (r) => ({ kind: 'receiving ' + r }),
    teleport: (x, y, z) => { calls.push(['teleport', x, y, z]); p.moveTo(x, y, z, 0, 0); },
    chat: (m) => calls.push(['chat', m]),
    onChangedDimension: (a, b) => calls.push(['changed', a.id, b.id]),
    chunks: { setTicket() {}, setCenter() {} },
  };
  p.remainingFireTicks = 100;
  p.air = 20;
  travelMod.endPortalTravel(g, p);
  check('seen now', p.seenCredits === true);
  check('out of the End at once, home loading', calls[0][0] === 'changeDimension' && calls[0][1] === 'overworld' && calls[0][5] === true, JSON.stringify(calls[0]));
  check('the credits over it', screen?.kind === 'win');
  check('not home while they roll', arrive(g) === false && arrive(g) === false);
  screen.done();
  check('then "Loading terrain..." over the starfield', screen?.kind === 'receiving end_portal');
  // (findRespawn: no bed, near the world spawn: vanilla adjustSpawnLocation, within the spawn radius, once the chunks
  // round it are in: a stone floor under y 70 here)
  const floor = () => {
    for (let cx = -2; cx <= 2; cx++) for (let cz = -3; cz <= 1; cz++) {
      const c = new chunkMod.Chunk(cx, cz);
      world.chunks.set(c.key, c);
      for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) for (let y = 60; y < 70; y++) c.setState(x, y, z, blockMod.S('stone'));
    }
  };
  floor();
  const ok = arrive(g);
  check('then home, near the world spawn', ok === true && calls.some((c) => c[0] === 'teleport' && Math.abs(c[1] - 10.5) <= 10 && Math.abs(c[3] + 4.5) <= 10 && c[2] === 70), JSON.stringify(calls));
  check('as a new player keeping everything: fire out, breath back', p.remainingFireTicks === 0 && p.air === 300);
  check('changed dimension End → Overworld (advancements)', calls.some((c) => c[0] === 'changed' && c[1] === 'the_end' && c[2] === 'overworld'));
  // the second time: straight home, no credits
  world.reset(dimMod.THE_END);
  calls.length = 0;
  screen = null;
  travelMod.endPortalTravel(g, p);
  floor();
  check('the second time, no credits', screen === null && arrive(g) === true);
}
console.log(fails ? `${fails} FAILED` : 'all ok');
await close();
process.exit(fails ? 1 : 0);
