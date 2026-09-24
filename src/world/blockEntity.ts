// Block entities: chests and furnaces (vanilla ChestBlockEntity /
// AbstractFurnaceBlockEntity), with persistence to saved chunks.

import { SimpleContainer, isEmpty } from '../inventory/container';
import { ItemStack, ITEMS, ItemTag, cloneTag } from '../item/item';
import { smeltingResult, fuelTime } from '../inventory/recipes';
import { BLOCKS, STATE_BLOCK } from './block';
import type { Level } from '../game/level';
import type { Entity } from '../entity/entity';
import { fillContainer } from '../game/loot';

export interface SavedBlockEntity {
  id: string;
  x: number;
  y: number;
  z: number;
  items: [number, string, number, number, ItemTag?][];
  data?: Record<string, number | string>;
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
  /** vanilla RandomizableContainer.unpackLootTable: roll a pending loot table into the container */
  unpackLoot(): void {}
  save(): SavedBlockEntity {
    const items: SavedBlockEntity['items'] = [];
    this.container.items.forEach((s, i) => {
      if (s) items.push(s.tag ? [i, s.item.id, s.count, s.damage, cloneTag(s.tag)!] : [i, s.item.id, s.count, s.damage]);
    });
    return { id: this.id, x: this.x, y: this.y, z: this.z, items, data: this.saveData() };
  }
  load(d: SavedBlockEntity): void {
    for (const [i, id, n, dmg, tag] of d.items) {
      const it = ITEMS.get(id);
      if (it && i < this.container.size) this.container.items[i] = new ItemStack(it, n, dmg, cloneTag(tag ?? null));
    }
    if (d.data) this.loadData(d.data);
  }
  protected saveData(): Record<string, number | string> | undefined {
    return undefined;
  }
  protected loadData(_d: Record<string, number | string>): void {}
}

export function blockEntityKey(x: number, y: number, z: number): string {
  return `${x},${y},${z}`;
}

export class ChestBlockEntity extends BlockEntity {
  readonly id = 'chest';
  openCount = 0;
  /** vanilla LootTable / LootTableSeed: rolled when first opened or broken */
  lootTable: string | null = null;
  lootSeed = 0;
  constructor(x: number, y: number, z: number) {
    super(x, y, z, 27);
  }
  override unpackLoot(): void {
    if (!this.lootTable) return;
    const table = this.lootTable;
    this.lootTable = null;
    fillContainer(this.container, table, this.lootSeed);
  }
  protected override saveData(): Record<string, number | string> | undefined {
    return this.lootTable ? { lootTable: this.lootTable, lootSeed: this.lootSeed } : undefined;
  }
  protected override loadData(d: Record<string, number | string>): void {
    if (typeof d.lootTable === 'string') {
      this.lootTable = d.lootTable;
      this.lootSeed = Number(d.lootSeed ?? 0);
    }
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
  protected override loadData(d: Record<string, number | string>): void {
    this.litTime = Number(d.litTime ?? 0);
    this.litDuration = Number(d.litDuration ?? 0);
    this.cookingProgress = Number(d.cook ?? 0);
    this.cookingTotalTime = Number(d.cookTotal ?? 200);
    this.storedXp = Number(d.xp ?? 0);
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

/** vanilla SpawnerBlockEntity + BaseSpawner state (the logic lives in game/baseSpawner) */
export class SpawnerBlockEntity extends BlockEntity {
  readonly id = 'spawner';
  /** vanilla SpawnData entity id */
  entityId: string | null = null;
  spawnDelay = 20;
  /** the client copy's countdown (reset to the minimum delay on every spawn); it drives the spin speed */
  clientDelay = 20;
  spin = 0;
  oSpin = 0;
  /** mob drawn spinning in the cage (render only, never added to the level) */
  display: unknown = null;
  constructor(x: number, y: number, z: number) {
    super(x, y, z, 0);
  }
  setEntityId(id: string): void {
    this.entityId = id;
    this.display = null;
  }
  protected override saveData(): Record<string, number | string> {
    return { entity: this.entityId ?? '', delay: this.spawnDelay };
  }
  protected override loadData(d: Record<string, number | string>): void {
    this.entityId = typeof d.entity === 'string' && d.entity ? d.entity : null;
    this.spawnDelay = Number(d.delay ?? 20);
  }
}

/**
 * vanilla EnchantingTableBlockEntity: the floating book (bookAnimationTick, client side) opens and turns toward a
 * player within 3 blocks, idly spins otherwise, and flips pages now and then
 */
export class EnchantingTableBlockEntity extends BlockEntity {
  readonly id = 'enchanting_table';
  time = 0;
  flip = 0;
  oFlip = 0;
  flipT = 0;
  flipA = 0;
  open = 0;
  oOpen = 0;
  rot = 0;
  oRot = 0;
  tRot = 0;
  constructor(x: number, y: number, z: number) {
    super(x, y, z, 0);
  }
  override tick(level: Level): void {
    this.oOpen = this.open;
    this.oRot = this.rot;
    const cx = this.x + 0.5, cy = this.y + 0.5, cz = this.z + 0.5;
    const p = level.player;
    const near = p && p.gameMode !== 'spectator' && p.distanceToSqr(cx, cy, cz) < 9 ? p : null;
    if (near) {
      this.tRot = Math.atan2(near.z - cz, near.x - cx);
      this.open += 0.1;
      if (this.open < 0.5 || Math.floor(Math.random() * 40) === 0) {
        const f1 = this.flipT;
        do this.flipT += Math.floor(Math.random() * 4) - Math.floor(Math.random() * 4);
        while (f1 === this.flipT);
      }
    } else {
      this.tRot += 0.02;
      this.open -= 0.1;
    }
    const PI = Math.PI;
    while (this.rot >= PI) this.rot -= PI * 2;
    while (this.rot < -PI) this.rot += PI * 2;
    while (this.tRot >= PI) this.tRot -= PI * 2;
    while (this.tRot < -PI) this.tRot += PI * 2;
    let f2 = this.tRot - this.rot;
    while (f2 >= PI) f2 -= PI * 2;
    while (f2 < -PI) f2 += PI * 2;
    this.rot += f2 * 0.4;
    this.open = Math.max(0, Math.min(1, this.open));
    this.time++;
    this.oFlip = this.flip;
    const f = Math.max(-0.2, Math.min(0.2, (this.flipT - this.flip) * 0.4));
    this.flipA += (f - this.flipA) * 0.9;
    this.flip += this.flipA;
  }
}

/**
 * vanilla BellBlockEntity: rung, the bell swings for 50 ticks (BellRenderer tips it away from the side it was struck
 * on); the living things around it are remembered between rings, for 60 ticks
 */
export class BellBlockEntity extends BlockEntity {
  readonly id = 'bell';
  ticks = 0;
  shaking = false;
  /** the struck side (a Dir: 2 north, 3 south, 4 west, 5 east) */
  clickDirection = 2;
  lastRingTimestamp = -Infinity;
  nearbyEntities: Entity[] | null = null;
  constructor(x: number, y: number, z: number) {
    super(x, y, z, 0);
  }
  /** vanilla onHit / triggerEvent(1): (re)start the swing */
  onHit(dir: number): void {
    this.clickDirection = dir;
    this.ticks = 0;
    this.shaking = true;
  }
  /** vanilla BellBlockEntity.tick (raiders nearby would make it resonate: there are none) */
  override tick(): void {
    if (this.shaking) this.ticks++;
    if (this.ticks >= 50) {
      this.shaking = false;
      this.ticks = 0;
    }
  }
}

export function createBlockEntity(name: string, x: number, y: number, z: number): BlockEntity | null {
  if (name === 'chest') return new ChestBlockEntity(x, y, z);
  if (name === 'enchanting_table') return new EnchantingTableBlockEntity(x, y, z);
  if (name === 'furnace') return new FurnaceBlockEntity(x, y, z);
  if (name === 'spawner') return new SpawnerBlockEntity(x, y, z);
  if (name === 'bell') return new BellBlockEntity(x, y, z);
  return null;
}

export function loadBlockEntity(d: SavedBlockEntity): BlockEntity | null {
  const be = createBlockEntity(d.id, d.x, d.y, d.z);
  be?.load(d);
  return be;
}
