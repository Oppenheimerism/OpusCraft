// Vanilla's Brain scaffolding (net.minecraft.world.entity.ai.Brain and ai.behavior): behaviours with a running
// status and a duration, one-shot triggers, the RunOne / TryAll gates, and a brain that each tick starts whatever
// behaviours of its active activities can start, in priority order, then ticks those running. The memories stay
// plain fields on the mob; the behaviours read and write them through closures.

import type { Rand } from '../../core/rng';

type Owner = { random: Rand };

export interface BehaviorControl<E> {
  status: 'stopped' | 'running';
  tryStart(e: E, now: number): boolean;
  tickOrStop(e: E, now: number): void;
  doStop(e: E, now: number): void;
}

export interface BehaviorSpec<E> {
  /** vanilla minDuration / maxDuration (both 60 by default) */
  min?: number;
  max?: number;
  /** hasRequiredMemories and checkExtraStartConditions */
  canStart?(e: E, now: number): boolean;
  start?(e: E, now: number): void;
  /** (vanilla default: false, so a behaviour that doesn't say stops on the tick it started) */
  canStillUse?(e: E, now: number): boolean;
  tick?(e: E, now: number): void;
  stop?(e: E, now: number): void;
  /** false: it never times out (vanilla overrides timedOut) */
  timesOut?: boolean;
}

/** vanilla Behavior */
export class Behavior<E extends Owner> implements BehaviorControl<E> {
  status: 'stopped' | 'running' = 'stopped';
  private endTimestamp = 0;

  constructor(private readonly s: BehaviorSpec<E>) {}

  tryStart(e: E, now: number): boolean {
    if (this.s.canStart && !this.s.canStart(e, now)) return false;
    this.status = 'running';
    const min = this.s.min ?? 60, max = this.s.max ?? min;
    this.endTimestamp = now + min + e.random.nextInt(max + 1 - min);
    this.s.start?.(e, now);
    return true;
  }

  tickOrStop(e: E, now: number): void {
    const timedOut = this.s.timesOut !== false && now > this.endTimestamp;
    if (!timedOut && (this.s.canStillUse?.(e, now) ?? false)) this.s.tick?.(e, now);
    else this.doStop(e, now);
  }

  doStop(e: E, now: number): void {
    this.status = 'stopped';
    this.s.stop?.(e, now);
  }
}

/** vanilla OneShot (BehaviorBuilder.create): a trigger that counts as running until the brain's next tick of it */
export function oneShot<E>(trigger: (e: E, now: number) => boolean): BehaviorControl<E> {
  return {
    status: 'stopped',
    tryStart(e, now) {
      if (!trigger(e, now)) return false;
      this.status = 'running';
      return true;
    },
    tickOrStop(e, now) {
      this.doStop(e, now);
    },
    doStop() {
      this.status = 'stopped';
    },
  };
}

/** vanilla DoNothing(min, max): keeps a gate busy */
export function doNothing<E extends Owner>(min: number, max: number): BehaviorControl<E> {
  return new Behavior<E>({ min, max, canStillUse: () => true });
}

/** vanilla ShufflingList.shuffle: each entry keyed -rand^(1/weight), lowest first */
function shuffled<T>(list: readonly [T, number][], r: Rand): [T, number][] {
  return list.map(([t, w]) => ({ t, w, k: -Math.pow(r.nextFloat(), 1 / w) })).sort((a, b) => a.k - b.k).map((o) => [o.t, o.w]);
}

/**
 * vanilla GateBehavior: starts (with its entry condition met) and tries its children, shuffled or in order, the
 * first that starts (RUN_ONE) or all of them (TRY_ALL); it runs while any child does, and on stopping erases its
 * exit memories
 */
export class GateBehavior<E extends Owner> implements BehaviorControl<E> {
  status: 'stopped' | 'running' = 'stopped';

  constructor(
    private readonly children: [BehaviorControl<E>, number][],
    private readonly o: { entry?: (e: E) => boolean; exit?: (e: E) => void; shuffle?: boolean; tryAll?: boolean } = {},
  ) {}

  tryStart(e: E, now: number): boolean {
    if (this.o.entry && !this.o.entry(e)) return false;
    this.status = 'running';
    const list = this.o.shuffle === false ? this.children : shuffled(this.children, e.random);
    for (const [b] of list) if (b.status === 'stopped' && b.tryStart(e, now) && !this.o.tryAll) break;
    return true;
  }

  tickOrStop(e: E, now: number): void {
    for (const [b] of this.children) if (b.status === 'running') b.tickOrStop(e, now);
    if (!this.children.some(([b]) => b.status === 'running')) this.doStop(e, now);
  }

  doStop(e: E, now: number): void {
    this.status = 'stopped';
    for (const [b] of this.children) if (b.status === 'running') b.doStop(e, now);
    this.o.exit?.(e);
  }
}

/** vanilla RunOne: a shuffled, run-one gate */
export function runOne<E extends Owner>(children: [BehaviorControl<E>, number][], entry?: (e: E) => boolean): GateBehavior<E> {
  return new GateBehavior(children, { entry });
}

/** vanilla TriggerGate.triggerOneShuffled: each tick, the triggers shuffled until one fires */
export function triggerOneShuffled<E extends Owner>(triggers: [(e: E, now: number) => boolean, number][]): BehaviorControl<E> {
  return oneShot<E>((e, now) => {
    for (const [t] of shuffled(triggers, e.random)) if (t(e, now)) break;
    return true;
  });
}

export class Brain<E extends Owner, A extends string> {
  /** every behaviour with its activity, by priority (vanilla availableBehaviorsByPriority) */
  private readonly entries: { p: number; a: A; b: BehaviorControl<E> }[] = [];
  private readonly requirements = new Map<A, (e: E) => boolean>();
  private readonly core = new Set<A>();
  private active = new Set<A>();
  private lastScheduleUpdate = -9999;

  constructor(private defaultActivity: A, core: A[]) {
    for (const a of core) this.core.add(a);
  }

  /** vanilla setDefaultActivity (Stage 4: raids — a villager in a raid falls back on it rather than idling) */
  setDefaultActivity(a: A): void {
    this.defaultActivity = a;
  }

  /** vanilla addActivity / addActivityWithConditions */
  add(activity: A, behaviours: [number, BehaviorControl<E>][], requirement?: (e: E) => boolean): void {
    for (const [p, b] of behaviours) this.entries.push({ p, a: activity, b });
    // (a stable sort keeps each priority's behaviours in the order they came)
    this.entries.sort((x, y) => x.p - y.p);
    if (requirement) this.requirements.set(activity, requirement);
  }

  isActive(a: A): boolean {
    return this.active.has(a);
  }

  /** vanilla getActiveNonCoreActivity */
  activeNonCore(): A | null {
    for (const a of this.active) if (!this.core.has(a)) return a;
    return null;
  }

  /** vanilla setActiveActivityIfPossible: the activity if its memories are there, else the default */
  setActiveActivityIfPossible(a: A, e: E): void {
    const req = this.requirements.get(a);
    this.setActive(!req || req(e) ? a : this.defaultActivity);
  }

  /** (M8: goats) vanilla setActiveActivityToFirstValid: the first of these whose memories are there (else as it was) */
  setActiveActivityToFirstValid(list: A[], e: E): void {
    for (const a of list) {
      const req = this.requirements.get(a);
      if (!req || req(e)) {
        this.setActive(a);
        return;
      }
    }
  }

  private setActive(a: A): void {
    if (this.active.has(a)) return;
    this.active = new Set(this.core);
    this.active.add(a);
  }

  /** vanilla updateActivityFromSchedule: at most once a second, whatever the schedule says now */
  updateActivityFromSchedule(e: E, scheduled: A, gameTime: number): void {
    if (gameTime - this.lastScheduleUpdate <= 20) return;
    this.lastScheduleUpdate = gameTime;
    if (!this.active.has(scheduled)) this.setActiveActivityIfPossible(scheduled, e);
  }

  /** vanilla Brain.tick after the sensors: start what can start, then tick what runs */
  tick(e: E, now: number): void {
    for (const x of this.entries) if (this.active.has(x.a) && x.b.status === 'stopped') x.b.tryStart(e, now);
    for (const x of this.entries) if (x.b.status === 'running') x.b.tickOrStop(e, now);
  }

  /** vanilla stopAll */
  stopAll(e: E, now: number): void {
    for (const x of this.entries) if (x.b.status === 'running') x.b.doStop(e, now);
  }
}
