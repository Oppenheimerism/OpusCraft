// The player: input-driven movement (vanilla LocalPlayer/Player behaviour),
// abilities, sprinting, sneaking, flying, food.

import { LivingEntity } from './living';
import type { Entity } from './entity';
import { MOB_EFFECTS, MobEffectInstance } from './effects';
import { FLUID_WATER } from '../world/fluids';
import type { Level } from '../game/level';
import type { ItemStack } from '../item/item';
import { Inventory, type Hand } from '../item/inventory';
import { FoodData } from './food';
import { ExperienceOrb } from './xpOrb';
import { Arrow } from './arrow';
import { BLOCKS, STATE_BLOCK } from '../world/block';
import { wrapDegrees } from '../core/math';
import { findStandUpPosition } from '../game/sleep';
import { hurtAndBreak, oxygenBonus } from '../item/enchantHelper';
import { playerAttack } from '../game/combat';
import { tryToStartFallFlying } from './elytra';

export type GameMode = 'survival' | 'creative' | 'adventure' | 'spectator';

/** damage types with 0 exhaustion (vanilla damage_type/*.json "exhaustion": 0.0) */
const NO_EXHAUSTION = new Set(['magic', 'indirectMagic', 'wither', 'onFire', 'fall', 'drown', 'starve', 'inWall', 'cramming', 'void', 'genericKill', 'generic', 'flyIntoWall']);

export interface PlayerInput {
  forward: boolean;
  back: boolean;
  left: boolean;
  right: boolean;
  jump: boolean;
  sneak: boolean;
  sprint: boolean;
}

/** vanilla PlayerRideableJumping: a mount the player makes leap with a charged jump */
export interface RideableJumping {
  canJump(): boolean;
  onPlayerJump(power: number): void;
  handleStartJump(power: number): void;
  jumpCooldown(): number;
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
  /** vanilla Player.getMainArm (options: Main Hand) */
  mainArm: 'left' | 'right' = 'right';
  input: PlayerInput = { forward: false, back: false, left: false, right: false, jump: false, sneak: false, sprint: false };
  private sprintTriggerTime = 0;
  private jumpTriggerTime = 0;
  private wasForward = false;
  private wasJump = false;
  /** vanilla LocalPlayer jumpRidingTicks and jumpRidingScale: how long jump's been held on a mount that leaps, and the charge */
  jumpRidingTicks = 0;
  jumpRidingScale = 0;
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
  /** vanilla enchantmentSeed (saved as XpSeed): fixes the enchanting table's offers until the next enchant */
  enchantmentSeed = 0;
  air = 300;
  usingItemTicks = 0;
  /** vanilla takeXpDelay: one orb every 2 ticks */
  takeXpDelay = 0;
  /** vanilla ItemCooldowns: item id → ticks left (ender pearls) */
  readonly cooldowns = new Map<string, number>();
  cooldownTotals = new Map<string, number>();
  /** item being used (eating, drinking, drawing a bow) and ticks left (vanilla useItemRemaining) */
  useItem: ItemStack | null = null;
  useItemRemaining = 0;
  useDuration = 0;
  /** vanilla getUsedItemHand */
  useHand: Hand = 'main';

  isUsingItem(): boolean {
    return this.useItem !== null;
  }

  /** ticks the current item has been used */
  ticksUsingItem(): number {
    return this.useItem ? this.useDuration - this.useItemRemaining : 0;
  }

  /** a swing, by default with the hand an interaction under way is using */
  override swing(hand: Hand = this.inventory.activeHand): void {
    super.swing(hand);
  }

  /** (in the hand in use: see Inventory.activeHand) */
  startUsingItem(stack: ItemStack, duration: number): void {
    this.useItem = stack;
    this.useHand = this.inventory.activeHand;
    this.useDuration = duration;
    this.useItemRemaining = duration;
    this.usingItemTicks = 1;
  }

  stopUsingItem(): void {
    this.useItem = null;
    this.useItemRemaining = 0;
    this.usingItemTicks = 0;
  }
  spawnX = 0;
  spawnY = 64;
  spawnZ = 0;
  /** vanilla respawnPosition: a bed, or a /spawnpoint (forced); null = world spawn */
  respawnPos: [number, number, number] | null = null;
  respawnForced = false;
  /** vanilla ServerPlayer.seenCredits: they've left the End through its exit portal before (the End Poem and credits roll only the first time) */
  seenCredits = false;
  /** vanilla Player.lastDeathLocation: the dimension and block they last died at (the recovery compass points there) */
  lastDeathLocation: { dim: string; pos: [number, number, number] } | null = null;
  /** bed head block while asleep (vanilla sleepingPos) */
  sleepingPos: [number, number, number] | null = null;
  /** vanilla sleepCounter: climbs to 100 asleep, then 100..110 fades back after waking */
  sleepCounter = 0;
  /** vanilla LocalPlayer.spinningEffectIntensity: the nausea wobble, 0..1 */
  spinningEffectIntensity = 0;
  oSpinningEffectIntensity = 0;
  onStepSound: ((p: Player) => void) | null = null;
  onSwimSound: ((p: Player) => void) | null = null;
  onHurtSound: ((p: Player, source: string) => void) | null = null;
  onFall: ((p: Player, dmg: number, dist: number) => void) | null = null;
  onDeath: ((p: Player, source: string) => void) | null = null;
  /** spawns an item entity from the player (set by the game shell) */
  dropHandler: ((s: ItemStack, thrown: boolean) => void) | null = null;
  override lastDamageSource = '';

  constructor(level: Level) {
    super(level);
    this.setSize(0.6, 1.8);
    this.health = 20;
    this.maxHealth = 20;
    this.remainingFireTicks = -this.fireImmuneTicks();
  }

  /** vanilla Player.getFireImmuneTicks: a second in fire before catching */
  override fireImmuneTicks(): number {
    return 20;
  }

  override get eyeHeight(): number {
    if (this.sleepingPos) return 0.2;
    if (this.spinPose || this.glidePose) return 0.4;
    return this.crouching ? 1.27 : 1.62;
  }

  /** (Stage 4: the outer End) vanilla Pose.FALL_FLYING: 0.6 tall (eyes at 0.4) while gliding on an elytra */
  glidePose = false;

  /** vanilla Pose.SPIN_ATTACK: curled up 0.6 tall (eyes at 0.4) while a riptide spin lasts */
  spinPose = false;

  /** vanilla Player.doAutoAttackOnTouch: the spin strikes what it runs into, with the trident, for the spin's damage */
  protected override doAutoAttackOnTouch(target: LivingEntity): void {
    playerAttack(this.level, this, target, (n) => this.wearSpinItem(n), { damage: this.autoSpinAttackDmg, weapon: this.autoSpinAttackItem });
  }

  /** the spin's hit wears the trident it's done with, in whichever hand (vanilla hurtAndBreak on getWeaponItem) */
  private wearSpinItem(n: number): void {
    const s = this.autoSpinAttackItem;
    if (!s || this.gameMode === 'creative') return;
    if (hurtAndBreak(s, n)) {
      const inv = this.inventory;
      if (inv.offhand === s) inv.offhand = null;
      else {
        const i = inv.main.indexOf(s);
        if (i >= 0) inv.main[i] = null;
      }
      this.level.sound.play('entity.item.break', this.x, this.y, this.z, 0.8, 0.8 + Math.random() * 0.4);
    }
    this.inventory.version++;
  }

  isSleeping(): boolean {
    return this.sleepingPos !== null;
  }

  isSleepingLongEnough(): boolean {
    return this.sleepingPos !== null && this.sleepCounter >= 100;
  }

  /** bed facing while asleep (vanilla getBedOrientation) */
  bedOrientation(): string | null {
    const pos = this.sleepingPos;
    if (!pos) return null;
    const st = this.level.world.getState(pos[0], pos[1], pos[2]);
    const b = BLOCKS[STATE_BLOCK[st]];
    return b.name.endsWith('_bed') ? b.get<string>(st, 'facing') : null;
  }

  /** vanilla LivingEntity.startSleeping: mark the bed occupied and lie down in it */
  startSleeping(x: number, y: number, z: number): void {
    const st = this.level.world.getState(x, y, z);
    const b = BLOCKS[STATE_BLOCK[st]];
    if (b.name.endsWith('_bed')) this.level.setBlock(x, y, z, b.with(st, 'occupied', true));
    this.crouching = false;
    this.sprinting = false;
    this.sleepingPos = [x, y, z];
    this.setSize(0.2, 0.2);
    this.setPos(x + 0.5, y + 0.6875, z + 0.5);
    this.dx = this.dy = this.dz = 0;
    this.sleepCounter = 0;
  }

  /** vanilla LivingEntity.stopSleeping: free the bed and stand up beside it, facing it */
  stopSleeping(): void {
    const pos = this.sleepingPos;
    if (!pos) return;
    this.sleepingPos = null;
    const [x, y, z] = pos;
    const w = this.level.world;
    const st = w.getState(x, y, z);
    const b = BLOCKS[STATE_BLOCK[st]];
    this.setSize(0.6, 1.8);
    if (b.name.endsWith('_bed')) {
      this.level.setBlock(x, y, z, b.with(st, 'occupied', false));
      const at = findStandUpPosition(w, x, y, z, b.get<string>(st, 'facing'), this.yaw) ?? [x + 0.5, y + 1.1, z + 0.5];
      const yaw = wrapDegrees((Math.atan2(z + 0.5 - at[2], x + 0.5 - at[0]) * 180) / Math.PI - 90);
      this.moveTo(at[0], at[1], at[2], yaw, 0);
    }
    this.fallDistance = 0;
  }

  /** vanilla Player.stopSleepInBed: waking normally leaves a short fade (sleepCounter 100 → 110) */
  stopSleepInBed(wakeImmediately: boolean): void {
    this.stopSleeping();
    this.sleepCounter = wakeImmediately ? 0 : 100;
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

  override isShiftKeyDown(): boolean {
    return this.input.sneak;
  }

  /**
   * vanilla Player.getRopeHoldPosition: a lead hangs from the main hand, at the side 0.8 below the top of it (0.2
   * lower crouching); swimming or spinning in a riptide, from ahead of it along the look
   */
  override ropeHoldPosition(p: number): [number, number, number] {
    const d0 = 0.22 * (this.mainArm === 'right' ? -1 : 1);
    // (vanilla lerps the pitch the other way round, over half the partial tick)
    const f = ((this.pitch + (this.pitchO - this.pitch) * p * 0.5) * Math.PI) / 180;
    const f1 = ((this.bodyYawO + (this.bodyYaw - this.bodyYawO) * p) * Math.PI) / 180;
    let v: [number, number, number];
    if (this.isAutoSpinAttack()) {
      const [lx, , lz] = this.lookVector();
      const h1 = this.dx * this.dx + this.dz * this.dz, h2 = lx * lx + lz * lz;
      const f2 = h1 > 0 && h2 > 0 ? Math.sign(this.dx * lz - this.dz * lx) * Math.acos(Math.max(-1, Math.min(1, (this.dx * lx + this.dz * lz) / Math.sqrt(h1 * h2)))) : 0;
      v = yRot(xRot(zRot([d0, -0.11, 0.85], -f2), -f), -f1);
    } else if (this.isVisuallySwimming()) v = yRot(xRot([d0, 0.2, -0.15], -f), -f1);
    else v = yRot([d0, this.bb.maxY - this.bb.minY - 1, this.crouching ? -0.2 : 0.07], -f1);
    return [this.lerpX(p) + v[0], this.lerpY(p) + v[1], this.lerpZ(p) + v[2]];
  }

  /** vanilla ServerPlayer.updateInvisibilityStatus: a spectator is invisible, effects or not */
  override isInvisible(): boolean {
    return this.gameMode === 'spectator' || super.isInvisible();
  }

  protected override hidesEffectParticles(): boolean {
    return this.gameMode === 'spectator';
  }

  /** vanilla Player.DEFAULT_VEHICLE_ATTACHMENT: seated 0.6 above the feet */
  override vehicleAttachmentY(): number {
    return 0.6;
  }

  /** vanilla Player.getDismountPoses: standing, else crouching */
  override dismountHeights(): number[] {
    return [1.8, 1.5];
  }

  override setDismountHeight(h: number): void {
    this.crouching = h < 1.8;
    this.setSize(0.6, h);
  }

  /** vanilla Player.getDimensionChangingDelay: players may step back through a portal soon after */
  override dimensionChangingDelay(): number {
    return 10;
  }

  /** vanilla NetherPortalBlock.getPortalTransitionTime for players (the players_nether_portal_*_delay game rules) */
  override portalWaitTime(): number {
    const r = this.level.gameRules as unknown as Record<string, number>;
    const creative = this.gameMode === 'creative' || this.gameMode === 'spectator';
    return Math.max(1, creative ? r.playersNetherPortalCreativeDelay ?? 1 : r.playersNetherPortalDefaultDelay ?? 80);
  }

  override canChangeDimensions(): boolean {
    return this.health > 0;
  }

  /** vanilla LocalPlayer.handsBusy: rowing a boat, so no attacking or using items */
  handsBusy = false;

  /** vanilla Player.rideTick: the sneak key gets you off; riders don't bob */
  override rideTick(): void {
    if (this.isShiftKeyDown() && this.vehicle) {
      this.stopRiding();
      return;
    }
    super.rideTick();
    this.bobO = this.bob;
    this.bob = 0;
    // vanilla LocalPlayer.rideTick: at a boat's helm the movement keys row it
    this.handsBusy = false;
    const v = this.vehicle as (Entity & { setInput?(left: boolean, right: boolean, up: boolean, down: boolean): void }) | null;
    if (v?.setInput && v.passengers[0] === this) {
      const i = this.input;
      v.setInput(i.left, i.right, i.forward, i.back);
      this.handsBusy = i.left || i.right || i.forward || i.back;
    }
  }

  /** vanilla Player.removeVehicle: players may climb straight back in (LocalPlayer: hands free again) */
  override removeVehicle(): void {
    super.removeVehicle();
    this.boardingCooldown = 0;
    this.handsBusy = false;
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
    // vanilla LocalPlayer.handleConfusionTransitionEffect: a portal warps the view in over 4 s (with its rising
    // whoosh), nausea over 7.5 s and out in its last 3 s
    this.oSpinningEffectIntensity = this.spinningEffectIntensity;
    const nausea = this.getEffect('nausea');
    // (vanilla Portal.Transition.CONFUSION: the nether portal's; an end portal has none)
    if (this.portal?.inside && this.portal.kind === 'nether') {
      if (this.spinningEffectIntensity === 0) this.level.sound.playUI('block.portal.trigger', 0.25, Math.random() * 0.4 + 0.8);
      this.spinningEffectIntensity = Math.min(1, this.spinningEffectIntensity + 0.0125);
    } else if (nausea && !nausea.endsWithin(60)) this.spinningEffectIntensity = Math.min(1, this.spinningEffectIntensity + 0.006666667);
    else if (this.spinningEffectIntensity > 0) this.spinningEffectIntensity = Math.max(0, this.spinningEffectIntensity - 0.05);
    // vanilla Player.tick: the sleep timer; morning (or a thunderstorm ending) wakes you
    if (this.sleepingPos) {
      if (++this.sleepCounter > 100) this.sleepCounter = 100;
      if (this.level.isDay()) this.stopSleepInBed(false);
    } else if (this.sleepCounter > 0) {
      if (++this.sleepCounter >= 110) this.sleepCounter = 0;
    }
    // vanilla LivingEntity.tick: the bed was broken under you
    if (this.sleepingPos && !this.bedOrientation()) this.stopSleeping();
    if (this.sprinting && !this.inWater && !this.inLava && !this.crouching && this.gameMode !== 'spectator' && this.health > 0) this.spawnSprintParticle();
    super.tick();
    // bob
    let f = 0;
    if (this.onGround && this.health > 0) f = Math.min(0.1, Math.sqrt(this.dx * this.dx + this.dz * this.dz));
    this.bob += (f - this.bob) * 0.4;
    this.food.tick(this);
    this.tickAir();
    this.inventory.tick(this);
    if (this.takeXpDelay > 0) this.takeXpDelay--;
    this.turtleHelmetTick();
    for (const [k, v] of this.cooldowns) {
      if (v <= 1) this.cooldowns.delete(k);
      else this.cooldowns.set(k, v - 1);
    }
    // vanilla Player.aiStep touch(): orbs and arrows within the inflated box
    if (this.health > 0 && this.gameMode !== 'spectator') {
      for (const e of this.level.getEntities(this.bb.inflate(1, 0.5, 1), undefined, this)) {
        const touch = (e as { touchPlayer?: (p: Player) => void }).touchPlayer;
        if (touch) touch.call(e, this);
        if (e instanceof ExperienceOrb) e.playerTouch(this);
        else if (e instanceof Arrow) e.playerTouch(this);
      }
    }
    if (this.flying) this.fallDistance = 0;
    this.updateGlidePose();
  }

  /**
   * (Stage 4: the outer End) vanilla Player.updatePlayerPose, at the end of the tick, for the glide: 0.6 tall while
   * gliding, from the tick it starts; after it, standing if there's room, else crouching. (A riptide spin's pose is
   * the same size and takes over while it lasts; if it ends mid-glide, the glide's comes back.)
   */
  private updateGlidePose(): void {
    if (this.spinPose) return;
    if (this.fallFlying) {
      if (this.glidePose && this.height === 0.6) return;
      this.glidePose = true;
      this.crouching = false;
      this.setSize(0.6, 0.6);
    } else if (this.glidePose) {
      this.glidePose = false;
      const tall = this.bb.clone();
      tall.maxY = tall.minY + 1.8;
      this.crouching = this.collisionBoxes(tall.inflate(-1e-4, 0, -1e-4)).length > 0;
      this.setSize(0.6, this.crouching ? 1.5 : 1.8);
    }
  }

  /** vanilla Player.turtleHelmetTick: out of the water, a turtle shell keeps 10 s of breath in hand (no swirls, just the icon) */
  private turtleHelmetTick(): void {
    if (this.inventory.armor[3]?.item.id === 'turtle_helmet' && this.eyeFluid !== FLUID_WATER)
      this.addEffect(new MobEffectInstance(MOB_EFFECTS.water_breathing, 200, 0, false, false, true));
  }

  /** vanilla Entity.spawnSprintParticle: running kicks up bits of the ground */
  private spawnSprintParticle(): void {
    const bx = Math.floor(this.x), by = Math.floor(this.y - 0.2), bz = Math.floor(this.z);
    const st = this.level.world.getState(bx, by, bz);
    if (!st) return;
    let px = this.x + (Math.random() - 0.5) * this.width, pz = this.z + (Math.random() - 0.5) * this.width;
    if (Math.floor(this.x) !== bx) px = Math.max(bx, Math.min(bx + 1, px));
    if (Math.floor(this.z) !== bz) pz = Math.max(bz, Math.min(bz + 1, pz));
    this.level.particles.blockParticle?.(px, this.y + 0.1, pz, this.dx * -4, 1.5, this.dz * -4, st, bx, by, bz);
  }

  protected override swimSplashSound(): string {
    return 'entity.player.splash';
  }

  protected override swimHighSpeedSplashSound(): string {
    return 'entity.player.splash.high_speed';
  }

  private tickAir(): void {
    if (this.eyeFluid === FLUID_WATER) {
      // vanilla LivingEntity.baseTick: water breathing (and invulnerability) hold the air supply
      if (this.invulnerable || this.hasWaterBreathing()) return;
      // vanilla decreaseAirSupply: OXYGEN_BONUS (respiration) keeps the breath with chance L/(L+1)
      const o = oxygenBonus(this);
      if (!(o > 0 && Math.random() >= 1 / (o + 1))) this.air--;
      if (this.air === -20) {
        this.air = 0;
        // vanilla LivingEntity.baseTick: a burst of bubbles as you take drowning damage
        for (let i = 0; i < 8; i++) {
          const r = () => Math.random() - Math.random();
          this.level.particles.spawn?.('bubble', this.x + r(), this.y + r(), this.z + r(), this.dx, this.dy, this.dz);
        }
        this.hurt(2, 'drown');
      }
    } else if (this.air < 300) {
      this.air = Math.min(300, this.air + 4);
    }
  }

  protected override serverAiStep(): void {
    const inp = this.input;
    // vanilla Player.isImmobile: no steering while asleep
    if (this.sleepingPos) {
      this.xxa = this.zza = 0;
      this.jumping = false;
      return;
    }
    // vanilla updatePlayerPose: a riptide spin curls up (0.6 tall); after it, standing if there's room, else crouching
    if (this.isAutoSpinAttack() !== this.spinPose) {
      if (!this.spinPose) {
        this.spinPose = true;
        this.crouching = false;
        this.setSize(0.6, 0.6);
      } else {
        this.spinPose = false;
        const fits = (h: number) => {
          const b = this.bb.clone();
          b.maxY = b.minY + h;
          return this.collisionBoxes(b.inflate(-1e-4, 0, -1e-4)).length === 0;
        };
        this.crouching = !fits(1.8);
        this.setSize(0.6, this.crouching ? 1.5 : 1.8);
      }
    }
    // crouching pose (vanilla: shift while on ground / not flying)
    const wantCrouch = inp.sneak && !this.flying && !this.inWater && !this.spinPose && !this.glidePose;
    if (!this.spinPose && !this.glidePose && wantCrouch !== this.crouching) {
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
    // sprinting: double-tap forward or sprint key (vanilla canStartSprinting: not while blind or riding, vehicleCanSprint)
    const canSprint = (this.food.level > 6 || this.mayFly) && !this.vehicle;
    const forwardDown = inp.forward;
    if (this.sprintTriggerTime > 0) this.sprintTriggerTime--;
    if (!this.sprinting && canSprint && fwd >= 0.8 && !this.crouching && this.usingItemTicks === 0 && !this.hasEffect('blindness')) {
      if (forwardDown && !this.wasForward && (this.onGround || this.flying || this.inWater)) {
        if (this.sprintTriggerTime > 0) this.sprinting = true;
        else this.sprintTriggerTime = 7;
      }
      if (inp.sprint) this.sprinting = true;
    }
    if (this.sprinting && (fwd < 0.8 || (this.horizontalCollision && !this.flying) || !canSprint || this.crouching && !this.flying)) this.sprinting = false;
    this.wasForward = forwardDown;
    this.rideJump(inp.jump);
    // flying toggle: double-tap jump (not on a mount)
    if (this.jumpTriggerTime > 0) this.jumpTriggerTime--;
    let toggled = false;
    if (inp.jump && !this.wasJump && this.mayFly && !this.vehicle) {
      if (this.jumpTriggerTime === 0) this.jumpTriggerTime = 7;
      else if (this.gameMode !== 'spectator') {
        this.flying = !this.flying;
        this.jumpTriggerTime = 0;
        toggled = true;
      }
    }
    // (Stage 4: the outer End) vanilla LocalPlayer.aiStep: a fresh jump in mid-air spreads a worn elytra (not while
    // flying, riding or on a ladder)
    if (inp.jump && !this.wasJump && !toggled && !this.flying && !this.vehicle && !this.onClimbable()) tryToStartFallFlying(this);
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

  /** vanilla jumpableVehicle: the mount you're steering, if it leaps (a saddled horse) */
  jumpableVehicle(): RideableJumping | null {
    const v = this.vehicle as (Entity & Partial<RideableJumping>) | null;
    return v && v.controllingPassenger() === this && v.onPlayerJump && v.canJump?.() ? (v as unknown as RideableJumping) : null;
  }

  /**
   * vanilla LocalPlayer.aiStep's riding jump: on a mount that leaps, holding jump charges it (a tenth a tick, up to
   * 0.9, then easing back to 0.8 the longer it's held) and letting go leaps with the charge; after that, a
   * half-second pause before the next
   */
  private rideJump(jump: boolean): void {
    const mount = this.jumpableVehicle();
    if (!mount || mount.jumpCooldown() !== 0) {
      this.jumpRidingScale = 0;
      return;
    }
    if (this.jumpRidingTicks < 0 && ++this.jumpRidingTicks === 0) this.jumpRidingScale = 0;
    if (this.wasJump && !jump) {
      this.jumpRidingTicks = -10;
      const power = Math.floor(this.jumpRidingScale * 100);
      mount.onPlayerJump(power);
      // (vanilla sendRidingJump: and the server starts the leap)
      if (power > 0) mount.handleStartJump(power);
    } else if (!this.wasJump && jump) {
      this.jumpRidingTicks = 0;
      this.jumpRidingScale = 0;
    } else if (this.wasJump) {
      this.jumpRidingTicks++;
      this.jumpRidingScale = this.jumpRidingTicks < 10 ? this.jumpRidingTicks * 0.1 : 0.8 + (2 / (this.jumpRidingTicks - 9)) * 0.1;
    }
  }

  override travel(sx: number, sy: number, sz: number): void {
    if (this.flying && !this.vehicle) {
      const d0 = this.dy;
      super.travel(sx, sy, sz);
      this.dy = d0 * 0.6;
      this.fallDistance = 0;
      // (vanilla: flying folds the elytra)
      this.fallFlying = false;
    } else super.travel(sx, sy, sz);
  }

  override jumpFromGround(): void {
    super.jumpFromGround();
    this.food.addExhaustion(this.sprinting ? 0.2 : 0.05);
  }

  override isInvulnerableTo(source: string): boolean {
    if (this.invulnerable && source !== 'void' && source !== 'genericKill') return true;
    const rules = this.level.gameRules;
    if (((source === 'fall' || source === 'stalagmite') && !rules.fallDamage) || (source === 'drown' && !rules.drowningDamage)) return true;
    if ((source === 'lava' || source === 'inFire' || source === 'onFire' || source === 'campfire') && !rules.fireDamage) return true;
    return false;
  }

  override hurt(amount: number, source: string, attacker?: Entity | null, direct?: Entity | null): boolean {
    if (this.isInvulnerableTo(source)) return false;
    // vanilla Player.hurt: damage caused by mobs (and all explosions) scales with difficulty
    const scales = source === 'explosion' || source === 'playerExplosion' || source === 'badRespawnPoint' || (attacker && attacker !== this && attacker instanceof LivingEntity && attacker.type !== 'player' && source !== 'thorns');
    if (scales) {
      const d = this.level.difficulty;
      if (d === 'peaceful') amount = 0;
      else if (d === 'easy') amount = Math.min(amount / 2 + 1, amount);
      else if (d === 'hard') amount = (amount * 3) / 2;
    }
    if (amount === 0) return false;
    // vanilla LivingEntity.hurt: getting hurt wakes you up
    if (this.sleepingPos) this.stopSleeping();
    this.lastDamageSource = source;
    this.lastDamageAttacker = attacker ?? null;
    const ok = super.hurt(amount, source, attacker, direct);
    if (ok && !NO_EXHAUSTION.has(source)) this.food.addExhaustion(0.1);
    return ok;
  }

  lastDamageAttacker: Entity | null = null;

  /** vanilla Player.causeFoodExhaustion (creative players don't get hungry) */
  override causeFoodExhaustion(v: number): void {
    if (!this.invulnerable) this.food.addExhaustion(v);
  }

  override isDiscrete(): boolean {
    return this.crouching;
  }

  /** vanilla getArmorCoverPercentage: worn pieces out of 4 */
  override armorCoverPercentage(): number {
    return this.inventory.armor.filter((s) => s && s.count > 0).length / 4;
  }

  override armorValue(): number {
    return this.inventory.armorValue();
  }

  override armorToughness(): number {
    let t = 0;
    for (const s of this.inventory.armor) if (s?.item.armor) t += s.item.armor.toughness;
    return t;
  }

  /** vanilla doHurtEquipment: each armour piece loses max(1, dmg/4) durability */
  protected override hurtArmor(amount: number): void {
    if (amount <= 0) return;
    const d = Math.max(1, Math.floor(amount / 4));
    for (let i = 0; i < 4; i++) if (this.inventory.armor[i]?.item.armor) this.damageArmorSlot(i, d);
  }

  /** vanilla hurtHelmet: falling blocks wear the helmet the same way */
  protected override hurtHelmet(amount: number): boolean {
    const s = this.inventory.armor[3];
    if (!s || s.count <= 0) return false;
    if (s.item.armor && amount > 0) this.damageArmorSlot(3, Math.max(1, Math.floor(amount / 4)));
    return true;
  }

  /** vanilla ItemStack.hurtAndBreak on an armour slot (0 feet … 3 head): unbreaking, then breaking */
  damageArmorSlot(i: number, amount: number): void {
    const inv = this.inventory;
    const s = inv.armor[i];
    if (!s?.item.maxDamage) return;
    if (hurtAndBreak(s, amount, this.gameMode === 'creative')) {
      inv.armor[i] = null;
      this.level.sound.play('entity.item.break', this.x, this.y, this.z, 0.8, 0.8 + Math.random() * 0.4);
    }
    inv.version++;
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

  override die(source: string, attacker: Entity | null = null): void {
    if (this.dead) return;
    super.die(source, attacker);
    // (vanilla ServerPlayer.die: setLastDeathLocation)
    this.lastDeathLocation = { dim: this.level.dim.id, pos: [Math.floor(this.x), Math.floor(this.y), Math.floor(this.z)] };
    this.onDeath?.(this, source);
  }

  /** vanilla ServerPlayer.onEffectAdded / onEffectUpdated / onEffectRemoved: CriteriaTriggers.EFFECTS_CHANGED */
  onEffectsChanged: (() => void) | null = null;
  protected override onEffectAdded(inst: MobEffectInstance): void {
    super.onEffectAdded(inst);
    this.onEffectsChanged?.();
  }
  protected override onEffectUpdated(inst: MobEffectInstance, forced: boolean): void {
    super.onEffectUpdated(inst, forced);
    this.onEffectsChanged?.();
  }
  protected override onEffectRemoved(inst: MobEffectInstance): void {
    super.onEffectRemoved(inst);
    this.onEffectsChanged?.();
  }

  /** vanilla Player.isAffectedByPotions: not a spectator */
  override isAffectedByPotions(): boolean {
    return this.gameMode !== 'spectator' && super.isAffectedByPotions();
  }

  protected override tickDeath(): void {
    this.deathTime++;
    // players are not removed; death screen handles respawn (vanilla removes the body 20 ticks on: its effects' last word)
    if (this.deathTime === 20) this.triggerOnDeathMobEffects();
  }

  /** vanilla Player.drop: `thrown` flings it like the drop key, otherwise it falls at the feet */
  dropItem(s: ItemStack, thrown: boolean): void {
    if (s.count <= 0) return;
    this.dropHandler?.(s, thrown);
  }

  /** vanilla Player.giveExperiencePoints */
  giveExperiencePoints(n: number): void {
    const need = (l: number) => (l >= 30 ? 112 + (l - 30) * 9 : l >= 15 ? 37 + (l - 15) * 5 : 7 + l * 2);
    this.xpProgress += n / need(this.xpLevel);
    this.xpTotal = Math.max(0, Math.min(2147483647, this.xpTotal + n));
    while (this.xpProgress < 0) {
      const f = this.xpProgress * need(this.xpLevel);
      if (this.xpLevel > 0) {
        this.xpLevel--;
        this.xpProgress = 1 + f / need(this.xpLevel);
      } else {
        this.xpLevel = 0;
        this.xpProgress = 0;
      }
    }
    while (this.xpProgress >= 1) {
      this.xpProgress = (this.xpProgress - 1) * need(this.xpLevel);
      this.xpLevel++;
      this.xpProgress /= need(this.xpLevel);
      if (this.xpLevel % 5 === 0) this.onLevelUp?.(this);
    }
  }
  onLevelUp: ((p: Player) => void) | null = null;

  /** vanilla Player.giveExperienceLevels (spending levels leaves the point total alone) */
  giveExperienceLevels(n: number): void {
    this.xpLevel += n;
    if (this.xpLevel < 0) {
      this.xpLevel = 0;
      this.xpProgress = 0;
      this.xpTotal = 0;
    }
  }

  /** vanilla Player.onEnchantmentPerformed: pay the levels and roll a new enchantment seed */
  onEnchantmentPerformed(levels: number): void {
    this.giveExperienceLevels(-levels);
    this.enchantmentSeed = (Math.random() * 4294967296) | 0;
  }

  /** vanilla getCurrentItemAttackStrengthDelay: 20 / ATTACK_SPEED (haste / mining fatigue apply) */
  attackStrengthDelay(): number {
    const it = this.inventory.selectedItem?.item;
    const speed = (it ? it.attackSpeed : 4) * this.attackSpeedEffectFactor();
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
    // drawing a bow zooms in
    if (this.useItem?.item.id === 'bow') {
      let f1 = this.ticksUsingItem() / 20;
      if (f1 > 1) f1 = 1;
      else f1 *= f1;
      f *= 1 - f1 * 0.15;
    }
    return f;
  }
}

type Vec = [number, number, number];
/** vanilla Vec3.xRot / yRot / zRot */
function xRot(v: Vec, a: number): Vec {
  const c = Math.cos(a), s = Math.sin(a);
  return [v[0], v[1] * c + v[2] * s, v[2] * c - v[1] * s];
}
function yRot(v: Vec, a: number): Vec {
  const c = Math.cos(a), s = Math.sin(a);
  return [v[0] * c + v[2] * s, v[1], v[2] * c - v[0] * s];
}
function zRot(v: Vec, a: number): Vec {
  const c = Math.cos(a), s = Math.sin(a);
  return [v[0] * c + v[1] * s, v[1] * c - v[0] * s, v[2]];
}
