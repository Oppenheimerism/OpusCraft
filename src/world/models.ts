// Block model format (mirrors vanilla's JSON block models) and the baker that
// turns elements into quads with atlas UVs.

import { DIR_NAMES, DirName, Dir, DOWN, UP, NORTH, SOUTH, WEST, EAST, dirFromNormal } from './dir';

export type Vec3 = [number, number, number];
export type UV4 = [number, number, number, number];

export interface FaceDef {
  tex: string;
  uv?: UV4;
  cull?: DirName;
  tint?: number;
  rot?: 0 | 90 | 180 | 270;
}

export interface ElementDef {
  from: Vec3;
  to: Vec3;
  rot?: { origin: Vec3; axis: 'x' | 'y' | 'z'; angle: number; rescale?: boolean };
  shade?: boolean;
  faces: Partial<Record<DirName, FaceDef>>;
}

export interface ModelDef {
  elements: ElementDef[];
  ao?: boolean;
  /** texture used for break particles */
  particle?: string;
}

export interface Variant {
  model: ModelDef;
  x?: number;
  y?: number;
  uvlock?: boolean;
  weight?: number;
}

export type ModelChoice = Variant | Variant[] | { parts: Variant[] };

// ---------------------------------------------------------------------------
// Model helpers (parents)

const ALL_DIRS: DirName[] = ['down', 'up', 'north', 'south', 'west', 'east'];

export function cube(t: Record<DirName, string>, opts: { tint?: Partial<Record<DirName, number>>; particle?: string } = {}): ModelDef {
  const faces: Partial<Record<DirName, FaceDef>> = {};
  for (const d of ALL_DIRS) {
    faces[d] = { tex: t[d], cull: d, tint: opts.tint?.[d] };
  }
  return { elements: [{ from: [0, 0, 0], to: [16, 16, 16], faces }], particle: opts.particle ?? t.north };
}

export function cubeAll(tex: string, tint?: number): ModelDef {
  const t = { down: tex, up: tex, north: tex, south: tex, west: tex, east: tex };
  if (tint === undefined) return cube(t);
  return cube(t, { tint: { down: tint, up: tint, north: tint, south: tint, west: tint, east: tint } });
}

export function cubeColumn(side: string, end: string): ModelDef {
  return cube({ down: end, up: end, north: side, south: side, west: side, east: side }, { particle: side });
}

export function cubeBottomTop(side: string, bottom: string, top: string): ModelDef {
  return cube({ down: bottom, up: top, north: side, south: side, west: side, east: side }, { particle: side });
}

/** Front-facing block (furnace etc.) oriented north by default. */
export function orientable(front: string, side: string, top: string, bottom = top): ModelDef {
  return cube({ down: bottom, up: top, north: front, south: side, west: side, east: side }, { particle: front });
}

export function grassLikeBlock(top: string, side: string, overlay: string, bottom: string): ModelDef {
  const base: ElementDef = {
    from: [0, 0, 0],
    to: [16, 16, 16],
    faces: {
      down: { tex: bottom, cull: 'down' },
      up: { tex: top, cull: 'up', tint: 0 },
      north: { tex: side, cull: 'north' },
      south: { tex: side, cull: 'south' },
      west: { tex: side, cull: 'west' },
      east: { tex: side, cull: 'east' },
    },
  };
  const over: ElementDef = {
    from: [0, 0, 0],
    to: [16, 16, 16],
    faces: {
      north: { tex: overlay, cull: 'north', tint: 0 },
      south: { tex: overlay, cull: 'south', tint: 0 },
      west: { tex: overlay, cull: 'west', tint: 0 },
      east: { tex: overlay, cull: 'east', tint: 0 },
    },
  };
  return { elements: [base, over], particle: bottom };
}

export function cross(tex: string, tint?: number): ModelDef {
  return {
    ao: false,
    particle: tex,
    elements: [
      {
        from: [0.8, 0, 8],
        to: [15.2, 16, 8],
        rot: { origin: [8, 8, 8], axis: 'y', angle: 45, rescale: true },
        shade: false,
        faces: { north: { tex, uv: [0, 0, 16, 16], tint }, south: { tex, uv: [0, 0, 16, 16], tint } },
      },
      {
        from: [8, 0, 0.8],
        to: [8, 16, 15.2],
        rot: { origin: [8, 8, 8], axis: 'y', angle: 45, rescale: true },
        shade: false,
        faces: { west: { tex, uv: [0, 0, 16, 16], tint }, east: { tex, uv: [0, 0, 16, 16], tint } },
      },
    ],
  };
}

/** Crop "#" shape: four planes. */
export function crop(tex: string, tint?: number): ModelDef {
  const f = (d: DirName): FaceDef => ({ tex, uv: [0, 0, 16, 16], tint });
  return {
    ao: false,
    particle: tex,
    elements: [
      { from: [4, -1, 0], to: [4, 15, 16], shade: false, faces: { west: f('west'), east: f('east') } },
      { from: [12, -1, 0], to: [12, 15, 16], shade: false, faces: { west: f('west'), east: f('east') } },
      { from: [0, -1, 4], to: [16, 15, 4], shade: false, faces: { north: f('north'), south: f('south') } },
      { from: [0, -1, 12], to: [16, 15, 12], shade: false, faces: { north: f('north'), south: f('south') } },
    ],
  };
}

/** Axis-aligned box with the given texture on every face (cullfaces set on boundary faces). */
export function box(from: Vec3, to: Vec3, t: Partial<Record<DirName, string>> | string, opts: { tint?: number; noCull?: boolean; shade?: boolean } = {}): ElementDef {
  const faces: Partial<Record<DirName, FaceDef>> = {};
  for (const d of ALL_DIRS) {
    const tex = typeof t === 'string' ? t : t[d];
    if (!tex) continue;
    let cull: DirName | undefined;
    if (!opts.noCull) {
      if (d === 'down' && from[1] === 0) cull = d;
      if (d === 'up' && to[1] === 16) cull = d;
      if (d === 'north' && from[2] === 0) cull = d;
      if (d === 'south' && to[2] === 16) cull = d;
      if (d === 'west' && from[0] === 0) cull = d;
      if (d === 'east' && to[0] === 16) cull = d;
    }
    faces[d] = { tex, cull, tint: opts.tint };
  }
  return { from, to, faces, shade: opts.shade };
}

export function slabBottom(bottom: string, top: string, side: string): ModelDef {
  return { particle: side, elements: [box([0, 0, 0], [16, 8, 16], { down: bottom, up: top, north: side, south: side, west: side, east: side })] };
}

export function slabTop(bottom: string, top: string, side: string): ModelDef {
  return { particle: side, elements: [box([0, 8, 0], [16, 16, 16], { down: bottom, up: top, north: side, south: side, west: side, east: side })] };
}

export function stairsModel(bottom: string, top: string, side: string, shape: 'straight' | 'inner' | 'outer'): ModelDef {
  const t = { down: bottom, up: top, north: side, south: side, west: side, east: side };
  const els: ElementDef[] = [box([0, 0, 0], [16, 8, 16], t)];
  if (shape === 'straight') els.push(box([8, 8, 0], [16, 16, 16], t));
  else if (shape === 'outer') els.push(box([8, 8, 8], [16, 16, 16], t));
  else {
    els.push(box([8, 8, 0], [16, 16, 16], t));
    els.push(box([0, 8, 8], [8, 16, 16], t));
  }
  return { particle: side, elements: els };
}

export function torchModel(tex: string): ModelDef {
  return {
    ao: false,
    particle: tex,
    elements: [
      { from: [7, 0, 7], to: [9, 10, 9], shade: false, faces: { down: { tex, uv: [7, 13, 9, 15] }, up: { tex, uv: [7, 6, 9, 8] } } },
      { from: [7, 0, 0], to: [9, 16, 16], shade: false, faces: { west: { tex, uv: [0, 0, 16, 16] }, east: { tex, uv: [0, 0, 16, 16] } } },
      { from: [0, 0, 7], to: [16, 16, 9], shade: false, faces: { north: { tex, uv: [0, 0, 16, 16] }, south: { tex, uv: [0, 0, 16, 16] } } },
    ],
  };
}

/** Wall torch leaning away from a wall on its west side (vanilla template_torch_wall, facing east). */
export function wallTorchModel(tex: string): ModelDef {
  const rot = { origin: [0, 3.5, 8] as Vec3, axis: 'z' as const, angle: -22.5 };
  return {
    ao: false,
    particle: tex,
    elements: [
      { from: [-1, 3.5, 7], to: [1, 13.5, 9], rot, shade: false, faces: { down: { tex, uv: [7, 13, 9, 15] }, up: { tex, uv: [7, 6, 9, 8] } } },
      { from: [-1, 3.5, 0], to: [1, 19.5, 16], rot, shade: false, faces: { west: { tex, uv: [0, 0, 16, 16] }, east: { tex, uv: [0, 0, 16, 16] } } },
      { from: [-8, 3.5, 7], to: [8, 19.5, 9], rot, shade: false, faces: { north: { tex, uv: [0, 0, 16, 16] }, south: { tex, uv: [0, 0, 16, 16] } } },
    ],
  };
}

/** Thin flat plane lying on the ground (lily pad, rail, carpet-like). */
export function flatPlane(tex: string, y: number, tint?: number): ModelDef {
  return {
    ao: false,
    particle: tex,
    elements: [
      {
        from: [0, y, 0],
        to: [16, y, 16],
        faces: {
          up: { tex, uv: [16, 16, 0, 0], tint },
          down: { tex, uv: [16, 0, 0, 16], tint },
        },
      },
    ],
  };
}

/** Vine-like plane just inside a block face. */
export function facePlane(tex: string, dir: DirName, tint?: number): ElementDef {
  const e = 0.8;
  switch (dir) {
    case 'up': return { from: [0, 16 - e, 0], to: [16, 16 - e, 16], shade: false, faces: { down: { tex, uv: [0, 0, 16, 16], tint }, up: { tex, uv: [0, 0, 16, 16], tint } } };
    case 'down': return { from: [0, e, 0], to: [16, e, 16], shade: false, faces: { down: { tex, uv: [0, 0, 16, 16], tint }, up: { tex, uv: [0, 0, 16, 16], tint } } };
    case 'north': return { from: [0, 0, e], to: [16, 16, e], shade: false, faces: { north: { tex, uv: [16, 0, 0, 16], tint }, south: { tex, uv: [0, 0, 16, 16], tint } } };
    case 'south': return { from: [0, 0, 16 - e], to: [16, 16, 16 - e], shade: false, faces: { north: { tex, uv: [16, 0, 0, 16], tint }, south: { tex, uv: [0, 0, 16, 16], tint } } };
    case 'west': return { from: [e, 0, 0], to: [e, 16, 16], shade: false, faces: { west: { tex, uv: [0, 0, 16, 16], tint }, east: { tex, uv: [16, 0, 0, 16], tint } } };
    case 'east': return { from: [16 - e, 0, 0], to: [16 - e, 16, 16], shade: false, faces: { west: { tex, uv: [16, 0, 0, 16], tint }, east: { tex, uv: [0, 0, 16, 16], tint } } };
  }
}

// ---------------------------------------------------------------------------
// Baking

export interface SpriteRect {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}

export type SpriteLookup = (name: string) => SpriteRect;

export interface BakedQuad {
  /** 4 vertices * xyz, block units (0..1 for a full block) */
  pos: Float32Array;
  /** 4 vertices * uv, atlas-normalized */
  uv: Float32Array;
  /** cull direction or -1 */
  cull: number;
  /** face direction used for lighting */
  dir: Dir;
  tint: number;
  shade: boolean;
  /** axis-aligned and flush with the block boundary */
  flush: boolean;
  /** axis-aligned (normal parallel to an axis) */
  aligned: boolean;
  /** covers the entire face square */
  full: boolean;
  /** texture name (for particles/debug) */
  tex: string;
}

export interface BakedModel {
  quads: BakedQuad[];
  ao: boolean;
  particle: string;
}

// Vanilla FaceInfo vertex order per direction, as [xSel, ySel, zSel] where 0=min, 1=max.
const FACE_VERTS: number[][][] = [
  // DOWN
  [[0, 0, 1], [0, 0, 0], [1, 0, 0], [1, 0, 1]],
  // UP
  [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]],
  // NORTH
  [[1, 1, 0], [1, 0, 0], [0, 0, 0], [0, 1, 0]],
  // SOUTH
  [[0, 1, 1], [0, 0, 1], [1, 0, 1], [1, 1, 1]],
  // WEST
  [[0, 1, 0], [0, 0, 0], [0, 0, 1], [0, 1, 1]],
  // EAST
  [[1, 1, 1], [1, 0, 1], [1, 0, 0], [1, 1, 0]],
];

function defaultUV(d: Dir, from: Vec3, to: Vec3): UV4 {
  switch (d) {
    case DOWN: return [from[0], 16 - to[2], to[0], 16 - from[2]];
    case UP: return [from[0], from[2], to[0], to[2]];
    case NORTH: return [16 - to[0], 16 - to[1], 16 - from[0], 16 - from[1]];
    case SOUTH: return [from[0], 16 - to[1], to[0], 16 - from[1]];
    case WEST: return [from[2], 16 - to[1], to[2], 16 - from[1]];
    default: return [16 - to[2], 16 - to[1], 16 - from[2], 16 - from[1]];
  }
}

/** uv (0..16) for a point on a face of given direction (used by uvlock). */
function lockedUV(d: Dir, x: number, y: number, z: number): [number, number] {
  switch (d) {
    case DOWN: return [x, 16 - z];
    case UP: return [x, z];
    case NORTH: return [16 - x, 16 - y];
    case SOUTH: return [x, 16 - y];
    case WEST: return [z, 16 - y];
    default: return [16 - z, 16 - y];
  }
}

function rotatePoint(p: number[], axis: 'x' | 'y' | 'z', angleDeg: number, origin: number[], scale: number[] | null): void {
  const a = (angleDeg * Math.PI) / 180;
  const c = Math.cos(a), s = Math.sin(a);
  const x = p[0] - origin[0], y = p[1] - origin[1], z = p[2] - origin[2];
  let rx = x, ry = y, rz = z;
  if (axis === 'x') {
    ry = y * c - z * s;
    rz = y * s + z * c;
  } else if (axis === 'y') {
    rx = x * c + z * s;
    rz = -x * s + z * c;
  } else {
    rx = x * c - y * s;
    ry = x * s + y * c;
  }
  if (scale) {
    rx *= scale[0];
    ry *= scale[1];
    rz *= scale[2];
  }
  p[0] = rx + origin[0];
  p[1] = ry + origin[1];
  p[2] = rz + origin[2];
}

function rotateDir(d: Dir, axis: 'x' | 'y', angleDeg: number): Dir {
  const v = [[0, -1, 0], [0, 1, 0], [0, 0, -1], [0, 0, 1], [-1, 0, 0], [1, 0, 0]][d].slice();
  rotatePoint(v, axis, angleDeg, [0, 0, 0], null);
  return dirFromNormal(v[0], v[1], v[2]);
}

export function bakeVariant(v: Variant, sprites: SpriteLookup): BakedModel {
  const quads: BakedQuad[] = [];
  const vx = v.x ?? 0, vy = v.y ?? 0;
  for (const el of v.model.elements) {
    const from = el.from, to = el.to;
    let scale: number[] | null = null;
    if (el.rot && el.rot.rescale) {
      const s = 1 / Math.cos((Math.abs(el.rot.angle) * Math.PI) / 180);
      scale = el.rot.axis === 'x' ? [1, s, s] : el.rot.axis === 'y' ? [s, 1, s] : [s, s, 1];
    }
    for (const dn of DIR_NAMES) {
      const face = el.faces[dn];
      if (!face) continue;
      const d = DIR_NAMES.indexOf(dn) as Dir;
      const uv = face.uv ?? defaultUV(d, from, to);
      const pos = new Float32Array(12);
      const pts: number[][] = [];
      for (let i = 0; i < 4; i++) {
        const sel = FACE_VERTS[d][i];
        const p = [sel[0] ? to[0] : from[0], sel[1] ? to[1] : from[1], sel[2] ? to[2] : from[2]];
        if (el.rot) rotatePoint(p, el.rot.axis, el.rot.angle, el.rot.origin, scale);
        // variant rotation: x first then y, around block center, by negative angles
        if (vx) rotatePoint(p, 'x', -vx, [8, 8, 8], null);
        if (vy) rotatePoint(p, 'y', -vy, [8, 8, 8], null);
        pts.push(p);
      }
      // uv corners with rotation
      const rotSteps = ((face.rot ?? 0) / 90) | 0;
      const corners: [number, number][] = [
        [uv[0], uv[1]],
        [uv[0], uv[3]],
        [uv[2], uv[3]],
        [uv[2], uv[1]],
      ];
      // normal from final points
      const e1 = [pts[1][0] - pts[0][0], pts[1][1] - pts[0][1], pts[1][2] - pts[0][2]];
      const e2 = [pts[2][0] - pts[0][0], pts[2][1] - pts[0][1], pts[2][2] - pts[0][2]];
      let nx = e1[1] * e2[2] - e1[2] * e2[1];
      let ny = e1[2] * e2[0] - e1[0] * e2[2];
      let nz = e1[0] * e2[1] - e1[1] * e2[0];
      const nl = Math.hypot(nx, ny, nz);
      let faceDir: Dir = d;
      if (nl > 1e-6) {
        nx /= nl; ny /= nl; nz /= nl;
        faceDir = dirFromNormal(nx, ny, nz);
      } else {
        // degenerate (zero-area) quad: rotate original dir
        faceDir = d;
        if (vx) faceDir = rotateDir(faceDir, 'x', -vx);
        if (vy) faceDir = rotateDir(faceDir, 'y', -vy);
      }
      const aligned = nl > 1e-6 && (Math.abs(nx) > 0.9999 || Math.abs(ny) > 0.9999 || Math.abs(nz) > 0.9999);
      const sprite = sprites(face.tex);
      const su = sprite.u1 - sprite.u0, sv = sprite.v1 - sprite.v0;
      const uvOut = new Float32Array(8);
      for (let i = 0; i < 4; i++) {
        let u: number, vv: number;
        if (v.uvlock && aligned && (vx || vy)) {
          [u, vv] = lockedUV(faceDir, pts[i][0], pts[i][1], pts[i][2]);
          // keep within the original uv window size by wrapping to 0..16
          u = Math.min(16, Math.max(0, u));
          vv = Math.min(16, Math.max(0, vv));
        } else {
          const c = corners[(i + rotSteps) & 3];
          u = c[0];
          vv = c[1];
        }
        uvOut[i * 2] = sprite.u0 + (u / 16) * su;
        uvOut[i * 2 + 1] = sprite.v0 + (vv / 16) * sv;
        pos[i * 3] = pts[i][0] / 16;
        pos[i * 3 + 1] = pts[i][1] / 16;
        pos[i * 3 + 2] = pts[i][2] / 16;
      }
      let cull = -1;
      if (face.cull) {
        let cd = DIR_NAMES.indexOf(face.cull) as Dir;
        if (vx) cd = rotateDir(cd, 'x', -vx);
        if (vy) cd = rotateDir(cd, 'y', -vy);
        cull = cd;
      }
      // flush / full detection
      let flush = false, full = false;
      if (aligned) {
        const axis = faceDir === DOWN || faceDir === UP ? 1 : faceDir === NORTH || faceDir === SOUTH ? 2 : 0;
        const plane = pos[axis];
        const positive = faceDir === UP || faceDir === SOUTH || faceDir === EAST;
        flush = positive ? Math.abs(plane - 1) < 1e-4 : Math.abs(plane) < 1e-4;
        const a1 = axis === 0 ? 1 : 0, a2 = axis === 2 ? 1 : 2;
        let mn1 = 9, mx1 = -9, mn2 = 9, mx2 = -9;
        for (let i = 0; i < 4; i++) {
          mn1 = Math.min(mn1, pos[i * 3 + a1]); mx1 = Math.max(mx1, pos[i * 3 + a1]);
          mn2 = Math.min(mn2, pos[i * 3 + a2]); mx2 = Math.max(mx2, pos[i * 3 + a2]);
        }
        full = mn1 < 1e-4 && mn2 < 1e-4 && mx1 > 1 - 1e-4 && mx2 > 1 - 1e-4;
      }
      quads.push({
        pos,
        uv: uvOut,
        cull,
        dir: faceDir,
        tint: face.tint ?? -1,
        shade: el.shade ?? true,
        flush,
        aligned,
        full,
        tex: face.tex,
      });
    }
  }
  return { quads, ao: v.model.ao ?? true, particle: v.model.particle ?? (v.model.elements[0] ? Object.values(v.model.elements[0].faces)[0]?.tex ?? 'missing' : 'missing') };
}

/** Collect every texture name referenced by a model. */
export function modelTextures(m: ModelDef, out: Set<string>): void {
  for (const el of m.elements) for (const f of Object.values(el.faces)) if (f) out.add(f.tex);
  if (m.particle) out.add(m.particle);
}

export { WEST, EAST, NORTH, SOUTH, UP, DOWN };
