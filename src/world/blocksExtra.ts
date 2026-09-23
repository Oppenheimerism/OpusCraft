// More vanilla blocks: doors, trapdoors, fences, fence gates, panes, iron
// bars, stained glass, beds, carpets, fire, crops, stems, walls, lanterns,
// chains. Models mirror the vanilla block model templates.

import { registerBlock, P, Layer, StateView, Box, enumProp, boolProp, intProp } from './block';
import type { ModelDef, ModelChoice, ElementDef, FaceDef, Variant } from './models';
import { box, cubeAll, cross } from './models';
import type { DirName } from './dir';
import { registerNetherBlocks } from './blocksNether';

const px = (v: number) => v / 16;
const bx = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): Box => [px(x0), px(y0), px(z0), px(x1), px(y1), px(z1)];

export const WOODS = ['oak', 'spruce', 'birch', 'jungle', 'acacia', 'dark_oak', 'mangrove', 'cherry'] as const;
export const DYES = ['white', 'orange', 'magenta', 'light_blue', 'yellow', 'lime', 'pink', 'gray', 'light_gray', 'cyan', 'purple', 'blue', 'brown', 'green', 'red', 'black'] as const;

const HOR_ROT: Record<string, number> = { north: 0, east: 90, south: 180, west: 270 };

function f(tex: string, uv?: [number, number, number, number], cull?: DirName, extra: Partial<FaceDef> = {}): FaceDef {
  return { tex, uv, cull, ...extra };
}

// ---------------------------------------------------------------------------
// Doors (vanilla template_door_{bottom,top}_{left,right}[_open])

function doorModel(tex: string, top: boolean, left: boolean, open: boolean): ModelDef {
  const mirror = left === open;
  const faces: Partial<Record<DirName, FaceDef>> = {
    north: f(tex, [3, 0, 0, 16], 'north'),
    south: f(tex, [0, 0, 3, 16], 'south'),
    west: f(tex, mirror ? [16, 0, 0, 16] : [0, 0, 16, 16], 'west'),
    east: f(tex, mirror ? [0, 0, 16, 16] : [16, 0, 0, 16]),
  };
  if (top) faces.up = f(tex, [13, 0, 16, 16], 'up');
  else faces.down = f(tex, [13, 0, 16, 16], 'down');
  return { ao: false, particle: tex, elements: [{ from: [0, 0, 0], to: [3, 16, 16], faces }] };
}

const DOOR_CLOSED_Y: Record<string, number> = { east: 0, south: 90, west: 180, north: 270 };
const DOOR_OPEN_LEFT_Y: Record<string, number> = { east: 90, south: 180, west: 270, north: 0 };
const DOOR_OPEN_RIGHT_Y: Record<string, number> = { east: 270, south: 0, west: 90, north: 180 };

/** vanilla DoorBlock.getShape */
export function doorBox(facing: string, open: boolean, right: boolean): Box {
  const S = bx(0, 0, 0, 16, 16, 3), N = bx(0, 0, 13, 16, 16, 16), W = bx(13, 0, 0, 16, 16, 16), E = bx(0, 0, 0, 3, 16, 16);
  switch (facing) {
    case 'south': return !open ? S : right ? E : W;
    case 'west': return !open ? W : right ? S : N;
    case 'north': return !open ? N : right ? W : E;
    default: return !open ? E : right ? N : S;
  }
}

function registerDoor(name: string, texBase: string, hardness: number, sound: string, tool: 'axe' | 'pickaxe'): void {
  const models: Record<string, ModelDef> = {};
  for (const top of [false, true])
    for (const left of [false, true])
      for (const open of [false, true]) models[`${top}${left}${open}`] = doorModel(`${texBase}_${top ? 'top' : 'bottom'}`, top, left, open);
  registerBlock(name, {
    props: [P.facingH, P.half, P.hinge, P.open, P.powered], defaults: { half: 'lower', hinge: 'left', facing: 'north' },
    hardness, resistance: hardness, sound, tool, requiresTool: tool === 'pickaxe', layer: Layer.CUTOUT, opaque: false, aoCaster: false, opacity: 0,
    collision: (s) => [doorBox(s.get('facing') as string, s.get('open') as boolean, s.get('hinge') === 'right')],
    model: (s) => {
      const facing = s.get('facing') as string, open = s.get('open') as boolean, left = s.get('hinge') === 'left';
      const y = !open ? DOOR_CLOSED_Y[facing] : left ? DOOR_OPEN_LEFT_Y[facing] : DOOR_OPEN_RIGHT_Y[facing];
      return { model: models[`${s.get('half') === 'upper'}${left}${open}`], y };
    },
    flammable: tool === 'axe',
  });
}

// ---------------------------------------------------------------------------
// Trapdoors (vanilla template_orientable_trapdoor_{bottom,top,open})

function trapdoorModels(tex: string): { bottom: ModelDef; top: ModelDef; open: ModelDef } {
  const side: [number, number, number, number] = [0, 16, 16, 13];
  const bottom: ModelDef = {
    particle: tex,
    elements: [{ from: [0, 0, 0], to: [16, 3, 16], faces: { down: f(tex, [0, 0, 16, 16], 'down'), up: f(tex, [0, 0, 16, 16]), north: f(tex, side, 'north'), south: f(tex, side, 'south'), west: f(tex, side, 'west'), east: f(tex, side, 'east') } }],
  };
  const top: ModelDef = {
    particle: tex,
    elements: [{ from: [0, 13, 0], to: [16, 16, 16], faces: { down: f(tex, [0, 0, 16, 16]), up: f(tex, [0, 0, 16, 16], 'up'), north: f(tex, side, 'north'), south: f(tex, side, 'south'), west: f(tex, side, 'west'), east: f(tex, side, 'east') } }],
  };
  const open: ModelDef = {
    particle: tex,
    elements: [{
      from: [0, 0, 13], to: [16, 16, 16],
      faces: { down: f(tex, [0, 13, 16, 16], 'down'), up: f(tex, [0, 16, 16, 13], 'up'), north: f(tex, [0, 0, 16, 16]), south: f(tex, [0, 0, 16, 16], 'south'), west: f(tex, [16, 0, 13, 16], 'west'), east: f(tex, [13, 0, 16, 16], 'east') },
    }],
  };
  return { bottom, top, open };
}

const TRAP_Y: Record<string, number> = { north: 0, east: 90, south: 180, west: 270 };
const TRAP_TOP_OPEN_Y: Record<string, number> = { north: 180, east: 270, south: 0, west: 90 };

export function trapdoorBox(facing: string, half: string, open: boolean): Box {
  if (!open) return half === 'top' ? bx(0, 13, 0, 16, 16, 16) : bx(0, 0, 0, 16, 3, 16);
  switch (facing) {
    case 'north': return bx(0, 0, 13, 16, 16, 16);
    case 'south': return bx(0, 0, 0, 16, 16, 3);
    case 'west': return bx(13, 0, 0, 16, 16, 16);
    default: return bx(0, 0, 0, 3, 16, 16);
  }
}

function registerTrapdoor(name: string, tex: string, hardness: number, sound: string, tool: 'axe' | 'pickaxe'): void {
  const m = trapdoorModels(tex);
  registerBlock(name, {
    props: [P.facingH, P.halfTB, P.open, P.powered, P.waterlogged], defaults: { half: 'bottom', facing: 'north' },
    hardness, resistance: hardness, sound, tool, requiresTool: tool === 'pickaxe', layer: Layer.CUTOUT, opaque: false, aoCaster: false, opacity: 0,
    collision: (s) => [trapdoorBox(s.get('facing') as string, s.get('half') as string, s.get('open') as boolean)],
    model: (s) => {
      const facing = s.get('facing') as string, open = s.get('open') as boolean, top = s.get('half') === 'top';
      if (!open) return { model: top ? m.top : m.bottom, y: TRAP_Y[facing] };
      if (top) return { model: m.open, x: 180, y: TRAP_TOP_OPEN_Y[facing] };
      return { model: m.open, y: TRAP_Y[facing] };
    },
    flammable: tool === 'axe',
  });
}

// ---------------------------------------------------------------------------
// Fences (vanilla fence_post / fence_side multipart)

function fencePost(tex: string): ModelDef {
  return {
    particle: tex,
    elements: [{
      from: [6, 0, 6], to: [10, 16, 10],
      faces: { down: f(tex, [6, 6, 10, 10], 'down'), up: f(tex, [6, 6, 10, 10], 'up'), north: f(tex, [6, 0, 10, 16]), south: f(tex, [6, 0, 10, 16]), west: f(tex, [6, 0, 10, 16]), east: f(tex, [6, 0, 10, 16]) },
    }],
  };
}

function fenceSide(tex: string): ModelDef {
  return {
    particle: tex,
    elements: [
      { from: [7, 12, 0], to: [9, 15, 9], faces: { down: f(tex, [7, 0, 9, 9]), up: f(tex, [7, 0, 9, 9]), north: f(tex, [7, 1, 9, 4], 'north'), west: f(tex, [0, 1, 9, 4]), east: f(tex, [0, 1, 9, 4]) } },
      { from: [7, 6, 0], to: [9, 9, 9], faces: { down: f(tex, [7, 0, 9, 9]), up: f(tex, [7, 0, 9, 9]), north: f(tex, [7, 7, 9, 10], 'north'), west: f(tex, [0, 7, 9, 10]), east: f(tex, [0, 7, 9, 10]) } },
    ],
  };
}

/** vanilla CrossCollisionBlock.makeShapes */
export function crossBoxes(node: number, ext: number, nodeH: number, extB: number, extH: number, s: StateView): Box[] {
  const a = 8 - node, b = 8 + node, c = 8 - ext, d = 8 + ext;
  const out: Box[] = [bx(a, 0, a, b, nodeH, b)];
  if (s.get('north')) out.push(bx(c, extB, 0, d, extH, d));
  if (s.get('south')) out.push(bx(c, extB, c, d, extH, 16));
  if (s.get('west')) out.push(bx(0, extB, c, d, extH, d));
  if (s.get('east')) out.push(bx(c, extB, c, 16, extH, d));
  return out;
}

const CROSS_PROPS = [P.north, P.east, P.south, P.west, P.waterlogged];

function registerFence(name: string, tex: string, hardness: number, sound: string, tool: 'axe' | 'pickaxe'): void {
  const post = fencePost(tex), side = fenceSide(tex);
  registerBlock(name, {
    props: CROSS_PROPS, defaults: { east: true, west: true },
    hardness, resistance: tool === 'axe' ? 3 : 6, sound, tool, requiresTool: tool === 'pickaxe', opaque: false, aoCaster: false, opacity: 0,
    collision: (s) => crossBoxes(2, 2, 24, 0, 24, s),
    outline: (s) => crossBoxes(2, 1, 16, 6, 15, s),
    model: (s) => {
      const parts: Variant[] = [{ model: post }];
      if (s.get('north')) parts.push({ model: side, uvlock: true });
      if (s.get('east')) parts.push({ model: side, y: 90, uvlock: true });
      if (s.get('south')) parts.push({ model: side, y: 180, uvlock: true });
      if (s.get('west')) parts.push({ model: side, y: 270, uvlock: true });
      return { parts };
    },
    flammable: tool === 'axe',
  });
}

// ---------------------------------------------------------------------------
// Fence gates (vanilla template_fence_gate[_open|_wall|_wall_open])

function gateModels(tex: string, wall: boolean): { closed: ModelDef; open: ModelDef } {
  const o = wall ? -3 : 0;
  const Y = (v: number) => v + o;
  const el = (from: [number, number, number], to: [number, number, number], faces: Partial<Record<DirName, FaceDef>>): ElementDef => ({ from: [from[0], Y(from[1]), from[2]], to: [to[0], Y(to[1]), to[2]], faces });
  const posts = [
    el([0, 5, 7], [2, 16, 9], { down: f(tex, [0, 7, 2, 9]), up: f(tex, [0, 7, 2, 9]), north: f(tex, [0, 0, 2, 11]), south: f(tex, [0, 0, 2, 11]), west: f(tex, [7, 0, 9, 11], 'west') }),
    el([14, 5, 7], [16, 16, 9], { down: f(tex, [14, 7, 16, 9]), up: f(tex, [14, 7, 16, 9]), north: f(tex, [14, 0, 16, 11]), south: f(tex, [14, 0, 16, 11]), east: f(tex, [7, 0, 9, 11], 'east') }),
  ];
  const closed: ModelDef = {
    particle: tex,
    elements: [
      ...posts,
      el([6, 6, 7], [8, 15, 9], { down: f(tex, [6, 7, 8, 9]), up: f(tex, [6, 7, 8, 9]), north: f(tex, [6, 1, 8, 10]), south: f(tex, [6, 1, 8, 10]), west: f(tex, [7, 1, 9, 10]), east: f(tex, [7, 1, 9, 10]) }),
      el([8, 6, 7], [10, 15, 9], { down: f(tex, [8, 7, 10, 9]), up: f(tex, [8, 7, 10, 9]), north: f(tex, [8, 1, 10, 10]), south: f(tex, [8, 1, 10, 10]), west: f(tex, [7, 1, 9, 10]), east: f(tex, [7, 1, 9, 10]) }),
      el([2, 6, 7], [6, 9, 9], { down: f(tex, [2, 7, 6, 9]), up: f(tex, [2, 7, 6, 9]), north: f(tex, [2, 7, 6, 10]), south: f(tex, [2, 7, 6, 10]) }),
      el([2, 12, 7], [6, 15, 9], { down: f(tex, [2, 7, 6, 9]), up: f(tex, [2, 7, 6, 9]), north: f(tex, [2, 1, 6, 4]), south: f(tex, [2, 1, 6, 4]) }),
      el([10, 6, 7], [14, 9, 9], { down: f(tex, [10, 7, 14, 9]), up: f(tex, [10, 7, 14, 9]), north: f(tex, [10, 7, 14, 10]), south: f(tex, [10, 7, 14, 10]) }),
      el([10, 12, 7], [14, 15, 9], { down: f(tex, [10, 7, 14, 9]), up: f(tex, [10, 7, 14, 9]), north: f(tex, [10, 1, 14, 4]), south: f(tex, [10, 1, 14, 4]) }),
    ],
  };
  const open: ModelDef = {
    particle: tex,
    elements: [
      ...posts,
      el([0, 6, 13], [2, 15, 15], { down: f(tex, [0, 13, 2, 15]), up: f(tex, [0, 13, 2, 15]), north: f(tex, [0, 1, 2, 10]), south: f(tex, [0, 1, 2, 10]), west: f(tex, [13, 1, 15, 10]), east: f(tex, [13, 1, 15, 10]) }),
      el([14, 6, 13], [16, 15, 15], { down: f(tex, [14, 13, 16, 15]), up: f(tex, [14, 13, 16, 15]), north: f(tex, [14, 1, 16, 10]), south: f(tex, [14, 1, 16, 10]), west: f(tex, [13, 1, 15, 10]), east: f(tex, [13, 1, 15, 10]) }),
      el([0, 6, 9], [2, 9, 13], { down: f(tex, [0, 9, 2, 13]), up: f(tex, [0, 9, 2, 13]), west: f(tex, [9, 7, 13, 10]), east: f(tex, [9, 7, 13, 10]) }),
      el([0, 12, 9], [2, 15, 13], { down: f(tex, [0, 9, 2, 13]), up: f(tex, [0, 9, 2, 13]), west: f(tex, [9, 1, 13, 4]), east: f(tex, [9, 1, 13, 4]) }),
      el([14, 6, 9], [16, 9, 13], { down: f(tex, [14, 9, 16, 13]), up: f(tex, [14, 9, 16, 13]), west: f(tex, [9, 7, 13, 10]), east: f(tex, [9, 7, 13, 10]) }),
      el([14, 12, 9], [16, 15, 13], { down: f(tex, [14, 9, 16, 13]), up: f(tex, [14, 9, 16, 13]), west: f(tex, [9, 1, 13, 4]), east: f(tex, [9, 1, 13, 4]) }),
    ],
  };
  return { closed, open };
}

const GATE_Y: Record<string, number> = { south: 0, west: 90, north: 180, east: 270 };

function registerFenceGate(name: string, tex: string): void {
  const normal = gateModels(tex, false), wall = gateModels(tex, true);
  registerBlock(name, {
    props: [P.facingH, P.open, P.powered, boolProp('in_wall')], defaults: { facing: 'north' },
    hardness: 2, resistance: 3, sound: 'wood', tool: 'axe', opaque: false, aoCaster: false, opacity: 0,
    collision: (s) => {
      if (s.get('open')) return 'none';
      const f = s.get('facing') as string;
      return f === 'north' || f === 'south' ? [bx(0, 0, 6, 16, 24, 10)] : [bx(6, 0, 0, 10, 24, 16)];
    },
    outline: (s) => {
      const h = s.get('in_wall') ? 13 : 16;
      const f = s.get('facing') as string;
      return f === 'north' || f === 'south' ? [bx(0, 0, 6, 16, h, 10)] : [bx(6, 0, 0, 10, h, 16)];
    },
    model: (s) => {
      const set = s.get('in_wall') ? wall : normal;
      return { model: s.get('open') ? set.open : set.closed, y: GATE_Y[s.get('facing') as string], uvlock: true };
    },
    flammable: true,
  });
}

// ---------------------------------------------------------------------------
// Glass panes and iron bars (vanilla glass_pane multipart)

function paneModels(pane: string, edge: string): { post: ModelDef; side: ModelDef; sideAlt: ModelDef; noside: ModelDef; nosideAlt: ModelDef } {
  return {
    post: { particle: pane, elements: [{ from: [7, 0, 7], to: [9, 16, 9], faces: { down: f(edge, [7, 7, 9, 9]), up: f(edge, [7, 7, 9, 9]) } }] },
    side: {
      particle: pane,
      elements: [{ from: [7, 0, 0], to: [9, 16, 7], faces: { down: f(edge, [7, 0, 9, 7]), up: f(edge, [7, 0, 9, 7]), north: f(edge, [7, 0, 9, 16], 'north'), west: f(pane, [16, 0, 9, 16]), east: f(pane, [9, 0, 16, 16]) } }],
    },
    sideAlt: {
      particle: pane,
      elements: [{ from: [7, 0, 9], to: [9, 16, 16], faces: { down: f(edge, [7, 0, 9, 7]), up: f(edge, [7, 0, 9, 7]), south: f(edge, [7, 0, 9, 16], 'south'), west: f(pane, [7, 0, 0, 16]), east: f(pane, [0, 0, 7, 16]) } }],
    },
    noside: { particle: pane, elements: [{ from: [7, 0, 7], to: [9, 16, 9], faces: { north: f(pane, [9, 0, 7, 16]) } }] },
    nosideAlt: { particle: pane, elements: [{ from: [7, 0, 7], to: [9, 16, 9], faces: { east: f(pane, [7, 0, 9, 16]) } }] },
  };
}

function registerPane(name: string, pane: string, edge: string, opts: { sound: string; hardness: number; layer: Layer; tool?: 'pickaxe'; noDrop?: boolean }): void {
  const m = paneModels(pane, edge);
  registerBlock(name, {
    props: CROSS_PROPS, hardness: opts.hardness, resistance: opts.tool ? 6 : 0.3, sound: opts.sound, tool: opts.tool ?? 'none', requiresTool: false,
    layer: opts.layer, opaque: false, aoCaster: false, opacity: 0, cullSame: false, noDrop: opts.noDrop,
    collision: (s) => crossBoxes(1, 1, 16, 0, 16, s),
    model: (s) => {
      const parts: Variant[] = [{ model: m.post }];
      if (s.get('north')) parts.push({ model: m.side });
      if (s.get('east')) parts.push({ model: m.side, y: 90 });
      if (s.get('south')) parts.push({ model: m.sideAlt });
      if (s.get('west')) parts.push({ model: m.sideAlt, y: 90 });
      if (!s.get('north')) parts.push({ model: m.noside });
      if (!s.get('east')) parts.push({ model: m.nosideAlt });
      if (!s.get('south')) parts.push({ model: m.nosideAlt, y: 90 });
      if (!s.get('west')) parts.push({ model: m.noside, y: 270 });
      return { parts };
    },
  });
}

// ---------------------------------------------------------------------------
// Beds (static model: 6 px mattress on 3 px legs)

function bedModel(c: string, head: boolean): ModelDef {
  const p = head ? 'head' : 'foot';
  const top = `bed_${c}_top_${p}`, side = `bed_${c}_side_${p}`, end = `bed_${c}_end_${p}`;
  const leg = 'bed_leg';
  const els: ElementDef[] = [];
  // mattress: head part's head end is north (z=0); foot part's end is south (z=16)
  const faces: Partial<Record<DirName, FaceDef>> = {
    up: f(top, [0, 0, 16, 16]),
    down: f('bed_bottom', [0, 0, 16, 16]),
    west: f(side, head ? [0, 0, 16, 6] : [0, 0, 16, 6]),
    east: f(side, [16, 0, 0, 6]),
  };
  if (head) faces.north = f(end, [0, 0, 16, 6]);
  else faces.south = f(end, [0, 0, 16, 6]);
  els.push({ from: [0, 3, 0], to: [16, 9, 16], faces });
  const legAt = (x: number, z: number) =>
    els.push({ from: [x, 0, z], to: [x + 3, 3, z + 3], faces: { down: f(leg, [0, 0, 3, 3], 'down'), north: f(leg, [0, 0, 3, 3]), south: f(leg, [0, 0, 3, 3]), west: f(leg, [0, 0, 3, 3]), east: f(leg, [0, 0, 3, 3]) } });
  if (head) {
    legAt(0, 0);
    legAt(13, 0);
  } else {
    legAt(0, 13);
    legAt(13, 13);
  }
  return { particle: `${c}_wool`, elements: els };
}

/** vanilla bed shape per part (legs at the part's outer end) */
function bedBoxes(s: StateView): Box[] {
  const facing = s.get('facing') as string;
  const head = s.get('part') === 'head';
  // the outer end of this part points toward `facing` for the head, away from it for the foot
  const dir = head ? facing : ({ north: 'south', south: 'north', east: 'west', west: 'east' } as Record<string, string>)[facing];
  const base = bx(0, 3, 0, 16, 9, 16);
  const legs: Record<string, Box[]> = {
    north: [bx(0, 0, 0, 3, 3, 3), bx(13, 0, 0, 16, 3, 3)],
    south: [bx(0, 0, 13, 3, 3, 16), bx(13, 0, 13, 16, 3, 16)],
    west: [bx(0, 0, 0, 3, 3, 3), bx(0, 0, 13, 3, 3, 16)],
    east: [bx(13, 0, 0, 16, 3, 3), bx(13, 0, 13, 16, 3, 16)],
  };
  return [base, ...legs[dir]];
}

function registerBed(c: string): void {
  const head = bedModel(c, true), foot = bedModel(c, false);
  registerBlock(`${c}_bed`, {
    props: [P.facingH, P.part, P.occupied], defaults: { part: 'foot', facing: 'north' },
    hardness: 0.2, sound: 'wood', opaque: false, aoCaster: false, opacity: 0,
    collision: (s) => bedBoxes(s),
    model: (s) => ({ model: s.get('part') === 'head' ? head : foot, y: HOR_ROT[s.get('facing') as string] }),
    flammable: true,
  });
}

// ---------------------------------------------------------------------------

function cropModel(tex: string): ModelDef {
  const face = (): FaceDef => ({ tex, uv: [0, 0, 16, 16] });
  return {
    ao: false,
    particle: tex,
    elements: [
      { from: [4, -1, 0], to: [4, 15, 16], shade: false, faces: { west: face(), east: face() } },
      { from: [12, -1, 0], to: [12, 15, 16], shade: false, faces: { west: face(), east: face() } },
      { from: [0, -1, 4], to: [16, 15, 4], shade: false, faces: { north: face(), south: face() } },
      { from: [0, -1, 12], to: [16, 15, 12], shade: false, faces: { north: face(), south: face() } },
    ],
  };
}

/** vanilla template stem_growth<N>: crossed planes whose height grows with age */
function stemModel(tex: string, age: number): ModelDef {
  const h = age * 2 + 2;
  // the stem texture is drawn full height; young stages show its bottom rows
  const face = (): FaceDef => ({ tex, uv: [0, 16 - h, 16, 16], tint: 0 });
  return {
    ao: false,
    particle: tex,
    elements: [
      { from: [0, -1, 8], to: [16, h - 1, 8], rot: { origin: [8, 8, 8], axis: 'y', angle: 45, rescale: true }, shade: false, faces: { north: face(), south: face() } },
      { from: [8, -1, 0], to: [8, h - 1, 16], rot: { origin: [8, 8, 8], axis: 'y', angle: 45, rescale: true }, shade: false, faces: { west: face(), east: face() } },
    ],
  };
}

/** vanilla stem_fruit: a single plane bent toward the fruit (east by default in our texture) */
function attachedStemModel(tex: string): ModelDef {
  return {
    ao: false,
    particle: tex,
    elements: [{ from: [0, 0, 8], to: [16, 16, 8], shade: false, faces: { north: { tex, uv: [16, 0, 0, 16], tint: 0 }, south: { tex, uv: [0, 0, 16, 16], tint: 0 } } }],
  };
}

// ---------------------------------------------------------------------------
// Fire (vanilla template_fire_floor)

function fireFloor(tex: string): ModelDef {
  const face = (): FaceDef => ({ tex, uv: [0, 0, 16, 16] });
  return {
    ao: false,
    particle: tex,
    elements: [
      { from: [0, 0, 8.8], to: [16, 22.4, 8.8], rot: { origin: [8, 8, 8], axis: 'x', angle: -22.5, rescale: true }, shade: false, faces: { south: face() } },
      { from: [0, 0, 7.2], to: [16, 22.4, 7.2], rot: { origin: [8, 8, 8], axis: 'x', angle: 22.5, rescale: true }, shade: false, faces: { north: face() } },
      { from: [8.8, 0, 0], to: [8.8, 22.4, 16], rot: { origin: [8, 8, 8], axis: 'z', angle: -22.5, rescale: true }, shade: false, faces: { west: face() } },
      { from: [7.2, 0, 0], to: [7.2, 22.4, 16], rot: { origin: [8, 8, 8], axis: 'z', angle: 22.5, rescale: true }, shade: false, faces: { east: face() } },
    ],
  };
}

/** vanilla template_fire_side / template_fire_side_alt: a sheet just inside the north edge */
function fireSide(tex: string, alt: boolean): ModelDef {
  const uv: [number, number, number, number] = alt ? [16, 0, 0, 16] : [0, 0, 16, 16];
  return {
    ao: false,
    particle: tex,
    elements: [{ from: [0, 0, 0.01], to: [16, 22.4, 0.01], shade: false, faces: { south: { tex, uv }, north: { tex, uv } } }],
  };
}

/** vanilla template_fire_up / template_fire_up_alt: sheets hanging from the block above */
function fireUp(tex: string, alt: boolean): ModelDef {
  const face = (rot?: 0 | 90 | 180 | 270): FaceDef => ({ tex, uv: [0, 0, 16, 16], rot });
  const el = (origin: [number, number, number], axis: 'x' | 'z', angle: number, rot?: 0 | 90 | 180 | 270): ElementDef => ({
    from: [0, 16, 0], to: [16, 16, 16], rot: { origin, axis, angle, rescale: true }, shade: false, faces: { down: face(rot) },
  });
  return {
    ao: false,
    particle: tex,
    elements: alt
      ? [el([8, 16, 16], 'x', -22.5, 180), el([8, 16, 0], 'x', 22.5)]
      : [el([16, 16, 8], 'z', 22.5, 270), el([0, 16, 8], 'z', -22.5, 90)],
  };
}

// ---------------------------------------------------------------------------
// Walls (vanilla template_wall_post / wall_side / wall_side_tall)

const wallSideProp = (n: string) => enumProp(n, ['none', 'low', 'tall']);

function registerWall(name: string, tex: string, hardness: number, sound = 'stone'): void {
  const t = tex;
  const post: ModelDef = { particle: t, elements: [box([4, 0, 4], [12, 16, 12], t)] };
  const side: ModelDef = { particle: t, elements: [{ from: [5, 0, 0], to: [11, 14, 8], faces: { down: f(t, undefined, 'down'), up: f(t), north: f(t, undefined, 'north'), west: f(t), east: f(t) } }] };
  const tall: ModelDef = { particle: t, elements: [{ from: [5, 0, 0], to: [11, 16, 8], faces: { down: f(t, undefined, 'down'), up: f(t, undefined, 'up'), north: f(t, undefined, 'north'), west: f(t), east: f(t) } }] };
  registerBlock(name, {
    props: [boolProp('up'), wallSideProp('north'), wallSideProp('east'), wallSideProp('south'), wallSideProp('west'), P.waterlogged],
    defaults: { up: true, east: 'low', west: 'low' },
    hardness, resistance: 6, sound, tool: 'pickaxe', requiresTool: true, opaque: false, aoCaster: false, opacity: 0,
    collision: (s) => wallBoxes(s, 24),
    outline: (s) => wallBoxes(s, 16),
    model: (s) => {
      const parts: Variant[] = [];
      if (s.get('up')) parts.push({ model: post });
      const add = (dir: string, y: number) => {
        const v = s.get(dir);
        if (v === 'low') parts.push({ model: side, y, uvlock: true });
        else if (v === 'tall') parts.push({ model: tall, y, uvlock: true });
      };
      add('north', 0);
      add('east', 90);
      add('south', 180);
      add('west', 270);
      return { parts };
    },
  });
}

function wallBoxes(s: StateView, h: number): Box[] {
  const out: Box[] = [];
  if (s.get('up')) out.push(bx(4, 0, 4, 12, h, 12));
  const sh = (v: string) => (h === 24 ? 24 : v === 'tall' ? 16 : 14);
  const n = s.get('north') as string, e = s.get('east') as string, so = s.get('south') as string, w = s.get('west') as string;
  if (n !== 'none') out.push(bx(5, 0, 0, 11, sh(n), 11));
  if (so !== 'none') out.push(bx(5, 0, 5, 11, sh(so), 16));
  if (w !== 'none') out.push(bx(0, 0, 5, 11, sh(w), 11));
  if (e !== 'none') out.push(bx(5, 0, 5, 16, sh(e), 11));
  if (!out.length) out.push(bx(4, 0, 4, 12, h, 12));
  return out;
}

// ---------------------------------------------------------------------------

export function registerExtraBlocks(): void {
  // doors & trapdoors
  for (const w of WOODS) registerDoor(`${w}_door`, `${w}_door`, 3, w === 'cherry' ? 'cherry_wood' : 'wood', 'axe');
  for (const w of ['crimson', 'warped']) registerDoor(`${w}_door`, `${w}_door`, 3, 'nether_wood', 'axe');
  registerDoor('iron_door', 'iron_door', 5, 'metal', 'pickaxe');
  for (const w of WOODS) registerTrapdoor(`${w}_trapdoor`, `${w}_trapdoor`, 3, w === 'cherry' ? 'cherry_wood' : 'wood', 'axe');
  for (const w of ['crimson', 'warped']) registerTrapdoor(`${w}_trapdoor`, `${w}_trapdoor`, 3, 'nether_wood', 'axe');
  registerTrapdoor('iron_trapdoor', 'iron_trapdoor', 5, 'metal', 'pickaxe');
  // fences & gates
  for (const w of WOODS) {
    registerFence(`${w}_fence`, `${w}_planks`, 2, w === 'cherry' ? 'cherry_wood' : 'wood', 'axe');
    registerFenceGate(`${w}_fence_gate`, `${w}_planks`);
  }
  for (const w of ['crimson', 'warped']) {
    registerFence(`${w}_fence`, `${w}_planks`, 2, 'nether_wood', 'axe');
    registerFenceGate(`${w}_fence_gate`, `${w}_planks`);
  }
  // (vanilla: it joins only its own kind, never the wooden fences)
  registerFence('nether_brick_fence', 'nether_bricks', 2, 'nether_bricks', 'pickaxe');
  // panes and bars
  registerPane('glass_pane', 'glass', 'glass_pane_top', { sound: 'glass', hardness: 0.3, layer: Layer.CUTOUT, noDrop: true });
  registerPane('iron_bars', 'iron_bars', 'iron_bars', { sound: 'metal', hardness: 5, layer: Layer.CUTOUT, tool: 'pickaxe' });
  for (const c of DYES) {
    registerBlock(`${c}_stained_glass`, {
      hardness: 0.3, sound: 'glass', layer: Layer.TRANSLUCENT, opaque: false, cullSame: true, aoCaster: false, viewBlocking: false, opacity: 0,
      model: () => ({ model: cubeAll(`${c}_stained_glass`) }), noDrop: true,
    });
    registerPane(`${c}_stained_glass_pane`, `${c}_stained_glass`, `${c}_stained_glass_pane_top`, { sound: 'glass', hardness: 0.3, layer: Layer.TRANSLUCENT, noDrop: true });
  }
  // beds & carpets
  for (const c of DYES) registerBed(c);
  for (const c of DYES) {
    const m: ModelDef = { particle: `${c}_wool`, elements: [box([0, 0, 0], [16, 1, 16], `${c}_wool`)] };
    registerBlock(`${c}_carpet`, {
      hardness: 0.1, sound: 'wool', opaque: false, aoCaster: false, opacity: 0, collision: [bx(0, 0, 0, 16, 1, 16)], model: () => ({ model: m }), flammable: true,
    });
  }
  // fire (vanilla blockstates/fire.json multipart)
  {
    const floor = [fireFloor('fire_0'), fireFloor('fire_1')];
    const side = [fireSide('fire_0', false), fireSide('fire_1', false), fireSide('fire_0', true), fireSide('fire_1', true)];
    const up = [fireUp('fire_0', false), fireUp('fire_1', false), fireUp('fire_0', true), fireUp('fire_1', true)];
    registerBlock('fire', {
      props: [P.age15, P.north, P.east, P.south, P.west, P.up], hardness: 0, sound: 'wool', collision: 'none', layer: Layer.CUTOUT, opaque: false,
      aoCaster: false, opacity: 0, light: 15, replaceable: true, item: false, noDrop: true, randomTicks: true,
      outline: (s) => {
        const bs: Box[] = [];
        if (s.get('up')) bs.push(bx(0, 15, 0, 16, 16, 16));
        if (s.get('north')) bs.push(bx(0, 0, 0, 16, 16, 1));
        if (s.get('south')) bs.push(bx(0, 0, 15, 16, 16, 16));
        if (s.get('west')) bs.push(bx(0, 0, 0, 1, 16, 16));
        if (s.get('east')) bs.push(bx(15, 0, 0, 16, 16, 16));
        return bs.length ? bs : [bx(0, 0, 0, 16, 1, 16)];
      },
      model: (s) => {
        const n = s.get('north'), e = s.get('east'), so = s.get('south'), w = s.get('west'), u = s.get('up');
        const none = !n && !e && !so && !w && !u;
        const parts: (Variant | Variant[])[] = [];
        const sides = (y: number): Variant[] => side.map((model) => ({ model, y }));
        if (none) parts.push(floor.map((model) => ({ model })));
        if (n || none) parts.push(sides(0));
        if (e || none) parts.push(sides(90));
        if (so || none) parts.push(sides(180));
        if (w || none) parts.push(sides(270));
        if (u) parts.push(up.map((model) => ({ model })));
        return { parts };
      },
    });
  }
  // vanilla SoulFireBlock (blockstates/soul_fire.json): no age and no sides to choose, always the floor and all four
  // sides; burns only on soul sand and soul soil, and never spreads
  {
    const floor = [fireFloor('soul_fire_0'), fireFloor('soul_fire_1')];
    const side = [fireSide('soul_fire_0', false), fireSide('soul_fire_1', false), fireSide('soul_fire_0', true), fireSide('soul_fire_1', true)];
    const parts: (Variant | Variant[])[] = [floor.map((model) => ({ model })), ...[0, 90, 180, 270].map((y) => side.map((model) => ({ model, y })))];
    registerBlock('soul_fire', {
      hardness: 0, sound: 'wool', collision: 'none', layer: Layer.CUTOUT, opaque: false, aoCaster: false, opacity: 0, light: 10, replaceable: true,
      item: false, noDrop: true, outline: [bx(0, 0, 0, 16, 1, 16)], model: () => ({ parts }),
    });
  }
  // vanilla NetherWartBlock: on soul sand, four ages drawn as three looks (crop model)
  {
    const models = [0, 1, 2].map((i) => cropModel(`nether_wart_stage${i}`));
    const heights = [5, 8, 11, 14];
    registerBlock('nether_wart', {
      props: [P.age3], hardness: 0, sound: 'nether_wart', collision: 'none', layer: Layer.CUTOUT, opaque: false, randomTicks: true,
      aoCaster: false, opacity: 0, item: false,
      outline: (s) => [bx(0, 0, 0, 16, heights[s.get('age') as number], 16)],
      model: (s) => ({ model: models[[0, 1, 1, 2][s.get('age') as number]] }),
    });
  }
  // crops
  for (const [name, tex, maxAge, stages] of [
    ['carrots', 'carrots', 7, [0, 0, 1, 1, 2, 2, 2, 3]],
    ['potatoes', 'potatoes', 7, [0, 0, 1, 1, 2, 2, 2, 3]],
    ['beetroots', 'beetroots', 3, [0, 1, 2, 3]],
  ] as [string, string, number, number[]][]) {
    const models = [0, 1, 2, 3].map((i) => cropModel(`${tex}_stage${i}`));
    const heights = maxAge === 3 ? [2, 4, 6, 8] : [2, 3, 4, 5, 6, 7, 8, 9];
    registerBlock(name, {
      props: [maxAge === 3 ? P.age3 : P.age7], hardness: 0, sound: 'crop', collision: 'none', layer: Layer.CUTOUT, opaque: false, randomTicks: true,
      aoCaster: false, opacity: 0, item: false,
      outline: (s) => [bx(0, 0, 0, 16, heights[s.get('age') as number], 16)],
      model: (s) => ({ model: models[stages[s.get('age') as number]] }),
    });
  }
  for (const fruit of ['pumpkin', 'melon']) {
    const ms = [0, 1, 2, 3, 4, 5, 6, 7].map((a) => stemModel(`${fruit}_stem`, a));
    registerBlock(`${fruit}_stem`, {
      props: [P.age7], hardness: 0, sound: 'stem', collision: 'none', layer: Layer.CUTOUT, opaque: false, randomTicks: true, tint: 'stem',
      aoCaster: false, opacity: 0, item: false,
      outline: (s) => [bx(7, 0, 7, 9, 2 + (s.get('age') as number) * 2, 9)],
      model: (s) => ({ model: ms[s.get('age') as number] }),
    });
    const am = attachedStemModel(`attached_${fruit}_stem`);
    const ATT_Y: Record<string, number> = { east: 0, south: 90, west: 180, north: 270 };
    registerBlock(`attached_${fruit}_stem`, {
      props: [P.facingH], hardness: 0, sound: 'stem', collision: 'none', layer: Layer.CUTOUT, opaque: false, tint: 'constant', tintColor: 0xe0c71c,
      aoCaster: false, opacity: 0, item: false, outline: [bx(6, 0, 6, 10, 10, 10)],
      model: (s) => ({ model: am, y: ATT_Y[s.get('facing') as string] }),
    });
  }
  // walls
  for (const [name, tex, h] of [
    ['cobblestone_wall', 'cobblestone', 2], ['mossy_cobblestone_wall', 'mossy_cobblestone', 2], ['stone_brick_wall', 'stone_bricks', 1.5],
    ['mossy_stone_brick_wall', 'mossy_stone_bricks', 1.5], ['brick_wall', 'bricks', 2], ['granite_wall', 'granite', 1.5], ['diorite_wall', 'diorite', 1.5],
    ['andesite_wall', 'andesite', 1.5], ['sandstone_wall', 'sandstone', 0.8], ['red_sandstone_wall', 'red_sandstone', 0.8],
    ['cobbled_deepslate_wall', 'cobbled_deepslate', 3.5], ['polished_deepslate_wall', 'polished_deepslate', 3.5], ['deepslate_brick_wall', 'deepslate_bricks', 3.5],
    ['deepslate_tile_wall', 'deepslate_tiles', 3.5],
  ] as [string, string, number][]) registerWall(name, tex, h);
  registerWall('nether_brick_wall', 'nether_bricks', 2, 'nether_bricks');
  registerWall('red_nether_brick_wall', 'red_nether_bricks', 2, 'nether_bricks');
  registerWall('blackstone_wall', 'blackstone', 1.5);
  registerWall('polished_blackstone_wall', 'polished_blackstone', 2);
  registerWall('polished_blackstone_brick_wall', 'polished_blackstone_bricks', 1.5);
  // lantern & chain
  for (const [L, light] of [['lantern', 15], ['soul_lantern', 10]] as [string, number][]) {
    const lantern = (hanging: boolean): ModelDef => {
      const o = hanging ? 1 : 0;
      const els: ElementDef[] = [
        { from: [5, o, 5], to: [11, 7 + o, 11], faces: { down: f(L, [0, 9, 6, 15], hanging ? undefined : 'down'), up: f(L, [0, 9, 6, 15]), north: f(L, [0, 2, 6, 9]), south: f(L, [0, 2, 6, 9]), west: f(L, [0, 2, 6, 9]), east: f(L, [0, 2, 6, 9]) } },
        { from: [6, 7 + o, 6], to: [10, 9 + o, 10], faces: { up: f(L, [1, 10, 5, 14]), north: f(L, [1, 0, 5, 2]), south: f(L, [1, 0, 5, 2]), west: f(L, [1, 0, 5, 2]), east: f(L, [1, 0, 5, 2]) } },
      ];
      if (hanging) {
        els.push({ from: [6.5, 9 + o, 8], to: [9.5, 16, 8], rot: { origin: [8, 8, 8], axis: 'y', angle: 45 }, shade: false, faces: { north: f(L, [14, 1, 11, 7]), south: f(L, [11, 1, 14, 7]) } });
        els.push({ from: [8, 9 + o, 6.5], to: [8, 16, 9.5], rot: { origin: [8, 8, 8], axis: 'y', angle: 45 }, shade: false, faces: { west: f(L, [14, 6, 11, 10]), east: f(L, [11, 6, 14, 10]) } });
      } else {
        els.push({ from: [6.5, 9, 8], to: [9.5, 11, 8], rot: { origin: [8, 8, 8], axis: 'y', angle: 45 }, shade: false, faces: { north: f(L, [14, 1, 11, 3]), south: f(L, [11, 1, 14, 3]) } });
        els.push({ from: [8, 9, 6.5], to: [8, 11, 9.5], rot: { origin: [8, 8, 8], axis: 'y', angle: 45 }, shade: false, faces: { west: f(L, [14, 10, 11, 12]), east: f(L, [11, 10, 14, 12]) } });
      }
      return { ao: false, particle: L, elements: els };
    };
    const standing = lantern(false), hanging = lantern(true);
    registerBlock(L, {
      props: [boolProp('hanging'), P.waterlogged], hardness: 3.5, sound: 'lantern', tool: 'pickaxe', requiresTool: true, layer: Layer.CUTOUT, opaque: false,
      aoCaster: false, opacity: 0, light,
      collision: (s) => (s.get('hanging') ? [bx(5, 1, 5, 11, 8, 11), bx(6, 8, 6, 10, 10, 10)] : [bx(5, 0, 5, 11, 7, 11), bx(6, 7, 6, 10, 9, 10)]),
      model: (s) => ({ model: s.get('hanging') ? hanging : standing }),
    });
  }
  {
    const C = 'chain';
    const chain: ModelDef = {
      ao: false,
      particle: C,
      elements: [
        { from: [6.5, 0, 8], to: [9.5, 16, 8], rot: { origin: [8, 8, 8], axis: 'y', angle: 45 }, shade: false, faces: { north: f(C, [0, 0, 3, 16]), south: f(C, [0, 0, 3, 16]) } },
        { from: [8, 0, 6.5], to: [8, 16, 9.5], rot: { origin: [8, 8, 8], axis: 'y', angle: 45 }, shade: false, faces: { west: f(C, [3, 0, 6, 16]), east: f(C, [3, 0, 6, 16]) } },
      ],
    };
    registerBlock('chain', {
      props: [P.axis, P.waterlogged], defaults: { axis: 'y' }, hardness: 5, resistance: 6, sound: 'chain', tool: 'pickaxe', requiresTool: true, layer: Layer.CUTOUT,
      opaque: false, aoCaster: false, opacity: 0,
      collision: (s) => {
        const a = s.get('axis');
        return a === 'y' ? [bx(6.5, 0, 6.5, 9.5, 16, 9.5)] : a === 'x' ? [bx(0, 6.5, 6.5, 16, 9.5, 9.5)] : [bx(6.5, 6.5, 0, 9.5, 9.5, 16)];
      },
      model: (s) => {
        const a = s.get('axis');
        return a === 'y' ? { model: chain } : a === 'x' ? { model: chain, x: 90, y: 90 } : { model: chain, x: 90 };
      },
    });
  }
  // -------------------------------------------------------------------------
  // Rails (vanilla RailBlock; template_rail_flat / template_rail_raised_ne / _sw)
  {
    const flat = (tex: string): ModelDef => ({
      ao: false, particle: tex,
      elements: [{ from: [0, 1, 0], to: [16, 1, 16], faces: { down: f(tex, [0, 16, 16, 0]), up: f(tex, [0, 0, 16, 16]) } }],
    });
    const raised = (tex: string, angle: number): ModelDef => ({
      ao: false, particle: tex,
      elements: [{
        from: [0, 9, 0], to: [16, 9, 16], rot: { origin: [8, 9, 8], axis: 'x', angle, rescale: true },
        faces: { down: f(tex, [0, 16, 16, 0]), up: f(tex, [0, 0, 16, 16]) },
      }],
    });
    const straight = flat('rail'), corner = flat('rail_corner'), ne = raised('rail', 45), sw = raised('rail', -45);
    const MODELS: Record<string, ModelChoice> = {
      north_south: { model: straight }, east_west: { model: straight, y: 90 },
      ascending_north: { model: ne }, ascending_east: { model: ne, y: 90 }, ascending_south: { model: sw }, ascending_west: { model: sw, y: 90 },
      south_east: { model: corner }, south_west: { model: corner, y: 90 }, north_west: { model: corner, y: 180 }, north_east: { model: corner, y: 270 },
    };
    registerBlock('rail', {
      props: [enumProp('shape', RAIL_SHAPES), P.waterlogged], defaults: { shape: 'north_south' },
      hardness: 0.7, sound: 'metal', tool: 'pickaxe', collision: 'none', layer: Layer.CUTOUT, opaque: false, aoCaster: false, opacity: 0,
      outline: (s) => [String(s.get('shape')).startsWith('ascending') ? bx(0, 0, 0, 16, 8, 16) : bx(0, 0, 0, 16, 2, 16)],
      model: (s) => MODELS[s.get('shape') as string],
    });
  }
  // -------------------------------------------------------------------------
  // Glow lichen (vanilla GlowLichenBlock / MultifaceBlock: one plane per attached face, 0.1 px out)
  {
    const e = 0.1;
    const PLANES: Record<string, ElementDef> = {
      down: { from: [0, e, 0], to: [16, e, 16], shade: false, faces: { up: f('glow_lichen', [0, 0, 16, 16]), down: f('glow_lichen', [0, 16, 16, 0]) } },
      up: { from: [0, 16 - e, 0], to: [16, 16 - e, 16], shade: false, faces: { up: f('glow_lichen', [0, 0, 16, 16]), down: f('glow_lichen', [0, 16, 16, 0]) } },
      north: { from: [0, 0, e], to: [16, 16, e], shade: false, faces: { north: f('glow_lichen', [16, 0, 0, 16]), south: f('glow_lichen', [0, 0, 16, 16]) } },
      south: { from: [0, 0, 16 - e], to: [16, 16, 16 - e], shade: false, faces: { north: f('glow_lichen', [16, 0, 0, 16]), south: f('glow_lichen', [0, 0, 16, 16]) } },
      west: { from: [e, 0, 0], to: [e, 16, 16], shade: false, faces: { west: f('glow_lichen', [0, 0, 16, 16]), east: f('glow_lichen', [16, 0, 0, 16]) } },
      east: { from: [16 - e, 0, 0], to: [16 - e, 16, 16], shade: false, faces: { west: f('glow_lichen', [16, 0, 0, 16]), east: f('glow_lichen', [0, 0, 16, 16]) } },
    };
    const OUT: Record<string, Box> = {
      down: bx(0, 0, 0, 16, 1, 16), up: bx(0, 15, 0, 16, 16, 16), north: bx(0, 0, 0, 16, 16, 1),
      south: bx(0, 0, 15, 16, 16, 16), west: bx(0, 0, 0, 1, 16, 16), east: bx(15, 0, 0, 16, 16, 16),
    };
    const FACES = ['down', 'up', 'north', 'south', 'west', 'east'];
    registerBlock('glow_lichen', {
      props: [boolProp('down'), P.up, P.north, P.south, P.west, P.east, P.waterlogged],
      hardness: 0.2, sound: 'vine', tool: 'axe', collision: 'none', layer: Layer.CUTOUT, opaque: false, aoCaster: false, opacity: 0, replaceable: true, light: 7,
      outline: (s) => {
        const out = FACES.filter((d) => s.get(d)).map((d) => OUT[d]);
        return out.length ? out : 'full';
      },
      model: (s) => ({ model: { ao: false, particle: 'glow_lichen', elements: FACES.filter((d) => s.get(d)).map((d) => PLANES[d]) } }),
    });
  }
  // -------------------------------------------------------------------------
  // Amethyst geodes (vanilla AmethystBlock, BuddingAmethystBlock, AmethystClusterBlock)
  {
    registerBlock('amethyst_block', { hardness: 1.5, resistance: 1.5, sound: 'amethyst_block', tool: 'pickaxe', requiresTool: true, model: () => ({ model: cubeAll('amethyst_block') }) });
    registerBlock('budding_amethyst', {
      hardness: 1.5, resistance: 1.5, sound: 'amethyst_block', tool: 'pickaxe', requiresTool: true, randomTicks: true, noDrop: true,
      model: () => ({ model: cubeAll('budding_amethyst') }),
    });
    // vanilla blockstates: the cross model turned to point away from the block it grows on
    const TURN: Record<string, { x?: number; y?: number }> = {
      up: {}, down: { x: 180 }, north: { x: 90 }, south: { x: 90, y: 180 }, east: { x: 90, y: 90 }, west: { x: 90, y: 270 },
    };
    const shape = (facing: string, h: number, o: number): Box => {
      switch (facing) {
        case 'down': return bx(o, 16 - h, o, 16 - o, 16, 16 - o);
        case 'north': return bx(o, o, 16 - h, 16 - o, 16 - o, 16);
        case 'south': return bx(o, o, 0, 16 - o, 16 - o, h);
        case 'east': return bx(0, o, o, h, 16 - o, 16 - o);
        case 'west': return bx(16 - h, o, o, 16, 16 - o, 16 - o);
        default: return bx(o, 0, o, 16 - o, h, 16 - o);
      }
    };
    // [name, height, inset, light]
    const BUDS: [string, number, number, number][] = [
      ['small_amethyst_bud', 3, 4, 1], ['medium_amethyst_bud', 4, 3, 2], ['large_amethyst_bud', 5, 3, 4], ['amethyst_cluster', 7, 3, 5],
    ];
    for (const [name, h, o, light] of BUDS) {
      const m = cross(name);
      registerBlock(name, {
        props: [P.facing, P.waterlogged], defaults: { facing: 'up' }, hardness: 1.5, sound: name, tool: 'pickaxe', light,
        layer: Layer.CUTOUT, opaque: false, aoCaster: false, opacity: 0,
        collision: (s) => [shape(s.get('facing') as string, h, o)],
        model: (s) => ({ model: m, ...TURN[s.get('facing') as string] }),
      });
    }
    // vanilla PointedDripstoneBlock: a cross model per thickness, shapes narrowing towards the tip
    const DRIP_SHAPES: Record<string, (up: boolean) => Box> = {
      tip_merge: () => bx(5, 0, 5, 11, 16, 11),
      tip: (up) => (up ? bx(5, 0, 5, 11, 11, 11) : bx(5, 5, 5, 11, 16, 11)),
      frustum: () => bx(4, 0, 4, 12, 16, 12),
      middle: () => bx(3, 0, 3, 13, 16, 13),
      base: () => bx(2, 0, 2, 14, 16, 14),
    };
    const dripModels: Record<string, ModelDef> = {};
    for (const th of Object.keys(DRIP_SHAPES)) for (const d of ['up', 'down']) dripModels[`${d}_${th}`] = cross(`pointed_dripstone_${d}_${th}`);
    registerBlock('pointed_dripstone', {
      props: [enumProp('vertical_direction', ['up', 'down']), enumProp('thickness', ['tip_merge', 'tip', 'frustum', 'middle', 'base']), P.waterlogged],
      defaults: { vertical_direction: 'up', thickness: 'tip' }, hardness: 1.5, resistance: 3, sound: 'pointed_dripstone', tool: 'pickaxe',
      randomTicks: true, offset: 'xz', maxOffset: 0.125, layer: Layer.CUTOUT, opaque: false, aoCaster: false, opacity: 0,
      collision: (s) => [DRIP_SHAPES[s.get('thickness') as string](s.get('vertical_direction') === 'up')],
      model: (s) => ({ model: dripModels[`${s.get('vertical_direction')}_${s.get('thickness')}`] }),
    });
    registerBlock('smooth_basalt', { hardness: 1.25, resistance: 4.2, sound: 'basalt', tool: 'pickaxe', requiresTool: true, model: () => ({ model: cubeAll('smooth_basalt') }) });
    // vanilla TintedGlassBlock: see-through but blocks all light, and drops itself
    registerBlock('tinted_glass', {
      hardness: 0.3, sound: 'glass', layer: Layer.TRANSLUCENT, opaque: false, cullSame: true, aoCaster: false, viewBlocking: false, opacity: 15,
      model: () => ({ model: cubeAll('tinted_glass') }),
    });
  }
  registerLushBlocks();
  registerNetherBlocks();
  void intProp;
}

/** a box in pixels turned about the block's centre for a horizontal facing (models are drawn facing north) */
function turnBox(b: [number, number, number, number, number, number], facing: string): Box {
  const [x0, y0, z0, x1, y1, z1] = b;
  switch (facing) {
    case 'east': return bx(16 - z1, y0, x0, 16 - z0, y1, x1);
    case 'south': return bx(16 - x1, y0, 16 - z1, 16 - x0, y1, 16 - z0);
    case 'west': return bx(z0, y0, 16 - x1, z1, y1, 16 - x0);
    default: return bx(x0, y0, z0, x1, y1, z1);
  }
}

/** two planes crossed at 45° round a vertical line (vanilla dripleaf stems stand at the leaf's back) */
function crossAt(tex: string, cx: number, cz: number, w: number, y0: number, y1: number, uv: [number, number, number, number]): ElementDef[] {
  const o: [number, number, number] = [cx, 8, cz];
  return [45, -45].map((angle) => ({
    from: [cx - w / 2, y0, cz] as [number, number, number],
    to: [cx + w / 2, y1, cz] as [number, number, number],
    rot: { origin: o, axis: 'y' as const, angle },
    shade: false,
    faces: { north: f(tex, uv), south: f(tex, uv) },
  }));
}

// ---------------------------------------------------------------------------
// Lush caves (vanilla CarpetBlock for moss carpet, AzaleaBlock, LeavesBlock,
// HangingRootsBlock, SporeBlossomBlock, CaveVinesBlock / CaveVinesPlantBlock,
// BigDripleafBlock / BigDripleafStemBlock and SmallDripleafBlock)

function registerLushBlocks(): void {
  {
    const m: ModelDef = { particle: 'moss_block', elements: [box([0, 0, 0], [16, 1, 16], 'moss_block')] };
    registerBlock('moss_carpet', {
      hardness: 0.1, sound: 'moss_carpet', tool: 'hoe', opaque: false, aoCaster: false, opacity: 0, collision: [bx(0, 0, 0, 16, 1, 16)], model: () => ({ model: m }),
    });
  }
  // vanilla template_azalea: a leafy top and sides round the woody plant in the middle
  for (const fl of ['', 'flowering_']) {
    const top = `${fl}azalea_top`, side = `${fl}azalea_side`;
    const m: ModelDef = {
      ao: false,
      particle: side,
      elements: [
        { from: [0, 16, 0], to: [16, 16, 16], faces: { up: f(top, [0, 0, 16, 16], 'up'), down: f(top, [0, 16, 16, 0]) } },
        { from: [0, 0, 0], to: [16, 16, 0], faces: { north: f(side, [0, 0, 16, 16], 'north'), south: f(side, [16, 0, 0, 16]) } },
        { from: [0, 0, 16], to: [16, 16, 16], faces: { south: f(side, [0, 0, 16, 16], 'south'), north: f(side, [16, 0, 0, 16]) } },
        { from: [0, 0, 0], to: [0, 16, 16], faces: { west: f(side, [0, 0, 16, 16], 'west'), east: f(side, [16, 0, 0, 16]) } },
        { from: [16, 0, 0], to: [16, 16, 16], faces: { east: f(side, [0, 0, 16, 16], 'east'), west: f(side, [16, 0, 0, 16]) } },
        ...cross('azalea_plant').elements,
      ],
    };
    const shape = [bx(0, 8, 0, 16, 16, 16), bx(6, 0, 6, 10, 8, 10)];
    registerBlock(`${fl}azalea`, {
      hardness: 0, sound: `${fl}azalea`, layer: Layer.CUTOUT, opaque: false, aoCaster: false, opacity: 0, collision: shape, model: () => ({ model: m }),
    });
  }
  {
    const m = cubeAll('flowering_azalea_leaves');
    registerBlock('flowering_azalea_leaves', {
      props: [P.distance, P.persistent, P.waterlogged], defaults: { distance: 7 }, hardness: 0.2, sound: 'azalea_leaves', tool: 'hoe',
      layer: Layer.CUTOUT_MIPPED, opaque: false, isLeaves: true, viewBlocking: false, randomTicks: true, model: () => ({ model: m }),
    });
  }
  {
    const m = cross('hanging_roots');
    registerBlock('hanging_roots', {
      props: [P.waterlogged], hardness: 0, sound: 'hanging_roots', collision: 'none', outline: [bx(2, 10, 2, 14, 16, 14)], layer: Layer.CUTOUT, opaque: false,
      aoCaster: false, opacity: 0, replaceable: true, offset: 'xz', model: () => ({ model: m }),
    });
  }
  // vanilla spore_blossom: the leafy base on the ceiling, four big petals drooping out from its middle
  {
    const petal = (from: [number, number, number], to: [number, number, number], axis: 'x' | 'z', angle: number, rot: 0 | 90 | 180 | 270): ElementDef => ({
      from, to, rot: { origin: [8, 15.7, 8], axis, angle }, shade: false,
      faces: { down: f('spore_blossom', [0, 0, 16, 16], undefined, { rot }), up: f('spore_blossom', [0, 0, 16, 16], undefined, { rot }) },
    });
    const m: ModelDef = {
      ao: false,
      particle: 'spore_blossom',
      elements: [
        { from: [1, 15.9, 1], to: [15, 15.9, 15], shade: false, faces: { down: f('spore_blossom_base', [1, 1, 15, 15]), up: f('spore_blossom_base', [1, 1, 15, 15]) } },
        petal([8, 15.7, 0], [24, 15.7, 16], 'z', -22.5, 270),
        petal([-8, 15.7, 0], [8, 15.7, 16], 'z', 22.5, 90),
        petal([0, 15.7, 8], [16, 15.7, 24], 'x', 22.5, 0),
        petal([0, 15.7, -8], [16, 15.7, 8], 'x', -22.5, 180),
      ],
    };
    registerBlock('spore_blossom', {
      hardness: 0, sound: 'spore_blossom', collision: 'none', outline: [bx(2, 13, 2, 14, 16, 14)], layer: Layer.CUTOUT, opaque: false, aoCaster: false,
      opacity: 0, model: () => ({ model: m }),
    });
  }
  // vanilla CaveVines: glow berries light the vine up (level 14)
  {
    const berries = boolProp('berries');
    const models: Record<string, ModelDef> = {};
    for (const t of ['cave_vines', 'cave_vines_lit', 'cave_vines_plant', 'cave_vines_plant_lit']) models[t] = cross(t);
    const common = {
      hardness: 0, sound: 'cave_vines', collision: 'none' as const, outline: [bx(1, 0, 1, 15, 16, 15)], layer: Layer.CUTOUT, opaque: false, aoCaster: false,
      opacity: 0, climbable: true, item: false as const, light: (s: StateView) => (s.get('berries') ? 14 : 0),
    };
    registerBlock('cave_vines', {
      ...common, props: [P.age25, berries], randomTicks: true,
      model: (s) => ({ model: models[s.get('berries') ? 'cave_vines_lit' : 'cave_vines'] }),
    });
    registerBlock('cave_vines_plant', {
      ...common, props: [berries],
      model: (s) => ({ model: models[s.get('berries') ? 'cave_vines_plant_lit' : 'cave_vines_plant'] }),
    });
  }
  // vanilla big_dripleaf / big_dripleaf_partial_tilt / big_dripleaf_full_tilt: the leaf tips forward off
  // the stem at its back as something stands on it
  {
    const tilt = enumProp('tilt', ['none', 'unstable', 'partial', 'full']);
    const ANGLE: Record<string, number> = { none: 0, unstable: 0, partial: -22.5, full: -45 };
    const stem = crossAt('big_dripleaf_stem', 8, 12, 6, 0, 15, [5, 1, 11, 16]);
    const leafModel = (angle: number): ModelDef => {
      const rot = angle ? { origin: [8, 15, 12] as [number, number, number], axis: 'x' as const, angle } : undefined;
      return {
        ao: false,
        particle: 'big_dripleaf_top',
        elements: [
          { from: [0, 15, 0], to: [16, 15, 16], rot, faces: { up: f('big_dripleaf_top', [0, 0, 16, 16]), down: f('big_dripleaf_top', [0, 16, 16, 0]) } },
          { from: [0, 11, 0], to: [16, 15, 0], rot, shade: false, faces: { north: f('big_dripleaf_tip', [0, 0, 16, 4]), south: f('big_dripleaf_tip', [16, 0, 0, 4]) } },
          { from: [0, 11, 0], to: [0, 15, 16], rot, shade: false, faces: { west: f('big_dripleaf_side', [0, 0, 16, 4]), east: f('big_dripleaf_side', [16, 0, 0, 4]) } },
          { from: [16, 11, 0], to: [16, 15, 16], rot, shade: false, faces: { east: f('big_dripleaf_side', [16, 0, 0, 4]), west: f('big_dripleaf_side', [0, 0, 16, 4]) } },
          ...stem,
        ],
      };
    };
    const leaves: Record<string, ModelDef> = {};
    for (const t of tilt.values as string[]) leaves[t] = leafModel(ANGLE[t]);
    // vanilla shapes: the leaf (thinner as it tips, gone when it hangs), and the stem behind it
    const LEAF: Record<string, Box[]> = { none: [bx(0, 11, 0, 16, 15, 16)], unstable: [bx(0, 11, 0, 16, 15, 16)], partial: [bx(0, 11, 0, 16, 13, 16)], full: [] };
    registerBlock('big_dripleaf', {
      props: [P.facingH, tilt, P.waterlogged], defaults: { facing: 'north' }, hardness: 0.1, sound: 'big_dripleaf', layer: Layer.CUTOUT, opaque: false,
      aoCaster: false, opacity: 0,
      collision: (s) => {
        const l = LEAF[s.get('tilt') as string];
        return l.length ? l : 'none';
      },
      outline: (s) => [...LEAF[s.get('tilt') as string], turnBox([5, 0, 9, 11, 13, 15], s.get('facing') as string)],
      model: (s) => ({ model: leaves[s.get('tilt') as string], y: HOR_ROT[s.get('facing') as string] }),
    });
    const stemModel: ModelDef = { ao: false, particle: 'big_dripleaf_stem', elements: crossAt('big_dripleaf_stem', 8, 12, 6, 0, 16, [5, 0, 11, 16]) };
    registerBlock('big_dripleaf_stem', {
      props: [P.facingH, P.waterlogged], defaults: { facing: 'north' }, hardness: 0.1, sound: 'big_dripleaf', collision: 'none', layer: Layer.CUTOUT,
      opaque: false, aoCaster: false, opacity: 0, item: false,
      outline: (s) => [turnBox([5, 0, 9, 11, 16, 15], s.get('facing') as string)],
      model: (s) => ({ model: stemModel, y: HOR_ROT[s.get('facing') as string] }),
    });
  }
  // vanilla small_dripleaf_top / small_dripleaf_bottom: a short stem with three little leaves on top
  {
    const leaf = (from: [number, number, number], to: [number, number, number], origin: [number, number, number], axis: 'x' | 'z', angle: number, rot: 0 | 90 | 180 | 270): ElementDef => ({
      from, to, rot: { origin, axis, angle },
      faces: { up: f('small_dripleaf_top', [0, 0, 8, 8], undefined, { rot }), down: f('small_dripleaf_top', [0, 8, 8, 0], undefined, { rot }) },
    });
    const top: ModelDef = {
      ao: false,
      particle: 'small_dripleaf_top',
      elements: [
        ...cross('small_dripleaf_stem_top').elements,
        leaf([4, 13, 0.5], [12, 13, 8.5], [8, 13, 8.5], 'x', -22.5, 0),
        leaf([8, 12, 6], [16, 12, 14], [8, 12, 10], 'z', -22.5, 90),
        leaf([0, 11, 7], [8, 11, 15], [8, 11, 11], 'z', 22.5, 270),
      ],
    };
    const bottom = cross('small_dripleaf_stem_bottom');
    registerBlock('small_dripleaf', {
      props: [P.half, P.waterlogged, P.facingH], defaults: { half: 'lower', facing: 'north' }, hardness: 0, sound: 'small_dripleaf', collision: 'none',
      outline: [bx(2, 0, 2, 14, 13, 14)], layer: Layer.CUTOUT, opaque: false, aoCaster: false, opacity: 0, offset: 'xyz',
      model: (s) => ({ model: s.get('half') === 'upper' ? top : bottom, y: HOR_ROT[s.get('facing') as string] }),
    });
  }
}

/** vanilla RailShape */
export const RAIL_SHAPES = ['north_south', 'east_west', 'ascending_east', 'ascending_west', 'ascending_north', 'ascending_south', 'south_east', 'south_west', 'north_west', 'north_east'];

export { HOR_ROT };
export type { ModelChoice };
