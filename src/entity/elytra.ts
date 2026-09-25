// The elytra (vanilla ElytraItem and LivingEntity's fall flying). Worn in the chest slot, a jump in mid-air spreads it
// (Player.tryToStartFallFlying) and its wearer glides (LivingEntity.travel's fall-flying branch): looking down trades
// height for speed, looking up trades it back, a dive speeds it up and the glide always follows the look; flying
// into a wall fast enough hurts ("experienced kinetic energy"). Gliding wears it a point every second (never in
// creative) until it's down to its last, where it stops working rather than breaking; phantom membrane mends it at
// an anvil. Landing, a mount, creative flight or Levitation end the glide.

import type { LivingEntity } from './living';
import type { ItemStack } from '../item/item';
import { hurtAndBreak } from '../item/enchantHelper';

/** vanilla Items.ELYTRA: 432 points of durability */
export const ELYTRA_DURABILITY = 432;

const DEG = Math.PI / 180;
/** vanilla multiply(0.99F, 0.98F, 0.99F): float constants used as doubles */
const DRAG_H = Math.fround(0.99), DRAG_V = Math.fround(0.98);

interface Wearer {
  inventory?: { armor: (ItemStack | null)[]; version: number };
  armorItems?: (ItemStack | null)[];
  gameMode?: string;
}

/** what's worn in the chest slot (a player's armour, a mob's) */
export function chestItem(e: LivingEntity): ItemStack | null {
  const w = e as unknown as Wearer;
  return w.inventory?.armor[2] ?? w.armorItems?.[2] ?? null;
}

/** vanilla ElytraItem.isFlyEnabled: it works until it's down to its last point of durability */
export function isFlyEnabled(s: ItemStack): boolean {
  return s.damage < s.item.maxDamage - 1;
}

/** a worn elytra that works */
export function canGlide(e: LivingEntity): boolean {
  const s = chestItem(e);
  return !!s && s.item.id === 'elytra' && isFlyEnabled(s);
}

/**
 * vanilla Player.tryToStartFallFlying: in the air, not already gliding, not in water or levitating, with a working
 * elytra on; true if it spread
 */
export function tryToStartFallFlying(e: LivingEntity): boolean {
  if (e.onGround || e.fallFlying || e.inWater || e.hasEffect('levitation') || !canGlide(e)) return false;
  e.fallFlying = true;
  return true;
}

/**
 * vanilla LivingEntity.updateFallFlying (before travel): the glide goes on while it's off the ground, not riding and
 * not levitating, with a working elytra on; every twentieth tick of it the elytra wears a point
 */
export function updateFallFlying(e: LivingEntity): void {
  if (!e.fallFlying) return;
  const on = !e.onGround && !e.vehicle && !e.hasEffect('levitation') && canGlide(e);
  if (on) {
    const i = e.fallFlyTicks + 1;
    if (i % 10 === 0 && (i / 10) % 2 === 0) {
      const w = e as unknown as Wearer;
      hurtAndBreak(chestItem(e)!, 1, w.gameMode === 'creative');
      if (w.inventory) w.inventory.version++;
    }
  }
  e.fallFlying = on;
}

/** vanilla Entity.calculateViewVector(xRot, yRot) */
export function viewVector(pitch: number, yaw: number): [number, number, number] {
  const f = pitch * DEG, g = -yaw * DEG;
  const h = Math.cos(g), i = Math.sin(g), j = Math.cos(f), k = Math.sin(f);
  return [i * j, -k, h * j];
}

/**
 * vanilla LivingEntity.travel, fall flying (`g`: gravity, slow falling's on the way down): the look's pitch sets how
 * much of gravity holds (none looking level, all of it straight down); falling turns into forward speed, looking up
 * turns speed into climb, and the horizontal motion swings round toward the look. A wall taken at speed hurts by the
 * speed lost; touching the ground ends it
 */
export function travelFallFlying(e: LivingEntity, g: number): void {
  // vanilla checkSlowFallDistance: gliding slower than half a block a tick, a fall counts from a block
  if (e.dy > -0.5 && e.fallDistance > 1) e.fallDistance = 1;
  const [lx, ly, lz] = viewVector(e.pitch, e.yaw);
  const f = e.pitch * DEG;
  const i = Math.sqrt(lx * lx + lz * lz);
  const j = Math.sqrt(e.dx * e.dx + e.dz * e.dz);
  const k = Math.sqrt(lx * lx + ly * ly + lz * lz);
  let l = Math.cos(f);
  l = l * l * Math.min(1, k / 0.4);
  let vx = e.dx, vy = e.dy + g * (-1 + l * 0.75), vz = e.dz;
  if (vy < 0 && i > 0) {
    const m = vy * -0.1 * l;
    vx += (lx * m) / i;
    vy += m;
    vz += (lz * m) / i;
  }
  if (f < 0 && i > 0) {
    const m = j * -Math.sin(f) * 0.04;
    vx += (-lx * m) / i;
    vy += m * 3.2;
    vz += (-lz * m) / i;
  }
  if (i > 0) {
    vx += ((lx / i) * j - vx) * 0.1;
    vz += ((lz / i) * j - vz) * 0.1;
  }
  e.dx = vx * DRAG_H;
  e.dy = vy * DRAG_V;
  e.dz = vz * DRAG_H;
  e.move(e.dx, e.dy, e.dz);
  if (e.horizontalCollision) {
    const n = j - Math.sqrt(e.dx * e.dx + e.dz * e.dz);
    const o = Math.fround(n * 10 - 3);
    if (o > 0) {
      // (vanilla getFallDamageSound((int) o): the big fall from more than 4; a player's own)
      const who = e.type === 'player' ? 'player' : 'generic';
      e.level.sound.play(`entity.${who}.${Math.trunc(o) > 4 ? 'big' : 'small'}_fall`, e.x, e.y, e.z, 1, 1);
      e.hurt(o, 'flyIntoWall');
    }
  }
  if (e.onGround) e.fallFlying = false;
}
