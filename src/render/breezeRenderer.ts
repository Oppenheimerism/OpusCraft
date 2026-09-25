// (trial chambers) The breeze and the wind charges drawn (1.21; vanilla BreezeRenderer with BreezeModel, 32x32, its
// BreezeWindLayer, 128x128, and BreezeEyesLayer; WindChargeRenderer with WindChargeModel, 64x32). The breeze's head (a
// block with its visor) bobs over three rods turning round beneath it, and below them is its wind: three stages, each
// three shells one in another, the texture scrolling round them and each stage swaying on a circle of its own so the
// whirl wobbles as it spins. Its eyes glow through any dark, and its wind and eyes show even when it's invisible. Its
// moves are keyframed (vanilla BreezeAnimation, authored afresh here): it rears back and snaps forward to fire, leans
// into a slide (and straightens out of it), and crouches then stretches up as it leaps. A wind charge is a bright knot
// of wind in two rings turning the other way round it, its texture scrolling; it isn't drawn in its first two ticks
// within three and a half blocks of the camera (vanilla: it would fill the view of whoever threw it).

import type { EntityBatch } from './entityRenderer';
import { ModelPart, type Cube } from './model';
import { applyAnimation, type AnimationDef, type MobModelDef } from './mobModels';
import type { LivingKit } from './illagerRenderers';
import { createTexture, type GL } from './gl';
import type { Mob } from '../entity/mob';
import { Breeze } from '../entity/breeze';
import type { AbstractWindCharge } from '../entity/windCharge';
import { MOB_TEXTURES } from '../textures/mobs';
import '../textures/breeze';

const RAD = Math.PI / 180;

function part(cubes: Cube[], pivot: [number, number, number] = [0, 0, 0], rot: [number, number, number] = [0, 0, 0]): ModelPart {
  return new ModelPart(cubes, pivot, rot);
}

/** vanilla BreezeModel.createBodyLayer: the same mesh on the body's texture (32x32) and on the wind's (128x128) */
export function breezeModel(texW: number, texH: number): MobModelDef {
  const root = new ModelPart();
  const body = root.add('body', part([]));
  const rods = body.add('rods', part([], [0, 8, 0]));
  const rod: Cube = { x: -1, y: 0, z: -3, w: 2, h: 8, d: 2, u: 0, v: 17 };
  rods.add('rod_1', part([rod], [2.5981, -3, 1.5], [-2.7489, -1.0472, 3.1416]));
  rods.add('rod_2', part([rod], [-2.5981, -3, 1.5], [-2.7489, 1.0472, 3.1416]));
  rods.add('rod_3', part([rod], [0, -3, -3], [0.3927, 0, 0]));
  const headCubes: Cube[] = [
    { x: -5, y: -5, z: -4.2, w: 10, h: 3, d: 4, u: 4, v: 24 },
    { x: -4, y: -8, z: -4, w: 8, h: 8, d: 8, u: 0, v: 0 },
  ];
  const head = body.add('head', part(headCubes, [0, 4, 0]));
  head.add('eyes', part(headCubes));
  const wind = root.add('wind_body', part([]));
  const bottom = wind.add('wind_bottom', part([{ x: -2.5, y: -7, z: -2.5, w: 5, h: 7, d: 5, u: 1, v: 83 }], [0, 24, 0]));
  const mid = bottom.add(
    'wind_mid',
    part(
      [
        { x: -6, y: -6, z: -6, w: 12, h: 6, d: 12, u: 74, v: 28 },
        { x: -4, y: -6, z: -4, w: 8, h: 6, d: 8, u: 78, v: 32 },
        { x: -2.5, y: -6, z: -2.5, w: 5, h: 6, d: 5, u: 49, v: 71 },
      ],
      [0, -7, 0],
    ),
  );
  mid.add(
    'wind_top',
    part(
      [
        { x: -9, y: -8, z: -9, w: 18, h: 8, d: 18, u: 0, v: 0 },
        { x: -6, y: -8, z: -6, w: 12, h: 8, d: 12, u: 6, v: 6 },
        { x: -2.5, y: -8, z: -2.5, w: 5, h: 8, d: 5, u: 105, v: 57 },
      ],
      [0, -6, 0],
    ),
  );
  return { root, texW, texH };
}

// the breeze's moves (vanilla BreezeAnimation, authored afresh: rotations in degrees, positions in pixels with +y up)

/** the shot: rearing back as it breathes in, snapping forward as it fires (three quarters of a second in), and settling */
const SHOOT: AnimationDef = {
  length: 1.125,
  looping: false,
  channels: [
    { bone: 'head', target: 'rotation', keys: [[0, [0, 0, 0]], [0.5, [-17.5, 0, 0]], [0.75, [-20, 0, 0]], [0.85, [10, 0, 0]], [1.125, [0, 0, 0]]] },
    { bone: 'head', target: 'position', keys: [[0, [0, 0, 0]], [0.5, [0, 1, 1.5]], [0.75, [0, 1.25, 2]], [0.85, [0, -0.5, -2]], [1.125, [0, 0, 0]]] },
    { bone: 'rods', target: 'position', keys: [[0, [0, 0, 0]], [0.75, [0, 1, 0]], [0.85, [0, -0.5, 0]], [1.125, [0, 0, 0]]] },
    { bone: 'wind_top', target: 'scale', keys: [[0, [1, 1, 1]], [0.75, [1.15, 1, 1.15]], [0.85, [0.9, 1, 0.9]], [1.125, [1, 1, 1]]] },
  ],
};

/** the slide: leaning into it, head and top forward and the bottom of its wind trailing (held while it slides) */
const SLIDE: AnimationDef = {
  length: 0.2,
  looping: false,
  channels: [
    { bone: 'head', target: 'position', keys: [[0, [0, 0, 0]], [0.2, [0, 0, -2]]] },
    { bone: 'head', target: 'rotation', keys: [[0, [0, 0, 0]], [0.2, [12.5, 0, 0]]] },
    { bone: 'rods', target: 'position', keys: [[0, [0, 0, 0]], [0.2, [0, 0, -1]]] },
    { bone: 'wind_top', target: 'position', keys: [[0, [0, 0, 0]], [0.2, [0, 0, -1]]] },
    { bone: 'wind_mid', target: 'position', keys: [[0, [0, 0, 0]], [0.2, [0, 0, 0.5]]] },
    { bone: 'wind_bottom', target: 'position', keys: [[0, [0, 0, 0]], [0.2, [0, 0, 1.5]]] },
  ],
};

/** out of the slide: from its lean back upright (ending at rest, as vanilla never stops it) */
const SLIDE_BACK: AnimationDef = {
  length: 0.1,
  looping: false,
  channels: [
    { bone: 'head', target: 'position', keys: [[0, [0, 0, -2]], [0.1, [0, 0, 0]]] },
    { bone: 'head', target: 'rotation', keys: [[0, [12.5, 0, 0]], [0.1, [0, 0, 0]]] },
    { bone: 'rods', target: 'position', keys: [[0, [0, 0, -1]], [0.1, [0, 0, 0]]] },
    { bone: 'wind_top', target: 'position', keys: [[0, [0, 0, -1]], [0.1, [0, 0, 0]]] },
    { bone: 'wind_mid', target: 'position', keys: [[0, [0, 0, 0.5]], [0.1, [0, 0, 0]]] },
    { bone: 'wind_bottom', target: 'position', keys: [[0, [0, 0, 1.5]], [0.1, [0, 0, 0]]] },
  ],
};

/** the leap: a crouch as it springs, then stretched up and its wind drawn in (held till it lands) */
const JUMP: AnimationDef = {
  length: 0.5,
  looping: false,
  channels: [
    { bone: 'head', target: 'position', keys: [[0, [0, 0, 0]], [0.1, [0, -2, 0]], [0.3, [0, 1.5, 0]], [0.5, [0, 1, 0]]] },
    { bone: 'rods', target: 'position', keys: [[0, [0, 0, 0]], [0.1, [0, -1, 0]], [0.3, [0, 1, 0]], [0.5, [0, 0.5, 0]]] },
    { bone: 'wind_bottom', target: 'scale', keys: [[0, [1, 1, 1]], [0.1, [1.3, 0.7, 1.3]], [0.3, [0.7, 1.3, 0.7]], [0.5, [0.8, 1.2, 0.8]]] },
    { bone: 'wind_top', target: 'scale', keys: [[0, [1, 1, 1]], [0.3, [0.8, 1.1, 0.8]], [0.5, [0.85, 1.1, 0.85]]] },
  ],
};

/** seconds since an animation started (-1: it isn't playing) */
function since(e: Breeze, start: number, p: number): number {
  return start < 0 ? -1 : Math.max(0, (e.tickCount + p - start) * 0.05);
}

/**
 * vanilla BreezeModel.setupAnim: each stage of its wind swaying round its own circle (the top and the bottom one way,
 * the middle the other), the head bobbing, the rods turning a half turn a second; then the shot, the slide (and
 * straightening out of it) and the leap as they play
 */
export function animateBreeze(root: ModelPart, e: Breeze, age: number, p: number): void {
  root.resetPose();
  const f = age * Math.PI * -0.1;
  const top = root.find('wind_top')!, mid = root.find('wind_mid')!, bottom = root.find('wind_bottom')!;
  top.x = Math.cos(f) * 0.6;
  top.z = Math.sin(f) * 0.6;
  mid.x = Math.sin(f) * 0.4;
  mid.z = Math.cos(f) * 0.8;
  bottom.x = Math.cos(f) * -0.25;
  bottom.z = Math.sin(f) * -0.25;
  root.find('head')!.y = 4 + Math.cos(f) / 4;
  root.find('rods')!.yRot = age * Math.PI * 0.1;
  const shot = since(e, e.shootAnimStart, p), slide = since(e, e.slideAnimStart, p), back = since(e, e.slideBackAnimStart, p), jump = since(e, e.jumpAnimStart, p);
  if (shot >= 0) applyAnimation(root, SHOOT, shot);
  if (slide >= 0) applyAnimation(root, SLIDE, slide);
  if (back >= 0) applyAnimation(root, SLIDE_BACK, back);
  if (jump >= 0) applyAnimation(root, JUMP, jump);
}

/** vanilla BreezeRenderer.enable: only these of its parts drawn */
function enable(root: ModelPart, ...parts: string[]): void {
  for (const n of ['head', 'eyes', 'rods', 'wind_body']) root.find(n)!.visible = parts.includes(n);
}

/** vanilla WindChargeModel.createBodyLayer (64x32): the knot, and the two rings of wind round it */
export function windChargeModel(): MobModelDef {
  const root = new ModelPart();
  const bone = root.add('bone', part([]));
  bone.add(
    'wind',
    part(
      [
        { x: -4, y: -1, z: -4, w: 8, h: 2, d: 8, u: 15, v: 20 },
        { x: -3, y: -2, z: -3, w: 6, h: 4, d: 6, u: 0, v: 9 },
      ],
      [0, 0, 0],
      [0, -0.7854, 0],
    ),
  );
  bone.add('wind_charge', part([{ x: -2, y: -2, z: -2, w: 4, h: 4, d: 4, u: 0, v: 0 }]));
  return { root, texW: 64, texH: 32 };
}

/** vanilla BreezeRenderer's shadow (MobRenderer's 0.5) */
export const BREEZE_SHADOW_RADII: Record<string, number> = { breeze: 0.5 };

export class BreezeRenderers {
  private readonly body = breezeModel(32, 32);
  private readonly wind = breezeModel(128, 128);
  private readonly charge = windChargeModel();
  /** the wind's textures, wrapping so their scroll runs round (the dispatcher's own are clamped) */
  private readonly wrapped = new Map<string, WebGLTexture | null>();

  constructor(private readonly gl: GL, private readonly kit: LivingKit) {}

  private wrappedTex(name: string): WebGLTexture | null {
    if (this.wrapped.has(name)) return this.wrapped.get(name)!;
    const gen = MOB_TEXTURES[name];
    const img = gen?.();
    const t = img ? createTexture(this.gl, img.w, img.h, new Uint8Array(img.data.buffer, img.data.byteOffset, img.data.byteLength), { clamp: false }) : null;
    this.wrapped.set(name, t);
    return t;
  }

  /** draws `e` if it's a breeze (false: not ours) */
  render(b: EntityBatch, e: Mob, dx: number, dy: number, dz: number, p: number): boolean {
    if (!(e instanceof Breeze)) return false;
    const kit = this.kit;
    const tex = kit.tex('breeze');
    if (!tex) return true;
    const a = kit.setupLiving(e, dx, dy, dz, p, 90);
    // the body: its head and rods
    const body = this.body;
    animateBreeze(body.root, e, a.age, p);
    enable(body.root, 'head', 'rods');
    kit.overlay(b, e);
    kit.drawBody(b, e, body, tex, false);
    b.setOverlay(0, 0, 0, 0);
    // vanilla BreezeWindLayer: its wind, see-through, the texture scrolling along (RenderType.breezeWind)
    const windTex = this.wrappedTex('breeze_wind');
    if (windTex) {
      animateBreeze(this.wind.root, e, a.age, p);
      enable(this.wind.root, 'wind_body');
      b.begin(kit.state(windTex, { blend: true, cutoff: 0.1, cull: true, lit: false, uvOffset: [(a.age * 0.02) % 1, 0] }));
      kit.drawModel(b, this.wind, false);
      b.flush();
    }
    // vanilla BreezeEyesLayer: the head again in the eyes' texture, lit by nothing but themselves (RenderType.breezeEyes)
    const eyes = kit.tex('breeze_eyes');
    if (eyes) {
      enable(body.root, 'head', 'eyes');
      const lb = b.lightB, ls = b.lightS;
      b.lightB = b.lightS = 240;
      b.begin(kit.state(eyes, { blend: true, cutoff: 0.01, depthWrite: false, lit: false, useLightmap: false }));
      kit.drawModel(b, body, false);
      b.flush();
      b.lightB = lb;
      b.lightS = ls;
    }
    return true;
  }

  /** vanilla WindChargeRenderer: the knot turning one way and its rings the other, the texture scrolling round */
  renderWindCharge(b: EntityBatch, e: AbstractWindCharge, dx: number, dy: number, dz: number, p: number): void {
    if (e.tickCount < 2 && dx * dx + dy * dy + dz * dz < 3.5 * 3.5) return;
    const tex = this.wrappedTex('wind_charge');
    if (!tex) return;
    const f = e.tickCount + p;
    const root = this.charge.root;
    // (vanilla WindChargeModel.setupAnim, sixteen degrees a tick)
    root.find('wind_charge')!.yRot = -f * 16 * RAD;
    root.find('wind')!.yRot = f * 16 * RAD;
    const pose = this.kit.pose;
    pose.reset();
    pose.translate(dx, dy, dz);
    b.setOverlay(0, 0, 0, 0);
    b.begin(this.kit.state(tex, { blend: true, cutoff: 0.1, cull: true, lit: false, uvOffset: [(f * 0.03) % 1, 0] }));
    root.render(b, pose, 64, 32);
    b.flush();
  }
}
