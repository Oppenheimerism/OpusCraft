// Boats (vanilla Boat / ChestBoat, 1.21): floating on the water level, sinking when swamped,
// block friction on land (ice!), air drag, rowing with the movement keys and the vanilla
// turning momentum, two seats (one in a chest boat) with the passenger turn clamp, scooping
// up mobs, the hurt wobble and breaking, the fall that splits it into planks and sticks,
// getting off beside it, and the chest boat's 27-slot container.

import { Entity } from './entity';
import { LivingEntity } from './living';
import { ItemEntity } from './itemEntity';
import { Animal } from './animals';
import { WaterAnimal } from './water';
import type { Level } from '../game/level';
import type { Player } from './player';
import type { SavedEntity } from './mob';
import { AABB } from '../core/aabb';
import { wrapDegrees } from '../core/math';
import { BLOCKS, STATE_BLOCK, FLAGS, F_WATER, COLLISION } from '../world/block';
import { fluidHeight, FLUID_WATER } from '../world/fluids';
import { WOODS } from '../world/blocksExtra';
import { ItemStack, ITEMS, ItemTag, cloneTag } from '../item/item';
import { SimpleContainer } from '../inventory/container';
import { fillContainer } from '../game/loot';
import { raycast } from '../game/raycast';
import { blockFree, floorHeight } from './dismount';

/** vanilla Boat.Type, the woods the game has (no bamboo raft without bamboo planks) */
export const BOAT_WOODS: readonly string[] = WOODS;

export type BoatStatus = 'in_water' | 'under_water' | 'under_flowing_water' | 'on_land' | 'in_air';

const f32 = Math.fround;
const DEG = Math.PI / 180;
/** vanilla PADDLE_SPEED, PADDLE_SOUND_TIME and a full turn, as the floats Boat does its paddle maths in */
const PADDLE_SPEED = f32(Math.PI / 8), PADDLE_SOUND_TIME = f32(Math.PI / 4), PADDLE_TURN = f32(Math.PI * 2);

/** a water fluid state that is a source (vanilla FluidState.isSource): still water, waterlogged blocks, water plants */
function isWaterSource(st: number): boolean {
  const b = BLOCKS[STATE_BLOCK[st]];
  return !(b.s.fluid === 'water' && b.propIndex('level') >= 0 && b.get<number>(st, 'level') !== 0);
}


export class Boat extends Entity {
  readonly type: string = 'boat';
  /** vanilla DATA_ID_TYPE (saved as "Type") */
  variant = 'oak';
  /** vanilla VehicleEntity DATA_ID_HURT / HURTDIR / DAMAGE */
  hurtTime = 0;
  hurtDir = 1;
  damage = 0;
  private paddleLeft = false;
  private paddleRight = false;
  /** vanilla paddlePositions: each paddle's stroke angle, a sixteenth of a turn per tick */
  readonly paddlePositions = [0, 0];
  private invFriction = 0;
  outOfControlTicks = 0;
  deltaRotation = 0;
  private inputLeft = false;
  private inputRight = false;
  private inputUp = false;
  private inputDown = false;
  private waterLevel = 0;
  private landFriction = 0;
  status: BoatStatus | null = null;
  private oldStatus: BoatStatus | null = null;
  private lastYd = 0;
  /** vanilla bubble column riding (set by a bubble column under the boat) */
  private aboveBubbleColumn = false;
  private bubbleColumnDown = false;
  private bubbleTime = 0;
  private bubbleMultiplier = 0;
  bubbleAngle = 0;
  bubbleAngleO = 0;

  constructor(level: Level) {
    super(level);
    this.setSize(1.375, 0.5625);
  }

  /** vanilla Boat.getEyeHeight: the top of the boat */
  override get eyeHeight(): number {
    return this.height;
  }

  /** vanilla Boat.getDropItem */
  dropItem(): string {
    return `${this.variant}_boat`;
  }

  /** vanilla Boat.getTypeName: the item's name ("Oak Boat", "Oak Boat with Chest") */
  displayName(): string {
    return ITEMS.get(this.dropItem())?.name ?? 'Boat';
  }

  override pickResult(): string {
    return this.dropItem();
  }

  override isPickable(): boolean {
    return !this.removed;
  }

  override isPushable(): boolean {
    return true;
  }

  /** vanilla Boat.canBeCollidedWith: solid, you can stand on it */
  override canBeCollidedWith(): boolean {
    return true;
  }

  /** vanilla Boat.getMovementEmission: EVENTS (no step sounds, but its going is heard by sculk) */
  protected override emitsMovementEvents(): boolean {
    return true;
  }

  /** vanilla Boat.canVehicleCollide: blocked by solid and pushable entities, never by its own riders */
  protected override entityCollisions(box: AABB, out: AABB[]): void {
    for (const e of this.level.getEntities(box.inflate(1e-7), (e) => (e.canBeCollidedWith() || e.isPushable()) && !e.noPhysics && !this.isPassengerOfSameVehicle(e), this)) out.push(e.bb);
  }

  /** vanilla Boat.push(Entity): boats bump boats at their level; others only from below the bottom */
  override pushAgainst(e: Entity): void {
    if (e instanceof Boat) {
      if (e.bb.minY < this.bb.maxY) super.pushAgainst(e);
    } else if (e.bb.minY <= this.bb.minY) super.pushAgainst(e);
  }

  /** vanilla Boat.isUnderWater */
  isUnderWater(): boolean {
    return this.status === 'under_water' || this.status === 'under_flowing_water';
  }

  /** vanilla Entity.updateInWaterStateAndDoWaterCurrentPushing: riders of a boat above the water stay dry */
  override keepsRidersDry(): boolean {
    return !this.isUnderWater();
  }

  // --- passengers (vanilla getPassengerAttachmentPoint / positionRider / clampRotation) ---

  maxPassengers(): number {
    return 2;
  }

  protected singlePassengerXOffset(): number {
    return 0;
  }

  /** vanilla Boat.canAddPassenger: a free seat, and the boat not sunk */
  override canAddPassenger(_p: Entity): boolean {
    return this.passengers.length < this.maxPassengers() && this.eyeFluid !== FLUID_WATER;
  }

  /** vanilla hasEnoughSpaceFor: narrower than the boat */
  hasEnoughSpaceFor(e: Entity): boolean {
    return e.width < this.width;
  }

  override passengerAttachmentY(): number {
    return this.height / 3;
  }

  override positionRider(p: Entity): void {
    // the front seat 0.2 forward, the back seat 0.6 back (animals sit 0.2 further forward)
    let f = this.singlePassengerXOffset();
    if (this.passengers.length > 1) {
      f = this.passengers.indexOf(p) === 0 ? 0.2 : -0.6;
      if (p instanceof Animal) f += 0.2;
    }
    const r = this.yaw * DEG;
    p.setPos(this.x - f * Math.sin(r), this.y + this.passengerAttachmentY() - p.vehicleAttachmentY(), this.z + f * Math.cos(r));
    // riders turn with the boat, and can't look more than 105 degrees away from its heading
    p.yaw += this.deltaRotation;
    if (p instanceof LivingEntity) p.headYaw += this.deltaRotation;
    this.clampRotation(p);
    if (p instanceof Animal && this.passengers.length === this.maxPassengers()) {
      const i = p.id % 2 === 0 ? 90 : 270;
      p.bodyYaw += i;
      p.headYaw += i;
    }
  }

  protected clampRotation(e: Entity): void {
    if (e instanceof LivingEntity) e.bodyYaw = this.yaw;
    const f = wrapDegrees(e.yaw - this.yaw);
    const f1 = Math.max(-105, Math.min(105, f));
    e.yawO += f1 - f;
    e.yaw += f1 - f;
    if (e instanceof LivingEntity) e.headYaw = e.yaw;
  }

  /** vanilla Boat.onPassengerTurned: mouse look is clamped as well */
  override onPassengerTurned(p: Entity): void {
    this.clampRotation(p);
  }

  /** vanilla Boat.setInput (from LocalPlayer.rideTick) */
  setInput(left: boolean, right: boolean, up: boolean, down: boolean): void {
    this.inputLeft = left;
    this.inputRight = right;
    this.inputUp = up;
    this.inputDown = down;
  }

  /**
   * vanilla Boat.getDismountLocationForPassenger: out over the side the rider is looking at, on the
   * floor there or one block down, standing or else crouching; not into water; else on top of the boat
   */
  override dismountLocation(p: Entity): [number, number, number] {
    if (!(p instanceof LivingEntity)) return super.dismountLocation(p);
    const d = (this.width * Math.SQRT2 + p.width + f32(1e-5)) / 2;
    const r = p.yaw * DEG;
    const fx = -Math.sin(r), fz = Math.cos(r), m = Math.max(Math.abs(fx), Math.abs(fz));
    const d0 = this.x + (fx * d) / m, d1 = this.z + (fz * d) / m;
    const bx = Math.floor(d0), by = Math.floor(this.bb.maxY), bz = Math.floor(d1);
    if (!(FLAGS[this.level.getState(bx, by - 1, bz)] & F_WATER)) {
      const spots: [number, number, number][] = [];
      const d2 = floorHeight(this.level, bx, by, bz);
      if (isFinite(d2) && d2 < 1) spots.push([d0, by + d2, d1]);
      const d3 = floorHeight(this.level, bx, by - 1, bz);
      if (isFinite(d3) && d3 < 1) spots.push([d0, by - 1 + d3, d1]);
      for (const h of p.dismountHeights())
        for (const s of spots) {
          const hw = p.width / 2;
          if (!blockFree(this.level, new AABB(s[0] - hw, s[1], s[2] - hw, s[0] + hw, s[1] + h, s[2] + hw))) continue;
          p.setDismountHeight(h);
          return s;
        }
    }
    return super.dismountLocation(p);
  }

  /** vanilla Boat.interact: climb in unless sneaking or swamped for too long */
  interact(p: Player): 'mounted' | 'container' | null {
    if (p.isShiftKeyDown() || this.outOfControlTicks >= 60) return null;
    if (!p.startRiding(this)) return null;
    // vanilla ClientPacketListener.handleSetEntityPassengersPacket: boarding turns you the boat's way
    p.yaw = p.yawO = p.headYaw = this.yaw;
    return 'mounted';
  }

  // --- tick ---

  override tick(): void {
    this.oldStatus = this.status;
    this.status = this.getStatus();
    if (this.status !== 'under_water' && this.status !== 'under_flowing_water') this.outOfControlTicks = 0;
    else this.outOfControlTicks++;
    // three seconds under water throws everyone out
    if (this.outOfControlTicks >= 60) this.ejectPassengers();
    if (this.hurtTime > 0) this.hurtTime--;
    if (this.damage > 0) this.damage--;
    super.tick();
    if (this.removed) return;
    const first = this.passengers[0];
    const player = first?.type === 'player';
    if (!player) this.setPaddleState(false, false);
    this.floatBoat();
    if (player) this.controlBoat();
    this.move(this.dx, this.dy, this.dz);
    if (this.removed) return;
    this.tickBubbleColumn();
    for (let i = 0; i <= 1; i++) {
      if (this.getPaddleState(i)) {
        const pos = this.paddlePositions[i];
        if (pos % PADDLE_TURN <= PADDLE_SOUND_TIME && f32(pos + PADDLE_SPEED) % PADDLE_TURN >= PADDLE_SOUND_TIME) {
          const s = this.paddleSound();
          if (s) {
            // on that paddle's side of the boat
            const r = this.yaw * DEG, vx = -Math.sin(r), vz = Math.cos(r);
            const d0 = i === 1 ? -vz : vz, d1 = i === 1 ? vx : -vx;
            this.level.sound.play(s, this.x + d0, this.y, this.z + d1, 1, 0.8 + 0.4 * Math.random());
          }
        }
        this.paddlePositions[i] = f32(pos + PADDLE_SPEED);
      } else this.paddlePositions[i] = 0;
    }
    this.checkInsideBlocks();
    this.breakLilyPads();
    if (this.removed) return;
    const near = this.level.getEntities(this.bb.inflate(0.2, -0.01, 0.2), (e) => e.isPushable() && !e.noPhysics, this);
    if (near.length) {
      // an empty boat (or one a mob steers) takes aboard the mobs that bump into it
      const pickUp = !player;
      for (const e of near) {
        if (e.passengers.includes(this)) continue;
        if (pickUp && this.passengers.length < this.maxPassengers() && !e.vehicle && this.hasEnoughSpaceFor(e) && e instanceof LivingEntity && !(e instanceof WaterAnimal) && e.type !== 'player') e.startRiding(this);
        else this.pushAgainst(e);
      }
    }
  }

  /** vanilla WaterlilyBlock.entityInside: boats plough through lily pads */
  private breakLilyPads(): void {
    const b = this.bb, w = this.level.world;
    const x0 = Math.floor(b.minX + 1e-7), y0 = Math.floor(b.minY + 1e-7), z0 = Math.floor(b.minZ + 1e-7);
    const x1 = Math.floor(b.maxX - 1e-7), y1 = Math.floor(b.maxY - 1e-7), z1 = Math.floor(b.maxZ - 1e-7);
    for (let x = x0; x <= x1; x++)
      for (let y = y0; y <= y1; y++)
        for (let z = z0; z <= z1; z++) if (BLOCKS[STATE_BLOCK[w.getState(x, y, z)]].name === 'lily_pad') this.level.destroyBlock(x, y, z, true, null, true, null, this);
  }

  setPaddleState(left: boolean, right: boolean): void {
    this.paddleLeft = left;
    this.paddleRight = right;
  }

  /** vanilla Boat.getPaddleState: rowing on that side (0 left, 1 right) with someone at the helm */
  getPaddleState(side: number): boolean {
    return (side === 0 ? this.paddleLeft : this.paddleRight) && this.passengers[0] instanceof LivingEntity;
  }

  /** vanilla Boat.getRowingTime: the paddle's stroke angle between last tick and this one */
  getRowingTime(side: number, partial: number): number {
    if (!this.getPaddleState(side)) return 0;
    const b = this.paddlePositions[side], a = b - PADDLE_SPEED;
    return partial < 0 ? a : partial > 1 ? b : a + (b - a) * partial;
  }

  /** vanilla Boat.getPaddleSound */
  private paddleSound(): string | null {
    switch (this.getStatus()) {
      case 'in_water':
      case 'under_water':
      case 'under_flowing_water':
        return 'entity.boat.paddle_water';
      case 'on_land':
        return 'entity.boat.paddle_land';
      default:
        return null;
    }
  }

  /** vanilla Boat.getStatus */
  private getStatus(): BoatStatus {
    const s = this.isUnderwaterStatus();
    if (s) {
      this.waterLevel = this.bb.maxY;
      return s;
    }
    if (this.checkInWater()) return 'in_water';
    const f = this.getGroundFriction();
    if (f > 0) {
      this.landFriction = f;
      return 'on_land';
    }
    return 'in_air';
  }

  /** vanilla Boat.getWaterLevelAbove: the surface above the boat (a column full to the top counts on up) */
  private getWaterLevelAbove(): number {
    const b = this.bb, w = this.level.world;
    const i = Math.floor(b.minX), j = Math.ceil(b.maxX), k = Math.floor(b.maxY), l = Math.ceil(b.maxY - this.lastYd);
    const i1 = Math.floor(b.minZ), j1 = Math.ceil(b.maxZ);
    rows: for (let k1 = k; k1 < l; k1++) {
      let f = 0;
      for (let x = i; x < j; x++)
        for (let z = i1; z < j1; z++) {
          f = Math.max(f, fluidHeight(w, x, k1, z, FLUID_WATER));
          if (f >= 1) continue rows;
        }
      if (f < 1) return k1 + f;
    }
    return l + 1;
  }

  /** vanilla Boat.getGroundFriction: the average friction of the blocks touching the boat's bottom */
  getGroundFriction(): number {
    const b = this.bb, w = this.level.world;
    const box = new AABB(b.minX, b.minY - 0.001, b.minZ, b.maxX, b.minY, b.maxZ);
    const i = Math.floor(box.minX) - 1, j = Math.ceil(box.maxX) + 1, k = Math.floor(box.minY) - 1, l = Math.ceil(box.maxY) + 1;
    const i1 = Math.floor(box.minZ) - 1, j1 = Math.ceil(box.maxZ) + 1;
    let f = 0, n = 0;
    for (let x = i; x < j; x++)
      for (let z = i1; z < j1; z++) {
        const edges = (x !== i && x !== j - 1 ? 0 : 1) + (z !== i1 && z !== j1 - 1 ? 0 : 1);
        if (edges === 2) continue;
        for (let y = k; y < l; y++) {
          if (edges > 0 && (y === k || y === l - 1)) continue;
          const st = w.getState(x, y, z);
          const boxes = COLLISION[st];
          if (!boxes) continue;
          const blk = BLOCKS[STATE_BLOCK[st]];
          if (blk.name === 'lily_pad') continue;
          for (const c of boxes)
            if (box.intersectsRaw(x + c[0], y + c[1], z + c[2], x + c[3], y + c[4], z + c[5])) {
              f = f32(f + f32(blk.friction));
              n++;
              break;
            }
        }
      }
    return f32(f / n);
  }

  /** vanilla Boat.checkInWater: water around the bottom; records the highest surface */
  private checkInWater(): boolean {
    const b = this.bb, w = this.level.world;
    const i = Math.floor(b.minX), j = Math.ceil(b.maxX), k = Math.floor(b.minY), l = Math.ceil(b.minY + 0.001);
    const i1 = Math.floor(b.minZ), j1 = Math.ceil(b.maxZ);
    let flag = false;
    this.waterLevel = -Number.MAX_VALUE;
    for (let x = i; x < j; x++)
      for (let y = k; y < l; y++)
        for (let z = i1; z < j1; z++) {
          if (!(FLAGS[w.getState(x, y, z)] & F_WATER)) continue;
          const f = y + fluidHeight(w, x, y, z, FLUID_WATER);
          this.waterLevel = Math.max(f, this.waterLevel);
          flag ||= b.minY < f;
        }
    return flag;
  }

  /** vanilla Boat.isUnderwater: water over the top of the boat (flowing water counts first) */
  private isUnderwaterStatus(): BoatStatus | null {
    const b = this.bb, w = this.level.world;
    const d0 = b.maxY + 0.001;
    const i = Math.floor(b.minX), j = Math.ceil(b.maxX), k = Math.floor(b.maxY), l = Math.ceil(d0);
    const i1 = Math.floor(b.minZ), j1 = Math.ceil(b.maxZ);
    let flag = false;
    for (let x = i; x < j; x++)
      for (let y = k; y < l; y++)
        for (let z = i1; z < j1; z++) {
          const st = w.getState(x, y, z);
          if (!(FLAGS[st] & F_WATER) || !(d0 < y + fluidHeight(w, x, y, z, FLUID_WATER))) continue;
          if (!isWaterSource(st)) return 'under_flowing_water';
          flag = true;
        }
    return flag ? 'under_water' : null;
  }

  /** vanilla Boat.floatBoat: buoyancy towards the surface, drag per status, gravity 0.04 */
  private floatBoat(): void {
    let d1 = -0.04, d2 = 0;
    this.invFriction = f32(0.05);
    if (this.oldStatus === 'in_air' && this.status !== 'in_air' && this.status !== 'on_land') {
      // dropped into water: settle straight onto the surface
      this.waterLevel = this.y + this.height;
      this.setPos(this.x, this.getWaterLevelAbove() - this.height + 0.101, this.z);
      this.dy = 0;
      this.lastYd = 0;
      this.status = 'in_water';
      return;
    }
    if (this.status === 'in_water') {
      d2 = (this.waterLevel - this.y) / this.height;
      this.invFriction = f32(0.9);
    } else if (this.status === 'under_flowing_water') {
      d1 = -7.0e-4;
      this.invFriction = f32(0.9);
    } else if (this.status === 'under_water') {
      d2 = f32(0.01);
      this.invFriction = f32(0.45);
    } else if (this.status === 'in_air') {
      this.invFriction = f32(0.9);
    } else if (this.status === 'on_land') {
      this.invFriction = this.landFriction;
      if (this.passengers[0]?.type === 'player') this.landFriction = f32(this.landFriction / 2);
    }
    this.dx *= this.invFriction;
    this.dy += d1;
    this.dz *= this.invFriction;
    this.deltaRotation = f32(this.deltaRotation * this.invFriction);
    if (d2 > 0) this.dy = (this.dy + d2 * (0.04 / 0.65)) * 0.75;
  }

  /** vanilla Boat.controlBoat: A/D turn (momentum, a little push when only turning), W rows, S backs */
  private controlBoat(): void {
    if (!this.isVehicle()) return;
    let f = 0;
    if (this.inputLeft) this.deltaRotation--;
    if (this.inputRight) this.deltaRotation++;
    if (this.inputRight !== this.inputLeft && !this.inputUp && !this.inputDown) f = f32(f + f32(0.005));
    this.yaw = f32(this.yaw + this.deltaRotation);
    if (this.inputUp) f = f32(f + f32(0.04));
    if (this.inputDown) f = f32(f - f32(0.005));
    const r = f32(this.yaw * f32(DEG));
    this.dx += f32(Math.sin(-r) * f);
    this.dz += f32(Math.cos(r) * f);
    this.setPaddleState((this.inputRight && !this.inputLeft) || this.inputUp, (this.inputLeft && !this.inputRight) || this.inputUp);
  }

  /** vanilla Boat.onAboveBubbleCol (a bubble column under the boat) */
  onAboveBubbleCol(down: boolean): void {
    this.aboveBubbleColumn = true;
    this.bubbleColumnDown = down;
    if (this.bubbleTime === 0) this.bubbleTime = 60;
    this.level.particles.spawn?.('splash', this.x + Math.random(), this.y + 0.7, this.z + Math.random(), 0, 0, 0);
    if (Math.random() < 0.05) this.level.sound.play('entity.generic.splash', this.x, this.y, this.z, 1, 0.8 + 0.4 * Math.random());
  }

  /** vanilla Boat.tickBubbleColumn: the rocking, then a launch up (or a pull down) after three seconds */
  private tickBubbleColumn(): void {
    this.bubbleMultiplier = Math.max(0, Math.min(1, this.bubbleMultiplier + (this.bubbleTime > 0 ? 0.05 : -0.1)));
    this.bubbleAngleO = this.bubbleAngle;
    this.bubbleAngle = 10 * Math.sin(0.5 * this.level.gameTime) * this.bubbleMultiplier;
    if (!this.aboveBubbleColumn) this.bubbleTime = 0;
    let k = this.bubbleTime;
    if (k > 0) {
      this.bubbleTime = --k;
      if (60 - k - 1 > 0 && k === 0) {
        this.bubbleTime = 0;
        if (this.bubbleColumnDown) {
          this.dy += -0.7;
          this.ejectPassengers();
        } else this.dy = this.passengers.some((p) => p.type === 'player') ? 2.7 : 0.6;
      }
      this.aboveBubbleColumn = false;
    }
  }

  /**
   * vanilla Boat.checkFallDamage: over land a fall of more than 3 blocks hurts the riders and
   * splits the boat into 3 planks and 2 sticks; water breaks the fall
   */
  protected override checkFallDamage(dy: number, onGround: boolean): void {
    this.lastYd = this.dy;
    if (this.vehicle) return;
    if (onGround) {
      if (this.fallDistance > 3) {
        if (this.status !== 'on_land') {
          this.fallDistance = 0;
          return;
        }
        this.causeFallDamage(this.fallDistance);
        if (!this.removed) {
          this.kill();
          if (this.level.gameRules.doEntityDrops) {
            for (let i = 0; i < 3; i++) this.spawnAtLocation(`${this.variant}_planks`);
            for (let i = 0; i < 2; i++) this.spawnAtLocation('stick');
          }
        }
      }
      this.fallDistance = 0;
    } else if (!(FLAGS[this.level.getState(Math.floor(this.x), Math.floor(this.y) - 1, Math.floor(this.z))] & F_WATER) && dy < 0) {
      this.fallDistance -= dy;
    }
  }

  // --- damage (vanilla VehicleEntity) ---

  /**
   * vanilla VehicleEntity.hurt: every hit wobbles the boat and adds ten times its damage (wearing
   * off a point a tick); past 40 it breaks. A creative player's hit removes it, dropping nothing.
   */
  override hurt(amount: number, _source: string, attacker?: Entity | null): boolean {
    if (this.removed) return true;
    this.hurtDir = -this.hurtDir;
    this.hurtTime = 10;
    this.damage += amount * 10;
    this.level.gameEvent?.('entity_damage', this.x, this.y, this.z, { entity: attacker ?? null });
    if (attacker?.type === 'player' && (attacker as Player).gameMode === 'creative') this.discard();
    else if (this.damage > 40) this.destroy();
    return true;
  }

  /** vanilla VehicleEntity.destroy: killed, dropping itself as an item */
  destroy(): void {
    this.kill();
    if (this.level.gameRules.doEntityDrops) this.spawnAtLocation(this.dropItem());
  }

  /** vanilla Entity.discard */
  discard(): void {
    this.remove();
  }

  /** vanilla Entity.spawnAtLocation */
  protected spawnAtLocation(id: string): void {
    const it = ITEMS.get(id);
    if (!it) return;
    const e = new ItemEntity(this.level, new ItemStack(it, 1));
    e.moveTo(this.x, this.y, this.z, Math.random() * 360, 0);
    e.dx = Math.random() * 0.2 - 0.1;
    e.dy = 0.2;
    e.dz = Math.random() * 0.2 - 0.1;
    e.pickupDelay = 10;
    this.level.addEntity(e);
  }

  // --- saving ---

  save(): SavedEntity {
    return { id: this.type, x: this.x, y: this.y, z: this.z, yaw: this.yaw, pitch: this.pitch, dx: this.dx, dy: this.dy, dz: this.dz, health: 0, fire: this.remainingFireTicks, data: { Type: this.variant, ...this.saveExtra() } };
  }

  load(d: SavedEntity): void {
    this.moveTo(d.x, d.y, d.z, d.yaw, d.pitch);
    this.dx = d.dx;
    this.dy = d.dy;
    this.dz = d.dz;
    this.remainingFireTicks = d.fire ?? 0;
    const t = String(d.data?.Type ?? 'oak');
    this.variant = BOAT_WOODS.includes(t) ? t : 'oak';
    if (d.data) this.loadExtra(d.data);
  }

  protected saveExtra(): Record<string, number | string | boolean> {
    return {};
  }

  protected loadExtra(_d: Record<string, number | string | boolean>): void {}
}

/** vanilla ChestBoat: one seat, and a 27-slot chest in the back */
export class ChestBoat extends Boat {
  override readonly type: string = 'chest_boat';
  readonly container = new SimpleContainer(27);
  /** vanilla LootTable / LootTableSeed: rolled when first opened or broken */
  lootTable: string | null = null;
  lootSeed = 0;

  override dropItem(): string {
    return `${this.variant}_chest_boat`;
  }

  override maxPassengers(): number {
    return 1;
  }

  /** vanilla ChestBoat.getSinglePassengerXOffset: the seat is in front of the chest */
  protected override singlePassengerXOffset(): number {
    return 0.15;
  }

  /** vanilla ChestBoat.interact: sneaking (or a full seat) opens the chest instead */
  override interact(p: Player): 'mounted' | 'container' | null {
    if (this.canAddPassenger(p) && !p.isShiftKeyDown()) return super.interact(p);
    return 'container';
  }

  /** vanilla ContainerEntity.unpackChestVehicleLootTable (seed 0 = a random roll) */
  unpackLoot(): void {
    if (!this.lootTable) return;
    const table = this.lootTable;
    this.lootTable = null;
    fillContainer(this.container, table, this.lootSeed || (Math.random() * 0x100000000) >>> 0);
  }

  /** vanilla isChestVehicleStillValid: within interaction range + 4 of the eyes */
  containerStillValid(p: Player): boolean {
    if (this.removed) return false;
    const ex = p.x, ey = p.y + p.eyeHeight, ez = p.z, b = this.bb;
    const dx = Math.max(b.minX - ex, 0, ex - b.maxX), dy = Math.max(b.minY - ey, 0, ey - b.maxY), dz = Math.max(b.minZ - ez, 0, ez - b.maxZ);
    const r = (p.gameMode === 'creative' ? 5 : 3) + 4;
    return dx * dx + dy * dy + dz * dz < r * r;
  }

  /** vanilla ChestBoat.remove(KILLED / DISCARDED): the contents spill out (Containers.dropContents) */
  private spill(): void {
    this.unpackLoot();
    const x = Math.floor(this.x), y = Math.floor(this.y), z = Math.floor(this.z);
    for (const s of this.container.removeAll()) this.level.dropStackAt(x, y, z, s);
  }

  override kill(): void {
    this.spill();
    super.kill();
  }

  override discard(): void {
    this.spill();
    super.discard();
  }

  protected override saveExtra(): Record<string, number | string | boolean> {
    // vanilla addChestVehicleSaveData: a pending loot table instead of the items
    if (this.lootTable) return { lootTable: this.lootTable, lootSeed: this.lootSeed };
    const items: [number, string, number, number, ItemTag?][] = [];
    this.container.items.forEach((s, i) => {
      if (s && s.count > 0) items.push(s.tag ? [i, s.item.id, s.count, s.damage, cloneTag(s.tag)!] : [i, s.item.id, s.count, s.damage]);
    });
    return { items: JSON.stringify(items) };
  }

  protected override loadExtra(d: Record<string, number | string | boolean>): void {
    if (typeof d.lootTable === 'string') {
      this.lootTable = d.lootTable;
      this.lootSeed = Number(d.lootSeed ?? 0);
    }
    if (typeof d.items === 'string') {
      for (const [i, id, n, dmg, tag] of JSON.parse(d.items) as [number, string, number, number, ItemTag?][]) {
        const it = ITEMS.get(id);
        if (it && i < this.container.size) this.container.items[i] = new ItemStack(it, n, dmg, cloneTag(tag ?? null));
      }
    }
  }
}

export const BOAT_TYPES = ['boat', 'chest_boat'];

/** a boat entity by entity id (vanilla EntityType.BOAT / CHEST_BOAT; the wood is data) */
export function createBoat(type: string, level: Level, variant = 'oak'): Boat | null {
  const b = type === 'boat' ? new Boat(level) : type === 'chest_boat' ? new ChestBoat(level) : null;
  if (b) b.variant = variant;
  return b;
}

/** the wood and kind of a boat item id ("spruce_chest_boat"), or null */
export function boatItemInfo(id: string): { variant: string; chest: boolean } | null {
  const m = /^(.+?)(_chest)?_boat$/.exec(id);
  return m && BOAT_WOODS.includes(m[1]) ? { variant: m[1], chest: !!m[2] } : null;
}

/**
 * vanilla BoatItem.use: a boat where the eye ray first meets a block or any fluid, facing the
 * player's way; nothing if the ray misses or the eyes are inside an entity, and it must fit there.
 * Returns true if a boat was placed.
 */
export function useBoatItem(level: Level, p: Player, itemId: string, reach: number): boolean {
  const info = boatItemInfo(itemId);
  if (!info) return false;
  const pr = p.pitch * DEG, yr = p.yaw * DEG;
  const dx = -Math.sin(yr) * Math.cos(pr), dy = -Math.sin(pr), dz = Math.cos(yr) * Math.cos(pr);
  const ex = p.x, ey = p.y + p.eyeHeight, ez = p.z;
  const hit = raycast(level.world, ex, ey, ez, dx, dy, dz, reach, true);
  if (!hit) return false;
  const around = p.bb.expandTowards(dx * 5, dy * 5, dz * 5).inflate(1);
  for (const e of level.getEntities(around, (e) => e.isPickable() && !e.noPhysics, p)) if (e.bb.inflate(e.pickRadius()).contains(ex, ey, ez)) return false;
  const boat = createBoat(info.chest ? 'chest_boat' : 'boat', level, info.variant)!;
  boat.moveTo(hit.hx, hit.hy, hit.hz, p.yaw, 0);
  if (boat.collisionBoxes(boat.bb).length) return false;
  level.addEntity(boat);
  // (vanilla BoatItem.use: ENTITY_PLACE where the eye ray met the world)
  level.gameEvent?.('entity_place', hit.hx, hit.hy, hit.hz, { entity: p });
  return true;
}
