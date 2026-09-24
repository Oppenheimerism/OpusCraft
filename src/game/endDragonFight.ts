// The dragon fight (vanilla EndDragonFight, EndPodiumFeature and
// DragonRespawnAnimation): the End's own record of its dragon. The first time
// a player comes near the main island it looks the island over, builds the
// exit portal's bedrock frame on top of it (empty: no portal till the dragon
// dies) and sends up a dragon; from then on it keeps the pink "Ender Dragon"
// bar on the screen of any player within 192 blocks, keeps the island's middle
// loaded and ticking while there is one, counts the crystals left on the
// pillars, and calls up a new dragon if its own hasn't been seen for a minute.
//
// The dragon dead: the bar goes, the exit portal lights, an end gateway opens
// on a ring 96 blocks out (one per kill, twenty in a seed-shuffled order), and
// the first time only, the dragon egg is left on top of the portal's pillar.
//
// Four end crystals on the portal's edges bring a dragon back: they beam into
// the sky, then at each pillar in turn, which is blown apart and built again
// with a fresh crystal in a cage of beams; then the crystals burst and a new
// dragon comes. Breaking one of the four crystals meanwhile calls it all off.
//
// What it keeps is saved with the world (DragonFight in the world's meta).

import type { Level } from './level';
import { EnderDragon, heightmapY } from '../entity/enderDragon';
import { PHASE } from '../entity/dragonPhases';
import { EndCrystal } from '../entity/endCrystal';
import type { Entity } from '../entity/entity';
import { endSpikes, type EndSpike } from '../world/gen/endFeatures';
import { LegacyRandom, seedLong } from '../world/gen/legacyRandom';
import { AABB } from '../core/aabb';
import { BLOCKS, BLOCK_BY_NAME, STATE_BLOCK, FLAGS, F_AIR, F_WATERLOGGED, S } from '../world/block';
import { explode } from './explosion';
import { fireStateAt } from './fire';
import { placeEndGateway } from './endGateway';

/** vanilla EndDragonFight.Data (saved as DragonFight) */
export interface DragonFightData {
  needsStateScanning: boolean;
  dragonKilled: boolean;
  previouslyKilled: boolean;
  /** (vanilla always saves false: a respawn under way isn't resumed after a reload) */
  isRespawning?: boolean;
  dragonUUID?: string;
  exitPortalLocation?: [number, number, number];
  gateways?: number[];
}

/** vanilla DragonRespawnAnimation */
type RespawnStage = 'start' | 'preparing_to_summon_pillars' | 'summoning_pillars' | 'summoning_dragon' | 'end';

/** vanilla ServerBossEvent, as the player's screen shows it (gui/bossOverlay.ts) */
export interface BossEvent {
  readonly name: string;
  readonly color: 'pink';
  readonly overlay: 'progress';
  progress: number;
  visible: boolean;
  /** vanilla setPlayBossMusic: music.dragon in place of the End's */
  readonly playBossMusic: boolean;
  /** vanilla setCreateWorldFog: the fog closes in */
  readonly createWorldFog: boolean;
}

/** vanilla EndDragonFight.DRAGON_SPAWN_Y */
const DRAGON_SPAWN_Y = 128;
/** vanilla ARENA_TICKET_LEVEL: the DRAGON ticket's distance (chunks this far loaded, two fewer ticking) */
export const ARENA_TICKET_LEVEL = 9;

export class EndDragonFight {
  /** vanilla dragonEvent */
  readonly bossEvent: BossEvent = { name: 'Ender Dragon', color: 'pink', overlay: 'progress', progress: 1, visible: true, playBossMusic: true, createWorldFog: true };
  /** whether the player is on the bar's list (vanilla dragonEvent.getPlayers(): alive, within 192 of 0,128,0) */
  hasPlayer = false;
  /** vanilla origin */
  readonly origin: [number, number, number] = [0, 0, 0];
  /** vanilla gateways: the ring spots still to open, the last first */
  private readonly gateways: number[] = [];
  private ticksSinceDragonSeen = 0;
  crystalsAlive = 0;
  private ticksSinceCrystalsScanned = 0;
  private ticksSinceLastPlayerScan = 21;
  dragonKilled = false;
  previouslyKilled = false;
  /** vanilla skipArenaLoadedCheck (tests) */
  skipArenaLoadedCheck = false;
  dragonUUID: string | null = null;
  private needsStateScanning = true;
  portalLocation: [number, number, number] | null = null;
  respawnStage: RespawnStage | null = null;
  private respawnTime = 0;
  private respawnCrystals: EndCrystal[] | null = null;
  /** the summoned_entity trigger of a respawned dragon (the game's advancements listen) */
  onDragonSummoned: ((d: EnderDragon) => void) | null = null;

  constructor(readonly level: Level, data: DragonFightData | null) {
    const d = data ?? { needsStateScanning: true, dragonKilled: false, previouslyKilled: false };
    this.needsStateScanning = d.needsStateScanning;
    this.dragonUUID = d.dragonUUID ?? null;
    this.dragonKilled = d.dragonKilled;
    this.previouslyKilled = d.previouslyKilled;
    if (d.isRespawning) this.respawnStage = 'start';
    this.portalLocation = d.exitPortalLocation ? [...d.exitPortalLocation] : null;
    if (d.gateways) this.gateways.push(...d.gateways);
    else {
      // vanilla: 0..19 shuffled by Util.shuffle with RandomSource.create(the world's seed)
      const list = Array.from({ length: 20 }, (_, i) => i);
      const r = new LegacyRandom(seedLong(level.seed));
      for (let j = list.length; j > 1; j--) {
        const k = r.nextInt(j);
        const t = list[j - 1];
        list[j - 1] = list[k];
        list[k] = t;
      }
      this.gateways.push(...list);
    }
  }

  /** vanilla saveData */
  save(): DragonFightData {
    const d: DragonFightData = { needsStateScanning: this.needsStateScanning, dragonKilled: this.dragonKilled, previouslyKilled: this.previouslyKilled, isRespawning: false, gateways: [...this.gateways] };
    if (this.dragonUUID) d.dragonUUID = this.dragonUUID;
    if (this.portalLocation) d.exitPortalLocation = [...this.portalLocation];
    return d;
  }

  /** whether the DRAGON ticket is held (a player is on the bar's list): the island's middle stays loaded */
  get ticketHeld(): boolean {
    return this.hasPlayer;
  }

  /** the ticket keeps chunks within 7 of the middle ticking entities (vanilla ticket level 33 - 9, ticking at 31) */
  ticksChunk(cx: number, cz: number): boolean {
    return this.hasPlayer && Math.max(Math.abs(cx - (this.origin[0] >> 4)), Math.abs(cz - (this.origin[2] >> 4))) <= ARENA_TICKET_LEVEL - 2;
  }

  /** the bar on the player's screen: while it's visible and they're near */
  shownBar(): BossEvent | null {
    return this.hasPlayer && this.bossEvent.visible ? this.bossEvent : null;
  }

  /** vanilla EndDragonFight.tick (before the entities, every tick) */
  tick(): void {
    this.bossEvent.visible = !this.dragonKilled;
    if (++this.ticksSinceLastPlayerScan >= 20) {
      this.updatePlayers();
      this.ticksSinceLastPlayerScan = 0;
    }
    if (!this.hasPlayer) return;
    const loaded = this.isArenaLoaded();
    if (this.needsStateScanning && loaded) {
      this.scanState();
      this.needsStateScanning = false;
    }
    if (this.respawnStage) {
      if (!this.respawnCrystals && loaded) {
        this.respawnStage = null;
        this.tryRespawn();
      }
      if (this.respawnStage) this.tickRespawn(this.respawnStage, this.respawnCrystals ?? [], this.respawnTime++);
    }
    if (!this.dragonKilled) {
      if ((this.dragonUUID === null || ++this.ticksSinceDragonSeen >= 1200) && loaded) {
        this.findOrCreateDragon();
        this.ticksSinceDragonSeen = 0;
      }
      if (++this.ticksSinceCrystalsScanned >= 100 && loaded) {
        this.updateCrystalCount();
        this.ticksSinceCrystalsScanned = 0;
      }
    }
  }

  /** vanilla updatePlayers: on the list while alive within 192 of (0, 128, 0) */
  private updatePlayers(): void {
    const p = this.level.player;
    const [ox, oy, oz] = this.origin;
    this.hasPlayer = !!p && !p.removed && p.health > 0 && p.distanceToSqr(ox, DRAGON_SPAWN_Y + oy, oz) <= 192 * 192;
  }

  /**
   * vanilla isArenaLoaded — which looks at one row of chunks only (x -8..8 at z 8: its loop over z starts at the
   * end), ticking blocks
   */
  private isArenaLoaded(): boolean {
    if (this.skipArenaLoadedCheck) return true;
    const w = this.level.world;
    const cx = this.origin[0] >> 4, cz = this.origin[2] >> 4;
    for (let i = -8 + cx; i <= 8 + cx; i++) if (!w.getChunk(i, 8 + cz)) return false;
    return true;
  }

  /** vanilla scanState: a world whose End was entered before (or edited): what's there says how the fight stands */
  private scanState(): void {
    const active = this.hasActiveExitPortal();
    if (active) this.previouslyKilled = true;
    else {
      this.previouslyKilled = false;
      if (!this.findExitPortal()) this.spawnExitPortal(false);
    }
    const dragons = this.dragons();
    if (!dragons.length) this.dragonKilled = true;
    else {
      const d = dragons[0];
      this.dragonUUID = d.uuid;
      this.dragonKilled = false;
      // "But we didn't have a portal, let's remove it."
      if (!active) {
        d.remove();
        this.dragonUUID = null;
      }
    }
    if (!this.previouslyKilled && this.dragonKilled) this.dragonKilled = false;
  }

  private dragons(): EnderDragon[] {
    return this.level.entities.filter((e): e is EnderDragon => e instanceof EnderDragon && !e.removed);
  }

  /** vanilla findOrCreateDragon: its dragon hasn't been seen for a minute (or there never was one) */
  private findOrCreateDragon(): void {
    const list = this.dragons();
    if (!list.length) this.createNewDragon();
    else this.dragonUUID = list[0].uuid;
  }

  /** vanilla hasActiveExitPortal: an end portal (or gateway) block entity in any chunk within 8 of the middle */
  private hasActiveExitPortal(): boolean {
    for (const be of this.level.world.blockEntities.values()) {
      if (be.id !== 'end_portal' && be.id !== 'end_gateway') continue;
      if (Math.abs(be.x >> 4) <= 8 && Math.abs(be.z >> 4) <= 8) return true;
    }
    return false;
  }

  /**
   * vanilla findExitPortal: the exit portal's bedrock pattern round one of the portal blocks in the chunks within
   * 8 of the middle, or else anywhere down the column at the middle; its centre remembered if there's none yet
   */
  findExitPortal(): [number, number, number] | null {
    const w = this.level.world;
    const ocx = this.origin[0] >> 4, ocz = this.origin[2] >> 4;
    for (const be of w.blockEntities.values()) {
      if (be.id !== 'end_portal' || Math.abs((be.x >> 4) - ocx) > 8 || Math.abs((be.z >> 4) - ocz) > 8) continue;
      for (let dz = -3; dz <= 3; dz++)
        for (let dx = -3; dx <= 3; dx++) {
          if (!this.isExitPortalAt(be.x + dx, be.y, be.z + dz)) continue;
          const c: [number, number, number] = [be.x + dx, be.y, be.z + dz];
          this.portalLocation ??= c;
          return c;
        }
    }
    const [ox, , oz] = this.origin;
    const top = heightmapY(this.level, ox, oz);
    for (let y = top; y >= w.dim.minY; y--) {
      if (!this.isExitPortalAt(ox, y, oz)) continue;
      const c: [number, number, number] = [ox, y, oz];
      this.portalLocation ??= c;
      return c;
    }
    return null;
  }

  /** vanilla exitPortalPattern (bedrock only): the pillar's three blocks above, the rim and middle, the disc below */
  private isExitPortalAt(x: number, y: number, z: number): boolean {
    const w = this.level.world;
    const bedrock = (dx: number, dy: number, dz: number) => BLOCKS[STATE_BLOCK[w.getState(x + dx, y + dy, z + dz)]].name === 'bedrock';
    for (let dy = 0; dy <= 3; dy++) if (!bedrock(0, dy, 0)) return false;
    for (let dz = -3; dz <= 3; dz++)
      for (let dx = -3; dx <= 3; dx++) {
        const d2 = dx * dx + dz * dz;
        if (d2 >= 8 && d2 <= 10 && !bedrock(dx, 0, dz)) return false;
        if (d2 <= 5 && !bedrock(dx, -1, dz)) return false;
      }
    return true;
  }

  /** vanilla spawnExitPortal: the podium where it was found (or on the island's top at the middle), lit or not */
  spawnExitPortal(active: boolean): void {
    if (!this.portalLocation) {
      const [ox, , oz] = this.origin;
      let y = heightmapY(this.level, ox, oz) - 1;
      while (this.level.getBlockName(ox, y, oz) === 'bedrock' && y > 0) y--;
      this.portalLocation = [ox, y, oz];
    }
    placeEndPodium(this.level, this.portalLocation[0], this.portalLocation[1], this.portalLocation[2], active);
  }

  /** vanilla updateCrystalCount: the crystals standing in the pillars' columns */
  private updateCrystalCount(): void {
    this.ticksSinceCrystalsScanned = 0;
    this.crystalsAlive = 0;
    for (const s of endSpikes(seedLong(this.level.seed))) this.crystalsAlive += this.level.getEntities(spikeColumn(s), (e) => e instanceof EndCrystal).length;
  }

  /** vanilla updateDragon: the bar follows its own dragon's health, and it's been seen */
  updateDragon(d: EnderDragon): void {
    if (d.uuid !== this.dragonUUID) return;
    this.bossEvent.progress = d.health / d.maxHealth;
    this.ticksSinceDragonSeen = 0;
  }

  /**
   * vanilla setDragonKilled: the bar goes, the exit portal lights, the next gateway opens; the egg on the pillar
   * the first time
   */
  setDragonKilled(d: EnderDragon): void {
    if (d.uuid !== this.dragonUUID) return;
    this.bossEvent.progress = 0;
    this.bossEvent.visible = false;
    this.spawnExitPortal(true);
    this.spawnNewGateway();
    if (!this.previouslyKilled && BLOCK_BY_NAME.has('dragon_egg')) {
      const [ox, , oz] = this.origin;
      this.level.setBlock(ox, heightmapY(this.level, ox, oz), oz, S('dragon_egg'));
    }
    this.previouslyKilled = true;
    this.dragonKilled = true;
  }

  /** vanilla removeAllGateways (the /reload-free test hook): none left to open */
  removeAllGateways(): void {
    this.gateways.length = 0;
  }

  /** the next spot on the ring of twenty, 96 out at y 75 (vanilla spawnNewGateway) */
  private spawnNewGateway(): void {
    if (!this.gateways.length) return;
    const i = this.gateways.pop()!;
    const a = 2 * (-Math.PI + (Math.PI / 20) * i);
    const x = Math.floor(96 * Math.cos(a)), z = Math.floor(96 * Math.sin(a));
    this.spawnGatewayAt(x, 75, z);
  }

  /** vanilla spawnNewGateway(pos): the burst and its sound (level event 3000), then END_GATEWAY_DELAYED (no exit yet) */
  private spawnGatewayAt(x: number, y: number, z: number): void {
    const lvl = this.level;
    lvl.particles.spawn?.('explosion_emitter', x + 0.5, y + 0.5, z + 0.5, 0, 0, 0);
    const r = lvl.random;
    lvl.sound.play('block.end_gateway.spawn', x + 0.5, y + 0.5, z + 0.5, 10, (1 + (r.nextFloat() - r.nextFloat()) * 0.2) * 0.7);
    placeEndGateway(lvl, x, y, z, null, false);
  }

  /** vanilla createNewDragon: at (0, 128, 0), circling, facing anywhere */
  private createNewDragon(): EnderDragon {
    const d = new EnderDragon(this.level);
    d.dragonFight = this;
    d.fightOrigin = [...this.origin];
    d.phaseManager.setPhase(PHASE.HOLDING_PATTERN);
    d.moveTo(this.origin[0], DRAGON_SPAWN_Y + this.origin[1], this.origin[2], this.level.random.nextFloat() * 360, 0);
    this.level.addEntity(d);
    this.dragonUUID = d.uuid;
    return d;
  }

  /** vanilla onCrystalDestroyed: one of the respawn's four calls it off; any other is counted, and the dragon hears */
  onCrystalDestroyed(c: EndCrystal, source: string, attacker: Entity | null): void {
    if (this.respawnStage && this.respawnCrystals?.includes(c)) {
      this.respawnStage = null;
      this.respawnTime = 0;
      this.resetSpikeCrystals();
      this.spawnExitPortal(true);
      return;
    }
    this.updateCrystalCount();
    const d = this.dragons().find((e) => e.uuid === this.dragonUUID);
    d?.onCrystalDestroyed(c, source, attacker);
  }

  /** vanilla tryRespawn (a crystal was placed): with the dragon dead, a crystal on each side of the portal starts it */
  tryRespawn(): void {
    if (!this.dragonKilled || this.respawnStage) return;
    let pos = this.portalLocation;
    if (!pos) {
      if (!this.findExitPortal()) this.spawnExitPortal(true);
      pos = this.portalLocation!;
    }
    const found: EndCrystal[] = [];
    const [px, py, pz] = pos;
    // north, east, south, west: the block two out from the pillar, a block above the portal
    for (const [dx, dz] of [[0, -2], [2, 0], [0, 2], [-2, 0]]) {
      const x = px + dx, y = py + 1, z = pz + dz;
      const list = this.level.getEntities(new AABB(x, y, z, x + 1, y + 1, z + 1), (e) => e instanceof EndCrystal) as EndCrystal[];
      if (!list.length) return;
      found.push(...list);
    }
    this.respawnDragon(found);
  }

  /** vanilla respawnDragon: the portal is stripped back to end stone and built again unlit; the animation starts */
  private respawnDragon(crystals: EndCrystal[]): void {
    if (!this.dragonKilled || this.respawnStage) return;
    const END_STONE = S('end_stone');
    for (let c = this.findExitPortal(); c; c = this.findExitPortal()) {
      const [x, y, z] = c;
      // (vanilla: every bedrock or portal block in the pattern's 7x5x7)
      for (let dy = -1; dy <= 3; dy++)
        for (let dz = -3; dz <= 3; dz++)
          for (let dx = -3; dx <= 3; dx++) {
            const n = this.level.getBlockName(x + dx, y + dy, z + dz);
            if (n === 'bedrock' || n === 'end_portal') this.level.setBlock(x + dx, y + dy, z + dz, END_STONE);
          }
    }
    this.respawnStage = 'start';
    this.respawnTime = 0;
    this.spawnExitPortal(false);
    this.respawnCrystals = crystals;
  }

  /** vanilla setRespawnStage: the end of it is a new dragon (and the summoned_entity trigger for everyone near) */
  private setRespawnStage(stage: RespawnStage): void {
    this.respawnTime = 0;
    if (stage === 'end') {
      this.respawnStage = null;
      this.dragonKilled = false;
      const d = this.createNewDragon();
      if (this.hasPlayer) this.onDragonSummoned?.(d);
    } else this.respawnStage = stage;
  }

  /** vanilla resetSpikeCrystals: the pillars' crystals breakable again, their beams off */
  resetSpikeCrystals(): void {
    for (const s of endSpikes(seedLong(this.level.seed)))
      for (const e of this.level.getEntities(spikeColumn(s), (e) => e instanceof EndCrystal)) {
        const c = e as EndCrystal;
        c.invulnerable = false;
        c.beamTarget = null;
      }
  }

  /** vanilla DragonRespawnAnimation.tick */
  private tickRespawn(stage: RespawnStage, crystals: EndCrystal[], ticks: number): void {
    const lvl = this.level;
    switch (stage) {
      case 'start':
        for (const c of crystals) c.beamTarget = [0, 128, 0];
        this.setRespawnStage('preparing_to_summon_pillars');
        break;
      case 'preparing_to_summon_pillars':
        if (ticks < 100) {
          if (ticks === 0 || ticks === 50 || ticks === 51 || ticks === 52 || ticks >= 95) growlEvent(lvl);
        } else this.setRespawnStage('summoning_pillars');
        break;
      case 'summoning_pillars': {
        const first = ticks % 40 === 0, last = ticks % 40 === 39;
        if (!first && !last) break;
        const spikes = endSpikes(seedLong(lvl.seed));
        const j = Math.trunc(ticks / 40);
        if (j < spikes.length) {
          const s = spikes[j];
          if (first) {
            for (const c of crystals) c.beamTarget = [s.centerX, s.height + 1, s.centerZ];
          } else {
            for (let y = s.height - 10; y <= s.height + 10; y++)
              for (let z = s.centerZ - 10; z <= s.centerZ + 10; z++)
                for (let x = s.centerX - 10; x <= s.centerX + 10; x++) removeBlock(lvl, x, y, z);
            explode(lvl, null, Math.fround(s.centerX + 0.5), s.height, Math.fround(s.centerZ + 0.5), 5, false, 'block');
            placeSpikeLive(lvl, s, [0, 128, 0]);
          }
        } else if (first) this.setRespawnStage('summoning_dragon');
        break;
      }
      case 'summoning_dragon':
        if (ticks >= 100) {
          this.setRespawnStage('end');
          this.resetSpikeCrystals();
          for (const c of crystals) {
            c.beamTarget = null;
            explode(lvl, c, c.x, c.y, c.z, 6, false, 'none');
            c.remove();
          }
        } else if (ticks >= 80) growlEvent(lvl);
        else if (ticks === 0) {
          for (const c of crystals) c.beamTarget = [0, 128, 0];
        } else if (ticks < 5) growlEvent(lvl);
        break;
      case 'end':
        break;
    }
  }
}

/** vanilla SpikeFeature.EndSpike.getTopBoundingBox: the pillar's whole column, top to bottom */
function spikeColumn(s: EndSpike): AABB {
  return new AABB(s.centerX - s.radius, -2032, s.centerZ - s.radius, s.centerX + s.radius, 2031, s.centerZ + s.radius);
}

/** vanilla level event 3001: the dragon's growl from high over the island, heard far and wide */
function growlEvent(level: Level): void {
  level.sound.play('entity.ender_dragon.growl', 0.5, 128.5, 0.5, 64, 0.8 + level.random.nextFloat() * 0.3);
}

/** vanilla Level.removeBlock(pos, false): gone, its fluid left behind; a container's contents spill */
function removeBlock(level: Level, x: number, y: number, z: number): void {
  const st = level.getState(x, y, z);
  if (FLAGS[st] & F_AIR) return;
  const now = FLAGS[st] & F_WATERLOGGED ? S('water') : BLOCKS[STATE_BLOCK[st]].s.fluid ? st : 0;
  if (now === st) return;
  const be = level.world.getBlockEntity(x, y, z);
  if (be) {
    be.unpackLoot();
    for (const s of be.container.removeAll()) level.dropStackAt(x, y, z, s);
  }
  level.setBlock(x, y, z, now);
}

/**
 * vanilla EndPodiumFeature.place at `(x, y, z)` (the portal's level): bedrock disc under it rimmed with end stone,
 * the bedrock rim, end portal inside it (or air, unlit), air above, the pillar four high with a torch on each side
 */
export function placeEndPodium(level: Level, x: number, y: number, z: number, active: boolean): void {
  const BEDROCK = S('bedrock'), END_STONE = S('end_stone'), PORTAL = S('end_portal');
  for (let by = y - 1; by <= y + 32; by++)
    for (let bz = z - 4; bz <= z + 4; bz++)
      for (let bx = x - 4; bx <= x + 4; bx++) {
        const dx = bx - x, dy = by - y, dz = bz - z;
        const d2 = dx * dx + dy * dy + dz * dz;
        const inner = d2 < 6.25;
        if (!inner && !(d2 < 12.25)) continue;
        if (by < y) level.setBlock(bx, by, bz, inner ? BEDROCK : END_STONE);
        else if (by > y) level.setBlock(bx, by, bz, 0);
        else if (!inner) level.setBlock(bx, by, bz, BEDROCK);
        else level.setBlock(bx, by, bz, active ? PORTAL : 0);
      }
  for (let i = 0; i < 4; i++) level.setBlock(x, y + i, z, BEDROCK);
  for (const [dx, dz, facing] of [[0, -1, 'north'], [0, 1, 'south'], [-1, 0, 'west'], [1, 0, 'east']] as const)
    level.setBlock(x + dx, y + 2, z + dz, S('wall_torch', { facing }));
}

/**
 * vanilla SpikeFeature.placeSpike as the respawn builds one: the obsidian column from the bottom of the world, the
 * air above 65 round it, the cage if it's guarded, and an unbreakable crystal beaming at `beam` on bedrock in a fire
 */
export function placeSpikeLive(level: Level, s: EndSpike, beam: [number, number, number] | null): EndCrystal {
  const OBSIDIAN = S('obsidian');
  const i = s.radius, cx = s.centerX, cz = s.centerZ, h = s.height;
  for (let y = level.world.dim.minY; y <= h + 10; y++)
    for (let z = cz - i; z <= cz + i; z++)
      for (let x = cx - i; x <= cx + i; x++) {
        if ((x - cx) * (x - cx) + (z - cz) * (z - cz) <= i * i + 1 && y < h) level.setBlock(x, y, z, OBSIDIAN);
        else if (y > 65) level.setBlock(x, y, z, 0);
      }
  if (s.guarded) {
    for (let m = -2; m <= 2; m++)
      for (let n = -2; n <= 2; n++)
        for (let o = 0; o <= 3; o++) {
          const edgeX = Math.abs(m) === 2, edgeZ = Math.abs(n) === 2, top = o === 3;
          if (!edgeX && !edgeZ && !top) continue;
          const alongX = m === -2 || m === 2 || top, alongZ = n === -2 || n === 2 || top;
          const st = S('iron_bars', { north: alongX && n !== -2, south: alongX && n !== 2, west: alongZ && m !== -2, east: alongZ && m !== 2 });
          level.setBlock(cx + m, h + o, cz + n, st);
        }
  }
  const c = new EndCrystal(level);
  c.beamTarget = beam ? [...beam] : null;
  c.invulnerable = true;
  c.moveTo(cx + 0.5, h + 1, cz + 0.5, level.random.nextFloat() * 360, 0);
  level.addEntity(c);
  level.setBlock(cx, h, cz, S('bedrock'));
  level.setBlock(cx, h + 1, cz, fireStateAt(level.world, cx, h + 1, cz));
  return c;
}

// the crystals tell the fight (vanilla EndCrystal.onDestroyedBy, EndCrystalItem.useOn)
EndCrystal.onDestroyed = (c, source, attacker) => c.level.dragonFight?.onCrystalDestroyed(c, source, attacker);
EndCrystal.onPlaced = (c) => c.level.dragonFight?.tryRespawn();
