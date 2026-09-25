// The crossbow (vanilla CrossbowItem + ProjectileWeaponItem, 1.21): drawing it, loading the charged
// projectiles onto the stack (minecraft:charged_projectiles, ItemTag.charged), firing them (multishot's
// spread, piercing, a player's critical arrows, the mob aim), the loading sounds and the item model's
// pulling / charged textures. The player goes through Interaction (use / tickUsingItem / releaseUsingItem);
// mobs that fight with one (vanilla CrossbowAttackMob: piglins, pillagers) use the same calls.
//
// A mob, as vanilla's CrossbowAttack behaviour (PiglinAi) runs it — while it holds a crossbow and sees its
// target within CROSSBOW_RANGE (BehaviorUtils.isWithinAttackRange), looking at the target every tick:
//
//   UNCHARGED        mob.startUsingItem(); → CHARGING     (while it's using a crossbow, Mob.aiStep calls
//                                                           crossbowUseTick: the loading sounds)
//   CHARGING         if (!mob.usingItem) → UNCHARGED
//                    else if (mob.useItemTicks >= chargeDuration(stack)) {
//                      releaseUsing(level, mob, stack, mob.useItemTicks);   // loads (a Monster never runs out of arrows)
//                      mob.stopUsingItem(); attackDelay = 20 + mob.random.nextInt(20); → CHARGED }
//   CHARGED          if (--attackDelay === 0) → READY_TO_ATTACK
//   READY_TO_ATTACK  performShooting(level, mob, stack, MOB_ARROW_POWER, mobInaccuracy(level), target); → UNCHARGED
//
// Its model poses both arms (render/mobModels.ts ArmPose, or animateCrossbowCharge / animateCrossbowHold
// after the rest of the animation, as PiglinModel / IllagerModel do): 'crossbow_charge' while charging, with
// crossbowChargeProgress(stack, mob.useItemTicks); 'crossbow_hold' otherwise — for a piglin while aggressive
// and holding one (AbstractPiglin.getArmPose), for a pillager whenever it holds one. Rendered in hand
// (EntityRenderDispatcher.drawHeldItem) the stack picks its pulling / loaded texture by itself.
// Vanilla quirk kept for whoever ports CrossbowAttack.stop: it clears the charge of getUseItem() after
// stopUsingItem(), i.e. of nothing, so a mob that gives up keeps its crossbow loaded.
// A firework rocket (a player's, from either hand) loads as an arrow does and flies off at 1.6, wearing the crossbow by
// three; it goes off on whatever it hits (entity/fireworkRocket.ts).

import { ItemStack, ITEMS, cloneTag, type ChargedProjectile } from './item';
import { levelOf, hurtAndBreak } from './enchantHelper';
import { Arrow } from '../entity/arrow';
import { FireworkRocket } from '../entity/fireworkRocket';
import type { Level } from '../game/level';
import type { Entity } from '../entity/entity';
import type { LivingEntity } from '../entity/living';
import type { Player } from '../entity/player';

const RAD = Math.PI / 180;

/** vanilla CrossbowItem.ARROW_POWER: loaded arrows fly at 3.15 blocks a tick (a player's shot) */
export const ARROW_POWER = 3.15;
/** vanilla CrossbowItem.FIREWORK_POWER */
export const FIREWORK_POWER = 1.6;
/** vanilla CrossbowItem.MOB_ARROW_POWER: the velocity CrossbowAttackMob.performCrossbowAttack shoots with */
export const MOB_ARROW_POWER = 1.6;
/** vanilla CrossbowItem.use: a player's shots have an inaccuracy of 1 */
export const PLAYER_INACCURACY = 1;
/** vanilla CrossbowItem.getDefaultProjectileRange: how close a mob comes before it shoots */
export const CROSSBOW_RANGE = 8;

const DIFFICULTY_ID: Record<string, number> = { peaceful: 0, easy: 1, normal: 2, hard: 3 };

/** vanilla CrossbowAttackMob.performCrossbowAttack: 14 - 4 × the difficulty id (10 easy, 6 normal, 2 hard) */
export function mobInaccuracy(level: Level): number {
  return 14 - (DIFFICULTY_ID[level.difficulty] ?? 2) * 4;
}

export function isCrossbow(s: ItemStack | null | undefined): s is ItemStack {
  return s?.item.id === 'crossbow';
}

/**
 * vanilla CrossbowItem.getChargeDuration: 1.25 s, a quarter of a second less per level of Quick Charge
 * (EnchantmentHelper.modifyCrossbowChargingTime, never below 0): 25 / 20 / 15 / 10 ticks
 */
export function chargeDuration(stack: ItemStack | null | undefined): number {
  return Math.floor(Math.max(0, 1.25 - 0.25 * levelOf(stack, 'quick_charge')) * 20);
}

/**
 * vanilla CrossbowItem.getUseDuration: the charge and three ticks more. When those run out the crossbow is
 * still being used (useOnRelease: it never completes on its own, the user has to let go), but it no longer
 * shows as being drawn in first person, the cue that it's ready.
 */
export function useDuration(stack: ItemStack | null | undefined): number {
  return chargeDuration(stack) + 3;
}

/** vanilla CrossbowItem.getPowerForTime: how far drawn after `ticks` of use, 1 = fully */
export function powerForTime(ticks: number, stack: ItemStack | null | undefined): number {
  const d = chargeDuration(stack);
  const f = d > 0 ? ticks / d : 1;
  return f > 1 ? 1 : f;
}

/** how far the draw is for the arm poses (vanilla AnimationUtils.animateCrossbowCharge: ticks used clamped to the charge) */
export function crossbowChargeProgress(stack: ItemStack | null | undefined, ticksUsing: number): number {
  const d = chargeDuration(stack);
  return d > 0 ? Math.min(Math.max(ticksUsing, 0), d) / d : 1;
}

/** vanilla CrossbowItem.isCharged */
export function isCharged(stack: ItemStack | null | undefined): boolean {
  return !!stack?.tag?.charged?.length;
}

/** vanilla CrossbowItem.getShootingPower: 1.6 when a firework is among the charge, else 3.15 */
export function shootingPower(stack: ItemStack): number {
  return stack.tag?.charged?.some((p) => p.id === 'firework_rocket') ? FIREWORK_POWER : ARROW_POWER;
}

/**
 * vanilla models/item/crossbow.json overrides: while being drawn (the "pulling" predicate: its user is using
 * this very stack and it isn't charged) crossbow_pulling_0, _1 from pull 0.58, _2 from 1.0 (pull = whole
 * ticks used / charge duration); charged, crossbow_arrow (crossbow_firework with a rocket). `ticksUsing` is
 * the user's ticks using this stack, -1 when it isn't in use; undefined keeps the item's crossbow_standby.
 */
export function crossbowTexture(stack: ItemStack, ticksUsing: number): string | undefined {
  const c = stack.tag?.charged;
  if (c?.length) return c.some((p) => p.id === 'firework_rocket') ? 'crossbow_firework' : 'crossbow_arrow';
  if (ticksUsing < 0) return undefined;
  const d = chargeDuration(stack);
  const pull = d > 0 ? Math.floor(ticksUsing) / d : 1;
  return pull >= 1 ? 'crossbow_pulling_2' : pull >= 0.58 ? 'crossbow_pulling_1' : 'crossbow_pulling_0';
}

// ---------------------------------------------------------------------------
// drawing and loading

interface ChargingSounds {
  start: string;
  mid: string | null;
  end: string;
}

/**
 * vanilla CrossbowItem.getChargingSounds: loading_start / loading_middle / loading_end, or with Quick Charge
 * (its crossbow_charging_sounds, the highest level's entry) quick_charge_1..3 to start, no middle sound
 */
function chargingSounds(stack: ItemStack): ChargingSounds {
  const q = levelOf(stack, 'quick_charge');
  if (q <= 0) return { start: 'item.crossbow.loading_start', mid: 'item.crossbow.loading_middle', end: 'item.crossbow.loading_end' };
  return { start: `item.crossbow.quick_charge_${Math.min(q, 3)}`, mid: null, end: 'item.crossbow.loading_end' };
}

/** vanilla CrossbowItem.startSoundPlayed / midLoadSoundPlayed (vanilla keeps them on the one Item; here per user) */
const soundFlags = new WeakMap<Entity, { start: boolean; mid: boolean }>();

/**
 * vanilla CrossbowItem.onUseTick, every tick the crossbow is being drawn; `ticksUsed` = the ticks it has been
 * used before this one (0 on the first). At 20 % of the charge the start sound, at 50 % the middle one, both
 * at volume 0.5 (SoundSource.PLAYERS in vanilla, whoever holds it); under 20 % both may play again.
 */
export function crossbowUseTick(level: Level, user: Entity, stack: ItemStack, ticksUsed: number): void {
  const d = chargeDuration(stack);
  const f = d > 0 ? ticksUsed / d : 1;
  let st = soundFlags.get(user);
  if (!st) soundFlags.set(user, (st = { start: false, mid: false }));
  if (f < 0.2) {
    st.start = false;
    st.mid = false;
  }
  const snd = chargingSounds(stack);
  if (f >= 0.2 && !st.start) {
    st.start = true;
    level.sound.play(snd.start, user.x, user.y, user.z, 0.5, 1);
  }
  if (f >= 0.5 && !st.mid) {
    st.mid = true;
    if (snd.mid) level.sound.play(snd.mid, user.x, user.y, user.z, 0.5, 1);
  }
}

/**
 * vanilla ProjectileWeaponItem.draw + useAmmo: the projectiles a crossbow loads from `ammo`. The first takes
 * one item from it (none with `infinite` materials — creative — or Infinity on an arrow); Multishot adds two
 * more per level, copies that don't use ammo. Projectiles that took nothing are INTANGIBLE_PROJECTILE: their
 * arrows can only be picked up in creative. `ammo` is decremented in place: the caller clears an emptied slot.
 */
export function draw(stack: ItemStack, ammo: ItemStack | null, infinite: boolean): ChargedProjectile[] {
  if (!ammo || ammo.count <= 0) return [];
  const n = 1 + 2 * levelOf(stack, 'multishot');
  const free = infinite || (levelOf(stack, 'infinity') > 0 && ammo.item.id === 'arrow');
  const out: ChargedProjectile[] = [];
  // (each carries the ammo's own components: a tipped arrow's potion)
  const tag = ammo.tag ? { tag: cloneTag(ammo.tag)! } : {};
  for (let j = 0; j < n; j++) {
    if (j > 0 || free) out.push({ id: ammo.item.id, intangible: true, ...tag });
    else {
      ammo.count--;
      out.push({ id: ammo.item.id, ...tag });
    }
  }
  return out;
}

/** vanilla #arrows: plain and tipped (no spectral arrows yet) */
function isArrow(s: ItemStack): boolean {
  return s.item.id === 'arrow' || s.item.id === 'tipped_arrow';
}

/**
 * vanilla Player.getProjectile for a crossbow: an arrow or firework held in the offhand, else in the main hand
 * (ProjectileWeaponItem.getHeldProjectile), else the first arrow in the inventory, else, with infinite materials
 * (creative), a new arrow; null: nothing to load
 */
export function playerProjectile(p: Player): ItemStack | null {
  const inv = p.inventory;
  const held = (s: ItemStack | null): s is ItemStack => !!s && (isArrow(s) || s.item.id === 'firework_rocket');
  const off = inv.offhand;
  if (held(off)) return off;
  const main = inv.inHand('main');
  if (held(main)) return main;
  const i = inv.findSlot(isArrow);
  if (i >= 0) return inv.main[i];
  return p.gameMode === 'creative' ? ItemStack.of('arrow') : null;
}

/**
 * vanilla CrossbowItem.releaseUsing + tryLoadProjectiles: let go fully drawn (and not charged yet), it loads
 * what `draw` takes from `ammo` and clicks shut (loading_end at volume 1, pitch 1/(r·0.5+1)+0.2). `ammo` is
 * what the user shoots: for a player playerProjectile(); a mob (vanilla Monster.getProjectile) always has an
 * arrow, the default. Returns whether it loaded.
 */
export function releaseUsing(level: Level, user: LivingEntity, stack: ItemStack, ticksUsed: number, ammo: ItemStack | null = ItemStack.of('arrow'), infinite = false): boolean {
  if (powerForTime(ticksUsed, stack) < 1 || isCharged(stack)) return false;
  const list = draw(stack, ammo, infinite);
  if (!list.length) return false;
  (stack.tag ??= {}).charged = list;
  level.sound.play(chargingSounds(stack).end, user.x, user.y, user.z, 1, 1 / (Math.random() * 0.5 + 1) + 0.2);
  return true;
}

// ---------------------------------------------------------------------------
// shooting

/**
 * vanilla CrossbowItem.performShooting + ProjectileWeaponItem.shoot: fires every charged projectile and
 * empties the charge. Multishot's spread (10° per level) fans them out: with n projectiles the step is
 * f1 = 2·spread/(n-1), the start f2 = ((n-1) % 2)·f1/2, and they alternate sides: 0°, -10°, +10° for
 * indices 0, 1, 2. With a `target` (mobs) each is aimed at it, see shootProjectile; without (the player)
 * along the view, turned by its angle about the shooter's up vector. A player's arrows are critical. Each
 * projectile wears the crossbow by one (a firework by three), none in creative; if it breaks, the rest
 * aren't fired. Velocity: shootingPower(stack) for players, MOB_ARROW_POWER for mobs; inaccuracy:
 * PLAYER_INACCURACY, mobInaccuracy(level). Returns whether anything was fired.
 */
export function performShooting(level: Level, shooter: LivingEntity, stack: ItemStack, velocity: number, inaccuracy: number, target: LivingEntity | null): boolean {
  const list = stack.tag?.charged;
  if (!list?.length) return false;
  delete stack.tag!.charged;
  const player = shooter.type === 'player' ? (shooter as Player) : null;
  const infinite = !!player && player.gameMode === 'creative';
  const spread = 10 * levelOf(stack, 'multishot');
  const n = list.length;
  const f1 = n === 1 ? 0 : (2 * spread) / (n - 1);
  const f2 = (((n - 1) % 2) * f1) / 2;
  let f3 = 1;
  for (let i = 0; i < n; i++) {
    const angle = f2 + f3 * Math.floor((i + 1) / 2) * f1;
    f3 = -f3;
    const shot = list[i].id === 'firework_rocket' ? createFirework(level, shooter, list[i]) : createArrow(level, shooter, stack, list[i], !!player);
    shootProjectile(level, shooter, shot, i, velocity, inaccuracy, angle, target);
    level.addEntity(shot);
    // vanilla getDurabilityUse: 3 for a firework rocket, 1 for an arrow
    if (hurtAndBreak(stack, list[i].id === 'firework_rocket' ? 3 : 1, infinite)) {
      breakWeapon(level, shooter, stack);
      break;
    }
  }
  if (player) player.inventory.version++;
  return true;
}

/**
 * vanilla CrossbowItem.createProjectile → ArrowItem.createArrow: an arrow fired from the crossbow (firedFromWeapon,
 * which gives it Piercing's level), critical when a player shot it, that hits with item.crossbow.hit. The bow's
 * enchantments don't apply (a crossbow can't have them). A player's arrow can be picked up, an intangible one
 * only in creative, a mob's not at all (Arrow's constructor).
 */
function createArrow(level: Level, shooter: LivingEntity, weapon: ItemStack, p: ChargedProjectile, crit: boolean): Arrow {
  const a = new Arrow(level, shooter);
  const it = ITEMS.get(p.id);
  if (it && (p.id === 'arrow' || p.id === 'tipped_arrow')) a.setPickupStack(new ItemStack(it, 1, 0, cloneTag(p.tag ?? null)));
  if (p.intangible) a.pickup = 'creative_only';
  a.weapon = weapon.copy();
  a.pierceLevel = levelOf(weapon, 'piercing');
  a.crit = crit;
  a.hitSound = 'item.crossbow.hit';
  return a;
}

/**
 * vanilla CrossbowItem.createProjectile for a firework: the rocket (its stars and all) from 0.15 below the shooter's
 * eyes, shot at an angle
 */
function createFirework(level: Level, shooter: LivingEntity, p: ChargedProjectile): FireworkRocket {
  const ammo = new ItemStack(ITEMS.get('firework_rocket')!, 1, 0, cloneTag(p.tag ?? null));
  return FireworkRocket.shot(level, ammo, shooter.x, shooter.y + shooter.eyeHeight - 0.15, shooter.z, shooter);
}

type V3 = [number, number, number];

/** vanilla Entity.calculateViewVector (degrees) */
function viewVector(xRot: number, yRot: number): V3 {
  const f = xRot * RAD, f1 = -yRot * RAD;
  const f4 = Math.cos(f);
  return [Math.sin(f1) * f4, -Math.sin(f), Math.cos(f1) * f4];
}

/**
 * vanilla CrossbowItem.shootProjectile. At a target: d0 = tx - sx, d1 = tz - sz, d2 = their horizontal
 * distance, d3 = the target's y a third of its height up - the arrow's y + d2·0.2 (the drop over that
 * distance), the direction (d0, d3, d1) turned by the angle about its own up (getProjectileShotVector).
 * Otherwise the shooter's view turned about its up vector (a quaternion from the axis and angle). The
 * shooter's own motion isn't added (unlike a bow's shootFromRotation). Each shot plays item.crossbow.shoot.
 */
function shootProjectile(level: Level, shooter: LivingEntity, a: Arrow | FireworkRocket, index: number, velocity: number, inaccuracy: number, angle: number, target: LivingEntity | null): void {
  let v: V3;
  if (target) {
    const d0 = target.x - shooter.x, d1 = target.z - shooter.z;
    const d2 = Math.sqrt(d0 * d0 + d1 * d1);
    const d3 = target.y + target.height / 3 - a.y + d2 * 0.2;
    v = projectileShotVector(shooter, d0, d3, d1, angle);
  } else {
    const up = viewVector(shooter.pitch - 90, shooter.yaw);
    v = rotateUnitAxis(viewVector(shooter.pitch, shooter.yaw), up, angle * RAD);
  }
  a.shoot(v[0], v[1], v[2], velocity, inaccuracy);
  level.sound.play('item.crossbow.shoot', shooter.x, shooter.y, shooter.z, 1, shotPitch(index));
}

/**
 * vanilla CrossbowItem.getProjectileShotVector: the aim normalised, its "up" = the aim turned 90° about
 * aim × world up (the shooter's up vector when aiming straight up or down), then the aim turned by the angle
 * about that up. Both turns are JOML's rotateAxis with those unnormalised axes, as vanilla does.
 */
function projectileShotVector(shooter: LivingEntity, x: number, y: number, z: number, angle: number): V3 {
  const l = Math.sqrt(x * x + y * y + z * z) || 1;
  const v: V3 = [x / l, y / l, z / l];
  let c: V3 = [-v[2], 0, v[0]];
  if (c[0] * c[0] + c[2] * c[2] <= 1e-7) {
    const u = viewVector(shooter.pitch - 90, shooter.yaw);
    c = [v[1] * u[2] - v[2] * u[1], v[2] * u[0] - v[0] * u[2], v[0] * u[1] - v[1] * u[0]];
  }
  const up = rotateAxis(v, Math.PI / 2, c[0], c[1], c[2]);
  return rotateAxis(v, angle * RAD, up[0], up[1], up[2]);
}

/** JOML Vector3f.rotate(Quaternionf.setAngleAxis(angle, axis)) for a unit axis: Rodrigues' rotation */
function rotateUnitAxis(v: V3, k: V3, angle: number): V3 {
  const c = Math.cos(angle), s = Math.sin(angle);
  const d = (k[0] * v[0] + k[1] * v[1] + k[2] * v[2]) * (1 - c);
  return [
    v[0] * c + (k[1] * v[2] - k[2] * v[1]) * s + k[0] * d,
    v[1] * c + (k[2] * v[0] - k[0] * v[2]) * s + k[1] * d,
    v[2] * c + (k[0] * v[1] - k[1] * v[0]) * s + k[2] * d,
  ];
}

/** JOML Vector3f.rotateAxis: exact for unit axes; vanilla's unnormalised ones also scale (shoot normalises) */
function rotateAxis(v: V3, angle: number, ax: number, ay: number, az: number): V3 {
  const [x, y, z] = v;
  // rotateX / rotateY / rotateZ(axis · angle) for the axis-aligned unit axes
  if (ay === 0 && az === 0 && Math.abs(ax) === 1) {
    const s = Math.sin(ax * angle), c = Math.cos(angle);
    return [x, y * c - z * s, y * s + z * c];
  }
  if (ax === 0 && az === 0 && Math.abs(ay) === 1) {
    const s = Math.sin(ay * angle), c = Math.cos(angle);
    return [x * c + z * s, y, -x * s + z * c];
  }
  if (ax === 0 && ay === 0 && Math.abs(az) === 1) {
    const s = Math.sin(az * angle), c = Math.cos(angle);
    return [x * c - y * s, x * s + y * c, z];
  }
  // rotateAxisInternal: the quaternion (axis · sin(angle/2), cos(angle/2)) applied as if it were unit
  const h = angle * 0.5, sh = Math.sin(h);
  const qx = ax * sh, qy = ay * sh, qz = az * sh, qw = Math.cos(h);
  const w2 = qw * qw, x2 = qx * qx, y2 = qy * qy, z2 = qz * qz, zw = qz * qw;
  const xy = qx * qy, xz = qx * qz, yw = qy * qw, yz = qy * qz, xw = qx * qw;
  return [
    (w2 + x2 - z2 - y2) * x + (-zw + xy - zw + xy) * y + (yw + xz + xz + yw) * z,
    (xy + zw + zw + xy) * x + (y2 - z2 + w2 - x2) * y + (yz + yz - xw - xw) * z,
    (xz - yw + xz - yw) * x + (yz + yz + xw + xw) * y + (z2 - y2 - x2 + w2) * z,
  ];
}

/** vanilla CrossbowItem.getShotPitch: the first shot at 1, the others 1/(r·0.5+1.8) + 0.63 (odd) or 0.43 (even) */
function shotPitch(index: number): number {
  if (index === 0) return 1;
  return 1 / (Math.random() * 0.5 + 1.8) + ((index & 1) === 1 ? 0.63 : 0.43);
}

/** vanilla LivingEntity.onEquippedItemBroken → breakItem: the break sound, and the emptied hand */
function breakWeapon(level: Level, shooter: LivingEntity, stack: ItemStack): void {
  level.sound.play('entity.item.break', shooter.x, shooter.y, shooter.z, 0.8, 0.8 + Math.random() * 0.4);
  if (shooter.type === 'player') {
    const inv = (shooter as Player).inventory;
    if (inv.selectedItem === stack) inv.setSelectedItem(null);
    else if (inv.offhand === stack) inv.offhand = null;
  } else {
    const m = shooter as LivingEntity & { mainHand?: ItemStack | null };
    if (m.mainHand === stack) m.mainHand = null;
  }
}
