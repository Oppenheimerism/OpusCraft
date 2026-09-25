// Leads (vanilla LeadItem and LeashFenceKnotEntity): a lead ties an animal to the player who used it (entity/mob.ts
// has the mob's end: the tug, the walking after, the snap past ten blocks). Using a fence with animals on your leads
// ties every one within seven blocks to a knot round the fence; using the knot takes them back (or, with none on
// your leads, unties the knot and lets them all go), and so does hitting it or taking the fence away.

import { Entity } from './entity';
import type { Level } from '../game/level';
import type { Mob, SavedEntity } from './mob';
import type { Player } from './player';
import { AABB } from '../core/aabb';
import { BLOCKS, STATE_BLOCK } from '../world/block';
import { registerItemBehavior } from '../game/itemBehavior';

/** vanilla #fences (not the gates) */
export function isFence(name: string): boolean {
  return name.endsWith('_fence');
}

/** vanilla LeashFenceKnotEntity: the knot a lead makes round a fence post */
export class LeashKnot extends Entity {
  readonly type = 'leash_knot';
  /** vanilla BlockAttachedEntity.checkInterval: every 100 ticks it makes sure the fence is still there */
  private checkInterval = 0;

  constructor(level: Level, readonly bx = 0, readonly by = 0, readonly bz = 0) {
    super(level);
    this.noPhysics = true;
    // vanilla EntityType.LEASH_KNOT: sized(0.375, 0.5), at the middle of the block 0.375 up
    this.setSize(0.375, 0.5);
    this.moveTo(bx + 0.5, by + 0.375, bz + 0.5, 0, 0);
  }

  /** vanilla BlockAttachedEntity.tick: it stays put; now and then it checks its fence */
  override tick(): void {
    this.xo = this.x;
    this.yo = this.y;
    this.zo = this.z;
    this.tickCount++;
    if (this.y < this.level.world.dim.minY - 64) this.onBelowWorld();
    if (this.checkInterval++ === 100) {
      this.checkInterval = 0;
      if (!this.removed && !this.survives()) {
        this.remove();
        this.playBreakSound();
      }
    }
  }

  /** vanilla LeashFenceKnotEntity.survives: its block is still a fence */
  survives(): boolean {
    const st = this.level.getState(this.bx, this.by, this.bz);
    return isFence(BLOCKS[STATE_BLOCK[st]].name);
  }

  override isPickable(): boolean {
    return !this.removed;
  }

  /** vanilla BlockAttachedEntity.hurt: any blow undoes it (the animals tied there drop their leads) */
  override hurt(_amount: number, _source: string, _attacker?: Entity | null): boolean {
    if (this.removed) return false;
    this.remove();
    this.playBreakSound();
    return true;
  }

  /** vanilla LeashFenceKnotEntity.dropItem: nothing drops, but it's heard */
  private playBreakSound(): void {
    this.level.sound.play('entity.leash_knot.break', this.x, this.y, this.z, 1, 1);
  }

  playPlacementSound(): void {
    this.level.sound.play('entity.leash_knot.place', this.x, this.y, this.z, 1, 1);
  }

  /**
   * vanilla LeashFenceKnotEntity.interact: the animals on the player's leads nearby are tied here; with none, the knot
   * comes undone (in creative, the animals tied to it let go without dropping their leads)
   */
  interact(p: Player): void {
    const list = leashableInArea(this.level, this.bx, this.by, this.bz, (m) => m.leashHolder === p || m.leashHolder === this);
    let tied = false;
    for (const m of list)
      if (m.leashHolder === p) {
        m.setLeashedTo(this);
        tied = true;
      }
    if (tied) return;
    this.remove();
    if (p.gameMode === 'creative') for (const m of list) if (m.leashHolder === this) m.dropLeash(false);
  }

  /** vanilla LeashFenceKnotEntity.getRopeHoldPosition: the leads hang from just above its middle */
  override ropeHoldPosition(_p: number): [number, number, number] {
    return [this.x, this.y + 0.2, this.z];
  }

  save(): SavedEntity {
    return { id: this.type, x: this.x, y: this.y, z: this.z, yaw: 0, pitch: 0, dx: 0, dy: 0, dz: 0, health: 1, fire: 0, data: { bx: this.bx, by: this.by, bz: this.bz } };
  }

  static load(level: Level, d: SavedEntity): LeashKnot | null {
    const data = d.data ?? {};
    if (typeof data.bx !== 'number' || typeof data.by !== 'number' || typeof data.bz !== 'number') return null;
    return new LeashKnot(level, data.bx, data.by, data.bz);
  }
}

/** vanilla LeashFenceKnotEntity.getOrCreateKnot: the knot on the fence at (x, y, z), tied there now if there isn't one */
export function getOrCreateKnot(level: Level, x: number, y: number, z: number): LeashKnot {
  for (const e of level.getEntities(new AABB(x - 1, y - 1, z - 1, x + 1, y + 1, z + 1), (e) => e instanceof LeashKnot)) {
    const k = e as LeashKnot;
    if (k.bx === x && k.by === y && k.bz === z) return k;
  }
  const k = new LeashKnot(level, x, y, z);
  level.addEntity(k);
  return k;
}

/** vanilla LeadItem.leashableInArea: the animals within seven blocks of the fence (as a box) that `pred` picks */
export function leashableInArea(level: Level, x: number, y: number, z: number, pred: (m: Mob) => boolean): Mob[] {
  const box = new AABB(x - 7, y - 7, z - 7, x + 7, y + 7, z + 7);
  return level.getEntities(box, (e) => 'leashHolder' in e && pred(e as Mob)) as Mob[];
}

/**
 * vanilla LeadItem.bindPlayerMobs: every animal on the player's leads within reach of the fence at (x, y, z) is tied
 * to a knot there (one made, with its sound, for the first); false when there were none
 */
export function bindPlayerMobs(level: Level, p: Player, x: number, y: number, z: number): boolean {
  let knot: LeashKnot | null = null;
  const list = leashableInArea(level, x, y, z, (m) => m.leashHolder === p);
  for (const m of list) {
    if (!knot) {
      knot = getOrCreateKnot(level, x, y, z);
      knot.playPlacementSound();
    }
    m.setLeashedTo(knot);
  }
  return list.length > 0;
}

// vanilla LeadItem.useOn: on a fence it ties up the player's animals (and the hand swings whether or not there were any)
registerItemBehavior('lead', {
  useOn(level, p, _stack, h) {
    if (!isFence(level.getBlockName(h.x, h.y, h.z))) return 'pass';
    bindPlayerMobs(level, p, h.x, h.y, h.z);
    return 'success';
  },
});
