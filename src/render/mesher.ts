// Section mesher (runs in workers). Emits quads per render layer with
// vanilla-style smooth lighting / ambient occlusion and the vanilla fluid
// renderer. Input is a padded 20^3 copy of blocks + light around a section.

import {
  BLOCKS, STATE_BLOCK, OPACITY, EMISSION, FLAGS, FACE_OCC, LAYER, STATE_VIEWS,
  F_AIR, F_OPAQUE, F_FULL_COLLISION, F_VIEW_BLOCKING, F_WATER, F_LAVA, F_CULL_SAME, F_LEAVES, F_HAS_MODEL, F_COLLIDE,
} from '../world/block';
import { BakedModel, BakedQuad, bakeVariant, SpriteLookup, SpriteRect, Variant, ModelChoice } from '../world/models';
import { mcPosSeed, hash3 } from '../core/rng';

export const PAD = 2;
export const PS = 16 + PAD * 2; // 20
export const PADDED_VOLUME = PS * PS * PS;

export function pidx(x: number, y: number, z: number): number {
  return ((y + PAD) * PS + (z + PAD)) * PS + (x + PAD);
}

export interface MeshInput {
  blocks: Uint16Array;
  light: Uint8Array; // sky<<4 | block
  /** per padded column (PS*PS): grass, foliage, water colors */
  grass: Uint32Array;
  foliage: Uint32Array;
  water: Uint32Array;
  ox: number;
  oy: number;
  oz: number;
  smooth: boolean;
  fancy: boolean;
}

export const LAYER_COUNT = 4;

export interface MeshOutput {
  layers: (ArrayBuffer | null)[];
  quads: number[];
  /** translucent quad centers (x,y,z per quad) for sorting */
  centers: Float32Array | null;
}

// ---------------------------------------------------------------------------
// Model cache (per state)

interface StateModels {
  variants: BakedModel[];
  weights: number[];
  total: number;
  multipart: boolean;
  /** multipart parts with random alternatives (variants holds each part's first) */
  randomParts?: BakedModel[][];
}

let MODELS: (StateModels | null)[] = [];
let SPRITES: SpriteLookup;
let FLUID_SPRITES: { waterStill: SpriteRect; waterFlow: SpriteRect; waterOverlay: SpriteRect; lavaStill: SpriteRect; lavaFlow: SpriteRect };

export function initMesher(sprites: Record<string, SpriteRect>): void {
  const missing = sprites['missing'];
  SPRITES = (n: string) => sprites[n] ?? missing;
  MODELS = new Array(STATE_BLOCK.length).fill(null);
  const cache = new Map<ModelChoice, StateModels>();
  for (let st = 0; st < STATE_BLOCK.length; st++) {
    const b = BLOCKS[STATE_BLOCK[st]];
    if (!b.s.model) continue;
    const choice = b.s.model(STATE_VIEWS[st]);
    MODELS[st] = bakeChoice(choice);
    void cache;
  }
  FLUID_SPRITES = {
    waterStill: SPRITES('water_still'),
    waterFlow: SPRITES('water_flow'),
    waterOverlay: SPRITES('water_overlay'),
    lavaStill: SPRITES('lava_still'),
    lavaFlow: SPRITES('lava_flow'),
  };
}

export function bakeChoice(choice: ModelChoice): StateModels {
  if (Array.isArray(choice)) {
    const variants = choice.map((v) => bakeVariant(v, SPRITES));
    const weights = choice.map((v) => v.weight ?? 1);
    return { variants, weights, total: weights.reduce((a, b) => a + b, 0), multipart: false };
  }
  if ((choice as { parts: (Variant | Variant[])[] }).parts) {
    const parts = (choice as { parts: (Variant | Variant[])[] }).parts;
    if (parts.some((p) => Array.isArray(p))) {
      const randomParts = parts.map((p) => (Array.isArray(p) ? p : [p]).map((v) => bakeVariant(v, SPRITES)));
      return { variants: randomParts.map((p) => p[0]), weights: parts.map(() => 1), total: parts.length, multipart: true, randomParts };
    }
    const variants = (parts as Variant[]).map((v) => bakeVariant(v, SPRITES));
    return { variants, weights: parts.map(() => 1), total: parts.length, multipart: true };
  }
  return { variants: [bakeVariant(choice as Variant, SPRITES)], weights: [1], total: 1, multipart: false };
}

export function getStateModels(state: number): StateModels | null {
  return MODELS[state];
}

// ---------------------------------------------------------------------------
// Output writer

class LayerWriter {
  buf: ArrayBuffer;
  u8: Uint8Array;
  u16: Uint16Array;
  n = 0; // vertices
  centers: number[] | null;
  constructor(cap: number, withCenters: boolean) {
    this.buf = new ArrayBuffer(cap * 16);
    this.u8 = new Uint8Array(this.buf);
    this.u16 = new Uint16Array(this.buf);
    this.centers = withCenters ? [] : null;
  }
  reset(): void {
    this.n = 0;
    if (this.centers) this.centers.length = 0;
  }
  ensure(extra: number): void {
    if ((this.n + extra) * 16 <= this.buf.byteLength) return;
    const nb = new ArrayBuffer(Math.max(this.buf.byteLength * 2, (this.n + extra) * 16));
    new Uint8Array(nb).set(this.u8.subarray(0, this.n * 16));
    this.buf = nb;
    this.u8 = new Uint8Array(nb);
    this.u16 = new Uint16Array(nb);
  }
  vertex(x: number, y: number, z: number, u: number, v: number, r: number, g: number, b: number, a: number, blockL: number, skyL: number): void {
    const o = this.n * 16;
    const o2 = o >> 1;
    const u16 = this.u16, u8 = this.u8;
    u16[o2] = Math.round((x + 8) * 2048);
    u16[o2 + 1] = Math.round((y + 8) * 2048);
    u16[o2 + 2] = Math.round((z + 8) * 2048);
    u8[o + 6] = blockL;
    u8[o + 7] = skyL;
    u16[o2 + 4] = Math.round(u * 65535);
    u16[o2 + 5] = Math.round(v * 65535);
    u8[o + 12] = r;
    u8[o + 13] = g;
    u8[o + 14] = b;
    u8[o + 15] = a;
    this.n++;
  }
  result(): ArrayBuffer | null {
    if (this.n === 0) return null;
    return this.buf.slice(0, this.n * 16);
  }
}

const writers: LayerWriter[] = [new LayerWriter(4096, false), new LayerWriter(4096, false), new LayerWriter(4096, false), new LayerWriter(4096, true)];

// ---------------------------------------------------------------------------
// Lighting helpers

const DX = [0, 0, 0, 0, -1, 1], DY = [-1, 1, 0, 0, 0, 0], DZ = [0, 0, -1, 1, 0, 0];
const SHADE = [0.5, 1.0, 0.8, 0.8, 0.6, 0.6];
// in-plane axes per face: [axis1, axis2] (0=x,1=y,2=z)
const PLANE: [number, number][] = [[0, 2], [0, 2], [0, 1], [0, 1], [2, 1], [2, 1]];
// which of the two in-plane directions is the "primary" (fallback) corner axis per face
const PRIMARY_AXIS = [0, 0, 1, 0, 1, 1];

let inp: MeshInput;

function lightPacked(i: number): number {
  // returns (sky*16) << 8 | (block*16), with block raised to emission
  const st = inp.blocks[i];
  const l = inp.light[i];
  let blk = l & 15;
  const e = EMISSION[st];
  if (e > blk) blk = e;
  return ((l >> 4) << 12) | (blk << 4);
}

function shadeOf(i: number): number {
  return FLAGS[inp.blocks[i]] & F_FULL_COLLISION ? 0.2 : 1.0;
}

function flagOf(i: number): boolean {
  const st = inp.blocks[i];
  return !(FLAGS[st] & F_VIEW_BLOCKING) || OPACITY[st] === 0;
}

const aoB = new Float32Array(4); // per corner (00,10,01,11 in plane coords) brightness
const aoSky = new Float32Array(4);
const aoBlk = new Float32Array(4);

/**
 * Compute smooth-lighting corner values for face `d` of block at padded (x,y,z).
 * Results in aoB/aoSky/aoBlk indexed by corner (c = s + 2*t) where s,t ∈ {0,1}
 * are the in-plane coordinates along PLANE[d].
 */
function computeAO(x: number, y: number, z: number, d: number, flush: boolean): void {
  const bx = flush ? x + DX[d] : x, by = flush ? y + DY[d] : y, bz = flush ? z + DZ[d] : z;
  const [a1, a2] = PLANE[d];
  const self = pidx(x, y, z);
  const front = pidx(x + DX[d], y + DY[d], z + DZ[d]);
  let center: number;
  if (flush || !(FLAGS[inp.blocks[front]] & F_OPAQUE)) center = lightPacked(front);
  else center = lightPacked(self);
  const centerShade = flush ? shadeOf(pidx(bx, by, bz)) : shadeOf(self);
  const ddx = DX[d], ddy = DY[d], ddz = DZ[d];
  for (let c = 0; c < 4; c++) {
    const s = c & 1, t = c >> 1;
    const o1 = s ? 1 : -1, o2 = t ? 1 : -1;
    // edge 1 along a1, edge 2 along a2
    let e1x = 0, e1y = 0, e1z = 0, e2x = 0, e2y = 0, e2z = 0;
    if (a1 === 0) e1x = o1; else if (a1 === 1) e1y = o1; else e1z = o1;
    if (a2 === 0) e2x = o2; else if (a2 === 1) e2y = o2; else e2z = o2;
    const i1 = pidx(bx + e1x, by + e1y, bz + e1z);
    const i2 = pidx(bx + e2x, by + e2y, bz + e2z);
    const s1 = shadeOf(i1), s2 = shadeOf(i2);
    const l1 = lightPacked(i1), l2 = lightPacked(i2);
    const f1 = flagOf(pidx(bx + e1x + ddx, by + e1y + ddy, bz + e1z + ddz));
    const f2 = flagOf(pidx(bx + e2x + ddx, by + e2y + ddy, bz + e2z + ddz));
    let sd: number, ld: number;
    if (!f1 && !f2) {
      if (PRIMARY_AXIS[d] === a1) {
        sd = s1;
        ld = l1;
      } else {
        sd = s2;
        ld = l2;
      }
    } else {
      const i3 = pidx(bx + e1x + e2x, by + e1y + e2y, bz + e1z + e2z);
      sd = shadeOf(i3);
      ld = lightPacked(i3);
    }
    aoB[c] = (s1 + s2 + sd + centerShade) * 0.25;
    // blend with zero replacement
    const a = l1 === 0 ? center : l1;
    const b = l2 === 0 ? center : l2;
    const cc = ld === 0 ? center : ld;
    aoSky[c] = (((a >> 8) + (b >> 8) + (cc >> 8) + (center >> 8)) >> 2) & 0xff;
    aoBlk[c] = (((a & 0xff) + (b & 0xff) + (cc & 0xff) + (center & 0xff)) >> 2) & 0xff;
  }
}

function flatLight(i: number): number {
  return lightPacked(i);
}

// ---------------------------------------------------------------------------

function tintFor(state: number, colIdx: number): number {
  const b = BLOCKS[STATE_BLOCK[state]];
  switch (b.tint) {
    case 'grass': return inp.grass[colIdx];
    case 'foliage': return inp.foliage[colIdx];
    case 'water': return inp.water[colIdx];
    case 'birch': return 0x80a755;
    case 'spruce': return 0x619961;
    case 'lily': return 0x208030;
    case 'constant': return b.s.tintColor ?? 0xffffff;
    case 'stem': {
      const age = b.get<number>(state, 'age');
      return ((age * 32) << 16) | ((255 - age * 8) << 8) | (age * 4);
    }
    default: return 0xffffff;
  }
}

function occludes(state: number, neighbor: number, cullDir: number): boolean {
  const fn = FLAGS[neighbor];
  if ((FACE_OCC[neighbor] >> (cullDir ^ 1)) & 1) {
    if (fn & F_LEAVES && !inp.fancy) return true;
    return true;
  }
  if (!inp.fancy && fn & F_LEAVES && FLAGS[state] & F_LEAVES) return true;
  if (FLAGS[state] & F_CULL_SAME && STATE_BLOCK[state] === STATE_BLOCK[neighbor]) return true;
  return false;
}

const vx = new Float32Array(4), vy = new Float32Array(4), vz = new Float32Array(4);

function emitQuad(
  w: LayerWriter, q: BakedQuad, x: number, y: number, z: number, ox: number, oy: number, oz: number,
  tint: number, useAO: boolean, alpha: number, selfIdx: number,
): void {
  const d = q.dir;
  let r = 255, g = 255, b = 255;
  if (q.tint >= 0) {
    r = (tint >> 16) & 255;
    g = (tint >> 8) & 255;
    b = tint & 255;
  }
  const shade = q.shade ? SHADE[d] : 1;
  w.ensure(4);
  const pos = q.pos, uv = q.uv;
  if (useAO && q.aligned) {
    computeAO(x, y, z, d, q.flush);
    const [a1, a2] = PLANE[d];
    for (let k = 0; k < 4; k++) {
      const p = [pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2]];
      let s = p[a1], t = p[a2];
      s = s < 0 ? 0 : s > 1 ? 1 : s;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const w00 = (1 - s) * (1 - t), w10 = s * (1 - t), w01 = (1 - s) * t, w11 = s * t;
      const br = (aoB[0] * w00 + aoB[1] * w10 + aoB[2] * w01 + aoB[3] * w11) * shade;
      const sky = aoSky[0] * w00 + aoSky[1] * w10 + aoSky[2] * w01 + aoSky[3] * w11;
      const blk = aoBlk[0] * w00 + aoBlk[1] * w10 + aoBlk[2] * w01 + aoBlk[3] * w11;
      w.vertex(x + ox + p[0], y + oy + p[1], z + oz + p[2], uv[k * 2], uv[k * 2 + 1], r * br, g * br, b * br, alpha, blk, sky);
    }
  } else {
    const li = q.flush ? pidx(x + DX[d], y + DY[d], z + DZ[d]) : selfIdx;
    const l = flatLight(li);
    const sky = (l >> 8) & 0xff, blk = l & 0xff;
    for (let k = 0; k < 4; k++) {
      w.vertex(x + ox + pos[k * 3], y + oy + pos[k * 3 + 1], z + oz + pos[k * 3 + 2], uv[k * 2], uv[k * 2 + 1], r * shade, g * shade, b * shade, alpha, blk, sky);
    }
  }
  if (w.centers) {
    w.centers.push(
      x + ox + (pos[0] + pos[6]) * 0.5,
      y + oy + (pos[1] + pos[7]) * 0.5,
      z + oz + (pos[2] + pos[8]) * 0.5,
    );
  }
}

// ---------------------------------------------------------------------------
// Fluids

function fluidAmount(st: number): number {
  // 0..8 (source 8); -1 if not the fluid
  const b = BLOCKS[STATE_BLOCK[st]];
  if (b.s.fluid && b.propIndex('level') >= 0) {
    const lvl = b.get<number>(st, 'level');
    return lvl === 0 || lvl >= 8 ? 8 : 8 - lvl;
  }
  if (FLAGS[st] & F_WATER) return 8; // waterlogged / water plants
  return 0;
}

function isFluid(st: number, lava: boolean): boolean {
  return lava ? (FLAGS[st] & F_LAVA) !== 0 : (FLAGS[st] & F_WATER) !== 0;
}

function fluidHeightAt(x: number, y: number, z: number, lava: boolean): number {
  const st = inp.blocks[pidx(x, y, z)];
  if (isFluid(st, lava)) {
    const above = inp.blocks[pidx(x, y + 1, z)];
    if (isFluid(above, lava)) return 1;
    return fluidAmount(st) / 9;
  }
  // vanilla: !isSolid ? 0 : -1
  return FLAGS[st] & F_COLLIDE || FLAGS[st] & F_OPAQUE ? -1 : 0;
}

function avgHeight(h0: number, h1: number, h2: number, x: number, y: number, z: number, lava: boolean): number {
  if (h2 >= 1 || h1 >= 1) return 1;
  let sum = 0, wsum = 0;
  const add = (h: number) => {
    if (h >= 0.8) {
      sum += h * 10;
      wsum += 10;
    } else if (h >= 0) {
      sum += h;
      wsum += 1;
    }
  };
  if (h2 > 0 || h1 > 0) {
    const f = fluidHeightAt(x, y, z, lava);
    if (f >= 1) return 1;
    add(f);
  }
  add(h0);
  add(h2);
  add(h1);
  return sum / wsum;
}

function fluidFlow(x: number, y: number, z: number, lava: boolean, own: number): [number, number] {
  let fx = 0, fz = 0;
  const dirs = [[0, -1], [0, 1], [-1, 0], [1, 0]];
  for (const [dx, dz] of dirs) {
    const st = inp.blocks[pidx(x + dx, y, z + dz)];
    const same = isFluid(st, lava);
    const empty = !same && !(FLAGS[st] & F_WATER) && !(FLAGS[st] & F_LAVA);
    if (!same && !empty) continue;
    let f = same ? fluidAmount(st) / 9 : 0;
    let f1 = 0;
    if (f === 0) {
      if (!(FLAGS[st] & F_COLLIDE)) {
        const b2 = inp.blocks[pidx(x + dx, y - 1, z + dz)];
        if (isFluid(b2, lava)) {
          f = fluidAmount(b2) / 9;
          if (f > 0) f1 = own - (f - 0.8888889);
        }
      }
    } else if (f > 0) f1 = own - f;
    if (f1 !== 0) {
      fx += dx * f1;
      fz += dz * f1;
    }
  }
  const len = Math.hypot(fx, fz);
  if (len < 1e-5) return [0, 0];
  return [fx / len, fz / len];
}

function renderFluid(x: number, y: number, z: number, ox: number, oy: number, oz: number, lava: boolean, colIdx: number): void {
  const self = pidx(x, y, z);
  const st = inp.blocks[self];
  const w = lava ? writers[0] : writers[3];
  const sprites = FLUID_SPRITES;
  const still = lava ? sprites.lavaStill : sprites.waterStill;
  const flow = lava ? sprites.lavaFlow : sprites.waterFlow;
  let r = 255, g = 255, b = 255;
  if (!lava) {
    const c = inp.water[colIdx];
    r = (c >> 16) & 255;
    g = (c >> 8) & 255;
    b = c & 255;
  }
  const nb = (dx: number, dy: number, dz: number) => inp.blocks[pidx(x + dx, y + dy, z + dz)];
  const up = nb(0, 1, 0), down = nb(0, -1, 0), north = nb(0, 0, -1), south = nb(0, 0, 1), west = nb(-1, 0, 0), east = nb(1, 0, 0);
  const renderUp = !isFluid(up, lava);
  const faceOcc = (n: number, dir: number) => ((FACE_OCC[n] >> (dir ^ 1)) & 1) === 1;
  const renderDown = !isFluid(down, lava) && !faceOcc(down, 0);
  const renderN = !isFluid(north, lava);
  const renderS = !isFluid(south, lava);
  const renderW = !isFluid(west, lava);
  const renderE = !isFluid(east, lava);
  if (!renderUp && !renderDown && !renderN && !renderS && !renderW && !renderE) return;
  const own = fluidAmount(st) / 9;
  const height = fluidHeightAt(x, y, z, lava);
  let hNE: number, hNW: number, hSE: number, hSW: number;
  if (height >= 1) hNE = hNW = hSE = hSW = 1;
  else {
    const hN = fluidHeightAt(x, y, z - 1, lava), hS = fluidHeightAt(x, y, z + 1, lava);
    const hE = fluidHeightAt(x + 1, y, z, lava), hW = fluidHeightAt(x - 1, y, z, lava);
    hNE = avgHeight(height, hN, hE, x + 1, y, z - 1, lava);
    hNW = avgHeight(height, hN, hW, x - 1, y, z - 1, lava);
    hSE = avgHeight(height, hS, hE, x + 1, y, z + 1, lava);
    hSW = avgHeight(height, hS, hW, x - 1, y, z + 1, lava);
  }
  const X = x + ox, Y = y + oy, Z = z + oz;
  const yDown = renderDown ? 0.001 : 0;
  const alpha = 255;
  // vanilla: max of the fluid block's light and the light above it
  const lA = lightPacked(self), lB = lightPacked(pidx(x, y + 1, z));
  const skyS = Math.max((lA >> 8) & 0xff, (lB >> 8) & 0xff), blkS = Math.max(lA & 0xff, lB & 0xff);
  if (renderUp && !faceOcc(up, 1)) {
    hNW -= 0.001; hSW -= 0.001; hSE -= 0.001; hNE -= 0.001;
    const [fx, fz] = fluidFlow(x, y, z, lava, own);
    let u0, u1, u2, u3, v0, v1, v2, v3;
    if (fx === 0 && fz === 0) {
      u0 = still.u0; v0 = still.v0; u1 = u0; v1 = still.v1; u2 = still.u1; v2 = v1; u3 = u2; v3 = v0;
    } else {
      const ang = Math.atan2(fz, fx) - Math.PI / 2;
      const sn = Math.sin(ang) * 0.25, cs = Math.cos(ang) * 0.25;
      const U = (f: number) => flow.u0 + (flow.u1 - flow.u0) * f;
      const V = (f: number) => flow.v0 + (flow.v1 - flow.v0) * f;
      u0 = U(0.5 + (-cs - sn)); v0 = V(0.5 + (-cs + sn));
      u1 = U(0.5 + (-cs + sn)); v1 = V(0.5 + (cs + sn));
      u2 = U(0.5 + (cs + sn)); v2 = V(0.5 + (cs - sn));
      u3 = U(0.5 + (cs - sn)); v3 = V(0.5 + (-cs - sn));
    }
    const sh = 1.0;
    w.ensure(8);
    w.vertex(X, Y + hNW, Z, u0, v0, r * sh, g * sh, b * sh, alpha, blkS, skyS);
    w.vertex(X, Y + hSW, Z + 1, u1, v1, r * sh, g * sh, b * sh, alpha, blkS, skyS);
    w.vertex(X + 1, Y + hSE, Z + 1, u2, v2, r * sh, g * sh, b * sh, alpha, blkS, skyS);
    w.vertex(X + 1, Y + hNE, Z, u3, v3, r * sh, g * sh, b * sh, alpha, blkS, skyS);
    if (w.centers) w.centers.push(X + 0.5, Y + (hNW + hSE) * 0.5, Z + 0.5);
    // backward face (visible from below) when the block above can't hold fluid face
    if (!(FLAGS[up] & F_OPAQUE)) {
      w.vertex(X, Y + hNW, Z, u0, v0, r * sh, g * sh, b * sh, alpha, blkS, skyS);
      w.vertex(X + 1, Y + hNE, Z, u3, v3, r * sh, g * sh, b * sh, alpha, blkS, skyS);
      w.vertex(X + 1, Y + hSE, Z + 1, u2, v2, r * sh, g * sh, b * sh, alpha, blkS, skyS);
      w.vertex(X, Y + hSW, Z + 1, u1, v1, r * sh, g * sh, b * sh, alpha, blkS, skyS);
      if (w.centers) w.centers.push(X + 0.5, Y + (hNW + hSE) * 0.5 - 0.01, Z + 0.5);
    }
  }
  if (renderDown) {
    const lD = lightPacked(pidx(x, y - 1, z));
    const sky = (lD >> 8) & 0xff, blk = lD & 0xff;
    const sh = 0.5;
    w.ensure(4);
    w.vertex(X, Y + yDown, Z + 1, still.u0, still.v1, r * sh, g * sh, b * sh, alpha, blk, sky);
    w.vertex(X, Y + yDown, Z, still.u0, still.v0, r * sh, g * sh, b * sh, alpha, blk, sky);
    w.vertex(X + 1, Y + yDown, Z, still.u1, still.v0, r * sh, g * sh, b * sh, alpha, blk, sky);
    w.vertex(X + 1, Y + yDown, Z + 1, still.u1, still.v1, r * sh, g * sh, b * sh, alpha, blk, sky);
    if (w.centers) w.centers.push(X + 0.5, Y, Z + 0.5);
  }
  const sides: [boolean, number, number, number, number, number, number, number, number, number][] = [
    // render, h0, h1, x0, x1, z0, z1, shade, neighbor state, dir
    [renderN, hNW, hNE, X, X + 1, Z + 0.001, Z + 0.001, 0.8, north, 2],
    [renderS, hSE, hSW, X + 1, X, Z + 1 - 0.001, Z + 1 - 0.001, 0.8, south, 3],
    [renderW, hSW, hNW, X + 0.001, X + 0.001, Z + 1, Z, 0.6, west, 4],
    [renderE, hNE, hSE, X + 1 - 0.001, X + 1 - 0.001, Z, Z + 1, 0.6, east, 5],
  ];
  for (const [render, h0, h1, x0, x1, z0, z1, shade, nst, dir] of sides) {
    if (!render || faceOcc(nst, dir)) continue;
    let sprite = flow;
    let overlay = false;
    if (!lava && (FLAGS[nst] & F_LEAVES || BLOCKS[STATE_BLOCK[nst]].name.includes('glass'))) {
      sprite = FLUID_SPRITES.waterOverlay;
      overlay = true;
    }
    const U = (f: number) => sprite.u0 + (sprite.u1 - sprite.u0) * f;
    const V = (f: number) => sprite.v0 + (sprite.v1 - sprite.v0) * f;
    const su0 = U(0), su1 = U(0.5);
    const sv0 = V((1 - h0) * 0.5), sv1 = V((1 - h1) * 0.5), sv2 = V(0.5);
    const sh = shade;
    w.ensure(8);
    w.vertex(x0, Y + h0, z0, su0, sv0, r * sh, g * sh, b * sh, alpha, blkS, skyS);
    w.vertex(x1, Y + h1, z1, su1, sv1, r * sh, g * sh, b * sh, alpha, blkS, skyS);
    w.vertex(x1, Y + yDown, z1, su1, sv2, r * sh, g * sh, b * sh, alpha, blkS, skyS);
    w.vertex(x0, Y + yDown, z0, su0, sv2, r * sh, g * sh, b * sh, alpha, blkS, skyS);
    if (w.centers) w.centers.push((x0 + x1) * 0.5, Y + 0.5, (z0 + z1) * 0.5);
    if (!overlay) {
      w.vertex(x0, Y + yDown, z0, su0, sv2, r * sh, g * sh, b * sh, alpha, blkS, skyS);
      w.vertex(x1, Y + yDown, z1, su1, sv2, r * sh, g * sh, b * sh, alpha, blkS, skyS);
      w.vertex(x1, Y + h1, z1, su1, sv1, r * sh, g * sh, b * sh, alpha, blkS, skyS);
      w.vertex(x0, Y + h0, z0, su0, sv0, r * sh, g * sh, b * sh, alpha, blkS, skyS);
      if (w.centers) w.centers.push((x0 + x1) * 0.5, Y + 0.49, (z0 + z1) * 0.5);
    }
  }
}

// ---------------------------------------------------------------------------

export function meshSection(input: MeshInput): MeshOutput {
  inp = input;
  for (const w of writers) w.reset();
  const blocks = input.blocks;
  // positions relative to the section origin; world offset is applied by the renderer
  for (let y = 0; y < 16; y++)
    for (let z = 0; z < 16; z++)
      for (let x = 0; x < 16; x++) {
        const i = pidx(x, y, z);
        const st = blocks[i];
        const f = FLAGS[st];
        if (f & F_AIR) continue;
        const colIdx = (z + PAD) * PS + (x + PAD);
        if (f & F_LAVA) renderFluid(x, y, z, 0, 0, 0, true, colIdx);
        else if (f & F_WATER) renderFluid(x, y, z, 0, 0, 0, false, colIdx);
        if (!(f & F_HAS_MODEL)) continue;
        const models = MODELS[st];
        if (!models) continue;
        const b = BLOCKS[STATE_BLOCK[st]];
        let layer = LAYER[st];
        if (layer === 4) continue;
        if (!input.fancy && f & F_LEAVES) layer = 0;
        const w = writers[layer];
        const tint = b.tint !== 'none' ? tintFor(st, colIdx) : 0xffffff;
        // plant offset
        let ox = 0, oy = 0, oz = 0;
        if (b.offset !== 'none') {
          const wx = input.ox + x, wz = input.oz + z;
          const l = mcPosSeed(wx, 0, wz);
          ox = Math.max(-0.25, Math.min(0.25, ((l & 15) / 15 - 0.5) * 0.5));
          oz = Math.max(-0.25, Math.min(0.25, (((l >> 8) & 15) / 15 - 0.5) * 0.5));
          if (b.offset === 'xyz') oy = (((l >> 4) & 15) / 15 - 1) * 0.2;
        }
        const useAO = input.smooth && EMISSION[st] === 0;
        const drawModel = (m: BakedModel) => {
          const ao = useAO && m.ao;
          for (const q of m.quads) {
            if (q.cull >= 0) {
              const n = blocks[pidx(x + DX[q.cull], y + DY[q.cull], z + DZ[q.cull])];
              if (occludes(st, n, q.cull)) continue;
            }
            emitQuad(w, q, x, y, z, ox, oy, oz, tint, ao, 255, i);
          }
        };
        if (models.randomParts) {
          // vanilla MultiPartBakedModel: every part draws with the same random seed
          const h = hash3(input.ox + x, input.oy + y, input.oz + z, 0x51a7e);
          for (const p of models.randomParts) drawModel(p[h % p.length]);
        } else if (models.multipart) {
          for (const m of models.variants) drawModel(m);
        } else if (models.variants.length === 1) {
          drawModel(models.variants[0]);
        } else {
          const h = hash3(input.ox + x, input.oy + y, input.oz + z, 0x51a7e) % models.total;
          let acc = 0, pick = 0;
          for (let k = 0; k < models.weights.length; k++) {
            acc += models.weights[k];
            if (h < acc) {
              pick = k;
              break;
            }
          }
          drawModel(models.variants[pick]);
        }
      }
  const layers: (ArrayBuffer | null)[] = [];
  const quads: number[] = [];
  for (const w of writers) {
    layers.push(w.result());
    quads.push(w.n >> 2);
  }
  const tw = writers[3];
  const centers = tw.centers && tw.centers.length ? new Float32Array(tw.centers) : null;
  return { layers, quads, centers };
}
