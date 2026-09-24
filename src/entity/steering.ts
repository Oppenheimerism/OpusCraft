// vanilla ItemBasedSteering: the saddle and the "food on a stick" boost of a mount a player steers with it (the
// pig's carrot, the strider's warped fungus). A boost lasts 7-49 s, swelling to 2.15 times the speed at its middle.

import type { Rand } from '../core/rng';

export class ItemBasedSteering {
  saddled = false;
  private boosting = false;
  private boostTime = 0;
  private boostTimeTotal = 0;

  /** vanilla boost: not while one lasts */
  boost(r: Rand): boolean {
    if (this.boosting) return false;
    this.boosting = true;
    this.boostTime = 0;
    this.boostTimeTotal = r.nextInt(841) + 140;
    return true;
  }

  /** vanilla tickBoost (while ridden) */
  tickBoost(): void {
    if (this.boosting && this.boostTime++ > this.boostTimeTotal) this.boosting = false;
  }

  /** vanilla boostFactor */
  boostFactor(): number {
    return this.boosting ? 1 + 1.15 * Math.sin((this.boostTime / this.boostTimeTotal) * Math.PI) : 1;
  }
}
