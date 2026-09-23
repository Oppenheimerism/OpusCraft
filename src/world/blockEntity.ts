// Block entities: chests and furnaces (vanilla ChestBlockEntity /
// AbstractFurnaceBlockEntity), with persistence to saved chunks.

import { SimpleContainer, isEmpty } from '../inventory/container';
import { ItemStack, ITEMS } from '../item/item';
import { smeltingResult, fuelTime } from '../inventory/recipes';
import { BLOCKS, STATE_BLOCK } from './block';
import type { Level } from '../game/level';

export interface SavedBlockEntity {
  id: string;
  x: number;
  y: number;
  z: number;
  items: [number, string, number, number][];
  data?: Record<string, number>;
}

export abstract class BlockEntity {
  abstract readonly id: string;
  readonly container: SimpleContainer;
  removed = false;
  constructor(readonly x: number, readonly y: number, readonly z: number, size: number) {
    this.container = new SimpleContainer(size);
  }
  get key(): string {
    return blockEntityKey(this.x, this.y, this.z);
  }
  tick(_level: Level): void {}
  save(): SavedBlockEntity {
    const items: SavedBlockEntity['items'] = [];
    this.container.items.forEach((s, i) => {
      if (s) items.push([i, s.item.id, s.count, s.damage]);
    });
    return { id: this.id, x: this.x, y: this.y, z: this.z, items, data: this.saveData() };
  }
  load(d: SavedBlockEntity): void {
    for (const [i, id, n, dmg] of d.items) {
      const it = ITEMS.get(id);
      if (it && i < this.container.size) this.container.items[i] = new ItemStack(it, n, dmg);
    }
    if (d.data) this.loadData(d.data);
  }
  protected saveData(): Record<string, number> | undefined {
    return undefined;
  }
  protected loadData(_d: Record<string, number>): void {}
}

export function blockEntityKey(x: number, y: number, z: number): string {
  return `${x},${y},${z}`;
}

export class ChestBlockEntity extends BlockEntity {
  readonly id = 'chest';
  openCount = 0;
  constructor(x: number, y: number, z: number) {
    super(x, y, z, 27);
  }
}

export class FurnaceBlockEntity extends BlockEntity {
  readonly id = 'furnace';
  litTime = 0;
  litDuration = 0;
  cookingProgress = 0;
  cookingTotalTime = 200;
  storedXp = 0;
  constructor(x: number, y: number, z: number) {
    super(x, y, z, 3);
  }
  get isLit(): boolean {
    return this.litTime > 0;
  }
  protected override saveData(): Record<string, number> {
    return { litTime: this.litTime, litDuration: this.litDuration, cook: this.cookingProgress, cookTotal: this.cookingTotalTime, xp: this.storedXp };
  }
  protected override loadData(d: Record<string, number>): void {
    this.litTime = d.litTime ?? 0;
    this.litDuration = d.litDuration ?? 0;
    this.cookingProgress = d.cook ?? 0;
    this.cookingTotalTime = d.cookTotal ?? 200;
    this.storedXp = d.xp ?? 0;
  }

  private canBurn(): boolean {
    const input = this.container.get(0);
    const r = smeltingResult(input);
    if (!r) return false;
    const out = this.container.get(2);
    if (isEmpty(out)) return true;
    if (out.item.id !== r.result) return false;
    return out.count < out.maxStack;
  }

  private burn(): void {
    const input = this.container.get(0)!;
    const r = smeltingResult(input)!;
    const out = this.container.get(2);
    if (isEmpty(out)) this.container.items[2] = ItemStack.of(r.result, 1);
    else out.count++;
    input.count--;
    if (input.count <= 0) this.container.items[0] = null;
    this.storedXp += r.xp;
    this.container.changed();
  }

  /** vanilla AbstractFurnaceBlockEntity.serverTick */
  override tick(level: Level): void {
    const wasLit = this.isLit;
    if (this.isLit) this.litTime--;
    const fuel = this.container.get(1);
    const input = this.container.get(0);
    if (this.isLit || (!isEmpty(fuel) && !isEmpty(input))) {
      if (!this.isLit && this.canBurn()) {
        this.litTime = fuelTime(fuel);
        this.litDuration = this.litTime;
        if (this.isLit && fuel) {
          const id = fuel.item.id;
          fuel.count--;
          if (fuel.count <= 0) this.container.items[1] = id === 'lava_bucket' ? ItemStack.of('bucket') : null;
          this.container.changed();
        }
      }
      if (this.isLit && this.canBurn()) {
        this.cookingProgress++;
        if (this.cookingProgress >= this.cookingTotalTime) {
          this.cookingProgress = 0;
          this.cookingTotalTime = 200;
          this.burn();
        }
      } else this.cookingProgress = 0;
    } else if (!this.isLit && this.cookingProgress > 0) {
      this.cookingProgress = Math.max(0, Math.min(this.cookingTotalTime, this.cookingProgress - 2));
    }
    if (wasLit !== this.isLit) {
      const st = level.getState(this.x, this.y, this.z);
      const b = BLOCKS[STATE_BLOCK[st]];
      if (b.name === 'furnace') level.setBlock(this.x, this.y, this.z, b.with(st, 'lit', this.isLit), false);
    }
  }

  litProgress(): number {
    const d = this.litDuration || 200;
    return Math.max(0, Math.min(1, this.litTime / d));
  }

  burnProgress(): number {
    return this.cookingTotalTime && this.cookingProgress ? Math.max(0, Math.min(1, this.cookingProgress / this.cookingTotalTime)) : 0;
  }
}

export function createBlockEntity(name: string, x: number, y: number, z: number): BlockEntity | null {
  if (name === 'chest') return new ChestBlockEntity(x, y, z);
  if (name === 'furnace') return new FurnaceBlockEntity(x, y, z);
  return null;
}

export function loadBlockEntity(d: SavedBlockEntity): BlockEntity | null {
  const be = createBlockEntity(d.id, d.x, d.y, d.z);
  be?.load(d);
  return be;
}
