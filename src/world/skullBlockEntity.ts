// vanilla SkullBlockEntity: a mob head's block entity — its custom name (kept from and given back to its item) and,
// for the heads that move (the dragon's jaw, the piglin's ears), how long it has been powered: while redstone reaches
// it the count runs on a tick at a time, and when the power goes it stops where it is (the jaw stays as it was left).

import { BlockEntity, registerBlockEntity } from './blockEntity';
import { BLOCKS, STATE_BLOCK } from './block';
import { skullOf } from './blocksSkulls';
import type { ItemStack } from '../item/item';
import type { Level } from '../game/level';

export class SkullBlockEntity extends BlockEntity {
  readonly id = 'skull';
  /** vanilla animationTickCount */
  animationTickCount = 0;
  /** vanilla isAnimating */
  isAnimating = false;
  /** vanilla customName (CUSTOM_NAME) */
  customName: string | undefined = undefined;

  constructor(x: number, y: number, z: number) {
    super(x, y, z, 0);
  }

  /**
   * vanilla SkullBlock.getTicker → SkullBlockEntity.animation: only the dragon's and the piglin's heads tick, counting
   * on while powered
   */
  override tick(level: Level): void {
    const st = level.getState(this.x, this.y, this.z);
    const b = BLOCKS[STATE_BLOCK[st]];
    const s = skullOf(b.name);
    if (!s || (s.type !== 'dragon' && s.type !== 'piglin')) return;
    if (b.get(st, 'powered')) {
      this.isAnimating = true;
      this.animationTickCount++;
    } else this.isAnimating = false;
  }

  /** vanilla getAnimation: how far along the jaw's (or ears') motion is */
  getAnimation(partial: number): number {
    return this.isAnimating ? this.animationTickCount + partial : this.animationTickCount;
  }

  /** vanilla applyImplicitComponents: the item's custom name */
  override applyComponents(s: ItemStack): void {
    this.customName = s.tag?.customName;
  }

  protected override saveData(): Record<string, number | string> | undefined {
    return this.customName !== undefined ? { CustomName: this.customName } : undefined;
  }

  protected override loadData(d: Record<string, number | string>): void {
    this.customName = typeof d.CustomName === 'string' ? d.CustomName : undefined;
  }
}

// (vanilla BlockEntityType.SKULL: every head, floor or wall; saved as "skull")
registerBlockEntity((name, x, y, z) => (name === 'skull' || skullOf(name) ? new SkullBlockEntity(x, y, z) : null));
