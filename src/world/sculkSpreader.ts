// The sculk spreader (vanilla SculkSpreader and its ChargeCursor, with the SculkBehaviour of sculk, of sculk veins and
// of every other block): charges creep through sculk and its veins, turning the ground a vein lies on to sculk,
// covering what they pass with veins, and now and then raising a sculk sensor or a shrieker out of the sculk. The
// sculk vein's own spreading (vanilla MultifaceSpreader with SculkVeinBlock's config) is here too. World generation's
// sculk patches (world/gen/deepDark.ts) use it, and so does a sculk catalyst when something dies near it.

import { BLOCK_BY_NAME, BLOCKS, STATE_BLOCK, FLAGS, FACE_OCC, COLLISION, F_AIR, F_REPLACEABLE, F_WATER, F_LAVA, F_LEAVES, faceMaskFromBoxes, type Block } from './block';
import { DX, DY, DZ, OPPOSITE, AXIS_OF, DIR_NAMES, UP } from './dir';

/** what the spreader draws from (vanilla RandomSource) */
export interface SculkRandom {
  nextInt(n: number): number;
  nextFloat(): number;
}

/** what the spreader works on: the running level, or a chunk being generated */
export interface SculkLevel {
  /** the state at a position (something solid where it isn't known) */
  getState(x: number, y: number, z: number): number;
  setState(x: number, y: number, z: number, st: number): void;
  /** vanilla LevelAccessor.playSound (the running game only) */
  playSound?(name: string, x: number, y: number, z: number): void;
  /** vanilla levelEvent 3006: the charge's particles (`data` as vanilla packs it: the count << 6 and the faces) */
  chargeEvent?(x: number, y: number, z: number, data: number): void;
  /** vanilla Block.pushEntitiesUp: something standing where a block turned solid is lifted out */
  pushEntitiesUp?(x: number, y: number, z: number): void;
  /** vanilla ChargeCursor.shouldUpdate: whether blocks tick at (x, y, z) (in the running level; world generation: always) */
  ticksAt?(x: number, y: number, z: number): boolean;
}

// ---------------------------------------------------------------------------------------------------------------
// The blocks the spreader knows

interface Kinds {
  sculk: Block;
  vein: Block;
  catalyst: Block;
  sensor: Block;
  shrieker: Block;
  water: Block;
  /** still water */
  waterSource: number;
  /** block ids: vanilla #sculk_replaceable and #sculk_replaceable_world_gen */
  replaceable: Set<number>;
  replaceableWorldGen: Set<number>;
  /** per block id: 1 for sculk, the catalyst and a moving piston, which stop a vein spreading next to them; 2 for fire */
  stopOrFire: Uint8Array;
  /** per state: the face bits its support or collision shape covers (vanilla canAttachTo, isFaceSturdy) */
  faces: Uint8Array;
  /** per state: the faces its down, up, north, south, west and east properties have set (vanilla MultifaceBlock.hasFace) */
  faceProps: Uint8Array;
}

let K: Kinds | null = null;

function ids(names: string[]): Set<number> {
  const out = new Set<number>();
  for (const n of names) {
    const b = BLOCK_BY_NAME.get(n);
    if (b) out.add(b.id);
  }
  return out;
}

const TERRACOTTA = ['', 'white_', 'orange_', 'magenta_', 'light_blue_', 'yellow_', 'lime_', 'pink_', 'gray_', 'light_gray_', 'cyan_', 'purple_', 'blue_', 'brown_', 'green_', 'red_', 'black_'].map((c) => c + 'terracotta');

/** vanilla #sculk_replaceable: the overworld's and the nether's base stones, dirt, terracotta, nylium, sand and the like */
export const SCULK_REPLACEABLE = [
  'stone', 'granite', 'diorite', 'andesite', 'tuff', 'deepslate', 'dirt', 'grass_block', 'podzol', 'coarse_dirt', 'mycelium', 'rooted_dirt', 'moss_block',
  'mud', 'muddy_mangrove_roots', ...TERRACOTTA, 'crimson_nylium', 'warped_nylium', 'netherrack', 'basalt', 'blackstone', 'sand', 'red_sand', 'gravel',
  'soul_sand', 'soul_soil', 'calcite', 'smooth_basalt', 'clay', 'dripstone_block', 'end_stone', 'red_sandstone', 'sandstone',
];

/** vanilla #sculk_replaceable_world_gen: those, and the deepslate an ancient city is built of */
export const SCULK_REPLACEABLE_WORLD_GEN = [
  ...SCULK_REPLACEABLE, 'deepslate_bricks', 'deepslate_tiles', 'cobbled_deepslate', 'cracked_deepslate_bricks', 'cracked_deepslate_tiles', 'polished_deepslate',
];

function kinds(): Kinds {
  if (K) return K;
  const faces = new Uint8Array(FLAGS.length);
  for (let st = 0; st < FLAGS.length; st++) {
    const col = COLLISION[st];
    faces[st] = FACE_OCC[st] | (col ? faceMaskFromBoxes(col) : 0);
  }
  const faceProps = new Uint8Array(FLAGS.length);
  for (const b of BLOCKS) {
    const props = DIR_NAMES.map((n) => b.propIndex(n));
    if (props.every((i) => i < 0)) continue;
    for (let st = b.baseState; st < b.baseState + b.stateCount; st++)
      for (let d = 0; d < 6; d++) if (props[d] >= 0 && b.get(st, DIR_NAMES[d]) === true) faceProps[st] |= 1 << d;
  }
  const stopOrFire = new Uint8Array(BLOCKS.length);
  for (const i of ids(['sculk', 'sculk_catalyst', 'moving_piston'])) stopOrFire[i] = 1;
  for (const i of ids(['fire', 'soul_fire'])) stopOrFire[i] = 2;
  const water = BLOCK_BY_NAME.get('water')!;
  K = {
    sculk: BLOCK_BY_NAME.get('sculk')!,
    vein: BLOCK_BY_NAME.get('sculk_vein')!,
    catalyst: BLOCK_BY_NAME.get('sculk_catalyst')!,
    sensor: BLOCK_BY_NAME.get('sculk_sensor')!,
    shrieker: BLOCK_BY_NAME.get('sculk_shrieker')!,
    water,
    waterSource: water.with(water.defaultState, 'level', 0),
    replaceable: ids(SCULK_REPLACEABLE),
    replaceableWorldGen: ids(SCULK_REPLACEABLE_WORLD_GEN),
    stopOrFire,
    faces,
    faceProps,
  };
  return K;
}

const blk = (st: number): Block => BLOCKS[STATE_BLOCK[st]];

/** vanilla MultifaceBlock.canAttachTo / isFaceSturdy: `st`'s face `d` is full */
function faceFull(st: number, d: number): boolean {
  return ((kinds().faces[st] >> d) & 1) === 1;
}

/** vanilla isFaceSturdy(FULL): as faceFull, but leaves hold nothing up */
function sturdy(st: number, d: number): boolean {
  return !(FLAGS[st] & F_LEAVES) && faceFull(st, d);
}

/** vanilla BlockState.isCollisionShapeFullBlock */
export function collisionFullBlock(st: number): boolean {
  const c = COLLISION[st];
  return !!c && c.length === 1 && c[0][0] <= 0 && c[0][1] <= 0 && c[0][2] <= 0 && c[0][3] >= 1 && c[0][4] >= 1 && c[0][5] >= 1;
}

const isAir = (st: number) => (FLAGS[st] & F_AIR) !== 0;

/** vanilla FluidState.isSourceOfType(WATER): still water, a block waterlogged with it, or seagrass, kelp or a bubble column */
function waterSource(st: number): boolean {
  const k = kinds();
  return (FLAGS[st] & F_WATER) !== 0 && (STATE_BLOCK[st] !== k.water.id || st === k.waterSource);
}

/** some fluid other than water is there (vanilla: its fluid state isn't empty and isn't water) */
function otherFluid(st: number): boolean {
  return (FLAGS[st] & F_LAVA) !== 0;
}

/** vanilla MultifaceBlock.hasFace: the block has that face's property, and it's set */
export function hasFace(st: number, d: number): boolean {
  return ((kinds().faceProps[st] >> d) & 1) === 1;
}

/** vanilla MultifaceBlock.availableFaces: the faces a vein has, as bits (none for any other block) */
function availableFaces(st: number): number {
  const k = kinds();
  return STATE_BLOCK[st] === k.vein.id ? k.faceProps[st] : 0;
}

/** vanilla Direction.allShuffled / Util.shuffledCopy */
function shuffled<T>(list: readonly T[], r: SculkRandom): T[] {
  const l = list.slice();
  for (let j = l.length; j > 1; j--) {
    const k = r.nextInt(j);
    const t = l[j - 1];
    l[j - 1] = l[k];
    l[k] = t;
  }
  return l;
}

const DIRS = [0, 1, 2, 3, 4, 5];

// ---------------------------------------------------------------------------------------------------------------
// The vein's spreading (vanilla MultifaceSpreader, SculkVeinBlock.SculkVeinSpreaderConfig)

/** vanilla MultifaceSpreader.SpreadType, in DEFAULT_SPREAD_ORDER */
const SAME_POSITION = 0, SAME_PLANE = 1, WRAP_AROUND = 2;
const DEFAULT_SPREAD = [SAME_POSITION, SAME_PLANE, WRAP_AROUND];
const SAME_SPACE = [SAME_POSITION];

/** vanilla MultifaceBlock.isValidStateForPlacement: a face not there yet, against something it can hold on to */
function validForPlacement(level: SculkLevel, st: number, x: number, y: number, z: number, d: number): boolean {
  if (STATE_BLOCK[st] === kinds().vein.id && hasFace(st, d)) return false;
  return faceFull(level.getState(x + DX[d], y + DY[d], z + DZ[d]), OPPOSITE[d]);
}

/** vanilla MultifaceBlock.getStateForPlacement: the vein with that face added (-1 when it can't be) */
function stateForPlacement(level: SculkLevel, cur: number, x: number, y: number, z: number, d: number): number {
  if (!validForPlacement(level, cur, x, y, z, d)) return -1;
  const V = kinds().vein;
  const base = STATE_BLOCK[cur] === V.id ? cur : waterSource(cur) ? V.with(V.defaultState, 'waterlogged', true) : V.defaultState;
  return V.with(base, DIR_NAMES[d], true);
}

/** vanilla SculkVeinSpreaderConfig.stateCanBeReplaced (what's there is looked at before what's round it: it's the same) */
function veinCanReplace(level: SculkLevel, x: number, y: number, z: number, sx: number, sy: number, sz: number, d: number, st: number): boolean {
  const k = kinds();
  if (otherFluid(st) || k.stopOrFire[STATE_BLOCK[st]] === 2) return false;
  // (state.canBeReplaced(), or the default config's air, a vein or still water)
  if (!((FLAGS[st] & F_REPLACEABLE) !== 0 || isAir(st) || STATE_BLOCK[st] === k.vein.id || st === k.waterSource)) return false;
  if (k.stopOrFire[STATE_BLOCK[level.getState(sx + DX[d], sy + DY[d], sz + DZ[d])]] === 1) return false;
  if (Math.abs(x - sx) + Math.abs(y - sy) + Math.abs(z - sz) === 2) {
    const o = OPPOSITE[d];
    if (sturdy(level.getState(x + DX[o], y + DY[o], z + DZ[o]), d)) return false;
  }
  return true;
}

/**
 * vanilla MultifaceSpreader.spreadFromFaceTowardDirection: from `st`'s face `spreadDir` toward `face`, into the
 * first of the spread kinds that takes it; true if a face was placed
 */
function spreadFromFaceToward(level: SculkLevel, st: number, x: number, y: number, z: number, spreadDir: number, face: number, types: number[]): boolean {
  if (AXIS_OF[face] === AXIS_OF[spreadDir]) return false;
  // (isOtherBlockValidAsSource: anything but a vein spreads from every face)
  if (!(STATE_BLOCK[st] !== kinds().vein.id || (hasFace(st, spreadDir) && !hasFace(st, face)))) return false;
  for (const t of types) {
    let sx = x, sy = y, sz = z, sf = face;
    if (t === SAME_PLANE) {
      sx += DX[face];
      sy += DY[face];
      sz += DZ[face];
      sf = spreadDir;
    } else if (t === WRAP_AROUND) {
      sx += DX[face] + DX[spreadDir];
      sy += DY[face] + DY[spreadDir];
      sz += DZ[face] + DZ[spreadDir];
      sf = OPPOSITE[face];
    }
    const cur = level.getState(sx, sy, sz);
    if (!veinCanReplace(level, x, y, z, sx, sy, sz, sf, cur) || !validForPlacement(level, cur, sx, sy, sz, sf)) continue;
    // vanilla spreadToFace / SpreadConfig.placeBlock
    const next = stateForPlacement(level, cur, sx, sy, sz, sf);
    if (next < 0) return false;
    level.setState(sx, sy, sz, next);
    return true;
  }
  return false;
}

/** vanilla MultifaceSpreader.spreadAll: from every face it can spread from, toward every direction; how many took */
export function spreadVeinAll(level: SculkLevel, st: number, x: number, y: number, z: number, sameSpace = false): number {
  const types = sameSpace ? SAME_SPACE : DEFAULT_SPREAD;
  const other = STATE_BLOCK[st] !== kinds().vein.id;
  let n = 0;
  for (const d of DIRS) {
    if (!other && !hasFace(st, d)) continue;
    for (const face of DIRS) if (spreadFromFaceToward(level, st, x, y, z, d, face, types)) n++;
  }
  return n;
}

/** vanilla MultifaceSpreader.spreadFromFaceTowardRandomDirection (the sculk vein feature's growth) */
export function spreadVeinRandomly(level: SculkLevel, st: number, x: number, y: number, z: number, spreadDir: number, r: SculkRandom): boolean {
  for (const face of shuffled(DIRS, r)) if (spreadFromFaceToward(level, st, x, y, z, spreadDir, face, DEFAULT_SPREAD)) return true;
  return false;
}

/** vanilla MultifaceBlock.getStateForPlacement, for the sculk vein feature */
export function veinStateForPlacement(level: SculkLevel, cur: number, x: number, y: number, z: number, d: number): number {
  return stateForPlacement(level, cur, x, y, z, d);
}

/** vanilla SculkVeinBlock.regrow: a vein back on the faces it had, where they can still hold */
function regrow(level: SculkLevel, x: number, y: number, z: number, st: number, faces: number): boolean {
  const V = kinds().vein;
  let out = V.defaultState, any = false;
  for (const d of DIRS) {
    if (!((faces >> d) & 1)) continue;
    if (faceFull(level.getState(x + DX[d], y + DY[d], z + DZ[d]), OPPOSITE[d])) {
      out = V.with(out, DIR_NAMES[d], true);
      any = true;
    }
  }
  if (!any) return false;
  if (FLAGS[st] & F_WATER) out = V.with(out, 'waterlogged', true);
  level.setState(x, y, z, out);
  return true;
}

/** vanilla SculkVeinBlock.hasSubstrateAccess: a vein lying on something sculk can take over */
function hasSubstrateAccess(level: SculkLevel, st: number, x: number, y: number, z: number): boolean {
  const k = kinds();
  if (STATE_BLOCK[st] !== k.vein.id) return false;
  for (let d = 0; d < 6; d++) if (hasFace(st, d) && k.replaceable.has(STATE_BLOCK[level.getState(x + DX[d], y + DY[d], z + DZ[d])])) return true;
  return false;
}

/** vanilla SculkVeinBlock.onDischarged: its faces on sculk go, and it goes with them when none are left */
function veinDischarged(level: SculkLevel, st: number, x: number, y: number, z: number): void {
  const k = kinds(), V = k.vein;
  if (STATE_BLOCK[st] !== V.id) return;
  for (let d = 0; d < 6; d++)
    if (hasFace(st, d) && STATE_BLOCK[level.getState(x + DX[d], y + DY[d], z + DZ[d])] === k.sculk.id) st = V.with(st, DIR_NAMES[d], false);
  if (!k.faceProps[st]) st = FLAGS[st] & F_WATER ? k.water.defaultState : 0;
  level.setState(x, y, z, st);
}

// ---------------------------------------------------------------------------------------------------------------
// The spreader

/** vanilla SculkSpreader.ChargeCursor */
export class ChargeCursor {
  updateDelay = 0;
  decayDelay = 1;
  /** the faces of the vein it last stood on (vanilla facings; null before it has stood on any sculk) */
  facings: number | null = null;
  constructor(public x: number, public y: number, public z: number, public charge: number) {}
}

/** vanilla SculkSpreader.ChargeCursor.NON_CORNER_NEIGHBOURS: the 18 blocks round one that share a face or an edge */
const NON_CORNER: [number, number, number][] = [];
for (let z = -1; z <= 1; z++)
  for (let y = -1; y <= 1; y++) for (let x = -1; x <= 1; x++) if ((x === 0 || y === 0 || z === 0) && (x || y || z)) NON_CORNER.push([x, y, z]);

export class SculkSpreader {
  cursors: ChargeCursor[] = [];

  constructor(
    readonly isWorldGeneration: boolean,
    /** block ids sculk may take over */
    readonly replaceableBlocks: Set<number>,
    readonly growthSpawnCost: number,
    readonly noGrowthRadius: number,
    readonly chargeDecayRate: number,
    readonly additionalDecayRate: number,
  ) {}

  /** vanilla createLevelSpreader: a catalyst's */
  static level(): SculkSpreader {
    return new SculkSpreader(false, kinds().replaceable, 10, 4, 10, 5);
  }

  /** vanilla createWorldGenSpreader: the sculk patches' */
  static worldGen(): SculkSpreader {
    return new SculkSpreader(true, kinds().replaceableWorldGen, 50, 1, 5, 10);
  }

  /** vanilla addCursors: the charge in cursors of at most 1000 (up to 32 of them) */
  addCursors(x: number, y: number, z: number, charge: number): void {
    while (charge > 0) {
      const c = Math.min(charge, 1000);
      if (this.cursors.length < 32) this.cursors.push(new ChargeCursor(x, y, z, c));
      charge -= c;
    }
  }

  clear(): void {
    this.cursors = [];
  }

  /** vanilla SculkSpreader.save: the cursors (ChargeCursor.CODEC: pos, charge, decay_delay, update_delay, facings) */
  save(): string {
    return JSON.stringify(
      this.cursors.map((c) => ({
        pos: [c.x, c.y, c.z], charge: c.charge, decay_delay: c.decayDelay, update_delay: c.updateDelay,
        ...(c.facings !== null ? { facings: DIR_NAMES.filter((_, d) => (c.facings! >> d) & 1) } : {}),
      })),
    );
  }

  /** vanilla SculkSpreader.load: at most 32 cursors */
  load(text: string | number | undefined): void {
    if (typeof text !== 'string') return;
    try {
      const list = JSON.parse(text) as { pos: [number, number, number]; charge: number; decay_delay?: number; update_delay?: number; facings?: string[] }[];
      this.cursors = [];
      for (const d of list.slice(0, 32)) {
        const c = new ChargeCursor(d.pos[0], d.pos[1], d.pos[2], Math.max(0, Math.min(1000, d.charge)));
        c.decayDelay = d.decay_delay ?? 1;
        c.updateDelay = Math.max(0, d.update_delay ?? 0);
        c.facings = d.facings ? d.facings.reduce((m, n) => m | (1 << DIR_NAMES.indexOf(n as (typeof DIR_NAMES)[number])), 0) : null;
        this.cursors.push(c);
      }
    } catch {
      // (cursors that can't be read are let go)
    }
  }

  /** vanilla updateCursors: each cursor takes its step; those that end on the same block are merged (not in world generation) */
  updateCursors(level: SculkLevel, rx: number, ry: number, rz: number, r: SculkRandom, convert: boolean): void {
    if (!this.cursors.length) return;
    const list: ChargeCursor[] = [];
    const at = new Map<string, ChargeCursor>();
    const totals = new Map<string, number>();
    for (const c of this.cursors) {
      // vanilla ChargeCursor.isPosUnreasonable: one that has wandered over 1024 blocks off is dropped
      if (Math.max(Math.abs(c.x - rx), Math.abs(c.y - ry), Math.abs(c.z - rz)) > 1024) continue;
      this.update(c, level, rx, ry, rz, r, convert);
      if (c.charge <= 0) {
        level.chargeEvent?.(c.x, c.y, c.z, 0);
        continue;
      }
      const key = `${c.x},${c.y},${c.z}`;
      totals.set(key, (totals.get(key) ?? 0) + c.charge);
      const other = at.get(key);
      if (!other) {
        at.set(key, c);
        list.push(c);
      } else if (!this.isWorldGeneration && c.charge + other.charge <= 1000) {
        // vanilla ChargeCursor.mergeWith
        other.charge += c.charge;
        c.charge = 0;
        other.updateDelay = Math.min(other.updateDelay, c.updateDelay);
      } else {
        list.push(c);
        if (c.charge < other.charge) at.set(key, c);
      }
    }
    if (level.chargeEvent)
      for (const [key, k] of totals) {
        const c = at.get(key);
        if (k > 0 && c && c.facings !== null) level.chargeEvent(c.x, c.y, c.z, ((Math.trunc(Math.log1p(k) / 2.3) + 1) << 6) + c.facings);
      }
    this.cursors = list;
  }

  /** vanilla ChargeCursor.update */
  private update(c: ChargeCursor, level: SculkLevel, rx: number, ry: number, rz: number, r: SculkRandom, convert: boolean): void {
    if (c.charge <= 0 || (!this.isWorldGeneration && level.ticksAt && !level.ticksAt(c.x, c.y, c.z))) return;
    if (c.updateDelay > 0) {
      c.updateDelay--;
      return;
    }
    let st = level.getState(c.x, c.y, c.z);
    let kind = behaviourOf(st);
    if (convert && this.attemptSpreadVein(kind, level, c.x, c.y, c.z, st, c.facings)) {
      // (sculk itself stays sculk; a vein or the air it grew in may have changed)
      if (kind !== SCULK) {
        st = level.getState(c.x, c.y, c.z);
        kind = behaviourOf(st);
      }
      level.playSound?.('block.sculk.spread', c.x + 0.5, c.y + 0.5, c.z + 0.5);
    }
    c.charge = this.attemptUseCharge(kind, c, level, rx, ry, rz, r, convert);
    if (c.charge <= 0) {
      if (kind === VEIN) veinDischarged(level, st, c.x, c.y, c.z);
      return;
    }
    const next = validMovementPos(level, c.x, c.y, c.z, r);
    if (next) {
      if (kind === VEIN) veinDischarged(level, st, c.x, c.y, c.z);
      [c.x, c.y, c.z] = next;
      // (a patch's cursors stay within 15 blocks of where it began, across)
      if (this.isWorldGeneration && (c.x - rx) ** 2 + (c.z - rz) ** 2 >= 15 * 15) {
        c.charge = 0;
        return;
      }
      st = level.getState(c.x, c.y, c.z);
    }
    if (behaviourOf(st) !== DEFAULT) c.facings = availableFaces(st);
    // (the behaviour of where it stood, as vanilla)
    c.decayDelay = kind === DEFAULT ? Math.max(c.decayDelay - 1, 0) : 1;
    c.updateDelay = 1;
  }

  /** vanilla SculkBehaviour.attemptSpreadVein for each kind of block */
  private attemptSpreadVein(kind: number, level: SculkLevel, x: number, y: number, z: number, st: number, facings: number | null): boolean {
    if (kind !== DEFAULT || (facings !== null && facings === 0)) return spreadVeinAll(level, st, x, y, z) > 0;
    // (the air a cursor begins in grows veins on every face it can; where a vein was, it grows back)
    if (facings === null) return spreadVeinAll(level, level.getState(x, y, z), x, y, z, true) > 0;
    return (isAir(st) || (FLAGS[st] & F_WATER) !== 0) && regrow(level, x, y, z, st, facings);
  }

  /** vanilla SculkBehaviour.attemptUseCharge for each kind of block: the charge left */
  private attemptUseCharge(kind: number, c: ChargeCursor, level: SculkLevel, rx: number, ry: number, rz: number, r: SculkRandom, convert: boolean): number {
    if (kind === DEFAULT) return c.decayDelay > 0 ? c.charge : 0;
    if (kind === VEIN) {
      // vanilla SculkVeinBlock.attemptUseCharge
      if (convert && this.attemptPlaceSculk(level, c.x, c.y, c.z, r)) return c.charge - 1;
      return r.nextInt(this.chargeDecayRate) === 0 ? Math.floor(c.charge * 0.5) : c.charge;
    }
    // vanilla SculkBlock.attemptUseCharge
    const i = c.charge;
    if (i === 0 || r.nextInt(this.chargeDecayRate) !== 0) return i;
    const d2 = (c.x - rx) ** 2 + (c.y - ry) ** 2 + (c.z - rz) ** 2;
    const near = d2 < this.noGrowthRadius * this.noGrowthRadius;
    if (!near && canPlaceGrowth(level, c.x, c.y, c.z)) {
      const j = this.growthSpawnCost;
      if (r.nextInt(j) < i) {
        const st = randomGrowthState(level, c.x, c.y + 1, c.z, r, this.isWorldGeneration);
        level.setState(c.x, c.y + 1, c.z, st);
        level.playSound?.(blk(st) === kinds().sensor ? 'block.sculk_sensor.place' : 'block.sculk_shrieker.place', c.x + 0.5, c.y + 0.5, c.z + 0.5);
      }
      return Math.max(0, i - j);
    }
    if (r.nextInt(this.additionalDecayRate) !== 0) return i;
    return i - (near ? 1 : this.decayPenalty(Math.sqrt(d2), i));
  }

  /** vanilla SculkBlock.getDecayPenalty: the further out, the more a charge fades */
  private decayPenalty(dist: number, charge: number): number {
    const i = this.noGrowthRadius;
    const f = Math.fround((Math.fround(dist) - i) ** 2);
    const j = (24 - i) ** 2;
    const f1 = Math.min(1, f / j);
    return Math.max(1, Math.trunc(charge * f1 * 0.5));
  }

  /** vanilla SculkVeinBlock.attemptPlaceSculk: what one of the vein's faces lies on becomes sculk */
  private attemptPlaceSculk(level: SculkLevel, x: number, y: number, z: number, r: SculkRandom): boolean {
    const st = level.getState(x, y, z);
    const k = kinds();
    for (const d of shuffled(DIRS, r)) {
      if (!hasFace(st, d)) continue;
      const bx = x + DX[d], by = y + DY[d], bz = z + DZ[d];
      if (!this.replaceableBlocks.has(STATE_BLOCK[level.getState(bx, by, bz)])) continue;
      const sculk = k.sculk.defaultState;
      level.setState(bx, by, bz, sculk);
      level.pushEntitiesUp?.(bx, by, bz);
      level.playSound?.('block.sculk.spread', bx + 0.5, by + 0.5, bz + 0.5);
      spreadVeinAll(level, sculk, bx, by, bz);
      const back = OPPOSITE[d];
      for (const d2 of DIRS) {
        if (d2 === back) continue;
        const nx = bx + DX[d2], ny = by + DY[d2], nz = bz + DZ[d2];
        const n = level.getState(nx, ny, nz);
        if (blk(n) === k.vein) veinDischarged(level, n, nx, ny, nz);
      }
      return true;
    }
    return false;
  }
}

/** which SculkBehaviour a block has */
const DEFAULT = 0, SCULK = 1, VEIN = 2;

function behaviourOf(st: number): number {
  const b = STATE_BLOCK[st], k = kinds();
  return b === k.sculk.id ? SCULK : b === k.vein.id ? VEIN : DEFAULT;
}

/** vanilla SculkBlock.canPlaceGrowth: room above, and at most two sensors or shriekers already round about */
function canPlaceGrowth(level: SculkLevel, x: number, y: number, z: number): boolean {
  const k = kinds();
  const above = level.getState(x, y + 1, z);
  if (!isAir(above) && STATE_BLOCK[above] !== k.water.id) return false;
  let n = 0;
  const sensor = k.sensor.id, shrieker = k.shrieker.id;
  for (let dz = -4; dz <= 4; dz++)
    for (let dy = 0; dy <= 2; dy++)
      for (let dx = -4; dx <= 4; dx++) {
        const b = STATE_BLOCK[level.getState(x + dx, y + dy, z + dz)];
        if (b === sensor || b === shrieker) n++;
        if (n > 2) return false;
      }
  return true;
}

/** vanilla SculkBlock.getRandomGrowthState: one in 11 a shrieker (able to summon when it grew in world generation), else a sensor */
function randomGrowthState(level: SculkLevel, x: number, y: number, z: number, r: SculkRandom, worldGen: boolean): number {
  const k = kinds();
  let st = r.nextInt(11) === 0 ? k.shrieker.with(k.shrieker.defaultState, 'can_summon', worldGen) : k.sensor.defaultState;
  if (FLAGS[level.getState(x, y, z)] & F_WATER) st = blk(st).with(st, 'waterlogged', true);
  return st;
}

const ORDER = new Int8Array(NON_CORNER.length);

/** vanilla ChargeCursor.getValidMovementPos: a neighbouring sculk or vein it can reach, one lying on sculk-able ground first */
function validMovementPos(level: SculkLevel, x: number, y: number, z: number, r: SculkRandom): [number, number, number] | null {
  // (Util.shuffledCopy of the neighbours)
  for (let i = 0; i < ORDER.length; i++) ORDER[i] = i;
  for (let j = ORDER.length; j > 1; j--) {
    const k = r.nextInt(j);
    const t = ORDER[j - 1];
    ORDER[j - 1] = ORDER[k];
    ORDER[k] = t;
  }
  let best = -1;
  for (let i = 0; i < ORDER.length; i++) {
    const [ox, oy, oz] = NON_CORNER[ORDER[i]];
    const nx = x + ox, ny = y + oy, nz = z + oz;
    const st = level.getState(nx, ny, nz);
    if (behaviourOf(st) === DEFAULT || !movementUnobstructed(level, x, y, z, ox, oy, oz)) continue;
    best = ORDER[i];
    if (hasSubstrateAccess(level, st, nx, ny, nz)) break;
  }
  if (best < 0) return null;
  const [ox, oy, oz] = NON_CORNER[best];
  return [x + ox, y + oy, z + oz];
}

/** vanilla ChargeCursor.isMovementUnobstructed: round an edge only past a side that's open */
function movementUnobstructed(level: SculkLevel, x: number, y: number, z: number, ox: number, oy: number, oz: number): boolean {
  if (Math.abs(ox) + Math.abs(oy) + Math.abs(oz) === 1) return true;
  const dx = ox < 0 ? 4 : 5, dy = oy < 0 ? 0 : 1, dz = oz < 0 ? 2 : 3;
  if (ox === 0) return open(level, x, y, z, dy) || open(level, x, y, z, dz);
  if (oy === 0) return open(level, x, y, z, dx) || open(level, x, y, z, dz);
  return open(level, x, y, z, dx) || open(level, x, y, z, dy);
}

/** the side of a block toward `d` isn't closed off by the next block's face */
function open(level: SculkLevel, x: number, y: number, z: number, d: number): boolean {
  return !sturdy(level.getState(x + DX[d], y + DY[d], z + DZ[d]), OPPOSITE[d]);
}

/** vanilla SculkPatchFeature.canSpreadFrom: a patch can begin in sculk, or in air or still water beside something solid */
export function canSpreadFrom(level: SculkLevel, x: number, y: number, z: number): boolean {
  const st = level.getState(x, y, z);
  if (behaviourOf(st) !== DEFAULT) return true;
  if (!isAir(st) && st !== kinds().waterSource) return false;
  for (let d = 0; d < 6; d++) if (collisionFullBlock(level.getState(x + DX[d], y + DY[d], z + DZ[d]))) return true;
  return false;
}

/** vanilla isFaceSturdy(UP): what a shrieker can stand on */
export function sturdyTop(st: number): boolean {
  return sturdy(st, UP);
}
