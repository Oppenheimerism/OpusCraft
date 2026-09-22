// The player: input-driven movement (vanilla LocalPlayer/Player behaviour),
// abilities, sprinting, sneaking, flying, food.

import { LivingEntity } from './living';
import type { Entity } from './entity';
import { FLUID_WATER } from '../world/fluids';
import type { Level } from '../game/level';
import { Inventory } from '../item/inventory';
import { FoodData } from './food';

export type GameMode = 'survival' | 'creative' | 'adventure' | 'spectator';

export interface PlayerInput {
  forward: boolean;
  back: boolean;
  left: boolean;
  right: boolean;
  jump: boolean;
  sneak: boolean;
  sprint: boolean;
}

export class Player extends LivingEntity {
  readonly type = 'player';
  gameMode: GameMode = 'survival';
  flying = false;
  mayFly = false;
  instabuild = false;
  invulnerable = false;
  flySpeed = 0.05;
  crouching = false;
  input: PlayerInput = { forward: false, back: false, left: false, right: false, jump: false, sneak: false, sprint: false };
  private sprintTriggerTime = 0;
  private jumpTriggerTime = 0;
  private wasForward = false;
  private wasJump = false;
  /** view bobbing */
  bob = 0;
  bobO = 0;
  /** first-person hand sway (vanilla LocalPlayer xBob/yBob) */
  xBob = 0;
  yBob = 0;
  xBobO = 0;
  yBobO = 0;
  /** attack cooldown (1.9+ combat) */
  attackStrengthTicker = 0;
  private lastHeld: unknown = null;
  /** camera eye height smoothing */
  eyeHeightCam = 1.62;
  eyeHeightCamO = 1.62;
  readonly inventory = new Inventory();
  readonly food = new FoodData();
  xpLevel = 0;
  xpProgress = 0;
  xpTotal = 0;
  air = 300;
  usingItemTicks = 0;
  spawnX = 0;
  spawnY = 64;
  spawnZ = 0;
  onStepSound: ((p: Player) => void) | null = null;
  onSwimSound: ((p: Player) => void) | null = null;
  onHurtSound: ((p: Player, source: string) => void) | null = null;
  onFall: ((p: Player, dmg: number, dist: number) => void) | null = null;
  onDeath: ((p: Player, source: string) => void) | null = null;
  lastDamageSource = '';

  constructor(level: Level) {
    super(level);
    this.setSize(0.6, 1.8);
    this.health = 20;
    this.maxHealth = 20;
  }

  override get eyeHeight(): number {
    return this.crouching ? 1.27 : 1.62;
  }

  setGameMode(m: GameMode): void {
    this.gameMode = m;
    const creative = m === 'creative';
    this.mayFly = creative || m === 'spectator';
    this.instabuild = creative;
    this.invulnerable = creative || m === 'spectator';
    if (!this.mayFly) this.flying = false;
    if (m === 'spectator') this.flying = true;
    this.noPhysics = m === 'spectator';
  }

  override flyingSpeed(): number {
    if (this.flying) return this.sprinting ? this.flySpeed * 2 : this.flySpeed;
    return this.sprinting ? 0.025999999 : 0.02;
  }

  protected override makesStepSounds(): boolean {
    return !this.flying;
  }

  protected override playStepSound(): void {
    this.onStepSound?.(this);
  }

  protected override playSwimSound(): void {
    this.onSwimSound?.(this);
  }

  protected override isSneakingForEdges(): boolean {
    return this.crouching && !this.flying;
  }

  protected override isSuppressingSlidingDown(): boolean {
    return this.crouching;
  }

  override tick(): void {
    // vanilla LocalPlayer.aiStep input handling happens in serverAiStep via input state
    this.bobO = this.bob;
    this.xBobO = this.xBob;
    this.yBobO = this.yBob;
    this.xBob += (this.pitch - this.xBob) * 0.5;
    this.yBob += (this.yaw - this.yBob) * 0.5;
    this.attackStrengthTicker++;
    const held = this.inventory.selectedItem?.item ?? null;
    if (held !== this.lastHeld) {
      this.lastHeld = held;
      this.resetAttackStrength();
    }
    this.eyeHeightCamO = this.eyeHeightCam;
    this.eyeHeightCam += (this.eyeHeight - this.eyeHeightCam) * 0.5;
    super.tick();
    // bob
    let f = 0;
    if (this.onGround && this.health > 0) f = Math.min(0.1, Math.sqrt(this.dx * this.dx + this.dz * this.dz));
    this.bob += (f - this.bob) * 0.4;
    this.food.tick(this);
    this.tickAir();
    if (this.flying) this.fallDistance = 0;
  }

  private tickAir(): void {
    if (this.eyeFluid === FLUID_WATER && !this.invulnerable) {
      this.air--;
      if (this.air === -20) {
        this.air = 0;
        this.hurt(2, 'drown');
      }
    } else if (this.air < 300) {
      this.air = Math.min(300, this.air + 4);
    }
  }

  protected override serverAiStep(): void {
    const inp = this.input;
    // crouching pose (vanilla: shift while on ground / not flying)
    const wantCrouch = inp.sneak && !this.flying && !this.inWater;
    if (wantCrouch !== this.crouching) {
      if (wantCrouch) {
        this.crouching = true;
        this.setSize(0.6, 1.5);
      } else {
        // only stand up if there's room
        const tall = this.bb.clone();
        tall.maxY = tall.minY + 1.8;
        if (this.collisionBoxes(tall.inflate(-1e-4, 0, -1e-4)).length === 0) {
          this.crouching = false;
          this.setSize(0.6, 1.8);
        }
      }
    }
    let fwd = (inp.forward ? 1 : 0) - (inp.back ? 1 : 0);
    let left = (inp.left ? 1 : 0) - (inp.right ? 1 : 0);
    if (this.crouching) {
      fwd *= 0.3;
      left *= 0.3;
    }
    if (this.usingItemTicks > 0) {
      fwd *= 0.2;
      left *= 0.2;
    }
    // sprinting: double-tap forward or sprint key
    const canSprint = this.food.level > 6 || this.mayFly;
    const forwardDown = inp.forward;
    if (this.sprintTriggerTime > 0) this.sprintTriggerTime--;
    if (!this.sprinting && canSprint && fwd >= 0.8 && !this.crouching && this.usingItemTicks === 0) {
      if (forwardDown && !this.wasForward && (this.onGround || this.flying || this.inWater)) {
        if (this.sprintTriggerTime > 0) this.sprinting = true;
        else this.sprintTriggerTime = 7;
      }
      if (inp.sprint) this.sprinting = true;
    }
    if (this.sprinting && (fwd < 0.8 || (this.horizontalCollision && !this.flying) || !canSprint || this.crouching && !this.flying)) this.sprinting = false;
    this.wasForward = forwardDown;
    // flying toggle: double-tap jump
    if (this.jumpTriggerTime > 0) this.jumpTriggerTime--;
    if (inp.jump && !this.wasJump && this.mayFly) {
      if (this.jumpTriggerTime === 0) this.jumpTriggerTime = 7;
      else if (this.gameMode !== 'spectator') {
        this.flying = !this.flying;
        this.jumpTriggerTime = 0;
      }
    }
    this.wasJump = inp.jump;
    if (this.flying) {
      let v = 0;
      if (inp.sneak) v--;
      if (inp.jump) v++;
      if (v !== 0) this.dy += v * this.flySpeed * 3;
      if (this.onGround && this.gameMode !== 'spectator') this.flying = false;
    }
    this.xxa = left;
    this.zza = fwd;
    this.jumping = inp.jump && !this.flying;
  }

  override travel(sx: number, sy: number, sz: number): void {
    if (this.flying) {
      const d0 = this.dy;
      super.travel(sx, sy, sz);
      this.dy = d0 * 0.6;
      this.fallDistance = 0;
    } else super.travel(sx, sy, sz);
  }

  override jumpFromGround(): void {
    super.jumpFromGround();
    this.food.addExhaustion(this.sprinting ? 0.2 : 0.05);
  }

  override hurt(amount: number, source: string, attacker?: Entity): boolean {
    if (this.invulnerable && source !== 'void' && source !== 'genericKill') return false;
    const rules = this.level.gameRules;
    if ((source === 'fall' && !rules.fallDamage) || (source === 'drown' && !rules.drowningDamage)) return false;
    if ((source === 'lava' || source === 'inFire' || source === 'onFire') && !rules.fireDamage) return false;
    this.lastDamageSource = source;
    const ok = super.hurt(amount, source, attacker);
    if (ok) this.food.addExhaustion(0.1);
    return ok;
  }

  protected override onHurt(source: string): void {
    this.onHurtSound?.(this, source);
  }

  protected override onFallDamage(dmg: number, dist: number): void {
    this.onFall?.(this, dmg, dist);
  }

  protected override causeFallDamage(dist: number): void {
    if (this.mayFly && this.gameMode === 'creative') return;
    super.causeFallDamage(dist);
  }

  override die(source: string): void {
    super.die(source);
    this.onDeath?.(this, source);
  }

  protected override tickDeath(): void {
    this.deathTime++;
    // players are not removed; death screen handles respawn
  }

  attackStrengthDelay(): number {
    const it = this.inventory.selectedItem?.item;
    const speed = it ? it.attackSpeed : 4;
    return 20 / speed;
  }

  attackStrengthScale(adjust: number): number {
    return Math.max(0, Math.min(1, (this.attackStrengthTicker + adjust) / this.attackStrengthDelay()));
  }

  resetAttackStrength(): void {
    this.attackStrengthTicker = 0;
  }

  /** FOV modifier (vanilla AbstractClientPlayer.getFieldOfViewModifier) */
  fovModifier(): number {
    let f = 1;
    if (this.flying) f *= 1.1;
    const walk = 0.1;
    const speed = this.movementSpeed();
    f *= (speed / walk + 1) / 2;
    if (this.flySpeed === 0 || isNaN(f) || !isFinite(f)) f = 1;
    return f;
  }
}
