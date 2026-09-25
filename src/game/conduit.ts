// The conduit (Stage 5: ocean; vanilla ConduitBlock and ConduitBlockEntity): a heart of the sea in a cage of nautilus
// shells. Every two seconds it looks round itself: with water in all the 3x3x3 round it, and at least 16 blocks of
// prismarine, prismarine bricks, dark prismarine or sea lanterns in the rings of its frame (the three 5x5 squares
// through it, edges only, 42 places in all), it wakes: it gives Conduit Power (water breathing, faster mining,
// clearer sight underwater) to players in water or rain within 16 blocks for every 7 frame blocks, and with the whole
// frame it opens its eye and hunts: a monster in water within 8 blocks is hurt 4 each time, one at a time. Awake, it
// turns in its cage, hums now and then, and draws nautilus sparks in from its frame (and from its prey).

import { BlockEntity, registerBlockEntityType } from '../world/blockEntity';
import { BLOCKS, STATE_BLOCK, FLAGS, F_WATER, getBlock } from '../world/block';
import { registerBehavior } from './blockBehavior';
import { AABB } from '../core/aabb';
import { LivingEntity } from '../entity/living';
import { MobEffectInstance, MOB_EFFECTS } from '../entity/effects';
import { isEnemy } from '../entity/ironGolem';
import type { Level } from './level';

/** vanilla ConduitBlockEntity.VALID_BLOCKS */
const FRAME_BLOCKS = new Set(['prismarine', 'prismarine_bricks', 'sea_lantern', 'dark_prismarine']);

/** the frame's places round a conduit (vanilla updateShape's rings: off the middle 3x3x3, on one of the three planes through it, on its square's edge) */
export const FRAME_OFFSETS: [number, number, number][] = [];
for (let i = -2; i <= 2; i++)
  for (let j = -2; j <= 2; j++)
    for (let k = -2; k <= 2; k++) {
      const l = Math.abs(i), m = Math.abs(j), n = Math.abs(k);
      if ((l > 1 || m > 1 || n > 1) && ((i === 0 && (m === 2 || n === 2)) || (j === 0 && (l === 2 || n === 2)) || (k === 0 && (l === 2 || m === 2)))) FRAME_OFFSETS.push([i, j, k]);
    }

const isWaterAt = (level: Level, x: number, y: number, z: number) => (FLAGS[level.getState(x, y, z)] & F_WATER) !== 0;

export class ConduitBlockEntity extends BlockEntity {
  readonly id = 'conduit';
  tickCount = 0;
  /** vanilla activeRotation: ticks it has turned while awake */
  activeRotation = 0;
  active = false;
  hunting = false;
  /** vanilla effectBlocks: the frame blocks it found last */
  readonly effectBlocks: [number, number, number][] = [];
  destroyTarget: LivingEntity | null = null;
  private destroyTargetUUID: string | null = null;
  private nextAmbientSoundActivation = 0;

  constructor(x: number, y: number, z: number) {
    super(x, y, z, 0);
  }

  /** vanilla getActiveRotation: its turn in the cage, in radians */
  activeRotationAt(partial: number): number {
    return (this.activeRotation + partial) * -0.0375;
  }

  /** vanilla serverTick and clientTick together */
  override tick(level: Level): void {
    if (this.removed) return;
    this.tickCount++;
    const t = level.gameTime;
    const cx = this.x + 0.5, cy = this.y + 0.5, cz = this.z + 0.5;
    if (t % 40 === 0) {
      const on = this.updateShape(level);
      if (on !== this.active) level.sound.play(on ? 'block.conduit.activate' : 'block.conduit.deactivate', cx, cy, cz, 1, 1);
      this.active = on;
      this.hunting = this.effectBlocks.length >= 42;
      if (on) {
        this.applyEffects(level);
        this.updateDestroyTarget(level);
      }
    }
    if (this.active) {
      if (t % 80 === 0) level.sound.play('block.conduit.ambient', cx, cy, cz, 1, 1);
      if (t > this.nextAmbientSoundActivation) {
        this.nextAmbientSoundActivation = t + 60 + level.random.nextInt(40);
        level.sound.play('block.conduit.ambient.short', cx, cy, cz, 1, 1);
      }
    }
    this.animationTick(level);
    if (this.active) this.activeRotation++;
  }

  /** vanilla updateShape: water all round it, and the frame blocks in their places (16 or more to wake) */
  private updateShape(level: Level): boolean {
    this.effectBlocks.length = 0;
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) if (!isWaterAt(level, this.x + i, this.y + j, this.z + k)) return false;
    for (const [i, j, k] of FRAME_OFFSETS) {
      const st = level.getState(this.x + i, this.y + j, this.z + k);
      if (FRAME_BLOCKS.has(BLOCKS[STATE_BLOCK[st]].name)) this.effectBlocks.push([this.x + i, this.y + j, this.z + k]);
    }
    return this.effectBlocks.length >= 16;
  }

  /**
   * vanilla applyEffects: players whose block is nearer than 16 per 7 frame blocks (any height up the box above it)
   * and who are in water or rain, Conduit Power for 13 seconds, ambient
   */
  private applyEffects(level: Level): void {
    const j = Math.trunc(this.effectBlocks.length / 7) * 16;
    const box = new AABB(this.x, this.y, this.z, this.x + 1, this.y + 1, this.z + 1).inflate(j).expandTowards(0, level.world.dim.maxY - level.world.dim.minY, 0);
    const effect = MOB_EFFECTS['conduit_power'];
    for (const e of level.getEntities(box, (e) => e.type === 'player')) {
      const p = e as LivingEntity;
      const dx = Math.floor(p.x) - this.x, dy = Math.floor(p.y) - this.y, dz = Math.floor(p.z) - this.z;
      if (dx * dx + dy * dy + dz * dz < j * j && p.isInWaterOrRainNow()) p.addEffect(new MobEffectInstance(effect, 260, 0, true, true));
    }
  }

  /**
   * vanilla updateDestroyTarget: with the whole frame, a monster in water or rain within 8 (the one it had, or the one
   * saved, or one of those near picked at random) is hurt by magic for 4, with a sound where it is
   */
  private updateDestroyTarget(level: Level): void {
    const range = new AABB(this.x, this.y, this.z, this.x + 1, this.y + 1, this.z + 1).inflate(8);
    if (this.effectBlocks.length < 42) this.destroyTarget = null;
    else if (!this.destroyTarget && this.destroyTargetUUID) {
      const id = this.destroyTargetUUID;
      const found = level.getEntities(range, (e) => e instanceof LivingEntity && e.hasUuid && e.uuid === id);
      this.destroyTarget = found.length === 1 ? (found[0] as LivingEntity) : null;
      this.destroyTargetUUID = null;
    } else if (!this.destroyTarget) {
      const list = level.getEntities(range, (e) => e instanceof LivingEntity && isEnemy(e) && e.isInWaterOrRainNow());
      if (list.length) this.destroyTarget = list[level.random.nextInt(list.length)] as LivingEntity;
    } else {
      const d = this.destroyTarget;
      const dx = Math.floor(d.x) - this.x, dy = Math.floor(d.y) - this.y, dz = Math.floor(d.z) - this.z;
      if (!d.isAlive || d.removed || dx * dx + dy * dy + dz * dz >= 64) this.destroyTarget = null;
    }
    const target = this.destroyTarget;
    if (target) {
      level.sound.play('block.conduit.attack.target', target.x, target.y, target.z, 1, 1);
      target.hurt(4, 'magic');
    }
  }

  /**
   * vanilla animationTick: now and then a nautilus spark from each frame block in to just above the conduit (bobbing
   * as it does), and one each tick from round its prey
   */
  private animationTick(level: Level): void {
    const spawn = level.particles.spawn;
    if (!spawn) return;
    const r = level.random;
    let d = Math.sin((this.tickCount + 35) * 0.1) / 2 + 0.5;
    d = (d * d + d) * 0.3;
    const x = this.x + 0.5, y = this.y + 1.5 + d, z = this.z + 0.5;
    for (const [bx, by, bz] of this.effectBlocks) {
      if (r.nextInt(50) !== 0) continue;
      const f = -0.5 + r.nextFloat() + (bx - this.x), f1 = -2 + r.nextFloat() + (by - this.y), f2 = -0.5 + r.nextFloat() + (bz - this.z);
      spawn.call(level.particles, 'nautilus', x, y, z, f, f1, f2);
    }
    const e = this.destroyTarget;
    if (e) {
      const f3 = (-0.5 + r.nextFloat()) * (3 + e.width), f4 = -1 + r.nextFloat() * e.height, f5 = (-0.5 + r.nextFloat()) * (3 + e.width);
      spawn.call(level.particles, 'nautilus', e.x, e.y + e.eyeHeight, e.z, f3, f4, f5);
    }
  }

  protected override saveData(): Record<string, number | string> | undefined {
    const id = this.destroyTarget?.uuid ?? this.destroyTargetUUID;
    return id ? { Target: id } : undefined;
  }

  protected override loadData(d: Record<string, number | string>): void {
    this.destroyTargetUUID = typeof d.Target === 'string' ? d.Target : null;
  }
}

registerBlockEntityType('conduit', (x, y, z) => new ConduitBlockEntity(x, y, z));

// vanilla ConduitBlock.getStateForPlacement: waterlogged only in a full block of water
registerBehavior('conduit', {
  placement(ctx) {
    const cur = ctx.world.getState(ctx.x, ctx.y, ctx.z);
    const b = BLOCKS[STATE_BLOCK[cur]];
    const full = b.name === 'water' ? b.get(cur, 'level') === 0 : b.propIndex('waterlogged') >= 0 && b.get(cur, 'waterlogged') === true;
    const conduit = getBlock('conduit');
    return conduit.with(conduit.defaultState, 'waterlogged', full);
  },
});
