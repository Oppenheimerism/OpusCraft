// The ender dragon's textures (vanilla textures/entity/enderdragon/dragon.png, dragon_eyes.png,
// dragon_exploding.png and dragon_fireball.png, and end_crystal/end_crystal_beam.png), painted from code.
//
// The skin follows vanilla DragonModel's 256x256 box-UV layout (render/enderDragonRenderer.ts): the body at
// (0,0), the head's boxes, the neck and tail segment at (192,104), the wing bones at (112,88) and (112,136) and
// their membranes at (0,88) and (0,144) — cut out in scallops between the fingers along the trailing edge — the
// legs and the feet. Near-black scaled hide, grey horns and spines, and violet eyes, which the eyes layer (drawn
// added on, full bright) makes glow. Model y points down, so a box's "down" face is its top in the world.

import { TexImage, img, plot, getA, valueNoise, combine, normalize, equalize, Rand } from './tex';

type Rect = [number, number, number, number];
interface Faces {
  down: Rect;
  up: Rect;
  west: Rect;
  north: Rect;
  east: Rect;
  south: Rect;
}

/** the six face rectangles [x, y, w, h] of a w x h x d box's UV unwrap at (u, v) */
function box(u: number, v: number, w: number, h: number, d: number): Faces {
  return {
    down: [u + d, v, w, d],
    up: [u + d + w, v, w, d],
    west: [u, v + d, d, h],
    north: [u + d, v + d, w, h],
    east: [u + d + w, v + d, d, h],
    south: [u + d + w + d, v + d, w, h],
  };
}

const HIDE = [0x09090c, 0x0f0f13, 0x15151a, 0x1c1c22, 0x24242b, 0x2d2d35, 0x383841, 0x45454f];
const HORN = [0x2c2c34, 0x3b3b44, 0x4d4d56, 0x61616a, 0x76767f, 0x8b8b94];
const MEMBRANE = [0x121217, 0x19191f, 0x202027, 0x282830, 0x31313a, 0x3c3c46];
const EYE = [0x6a0a92, 0x9d00cf, 0xcc00fa, 0xe079fa, 0xf6c8ff];

const S = 256;

class Painter {
  readonly t = img(S, S);
  readonly eyes = img(S, S);
  private readonly grain: Float32Array;
  constructor(readonly r: Rand) {
    this.grain = normalize(combine([valueNoise(r, S, S, 16), valueNoise(r, S, S, 8), valueNoise(r, S, S, 4), valueNoise(r, S, S, 2)], [0.2, 0.3, 0.3, 0.2]));
  }

  /** -1, 0 or +1: the hide's slow mottling */
  jitter(x: number, y: number): number {
    return Math.round((this.grain[y * S + x] - 0.5) * 2.6);
  }

  put(pal: number[], x: number, y: number, k: number): void {
    plot(this.t, x, y, pal[Math.max(0, Math.min(pal.length - 1, Math.round(k)))]);
  }

  /** overlapping scales, four texels wide and three high, each row offset by half a scale */
  scales(rect: Rect, base: number, shade?: (x: number, y: number) => number): void {
    const [x0, y0, w, h] = rect;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const row = Math.floor(y / 3), sx = (x + (row & 1) * 2) & 3, sy = y % 3;
        let k = base + this.jitter(x0 + x, y0 + y) + (shade?.(x, y) ?? 0);
        if (sy === 0) k += sx === 0 ? 0 : 2; // each scale's lit upper rim
        else if (sy === 2) k -= 1; // and its shadowed lower edge
        if (sx === 0 && sy > 0) k -= 1; // the gap between neighbours
        this.put(HIDE, x0 + x, y0 + y, k);
      }
  }

  /** the belly: broad plates across it, a dark seam and a lit lip on each */
  belly(rect: Rect): void {
    const [x0, y0, w, h] = rect;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const m = y % 4;
        const edge = x === 0 || x === w - 1;
        const k = m === 0 ? 1 : m === 1 ? 5 : 3 + this.jitter(x0 + x, y0 + y);
        this.put(HIDE, x0 + x, y0 + y, edge ? k - 1 : k);
      }
  }

  /** flat dark (the inside of the mouth, the soles of the feet) */
  flat(rect: Rect, base: number): void {
    const [x0, y0, w, h] = rect;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) this.put(HIDE, x0 + x, y0 + y, base + (this.jitter(x0 + x, y0 + y) > 0 ? 1 : 0));
  }

  /** a horn or spine: grey, pale at its tip (the top of its sides) and dark at its root */
  horn(f: Faces): void {
    for (const k of ['west', 'north', 'east', 'south'] as const) {
      const [x0, y0, w, h] = f[k];
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const t = h > 1 ? y / (h - 1) : 0;
          this.put(HORN, x0 + x, y0 + y, (1 - t) * 4.2 + 0.4 + this.jitter(x0 + x, y0 + y) * 0.6 - (x === 0 || x === w - 1 ? 0.8 : 0));
        }
    }
    const [dx, dy, dw, dh] = f.down;
    for (let y = 0; y < dh; y++) for (let x = 0; x < dw; x++) this.put(HORN, dx + x, dy + y, 5 - (y === 0 || y === dh - 1 ? 1 : 0));
    const [ux, uy, uw, uh] = f.up;
    for (let y = 0; y < uh; y++) for (let x = 0; x < uw; x++) this.put(HORN, ux + x, uy + y, 0);
  }

  /** a wing bone: a lit ridge along its middle, darker knuckle rings every 14 texels */
  bone(f: Faces): void {
    for (const k of ['down', 'up', 'north', 'south'] as const) {
      const [x0, y0, w, h] = f[k];
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const mid = Math.abs(y - (h - 1) / 2) < h / 4;
          let v = 3 + (mid ? 1 : 0) + this.jitter(x0 + x, y0 + y);
          if (x % 14 === 13) v -= 2;
          else if (x % 14 === 0) v += 1;
          this.put(HIDE, x0 + x, y0 + y, v);
        }
    }
    for (const k of ['west', 'east'] as const) this.scales(f[k], 3);
  }

  /**
   * a membrane (56 x 56, the outer end on the left, the bone along the bottom): finger bones running from the
   * bone out to the trailing edge (each [x at the bone, x at the edge]), the edge cut back into a scallop between
   * each finger's tip and the next
   */
  membrane(rect: Rect, fingers: [number, number][], depth: number): void {
    const [x0, y0, w, h] = rect;
    const tips = [0, ...fingers.map((f) => f[1]), w - 1].sort((a, b) => a - b);
    for (let x = 0; x < w; x++) {
      let a = 0, b = w - 1;
      for (const t of tips) {
        if (t <= x) a = Math.max(a, t);
        if (t >= x) b = Math.min(b, t);
      }
      const edge = b > a ? depth * Math.sin((Math.PI * (x - a)) / (b - a)) : 0;
      for (let y = 0; y < h; y++) {
        if (y < edge - 0.35) continue; // cut out
        let d = Infinity;
        for (const [bx, tx] of fingers) d = Math.min(d, Math.abs(x - (tx + ((bx - tx) * y) / (h - 1))));
        let k = 2 + this.jitter(x0 + x, y0 + y) * 0.8 + (1 - y / h) * 0.6;
        if (d < 0.6) k = 5;
        else if (d < 1.5) k = 4;
        else if (y < edge + 0.9) k = 1; // the thickened rim of the cut
        if (y >= h - 2) k -= 1;
        this.put(MEMBRANE, x0 + x, y0 + y, k);
      }
    }
  }

  /** an eye, 4 x 2, its bright end towards the snout; mirrored on the right side */
  eye(x0: number, y0: number, frontRight: boolean): void {
    const rows = [
      [1, 3, 4, 2],
      [0, 2, 3, 1],
    ];
    // a dark socket round it
    for (let y = -1; y <= 2; y++) for (let x = -1; x <= 4; x++) this.put(HIDE, x0 + x, y0 + y, 0);
    rows.forEach((row, y) =>
      row.forEach((c, i) => {
        const x = frontRight ? i : 3 - i;
        plot(this.t, x0 + x, y0 + y, EYE[c]);
        plot(this.eyes, x0 + x, y0 + y, EYE[c]);
      }),
    );
  }
}

export interface DragonTextures {
  /** vanilla dragon.png */
  skin: TexImage;
  /** vanilla dragon_eyes.png: the eyes on black, added onto the dragon full bright */
  eyes: TexImage;
  /** vanilla dragon_exploding.png: only its alpha counts — the dragon dissolves as its death runs past each texel's */
  exploding: TexImage;
}

export function dragonTextures(): DragonTextures {
  const p = new Painter(new Rand(0xd7a6e1, 7));

  // the body: scaled back and flanks, plated belly, a dark line down the spine where its spines stand
  const body = box(0, 0, 24, 24, 64);
  p.scales(body.down, 3, (x) => (x === 11 || x === 12 ? -1 : 0));
  p.belly(body.up);
  p.scales(body.west, 3, (_x, y) => (y > 18 ? 1 : 0));
  p.scales(body.east, 3, (_x, y) => (y > 18 ? 1 : 0));
  p.scales(body.north, 3);
  p.scales(body.south, 2);
  p.horn(box(220, 53, 2, 6, 12));

  // the neck and tail segment, and the spine on it
  const neck = box(192, 104, 10, 10, 10);
  for (const k of ['down', 'up', 'west', 'north', 'east', 'south'] as const) p.scales(neck[k], k === 'up' ? 4 : 3);
  p.horn(box(48, 0, 2, 4, 6));

  // the head: its skull (eyes on its sides, near the front), the snout with its nostrils, the jaw, two horns
  const head = box(112, 30, 16, 16, 16);
  p.scales(head.down, 3, (x) => (x === 4 || x === 11 ? -1 : 0));
  p.scales(head.up, 2);
  p.scales(head.west, 3);
  p.scales(head.east, 3);
  p.scales(head.north, 2);
  p.scales(head.south, 3);
  // (west: the back on the left, the front on the right; east the other way round)
  p.eye(112 + 9, 46 + 3, true);
  p.eye(144 + 3, 46 + 3, false);
  const lip = box(176, 44, 12, 5, 16);
  p.scales(lip.down, 3);
  p.flat(lip.up, 1);
  p.scales(lip.west, 3, (_x, y) => (y === 4 ? -2 : 0));
  p.scales(lip.east, 3, (_x, y) => (y === 4 ? -2 : 0));
  p.scales(lip.north, 2, (_x, y) => (y === 4 ? -2 : 0));
  p.scales(lip.south, 2);
  const jaw = box(176, 65, 12, 4, 16);
  p.flat(jaw.down, 1);
  p.scales(jaw.up, 3);
  p.scales(jaw.west, 3, (_x, y) => (y === 0 ? -2 : 0));
  p.scales(jaw.east, 3, (_x, y) => (y === 0 ? -2 : 0));
  p.scales(jaw.north, 3, (_x, y) => (y === 0 ? -2 : 0));
  p.scales(jaw.south, 2);
  const nostril = box(112, 0, 2, 2, 4);
  for (const k of ['down', 'up', 'west', 'east', 'south'] as const) p.flat(nostril[k], 2);
  p.flat(nostril.north, 0);
  p.horn(box(0, 0, 2, 4, 6));

  // the wings: bones along the leading edge, membranes behind
  p.bone(box(112, 88, 56, 8, 8));
  p.bone(box(112, 136, 56, 4, 4));
  const inner: [number, number][] = [
    [8, 1],
    [21, 15],
    [34, 29],
    [47, 43],
  ];
  const outer: [number, number][] = [
    [50, 0],
    [52, 15],
    [54, 30],
    [55, 44],
  ];
  p.membrane([0, 88, 56, 56], inner, 6);
  p.membrane([56, 88, 56, 56], inner, 6);
  p.membrane([0, 144, 56, 56], outer, 9);
  p.membrane([56, 144, 56, 56], outer, 9);

  // the legs: scaled, the feet with pale claws along their fronts and dark soles
  const legs: [number, number, number, number, number][] = [
    [112, 104, 8, 24, 8], // front leg
    [226, 138, 6, 24, 6], // front leg tip
    [0, 0, 16, 32, 16], // hind leg
    [196, 0, 12, 32, 12], // hind leg tip
  ];
  for (const [u, v, w, h, d] of legs) {
    const f = box(u, v, w, h, d);
    for (const k of ['down', 'up', 'west', 'north', 'east', 'south'] as const) p.scales(f[k], k === 'up' ? 2 : 3);
  }
  for (const [u, v, w, h, d] of [
    [144, 104, 8, 4, 16],
    [112, 0, 18, 6, 24],
  ] as [number, number, number, number, number][]) {
    const f = box(u, v, w, h, d);
    p.scales(f.down, 3);
    p.flat(f.up, 1);
    p.scales(f.west, 3);
    p.scales(f.east, 3);
    p.scales(f.south, 2);
    const [x0, y0, fw, fh] = f.north;
    for (let y = 0; y < fh; y++)
      for (let x = 0; x < fw; x++) {
        const claw = x % 3 !== 2 && y >= fh - 2;
        if (claw) p.put(HORN, x0 + x, y0 + y, y === fh - 1 ? 4 : 3);
        else p.put(HIDE, x0 + x, y0 + y, 3 + p.jitter(x0 + x, y0 + y));
      }
  }

  // the dissolve mask: blotchy, evenly spread, and nothing where the skin is cut out
  const r = new Rand(0xd15501, 3);
  const n = equalize(combine([valueNoise(r, S, S, 32), valueNoise(r, S, S, 16), valueNoise(r, S, S, 8), valueNoise(r, S, S, 4)], [0.3, 0.3, 0.25, 0.15]));
  const exploding = img(S, S);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      if (getA(p.t, x, y) === 0) continue;
      plot(exploding, x, y, 0x000000, 1 + Math.floor(n[y * S + x] * 253));
    }
  return { skin: p.t, eyes: p.eyes, exploding };
}

/** vanilla end_crystal_beam.png: pale lilac and pink bands winding round it, repeating along it */
export function crystalBeamTexture(): TexImage {
  const t = img(16, 16);
  const ramp = [0xffffff, 0xf6e2ff, 0xe8bff8, 0xd49ae8, 0xba78d6, 0xd49ae8, 0xe8bff8, 0xf6e2ff];
  const r = new Rand(0xbea3, 1);
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const s = (x + y * 2) & 15;
      let c = ramp[Math.floor(s / 2)];
      if (r.chance(0.08)) c = ramp[(Math.floor(s / 2) + 1) & 7];
      plot(t, x, y, c);
    }
  return t;
}

/** vanilla dragon_fireball.png: a glowing violet orb, pale pink at its heart */
export function dragonFireballTexture(): TexImage {
  const t = img(16, 16);
  const r = new Rand(0xf14eba, 1);
  const ramp = [0x5c0f86, 0x8a1cb8, 0xb43ae0, 0xd766f4, 0xefa4ff, 0xffdcff];
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const dx = x - 7.5, dy = y - 7.5;
      const d = Math.sqrt(dx * dx + dy * dy) + (r.next() - 0.5) * 0.9;
      if (d > 7.2) continue;
      const k = Math.max(0, Math.min(ramp.length - 1, Math.round(5.4 - d * 0.78 - (dx + dy > 3 ? 0.4 : 0))));
      plot(t, x, y, ramp[k]);
    }
  return t;
}
