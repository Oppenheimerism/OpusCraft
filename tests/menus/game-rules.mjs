// The Game Rules screen (vanilla EditGameRulesScreen), opened from Create New World's More tab: every rule the game
// has, under vanilla's categories in vanilla's order, each category's rules by id; an ON/OFF button for a rule that
// is one or the other and a box for a number; a number the rule doesn't take turns red and holds Done back; Done
// hands back the edited rules, Cancel leaves the caller's as they were.

import { load, check, exitWithStatus } from '../fixes/lib.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 120000).unref();

const { m, close } = await load(['/src/game/gameRules.ts', '/src/gui/screens/gameRules.ts', '/src/gui/screen.ts']);

// --- what the screen says of each rule
const ids = Object.keys(m.DEFAULT_GAME_RULES);
const cats = m.GAME_RULE_CATEGORIES.map(([id]) => id);
check('every rule has a name and a category the screen knows', ids.every((id) => m.GAME_RULE_INFO[id]?.name && cats.includes(m.GAME_RULE_INFO[id].category)), ids.filter((id) => !m.GAME_RULE_INFO[id]).join());
check('...and nothing is described that is not a rule', Object.keys(m.GAME_RULE_INFO).every((id) => id in m.DEFAULT_GAME_RULES));
check('the categories in vanilla\'s order', cats.join() === 'player,mobs,spawning,drops,updates,chat,misc', cats.join());
check('bounds only on numbers', Object.entries(m.GAME_RULE_INFO).every(([id, i]) => (i.min === undefined && i.max === undefined) || typeof m.DEFAULT_GAME_RULES[id] === 'number'));

// --- a rule's number
const int = m.parseGameRuleInt;
check('a number: digits, signed or not', int('randomTickSpeed', '3') === 3 && int('randomTickSpeed', '-2') === -2 && int('randomTickSpeed', '+7') === 7);
check('...nothing else', [' 3', '3 ', '', 'x', '3.5', '1e3', '0x10', '-'].every((s) => int('randomTickSpeed', s) === null));
check('...within an int', int('randomTickSpeed', '2147483647') === 2147483647 && int('randomTickSpeed', '2147483648') === null && int('randomTickSpeed', '-2147483649') === null);
check('...and within the rule\'s own bounds (snow: 0 to 8; a portal delay: not negative)', int('snowAccumulationHeight', '8') === 8 && int('snowAccumulationHeight', '9') === null && int('snowAccumulationHeight', '-1') === null && int('playersNetherPortalDefaultDelay', '-1') === null);

// --- the screen (a game that only shows screens; text six pixels a character)
const game = { screen: null, setScreen(s) { this.screen = s; s?.initScreen(427, 240); }, renderMenuBackground() {} };
const drawn = [];
const g = {
  wrap(text, maxW) {
    const out = [];
    let line = '';
    for (const w of text.split(' ')) {
      const cand = line ? line + ' ' + w : w;
      if (cand.length * 6 <= maxW || !line) line = cand;
      else { out.push(line); line = w; }
    }
    out.push(line);
    return out;
  },
  text: (s, x, y) => drawn.push({ s, x, y }),
  centered: (s, x, y) => drawn.push({ s, x, y, centered: true }),
  tooltip: (lines) => drawn.push({ tooltip: lines }),
  textWidth: (s) => s.length * 6,
  scrollingText: (s, cx, x0, y0) => drawn.push({ s, x: x0, y: y0, button: true }),
  tile() {}, fill() {}, pushClip() {}, popClip() {}, nineSlice: () => true, sprite() {},
};
const parent = { initScreen() {}, title: 'parent' };
const mine = { ...m.DEFAULT_GAME_RULES };
let handed = null;
const s = new m.EditGameRulesScreen(game, parent, mine, (r) => (handed = r));
game.setScreen(s);
const list = s.widgets.find((w) => w.entries);
const rows = list.entries;
const names = rows.map((r) => ('category' in r ? `[${r.category}]` : r.rule));
check('a row for every rule, and one for each category that has any', rows.filter((r) => !('category' in r)).length === ids.length && names.filter((n) => n[0] === '[').join() === '[Player],[Mobs],[Spawning],[Drops],[World Updates],[Chat]', names.filter((n) => n[0] === '[').join());
const under = (cat) => { const i = names.indexOf(`[${cat}]`); const j = names.findIndex((n, k) => k > i && n[0] === '['); return names.slice(i + 1, j < 0 ? names.length : j); };
check('a category\'s rules by id', under('Player').join() === 'doImmediateRespawn,drowningDamage,fallDamage,fireDamage,freezeDamage,keepInventory,naturalRegeneration,playersNetherPortalCreativeDelay,playersNetherPortalDefaultDelay,playersSleepingPercentage,spawnRadius', under('Player').join());
check('...the other five', under('Mobs').join() === 'disableRaids,forgiveDeadPlayers,maxEntityCramming,mobGriefing,universalAnger' && under('Spawning').length === 5 && under('Drops').length === 4 && under('World Updates').length === 5 && under('Chat').length === 4);
const row = (id) => rows.find((r) => r.rule === id);
check('ON/OFF for a rule that is one or the other, a box for a number', row('keepInventory').widget.label === 'OFF' && row('mobGriefing').widget.label === 'ON' && row('randomTickSpeed').widget.value === '3');

// drawn: the list from y 33, rows 24 apart, 220 wide in the middle; the button's right edge a pixel in from the row's
s.render(g, 0, 0, 0);
const left = Math.floor(427 / 2) - 110 + 2;
const cat = drawn.find((d) => d.centered && d.s === '§e§lPlayer');
check('a category\'s name bold and yellow, in the middle of its row', cat && cat.x === left + 110 && cat.y === 33 + 4 + 5, JSON.stringify(cat));
const first = drawn.find((d) => d.s === 'Respawn immediately');
check('a rule\'s name at the row\'s left, 5 down', first && first.x === left && first.y === 33 + 4 + 24 + 5, JSON.stringify(first));
const w0 = row('doImmediateRespawn').widget;
check('...its button 44 wide, a pixel in from the row\'s right, at the row\'s top', w0.w === 44 && w0.h === 20 && w0.x === left + 220 - 45 && w0.y === 33 + 4 + 24, `${w0.x} ${w0.y}`);
// (names are wrapped as their rows come into view)
list.scroll = list.rowTop(rows.indexOf(row('keepInventory'))) - list.rowTop(0);
drawn.length = 0;
s.render(g, 0, 0, 0);
const long = row('playersNetherPortalCreativeDelay').label ?? [];
const two = long.map((l) => drawn.find((d) => d.s === l));
check('a name wider than 175 on two lines, 10 apart', long.length === 2 && row('keepInventory').label.length === 1 && two[0] && two[1] && two[1].y - two[0].y === 10 && two[0].x === left && two[1].x === left, JSON.stringify(two));

// the tooltip of the row under the mouse: the id, what it does, the value the screen opened with
drawn.length = 0;
list.scroll = 0;
const yOf = (id) => list.rowTop(rows.indexOf(row(id))) + 8;
s.renderTooltip(g, left + 20, yOf('drowningDamage'));
check('a rule\'s tooltip: its id in yellow, its value as the screen opened in grey', drawn[0]?.tooltip?.join('|') === '§edrowningDamage|§7Default: true', JSON.stringify(drawn[0]));
list.scroll = list.rowTop(rows.indexOf(row('playersSleepingPercentage'))) - list.rowTop(0);
drawn.length = 0;
s.renderTooltip(g, left + 20, yOf('playersSleepingPercentage'));
const tip = drawn[0]?.tooltip ?? [];
check('...with what it does between them, where vanilla says', tip[0] === '§eplayersSleepingPercentage' && tip.length >= 3 && tip.slice(1, -1).join(' ') === 'The percentage of players who must be sleeping to skip the night.' && tip.at(-1) === '§7Default: 100', tip.join('|'));

// editing: a click on a rule's button, typing in a rule's box
list.scroll = 0;
const done = s.widgets.find((w) => w.label === 'Done'), cancel = s.widgets.find((w) => w.label === 'Cancel');
const click = (w) => s.mouseClicked(w.x + 3, w.y + 3, 0);
const keep = row('keepInventory').widget;
s.render(g, 0, 0, 0);
click(keep);
check('a click turns a rule on', keep.label === 'ON' && s.rules.keepInventory === true);
check('...in the screen\'s copy: the caller\'s rules are as they were', mine.keepInventory === false);
// (the number's row, scrolled to)
const tick = row('randomTickSpeed');
list.scroll = list.rowTop(rows.indexOf(tick)) - list.rowTop(0);
s.render(g, 0, 0, 0);
click(tick.widget);
check('a click on a number\'s box takes the typing', tick.widget.focused);
s.charTyped('x');
check('a number the rule doesn\'t take: red, the rule as it was, Done held back', tick.widget.value === '3x' && tick.widget.textColor === 0xff0000 && s.rules.randomTickSpeed === 3 && !done.active);
s.keyPressed({ key: 'Backspace' });
s.keyPressed({ key: 'Backspace' });
check('...an empty box too', tick.widget.value === '' && !done.active);
s.charTyped('2');
s.charTyped('0');
check('a number it takes: the rule has it, Done is back', s.rules.randomTickSpeed === 20 && tick.widget.textColor === 0xe0e0e0 && done.active);
// (the window resized: the screen is laid out again, and what was edited is still there)
s.initScreen(640, 360);
const list2 = s.widgets.find((w) => w.entries);
check('laid out again for another size, the edits stay', list2.entries === rows && row('keepInventory').widget.label === 'ON' && row('randomTickSpeed').widget.value === '20');
// Cancel
s.widgets.find((w) => w.label === 'Cancel').onPress();
check('Cancel goes back with nothing handed over', game.screen === parent && handed === null && mine.keepInventory === false);
void cancel;
// Done
const s2 = new m.EditGameRulesScreen(game, parent, mine, (r) => (handed = r));
game.setScreen(s2);
const rows2 = s2.widgets.find((w) => w.entries).entries;
s2.render(g, 0, 0, 0);
const keep2 = rows2.find((r) => r.rule === 'keepInventory').widget;
s2.mouseClicked(keep2.x + 3, keep2.y + 3, 0);
s2.widgets.find((w) => w.label === 'Done').onPress();
check('Done goes back and hands over the edited rules, every one of them', game.screen === parent && handed && handed.keepInventory === true && handed.mobGriefing === true && Object.keys(handed).length === ids.length && handed !== mine);

await exitWithStatus(close);
