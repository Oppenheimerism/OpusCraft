// Block registry: blocks, properties, global block-state ids and per-state
// lookup tables used by the mesher, light engine and physics.

import type { ModelChoice } from './models';

export type PropValue = string | number | boolean;

export interface Property {
  name: string;
  values: PropValue[];
}

export function boolProp(name: string): Property {
  return { name, values: [false, true] };
}
export function intProp(name: string, min: number, max: number): Property {
  const values: number[] = [];
  for (let i = min; i <= max; i++) values.push(i);
  return { name, values };
}
export function enumProp(name: string, values: string[]): Property {
  return { name, values };
}

export const P = {
  snowy: boolProp('snowy'),
  axis: enumProp('axis', ['x', 'y', 'z']),
  level: intProp('level', 0, 15),
  lit: boolProp('lit'),
  waterlogged: boolProp('waterlogged'),
  facingH: enumProp('facing', ['north', 'south', 'west', 'east']),
  facing: enumProp('facing', ['north', 'east', 'south', 'west', 'up', 'down']),
  half: enumProp('half', ['upper', 'lower']),
  halfTB: enumProp('half', ['top', 'bottom']),
  slabType: enumProp('type', ['top', 'bottom', 'double']),
  stairShape: enumProp('shape', ['straight', 'inner_left', 'inner_right', 'outer_left', 'outer_right']),
  distance: intProp('distance', 1, 7),
  persistent: boolProp('persistent'),
  layers: intProp('layers', 1, 8),
  age3: intProp('age', 0, 3),
  age7: intProp('age', 0, 7),
  age15: intProp('age', 0, 15),
  age25: intProp('age', 0, 25),
  stage: intProp('stage', 0, 1),
  open: boolProp('open'),
  powered: boolProp('powered'),
  hinge: enumProp('hinge', ['left', 'right']),
  north: boolProp('north'),
  south: boolProp('south'),
  east: boolProp('east'),
  west: boolProp('west'),
  up: boolProp('up'),
  moisture: intProp('moisture', 0, 7),
  part: enumProp('part', ['head', 'foot']),
  occupied: boolProp('occupied'),
  chestType: enumProp('type', ['single', 'left', 'right']),
  bites: intProp('bites', 0, 6),
};

export const enum Layer {
  SOLID = 0,
  CUTOUT_MIPPED = 1,
  CUTOUT = 2,
  TRANSLUCENT = 3,
  NONE = 4,
}

export type TintType =
  | 'none'
  | 'grass'
  | 'foliage'
  | 'water'
  | 'birch'
  | 'spruce'
  | 'lily'
  | 'stem'
  | 'redstone'
  | 'constant';

export type ToolType = 'pickaxe' | 'axe' | 'shovel' | 'hoe' | 'sword' | 'shears' | 'none';

export type Box = [number, number, number, number, number, number];

export class StateView {
  constructor(readonly block: Block, readonly values: PropValue[]) {}
  get<T extends PropValue = PropValue>(name: string): T {
    const i = this.block.propIndex(name);
    return this.values[i] as T;
  }
  has(name: string): boolean {
    return this.block.propIndex(name) >= 0;
  }
}

export interface BlockSettings {
  props?: Property[];
  defaults?: Record<string, PropValue>;
  hardness?: number;
  resistance?: number;
  sound?: string;
  tool?: ToolType;
  /** minimum tool tier to get drops (0 wood/gold, 1 stone, 2 iron, 3 diamond) */
  tier?: number;
  requiresTool?: boolean;
  light?: number | ((s: StateView) => number);
  /** light opacity; computed from shape when omitted */
  opacity?: number | ((s: StateView) => number);
  layer?: Layer;
  /** full opaque cube: occludes neighbours, blocks light, AO caster */
  opaque?: boolean | ((s: StateView) => boolean);
  /** collision: 'full', 'none' or boxes (block units) */
  collision?: 'full' | 'none' | Box[] | ((s: StateView) => 'full' | 'none' | Box[]);
  /** outline/selection shape (defaults to collision, or full for non-colliding) */
  outline?: 'full' | Box[] | ((s: StateView) => 'full' | Box[]);
  /** which faces are full & opaque (for neighbour face culling / light) */
  faceOcclusion?: number | ((s: StateView) => number);
  replaceable?: boolean | ((s: StateView) => boolean);
  friction?: number;
  speedFactor?: number;
  jumpFactor?: number;
  tint?: TintType;
  tintColor?: number;
  offset?: 'none' | 'xz' | 'xyz';
  /** vanilla getMaxHorizontalOffset (0.25; pointed dripstone 0.125) */
  maxOffset?: number;
  model?: (s: StateView) => ModelChoice;
  /** same-type face culling (glass/ice/water) */
  cullSame?: boolean;
  /** AO shade brightness 0.2 caster override */
  aoCaster?: boolean;
  viewBlocking?: boolean;
  fluid?: 'water' | 'lava';
  randomTicks?: boolean;
  /** item name for this block (false = no item) */
  item?: string | false;
  mapColor?: number;
  flammable?: boolean;
  /** creative tab */
  tab?: string;
  climbable?: boolean;
  isLeaves?: boolean;
  noDrop?: boolean;
}

export class Block {
  id = 0;
  baseState = 0;
  stateCount = 1;
  readonly props: Property[];
  readonly strides: number[] = [];
  defaultState = 0;
  readonly hardness: number;
  readonly resistance: number;
  readonly sound: string;
  readonly tool: ToolType;
  readonly tier: number;
  readonly requiresTool: boolean;
  readonly friction: number;
  readonly speedFactor: number;
  readonly jumpFactor: number;
  readonly tint: TintType;
  readonly offset: 'none' | 'xz' | 'xyz';
  readonly maxOffset: number;

  constructor(readonly name: string, readonly s: BlockSettings) {
    this.props = s.props ?? [];
    this.hardness = s.hardness ?? 0;
    this.resistance = s.resistance ?? this.hardness;
    this.sound = s.sound ?? 'stone';
    this.tool = s.tool ?? 'none';
    this.tier = s.tier ?? 0;
    this.requiresTool = s.requiresTool ?? false;
    this.friction = s.friction ?? 0.6;
    this.speedFactor = s.speedFactor ?? 1;
    this.jumpFactor = s.jumpFactor ?? 1;
    this.tint = s.tint ?? 'none';
    this.offset = s.offset ?? 'none';
    this.maxOffset = s.maxOffset ?? 0.25;
    let stride = 1;
    for (let i = this.props.length - 1; i >= 0; i--) {
      this.strides[i] = stride;
      stride *= this.props[i].values.length;
    }
    this.stateCount = stride;
  }

  propIndex(name: string): number {
    for (let i = 0; i < this.props.length; i++) if (this.props[i].name === name) return i;
    return -1;
  }

  /** decode property values of a state */
  values(state: number): PropValue[] {
    let idx = state - this.baseState;
    const out: PropValue[] = [];
    for (let i = 0; i < this.props.length; i++) {
      const n = this.props[i].values.length;
      out.push(this.props[i].values[Math.floor(idx / this.strides[i]) % n]);
    }
    return out;
  }

  get<T extends PropValue = PropValue>(state: number, name: string): T {
    const i = this.propIndex(name);
    if (i < 0) throw new Error(`${this.name} has no property ${name}`);
    const idx = state - this.baseState;
    const n = this.props[i].values.length;
    return this.props[i].values[Math.floor(idx / this.strides[i]) % n] as T;
  }

  with(state: number, name: string, value: PropValue): number {
    const i = this.propIndex(name);
    if (i < 0) return state;
    const vi = this.props[i].values.indexOf(value);
    if (vi < 0) throw new Error(`${this.name}.${name} bad value ${value}`);
    const idx = state - this.baseState;
    const n = this.props[i].values.length;
    const cur = Math.floor(idx / this.strides[i]) % n;
    return state + (vi - cur) * this.strides[i];
  }

  /** state with given property values (others default) */
  state(values: Record<string, PropValue> = {}): number {
    let st = this.defaultState;
    for (const k in values) st = this.with(st, k, values[k]);
    return st;
  }

  view(state: number): StateView {
    return new StateView(this, this.values(state));
  }

  toString(): string {
    return this.name;
  }
}

// ---------------------------------------------------------------------------
// Registry

export const BLOCKS: Block[] = [];
export const BLOCK_BY_NAME = new Map<string, Block>();
let nextState = 0;

export function registerBlock(name: string, s: BlockSettings): Block {
  const b = new Block(name, s);
  b.id = BLOCKS.length;
  b.baseState = nextState;
  nextState += b.stateCount;
  // default state
  let def = b.baseState;
  for (let i = 0; i < b.props.length; i++) {
    const p = b.props[i];
    const dv = s.defaults && p.name in s.defaults ? s.defaults[p.name] : p.values[0];
    const vi = p.values.indexOf(dv);
    def += (vi < 0 ? 0 : vi) * b.strides[i];
  }
  b.defaultState = def;
  BLOCKS.push(b);
  BLOCK_BY_NAME.set(name, b);
  return b;
}

export function stateCount(): number {
  return nextState;
}

// Per-state tables (filled by finalizeBlocks)
export let STATE_BLOCK: Uint16Array = new Uint16Array(0);
export let OPACITY: Uint8Array = new Uint8Array(0);
export let EMISSION: Uint8Array = new Uint8Array(0);
export let LAYER: Uint8Array = new Uint8Array(0);
export let FLAGS: Uint16Array = new Uint16Array(0);
/** bitmask per state: bit d set if face d is a full opaque square */
export let FACE_OCC: Uint8Array = new Uint8Array(0);
export let COLLISION: (Box[] | null)[] = [];
export let OUTLINE: Box[][] = [];
export let STATE_VIEWS: StateView[] = [];

export const F_AIR = 1,
  F_OPAQUE = 2, // full opaque cube (solidRender)
  F_COLLIDE = 4,
  F_FULL_COLLISION = 8, // collision shape is full block (AO caster)
  F_WATER = 16,
  F_LAVA = 32,
  F_REPLACEABLE = 64,
  F_CULL_SAME = 128,
  F_VIEW_BLOCKING = 256,
  F_LEAVES = 512,
  F_SHAPE_OCCLUSION = 1024, // uses face shapes for light occlusion (slabs/stairs)
  F_CLIMBABLE = 2048,
  F_WATERLOGGED = 4096,
  F_HAS_MODEL = 8192,
  F_RANDOM_TICK = 16384;

function isFullBox(b: Box[]): boolean {
  return b.length === 1 && b[0][0] <= 0 && b[0][1] <= 0 && b[0][2] <= 0 && b[0][3] >= 1 && b[0][4] >= 1 && b[0][5] >= 1;
}

function resolve<T>(v: T | ((s: StateView) => T) | undefined, s: StateView): T | undefined {
  if (typeof v === 'function') return (v as (s: StateView) => T)(s);
  return v;
}

/** Face-occlusion mask derived from boxes: a face is full if a box covers it entirely. */
export function faceMaskFromBoxes(boxes: Box[]): number {
  let mask = 0;
  for (const b of boxes) {
    const [x0, y0, z0, x1, y1, z1] = b;
    const coversXZ = x0 <= 0 && z0 <= 0 && x1 >= 1 && z1 >= 1;
    const coversXY = x0 <= 0 && y0 <= 0 && x1 >= 1 && y1 >= 1;
    const coversZY = z0 <= 0 && y0 <= 0 && z1 >= 1 && y1 >= 1;
    if (coversXZ && y0 <= 0) mask |= 1 << 0;
    if (coversXZ && y1 >= 1) mask |= 1 << 1;
    if (coversXY && z0 <= 0) mask |= 1 << 2;
    if (coversXY && z1 >= 1) mask |= 1 << 3;
    if (coversZY && x0 <= 0) mask |= 1 << 4;
    if (coversZY && x1 >= 1) mask |= 1 << 5;
  }
  return mask;
}

export function finalizeBlocks(): void {
  const n = nextState;
  STATE_BLOCK = new Uint16Array(n);
  OPACITY = new Uint8Array(n);
  EMISSION = new Uint8Array(n);
  LAYER = new Uint8Array(n);
  FLAGS = new Uint16Array(n);
  FACE_OCC = new Uint8Array(n);
  COLLISION = new Array(n).fill(null);
  OUTLINE = new Array(n);
  STATE_VIEWS = new Array(n);
  for (const b of BLOCKS) {
    const s = b.s;
    for (let st = b.baseState; st < b.baseState + b.stateCount; st++) {
      const view = new StateView(b, b.values(st));
      STATE_VIEWS[st] = view;
      STATE_BLOCK[st] = b.id;
      const isAir = b.name === 'air' || b.name === 'cave_air' || b.name === 'void_air';
      let flags = 0;
      if (isAir) flags |= F_AIR;
      const col = isAir ? 'none' : resolve(s.collision, view) ?? 'full';
      let boxes: Box[] | null = null;
      if (col === 'full') boxes = [[0, 0, 0, 1, 1, 1]];
      else if (col !== 'none') boxes = col;
      COLLISION[st] = boxes && boxes.length ? boxes : null;
      if (boxes && boxes.length) flags |= F_COLLIDE;
      const fullCollision = !!boxes && isFullBox(boxes);
      const opaque = isAir ? false : resolve(s.opaque, view) ?? fullCollision;
      if (opaque) flags |= F_OPAQUE;
      const aoCaster = s.aoCaster ?? fullCollision;
      if (aoCaster) flags |= F_FULL_COLLISION;
      const viewBlocking = s.viewBlocking ?? (fullCollision && opaque);
      if (viewBlocking) flags |= F_VIEW_BLOCKING;
      if (s.fluid === 'water') flags |= F_WATER;
      if (s.fluid === 'lava') flags |= F_LAVA;
      const waterlogged = b.propIndex('waterlogged') >= 0 && view.get('waterlogged') === true;
      if (waterlogged) flags |= F_WATERLOGGED | F_WATER;
      if (isAir || resolve(s.replaceable, view)) flags |= F_REPLACEABLE;
      if (s.cullSame) flags |= F_CULL_SAME;
      if (s.isLeaves) flags |= F_LEAVES;
      if (s.climbable) flags |= F_CLIMBABLE;
      if (s.model) flags |= F_HAS_MODEL;
      if (s.randomTicks) flags |= F_RANDOM_TICK;
      // face occlusion
      let faceOcc = 0;
      if (opaque) faceOcc = 63;
      else if (s.faceOcclusion !== undefined) faceOcc = resolve(s.faceOcclusion, view) ?? 0;
      FACE_OCC[st] = faceOcc;
      if (!opaque && faceOcc) flags |= F_SHAPE_OCCLUSION;
      // opacity
      let op = resolve(s.opacity, view);
      if (op === undefined) {
        if (opaque) op = 15;
        else if (s.fluid || waterlogged) op = 1;
        else if (s.isLeaves) op = 1;
        else op = 0;
      }
      OPACITY[st] = op;
      EMISSION[st] = resolve(s.light, view) ?? 0;
      LAYER[st] = isAir ? Layer.NONE : s.layer ?? Layer.SOLID;
      FLAGS[st] = flags;
      const ol = resolve(s.outline, view);
      if (ol === 'full' || (!ol && !boxes)) OUTLINE[st] = [[0, 0, 0, 1, 1, 1]];
      else if (ol) OUTLINE[st] = ol;
      else OUTLINE[st] = boxes!;
    }
  }
}

export function blockOf(state: number): Block {
  return BLOCKS[STATE_BLOCK[state]];
}

export function getBlock(name: string): Block {
  const b = BLOCK_BY_NAME.get(name);
  if (!b) throw new Error('unknown block ' + name);
  return b;
}

/** default state of a block by name */
export function S(name: string, values?: Record<string, PropValue>): number {
  const b = getBlock(name);
  return values ? b.state(values) : b.defaultState;
}

export function isAir(state: number): boolean {
  return (FLAGS[state] & F_AIR) !== 0;
}
