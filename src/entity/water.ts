// Water creatures (vanilla WaterAnimal / Squid): swimming with tentacle
// strokes, fleeing when hurt, suffocating on land.

import { Mob, LootEntry, MobCategory } from './mob';
import type { Level } from '../game/level';
import { Goal } from './ai/goal';
import { reducedTickDelay } from './ai/goal';
import type { Entity } from './entity';
import { FLAGS, F_WATER, BLOCKS, STATE_BLOCK } from '../world/block';
import { SEA_LEVEL } from '../world/constants';
import type { Player } from './player';
import type { ItemStack } from '../item/item';

export abstract class WaterAnimal extends Mob {
  readonly category: MobCategory = 'water_creature';

  override canBreatheUnderwater(): boolean {
    return true;
  }

  override baseTick(): void {
    super.baseTick();
    // vanilla WaterAnimal.handleAirSupply
    if (this.isAlive && !this.inWater) {
      this.air--;
      if (this.air === -20) {
        this.air = 0;
        this.hurt(2, 'drown');
      }
    } else this.air = 300;
  }

  override experienceReward(): number {
    return 1 + this.random.nextInt(3);
  }

  override isPushedByFluid(): boolean {
    return false;
  }

  override ambientSoundInterval(): number {
    return 120;
  }

  /** (Stage 5: ocean) vanilla WaterAnimal.checkSpawnObstruction: only other entities get in its way, not the water */
  override checkSpawnObstruction(): boolean {
    return true;
  }

  /** (Stage 5: ocean) vanilla mobInteract (a fish scooped up in a bucket, a dolphin fed); true if the click was used */
  interact(_p: Player, _stack: ItemStack | null): boolean {
    return false;
  }

  /** vanilla checkSurfaceWaterAnimalSpawnRules */
  static checkSurfaceSpawn(level: Level, x: number, y: number, z: number): boolean {
    const w = level.world;
    return y >= SEA_LEVEL - 13 && y <= SEA_LEVEL && (FLAGS[w.getState(x, y - 1, z)] & F_WATER) !== 0 && BLOCKS[STATE_BLOCK[w.getState(x, y + 1, z)]].name === 'water';
  }
}

class SquidRandomMovementGoal extends Goal {
  constructor(readonly squid: Squid) {
    super();
  }
  canUse(): boolean {
    return true;
  }
  override tick(): void {
    const s = this.squid;
    if (s.noActionTime > 100) s.setMovementVector(0, 0, 0);
    else if (s.random.nextInt(reducedTickDelay(50)) === 0 || !s.wasInWater || !s.hasMovementVector()) {
      const f = s.random.nextFloat() * Math.PI * 2;
      s.setMovementVector(Math.cos(f) * 0.2, -0.1 + s.random.nextFloat() * 0.2, Math.sin(f) * 0.2);
    }
  }
}

class SquidFleeGoal extends Goal {
  private fleeTicks = 0;
  constructor(readonly squid: Squid) {
    super();
  }
  canUse(): boolean {
    const a = this.squid.lastHurtByMob;
    return this.squid.inWater && !!a && this.squid.distanceToSqr(a.x, a.y, a.z) < 100;
  }
  override start(): void {
    this.fleeTicks = 0;
  }
  override requiresUpdateEveryTick(): boolean {
    return true;
  }
  override canContinueToUse(): boolean {
    return this.canUse() && this.fleeTicks < 100;
  }
  override tick(): void {
    this.fleeTicks++;
    const s = this.squid, a = s.lastHurtByMob;
    if (!a) return;
    let vx = s.x - a.x, vy = s.y - a.y, vz = s.z - a.z;
    const w = s.level.world;
    const st = w.getState(Math.floor(s.x + vx), Math.floor(s.y + vy), Math.floor(s.z + vz));
    if (!(FLAGS[st] & F_WATER)) vy = 0;
    const l = Math.sqrt(vx * vx + vy * vy + vz * vz);
    if (l > 0) {
      vx /= l;
      vy /= l;
      vz /= l;
      let f = 3;
      if (l > 5) f -= (l - 5) / 5;
      if (f > 0) {
        vx *= f;
        vy *= f;
        vz *= f;
      }
    }
    if (vy === 0) vy = 0;
    s.setMovementVector(vx / 20, vy / 20, vz / 20);
    if (this.fleeTicks % 10 === 5) s.level.particles.spawn?.('bubble', s.x, s.y, s.z, 0, 0, 0);
  }
}

export class Squid extends WaterAnimal {
  readonly type: string = 'squid';
  xBodyRot = 0;
  xBodyRotO = 0;
  zBodyRot = 0;
  zBodyRotO = 0;
  tentacleMovement = 0;
  oldTentacleMovement = 0;
  tentacleAngle = 0;
  oldTentacleAngle = 0;
  private swimSpeed = 0;
  private tentacleSpeed = 0;
  private rotateSpeed = 0;
  private tx = 0;
  private ty = 0;
  private tz = 0;

  constructor(level: Level) {
    super(level);
    this.setSize(0.8, 0.8);
    this.maxHealth = this.health = 10;
    this.tentacleSpeed = (1 / (Math.random() + 1)) * 0.2;
  }

  protected registerGoals(): void {
    this.goalSelector.addGoal(0, new SquidRandomMovementGoal(this));
    this.goalSelector.addGoal(1, new SquidFleeGoal(this));
  }

  override get eyeHeight(): number {
    return 0.8 * 0.5;
  }

  setMovementVector(x: number, y: number, z: number): void {
    this.tx = x;
    this.ty = y;
    this.tz = z;
  }

  hasMovementVector(): boolean {
    return this.tx !== 0 || this.ty !== 0 || this.tz !== 0;
  }

  override aiStep(): void {
    super.aiStep();
    this.xBodyRotO = this.xBodyRot;
    this.zBodyRotO = this.zBodyRot;
    this.oldTentacleMovement = this.tentacleMovement;
    this.oldTentacleAngle = this.tentacleAngle;
    this.tentacleMovement += this.tentacleSpeed;
    if (this.tentacleMovement > Math.PI * 2) {
      this.tentacleMovement -= Math.PI * 2;
      if (this.random.nextInt(10) === 0) this.tentacleSpeed = (1 / (this.random.nextFloat() + 1)) * 0.2;
    }
    if (this.inWater) {
      if (this.tentacleMovement < Math.PI) {
        const f = this.tentacleMovement / Math.PI;
        this.tentacleAngle = Math.sin(f * f * Math.PI) * Math.PI * 0.25;
        if (f > 0.75) {
          this.swimSpeed = 1;
          this.rotateSpeed = 1;
        } else this.rotateSpeed *= 0.8;
      } else {
        this.tentacleAngle = 0;
        this.swimSpeed *= 0.9;
        this.rotateSpeed *= 0.99;
      }
      this.dx = this.tx * this.swimSpeed;
      this.dy = this.ty * this.swimSpeed;
      this.dz = this.tz * this.swimSpeed;
      const d0 = Math.sqrt(this.dx * this.dx + this.dz * this.dz);
      this.bodyYaw += (-Math.atan2(this.dx, this.dz) * (180 / Math.PI) - this.bodyYaw) * 0.1;
      this.yaw = this.bodyYaw;
      this.zBodyRot += Math.PI * this.rotateSpeed * 1.5;
      this.xBodyRot += (-Math.atan2(d0, this.dy) * (180 / Math.PI) - this.xBodyRot) * 0.1;
    } else {
      this.tentacleAngle = Math.abs(Math.sin(this.tentacleMovement)) * Math.PI * 0.25;
      this.dx = 0;
      this.dz = 0;
      this.dy = (this.dy - 0.08) * 0.98;
      this.xBodyRot += (-90 - this.xBodyRot) * 0.02;
    }
  }

  /** vanilla Squid.travel: just move by the delta (no input physics) */
  override travel(): void {
    this.move(this.dx, this.dy, this.dz);
  }

  protected override updateBodyRotation(): void {}

  override hurt(amount: number, source: string, attacker?: Entity | null, direct?: Entity | null): boolean {
    const ok = super.hurt(amount, source, attacker, direct);
    if (ok && attacker) {
      this.playSound(this.squirtSound(), this.soundVolume(), this.voicePitch());
      // vanilla spawnInk: squirt a cloud of ink
      for (let i = 0; i < 30; i++) {
        const r = this.random;
        this.level.particles.spawn?.(this.inkParticle(), this.x, this.y + this.height * 0.5, this.z, (r.nextFloat() - 0.5) * 0.2, (r.nextFloat() - 0.5) * 0.2, (r.nextFloat() - 0.5) * 0.2);
      }
    }
    return ok;
  }

  /** (Stage 5: ocean) vanilla getSquirtSound / getInkParticle (the glow squid's are its own) */
  protected squirtSound(): string {
    return 'entity.squid.squirt';
  }
  protected inkParticle(): string {
    return 'squid_ink';
  }

  override lootTable(): LootEntry[] {
    return [{ item: 'ink_sac', min: 1, max: 3 }];
  }
  override soundVolume(): number {
    return 0.4;
  }
  override ambientSound(): string {
    return 'entity.squid.ambient';
  }
  override hurtSound(): string {
    return 'entity.squid.hurt';
  }
  override deathSound(): string {
    return 'entity.squid.death';
  }
}
