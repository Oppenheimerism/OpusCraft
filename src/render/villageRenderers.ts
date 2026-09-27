// Block entity renderers of the village blocks: vanilla BellRenderer (the bell under its frame, swinging after a
// ring), LecternRenderer (the open book on a lectern), CampfireRenderer (the food cooking on it) and BannerRenderer
// (render/bannerRenderer.ts). Drawn with the entity batch after the entities, like the spawner's mob and the
// enchanting table's book.

import type { GL } from './gl';
import { createTexture } from './gl';
import { EntityBatch, PoseStack, type DrawState } from './entityRenderer';
import { ModelPart } from './model';
import type { Camera } from './renderer';
import type { Frustum } from '../core/math';
import type { Level } from '../game/level';
import { BellBlockEntity, LecternBlockEntity, BannerBlockEntity, CampfireBlockEntity, FACING_2D } from '../world/blockEntity';
import type { ItemRenderer } from './itemRenderer';
import { BannerRenderer } from './bannerRenderer';
import { BLOCKS, STATE_BLOCK } from '../world/block';
import { NORTH, SOUTH, WEST, EAST } from '../world/dir';
import { bookModel, bookTexture, setupBookAnim, BOOK_TEX_W, BOOK_TEX_H, type BookModel } from './bookRenderer';
import { bellBodyTexture } from '../textures/bellBody';
import type { TexImage } from '../textures/tex';

/** vanilla BlockEntityRenderer.getViewDistance */
const VIEW_DISTANCE = 64;

interface BellModel {
  root: ModelPart;
  body: ModelPart;
}

/** vanilla BellRenderer.createBodyLayer (32x32) */
export function bellModel(): BellModel {
  const root = new ModelPart();
  const body = root.add('bell_body', new ModelPart([{ x: -3, y: -6, z: -3, w: 6, h: 7, d: 6, u: 0, v: 0 }], [8, 12, 8]));
  body.add('bell_base', new ModelPart([{ x: 4, y: 4, z: 4, w: 8, h: 2, d: 8, u: 0, v: 13 }], [-8, -12, -8]));
  return { root, body };
}

/** vanilla BellRenderer.render: tipped away from the struck side, a swing that dies down over its 50 ticks */
export function renderBell(b: EntityBatch, pose: PoseStack, m: BellModel, be: BellBlockEntity, dx: number, dy: number, dz: number, partial: number): void {
  let xRot = 0, zRot = 0;
  if (be.shaking) {
    const f = be.ticks + partial;
    const swing = Math.sin(f / Math.PI) / (4 + f / 3);
    if (be.clickDirection === NORTH) xRot = -swing;
    else if (be.clickDirection === SOUTH) xRot = swing;
    else if (be.clickDirection === EAST) zRot = -swing;
    else if (be.clickDirection === WEST) zRot = swing;
  }
  m.body.xRot = xRot;
  m.body.zRot = zRot;
  pose.reset();
  pose.translate(dx, dy, dz);
  m.root.render(b, pose, 32, 32);
}

/** vanilla Direction.getClockWise().toYRot() for each facing */
const CLOCKWISE_YROT: Record<string, number> = { north: 270, east: 0, south: 90, west: 180 };

/** vanilla LecternRenderer.render: the book lying open on the board, tilted toward whoever faces the lectern */
export function renderLecternBook(b: EntityBatch, pose: PoseStack, m: BookModel, facing: string, dx: number, dy: number, dz: number): void {
  pose.reset();
  pose.translate(dx + 0.5, dy + 1.0625, dz + 0.5);
  pose.rotY(-CLOCKWISE_YROT[facing]);
  pose.rotZ(67.5);
  pose.translate(0, -0.125, 0);
  setupBookAnim(m, 0, 0.1, 0.9, 1.2);
  m.root.render(b, pose, BOOK_TEX_W, BOOK_TEX_H);
}

function upload(gl: GL, t: TexImage): WebGLTexture {
  return createTexture(gl, t.w, t.h, new Uint8Array(t.data.buffer, t.data.byteOffset, t.data.byteLength));
}

export class VillageBlockRenderers {
  private readonly pose = new PoseStack();
  private readonly bell = bellModel();
  private bellTex: WebGLTexture | null = null;
  private readonly book = bookModel();
  private bookTex: WebGLTexture | null = null;
  private readonly banners: BannerRenderer;

  constructor(private readonly gl: GL) {
    this.banners = new BannerRenderer(gl);
  }

  private state(tex: WebGLTexture): DrawState {
    return { texture: tex, cutoff: 0.1, blend: false, cull: false, lit: true, useLightmap: true };
  }

  render(b: EntityBatch, level: Level, cam: Camera, partial: number, frustum: Frustum): void {
    for (const be of level.world.blockEntities.values()) {
      if (be instanceof BannerBlockEntity) {
        this.renderBanner(b, level, be, cam, frustum, partial);
        continue;
      }
      const bell = be instanceof BellBlockEntity;
      if (be.removed || !(bell || be instanceof LecternBlockEntity)) continue;
      const dx = be.x - cam.x, dy = be.y - cam.y, dz = be.z - cam.z;
      if ((dx + 0.5) ** 2 + (dy + 0.5) ** 2 + (dz + 0.5) ** 2 > VIEW_DISTANCE * VIEW_DISTANCE) continue;
      if (!frustum.testBox(dx, dy, dz, dx + 1, dy + 1.5, dz + 1)) continue;
      const st = level.getState(be.x, be.y, be.z);
      const block = BLOCKS[STATE_BLOCK[st]];
      if (!bell && (block.name !== 'lectern' || !block.get(st, 'has_book'))) continue;
      const l = level.world.getLight(be.x, be.y, be.z);
      b.lightS = (l >> 4) * 16;
      b.lightB = (l & 15) * 16;
      b.setOverlay(0, 0, 0, 0);
      if (be instanceof BellBlockEntity) {
        this.bellTex ??= upload(this.gl, bellBodyTexture());
        b.begin(this.state(this.bellTex));
        renderBell(b, this.pose, this.bell, be, dx, dy, dz, partial);
      } else {
        this.bookTex ??= bookTexture(this.gl);
        b.begin(this.state(this.bookTex));
        renderLecternBook(b, this.pose, this.book, block.get<string>(st, 'facing'), dx, dy, dz);
      }
    }
  }

  /**
   * vanilla CampfireRenderer: what's cooking lies flat on the fire at three-eighths size, each place's food over its
   * own corner, turned with the campfire's facing
   */
  renderCampfires(b: EntityBatch, items: ItemRenderer, level: Level, cam: Camera, frustum: Frustum): void {
    for (const be of level.world.blockEntities.values()) {
      if (be.removed || !(be instanceof CampfireBlockEntity) || be.container.items.every((s) => !s)) continue;
      const dx = be.x - cam.x, dy = be.y - cam.y, dz = be.z - cam.z;
      if ((dx + 0.5) ** 2 + (dy + 0.5) ** 2 + (dz + 0.5) ** 2 > VIEW_DISTANCE * VIEW_DISTANCE) continue;
      if (!frustum.testBox(dx, dy, dz, dx + 1, dy + 1, dz + 1)) continue;
      const st = level.getState(be.x, be.y, be.z);
      const block = BLOCKS[STATE_BLOCK[st]];
      if (block.propIndex('signal_fire') < 0) continue;
      const facing = FACING_2D[block.get<string>(st, 'facing')] ?? 0;
      const l = level.world.getLight(be.x, be.y, be.z);
      b.lightS = (l >> 4) * 16;
      b.lightB = (l & 15) * 16;
      b.setOverlay(0, 0, 0, 0);
      const pose = this.pose;
      for (let i = 0; i < 4; i++) {
        const s = be.container.items[i];
        if (!s) continue;
        pose.reset();
        pose.translate(dx + 0.5, dy + 0.44921875, dz + 0.5);
        // (Direction.from2DDataValue(i + facing).toYRot(), negated)
        pose.rotY(-((i + facing) % 4) * 90);
        pose.rotX(90);
        pose.translate(-0.3125, -0.3125, 0);
        pose.scale(0.375, 0.375, 0.375);
        items.render(b, pose, s, 'fixed');
      }
    }
  }

  /** a banner, standing (two blocks tall) or hanging (down into the block below) */
  private renderBanner(b: EntityBatch, level: Level, be: BannerBlockEntity, cam: Camera, frustum: Frustum, partial: number): void {
    if (be.removed) return;
    const dx = be.x - cam.x, dy = be.y - cam.y, dz = be.z - cam.z;
    if ((dx + 0.5) ** 2 + (dy + 0.5) ** 2 + (dz + 0.5) ** 2 > VIEW_DISTANCE * VIEW_DISTANCE) return;
    const st = level.getState(be.x, be.y, be.z);
    const standing = BLOCKS[STATE_BLOCK[st]].propIndex('rotation') >= 0;
    if (!frustum.testBox(dx, standing ? dy : dy - 1, dz, dx + 1, dy + 2, dz + 1)) return;
    const l = level.world.getLight(be.x, be.y, be.z);
    b.lightS = (l >> 4) * 16;
    b.lightB = (l & 15) * 16;
    b.setOverlay(0, 0, 0, 0);
    this.banners.renderBlockEntity(b, be, st, dx, dy, dz, level.gameTime, partial);
  }
}
