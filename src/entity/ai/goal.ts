// Goal framework (vanilla Goal / WrappedGoal / GoalSelector).

export const enum Flag {
  MOVE = 1,
  LOOK = 2,
  JUMP = 4,
  TARGET = 8,
}

export abstract class Goal {
  flags = 0;
  abstract canUse(): boolean;
  canContinueToUse(): boolean {
    return this.canUse();
  }
  isInterruptable(): boolean {
    return true;
  }
  start(): void {}
  stop(): void {}
  requiresUpdateEveryTick(): boolean {
    return false;
  }
  tick(): void {}
  protected adjustedTickDelay(d: number): number {
    return this.requiresUpdateEveryTick() ? d : reducedTickDelay(d);
  }
}

/** vanilla Goal.reducedTickDelay (goals tick every other game tick) */
export function reducedTickDelay(d: number): number {
  return Math.ceil(d / 2);
}

class WrappedGoal {
  running = false;
  constructor(readonly priority: number, readonly goal: Goal) {}
  canBeReplacedBy(o: WrappedGoal): boolean {
    return this.goal.isInterruptable() && o.priority < this.priority;
  }
  start(): void {
    if (!this.running) {
      this.running = true;
      this.goal.start();
    }
  }
  stop(): void {
    if (this.running) {
      this.running = false;
      this.goal.stop();
    }
  }
}

const FLAGS = [Flag.MOVE, Flag.LOOK, Flag.JUMP, Flag.TARGET];

export class GoalSelector {
  private readonly goals: WrappedGoal[] = [];
  private readonly locked = new Map<Flag, WrappedGoal>();
  disabledFlags = 0;

  addGoal(priority: number, goal: Goal): void {
    this.goals.push(new WrappedGoal(priority, goal));
  }

  removeGoal(goal: Goal): void {
    for (const w of this.goals) if (w.goal === goal && w.running) w.stop();
    const i = this.goals.findIndex((w) => w.goal === goal);
    if (i >= 0) this.goals.splice(i, 1);
  }

  running(): Goal[] {
    return this.goals.filter((w) => w.running).map((w) => w.goal);
  }

  tick(): void {
    for (const w of this.goals) {
      if (w.running && ((w.goal.flags & this.disabledFlags) !== 0 || !w.goal.canContinueToUse())) w.stop();
    }
    for (const [f, w] of this.locked) if (!w.running) this.locked.delete(f);
    for (const w of this.goals) {
      if (w.running || (w.goal.flags & this.disabledFlags) !== 0) continue;
      let ok = true;
      for (const f of FLAGS) {
        if (!(w.goal.flags & f)) continue;
        const cur = this.locked.get(f);
        if (cur && !cur.canBeReplacedBy(w)) {
          ok = false;
          break;
        }
      }
      if (!ok || !w.goal.canUse()) continue;
      for (const f of FLAGS) {
        if (!(w.goal.flags & f)) continue;
        this.locked.get(f)?.stop();
        this.locked.set(f, w);
      }
      w.start();
    }
    this.tickRunningGoals(true);
  }

  tickRunningGoals(all: boolean): void {
    for (const w of this.goals) if (w.running && (all || w.goal.requiresUpdateEveryTick())) w.goal.tick();
  }

  stopAll(): void {
    for (const w of this.goals) w.stop();
    this.locked.clear();
  }
}
