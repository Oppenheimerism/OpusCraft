// Arrows (vanilla AbstractArrow / Arrow): flight, sticking into blocks,
// entity hits with velocity-scaled damage, critical arrows, the bow's enchantments, pickup,
// a crossbow's piercing. The thrown trident (thrownTrident.ts) is one too.

import { Entity } from './entity';
import type { Level } from '../game/level';
import { LivingEntity } from './living';
import { clipBlocks } from '../game/raycast';
import { onProjectileHit } from '../game/blockRules';
import { AABB } from '../core/aabb';
import { COLLISION } from '../world/block';
import { ItemStack } from '../item/item';
import { allEffects, contentsOf, potionColor, potionEffects } from '../item/potions';
import { MobEffectInstance } from './effects';
import type { Player } from './player';
import type { SavedEntity } from './mob';
import { ITEMS, cloneTag } from '../item/item';
import { ItemEntity } from './itemEntity';
import { damageBonus, levelOf } from '../item/enchantHelper';
import { doPostAttackEffects } from '../game/enchantEffects';
import { projectileShot, projectileLandedOn, projectileLandedAt } from '../game/vibrations';

const RAD = 180 / Math.PI;

export type Pickup = 'disallowed' | 'allowed' | 'creative_only';

export class Arrow extends Entity {
  readonly type: string = 'arrow';
  owner: Entity | null = null;
  /** a saved arrow the player shot: its owner is the player once they're back in the world */
  private ownerIsPlayer = false;
  private leftOwner = false;
  inGround = false;
  inGroundTime = 0;
  life = 0;
  shakeTime = 0;
  private lastState = -1;
  baseDamage = 2;
  crit = false;
  pickup: Pickup = 'disallowed';
  /** vanilla firedFromWeapon: the bow it was shot from (power, punch), or the crossbow */
  weapon: ItemStack | null = null;
  /** vanilla pierceLevel (a crossbow's Piercing): passes through this many entities more than one */
  pierceLevel = 0;
  /** vanilla piercingIgnoreEntityIds / piercedAndKilledEntities */
  private pierced: Set<Entity> | null = null;
  private piercedAndKilled: LivingEntity[] | null = null;
  /** vanilla soundEvent: what it hits with (a crossbow's arrows item.crossbow.hit until they land) */
  hitSound = 'entity.arrow.hit';
  /** vanilla pickupItemStack: what picking it up gives back (a tipped arrow keeps its potion) */
  protected pickupStack: ItemStack = ItemStack.of('arrow');
  /** vanilla Arrow.ID_EFFECT_COLOR: its potion's colour, -1 without one */
  color = -1;
  protected readonly rnd = Math.random;

  constructor(level: Level, owner?: LivingEntity | null) {
    super(level);
    this.setSize(0.5, 0.5);
    if (owner) {
      this.owner = owner;
      this.moveTo(owner.x, owner.y + owner.eyeHeight - 0.1, owner.z, owner.yaw, owner.pitch);
      if (owner.type === 'player') this.pickup = 'allowed';
    }
  }

  override get eyeHeight(): number {
    return 0.13;
  }

  /** vanilla Projectile.shoot */
  shoot(x: number, y: number, z: number, velocity: number, inaccuracy: number): void {
    const l = Math.sqrt(x * x + y * y + z * z) || 1;
    const tri = () => 0.0172275 * inaccuracy * (this.rnd() - this.rnd());
    const vx = (x / l + tri()) * velocity, vy = (y / l + tri()) * velocity, vz = (z / l + tri()) * velocity;
    this.dx = vx;
    this.dy = vy;
    this.dz = vz;
    const h = Math.sqrt(vx * vx + vz * vz);
    this.yaw = Math.atan2(vx, vz) * RAD;
    this.pitch = Math.atan2(vy, h) * RAD;
    this.yawO = this.yaw;
    this.pitchO = this.pitch;
  }

  /** vanilla Projectile.shootFromRotation (adds the shooter's motion) */
  shootFromRotation(shooter: Entity, xRot: number, yRot: number, zOff: number, velocity: number, inaccuracy: number): void {
    const f = -Math.sin(yRot / RAD) * Math.cos(xRot / RAD);
    const f1 = -Math.sin((xRot + zOff) / RAD);
    const f2 = Math.cos(yRot / RAD) * Math.cos(xRot / RAD);
    this.shoot(f, f1, f2, velocity, inaccuracy);
    this.dx += shooter.x - shooter.xo;
    this.dz += shooter.z - shooter.zo;
    if (!shooter.onGround) this.dy += shooter.y - shooter.yo;
  }

  /** vanilla AbstractArrow.setPickupItemStack + Arrow.updateColor: the stack it came from, whose potion it carries */
  setPickupStack(stack: ItemStack): void {
    this.pickupStack = stack.copyWithCount(1);
    const c = contentsOf(this.pickupStack);
    this.color = c ? potionColor(c) : -1;
  }

  get pickupItem(): ItemStack {
    return this.pickupStack;
  }

  /** vanilla Arrow.makeParticle: swirls in its potion's colour */
  private makeParticle(n: number): void {
    if (this.color === -1) return;
    for (let j = 0; j < n; j++) {
      const x = this.x + this.width * (2 * this.rnd() - 1) * 0.5, y = this.y + this.height * this.rnd(), z = this.z + this.width * (2 * this.rnd() - 1) * 0.5;
      this.level.particles.entityEffect?.(x, y, z, this.color, 1);
    }
  }

  /** vanilla setBaseDamageFromMob */
  setBaseDamageFromMob(velocity: number, difficulty: number): void {
    this.baseDamage = velocity * 2 + difficulty * 0.11 + 0.57425 * (this.rnd() - this.rnd());
  }

  override tick(): void {
    // (vanilla Projectile.tick: the shot is a game event)
    projectileShot(this);
    this.tickArrow();
    // vanilla Arrow.tick: a tipped arrow trails its colour (in the ground, a wisp every quarter second); stuck for half
    // a minute its potion is spent, with a last puff, and it's a plain arrow again
    if (this.removed) return;
    if (this.inGround) {
      if (this.inGroundTime % 5 === 0) this.makeParticle(1);
      if (this.inGroundTime !== 0 && this.color !== -1 && this.inGroundTime >= 600) {
        this.makeParticle(20);
        this.setPickupStack(ItemStack.of('arrow'));
      }
    } else this.makeParticle(2);
  }

  /** vanilla AbstractArrow.tick; with no physics (a loyal trident coming back) it flies through everything, hitting nothing */
  private tickArrow(): void {
    this.baseTick();
    if (this.ownerIsPlayer && !this.owner && this.level.player) this.owner = this.level.player;
    const w = this.level.world;
    const noPhysics = this.noPhysics;
    if (this.pitchO === 0 && this.yawO === 0) {
      const h = Math.sqrt(this.dx * this.dx + this.dz * this.dz);
      this.yaw = this.yawO = Math.atan2(this.dx, this.dz) * RAD;
      this.pitch = this.pitchO = Math.atan2(this.dy, h) * RAD;
    }
    const bx = Math.floor(this.x), by = Math.floor(this.y), bz = Math.floor(this.z);
    const st = w.getState(bx, by, bz);
    const boxes = COLLISION[st];
    if (boxes && boxes.length && !noPhysics) {
      for (const b of boxes) {
        if (new AABB(bx + b[0], by + b[1], bz + b[2], bx + b[3], by + b[4], bz + b[5]).contains(this.x, this.y, this.z)) {
          this.inGround = true;
          break;
        }
      }
    }
    if (this.shakeTime > 0) this.shakeTime--;
    if (this.inWater) this.clearFire();
    if (this.inGround && !noPhysics) {
      if (this.lastState !== st && this.shouldFall()) {
        this.inGround = false;
        this.dx *= this.rnd() * 0.2;
        this.dy *= this.rnd() * 0.2;
        this.dz *= this.rnd() * 0.2;
        this.life = 0;
      } else this.tickDespawn();
      this.inGroundTime++;
      return;
    }
    this.inGroundTime = 0;
    if (!this.leftOwner) this.leftOwner = this.checkLeftOwner();
    const x0 = this.x, y0 = this.y, z0 = this.z;
    let x1 = x0 + this.dx, y1 = y0 + this.dy, z1 = z0 + this.dz;
    const blockHit = clipBlocks(w, x0, y0, z0, x1, y1, z1);
    if (blockHit) {
      x1 = blockHit.px;
      y1 = blockHit.py;
      z1 = blockHit.pz;
    }
    let ent = noPhysics ? null : this.findHitEntity(x0, y0, z0, x1, y1, z1);
    if (!ent && blockHit && !noPhysics) {
      onProjectileHit(this.level, blockHit.x, blockHit.y, blockHit.z, blockHit, this);
      this.onHitBlock(blockHit.px, blockHit.py, blockHit.pz, w.getState(blockHit.x, blockHit.y, blockHit.z));
      projectileLandedAt(this, blockHit.x, blockHit.y, blockHit.z);
    }
    // vanilla tick's hit loop: a piercing arrow goes on to the next entity along this tick's path (the block
    // behind them waits for the next tick)
    while (ent && !this.removed) {
      this.onHitEntity(ent);
      projectileLandedOn(this, ent);
      if (this.pierceLevel <= 0) break;
      ent = this.findHitEntity(x0, y0, z0, x1, y1, z1);
    }
    if (this.removed) return;
    const vx = this.dx, vy = this.dy, vz = this.dz;
    if (this.crit) {
      for (let i = 0; i < 4; i++) this.level.particles.spawn?.('crit', this.x + (vx * i) / 4, this.y + (vy * i) / 4, this.z + (vz * i) / 4, -vx, -vy + 0.2, -vz);
    }
    const nx = this.x + vx, ny = this.y + vy, nz = this.z + vz;
    const h = Math.sqrt(vx * vx + vz * vz);
    // (with no physics it's turned round: a loyal trident comes back handle first)
    this.yaw = lerpRotation(this.yawO, (noPhysics ? Math.atan2(-vx, -vz) : Math.atan2(vx, vz)) * RAD);
    this.pitch = lerpRotation(this.pitchO, Math.atan2(vy, h) * RAD);
    let f = 0.99;
    if (this.inWater) {
      for (let j = 0; j < 4; j++) this.level.particles.spawn?.('bubble', nx - vx * 0.25, ny - vy * 0.25, nz - vz * 0.25, vx, vy, vz);
      f = this.waterInertia();
    }
    this.dx *= f;
    this.dy *= f;
    this.dz *= f;
    if (!noPhysics) this.dy -= 0.05;
    this.setPos(nx, ny, nz);
    // vanilla: an arrow flying through fire catches alight; water and rain put it out
    this.checkInsideBlocks();
    if (this.isInWaterOrRainNow()) this.clearFire();
  }

  /** vanilla AbstractArrow.getWaterInertia */
  protected waterInertia(): number {
    return 0.6;
  }

  /** vanilla AbstractArrow.tickDespawn: a minute stuck and it's gone */
  protected tickDespawn(): void {
    if (++this.life >= 1200) this.remove();
  }

  private shouldFall(): boolean {
    const b = new AABB(this.x - 0.06, this.y - 0.06, this.z - 0.06, this.x + 0.06, this.y + 0.06, this.z + 0.06);
    return this.collisionBoxes(b).length === 0;
  }

  private checkLeftOwner(): boolean {
    const o = this.owner;
    if (!o) return true;
    const box = this.bb.expandTowards(this.dx, this.dy, this.dz).inflate(1);
    return !o.bb.intersects(box);
  }

  private canHit(e: Entity): boolean {
    // (vanilla canBeHitByProjectile: whatever can be picked — the living, end crystals, the dragon's parts, a shulker's
    // bullet, item frames)
    if (!(e instanceof LivingEntity || e.type === 'end_crystal' || e.type === 'ender_dragon' || e.type === 'shulker_bullet' || e.type === 'item_frame' || e.type === 'glow_item_frame') || !e.isPickable()) return false;
    if (e === this.owner && !this.leftOwner) return false;
    if (e.type === 'player' && (e as Player).gameMode === 'spectator') return false;
    return !this.pierced?.has(e);
  }

  protected findHitEntity(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): Entity | null {
    const box = this.bb.expandTowards(this.dx, this.dy, this.dz).inflate(1);
    let best: Entity | null = null, bd = Infinity;
    for (const e of this.level.getEntities(box, (e) => this.canHit(e), this)) {
      const h = e.bb.inflate(0.3).clip(x0, y0, z0, x1, y1, z1);
      if (!h) continue;
      if (h.t < bd) {
        bd = h.t;
        best = e;
      }
    }
    return best;
  }

  protected onHitEntity(e: Entity): void {
    const speed = Math.sqrt(this.dx * this.dx + this.dy * this.dy + this.dz * this.dz);
    // vanilla EnchantmentHelper.modifyDamage with the bow: power (+0.5·L + 0.5 for arrows) and any damage enchantment
    let base = this.baseDamage;
    const power = levelOf(this.weapon, 'power');
    if (this.weapon) base += damageBonus(this.weapon, e) + (power > 0 ? 0.5 * power + 0.5 : 0);
    let dmg = Math.ceil(Math.max(0, speed * base));
    if (this.pierceLevel > 0) {
      this.pierced ??= new Set();
      this.piercedAndKilled ??= [];
      // it has gone through all it can: the next one stops it
      if (this.pierced.size >= this.pierceLevel + 1) {
        this.remove();
        return;
      }
      this.pierced.add(e);
    }
    if (this.crit) dmg = Math.min(dmg + Math.floor(this.rnd() * (Math.floor(dmg / 2) + 2)), 2147483647);
    const owner = this.owner;
    if (owner instanceof LivingEntity && e instanceof LivingEntity) owner.lastHurtMob = e;
    const fire = e.remainingFireTicks;
    if (this.isOnFire() && e.type !== 'enderman') e.igniteForSeconds(5);
    if (e.hurt(dmg, 'arrow', owner ?? this, this)) {
      if (owner && owner === this.level.player) this.level.onPlayerArrowHit?.(e);
      if (e.type === 'enderman') return;
      if (e instanceof LivingEntity) {
        this.doKnockback(e);
        // the victim's thorns hurt the shooter
        doPostAttackEffects(e, owner, this.weapon, false);
        this.doPostHurtEffects(e);
        if (!e.isAlive && this.piercedAndKilled) this.piercedAndKilled.push(e);
        // vanilla KilledByCrossbowTrigger: everything this crossbow arrow has killed so far
        if (owner && owner === this.level.player && this.weapon?.item.id === 'crossbow') {
          if (this.piercedAndKilled) this.level.onPlayerCrossbowKill?.(this.piercedAndKilled);
          else if (!e.isAlive) this.level.onPlayerCrossbowKill?.([e]);
        }
      }
      this.level.sound.play(this.hitSound, this.x, this.y, this.z, 1, 1.2 / (this.rnd() * 0.2 + 0.9));
      if (this.pierceLevel <= 0) this.remove();
    } else {
      e.remainingFireTicks = fire;
      // deflect
      this.dx *= -0.1;
      this.dy *= -0.1;
      this.dz *= -0.1;
      this.yaw += 180;
      this.yawO += 180;
      if (this.dx * this.dx + this.dy * this.dy + this.dz * this.dz < 1e-7) {
        if (this.pickup === 'allowed') this.dropAsItem();
        this.remove();
      }
    }
  }

  /**
   * vanilla Arrow.doPostHurtEffects: its potion's effects on what it hit, for an eighth of their time (at least a
   * tick), and any custom ones in full
   */
  private doPostHurtEffects(e: LivingEntity): void {
    const c = contentsOf(this.pickupStack);
    if (!c) return;
    const source = this.owner ?? this;
    for (const inst of potionEffects(c.potion)) {
      const d = inst.isInfinite() || inst.duration === 0 ? inst.duration : Math.max(Math.floor(inst.duration / 8), 1);
      e.addEffect(new MobEffectInstance(inst.effect, d, inst.amplifier, inst.ambient, inst.visible), source);
    }
    for (const inst of allEffects({ customEffects: c.customEffects })) e.addEffect(inst, source);
  }

  /** vanilla AbstractArrow.doKnockback: punch pushes along the flight, 0.6 per level, less knockback resistance */
  private doKnockback(e: LivingEntity): void {
    const f = levelOf(this.weapon, 'punch');
    if (f <= 0) return;
    const d1 = Math.max(0, 1 - e.knockbackResistance());
    const h = Math.sqrt(this.dx * this.dx + this.dz * this.dz);
    if (h > 0 && d1 > 0) e.push((this.dx / h) * f * 0.6 * d1, 0.1, (this.dz / h) * f * 0.6 * d1);
  }

  protected dropAsItem(): void {
    const e = new ItemEntity(this.level, this.pickupStack.copy());
    e.moveTo(this.x, this.y + 0.1, this.z, Math.random() * 360, 0);
    e.dx = Math.random() * 0.2 - 0.1;
    e.dy = 0.2;
    e.dz = Math.random() * 0.2 - 0.1;
    this.level.addEntity(e);
  }

  private onHitBlock(px: number, py: number, pz: number, st: number): void {
    this.lastState = st;
    const vx = px - this.x, vy = py - this.y, vz = pz - this.z;
    this.dx = vx;
    this.dy = vy;
    this.dz = vz;
    const l = Math.sqrt(vx * vx + vy * vy + vz * vz) || 1;
    this.setPos(this.x - (vx / l) * 0.05, this.y - (vy / l) * 0.05, this.z - (vz / l) * 0.05);
    this.level.sound.play(this.hitSound, this.x, this.y, this.z, 1, 1.2 / (this.rnd() * 0.2 + 0.9));
    this.inGround = true;
    this.shakeTime = 7;
    this.crit = false;
    // once stuck it's a plain arrow: no more piercing, the ordinary hit sound
    this.pierceLevel = 0;
    this.hitSound = 'entity.arrow.hit';
    this.pierced = null;
    this.piercedAndKilled = null;
  }

  /** vanilla AbstractArrow.playerTouch: stuck in something (or flying back with no physics) and done shaking */
  playerTouch(p: Player): boolean {
    if (!(this.inGround || this.noPhysics) || this.shakeTime > 0) return false;
    const ok = this.tryPickup(p);
    if (ok) {
      p.take(this, 1);
      this.remove();
    }
    return ok;
  }

  /** vanilla AbstractArrow.tryPickup */
  protected tryPickup(p: Player): boolean {
    if (this.pickup === 'allowed') return p.inventory.add(this.pickupStack.copy(), p.gameMode === 'creative') === 0;
    if (this.pickup === 'creative_only') return p.gameMode === 'creative';
    return false;
  }

  /** vanilla AbstractArrow.addAdditionalSaveData: an arrow or trident is kept with its chunk */
  save(): SavedEntity {
    const s = this.pickupStack;
    return {
      id: this.type, x: this.x, y: this.y, z: this.z, yaw: this.yaw, pitch: this.pitch, dx: this.dx, dy: this.dy, dz: this.dz, health: 0, fire: this.remainingFireTicks,
      data: {
        item: s.item.id, ...(s.damage ? { damage: s.damage } : {}), ...(s.tag ? { tag: JSON.stringify(s.tag) } : {}),
        inGround: this.inGround, life: this.life, shake: this.shakeTime, pickup: this.pickup, crit: this.crit, damageBase: this.baseDamage, pierce: this.pierceLevel,
        ...(this.lastState >= 0 ? { inBlockState: this.lastState } : {}),
        ...(this.owner?.type === 'player' || this.ownerIsPlayer ? { ownerIsPlayer: true } : {}),
        ...this.saveData(),
      },
    };
  }

  load(d: SavedEntity): void {
    this.moveTo(d.x, d.y, d.z, d.yaw, d.pitch);
    this.yawO = d.yaw;
    this.pitchO = d.pitch;
    this.dx = d.dx;
    this.dy = d.dy;
    this.dz = d.dz;
    this.remainingFireTicks = d.fire;
    const v = d.data ?? {};
    const it = ITEMS.get(String(v.item));
    if (it) this.setPickupStack(new ItemStack(it, 1, Number(v.damage ?? 0), typeof v.tag === 'string' ? cloneTag(JSON.parse(v.tag)) : null));
    this.inGround = v.inGround === true;
    this.life = Number(v.life ?? 0);
    this.shakeTime = Number(v.shake ?? 0);
    this.pickup = (v.pickup as Pickup) ?? 'disallowed';
    this.crit = v.crit === true;
    this.baseDamage = Number(v.damageBase ?? 2);
    this.pierceLevel = Number(v.pierce ?? 0);
    this.lastState = Number(v.inBlockState ?? -1);
    this.ownerIsPlayer = v.ownerIsPlayer === true;
    this.leftOwner = true;
    this.loadData(v);
  }

  protected saveData(): Record<string, number | string | boolean> {
    return {};
  }
  protected loadData(_d: Record<string, number | string | boolean>): void {}
}

/** vanilla Projectile.lerpRotation */
function lerpRotation(prev: number, cur: number): number {
  while (cur - prev < -180) prev -= 360;
  while (cur - prev >= 180) prev += 360;
  return prev + (cur - prev) * 0.2;
}
