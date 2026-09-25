// vanilla ItemFrame and GlowItemFrame (a HangingEntity, a BlockAttachedEntity): a frame hung on any face of a block,
// which takes the item held out to it, turns it an eighth at a time with each click after (a map a quarter), gives it up
// when struck and comes down itself when struck empty. It needs something solid behind it (a repeater or comparator
// will do for one on a wall), and every 100 ticks it checks it still has it, dropping off (with what it holds) if not;
// it never moves: whatever would move it (a push, a piston) brings it down instead. A fixed frame (entity data) can't be
// changed or broken but in creative; an invisible one shows only what it holds. The glow frame lights what it holds.
// Drawn by render/itemFrameRenderer.ts.

import { Entity } from './entity';
import type { Level } from '../game/level';
import type { Player } from './player';
import type { SavedEntity } from './mob';
import { ItemEntity } from './itemEntity';
import { AABB } from '../core/aabb';
import { ItemStack, saveStack, loadStack, type SavedStack } from '../item/item';
import { UP, NORTH, SOUTH, WEST, EAST, DX, DY, DZ, AXIS_OF, type Dir } from '../world/dir';
import { BLOCKS, STATE_BLOCK } from '../world/block';
import { isSolidBlock } from '../world/gen/patches';
import { registerItemBehavior } from '../game/itemBehavior';

/** vanilla Direction.get2DDataValue (SOUTH 0, WEST 1, NORTH 2, EAST 3) */
const DATA_2D: Record<number, number> = { [SOUTH]: 0, [WEST]: 1, [NORTH]: 2, [EAST]: 3 };

/** vanilla DamageTypeTags.IS_EXPLOSION */
const EXPLOSION = new Set(['explosion', 'playerExplosion', 'badRespawnPoint', 'fireworks']);

/** vanilla DiodeBlock.isDiode: a repeater or a comparator (one on a wall may hang on either) */
const DIODE = /^(repeater|comparator)$/;

export type ItemFrameType = 'item_frame' | 'glow_item_frame';

export class ItemFrame extends Entity {
  readonly type: ItemFrameType;
  /** vanilla HangingEntity.direction: the way it faces, out from what it hangs on (south until told otherwise) */
  direction: Dir = SOUTH;
  /** vanilla BlockAttachedEntity.pos: the block it hangs in */
  tileX = 0;
  tileY = 0;
  tileZ = 0;
  /** vanilla DATA_ITEM (null: empty) */
  item: ItemStack | null = null;
  /** vanilla DATA_ROTATION: eighths of a turn (a map shows every other one as a quarter) */
  rotation = 0;
  /** vanilla dropChance (ItemDropChance) */
  dropChance = 1;
  /** vanilla fixed (Fixed): can't be turned, emptied, moved or broken but by a creative player */
  fixed = false;
  /** vanilla Entity.isInvisible (Invisible): only what it holds is drawn */
  invisible = false;
  /** vanilla Entity.invulnerable */
  invulnerable = false;
  /** vanilla Entity.blocksBuilding: blocks may be put where it hangs (it drops off at its next check) */
  readonly blocksBuilding = false;
  /** vanilla BlockAttachedEntity.checkInterval */
  private checkInterval = 0;
  /** vanilla ItemFrame.removeFramedMap: the map it held left the frame (maps wire in their frame markers here) */
  static onMapRemoved: ((frame: ItemFrame, map: ItemStack) => void) | null = null;

  constructor(level: Level, type: ItemFrameType = 'item_frame', x?: number, y?: number, z?: number, direction: Dir = SOUTH) {
    super(level);
    this.type = type;
    // vanilla EntityType.ITEM_FRAME: sized(0.5, 0.5), eye height 0 (its box is its own, calculateBoundingBox)
    this.width = 0.5;
    this.height = 0.5;
    if (x !== undefined) {
      this.tileX = x;
      this.tileY = y!;
      this.tileZ = z!;
    }
    this.setDirection(direction);
  }

  /** vanilla EntityType.ITEM_FRAME eyeHeight(0): its light is taken where it hangs */
  override get eyeHeight(): number {
    return 0;
  }

  get glow(): boolean {
    return this.type === 'glow_item_frame';
  }

  /** vanilla ItemFrame.setDirection: yaw from the way it faces; one on a floor or a ceiling is pitched to face up or down */
  setDirection(d: Dir): void {
    this.direction = d;
    if (AXIS_OF[d] !== 1) {
      this.pitch = 0;
      this.yaw = DATA_2D[d] * 90;
    } else {
      this.pitch = -90 * (d === UP ? 1 : -1);
      this.yaw = 0;
    }
    this.pitchO = this.pitch;
    this.yawO = this.yaw;
    this.recalculateBoundingBox();
  }

  /** vanilla ItemFrame.calculateBoundingBox: a sixteenth deep against the face, 0.75 across (a map's frame the whole block) */
  private calculateBoundingBox(): AABB {
    const d = this.direction, f = 0.46875;
    const cx = this.tileX + 0.5 - DX[d] * f, cy = this.tileY + 0.5 - DY[d] * f, cz = this.tileZ + 0.5 - DZ[d] * f;
    const across = this.hasFramedMap() ? 1 : 0.75;
    const a = AXIS_OF[d];
    const w = a === 0 ? 0.0625 : across, h = a === 1 ? 0.0625 : across, l = a === 2 ? 0.0625 : across;
    return new AABB(cx - w / 2, cy - h / 2, cz - l / 2, cx + w / 2, cy + h / 2, cz + l / 2);
  }

  /** vanilla HangingEntity.recalculateBoundingBox: the entity stands at its box's centre */
  recalculateBoundingBox(): void {
    const bb = this.calculateBoundingBox();
    this.x = (bb.minX + bb.maxX) / 2;
    this.y = (bb.minY + bb.maxY) / 2;
    this.z = (bb.minZ + bb.maxZ) / 2;
    this.bb = bb;
  }

  /** vanilla BlockAttachedEntity.setPos: any position puts it in that block */
  override setPos(x: number, y: number, z: number): void {
    this.tileX = Math.floor(x);
    this.tileY = Math.floor(y);
    this.tileZ = Math.floor(z);
    // (the constructor's own setPos comes before the direction is known)
    if (this.direction !== undefined) this.recalculateBoundingBox();
  }

  override moveTo(x: number, y: number, z: number, _yaw?: number, _pitch?: number): void {
    this.setPos(x, y, z);
    this.xo = this.x;
    this.yo = this.y;
    this.zo = this.z;
  }

  override setSize(_w: number, _h: number): void {}

  /** vanilla ItemFrame.survives: nothing in its way, something solid behind it, and no other frame where it hangs */
  survives(): boolean {
    if (this.fixed) return true;
    if (this.collisionBoxes(this.bb).length) return false;
    const d = this.direction;
    const st = this.level.world.getState(this.tileX - DX[d], this.tileY - DY[d], this.tileZ - DZ[d]);
    if (!(isSolidBlock(st) || (AXIS_OF[d] !== 1 && DIODE.test(BLOCKS[STATE_BLOCK[st]].name)))) return false;
    return this.level.getEntities(this.bb, (e) => e instanceof ItemFrame, this).length === 0;
  }

  /** vanilla BlockAttachedEntity.tick: no physics at all; every hundredth tick, whether it can still hang there */
  override tick(): void {
    this.xo = this.x;
    this.yo = this.y;
    this.zo = this.z;
    this.yawO = this.yaw;
    this.pitchO = this.pitch;
    this.tickCount++;
    // vanilla checkBelowWorld
    if (this.y < this.level.world.dim.minY - 64) this.onBelowWorld();
    if (this.checkInterval++ === 100) {
      this.checkInterval = 0;
      if (!this.removed && !this.survives()) {
        this.remove();
        this.dropItem(null);
      }
    }
  }

  override isPickable(): boolean {
    return true;
  }

  override pickRadius(): number {
    return 0;
  }

  override isPushable(): boolean {
    return false;
  }

  /** vanilla BlockAttachedEntity.thunderHit: lightning leaves it be */
  override thunderHit(_bolt: Entity): void {}

  /** vanilla ItemFrame.push / BlockAttachedEntity.push: being pushed at all brings it down (not a fixed one) */
  override push(x: number, y: number, z: number): void {
    if (this.fixed) return;
    if (!this.removed && x * x + y * y + z * z > 0) {
      this.kill();
      this.dropItem(null);
    }
  }

  /** vanilla ItemFrame.move / BlockAttachedEntity.move: moved at all (a piston), it comes down (not a fixed one) */
  override move(mx: number, my: number, mz: number): void {
    if (this.fixed) return;
    if (!this.removed && mx * mx + my * my + mz * mz > 0) {
      this.kill();
      this.dropItem(null);
    }
  }

  /** vanilla ItemFrame.kill: a map it held leaves the frame */
  override kill(): void {
    if (this.item) this.removeFramedMap(this.item);
    super.kill();
  }

  /** vanilla Entity.isInvulnerableTo: gone, or invulnerable (but not to /kill, the void or a creative player) */
  private isInvulnerableTo(source: string, attacker: Entity | null | undefined): boolean {
    if (this.removed) return true;
    return this.invulnerable && source !== 'void' && source !== 'genericKill' && !isCreative(attacker);
  }

  /**
   * vanilla ItemFrame.hurt: a fixed frame gives only to a creative player (or /kill); anything but a blast knocks out
   * what it holds, with the sound; a blast, or a blow to an empty frame, brings the frame down
   */
  override hurt(_amount: number, source: string, attacker?: Entity | null): boolean {
    if (this.fixed) {
      if (source !== 'void' && source !== 'genericKill' && !isCreative(attacker)) return false;
      return this.hurtHanging(source, attacker);
    }
    if (this.isInvulnerableTo(source, attacker)) return false;
    if (!EXPLOSION.has(source) && this.item) {
      this.dropFramed(attacker ?? null, false);
      this.level.gameEvent?.('block_change', this.x, this.y, this.z, { entity: attacker ?? null });
      this.playSound(this.removeItemSound());
      return true;
    }
    return this.hurtHanging(source, attacker);
  }

  /** vanilla BlockAttachedEntity.hurt: down it comes, with what it holds */
  private hurtHanging(source: string, attacker: Entity | null | undefined): boolean {
    if (this.isInvulnerableTo(source, attacker)) return false;
    if (!this.removed) {
      this.kill();
      this.dropItem(attacker ?? null);
    }
    return true;
  }

  /** vanilla BlockAttachedEntity.skipAttackInteraction: a player's blow is taken as a hurt of nothing, and goes no further */
  skipAttackInteraction(p: Player): boolean {
    return this.hurt(0, 'player', p);
  }

  /** vanilla ItemFrame.dropItem(Entity): coming down, with its sound, the frame and what it held */
  dropItem(breaker: Entity | null): void {
    this.playSound(this.breakSound());
    this.dropFramed(breaker, true);
  }

  /**
   * vanilla ItemFrame.dropItem(Entity, boolean): what it holds comes out (and the frame itself with `dropSelf`), but for
   * a creative player's hand (just emptied) or with doEntityDrops off; a fixed frame keeps everything
   */
  private dropFramed(breaker: Entity | null, dropSelf: boolean): void {
    if (this.fixed) return;
    const stack = this.item;
    this.setItem(null);
    if (!this.level.gameRules.doEntityDrops) {
      if (!breaker && stack) this.removeFramedMap(stack);
      return;
    }
    if (breaker && isCreative(breaker)) {
      if (stack) this.removeFramedMap(stack);
      return;
    }
    if (dropSelf) this.spawnAtLocation(this.frameItemStack());
    if (stack) {
      const s = stack.copy();
      this.removeFramedMap(s);
      if (this.level.random.nextFloat() < this.dropChance) this.spawnAtLocation(s);
    }
  }

  /** vanilla ItemFrame.removeFramedMap */
  private removeFramedMap(stack: ItemStack): void {
    if (stack.item.id === 'filled_map') ItemFrame.onMapRemoved?.(this, stack);
  }

  /** vanilla HangingEntity.spawnAtLocation: a little out from the wall, with the usual toss */
  private spawnAtLocation(stack: ItemStack): void {
    const d = this.direction;
    const e = new ItemEntity(this.level, stack);
    e.moveTo(this.x + DX[d] * 0.15, this.y, this.z + DZ[d] * 0.15, Math.random() * 360, 0);
    e.dx = this.level.random.nextFloat() * 0.2 - 0.1;
    e.dy = 0.2;
    e.dz = this.level.random.nextFloat() * 0.2 - 0.1;
    // (vanilla setDefaultPickUpDelay)
    e.pickupDelay = 10;
    this.level.addEntity(e);
  }

  /** vanilla getFrameItemStack */
  frameItemStack(): ItemStack {
    return ItemStack.of(this.type);
  }

  /** vanilla hasFramedMap */
  hasFramedMap(): boolean {
    return this.item?.item.id === 'filled_map' && this.item.tag?.mapId !== undefined;
  }

  /** vanilla ItemFrame.setItem: one of the stack (a copy), with the sound when there is one; the box follows a map's size */
  setItem(stack: ItemStack | null, sound = true): void {
    this.item = stack && stack.count > 0 ? stack.copyWithCount(1) : null;
    this.recalculateBoundingBox();
    if (this.item && sound) this.playSound(this.addItemSound());
    this.outputChanged();
  }

  /** vanilla ItemFrame.setRotation (eight steps) */
  setRotation(r: number): void {
    this.rotation = ((r % 8) + 8) % 8;
    this.outputChanged();
  }

  /** vanilla getAnalogOutput: what a comparator behind it reads (nothing empty, else its turn + 1) */
  analogOutput(): number {
    return this.item ? (this.rotation % 8) + 1 : 0;
  }

  /**
   * vanilla updateNeighbourForOutputSignal(pos, AIR): a comparator reading the frame reads again (redstone wires
   * comparators in here)
   */
  static onOutputChanged: ((frame: ItemFrame) => void) | null = null;

  private outputChanged(): void {
    if (this.level.entities.includes(this)) ItemFrame.onOutputChanged?.(this);
  }

  /**
   * vanilla ItemFrame.interact: a fixed frame does nothing; an empty one takes one of the stack held out (none used up
   * in creative); one holding something turns it, with the sound. Nothing happens (the other hand gets its go) only when
   * the frame and the hand are both empty
   */
  playerInteract(p: Player, stack: ItemStack | null): boolean {
    if (this.fixed) return false;
    if (!this.item) {
      if (!stack || stack.count <= 0 || this.removed) return false;
      this.setItem(stack);
      this.level.gameEvent?.('block_change', this.x, this.y, this.z, { entity: p });
      if (p.gameMode !== 'creative') p.inventory.consumeSelected(1);
      return true;
    }
    this.playSound(this.rotateItemSound());
    this.setRotation(this.rotation + 1);
    this.level.gameEvent?.('block_change', this.x, this.y, this.z, { entity: p });
    return true;
  }

  /** vanilla getPickResult: what it holds, else the frame */
  override pickResult(): string | null {
    return this.item ? this.item.item.id : this.type;
  }

  override isOnFire(): boolean {
    return false;
  }

  protected override makesStepSounds(): boolean {
    return false;
  }

  // --- sounds (vanilla SoundEvents.ITEM_FRAME_* / GLOW_ITEM_FRAME_*, at volume 1 and pitch 1)

  playSound(name: string): void {
    this.level.sound.play(name, this.x, this.y, this.z, 1, 1);
  }

  addItemSound(): string {
    return `entity.${this.type}.add_item`;
  }

  removeItemSound(): string {
    return `entity.${this.type}.remove_item`;
  }

  rotateItemSound(): string {
    return `entity.${this.type}.rotate_item`;
  }

  breakSound(): string {
    return `entity.${this.type}.break`;
  }

  placeSound(): string {
    return `entity.${this.type}.place`;
  }

  // --- saving (vanilla ItemFrame.addAdditionalSaveData: Facing, Item, ItemRotation, ItemDropChance, Invisible, Fixed,
  // and TileX/Y/Z)

  save(): SavedEntity {
    const data: Record<string, number | string | boolean> = { facing: this.direction, tileX: this.tileX, tileY: this.tileY, tileZ: this.tileZ };
    if (this.item) {
      data.rotation = this.rotation;
      data.dropChance = this.dropChance;
    }
    if (this.invisible) data.invisible = true;
    if (this.fixed) data.fixed = true;
    if (this.invulnerable) data.invulnerable = true;
    return { id: this.type, x: this.x, y: this.y, z: this.z, yaw: this.yaw, pitch: this.pitch, dx: 0, dy: 0, dz: 0, health: 1, fire: 0, hand: this.item ? saveStack(this.item) : null, data };
  }

  load(d: SavedEntity): void {
    const data = d.data ?? {};
    this.tileX = Number(data.tileX ?? Math.floor(d.x));
    this.tileY = Number(data.tileY ?? Math.floor(d.y));
    this.tileZ = Number(data.tileZ ?? Math.floor(d.z));
    const f = Number(data.facing ?? SOUTH);
    this.item = loadStack(d.hand as SavedStack | null | undefined);
    if (this.item) {
      this.rotation = ((Number(data.rotation ?? 0) % 8) + 8) % 8;
      if (typeof data.dropChance === 'number') this.dropChance = data.dropChance;
    }
    this.setDirection((f >= 0 && f <= 5 ? f : SOUTH) as Dir);
    this.invisible = data.invisible === true;
    this.fixed = data.fixed === true;
    this.invulnerable = data.invulnerable === true;
    this.xo = this.x;
    this.yo = this.y;
    this.zo = this.z;
  }

  /**
   * /summon's entity data (vanilla readAdditionalSaveData): Facing (0 down … 5 east), Item {id, count}, ItemRotation,
   * ItemDropChance, Fixed, Invisible, Invulnerable
   */
  readEntityData(nbt: string): void {
    const facing = /Facing:\s*(-?\d+)b?/.exec(nbt);
    if (facing) {
      const f = Number(facing[1]);
      if (f >= 0 && f <= 5) this.setDirection(f as Dir);
    }
    const item = /Item:\s*\{[^}]*id:\s*"?(?:minecraft:)?([a-z0-9_]+)"?/.exec(nbt);
    if (item) {
      try {
        this.item = ItemStack.of(item[1]);
        this.recalculateBoundingBox();
      } catch {
        /* no such item: an empty frame */
      }
    }
    const rot = /ItemRotation:\s*(-?\d+)b?/.exec(nbt);
    if (rot) this.rotation = ((Number(rot[1]) % 8) + 8) % 8;
    const chance = /ItemDropChance:\s*(-?[\d.]+)f?/.exec(nbt);
    if (chance) this.dropChance = Number(chance[1]);
    const flag = (k: string) => new RegExp(`${k}:\\s*(1b|true)`).test(nbt);
    this.fixed = flag('Fixed');
    this.invisible = flag('Invisible');
    this.invulnerable = flag('Invulnerable');
  }
}

/** a player in creative mode (vanilla DamageSource.isCreativePlayer / Player.hasInfiniteMaterials) */
function isCreative(e: Entity | null | undefined): boolean {
  return (e as { gameMode?: string } | null | undefined)?.gameMode === 'creative';
}

/**
 * vanilla HangingEntityItem.useOn for the two frames: onto any face of the clicked block (not in adventure mode), if
 * it can hang there; placed, it plays its sound and one is used (none in creative). One that can't hang there spends
 * the click and nothing else happens
 */
for (const type of ['item_frame', 'glow_item_frame'] as const) {
  registerItemBehavior(type, {
    useOn(level, p, _stack, h) {
      if (p.gameMode === 'adventure') return 'fail';
      const d = h.face as Dir;
      const x = h.x + DX[d], y = h.y + DY[d], z = h.z + DZ[d];
      if (y < level.world.dim.minY || y >= level.world.dim.maxY) return 'fail';
      const frame = new ItemFrame(level, type, x, y, z, d);
      if (!frame.survives()) return 'fail';
      frame.playSound(frame.placeSound());
      level.addEntity(frame);
      // (vanilla HangingEntityItem.useOn: ENTITY_PLACE where it hangs)
      level.gameEvent?.('entity_place', frame.x, frame.y, frame.z, { entity: p });
      if (p.gameMode !== 'creative') p.inventory.consumeSelected(1);
      p.swing();
      return 'success';
    },
  });
}

