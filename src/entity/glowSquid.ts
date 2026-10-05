// Glow squid (Stage 5: ocean; vanilla GlowSquid): a squid of the dark water deep underground. It shines on its own
// (drawn at full light, trailing faint glow sparks) until it's hurt, when it goes dark, brightening back over the last
// half second of its 5 seconds; its ink is the glowing kind, and it drops glow ink sacs.

import { Squid } from './water';
import type { Level } from '../game/level';
import type { Entity } from './entity';
import type { LootEntry, MobCategory } from './mob';
import { SEA_LEVEL } from '../world/constants';
import { BLOCKS, STATE_BLOCK } from '../world/block';

export class GlowSquid extends Squid {
  override readonly type: string = 'glow_squid';
  override readonly category: MobCategory = 'underground_water_creature';
  /** vanilla DATA_DARK_TICKS_REMAINING: how much longer it stays dark after being hurt */
  darkTicksRemaining = 0;

  constructor(level: Level) {
    super(level);
  }

  /** vanilla GlowSquid.aiStep: the dark wears off; a glow spark about it every tick (a client's, each its own) */
  override aiStep(): void {
    super.aiStep();
    if (this.darkTicksRemaining > 0) this.darkTicksRemaining--;
    this.level.clientEffects(() => this.spark());
  }
  private spark(): void {
    const r = this.random;
    this.level.particles.spawn?.('glow', this.x + (2 * r.nextDouble() - 1) * this.width * 0.6, this.y + this.height * r.nextDouble(), this.z + (2 * r.nextDouble() - 1) * this.width * 0.6, 0, 0, 0);
  }
  /** (a guest's copy) its sparks are its own, and its dark wears off here as it does on the host, which sends when it starts */
  override animateMirror(): void {
    super.animateMirror();
    if (this.darkTicksRemaining > 0) this.darkTicksRemaining--;
    this.spark();
  }

  /** vanilla GlowSquid.hurt: hurt by something (Squid.hurt counts only a blow from a mob), it goes dark 5 seconds */
  override hurt(amount: number, source: string, attacker?: Entity | null, direct?: Entity | null): boolean {
    const ok = super.hurt(amount, source, attacker, direct);
    if (ok && this.lastHurtByMob) this.darkTicksRemaining = 100;
    return ok;
  }

  /**
   * vanilla GlowSquidRenderer.getBlockLightLevel: full light, but none while it's dark, brightening over its last 10
   * dark ticks (never darker than the light where it is)
   */
  blockLight(worldLight: number): number {
    const t = 1 - this.darkTicksRemaining / 10;
    const i = Math.floor(t <= 0 ? 0 : t >= 1 ? 15 : 15 * t);
    return i === 15 ? 15 : Math.max(i, worldLight);
  }

  protected override squirtSound(): string {
    return 'entity.glow_squid.squirt';
  }
  protected override inkParticle(): string {
    return 'glow_squid_ink';
  }
  override ambientSound(): string {
    return 'entity.glow_squid.ambient';
  }
  override hurtSound(): string {
    return 'entity.glow_squid.hurt';
  }
  override deathSound(): string {
    return 'entity.glow_squid.death';
  }

  /** vanilla loot_tables/entities/glow_squid: 1-3 glow ink sacs */
  override lootTable(): LootEntry[] {
    return [{ item: 'glow_ink_sac', min: 1, max: 3 }];
  }

  protected override saveData(): Record<string, number | string | boolean> | undefined {
    return { ...super.saveData(), DarkTicksRemaining: this.darkTicksRemaining };
  }
  protected override loadData(d: Record<string, number | string | boolean>): void {
    super.loadData(d);
    if (typeof d.DarkTicksRemaining === 'number') this.darkTicksRemaining = d.DarkTicksRemaining;
  }

  /** vanilla checkGlowSquidSpawnRules: 33 or more below the sea, in pitch dark (no sky light, no block light), in water */
  static checkSpawn(level: Level, x: number, y: number, z: number): boolean {
    return y <= SEA_LEVEL - 33 && level.rawBrightness(x, y, z, 0) === 0 && BLOCKS[STATE_BLOCK[level.getState(x, y, z)]].name === 'water';
  }
}
