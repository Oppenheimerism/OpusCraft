// The sculk catalyst at work (vanilla SculkCatalystBlock and SculkCatalystBlockEntity with its CatalystListener): when
// a mob (or a player) dies within 8 blocks of it, the catalyst takes the experience it would have dropped and blooms,
// and that much charge sets off through the ground from where it fell, spreading sculk and veins as it goes and now
// and then raising a sensor or a shrieker (world/sculkSpreader.ts). The nearest catalyst takes it; the others nearby
// get nothing. The charge shows as a teal glow creeping over the sculk, and fades with a pop.

import { BLOCKS, STATE_BLOCK, type Block } from '../world/block';
import { BlockEntity, registerBlockEntityType } from '../world/blockEntity';
import { DOWN, UP, DX, DY, DZ, AXIS_OF } from '../world/dir';
import { SculkSpreader, collisionFullBlock, type SculkLevel } from '../world/sculkSpreader';
import { AABB } from '../core/aabb';
import { LivingEntity } from '../entity/living';
import type { Player } from '../entity/player';
import type { Level } from './level';
import { registerBehavior } from './blockBehavior';
import { registerBlockListener, type GameEventListener, type ListeningBlockEntity } from './gameEventDispatcher';
import type { GameEventName, GameEventContext } from './gameEvents';

const blk = (st: number): Block => BLOCKS[STATE_BLOCK[st]];

/** vanilla CatalystListener.PULSE_TICKS: how long a bloom lasts */
const PULSE_TICKS = 8;

/**
 * vanilla LivingEntity.getExperienceReward: what it drops on dying (a mob's base with its gear's bonus, a player's
 * seven a level up to 100, kept inventories and spectators none)
 */
function experienceReward(level: Level, e: LivingEntity): number {
  if (e.type === 'player') {
    const p = e as Player;
    return level.gameRules.keepInventory || p.gameMode === 'spectator' ? 0 : Math.min(100, p.xpLevel * 7);
  }
  return (e as { experienceReward?(): number }).experienceReward?.() ?? 0;
}

/** vanilla LivingEntity.shouldDropExperience: not a baby */
const shouldDropExperience = (e: LivingEntity): boolean => !(e as { isBaby?(): boolean }).isBaby?.();

/** the running level as the spreader sees it (vanilla ServerLevel as a LevelAccessor) */
export function sculkLevelOf(level: Level): SculkLevel {
  return {
    getState: (x, y, z) => level.getState(x, y, z),
    setState: (x, y, z, st) => void level.setBlock(x, y, z, st),
    playSound: (name, x, y, z) => level.sound.play(name, x, y, z, 1, 1),
    chargeEvent: (x, y, z, data) => chargeEffects(level, x, y, z, data),
    pushEntitiesUp: (x, y, z) => {
      for (const e of level.getEntities(new AABB(x, y, z, x + 1, y + 1, z + 1))) if (e.y < y + 1) e.moveTo(e.x, y + 1, e.z, e.yaw, e.pitch);
    },
    ticksAt: (x, _y, z) => level.isEntityTicking(x, z),
  };
}

const nextDouble = (min: number, max: number): number => (min >= max ? min : Math.random() * (max - min) + min);

/** vanilla ParticleUtils.spawnParticleOnFace: a charge's glow just off one face of the block, turned `roll` */
function chargeOnFace(level: Level, x: number, y: number, z: number, d: number, roll: number, spread: number): void {
  const px = x + 0.5 + (DX[d] === 0 ? nextDouble(-spread, spread) : DX[d] * 0.55);
  const py = y + 0.5 + (DY[d] === 0 ? nextDouble(-spread, spread) : DY[d] * 0.55);
  const pz = z + 0.5 + (DZ[d] === 0 ? nextDouble(-spread, spread) : DZ[d] * 0.55);
  level.particles.sculkCharge?.(px, py, pz, nextDouble(-0.005, 0.005), nextDouble(-0.005, 0.005), nextDouble(-0.005, 0.005), roll);
}

/**
 * vanilla level event 3006 (LevelRenderer.levelEvent): a charge on a block glows on its faces (the vein's, or every
 * face of sculk), more of it and louder the bigger the charge; a charge used up pops
 */
export function chargeEffects(level: Level, x: number, y: number, z: number, data: number): void {
  const i = data >> 6;
  if (i > 0) {
    if (Math.random() < 0.3 + i * 0.1) {
      const volume = 0.15 + 0.02 * i * i * Math.random(), pitch = 0.4 + 0.3 * i * Math.random();
      level.sound.play('block.sculk.charge', x + 0.5, y + 0.5, z + 0.5, volume, pitch);
    }
    const faces = data & 63;
    // (vanilla UniformInt.of(0, i): how many on each face)
    const count = () => Math.floor(Math.random() * (i + 1));
    if (faces === 0) {
      for (let d = 0; d < 6; d++) {
        const roll = d === DOWN ? Math.PI : 0, spread = AXIS_OF[d] === 1 ? 0.65 : 0.57;
        for (let n = count(); n > 0; n--) chargeOnFace(level, x, y, z, d, roll, spread);
      }
    } else {
      for (let d = 0; d < 6; d++) {
        if (!((faces >> d) & 1)) continue;
        const roll = d === UP ? Math.PI : 0;
        for (let n = count(); n > 0; n--) chargeOnFace(level, x, y, z, d, roll, 0.35);
      }
    }
    return;
  }
  level.sound.play('block.sculk.charge', x + 0.5, y + 0.5, z + 0.5, 1, 1);
  const full = collisionFullBlock(level.getState(x, y, z));
  const n = full ? 40 : 20, f = full ? 0.45 : 0.25;
  for (let j = 0; j < n; j++) {
    const a = 2 * Math.random() - 1, b = 2 * Math.random() - 1, c = 2 * Math.random() - 1;
    level.particles.spawn?.('sculk_charge_pop', x + 0.5 + a * f, y + 0.5 + b * f, z + 0.5 + c * f, a * 0.07, b * 0.07, c * 0.07);
  }
}

/** vanilla CatalystListener.bloom: it pulses for 8 ticks, souls rise from it and it blooms with a sigh */
function bloom(level: Level, x: number, y: number, z: number): void {
  const st = level.getState(x, y, z), b = blk(st);
  if (b.name !== 'sculk_catalyst') return;
  level.setBlock(x, y, z, b.with(st, 'bloom', true));
  level.scheduleBlockTick(x, y, z, b.id, PULSE_TICKS);
  // (vanilla ServerLevel.sendParticles(SCULK_SOUL, x + 0.5, y + 1.15, z + 0.5, 2, 0.2, 0, 0.2, 0))
  for (let i = 0; i < 2; i++) level.particles.spawn?.('sculk_soul', x + 0.5 + level.random.gaussian() * 0.2, y + 1.15, z + 0.5 + level.random.gaussian() * 0.2, 0, 0, 0);
  level.sound.play('block.sculk_catalyst.bloom', x + 0.5, y + 0.5, z + 0.5, 2, 0.6 + level.random.nextFloat() * 0.4);
}

/** vanilla SculkCatalystBlockEntity.CatalystListener: a death within 8 blocks, heard nearest first */
class CatalystListener implements GameEventListener {
  readonly byDistance = true;
  constructor(private readonly be: SculkCatalystBlockEntity) {}

  listenerPosition(): [number, number, number] {
    return [this.be.x + 0.5, this.be.y + 0.5, this.be.z + 0.5];
  }

  listenerRadius(): number {
    return 8;
  }

  handleGameEvent(level: Level, event: GameEventName, ctx: GameEventContext, x: number, y: number, z: number): boolean {
    const e = ctx.entity;
    if (event !== 'entity_die' || !(e instanceof LivingEntity)) return false;
    if (e.skipDropExperience) return true;
    const xp = experienceReward(level, e);
    if (shouldDropExperience(e) && xp > 0) {
      this.be.spreader.addCursors(Math.floor(x), Math.floor(y + 0.5), Math.floor(z), xp);
      this.be.setChanged();
      // vanilla tryAwardItSpreadsAdvancement: the player who last hurt it earns It Spreads
      const by = e.lastHurtByMob;
      if (by?.type === 'player') level.onPlayerTrigger?.(by as Player, 'kill_mob_near_sculk_catalyst');
    }
    e.skipDropExperience = true;
    bloom(level, this.be.x, this.be.y, this.be.z);
    return true;
  }
}

/** vanilla SculkCatalystBlockEntity: its listener and the spreader it drives, whose cursors it saves */
export class SculkCatalystBlockEntity extends BlockEntity implements ListeningBlockEntity {
  readonly id = 'sculk_catalyst';
  /** vanilla SculkSpreader.createLevelSpreader */
  readonly spreader = SculkSpreader.level();
  readonly listener: GameEventListener = new CatalystListener(this);
  /** the level it's ticking in (vanilla BlockEntity.level) */
  level: Level | null = null;

  constructor(x: number, y: number, z: number) {
    super(x, y, z, 0);
    registerBlockListener(this);
  }

  /** vanilla SculkCatalystBlockEntity.serverTick: the charges move on (in ticking chunks) */
  override tick(level: Level): void {
    this.level = level;
    if (!this.spreader.cursors.length || !level.isEntityTicking(this.x, this.z)) return;
    this.spreader.updateCursors(sculkLevelOf(level), this.x, this.y, this.z, level.random, true);
    this.setChanged();
  }

  setChanged(): void {
    const c = this.level?.world.getChunk(this.x >> 4, this.z >> 4);
    if (c) c.modified = true;
  }

  protected override saveData(): Record<string, number | string> | undefined {
    return this.spreader.cursors.length ? { cursors: this.spreader.save() } : undefined;
  }

  protected override loadData(d: Record<string, number | string>): void {
    this.spreader.load(d.cursors);
  }
}

registerBlockEntityType('sculk_catalyst', (x, y, z) => new SculkCatalystBlockEntity(x, y, z));

// vanilla SculkCatalystBlock.tick: the bloom fades on its scheduled tick
registerBehavior('sculk_catalyst', {
  tick(level, x, y, z, st) {
    const b = blk(st);
    if (b.get(st, 'bloom')) level.setBlock(x, y, z, b.with(st, 'bloom', false));
  },
});
