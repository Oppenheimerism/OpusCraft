// Status effect camera visuals: night vision strength (vanilla GameRenderer.getNightVisionScale,
// used by LightTexture and FogRenderer), the blindness fog wall (FogRenderer.BlindnessFogFunction),
// darkness's closing fog and pulsing gloom (DarknessFogFunction, LightTexture) and the nausea wobble on
// the projection (GameRenderer.renderLevel).

import type { LivingEntity } from '../entity/living';
import type { Player } from '../entity/player';
import { Mat4, mat4, multiply, scale } from '../core/math';

/**
 * vanilla GameRenderer.getNightVisionScale: full strength, flickering during the last 10 seconds; (Stage 5: ocean)
 * without night vision, conduit power lights things up as much with the eyes underwater (vanilla LightTexture: the
 * player's water vision, which here is always all of it)
 */
export function nightVisionScale(e: LivingEntity, partial: number): number {
  const inst = e.getEffect('night_vision');
  if (!inst) return e.getEffect('conduit_power') && e.isInFluidEye() ? 1 : 0;
  return !inst.endsWithin(200) ? 1 : 0.7 + Math.sin((inst.duration - partial) * Math.PI * 0.2) * 0.3;
}

export interface BlindnessFog {
  /** terrain fog end distance (fog starts at a quarter of it) */
  end: number;
  /** vanilla getModifiedVoidDarkness: fog colour scale, squared by the renderer (0 = black) */
  darkness: number;
}

/** vanilla BlindnessFogFunction.setupFog / getModifiedVoidDarkness; `far` = the terrain fog distance */
export function blindnessFog(e: LivingEntity, far: number): BlindnessFog | null {
  const inst = e.getEffect('blindness');
  if (!inst) return null;
  const end = inst.isInfinite() ? 5 : far + Math.min(1, inst.duration / 20) * (5 - far);
  return { end, darkness: inst.endsWithin(19) ? 1 - inst.duration / 20 : 0 };
}

/** the darkness effect's visuals this frame (vanilla DarknessFogFunction, LightTexture.getDarknessGamma / calculateDarknessScale) */
export interface DarknessVisuals {
  /** the effect's blend factor: the fog closes in to 15 blocks and its colour to black as it rises */
  factor: number;
  /** taken off the brightness option (the blend factor times the Darkness Pulsing option) */
  gamma: number;
  /** the gloom's pulse, taken off every lightmap colour (every 80 ticks it swells and ebbs) */
  pulse: number;
}

/** the darkness effect's fog and lightmap, with the Darkness Pulsing option's `effectScale`; null without the effect */
export function darknessVisuals(e: LivingEntity, partial: number, effectScale: number): DarknessVisuals | null {
  const inst = e.getEffect('darkness');
  if (!inst) return null;
  const factor = inst.blendFactor(partial);
  const gamma = factor * effectScale;
  return { factor, gamma, pulse: Math.max(0, Math.cos((e.tickCount - partial) * Math.PI * 0.025) * 0.45 * gamma) * effectScale };
}

const AXIS = Math.SQRT1_2;

/** right-handed rotation about the nausea axis (0, √½, √½), post-multiplied onto m */
function rotateNauseaAxis(m: Mat4, rad: number): void {
  const s = Math.sin(rad), c = Math.cos(rad), t = 1 - c;
  const x = 0, y = AXIS, z = AXIS;
  const r = mat4();
  r[0] = x * x * t + c;
  r[1] = y * x * t + z * s;
  r[2] = z * x * t - y * s;
  r[4] = x * y * t - z * s;
  r[5] = y * y * t + c;
  r[6] = z * y * t + x * s;
  r[8] = x * z * t + y * s;
  r[9] = y * z * t - x * s;
  r[10] = z * z * t + c;
  multiply(m, m, r);
}

/**
 * vanilla GameRenderer.renderLevel: while nauseous the view is squashed along an axis that keeps
 * turning (7°/tick), scaled by the Distortion Effects option. `m` is the camera-space bob matrix.
 */
export function applyNausea(m: Mat4, p: Player, partial: number, ticks: number, distortion: number): void {
  const f1 = (p.oSpinningEffectIntensity + (p.spinningEffectIntensity - p.oSpinningEffectIntensity) * partial) * distortion * distortion;
  if (f1 <= 0) return;
  const i = p.hasEffect('nausea') ? 7 : 20;
  let f2 = 5 / (f1 * f1 + 5) - f1 * 0.04;
  f2 *= f2;
  const a = ((ticks + partial) * i * Math.PI) / 180;
  rotateNauseaAxis(m, a);
  scale(m, m, 1 / f2, 1, 1);
  rotateNauseaAxis(m, -a);
}
