// Through an end portal (vanilla EndPortalBlock.getPortalDestination and
// Entity.changeDimension): from anywhere but the End to the End's spawn point,
// on its 5x5 obsidian landing (made afresh each time, whatever was in the way
// dropped), facing west; from the End back home — a player to their bed or the
// world spawn, anything else to the top of the world spawn.
//
// The first time a player leaves the End that way (vanilla
// ServerPlayer.showEndCredits), the End Poem and the credits roll on the way
// home: out of the End at once, home loading behind them, and back at the bed
// or the world spawn with everything they had once they're over or skipped
// (vanilla WinScreen, then PERFORM_RESPAWN keeping everything).
//
// Only one dimension is loaded at a time, so a mob, an item or a cart that
// goes through while the player stays behind is written down (PortalArrivals)
// and put into the other dimension when the chunk it lands in there loads —
// where vanilla's would be sitting when you got there.

import type { Game } from './game';
import type { Level } from './level';
import type { Entity } from '../entity/entity';
import type { SavedEntity } from '../entity/mob';
import type { World } from '../world/world';
import { OVERWORLD, THE_END, type DimensionType } from '../world/dimension';
import { BLOCKS, STATE_BLOCK, FLAGS, F_COLLIDE, F_WATER, F_LAVA, F_WATERLOGGED, F_LEAVES, S } from '../world/block';
import { END_SPAWN_POINT, endPlatformBlocks } from '../world/gen/endFeatures';
import { ITEMS } from '../item/item';
import { saveEntity } from './spawner';
import { respawnArrival, worldSpawnOf } from './respawnLogic';

/** vanilla Block.UPDATE_ALL */
const UPDATE_ALL = 3;

/**
 * vanilla EndPlatformFeature.createEndPlatform(level, pos, true): obsidian a block under `pos`, air in it and the
 * two above; what was there is broken and dropped (quietly: nobody is in the End to see it yet)
 */
export function createEndPlatform(level: Level, x: number, y: number, z: number): void {
  const OBSIDIAN = S('obsidian');
  // (vanilla drops what its loot table gives with no tool — end stone drops itself; blockDrops wants the right
  // tool for blocks that need one, so it's asked as a pickaxe would ask)
  const lootTool = ITEMS.get('netherite_pickaxe') ?? null;
  endPlatformBlocks(x, y, z, (bx, by, bz, obsidian) => {
    const name = BLOCKS[STATE_BLOCK[level.getState(bx, by, bz)]].name;
    if (name === (obsidian ? 'obsidian' : 'air')) return;
    level.destroyBlock(bx, by, bz, true, lootTool, false);
    level.setBlock(bx, by, bz, obsidian ? OBSIDIAN : 0, UPDATE_ALL);
  });
}

/** whatever's time in an end portal came up (vanilla Entity.handlePortal → EndPortalBlock.getPortalDestination) */
export function endPortalTravel(g: Game, e: Entity): void {
  const from = g.world.dim, to = from === THE_END ? OVERWORLD : THE_END;
  if (e === g.player) playerThrough(g, from, to);
  else sendThrough(g, e, to);
}

function playerThrough(g: Game, from: DimensionType, to: DimensionType): void {
  const p = g.player;
  if (p.vehicle || p.health <= 0) return;
  if (to === THE_END) {
    // to the End's spawn point, a block lower for a player (on the landing, not dropped onto it), facing west,
    // still moving as they were; the portal's whoosh on arrival (vanilla PLAY_PORTAL_SOUND, level event 1032)
    const x = END_SPAWN_POINT.x + 0.5, y = END_SPAWN_POINT.y - 1, z = END_SPAWN_POINT.z + 0.5;
    const pitch = p.pitch, vx = p.dx, vy = p.dy, vz = p.dz;
    const arrive = (g2: Game): boolean => {
      createEndPlatform(g2.level, END_SPAWN_POINT.x, END_SPAWN_POINT.y - 1, END_SPAWN_POINT.z);
      const pl = g2.player;
      pl.moveTo(x, y, z, 90, pitch);
      pl.dx = vx;
      pl.dy = vy;
      pl.dz = vz;
      pl.portalCooldown = pl.dimensionChangingDelay();
      g2.sound.playUI('block.portal.travel', 0.25, Math.random() * 0.4 + 0.8);
      g2.onChangedDimension(from, to);
      return true;
    };
    p.yaw = 90;
    g.changeDimension(THE_END, x, y, z, arrive, true);
    return;
  }
  if (from === THE_END && !p.seenCredits) {
    showEndCredits(g);
    return;
  }
  goHome(g, from, null, false);
}

/**
 * vanilla ServerPlayer.showEndCredits: seen now, out of the End, and the End Poem and the credits over the loading
 * (vanilla ClientboundGameEventPacket.WIN_GAME); once they're done, home (PERFORM_RESPAWN)
 */
function showEndCredits(g: Game): void {
  g.player.seenCredits = true;
  let over = !g.winScreenFactory;
  goHome(g, THE_END, () => over, true);
  if (over) return;
  g.setScreen(
    g.winScreenFactory!(() => {
      over = true;
      // (home still loading: its "Loading terrain..." over the starfield, as after any end portal)
      g.setScreen(g.receivingScreenFactory ? g.receivingScreenFactory('end_portal') : null);
    }),
  );
}

/**
 * home from the End: vanilla ServerPlayer.findRespawnPositionAndUseSpawnBlock(false, DO_NOTHING) — the bed (facing
 * it) if it's still there and clear, else somewhere free near the world spawn (game/respawnLogic); no sound. `ready`:
 * not until it says so (the credits). `respawn`: after the credits, as vanilla PlayerList.respawn(player, true) — a
 * new player keeping everything but its fire and its breath, and a bed that's gone forgotten
 */
function goHome(g: Game, from: DimensionType, ready: (() => boolean) | null, respawn: boolean): void {
  const p = g.player;
  const [bx, by, bz] = p.respawnPos ?? worldSpawnOf(g);
  // (vanilla DimensionTransition.missingRespawnBlock: told so; through the portal the bed stays theirs)
  const place = respawnArrival(respawn);
  const arrive = (g2: Game): boolean => {
    if (ready && !ready()) return false;
    const pl = g2.player;
    if (!place(g2)) return false;
    if (respawn) {
      pl.remainingFireTicks = 0;
      pl.air = 300;
    }
    pl.portalCooldown = pl.dimensionChangingDelay();
    g2.onChangedDimension(from, OVERWORLD);
    return true;
  };
  g.changeDimension(OVERWORLD, bx + 0.5, by, bz + 0.5, arrive, true);
}

/** anything else: gone from here, and waiting in the other dimension (with its riders) until that's loaded */
function sendThrough(g: Game, e: Entity, to: DimensionType): void {
  // (a vehicle with the player aboard stays: players don't ride through portals here)
  if (e.passengers.some((q) => q === g.player)) return;
  const d = saveEntity(e);
  const gone = (x: Entity): void => {
    for (const q of x.passengers) gone(q);
    x.remove();
  };
  gone(e);
  // (arrows, orbs and the like aren't kept when their chunk unloads, and aren't kept here either)
  if (!d) return;
  if (to === THE_END) {
    // vanilla: the spawn point's bottom centre, facing west, still moving as it was
    d.x = END_SPAWN_POINT.x + 0.5;
    d.y = END_SPAWN_POINT.y;
    d.z = END_SPAWN_POINT.z + 0.5;
    d.yaw = 90;
    g.arrivals.add(to, { entity: d });
  } else {
    // vanilla Entity.adjustSpawnLocation: on top of whatever is at the world spawn
    const [x, , z] = g.worldSpawn ?? [g.player.spawnX, g.player.spawnY, g.player.spawnZ];
    d.x = x + 0.5;
    d.z = z + 0.5;
    g.arrivals.add(to, { entity: d, surface: true });
  }
}

/** something sent through a portal to a dimension that isn't loaded */
export interface Arrival {
  entity: SavedEntity;
  /** its feet set on the ground there when it arrives (the height isn't known till then) */
  surface?: boolean;
}

/** entities on their way into other dimensions, by the chunk they land in (saved with the world) */
export class PortalArrivals {
  private readonly byChunk = new Map<string, Arrival[]>();

  private static key(dim: string, cx: number, cz: number): string {
    return `${dim} ${cx} ${cz}`;
  }

  load(saved: Record<string, Arrival[]> | undefined): void {
    this.byChunk.clear();
    for (const [k, v] of Object.entries(saved ?? {})) this.byChunk.set(k, v);
  }

  save(): Record<string, Arrival[]> | undefined {
    return this.byChunk.size ? Object.fromEntries(this.byChunk) : undefined;
  }

  add(dim: DimensionType, a: Arrival): void {
    const k = PortalArrivals.key(dim.id, Math.floor(a.entity.x) >> 4, Math.floor(a.entity.z) >> 4);
    const list = this.byChunk.get(k);
    if (list) list.push(a);
    else this.byChunk.set(k, [a]);
  }

  /** what has been waiting for this chunk of the loaded dimension, now that it's loaded (taken off the list) */
  take(world: World, cx: number, cz: number): SavedEntity[] {
    const k = PortalArrivals.key(world.dim.id, cx, cz);
    const list = this.byChunk.get(k);
    if (!list) return [];
    this.byChunk.delete(k);
    return list.map((a) => (a.surface ? { ...a.entity, y: surfaceY(world, Math.floor(a.entity.x), Math.floor(a.entity.z)) } : a.entity));
  }
}

/** vanilla Heightmap.Types.MOTION_BLOCKING_NO_LEAVES: just above the highest block that stops things, or holds a fluid, other than leaves */
function surfaceY(w: World, x: number, z: number): number {
  for (let y = w.dim.maxY - 1; y >= w.dim.minY; y--) {
    const f = FLAGS[w.getState(x, y, z)];
    if (f & (F_COLLIDE | F_WATER | F_LAVA | F_WATERLOGGED) && !(f & F_LEAVES)) return y + 1;
  }
  return w.dim.minY;
}
