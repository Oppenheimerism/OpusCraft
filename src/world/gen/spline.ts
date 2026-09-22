// Cubic Hermite splines over climate coordinates, following the structure of
// vanilla's TerrainProvider (1.18+ overworld offset / factor / jaggedness).

export interface ClimatePoint {
  continents: number;
  erosion: number;
  ridges: number;
  ridgesFolded: number;
}

export type Coord = (p: ClimatePoint) => number;
export type SplineValue = number | Spline;

const C: Coord = (p) => p.continents;
const E: Coord = (p) => p.erosion;
const W: Coord = (p) => p.ridges;
const PV: Coord = (p) => p.ridgesFolded;

export class Spline {
  readonly locations: number[] = [];
  readonly values: SplineValue[] = [];
  readonly derivatives: number[] = [];

  constructor(readonly coord: Coord, readonly transform: ((v: number) => number) | null = null) {}

  add(loc: number, value: SplineValue, derivative = 0): this {
    this.locations.push(loc);
    this.values.push(value);
    this.derivatives.push(derivative);
    return this;
  }

  apply(p: ClimatePoint): number {
    const f = this.coord(p);
    const locs = this.locations;
    const n = locs.length;
    // find last index with locs[i] <= f
    let i = -1;
    let lo = 0, hi = n;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (f < locs[mid]) hi = mid;
      else lo = mid + 1;
    }
    i = lo - 1;
    let out: number;
    if (i < 0) {
      const v = val(this.values[0], p);
      const d = this.derivatives[0];
      out = d === 0 ? v : v + d * (f - locs[0]);
    } else if (i === n - 1) {
      const v = val(this.values[n - 1], p);
      const d = this.derivatives[n - 1];
      out = d === 0 ? v : v + d * (f - locs[n - 1]);
    } else {
      const x1 = locs[i], x2 = locs[i + 1];
      const t = (f - x1) / (x2 - x1);
      const v1 = val(this.values[i], p), v2 = val(this.values[i + 1], p);
      const d1 = this.derivatives[i], d2 = this.derivatives[i + 1];
      const a = d1 * (x2 - x1) - (v2 - v1);
      const b = -d2 * (x2 - x1) + (v2 - v1);
      out = v1 + t * (v2 - v1) + t * (1 - t) * (a + t * (b - a));
    }
    return this.transform ? this.transform(out) : out;
  }
}

function val(v: SplineValue, p: ClimatePoint): number {
  return typeof v === 'number' ? v : v.apply(p);
}

// ---------------------------------------------------------------------------
// Terrain provider

export function peaksAndValleys(w: number): number {
  return -(Math.abs(Math.abs(w) - 0.6666667) - 0.33333334) * 3;
}

function lerp(t: number, a: number, b: number): number {
  return a + t * (b - a);
}

function slope(y1: number, y2: number, x1: number, x2: number): number {
  return (y2 - y1) / (x2 - x1);
}

function mountainContinentalness(heightFactor: number, f1: number, f2: number): number {
  const f4 = 1 - (1 - f1) * 0.5;
  const f5 = 0.5 * (1 - f1);
  const f6 = (heightFactor + 1.17) * 0.46082947;
  const f7 = f6 * f4 - f5;
  return heightFactor < f2 ? Math.max(f7, -0.2222) : Math.max(f7, 0);
}

function mountainRidgeZeroPoint(f: number): number {
  const f3 = 1 - (1 - f) * 0.5;
  const f4 = 0.5 * (1 - f);
  return f4 / (0.46082947 * f3) - 1.17;
}

// NOTE: the offset spline's "ridges" coordinate is the folded ridges (PV).
function mountainRidgeSpline(f: number, useMaxSlope: boolean): Spline {
  const s = new Spline(PV);
  const f3 = mountainContinentalness(-1, f, -0.7);
  const f5 = mountainContinentalness(1, f, -0.7);
  const f6 = mountainRidgeZeroPoint(f);
  if (-0.65 < f6 && f6 < 1) {
    const f14 = mountainContinentalness(-0.65, f, -0.7);
    const f10 = mountainContinentalness(-0.75, f, -0.7);
    const f11 = slope(f3, f10, -1, -0.75);
    s.add(-1, f3, f11);
    s.add(-0.75, f10);
    s.add(-0.65, f14);
    const f12 = mountainContinentalness(f6, f, -0.7);
    const f13 = slope(f12, f5, f6, 1);
    s.add(f6 - 0.01, f12);
    s.add(f6, f12, f13);
    s.add(1, f5, f13);
  } else {
    const f8 = slope(f3, f5, -1, 1);
    if (useMaxSlope) {
      s.add(-1, Math.max(0.2, f3));
      s.add(0, lerp(0.5, f3, f5), f8);
    } else {
      s.add(-1, f3, f8);
    }
    s.add(1, f5, f8);
  }
  return s;
}

function ridgeSpline(f: number, f1: number, f2: number, f3: number, f4: number, f5: number): Spline {
  const f6 = Math.max(0.5 * (f1 - f), f5);
  const f7 = 5 * (f2 - f1);
  return new Spline(PV)
    .add(-1, f, f6)
    .add(-0.4, f1, Math.min(f6, f7))
    .add(0, f2, f7)
    .add(0.4, f3, 2 * (f3 - f2))
    .add(1, f4, 0.7 * (f4 - f3));
}

function erosionOffsetSpline(f1: number, f2: number, f3: number, f4: number, f5: number, f6: number, extended: boolean, useMaxSlope: boolean): Spline {
  const s0 = mountainRidgeSpline(lerp(f4, 0.6, 1.5), useMaxSlope);
  const s1 = mountainRidgeSpline(lerp(f4, 0.6, 1.0), useMaxSlope);
  const s2 = mountainRidgeSpline(f4, useMaxSlope);
  const s3 = ridgeSpline(f1 - 0.15, 0.5 * f4, lerp(0.5, 0.5, 0.5) * f4, 0.5 * f4, 0.6 * f4, 0.5);
  const s4 = ridgeSpline(f1, f5 * f4, f2 * f4, 0.5 * f4, 0.6 * f4, 0.5);
  const s5 = ridgeSpline(f1, f5, f5, f2, f3, 0.5);
  const s6 = ridgeSpline(f1, f5, f5, f2, f3, 0.5);
  const s7 = new Spline(PV).add(-1, f1).add(-0.4, s5).add(0, f3 + 0.07);
  const s8 = ridgeSpline(-0.02, f6, f6, f2, f3, 0);
  const b = new Spline(E).add(-0.85, s0).add(-0.7, s1).add(-0.4, s2).add(-0.35, s3).add(-0.1, s4).add(0.2, s5);
  if (extended) b.add(0.4, s6).add(0.45, s7).add(0.55, s7).add(0.58, s6);
  b.add(0.7, s8);
  return b;
}

export function overworldOffset(): Spline {
  const s = erosionOffsetSpline(-0.15, 0, 0, 0.1, 0, -0.03, false, false);
  const s1 = erosionOffsetSpline(-0.1, 0.03, 0.1, 0.1, 0.01, -0.03, false, false);
  const s2 = erosionOffsetSpline(-0.1, 0.03, 0.1, 0.7, 0.01, -0.03, true, true);
  const s3 = erosionOffsetSpline(-0.05, 0.03, 0.1, 1.0, 0.01, 0.01, true, true);
  return new Spline(C)
    .add(-1.1, 0.044)
    .add(-1.02, -0.2222)
    .add(-0.51, -0.2222)
    .add(-0.44, -0.12)
    .add(-0.18, -0.12)
    .add(-0.16, s)
    .add(-0.15, s)
    .add(-0.1, s1)
    .add(0.25, s2)
    .add(1.0, s3);
}

function erosionFactor(f: number, higherValues: boolean): Spline {
  const s0 = new Spline(W).add(-0.2, 6.3).add(0.2, f);
  const b = new Spline(E)
    .add(-0.6, s0)
    .add(-0.5, new Spline(W).add(-0.05, 6.3).add(0.05, 2.67))
    .add(-0.35, s0)
    .add(-0.25, s0)
    .add(-0.1, new Spline(W).add(-0.05, 2.67).add(0.05, 6.3))
    .add(0.03, s0);
  if (higherValues) {
    const s1 = new Spline(W).add(0, f).add(0.1, 0.625);
    const s2 = new Spline(PV).add(-0.9, f).add(-0.69, s1);
    b.add(0.35, f).add(0.45, s2).add(0.55, s2).add(0.62, f);
  } else {
    const s3 = new Spline(PV).add(-0.7, s0).add(-0.15, 1.37);
    const s4 = new Spline(PV).add(0.45, s0).add(0.7, 1.56);
    b.add(0.05, s4).add(0.4, s4).add(0.45, s3).add(0.55, s3).add(0.58, f);
  }
  return b;
}

export function overworldFactor(): Spline {
  return new Spline(C)
    .add(-0.19, 3.95)
    .add(-0.15, erosionFactor(6.25, true))
    .add(-0.1, erosionFactor(5.47, true))
    .add(0.03, erosionFactor(5.08, true))
    .add(0.06, erosionFactor(4.69, false));
}

function weirdnessJaggedness(f: number): Spline {
  return new Spline(W).add(-0.01, 0.63 * f).add(0.01, 0.3 * f);
}

function ridgeJaggedness(f: number, f1: number): Spline {
  const f2 = peaksAndValleys(0.4);
  const f3 = peaksAndValleys(0.56666666);
  const f4 = (f2 + f3) / 2;
  const s = new Spline(PV);
  s.add(f2, 0);
  s.add(f4, f1 > 0 ? weirdnessJaggedness(f1) : 0);
  s.add(1, f > 0 ? weirdnessJaggedness(f) : 0);
  return s;
}

function erosionJaggedness(f: number, f1: number, f2: number, f3: number): Spline {
  const s0 = ridgeJaggedness(f, f2);
  const s1 = ridgeJaggedness(f1, f3);
  return new Spline(E).add(-1, s0).add(-0.78, s1).add(-0.5775, s1).add(-0.375, 0);
}

export function overworldJaggedness(): Spline {
  return new Spline(C).add(-0.11, 0).add(0.03, erosionJaggedness(1, 0.5, 0, 0)).add(0.65, erosionJaggedness(1, 1, 1, 0));
}
