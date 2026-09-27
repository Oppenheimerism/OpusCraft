// A world open to guests (vanilla IntegratedServer once published, with its PlayerList): the host's game keeps
// running its level as ever, and this looks after the guests: lets them in, hears what they do (at the start of a
// tick), and tells each what changed round it (at the end). It knows only the level and a few hooks into the host's
// game (HostHooks), so the tests can run a host without a window.

import type { Value } from '../codec';
import { CB } from '../protocol';
import { ANNOUNCE_TICKS, PROTOCOL_VERSION, BUILD_ID, MAX_GUESTS, MAX_PENDING_LOGINS } from '../config';
import type { PeerId, Transport } from '../transport/transport';
import { LanAnnouncer, type LanWorld } from '../transport/lan';
import { broadcastEffects, soundRange, PARTICLE_RANGE } from '../effects';
import { visibleBlockEntity } from '../chunkData';
import { DataWatcher, PLAYER_FIELDS, type EntityData } from '../entityData';
import { ServerPlayerSession } from './session';
import type { Level } from '../../game/level';
import type { Entity } from '../../entity/entity';
import type { LivingEntity } from '../../entity/living';
import type { Player, GameMode } from '../../entity/player';
import { Interaction } from '../../game/interaction';
import { blockMenu, entityContainerMenu } from '../../game/openMenu';
import type { ContainerMenu } from '../../inventory/container';
import type { Hand } from '../../item/inventory';
import { Chunk } from '../../world/chunk';
import { blockEntityKey, type BlockEntity } from '../../world/blockEntity';
import { STATE_BLOCK } from '../../world/block';

export interface HostHooks {
  /** where a guest new to the world starts (vanilla: the world spawn; here in whatever dimension the host is in) */
  spawnPoint(): [number, number, number];
  /** the host's own player's name */
  hostName(): string;
  worldName(): string;
  /** a line in the host's own chat */
  chat(text: string): void;
  /** keep the chunks round a guest loaded (vanilla TicketType.PLAYER: ChunkManager.setTicket); null lets them go */
  setTicket(name: string, t: [number, number, number] | null): void;
  /** the crack the host's own player is making, if any (its Interaction's, which isn't in level.destroyProgress) */
  hostBreaking(): { x: number; y: number; z: number; stage: number } | null;
  /** guests came or went */
  onGuestsChanged?(guests: number): void;
}

export class HostServer {
  readonly sessions = new Map<PeerId, ServerPlayerSession>();
  /** what the guests play in (vanilla ShareToLanScreen's game mode; creative if the host didn't say, as before guests could be hurt) */
  readonly guestGameMode: GameMode;
  /** this world's name on the LAN */
  readonly lanId: string;
  private announcer: LanAnnouncer | null = null;
  private readonly undo: (() => void)[] = [];
  private ticks = 0;
  /** the clock as the last tick left it (a change since, a command's, is sent at once) */
  private clock = '';
  private weather = '';
  private hostCrack = '';
  /** the guest whose player is ticking (what that sets off, its own game shows it: not sent back to it) */
  actor: ServerPlayerSession | null = null;
  /** (runLocal) sounds and particles stay on the host */
  private muted = 0;
  /** block entities that may have changed this tick, by key */
  private readonly dirtyBlockEntities = new Set<string>();
  /** this tick's look of block entities (worked out once for all the guests) */
  private readonly beJson = new Map<BlockEntity, string>();
  /**
   * the entities some guest sees: their fields as last sent (vanilla SynchedEntityData), and this tick's changes,
   * worked out once for all the guests (`seen`: the tick one last looked; left behind, it's let go)
   */
  private readonly watchers = new Map<Entity, { data: DataWatcher; seen: number; changes: EntityData | null; changed: number }>();
  closed = false;

  constructor(readonly level: Level, readonly transport: Transport, readonly hooks: HostHooks, opts: { lanId: string; announce?: boolean; guestGameMode?: GameMode }) {
    this.lanId = opts.lanId;
    this.guestGameMode = opts.guestGameMode ?? 'creative';
    transport.onPeer((peer, joined) => {
      if (this.closed) return;
      if (joined) {
        const had = this.sessions.get(peer);
        if (had && had.state !== 'gone') return;
        // (a flood of connections that never say who they are is turned away rather than kept)
        let pending = 0;
        for (const s of this.sessions.values()) if (s.state === 'login') pending++;
        if (pending >= MAX_PENDING_LOGINS) return transport.disconnect(peer);
        this.sessions.set(peer, new ServerPlayerSession(this, peer));
      } else this.sessions.get(peer)?.gone('Left the game');
    });
    transport.onMessage((peer, data) => this.sessions.get(peer)?.deliver(data));
    const world = level.world;
    // (vanilla ChunkHolder.blockChanged: to everyone who has the chunk)
    const blockChanged = world.onBlockChanged;
    world.onBlockChanged = (x, y, z, old, now) => {
      blockChanged?.(x, y, z, old, now);
      this.blockChanged(x, y, z, old, now);
    };
    const beChanged = world.onBlockEntityChanged;
    world.onBlockEntityChanged = (be) => {
      beChanged?.(be);
      this.dirtyBlockEntities.add(be.key);
    };
    const progress = level.onDestroyBlockProgress;
    level.onDestroyBlockProgress = (id, x, y, z, stage) => {
      progress?.(id, x, y, z, stage);
      this.broadcastNear([CB.BlockDestruction, id, x, y, z, stage], x + 0.5, y + 0.5, z + 0.5, 32);
    };
    // (vanilla LivingEntity.take → ClientboundTakeItemEntityPacket, to whoever sees what was taken)
    const take = level.onTake;
    level.onTake = (e, taker, amount) => {
      // (the pop is the world's, heard by the taker too: a guest's own game doesn't pick things up)
      const actor = this.actor;
      this.actor = null;
      try {
        take?.(e, taker, amount);
      } finally {
        this.actor = actor;
      }
      this.took(e, taker, amount);
    };
    this.undo.push(() => {
      world.onBlockChanged = blockChanged;
      world.onBlockEntityChanged = beChanged;
      level.onDestroyBlockProgress = progress;
      level.onTake = take;
    });
    this.undo.push(
      broadcastEffects(level, {
        sound: (name, x, y, z, volume, pitch) => this.muted || this.broadcastNear([CB.Sound, name, x, y, z, Math.min(volume, 1024), Math.min(pitch, 16)], x, y, z, soundRange(volume), this.actor),
        soundTo: (p, name, x, y, z, volume, pitch) => this.muted || this.sessionOf(p)?.send([CB.Sound, name, x, y, z, Math.min(volume, 1024), Math.min(pitch, 16)]),
        particles: (method, args, x, y, z) => this.muted || this.broadcastNear([CB.LevelParticles, method, args], x, y, z, PARTICLE_RANGE, this.actor),
      }),
    );
    if (opts.announce !== false) {
      this.announcer = new LanAnnouncer(() => this.lanInfo());
      this.announcer.announce();
    }
  }

  /** what the Multiplayer screens of other windows hear about this world */
  lanInfo(): LanWorld {
    return { id: this.lanId, name: this.hooks.worldName(), host: this.hooks.hostName(), players: 1 + this.guestCount(), max: 1 + MAX_GUESTS, protocol: PROTOCOL_VERSION, build: BUILD_ID };
  }

  guestCount(): number {
    let n = 0;
    for (const s of this.sessions.values()) if (s.state === 'play') n++;
    return n;
  }

  get hasGuests(): boolean {
    return this.guestCount() > 0;
  }

  sessionOf(p: Player): ServerPlayerSession | null {
    for (const s of this.sessions.values()) if (s.player === p && s.state === 'play') return s;
    return null;
  }

  /** a player's name, as the others see it */
  nameOf(p: Player): string {
    return p === this.level.player ? this.hooks.hostName() : (p.profileName ?? 'Player');
  }

  // -------------------------------------------------------------------------
  // the tick

  /** (Game.tick, before the level's tick) what the guests said since the last tick */
  receive(): void {
    if (this.closed) return;
    for (const s of [...this.sessions.values()]) s.receive();
    // vanilla MinecraftServer.tickChildren: the time every second, before the level's tick moves it on (a guest's tick
    // moves its own on as that does); and at once when it was changed between ticks (vanilla TimeCommand's
    // forceTimeSynchronization: /time set, /gamerule doDaylightCycle)
    const lvl = this.level;
    if ((this.ticks + 1) % 20 === 0 || this.clockKey() !== this.clock) this.broadcast([CB.SetTime, lvl.gameTime, lvl.dayTime, lvl.doDaylightCycle]);
  }

  private clockKey(): string {
    const l = this.level;
    return `${l.gameTime},${l.dayTime},${l.doDaylightCycle}`;
  }

  /** (Game.tick, after the level's tick) the guests' clicks, then what each needs to hear, sent */
  tick(): void {
    if (this.closed) return;
    this.ticks++;
    for (const s of [...this.sessions.values()]) s.tick();
    // (the host's own player's crack, which Game draws from its Interaction)
    const hb = this.hooks.hostBreaking();
    const crack = hb ? `${hb.x},${hb.y},${hb.z},${hb.stage}` : '';
    if (crack !== this.hostCrack) {
      this.hostCrack = crack;
      const id = this.level.player.id;
      if (hb) this.broadcastNear([CB.BlockDestruction, id, hb.x, hb.y, hb.z, hb.stage], hb.x + 0.5, hb.y + 0.5, hb.z + 0.5, 32);
      else this.broadcast([CB.BlockDestruction, id, 0, 0, 0, -1]);
    }
    this.clock = this.clockKey();
    const w = this.weatherPacket();
    const wk = w.join(',');
    if (wk !== this.weather) {
      this.weather = wk;
      this.broadcast(w);
    }
    // (the block changes first: a guest's copy of a new block makes its block entity afresh, which the data then fills)
    for (const s of this.sessions.values()) s.flushBlocks();
    this.flushBlockEntities();
    for (const s of [...this.sessions.values()]) {
      s.flush();
      if (s.state === 'gone') this.sessions.delete(s.peer);
    }
    for (const [e, w] of this.watchers) if (w.seen !== this.ticks || e.removed) this.watchers.delete(e);
    if (this.announcer && this.ticks % ANNOUNCE_TICKS === 0) this.announcer.announce();
  }

  /** (the trackers) every field of `e`, for a guest that's to see it now (of a player, what's told of one) */
  dataFull(e: Entity): EntityData {
    const w = this.watchers.get(e);
    if (!w) {
      const data = new DataWatcher(e.type === 'player' ? PLAYER_FIELDS : null);
      this.watchers.set(e, { data, seen: this.ticks, changes: null, changed: this.ticks });
      return data.full(e);
    }
    // (this tick's changes are taken first, for the guests that see it already)
    this.dataChanges(e);
    return w.data.full(e);
  }

  /** (the trackers) the fields of `e` that changed this tick, if any (vanilla ServerEntity.sendDirtyEntityData) */
  dataChanges(e: Entity): EntityData | null {
    const w = this.watchers.get(e);
    if (!w) {
      this.dataFull(e);
      return null;
    }
    w.seen = this.ticks;
    if (w.changed !== this.ticks) {
      w.changed = this.ticks;
      w.changes = w.data.changes(e);
    }
    return w.changes;
  }

  weatherPacket(): Value[] {
    const l = this.level;
    return [CB.Weather, l.raining, l.thundering, Math.round(l.rain * 1000) / 1000, Math.round(l.thunder * 1000) / 1000];
  }

  // -------------------------------------------------------------------------
  // to the guests

  broadcast(p: Value[]): void {
    for (const s of this.sessions.values()) if (s.state === 'play') s.send(p);
  }

  /** to the guests whose players are within `r` of (x, y, z) (but `except`) */
  broadcastNear(p: Value[], x: number, y: number, z: number, r: number, except: ServerPlayerSession | null = null): void {
    for (const s of this.sessions.values()) {
      const pl = s.player;
      if (s !== except && s.state === 'play' && pl && (pl.x - x) ** 2 + (pl.y - y) ** 2 + (pl.z - z) ** 2 < r * r) s.send(p);
    }
  }

  /**
   * `fn`'s sounds and particles are for every guest near, the one whose player is ticking too (a guest's player hurt,
   * dying, or a plate clicking under it: what its own game doesn't make for itself)
   */
  heardByAll(fn: () => void): void {
    const actor = this.actor;
    this.actor = null;
    try {
      fn();
    } finally {
      this.actor = actor;
    }
  }

  /** `fn`'s sounds and particles are the host's own (its client-side ambience: torch smoke, water murmurs) */
  runLocal(fn: () => void): void {
    this.muted++;
    try {
      fn();
    } finally {
      this.muted--;
    }
  }

  /** something was picked up: the guests that see it watch it fly to whoever took it */
  private took(e: Entity, taker: LivingEntity, amount: number): void {
    const p: Value[] = [CB.TakeItemEntity, e.id, taker.id, Math.max(0, Math.min(127, Math.floor(amount) || 0))];
    for (const s of this.sessions.values()) if (s.state === 'play' && s.tracker.has(e)) s.send(p);
  }

  /** a chat line for everyone: the host's chat and every guest's */
  broadcastChat(text: string): void {
    this.hooks.chat(text);
    this.broadcast([CB.SystemChat, text, false]);
  }

  /** (the host's own typed chat) to the guests */
  hostChatted(text: string): void {
    this.broadcast([CB.SystemChat, text, false]);
  }

  private blockChanged(x: number, y: number, z: number, old: number, now: number): void {
    const key = Chunk.key(x >> 4, z >> 4);
    // (a block entity came or went with the block, or was made up anew, on the host and in each guest's copy: it's
    // looked at again at the end of the tick, and sent whatever the guest was last sent)
    const retyped = STATE_BLOCK[old] !== STATE_BLOCK[now], beKey = blockEntityKey(x, y, z);
    for (const s of this.sessions.values())
      if (s.state === 'play' && s.sent.has(key)) {
        s.blockChanged(x, y, z, now);
        if (retyped) s.blockEntities.delete(beKey);
      }
    if (retyped) this.dirtyBlockEntities.add(beKey);
  }

  /** how a block entity looks this tick, as sent */
  blockEntityJson(be: BlockEntity): string {
    let j = this.beJson.get(be);
    if (j === undefined) {
      j = JSON.stringify(visibleBlockEntity(be));
      this.beJson.set(be, j);
    }
    return j;
  }

  /**
   * vanilla BlockEntity.setChanged → ClientboundBlockEntityDataPacket: the ones that changed this tick, and every
   * second all of them in each guest's chunks (what a block entity shows can change without its contents changing)
   */
  private flushBlockEntities(): void {
    const world = this.level.world;
    const all = this.ticks % 20 === 0;
    const list: BlockEntity[] = [];
    if (all) for (const be of world.blockEntities.values()) list.push(be);
    else
      for (const key of this.dirtyBlockEntities) {
        const be = world.blockEntities.get(key);
        if (be) list.push(be);
      }
    this.dirtyBlockEntities.clear();
    for (const s of this.sessions.values()) {
      if (s.state !== 'play') continue;
      for (const be of list) {
        if (be.removed || !s.sent.has(Chunk.key(be.x >> 4, be.z >> 4))) continue;
        const j = this.blockEntityJson(be);
        if (s.blockEntities.get(be.key) === j) continue;
        s.blockEntities.set(be.key, j);
        s.send([CB.BlockEntityData, visibleBlockEntity(be)]);
      }
    }
    this.beJson.clear();
  }

  // -------------------------------------------------------------------------
  // coming and going

  /**
   * a guest's Interaction: the host's own kind, its bed the guest's to sleep in, and the menus of the blocks and
   * entities it uses made for its player (game/openMenu.ts, as for the host's own) and shown to it
   */
  guestInteraction(s: ServerPlayerSession, p: Player): Interaction {
    const it = new Interaction(this.level, p);
    it.onOpenContainer = (kind, x, y, z) => {
      const m = blockMenu(this.level, p, kind, x, y, z);
      if (m) s.showMenu(m);
    };
    it.onOpenEntityContainer = (e) => void s.showMenu(entityContainerMenu(this.level, p, e));
    it.onUseBed = (x, y, z) => s.useBed(x, y, z);
    return it;
  }

  /**
   * (game/openMenu.ts's ShowMenu, for a guest's player) vanilla ServerPlayer.openMenu: `m`, made for `p`, shown to its
   * guest; false (and `m` closed again) if `p` is no guest's
   */
  showMenu(p: Player, m: ContainerMenu): boolean {
    const s = this.sessionOf(p);
    if (s) return s.showMenu(m);
    m.removed();
    return false;
  }

  /** a book a guest's player used, in `hand`: opened on the guest's screen */
  openBook(p: Player, hand: Hand): void {
    this.sessionOf(p)?.openBook(hand);
  }

  /** something `p` tried that guests can't do yet (a menu, a portal): a word to the guest, nothing else happens */
  refuse(p: Player, text: string): boolean {
    const s = this.sessionOf(p);
    if (!s) return false;
    s.notice(text);
    return true;
  }

  /** (the session) a guest is in */
  joined(s: ServerPlayerSession): void {
    this.broadcastChat(`§e${s.name} joined the game`);
    this.hooks.onGuestsChanged?.(this.guestCount());
    this.announcer?.announce();
  }

  /** (the session) a guest is gone */
  left(s: ServerPlayerSession, wasPlaying: boolean, reason: string): void {
    if (wasPlaying) {
      this.broadcastChat(`§e${s.name} left the game`);
      if (reason !== 'Left the game') console.info(`multiplayer: ${s.name} was dropped: ${reason}`);
    }
    this.hooks.onGuestsChanged?.(this.guestCount());
    if (!this.closed) this.announcer?.announce();
  }

  /** the world closes to guests: every one is told why and let go (vanilla PlayerList.removeAll on shutdown) */
  close(reason: string): void {
    if (this.closed) return;
    for (const s of [...this.sessions.values()]) s.disconnect(reason);
    this.sessions.clear();
    this.closed = true;
    this.transport.close();
    this.announcer?.close();
    this.announcer = null;
    for (const u of this.undo.splice(0).reverse()) u();
    this.hooks.onGuestsChanged?.(0);
  }
}
