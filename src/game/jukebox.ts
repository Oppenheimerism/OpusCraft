// The jukebox (vanilla JukeboxBlock, JukeboxBlockEntity, JukeboxSongPlayer, JukeboxPlayable.tryInsertIntoJukebox):
// right-clicked with a music disc it takes it (has_record) and plays the disc's song, heard from the block out to 64
// blocks, "Now Playing: <song>" in the action bar in cycling colours; a note rises from it every second, parrots
// within three blocks dance, and while the song lasts it gives a redstone signal of 15 (a comparator reads the disc's
// own number off it). A second after the song's length it stops by itself; right-clicked again, or broken, it pops
// the disc out on top. The disc and how far into its song it is are saved with the chunk, and a song loaded that way
// goes on silently, as vanilla's does (setSongWithoutPlaying). The songs are item/jukeboxSongs.ts.

import { BLOCKS, STATE_BLOCK, type Block } from '../world/block';
import { BlockEntity, registerBlockEntityType, type SavedBlockEntity } from '../world/blockEntity';
import { ITEMS, ItemStack, cloneTag } from '../item/item';
import { JUKEBOX_SONGS, hasFinished, type JukeboxSong } from '../item/jukeboxSongs';
import { AABB } from '../core/aabb';
import { BIOMES } from '../world/gen/biomes';
import { ItemEntity } from '../entity/itemEntity';
import { registerBehavior } from './blockBehavior';
import type { Level } from './level';
import type { World } from '../world/world';

/** vanilla Block.UPDATE_CLIENTS: has_record changes without telling the neighbours (onSongChanged does that) */
const UPDATE_CLIENTS = 2;

const blk = (st: number): Block => BLOCKS[STATE_BLOCK[st]];
const isJukebox = (st: number): boolean => blk(st).name === 'jukebox';

/** vanilla JukeboxSong.fromStack: the song a disc plays (DataComponents.JUKEBOX_PLAYABLE), null for anything else */
export function songOf(s: ItemStack | null): JukeboxSong | null {
  return (s && s.count > 0 && JUKEBOX_SONGS[s.item.id]) || null;
}

let nowPlaying: ((level: Level, description: string) => void) | null = null;

/** the Gui's hook (vanilla Gui.setNowPlaying): a song starts near enough the player to hear it */
export function setNowPlayingListener(f: ((level: Level, description: string) => void) | null): void {
  nowPlaying = f;
}

/**
 * vanilla JukeboxSongPlayer: the song under way and the ticks since it started. Its changes go out as level events
 * 1010 and 1011 (the song heard, or stopped: playJukeboxSong, stopJukeboxSong) and the jukebox's onSongChanged
 */
export class JukeboxSongPlayer {
  song: JukeboxSong | null = null;
  ticksSinceSongStarted = 0;
  constructor(private readonly x: number, private readonly y: number, private readonly z: number, private readonly onSongChanged: (level: Level) => void) {}

  isPlaying(): boolean {
    return this.song !== null;
  }

  /** vanilla setSongWithoutPlaying: a song under way that isn't heard (as loaded from a save) */
  setSongWithoutPlaying(song: JukeboxSong, ticks: number): void {
    if (hasFinished(song, ticks)) return;
    this.song = song;
    this.ticksSinceSongStarted = ticks;
  }

  /** vanilla play: from the start, and heard (level event 1010) */
  play(level: Level, song: JukeboxSong): void {
    this.song = song;
    this.ticksSinceSongStarted = 0;
    playJukeboxSong(level, this.x, this.y, this.z, song);
    this.onSongChanged(level);
  }

  /** vanilla stop: a game event (jukebox_stop_play) and level event 1011 */
  stop(level: Level, state: number | null): void {
    if (!this.song) return;
    this.song = null;
    this.ticksSinceSongStarted = 0;
    level.gameEvent('jukebox_stop_play', this.x + 0.5, this.y + 0.5, this.z + 0.5, { state });
    stopJukeboxSong(level, this.x, this.y, this.z);
    this.onSongChanged(level);
  }

  /** vanilla tick: done a second past its length; until then, every 20 ticks a game event (jukebox_play) and a note */
  tick(level: Level, state: number | null): void {
    if (!this.song) return;
    if (hasFinished(this.song, this.ticksSinceSongStarted)) {
      this.stop(level, state);
      return;
    }
    if (this.ticksSinceSongStarted % 20 === 0) {
      level.gameEvent('jukebox_play', this.x + 0.5, this.y + 0.5, this.z + 0.5, { state });
      spawnMusicParticles(level, this.x, this.y, this.z);
    }
    this.ticksSinceSongStarted++;
  }
}

/** vanilla JukeboxSongPlayer.spawnMusicParticles: one note 1.2 above the block's bottom middle, one of four colours */
function spawnMusicParticles(level: Level, x: number, y: number, z: number): void {
  level.particles.spawn?.('note', x + 0.5, y + 1.2, z + 0.5, level.random.nextInt(4) / 24, 0, 0);
}

/**
 * vanilla LevelRenderer.playJukeboxSong (level event 1010, sent to players within 64 blocks): the song heard from the
 * block, "Now Playing" in the action bar, and the living things within 3 blocks told (a parrot dances)
 */
function playJukeboxSong(level: Level, x: number, y: number, z: number, song: JukeboxSong): void {
  level.sound.stopJukeboxSong?.(x, y, z);
  level.sound.playJukeboxSong?.(song.sound, x, y, z);
  const p = level.player;
  if (p && (p.x - x - 0.5) ** 2 + (p.y - y - 0.5) ** 2 + (p.z - z - 0.5) ** 2 < 64 * 64) nowPlaying?.(level, song.description);
  notifyNearbyEntities(level, x, y, z, true);
}

/** vanilla LevelRenderer.stopJukeboxSong (level event 1011) */
function stopJukeboxSong(level: Level, x: number, y: number, z: number): void {
  level.sound.stopJukeboxSong?.(x, y, z);
  notifyNearbyEntities(level, x, y, z, false);
}

/** vanilla LevelRenderer.notifyNearbyEntities: LivingEntity.setRecordPlayingNearby for everything within 3 blocks */
function notifyNearbyEntities(level: Level, x: number, y: number, z: number, playing: boolean): void {
  for (const e of level.getEntities(new AABB(x, y, z, x + 1, y + 1, z + 1).inflate(3))) {
    (e as { setRecordPlayingNearby?: (x: number, y: number, z: number, playing: boolean) => void }).setRecordPlayingNearby?.(x, y, z, playing);
  }
}

/**
 * the jukeboxes by position (the world drops a block entity with its block, before the block's onRemove hears of it,
 * so onRemove finds the one just dropped here: removed, and of that level, or not yet ticked in any)
 */
const LIVE = new Map<string, JukeboxBlockEntity[]>();

/** the jukebox block entity the world dropped just now at (x, y, z) in `level`, taken off the list */
function takeRemoved(level: Level, x: number, y: number, z: number): JukeboxBlockEntity | null {
  const key = `${x},${y},${z}`;
  const list = LIVE.get(key);
  if (!list) return null;
  for (let i = list.length - 1; i >= 0; i--) {
    const be = list[i];
    if (!be.removed || (be.level && be.level !== level)) continue;
    list.splice(i, 1);
    if (!list.length) LIVE.delete(key);
    return be;
  }
  return null;
}

/**
 * vanilla JukeboxBlockEntity: the disc (its one slot, ContainerSingleItem, kept out of the generic container so that
 * breaking the block pops it out on top rather than spilling it) and the song player.
 *
 * Hoppers: vanilla's hopper sees the jukebox as a one-slot container. A hopper feeding it asks canPlaceItem and then
 * setItem (which plays the disc); one below it asks canTakeItem and then removeItem (which stops the song). They
 * must go through these rather than `container` for the song to start and stop.
 */
export class JukeboxBlockEntity extends BlockEntity {
  readonly id = 'jukebox';
  private item: ItemStack | null = null;
  readonly songPlayer: JukeboxSongPlayer;
  /** vanilla BlockEntity.level: the level it's in (known once it has ticked or been used) */
  level: Level | null = null;
  constructor(x: number, y: number, z: number) {
    super(x, y, z, 0);
    this.songPlayer = new JukeboxSongPlayer(x, y, z, (level) => this.onSongChanged(level));
    // (those long gone, their chunks unloaded, make way)
    LIVE.set(this.key, [...(LIVE.get(this.key) ?? []).filter((be) => !be.removed), this]);
  }

  /** vanilla onSongChanged: the neighbours hear of it (the signal, a comparator's reading); the chunk is to be saved */
  private onSongChanged(level: Level): void {
    const st = level.getState(this.x, this.y, this.z);
    if (isJukebox(st)) level.updateNeighborsAt(this.x, this.y, this.z, STATE_BLOCK[st]);
    this.container.changed();
  }

  /** vanilla getTheItem */
  getTheItem(): ItemStack | null {
    return this.item;
  }

  /**
   * vanilla setTheItem: the block's has_record follows (while the block's still there, a block_change game event);
   * a disc starts its song, anything else stops the one playing
   */
  setTheItem(level: Level, s: ItemStack | null): void {
    if (!this.removed) this.level = level;
    this.item = s && s.count > 0 ? s : null;
    const song = songOf(this.item);
    const st = level.getState(this.x, this.y, this.z);
    if (isJukebox(st)) {
      const now = blk(st).with(st, 'has_record', this.item !== null);
      level.setBlock(this.x, this.y, this.z, now, UPDATE_CLIENTS);
      level.gameEvent('block_change', this.x + 0.5, this.y + 0.5, this.z + 0.5, { state: now });
    }
    if (song) this.songPlayer.play(level, song);
    else this.songPlayer.stop(level, isJukebox(st) ? st : null);
    this.container.changed();
  }

  /** vanilla ContainerSingleItem.removeTheItem (splitTheItem): the disc, taken out, and the song stopped */
  removeTheItem(level: Level): ItemStack | null {
    const s = this.item;
    this.setTheItem(level, null);
    return s;
  }

  /** vanilla popOutTheItem: the disc flies out 1.01 above the block's bottom middle, give or take 0.35 each way */
  popOutTheItem(level: Level): void {
    const s = this.item;
    if (!s) return;
    this.removeTheItem(level);
    const r = level.random;
    const e = new ItemEntity(level, s.copy());
    e.moveTo(this.x + 0.5 + (r.nextFloat() - 0.5) * 0.7, this.y + 1.01 + (r.nextFloat() - 0.5) * 0.7, this.z + 0.5 + (r.nextFloat() - 0.5) * 0.7);
    // (vanilla ItemEntity(level, x, y, z, stack): a little sideways, 0.2 up; the default pickup delay)
    e.dx = r.nextDouble() * 0.2 - 0.1;
    e.dy = 0.2;
    e.dz = r.nextDouble() * 0.2 - 0.1;
    e.pickupDelay = 10;
    level.addEntity(e);
  }

  /** vanilla getComparatorOutput: the disc's song's number (0 without one) */
  getComparatorOutput(): number {
    return songOf(this.item)?.comparatorOutput ?? 0;
  }

  // --- vanilla ContainerSingleItem / Container, for hoppers (see above) ---

  /** vanilla getMaxStackSize */
  readonly maxStackSize = 1;
  /** vanilla canPlaceItem: a disc, into an empty jukebox */
  canPlaceItem(_slot: number, s: ItemStack): boolean {
    return !!songOf(s) && !this.item;
  }
  /** vanilla canTakeItem: whatever takes it must have an empty slot (the hopper checks `targetHasEmptySlot`) */
  canTakeItem(targetHasEmptySlot: boolean): boolean {
    return targetHasEmptySlot;
  }
  /** vanilla setItem(0, stack): setTheItem */
  setItem(level: Level, _slot: number, s: ItemStack | null): void {
    this.setTheItem(level, s);
  }
  /** vanilla removeItem(0, n): the whole disc (a stack of one), the song stopped */
  removeItem(level: Level, _slot: number, n: number): ItemStack | null {
    return n > 0 ? this.removeTheItem(level) : null;
  }

  override tick(level: Level): void {
    this.level = level;
    // (vanilla JukeboxBlock.getTicker: only with a record in)
    const st = level.getState(this.x, this.y, this.z);
    if (!isJukebox(st) || !blk(st).get(st, 'has_record')) return;
    this.songPlayer.tick(level, st);
  }

  /** vanilla saveAdditional: RecordItem, and ticks_since_song_started while a song is under way */
  override save(): SavedBlockEntity {
    const d = super.save();
    const s = this.item;
    if (s) d.items = [s.tag ? [0, s.item.id, s.count, s.damage, cloneTag(s.tag)!] : [0, s.item.id, s.count, s.damage]];
    if (this.songPlayer.isPlaying()) d.data = { ticks_since_song_started: this.songPlayer.ticksSinceSongStarted };
    return d;
  }

  /** vanilla loadAdditional: the disc, and its song carried on (unheard) from where it was */
  override load(d: SavedBlockEntity): void {
    const [slot] = d.items.filter((e) => e[0] === 0);
    const it = slot && ITEMS.get(slot[1]);
    this.item = it ? new ItemStack(it, slot[2], slot[3], cloneTag(slot[4] ?? null)) : null;
    const song = songOf(this.item);
    const ticks = d.data?.ticks_since_song_started;
    if (song && ticks !== undefined) this.songPlayer.setSongWithoutPlaying(song, Number(ticks));
  }
}

registerBlockEntityType('jukebox', (x, y, z) => new JukeboxBlockEntity(x, y, z));

const jukeboxAt = (w: World, x: number, y: number, z: number): JukeboxBlockEntity | null => {
  const be = w.getBlockEntity(x, y, z);
  return be instanceof JukeboxBlockEntity ? be : null;
};

registerBehavior('jukebox', {
  /**
   * vanilla JukeboxBlock.useItemOn: with a disc in, on to useWithoutItem (it pops out); an empty one takes a disc
   * (JukeboxPlayable.tryInsertIntoJukebox: one off the stack, not in creative), a block_change game event by the player
   */
  useItemOn(level, x, y, z, st, stack, ctx) {
    if (blk(st).get(st, 'has_record')) return 'pass';
    const be = jukeboxAt(level.world, x, y, z);
    if (!songOf(stack) || !be) return 'pass';
    const one = stack.copyWithCount(1);
    if (ctx.player.gameMode !== 'creative') ctx.player.inventory.consumeSelected(1);
    be.setTheItem(level, one);
    level.gameEvent('block_change', x + 0.5, y + 0.5, z + 0.5, { entity: ctx.player, state: st });
    // (vanilla ItemUsedOnLocationTrigger, the Sound of Music's: the disc used on the jukebox, and the biome it's in)
    const biome = BIOMES[level.world.getBiome3(x, y, z)]?.name;
    level.onPlayerTrigger?.(ctx.player, 'item_used_on_block', { usedOnBlock: { item: one.item.id, block: 'jukebox', biome } });
    return 'success';
  },
  /** vanilla useWithoutItem: with a disc in, it pops out */
  use(level, x, y, z, st) {
    const be = jukeboxAt(level.world, x, y, z);
    if (!blk(st).get(st, 'has_record') || !be) return false;
    be.popOutTheItem(level);
    return true;
  },
  /** vanilla onRemove: broken or replaced by another block, it pops the disc out (and the song stops) */
  onRemove(level, x, y, z, _st, now) {
    if (isJukebox(now)) return;
    const be = takeRemoved(level, x, y, z);
    if (!be) return;
    be.popOutTheItem(level);
    // (a song loaded unheard, with the disc somehow gone, still stops)
    be.songPlayer.stop(level, null);
  },
  /** vanilla isSignalSource / getSignal: 15 all round while a song plays */
  isSignalSource: () => true,
  getSignal(w, x, y, z) {
    return jukeboxAt(w, x, y, z)?.songPlayer.isPlaying() ? 15 : 0;
  },
  /** vanilla getAnalogOutputSignal: the disc's song's comparator output */
  analogOutput(level, x, y, z) {
    return jukeboxAt(level.world, x, y, z)?.getComparatorOutput() ?? 0;
  },
});

// vanilla Items.JUKEBOX: with the functional blocks, after the note block (the redstone tab lists it too)
{
  const item = ITEMS.get('jukebox');
  if (item) item.creativeTab = 'functional';
}
