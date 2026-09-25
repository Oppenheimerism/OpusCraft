// The sculk shrieker at work (vanilla SculkShriekerBlock and SculkShriekerBlockEntity): it listens (8 blocks) for a
// sculk sensor's tendrils clicking because of a player, or for a player stepping on it, and shrieks: rings rise from
// it and it lets out a cry for four and a half seconds. A shrieker that can summon (one the world grew, not one a
// player placed) also warns the players about (vanilla WardenSpawnTracker): at their fourth warning the warden
// comes up out of the ground (the warden: M4), and before that something answers from the dark, nearer each time.
// Either way it leaves the players within 40 blocks in darkness.

import { BLOCKS, STATE_BLOCK, type Block } from '../world/block';
import { BlockEntity, registerBlockEntityType } from '../world/blockEntity';
import type { Entity } from '../entity/entity';
import type { Player } from '../entity/player';
import { MOB_EFFECTS, MobEffectInstance } from '../entity/effects';
import type { Level } from './level';
import { registerBehavior } from './blockBehavior';
import { registerBlockListener, blockListenerAt, type ListeningBlockEntity } from './gameEventDispatcher';
import { GAME_EVENT_TAGS, type GameEventName, type GameEventContext } from './gameEvents';
import { VibrationData, VibrationListener, tickVibrations, projectileOwner, type VibrationUser } from './vibrations';
import { tryWarn, levelPlayers } from './wardenSpawnTracker';

const blk = (st: number): Block => BLOCKS[STATE_BLOCK[st]];
const isShrieker = (st: number): boolean => blk(st).name === 'sculk_shrieker';

/** vanilla SculkShriekerBlockEntity.SHRIEKING_TICKS */
const SHRIEKING_TICKS = 90;
/** vanilla SculkShriekerBlockEntity.DARKNESS_RADIUS */
const DARKNESS_RADIUS = 40;
/** vanilla SculkShriekerBlockEntity.SOUND_BY_LEVEL: what answers each warning */
const SOUND_BY_LEVEL: Record<number, string> = {
  1: 'entity.warden.nearby_close',
  2: 'entity.warden.nearby_closer',
  3: 'entity.warden.nearby_closest',
  4: 'entity.warden.listening_angry',
};

/** what the warden (M4) hooks in: vanilla SculkShriekerBlockEntity.trySummonWarden's SpawnUtil.trySpawnMob */
export const shriekerHooks: { summonWarden: ((level: Level, x: number, y: number, z: number) => boolean) | null } = { summonWarden: null };

/**
 * vanilla SculkShriekerBlockEntity.tryGetPlayer: the player behind something (the player, or riding and steering
 * it, or who shot the projectile or threw the item)
 */
export function tryGetPlayer(e: Entity | null | undefined): Player | null {
  if (!e) return null;
  if (e.type === 'player') return e as Player;
  const rider = e.controllingPassenger();
  if (rider?.type === 'player') return rider as Player;
  const owner = projectileOwner(e);
  if (owner?.type === 'player') return owner as Player;
  if (e.type === 'item') {
    const thrower = (e as { thrower?: Entity | null }).thrower;
    if (thrower?.type === 'player') return thrower as Player;
  }
  return null;
}

/**
 * vanilla Warden.applyDarknessAround (MobEffectUtil.addEffectToPlayersAround): darkness for 13 seconds on the
 * survival and adventure players within `radius`, unless theirs lasts 10 seconds more already
 */
export function applyDarknessAround(level: Level, x: number, y: number, z: number, source: Entity | null, radius: number): void {
  const effect = MOB_EFFECTS.darkness;
  for (const p of levelPlayers(level)) {
    if (p.gameMode !== 'survival' && p.gameMode !== 'adventure') continue;
    if ((p.x - x) ** 2 + (p.y - y) ** 2 + (p.z - z) ** 2 >= radius * radius) continue;
    const cur = p.getEffect('darkness');
    if (cur && cur.amplifier >= 0 && !cur.endsWithin(200 - 1)) continue;
    p.addEffect(new MobEffectInstance(effect, 260, 0, false, false), source);
  }
}

/**
 * vanilla level event 3007 (LevelRenderer.levelEvent): ten rings rising from the shrieker's top a quarter of a
 * second apart, and its shriek (not under water)
 */
function shriekEffects(level: Level, x: number, y: number, z: number, st: number): void {
  for (let i = 0; i < 10; i++) level.particles.shriek?.(x + 0.5, y + 0.5, z + 0.5, i * 5);
  if (!blk(st).get(st, 'waterlogged')) level.sound.play('block.sculk_shrieker.shriek', x + 0.5, y + 0.5, z + 0.5, 2, 0.6 + level.random.nextFloat() * 0.4);
}

// ---------------------------------------------------------------------------------------------------------------
// The block entity

/** vanilla SculkShriekerBlockEntity.VibrationUser: a sensor's tendrils clicking, because of a player, within 8 blocks */
class ShriekerUser implements VibrationUser {
  readonly radius = 8;
  readonly listenable = GAME_EVENT_TAGS.shrieker_can_listen;
  readonly requiresAdjacentChunksToBeTicking = true;
  constructor(private readonly be: SculkShriekerBlockEntity) {}

  position(): [number, number, number] {
    return [this.be.x + 0.5, this.be.y + 0.5, this.be.z + 0.5];
  }

  canReceive(level: Level, _x: number, _y: number, _z: number, _event: GameEventName, ctx: GameEventContext): boolean {
    const st = level.getState(this.be.x, this.be.y, this.be.z);
    return isShrieker(st) && !blk(st).get(st, 'shrieking') && tryGetPlayer(ctx.entity) !== null;
  }

  onReceive(level: Level, _x: number, _y: number, _z: number, _event: GameEventName, entity: Entity | null, owner: Entity | null): void {
    this.be.tryShriek(level, tryGetPlayer(owner ?? entity));
  }

  onDataChanged(): void {
    this.be.setChanged();
  }
}

/** vanilla SculkShriekerBlockEntity: the warning level it last shrieked at, and its listener */
export class SculkShriekerBlockEntity extends BlockEntity implements ListeningBlockEntity {
  readonly id = 'sculk_shrieker';
  /** vanilla warningLevel */
  warningLevel = 0;
  readonly vibration = new VibrationData();
  readonly user: VibrationUser = new ShriekerUser(this);
  readonly listener = new VibrationListener(this.user, this.vibration);
  /** the level it's ticking in (vanilla BlockEntity.level) */
  level: Level | null = null;

  constructor(x: number, y: number, z: number) {
    super(x, y, z, 0);
    registerBlockListener(this);
  }

  override tick(level: Level): void {
    this.level = level;
    if (!level.isEntityTicking(this.x, this.z)) return;
    tickVibrations(level, this.vibration, this.user);
  }

  setChanged(): void {
    const c = this.level?.world.getChunk(this.x >> 4, this.z >> 4);
    if (c) c.modified = true;
  }

  /**
   * vanilla tryShriek: not while it's shrieking; one that can summon warns the players about first, and only shrieks
   * if that took (none of them warned in the last ten seconds, no warden about)
   */
  tryShriek(level: Level, player: Player | null): void {
    if (!player) return;
    this.level = level;
    const st = level.getState(this.x, this.y, this.z);
    if (!isShrieker(st) || blk(st).get(st, 'shrieking')) return;
    this.warningLevel = 0;
    if (!this.canRespond(level, st) || this.tryToWarn(level, player)) this.shriek(level, player);
  }

  /** vanilla tryToWarn */
  private tryToWarn(level: Level, player: Player): boolean {
    const w = tryWarn(level, this.x, this.y, this.z, player);
    if (w !== null) this.warningLevel = w;
    return w !== null;
  }

  /** vanilla shriek: shrieking for 90 ticks, the rings and the cry, and the shriek event (for wardens) */
  private shriek(level: Level, source: Entity | null): void {
    const st = level.getState(this.x, this.y, this.z), b = blk(st);
    level.setBlock(this.x, this.y, this.z, b.with(st, 'shrieking', true), 2);
    level.scheduleBlockTick(this.x, this.y, this.z, b.id, SHRIEKING_TICKS);
    shriekEffects(level, this.x, this.y, this.z, st);
    level.gameEvent('shriek', this.x + 0.5, this.y + 0.5, this.z + 0.5, { entity: source });
    this.setChanged();
  }

  /** vanilla canRespond: it can summon, the game isn't peaceful, and wardens may spawn */
  private canRespond(level: Level, st: number): boolean {
    return isShrieker(st) && !!blk(st).get(st, 'can_summon') && level.difficulty !== 'peaceful' && !!level.gameRules.doWardenSpawning;
  }

  /**
   * vanilla tryRespond: at the end of a shriek that warned, the warden comes (at the fourth warning) or something
   * answers from the dark, and darkness falls round about. `st`: the shrieker as it was (it may be gone)
   */
  tryRespond(level: Level, st = level.getState(this.x, this.y, this.z)): void {
    if (!this.canRespond(level, st) || this.warningLevel <= 0) return;
    if (!this.trySummonWarden(level)) this.playWardenReplySound(level);
    applyDarknessAround(level, this.x + 0.5, this.y + 0.5, this.z + 0.5, null, DARKNESS_RADIUS);
  }

  /** vanilla playWardenReplySound: somewhere within 10 blocks of it, loud (volume 5) */
  private playWardenReplySound(level: Level): void {
    const sound = SOUND_BY_LEVEL[this.warningLevel];
    if (!sound) return;
    const r = level.random;
    const x = this.x + r.nextInt(21) - 10, y = this.y + r.nextInt(21) - 10, z = this.z + r.nextInt(21) - 10;
    level.sound.play(sound, x, y, z, 5, 1);
  }

  /** vanilla trySummonWarden: only at the fourth warning (the warden itself: M4) */
  private trySummonWarden(level: Level): boolean {
    return this.warningLevel >= 4 && !!shriekerHooks.summonWarden?.(level, this.x, this.y, this.z);
  }

  protected override saveData(): Record<string, number | string> | undefined {
    return { warning_level: this.warningLevel, listener: this.vibration.save() };
  }

  protected override loadData(d: Record<string, number | string>): void {
    this.warningLevel = Number(d.warning_level ?? 0);
    this.vibration.load(d.listener);
  }
}

registerBlockEntityType('sculk_shrieker', (x, y, z) => new SculkShriekerBlockEntity(x, y, z));

const isShriekerEntity = (be: ListeningBlockEntity): be is SculkShriekerBlockEntity => be instanceof SculkShriekerBlockEntity;

/** the shrieker block entity at (x, y, z) */
export function shriekerAt(level: Level, x: number, y: number, z: number): SculkShriekerBlockEntity | null {
  const be = level.world.getBlockEntity(x, y, z);
  return be instanceof SculkShriekerBlockEntity ? be : null;
}

// ---------------------------------------------------------------------------------------------------------------
// The block

registerBehavior('sculk_shrieker', {
  // vanilla SculkShriekerBlock.stepOn: a player stepping on it (or riding, or throwing something onto it) sets it off
  stepOn(level, x, y, z, _st, e) {
    const p = tryGetPlayer(e);
    if (p) shriekerAt(level, x, y, z)?.tryShriek(level, p);
  },
  // vanilla SculkShriekerBlock.tick: the shriek is over; then the answer
  tick(level, x, y, z, st) {
    if (!blk(st).get(st, 'shrieking')) return;
    level.setBlock(x, y, z, blk(st).with(st, 'shrieking', false));
    shriekerAt(level, x, y, z)?.tryRespond(level);
  },
  // vanilla SculkShriekerBlock.onRemove: broken mid-shriek, it answers at once
  onRemove(level, x, y, z, st, now) {
    if (!blk(st).get(st, 'shrieking') || STATE_BLOCK[now] === STATE_BLOCK[st]) return;
    blockListenerAt(level, x, y, z, isShriekerEntity)?.tryRespond(level, st);
  },
});
