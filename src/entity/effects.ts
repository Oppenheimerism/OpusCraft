// Status effects (vanilla MobEffect, MobEffects and MobEffectInstance): the
// effect registry with its colours and per-effect tick schedules, instances
// with vanilla's merge rules and hidden (shadowed) weaker copies, the HUD /
// inventory ordering, display strings and save data.

import type { Entity } from './entity';
import type { LivingEntity } from './living';
import type { Player } from './player';

export type EffectCategory = 'beneficial' | 'harmful' | 'neutral';

export interface MobEffect {
  readonly id: string;
  /** vanilla effect.minecraft.<id> */
  readonly name: string;
  readonly category: EffectCategory;
  /** vanilla MobEffect.getColor (RGB): swirl particles */
  readonly color: number;
  /** vanilla InstantenousMobEffect (instant health / damage, saturation) */
  readonly instant: boolean;
  /** vanilla shouldApplyEffectTickThisTick */
  shouldTick(duration: number, amplifier: number): boolean;
  /** vanilla applyEffectTick; false removes the effect */
  applyTick(e: LivingEntity, amplifier: number): boolean;
  /** vanilla onEffectStarted: every time the effect is given, even when it doesn't replace the current one */
  onStarted(e: LivingEntity, amplifier: number): void;
  /**
   * vanilla MobEffect.applyInstantenousEffect: an instant effect from a drunk or splashed potion, all at once, at
   * `health` of its strength (a splash's closeness); `source` is the potion, `indirect` who threw it
   */
  applyInstant(source: Entity | null, indirect: Entity | null, target: LivingEntity, amplifier: number, health: number): void;
  /** vanilla MobEffect.onMobRemoved: its bearer was killed (as the death animation ends); see game/potionEffects.ts */
  onMobRemoved?(e: LivingEntity, amplifier: number): void;
  /** vanilla MobEffect.onMobHurt: its bearer was hurt */
  onMobHurt?(e: LivingEntity, amplifier: number, source: string, amount: number): void;
  /** vanilla MobEffect.createParticleOptions: a particle of its own rather than the swirl in its colour */
  readonly particle?: string;
  /** vanilla MobEffect.getBlendDurationTicks: how long its visuals take to fade in and out (darkness's 22) */
  readonly blendDuration?: number;
  /**
   * vanilla MobEffect.attributeModifiers, for the potion tooltips' "When Applied:" lines (LivingEntity reads the
   * effects themselves where vanilla reads the attributes): the attribute's name, the amount per level, and whether
   * it's a fraction (ADD_MULTIPLIED_TOTAL) rather than a plain amount (ADD_VALUE)
   */
  readonly modifiers?: readonly EffectModifier[];
}

export interface EffectModifier {
  attribute: string;
  amount: number;
  multiplied: boolean;
}

/** vanilla `int i = n >> amplifier; return i > 0 ? duration % i == 0 : true` */
const every = (n: number) => (duration: number, amplifier: number): boolean => {
  const i = n >> amplifier;
  return i > 0 ? duration % i === 0 : true;
};

export const MOB_EFFECTS: Record<string, MobEffect> = {};

function reg(id: string, name: string, category: EffectCategory, color: number, o: Partial<Pick<MobEffect, 'instant' | 'shouldTick' | 'applyTick' | 'onStarted' | 'applyInstant' | 'particle' | 'modifiers' | 'blendDuration'>> = {}): MobEffect {
  const e: MobEffect = {
    id, name, category, color,
    particle: o.particle,
    blendDuration: o.blendDuration,
    modifiers: o.modifiers,
    instant: !!o.instant,
    // vanilla InstantenousMobEffect ticks while it lasts (one tick when given by a command)
    shouldTick: o.shouldTick ?? (o.instant ? (d) => d >= 1 : () => false),
    applyTick: o.applyTick ?? (() => true),
    onStarted: o.onStarted ?? (() => {}),
    // (vanilla MobEffect.applyInstantenousEffect: the tick's effect, once)
    applyInstant: o.applyInstant ?? ((_s, _i, target, amp) => void e.applyTick(target, amp)),
  };
  MOB_EFFECTS[id] = e;
  return e;
}

/** vanilla HealOrHarmMobEffect: undead are healed by harming and harmed by healing */
function healOrHarm(harm: boolean) {
  return (e: LivingEntity, amp: number): boolean => {
    if (harm === e.isUndead()) e.heal(Math.max(4 << amp, 0));
    else e.hurt(6 << amp, 'magic');
    return true;
  };
}

/** vanilla HealOrHarmMobEffect.applyInstantenousEffect: scaled by `health`, rounded; thrown, the thrower is to blame */
function healOrHarmInstant(harm: boolean) {
  return (source: Entity | null, indirect: Entity | null, e: LivingEntity, amp: number, health: number): void => {
    if (harm === e.isUndead()) e.heal(Math.floor(health * (4 << amp) + 0.5));
    else if (source) e.hurt(Math.floor(health * (6 << amp) + 0.5), 'indirectMagic', indirect, source);
    else e.hurt(Math.floor(health * (6 << amp) + 0.5), 'magic');
  };
}

// vanilla MobEffects registration order; attribute effects (speed, strength, health boost...) are
// read by LivingEntity where vanilla reads the attribute
const mod = (attribute: string, amount: number, multiplied = false): EffectModifier[] => [{ attribute, amount, multiplied }];
reg('speed', 'Speed', 'beneficial', 0x33ebff, { modifiers: mod('Speed', 0.2, true) });
reg('slowness', 'Slowness', 'harmful', 0x8bafe0, { modifiers: mod('Speed', -0.15, true) });
reg('haste', 'Haste', 'beneficial', 0xd9c043, { modifiers: mod('Attack Speed', 0.1, true) });
reg('mining_fatigue', 'Mining Fatigue', 'harmful', 0x4a4217, { modifiers: mod('Attack Speed', -0.1, true) });
reg('strength', 'Strength', 'beneficial', 0xffc700, { modifiers: mod('Attack Damage', 3) });
reg('instant_health', 'Instant Health', 'beneficial', 0xf82423, { instant: true, applyTick: healOrHarm(false), applyInstant: healOrHarmInstant(false) });
reg('instant_damage', 'Instant Damage', 'harmful', 0xa9656a, { instant: true, applyTick: healOrHarm(true), applyInstant: healOrHarmInstant(true) });
reg('jump_boost', 'Jump Boost', 'beneficial', 0xfdff84, { modifiers: mod('Safe Fall Distance', 1) });
reg('nausea', 'Nausea', 'harmful', 0x551d4a);
// vanilla RegenerationMobEffect: 1 HP every 50 >> amplifier ticks
reg('regeneration', 'Regeneration', 'beneficial', 0xcd5cab, {
  shouldTick: every(50),
  applyTick: (e) => {
    if (e.health < e.maxHealth) e.heal(1);
    return true;
  },
});
reg('resistance', 'Resistance', 'beneficial', 0x9146f0);
reg('fire_resistance', 'Fire Resistance', 'beneficial', 0xff9900);
reg('water_breathing', 'Water Breathing', 'beneficial', 0x98dac0);
reg('invisibility', 'Invisibility', 'beneficial', 0xf6f6f6);
reg('blindness', 'Blindness', 'harmful', 0x1f1f23);
reg('night_vision', 'Night Vision', 'beneficial', 0xc2ff66);
// vanilla HungerMobEffect: exhaustion every tick
reg('hunger', 'Hunger', 'harmful', 0x587653, {
  shouldTick: () => true,
  applyTick: (e, amp) => {
    e.causeFoodExhaustion(0.005 * (amp + 1));
    return true;
  },
});
reg('weakness', 'Weakness', 'harmful', 0x484d48, { modifiers: mod('Attack Damage', -4) });
// vanilla PoisonMobEffect: 1 magic damage every 25 >> amplifier ticks, never below half a heart
reg('poison', 'Poison', 'harmful', 0x87a363, {
  shouldTick: every(25),
  applyTick: (e) => {
    if (e.health > 1) e.hurt(1, 'magic');
    return true;
  },
});
// vanilla WitherMobEffect: 1 wither damage every 40 >> amplifier ticks
reg('wither', 'Wither', 'harmful', 0x736156, {
  shouldTick: every(40),
  applyTick: (e) => {
    e.hurt(1, 'wither');
    return true;
  },
});
reg('health_boost', 'Health Boost', 'beneficial', 0xf87d23, { modifiers: mod('Max Health', 4) });
// vanilla AbsorptionMobEffect: golden hearts on start; the effect ends when they are used up
reg('absorption', 'Absorption', 'beneficial', 0x2552a5, {
  modifiers: mod('Max Absorption', 4),
  shouldTick: () => true,
  applyTick: (e) => e.absorption > 0,
  onStarted: (e, amp) => {
    e.absorption = Math.min(e.maxAbsorption(), Math.max(e.absorption, 4 * (1 + amp)));
  },
});
// vanilla SaturationMobEffect
reg('saturation', 'Saturation', 'beneficial', 0xf82423, {
  instant: true,
  applyTick: (e, amp) => {
    if (e.type === 'player') (e as Player).food.eat(amp + 1, 1);
    return true;
  },
});
reg('glowing', 'Glowing', 'neutral', 0x94a061);
reg('levitation', 'Levitation', 'harmful', 0xceffff);
reg('luck', 'Luck', 'beneficial', 0x59c106, { modifiers: mod('Luck', 1) });
reg('unluck', 'Bad Luck', 'harmful', 0xc0a44d, { modifiers: mod('Luck', -1) });
reg('slow_falling', 'Slow Falling', 'beneficial', 0xf3cfb9);
reg('conduit_power', 'Conduit Power', 'beneficial', 0x1dc2d1);
reg('dolphins_grace', "Dolphin's Grace", 'beneficial', 0x88a3be);
reg('bad_omen', 'Bad Omen', 'neutral', 0x0b6138);
reg('hero_of_the_village', 'Hero of the Village', 'beneficial', 0x44ff44);
// (the deep dark) vanilla MobEffects.DARKNESS: its fog and pulsing gloom fade in and out over 22 ticks (render/effectVisuals.ts)
reg('darkness', 'Darkness', 'harmful', 0x292721, { blendDuration: 22 });
reg('trial_omen', 'Trial Omen', 'neutral', 0x16a6a6);
reg('raid_omen', 'Raid Omen', 'neutral', 0xde4058);
// the 1.21 potions' effects: what they do when their bearer dies or is hurt is in game/potionEffects.ts
reg('wind_charged', 'Wind Charged', 'harmful', 0xbdc9ff, { particle: 'small_gust' });
reg('weaving', 'Weaving', 'harmful', 0x78695a, { particle: 'item_cobweb' });
reg('oozing', 'Oozing', 'harmful', 0x99ffa3, { particle: 'item_slime' });
reg('infested', 'Infested', 'harmful', 0x8c9b8c, { particle: 'infested' });

/** registry lookup accepting a namespaced id (minecraft:speed) */
export function mobEffect(id: string): MobEffect | undefined {
  return MOB_EFFECTS[id.replace(/^minecraft:/, '')];
}

export const INFINITE_DURATION = -1;

/** vanilla MobEffectInstance */
export class MobEffectInstance {
  duration: number;
  amplifier: number;
  /** the weaker/longer effect that takes over when this one runs out */
  hiddenEffect: MobEffectInstance | null;
  /** vanilla MobEffectInstance.BlendState: how far its visuals have faded in (0..1), now and a tick ago */
  private blend = 0;
  private blendO = 0;

  constructor(
    readonly effect: MobEffect,
    duration = 0,
    amplifier = 0,
    public ambient = false,
    /** vanilla visible: shows swirl particles */
    public visible = true,
    public showIcon = visible,
    hiddenEffect: MobEffectInstance | null = null,
  ) {
    this.duration = duration;
    this.amplifier = Math.max(0, Math.min(255, amplifier));
    this.hiddenEffect = hiddenEffect;
  }

  static copyOf(o: MobEffectInstance): MobEffectInstance {
    return new MobEffectInstance(o.effect, o.duration, o.amplifier, o.ambient, o.visible, o.showIcon, o.hiddenEffect ? MobEffectInstance.copyOf(o.hiddenEffect) : null);
  }

  get id(): string {
    return this.effect.id;
  }

  isInfinite(): boolean {
    return this.duration === INFINITE_DURATION;
  }

  endsWithin(ticks: number): boolean {
    return !this.isInfinite() && this.duration <= ticks;
  }

  private isShorterDurationThan(o: MobEffectInstance): boolean {
    return !this.isInfinite() && (this.duration < o.duration || o.isInfinite());
  }

  private setDetailsFrom(o: MobEffectInstance): void {
    this.duration = o.duration;
    this.amplifier = o.amplifier;
    this.ambient = o.ambient;
    this.visible = o.visible;
    this.showIcon = o.showIcon;
  }

  /**
   * vanilla MobEffectInstance.update: re-applying the same effect. A stronger level replaces this one
   * (keeping this as a hidden effect if it would outlast it), the same level extends the duration, a
   * weaker but longer one is kept hidden for later. Returns true when this instance changed.
   */
  update(o: MobEffectInstance): boolean {
    let changed = false;
    if (o.amplifier > this.amplifier) {
      if (o.isShorterDurationThan(this)) {
        const old = this.hiddenEffect;
        this.hiddenEffect = new MobEffectInstance(this.effect, this.duration, this.amplifier, this.ambient, this.visible, this.showIcon, old);
      }
      this.amplifier = o.amplifier;
      this.duration = o.duration;
      changed = true;
    } else if (this.isShorterDurationThan(o)) {
      if (o.amplifier === this.amplifier) {
        this.duration = o.duration;
        changed = true;
      } else if (!this.hiddenEffect) this.hiddenEffect = MobEffectInstance.copyOf(o);
      else this.hiddenEffect.update(o);
    }
    if ((!o.ambient && this.ambient) || changed) {
      this.ambient = o.ambient;
      changed = true;
    }
    if (o.visible !== this.visible) {
      this.visible = o.visible;
      changed = true;
    }
    if (o.showIcon !== this.showIcon) {
      this.showIcon = o.showIcon;
      changed = true;
    }
    return changed;
  }

  /** vanilla MobEffectInstance.tick; `onHiddenTakeover` runs when the hidden effect replaces this one */
  tick(e: LivingEntity, onHiddenTakeover: () => void): boolean {
    if (this.hasRemainingDuration()) {
      const i = this.isInfinite() ? e.tickCount : this.duration;
      if (this.effect.shouldTick(i, this.amplifier) && !this.effect.applyTick(e, this.amplifier)) e.removeEffect(this.effect.id);
      this.tickDownDuration();
      if (this.duration === 0 && this.hiddenEffect) {
        const h = this.hiddenEffect;
        this.setDetailsFrom(h);
        this.hiddenEffect = h.hiddenEffect;
        onHiddenTakeover();
      }
    }
    this.tickBlend();
    return this.hasRemainingDuration();
  }

  /** vanilla BlendState.tick: toward 1 while it lasts, toward 0 over its last blend-duration ticks, 1/duration a tick */
  private tickBlend(): void {
    this.blendO = this.blend;
    const n = this.effect.blendDuration ?? 0;
    if (n === 0) this.blend = 1;
    else {
      const target = this.endsWithin(n) ? 0 : 1;
      if (this.blend !== target) this.blend += Math.max(-1 / n, Math.min(1 / n, target - this.blend));
    }
  }

  /** vanilla BlendState.setImmediate (MobEffectInstance.skipBlending): at its level at once (an effect loaded with the world) */
  skipBlending(): void {
    const n = this.effect.blendDuration ?? 0;
    this.blend = this.blendO = n === 0 || !this.endsWithin(n) ? 1 : 0;
  }

  /** vanilla getBlendFactor */
  blendFactor(partial: number): number {
    return this.blendO + (this.blend - this.blendO) * partial;
  }

  private hasRemainingDuration(): boolean {
    return this.isInfinite() || this.duration > 0;
  }

  private tickDownDuration(): void {
    this.hiddenEffect?.tickDownDuration();
    if (!this.isInfinite()) this.duration--;
  }
}

/** vanilla MobEffectInstance.compareTo: ambient and infinite last, then by duration, then by colour */
export function compareEffects(a: MobEffectInstance, b: MobEffectInstance): number {
  const falseFirst = (x: boolean, y: boolean) => (x === y ? 0 : x ? 1 : -1);
  if ((a.duration <= 32147 || b.duration <= 32147) && (!a.ambient || !b.ambient)) {
    return falseFirst(a.ambient, b.ambient) || falseFirst(a.isInfinite(), b.isInfinite()) || a.duration - b.duration || a.effect.color - b.effect.color;
  }
  return falseFirst(a.ambient, b.ambient) || a.effect.color - b.effect.color;
}

const LEVELS = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

/** vanilla EffectRenderingInventoryScreen.getEffectName: the level numeral for amplifiers 1-9 */
export function effectDisplayName(inst: MobEffectInstance): string {
  const n = inst.effect.name;
  return inst.amplifier >= 1 && inst.amplifier <= 9 ? `${n} ${LEVELS[inst.amplifier + 1]}` : n;
}

/** vanilla MobEffectUtil.formatDuration → StringUtil.formatTickDuration (mm:ss, hh:mm:ss past an hour) */
export function formatEffectDuration(inst: MobEffectInstance): string {
  if (inst.isInfinite()) return '∞';
  let s = Math.floor(inst.duration / 20);
  let m = Math.floor(s / 60);
  s %= 60;
  const h = Math.floor(m / 60);
  m %= 60;
  const two = (v: number) => String(v).padStart(2, '0');
  return h > 0 ? `${two(h)}:${two(m)}:${two(s)}` : `${two(m)}:${two(s)}`;
}

/** vanilla MobEffectInstance.save (active_effects entry) */
export interface SavedEffect {
  id: string;
  amplifier: number;
  duration: number;
  ambient?: boolean;
  show_particles?: boolean;
  show_icon?: boolean;
  hidden_effect?: SavedEffect;
}

export function saveEffect(i: MobEffectInstance): SavedEffect {
  const o: SavedEffect = { id: 'minecraft:' + i.effect.id, amplifier: i.amplifier, duration: i.duration };
  if (i.ambient) o.ambient = true;
  if (!i.visible) o.show_particles = false;
  if (!i.showIcon) o.show_icon = false;
  if (i.hiddenEffect) o.hidden_effect = saveEffect(i.hiddenEffect);
  return o;
}

export function loadEffect(d: SavedEffect | undefined): MobEffectInstance | null {
  const e = d && mobEffect(String(d.id));
  if (!d || !e) return null;
  const visible = d.show_particles !== false;
  return new MobEffectInstance(e, Number(d.duration), Number(d.amplifier), !!d.ambient, visible, d.show_icon ?? visible, loadEffect(d.hidden_effect));
}
