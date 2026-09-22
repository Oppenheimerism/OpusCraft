// Vanilla FoodData: food level, saturation, exhaustion, regeneration, starvation.

import type { Player } from './player';

export class FoodData {
  level = 20;
  lastLevel = 20;
  saturation = 5;
  exhaustion = 0;
  private tickTimer = 0;
  difficulty: 'peaceful' | 'easy' | 'normal' | 'hard' = 'normal';
  naturalRegen = true;

  eat(nutrition: number, saturationMod: number): void {
    this.level = Math.min(nutrition + this.level, 20);
    this.saturation = Math.min(this.saturation + nutrition * saturationMod * 2, this.level);
  }

  addExhaustion(v: number): void {
    this.exhaustion = Math.min(this.exhaustion + v, 40);
  }

  needsFood(): boolean {
    return this.level < 20;
  }

  tick(p: Player): void {
    if (p.gameMode === 'creative' || p.gameMode === 'spectator') return;
    this.lastLevel = this.level;
    if (this.exhaustion > 4) {
      this.exhaustion -= 4;
      if (this.saturation > 0) this.saturation = Math.max(this.saturation - 1, 0);
      else if (this.difficulty !== 'peaceful') this.level = Math.max(this.level - 1, 0);
    }
    const hurt = p.health > 0 && p.health < p.maxHealth;
    if (this.naturalRegen && this.saturation > 0 && hurt && this.level >= 20) {
      this.tickTimer++;
      if (this.tickTimer >= 10) {
        const f = Math.min(this.saturation, 6);
        p.heal(f / 6);
        this.addExhaustion(f);
        this.tickTimer = 0;
      }
    } else if (this.naturalRegen && this.level >= 18 && hurt) {
      this.tickTimer++;
      if (this.tickTimer >= 80) {
        p.heal(1);
        this.addExhaustion(6);
        this.tickTimer = 0;
      }
    } else if (this.level <= 0) {
      this.tickTimer++;
      if (this.tickTimer >= 80) {
        if (p.health > 10 || this.difficulty === 'hard' || (p.health > 1 && this.difficulty === 'normal')) p.hurt(1, 'starve');
        this.tickTimer = 0;
      }
    } else this.tickTimer = 0;
  }
}
