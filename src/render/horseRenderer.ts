// Horses, donkeys and mules (Stage 6: tameable animals): vanilla HorseRenderer (1.1 times as big) with HorseModel,
// and ChestedHorseRenderer for the donkey (0.87) and the mule (0.92) with ChestedHorseModel, the long ears and a
// chest either side. The head sways and bobs as it walks, drops to the grass as it grazes and tosses as it rears
// up onto its hind legs, forelegs pawing; the tail streams out behind it at a gallop and flicks now and then; a foal
// has a big head and long legs. The saddle and bridle show once it's saddled, the reins once someone's riding it.
// HorseMarkingLayer lays a horse's markings over its coat, and HorseArmorLayer its armour (leather in its dye). The
// steps every living renderer shares are the dispatcher's, lent through LivingKit.

import type { EntityBatch } from './entityRenderer';
import { ModelPart, type Cube } from './model';
import type { MobModelDef } from './mobModels';
import type { LivingKit, LivingAnim } from './illagerRenderers';
import type { Mob } from '../entity/mob';
import { AbstractHorse, AbstractChestedHorse, Horse, Donkey, Mule } from '../entity/horse';
import { dyedColor, DEFAULT_LEATHER_COLOR } from '../item/dyedColor';
import '../textures/horse';

const PI = Math.PI;
const RAD = PI / 180;

/** vanilla AbstractHorseRenderer's shadow */
export const HORSE_SHADOW_RADII: Record<string, number> = { horse: 0.75, donkey: 0.75, mule: 0.75 };

function part(cubes: Cube[], pivot: [number, number, number] = [0, 0, 0], rot: [number, number, number] = [0, 0, 0]): ModelPart {
  return new ModelPart(cubes, pivot, rot);
}

// ---------------------------------------------------------------------------
// vanilla HorseModel (64x64)

const LEGS = ['left_hind', 'right_hind', 'left_front', 'right_front'];
/** vanilla HorseModel's saddleParts and ridingParts */
const SADDLE_PARTS = ['saddle', 'left_saddle_mouth', 'right_saddle_mouth', 'head_saddle', 'mouth_saddle_wrap'];
const RIDING_PARTS = ['left_saddle_line', 'right_saddle_line'];

/**
 * vanilla HorseModel.createBodyMesh (`g`: the armour's CubeDeformation(0.1), which leaves the neck, the body and the
 * tack as they are), with ChestedHorseModel's chests and long ears when `chested`
 */
export function horseModel(g = 0, chested = false): MobModelDef {
  const root = new ModelPart();
  const body = root.add('body', part([{ x: -5, y: -8, z: -17, w: 10, h: 10, d: 22, u: 0, v: 32, inflate: 0.05 }], [0, 11, 5]));
  const neck = root.add('head_parts', part([{ x: -2.05, y: -6, z: -2, w: 4, h: 12, d: 7, u: 0, v: 35 }], [0, 4, -12], [PI / 6, 0, 0]));
  const head = neck.add('head', part([{ x: -3, y: -11, z: -2, w: 6, h: 5, d: 7, u: 0, v: 13, inflate: g }]));
  neck.add('mane', part([{ x: -1, y: -11, z: 5.01, w: 2, h: 16, d: 2, u: 56, v: 36, inflate: g }]));
  neck.add('upper_mouth', part([{ x: -2, y: -11, z: -7, w: 4, h: 5, d: 5, u: 0, v: 25, inflate: g }]));
  // the legs, and a foal's: the same boxes drawn out five and a half pixels each way (on a half-size body)
  for (const baby of [false, true]) {
    const leg = (name: string, x: number, z: number, bz: number, mirror: boolean) =>
      root.add(baby ? `${name}_baby_leg` : `${name}_leg`, part([{ x: mirror ? -3 : -1, y: -1.01, z: bz, w: 4, h: 11, d: 4, u: 48, v: 21, mirror, ...(baby ? { grow: [g, g + 5.5, g] as [number, number, number] } : { inflate: g }) }], [x, 14, z]));
    leg('left_hind', 4, 7, -1, true);
    leg('right_hind', -4, 7, -1, false);
    leg('left_front', 4, -12, -1.9, true);
    leg('right_front', -4, -12, -1.9, false);
  }
  body.add('tail', part([{ x: -1.5, y: 0, z: 0, w: 3, h: 14, d: 4, u: 42, v: 36, inflate: g }], [0, -5, 2], [PI / 6, 0, 0]));
  body.add('saddle', part([{ x: -5, y: -8, z: -9, w: 10, h: 9, d: 9, u: 26, v: 0, inflate: 0.5 }]));
  neck.add('left_saddle_mouth', part([{ x: 2, y: -9, z: -6, w: 1, h: 2, d: 2, u: 29, v: 5, inflate: g }]));
  neck.add('right_saddle_mouth', part([{ x: -3, y: -9, z: -6, w: 1, h: 2, d: 2, u: 29, v: 5, inflate: g }]));
  neck.add('left_saddle_line', part([{ x: 3.1, y: -6, z: -8, w: 0, h: 3, d: 16, u: 32, v: 2 }], [0, 0, 0], [-PI / 6, 0, 0]));
  neck.add('right_saddle_line', part([{ x: -3.1, y: -6, z: -8, w: 0, h: 3, d: 16, u: 32, v: 2 }], [0, 0, 0], [-PI / 6, 0, 0]));
  neck.add('head_saddle', part([{ x: -3, y: -11, z: -1.9, w: 6, h: 5, d: 6, u: 1, v: 1, inflate: 0.22 }]));
  neck.add('mouth_saddle_wrap', part([{ x: -2, y: -11, z: -4, w: 4, h: 5, d: 2, u: 19, v: 0, inflate: 0.2 }]));
  if (!chested) {
    head.add('left_ear', part([{ x: 0.55, y: -13, z: 4, w: 2, h: 3, d: 1, u: 19, v: 16, inflate: -0.001 }]));
    head.add('right_ear', part([{ x: -2.55, y: -13, z: 4, w: 2, h: 3, d: 1, u: 19, v: 16, inflate: -0.001 }]));
  } else {
    // vanilla ChestedHorseModel: a chest strapped on either side, its lid outward, and long ears splayed back
    body.add('left_chest', part([{ x: -4, y: 0, z: -2, w: 8, h: 8, d: 3, u: 26, v: 21 }], [6, -8, 0], [0, -PI / 2, 0]));
    body.add('right_chest', part([{ x: -4, y: 0, z: -2, w: 8, h: 8, d: 3, u: 26, v: 21 }], [-6, -8, 0], [0, PI / 2, 0]));
    head.add('left_ear', part([{ x: -1, y: -7, z: 0, w: 2, h: 7, d: 1, u: 0, v: 12 }], [1.25, -10, 4], [0.2617994, 0, 0.2617994]));
    head.add('right_ear', part([{ x: -1, y: -7, z: 0, w: 2, h: 7, d: 1, u: 0, v: 12 }], [-1.25, -10, 4], [0.2617994, 0, -0.2617994]));
  }
  // (vanilla AgeableListModel(true, 16.2, 1.36, 2.7272, 2, 20))
  return { root, texW: 64, texH: 64, baby: { headParts: ['head_parts'], scaleHead: true, yHead: 16.2, zHead: 1.36, headScale: 2.7272, bodyScale: 2, bodyY: 20 } };
}

/** vanilla HorseModel.prepareMobModel and setupAnim (and ChestedHorseModel's: the chests show when it has one) */
export function animateHorse(root: ModelPart, h: AbstractHorse, a: LivingAnim, p: number): void {
  // the head: turned (at most 20° off the body) and pitched as it looks, nodding as it walks
  const f3 = Math.max(-20, Math.min(20, a.headYaw));
  let f4 = a.headPitch * RAD;
  if (a.limbAmount > 0.2) f4 += Math.cos(a.limbSwing * 0.8) * 0.15 * a.limbAmount;
  const eat = h.eatAnimAt(p), stand = h.standAnimAt(p), down = 1 - stand, mouth = h.mouthAnimAt(p);
  const t = a.age;
  const rest = 1 - Math.max(stand, eat);
  const neck = root.child('head_parts'), body = root.child('body');
  // (its legs move a fifth as fast in water)
  const f11 = Math.cos((h.inWater ? 0.2 : 1) * a.limbSwing * 0.6662 + PI);
  const f12 = f11 * 0.8 * a.limbAmount;
  // standing, the head tosses up and back; grazing, it drops right down to the ground; else it's where it looks
  neck.xRot = stand * (0.2617994 + f4) + eat * (2.1816616 + Math.sin(t) * 0.05) + rest * (PI / 6 + f4 + mouth * Math.sin(t) * 0.05);
  neck.yRot = stand * f3 * RAD + rest * f3 * RAD;
  neck.y = stand * -4 + eat * 11 + rest * 4;
  neck.z = stand * -4 + eat * -12 + rest * -12;
  body.xRot = stand * (-PI / 4);
  body.y = 11;
  // rearing, the hind legs take its weight and the forelegs paw the air; else they walk (the pairs in turn)
  const lf = root.child('left_front_leg'), rf = root.child('right_front_leg');
  lf.y = rf.y = 2 * stand + 14 * down;
  lf.z = rf.z = -6 * stand - 10 * down;
  const paw = Math.cos(t * 0.6 + PI);
  root.child('left_hind_leg').xRot = 0.2617994 * stand - f11 * 0.5 * a.limbAmount * down;
  root.child('right_hind_leg').xRot = 0.2617994 * stand + f11 * 0.5 * a.limbAmount * down;
  lf.xRot = (-PI / 3 + paw) * stand + f12 * down;
  rf.xRot = (-PI / 3 - paw) * stand - f12 * down;
  // the tail lifts and streams out the faster it goes, and swishes while it flicks
  const tail = body.child('tail');
  tail.xRot = PI / 6 + a.limbAmount * 0.75;
  tail.y = -5 + a.limbAmount;
  tail.z = 2 + a.limbAmount * 2;
  tail.yRot = h.tailCounter !== 0 ? Math.cos(t * 0.7) : 0;
  // a foal stands on the long legs, posed as the others would be
  const baby = h.isBaby();
  for (const n of LEGS) {
    const leg = root.child(`${n}_leg`), foal = root.child(`${n}_baby_leg`);
    foal.y = leg.y;
    foal.z = leg.z;
    foal.xRot = leg.xRot;
    leg.visible = !baby;
    foal.visible = baby;
  }
  const saddled = h.saddled, ridden = saddled && h.isVehicle();
  body.child('saddle').visible = saddled;
  for (const n of SADDLE_PARTS) if (n !== 'saddle') neck.child(n).visible = saddled;
  for (const n of RIDING_PARTS) neck.child(n).visible = ridden;
  if (body.children.has('left_chest')) body.child('left_chest').visible = body.child('right_chest').visible = h instanceof AbstractChestedHorse && h.hasChest;
}

/** vanilla AnimalArmorItem textures (equestrian) */
const ARMOR_TEXTURES: Record<string, string> = {
  leather_horse_armor: 'horse_armor_leather',
  iron_horse_armor: 'horse_armor_iron',
  golden_horse_armor: 'horse_armor_gold',
  diamond_horse_armor: 'horse_armor_diamond',
};

// ---------------------------------------------------------------------------

export class HorseRenderers {
  private readonly horse = horseModel();
  private readonly chested = horseModel(0, true);
  /** (vanilla ModelLayers.HORSE_ARMOR: the horse's model a tenth of a pixel bigger) */
  private readonly armor = horseModel(0.1);

  constructor(private readonly kit: LivingKit) {}

  /** draws `e` if it's one of these renderers' mobs (false: not ours) */
  render(b: EntityBatch, e: Mob, dx: number, dy: number, dz: number, p: number): boolean {
    if (!(e instanceof AbstractHorse)) return false;
    const kit = this.kit;
    const tex = kit.tex(e.texture());
    if (!tex) return true;
    const def = e instanceof AbstractChestedHorse ? this.chested : this.horse;
    // (vanilla HorseRenderer 1.1, DonkeyRenderer 0.87, MuleRenderer 0.92)
    const s = e instanceof Donkey ? 0.87 : e instanceof Mule ? 0.92 : 1.1;
    const a = kit.setupLiving(e, dx, dy, dz, p, 90, (pose) => pose.scale(s, s, s));
    animateHorse(def.root, e, a, p);
    const baby = e.isBaby();
    kit.overlay(b, e);
    kit.drawBody(b, e, def, tex, baby);
    if (e instanceof Horse) {
      // vanilla HorseMarkingLayer: over the coat, flashing red with it when hurt (entityTranslucent; its pixels are
      // all opaque or clear, so cut out the same)
      if (e.markings !== 'none' && !e.isInvisible()) {
        const mt = kit.tex('horse_markings_' + e.markings);
        if (mt) {
          b.begin(kit.state(mt));
          kit.drawModel(b, def, baby);
        }
      }
      // vanilla HorseArmorLayer: on its own model, posed the same, never flashing (NO_OVERLAY); leather in its dye
      const armor = e.bodyArmor();
      const at = armor && ARMOR_TEXTURES[armor.item.id] ? kit.tex(ARMOR_TEXTURES[armor.item.id]) : null;
      if (armor && at) {
        animateHorse(this.armor.root, e, a, p);
        const c = armor.item.id === 'leather_horse_armor' ? dyedColor(armor, DEFAULT_LEATHER_COLOR) : 0xffffff;
        b.setOverlay(0, 0, 0, 0);
        b.begin(kit.state(at));
        kit.drawModel(b, this.armor, baby, ((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255);
      }
    }
    b.setOverlay(0, 0, 0, 0);
    return true;
  }
}
