// Minecart sound instances (vanilla MinecartSoundInstance / RidingMinecartSoundInstance): every
// cart has a rolling loop whose volume follows its speed, and its rider also hears the inside
// loop (swapped for the muffled one while their head is under water).

import type { SoundManager, LoopSound } from './soundManager';
import type { Level } from '../game/level';
import type { Player } from '../entity/player';
import { AbstractMinecart } from '../entity/minecart';
import { FLUID_WATER } from '../world/fluids';

export class MinecartSounds {
  private level: Level | null = null;
  private readonly rolling = new Map<AbstractMinecart, LoopSound>();
  private riding: { cart: AbstractMinecart; dry: LoopSound; wet: LoopSound } | null = null;

  constructor(private readonly sound: SoundManager) {}

  tick(level: Level, player: Player): void {
    if (level !== this.level) {
      this.stopAll();
      this.level = level;
    }
    // vanilla ClientPacketListener.postAddEntitySoundInstance: every cart gets its loop
    for (const e of level.entities) if (e instanceof AbstractMinecart && !e.removed && !this.rolling.has(e)) this.rolling.set(e, this.sound.loop('entity.minecart.riding'));
    for (const [cart, s] of this.rolling) {
      if (cart.removed) {
        s.stop();
        this.rolling.delete(cart);
        continue;
      }
      // vanilla MinecartSoundInstance.tick: up to 0.7 * 0.5 from half a block a tick
      s.x = cart.x;
      s.y = cart.y;
      s.z = cart.z;
      const f = Math.sqrt(cart.dx * cart.dx + cart.dz * cart.dz);
      s.volume = f >= 0.01 ? Math.min(f, 0.5) * 0.7 : 0;
    }
    // vanilla LocalPlayer.startRiding: the two inside loops, for as long as the player sits in this cart
    const v = player.vehicle;
    if (this.riding && (this.riding.cart !== v || this.riding.cart.removed)) this.stopRiding();
    if (!this.riding && v instanceof AbstractMinecart && !v.removed) {
      const dry = this.sound.loop('entity.minecart.inside'), wet = this.sound.loop('entity.minecart.inside.underwater');
      dry.relative = wet.relative = true;
      this.riding = { cart: v, dry, wet };
    }
    if (this.riding) {
      // vanilla RidingMinecartSoundInstance.tick: clampedLerp(0, 0.75, speed), the one matching isUnderWater
      const { cart, dry, wet } = this.riding;
      const f = Math.sqrt(cart.dx * cart.dx + cart.dz * cart.dz);
      const vol = f >= 0.01 ? Math.min(1, f) * 0.75 : 0;
      const under = player.eyeFluid === FLUID_WATER && player.inWater;
      dry.volume = under ? 0 : vol;
      wet.volume = under ? vol : 0;
    }
  }

  private stopRiding(): void {
    this.riding?.dry.stop();
    this.riding?.wet.stop();
    this.riding = null;
  }

  private stopAll(): void {
    for (const s of this.rolling.values()) s.stop();
    this.rolling.clear();
    this.stopRiding();
  }
}
