// vanilla ShulkerBoxBlockEntity: a box's 27 slots, its name, and its lid — shut, opening, open or shutting as players
// look inside (vanilla AnimationStatus), a tenth of the way each tick; while it opens it shoves aside whatever is in the
// way of the lid. Unlike a chest it keeps what it holds when it's broken (it goes with the box's item: game/shulkerBox.ts).

import { BarrelBlockEntity, registerBlockEntity } from './blockEntity';
import { ItemStack, ITEMS, cloneTag, type ItemTag, type ContainerSlot } from '../item/item';
import { isEmpty } from '../inventory/container';
import { BLOCKS, STATE_BLOCK } from './block';
import { isShulkerBox } from './blocksShulker';
import { AABB } from '../core/aabb';
import type { Level } from '../game/level';
import type { Entity } from '../entity/entity';
import type { World } from './world';

/** vanilla ShulkerBoxBlockEntity.AnimationStatus */
export type ShulkerBoxAnimation = 'closed' | 'opening' | 'opened' | 'closing';

/** vanilla Direction.getNormal of the six facings */
export const FACING_STEP: Record<string, [number, number, number]> = { down: [0, -1, 0], up: [0, 1, 0], north: [0, 0, -1], south: [0, 0, 1], west: [-1, 0, 0], east: [1, 0, 0] };

/** vanilla default name (container.shulkerBox), whatever the box's colour */
export const SHULKER_BOX_TITLE = 'Shulker Box';

/**
 * vanilla Shulker.getProgressDeltaAabb, in the block's own coordinates: the slab of space the lid sweeps through beyond
 * the facing face between two peeks (with `from` -1, the whole block and the lid's reach: getProgressAabb)
 */
export function progressDeltaBox(facing: string, from: number, to: number): AABB {
  const [dx, dy, dz] = FACING_STEP[facing];
  const d0 = Math.max(from, to), d1 = Math.min(from, to);
  const lo = [0, 0, 0], hi = [1, 1, 1];
  [dx, dy, dz].forEach((d, i) => {
    // expandTowards(d · d0), then contract(-d · (1 + d1))
    if (d > 0) {
      hi[i] += d0;
      lo[i] += 1 + d1;
    } else if (d < 0) {
      lo[i] -= d0;
      hi[i] -= 1 + d1;
    }
  });
  return new AABB(lo[0], lo[1], lo[2], hi[0], hi[1], hi[2]);
}

/** vanilla ItemContainerContents.fromItems: the filled slots of `items` */
export function containerContents(items: readonly (ItemStack | null)[]): ContainerSlot[] {
  const out: ContainerSlot[] = [];
  items.forEach((s, slot) => {
    if (isEmpty(s)) return;
    const c: ContainerSlot = { slot, id: s!.item.id, count: s!.count };
    if (s!.damage) c.damage = s!.damage;
    if (s!.tag) c.tag = cloneTag(s!.tag)!;
    out.push(c);
  });
  return out;
}

/** vanilla ItemContainerContents.copyInto: the stacks a container component holds, in their slots */
export function contentsStacks(slots: readonly ContainerSlot[] | undefined, size = 27): (ItemStack | null)[] {
  const out: (ItemStack | null)[] = new Array(size).fill(null);
  for (const c of slots ?? []) {
    const it = ITEMS.get(c.id);
    if (it && c.slot >= 0 && c.slot < size && c.count > 0) out[c.slot] = new ItemStack(it, c.count, c.damage ?? 0, cloneTag(c.tag ?? null));
  }
  return out;
}

export class ShulkerBoxBlockEntity extends BarrelBlockEntity {
  override readonly id: string = 'shulker_box';
  animationStatus: ShulkerBoxAnimation = 'closed';
  progress = 0;
  progressOld = 0;
  /** vanilla CUSTOM_NAME: an anvil's name, shown over its screen and kept by its item */
  customName: string | undefined = undefined;

  constructor(x: number, y: number, z: number) {
    super(x, y, z);
    // (vanilla ShulkerBoxBlock.onRemove: no Containers.dropContents — what it holds leaves with the box's item, or
    // not at all)
    this.container.removeAll = () => [];
  }

  /** vanilla getProgress: how far open the lid is, 0 shut to 1 open */
  getProgress(partial: number): number {
    return this.progressOld + (this.progress - this.progressOld) * partial;
  }

  isClosed(): boolean {
    return this.animationStatus === 'closed';
  }

  isEmpty(): boolean {
    return this.container.items.every((s) => isEmpty(s));
  }

  /** vanilla getDisplayName: the custom name, else "Shulker Box" */
  displayName(): string {
    return this.customName ?? SHULKER_BOX_TITLE;
  }

  /** the block's FACING (up when the block's gone) */
  facing(w: World): string {
    const st = w.getState(this.x, this.y, this.z);
    const b = BLOCKS[STATE_BLOCK[st]];
    return isShulkerBox(b.name) ? b.get<string>(st, 'facing') : 'up';
  }

  /** vanilla getBoundingBox: the block, and the lid's reach while it's up (half a block when open), in world coordinates */
  boundingBox(w: World): AABB {
    return progressDeltaBox(this.facing(w), -1, 0.5 * this.progress).move(this.x, this.y, this.z);
  }

  /** vanilla ShulkerBoxBlockEntity.tick → updateAnimation */
  override tick(level: Level): void {
    this.progressOld = this.progress;
    switch (this.animationStatus) {
      case 'closed':
        this.progress = 0;
        break;
      case 'opening':
        // (vanilla's float arithmetic: ten steps of 0.1F reach 1)
        this.progress = Math.fround(this.progress + Math.fround(0.1));
        if (this.progressOld === 0) this.neighbourUpdates(level);
        if (this.progress >= 1) {
          this.animationStatus = 'opened';
          this.progress = 1;
          this.neighbourUpdates(level);
        }
        this.moveCollidedEntities(level);
        break;
      case 'opened':
        this.progress = 1;
        break;
      case 'closing':
        this.progress = Math.fround(this.progress - Math.fround(0.1));
        if (this.progressOld === 1) this.neighbourUpdates(level);
        if (this.progress <= 0) {
          this.animationStatus = 'closed';
          this.progress = 0;
          this.neighbourUpdates(level);
        }
        break;
    }
  }

  /** vanilla doNeighborUpdates: the shape changed (and a comparator's reading may have) */
  private neighbourUpdates(level: Level): void {
    const st = level.getState(this.x, this.y, this.z);
    if (!isShulkerBox(BLOCKS[STATE_BLOCK[st]].name)) return;
    level.updateNeighbors(this.x, this.y, this.z);
    level.updateNeighborsAt(this.x, this.y, this.z, STATE_BLOCK[st]);
  }

  /**
   * vanilla moveCollidedEntities: whatever is in the way of the rising lid is shoved along with it (by the whole of this
   * tick's sweep — vanilla measures it by the lid's progress, not its height)
   */
  private moveCollidedEntities(level: Level): void {
    const st = level.getState(this.x, this.y, this.z);
    if (!isShulkerBox(BLOCKS[STATE_BLOCK[st]].name)) return;
    const facing = BLOCKS[STATE_BLOCK[st]].get<string>(st, 'facing');
    const [dx, dy, dz] = FACING_STEP[facing];
    const box = progressDeltaBox(facing, this.progressOld, this.progress).move(this.x, this.y, this.z);
    for (const e of level.getEntities(box)) {
      // (vanilla PushReaction.IGNORE: spectators)
      if ((e as { gameMode?: string }).gameMode === 'spectator') continue;
      // (vanilla Shulker.move(MoverType.SHULKER_BOX): a shulker in the lid's way teleports off: entity/shulker)
      const s = e as { moveByShulkerBox?: () => void };
      if (s.moveByShulkerBox) {
        s.moveByShulkerBox();
        continue;
      }
      e.move((box.maxX - box.minX + 0.01) * dx, (box.maxY - box.minY + 0.01) * dy, (box.maxZ - box.minZ + 0.01) * dz);
    }
  }

  /** vanilla startOpen: the first to look in opens the lid, with its sound */
  override startOpen(level: Level, opener: Entity | null = level.player): void {
    if (this.removed) return;
    if (this.openCount < 0) this.openCount = 0;
    this.openCount++;
    this.openCountChanged();
    if (this.openCount !== 1) return;
    level.gameEvent('container_open', this.x + 0.5, this.y + 0.5, this.z + 0.5, { entity: opener });
    level.sound.play('block.shulker_box.open', this.x + 0.5, this.y + 0.5, this.z + 0.5, 0.5, level.random.nextFloat() * 0.1 + 0.9);
  }

  /** vanilla stopOpen: the last to leave shuts it */
  override stopOpen(level: Level, closer: Entity | null = level.player): void {
    if (this.removed) return;
    this.openCount--;
    this.openCountChanged();
    if (this.openCount > 0) return;
    level.gameEvent('container_close', this.x + 0.5, this.y + 0.5, this.z + 0.5, { entity: closer });
    level.sound.play('block.shulker_box.close', this.x + 0.5, this.y + 0.5, this.z + 0.5, 0.5, level.random.nextFloat() * 0.1 + 0.9);
  }

  /** vanilla triggerEvent(EVENT_SET_OPEN_COUNT): the lid starts up with the first to look in, down after the last */
  private openCountChanged(): void {
    if (this.openCount === 0) this.animationStatus = 'closing';
    if (this.openCount === 1) this.animationStatus = 'opening';
  }

  /** vanilla applyImplicitComponents: CUSTOM_NAME and CONTAINER from the item it was placed from */
  override applyComponents(s: ItemStack): void {
    const t = s.tag;
    this.customName = t?.customName;
    const items = contentsStacks(t?.container, this.container.size);
    for (let i = 0; i < items.length; i++) this.container.items[i] = items[i];
    this.container.changed();
  }

  /** vanilla collectComponents (what the box's loot table copies): its name and what it holds */
  itemTag(): ItemTag | null {
    const t: ItemTag = {};
    if (this.customName !== undefined) t.customName = this.customName;
    const c = containerContents(this.container.items);
    if (c.length) t.container = c;
    return Object.keys(t).length ? t : null;
  }

  protected override saveData(): Record<string, number | string> | undefined {
    const d = super.saveData() ?? {};
    if (this.customName !== undefined) d.CustomName = this.customName;
    return Object.keys(d).length ? d : undefined;
  }

  protected override loadData(d: Record<string, number | string>): void {
    super.loadData(d);
    this.customName = typeof d.CustomName === 'string' ? d.CustomName : undefined;
  }
}

registerBlockEntity((name, x, y, z) => (isShulkerBox(name) ? new ShulkerBoxBlockEntity(x, y, z) : null));
