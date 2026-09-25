// Where a new world's spawn is looked for first (vanilla Climate.SpawnFinder, aiming at
// OverworldBiomeBuilder.spawnTarget): the spot whose climate is closest to inland ground away from the rivers
// (continentalness -0.11..1, weirdness at least 0.16 either way, at the surface), with a pull back towards the origin
// that grows with the fourth power of the distance — sampled in rings round the origin 512 to 2048 blocks out, 512
// apart, then round the best of those 32 to 512 blocks out, 32 apart. Only the climate noise is sampled, a few
// milliseconds' work; the chunks round the spot are looked at afterwards (game/respawnLogic InitialSpawn).

import { SeedSource } from './noise';
import { OverworldRouter, newColumn } from './router';

/** vanilla Climate.quantizeCoord: climate values in whole ten-thousandths */
const quantize = (v: number): number => Math.trunc(Math.fround(Math.fround(v) * 10000));

/** vanilla Climate.Parameter.distance: how far the value is outside [min, max] */
function outside(v: number, min: number, max: number): number {
  const above = v - max, below = min - v;
  return above > 0 ? above : Math.max(below, 0);
}

/** vanilla Climate.Parameter.span(-1, 1) (FULL_RANGE), quantized */
const FULL = [quantize(-1), quantize(1)];
/** vanilla OverworldBiomeBuilder.spawnTarget: continentalness from inland's lower end to 1; weirdness either side of 0.16 */
const CONTINENTALNESS = [quantize(-0.11), quantize(1)];
const WEIRDNESS = [[quantize(-1), quantize(-0.16)], [quantize(0.16), quantize(1)]];

export class SpawnFinder {
  private readonly router: OverworldRouter;
  private readonly col = newColumn();

  constructor(seed: string | bigint) {
    this.router = new OverworldRouter(SeedSource.fromWorldSeed(seed));
  }

  /**
   * vanilla getSpawnPositionAndFitness: the climate's distance from the target (quantized and squared, the smaller of
   * its two points; depth taken as 0), plus 10000² times the fourth power of the distance from the origin over 2500
   */
  fitness(x: number, z: number): number {
    // (vanilla Climate.Sampler.sample: at the corner of the quart the block is in)
    const c = this.router.column(x & ~3, z & ~3, this.col);
    const t = quantize(c.temperature), h = quantize(c.humidity), cont = quantize(c.continents), e = quantize(c.erosion), w = quantize(c.ridges);
    const sq = (v: number) => v * v;
    const common = sq(outside(t, FULL[0], FULL[1])) + sq(outside(h, FULL[0], FULL[1])) + sq(outside(cont, CONTINENTALNESS[0], CONTINENTALNESS[1])) + sq(outside(e, FULL[0], FULL[1]));
    let fit = Infinity;
    for (const [lo, hi] of WEIRDNESS) fit = Math.min(fit, common + sq(outside(w, lo, hi)));
    const d = (x * x + z * z) / (2500 * 2500);
    return Math.trunc(1e8 * d * d) + fit;
  }

  /** vanilla Climate.SpawnFinder: the origin, then the two radial searches round the best spot so far */
  find(): [number, number] {
    let best: [number, number, number] = [0, 0, this.fitness(0, 0)];
    const radial = (max: number, min: number) => {
      const [x0, z0] = best;
      let a = 0;
      let r = min;
      while (r <= max) {
        const x = x0 + Math.trunc(Math.sin(a) * r), z = z0 + Math.trunc(Math.cos(a) * r);
        const f = this.fitness(x, z);
        if (f < best[2]) best = [x, z, f];
        // (vanilla: floats)
        a = Math.fround(a + Math.fround(min / r));
        if (a > Math.PI * 2) {
          a = 0;
          r = Math.fround(r + min);
        }
      }
    };
    radial(2048, 512);
    radial(512, 32);
    return [best[0], best[1]];
  }
}
