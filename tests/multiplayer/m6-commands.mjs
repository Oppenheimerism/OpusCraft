// The host's commands reach its guests (vanilla's player arguments on a LAN world): a guest can be named in /gamemode,
// /tp, /give, /clear, /effect, /xp, /spawnpoint and /kill, by its name (in any case) or by @a and @r; /tp takes the host
// to a guest or a guest to the host; /kick lets a guest go with a reason; /list names everyone. A guest whose game mode
// the host changes is told so. Commands need cheats: the world's own, or the LAN screen's Allow Cheats (vanilla
// ShareToLanScreen), which turns them on for the host while the world is open.

import { loadNet, ENTITY_MODULES, flatHost, makeGuest, hostCopy, step, check, exitWithStatus } from './lib.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 300000).unref();

const { m, close } = await loadNet([...ENTITY_MODULES, '/src/game/commands.ts', '/src/game/sleep.ts', '/src/game/playerDeath.ts']);

const host = flatHost(m, 4, { gameMode: 'survival', guestGameMode: 'survival' });
const out = [];
const moved = [];
// (what executeCommand needs of the Game)
const game = {
  meta: { allowCommands: false },
  lanCheats: false,
  chat: (t) => out.push(t),
  player: host.player,
  playerName: 'Host',
  level: host.level,
  world: host.world,
  sound: host.level.sound,
  server: host.server,
  applyGameRules() {},
  teleport(x, y, z, yaw, pitch) {
    host.player.removeVehicle();
    host.player.moveTo(x, y, z, yaw ?? host.player.yaw, pitch ?? host.player.pitch);
    host.player.dx = host.player.dy = host.player.dz = 0;
  },
  changeDimension: (to) => moved.push(to.id),
};
const run = (line) => {
  out.length = 0;
  m.executeCommand(game, line);
  return out.join(' | ');
};
const near = (e, x, y, z) => Math.abs(e.x - x) < 1e-6 && Math.abs(e.y - y) < 1e-6 && Math.abs(e.z - z) < 1e-6;

const alex = makeGuest(host, 'Alex');
const steve = makeGuest(host, 'Steve');
step(host, 40);
check('two guests in', alex.player && steve.player && host.server.guestCount() === 2);

// --- cheats
check('without cheats, no /gamemode', run('gamemode creative Alex').includes('Unknown or incomplete command') && alex.player.gameMode === 'survival');
game.lanCheats = true;
check("the LAN screen's Allow Cheats turns them on", !run('gamemode survival Alex').includes('Unknown'));

// --- /list
check('/list names everyone', run('list') === 'There are 3 of a max of 8 players online: Host, Alex, Steve', out.join());

// --- /gamemode
let r = run('gamemode creative Alex');
step(host, 3);
check("/gamemode creative Alex: the host is told", r === "Set Alex's game mode to Creative Mode", r);
check('...Alex is in creative, in its own game and on the host', alex.player.gameMode === 'creative' && hostCopy(host, alex).gameMode === 'creative');
check('...and told so', alex.chat.some((t) => t.includes('Your game mode has been updated to Creative Mode')), alex.chat.join(' / '));
check('...nobody else changed', steve.player.gameMode === 'survival' && host.player.gameMode === 'survival');
check('already in it: nothing said', run('gamemode creative alex') === '');
r = run('gamemode survival ALEX');
step(host, 3);
check('a name in any case', r === "Set Alex's game mode to Survival Mode" && alex.player.gameMode === 'survival', r);
r = run('gamemode adventure @a');
step(host, 3);
check('/gamemode adventure @a: everyone', [host.player, alex.player, steve.player].every((p) => p.gameMode === 'adventure') && r.includes('Set own game mode to Adventure Mode') && r.includes("Set Steve's game mode"), r);
check('a name not playing: "No player was found"', run('gamemode creative Bob').includes('No player was found'));
run('gamemode survival @a');
step(host, 3);

// --- /tp
r = run('tp Alex 10 64 10');
step(host, 5);
check('/tp Alex 10 64 10: there, in its own game and on the host', near(alex.player, 10.5, 64, 10.5) && near(hostCopy(host, alex), 10.5, 64, 10.5), `${alex.player.x} ${alex.player.y} ${alex.player.z}`);
check('...and said so', r === 'Teleported Alex to 10.500000, 64.000000, 10.500000', r);
step(host, 20);
check('...and it stays there', near(alex.player, 10.5, 64, 10.5) && near(hostCopy(host, alex), 10.5, 64, 10.5));
r = run('tp Steve Alex');
step(host, 5);
check('/tp Steve Alex: Steve beside Alex', near(steve.player, 10.5, 64, 10.5) && r === 'Teleported Steve to Alex', r);
r = run('tp Alex');
check('/tp Alex: the host to Alex', near(host.player, 10.5, 64, 10.5) && r === 'Teleported Host to Alex', r);
run('tp Host 0 64 0');
r = run('tp Alex Host');
step(host, 5);
check('/tp Alex Host: Alex to the host', near(alex.player, 0.5, 64, 0.5) && r === 'Teleported Alex to Host', r);
r = run('tp @a 3 64 -2');
step(host, 5);
// (all in one spot, they push each other apart a little, as players do)
const close1 = (p) => Math.hypot(p.x - 3.5, p.z + 1.5) < 0.7 && Math.abs(p.y - 64) < 1e-6;
check('/tp @a 3 64 -2: everyone', [host.player, alex.player, steve.player].every(close1) && r === 'Teleported 3 entities to 3.500000, 64.000000, -1.500000', [host.player, alex.player, steve.player].map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)},${p.z.toFixed(2)}`).join(' '));
r = run('tp Steve ~5 ~ ~');
step(host, 5);
check("~ is from the host's place", Math.abs(steve.player.x - host.player.x - 5) < 1e-6, `${steve.player.x} ${host.player.x}`);
{
  const [ax, az] = [alex.player.x, alex.player.z];
  check('/tp Alex Steve Host: not a command', run('tp Alex Steve Host').length > 0 && alex.player.x === ax && alex.player.z === az);
  check('one destination only: /tp Alex @a', run('tp Alex @a').includes('Only one player is allowed') && alex.player.x === ax && alex.player.z === az);
}

// far off, in chunks the guest hasn't got: it comes in, unhurt
const hp = alex.player.health;
run('tp Alex 200 64 200');
step(host, 80);
check('far off: there, with the chunks round it', near(alex.player, 200.5, 64, 200.5) && !!alex.world.getChunk(12, 12) && !!alex.world.getChunk(13, 13), `${alex.player.x} ${alex.player.y}`);
check('...unhurt', alex.player.health === hp && hostCopy(host, alex).health === hp);
run('tp Alex 3 64 -2');
step(host, 40);

// another dimension: the host goes, the guests come along
check('a guest alone to another dimension: refused', run('execute in minecraft:the_nether run tp Alex 0 64 0').includes('Only the host can be sent to another dimension') && !moved.length);
run('execute in minecraft:the_nether run tp @a 0 64 0');
check('...with the host: the host goes (and they follow it)', moved.join() === 'the_nether', moved.join());

// --- /give, /clear, /effect, /xp, /spawnpoint, /kill
r = run('give Alex diamond 3');
step(host, 3);
const count = (p, id) => p.inventory.main.reduce((n, s) => n + (s?.item.id === id ? s.count : 0), 0);
check('/give Alex diamond 3', count(alex.player, 'diamond') === 3 && count(host.player, 'diamond') === 0 && r === 'Gave 3 [Diamond] to Alex', r);
r = run('give @a stick');
step(host, 3);
check('/give @a stick: one each', [host.player, alex.player, steve.player].every((p) => count(p, 'stick') === 1) && r === 'Gave 1 [Stick] to 3 players', r);
r = run('clear Alex diamond');
step(host, 3);
check('/clear Alex diamond', count(alex.player, 'diamond') === 0 && count(alex.player, 'stick') === 1 && r === 'Removed 3 item(s) from player Alex', r);
r = run('effect give Steve speed 30');
step(host, 3);
check('/effect give Steve speed', steve.player.hasEffect('speed') && r === 'Applied effect Speed to Steve', r);
r = run('xp add Alex 5 levels');
step(host, 3);
check('/xp add Alex 5 levels', alex.player.xpLevel === 5 && host.player.xpLevel === 0 && r === 'Gave 5 experience levels to Alex', r);
check('/xp query Alex levels', run('xp query Alex levels') === 'Alex has 5 experience levels');
r = run('spawnpoint Steve 1 64 1');
check("/spawnpoint Steve", hostCopy(host, steve).respawnPos?.join() === '1,64,1' && r === 'Set spawn point to 1, 64, 1 [0.0] in minecraft:overworld for Steve', r);
r = run('kill Steve');
step(host, 5);
check('/kill Steve: its death screen', steve.died.length === 1 && r === 'Killed Steve', r);
steve.session.respawn?.();
step(host, 20);

// --- /kick
r = run('kick Steve Bye for now');
step(host, 5);
check('/kick Steve Bye for now: the host is told', r === 'Kicked Steve: Bye for now', r);
check('...Steve is let go, told why', steve.disconnected === 'Bye for now', String(steve.disconnected));
check('...and gone from the world', host.server.guestCount() === 1 && run('list') === 'There are 2 of a max of 8 players online: Host, Alex');
check('/kick Host: not the host', run('kick Host').includes('Cannot kick server owner in LAN game') && host.server.guestCount() === 1, out.join());
r = run('kick @a');
step(host, 5);
check('/kick @a: every guest, never the host', r === 'Kicked Alex: Kicked by an operator' && alex.disconnected === 'Kicked by an operator' && host.server.guestCount() === 0, `${r} ${alex.disconnected}`);

// --- suggestions and single-player
const back = makeGuest(host, 'Alex');
step(host, 40);
check('kicked, it can join again', !!back.player && host.server.guestCount() === 1);
check("guests' names are suggested", m.suggestCommand(game, 'gamemode creative ').list.includes('Alex') && m.suggestCommand(game, 'tp A').list.includes('Alex'));
game.server = null;
check('single-player: /list', run('list') === 'There are 1 of a max of 8 players online: Host');
check('single-player: /kick', run('kick Host').includes('Cannot kick in an offline singleplayer game'));
check('single-player: a name not here', run('gamemode creative Alex').includes('No player was found'));
check('single-player: /gamemode creative @s', run('gamemode creative @s') === 'Set own game mode to Creative Mode' && host.player.gameMode === 'creative');
game.lanCheats = false;
game.meta.allowCommands = true;
check("the world's own cheats", run('gamemode survival') === 'Set own game mode to Survival Mode');

await exitWithStatus(close);
