// Block patterns (vanilla BlockPattern and BlockPatternBuilder): a shape of blocks that can stand in the world any
// way round (all 24 orientations: upright, lying down, upside down), found from any one of its blocks. The golems
// are built from them (vanilla CarvedPumpkinBlock).

import type { World } from '../world/world';

type Dir = [number, number, number];
const DIRS: Dir[] = [[0, -1, 0], [0, 1, 0], [0, 0, -1], [0, 0, 1], [-1, 0, 0], [1, 0, 0]];

export interface PatternMatch {
  /** the world position of the pattern's block (i across, j down, k deep) */
  at(i: number, j: number, k: number): [number, number, number];
  readonly width: number;
  readonly height: number;
  readonly depth: number;
}

export class BlockPattern {
  readonly depth: number;
  readonly height: number;
  readonly width: number;
  /**
   * `aisles`: one list of rows (top first) per layer of depth; `where`: what each character must be (a space or a
   * character not listed matches anything)
   */
  constructor(private readonly aisles: string[][], private readonly where: Record<string, (st: number) => boolean>) {
    this.depth = aisles.length;
    this.height = aisles[0].length;
    this.width = aisles[0][0].length;
  }

  /** vanilla BlockPattern.translateAndRotate: the front top left, then across the palm, down the thumb, along the finger */
  private static place(x: number, y: number, z: number, finger: Dir, thumb: Dir, i: number, j: number, k: number): [number, number, number] {
    // (palm = finger × thumb)
    const px = finger[1] * thumb[2] - finger[2] * thumb[1];
    const py = finger[2] * thumb[0] - finger[0] * thumb[2];
    const pz = finger[0] * thumb[1] - finger[1] * thumb[0];
    return [x - thumb[0] * j + px * i + finger[0] * k, y - thumb[1] * j + py * i + finger[1] * k, z - thumb[2] * j + pz * i + finger[2] * k];
  }

  private matches(w: World, x: number, y: number, z: number, finger: Dir, thumb: Dir): PatternMatch | null {
    for (let i = 0; i < this.width; i++)
      for (let j = 0; j < this.height; j++)
        for (let k = 0; k < this.depth; k++) {
          const test = this.where[this.aisles[k][j][i]];
          if (!test) continue;
          const [bx, by, bz] = BlockPattern.place(x, y, z, finger, thumb, i, j, k);
          if (!test(w.getState(bx, by, bz))) return null;
        }
    return {
      at: (i, j, k) => BlockPattern.place(x, y, z, finger, thumb, i, j, k),
      width: this.width,
      height: this.height,
      depth: this.depth,
    };
  }

  /** vanilla BlockPattern.find: the pattern in any orientation with its front top left within its size of (x, y, z) */
  find(w: World, x: number, y: number, z: number): PatternMatch | null {
    const n = Math.max(this.width, this.height, this.depth);
    for (let dx = 0; dx < n; dx++)
      for (let dy = 0; dy < n; dy++)
        for (let dz = 0; dz < n; dz++)
          for (const f of DIRS)
            for (const t of DIRS) {
              if (t === f || (t[0] === -f[0] && t[1] === -f[1] && t[2] === -f[2])) continue;
              const m = this.matches(w, x + dx, y + dy, z + dz, f, t);
              if (m) return m;
            }
    return null;
  }
}
