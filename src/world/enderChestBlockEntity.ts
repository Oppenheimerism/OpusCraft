// The ender chest's block entity (vanilla EnderChestBlockEntity): it holds nothing itself (what's inside is each
// player's own, game/enderChest.ts), only who is looking in (vanilla ContainerOpenersCounter: the first opens it with
// its sound, the last to leave shuts it) and the lid that follows them (vanilla ChestLidController: up a tenth of the
// way each tick while anyone looks in, down again after).
//
// The lid is kept as where it was going and since when (open or shut, from how far open, at which game tick), which is
// all a guest's copy needs to draw it moving as the host's does (sent with the block entity's data; never saved).

import { BlockEntity, registerBlockEntity } from './blockEntity';
import { STATE_BLOCK } from './block';
import type { Level } from '../game/level';
import type { Player } from '../entity/player';

/** vanilla ChestLidController: how much of the way the lid goes in a tick */
const LID_STEP = 0.1;

export class EnderChestBlockEntity extends BlockEntity {
  readonly id: string = 'ender_chest';
  /** (the host's) who has it open, vanilla ContainerOpenersCounter's count */
  readonly openers = new Set<Player>();
  /** the lid: going up (open) or down, from `lidFrom` open, since game tick `lidAt` */
  lidOpen = false;
  lidFrom = 0;
  lidAt = 0;
  private recheck = 0;

  constructor(x: number, y: number, z: number) {
    super(x, y, z, 0);
  }

  /** vanilla ChestLidController.getOpenness at game time `t` (a tick and its fraction): 0 shut to 1 open */
  openness(t: number): number {
    const d = Math.max(0, t - this.lidAt) * LID_STEP;
    return this.lidOpen ? Math.min(1, this.lidFrom + d) : Math.max(0, this.lidFrom - d);
  }

  /** vanilla triggerEvent(1, count) → ChestLidController.shouldBeOpen: the lid starts up or down from where it is */
  setLid(open: boolean, gameTime: number): void {
    if (open === this.lidOpen) return;
    this.lidFrom = this.openness(gameTime);
    this.lidOpen = open;
    this.lidAt = gameTime;
    // (its copies told: net/)
    if (this.container.onChange) this.container.onChange();
    else this.version++;
  }

  /**
   * vanilla EnderChestBlockEntity.startOpen (ContainerOpenersCounter.incrementOpeners): the first to look in opens it,
   * with its sound and CONTAINER_OPEN; the lid's told how many look in (a block event, as vanilla's)
   */
  startOpen(level: Level, p: Player): void {
    if (this.removed || p.gameMode === 'spectator' || this.openers.has(p)) return;
    this.openers.add(p);
    if (this.openers.size === 1) {
      level.sound.play('block.ender_chest.open', this.x + 0.5, this.y + 0.5, this.z + 0.5, 0.5, level.random.nextFloat() * 0.1 + 0.9);
      level.gameEvent('container_open', this.x + 0.5, this.y + 0.5, this.z + 0.5, { entity: p });
    }
    this.openerCountChanged(level);
  }

  /** vanilla stopOpen (decrementOpeners): the last to leave shuts it, with its sound and CONTAINER_CLOSE */
  stopOpen(level: Level, p: Player): void {
    if (this.removed || !this.openers.delete(p)) return;
    if (this.openers.size === 0) {
      level.sound.play('block.ender_chest.close', this.x + 0.5, this.y + 0.5, this.z + 0.5, 0.5, level.random.nextFloat() * 0.1 + 0.9);
      level.gameEvent('container_close', this.x + 0.5, this.y + 0.5, this.z + 0.5, { entity: p });
    }
    this.openerCountChanged(level);
  }

  /** vanilla openerCountChanged: level.blockEvent(pos, ENDER_CHEST, 1, count), which moves the lid (game/enderChest.ts) */
  private openerCountChanged(level: Level): void {
    const st = level.getState(this.x, this.y, this.z);
    level.blockEvent(this.x, this.y, this.z, STATE_BLOCK[st], 1, this.openers.size);
  }

  /**
   * vanilla ContainerOpenersCounter.recheckOpeners (every 5 ticks while anyone's looking in): someone who has gone
   * without closing it (removed from the level) no longer counts, and the lid's told the count again (so a close and
   * an open in the same tick, one block event lost to the other, can't leave it shut on someone looking in)
   */
  override tick(level: Level): void {
    if (!this.openers.size || ++this.recheck < 5) return;
    this.recheck = 0;
    for (const p of [...this.openers]) if (p.removed) this.stopOpen(level, p);
    if (this.openers.size) this.openerCountChanged(level);
  }

  /** what a guest's copy needs to draw the lid (net/chunkData.ts visibleBlockEntity); not kept in the save */
  visibleData(): Record<string, number> {
    return { lid_open: this.lidOpen ? 1 : 0, lid_from: this.lidFrom, lid_at: this.lidAt };
  }

  protected override loadData(d: Record<string, number | string>): void {
    // (only a host's copy sends these)
    if (typeof d.lid_open === 'number' && typeof d.lid_from === 'number' && typeof d.lid_at === 'number') {
      this.lidOpen = d.lid_open === 1;
      this.lidFrom = Math.max(0, Math.min(1, d.lid_from));
      this.lidAt = Number.isFinite(d.lid_at) ? d.lid_at : 0;
    }
  }
}

registerBlockEntity((name, x, y, z) => (name === 'ender_chest' ? new EnderChestBlockEntity(x, y, z) : null));
