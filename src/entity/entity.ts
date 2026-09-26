// Base entity with vanilla-style movement/collision.

import { AABB, collideWithBoxes } from '../core/aabb';
import { COLLISION, FLAGS, F_AIR, F_WATER, F_LAVA, BLOCKS, STATE_BLOCK, F_CLIMBABLE, type Box } from '../world/block';
import type { World } from '../world/world';
import { DYNAMIC_SHAPE, dynamicCollision } from '../world/dynamicShapes';
import { fluidType, fluidHeight, fluidFlow, FLUID_WATER, FLUID_LAVA, FLUID_NONE } from '../world/fluids';
import type { Level } from '../game/level';
// (M8: goats)
import type { Player } from './player';
import { setDripleafTilt } from '../game/blockRules';
import { behaviorOf, behaviorOfBlock } from '../game/blockBehavior';

let nextEntityId = 1;

/** a fresh random version-4 UUID (vanilla Mth.createInsecureUUID) */
function newUuid(): string {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  const h = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, '0');
  return `${h()}${h()}-${h()}-4${h().slice(1)}-${((Math.random() * 4) | 8).toString(16)}${h().slice(1)}-${h()}${h()}${h()}`;
}

/** which portal an entity stands in (vanilla PortalProcessor.portal: NetherPortalBlock or EndPortalBlock) */
export type PortalKind = 'nether' | 'end' | 'end_gateway';

/** vanilla LiquidBlock.STABLE_SHAPE's top: the half-block floor a lava-walker finds on still lava */
const LAVA_FLOOR = 0.5;

/**
 * blocks whose collision comes from more than their state (by block id): a moving piston's is its block entity's
 * moving block (game/redstone/piston.ts); null for none
 */
export const DYNAMIC_COLLISION: ((world: World, x: number, y: number, z: number, st: number) => Box[] | null)[] = [];

/**
 * (trial chambers) a player's current impulse (vanilla Player.currentImpulseImpactPos and the rest; game/windBurst.ts
 * sets these): what a landing's fall counts as, and what's kept of it from each move to the next
 */
export const FALL_HOOKS: { landing: ((e: Entity, dist: number) => number) | null; moved: ((e: Entity, onGround: boolean) => void) | null } = { landing: null, moved: null };

/** a lava source (vanilla LiquidBlock LEVEL 0), the one kind of lava that bears a strider */
function isLavaSource(st: number): boolean {
  const b = BLOCKS[STATE_BLOCK[st]];
  return b.s.fluid === 'lava' && b.get<number>(st, 'level') === 0;
}

export abstract class Entity {
  readonly id = nextEntityId++;
  abstract readonly type: string;
  private uuidValue: string | null = null;
  /** vanilla Entity.uuid: who it is for good (made the first time anything needs to remember it, then saved with it) */
  get uuid(): string {
    return (this.uuidValue ??= newUuid());
  }
  set uuid(v: string) {
    this.uuidValue = v;
  }
  /** whether anything has asked for its uuid yet (it's only saved then) */
  get hasUuid(): boolean {
    return this.uuidValue !== null;
  }

  /** vanilla Entity.killedEntity: this killed `victim`; false when it took the body (no death drops then) */
  killedEntity(_victim: Entity): boolean {
    return true;
  }
  x = 0;
  y = 0;
  z = 0;
  xo = 0;
  yo = 0;
  zo = 0;
  dx = 0;
  dy = 0;
  dz = 0;
  yaw = 0;
  pitch = 0;
  yawO = 0;
  pitchO = 0;
  width = 0.6;
  height = 1.8;
  bb = new AABB(0, 0, 0, 0, 0, 0);
  onGround = false;
  horizontalCollision = false;
  verticalCollision = false;
  verticalCollisionBelow = false;
  fallDistance = 0;
  inWater = false;
  wasInWater = false;
  inLava = false;
  eyeFluid = FLUID_NONE;
  fluidHeightWater = 0;
  fluidHeightLava = 0;
  noPhysics = false;
  /** a piston is moving it (vanilla MoverType.PISTON, game/redstone/piston.ts): it doesn't back off an edge meanwhile */
  pistonMoving = false;
  removed = false;
  tickCount = 0;
  stepHeight = 0;
  /** walk distance accumulators (sounds/bobbing) */
  walkDist = 0;
  walkDistO = 0;
  moveDist = 0;
  /** vanilla flyDist: how far it's moved every way, up and down too (a flyer's wingbeats) */
  flyDist = 0;
  private nextStep = 1;
  /** vanilla crystalSoundIntensity / lastCrystalSoundPlayTick (amethyst chimes while walking) */
  private crystalSoundIntensity = 0;
  private lastCrystalSoundTick = 0;
  invulnerableTime = 0;
  /** vanilla starts at -getFireImmuneTicks(): standing in fire takes that long to catch */
  remainingFireTicks = -1;
  /** vanilla stuckSpeedMultiplier (cobwebs, berry bushes): scales the next move */
  private stuckSpeed: [number, number, number] | null = null;
  /** what this rides, and who rides it (vanilla vehicle / passengers) */
  vehicle: Entity | null = null;
  readonly passengers: Entity[] = [];
  /** vanilla boardingCooldown: ticks until this can get on something again after getting off */
  boardingCooldown = 0;

  constructor(public level: Level) {}

  setPos(x: number, y: number, z: number): void {
    this.x = x;
    this.y = y;
    this.z = z;
    this.bb = AABB.ofSize(x, y, z, this.width, this.height);
  }

  /** Snap previous positions (no interpolation). */
  moveTo(x: number, y: number, z: number, yaw = this.yaw, pitch = this.pitch): void {
    this.setPos(x, y, z);
    this.xo = x;
    this.yo = y;
    this.zo = z;
    this.yaw = this.yawO = yaw;
    this.pitch = this.pitchO = pitch;
  }

  setSize(w: number, h: number): void {
    this.width = w;
    this.height = h;
    this.bb = AABB.ofSize(this.x, this.y, this.z, w, h);
  }

  get eyeHeight(): number {
    return this.height * 0.85;
  }

  lerpX(p: number): number {
    return this.xo + (this.x - this.xo) * p;
  }
  lerpY(p: number): number {
    return this.yo + (this.y - this.yo) * p;
  }
  lerpZ(p: number): number {
    return this.zo + (this.z - this.zo) * p;
  }

  /** Called once per game tick. */
  tick(): void {
    this.baseTick();
  }

  baseTick(): void {
    this.xo = this.x;
    this.yo = this.y;
    this.zo = this.z;
    this.yawO = this.yaw;
    this.pitchO = this.pitch;
    this.walkDistO = this.walkDist;
    this.tickCount++;
    this.handlePortal();
    this.updateFluids();
    this.updateSwimming();
    // vanilla Entity.baseTick: burning and lava
    if (this.remainingFireTicks > 0) {
      if (this.fireImmune()) {
        this.remainingFireTicks = Math.max(0, this.remainingFireTicks - 4);
      } else {
        if (this.remainingFireTicks % 20 === 0 && !this.inLava) this.hurt(1, 'onFire');
        this.remainingFireTicks--;
      }
    }
    if (this.inLava) {
      this.lavaHurt();
      this.fallDistance *= 0.5;
    }
    // vanilla checkBelowWorld: 64 blocks under the bottom of the world
    if (this.y < this.level.world.dim.minY - 64) this.onBelowWorld();
    if (this.invulnerableTime > 0) this.invulnerableTime--;
    if (this.boardingCooldown > 0) this.boardingCooldown--;
  }

  /** vanilla PortalProcessor: the portal (nether or end) this is standing in and for how long */
  portal: { x: number; y: number; z: number; time: number; inside: boolean; kind: PortalKind } | null = null;
  /** vanilla portalCooldown: after using a portal, ticks until one takes this again (refreshed while still in one) */
  portalCooldown = 0;

  /** vanilla getDimensionChangingDelay */
  dimensionChangingDelay(): number {
    return 300;
  }

  /** vanilla NetherPortalBlock.getPortalTransitionTime: ticks in a portal before it takes you */
  portalWaitTime(): number {
    return 0;
  }

  /** whether this can go through a portal to another dimension (only players can, here) */
  canChangeDimensions(): boolean {
    return false;
  }

  /** vanilla Entity.setAsInsidePortal (Nether/EndPortalBlock.entityInside, when canUsePortal: not while riding) */
  setAsInsidePortal(kind: PortalKind, x: number, y: number, z: number): void {
    if (this.vehicle || this.removed) return;
    if (this.portalCooldown > 0) {
      this.portalCooldown = this.dimensionChangingDelay();
      return;
    }
    const p = this.portal;
    if (p && p.kind === kind) {
      p.x = x;
      p.y = y;
      p.z = z;
      p.inside = true;
    } else this.portal = { x, y, z, time: 0, inside: true, kind };
  }

  /** vanilla Entity.handlePortal: long enough in a portal takes you through; out of one, the count runs back down */
  protected handlePortal(): void {
    if (this.portalCooldown > 0) this.portalCooldown--;
    const p = this.portal;
    if (!p) return;
    if (!p.inside) {
      p.time = Math.max(0, p.time - 4);
      if (p.time <= 0) this.portal = null;
      return;
    }
    p.inside = false;
    // (an end portal or gateway takes anything alive at once — vanilla getPortalTransitionTime 0; only players use
    // nether portals here)
    const end = p.kind !== 'nether';
    const can = end ? ((this as { isAlive?: boolean }).isAlive ?? !this.removed) && !this.vehicle : this.canChangeDimensions();
    if (!can || p.time++ < (end ? 0 : this.portalWaitTime())) return;
    this.portalCooldown = this.dimensionChangingDelay();
    this.portal = null;
    this.level.onPortal?.(this, p.x, p.y, p.z, p.kind);
  }

  protected lavaHurt(): void {
    if (this.fireImmune()) return;
    this.igniteForSeconds(15);
    if (this.hurt(4, 'lava')) this.level.sound.play('entity.generic.burn', this.x, this.y, this.z, 0.4, 2 + Math.random() * 0.4);
  }

  /** generic damage entry point; returns true if damage was applied */
  hurt(_amount: number, _source: string, _attacker?: Entity | null, _direct?: Entity | null): boolean {
    return false;
  }

  fireImmune(): boolean {
    return false;
  }

  /** vanilla Entity.isOnFire: the fireproof never burn (nor show flames) */
  isOnFire(): boolean {
    return !this.fireImmune() && this.remainingFireTicks > 0;
  }

  igniteForSeconds(s: number): void {
    const t = Math.floor(s * 20);
    if (this.remainingFireTicks < t) this.remainingFireTicks = t;
  }

  /** vanilla Entity.thunderHit: struck by lightning — set alight (unless already burning) and 5 damage */
  thunderHit(_bolt: Entity): void {
    this.remainingFireTicks++;
    if (this.remainingFireTicks === 0) this.igniteForSeconds(8);
    this.hurt(5, 'lightningBolt');
  }

  clearFire(): void {
    this.remainingFireTicks = 0;
  }

  /** can be targeted by the crosshair / hit by attacks */
  isPickable(): boolean {
    return false;
  }

  pickRadius(): number {
    return 0;
  }

  isPushable(): boolean {
    return false;
  }

  push(x: number, y: number, z: number): void {
    this.dx += x;
    this.dy += y;
    this.dz += z;
  }

  /** vanilla Entity.push(Entity): mutual separation push (entities carrying riders stay put) */
  pushAgainst(e: Entity): void {
    if (this.isPassengerOfSameVehicle(e)) return;
    if (e.noPhysics || this.noPhysics) return;
    let d0 = e.x - this.x, d1 = e.z - this.z;
    let d2 = Math.max(Math.abs(d0), Math.abs(d1));
    if (d2 < 0.01) return;
    d2 = Math.sqrt(d2);
    d0 /= d2;
    d1 /= d2;
    let d3 = 1 / d2;
    if (d3 > 1) d3 = 1;
    d0 *= d3 * 0.05;
    d1 *= d3 * 0.05;
    if (!this.isVehicle() && this.isPushable()) this.push(-d0, 0, -d1);
    if (!e.isVehicle() && e.isPushable()) e.push(d0, 0, d1);
  }

  // --- riding (vanilla Entity.startRiding / stopRiding / rideTick / positionRider) ---

  isVehicle(): boolean {
    return this.passengers.length > 0;
  }

  rootVehicle(): Entity {
    let e: Entity = this;
    while (e.vehicle) e = e.vehicle;
    return e;
  }

  isPassengerOfSameVehicle(e: Entity): boolean {
    return this.rootVehicle() === e.rootVehicle();
  }

  /** vanilla isShiftKeyDown (the sneak key) */
  isShiftKeyDown(): boolean {
    return false;
  }

  /** vanilla canRide: not while sneaking or right after getting off */
  protected canRide(_vehicle: Entity): boolean {
    return !this.isShiftKeyDown() && this.boardingCooldown <= 0;
  }

  canAddPassenger(_p: Entity): boolean {
    return this.passengers.length === 0;
  }

  /** vanilla getControllingPassenger: the rider steering this (mobs: see Mob), or null */
  controllingPassenger(): Entity | null {
    return null;
  }

  startRiding(vehicle: Entity, force = false): boolean {
    if (vehicle === this.vehicle) return false;
    for (let e: Entity | null = vehicle; e; e = e.vehicle) if (e === this) return false;
    if (!force && (!this.canRide(vehicle) || !vehicle.canAddPassenger(this))) return false;
    if (this.vehicle) this.stopRiding();
    this.vehicle = vehicle;
    // vanilla Entity.addPassenger: a player takes the front seat unless a player already has it
    if (this.type === 'player' && vehicle.passengers.length && vehicle.passengers[0].type !== 'player') vehicle.passengers.unshift(this);
    else vehicle.passengers.push(this);
    // (vanilla Entity.addPassenger: the vehicle's game event, by the rider)
    this.level.gameEvent?.('entity_mount', vehicle.x, vehicle.y, vehicle.z, { entity: this });
    // (M8: goats) vanilla: CriteriaTriggers.START_RIDING_TRIGGER for every player aboard the vehicle (or aboard its riders)
    const aboard = [...vehicle.passengers];
    for (let i = 0; i < aboard.length; i++) {
      const p = aboard[i];
      aboard.push(...p.passengers);
      const v = p.vehicle;
      if (p.type === 'player') this.level.onPlayerTrigger?.(p as unknown as Player, 'started_riding', { riding: { vehicle: v?.type ?? null, passengers: v ? v.passengers.map((e) => e.type) : [] } });
    }
    return true;
  }

  /** vanilla onPassengerTurned: the rider looked around (boats clamp it) */
  onPassengerTurned(_p: Entity): void {}

  /** riders of this don't count as in water (vanilla: a boat that isn't under water) */
  keepsRidersDry(): boolean {
    return false;
  }

  stopRiding(): void {
    this.removeVehicle();
  }

  /** vanilla removeVehicle + Entity.removePassenger (which sets the boarding cooldown) */
  removeVehicle(): void {
    const v = this.vehicle;
    if (!v) return;
    this.vehicle = null;
    const i = v.passengers.indexOf(this);
    if (i >= 0) v.passengers.splice(i, 1);
    this.boardingCooldown = 60;
    // (vanilla Entity.removePassenger: the vehicle's game event, by the rider)
    this.level.gameEvent?.('entity_dismount', v.x, v.y, v.z, { entity: this });
  }

  ejectPassengers(): void {
    for (let i = this.passengers.length - 1; i >= 0; i--) this.passengers[i].stopRiding();
  }

  /** height of the seat above this entity's position (vanilla passenger attachment point) */
  passengerAttachmentY(_p: Entity): number {
    return this.height;
  }

  /** how far below the seat a rider's position sits (vanilla vehicle attachment point) */
  vehicleAttachmentY(): number {
    return 0;
  }

  positionRider(p: Entity): void {
    p.setPos(this.x, this.y + this.passengerAttachmentY(p) - p.vehicleAttachmentY(), this.z);
  }

  /** vanilla Entity.rideTick: ticked by the vehicle, then carried along to the seat */
  rideTick(): void {
    this.dx = this.dy = this.dz = 0;
    this.tick();
    if (this.vehicle) this.vehicle.positionRider(this);
  }

  /** where a rider gets off (vanilla Entity.getDismountLocationForPassenger: on top) */
  dismountLocation(_p: Entity): [number, number, number] {
    return [this.x, this.bb.maxY, this.z];
  }

  /** item given by a creative middle-click (vanilla getPickResult) */
  pickResult(): string | null {
    return null;
  }

  /** vanilla isInWaterOrRain / isInWaterRainOrBubble */
  isInWaterOrRainNow(): boolean {
    return this.inWater || this.level.isRainingAt(Math.floor(this.x), Math.floor(this.y), Math.floor(this.z)) || this.level.isRainingAt(Math.floor(this.x), Math.floor(this.bb.maxY), Math.floor(this.z));
  }

  /** vanilla getLightLevelDependentMagicValue at the eyes */
  lightMagic(): number {
    return this.level.brightness(Math.floor(this.x), Math.floor(this.y + this.eyeHeight), Math.floor(this.z));
  }

  get blockX(): number {
    return Math.floor(this.x);
  }
  get blockY(): number {
    return Math.floor(this.y);
  }
  get blockZ(): number {
    return Math.floor(this.z);
  }

  /** Collision boxes of blocks (and entities this collides with) intersecting `box`. */
  collisionBoxes(box: AABB): AABB[] {
    const out: AABB[] = [];
    const world = this.level.world;
    const lavaWalker = this.canStandOnFluid(FLUID_LAVA);
    const x0 = Math.floor(box.minX - 1e-7) - 1, x1 = Math.floor(box.maxX + 1e-7) + 1;
    const y0 = Math.floor(box.minY - 1e-7) - 1, y1 = Math.floor(box.maxY + 1e-7) + 1;
    const z0 = Math.floor(box.minZ - 1e-7) - 1, z1 = Math.floor(box.maxZ + 1e-7) + 1;
    for (let x = x0; x <= x1; x++)
      for (let z = z0; z <= z1; z++) {
        if (!world.isLoaded(x, z)) {
          // unloaded terrain behaves like a wall so nothing falls out of the world
          const b = new AABB(x, -64, z, x + 1, 320, z + 1);
          if (b.intersects(box)) out.push(b);
          continue;
        }
        for (let y = y0; y <= y1; y++) {
          const st = world.getState(x, y, z);
          if (st === 0) continue;
          // vanilla LiquidBlock.getCollisionShape: still lava with no lava over it is a floor half a block up for
          // whoever can stand on it (a strider) and is above that floor already
          if (FLAGS[st] & F_LAVA && lavaWalker && this.y > y + LAVA_FLOOR - 1e-5 && isLavaSource(st) && fluidType(world.getState(x, y + 1, z)) !== FLUID_LAVA) {
            const b = new AABB(x, y, z, x + 1, y + LAVA_FLOOR, z + 1);
            if (b.intersects(box)) out.push(b);
            continue;
          }
          // (a shulker box's shape grows with its lid: world/dynamicShapes)
          const boxes = DYNAMIC_SHAPE[st] ? dynamicCollision(world, x, y, z, st) : COLLISION[st] ?? DYNAMIC_COLLISION[STATE_BLOCK[st]]?.(world, x, y, z, st);
          if (!boxes) continue;
          for (const c of boxes) {
            const b = new AABB(x + c[0], y + c[1], z + c[2], x + c[3], y + c[4], z + c[5]);
            if (b.intersects(box)) out.push(b);
          }
        }
      }
    this.entityCollisions(box, out);
    return out;
  }

  /** vanilla LivingEntity.canStandOnFluid: walks on this fluid (FLUID_*) as on a floor (the strider on lava) */
  canStandOnFluid(_fluid: number): boolean {
    return false;
  }

  /** vanilla canBeCollidedWith: solid to other entities (boats) */
  canBeCollidedWith(): boolean {
    return false;
  }

  /** vanilla getEntityCollisions with Entity.canCollideWith: the solid entities (boats) in the way, not the one you ride */
  protected entityCollisions(box: AABB, out: AABB[]): void {
    const solid = solidEntities(this.level);
    if (!solid.length) return;
    const q = box.inflate(1e-7);
    for (const e of solid) if (e !== this && !e.removed && e.bb.intersects(q) && !this.isPassengerOfSameVehicle(e)) out.push(e.bb);
  }

  isFree(box: AABB): boolean {
    return this.collisionBoxes(box).length === 0 && !this.isInLiquidBox(box);
  }

  private isInLiquidBox(box: AABB): boolean {
    const world = this.level.world;
    for (let x = Math.floor(box.minX); x <= Math.floor(box.maxX - 1e-7); x++)
      for (let y = Math.floor(box.minY); y <= Math.floor(box.maxY - 1e-7); y++)
        for (let z = Math.floor(box.minZ); z <= Math.floor(box.maxZ - 1e-7); z++) {
          if (FLAGS[world.getState(x, y, z)] & (F_WATER | F_LAVA)) return true;
        }
    return false;
  }

  /** vanilla Entity.collide incl. step-up */
  protected collide(mx: number, my: number, mz: number): [number, number, number] {
    const box = this.bb;
    const boxes = this.collisionBoxes(box.expandTowards(mx, my, mz));
    let [rx, ry, rz] = mx === 0 && my === 0 && mz === 0 ? [0, 0, 0] : collideWithBoxes(mx, my, mz, box, boxes);
    const cx = mx !== rx, cy = my !== ry, cz = mz !== rz;
    const grounded = this.onGround || (cy && my < 0);
    if (this.stepHeight > 0 && grounded && (cx || cz)) {
      const sh = this.stepHeight;
      const boxes2 = this.collisionBoxes(box.expandTowards(mx, sh, mz));
      let v31 = collideWithBoxes(mx, sh, mz, box, boxes2);
      const v32 = collideWithBoxes(0, sh, 0, box.expandTowards(mx, 0, mz), boxes2);
      if (v32[1] < sh) {
        const moved = box.move(v32[0], v32[1], v32[2]);
        const v33 = collideWithBoxes(mx, 0, mz, moved, boxes2);
        const v33s: [number, number, number] = [v33[0] + v32[0], v33[1] + v32[1], v33[2] + v32[2]];
        if (v33s[0] * v33s[0] + v33s[2] * v33s[2] > v31[0] * v31[0] + v31[2] * v31[2]) v31 = v33s;
      }
      if (v31[0] * v31[0] + v31[2] * v31[2] > rx * rx + rz * rz) {
        const moved = box.move(v31[0], v31[1], v31[2]);
        const down = collideWithBoxes(0, -v31[1] + my, 0, moved, this.collisionBoxes(moved.expandTowards(0, -v31[1] + my, 0)));
        return [v31[0], v31[1] + down[1], v31[2]];
      }
    }
    return [rx, ry, rz];
  }

  /** Move with collision (vanilla Entity.move for MoverType.SELF). */
  move(mx: number, my: number, mz: number): void {
    if (this.noPhysics) {
      this.setPos(this.x + mx, this.y + my, this.z + mz);
      return;
    }
    const wasOnFire = this.isOnFire();
    if (this.stuckSpeed) {
      mx *= this.stuckSpeed[0];
      my *= this.stuckSpeed[1];
      mz *= this.stuckSpeed[2];
      this.stuckSpeed = null;
      this.dx = this.dy = this.dz = 0;
    }
    [mx, mz] = this.maybeBackOffFromEdge(mx, my, mz);
    const [rx, ry, rz] = this.collide(mx, my, mz);
    const lenSq = rx * rx + ry * ry + rz * rz;
    if (lenSq > 1e-7) this.setPos(this.x + rx, this.y + ry, this.z + rz);
    const colX = Math.abs(mx - rx) > 1e-5, colZ = Math.abs(mz - rz) > 1e-5;
    this.horizontalCollision = colX || colZ;
    this.verticalCollision = my !== ry;
    this.verticalCollisionBelow = this.verticalCollision && my < 0;
    this.onGround = this.verticalCollisionBelow;
    this.checkFallDamage(ry, this.onGround);
    if (colX) this.dx = 0;
    if (colZ) this.dz = 0;
    if (my !== ry) this.onLand();
    // (Stage 5: ocean) vanilla Block.stepOn: what holds it up hears it (a turtle egg underfoot)
    if (this.onGround && !this.removed) {
      const f = floorWithHook(this, 'stepOn');
      if (f) behaviorOf(f[3])!.stepOn!(this.level, f[0], f[1], f[2], f[3], this);
    }
    if (!this.noPhysics && !this.vehicle) {
      // vanilla walkDist/moveDist accounting (step & swim sounds, view bobbing); riders don't walk
      const onX = Math.floor(this.x), onY = Math.floor(this.y - 0.2), onZ = Math.floor(this.z);
      const onState = this.level.world.getState(onX, onY, onZ);
      const climbing = this.onClimbable();
      const vy = climbing ? ry : 0;
      // (vanilla MovementEmission: step sounds, and the game events sculk sensors hear)
      const sounds = this.makesStepSounds(), events = this.emitsMovementEvents();
      this.flyDist += Math.sqrt(rx * rx + ry * ry + rz * rz) * 0.6;
      this.walkDist += Math.sqrt(rx * rx + rz * rz) * 0.6;
      this.moveDist += Math.sqrt(rx * rx + vy * vy + rz * rz) * 0.6;
      // vanilla processFlappingMovement: over air, a flyer's wings beat as it goes
      if (FLAGS[onState] & F_AIR && !this.inWater && !climbing && (sounds || events) && this.isFlapping()) {
        this.onFlap();
        if (events) this.level.gameEvent?.('flap', this.x, this.y, this.z, { entity: this });
      } else if (this.moveDist > this.nextStep && (onState !== 0 || this.inWater || climbing) && (sounds || events)) {
        this.nextStep = this.nextStepDistance();
        if (this.inWater) {
          if (sounds) this.playSwimSound();
          if (events) this.level.gameEvent?.('swim', this.x, this.y, this.z, { entity: this });
        } else if (this.onGround || climbing || this.isOnRails()) {
          if (sounds) {
            this.playStepSound();
            const on = BLOCKS[STATE_BLOCK[onState]].name;
            if ((on === 'amethyst_block' || on === 'budding_amethyst') && this.tickCount >= this.lastCrystalSoundTick + 20) this.playAmethystStepSound();
          }
          if (events) this.level.gameEvent?.('step', this.x, this.y, this.z, { entity: this, state: this.supportingState(onState) });
        }
      }
    }
    const touchingFire = this.checkInsideBlocks();
    // block speed factor (soul sand, honey)
    const f = this.blockSpeedFactor();
    this.dx *= f;
    this.dz *= f;
    // vanilla: leaving fire resets the catch-fire delay; water and rain put fires out
    const wet = this.inWater || this.isInWaterOrRainNow();
    if (!touchingFire) {
      if (this.remainingFireTicks <= 0) this.remainingFireTicks = -this.fireImmuneTicks();
      if (wasOnFire && wet) this.level.sound.play('entity.generic.extinguish_fire', this.x, this.y, this.z, 0.7, 1.6 + (Math.random() - Math.random()) * 0.4);
    }
    if (this.isOnFire() && wet) this.remainingFireTicks = -this.fireImmuneTicks();
  }

  /** vanilla getFireImmuneTicks: how long standing in fire takes to set you alight */
  fireImmuneTicks(): number {
    return 1;
  }

  /** vanilla makeStuckInBlock */
  makeStuckInBlock(mx: number, my: number, mz: number): void {
    this.fallDistance = 0;
    this.stuckSpeed = [mx, my, mz];
  }

  /**
   * vanilla Entity.checkInsideBlocks → BlockBehaviour.entityInside for the
   * blocks the bounding box overlaps. Returns true when touching fire or lava.
   */
  checkInsideBlocks(): boolean {
    const bb = this.bb, w = this.level.world;
    const x0 = Math.floor(bb.minX + 1e-7), y0 = Math.floor(bb.minY + 1e-7), z0 = Math.floor(bb.minZ + 1e-7);
    const x1 = Math.floor(bb.maxX - 1e-7), y1 = Math.floor(bb.maxY - 1e-7), z1 = Math.floor(bb.maxZ - 1e-7);
    let fire = false;
    for (let x = x0; x <= x1; x++)
      for (let y = y0; y <= y1; y++)
        for (let z = z0; z <= z1; z++) {
          const st = w.getState(x, y, z);
          if (st === 0) continue;
          const kind = insideKind(st);
          if (kind === INSIDE_NONE) continue;
          if (kind === INSIDE_LAVA) fire = true;
          else if (kind === INSIDE_FIRE || kind === INSIDE_SOUL_FIRE) {
            fire = true;
            // (vanilla SoulFireBlock: twice the burn)
            this.insideFire(kind === INSIDE_SOUL_FIRE ? 2 : 1);
          } else if (kind === INSIDE_COBWEB) this.insideCobweb();
          else if (kind === INSIDE_BERRY_BUSH) this.insideBerryBush(st);
          else if (kind === INSIDE_CACTUS) this.hurt(1, 'cactus');
          else if (kind === INSIDE_DRIPLEAF) this.insideDripleaf(x, y, z, st);
          else if (kind === INSIDE_PORTAL) this.setAsInsidePortal('nether', x, y, z);
          else if (kind === INSIDE_BEHAVIOR) behaviorOf(st)!.entityInside!(this.level, x, y, z, st, this);
          if (this.removed) return fire;
        }
    return fire;
  }

  /** vanilla BaseFireBlock.entityInside */
  private insideFire(damage: number): void {
    if (!this.fireImmune()) {
      this.remainingFireTicks++;
      if (this.remainingFireTicks === 0) this.igniteForSeconds(8);
    }
    this.hurt(damage, 'inFire');
  }

  /** vanilla SweetBerryBushBlock.entityInside (living things only) */
  protected insideBerryBush(_st: number): void {}

  /** vanilla BigDripleafBlock.entityInside: standing on a still leaf sets it tipping */
  private insideDripleaf(x: number, y: number, z: number, st: number): void {
    const b = BLOCKS[STATE_BLOCK[st]];
    if (b.get(st, 'tilt') !== 'none' || !this.onGround || this.y <= y + 0.6875) return;
    setDripleafTilt(this.level, x, y, z, st, 'unstable', null);
  }

  /** vanilla WebBlock.entityInside */
  protected insideCobweb(): void {
    this.makeStuckInBlock(0.25, 0.05, 0.25);
  }

  protected onLand(): void {
    this.dy = 0;
  }

  protected makesStepSounds(): boolean {
    return false;
  }

  /** vanilla MovementEmission.emitsEvents: its steps, swimming and wingbeats are game events (whatever makes step sounds, and some that don't) */
  protected emitsMovementEvents(): boolean {
    return this.makesStepSounds();
  }

  /** vanilla Entity.isOnRails: a minecart on its track (its going counts as steps) */
  protected isOnRails(): boolean {
    return false;
  }

  /**
   * vanilla mainSupportingBlockPos's state: what it stands on, the block its feet are in (a carpet, a slab) if that
   * isn't air, else the one under (`legacy`, 0.2 below its feet)
   */
  protected supportingState(legacy: number): number {
    const st = this.level.world.getState(Math.floor(this.x), Math.floor(this.y - 1e-5), Math.floor(this.z));
    return FLAGS[st] & F_AIR ? legacy : st;
  }

  /** vanilla Entity.isFlapping: whether it's due a wingbeat (the parrot's, by how far it's flown) */
  protected isFlapping(): boolean {
    return false;
  }

  /** vanilla Entity.onFlap: a wingbeat's sound */
  protected onFlap(): void {}

  /** vanilla Entity.nextStep: where along the walk the next step sounds */
  protected nextStepDistance(): number {
    return Math.floor(this.moveDist) + 1;
  }

  protected playStepSound(): void {}

  /** vanilla playAmethystStepSound: the chime gets louder and higher the longer the walk goes on */
  private playAmethystStepSound(): void {
    this.crystalSoundIntensity *= Math.pow(0.997, this.tickCount - this.lastCrystalSoundTick);
    this.crystalSoundIntensity = Math.min(1, this.crystalSoundIntensity + 0.07);
    const pitch = 0.5 + this.crystalSoundIntensity * Math.random() * 1.2;
    const volume = 0.1 + this.crystalSoundIntensity * 1.2;
    this.level.sound.play('block.amethyst_block.chime', this.x, this.y, this.z, volume, pitch);
    this.lastCrystalSoundTick = this.tickCount;
  }
  protected playSwimSound(): void {}

  protected isSneakingForEdges(): boolean {
    return false;
  }

  /**
   * vanilla Player.isAboveGround: on the ground, or not yet fallen a step's height with something under it within
   * the rest of that step (canFallAtLeast: nothing there, and it could fall; a swimmer in open water can)
   */
  private isAboveGround(): boolean {
    if (this.onGround) return true;
    if (this.fallDistance >= this.stepHeight) return false;
    const b = this.bb;
    return this.collisionBoxes(new AABB(b.minX, b.minY - (this.stepHeight - this.fallDistance) - 1e-5, b.minZ, b.maxX, b.minY, b.maxZ)).length > 0;
  }

  private maybeBackOffFromEdge(mx: number, my: number, mz: number): [number, number] {
    if (this.pistonMoving || !this.isSneakingForEdges() || my > 0 || !this.isAboveGround()) return [mx, mz];
    const step = this.stepHeight;
    const test = (x: number, z: number) => this.collisionBoxes(this.bb.move(x, -step, z)).length === 0;
    while (mx !== 0 && test(mx, 0)) {
      if (mx < 0.05 && mx >= -0.05) mx = 0;
      else if (mx > 0) mx -= 0.05;
      else mx += 0.05;
    }
    while (mz !== 0 && test(0, mz)) {
      if (mz < 0.05 && mz >= -0.05) mz = 0;
      else if (mz > 0) mz -= 0.05;
      else mz += 0.05;
    }
    while (mx !== 0 && mz !== 0 && test(mx, mz)) {
      if (mx < 0.05 && mx >= -0.05) mx = 0;
      else if (mx > 0) mx -= 0.05;
      else mx += 0.05;
      if (mz < 0.05 && mz >= -0.05) mz = 0;
      else if (mz > 0) mz -= 0.05;
      else mz += 0.05;
    }
    return [mx, mz];
  }

  protected checkFallDamage(dy: number, onGround: boolean): void {
    if (onGround) {
      // (Stage 5: ocean) vanilla Block.fallOn: what it lands on hears it first (a turtle egg underfoot)
      const f = this.fallDistance > 0 ? floorWithHook(this, 'fallOn') : null;
      if (f) behaviorOf(f[3])!.fallOn!(this.level, f[0], f[1], f[2], f[3], this, this.fallDistance);
      // (trial chambers) a player a wind charge threw up is hurt only for the fall below where it burst
      if (this.fallDistance > 0) {
        this.causeFallDamage(FALL_HOOKS.landing ? FALL_HOOKS.landing(this, this.fallDistance) : this.fallDistance);
        // (vanilla: a landing is a game event, on what it landed on)
        const on = this.level.world.getState(Math.floor(this.x), Math.floor(this.y - 0.2), Math.floor(this.z));
        this.level.gameEvent?.('hit_ground', this.x, this.y, this.z, { entity: this, state: this.supportingState(on) });
      }
      this.fallDistance = 0;
    } else if (dy < 0) {
      this.fallDistance -= dy;
    }
    if (this.inWater) this.fallDistance = 0;
    // (trial chambers)
    FALL_HOOKS.moved?.(this, onGround);
  }

  /** vanilla Entity.causeFallDamage: a vehicle hands the landing on to its riders */
  protected causeFallDamage(dist: number): void {
    for (const p of this.passengers) p.causeFallDamage(dist);
  }

  blockSpeedFactor(): number {
    const st = this.level.world.getState(Math.floor(this.x), Math.floor(this.y), Math.floor(this.z));
    const f = BLOCKS[STATE_BLOCK[st]].speedFactor;
    if (f !== 1 || this.inWater) return f;
    const below = this.level.world.getState(Math.floor(this.x), Math.floor(this.y - 0.500001), Math.floor(this.z));
    return BLOCKS[STATE_BLOCK[below]].speedFactor;
  }

  /** friction of the block under the entity (vanilla getBlockPosBelowThatAffectsMyMovement) */
  blockFriction(): number {
    const st = this.level.world.getState(Math.floor(this.x), Math.floor(this.y - 0.500001), Math.floor(this.z));
    return BLOCKS[STATE_BLOCK[st]].friction;
  }

  onClimbable(): boolean {
    const st = this.level.world.getState(Math.floor(this.x), Math.floor(this.y), Math.floor(this.z));
    return (FLAGS[st] & F_CLIMBABLE) !== 0;
  }

  /** vanilla updateFluidHeightAndDoFluidPushing for water and lava */
  protected updateFluids(): void {
    this.wasInWater = this.inWater;
    // vanilla updateInWaterStateAndDoWaterCurrentPushing: riding a boat that isn't under water keeps you dry
    const v = this.vehicle, dry = !!v && v.keepsRidersDry();
    if (dry) this.fluidHeightWater = 0;
    const w = !dry && this.fluidPush(FLUID_WATER, 0.014);
    this.inWater = w;
    if (this.inWater && !this.wasInWater && this.tickCount > 1) this.doWaterSplashEffect();
    if (this.inWater) this.fallDistance = 0;
    this.inLava = this.fluidPush(FLUID_LAVA, 0.0023333333333333335);
    // eye fluid (vanilla updateFluidOnEyes: none while the eyes are down inside such a boat)
    this.eyeFluid = FLUID_NONE;
    const ey = this.y + this.eyeHeight - 0.11111111;
    if (v && dry && v.bb.maxY >= ey && v.bb.minY <= ey) return;
    const ex = Math.floor(this.x), ez = Math.floor(this.z), eyi = Math.floor(ey);
    const st = this.level.world.getState(ex, eyi, ez);
    const ft = fluidType(st);
    if (ft !== FLUID_NONE) {
      const h = eyi + fluidHeight(this.level.world, ex, eyi, ez, ft);
      if (h > ey) this.eyeFluid = ft;
    }
  }

  /** vanilla Entity.doWaterSplashEffect: splash sound, bubbles and droplets where you hit the water */
  protected doWaterSplashEffect(): void {
    const vx = this.dx, vy = this.dy, vz = this.dz;
    const f1 = Math.min(1, Math.sqrt(vx * vx * 0.2 + vy * vy + vz * vz * 0.2) * 0.2);
    this.level.sound.play(f1 < 0.25 ? this.swimSplashSound() : this.swimHighSpeedSplashSound(), this.x, this.y, this.z, f1, 1 + (Math.random() - Math.random()) * 0.4);
    const y = Math.floor(this.y) + 1;
    const n = 1 + this.width * 20;
    const ps = this.level.particles;
    for (let i = 0; i < n; i++) {
      const ox = (Math.random() * 2 - 1) * this.width, oz = (Math.random() * 2 - 1) * this.width;
      ps.spawn?.('bubble', this.x + ox, y, this.z + oz, vx, vy - Math.random() * 0.2, vz);
    }
    for (let i = 0; i < n; i++) {
      const ox = (Math.random() * 2 - 1) * this.width, oz = (Math.random() * 2 - 1) * this.width;
      ps.spawn?.('splash', this.x + ox, y, this.z + oz, vx, vy, vz);
    }
    this.level.gameEvent?.('splash', this.x, this.y, this.z, { entity: this });
  }

  protected swimSplashSound(): string {
    return 'entity.generic.splash';
  }

  protected swimHighSpeedSplashSound(): string {
    return 'entity.generic.splash';
  }

  private fluidPush(type: number, scale: number): boolean {
    const box = this.bb.inflate(-0.001);
    const x0 = Math.floor(box.minX), x1 = Math.ceil(box.maxX);
    const y0 = Math.floor(box.minY), y1 = Math.ceil(box.maxY);
    const z0 = Math.floor(box.minZ), z1 = Math.ceil(box.maxZ);
    let maxH = 0;
    let inFluid = false;
    let fx = 0, fy = 0, fz = 0;
    let k = 0;
    const world = this.level.world;
    for (let x = x0; x < x1; x++)
      for (let y = y0; y < y1; y++)
        for (let z = z0; z < z1; z++) {
          const st = world.getState(x, y, z);
          if (fluidType(st) !== type) continue;
          const h = y + fluidHeight(world, x, y, z, type);
          if (h < box.minY) continue;
          inFluid = true;
          maxH = Math.max(h - box.minY, maxH);
          const [vx, vy, vz] = fluidFlow(world, x, y, z);
          let mul = 1;
          if (maxH < 0.4) mul = maxH;
          fx += vx * mul;
          fy += vy * mul;
          fz += vz * mul;
          k++;
        }
    if (type === FLUID_WATER) this.fluidHeightWater = maxH;
    else this.fluidHeightLava = maxH;
    if (k > 0 && this.isPushedByFluid()) {
      fx /= k;
      fy /= k;
      fz /= k;
      const len = Math.hypot(fx, fy, fz);
      if (len > 0) {
        fx = (fx / len) * scale;
        fy = (fy / len) * scale;
        fz = (fz / len) * scale;
        if (Math.abs(this.dx) < 0.003 && Math.abs(this.dz) < 0.003 && Math.hypot(fx, fy, fz) < 0.0045000000000000005) {
          const l2 = Math.hypot(fx, fy, fz);
          fx = (fx / l2) * 0.0045000000000000005;
          fy = (fy / l2) * 0.0045000000000000005;
          fz = (fz / l2) * 0.0045000000000000005;
        }
        this.dx += fx;
        this.dy += fy;
        this.dz += fz;
      }
    }
    return inFluid;
  }

  isPushedByFluid(): boolean {
    return true;
  }

  /** vanilla FLAG_SWIMMING: swimming (a drowned going after something in the water) */
  swimming = false;

  /** vanilla updateSwimming (each tick, once the fluids are known) */
  protected updateSwimming(): void {}

  get isInWaterOrRain(): boolean {
    return this.inWater;
  }

  distanceToSqr(x: number, y: number, z: number): number {
    const a = this.x - x, b = this.y - y, c = this.z - z;
    return a * a + b * b + c * c;
  }

  lookVector(): [number, number, number] {
    const pr = (this.pitch * Math.PI) / 180, yr = (this.yaw * Math.PI) / 180;
    return [-Math.sin(yr) * Math.cos(pr), -Math.sin(pr), Math.cos(yr) * Math.cos(pr)];
  }

  /** vanilla Entity.customName: a name tag's, an anvil-named spawn egg's, a command's (null: none) */
  customName: string | null = null;
  /** vanilla CustomNameVisible: the name shows over it whether it's looked at or not */
  customNameVisible = false;

  /** vanilla Entity.setCustomName */
  setCustomName(name: string | null): void {
    this.customName = name;
  }

  hasCustomName(): boolean {
    return this.customName !== null;
  }

  /** vanilla Entity.getRopeHoldPosition: where a lead it holds hangs from (seven-tenths of its eyes' height) */
  ropeHoldPosition(p: number): [number, number, number] {
    return [this.lerpX(p), this.lerpY(p) + this.eyeHeight * 0.7, this.lerpZ(p)];
  }

  /** vanilla Entity.kill (/kill): gone for good */
  kill(): void {
    this.remove();
    this.level.gameEvent?.('entity_die', this.x, this.y, this.z, { entity: this });
  }

  /** vanilla Entity.onBelowWorld: fallen out of the world, gone (living things take the void's damage instead) */
  protected onBelowWorld(): void {
    this.remove();
  }

  remove(): void {
    this.removed = true;
    // vanilla setRemoved: the riders get off, and a removed rider leaves its seat
    if (this.passengers.length) this.ejectPassengers();
    if (this.vehicle) this.stopRiding();
  }
}

/** per level, the entities other entities collide with (refreshed each tick, and whenever one is added) */
const SOLID = new WeakMap<Level, { time: number; count: number; list: Entity[] }>();
function solidEntities(level: Level): Entity[] {
  let c = SOLID.get(level);
  if (!c || c.time !== level.gameTime || c.count !== level.entities.length) {
    c = { time: level.gameTime, count: level.entities.length, list: level.entities.filter((e) => e.canBeCollidedWith() && !e.removed) };
    SOLID.set(level, c);
  }
  return c.list;
}

const INSIDE_NONE = 0, INSIDE_FIRE = 1, INSIDE_LAVA = 2, INSIDE_COBWEB = 3, INSIDE_BERRY_BUSH = 4, INSIDE_CACTUS = 5, INSIDE_DRIPLEAF = 6, INSIDE_PORTAL = 7, INSIDE_SOUL_FIRE = 8;
/** the block has its own entityInside (pressure plates, wooden buttons) */
const INSIDE_BEHAVIOR = 9;
let INSIDE: Uint8Array | null = null;

/** which vanilla entityInside behaviour a block has (lazy per-block table) */
function insideKind(st: number): number {
  if (!INSIDE) {
    INSIDE = new Uint8Array(BLOCKS.length);
    const kinds: Record<string, number> = { fire: INSIDE_FIRE, soul_fire: INSIDE_SOUL_FIRE, lava: INSIDE_LAVA, cobweb: INSIDE_COBWEB, sweet_berry_bush: INSIDE_BERRY_BUSH, cactus: INSIDE_CACTUS, big_dripleaf: INSIDE_DRIPLEAF, nether_portal: INSIDE_PORTAL };
    BLOCKS.forEach((b, i) => (INSIDE![i] = kinds[b.name] ?? (behaviorOfBlock(i)?.entityInside ? INSIDE_BEHAVIOR : INSIDE_NONE)));
  }
  return INSIDE[STATE_BLOCK[st]];
}

/**
 * (Stage 5: ocean) the block holding `e` up, when it's one with the `hook` (vanilla getOnPosLegacy through
 * mainSupportingBlockPos: of the blocks whose shapes are just under its feet, the one nearest it). Only looked for
 * when one of the blocks under it has such a hook
 */
function floorWithHook(e: Entity, hook: 'stepOn' | 'fallOn'): [number, number, number, number] | null {
  const bb = e.bb, w = e.level.world;
  const y = Math.floor(bb.minY - 1e-6);
  const x0 = Math.floor(bb.minX), x1 = Math.floor(bb.maxX - 1e-7), z0 = Math.floor(bb.minZ), z1 = Math.floor(bb.maxZ - 1e-7);
  let any = false;
  for (let x = x0; x <= x1 && !any; x++) for (let z = z0; z <= z1 && !any; z++) if (behaviorOf(w.getState(x, y, z))?.[hook]) any = true;
  if (!any) return null;
  const under = new AABB(bb.minX, bb.minY - 1e-6, bb.minZ, bb.maxX, bb.minY, bb.maxZ);
  let best: [number, number, number, number] | null = null, bd = Infinity;
  for (let x = x0; x <= x1; x++)
    for (let z = z0; z <= z1; z++) {
      const st = w.getState(x, y, z);
      const boxes = COLLISION[st];
      if (!boxes || !boxes.some((c) => under.intersectsRaw(x + c[0], y + c[1], z + c[2], x + c[3], y + c[4], z + c[5]))) continue;
      const d = (x + 0.5 - e.x) ** 2 + (y + 0.5 - e.y) ** 2 + (z + 0.5 - e.z) ** 2;
      if (d < bd) {
        bd = d;
        best = [x, y, z, st];
      }
    }
  return best && behaviorOf(best[3])?.[hook] ? best : null;
}
