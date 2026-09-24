// Axis-aligned bounding boxes with vanilla-style collision offset computation.

export class AABB {
  constructor(
    public minX: number,
    public minY: number,
    public minZ: number,
    public maxX: number,
    public maxY: number,
    public maxZ: number,
  ) {}

  static ofSize(cx: number, y: number, cz: number, w: number, h: number): AABB {
    return new AABB(cx - w / 2, y, cz - w / 2, cx + w / 2, y + h, cz + w / 2);
  }

  clone(): AABB {
    return new AABB(this.minX, this.minY, this.minZ, this.maxX, this.maxY, this.maxZ);
  }

  move(dx: number, dy: number, dz: number): AABB {
    return new AABB(this.minX + dx, this.minY + dy, this.minZ + dz, this.maxX + dx, this.maxY + dy, this.maxZ + dz);
  }

  expandTowards(dx: number, dy: number, dz: number): AABB {
    let x0 = this.minX, y0 = this.minY, z0 = this.minZ, x1 = this.maxX, y1 = this.maxY, z1 = this.maxZ;
    if (dx < 0) x0 += dx; else x1 += dx;
    if (dy < 0) y0 += dy; else y1 += dy;
    if (dz < 0) z0 += dz; else z1 += dz;
    return new AABB(x0, y0, z0, x1, y1, z1);
  }

  inflate(x: number, y = x, z = x): AABB {
    return new AABB(this.minX - x, this.minY - y, this.minZ - z, this.maxX + x, this.maxY + y, this.maxZ + z);
  }

  intersects(o: AABB): boolean {
    return this.minX < o.maxX && this.maxX > o.minX && this.minY < o.maxY && this.maxY > o.minY && this.minZ < o.maxZ && this.maxZ > o.minZ;
  }

  intersectsRaw(minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number): boolean {
    return this.minX < maxX && this.maxX > minX && this.minY < maxY && this.maxY > minY && this.minZ < maxZ && this.maxZ > minZ;
  }

  contains(x: number, y: number, z: number): boolean {
    return x >= this.minX && x < this.maxX && y >= this.minY && y < this.maxY && z >= this.minZ && z < this.maxZ;
  }

  get centerX(): number {
    return (this.minX + this.maxX) / 2;
  }
  get centerY(): number {
    return (this.minY + this.maxY) / 2;
  }
  get centerZ(): number {
    return (this.minZ + this.maxZ) / 2;
  }

  /**
   * Ray intersection; returns t in [0,1] along (x0..x1) and hit face, or null. A ray that starts on a face (to
   * within 1e-7) and goes in hits it at once (vanilla AABB.clipPoint: d > -1.0E-7).
   */
  clip(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): { t: number; face: number } | null {
    const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
    let tmin = 0, tmax = 1, face = -1;
    const axes: [number, number, number, number, number, number][] = [
      [x0, dx, this.minX, this.maxX, 4, 5],
      [y0, dy, this.minY, this.maxY, 0, 1],
      [z0, dz, this.minZ, this.maxZ, 2, 3],
    ];
    for (const [o, d, lo, hi, fLo, fHi] of axes) {
      if (Math.abs(d) < 1e-12) {
        if (o < lo || o > hi) return null;
        continue;
      }
      let t1 = (lo - o) / d, t2 = (hi - o) / d;
      let f1 = fLo, f2 = fHi;
      if (t1 > t2) {
        [t1, t2] = [t2, t1];
        [f1, f2] = [f2, f1];
      }
      if (t1 > tmin || (face < 0 && t1 > -1e-7)) {
        tmin = Math.max(tmin, t1);
        face = f1;
      }
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return null;
    }
    if (face < 0) return null;
    return { t: tmin, face };
  }
}

const EPS = 1.0e-7;

/** Vanilla Shapes.collide for one axis: clamp `d` so `box` moving along axis doesn't enter `boxes`. */
export function collideAxis(axis: 0 | 1 | 2, box: AABB, boxes: AABB[], d: number): number {
  if (Math.abs(d) < EPS) return 0;
  for (const b of boxes) {
    if (axis === 0) {
      if (box.maxY <= b.minY + EPS || box.minY >= b.maxY - EPS || box.maxZ <= b.minZ + EPS || box.minZ >= b.maxZ - EPS) continue;
      if (d > 0 && box.maxX <= b.minX + EPS) {
        const m = b.minX - box.maxX;
        if (m < d) d = m;
      } else if (d < 0 && box.minX >= b.maxX - EPS) {
        const m = b.maxX - box.minX;
        if (m > d) d = m;
      }
    } else if (axis === 1) {
      if (box.maxX <= b.minX + EPS || box.minX >= b.maxX - EPS || box.maxZ <= b.minZ + EPS || box.minZ >= b.maxZ - EPS) continue;
      if (d > 0 && box.maxY <= b.minY + EPS) {
        const m = b.minY - box.maxY;
        if (m < d) d = m;
      } else if (d < 0 && box.minY >= b.maxY - EPS) {
        const m = b.maxY - box.minY;
        if (m > d) d = m;
      }
    } else {
      if (box.maxX <= b.minX + EPS || box.minX >= b.maxX - EPS || box.maxY <= b.minY + EPS || box.minY >= b.maxY - EPS) continue;
      if (d > 0 && box.maxZ <= b.minZ + EPS) {
        const m = b.minZ - box.maxZ;
        if (m < d) d = m;
      } else if (d < 0 && box.minZ >= b.maxZ - EPS) {
        const m = b.maxZ - box.minZ;
        if (m > d) d = m;
      }
    }
  }
  return Math.abs(d) < EPS ? 0 : d;
}

/** Vanilla Entity.collideWithShapes ordering: Y, then the larger of X/Z last. */
export function collideWithBoxes(dx: number, dy: number, dz: number, box: AABB, boxes: AABB[]): [number, number, number] {
  if (boxes.length === 0) return [dx, dy, dz];
  if (dy !== 0) {
    dy = collideAxis(1, box, boxes, dy);
    if (dy !== 0) box = box.move(0, dy, 0);
  }
  const zFirst = Math.abs(dx) < Math.abs(dz);
  if (zFirst && dz !== 0) {
    dz = collideAxis(2, box, boxes, dz);
    if (dz !== 0) box = box.move(0, 0, dz);
  }
  if (dx !== 0) {
    dx = collideAxis(0, box, boxes, dx);
    if (!zFirst && dx !== 0) box = box.move(dx, 0, 0);
  }
  if (!zFirst && dz !== 0) dz = collideAxis(2, box, boxes, dz);
  return [dx, dy, dz];
}
