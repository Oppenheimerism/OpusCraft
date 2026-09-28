// Signs as they're drawn (vanilla SignRenderer and HangingSignRenderer): the board (and a standing sign's stick) at two
// thirds of a block's scale, a hanging sign's board full size under its bracket (a wall hanging sign's) and chains, a
// vee of them when it hangs from something narrow (`attached`); each side's four lines of text in the game's font on
// its board, centred, a sixty-fourth of a block a pixel (times the text's scale: two thirds on a sign, 0.9 on a hanging
// sign), lines cut to the board's width. Text is its dye's colour darkened to 0.4, lit by the sign's light; glowing
// text is the dye's full colour at full brightness, outlined in the dark colour (black text in pale cream) when the
// camera's entity is within 16 blocks, or always for black. Drawn within 64 blocks of the camera
// (BlockEntityRenderer.getViewDistance), models first, then all the text.

import type { GL } from './gl';
import { createTexture } from './gl';
import { EntityBatch, PoseStack, type DrawState } from './entityRenderer';
import { ModelPart } from './model';
import { fontSheet } from './mapRenderer';
import type { Camera } from './renderer';
import type { Frustum } from '../core/math';
import type { Level } from '../game/level';
import { BLOCKS, STATE_BLOCK } from '../world/block';
import { signOf, type SignWood } from '../world/blocksSigns';
import { SignBlockEntity, SIGN_TEXT_COLORS, SIGN_LINES, type SignText } from '../world/signBlockEntity';
import { signTextShown, signYRotation } from '../game/signs';
import { signTexture, hangingSignTexture } from '../textures/signs';
import { textWidth, glyphWidth } from '../textures/font';
import type { TexImage } from '../textures/tex';

/** vanilla BlockEntityRenderer.getViewDistance */
const VIEW_DISTANCE = 64;
/** vanilla SignRenderer.OUTLINE_RENDER_DISTANCE: 16 blocks */
const OUTLINE_DISTANCE = 16;
/** vanilla SignRenderer.BLACK_TEXT_OUTLINE_COLOR (-988212: a pale cream) */
const BLACK_TEXT_OUTLINE = 0xf0ebcc;

/** vanilla SignRenderer.getDarkColor: the text's colour at 0.4, or the cream outline of glowing black text */
export function signDarkColor(t: SignText): number {
  const c = SIGN_TEXT_COLORS[t.color];
  if (c === 0 && t.glowing) return BLACK_TEXT_OUTLINE;
  return (Math.trunc(((c >> 16) & 255) * 0.4) << 16) | (Math.trunc(((c >> 8) & 255) * 0.4) << 8) | Math.trunc((c & 255) * 0.4);
}

/**
 * vanilla Font.split(text, maxWidth).get(0): the first line of the text wrapped to `max` pixels (broken after the
 * last space that fits, or inside a word longer than the line)
 */
export function firstLine(s: string, max: number): string {
  if (textWidth(s) <= max) return s;
  let w = 0, lastSpace = -1;
  const chars = [...s];
  for (let i = 0; i < chars.length; i++) {
    // (vanilla StringSplitter.LineBreakFinder: a space is where to break, even the one that goes over)
    if (chars[i] === ' ') lastSpace = i;
    const adv = glyphWidth(chars[i]) + 1;
    if (w + adv > max) return chars.slice(0, lastSpace >= 0 ? lastSpace : Math.max(i, 1)).join('');
    w += adv;
  }
  return s;
}

/** vanilla SignRenderer.createSignLayer (64×32) */
function signModel(): { root: ModelPart; stick: ModelPart } {
  const root = new ModelPart();
  root.add('sign', new ModelPart([{ x: -12, y: -14, z: -1, w: 24, h: 12, d: 2, u: 0, v: 0 }]));
  const stick = root.add('stick', new ModelPart([{ x: -1, y: -2, z: -1, w: 2, h: 14, d: 2, u: 0, v: 14 }]));
  return { root, stick };
}

/** vanilla HangingSignRenderer.createHangingSignLayer (64×32) */
function hangingSignModel(): { root: ModelPart; plank: ModelPart; normalChains: ModelPart; vChains: ModelPart } {
  const root = new ModelPart();
  root.add('board', new ModelPart([{ x: -7, y: 0, z: -1, w: 14, h: 10, d: 2, u: 0, v: 12 }]));
  const plank = root.add('plank', new ModelPart([{ x: -8, y: -6, z: -2, w: 16, h: 2, d: 4, u: 0, v: 0 }]));
  const normalChains = root.add('normalChains', new ModelPart());
  const q = Math.PI / 4;
  for (const [name, x, u, yr] of [['chainL1', -5, 0, -q], ['chainL2', -5, 6, q], ['chainR1', 5, 0, -q], ['chainR2', 5, 6, q]] as const) {
    normalChains.add(name, new ModelPart([{ x: -1.5, y: 0, z: 0, w: 3, h: 6, d: 0, u, v: 6 }], [x, -6, 0], [0, yr, 0]));
  }
  const vChains = root.add('vChains', new ModelPart([{ x: -6, y: -6, z: 0, w: 12, h: 6, d: 0, u: 14, v: 6 }]));
  return { root, plank, normalChains, vChains };
}

interface GlyphUV {
  u0: number;
  u1: number;
  w: number;
}

interface TextJob {
  m: Float32Array;
  text: SignText;
  lineHeight: number;
  maxWidth: number;
  lightB: number;
  lightS: number;
  outline: boolean;
}

/** vanilla LocalPlayer.isScoping, while the camera is the player's own eyes (the spyglass, when there's one) */
let scopingHook: (() => boolean) | null = null;
export function setSignScopingHook(f: (() => boolean) | null): void {
  scopingHook = f;
}

export class SignRenderer {
  private readonly sign = signModel();
  private readonly hanging = hangingSignModel();
  private readonly signTex = new Map<SignWood, WebGLTexture>();
  private readonly hangingTex = new Map<SignWood, WebGLTexture>();
  private readonly pose = new PoseStack();
  private font: WebGLTexture | null = null;
  private glyphs = new Map<string, GlyphUV>();
  private readonly jobs: TextJob[] = [];

  constructor(private readonly gl: GL) {}

  private texture(cache: Map<SignWood, WebGLTexture>, w: SignWood, make: (w: SignWood) => TexImage): WebGLTexture {
    let t = cache.get(w);
    if (!t) {
      const img = make(w);
      t = createTexture(this.gl, img.w, img.h, new Uint8Array(img.data.buffer, img.data.byteOffset, img.data.byteLength));
      cache.set(w, t);
    }
    return t;
  }

  private modelState(tex: WebGLTexture): DrawState {
    // (vanilla entityCutoutNoCull; culled here, so the chains' two faces don't flicker against each other)
    return { texture: tex, cutoff: 0.1, blend: false, cull: true, lit: true, useLightmap: true };
  }

  /**
   * vanilla SignRenderer / HangingSignRenderer.render for every sign near enough and in view; `viewer` is the camera's
   * entity (for the glow outline's distance), `firstPerson` whether the camera is its eyes
   */
  renderBlockEntities(b: EntityBatch, level: Level, cam: Camera, frustum: Frustum, viewer: { x: number; y: number; z: number }, firstPerson: boolean): void {
    const pose = this.pose;
    const scoping = firstPerson && !!scopingHook?.();
    for (const be of level.world.blockEntities.values()) {
      if (!(be instanceof SignBlockEntity) || be.removed) continue;
      const dx = be.x - cam.x, dy = be.y - cam.y, dz = be.z - cam.z;
      if ((dx + 0.5) ** 2 + (dy + 0.5) ** 2 + (dz + 0.5) ** 2 > VIEW_DISTANCE * VIEW_DISTANCE) continue;
      if (!frustum.testBox(dx - 0.25, dy - 0.25, dz - 0.25, dx + 1.25, dy + 1.25, dz + 1.25)) continue;
      const st = level.getState(be.x, be.y, be.z);
      const block = BLOCKS[STATE_BLOCK[st]];
      const s = signOf(block.name);
      if (!s) continue;
      const l = level.world.getLight(be.x, be.y, be.z);
      const lightS = (l >> 4) * 16, lightB = (l & 15) * 16;
      b.lightS = lightS;
      b.lightB = lightB;
      b.setOverlay(0, 0, 0, 0);
      pose.reset();
      pose.translate(dx, dy, dz);
      const hanging = s.kind === 'hanging_sign' || s.kind === 'wall_hanging_sign';
      const yRot = -signYRotation(st);
      let modelScale: number, textScale: number, offY: number, offZ: number;
      if (hanging) {
        // vanilla HangingSignRenderer.translateSign
        pose.translate(0.5, 0.9375, 0.5);
        pose.rotY(yRot);
        pose.translate(0, -0.3125, 0);
        modelScale = 1;
        textScale = 0.9;
        offY = -0.32;
        offZ = 0.073;
        const m = this.hanging;
        m.plank.visible = s.kind === 'wall_hanging_sign';
        const attached = s.kind === 'hanging_sign' && block.get<boolean>(st, 'attached');
        m.normalChains.visible = !attached;
        m.vChains.visible = attached;
        b.begin(this.modelState(this.texture(this.hangingTex, s.wood, hangingSignTexture)));
      } else {
        // vanilla SignRenderer.translateSign
        pose.translate(0.5, 0.75 * (2 / 3), 0.5);
        pose.rotY(yRot);
        if (s.kind === 'wall_sign') pose.translate(0, -0.3125, -0.4375);
        modelScale = 2 / 3;
        textScale = 2 / 3;
        offY = 1 / 3;
        offZ = 0.046666667;
        this.sign.stick.visible = s.kind === 'sign';
        b.begin(this.modelState(this.texture(this.signTex, s.wood, signTexture)));
      }
      pose.push();
      pose.scale(modelScale, -modelScale, -modelScale);
      (hanging ? this.hanging.root : this.sign.root).render(b, pose, 64, 32);
      pose.pop();
      const near = (viewer.x - (be.x + 0.5)) ** 2 + (viewer.y - (be.y + 0.5)) ** 2 + (viewer.z - (be.z + 0.5)) ** 2 < OUTLINE_DISTANCE * OUTLINE_DISTANCE;
      for (const front of [true, false]) {
        const text = signTextShown(be, front);
        if (!text.messages.some((m) => m.length > 0)) continue;
        // vanilla renderSignText's translateSignText: the back turned round, then the offset, then a pixel's scale
        pose.push();
        if (!front) pose.rotY(180);
        pose.translate(0, offY, offZ);
        const f = 0.015625 * textScale;
        pose.scale(f, -f, f);
        const outline = text.glowing && (SIGN_TEXT_COLORS[text.color] === 0 || scoping || near);
        this.jobs.push({ m: new Float32Array(pose.m), text, lineHeight: be.textLineHeight, maxWidth: be.maxTextLineWidth, lightB, lightS, outline });
        pose.pop();
      }
    }
    this.flushText(b);
  }

  /** the text collected, each line centred (vanilla drawInBatch, or drawInBatch8xOutline for an outlined glow) */
  private flushText(b: EntityBatch): void {
    if (!this.jobs.length) return;
    if (!this.font) {
      const f = fontSheet();
      this.font = createTexture(this.gl, f.w, 8, f.data);
      this.glyphs = f.glyphs;
    }
    // (vanilla RenderType.text / POLYGON_OFFSET: lit only by the lightmap, drawn just over the board)
    const outlineState: DrawState = { texture: this.font, cutoff: 0.1, blend: true, cull: false, lit: false, useLightmap: true, polygonOffset: 5 };
    const textState: DrawState = { ...outlineState, polygonOffset: 10 };
    const pose = this.pose;
    b.setOverlay(0, 0, 0, 0);
    for (const pass of ['outline', 'text'] as const) {
      b.begin(pass === 'outline' ? outlineState : textState);
      for (const j of this.jobs) {
        if (pass === 'outline' && !j.outline) continue;
        const t = j.text;
        const dark = signDarkColor(t);
        const color = pass === 'outline' ? dark : t.glowing ? SIGN_TEXT_COLORS[t.color] : dark;
        const r = ((color >> 16) & 255) / 255, g = ((color >> 8) & 255) / 255, bl = (color & 255) / 255;
        // (vanilla: glowing text at full brightness, 15728880)
        b.lightB = t.glowing ? 240 : j.lightB;
        b.lightS = t.glowing ? 240 : j.lightS;
        pose.reset(j.m);
        const top = (SIGN_LINES * j.lineHeight) / 2;
        for (let i = 0; i < SIGN_LINES; i++) {
          const line = firstLine(t.messages[i] ?? '', j.maxWidth);
          if (!line) continue;
          const x0 = Math.trunc(-textWidth(line) / 2), y0 = i * j.lineHeight - Math.trunc(top);
          if (pass === 'outline') {
            for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) if (ox || oy) this.drawLine(b, line, x0 + ox, y0 + oy, r, g, bl);
          } else this.drawLine(b, line, x0, y0, r, g, bl);
        }
      }
      b.flush();
    }
    this.jobs.length = 0;
  }

  private drawLine(b: EntityBatch, line: string, x0: number, y0: number, r: number, g: number, bl: number): void {
    let x = x0;
    for (const ch of line) {
      const gl = this.glyphs.get(ch) ?? this.glyphs.get('?')!;
      if (ch !== ' ') b.quad(this.pose, [x, y0 + 8, 0, x + gl.w, y0 + 8, 0, x + gl.w, y0, 0, x, y0, 0], [gl.u0, 1, gl.u1, 1, gl.u1, 0, gl.u0, 0], 0, 0, 1, r, g, bl, 1);
      x += gl.w + 1;
    }
  }
}
