// (remaining mobs: the bee) The bee nest and the beehive (vanilla BeehiveBlock and BeehiveBlockEntity), and the honey
// block (vanilla HoneyBlock). A hive keeps up to three bees: one going in rests at least 30 seconds (two minutes with
// nectar, which it leaves as honey: the hive fills a level at a time to 5, the front oozing and dripping), and comes
// out again by day, out of the rain, where the way in front is clear; the hive hums while it's busy. Full, it gives
// three honeycomb to shears or a honey bottle to a glass bottle, and that, or breaking it without silk touch, sends
// the bees out angry at whoever did it, unless a lit campfire smokes it from below (up to five blocks, through one
// block in the way). Fire next to it or a blast (tnt, a creeper, the wither) turns them out too. With silk touch it
// comes away with its bees and its honey; a nest breaks to nothing otherwise, a hive drops itself. The honey block
// holds whatever walks on it (slower, jumping lower), slows a fall onto it to a fifth of the harm, and something
// against its side slides slowly down it. The bees themselves are entity/bee.ts; the blocks world/blocksBees.ts.

import { BLOCKS, STATE_BLOCK, FLAGS, F_FULL_COLLISION, F_WATER, F_LAVA, COLLISION, getBlock, type Block } from '../world/block';
import { DIR_NAMES, DX, DY, DZ, dirFromName, dirFromYaw, OPPOSITE } from '../world/dir';
import { BlockEntity, registerBlockEntityType } from '../world/blockEntity';
import { ItemStack, type BeeOccupant } from '../item/item';
import { levelOf, hurtAndBreak } from '../item/enchantHelper';
import { registerHoverText } from '../item/hoverText';
import { registerBehavior } from './blockBehavior';
import type { Level } from './level';
import type { Entity } from '../entity/entity';
import type { Player } from '../entity/player';
import type { SavedEntity } from '../entity/mob';
import { LivingEntity } from '../entity/living';
import { ItemEntity } from '../entity/itemEntity';
import { AABB } from '../core/aabb';
import { Bee } from '../entity/bee';
import { MAX_HONEY_LEVELS } from '../world/blocksBees';
import { hiveDispense } from './redstone/dispenseItems';

const blk = (st: number): Block => BLOCKS[STATE_BLOCK[st]];

/** vanilla BeehiveBlockEntity.MAX_OCCUPANTS */
export const MAX_OCCUPANTS = 3;
/** vanilla MIN_OCCUPATION_TICKS_NECTAR and MIN_OCCUPATION_TICKS_NECTARLESS */
const MIN_TICKS_NECTAR = 2400;
const MIN_TICKS_NECTARLESS = 600;

/** vanilla BeehiveBlockEntity.BeeReleaseStatus */
export type BeeReleaseStatus = 'honey_delivered' | 'bee_released' | 'emergency';

/** vanilla #beehives: the bee nest and the beehive */
export function isHive(st: number): boolean {
  const n = blk(st).name;
  return n === 'bee_nest' || n === 'beehive';
}

/** vanilla BeehiveBlockEntity.getHoneyLevel */
export function honeyLevel(st: number): number {
  return blk(st).get<number>(st, 'honey_level');
}

/** vanilla Level.isNight: not day, where there's a day at all */
export function isNight(level: Level): boolean {
  return level.world.dim.fixedTime === null && !level.isDay();
}

// --- a bee going in and coming out (vanilla BeehiveBlockEntity.Occupant) -----------------------------------------

/**
 * vanilla IGNORED_BEE_TAGS as the game's saved entity has them: what a bee leaves at the door (where it was, its
 * motion and fire, what it held and wore, its lead, its uuid: it comes out a new bee), and of its own data whether it
 * floats, how long it must stay out, how long since it pollinated, the crops it's grown since and its hive
 */
const IGNORED_KEYS = ['uuid', 'x', 'y', 'z', 'yaw', 'pitch', 'dx', 'dy', 'dz', 'fire', 'hand', 'handDrop', 'offhand', 'offDrop', 'armor', 'armorDrop', 'loot', 'leash'];
const IGNORED_DATA_KEYS = ['NoGravity', 'CannotEnterHiveTicks', 'TicksSincePollination', 'CropsGrownSincePollination', 'hive_pos', 'passengers'];

/** vanilla Occupant.of: a bee's record as it goes in, staying at least 2 minutes with nectar, 30 seconds without */
export function occupantOf(bee: Bee): BeeOccupant {
  const d = JSON.parse(JSON.stringify(bee.save())) as Record<string, unknown>;
  for (const k of IGNORED_KEYS) delete d[k];
  const data = (d.data ?? {}) as Record<string, unknown>;
  for (const k of IGNORED_DATA_KEYS) delete data[k];
  d.data = data;
  return { entityData: d, ticksInHive: 0, minTicksInHive: data.HasNectar === true ? MIN_TICKS_NECTAR : MIN_TICKS_NECTARLESS };
}

/** vanilla Occupant.create: a new bee, `ticks` into its 30 seconds (a nest the world was made with) */
export function newOccupant(ticks: number): BeeOccupant {
  return { entityData: { id: 'bee' }, ticksInHive: ticks, minTicksInHive: MIN_TICKS_NECTARLESS };
}

/**
 * vanilla Occupant.createEntity: the bee made again from its record (a bee: #beehive_inhabitors), floating, this its
 * hive, and older (or less in love) by the time it spent inside (setBeeReleaseData)
 */
function createBee(level: Level, hx: number, hy: number, hz: number, o: BeeOccupant): Bee | null {
  const d = o.entityData as Partial<SavedEntity>;
  if (d.id !== 'bee') return null;
  const bee = new Bee(level);
  bee.load({ id: 'bee', x: hx + 0.5, y: hy, z: hz + 0.5, yaw: 0, pitch: 0, dx: 0, dy: 0, dz: 0, health: bee.health, fire: -1, ...d, data: { ...(d.data ?? {}) } } as SavedEntity);
  bee.noGravityFlag = true;
  bee.hivePos = [hx, hy, hz];
  const a = bee.age;
  if (a < 0) bee.setAge(Math.min(0, a + o.ticksInHive));
  else if (a > 0) bee.setAge(Math.max(0, a - o.ticksInHive));
  bee.inLove = Math.max(0, bee.inLove - o.ticksInHive);
  return bee;
}

/**
 * vanilla BeehiveBlockEntity.releaseOccupant: not by night or in the rain, nor with its way out blocked, unless it's an
 * emergency; a bee with nectar leaves honey (one level, one time in a hundred two, up to 5) and forgets its nectar;
 * nine times in ten it learns the flower the hive knows. It comes out in front (in the hive's middle when that's
 * blocked), with the hive's exit sound
 */
function releaseOccupant(level: Level, hx: number, hy: number, hz: number, state: number, o: BeeOccupant, out: Bee[] | null, status: BeeReleaseStatus, flower: [number, number, number] | null): boolean {
  if ((isNight(level) || level.isRaining()) && status !== 'emergency') return false;
  const b = blk(state);
  const facing = b.propIndex('facing') >= 0 ? dirFromName(b.get<string>(state, 'facing')) : 2;
  const front = level.world.getState(hx + DX[facing], hy, hz + DZ[facing]);
  const blocked = (COLLISION[front]?.length ?? 0) > 0;
  if (blocked && status !== 'emergency') return false;
  const bee = createBee(level, hx, hy, hz, o);
  if (!bee) return false;
  if (flower && !bee.savedFlowerPos && level.random.nextFloat() < 0.9) bee.savedFlowerPos = [flower[0], flower[1], flower[2]];
  if (status === 'honey_delivered') {
    bee.dropOffNectar();
    if (isHive(state)) {
      const i = honeyLevel(state);
      if (i < MAX_HONEY_LEVELS) {
        let j = level.random.nextInt(100) === 0 ? 2 : 1;
        if (i + j > MAX_HONEY_LEVELS) j--;
        level.setBlock(hx, hy, hz, b.with(state, 'honey_level', i + j));
      }
    }
  }
  out?.push(bee);
  const d = blocked ? 0 : 0.55 + bee.width / 2;
  bee.moveTo(hx + 0.5 + d * DX[facing], hy + 0.5 - bee.height / 2, hz + 0.5 + d * DZ[facing], bee.yaw, bee.pitch);
  level.sound.play('block.beehive.exit', hx + 0.5, hy + 0.5, hz + 0.5, 1, 1);
  level.gameEvent('block_change', hx + 0.5, hy + 0.5, hz + 0.5, { entity: bee, state: level.getState(hx, hy, hz) });
  level.addEntity(bee);
  return true;
}

/** a bee inside: its record and the ticks it's been in (vanilla BeehiveBlockEntity.BeeData) */
interface BeeData {
  occupant: BeeOccupant;
  ticksInHive: number;
}

/**
 * vanilla BeehiveBlockEntity: the bees inside (at most three) and the flower the hive knows of; ticking, it lets out
 * those that have been in long enough, and now and then hums. It's the bee nest's and the beehive's alike
 */
export class BeehiveBlockEntity extends BlockEntity {
  readonly id: string;
  private stored: BeeData[] = [];
  /** vanilla savedFlowerPos */
  savedFlowerPos: [number, number, number] | null = null;
  constructor(x: number, y: number, z: number, id: string) {
    super(x, y, z, 0);
    this.id = id;
  }

  /** vanilla isEmpty: no bees in it */
  isEmpty(): boolean {
    return this.stored.length === 0;
  }
  /** vanilla isFull */
  isFull(): boolean {
    return this.stored.length === MAX_OCCUPANTS;
  }
  /** vanilla getOccupantCount */
  occupantCount(): number {
    return this.stored.length;
  }
  /** vanilla getBees: each bee's record, with the ticks it's been in so far */
  bees(): BeeOccupant[] {
    return this.stored.map((b) => ({ entityData: JSON.parse(JSON.stringify(b.occupant.entityData)), ticksInHive: b.ticksInHive, minTicksInHive: b.occupant.minTicksInHive }));
  }

  /** vanilla isFireNearby: fire (not soul fire: vanilla FireBlock) in any of the 26 blocks round it */
  isFireNearby(level: Level): boolean {
    for (let x = -1; x <= 1; x++)
      for (let y = -1; y <= 1; y++)
        for (let z = -1; z <= 1; z++) if (blk(level.world.getState(this.x + x, this.y + y, this.z + z)).name === 'fire') return true;
    return false;
  }

  /** vanilla isSedated: smoked from below (CampfireBlock.isSmokeyPos) */
  isSedated(level: Level): boolean {
    return isSmokeyPos(level, this.x, this.y, this.z);
  }

  /**
   * vanilla emptyAllLivingFromHive: every bee out that may come out; those within 4 blocks of `player` go for them,
   * unless the smoke has calmed them, when they keep out of the hive for 20 seconds instead
   */
  emptyAllLivingFromHive(level: Level, player: Player | null, state: number, status: BeeReleaseStatus): void {
    const out = this.releaseAllOccupants(level, state, status);
    if (!player) return;
    for (const bee of out) {
      if ((player.x - bee.x) ** 2 + (player.y - bee.y) ** 2 + (player.z - bee.z) ** 2 > 16) continue;
      if (!this.isSedated(level)) bee.setTarget(player);
      else bee.stayOutOfHiveCountdown = 400;
    }
  }

  /** vanilla releaseAllOccupants */
  private releaseAllOccupants(level: Level, state: number, status: BeeReleaseStatus): Bee[] {
    const out: Bee[] = [];
    this.stored = this.stored.filter((b) => !releaseOccupant(level, this.x, this.y, this.z, state, this.toOccupant(b), out, status, this.savedFlowerPos));
    if (out.length) this.container.changed();
    return out;
  }

  private toOccupant(b: BeeData): BeeOccupant {
    return { entityData: b.occupant.entityData, ticksInHive: b.ticksInHive, minTicksInHive: b.occupant.minTicksInHive };
  }

  /**
   * vanilla addOccupant: a bee goes in (off whatever it rides, without its riders), unless it's full; the hive may
   * learn the flower it knows (half the time, when the hive knows one already), with the enter sound at the block's
   * corner
   */
  addOccupant(level: Level, bee: Bee): void {
    if (this.stored.length >= MAX_OCCUPANTS) return;
    bee.stopRiding();
    bee.ejectPassengers();
    this.storeBee(occupantOf(bee));
    if (bee.savedFlowerPos && (!this.savedFlowerPos || level.random.nextBool())) this.savedFlowerPos = [...bee.savedFlowerPos];
    level.sound.play('block.beehive.enter', this.x, this.y, this.z, 1, 1);
    level.gameEvent('block_change', this.x + 0.5, this.y + 0.5, this.z + 0.5, { entity: bee, state: level.getState(this.x, this.y, this.z) });
    bee.remove();
    this.container.changed();
  }

  /** vanilla storeBee */
  storeBee(o: BeeOccupant): void {
    this.stored.push({ occupant: o, ticksInHive: o.ticksInHive });
  }

  /**
   * vanilla serverTick: each bee in long enough comes out if it may (with honey if it had nectar), and one tick in 200
   * a hive with bees in it hums (only in the chunks that tick)
   */
  override tick(level: Level): void {
    if (level.isClientSide || !level.isEntityTicking(this.x, this.z)) return;
    const state = level.getState(this.x, this.y, this.z);
    let released = false;
    this.stored = this.stored.filter((b) => {
      // (vanilla BeeData.tick: ticksInHive++ > minTicksInHive)
      if (!(b.ticksInHive++ > b.occupant.minTicksInHive)) return true;
      const status: BeeReleaseStatus = b.occupant.entityData.data && (b.occupant.entityData.data as Record<string, unknown>).HasNectar === true ? 'honey_delivered' : 'bee_released';
      if (!releaseOccupant(level, this.x, this.y, this.z, state, this.toOccupant(b), null, status, this.savedFlowerPos)) return true;
      released = true;
      return false;
    });
    if (released) this.container.changed();
    if (this.stored.length && level.random.nextDouble() < 0.005) level.sound.play('block.beehive.work', this.x + 0.5, this.y, this.z + 0.5, 1, 1);
  }

  /** vanilla applyImplicitComponents: the bees the item carries */
  override applyComponents(s: ItemStack): void {
    this.stored = [];
    for (const o of s.tag?.bees ?? []) this.storeBee(JSON.parse(JSON.stringify(o)) as BeeOccupant);
    this.container.changed();
  }

  /** vanilla saveAdditional: the bees (entity_data, ticks_in_hive, min_ticks_in_hive) and flower_pos */
  protected override saveData(): Record<string, number | string> | undefined {
    const d: Record<string, number | string> = {};
    if (this.stored.length) d.bees = JSON.stringify(this.bees());
    if (this.savedFlowerPos) d.flower_pos = this.savedFlowerPos.join(',');
    return Object.keys(d).length ? d : undefined;
  }
  protected override loadData(d: Record<string, number | string>): void {
    this.stored = [];
    if (typeof d.bees === 'string') for (const o of JSON.parse(d.bees) as BeeOccupant[]) if (o && o.entityData) this.storeBee(o);
    this.savedFlowerPos = typeof d.flower_pos === 'string' ? parsePos(d.flower_pos) : null;
  }
}

/** "x,y,z" as a block position */
export function parsePos(s: string): [number, number, number] | null {
  const p = s.split(',').map(Number);
  return p.length === 3 && p.every((v) => Number.isFinite(v)) ? [Math.floor(p[0]), Math.floor(p[1]), Math.floor(p[2])] : null;
}

registerBlockEntityType('bee_nest', (x, y, z) => new BeehiveBlockEntity(x, y, z, 'bee_nest'));
registerBlockEntityType('beehive', (x, y, z) => new BeehiveBlockEntity(x, y, z, 'beehive'));

/** the hive's block entity at (x, y, z), if it has one */
export function hiveAt(level: Level, x: number, y: number, z: number): BeehiveBlockEntity | null {
  const be = level.world.getBlockEntity(x, y, z);
  return be instanceof BeehiveBlockEntity ? be : null;
}

// --- smoke from below (vanilla CampfireBlock.isSmokeyPos) ----------------------------------------------------------

/** vanilla CampfireBlock.isLitCampfire: either campfire, lit */
function isLitCampfire(st: number): boolean {
  const b = blk(st);
  return (b.name === 'campfire' || b.name === 'soul_campfire') && !!b.get(st, 'lit');
}

/**
 * vanilla CampfireBlock.isSmokeyPos: a lit campfire up to five blocks below; the first block on the way that would
 * stop a fence post (VIRTUAL_FENCE_POST, the middle 4 pixels) ends the search, smoky only if a lit campfire is right
 * under that block
 */
export function isSmokeyPos(level: Level, x: number, y: number, z: number): boolean {
  const w = level.world;
  for (let i = 1; i <= 5; i++) {
    const st = w.getState(x, y - i, z);
    if (isLitCampfire(st)) return true;
    const boxes = COLLISION[st];
    if (boxes && boxes.some((b) => b[0] < 10 / 16 && b[3] > 6 / 16 && b[2] < 10 / 16 && b[5] > 6 / 16 && b[1] < 1 && b[4] > 0)) return isLitCampfire(w.getState(x, y - i - 1, z));
  }
  return false;
}

// --- the block (vanilla BeehiveBlock) ------------------------------------------------------------------------------

/** vanilla BeehiveBlock.angerNearbyBees: every bee within 8 across and 6 up or down with nothing to go for picks one of the players there */
export function angerNearbyBees(level: Level, x: number, y: number, z: number): void {
  const box = new AABB(x - 8, y - 6, z - 8, x + 9, y + 7, z + 9);
  const bees = level.getEntities(box, (e) => e instanceof Bee) as Bee[];
  if (!bees.length) return;
  const players = level.getEntities(box, (e) => e.type === 'player') as Player[];
  if (!players.length) return;
  for (const bee of bees) if (!bee.target) bee.setTarget(players[level.random.nextInt(players.length)]);
}

/** vanilla BeehiveBlock.resetHoneyLevel */
function resetHoneyLevel(level: Level, x: number, y: number, z: number, st: number): void {
  level.setBlock(x, y, z, blk(st).with(st, 'honey_level', 0));
}

/** vanilla BeehiveBlock.releaseBeesAndResetHoneyLevel */
export function releaseBeesAndResetHoneyLevel(level: Level, x: number, y: number, z: number, st: number, player: Player | null, status: BeeReleaseStatus): void {
  resetHoneyLevel(level, x, y, z, st);
  hiveAt(level, x, y, z)?.emptyAllLivingFromHive(level, player, st, status);
}

/** vanilla Block.popResource at the block: three honeycomb (BeehiveBlock.dropHoneycomb) */
function dropHoneycomb(level: Level, x: number, y: number, z: number): void {
  ItemEntity.drop(level, x, y, z, ItemStack.of('honeycomb', 3));
}

/** the item a hive breaks into with its bees and honey (vanilla copy_components bees, copy_state honey_level) */
function hiveItem(name: string, st: number, be: BeehiveBlockEntity | null): ItemStack {
  const s = ItemStack.of(name);
  s.tag = { bees: be ? be.bees() : [], blockState: { honey_level: String(honeyLevel(st)) } };
  return s;
}

/** what a blast breaking a hive turns its bees out for (vanilla BeehiveBlock.getDrops' THIS_ENTITY) */
const BLAST_SOURCES = new Set(['tnt', 'creeper', 'wither_skull', 'wither', 'tnt_minecart']);

/** the hive block entity a player's breaking took with it (vanilla playerDestroy's blockEntity), for playerDestroy */
let breaking: { x: number; y: number; z: number; be: BeehiveBlockEntity } | null = null;

for (const name of ['bee_nest', 'beehive']) {
  const block = getBlock(name);
  registerBehavior(name, {
    /** vanilla getStateForPlacement: its front toward the player */
    placement(ctx) {
      return block.with(block.defaultState, 'facing', DIR_NAMES[OPPOSITE[dirFromYaw(ctx.yaw)]]);
    },
    /**
     * vanilla BlockItem.updateBlockEntityComponents' setChanged (BeehiveBlockEntity.setChanged): placed by fire, the
     * bees it brought come straight out
     */
    setPlacedBy(level, x, y, z, st) {
      const be = hiveAt(level, x, y, z);
      if (be && !be.isEmpty() && be.isFireNearby(level)) be.emptyAllLivingFromHive(level, null, st, 'emergency');
    },
    /**
     * vanilla useItemOn: a full hive gives shears three honeycomb (shears worn a point) and a glass bottle a honey
     * bottle (the bottle used up even in creative); then, unless it's smoked, the bees about go for a player near and
     * those inside come out, else the honey's just gone
     */
    useItemOn(level, x, y, z, st, stack, ctx) {
      const p = ctx.player;
      let took = false;
      const item = stack.item.id;
      if (honeyLevel(st) >= MAX_HONEY_LEVELS) {
        if (item === 'shears') {
          level.sound.play('block.beehive.shear', p.x, p.y, p.z, 1, 1);
          dropHoneycomb(level, x, y, z);
          if (hurtAndBreak(stack, 1, p.gameMode === 'creative')) {
            p.inventory.setSelectedItem(null);
            level.sound.play('entity.item.break', p.x, p.y, p.z, 0.8, 0.8 + Math.random() * 0.4);
          }
          p.inventory.version++;
          took = true;
          level.gameEvent('shear', x + 0.5, y + 0.5, z + 0.5, { entity: p });
        } else if (item === 'glass_bottle') {
          const inv = p.inventory;
          const last = stack.count <= 1;
          // (vanilla stack.shrink(1): even in creative)
          inv.consumeSelected(1);
          level.sound.play('item.bottle.fill', p.x, p.y, p.z, 1, 1);
          const honey = ItemStack.of('honey_bottle');
          if (last) inv.setSelectedItem(honey);
          else {
            const left = inv.add(honey);
            if (left > 0) p.dropItem(honey.copyWithCount(left), false);
          }
          took = true;
          level.gameEvent('fluid_pickup', x + 0.5, y + 0.5, z + 0.5, { entity: p });
        }
      }
      if (!took) return 'pass';
      const smokey = isSmokeyPos(level, x, y, z);
      if (!smokey) {
        if (!hiveAt(level, x, y, z)?.isEmpty()) angerNearbyBees(level, x, y, z);
        releaseBeesAndResetHoneyLevel(level, x, y, z, st, p, 'emergency');
      } else resetHoneyLevel(level, x, y, z, st);
      // (vanilla ServerPlayerGameMode.useItemOn: ITEM_USED_ON_BLOCK for a use that went through, with where it was)
      level.onPlayerTrigger?.(p, 'item_used_on_block', { usedOnBlock: { item, block: name, smokey } });
      return 'success';
    },
    /**
     * vanilla playerWillDestroy: a creative player (block drops on) breaking a hive with bees or honey in it gets it as
     * an item with them, dropped at the block's corner
     */
    playerWillDestroy(level, x, y, z, st, player) {
      const be = hiveAt(level, x, y, z);
      breaking = be ? { x, y, z, be } : null;
      if (!be || player.gameMode !== 'creative' || !level.gameRules.doTileDrops) return;
      if (be.isEmpty() && honeyLevel(st) === 0) return;
      const e = new ItemEntity(level, hiveItem(name, st, be));
      e.moveTo(x, y, z, Math.random() * 360, 0);
      e.dx = level.random.nextDouble() * 0.2 - 0.1;
      e.dy = 0.2;
      e.dz = level.random.nextDouble() * 0.2 - 0.1;
      e.pickupDelay = 10;
      level.addEntity(e);
    },
    /**
     * vanilla playerDestroy: broken without silk touch (#prevents_bee_spawns_when_mining), the bees come out at the
     * player and the bees about go for a player near; either way the advancements hear of it
     */
    playerDestroy(level, x, y, z, st, player, held) {
      const b = breaking && breaking.x === x && breaking.y === y && breaking.z === z ? breaking.be : null;
      breaking = null;
      if (!b) return;
      const silk = levelOf(held, 'silk_touch') > 0;
      if (!silk) {
        b.emptyAllLivingFromHive(level, player, st, 'emergency');
        level.updateNeighbourForOutputSignal(x, y, z, block.id);
        angerNearbyBees(level, x, y, z);
      }
      // (vanilla CriteriaTriggers.BEE_NEST_DESTROYED)
      level.onPlayerTrigger?.(player, 'bee_nest_destroyed', { beeNestDestroyed: { block: name, silkTouch: silk, bees: b.occupantCount() } });
    },
    /**
     * vanilla loot tables blocks/bee_nest and blocks/beehive: with silk touch it comes away with its bees and its
     * honey level; otherwise a nest drops nothing, a hive itself
     */
    drops(st, _tool, _r, silk, _fortune, be) {
      if (silk) return [hiveItem(name, st, be instanceof BeehiveBlockEntity ? be : null)];
      return name === 'beehive' ? [ItemStack.of('beehive')] : [];
    },
    /** vanilla getDrops: broken by a blast of tnt, a creeper, the wither's skull or the wither itself, the bees get out */
    spawnAfterBreak(level, _x, _y, _z, st, _stack, source, be) {
      if (source && BLAST_SOURCES.has(source.type) && be instanceof BeehiveBlockEntity) be.emptyAllLivingFromHive(level, null, st, 'emergency');
    },
    /** vanilla updateShape: fire set next to it drives the bees out */
    shapeUpdate(level, x, y, z, st, dir) {
      if (blk(level.getState(x + DX[dir], y + DY[dir], z + DZ[dir])).name !== 'fire') return;
      hiveAt(level, x, y, z)?.emptyAllLivingFromHive(level, null, st, 'emergency');
    },
    /** vanilla getAnalogOutputSignal: the honey level */
    analogOutput(_level, _x, _y, _z, st) {
      return honeyLevel(st);
    },
    /**
     * vanilla animateTick: a full hive drips honey (seven times in ten) from its underside, when what's under it
     * isn't a full block and holds no water or lava
     */
    animateTick(level, x, y, z, st) {
      if (honeyLevel(st) < MAX_HONEY_LEVELS || Math.random() < 0.3) return;
      const below = level.getState(x, y - 1, z);
      const top = Math.max(0, ...(COLLISION[below] ?? []).map((b) => b[4]));
      if ((top >= 1 && FLAGS[below] & F_FULL_COLLISION) || FLAGS[below] & (F_WATER | F_LAVA)) return;
      level.particles.spawn?.('dripping_honey', x + Math.random(), y - 0.05, z + Math.random(), 0, 0, 0);
    },
  });
  // vanilla BeehiveBlock.appendHoverText: how many bees (of 3) and how much honey (of 5), grey
  registerHoverText(name, (s) => {
    const n = s.tag?.bees?.length ?? 0;
    const h = Number(s.tag?.blockState?.honey_level ?? 0) || 0;
    return [`§7Bees: ${n} / ${MAX_OCCUPANTS}`, `§7Honey: ${h} / ${MAX_HONEY_LEVELS}`];
  });
}

// --- dispensers (vanilla ShearsDispenseItemBehavior.tryShearBeehive and the glass bottle's behaviour) ---------------

/** a full hive in front: its honeycomb out and the bees let out (only those that may: BEE_RELEASED) */
hiveDispense.shear = (level, x, y, z) => {
  const st = level.getState(x, y, z);
  if (!isHive(st) || honeyLevel(st) < MAX_HONEY_LEVELS) return false;
  level.sound.play('block.beehive.shear', x + 0.5, y + 0.5, z + 0.5, 1, 1);
  dropHoneycomb(level, x, y, z);
  releaseBeesAndResetHoneyLevel(level, x, y, z, st, null, 'bee_released');
  level.gameEvent('shear', x + 0.5, y + 0.5, z + 0.5);
  return true;
};
/** a full hive in front fills the bottle with honey, letting the bees out that may */
hiveDispense.bottle = (level, x, y, z) => {
  const st = level.getState(x, y, z);
  if (!isHive(st) || honeyLevel(st) < MAX_HONEY_LEVELS) return false;
  releaseBeesAndResetHoneyLevel(level, x, y, z, st, null, 'bee_released');
  return true;
};

// --- the honey block (vanilla HoneyBlock) --------------------------------------------------------------------------

/** vanilla Entity.playSound: at the entity */
function entitySound(level: Level, e: Entity, name: string, volume: number, pitch: number): void {
  level.sound.play(name, e.x, e.y, e.z, volume, pitch);
}

/** vanilla doesEntityDoHoneyBlockSlideEffects: living things, minecarts, primed tnt and boats */
function slideEffects(e: Entity): boolean {
  return e instanceof LivingEntity || e.type === 'tnt' || e.type.endsWith('minecart') || e.type === 'boat' || e.type === 'chest_boat';
}

/** vanilla HoneyBlock.showParticles (entity events 53 and 54): specks of honey block where it is */
function honeyParticles(level: Level, e: Entity, n: number): void {
  const st = getBlock('honey_block').defaultState;
  for (let i = 0; i < n; i++) level.particles.blockParticle?.(e.x, e.y, e.z, 0, 0, 0, st, Math.floor(e.x), Math.floor(e.y), Math.floor(e.z));
}

/** vanilla HoneyBlock.isSlidingDown: in the air, no higher than its top, falling, and against one of its sides */
function isSlidingDown(x: number, y: number, z: number, e: Entity): boolean {
  if (e.onGround) return false;
  if (e.y > y + 0.9375 - 1e-7) return false;
  if (e.dy >= -0.08) return false;
  const d0 = Math.abs(x + 0.5 - e.x), d1 = Math.abs(z + 0.5 - e.z), d2 = 0.4375 + e.width / 2;
  return d0 + 1e-7 > d2 || d1 + 1e-7 > d2;
}

registerBehavior('honey_block', {
  /**
   * vanilla fallOn: the slide sound and ten specks of honey; the fall hurts a fifth as much (causeFallDamage's
   * multiplier 0.2), and when it hurts at all the block's fall sound again, softer and lower
   */
  fallOn(level, _x, _y, _z, _st, e, dist) {
    entitySound(level, e, 'block.honey_block.slide', 1, 1);
    if (!level.isClientSide) honeyParticles(level, e, 10);
    const safe = e instanceof LivingEntity ? e.safeFallDistance() : 3;
    if (dist > safe) {
      e.fallDistance = safe + (dist - safe) * 0.2;
      if (Math.ceil(e.fallDistance - safe) > 0) entitySound(level, e, 'block.honey_block.fall', 0.5, 0.75);
    }
  },
  /**
   * vanilla entityInside: something falling against its side slides: held to 0.05 a tick down (its sideways motion
   * slowed with it), its fall forgotten; a player's slide is the advancement's (checked once a second); living things,
   * carts, tnt and boats make the slide sound (one tick in five) and specks (one in five)
   */
  entityInside(level, x, y, z, _st, e) {
    if (!isSlidingDown(x, y, z, e)) return;
    // (vanilla CriteriaTriggers.HONEY_BLOCK_SLIDE)
    if (e.type === 'player' && !level.isClientSide && level.gameTime % 20 === 0) level.onPlayerTrigger?.(e as Player, 'slide_down_block', { slideDownBlock: 'honey_block' });
    if (e.dy < -0.13) {
      const d = -0.05 / e.dy;
      e.dx *= d;
      e.dz *= d;
    }
    e.dy = -0.05;
    e.fallDistance = 0;
    if (slideEffects(e)) {
      if (level.random.nextInt(5) === 0) entitySound(level, e, 'block.honey_block.slide', 1, 1);
      if (!level.isClientSide && level.random.nextInt(5) === 0) honeyParticles(level, e, 5);
    }
  },
});
