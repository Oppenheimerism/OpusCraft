// vanilla EndCrystal: the crystal on top of each obsidian spike (and the ones a
// player sets on obsidian or bedrock). It never moves, fire can't hurt it, and
// anything else that hurts it — a punch, an arrow, a snowball — blows it up
// with a blast of 6 (as strong as a charged creeper's, breaking blocks with
// the usual 1-in-6 drops). Blown up by another explosion, it's only destroyed:
// crystals don't set each other off. In the End it keeps a fire burning in
// its block. Its model spins and bobs (render/endCrystalRenderer.ts).

import { Entity } from './entity';
import type { Level } from '../game/level';
import type { SavedEntity } from './mob';
import { FIRE_SOURCES } from './living';
import { explode } from '../game/explosion';
import { fireStateAt, placeFire } from '../game/fire';
import { F_AIR, FLAGS } from '../world/block';
import { AABB } from '../core/aabb';
import { registerItemBehavior } from '../game/itemBehavior';

/** vanilla DamageTypeTags.IS_EXPLOSION */
export const EXPLOSION_SOURCES = new Set(['explosion', 'playerExplosion', 'badRespawnPoint', 'fireworks']);

export class EndCrystal extends Entity {
  readonly type = 'end_crystal';
  /** vanilla time: drives the spin and the bob, from a random start (not saved) */
  time = Math.floor(Math.random() * 100000);
  /** vanilla DATA_SHOW_BOTTOM: the bedrock plinth under the cubes (world-generated crystals have it, placed ones don't) */
  showBottom = true;
  /** vanilla DATA_BEAM_TARGET: where its healing beam points (the dragon fight's) */
  beamTarget: [number, number, number] | null = null;
  /** vanilla Entity.invulnerable (the respawning dragon's crystals) */
  invulnerable = false;
  /** who blew it up: the blast is theirs (vanilla damageSources().explosion(this, attacker)) */
  owner: Entity | null = null;
  /** vanilla EndCrystal.onDestroyedBy → EndDragonFight.onCrystalDestroyed (the dragon fight listens here) */
  static onDestroyed: ((c: EndCrystal, source: string, attacker: Entity | null) => void) | null = null;

  constructor(level: Level, x = 0, y = 0, z = 0) {
    super(level);
    // vanilla EntityType.END_CRYSTAL: sized(2, 2), fireImmune
    this.setSize(2, 2);
    this.moveTo(x, y, z);
  }

  /** vanilla EndCrystal.tick: no base tick (it neither falls nor burns); what it stands in, and the End's fire */
  override tick(): void {
    this.xo = this.x;
    this.yo = this.y;
    this.zo = this.z;
    this.yawO = this.yaw;
    this.pitchO = this.pitch;
    this.tickCount++;
    this.time++;
    this.checkInsideBlocks();
    this.handlePortal();
    if (this.removed) return;
    if (this.level.world.dim.id === 'the_end') {
      const bx = Math.floor(this.x), by = Math.floor(this.y), bz = Math.floor(this.z);
      if (FLAGS[this.level.getState(bx, by, bz)] & F_AIR) placeFire(this.level, bx, by, bz, fireStateAt(this.level.world, bx, by, bz));
    }
  }

  override fireImmune(): boolean {
    return true;
  }

  override isPickable(): boolean {
    return !this.removed;
  }

  override hurt(_amount: number, source: string, attacker?: Entity | null): boolean {
    // vanilla isInvulnerableTo: gone already, invulnerable (but for /kill, the void and creative players), or fire
    if (this.removed) return false;
    const creative = (attacker as { gameMode?: string } | null | undefined)?.gameMode === 'creative';
    if (this.invulnerable && source !== 'void' && source !== 'genericKill' && !creative) return false;
    if (FIRE_SOURCES.has(source) || source === 'campfire') return false;
    if (attacker?.type === 'ender_dragon') return false;
    this.remove();
    if (!EXPLOSION_SOURCES.has(source)) {
      this.owner = attacker ?? null;
      explode(this.level, this, this.x, this.y, this.z, 6, false, 'block');
    }
    EndCrystal.onDestroyed?.(this, source, attacker ?? null);
    return true;
  }

  override kill(): void {
    EndCrystal.onDestroyed?.(this, 'genericKill', null);
    super.kill();
  }

  override isPushable(): boolean {
    return false;
  }

  protected override makesStepSounds(): boolean {
    return false;
  }

  save(): SavedEntity {
    const data: Record<string, number | string | boolean> = { showBottom: this.showBottom };
    if (this.invulnerable) data.invulnerable = true;
    if (this.beamTarget) [data.beamX, data.beamY, data.beamZ] = this.beamTarget;
    return { id: this.type, x: this.x, y: this.y, z: this.z, yaw: this.yaw, pitch: this.pitch, dx: 0, dy: 0, dz: 0, health: 1, fire: 0, data };
  }

  load(d: SavedEntity): void {
    this.moveTo(d.x, d.y, d.z, d.yaw, 0);
    const data = d.data ?? {};
    this.showBottom = data.showBottom !== false;
    this.invulnerable = data.invulnerable === true;
    this.beamTarget = typeof data.beamX === 'number' ? [data.beamX, Number(data.beamY), Number(data.beamZ)] : null;
  }

  /** vanilla EndCrystalItem.useOn → EndDragonFight.tryRespawn (the dragon fight listens here) */
  static onPlaced: ((c: EndCrystal) => void) | null = null;
}

// vanilla EndCrystalItem.useOn: only on obsidian or bedrock, into an empty block with no entity in the two blocks
// above the one clicked; the placed crystal has no plinth
registerItemBehavior('end_crystal', {
  useOn(level, p, _stack, h) {
    const n = level.getBlockName(h.x, h.y, h.z);
    if (n !== 'obsidian' && n !== 'bedrock') return 'fail';
    const x = h.x, y = h.y + 1, z = h.z;
    if (!(FLAGS[level.getState(x, y, z)] & F_AIR)) return 'fail';
    if (level.getEntities(new AABB(x, y, z, x + 1, y + 2, z + 1)).length) return 'fail';
    const c = new EndCrystal(level, x + 0.5, y, z + 0.5);
    c.showBottom = false;
    level.addEntity(c);
    // (vanilla EndCrystalItem.useOn: ENTITY_PLACE)
    level.gameEvent?.('entity_place', x + 0.5, y + 0.5, z + 0.5, { entity: p });
    EndCrystal.onPlaced?.(c);
    if (p.gameMode !== 'creative') p.inventory.consumeSelected(1);
    p.swing();
    return 'success';
  },
});
