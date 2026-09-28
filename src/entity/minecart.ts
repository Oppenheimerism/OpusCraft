// Minecarts (vanilla AbstractMinecart / Minecart / MinecartChest with the default,
// non-experimental physics): following the rail's centre line on straights,
// slopes and curves (a corner is cut as a diagonal chord), slope pull, friction
// and the 8 m/s cap, rolling off the end of the track, bumping into and pushing
// entities and other carts, scooping up mobs, riding, the hurt wobble, breaking.
// ((minecarts) a powered rail speeds a cart up, or brakes it to a stop when it's
// off; an activator rail tells the cart on it whether it's powered (a rideable
// cart throws out its rider, a TNT cart lights, a hopper cart stops collecting);
// the hopper, TNT and furnace minecarts are entity/minecartVariants.ts's)

import { Entity } from './entity';
import { LivingEntity } from './living';
import { ItemEntity } from './itemEntity';
import type { Level } from '../game/level';
import type { Player } from './player';
import type { SavedEntity } from './mob';
import { AABB } from '../core/aabb';
import { clamp, wrapDegrees } from '../core/math';
import { isRail, railShape, isAscending, RailShape } from '../game/rails';
import { BLOCKS, STATE_BLOCK, FLAGS, F_CLIMBABLE, COLLISION, getBlock } from '../world/block';
import { dirFromYaw, DX, DZ, OPPOSITE, NORTH, SOUTH, WEST, EAST } from '../world/dir';
import { ItemStack, ITEMS, ItemTag, cloneTag } from '../item/item';
import { SimpleContainer } from '../inventory/container';
import { fillContainer } from '../game/loot';
// (minecarts) a powered rail's push off a solid block
import { isConductor } from '../game/redstone/signal';

type Vec3i = [number, number, number];

/** vanilla AbstractMinecart.EXITS: the two block-relative ends of each rail shape */
const EXITS: Record<RailShape, [Vec3i, Vec3i]> = {
  north_south: [[0, 0, -1], [0, 0, 1]],
  east_west: [[-1, 0, 0], [1, 0, 0]],
  ascending_east: [[-1, -1, 0], [1, 0, 0]],
  ascending_west: [[-1, 0, 0], [1, -1, 0]],
  ascending_north: [[0, 0, -1], [0, -1, 1]],
  ascending_south: [[0, -1, -1], [0, 0, 1]],
  south_east: [[0, 0, 1], [1, 0, 0]],
  south_west: [[0, 0, 1], [-1, 0, 0]],
  north_west: [[0, 0, -1], [-1, 0, 0]],
  north_east: [[0, 0, -1], [1, 0, 0]],
};

/** vanilla Direction.getClockWise */
const CLOCKWISE: Record<number, number> = { [NORTH]: EAST, [EAST]: SOUTH, [SOUTH]: WEST, [WEST]: NORTH };

export abstract class AbstractMinecart extends Entity {
  /** vanilla VehicleEntity DATA_ID_HURT / HURTDIR / DAMAGE: the wobble, and damage that wears off */
  hurtTime = 0;
  hurtDir = 1;
  damage = 0;
  /** vanilla flipped: the cart faces backwards relative to its yaw */
  private flipped = false;
  onRails = false;

  constructor(level: Level) {
    super(level);
    this.setSize(0.98, 0.7);
  }

  /** vanilla getDropItem */
  abstract dropItem(): string;

  /** vanilla getDefaultDisplayBlockState (air = nothing drawn inside) */
  displayState(): number {
    return 0;
  }

  /** vanilla getDefaultDisplayOffset (pixels) */
  displayOffset(): number {
    return 6;
  }

  /** vanilla getMinecartType() == RIDEABLE: only the plain cart scoops up mobs */
  protected picksUpMobs(): boolean {
    return false;
  }

  override isPickable(): boolean {
    return !this.removed;
  }

  override isPushable(): boolean {
    return true;
  }

  override pickResult(): string {
    return this.dropItem();
  }

  /** vanilla EntityType passengerAttachments(0.1875) */
  override passengerAttachmentY(): number {
    return 0.1875;
  }

  /** vanilla getBlockSpeedFactor: rails never slow it */
  override blockSpeedFactor(): number {
    return isRail(this.level.getState(Math.floor(this.x), Math.floor(this.y), Math.floor(this.z))) ? 1 : super.blockSpeedFactor();
  }

  /** vanilla getMaxSpeed: 8 m/s, 4 in water */
  protected maxSpeed(): number {
    return (this.inWater ? 4 : 8) / 20;
  }

  /** vanilla canCollideWith (Boat.canVehicleCollide): stopped by pushable entities, never by its own riders */
  protected override entityCollisions(box: AABB, out: AABB[]): void {
    for (const e of this.level.getEntities(box.inflate(1e-7), (e) => e.isPushable() && !e.noPhysics && !this.isPassengerOfSameVehicle(e), this)) out.push(e.bb);
  }

  /** vanilla AbstractMinecart.getMovementEmission: EVENTS (no step sounds, but its going is heard by sculk) */
  protected override emitsMovementEvents(): boolean {
    return true;
  }

  protected override isOnRails(): boolean {
    return this.onRails;
  }

  override tick(): void {
    // vanilla ServerLevel.tickNonPassenger: old position, then AbstractMinecart.tick (no Entity.baseTick)
    this.xo = this.x;
    this.yo = this.y;
    this.zo = this.z;
    this.yawO = this.yaw;
    this.pitchO = this.pitch;
    this.tickCount++;
    if (this.hurtTime > 0) this.hurtTime--;
    if (this.damage > 0) this.damage--;
    // vanilla checkBelowWorld (64 under the dimension's floor)
    if (this.y < this.level.world.dim.minY - 64) {
      this.remove();
      return;
    }
    this.handlePortal();
    if (this.removed) return;
    // vanilla applyGravity
    this.dy -= this.inWater ? 0.005 : 0.04;
    const w = this.level.world;
    const bx = Math.floor(this.x), bz = Math.floor(this.z);
    let by = Math.floor(this.y);
    if (isRail(w.getState(bx, by - 1, bz))) by--;
    const st = w.getState(bx, by, bz);
    this.onRails = isRail(st);
    if (this.onRails) {
      this.moveAlongTrack(bx, by, bz, st);
      // ((minecarts) vanilla: an activator rail tells the cart on it whether it's powered)
      const rb = BLOCKS[STATE_BLOCK[st]];
      if (rb.name === 'activator_rail') this.activateMinecart(bx, by, bz, !!rb.get(st, 'powered'));
    } else this.comeOffTrack();
    this.checkInsideBlocks();
    if (this.removed) return;
    // yaw follows the direction of travel; a sudden reversal flips the cart instead of spinning it
    this.pitch = 0;
    const d1 = this.xo - this.x, d3 = this.zo - this.z;
    if (d1 * d1 + d3 * d3 > 0.001) {
      this.yaw = (Math.atan2(d3, d1) * 180) / Math.PI;
      if (this.flipped) this.yaw += 180;
    }
    const d4 = wrapDegrees(this.yaw - this.yawO);
    if (d4 < -170 || d4 >= 170) {
      this.yaw += 180;
      this.flipped = !this.flipped;
    }
    this.yaw %= 360;
    const near = this.bb.inflate(0.2, 0, 0.2);
    if (this.picksUpMobs() && this.dx * this.dx + this.dz * this.dz > 0.01) {
      // an empty cart rolling into a mob takes it along; anything else just gets shoved
      for (const e of this.level.getEntities(near, (e) => e.isPushable() && !e.noPhysics, this)) {
        if (e.type !== 'player' && e.type !== 'iron_golem' && !(e instanceof AbstractMinecart) && !this.isVehicle() && !e.vehicle) e.startRiding(this);
        else e.pushAgainst(this);
      }
    } else {
      for (const e of this.level.getEntities(near, undefined, this)) if (!this.passengers.includes(e) && e instanceof AbstractMinecart) e.pushAgainst(this);
    }
    // vanilla updateInWaterStateAndDoFluidPushing, lava
    this.updateFluids();
    if (this.inLava) {
      this.lavaHurt();
      this.fallDistance *= 0.5;
    }
  }

  /** vanilla comeOffTrack: capped speed, halved on the ground, 5% air drag */
  protected comeOffTrack(): void {
    const d0 = this.maxSpeed();
    this.dx = clamp(this.dx, -d0, d0);
    this.dz = clamp(this.dz, -d0, d0);
    if (this.onGround) {
      this.dx *= 0.5;
      this.dy *= 0.5;
      this.dz *= 0.5;
    }
    this.move(this.dx, this.dy, this.dz);
    if (!this.onGround) {
      this.dx *= 0.95;
      this.dy *= 0.95;
      this.dz *= 0.95;
    }
  }

  /** vanilla moveAlongTrack (the rail at bx, by, bz) */
  protected moveAlongTrack(bx: number, by: number, bz: number, st: number): void {
    this.fallDistance = 0;
    let x = this.x, y = this.y, z = this.z;
    const before = this.getPos(x, y, z);
    y = by;
    // ((minecarts) a powered rail: on, it speeds the cart up; off, it brakes it)
    const rb = BLOCKS[STATE_BLOCK[st]];
    let boost = false, brake = false;
    if (rb.name === 'powered_rail') {
      boost = !!rb.get(st, 'powered');
      brake = !boost;
    }
    // slopes pull the cart downhill (a fifth as hard in water)
    let slope = 0.0078125;
    if (this.inWater) slope *= 0.2;
    const shape = railShape(st);
    switch (shape) {
      case 'ascending_east':
        this.dx -= slope;
        y++;
        break;
      case 'ascending_west':
        this.dx += slope;
        y++;
        break;
      case 'ascending_north':
        this.dz += slope;
        y++;
        break;
      case 'ascending_south':
        this.dz -= slope;
        y++;
        break;
    }
    // the speed is kept, the direction set along the rail (whichever way it was going)
    const [e0, e1] = EXITS[shape];
    let d4 = e1[0] - e0[0], d5 = e1[2] - e0[2];
    const d6 = Math.sqrt(d4 * d4 + d5 * d5);
    if (this.dx * d4 + this.dz * d5 < 0) {
      d4 = -d4;
      d5 = -d5;
    }
    const d8 = Math.min(2, Math.sqrt(this.dx * this.dx + this.dz * this.dz));
    this.dx = (d8 * d4) / d6;
    this.dz = (d8 * d5) / d6;
    // a player sitting in a (nearly) stopped cart nudges it the way they walk
    const rider = this.passengers[0];
    if (rider && rider.type === 'player') {
      const [rx, rz] = riderMotion(rider as Player);
      const d9 = rx * rx + rz * rz;
      const d11 = this.dx * this.dx + this.dz * this.dz;
      if (d9 > 1e-4 && d11 < 0.01) {
        this.dx += rx * 0.1;
        this.dz += rz * 0.1;
        brake = false;
      }
    }
    // ((minecarts) vanilla: an unpowered powered rail halves the speed, and stops a slow cart dead)
    if (brake) {
      if (Math.sqrt(this.dx * this.dx + this.dz * this.dz) < 0.03) {
        this.dx = 0;
        this.dy = 0;
        this.dz = 0;
      } else {
        this.dx *= 0.5;
        this.dz *= 0.5;
      }
    }
    // snap onto the line between the rail's two ends
    const d23 = bx + 0.5 + e0[0] * 0.5, d10 = bz + 0.5 + e0[2] * 0.5;
    const d12 = bx + 0.5 + e1[0] * 0.5, d13 = bz + 0.5 + e1[2] * 0.5;
    d4 = d12 - d23;
    d5 = d13 - d10;
    let d14: number;
    if (d4 === 0) d14 = z - bz;
    else if (d5 === 0) d14 = x - bx;
    else d14 = ((x - d23) * d4 + (z - d10) * d5) * 2;
    x = d23 + d4 * d14;
    z = d10 + d5 * d14;
    this.setPos(x, y, z);
    // a rider slows the roll to three quarters
    const d24 = this.isVehicle() ? 0.75 : 1;
    const d25 = this.maxSpeed();
    this.move(clamp(d24 * this.dx, -d25, d25), 0, clamp(d24 * this.dz, -d25, d25));
    // leaving a slope by its low end drops a level
    if (e0[1] !== 0 && Math.floor(this.x) - bx === e0[0] && Math.floor(this.z) - bz === e0[2]) this.setPos(this.x, this.y + e0[1], this.z);
    else if (e1[1] !== 0 && Math.floor(this.x) - bx === e1[0] && Math.floor(this.z) - bz === e1[2]) this.setPos(this.x, this.y + e1[1], this.z);
    this.applyNaturalSlowdown();
    // height lost is speed gained (and the other way round), then sit at the rail's height
    const after = this.getPos(this.x, this.y, this.z);
    if (after && before) {
      const d17 = (before[1] - after[1]) * 0.05;
      const d18 = Math.sqrt(this.dx * this.dx + this.dz * this.dz);
      if (d18 > 0) {
        this.dx *= (d18 + d17) / d18;
        this.dz *= (d18 + d17) / d18;
      }
      this.setPos(this.x, after[1], this.z);
    }
    // into the next block: straight on in the direction it left by
    const j = Math.floor(this.x), i = Math.floor(this.z);
    if (j !== bx || i !== bz) {
      const d26 = Math.sqrt(this.dx * this.dx + this.dz * this.dz);
      this.dx = d26 * (j - bx);
      this.dz = d26 * (i - bz);
    }
    // ((minecarts) vanilla: a powered powered rail adds 0.06 a tick the way the cart goes; a cart at rest on a flat
    // one is pushed off a solid block at either end, away from it)
    if (boost) {
      const d27 = Math.sqrt(this.dx * this.dx + this.dz * this.dz);
      if (d27 > 0.01) {
        this.dx += (this.dx / d27) * 0.06;
        this.dz += (this.dz / d27) * 0.06;
      } else {
        const w = this.level.world, solid = (x1: number, z1: number) => isConductor(w.getState(x1, by, z1));
        if (shape === 'east_west') {
          if (solid(bx - 1, bz)) this.dx = 0.02;
          else if (solid(bx + 1, bz)) this.dx = -0.02;
        } else if (shape === 'north_south') {
          if (solid(bx, bz - 1)) this.dz = 0.02;
          else if (solid(bx, bz + 1)) this.dz = -0.02;
        }
      }
    }
  }

  /**
   * (minecarts) vanilla activateMinecart: the cart is on an activator rail, powered or not (a rideable cart throws
   * out its rider, a TNT cart lights, a hopper cart stops collecting while it's powered)
   */
  activateMinecart(_x: number, _y: number, _z: number, _powered: boolean): void {}

  /** vanilla applyNaturalSlowdown: an empty cart loses 4% a tick, an occupied one 0.3% (5% more in water) */
  protected applyNaturalSlowdown(): void {
    let f = this.isVehicle() ? 0.997 : 0.96;
    if (this.inWater) f *= 0.95;
    this.dx *= f;
    this.dy = 0;
    this.dz *= f;
  }

  /** vanilla AbstractMinecart.getPos: the nearest point on the rail's centre line, at rail height */
  getPos(x: number, y: number, z: number): Vec3i | null {
    const i = Math.floor(x), k = Math.floor(z);
    let j = Math.floor(y);
    const w = this.level.world;
    if (isRail(w.getState(i, j - 1, k))) j--;
    const st = w.getState(i, j, k);
    if (!isRail(st)) return null;
    const [e0, e1] = EXITS[railShape(st)];
    const d0 = i + 0.5 + e0[0] * 0.5, d1 = j + 0.0625 + e0[1] * 0.5, d2 = k + 0.5 + e0[2] * 0.5;
    const d3 = i + 0.5 + e1[0] * 0.5, d4 = j + 0.0625 + e1[1] * 0.5, d5 = k + 0.5 + e1[2] * 0.5;
    const d6 = d3 - d0, d7 = (d4 - d1) * 2, d8 = d5 - d2;
    let d9: number;
    if (d6 === 0) d9 = z - k;
    else if (d8 === 0) d9 = x - i;
    else d9 = ((x - d0) * d6 + (z - d2) * d8) * 2;
    x = d0 + d6 * d9;
    y = d1 + d7 * d9;
    z = d2 + d8 * d9;
    if (d7 < 0) y++;
    else if (d7 > 0) y += 0.5;
    return [x, y, z];
  }

  /** vanilla getPosOffs: getPos a distance along the rail (the renderer's front and back wheels) */
  getPosOffs(x: number, y: number, z: number, offset: number): Vec3i | null {
    const i = Math.floor(x), k = Math.floor(z);
    let j = Math.floor(y);
    const w = this.level.world;
    if (isRail(w.getState(i, j - 1, k))) j--;
    const st = w.getState(i, j, k);
    if (!isRail(st)) return null;
    const shape = railShape(st);
    y = isAscending(shape) ? j + 1 : j;
    const [e0, e1] = EXITS[shape];
    let d0 = e1[0] - e0[0], d1 = e1[2] - e0[2];
    const d2 = Math.sqrt(d0 * d0 + d1 * d1);
    d0 /= d2;
    d1 /= d2;
    x += d0 * offset;
    z += d1 * offset;
    if (e0[1] !== 0 && Math.floor(x) - i === e0[0] && Math.floor(z) - k === e0[2]) y += e0[1];
    else if (e1[1] !== 0 && Math.floor(x) - i === e1[0] && Math.floor(z) - k === e1[2]) y += e1[1];
    return this.getPos(x, y, z);
  }

  /** vanilla AbstractMinecart.push(Entity): nudged by whatever walks into it; carts in line bump each other */
  override pushAgainst(e: Entity): void {
    if (e.noPhysics || this.noPhysics || this.passengers.includes(e)) return;
    let d0 = e.x - this.x, d1 = e.z - this.z;
    let d2 = d0 * d0 + d1 * d1;
    if (d2 < 1e-4) return;
    d2 = Math.sqrt(d2);
    d0 /= d2;
    d1 /= d2;
    const d3 = Math.min(1, 1 / d2);
    d0 *= d3 * 0.1 * 0.5;
    d1 *= d3 * 0.1 * 0.5;
    if (e instanceof AbstractMinecart) {
      // only carts ahead or behind along this one's track (not on a parallel line)
      const ax = e.x - this.x, az = e.z - this.z, l = Math.sqrt(ax * ax + az * az);
      const yr = (this.yaw * Math.PI) / 180;
      if (Math.abs((ax / l) * Math.cos(yr) + (az / l) * Math.sin(yr)) < 0.8) return;
      // both end up with the average speed, pushed apart
      const d7 = (e.dx + this.dx) / 2, d8 = (e.dz + this.dz) / 2;
      this.dx *= 0.2;
      this.dz *= 0.2;
      this.push(d7 - d0, 0, d8 - d1);
      e.dx *= 0.2;
      e.dz *= 0.2;
      e.push(d7 + d0, 0, d8 + d1);
    } else {
      this.push(-d0, 0, -d1);
      e.push(d0 / 4, 0, d1 / 4);
    }
  }

  /**
   * vanilla VehicleEntity.hurt: every hit wobbles the cart and adds ten times its damage (which wears
   * off a point a tick); past 40 it breaks. A creative player's hit removes it, dropping nothing.
   * ((minecarts) and a blow that destroys it outright breaks it whatever its damage: a TNT cart's fire)
   */
  override hurt(amount: number, source: string, attacker?: Entity | null, _direct?: Entity | null): boolean {
    if (this.removed) return true;
    this.hurtDir = -this.hurtDir;
    this.hurtTime = 10;
    this.damage += amount * 10;
    this.level.gameEvent?.('entity_damage', this.x, this.y, this.z, { entity: attacker ?? null });
    const creative = attacker?.type === 'player' && (attacker as Player).gameMode === 'creative';
    if ((creative || !(this.damage > 40)) && !this.shouldSourceDestroy(source)) {
      if (creative) this.discard();
    } else this.destroy(source);
    return true;
  }

  /** (minecarts) vanilla VehicleEntity.shouldSourceDestroy: a kind of blow that breaks it at once (none, but a TNT cart's) */
  protected shouldSourceDestroy(_source: string): boolean {
    return false;
  }

  /** (minecarts) vanilla Entity.discard: gone without dying or dropping itself (a creative player's blow) */
  discard(): void {
    this.remove();
  }

  /** vanilla VehicleEntity.destroy: killed, dropping itself as an item ((minecarts) `source`: what broke it) */
  destroy(_source?: string): void {
    this.kill();
    if (this.level.gameRules.doEntityDrops) {
      // ((minecarts) vanilla VehicleEntity.destroy(Item): its name kept on the item)
      const s = ItemStack.of(this.dropItem());
      if (this.customName !== null) s.tag = { ...(s.tag ?? {}), customName: this.customName };
      // vanilla Entity.spawnAtLocation
      const it = new ItemEntity(this.level, s);
      it.moveTo(this.x, this.y, this.z, Math.random() * 360, 0);
      it.dx = Math.random() * 0.2 - 0.1;
      it.dy = 0.2;
      it.dz = Math.random() * 0.2 - 0.1;
      it.pickupDelay = 10;
      this.level.addEntity(it);
    }
  }

  /** vanilla getMotionDirection: the way the cart faces along the track */
  private motionDirection(): number {
    const d = dirFromYaw(this.yaw);
    return this.flipped ? CLOCKWISE[OPPOSITE[d]] : CLOCKWISE[d];
  }

  /**
   * vanilla AbstractMinecart.getDismountLocationForPassenger: beside the track first (either side,
   * then the diagonals, then behind and ahead), at the cart's level or one up or down, on a floor
   * the rider fits on standing (or crouching); failing that, on top of the cart.
   */
  override dismountLocation(p: Entity): [number, number, number] {
    const d = this.motionDirection();
    const d1 = CLOCKWISE[d], d2 = OPPOSITE[d1], d3 = OPPOSITE[d];
    // vanilla DismountHelper.offsetsForDirection
    const offsets = [
      [DX[d1], DZ[d1]], [DX[d2], DZ[d2]],
      [DX[d3] + DX[d1], DZ[d3] + DZ[d1]], [DX[d3] + DX[d2], DZ[d3] + DZ[d2]],
      [DX[d] + DX[d1], DZ[d] + DZ[d1]], [DX[d] + DX[d2], DZ[d] + DZ[d2]],
      [DX[d3], DZ[d3]], [DX[d], DZ[d]],
    ];
    const bx = Math.floor(this.x), by = Math.floor(this.y), bz = Math.floor(this.z);
    const f = Math.min(p.width, 1) / 2;
    for (const h of p instanceof LivingEntity ? p.dismountHeights() : [p.height])
      for (const oy of [0, 1, -1])
        for (const [ox, oz] of offsets) {
          const x = bx + ox, y = by + oy, z = bz + oz;
          const floor = floorHeight(this.level, x, y, z);
          if (!isFinite(floor) || floor >= 1) continue;
          const px = x + 0.5, py = y + floor, pz = z + 0.5;
          if (p.collisionBoxes(new AABB(px - f, py, pz - f, px + f, py + h, pz + f)).length) continue;
          if (p instanceof LivingEntity) p.setDismountHeight(h);
          return [px, py, pz];
        }
    return super.dismountLocation(p);
  }

  save(): SavedEntity {
    return { id: this.type, x: this.x, y: this.y, z: this.z, yaw: this.yaw, pitch: this.pitch, dx: this.dx, dy: this.dy, dz: this.dz, health: 0, fire: this.remainingFireTicks, data: this.saveData() };
  }

  load(d: SavedEntity): void {
    this.moveTo(d.x, d.y, d.z, d.yaw, d.pitch);
    this.dx = d.dx;
    this.dy = d.dy;
    this.dz = d.dz;
    this.remainingFireTicks = d.fire ?? 0;
    if (d.data) this.loadData(d.data);
  }

  protected saveData(): Record<string, number | string | boolean> | undefined {
    return undefined;
  }

  protected loadData(_d: Record<string, number | string | boolean>): void {}
}

/**
 * (minecarts) the way a player riding a cart is trying to go (vanilla: the rider's own deltaMovement, from its travel);
 * a guest's player, whose travel is its game's own, as the keys it holds and its look make it (vanilla moveRelative
 * with the air's 0.02, less the air's drag)
 */
function riderMotion(p: Player): [number, number] {
  if (!p.remote) return [p.dx, p.dz];
  let sx = p.xxa, sz = p.zza;
  const l = sx * sx + sz * sz;
  if (l < 1e-7) return [0, 0];
  if (l > 1) {
    const n = Math.sqrt(l);
    sx /= n;
    sz /= n;
  }
  const r = (p.yaw * Math.PI) / 180, s = Math.sin(r), c = Math.cos(r);
  return [(sx * c - sz * s) * 0.02 * 0.91, (sz * c + sx * s) * 0.02 * 0.91];
}

/** vanilla getBlockFloorHeight over DismountHelper.nonClimbableShape: where to stand in this block space */
function floorHeight(level: Level, x: number, y: number, z: number): number {
  const here = shapeTop(level.getState(x, y, z));
  if (here !== null) return here;
  const below = shapeTop(level.getState(x, y - 1, z));
  return below !== null && below >= 1 ? below - 1 : -Infinity;
}

/** top of a block's collision shape; ladders, vines and open trapdoors count as empty */
function shapeTop(st: number): number | null {
  if (FLAGS[st] & F_CLIMBABLE) return null;
  const b = BLOCKS[STATE_BLOCK[st]];
  if (b.name.endsWith('_trapdoor') && b.get(st, 'open')) return null;
  const boxes = COLLISION[st];
  if (!boxes) return null;
  let m = -Infinity;
  for (const c of boxes) m = Math.max(m, c[4]);
  return m;
}

/** vanilla Minecart: the one you ride */
export class Minecart extends AbstractMinecart {
  readonly type = 'minecart';

  dropItem(): string {
    return 'minecart';
  }

  protected override picksUpMobs(): boolean {
    return true;
  }

  /** vanilla Minecart.interact: climb in, unless sneaking or someone's already in it */
  interact(p: Player): boolean {
    if (p.isShiftKeyDown() || this.isVehicle()) return false;
    return p.startRiding(this);
  }

  /** (minecarts) vanilla Minecart.activateMinecart: a powered activator rail throws out its rider, and shakes it */
  override activateMinecart(_x: number, _y: number, _z: number, powered: boolean): void {
    if (!powered) return;
    if (this.isVehicle()) this.ejectPassengers();
    if (this.hurtTime === 0) {
      this.hurtDir = -this.hurtDir;
      this.hurtTime = 10;
      this.damage = 50;
    }
  }
}

/**
 * vanilla AbstractMinecartContainer (+ ContainerEntity): a cart carrying a container ((minecarts) a chest's 27 slots,
 * a hopper's 5), its loot table rolled when it's first got at
 */
export abstract class AbstractMinecartContainer extends AbstractMinecart {
  readonly container: SimpleContainer;
  /** vanilla LootTable / LootTableSeed: rolled when first opened or broken */
  lootTable: string | null = null;
  lootSeed = 0;

  constructor(level: Level, size: number) {
    super(level);
    this.container = new SimpleContainer(size);
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

  /** vanilla AbstractMinecartContainer.remove(KILLED): the contents spill out (Containers.dropContents) */
  override kill(): void {
    this.spill();
    super.kill();
  }

  /** ((minecarts) vanilla remove(DISCARDED), a creative player's blow: they spill out then too) */
  override discard(): void {
    this.spill();
    super.discard();
  }

  private spill(): void {
    this.unpackLoot();
    const x = Math.floor(this.x), y = Math.floor(this.y), z = Math.floor(this.z);
    for (const s of this.container.removeAll()) this.level.dropStackAt(x, y, z, s);
  }

  /** vanilla AbstractMinecartContainer.applyNaturalSlowdown: the emptier the chest, the further it rolls */
  protected override applyNaturalSlowdown(): void {
    let f = 0.98;
    if (!this.lootTable) f += (15 - redstoneSignal(this.container)) * 0.001;
    if (this.inWater) f *= 0.95;
    this.dx *= f;
    this.dy = 0;
    this.dz *= f;
  }

  protected override saveData(): Record<string, number | string | boolean> {
    // vanilla addChestVehicleSaveData: a pending loot table instead of the items
    if (this.lootTable) return { lootTable: this.lootTable, lootSeed: this.lootSeed };
    const items: [number, string, number, number, ItemTag?][] = [];
    this.container.items.forEach((s, i) => {
      if (s && s.count > 0) items.push(s.tag ? [i, s.item.id, s.count, s.damage, cloneTag(s.tag)!] : [i, s.item.id, s.count, s.damage]);
    });
    return { items: JSON.stringify(items) };
  }

  protected override loadData(d: Record<string, number | string | boolean>): void {
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

/** vanilla MinecartChest: a 27-slot chest on rails */
export class MinecartChest extends AbstractMinecartContainer {
  readonly type = 'chest_minecart';

  constructor(level: Level) {
    super(level, 27);
  }

  dropItem(): string {
    return 'chest_minecart';
  }

  /** vanilla MinecartChest.getDefaultDisplayBlockState: a chest facing north */
  override displayState(): number {
    return getBlock('chest').state({ facing: 'north' });
  }

  override displayOffset(): number {
    return 8;
  }
}

/** vanilla AbstractContainerMenu.getRedstoneSignalFromContainer: 0..15 by how full it is ((minecarts) a detector rail's reading) */
export function redstoneSignal(c: SimpleContainer): number {
  let f = 0;
  for (const s of c.items) if (s && s.count > 0) f += s.count / Math.min(99, s.maxStack);
  f /= c.size;
  return Math.floor(f * 14) + (f > 0 ? 1 : 0);
}

/** every kind of minecart ((minecarts) the hopper, TNT and furnace ones made by entity/minecartVariants.ts) */
export const MINECART_TYPES = ['minecart', 'chest_minecart', 'hopper_minecart', 'tnt_minecart', 'furnace_minecart'];

/** (minecarts) the kinds made elsewhere (entity/minecartVariants.ts), by type */
const MADE_ELSEWHERE = new Map<string, (level: Level) => AbstractMinecart>();

/** (minecarts) how a kind of minecart kept in another file is made */
export function registerMinecartType(type: string, make: (level: Level) => AbstractMinecart): void {
  MADE_ELSEWHERE.set(type, make);
}

/** vanilla AbstractMinecart.createMinecart */
export function createMinecart(type: string, level: Level): AbstractMinecart | null {
  if (type === 'minecart') return new Minecart(level);
  if (type === 'chest_minecart') return new MinecartChest(level);
  return MADE_ELSEWHERE.get(type)?.(level) ?? null;
}
