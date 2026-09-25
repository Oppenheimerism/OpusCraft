// Archaeology (vanilla BrushableBlock, BrushableBlockEntity, BrushItem): suspicious sand and suspicious gravel, and
// the brush that uncovers what's buried in them. Held on a block, the brush sweeps to and fro, flicking up its dust
// with a stroke's sound every half second; on a suspicious block each stroke (one at most every 10 ticks) counts,
// and the block shows itself more and more brushed away (`dusted` 1 after the first stroke, 2 after the third, 3
// after the sixth). Left alone for 2 seconds, the count creeps back 2 strokes every 4 ticks. The tenth stroke turns
// it into plain sand or gravel with its completion sound, and pops out on the brushed side what was in it, rolled
// once from its loot table (seeded: where a structure put it, by its position) when it was first brushed; the brush
// wears a point. With nothing under it the block falls, and breaks where it lands; broken, it gives nothing.
// Decorated pots are in decoratedPot.ts.

import { BLOCKS, STATE_BLOCK, FLAGS, F_AIR, F_REPLACEABLE, F_WATER, F_LAVA, S } from '../world/block';
import { BlockEntity, registerBlockEntityType } from '../world/blockEntity';
import { ItemStack, ITEMS, saveStack, loadStack, type SavedStack } from '../item/item';
import { hurtAndBreak } from '../item/enchantHelper';
import { DX, DY, DZ, UP, NORTH, SOUTH, WEST, EAST, type Dir } from '../world/dir';
import { MAP_COLORS, mapColorOf } from '../world/mapColors';
import { LegacyRandom } from '../world/gen/legacyRandom';
import { LOOT_TABLES, setStewEffect } from './loot';
import { registerBehavior } from './blockBehavior';
import { registerItemBehavior } from './itemBehavior';
import { clipBlocks, type SegmentHit } from './raycast';
import { FallingBlockEntity } from '../entity/fallingBlock';
import { ItemEntity } from '../entity/itemEntity';
import type { Level } from './level';
import type { Player } from '../entity/player';
import './decoratedPot';

/** vanilla BrushableBlock.TICK_DELAY */
const TICK_DELAY = 2;
/** vanilla BrushItem.USE_DURATION: a use lasts 10 seconds (then starts again while the button's held) */
export const BRUSH_USE_DURATION = 200;
/** vanilla BrushItem.ANIMATION_DURATION: a stroke every 10 ticks */
export const BRUSH_ANIMATION_DURATION = 10;

/** the brushable blocks: what each turns into when brushed away, and its sounds (vanilla Blocks.SUSPICIOUS_SAND / _GRAVEL) */
const BRUSHABLE: Record<string, { turnsInto: string; brush: string; completed: string }> = {
  suspicious_sand: { turnsInto: 'sand', brush: 'item.brush.brushing.sand', completed: 'item.brush.brushing.sand.complete' },
  suspicious_gravel: { turnsInto: 'gravel', brush: 'item.brush.brushing.gravel', completed: 'item.brush.brushing.gravel.complete' },
};

/** vanilla FallingBlock.isFree: air, fire, a liquid or something replaceable */
function isFree(st: number): boolean {
  return (FLAGS[st] & (F_AIR | F_REPLACEABLE | F_WATER | F_LAVA)) !== 0 || BLOCKS[STATE_BLOCK[st]].name === 'fire';
}

/** a player's side of the loot (vanilla CriteriaTriggers.GENERATE_LOOT: player_generates_container_loot) */
let onGenerateLoot: ((p: Player, table: string) => void) | null = null;
export function setGenerateLootListener(f: ((p: Player, table: string) => void) | null): void {
  onGenerateLoot = f;
}

/**
 * vanilla LootTable.getRandomItems(params, seed): the table's pools rolled with RandomSource.create(seed) (a
 * LegacyRandomSource; the level's own random for a seed of 0). A pool of one entry takes it without a roll.
 */
export function rollSeededLoot(table: string, seed: bigint): ItemStack[] {
  const r = seed !== 0n ? new LegacyRandom(seed) : null;
  const nextInt = (n: number) => (r ? r.nextInt(n) : Math.floor(Math.random() * n));
  // (vanilla UniformGenerator.getInt: Mth.randomBetweenInclusive)
  const between = (lo: number, hi: number) => (lo >= hi ? lo : lo + nextInt(hi - lo + 1));
  const out: ItemStack[] = [];
  for (const pool of LOOT_TABLES[table] ?? []) {
    const rolls = typeof pool.rolls === 'number' ? pool.rolls : between(pool.rolls[0], pool.rolls[1]);
    const total = pool.entries.reduce((a, x) => a + x.weight, 0);
    for (let i = 0; i < rolls; i++) {
      let k = pool.entries.length === 1 ? 0 : nextInt(total);
      const entry = pool.entries.length === 1 ? pool.entries[0] : pool.entries.find((x) => (k -= x.weight) < 0)!;
      const it = ITEMS.get(entry.item);
      if (!it) continue;
      const stack = new ItemStack(it, entry.count ? between(entry.count[0], entry.count[1]) : 1);
      if (entry.stewEffects) setStewEffect(stack, entry.stewEffects, nextInt);
      out.push(stack);
    }
  }
  return out;
}

/**
 * vanilla BrushableBlockEntity: the strokes so far and when they'll be forgotten, the face the first stroke was on
 * (where what's buried shows through, BrushableBlockRenderer, and comes out), and what's buried: a loot table until
 * it's first brushed, then the item it rolled
 */
export class BrushableBlockEntity extends BlockEntity {
  readonly id = 'brushable_block';
  brushCount = 0;
  brushCountResetsAtTick = 0;
  coolDownEndsAtTick = 0;
  item: ItemStack | null = null;
  hitDirection: Dir | null = null;
  lootTable: string | null = null;
  /** vanilla lootTableSeed, a Java long (a structure's: BlockPos.asLong) */
  lootSeed = 0n;
  constructor(x: number, y: number, z: number) {
    super(x, y, z, 0);
  }

  /** vanilla getCompletionState: the block's `dusted` for the strokes so far */
  completionState(): number {
    return this.brushCount === 0 ? 0 : this.brushCount < 3 ? 1 : this.brushCount < 6 ? 2 : 3;
  }

  private setDusted(level: Level, dusted: number): void {
    const st = level.getState(this.x, this.y, this.z);
    const b = BLOCKS[STATE_BLOCK[st]];
    if (b.name in BRUSHABLE) level.setBlock(this.x, this.y, this.z, b.with(st, 'dusted', dusted));
  }

  /** vanilla brush: a stroke on face `dir` at game time `time`; true when it was the one that brushed the block away */
  brush(level: Level, time: number, player: Player, dir: Dir): boolean {
    if (this.hitDirection === null) this.hitDirection = dir;
    this.brushCountResetsAtTick = time + 40;
    if (time < this.coolDownEndsAtTick) return false;
    this.coolDownEndsAtTick = time + 10;
    this.unpackLootTable(player);
    const before = this.completionState();
    if (++this.brushCount >= 10) {
      this.brushingCompleted(level, player);
      return true;
    }
    level.scheduleBlockTick(this.x, this.y, this.z, STATE_BLOCK[level.getState(this.x, this.y, this.z)], TICK_DELAY);
    const now = this.completionState();
    if (before !== now) this.setDusted(level, now);
    this.container.changed();
    return false;
  }

  /** vanilla unpackLootTable: the one item the loot table gives, rolled the first time it's brushed */
  unpackLootTable(player: Player | null): void {
    if (!this.lootTable) return;
    const table = this.lootTable;
    if (player) onGenerateLoot?.(player, table);
    // (vanilla: at most one item is expected; the first of any more)
    this.item = rollSeededLoot(table, this.lootSeed)[0] ?? null;
    this.lootTable = null;
    this.container.changed();
  }

  /** vanilla brushingCompleted: what it held out, the completion sound and dust (level event 3008), plain sand or gravel in its place */
  private brushingCompleted(level: Level, player: Player): void {
    this.dropContent(level, player);
    const st = level.getState(this.x, this.y, this.z);
    const info = BRUSHABLE[BLOCKS[STATE_BLOCK[st]].name];
    if (info) level.sound.play(info.completed, this.x + 0.5, this.y + 0.5, this.z + 0.5, 1, 1);
    level.particles.blockBreak(this.x, this.y, this.z, st);
    level.setBlock(this.x, this.y, this.z, info ? S(info.turnsInto) : 0);
  }

  /**
   * vanilla dropContent: out on the brushed side (up if it never was), in the middle of that block a little above its
   * floor, at rest and free to pick up at once: a part of 10-30 of the stack (all of it: it's one)
   */
  private dropContent(level: Level, player: Player): void {
    this.unpackLootTable(player);
    if (!this.item) return;
    const d = this.hitDirection ?? UP;
    const e = new ItemEntity(level, this.item.split(Math.floor(Math.random() * 21) + 10));
    e.moveTo(this.x + DX[d] + 0.5, this.y + DY[d] + 0.625, this.z + DZ[d] + 0.5, Math.random() * 360, 0);
    e.dx = e.dy = e.dz = 0;
    e.pickupDelay = 0;
    level.addEntity(e);
    this.item = null;
  }

  /** vanilla checkReset: 2 seconds after the last stroke, 2 strokes are forgotten every 4 ticks till none are left */
  checkReset(level: Level): void {
    const time = level.gameTime;
    if (this.brushCount !== 0 && time >= this.brushCountResetsAtTick) {
      const before = this.completionState();
      this.brushCount = Math.max(0, this.brushCount - 2);
      const now = this.completionState();
      if (before !== now) this.setDusted(level, now);
      this.brushCountResetsAtTick = time + 4;
    }
    if (this.brushCount === 0) {
      this.hitDirection = null;
      this.brushCountResetsAtTick = 0;
      this.coolDownEndsAtTick = 0;
    } else level.scheduleBlockTick(this.x, this.y, this.z, STATE_BLOCK[level.getState(this.x, this.y, this.z)], TICK_DELAY);
  }

  /** vanilla saveAdditional: the loot table and its seed, or else the item; and the brushed face (the strokes aren't kept) */
  protected override saveData(): Record<string, number | string> | undefined {
    const d: Record<string, number | string> = {};
    if (this.lootTable) {
      d.lootTable = this.lootTable;
      if (this.lootSeed !== 0n) d.lootSeed = this.lootSeed.toString();
    } else if (this.item) d.item = JSON.stringify(saveStack(this.item));
    if (this.hitDirection !== null) d.hit_direction = this.hitDirection;
    return Object.keys(d).length ? d : undefined;
  }

  protected override loadData(d: Record<string, number | string>): void {
    this.lootTable = typeof d.lootTable === 'string' ? d.lootTable : null;
    this.lootSeed = 0n;
    if (this.lootTable && d.lootSeed !== undefined) {
      try {
        this.lootSeed = BigInt.asIntN(64, BigInt(String(d.lootSeed)));
      } catch {
        this.lootSeed = 0n;
      }
    }
    this.item = null;
    if (!this.lootTable && typeof d.item === 'string') {
      try {
        this.item = loadStack(JSON.parse(d.item) as SavedStack);
      } catch {
        this.item = null;
      }
    }
    const h = Number(d.hit_direction);
    this.hitDirection = d.hit_direction !== undefined && h >= 0 && h <= 5 ? (h as Dir) : null;
  }
}

registerBlockEntityType('brushable_block', (x, y, z) => new BrushableBlockEntity(x, y, z));

for (const name of Object.keys(BRUSHABLE)) {
  registerBlockEntityType(name, (x, y, z) => new BrushableBlockEntity(x, y, z));
  registerBehavior(name, {
    /** vanilla BrushableBlock.onPlace: a tick soon, to see whether it falls */
    onPlace(level, x, y, z, st) {
      level.scheduleBlockTick(x, y, z, STATE_BLOCK[st], TICK_DELAY);
    },
    /** vanilla BrushableBlock.updateShape: likewise when a neighbour changes */
    neighborChanged(level, x, y, z, st) {
      level.scheduleBlockTick(x, y, z, STATE_BLOCK[st], TICK_DELAY);
    },
    /**
     * vanilla BrushableBlock.tick: the strokes forgotten a little (checkReset), then with nothing under it the block
     * falls, not to be placed again: it breaks where it lands (FallingBlockEntity.disableDrop)
     */
    tick(level, x, y, z, st) {
      const be = level.world.getBlockEntity(x, y, z);
      if (be instanceof BrushableBlockEntity) be.checkReset(level);
      if (!isFree(level.getState(x, y - 1, z)) || y < level.world.dim.minY) return;
      const e = FallingBlockEntity.fall(level, x, y, z, st);
      e.disableDrop();
      e.onBrokenAfterFall = brokenAfterFall;
      level.updateNeighbors(x, y, z, st);
    },
    /** vanilla BrushableBlock.animateTick: now and then a speck of dust in its map colour under it when it could fall */
    animateTick(level, x, y, z, st) {
      if (Math.floor(Math.random() * 16) !== 0) return;
      if (isFree(level.getState(x, y - 1, z))) level.particles.fallingDust?.(x + Math.random(), y - 0.05, z + Math.random(), MAP_COLORS[mapColorOf(st)]);
    },
  });
}

/** vanilla BrushableBlock.onBrokenAfterFall: where it landed, its break (level event 2001: the break sound and its dust) */
function brokenAfterFall(level: Level, e: FallingBlockEntity): void {
  const bx = Math.floor(e.x), by = Math.floor(e.y + e.height / 2), bz = Math.floor(e.z);
  level.particles.blockBreak(bx, by, bz, e.state);
  level.sound.play(`block.${BLOCKS[STATE_BLOCK[e.state]].sound}.break`, bx + 0.5, by + 0.5, bz + 0.5, 1, 0.8);
}

// ---------------------------------------------------------------------------
// The brush (vanilla BrushItem)

/** vanilla getViewVector */
function viewVector(p: Player): [number, number, number] {
  const pr = (p.pitch * Math.PI) / 180, yr = (p.yaw * Math.PI) / 180;
  return [-Math.sin(yr) * Math.cos(pr), -Math.sin(pr), Math.cos(yr) * Math.cos(pr)];
}

/**
 * vanilla BrushItem.calculateHitResult (ProjectileUtil.getHitResultOnViewVector): along the view as far as the
 * player reaches (blockInteractionRange), blocks by their collision shapes and no fluids; null when nothing is hit or
 * something pickable is in the way first
 */
export function brushTarget(level: Level, p: Player): SegmentHit | null {
  const range = p.gameMode === 'creative' ? 5 : 4.5;
  const [vx, vy, vz] = viewVector(p);
  const ex = p.x, ey = p.y + p.eyeHeight, ez = p.z;
  const hit = clipBlocks(level.world, ex, ey, ez, ex + vx * range, ey + vy * range, ez + vz * range);
  if (!hit) return null;
  const box = p.bb.expandTowards(vx * range, vy * range, vz * range).inflate(1);
  const inWay = level.getEntities(box, (e) => e.isPickable() && !(e.type === 'player' && (e as Player).gameMode === 'spectator'), p);
  for (const e of inWay) if (e.bb.clip(ex, ey, ez, hit.px, hit.py, hit.pz)) return null;
  return hit;
}

/**
 * vanilla BrushItem.DustParticlesDelta: which way a stroke flicks the dust on each face (along the face, a little
 * out from it; on a top or bottom, across the view)
 */
function dustDelta(face: number, vx: number, vz: number): [number, number] {
  switch (face) {
    case NORTH: return [1, -0.1];
    case SOUTH: return [-1, 0.1];
    case WEST: return [-0.1, -1];
    case EAST: return [0.1, 1];
    default: return [vz, -vx];
  }
}

/** blocks that are never drawn and give no particles (vanilla RenderShape.INVISIBLE, noTerrainParticles) */
const NO_DUST = new Set(['barrier', 'light', 'moving_piston', 'structure_void']);

/**
 * vanilla BrushItem.spawnDustParticles: 7-11 of the block's particles from where the brush is, flicked along the face
 * away from the brushing arm (arm: 1 right, -1 left)
 */
function spawnDustParticles(level: Level, hit: SegmentHit, st: number, view: [number, number, number], arm: number): void {
  const n = 7 + Math.floor(Math.random() * 5);
  const [xd, zd] = dustDelta(hit.face, view[0], view[2]);
  const x = hit.px - (hit.face === WEST ? 1e-6 : 0), z = hit.pz - (hit.face === NORTH ? 1e-6 : 0);
  for (let k = 0; k < n; k++) level.particles.blockParticle?.(x, hit.py, z, xd * arm * 3 * Math.random(), 0, zd * arm * 3 * Math.random(), st, hit.x, hit.y, hit.z);
}

registerItemBehavior('brush', {
  /**
   * vanilla BrushItem.useOn: looking at a block, brushing starts; the click is spent either way, without a swing
   * (InteractionResult.CONSUME, here 'fail'). Not in adventure mode (vanilla ItemStack.useOn: mayBuild)
   */
  useOn(level, p, stack) {
    if (p.gameMode === 'adventure') return 'pass';
    if (brushTarget(level, p)) p.startUsingItem(stack, BRUSH_USE_DURATION);
    return 'fail';
  },
  /**
   * vanilla BrushItem.onUseTick: brushing goes on while the player looks at a block. Every 10 ticks (5 ticks into
   * each) a stroke: the block's dust (not from an invisible block), the stroke's sound (the suspicious block's own, else
   * the generic one), and on a suspicious block the stroke counts; the stroke that brushes it away wears the brush
   */
  useTick(level, p, stack, remaining) {
    const hit = remaining >= 0 ? brushTarget(level, p) : null;
    if (!hit) {
      p.stopUsingItem();
      return;
    }
    const i = BRUSH_USE_DURATION - remaining + 1;
    if (i % BRUSH_ANIMATION_DURATION !== 5) return;
    const st = level.getState(hit.x, hit.y, hit.z);
    const b = BLOCKS[STATE_BLOCK[st]];
    // (the brushing arm: the main hand's is the right, the offhand's the left)
    if (!NO_DUST.has(b.name)) spawnDustParticles(level, hit, st, viewVector(p), p.useHand === 'main' ? 1 : -1);
    level.sound.play(BRUSHABLE[b.name]?.brush ?? 'item.brush.brushing.generic', hit.x + 0.5, hit.y + 0.5, hit.z + 0.5, 1, 1);
    const be = level.world.getBlockEntity(hit.x, hit.y, hit.z);
    if (!(be instanceof BrushableBlockEntity) || !be.brush(level, level.gameTime, p, hit.face as Dir)) return;
    if (hurtAndBreak(stack, 1, p.gameMode === 'creative')) {
      // (vanilla LivingEntity.breakItem)
      p.inventory.setSelectedItem(null);
      level.sound.play('entity.item.break', p.x, p.y, p.z, 0.8, 0.8 + Math.random() * 0.4);
    }
    p.inventory.version++;
  },
});

