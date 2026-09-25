// Copper (1.21): weathering (vanilla WeatheringCopper and ChangeOverTimeBlock: a random tick now and then ages a
// copper block, the likelier the more of the copper round it is further on, and not at all while some near it lags
// behind), honeycomb waxing it for good (HoneycombItem), an axe scraping it back an age or scraping the wax off
// (AxeItem.evaluateNewBlockState), the copper bulb that toggles on each rising edge of redstone power
// (CopperBulbBlock), and the lightning rod (LightningRodBlock): what lightning strikes when there's one about, a
// pulse of redstone when struck, and struck copper cleaned back to bare metal (LightningBolt.clearCopperOnLightningStrike).

import { BLOCKS, STATE_BLOCK, getBlock, type Block } from '../world/block';
import { WEATHER_AGE, WEATHER_NEXT, WEATHER_PREVIOUS, WAX_ON, WAX_OFF, copperName } from '../world/blocksCopper';
import { DIR_NAMES, DX, DY, DZ, type Dir } from '../world/dir';
import { registerBehavior } from './blockBehavior';
import { registerItemBehavior, type UseResult } from './itemBehavior';
import type { Level } from './level';
import type { Player } from '../entity/player';
import type { Entity } from '../entity/entity';
import type { ItemStack } from '../item/item';
import { hurtAndBreak, levelOf } from '../item/enchantHelper';
import { hasNeighborSignal } from './redstone/signal';
import { LightningBolt } from '../entity/lightning';
import { AABB } from '../core/aabb';
import { LivingEntity } from '../entity/living';
import type { BlockHit } from './raycast';

const blk = (st: number): Block => BLOCKS[STATE_BLOCK[st]];

/** vanilla Block.withPropertiesOf: `to`'s state with every property it shares with `st` set as there */
export function withPropertiesOf(to: Block, st: number): number {
  const from = blk(st);
  let s = to.defaultState;
  for (const p of to.props) if (from.propIndex(p.name) >= 0) s = to.with(s, p.name, from.get(st, p.name));
  return s;
}

// ---------------------------------------------------------------------------
// Weathering

let AGE_OF: Int8Array | null = null;

/** a state's weathering age (0-3), -1 for anything that isn't weathering copper (the waxed blocks included) */
function ageOf(st: number): number {
  if (!AGE_OF) {
    AGE_OF = new Int8Array(STATE_BLOCK.length).fill(-1);
    for (const b of BLOCKS) {
      const a = WEATHER_AGE.get(b.name);
      if (a !== undefined) AGE_OF.fill(a, b.baseState, b.baseState + b.stateCount);
    }
  }
  return AGE_OF[st];
}

/**
 * vanilla ChangeOverTimeBlock.getNextState: the weathering copper within four blocks (by Manhattan distance) decide
 * it; none may be younger, and the chance is ((older + 1) / (older + same + 1))², three quarters of that for bare
 * copper (WeatheringCopper.getChanceModifier)
 */
export function nextWeatherState(level: Level, x: number, y: number, z: number, st: number): number | null {
  const age = ageOf(st), next = WEATHER_NEXT.get(blk(st).name);
  if (age < 0 || !next) return null;
  let same = 0, older = 0;
  for (let dy = -4; dy <= 4; dy++)
    for (let dx = -4; dx <= 4; dx++) {
      const r = 4 - Math.abs(dx) - Math.abs(dy);
      for (let dz = -r; dz <= r; dz++) {
        if (dx === 0 && dy === 0 && dz === 0) continue;
        const a = ageOf(level.getState(x + dx, y + dy, z + dz));
        if (a < 0) continue;
        if (a < age) return null;
        if (a > age) older++;
        else same++;
      }
    }
  const f = (older + 1) / (older + same + 1);
  return level.random.nextFloat() < f * f * (age === 0 ? 0.75 : 1) ? withPropertiesOf(getBlock(next), st) : null;
}

/** vanilla ChangeOverTimeBlock.changeOverTime: a random tick's 0.0569 chance of trying to weather */
export function changeOverTime(level: Level, x: number, y: number, z: number, st: number): void {
  if (level.random.nextFloat() >= 0.05688889) return;
  const next = nextWeatherState(level, x, y, z, st);
  if (next !== null) level.setBlock(x, y, z, next);
}

// every weathering block that has an age to go (vanilla WeatheringCopper*.randomTick); a door weathers from its lower
// half, the upper one following it (WeatheringCopperDoorBlock)
for (const name of WEATHER_NEXT.keys()) {
  const door = name.endsWith('_door');
  registerBehavior(name, {
    randomTick(level, x, y, z, st) {
      if (door && blk(st).get(st, 'half') !== 'lower') return;
      changeOverTime(level, x, y, z, st);
    },
  });
}

// ---------------------------------------------------------------------------
// Scraping and waxing

/**
 * vanilla ParticleUtils.spawnParticlesOnBlockFaces: three to five of a particle on each of the block's six faces
 * (0.55 out from its middle, anywhere across the face), drifting along it
 */
export function particlesOnFaces(level: Level, x: number, y: number, z: number, kind: string): void {
  const r = level.random;
  const across = () => (r.nextFloat() * 2 - 1) * 0.55;
  const speed = () => r.nextFloat() - 0.5;
  for (let d = 0; d < 6; d++) {
    const n = 3 + r.nextInt(3);
    for (let i = 0; i < n; i++) {
      const px = x + 0.5 + (DX[d] ? DX[d] * 0.55 : across()), py = y + 0.5 + (DY[d] ? DY[d] * 0.55 : across()), pz = z + 0.5 + (DZ[d] ? DZ[d] * 0.55 : across());
      level.particles.spawn?.(kind, px, py, pz, DX[d] ? 0 : speed(), DY[d] ? 0 : speed(), DZ[d] ? 0 : speed());
    }
  }
}

/** vanilla CriteriaTriggers.ITEM_USED_ON_BLOCK: the player used `item` on `block` (before it changed) */
function usedOnBlock(level: Level, p: Player, item: string, block: string): void {
  level.onPlayerTrigger?.(p, 'item_used_on_block', { usedOnBlock: { item, block } });
}

/**
 * vanilla AxeItem.useOn after stripping: copper scraped back an age (item.axe.scrape, the scrape particles, level
 * event 3005) or its wax taken off (item.axe.wax_off, 3004); the axe wears a point. Not while the other hand holds a
 * shield to raise (playerHasShieldUseIntent)
 */
function axeUseOn(level: Level, p: Player, stack: ItemStack, hit: BlockHit): UseResult {
  if (p.inventory.activeHand === 'main' && p.inventory.offhand?.item.id === 'shield' && !p.isShiftKeyDown()) return 'pass';
  const st = level.getState(hit.x, hit.y, hit.z);
  const name = blk(st).name;
  const prev = WEATHER_PREVIOUS.get(name), unwaxed = WAX_OFF.get(name);
  if (!prev && !unwaxed) return 'pass';
  usedOnBlock(level, p, stack.item.id, name);
  level.setBlock(hit.x, hit.y, hit.z, withPropertiesOf(getBlock((prev ?? unwaxed)!), st), 11);
  level.sound.play(prev ? 'item.axe.scrape' : 'item.axe.wax_off', hit.x + 0.5, hit.y + 0.5, hit.z + 0.5, 1, 1);
  particlesOnFaces(level, hit.x, hit.y, hit.z, prev ? 'scrape' : 'wax_off');
  if (hurtAndBreak(stack, 1, p.gameMode === 'creative')) {
    p.inventory.setSelectedItem(null);
    level.sound.play('entity.item.break', p.x, p.y, p.z, 0.8, 0.8 + Math.random() * 0.4);
  }
  p.inventory.version++;
  p.swing();
  return 'success';
}

/** vanilla HoneycombItem.useOn: wax a copper block (level event 3003: the wax_on particles and item.honeycomb.wax_on) */
function honeycombUseOn(level: Level, p: Player, stack: ItemStack, hit: BlockHit): UseResult {
  const st = level.getState(hit.x, hit.y, hit.z);
  const name = blk(st).name;
  const waxed = WAX_ON.get(name);
  if (!waxed) return 'pass';
  usedOnBlock(level, p, stack.item.id, name);
  if (p.gameMode !== 'creative') p.inventory.consumeSelected(1);
  level.setBlock(hit.x, hit.y, hit.z, withPropertiesOf(getBlock(waxed), st), 11);
  particlesOnFaces(level, hit.x, hit.y, hit.z, 'wax_on');
  level.sound.play('item.honeycomb.wax_on', hit.x + 0.5, hit.y + 0.5, hit.z + 0.5, 1, 1);
  p.swing();
  return 'success';
}

// (vanilla AxeItem, every axe)
for (const id of ['wooden_axe', 'stone_axe', 'iron_axe', 'golden_axe', 'diamond_axe', 'netherite_axe']) registerItemBehavior(id, { useOn: axeUseOn });
registerItemBehavior('honeycomb', { useOn: honeycombUseOn });

// ---------------------------------------------------------------------------
// The copper bulb

/**
 * vanilla CopperBulbBlock.checkAndFlip: on a rising edge of power the bulb toggles (item.copper_bulb.turn_on or
 * turn_off); it keeps track of the power either way
 */
export function checkAndFlip(level: Level, x: number, y: number, z: number, st: number): void {
  const b = blk(st);
  const on = hasNeighborSignal(level.world, x, y, z);
  if (on === b.get(st, 'powered')) return;
  let now = st;
  if (!b.get(st, 'powered')) {
    now = b.with(st, 'lit', !b.get(st, 'lit'));
    level.sound.play(b.get(now, 'lit') ? 'block.copper_bulb.turn_on' : 'block.copper_bulb.turn_off', x + 0.5, y + 0.5, z + 0.5, 1, 1);
  }
  level.setBlock(x, y, z, b.with(now, 'powered', on), 3);
}

/**
 * vanilla CopperBulbBlock.getAnalogOutputSignal: a comparator reads 15 from a lit bulb, 0 from one that's out (a
 * hook: the game has no comparators yet)
 */
export function copperBulbAnalogOutput(st: number): number {
  return blk(st).get(st, 'lit') ? 15 : 0;
}

for (let age = 0; age < 4; age++)
  for (const waxed of [false, true])
    registerBehavior(copperName('copper_bulb', age, waxed), {
      // (vanilla onPlace: a new bulb, or one that just changed age or wax, looks at its power at once)
      onPlace(level, x, y, z, st, old) {
        if (STATE_BLOCK[old] !== STATE_BLOCK[st]) checkAndFlip(level, x, y, z, st);
      },
      neighborChanged(level, x, y, z, st) {
        checkAndFlip(level, x, y, z, st);
      },
    });

// ---------------------------------------------------------------------------
// The lightning rod

/** vanilla LightningRodBlock.RANGE: how far round a strike it draws the lightning */
const ROD_RANGE = 128;
/** vanilla LightningRodBlock.ACTIVATION_TICKS */
const ACTIVATION_TICKS = 8;

const OPPOSITE: Record<string, Dir> = { down: 1, up: 0, north: 3, south: 2, west: 5, east: 4 };

/** vanilla LightningRodBlock.updateNeighbours: the block it stands on hears of it, so its strong power reaches on */
function updateRodNeighbours(level: Level, x: number, y: number, z: number, st: number): void {
  const back = OPPOSITE[blk(st).get<string>(st, 'facing')];
  level.updateNeighborsAt(x + DX[back], y + DY[back], z + DZ[back], blk(st).id);
}

/**
 * vanilla ParticleUtils.spawnParticlesAlongAxis: `min` to `max` sparks anywhere along the rod's axis, within `spread`
 * of it across, flying along it
 */
function sparksAlongAxis(level: Level, x: number, y: number, z: number, axis: 'x' | 'y' | 'z', spread: number, min: number, max: number, rand: () => number): void {
  const n = min + Math.floor(rand() * (max - min + 1));
  const u = () => rand() * 2 - 1;
  for (let i = 0; i < n; i++)
    level.particles.spawn?.(
      'electric_spark', x + 0.5 + u() * (axis === 'x' ? 0.5 : spread), y + 0.5 + u() * (axis === 'y' ? 0.5 : spread), z + 0.5 + u() * (axis === 'z' ? 0.5 : spread),
      axis === 'x' ? u() : 0, axis === 'y' ? u() : 0, axis === 'z' ? u() : 0,
    );
}

const axisOf = (facing: string): 'x' | 'y' | 'z' => (facing === 'up' || facing === 'down' ? 'y' : facing === 'north' || facing === 'south' ? 'z' : 'x');

/** vanilla LightningRodBlock.onLightningStrike: powered for eight ticks, 10-19 sparks along its axis (level event 3002) */
export function strikeLightningRod(level: Level, x: number, y: number, z: number, st: number): void {
  const b = blk(st);
  level.setBlock(x, y, z, b.with(st, 'powered', true), 3);
  updateRodNeighbours(level, x, y, z, st);
  level.scheduleBlockTick(x, y, z, b.id, ACTIVATION_TICKS);
  sparksAlongAxis(level, x, y, z, axisOf(b.get<string>(st, 'facing')), 0.125, 10, 19, () => level.random.nextFloat());
}

registerBehavior('lightning_rod', {
  // vanilla getStateForPlacement: facing out from the face it's put on, waterlogged in still water
  placement(ctx) {
    const rod = getBlock('lightning_rod');
    const here = ctx.world.getState(ctx.x, ctx.y, ctx.z);
    const water = blk(here).name === 'water' && blk(here).get(here, 'level') === 0;
    return rod.state({ facing: DIR_NAMES[ctx.face], waterlogged: water });
  },
  isSignalSource: () => true,
  // vanilla getSignal / getDirectSignal: weak power all round while powered, strong power into what it stands on
  getSignal: (_w, _x, _y, _z, st) => (blk(st).get(st, 'powered') ? 15 : 0),
  getDirectSignal: (_w, _x, _y, _z, st, dir) => (blk(st).get(st, 'powered') && blk(st).get(st, 'facing') === DIR_NAMES[dir] ? 15 : 0),
  tick(level, x, y, z, st) {
    level.setBlock(x, y, z, blk(st).with(st, 'powered', false), 3);
    updateRodNeighbours(level, x, y, z, st);
  },
  onRemove(level, x, y, z, st, now) {
    if (STATE_BLOCK[now] !== STATE_BLOCK[st] && blk(st).get(st, 'powered')) updateRodNeighbours(level, x, y, z, st);
  },
  // (vanilla onPlace: a powered rod with no tick to switch it off again comes unpowered)
  onPlace(level, x, y, z, st, old) {
    if (STATE_BLOCK[old] !== STATE_BLOCK[st] && blk(st).get(st, 'powered') && !level.hasScheduledTick(x, y, z, STATE_BLOCK[st]))
      level.setBlock(x, y, z, blk(st).with(st, 'powered', false), 18);
  },
  // vanilla animateTick: in a thunderstorm the topmost rods of their columns give a spark or two now and then, more
  // often as the 200-tick cycle wears on
  animateTick(level, x, y, z, st) {
    if (!level.isThundering() || Math.floor(Math.random() * 200) > level.gameTime % 200 || y !== level.world.heightAt(x, z) - 1) return;
    sparksAlongAxis(level, x, y, z, axisOf(blk(st).get<string>(st, 'facing')), 0.125, 1, 2, Math.random);
  },
  // vanilla Enchantments.CHANNELING's hit_block effect: a channeling trident striking a rod under the open sky in a
  // thunderstorm calls lightning down where it hit
  projectileHit(level, _x, _y, _z, _st, hit, projectile) {
    if (projectile.type !== 'trident' || !level.isThundering()) return;
    const weapon = (projectile as Entity & { pickupItem?: ItemStack }).pickupItem;
    if (levelOf(weapon, 'channeling') <= 0 || !level.canSeeSky(Math.floor(hit.px), Math.floor(hit.py), Math.floor(hit.pz))) return;
    const bolt = new LightningBolt(level);
    bolt.moveTo(hit.px, hit.py, hit.pz, 0, 0);
    const owner = (projectile as Entity & { owner?: Entity | null }).owner ?? null;
    if (owner && owner === level.player) bolt.cause = owner;
    level.addEntity(bolt);
    level.sound.play('item.trident.thunder', hit.px, hit.py, hit.pz, 5, 1);
  },
});

/**
 * vanilla ServerLevel.findLightningRod: the nearest lightning rod within 128 blocks of (x, y, z) that tops its column
 * (nothing above it), as where the bolt comes down (the block above it); null if there's none
 */
export function findLightningRod(level: Level, x: number, y: number, z: number): [number, number, number] | null {
  for (const [rx, ry, rz] of level.poi.findAll(x, y, z, ROD_RANGE, (k) => k === 'lightning_rod', false))
    if (ry === level.world.heightAt(rx, rz) - 1) return [rx, ry + 1, rz];
  return null;
}

/** vanilla LightningBolt.getStrikePosition: the block the bolt's foot is in */
const strikePos = (bolt: Entity): [number, number, number] => [Math.floor(bolt.x), Math.floor(bolt.y - 1e-6), Math.floor(bolt.z)];

/** vanilla WeatheringCopper.getFirst: the bare copper of a weathering block's kind */
function firstAge(st: number): number {
  let name = blk(st).name;
  for (let prev = WEATHER_PREVIOUS.get(name); prev; prev = WEATHER_PREVIOUS.get(name)) name = prev;
  return withPropertiesOf(getBlock(name), st);
}

/**
 * vanilla LightningBolt.clearCopperOnLightningStrike: struck copper (or the copper a struck rod stands on) goes back to
 * bare metal, and three to five random walks of one to eight steps from it scrape an age off the copper they pass
 * (each step to weathering copper among ten random blocks round, sparks off it; the waxed are left alone)
 */
function clearCopperOnLightningStrike(level: Level, x: number, y: number, z: number): void {
  let st = level.getState(x, y, z);
  let cx = x, cy = y, cz = z;
  if (blk(st).name === 'lightning_rod') {
    const back = OPPOSITE[blk(st).get<string>(st, 'facing')];
    cx += DX[back];
    cy += DY[back];
    cz += DZ[back];
    st = level.getState(cx, cy, cz);
  }
  if (ageOf(st) < 0) return;
  level.setBlock(cx, cy, cz, firstAge(st));
  const r = level.random;
  const walks = r.nextInt(3) + 3;
  for (let j = 0; j < walks; j++) {
    const steps = r.nextInt(8) + 1;
    let px = cx, py = cy, pz = cz;
    for (let i = 0; i < steps; i++) {
      // (vanilla randomStepCleaningCopper: BlockPos.randomInCube(random, 10, pos, 1))
      let found = false;
      for (let k = 0; k < 10; k++) {
        const qx = px + r.nextInt(3) - 1, qy = py + r.nextInt(3) - 1, qz = pz + r.nextInt(3) - 1;
        const qs = level.getState(qx, qy, qz);
        if (ageOf(qs) < 0) continue;
        const prev = WEATHER_PREVIOUS.get(blk(qs).name);
        if (prev) level.setBlock(qx, qy, qz, withPropertiesOf(getBlock(prev), qs));
        particlesOnFaces(level, qx, qy, qz, 'electric_spark');
        px = qx;
        py = qy;
        pz = qz;
        found = true;
        break;
      }
      if (!found) break;
    }
  }
}

/** vanilla LightningBolt.tick when it strikes (life 2, server side): powerLightningRod, clearCopperOnLightningStrike */
export function lightningStruck(level: Level, bolt: Entity): void {
  const [x, y, z] = strikePos(bolt);
  const st = level.getState(x, y, z);
  if (blk(st).name === 'lightning_rod') strikeLightningRod(level, x, y, z, st);
  clearCopperOnLightningStrike(level, x, y, z);
}

/**
 * vanilla CriteriaTriggers.LIGHTNING_STRIKE, as the bolt goes: to the player within 256 blocks, with whatever stood
 * within 15 blocks of it (up to 21 above) and wasn't struck
 */
export function lightningStrikeTrigger(level: Level, bolt: LightningBolt, hit: ReadonlySet<Entity>): void {
  const p = level.player;
  if (!p) return;
  const distance = Math.hypot(p.x - bolt.x, p.y - bolt.y, p.z - bolt.z);
  if (distance >= 256) return;
  const { x, y, z } = bolt;
  const bystanders = level.getEntities(new AABB(x - 15, y - 15, z - 15, x + 15, y + 6 + 15, z + 15), (e) => !e.removed && (!(e instanceof LivingEntity) || e.isAlive) && !hit.has(e), bolt);
  level.onPlayerTrigger?.(p, 'lightning_strike', { lightning: { distance, blocksSetOnFire: bolt.blocksSetOnFire, bystanders: bystanders.map((e) => e.type) } });
}
