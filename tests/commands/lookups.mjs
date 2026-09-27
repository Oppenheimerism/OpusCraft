// Names typed into commands are looked up only among what the game has (node tests/commands/lookups.mjs): a command,
// a dimension, a game rule, a time of day or a data tag's key called "constructor", "toString", "__proto__" or
// "hasOwnProperty" finds nothing, as in vanilla, rather than what every JavaScript object has (which sent the player to
// a "dimension" that broke the game, or overwrote the game rules' own workings); and what the names do mean still works.
import { loadModules } from '../../scripts/load.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 120000).unref();
const { mods, close } = await loadModules(['/src/world/blocks.ts', '/src/item/item.ts', '/src/game/level.ts', '/src/world/world.ts', '/src/game/commands.ts', '/src/world/dimension.ts', '/src/item/inventory.ts']);
const [, , levelMod, worldMod, commands, dimMod, invMod] = mods;
let fails = 0;
const check = (name, cond, extra = '') => { if (!cond) fails++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };

const world = new worldMod.World();
const level = new levelMod.Level(world, 'test');
const chats = [];
const moves = [];
const player = { x: 0.5, y: 64, z: 0.5, yaw: 0, pitch: 0, inventory: new invMod.Inventory(), level };
const game = {
  meta: { allowCommands: true }, chat: (m) => chats.push(m), player, playerName: 'Tester', level, world, sound: { play() {} },
  applyGameRules() {},
  teleport: (x, y, z) => moves.push({ x, y, z }),
  changeDimension: (to) => moves.push({ dim: to.id }),
};
const run = (line) => {
  chats.length = 0;
  moves.length = 0;
  let threw = null;
  try {
    commands.executeCommand(game, line);
  } catch (e) {
    threw = e;
  }
  return { chats: chats.join(' | '), threw, moves: [...moves] };
};
const NAMES = ['constructor', 'toString', '__proto__', 'hasOwnProperty', 'valueOf'];

// commands
for (const n of NAMES) {
  const r = run(n);
  check(`/${n}: "Unknown or incomplete command"`, !r.threw && r.chats.includes('Unknown or incomplete command') && !r.chats.includes('unexpected error'), r.chats);
}
check('/help constructor: unknown too', (() => { const r = run('help constructor'); return !r.threw && r.chats.includes('Unknown or incomplete command'); })());
check('/execute run toString: unknown too', (() => { const r = run('execute run toString'); return !r.threw && r.chats.includes('Unknown or incomplete command'); })());
check('suggestions after "constructor ": none, and nothing thrown', (() => { try { return commands.suggestCommand(game, 'constructor ').list.length === 0; } catch { return false; } })());
check('a real command still runs (/time set noon)', (() => { const r = run('time set noon'); return level.dayTime === 6000 && r.chats.includes('Set the time to 6000'); })());

// dimensions
for (const n of NAMES) {
  const r = run(`execute in minecraft:${n} run tp @s 0 100 0`);
  check(`/execute in minecraft:${n}: an unknown dimension, and nobody goes anywhere`, !r.threw && r.chats.includes(`Unknown dimension 'minecraft:${n}'`) && r.moves.length === 0, `${r.chats} ${JSON.stringify(r.moves)}`);
}
check('/execute in minecraft:the_nether still takes you there', (() => { const r = run('execute in minecraft:the_nether run tp @s 0 100 0'); return r.moves.some((m) => m.dim === 'the_nether'); })());
check('dimensionById: "constructor" and the like are the Overworld', NAMES.every((n) => dimMod.dimensionById(n) === dimMod.OVERWORLD));
check('dimensionById: the three dimensions, and none given the Overworld', dimMod.dimensionById('the_nether') === dimMod.THE_NETHER && dimMod.dimensionById('the_end') === dimMod.THE_END && dimMod.dimensionById('overworld') === dimMod.OVERWORLD && dimMod.dimensionById(null) === dimMod.OVERWORLD);

// game rules
const rules = level.gameRules;
const before = JSON.stringify(rules);
for (const n of NAMES) {
  const r = run(`gamerule ${n} 5`);
  check(`/gamerule ${n} 5: unknown, and the rules untouched`, !r.threw && r.chats.includes('Unknown or incomplete command') && JSON.stringify(rules) === before && !Object.hasOwn(rules, n), r.chats);
}
check('the rules still work as an object after all that', typeof rules.toString === 'function' && String(rules) === '[object Object]' && Object.getPrototypeOf(rules) === Object.prototype);
check('a real rule still changes (/gamerule doDaylightCycle false)', (() => { run('gamerule doDaylightCycle false'); const ok = rules.doDaylightCycle === false; run('gamerule doDaylightCycle true'); return ok; })());
check('/gamerule randomTickSpeed 5 still takes a number', (() => { run('gamerule randomTickSpeed 5'); const ok = rules.randomTickSpeed === 5; run('gamerule randomTickSpeed 3'); return ok; })());

// times of day
level.dayTime = 1234;
for (const n of NAMES) {
  const r = run(`time set ${n}`);
  check(`/time set ${n}: not a time, and the time unchanged`, !r.threw && level.dayTime === 1234 && !r.chats.includes('Set the time'), r.chats);
}

// a data tag's keys
const d = commands.snbtScalars('{__proto__:5,constructor:"x",toString:1b,Variant:2}');
check('a data tag\'s "__proto__", "constructor" and "toString" are keys like any other', Object.hasOwn(d, '__proto__') && d.constructor === 'x' && d.toString === 1 && d.Variant === 2, JSON.stringify(Object.entries(d)));
check('...and the tag is still a plain object', Object.getPrototypeOf(d) === Object.prototype && Object.keys(d).length === 4);

console.log(fails ? `${fails} FAILED` : 'all ok');
await close();
process.exit(fails ? 1 : 0);
