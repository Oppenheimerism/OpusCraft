// Client-side ambient block effects (vanilla ClientLevel.animateTick): every
// tick, 667 random blocks within 16 and 667 within 32 of the player get their
// Block.animateTick / FluidState.animateTick — torch smoke and flames, fire
// crackle and smoke, lava embers and pops, the murmur of flowing water, lit
// furnaces, rain dripping off leaves, dust sifting under sand and gravel, and
// water or lava dripping through thin ceilings.

import { BLOCKS, STATE_BLOCK, FLAGS, COLLISION, FACE_OCC, F_AIR, F_OPAQUE, F_REPLACEABLE, F_WATER, F_LAVA } from '../world/block';
import { DOWN, UP } from '../world/dir';
import { fluidStateOf } from './fluidTicks';
import { canBurn } from './fire';
import type { Level } from './level';

const enum K {
  NONE,
  TORCH,
  WALL_TORCH,
  FIRE,
  FURNACE,
  LEAVES,
  FALLING,
}

let KIND: Uint8Array | null = null;
/** vanilla FallingBlock.getDustColor */
const DUST: Record<string, number> = { sand: 0xdbd3a0, red_sand: 0xa95821, gravel: 0x807c7b };

function kindOf(st: number): number {
  if (!KIND) {
    KIND = new Uint8Array(BLOCKS.length);
    BLOCKS.forEach((b, i) => {
      const n = b.name;
      KIND![i] =
        n === 'torch' ? K.TORCH
        : n === 'wall_torch' ? K.WALL_TORCH
        : n === 'fire' ? K.FIRE
        : n === 'furnace' ? K.FURNACE
        : n.endsWith('_leaves') ? K.LEAVES
        : n in DUST || n.endsWith('_concrete_powder') ? K.FALLING
        : K.NONE;
    });
  }
  return KIND[STATE_BLOCK[st]];
}

const STEP: Record<string, [number, number]> = { north: [0, -1], south: [0, 1], west: [-1, 0], east: [1, 0] };

function shapeMaxY(st: number): number {
  const c = COLLISION[st];
  if (!c || !c.length) return 0;
  let m = 0;
  for (const b of c) m = Math.max(m, b[4]);
  return m;
}

export class AmbientTicker {
  constructor(private readonly level: Level) {}

  tick(px: number, py: number, pz: number): void {
    const cx = Math.floor(px), cy = Math.floor(py), cz = Math.floor(pz);
    for (let j = 0; j < 667; j++) {
      this.at(cx, cy, cz, 16);
      this.at(cx, cy, cz, 32);
    }
  }

  private at(cx: number, cy: number, cz: number, range: number): void {
    const r = Math.random;
    const x = cx + Math.floor(r() * range) - Math.floor(r() * range);
    const y = cy + Math.floor(r() * range) - Math.floor(r() * range);
    const z = cz + Math.floor(r() * range) - Math.floor(r() * range);
    const w = this.level.world;
    const st = w.getState(x, y, z);
    if (st === 0) return;
    switch (kindOf(st)) {
      case K.TORCH:
        this.torch(x + 0.5, y + 0.7, z + 0.5);
        break;
      case K.WALL_TORCH: {
        // vanilla WallTorchBlock: the flame sits out from the wall
        const b = BLOCKS[STATE_BLOCK[st]];
        const [fx, fz] = STEP[b.get<string>(st, 'facing')];
        this.torch(x + 0.5 - 0.27 * fx, y + 0.7 + 0.22, z + 0.5 - 0.27 * fz);
        break;
      }
      case K.FIRE:
        this.fire(x, y, z);
        break;
      case K.FURNACE:
        this.furnace(x, y, z, st);
        break;
      case K.LEAVES:
        // vanilla LeavesBlock.animateTick: rain drips through the canopy
        if (Math.floor(r() * 15) === 1 && this.level.isRainingAt(x, y + 1, z)) {
          const below = w.getState(x, y - 1, z);
          if (!(FLAGS[below] & F_OPAQUE) || !((FACE_OCC[below] >> UP) & 1)) this.below(x, y, z, 'dripping_water');
        }
        break;
      case K.FALLING:
        // vanilla FallingBlock.animateTick: dust sifts down when there's nothing underneath
        if (Math.floor(r() * 16) === 0) {
          const below = w.getState(x, y - 1, z);
          if (FLAGS[below] & (F_AIR | F_REPLACEABLE | F_WATER | F_LAVA) || BLOCKS[STATE_BLOCK[below]].name === 'fire') {
            const n = BLOCKS[STATE_BLOCK[st]].name;
            const color = DUST[n] ?? BLOCKS[STATE_BLOCK[st]].s.mapColor ?? 0x999999;
            this.level.particles.fallingDust?.(x + r(), y - 0.05, z + r(), color);
          }
        }
        break;
    }
    const f = FLAGS[st];
    if (f & (F_WATER | F_LAVA)) this.fluid(x, y, z, st);
  }

  private torch(x: number, y: number, z: number): void {
    const ps = this.level.particles;
    ps.spawn?.('smoke', x, y, z, 0, 0, 0);
    ps.spawn?.('flame', x, y, z, 0, 0, 0);
  }

  /** vanilla BaseFireBlock.animateTick */
  private fire(x: number, y: number, z: number): void {
    const r = Math.random;
    const lvl = this.level, w = lvl.world;
    if (Math.floor(r() * 24) === 0) lvl.sound.play('block.fire.ambient', x + 0.5, y + 0.5, z + 0.5, 1 + r(), r() * 0.7 + 0.3);
    const below = w.getState(x, y - 1, z);
    const smoke = (px: number, py: number, pz: number) => lvl.particles.spawn?.('large_smoke', px, py, pz, 0, 0, 0);
    if (!canBurn(below) && !((FACE_OCC[below] >> UP) & 1)) {
      if (canBurn(w.getState(x - 1, y, z))) for (let j = 0; j < 2; j++) smoke(x + r() * 0.1, y + r(), z + r());
      if (canBurn(w.getState(x + 1, y, z))) for (let j = 0; j < 2; j++) smoke(x + 1 - r() * 0.1, y + r(), z + r());
      if (canBurn(w.getState(x, y, z - 1))) for (let j = 0; j < 2; j++) smoke(x + r(), y + r(), z + r() * 0.1);
      if (canBurn(w.getState(x, y, z + 1))) for (let j = 0; j < 2; j++) smoke(x + r(), y + r(), z + 1 - r() * 0.1);
      if (canBurn(w.getState(x, y + 1, z))) for (let j = 0; j < 2; j++) smoke(x + r(), y + 1 - r() * 0.1, z + r());
    } else {
      for (let i = 0; i < 3; i++) smoke(x + r(), y + r() * 0.5 + 0.5, z + r());
    }
  }

  /** vanilla AbstractFurnaceBlock / FurnaceBlock.animateTick */
  private furnace(x: number, y: number, z: number, st: number): void {
    const b = BLOCKS[STATE_BLOCK[st]];
    if (!b.get(st, 'lit')) return;
    const r = Math.random;
    const lvl = this.level;
    if (r() < 0.1) lvl.sound.play('block.furnace.fire_crackle', x + 0.5, y, z + 0.5, 1, 1);
    const [fx, fz] = STEP[b.get<string>(st, 'facing')];
    const d4 = r() * 0.6 - 0.3;
    const d5 = fx !== 0 ? fx * 0.52 : d4;
    const d6 = (r() * 6) / 16;
    const d7 = fz !== 0 ? fz * 0.52 : d4;
    lvl.particles.spawn?.('smoke', x + 0.5 + d5, y + d6, z + 0.5 + d7, 0, 0, 0);
    lvl.particles.spawn?.('flame', x + 0.5 + d5, y + d6, z + 0.5 + d7, 0, 0, 0);
  }

  /** vanilla WaterFluid / LavaFluid.animateTick and ClientLevel drip particles */
  private fluid(x: number, y: number, z: number, st: number): void {
    const r = Math.random;
    const lvl = this.level, w = lvl.world;
    const fs = fluidStateOf(st);
    if (fs.type === 0) return;
    const lava = (FLAGS[st] & F_LAVA) !== 0;
    if (lava) {
      const above = w.getState(x, y + 1, z);
      if (FLAGS[above] & F_AIR) {
        if (Math.floor(r() * 100) === 0) {
          const px = x + r(), py = y + 1, pz = z + r();
          lvl.particles.spawn?.('lava', px, py, pz, 0, 0, 0);
          lvl.sound.play('block.lava.pop', px, py, pz, 0.2 + r() * 0.2, 0.9 + r() * 0.15);
        }
        if (Math.floor(r() * 200) === 0) lvl.sound.play('block.lava.ambient', x, y, z, 0.2 + r() * 0.2, 0.9 + r() * 0.15);
      }
    } else if (!fs.source && !fs.falling) {
      if (Math.floor(r() * 64) === 0) lvl.sound.play('block.water.ambient', x + 0.5, y + 0.5, z + 0.5, r() * 0.25 + 0.75, r() + 0.5);
    }
    if (Math.floor(r() * 10) === 0) this.drip(x, y, z, st, lava ? 'dripping_lava' : 'dripping_water');
  }

  /** vanilla ClientLevel.trySpawnDripParticles: seep through the block below the fluid */
  private drip(x: number, y: number, z: number, fluidSt: number, kind: string): void {
    const w = this.level.world;
    const sturdyDown = ((FACE_OCC[fluidSt] >> DOWN) & 1) === 1;
    const by = y - 1;
    const below = w.getState(x, by, z);
    if (FLAGS[below] & (F_WATER | F_LAVA)) return;
    const top = shapeMaxY(below);
    const n = BLOCKS[STATE_BLOCK[below]].name;
    if (top < 1) {
      if (sturdyDown) this.spawnIn(x, x + 1, z, z + 1, by + 1 - 0.05, kind);
      return;
    }
    // glass-like blocks don't let fluids seep through (BlockTags.IMPERMEABLE)
    if (n.endsWith('glass') || n === 'barrier') return;
    const boxes = COLLISION[below]!;
    let minY = 1, x0 = 1, x1 = 0, z0 = 1, z1 = 0;
    for (const b of boxes) {
      minY = Math.min(minY, b[1]);
      x0 = Math.min(x0, b[0]);
      x1 = Math.max(x1, b[3]);
      z0 = Math.min(z0, b[2]);
      z1 = Math.max(z1, b[5]);
    }
    if (minY > 0) {
      this.spawnIn(x + x0, x + x1, z + z0, z + z1, by + minY - 0.05, kind);
      return;
    }
    const under = w.getState(x, by - 1, z);
    if (shapeMaxY(under) < 1 && !(FLAGS[under] & (F_WATER | F_LAVA))) this.spawnIn(x + x0, x + x1, z + z0, z + z1, by - 0.05, kind);
  }

  private spawnIn(x0: number, x1: number, z0: number, z1: number, y: number, kind: string): void {
    this.level.particles.spawn?.(kind, x0 + Math.random() * (x1 - x0), y, z0 + Math.random() * (z1 - z0), 0, 0, 0);
  }

  /** vanilla ParticleUtils.spawnParticleBelow */
  private below(x: number, y: number, z: number, kind: string): void {
    this.level.particles.spawn?.(kind, x + Math.random(), y - 0.05, z + Math.random(), 0, 0, 0);
  }
}
