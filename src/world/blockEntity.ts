// Block entities: chests and furnaces (vanilla ChestBlockEntity /
// AbstractFurnaceBlockEntity), with persistence to saved chunks.

import { SimpleContainer, isEmpty } from '../inventory/container';
import { ItemStack, ITEMS, ItemTag, cloneTag, type BannerLayer, type Rarity } from '../item/item';
import { cookingResult, cookingTime, burnDuration, type CookingKind } from '../inventory/recipes';
import { BLOCKS, STATE_BLOCK, FACE_OCC } from './block';
import type { World } from './world';
import type { Level } from '../game/level';
import type { Entity } from '../entity/entity';
import { fillContainer } from '../game/loot';
import { brewMix, hasMix, isBrewingIngredient } from '../item/potions';

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
  /** vanilla applyComponentsFromItemStack: what the item it was placed from carries (a banner's patterns) */
  applyComponents(_s: ItemStack): void {}
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
  readonly id: string = 'chest';
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

/** vanilla Direction.getNormal of the six facings */
const FACING_NORMAL: Record<string, [number, number, number]> = { down: [0, -1, 0], up: [0, 1, 0], north: [0, 0, -1], south: [0, 0, 1], west: [-1, 0, 0], east: [1, 0, 0] };

/**
 * vanilla BarrelBlockEntity: a chest's 27 slots behind a lid, open (the block's `open`) while anyone is looking
 * inside (ContainerOpenersCounter: the first to look opens it, the last to leave shuts it)
 */
export class BarrelBlockEntity extends ChestBlockEntity {
  override readonly id = 'barrel';
  /** vanilla startOpen */
  startOpen(level: Level): void {
    if (!this.removed && this.openCount++ === 0) this.setOpen(level, true);
  }
  /** vanilla stopOpen */
  stopOpen(level: Level): void {
    if (this.removed || this.openCount === 0) return;
    if (--this.openCount === 0) this.setOpen(level, false);
  }
  /** vanilla BarrelBlockEntity.onOpen / onClose: the lid's sound at its face, and the block's `open` */
  private setOpen(level: Level, open: boolean): void {
    const st = level.getState(this.x, this.y, this.z);
    const b = BLOCKS[STATE_BLOCK[st]];
    if (b.name !== 'barrel') return;
    const [nx, ny, nz] = FACING_NORMAL[b.get<string>(st, 'facing')];
    level.sound.play(open ? 'block.barrel.open' : 'block.barrel.close', this.x + 0.5 + nx / 2, this.y + 0.5 + ny / 2, this.z + 0.5 + nz / 2, 0.5, Math.random() * 0.1 + 0.9);
    level.setBlock(this.x, this.y, this.z, b.with(st, 'open', open));
  }
}

/**
 * vanilla AbstractFurnaceBlockEntity, and its smoker and blast furnace (SmokerBlockEntity, BlastFurnaceBlockEntity:
 * their own recipes, cooked in half the time on fuel that lasts half as long)
 */
export class FurnaceBlockEntity extends BlockEntity {
  readonly id: CookingKind;
  litTime = 0;
  litDuration = 0;
  cookingProgress = 0;
  cookingTotalTime: number;
  storedXp = 0;
  constructor(x: number, y: number, z: number, kind: CookingKind = 'furnace') {
    super(x, y, z, 3);
    this.id = kind;
    this.cookingTotalTime = cookingTime(kind);
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
    this.cookingTotalTime = Number(d.cookTotal ?? cookingTime(this.id));
    this.storedXp = Number(d.xp ?? 0);
  }

  private canBurn(): boolean {
    const input = this.container.get(0);
    const r = cookingResult(this.id, input);
    if (!r) return false;
    const out = this.container.get(2);
    if (isEmpty(out)) return true;
    if (out.item.id !== r.result) return false;
    return out.count < out.maxStack;
  }

  private burn(): void {
    const input = this.container.get(0)!;
    const r = cookingResult(this.id, input)!;
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
        this.litTime = burnDuration(this.id, fuel);
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
          this.cookingTotalTime = cookingTime(this.id);
          this.burn();
        }
      } else this.cookingProgress = 0;
    } else if (!this.isLit && this.cookingProgress > 0) {
      this.cookingProgress = Math.max(0, Math.min(this.cookingTotalTime, this.cookingProgress - 2));
    }
    if (wasLit !== this.isLit) {
      const st = level.getState(this.x, this.y, this.z);
      const b = BLOCKS[STATE_BLOCK[st]];
      if (b.name === this.id) level.setBlock(this.x, this.y, this.z, b.with(st, 'lit', this.isLit), false);
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

/**
 * vanilla LecternBlockEntity: the book on the lectern (its one slot, so breaking the lectern drops it) and the page
 * it lies open at
 */
export class LecternBlockEntity extends BlockEntity {
  readonly id = 'lectern';
  page = 0;
  constructor(x: number, y: number, z: number) {
    super(x, y, z, 1);
  }
  get book(): ItemStack | null {
    return this.container.get(0);
  }
  /** vanilla setBook: a new book opens at its first page */
  setBook(s: ItemStack | null): void {
    this.container.items[0] = s;
    this.page = 0;
    this.container.changed();
  }
  protected override saveData(): Record<string, number> {
    return { page: this.page };
  }
  protected override loadData(d: Record<string, number | string>): void {
    this.page = Number(d.page ?? 0);
  }
}

/**
 * vanilla BrewingStandBlockEntity: three bottles (slots 0-2), the ingredient (3) and blaze powder for fuel (4); the
 * block shows a bottle on each arm whose slot is filled. (No potions yet, so nothing brews: its menu is to come.)
 */
/** vanilla BrewingStandBlockEntity.isBrewable: an ingredient that brews with one of the bottles */
function isBrewable(c: SimpleContainer): boolean {
  const ing = c.get(3);
  if (!ing || !isBrewingIngredient(ing)) return false;
  for (let i = 0; i < 3; i++) if (hasMix(c.get(i), ing)) return true;
  return false;
}

/**
 * vanilla BrewingStandBlockEntity: three bottles (slots 0-2), the ingredient (3) and blaze powder (4). A powder is
 * 20 brews; a brew takes 20 seconds, and stops if the ingredient changes or stops brewing with the bottles
 */
export class BrewingStandBlockEntity extends BlockEntity {
  readonly id = 'brewing_stand';
  /** vanilla BREW_TIME_MAX */
  static readonly BREW_TIME = 400;
  /** vanilla FUEL_USES */
  static readonly FUEL_USES = 20;
  brewTime = 0;
  fuel = 0;
  /** vanilla ingredient: what the brew began with */
  private ingredient: string | null = null;
  private lastBottles: boolean[] | null = null;
  constructor(x: number, y: number, z: number) {
    super(x, y, z, 5);
  }
  /** vanilla serverTick: blaze powder tops up the fuel, a brew counts down, the arms follow the bottle slots */
  override tick(level: Level): void {
    const c = this.container;
    const powder = c.get(4);
    if (this.fuel <= 0 && powder && powder.item.id === 'blaze_powder') {
      this.fuel = BrewingStandBlockEntity.FUEL_USES;
      if (--powder.count <= 0) c.items[4] = null;
      c.changed();
    }
    const brewable = isBrewable(c);
    const ing = c.get(3);
    if (this.brewTime > 0) {
      this.brewTime--;
      if (this.brewTime === 0 && brewable) this.doBrew(level);
      else if (!brewable || ing?.item.id !== this.ingredient) this.brewTime = 0;
      c.changed();
    } else if (brewable && this.fuel > 0) {
      this.fuel--;
      this.brewTime = BrewingStandBlockEntity.BREW_TIME;
      this.ingredient = ing!.item.id;
      c.changed();
    }
    const bits = [0, 1, 2].map((i) => !isEmpty(c.get(i)));
    if (this.lastBottles && bits.every((b, i) => b === this.lastBottles![i])) return;
    this.lastBottles = bits;
    const st = level.getState(this.x, this.y, this.z);
    const b = BLOCKS[STATE_BLOCK[st]];
    if (b.name !== 'brewing_stand') return;
    let now = st;
    bits.forEach((v, i) => (now = b.with(now, `has_bottle_${i}`, v)));
    if (now !== st) level.setBlock(this.x, this.y, this.z, now, 2);
  }
  /**
   * vanilla doBrew: each bottle becomes what it brews into, one of the ingredient is used, and what's left of it (the
   * dragon's breath's bottle) stays in its slot when it was the last, else drops out; then the bubbling (level event 1035)
   */
  private doBrew(level: Level): void {
    const c = this.container;
    const ing = c.get(3)!;
    for (let i = 0; i < 3; i++) c.items[i] = brewMix(ing, c.get(i));
    ing.count--;
    let left: ItemStack | null = ing.count > 0 ? ing : null;
    const rem = ing.item.remainder;
    if (rem) {
      const r = ItemStack.of(rem);
      if (!left) left = r;
      else level.dropStackAt(this.x, this.y, this.z, r);
    }
    c.items[3] = left;
    c.changed();
    level.sound.play('block.brewing_stand.brew', this.x + 0.5, this.y + 0.5, this.z + 0.5, 1, 1);
  }
  protected override saveData(): Record<string, number> {
    return { brewTime: this.brewTime, fuel: this.fuel };
  }
  protected override loadData(d: Record<string, number | string>): void {
    this.brewTime = Number(d.brewTime ?? 0);
    this.fuel = Number(d.fuel ?? 0);
    // (vanilla loadAdditional: a brew under way goes on with the ingredient that's there)
    if (this.brewTime > 0) this.ingredient = this.container.get(3)?.item.id ?? null;
  }
}

/**
 * vanilla CampfireBlock.makeParticles: a puff of campfire smoke (a signal fire's rises far higher), and a wisp of
 * ordinary smoke as well when it is being put out
 */
export function campfireSmoke(level: Level, x: number, y: number, z: number, signal: boolean, extra: boolean): void {
  const side = () => (Math.random() < 0.5 ? 1 : -1);
  const kind = signal ? 'campfire_signal_smoke' : 'campfire_cosy_smoke';
  level.particles.spawn?.(kind, x + 0.5 + (Math.random() / 3) * side(), y + Math.random() + Math.random(), z + 0.5 + (Math.random() / 3) * side(), 0, 0.07, 0);
  if (extra) level.particles.spawn?.('smoke', x + 0.5 + (Math.random() / 4) * side(), y + 0.4, z + 0.5 + (Math.random() / 4) * side(), 0, 0.005, 0);
}

/**
 * vanilla CampfireBlockEntity (both campfires have one): four places round the fire for food to cook on (the cooking
 * is still to come) and, while it burns, the smoke it gives off (particleTick)
 */
export class CampfireBlockEntity extends BlockEntity {
  readonly id = 'campfire';
  constructor(x: number, y: number, z: number) {
    super(x, y, z, 4);
  }
  override tick(level: Level): void {
    const st = level.getState(this.x, this.y, this.z);
    const b = BLOCKS[STATE_BLOCK[st]];
    if (b.propIndex('signal_fire') < 0 || !b.get(st, 'lit')) return;
    if (Math.random() < 0.11) {
      const signal = !!b.get(st, 'signal_fire');
      for (let i = Math.floor(Math.random() * 2) + 2; i > 0; i--) campfireSmoke(level, this.x, this.y, this.z, signal, false);
    }
  }
}

/**
 * vanilla BannerBlockEntity: the banner's layers over its base colour (the block's) and its custom name; and what
 * else the item it was placed from carried that the drop gives back (vanilla BlockEntity.components, copied by the
 * banner's loot table: the ominous banner's item name, hidden tooltip and rarity)
 */
export class BannerBlockEntity extends BlockEntity {
  readonly id = 'banner';
  patterns: BannerLayer[] = [];
  customName: string | undefined = undefined;
  kept: Pick<ItemTag, 'itemName' | 'hideAdditional' | 'rarity'> = {};
  constructor(x: number, y: number, z: number) {
    super(x, y, z, 0);
  }
  /** vanilla applyImplicitComponents: BANNER_PATTERNS and CUSTOM_NAME; the rest is kept as it came */
  override applyComponents(s: ItemStack): void {
    const t = s.tag;
    this.patterns = t?.patterns?.map((l) => ({ ...l })) ?? [];
    this.customName = t?.customName;
    this.kept = {};
    if (t?.itemName !== undefined) this.kept.itemName = t.itemName;
    if (t?.hideAdditional) this.kept.hideAdditional = true;
    if (t?.rarity) this.kept.rarity = t.rarity;
    this.container.changed();
  }
  /** vanilla collectComponents (with the kept ones): the components the banner's item gets back */
  itemTag(): ItemTag | null {
    const t: ItemTag = { ...this.kept };
    if (this.patterns.length) t.patterns = this.patterns.map((l) => ({ ...l }));
    if (this.customName !== undefined) t.customName = this.customName;
    return Object.keys(t).length ? t : null;
  }
  protected override saveData(): Record<string, number | string> | undefined {
    const d: Record<string, number | string> = {};
    if (this.patterns.length) d.patterns = JSON.stringify(this.patterns);
    if (this.customName !== undefined) d.name = this.customName;
    if (this.kept.itemName !== undefined) d.itemName = this.kept.itemName;
    if (this.kept.hideAdditional) d.hide = 1;
    if (this.kept.rarity) d.rarity = this.kept.rarity;
    return Object.keys(d).length ? d : undefined;
  }
  protected override loadData(d: Record<string, number | string>): void {
    try {
      const p = typeof d.patterns === 'string' ? JSON.parse(d.patterns) : [];
      this.patterns = Array.isArray(p) ? p.filter((l) => l && typeof l.pattern === 'string' && typeof l.color === 'string') : [];
    } catch {
      this.patterns = [];
    }
    this.customName = typeof d.name === 'string' ? d.name : undefined;
    this.kept = {};
    if (typeof d.itemName === 'string') this.kept.itemName = d.itemName;
    if (d.hide) this.kept.hideAdditional = true;
    if (typeof d.rarity === 'string') this.kept.rarity = d.rarity as Rarity;
  }
}

/**
 * vanilla TheEndPortalBlockEntity: nothing to keep, but it's what gets an end portal drawn (render/endRenderer.ts
 * draws its up and down faces, vanilla shouldRenderFace: the Y axis only)
 */
export class EndPortalBlockEntity extends BlockEntity {
  readonly id = 'end_portal';
  constructor(x: number, y: number, z: number) {
    super(x, y, z, 0);
  }
}

/**
 * vanilla TheEndGatewayBlockEntity: how old it is (its magenta beam rises for the first 10 seconds), its cooldown
 * (the purple flash each time something goes through, and every two minutes anyway), and where it leads — unknown
 * till something first goes through one of the gateways round the main island, found then
 */
export class EndGatewayBlockEntity extends BlockEntity {
  readonly id = 'end_gateway';
  age = 0;
  teleportCooldown = 0;
  exitPortal: [number, number, number] | null = null;
  exactTeleport = false;
  constructor(x: number, y: number, z: number) {
    super(x, y, z, 0);
  }
  /** vanilla isSpawning: the first 10 seconds */
  isSpawning(): boolean {
    return this.age < 200;
  }
  isCoolingDown(): boolean {
    return this.teleportCooldown > 0;
  }
  /** vanilla getSpawnPercent */
  spawnPercent(partial: number): number {
    return Math.max(0, Math.min(1, (this.age + partial) / 200));
  }
  /** vanilla getCooldownPercent */
  cooldownPercent(partial: number): number {
    return 1 - Math.max(0, Math.min(1, (this.teleportCooldown - partial) / 40));
  }
  /**
   * vanilla TheEndGatewayBlockEntity.portalTick: older by a tick; the cooldown runs down, or every 2 minutes starts
   * (its beam flashes); the chunk is saved with it when either changes
   */
  override tick(level: Level): void {
    const spawning = this.isSpawning(), cooling = this.isCoolingDown();
    this.age++;
    if (cooling) this.teleportCooldown--;
    else if (this.age % 2400 === 0) this.teleportCooldown = 40;
    if (spawning !== this.isSpawning() || cooling !== this.isCoolingDown()) {
      const c = level.world.getChunk(this.x >> 4, this.z >> 4);
      if (c) c.modified = true;
    }
  }
  /** vanilla triggerCooldown (and the block event that tells the client) */
  triggerCooldown(): void {
    this.teleportCooldown = 40;
  }
  /**
   * vanilla shouldRenderFace (Block.shouldRenderFace): the face toward `dir` (0 down, 1 up, 2 north, 3 south, 4 west,
   * 5 east) shows unless the neighbour's face against it is whole
   */
  shouldRenderFace(w: World, dir: number): boolean {
    const n = w.getState(this.x + (dir === 4 ? -1 : dir === 5 ? 1 : 0), this.y + (dir === 0 ? -1 : dir === 1 ? 1 : 0), this.z + (dir === 2 ? -1 : dir === 3 ? 1 : 0));
    return ((FACE_OCC[n] >> (dir ^ 1)) & 1) === 0;
  }
  /** vanilla getParticleAmount: one for each face that shows */
  particleAmount(w: World): number {
    let n = 0;
    for (let d = 0; d < 6; d++) if (this.shouldRenderFace(w, d)) n++;
    return n;
  }
  protected override saveData(): Record<string, number | string> {
    const d: Record<string, number | string> = { Age: this.age };
    if (this.exitPortal) {
      [d.ExitX, d.ExitY, d.ExitZ] = this.exitPortal;
      if (this.exactTeleport) d.ExactTeleport = 1;
    }
    return d;
  }
  protected override loadData(d: Record<string, number | string>): void {
    this.age = Number(d.Age ?? 0);
    this.exitPortal = d.ExitX !== undefined ? [Number(d.ExitX), Number(d.ExitY), Number(d.ExitZ)] : null;
    this.exactTeleport = d.ExactTeleport === 1;
  }
}

/** block entities kept with their blocks elsewhere (the redstone components': dispensers and droppers, moving pistons) */
const BLOCK_ENTITY_TYPES = new Map<string, (x: number, y: number, z: number) => BlockEntity>();

/** add a block entity for the block `name` (and its saves under that id) */
export function registerBlockEntityType(name: string, make: (x: number, y: number, z: number) => BlockEntity): void {
  BLOCK_ENTITY_TYPES.set(name, make);
}

export function createBlockEntity(name: string, x: number, y: number, z: number): BlockEntity | null {
  const make = BLOCK_ENTITY_TYPES.get(name);
  if (make) return make(x, y, z);
  if (name === 'chest') return new ChestBlockEntity(x, y, z);
  if (name === 'enchanting_table') return new EnchantingTableBlockEntity(x, y, z);
  if (name === 'furnace' || name === 'smoker' || name === 'blast_furnace') return new FurnaceBlockEntity(x, y, z, name);
  if (name === 'spawner') return new SpawnerBlockEntity(x, y, z);
  if (name === 'bell') return new BellBlockEntity(x, y, z);
  if (name === 'barrel') return new BarrelBlockEntity(x, y, z);
  if (name === 'lectern') return new LecternBlockEntity(x, y, z);
  if (name === 'brewing_stand') return new BrewingStandBlockEntity(x, y, z);
  if (name === 'campfire' || name === 'soul_campfire') return new CampfireBlockEntity(x, y, z);
  if (name === 'end_portal') return new EndPortalBlockEntity(x, y, z);
  if (name === 'end_gateway') return new EndGatewayBlockEntity(x, y, z);
  if (name === 'banner' || name.endsWith('_banner')) return new BannerBlockEntity(x, y, z);
  return null;
}

export function loadBlockEntity(d: SavedBlockEntity): BlockEntity | null {
  const be = createBlockEntity(d.id, d.x, d.y, d.z);
  be?.load(d);
  return be;
}
