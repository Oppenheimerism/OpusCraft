// Pistons (vanilla PistonBaseBlock, PistonHeadBlock, MovingPistonBlock, PistonMovingBlockEntity, PistonStructureResolver,
// PistonMath). Power at a piston — from any side but its front, or by quasi-connectivity at the block above it — queues
// a block event; when it comes up the piston pushes the blocks in front (up to 12, breaking the breakable ones in the
// way) one block along and slides its head out, and without power it pulls the head back in, a sticky piston the block
// in front with it. What's on the move is a moving_piston block whose block entity carries it along in two ticks,
// pushing the entities in its way.

import { BLOCKS, STATE_BLOCK, COLLISION, FLAGS, F_AIR, F_WATER, F_LAVA, F_WATERLOGGED, getBlock, S, type Block, type Box } from '../../world/block';
import { DX, DY, DZ, DIR_NAMES, OPPOSITE, AXIS_OF, NORTH, DOWN, UP, type Dir } from '../../world/dir';
import { BlockEntity, createBlockEntity, registerBlockEntityType } from '../../world/blockEntity';
import type { World } from '../../world/world';
import { AABB } from '../../core/aabb';
import { DYNAMIC_COLLISION, type Entity } from '../../entity/entity';
import type { Player } from '../../entity/player';
import { ItemEntity } from '../../entity/itemEntity';
import { stateToString, stateFromString } from '../../storage/worldStore';
import { registerBehavior } from '../blockBehavior';
import { lookingDirections, blockDrops, canSurvive } from '../blockRules';
import { hasShapeUpdates, updateShape } from '../shapeUpdates';
import { DIRECTIONS, hasSignal } from './signal';
import type { Level } from '../level';

const blk = (st: number): Block => BLOCKS[STATE_BLOCK[st]];
const facingOf = (st: number): Dir => DIR_NAMES.indexOf(blk(st).get<string>(st, 'facing') as (typeof DIR_NAMES)[number]) as Dir;

/** vanilla PistonStructureResolver.MAX_PUSH_DEPTH */
export const MAX_PUSH = 12;
/** vanilla PistonBaseBlock.TRIGGER_EXTEND, TRIGGER_CONTRACT, TRIGGER_DROP: the block events */
export const TRIGGER_EXTEND = 0, TRIGGER_CONTRACT = 1, TRIGGER_DROP = 2;

const piston = getBlock('piston'), sticky = getBlock('sticky_piston'), head = getBlock('piston_head'), moving = getBlock('moving_piston');
const isPistonBase = (st: number): boolean => STATE_BLOCK[st] === piston.id || STATE_BLOCK[st] === sticky.id;

// ---------------------------------------------------------------------------
// What moves (vanilla PushReaction and PistonBaseBlock.isPushable)

/** vanilla PushReaction: moved; broken (and dropped) instead; never moved; only pushed, never pulled; (entities) left alone */
export type PushReaction = 'normal' | 'destroy' | 'block' | 'push_only' | 'ignore';

/** the blocks vanilla 1.21 gives pushReaction(DESTROY): plants, fluids, fire, torches, redstone parts and the like */
const DESTROYED = new RegExp(
  '^(water|lava|fire|soul_fire|.*_leaves|.*_sapling|flower_pot|potted_.*|short_grass|fern|dead_bush|dandelion|poppy|blue_orchid|allium|azure_bluet|' +
    '.*_tulip|oxeye_daisy|cornflower|lily_of_the_valley|wither_rose|torchflower|brown_mushroom|red_mushroom|tall_grass|large_fern|lilac|rose_bush|peony|' +
    'sunflower|sugar_cane|cactus|pumpkin|carved_pumpkin|jack_o_lantern|melon|lily_pad|vine|seagrass|tall_seagrass|kelp|kelp_plant|sweet_berry_bush|' +
    'wheat|carrots|potatoes|beetroots|nether_wart|cocoa|(attached_)?(pumpkin|melon)_stem|snow|(soul_|redstone_)?(wall_)?torch|ladder|cobweb|.*_door|.*_bed|' +
    '(soul_)?lantern|glow_lichen|budding_amethyst|(small|medium|large)_amethyst_bud|amethyst_cluster|pointed_dripstone|azalea|flowering_azalea|' +
    'hanging_roots|spore_blossom|cave_vines(_plant)?|big_dripleaf(_stem)?|small_dripleaf|moss_carpet|(crimson|warped)_(fungus|roots)|nether_sprouts|' +
    '(weeping|twisting)_vines(_plant)?|lever|.*_button|.*_pressure_plate|redstone_wire|repeater|comparator|tripwire_hook|tripwire|bell|dragon_egg|' +
    'decorated_pot|suspicious_(sand|gravel)|(.*_)?candle|cake|sculk_vein|' +
    // (the outer End's: shulker boxes, the chorus plant and its flower, and the mob heads)
    '(.*_)?shulker_box|chorus_(plant|flower)|(wither_)?skeleton_(wall_)?skull|(player|zombie|creeper|piglin|dragon)_(wall_)?head)$',
);
/** pushReaction(BLOCK): never moved (anvils, grindstones, the piston's own head and moving blocks) */
const BLOCKED = /^(anvil|chipped_anvil|damaged_anvil|grindstone|piston_head|moving_piston|nether_portal|lodestone)$/;
/** pushReaction(PUSH_ONLY) */
const PUSH_ONLY = /_glazed_terracotta$/;
/** vanilla isPushable's blocks that never move, whatever their push reaction */
const IMMOVABLE = /^(obsidian|crying_obsidian|respawn_anchor|reinforced_deepslate)$/;

let REACTION: PushReaction[] | null = null;
let HAS_BE: boolean[] | null = null;
function reactions(): PushReaction[] {
  if (!REACTION) {
    REACTION = BLOCKS.map((b) => (DESTROYED.test(b.name) ? 'destroy' : BLOCKED.test(b.name) ? 'block' : PUSH_ONLY.test(b.name) ? 'push_only' : 'normal'));
    HAS_BE = BLOCKS.map((b) => createBlockEntity(b.name, 0, 0, 0) !== null);
  }
  return REACTION;
}

/** vanilla BlockState.getPistonPushReaction */
export function pushReaction(st: number): PushReaction {
  return reactions()[STATE_BLOCK[st]];
}

/** vanilla BlockState.hasBlockEntity: blocks with one don't move (unless they break) */
function hasBlockEntity(st: number): boolean {
  reactions();
  return HAS_BE![STATE_BLOCK[st]];
}

/** vanilla Entity.getPistonPushReaction: area effect clouds and flying players are left where they are */
export function entityPushReaction(e: Entity): PushReaction {
  if (e.type === 'area_effect_cloud') return 'ignore';
  if (e.type === 'player' && (e as Player).flying) return 'ignore';
  return 'normal';
}

/**
 * vanilla PistonBaseBlock.isPushable: whether the block at (x, y, z) can go `move`, for a piston facing `facing`
 * (`destroy`: a block that breaks counts)
 */
export function isPushable(level: Level, st: number, x: number, y: number, z: number, move: Dir, destroy: boolean, facing: Dir): boolean {
  const dim = level.world.dim;
  if (y < dim.minY || y > dim.maxY - 1) return false;
  if (FLAGS[st] & F_AIR) return true;
  const b = blk(st);
  if (IMMOVABLE.test(b.name)) return false;
  if (move === DOWN && y === dim.minY) return false;
  if (move === UP && y === dim.maxY - 1) return false;
  if (!isPistonBase(st)) {
    if (b.hardness < 0) return false;
    switch (pushReaction(st)) {
      case 'block': return false;
      case 'destroy': return destroy;
      case 'push_only': return move === facing;
    }
  } else if (b.get(st, 'extended')) return false;
  return !hasBlockEntity(st);
}

/** vanilla PistonStructureResolver.isSticky: slime and honey blocks take their neighbours along */
function isSticky(st: number): boolean {
  const n = blk(st).name;
  return n === 'slime_block' || n === 'honey_block';
}

/** vanilla canStickToEachOther: either sticky, but slime and honey don't stick to each other */
function canStick(a: number, b: number): boolean {
  const na = blk(a).name, nb = blk(b).name;
  if ((na === 'honey_block' && nb === 'slime_block') || (na === 'slime_block' && nb === 'honey_block')) return false;
  return isSticky(a) || isSticky(b);
}

type Pos = [number, number, number];

/** vanilla PistonStructureResolver: the blocks a piston's push (or a sticky piston's pull) moves, and breaks */
export class StructureResolver {
  readonly toPush: Pos[] = [];
  readonly toDestroy: Pos[] = [];
  private readonly pushDir: Dir;
  private readonly start: Pos;
  constructor(private readonly level: Level, private readonly px: number, private readonly py: number, private readonly pz: number, private readonly facing: Dir, private readonly extending: boolean) {
    this.pushDir = extending ? facing : (OPPOSITE[facing] as Dir);
    const n = extending ? 1 : 2;
    this.start = [px + DX[facing] * n, py + DY[facing] * n, pz + DZ[facing] * n];
  }

  resolve(): boolean {
    this.toPush.length = 0;
    this.toDestroy.length = 0;
    const [sx, sy, sz] = this.start;
    const st = this.level.getState(sx, sy, sz);
    if (!isPushable(this.level, st, sx, sy, sz, this.pushDir, false, this.facing)) {
      if (this.extending && pushReaction(st) === 'destroy') {
        this.toDestroy.push(this.start);
        return true;
      }
      return false;
    }
    if (!this.addBlockLine(sx, sy, sz, this.pushDir)) return false;
    for (let i = 0; i < this.toPush.length; i++) {
      const [x, y, z] = this.toPush[i];
      if (isSticky(this.level.getState(x, y, z)) && !this.addBranchingBlocks(x, y, z)) return false;
    }
    return true;
  }

  private indexOf(x: number, y: number, z: number): number {
    return this.toPush.findIndex((p) => p[0] === x && p[1] === y && p[2] === z);
  }

  private isPiston(x: number, y: number, z: number): boolean {
    return x === this.px && y === this.py && z === this.pz;
  }

  /** vanilla addBlockLine: the block at o, the sticky ones behind it, and the line it pushes on ahead */
  private addBlockLine(ox: number, oy: number, oz: number, dir: Dir): boolean {
    let st = this.level.getState(ox, oy, oz);
    if (FLAGS[st] & F_AIR) return true;
    if (!isPushable(this.level, st, ox, oy, oz, this.pushDir, false, dir)) return true;
    if (this.isPiston(ox, oy, oz) || this.indexOf(ox, oy, oz) >= 0) return true;
    let i = 1;
    if (i + this.toPush.length > MAX_PUSH) return false;
    const back = OPPOSITE[this.pushDir] as Dir;
    while (isSticky(st)) {
      const bx = ox + DX[back] * i, by = oy + DY[back] * i, bz = oz + DZ[back] * i;
      const prev = st;
      st = this.level.getState(bx, by, bz);
      if (FLAGS[st] & F_AIR || !canStick(prev, st) || !isPushable(this.level, st, bx, by, bz, this.pushDir, false, back) || this.isPiston(bx, by, bz)) break;
      if (++i + this.toPush.length > MAX_PUSH) return false;
    }
    let l = 0;
    for (let j = i - 1; j >= 0; j--) {
      this.toPush.push([ox + DX[back] * j, oy + DY[back] * j, oz + DZ[back] * j]);
      l++;
    }
    for (let i1 = 1; ; i1++) {
      const nx = ox + DX[this.pushDir] * i1, ny = oy + DY[this.pushDir] * i1, nz = oz + DZ[this.pushDir] * i1;
      const j1 = this.indexOf(nx, ny, nz);
      if (j1 > -1) {
        this.reorderListAtCollision(l, j1);
        for (let k = 0; k <= j1 + l; k++) {
          const [kx, ky, kz] = this.toPush[k];
          if (isSticky(this.level.getState(kx, ky, kz)) && !this.addBranchingBlocks(kx, ky, kz)) return false;
        }
        return true;
      }
      st = this.level.getState(nx, ny, nz);
      if (FLAGS[st] & F_AIR) return true;
      if (!isPushable(this.level, st, nx, ny, nz, this.pushDir, true, this.pushDir) || this.isPiston(nx, ny, nz)) return false;
      if (pushReaction(st) === 'destroy') {
        this.toDestroy.push([nx, ny, nz]);
        return true;
      }
      if (this.toPush.length >= MAX_PUSH) return false;
      this.toPush.push([nx, ny, nz]);
      l++;
    }
  }

  /** vanilla reorderListAtCollision: a line that ran into blocks already listed goes in before them */
  private reorderListAtCollision(offsets: number, index: number): void {
    const n = this.toPush.length;
    const moved = [...this.toPush.slice(0, index), ...this.toPush.slice(n - offsets), ...this.toPush.slice(index, n - offsets)];
    this.toPush.length = 0;
    this.toPush.push(...moved);
  }

  /** vanilla addBranchingBlocks: a sticky block takes along what sticks to its sides */
  private addBranchingBlocks(x: number, y: number, z: number): boolean {
    const st = this.level.getState(x, y, z);
    for (const d of DIRECTIONS) {
      if (AXIS_OF[d] === AXIS_OF[this.pushDir]) continue;
      const nx = x + DX[d], ny = y + DY[d], nz = z + DZ[d];
      if (canStick(this.level.getState(nx, ny, nz), st) && !this.addBlockLine(nx, ny, nz, d)) return false;
    }
    return true;
  }
}

// ---------------------------------------------------------------------------
// The moving block (vanilla PistonMovingBlockEntity)

/** vanilla PistonMovingBlockEntity.NOCLIP: the way the blocks moving an entity go, which don't get in its way meanwhile */
let noclip: Dir | -1 = -1;

/** vanilla PistonMovingBlockEntity: what a moving_piston carries, where it's headed and how far it's got */
export class PistonMovingBlockEntity extends BlockEntity {
  readonly id = 'moving_piston';
  /** vanilla movedState */
  moved = 0;
  direction: Dir = NORTH;
  extending = false;
  /** vanilla isSourcePiston: the piston's own head (extending) or base (retracting) */
  source = false;
  progress = 0;
  progressO = 0;
  lastTicked = 0;

  constructor(x: number, y: number, z: number) {
    super(x, y, z, 0);
  }

  init(moved: number, direction: Dir, extending: boolean, source: boolean): this {
    this.moved = moved;
    this.direction = direction;
    this.extending = extending;
    this.source = source;
    return this;
  }

  /** vanilla getProgress */
  progressAt(partial: number): number {
    return this.progressO + (this.progress - this.progressO) * Math.min(partial, 1);
  }

  /** vanilla getExtendedProgress: how far back from here the block still is (-1..0 extending, 1..0 retracting) */
  extendedProgress(p: number): number {
    return this.extending ? p - 1 : 1 - p;
  }

  /** vanilla getMovementDirection */
  get movementDirection(): Dir {
    return this.extending ? this.direction : (OPPOSITE[this.direction] as Dir);
  }

  /** vanilla getCollisionRelatedBlockState: a retracting piston's head, short once it's a quarter of the way in */
  collisionState(): number {
    if (!this.extending && this.source && isPistonBase(this.moved))
      return head.state({ short: this.progress > 0.25, type: STATE_BLOCK[this.moved] === sticky.id ? 'sticky' : 'normal', facing: blk(this.moved).get(this.moved, 'facing') });
    return this.moved;
  }

  /** vanilla getCollisionShape: the block where it's got to (the head for the piston's own), the base of a retracting piston */
  collisionBoxes(): Box[] | null {
    const out: Box[] = [];
    if (!this.extending && this.source && isPistonBase(this.moved)) out.push(...(COLLISION[blk(this.moved).with(this.moved, 'extended', true)] ?? []));
    if (this.progress < 1 && noclip === this.movementDirection) return out.length ? out : null;
    const st = this.source ? head.state({ facing: DIR_NAMES[this.direction], short: this.extending !== (1 - this.progress < 0.25) }) : this.moved;
    const f = this.extendedProgress(this.progress);
    const ox = DX[this.direction] * f, oy = DY[this.direction] * f, oz = DZ[this.direction] * f;
    for (const b of COLLISION[st] ?? []) out.push([b[0] + ox, b[1] + oy, b[2] + oz, b[3] + ox, b[4] + oy, b[5] + oz]);
    return out.length ? out : null;
  }

  /** vanilla moveByPositionAndProgress: a box of the moving block, where the block is now */
  private placed(b: Box | AABB): AABB {
    const f = this.extendedProgress(this.progress);
    const ox = this.x + f * DX[this.direction], oy = this.y + f * DY[this.direction], oz = this.z + f * DZ[this.direction];
    return b instanceof AABB ? b.move(ox, oy, oz) : new AABB(b[0] + ox, b[1] + oy, b[2] + oz, b[3] + ox, b[4] + oy, b[5] + oz);
  }

  /** vanilla tick: half a block a tick; the tick after it's got there, the block it carries takes its place */
  override tick(level: Level): void {
    this.lastTicked = level.gameTime;
    this.progressO = this.progress;
    if (this.progressO >= 1) {
      this.detach(level);
      if (STATE_BLOCK[level.getState(this.x, this.y, this.z)] !== moving.id) return;
      const now = fromNeighbourShapes(level, this.x, this.y, this.z, this.moved);
      if (now === 0) {
        // (vanilla Block.updateOrDestroy: it can't stay there, so it breaks as it arrives)
        level.setBlock(this.x, this.y, this.z, this.moved, UPDATE_MOVE_KNOWN_INVISIBLE);
        level.destroyBlock(this.x, this.y, this.z, true);
      } else {
        const b = blk(now);
        const st = b.propIndex('waterlogged') >= 0 && b.get(now, 'waterlogged') ? b.with(now, 'waterlogged', false) : now;
        level.setBlock(this.x, this.y, this.z, st, UPDATE_MOVE_ALL);
        level.neighborChanged(this.x, this.y, this.z, STATE_BLOCK[st], this.x, this.y, this.z);
      }
      return;
    }
    const f = this.progress + 0.5;
    this.moveCollidedEntities(level, f);
    this.progress = Math.min(f, 1);
  }

  /** vanilla finalTick: straight to the end (the piston's own head just goes) */
  finalTick(level: Level): void {
    if (this.progressO >= 1) return;
    this.progress = this.progressO = 1;
    this.detach(level);
    if (STATE_BLOCK[level.getState(this.x, this.y, this.z)] !== moving.id) return;
    const now = this.source ? 0 : fromNeighbourShapes(level, this.x, this.y, this.z, this.moved);
    level.setBlock(this.x, this.y, this.z, now, true);
    level.neighborChanged(this.x, this.y, this.z, STATE_BLOCK[now], this.x, this.y, this.z);
  }

  /** vanilla level.removeBlockEntity and setRemoved */
  private detach(level: Level): void {
    this.removed = true;
    const bes = level.world.blockEntities;
    if (bes.get(this.key) === this) bes.delete(this.key);
  }

  /** vanilla moveCollidedEntities: what's in its way is pushed along, kept just ahead of it */
  private moveCollidedEntities(level: Level, f: number): void {
    const dir = this.movementDirection;
    const d0 = f - this.progress;
    const boxes = COLLISION[this.collisionState()];
    if (!boxes) return;
    let bounds = this.placed(boxes[0]);
    for (const b of boxes) {
      const p = this.placed(b);
      bounds = new AABB(Math.min(bounds.minX, p.minX), Math.min(bounds.minY, p.minY), Math.min(bounds.minZ, p.minZ), Math.max(bounds.maxX, p.maxX), Math.max(bounds.maxY, p.maxY), Math.max(bounds.maxZ, p.maxZ));
    }
    const area = movementArea(bounds, dir, d0);
    const list = level.getEntities(new AABB(Math.min(area.minX, bounds.minX), Math.min(area.minY, bounds.minY), Math.min(area.minZ, bounds.minZ), Math.max(area.maxX, bounds.maxX), Math.max(area.maxY, bounds.maxY), Math.max(area.maxZ, bounds.maxZ)));
    for (const e of list) {
      if (entityPushReaction(e) === 'ignore') continue;
      let d4 = 0;
      for (const b of boxes) {
        const a = movementArea(this.placed(b), dir, d0);
        if (!a.intersects(e.bb)) continue;
        d4 = Math.max(d4, movement(a, dir, e.bb));
        if (d4 >= d0) break;
      }
      if (d4 <= 0) continue;
      pistonMove(level, e, dir, Math.min(d4, d0) + 0.01, dir);
      if (!this.extending && this.source) this.fixEntityWithinBase(level, e, dir, d0);
    }
  }

  /** vanilla fixEntityWithinPistonBase: something caught in a retracting piston's base is pushed out along with the head */
  private fixEntityWithinBase(level: Level, e: Entity, dir: Dir, progress: number): void {
    const bb = e.bb;
    const block = new AABB(this.x, this.y, this.z, this.x + 1, this.y + 1, this.z + 1);
    if (!bb.intersects(block)) return;
    const back = OPPOSITE[dir] as Dir;
    const inside = new AABB(Math.max(bb.minX, block.minX), Math.max(bb.minY, block.minY), Math.max(bb.minZ, block.minZ), Math.min(bb.maxX, block.maxX), Math.min(bb.maxY, block.maxY), Math.min(bb.maxZ, block.maxZ));
    let d0 = movement(block, back, bb) + 0.01;
    const d1 = movement(block, back, inside) + 0.01;
    if (Math.abs(d0 - d1) < 0.01) {
      d0 = Math.min(d0, progress) + 0.01;
      pistonMove(level, e, dir, d0, back);
    }
  }

  protected override saveData(): Record<string, number | string> {
    return { blockState: stateToString(this.moved), facing: this.direction, progress: this.progressO, extending: this.extending ? 1 : 0, source: this.source ? 1 : 0 };
  }

  protected override loadData(d: Record<string, number | string>): void {
    this.moved = stateFromString(String(d.blockState ?? 'air'));
    this.direction = Number(d.facing ?? 0) as Dir;
    this.progress = this.progressO = Number(d.progress ?? 0);
    this.extending = d.extending === 1;
    this.source = d.source === 1;
  }
}

registerBlockEntityType('moving_piston', (x, y, z) => new PistonMovingBlockEntity(x, y, z));

/** vanilla Block.UPDATE_* combinations the pistons use */
const UPDATE_MOVE_ALL = 67, UPDATE_MOVE_INVISIBLE = 68, UPDATE_KNOWN_INVISIBLE = 20, UPDATE_MOVE_KNOWN = 82, UPDATE_KNOWN = 18, UPDATE_MOVE_KNOWN_INVISIBLE = 84;

/** vanilla Block.updateFromNeighbourShapes (with the survival rules this game keeps apart from them): 0 if it can't stay */
function fromNeighbourShapes(level: Level, x: number, y: number, z: number, st: number): number {
  let now = st;
  if (hasShapeUpdates(now)) now = updateShape(level.world, x, y, z, now);
  if (now !== 0 && !canSurvive(level.world, x, y, z, now)) now = 0;
  return now;
}

/** vanilla PistonMath.getMovementArea: the slab `delta` deep that a box's face sweeps going `dir` */
function movementArea(b: AABB, dir: Dir, delta: number): AABB {
  const d0 = delta * (DX[dir] + DY[dir] + DZ[dir]);
  const lo = Math.min(d0, 0), hi = Math.max(d0, 0);
  switch (dir) {
    case 4: return new AABB(b.minX + lo, b.minY, b.minZ, b.minX + hi, b.maxY, b.maxZ);
    case 5: return new AABB(b.maxX + lo, b.minY, b.minZ, b.maxX + hi, b.maxY, b.maxZ);
    case 0: return new AABB(b.minX, b.minY + lo, b.minZ, b.maxX, b.minY + hi, b.maxZ);
    case 2: return new AABB(b.minX, b.minY, b.minZ + lo, b.maxX, b.maxY, b.minZ + hi);
    case 3: return new AABB(b.minX, b.minY, b.maxZ + lo, b.maxX, b.maxY, b.maxZ + hi);
    default: return new AABB(b.minX, b.maxY + lo, b.minZ, b.maxX, b.maxY + hi, b.maxZ);
  }
}

/** vanilla PistonMovingBlockEntity.getMovement: how far `e` overlaps the moving box `a`, measured along `dir` */
function movement(a: AABB, dir: Dir, e: AABB): number {
  switch (dir) {
    case 5: return a.maxX - e.minX;
    case 4: return e.maxX - a.minX;
    case 0: return e.maxY - a.minY;
    case 3: return a.maxZ - e.minZ;
    case 2: return e.maxZ - a.minZ;
    default: return a.maxY - e.minY;
  }
}

/** vanilla Entity.pistonDeltas and pistonDeltasGameTime */
const PISTON_DELTAS = new WeakMap<Entity, { time: number; d: [number, number, number] }>();

/**
 * vanilla moveEntityByPiston and Entity.move(MoverType.PISTON): the blocks going `noclipDir` let it through, and all
 * the pistons together move it at most 0.51 along each axis a tick (limitPistonMovement)
 */
export function pistonMove(level: Level, e: Entity, noclipDir: Dir, amount: number, dir: Dir): void {
  let mx = amount * DX[dir], my = amount * DY[dir], mz = amount * DZ[dir];
  noclip = noclipDir;
  try {
    if (!e.noPhysics && mx * mx + my * my + mz * mz > 1e-7) {
      let s = PISTON_DELTAS.get(e);
      if (!s) PISTON_DELTAS.set(e, (s = { time: level.gameTime, d: [0, 0, 0] }));
      if (s.time !== level.gameTime) {
        s.d = [0, 0, 0];
        s.time = level.gameTime;
      }
      const axis = mx !== 0 ? 0 : my !== 0 ? 1 : 2;
      const v = axis === 0 ? mx : axis === 1 ? my : mz;
      const c = Math.max(-0.51, Math.min(0.51, v + s.d[axis]));
      const r = c - s.d[axis];
      s.d[axis] = c;
      if (Math.abs(r) <= 1e-5) return;
      mx = axis === 0 ? r : 0;
      my = axis === 1 ? r : 0;
      mz = axis === 2 ? r : 0;
    }
    e.pistonMoving = true;
    e.move(mx, my, mz);
  } finally {
    e.pistonMoving = false;
    noclip = -1;
  }
}

DYNAMIC_COLLISION[moving.id] = (world: World, x: number, y: number, z: number) => {
  const be = world.getBlockEntity(x, y, z);
  return be instanceof PistonMovingBlockEntity ? be.collisionBoxes() : null;
};

/** the block entity of the moving_piston just put at (x, y, z) (vanilla MovingPistonBlock.newMovingBlockEntity) */
function startMoving(level: Level, x: number, y: number, z: number, moved: number, direction: Dir, extending: boolean, source: boolean): void {
  let be = level.world.getBlockEntity(x, y, z);
  if (!(be instanceof PistonMovingBlockEntity)) {
    be = new PistonMovingBlockEntity(x, y, z);
    level.world.blockEntities.set(be.key, be);
  }
  (be as PistonMovingBlockEntity).init(moved, direction, extending, source);
}

// ---------------------------------------------------------------------------
// The piston (vanilla PistonBaseBlock)

/** vanilla getNeighborSignal: power from any side but the front, or — quasi-connectivity — into the block above it */
export function pistonPowered(w: World, x: number, y: number, z: number, facing: Dir): boolean {
  for (const d of DIRECTIONS) if (d !== facing && hasSignal(w, x + DX[d], y + DY[d], z + DZ[d], d)) return true;
  if (hasSignal(w, x, y, z, DOWN)) return true;
  for (const d of DIRECTIONS) if (d !== DOWN && hasSignal(w, x + DX[d], y + 1 + DY[d], z + DZ[d], d)) return true;
  return false;
}

/** vanilla checkIfExtend: power and not out, and there's room: queue the push; out without power: queue the pull */
function checkIfExtend(level: Level, x: number, y: number, z: number, st: number): void {
  const b = blk(st);
  const facing = facingOf(st);
  const power = pistonPowered(level.world, x, y, z, facing);
  const extended = b.get(st, 'extended') === true;
  if (power && !extended) {
    if (new StructureResolver(level, x, y, z, facing, true).resolve()) level.blockEvent(x, y, z, b.id, TRIGGER_EXTEND, facing);
  } else if (!power && extended) {
    // still pushing something out: a pull this early leaves it behind (TRIGGER_DROP)
    const fx = x + DX[facing] * 2, fy = y + DY[facing] * 2, fz = z + DZ[facing] * 2;
    const ahead = level.getState(fx, fy, fz);
    let id = TRIGGER_CONTRACT;
    if (STATE_BLOCK[ahead] === moving.id && facingOf(ahead) === facing) {
      const be = level.world.getBlockEntity(fx, fy, fz);
      if (be instanceof PistonMovingBlockEntity && be.extending && (be.progressO < 0.5 || level.gameTime === be.lastTicked || level.handlingTick)) id = TRIGGER_DROP;
    }
    level.blockEvent(x, y, z, b.id, id, facing);
  }
}

/** vanilla Level.removeBlock: what's left is the block's fluid (if it held any) */
function removeBlock(level: Level, x: number, y: number, z: number): void {
  const st = level.getState(x, y, z);
  const f = FLAGS[st];
  level.setBlock(x, y, z, f & F_WATERLOGGED ? S('water') : f & (F_WATER | F_LAVA) ? st : 0);
}

/** vanilla Block.dropResources: its loot as it breaks (no tool, so none needed) */
function dropResources(level: Level, x: number, y: number, z: number, st: number): void {
  if (!level.gameRules.doTileDrops) return;
  const be = level.world.getBlockEntity(x, y, z);
  for (const s of blockDrops(st, null, level.random, false, 0, be, false)) ItemEntity.drop(level, x, y, z, s);
}

/** vanilla moveBlocks: break what's in the way, set everything moving, and tell the neighbours */
function moveBlocks(level: Level, x: number, y: number, z: number, facing: Dir, extending: boolean, isSticky: boolean): boolean {
  const hx = x + DX[facing], hy = y + DY[facing], hz = z + DZ[facing];
  if (!extending && STATE_BLOCK[level.getState(hx, hy, hz)] === head.id) level.setBlock(hx, hy, hz, 0, UPDATE_KNOWN_INVISIBLE);
  const r = new StructureResolver(level, x, y, z, facing, extending);
  if (!r.resolve()) return false;
  const key = (px: number, py: number, pz: number) => `${px},${py},${pz}`;
  // what was where (the positions left empty are what's still in here at the end)
  const left = new Map<string, [number, number, number, number]>();
  const pushed = r.toPush.map(([px, py, pz]) => {
    const st = level.getState(px, py, pz);
    left.set(key(px, py, pz), [px, py, pz, st]);
    return st;
  });
  const was: number[] = [];
  const dir = extending ? facing : (OPPOSITE[facing] as Dir);
  for (let j = r.toDestroy.length - 1; j >= 0; j--) {
    const [px, py, pz] = r.toDestroy[j];
    const st = level.getState(px, py, pz);
    dropResources(level, px, py, pz, st);
    level.setBlock(px, py, pz, 0, UPDATE_KNOWN);
    // (break particles, no sound; none for fire, and fluids have no shape to make any of)
    const n = blk(st).name;
    if (n !== 'fire' && n !== 'soul_fire' && !(FLAGS[st] & (F_WATER | F_LAVA) && !(FLAGS[st] & F_WATERLOGGED))) level.particles.blockBreak(px, py, pz, st);
    was.push(st);
  }
  const mv = moving.state({ facing: DIR_NAMES[facing] });
  for (let k = r.toPush.length - 1; k >= 0; k--) {
    const [ox, oy, oz] = r.toPush[k];
    const st = level.getState(ox, oy, oz);
    const px = ox + DX[dir], py = oy + DY[dir], pz = oz + DZ[dir];
    left.delete(key(px, py, pz));
    level.setBlock(px, py, pz, mv, UPDATE_MOVE_INVISIBLE);
    startMoving(level, px, py, pz, pushed[k], facing, extending, false);
    was.push(st);
  }
  if (extending) {
    const type = isSticky ? 'sticky' : 'normal';
    left.delete(key(hx, hy, hz));
    level.setBlock(hx, hy, hz, moving.state({ facing: DIR_NAMES[facing], type }), UPDATE_MOVE_INVISIBLE);
    startMoving(level, hx, hy, hz, head.state({ facing: DIR_NAMES[facing], type }), facing, true, true);
  }
  for (const [px, py, pz] of left.values()) level.setBlock(px, py, pz, 0, UPDATE_MOVE_KNOWN);
  for (const [px, py, pz, st] of left.values()) level.updateNeighbors(px, py, pz, st);
  let i = 0;
  for (let l = r.toDestroy.length - 1; l >= 0; l--) {
    const [px, py, pz] = r.toDestroy[l];
    level.updateNeighborsAt(px, py, pz, STATE_BLOCK[was[i++]]);
  }
  for (let l = r.toPush.length - 1; l >= 0; l--) {
    const [px, py, pz] = r.toPush[l];
    level.updateNeighborsAt(px, py, pz, STATE_BLOCK[was[i++]]);
  }
  if (extending) level.updateNeighborsAt(hx, hy, hz, head.id);
  return true;
}

/** vanilla PistonHeadBlock.isFittingBase: an extended piston of the head's kind, facing the same way */
function isFittingBase(headSt: number, base: number): boolean {
  const want = head.get(headSt, 'type') === 'sticky' ? sticky.id : piston.id;
  return STATE_BLOCK[base] === want && blk(base).get(base, 'extended') === true && facingOf(base) === facingOf(headSt);
}

for (const kind of [piston, sticky]) {
  const isSticky = kind === sticky;
  registerBehavior(kind.name, {
    // vanilla getStateForPlacement: facing the player (the way they look, turned round)
    placement: (ctx) => kind.state({ facing: DIR_NAMES[OPPOSITE[lookingDirections(ctx.yaw, ctx.pitch)[0]]], extended: false }),
    setPlacedBy(level, x, y, z, st) {
      checkIfExtend(level, x, y, z, st);
    },
    neighborChanged(level, x, y, z, st) {
      checkIfExtend(level, x, y, z, st);
    },
    onPlace(level, x, y, z, st, old) {
      if (STATE_BLOCK[old] !== STATE_BLOCK[st] && !level.world.getBlockEntity(x, y, z)) checkIfExtend(level, x, y, z, st);
    },
    // vanilla triggerEvent: the push or pull comes up (unless the power's changed its mind meanwhile)
    triggerEvent(level, x, y, z, st, id, param) {
      const facing = facingOf(st);
      const out = kind.with(st, 'extended', true);
      const power = pistonPowered(level.world, x, y, z, facing);
      if (power && (id === TRIGGER_CONTRACT || id === TRIGGER_DROP)) {
        level.setBlock(x, y, z, out, 2);
        return false;
      }
      if (!power && id === TRIGGER_EXTEND) return false;
      const r = level.random;
      if (id === TRIGGER_EXTEND) {
        if (!moveBlocks(level, x, y, z, facing, true, isSticky)) return false;
        level.setBlock(x, y, z, out, UPDATE_MOVE_ALL);
        level.sound.play('block.piston.extend', x + 0.5, y + 0.5, z + 0.5, 0.5, r.nextFloat() * 0.25 + 0.6);
        return true;
      }
      const hx = x + DX[facing], hy = y + DY[facing], hz = z + DZ[facing];
      const inFront = level.world.getBlockEntity(hx, hy, hz);
      if (inFront instanceof PistonMovingBlockEntity) inFront.finalTick(level);
      const type = isSticky ? 'sticky' : 'normal';
      const mv = moving.state({ facing: DIR_NAMES[facing], type });
      level.setBlock(x, y, z, mv, UPDATE_KNOWN_INVISIBLE);
      startMoving(level, x, y, z, kind.state({ facing: DIR_NAMES[param & 7] }), facing, false, true);
      level.updateNeighborsAt(x, y, z, moving.id);
      level.updateNeighbors(x, y, z);
      if (isSticky) {
        const fx = x + DX[facing] * 2, fy = y + DY[facing] * 2, fz = z + DZ[facing] * 2;
        const ahead = level.getState(fx, fy, fz);
        let dropped = false;
        if (STATE_BLOCK[ahead] === moving.id) {
          const be = level.world.getBlockEntity(fx, fy, fz);
          if (be instanceof PistonMovingBlockEntity && be.direction === facing && be.extending) {
            be.finalTick(level);
            dropped = true;
          }
        }
        if (!dropped) {
          if (id !== TRIGGER_CONTRACT || FLAGS[ahead] & F_AIR || !isPushable(level, ahead, fx, fy, fz, OPPOSITE[facing] as Dir, false, facing) || (pushReaction(ahead) !== 'normal' && !isPistonBase(ahead)))
            removeBlock(level, hx, hy, hz);
          else moveBlocks(level, x, y, z, facing, false, true);
        }
      } else removeBlock(level, hx, hy, hz);
      level.sound.play('block.piston.contract', x + 0.5, y + 0.5, z + 0.5, 0.5, r.nextFloat() * 0.15 + 0.6);
      return true;
    },
  });
}

// ---------------------------------------------------------------------------
// The head (vanilla PistonHeadBlock) and what's moving (MovingPistonBlock)

/** where a head's base is */
function baseOf(st: number, x: number, y: number, z: number): Pos {
  const back = OPPOSITE[facingOf(st)];
  return [x + DX[back], y + DY[back], z + DZ[back]];
}

function headSurvives(world: World, x: number, y: number, z: number, st: number): boolean {
  const [bx, by, bz] = baseOf(st, x, y, z);
  const base = world.getState(bx, by, bz);
  return isFittingBase(st, base) || (STATE_BLOCK[base] === moving.id && facingOf(base) === facingOf(st));
}

registerBehavior('piston_head', {
  // vanilla canSurvive / updateShape: only with its piston (or its piston on the move) behind it
  canSurvive: headSurvives,
  updateShape: (world, x, y, z, st) => (headSurvives(world, x, y, z, st) ? st : 0),
  // vanilla onRemove: a head that goes takes its piston with it (dropping the piston)
  onRemove(level, x, y, z, st, now) {
    if (STATE_BLOCK[now] === head.id) return;
    const [bx, by, bz] = baseOf(st, x, y, z);
    if (isFittingBase(st, level.getState(bx, by, bz))) level.destroyBlock(bx, by, bz, true);
  },
  // vanilla playerWillDestroy: in creative the piston goes too, without dropping
  playerWillDestroy(level, x, y, z, st, player) {
    if (player.gameMode !== 'creative') return;
    const [bx, by, bz] = baseOf(st, x, y, z);
    if (isFittingBase(st, level.getState(bx, by, bz))) level.destroyBlock(bx, by, bz, false);
  },
  // vanilla getCloneItemStack: its piston
  cloneItem: (st) => (head.get(st, 'type') === 'sticky' ? 'sticky_piston' : 'piston'),
  // vanilla neighborChanged: passed on to the piston
  neighborChanged(level, x, y, z, st, source, fx, fy, fz) {
    if (!headSurvives(level.world, x, y, z, st)) return;
    const [bx, by, bz] = baseOf(st, x, y, z);
    level.neighborChanged(bx, by, bz, source, fx, fy, fz);
  },
});

registerBehavior('moving_piston', {
  // vanilla MovingPistonBlock.getDrops: blown up on its way, it drops what it carries
  drops(_st, tool, r, silk, fortune, be) {
    if (!(be instanceof PistonMovingBlockEntity) || !be.moved) return [];
    return blockDrops(be.moved, tool, r, silk, fortune, null, false);
  },
});
