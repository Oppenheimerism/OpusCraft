// The pistons' moving blocks (vanilla PistonHeadRenderer): each moving_piston's block drawn on its way from where it
// was to where it's going — a head short while it's still inside its base, a retracting piston's base drawn extended
// behind its head — shaded per face as the chunk meshes shade blocks. A block that has just arrived is drawn on where
// it stopped until its section's new mesh is in, so nothing blinks out in between.

import { EntityBatch, PoseStack } from './entityRenderer';
import type { ItemRenderer } from './itemRenderer';
import type { Camera } from './renderer';
import type { Frustum } from '../core/math';
import type { Level } from '../game/level';
import type { World } from '../world/world';
import { getStateModels } from './mesher';
import { BLOCKS, STATE_BLOCK, LAYER, Layer, EMISSION, getBlock } from '../world/block';
import { DX, DY, DZ, OPPOSITE } from '../world/dir';
import { MIN_Y } from '../world/constants';
import { PistonMovingBlockEntity } from '../game/redstone/piston';

/** vanilla ClientLevel.getShade (down, up, north, south, west, east); the Nether's tops and bottoms are 0.9 */
const SHADE = [0.5, 1.0, 0.8, 0.8, 0.6, 0.6];
const SHADE_FLAT = [0.9, 0.9, 0.8, 0.8, 0.6, 0.6];
const NORMALS = [[0, -1, 0], [0, 1, 0], [0, 0, -1], [0, 0, 1], [-1, 0, 0], [1, 0, 0]];
/** vanilla BlockEntityRenderer.getViewDistance */
const VIEW_DISTANCE = 64;

interface Ghost {
  x: number;
  y: number;
  z: number;
  state: number;
}

export class PistonRenderer {
  private readonly pose = new PoseStack();
  /** the moving blocks drawn last frame */
  private seen = new Set<PistonMovingBlockEntity>();
  /** blocks that have arrived, until their section is meshed again */
  private ghosts: Ghost[] = [];

  render(b: EntityBatch, items: ItemRenderer, level: Level, cam: Camera, partial: number, frustum: Frustum): void {
    const world = level.world;
    const tex = items.atlas.texture;
    if (!tex) return;
    const shade = world.dim.effects.constantAmbientLight ? SHADE_FLAT : SHADE;
    const head = getBlock('piston_head');
    const now = new Set<PistonMovingBlockEntity>();
    for (const be of world.blockEntities.values()) {
      if (!(be instanceof PistonMovingBlockEntity) || be.removed || !be.moved) continue;
      now.add(be);
      const dx = be.x - cam.x, dy = be.y - cam.y, dz = be.z - cam.z;
      if ((dx + 0.5) ** 2 + (dy + 0.5) ** 2 + (dz + 0.5) ** 2 > VIEW_DISTANCE * VIEW_DISTANCE) continue;
      if (!frustum.testBox(dx - 1, dy - 1, dz - 1, dx + 2, dy + 2, dz + 2)) continue;
      const p = be.progressAt(partial);
      const f = be.extendedProgress(p);
      const ox = dx + DX[be.direction] * f, oy = dy + DY[be.direction] * f, oz = dz + DZ[be.direction] * f;
      // (lit as where it came from)
      const back = OPPOSITE[be.movementDirection];
      const lx = be.x + DX[back], ly = be.y + DY[back], lz = be.z + DZ[back];
      let st = be.moved;
      if (STATE_BLOCK[st] === head.id) {
        this.drawBlock(b, tex, world, head.with(st, 'short', p <= 0.5), ox, oy, oz, lx, ly, lz, shade);
      } else if (be.source && !be.extending) {
        const blk = BLOCKS[STATE_BLOCK[st]];
        const h = head.state({ type: blk.name === 'sticky_piston' ? 'sticky' : 'normal', facing: blk.get(st, 'facing'), short: p >= 0.5 });
        this.drawBlock(b, tex, world, h, ox, oy, oz, lx, ly, lz, shade);
        st = blk.with(st, 'extended', true);
        this.drawBlock(b, tex, world, st, dx, dy, dz, be.x, be.y, be.z, shade);
      } else this.drawBlock(b, tex, world, st, ox, oy, oz, lx, ly, lz, shade);
    }
    // what's arrived since last frame stays drawn where it stopped till the mesh has it
    for (const be of this.seen) {
      if (now.has(be) || !be.removed) continue;
      const st = world.getState(be.x, be.y, be.z);
      if (st !== 0 && STATE_BLOCK[st] !== getBlock('moving_piston').id) this.ghosts.push({ x: be.x, y: be.y, z: be.z, state: st });
    }
    this.seen = now;
    this.ghosts = this.ghosts.filter((g) => {
      if (world.getState(g.x, g.y, g.z) !== g.state) return false;
      const c = world.getChunk(g.x >> 4, g.z >> 4);
      const bit = 1 << ((g.y - MIN_Y) >> 4);
      if (!c || !((c.dirty | c.meshing) & bit)) return false;
      const dx = g.x - cam.x, dy = g.y - cam.y, dz = g.z - cam.z;
      if (frustum.testBox(dx, dy, dz, dx + 1, dy + 1, dz + 1)) this.drawBlock(b, tex, world, g.state, dx, dy, dz, g.x, g.y, g.z, shade);
      return true;
    });
  }

  /** a block's model at (x, y, z) (camera-relative), lit by the light at (lx, ly, lz) */
  private drawBlock(b: EntityBatch, tex: WebGLTexture, world: World, st: number, x: number, y: number, z: number, lx: number, ly: number, lz: number, shade: number[]): void {
    const models = getStateModels(st);
    if (!models) return;
    const layer = LAYER[st];
    if (layer === Layer.NONE) return;
    b.setOverlay(0, 0, 0, 0);
    b.begin({ texture: tex, cutoff: layer === Layer.SOLID ? -1 : 0.1, blend: layer === Layer.TRANSLUCENT, cull: true, lit: false, useLightmap: true });
    const l = world.getLight(lx, ly, lz);
    b.lightS = (l >> 4) * 16;
    b.lightB = Math.max(l & 15, EMISSION[st]) * 16;
    const tint = tintOf(world, st, lx, lz);
    const tr = ((tint >> 16) & 255) / 255, tg = ((tint >> 8) & 255) / 255, tb = (tint & 255) / 255;
    const pose = this.pose;
    pose.reset();
    pose.translate(x, y, z);
    const parts = models.multipart ? models.variants : [models.variants[0]];
    for (const m of parts)
      for (const q of m.quads) {
        const s = q.shade ? shade[q.dir] : 1;
        const n = NORMALS[q.dir];
        const t = q.tint >= 0;
        b.quad(pose, Array.from(q.pos), Array.from(q.uv), n[0], n[1], n[2], (t ? tr : 1) * s, (t ? tg : 1) * s, (t ? tb : 1) * s, 1);
      }
  }
}

/** the colour a tinted block takes here (grass, foliage and water by biome, as the chunk meshes have them) */
function tintOf(world: World, st: number, x: number, z: number): number {
  const b = BLOCKS[STATE_BLOCK[st]];
  if (b.tint === 'none') return 0xffffff;
  if (b.tint === 'birch') return 0x80a755;
  if (b.tint === 'spruce') return 0x619961;
  if (b.tint === 'lily') return 0x208030;
  if (b.tint === 'constant') return b.s.tintColor ?? 0xffffff;
  const c = world.getChunk(x >> 4, z >> 4);
  if (!c) return 0xffffff;
  world.ensureTints(c);
  const i = ((z & 15) << 4) | (x & 15);
  if (b.tint === 'grass') return c.grassTint![i];
  if (b.tint === 'foliage') return c.foliageTint![i];
  if (b.tint === 'water') return c.waterTint![i];
  return 0xffffff;
}
