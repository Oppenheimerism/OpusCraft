// Chunk-local initial lighting (sky + block light), computed in the
// generation worker. Chunk borders are treated as closed; light crossing
// borders is merged later on the main thread.

import { OPACITY, EMISSION, FACE_OCC, FLAGS, F_SHAPE_OCCLUSION } from './block';
import { HEIGHT, COLUMN_VOLUME } from './constants';

const QSIZE = 1 << 20;
const queue = new Int32Array(QSIZE);

// neighbour offsets in column-array index space: -x, +x, -z, +z, -y, +y
// index = (y << 8) | (z << 4) | x  (y relative to MIN_Y)

/** Direction constants matching dir.ts: DOWN0 UP1 NORTH2 SOUTH3 WEST4 EAST5 */
function blockedByShape(from: number, to: number, dir: number): boolean {
  // dir: direction of travel from `from` to `to`
  const opp = dir ^ 1;
  if ((FLAGS[from] & F_SHAPE_OCCLUSION) && (FACE_OCC[from] >> dir) & 1) return true;
  if ((FLAGS[to] & F_SHAPE_OCCLUSION) && (FACE_OCC[to] >> opp) & 1) return true;
  return false;
}

/** `hasSky`: the dimension has sky light (the Nether doesn't) */
export function computeChunkLight(blocks: Uint16Array, hasSky = true): Uint8Array {
  const light = new Uint8Array(COLUMN_VOLUME);
  const sky = new Uint8Array(COLUMN_VOLUME);
  const blk = new Uint8Array(COLUMN_VOLUME);
  if (hasSky) skyLight(blocks, sky);
  // --- block light
  let head = 0, tail = 0;
  for (let i = 0; i < COLUMN_VOLUME; i++) {
    const e = EMISSION[blocks[i]];
    if (e > 0) {
      blk[i] = e;
      queue[tail++] = i;
    }
  }
  bfs(blocks, blk, head, tail, false);
  for (let i = 0; i < COLUMN_VOLUME; i++) light[i] = (sky[i] << 4) | blk[i];
  return light;
}

function skyLight(blocks: Uint16Array, sky: Uint8Array): void {
  // --- sky: direct columns
  const top = new Int16Array(256); // first y index (relative) at or above which sky is direct 15
  for (let z = 0; z < 16; z++)
    for (let x = 0; x < 16; x++) {
      let y = HEIGHT - 1;
      for (; y >= 0; y--) {
        const s = blocks[(y << 8) | (z << 4) | x];
        if (OPACITY[s] > 0 || (FLAGS[s] & F_SHAPE_OCCLUSION && FACE_OCC[s] & 3)) break;
        sky[(y << 8) | (z << 4) | x] = 15;
      }
      top[(z << 4) | x] = y + 1;
    }
  let head = 0, tail = 0;
  const push = (i: number) => {
    queue[tail] = i;
    tail = (tail + 1) & (QSIZE - 1);
  };
  // seeds: direct-sky cells beside taller neighbours, plus the lowest direct cell of each column
  for (let z = 0; z < 16; z++)
    for (let x = 0; x < 16; x++) {
      const t = top[(z << 4) | x];
      let maxN = t;
      if (x > 0) maxN = Math.max(maxN, top[(z << 4) | (x - 1)]);
      if (x < 15) maxN = Math.max(maxN, top[(z << 4) | (x + 1)]);
      if (z > 0) maxN = Math.max(maxN, top[((z - 1) << 4) | x]);
      if (z < 15) maxN = Math.max(maxN, top[((z + 1) << 4) | x]);
      if (t < HEIGHT) push((t << 8) | (z << 4) | x);
      for (let y = t + 1; y < Math.min(HEIGHT, maxN); y++) push((y << 8) | (z << 4) | x);
    }
  bfs(blocks, sky, head, tail, true);
}

function bfs(blocks: Uint16Array, arr: Uint8Array, head: number, tail: number, isSky: boolean): void {
  while (head !== tail) {
    const i = queue[head];
    head = (head + 1) & (QSIZE - 1);
    const L = arr[i];
    if (L <= 1) continue;
    const x = i & 15, z = (i >> 4) & 15, y = i >> 8;
    const from = blocks[i];
    for (let d = 0; d < 6; d++) {
      let j: number;
      // DOWN0 UP1 NORTH2 SOUTH3 WEST4 EAST5
      switch (d) {
        case 0: if (y === 0) continue; j = i - 256; break;
        case 1: if (y === HEIGHT - 1) continue; j = i + 256; break;
        case 2: if (z === 0) continue; j = i - 16; break;
        case 3: if (z === 15) continue; j = i + 16; break;
        case 4: if (x === 0) continue; j = i - 1; break;
        default: if (x === 15) continue; j = i + 1; break;
      }
      const to = blocks[j];
      const op = OPACITY[to];
      if (op >= 15) continue;
      if (blockedByShape(from, to, d)) continue;
      let nl = L - Math.max(1, op);
      if (isSky && d === 0 && L === 15 && op === 0) nl = 15;
      if (nl > arr[j]) {
        arr[j] = nl;
        queue[tail] = j;
        tail = (tail + 1) & (QSIZE - 1);
      }
    }
  }
}
