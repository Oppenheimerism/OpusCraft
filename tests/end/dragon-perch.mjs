// The perched dragon's wings. Vanilla's EnderDragon.knockBack pushes every living thing its wings reach, flying or
// perched, and hurts it (5) only when flying. But a push the server gives a player reaches that player's own game
// only along with a hurt, so in vanilla a perched dragon's wings shove mobs about and leave players standing: one can
// walk up to it and strike, which is how it's fought. Here a push moves a player at once, so the perched dragon threw
// players back from every side.
import { loadModules } from '../../scripts/load.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 240000).unref();
const { mods: [, blockMod, worldMod, dimMod, levelMod, genMod, fightMod, phaseMod, playerMod, spawnerMod], close } = await loadModules([
  '/src/world/blocks.ts', '/src/world/block.ts', '/src/world/world.ts', '/src/world/dimension.ts', '/src/game/level.ts', '/src/world/gen/theEnd.ts',
  '/src/game/endDragonFight.ts', '/src/entity/dragonPhases.ts', '/src/entity/player.ts', '/src/game/spawner.ts',
]);
let fails = 0;
const check = (name, cond, extra = '') => { if (!cond) fails++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const { S } = blockMod;
const { PHASE } = phaseMod;

const seed = '12345';
const gen = new genMod.EndGenerator(seed);
const world = new worldMod.World();
world.reset(dimMod.THE_END);
const level = new levelMod.Level(world, seed);
level.sound = { play() {}, playUI() {} };
level.particles = { blockBreak() {}, blockHit() {}, spawn() {} };
// (the fight waits for the whole arena: 8 chunks out)
for (let cz = -8; cz <= 8; cz++) for (let cx = -8; cx <= 8; cx++) world.addChunk(gen.generate(cx, cz));
const player = new playerMod.Player(level);
player.setGameMode('survival');
player.moveTo(20.5, world.heightAt(20, 20), 20.5, 0, 0);
player.input = { forward: false, back: false, left: false, right: false, jump: false, sneak: false, sprint: false };
level.player = player;
level.addEntity(player);
level.simulationDistance = 12;
const fight = new fightMod.EndDragonFight(level, null);
level.dragonFight = fight;
const tick = (n = 1) => { for (let i = 0; i < n; i++) { level.gameTime++; level.tick(); } };
tick(1);
const d = level.entities.find((e) => e.type === 'ender_dragon');
check('the fight has its dragon', !!d && !!fight.portalLocation);
const [px, , pz] = fight.portalLocation;
const [, top] = d.podiumTop();

// the dragon perched on the pillar, facing north (its wings out to the east and the west of it)
const perch = (phase) => {
  d.moveTo(px + 0.5, top, pz + 0.5, 0, 0);
  d.dx = d.dy = d.dz = 0;
  d.hurtTime = 0;
  d.phaseManager.setPhase(phase);
};
// a floor a block under the dragon's feet, east and west of it and a little behind: in reach of a wing, out of the head's
const floor = (x, z) => { for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) world.setState(x + dx, top - 2, z + dz, S('obsidian')); };
floor(px + 5, pz + 3);
floor(px - 5, pz + 3);
const stand = (e, x, z) => { e.moveTo(x + 0.5, top - 1, z + 0.5, 0, 0); e.dx = e.dy = e.dz = 0; };

perch(PHASE.SITTING_SCANNING);
stand(player, px + 5, pz + 3);
const zombie = spawnerMod.MOB_TYPES.zombie(level);
stand(zombie, px - 5, pz + 3);
level.addEntity(zombie);
const h0 = player.health;
const far = (e) => Math.hypot(e.x - d.x, e.z - d.z);
const z0 = far(zombie);
tick(1);
check('the dragon is perched, and its wing reaches both of them', d.isSitting() && d.wing1.bb.inflate(4, 2, 4).move(0, -2, 0).intersects(player.bb) !== d.wing2.bb.inflate(4, 2, 4).move(0, -2, 0).intersects(player.bb) || d.wing1.bb.inflate(4, 2, 4).move(0, -2, 0).intersects(player.bb));
tick(9);
check('a perched dragon\'s wings leave a player standing where they are', Math.abs(player.x - (px + 5.5)) < 0.01 && Math.abs(player.z - (pz + 3.5)) < 0.01 && Math.abs(player.y - (top - 1)) < 0.01, `${player.x.toFixed(2)} ${player.y.toFixed(2)} ${player.z.toFixed(2)}`);
check('...unhurt', player.health === h0, String(player.health));
check('...and throw a mob back', far(zombie) > z0 + 2, `${z0.toFixed(2)} -> ${far(zombie).toFixed(2)}`);

// in flight the same wings hurt, and throw a player too
perch(PHASE.HOLDING_PATTERN);
stand(player, px + 5, pz + 3);
player.invulnerableTime = 0;
const p0 = [player.x, player.z];
tick(1);
check('a flying dragon\'s wing hurts a player (5, less armour)', player.health < h0 && player.lastDamageSource === 'mob', `${player.health} ${player.lastDamageSource}`);
tick(3);
check('...and throws them', Math.hypot(player.x - p0[0], player.z - p0[1]) > 1, `${(player.x - p0[0]).toFixed(2)} ${(player.z - p0[1]).toFixed(2)}`);

await close();
console.log(fails ? `${fails} FAILED` : 'all ok');
process.exit(fails ? 1 : 0);
