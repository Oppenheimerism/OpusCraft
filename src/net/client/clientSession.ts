// A guest's end of the connection (vanilla ClientPacketListener with the bits of Minecraft.tick and ClientLevel that
// run for a world that's someone else's): it says hello, takes the world in as the host sends it (checked: it came
// from another game), runs its own player and eases the others along, players and the rest, and tells the host each
// tick where its player is, what it looks at and what its buttons and keys did. The host decides everything else.

import type { Value } from '../codec';
import { decode, encodeBundle, CodecError } from '../codec';
import { SB, CB, Action, PoseFlag, checkPacket, checkLogin, packetFault, SLOT_ARMOR, SLOT_OFFHAND, SLOT_COUNT, ANIMATE_SWING_OFF_HAND, type LoginInfo, type ReceivingReason } from '../protocol';
import { PROTOCOL_VERSION, BUILD_ID, MAX_HOST_MESSAGE, MAX_HOST_BACKLOG, MAX_HOST_BACKLOG_BYTES, TIMEOUT_TICKS, MAX_CHAT, MAX_GUEST_MESSAGE, MAX_GUEST_PACKETS, RESYNC_AFTER_TICKS, RESYNC_UNPLACED_TICKS, RESYNC_EVERY_TICKS } from '../config';
import { HOST_PEER, type PeerId, type Transport } from '../transport/transport';
import { itemFromHost, itemToWire } from '../items';
import { poseFlags, stackKey } from '../playerState';
import { columnFromSections, biomesOk, savedBlockEntity, blockEntityFromHost, loadingChunks } from '../chunkData';
import { replayParticles } from '../effects';
import { createFromPayload } from '../entityNet';
import { applyData, PLAYER_FIELDS } from '../entityData';
import { applyPlayerStatus, applyEffectList } from '../playerStatus';
import { readProgress } from '../advancementSync';
import type { AdvancementDef } from '../../game/advancements';
import { addBossBarSource } from '../../game/bossBars';
import type { BossBar } from '../../gui/bossOverlay';
import { MirrorPlayer } from './mirrorPlayer';
import { ClientMenus } from './clientMenus';
import { EntityMirror } from './entityMirror';
import { BOAT_TYPES } from '../../entity/boat';
import type { Level } from '../../game/level';
import type { Entity } from '../../entity/entity';
import { LivingEntity } from '../../entity/living';
import type { Player, GameMode } from '../../entity/player';
import { ITEMS, type ItemStack } from '../../item/item';
import { resetForRespawn } from '../../game/playerDeath';
import type { SavedBlockEntity } from '../../world/blockEntity';
import type { ContainerMenu } from '../../inventory/container';
import type { CraftingMenuBase, FurnaceMenu } from '../../inventory/menus';
import { BOOK_BY_ID, type BookRecipe } from '../../inventory/recipeBook';
import type { Hand } from '../../item/inventory';
import { Chunk } from '../../world/chunk';
import { MIN_Y, MAX_Y } from '../../world/constants';
import { stateCount } from '../../world/block';
// (signs)
import { openSignEditorFromHost } from '../../game/signs';

/** where the chunks the host sends go (the browser: lit on the workers, then into the world; tests: at once) */
export interface ClientChunkSink {
  /** a chunk to light and add; the sink calls `session.chunkReady(cx, cz)` once it's in the world */
  add(cx: number, cz: number, blocks: Uint16Array, biomes: Uint8Array, caveBiomes: Uint8Array | null, blockEntities: SavedBlockEntity[]): void;
  /** out of the world (or, if it's still being lit, not wanted after all) */
  remove(cx: number, cz: number): void;
}

/** what the session needs of the game it's in */
export interface ClientHooks {
  /** the host let us in: a world to play it in (Game.joinWorld), with our player in it where `info` says */
  login(info: LoginInfo): { level: Level; player: Player; chunks: ClientChunkSink };
  /** a chat line, or the action bar's */
  chat(text: string, overlay: boolean): void;
  /** the connection's over, not by our own leaving: `reason` is for the "Connection lost" screen */
  disconnected(reason: string): void;
  /** something was picked up (`amount` of it, for an item): it flies to whoever took it (vanilla ItemPickupParticle) */
  took?(e: Entity, taker: LivingEntity, amount: number): void;
  /** our player got on something (vanilla's "Press Shift to Dismount") */
  mounted?(vehicle: Entity): void;
  /** our player died (vanilla ClientboundPlayerCombatKillPacket): the death screen, saying how */
  died?(message: string): void;
  /** back alive (vanilla ClientboundRespawnPacket): the death screen goes */
  respawned?(): void;
  /** a menu the host opened for us (vanilla handleOpenScreen): its screen */
  openMenu?(menu: ContainerMenu): void;
  /** a menu the host closed (vanilla handleContainerClose): its screen goes, if it's showing */
  closeMenu?(menu: ContainerMenu): void;
  /** a book our player used, in `hand` (vanilla handleOpenBook, and the book and quill's screen) */
  openBook?(hand: Hand): void;
  /** a recipe clicked in menu `menu`'s recipe book that we lack the ingredients for: shown in outline */
  ghostRecipe?(menu: ContainerMenu, recipe: string): void;
  /**
   * recipes our player has unlocked (vanilla handleRecipeBookAdd): new ones (a toast), or all it knows, replacing what
   * the recipe book had
   */
  recipes?(recipes: BookRecipe[], replace: boolean): void;
  /**
   * (stage 4) the host went to another dimension and takes us along (vanilla handleRespawn): our world let go, the
   * loading screen up (`reason`'s) till the host puts our player there; what the session had of the old one is gone
   */
  changeDimension?(dim: string, reason: ReceivingReason): void;
  /**
   * (guests' advancements) our advancements as the host keeps them (vanilla handleUpdateAdvancementsPacket): those whose
   * criteria changed, each with all it has now, or, the first time (`reset`), all of them (net/advancementSync.ts applyProgress)
   */
  advancements?(changes: [AdvancementDef, string[]][], reset: boolean): void;
  /**
   * (the End Poem) taken out of the End by the host's exit portal for the first time (vanilla handleGameEvent WIN_GAME):
   * the End Poem and the credits over the loading screen; once they're over or skipped, `creditsOver` (without this,
   * straight home)
   */
  winGame?(): void;
}

const GAME_MODES: readonly GameMode[] = ['survival', 'creative', 'adventure', 'spectator'];

/** the most fields waiting for an entity that hasn't come yet (a host that names more that never come is let be) */
const MAX_WAITING = 4096;

/** (a stuck loading screen's report) the host's packets by name */
const CB_NAMES = new Map<number, string>(Object.entries(CB).map(([k, v]) => [v as number, k]));
/** (a stuck loading screen's report) how many of the host's latest packets it lists */
const LATELY = 48;

/** the kinds of packet that couldn't be sent to the host, told once each (a bug in whatever built them) */
const unsentIds = new Set<Value>();
function unsent(p: Value, e: CodecError): void {
  const id = Array.isArray(p) ? p[0] : null;
  if (unsentIds.has(id)) return;
  unsentIds.add(id);
  console.error(`multiplayer: a packet (${String(id)}) left out of a message to the host`, e);
}

/** (guests' boss bars) a bar the host shows us, as it last said (changed in place, so the overlay slides it along) */
interface HostBossBar extends BossBar {
  name: string;
  color: string;
  overlay: string;
  progress: number;
  playBossMusic: boolean;
  createWorldFog: boolean;
  darkenScreen: boolean;
}

/** (guests' boss bars) each guest's level's session: its host's bars are what its own player is shown (game/bossBars.ts) */
const sessionOfLevel = new WeakMap<Level, ClientSession>();
addBossBarSource((level, viewer) => {
  const s = sessionOfLevel.get(level);
  return s && viewer === s.player ? [...s.bossBars.values()] : [];
});

export interface GuestIdentity {
  name: string;
  uuid: string;
  viewDistance: number;
  /** (stage 5) the world's join code, as the host told it (net/joinCode.ts) */
  code: string;
}

export class ClientSession {
  state: 'connecting' | 'login' | 'play' | 'closed' = 'connecting';
  level: Level | null = null;
  player: Player | null = null;
  private sink: ClientChunkSink | null = null;
  info: LoginInfo | null = null;
  /** the host's id for our player */
  playerId = -1;
  private readonly inbox: Uint8Array[] = [];
  private inboxBytes = 0;
  private flooded = false;
  /** the connection went: once what came before is read, it's lost */
  private hostGone = false;
  /** why, if the transport said */
  private goneReason: string | null = null;
  private out: Value[] = [];
  private quiet = 0;
  /** the other players, by the host's ids */
  readonly mirrors = new Map<number, MirrorPlayer>();
  /** the other entities the host shows us, by its ids (vanilla ClientLevel.entitiesById) */
  readonly entities = new Map<number, EntityMirror>();
  /** our copies of the host's entities, players aside */
  private readonly copies = new WeakMap<Entity, EntityMirror>();
  /** fields naming an entity that hasn't come yet, by its id: filled in when it does (a mob's target, a lead's holder) */
  private readonly waiting = new Map<number, [Entity, string][]>();
  private waitingCount = 0;
  /** the kinds of entity that couldn't be shown, told once each */
  private readonly unshown = new Set<string>();
  /** chunks being lit, with what the host changed in them meanwhile */
  private readonly pending = new Map<number, { updates: number[]; blockEntities: Map<string, SavedBlockEntity> }>();
  private rainTarget = 0;
  private thunderTarget = 0;
  // this tick's buttons
  private attackPressed = false;
  private usePressed = false;
  private attackHeld = false;
  private useHeld = false;
  /** the entity under our crosshair (what our clicks go to, the host deciding) */
  private target: Entity | null = null;
  /** this tick's drops and riding jumps, sent after where we are and what's in hand */
  private actions: Value[][] = [];
  /** our menus: the inventory's, and one the host opened */
  menus: ClientMenus | null = null;
  /** our inventory as the host last heard it, slot by slot, and our hotbar slot */
  private readonly slots: string[] = new Array(SLOT_COUNT).fill('');
  private invVersion = -1;
  private selected = -1;
  /** why it ended, if it has */
  endReason = '';
  /** our ticks (receive() counts them) */
  private ticks = 0;
  /**
   * (stage 5) on the loading screen, after the login or taken along to another dimension, till the chunks it waits for
   * are in: since when (our ticks), when the host put us in place (-1: not yet), when we last asked for them again (-1:
   * never), and the chunks that came meanwhile, and when the last did
   */
  private loading: { since: number; placed: number; asked: number; chunks: number; lastChunk: number } | null = null;
  /** (the End Poem) watching it (CB.WinGame), out of the host's world till it's over: nothing to ask the host for meanwhile */
  private inCredits = false;
  /** (a stuck loading screen's report) the host's latest packets: their ids, and the ticks they came in */
  private readonly latelyIds: number[] = [];
  private readonly latelyAt: number[] = [];
  /** (guests' boss bars) the bars the host shows us, by its ids (vanilla BossHealthOverlay.events) */
  readonly bossBars = new Map<number, HostBossBar>();

  constructor(readonly transport: Transport, readonly hooks: ClientHooks, readonly me: GuestIdentity) {
    transport.onPeer((peer, joined, reason) => {
      if (peer !== HOST_PEER || this.state === 'closed') return;
      if (joined) {
        this.state = 'login';
        this.send([SB.Hello, PROTOCOL_VERSION, BUILD_ID, me.name, me.uuid, me.viewDistance, me.code]);
        this.flush();
      } else if (this.state === 'connecting') this.lost(reason ?? "Couldn't connect: nobody answered");
      // (what the host said before it went is read first, at the next tick: its Disconnect says why; else the
      // transport's word, if it has one: the relay's that the host's page went away)
      else {
        this.hostGone = true;
        this.goneReason = reason ?? null;
      }
    });
    transport.onMessage((peer: PeerId, data) => {
      if (peer !== HOST_PEER || this.state === 'closed' || this.flooded) return;
      // (more waiting than a host would send: it's let go at the next tick, and nothing more of it is kept)
      if (data.length > MAX_HOST_MESSAGE || this.inbox.length >= MAX_HOST_BACKLOG || this.inboxBytes + data.length > MAX_HOST_BACKLOG_BYTES) {
        this.flooded = true;
        this.inbox.length = 0;
        this.inboxBytes = 0;
        return;
      }
      this.inbox.push(data);
      this.inboxBytes += data.length;
    });
  }

  // -------------------------------------------------------------------------
  // in

  /** what the host said since the last tick (at the start of the guest's tick) */
  receive(): void {
    if (this.state === 'closed') return;
    this.ticks++;
    if (this.flooded) return this.fail('too much, too fast');
    const inbox = this.inbox.splice(0, this.inbox.length);
    this.inboxBytes = 0;
    if (inbox.length) this.quiet = 0;
    else if (this.state === 'play' && ++this.quiet > TIMEOUT_TICKS) return this.lost('Timed out');
    for (const data of inbox) {
      let msg: Value;
      try {
        msg = decode(data, MAX_HOST_MESSAGE);
      } catch (e) {
        return this.fail(e instanceof CodecError ? e.message : 'bad data');
      }
      if (!Array.isArray(msg)) return this.fail('not a message');
      for (const p of msg) {
        const bad = checkPacket(p, 'host');
        if (bad) return this.fail(bad);
        this.heard((p as Value[])[0] as number);
        try {
          this.handle(p as Value[]);
        } catch (e) {
          console.error('multiplayer: handling a packet from the host', e);
          // (what went wrong and with what, on the Disconnected screen, where it can be read and passed on)
          return this.fail(`something went wrong with it (${packetFault(CB, (p as Value[])[0], e)})`);
        }
        if (this.isClosed) return;
      }
    }
    if (this.hostGone) this.lost(this.goneReason ?? 'Connection lost');
  }

  private get isClosed(): boolean {
    return this.state === 'closed';
  }

  /** (a stuck loading screen's report) a packet heard from the host */
  private heard(id: number): void {
    if (this.latelyIds.length >= LATELY) {
      this.latelyIds.shift();
      this.latelyAt.shift();
    }
    this.latelyIds.push(id);
    this.latelyAt.push(this.ticks);
  }

  private handle(p: Value[]): void {
    const id = p[0] as number;
    if (id === CB.Disconnect) return this.lost(p[1] as string);
    if (this.state === 'login') {
      if (id !== CB.Login) return this.fail('expected to be let in first');
      const info = checkLogin(p[1]);
      if (!info) return this.fail('bad login');
      return this.login(info);
    }
    if (this.state !== 'play') return;
    const level = this.level!, world = level.world;
    switch (id) {
      case CB.Login:
        return this.fail('let in twice');
      case CB.KeepAlive:
        return this.send([SB.KeepAlive, p[1]]);
      case CB.LevelChunk:
        return this.levelChunk(p[1] as number, p[2] as number, p[3] as (Uint16Array | null)[], p[4] as Uint8Array, p[5] as Uint8Array | null, p[6] as Value[]);
      case CB.ForgetLevelChunk: {
        const key = Chunk.key(p[1] as number, p[2] as number);
        this.pending.delete(key);
        return this.sink!.remove(p[1] as number, p[2] as number);
      }
      case CB.BlockUpdates:
        return this.blockUpdates(p[1] as Int32Array);
      case CB.BlockEntityData: {
        const d = savedBlockEntity(p[1]);
        if (!d) return this.fail('bad block entity');
        const pend = this.pending.get(Chunk.key(d.x >> 4, d.z >> 4));
        if (pend) pend.blockEntities.set(`${d.x},${d.y},${d.z}`, d);
        else this.putBlockEntity(d);
        return;
      }
      case CB.BlockDestruction:
        return level.destroyBlockProgress(p[1] as number, p[2] as number, p[3] as number, p[4] as number, p[5] as number);
      case CB.SetTime:
        level.gameTime = p[1] as number;
        level.dayTime = p[2] as number;
        level.doDaylightCycle = p[3] as boolean;
        return;
      case CB.Weather:
        level.raining = p[1] as boolean;
        level.thundering = p[2] as boolean;
        this.rainTarget = world.dim.hasSkyLight ? (p[3] as number) : 0;
        this.thunderTarget = world.dim.hasSkyLight ? (p[4] as number) : 0;
        return;
      case CB.PlayerPosition: {
        if (this.loading) this.loading.placed = this.ticks;
        const pl = this.player!;
        pl.moveTo(p[1] as number, p[2] as number, p[3] as number, p[4] as number, p[5] as number);
        pl.dx = pl.dy = pl.dz = 0;
        pl.fallDistance = 0;
        return this.send([SB.AcceptTeleportation, p[6]]);
      }
      case CB.AddPlayer:
        return this.addPlayer(p);
      case CB.RemoveEntities:
        for (const eid of p[1] as number[]) {
          const m = this.mirrors.get(eid);
          if (m) {
            dropCopy(m);
            this.mirrors.delete(eid);
          }
          const c = this.entities.get(eid);
          if (c) {
            dropCopy(c.e);
            this.entities.delete(eid);
          }
          this.forget(eid);
          level.destroyProgress.delete(eid);
        }
        return;
      case CB.MoveEntity: {
        const [, eid, x, y, z, yRot, xRot, head, body, flags] = p as number[];
        const m = this.mirrors.get(eid);
        if (m) {
          m.lerpTo(x, y, z, yRot, xRot, head, body);
          m.setPose(flags);
        } else this.entities.get(eid)?.lerpTo(x, y, z, yRot, xRot, head, body, flags);
        return;
      }
      case CB.AddEntity:
        return this.addEntity(p);
      case CB.SetEntityData: {
        const m = this.mirrors.get(p[1] as number);
        if (m) {
          // (another player: how it's hurt, dying, burning, asleep, and what it's using)
          const why = applyData(m, p[2], this.resolve, PLAYER_FIELDS);
          return why ? this.fail(why) : undefined;
        }
        const c = this.entities.get(p[1] as number);
        if (!c) return;
        const why = applyData(c.e, p[2], this.resolve);
        if (why) return this.fail(why);
        // (a size that changed: its box goes with it)
        const d = p[2] as Record<string, Value>;
        if ('width' in d || 'height' in d) c.e.setPos(c.e.x, c.e.y, c.e.z);
        return;
      }
      case CB.SetPassengers:
        return this.setPassengers(p[1] as number, p[2] as number[]);
      case CB.TakeItemEntity: {
        const e = this.byNetId(p[1] as number), taker = this.byNetId(p[2] as number);
        if (e && taker instanceof LivingEntity) this.hooks.took?.(e, taker, p[3] as number);
        return;
      }
      case CB.SetExperience: {
        const pl = this.player!;
        pl.xpProgress = p[1] as number;
        pl.xpLevel = p[2] as number;
        pl.xpTotal = p[3] as number;
        return;
      }
      case CB.Animate: {
        const e = p[1] === this.playerId ? this.player : this.mirrors.get(p[1] as number);
        if (e && (p[2] === 0 || p[2] === ANIMATE_SWING_OFF_HAND)) e.swing(p[2] === ANIMATE_SWING_OFF_HAND ? 'off' : 'main');
        return;
      }
      case CB.SetEquipment: {
        const m = this.mirrors.get(p[1] as number);
        if (m) setEquipment(m, p[2] as number, itemFromHost(p[3]));
        return;
      }
      case CB.Sound:
        try {
          level.sound.play(p[1] as string, p[2] as number, p[3] as number, p[4] as number, p[5] as number, p[6] as number);
        } catch {
          // (a sound this game doesn't have: silence)
        }
        return;
      case CB.LevelParticles:
        replayParticles(level.particles, p[1] as string, p[2] as Value[], (eid) => this.byNetId(eid));
        return;
      case CB.SystemChat:
        return this.hooks.chat(p[1] as string, p[2] as boolean);
      case CB.ContainerSetSlot: {
        const slot = p[1] as number, s = itemFromHost(p[2]);
        const inv = this.player!.inventory;
        if (slot < SLOT_ARMOR) inv.main[slot] = s;
        else if (slot < SLOT_OFFHAND) inv.armor[slot - SLOT_ARMOR] = s;
        else inv.offhand = s;
        inv.version++;
        // (the host has this already: not to be sent back)
        this.slots[slot] = stackKey(s);
        return;
      }
      case CB.PlayerStatus:
        return applyPlayerStatus(this.player!, p.slice(1));
      case CB.SetEntityMotion: {
        // (vanilla handleSetEntityMotion for our own player: knocked or blown, from how it was going to this)
        const pl = this.player!;
        pl.dx = p[1] as number;
        pl.dy = p[2] as number;
        pl.dz = p[3] as number;
        return;
      }
      case CB.PlayerCombatKill: {
        const pl = this.player!;
        pl.health = 0;
        pl.dead = true;
        return this.hooks.died?.(p[1] as string);
      }
      case CB.Respawn:
        // (a fresh start: its health, food, effects and the rest come after, as the host has them)
        resetForRespawn(this.player!, true);
        return this.hooks.respawned?.();
      case CB.GameMode: {
        const mode = p[1] as GameMode;
        if (!GAME_MODES.includes(mode)) return this.fail('a game mode that does not exist');
        return this.player!.setGameMode(mode);
      }
      case CB.SetCarriedItem: {
        const inv = this.player!.inventory;
        inv.selected = this.selected = p[1] as number;
        inv.version++;
        return;
      }
      case CB.SetCooldown: {
        const pl = this.player!, item = p[1] as string, left = p[2] as number, total = p[3] as number;
        if (!ITEMS.has(item)) return this.fail('an item that does not exist');
        if (left > 0) pl.cooldowns.set(item, left);
        else pl.cooldowns.delete(item);
        if (left > 0 && total > 0) pl.cooldownTotals.set(item, total);
        else pl.cooldownTotals.delete(item);
        return;
      }
      case CB.UpdateEffects:
        if (!applyEffectList(this.player!, p[1] as Value[])) return this.fail('an effect that does not exist');
        return;
      case CB.SetSleeping: {
        // (in the bed the host says, or up out of it; where it stands up, the host's teleport says)
        const pl = this.player!, pos = p[1] as number[] | null;
        if (pos) pl.startSleeping(pos[0], pos[1], pos[2]);
        else if (pl.isSleeping()) pl.stopSleepInBed(false);
        return;
      }
      case CB.SetUsingItem: {
        // (vanilla: our player's use of the item in that hand, as the host has it; counted on here till it says otherwise)
        const pl = this.player!, hand = p[1] as number;
        if (hand < 0) {
          pl.useItem = null;
          pl.useItemRemaining = 0;
          pl.usingItemTicks = 0;
          return;
        }
        pl.useHand = hand === 1 ? 'off' : 'main';
        pl.useItem = pl.inventory.inHand(pl.useHand);
        pl.useDuration = p[2] as number;
        pl.useItemRemaining = p[3] as number;
        pl.usingItemTicks = pl.useItem ? pl.ticksUsingItem() + 1 : 0;
        return;
      }
      case CB.OpenScreen: {
        const why = this.menus!.openScreen(p[1] as number, p[2] as string, p[3] as string, p[4] as Record<string, Value>);
        return why ? this.fail(why) : undefined;
      }
      case CB.ContainerSetContent: {
        const why = this.menus!.setContent(p[1] as number, p[2] as number, p[3] as Value[], p[4]);
        return why ? this.fail(why) : undefined;
      }
      case CB.MenuSetSlot: {
        const why = this.menus!.setSlot(p[1] as number, p[2] as number, p[3] as number, p[4]);
        return why ? this.fail(why) : undefined;
      }
      case CB.SetCarried:
        return this.menus!.setCarried(p[1] as number, p[2] as number, p[3]);
      case CB.ContainerSetData: {
        const why = this.menus!.setData(p[1] as number, p[2] as number, p[3] as number);
        return why ? this.fail(why) : undefined;
      }
      case CB.ContainerClose:
        return this.menus!.close(p[1] as number);
      case CB.MerchantOffers: {
        const why = this.menus!.offers(p[1] as number, p[2] as Value[], p[3] as number, p[4] as number, p[5] as boolean, p[6] as boolean);
        return why ? this.fail(why) : undefined;
      }
      case CB.PlaceGhostRecipe:
        return this.menus!.ghost(p[1] as number, p[2] as string);
      case CB.OpenBook:
        return this.hooks.openBook?.(p[1] === 1 ? 'off' : 'main');
      case CB.OpenSignEditor:
        // (signs) vanilla handleOpenSignEditor: ignored when there's no sign there
        openSignEditorFromHost(level, this.player!, p[1] as number, p[2] as number, p[3] as number, p[4] as boolean);
        return;
      case CB.ChangeDimension:
        return this.changeDimension(p[1] as string, p[2] as ReceivingReason);
      case CB.BossEvent: {
        const [, bid, name, color, overlay, progress, flags] = p as [number, number, string, string, string, number, number];
        let b = this.bossBars.get(bid);
        if (!b) this.bossBars.set(bid, (b = { name: '', color, overlay, progress, playBossMusic: false, createWorldFog: false, darkenScreen: false }));
        // (a name is plain text: control characters and the formatting sign taken out, as a menu's title is)
        b.name = name.replace(/[\u0000-\u001f\u007f§]/g, '');
        b.color = color;
        b.overlay = overlay;
        b.progress = progress;
        b.darkenScreen = (flags & 1) !== 0;
        b.playBossMusic = (flags & 2) !== 0;
        b.createWorldFog = (flags & 4) !== 0;
        return;
      }
      case CB.BossEventRemove:
        this.bossBars.delete(p[1] as number);
        return;
      case CB.WinGame:
        this.inCredits = true;
        return this.hooks.winGame ? this.hooks.winGame() : this.creditsOver();
      case CB.UpdateAdvancements: {
        const changes = readProgress(p[2] as Value[]);
        if (!changes) return this.fail('an advancement that does not exist');
        return this.hooks.advancements?.(changes, p[1] as boolean);
      }
      case CB.RecipeBookAdd: {
        const rs: BookRecipe[] = [];
        for (const id of p[1] as string[]) {
          const r = BOOK_BY_ID.get(id);
          if (!r) return this.fail('a recipe that does not exist');
          rs.push(r);
        }
        return this.hooks.recipes?.(rs, p[2] as boolean);
      }
    }
  }

  private login(info: LoginInfo): void {
    this.info = info;
    this.playerId = info.playerId;
    const { level, player, chunks } = this.hooks.login(info);
    // (vanilla sendRidingJump: the charge let go on the mount we steer, which the host leaps)
    player.onRidingJump = (power) => {
      if (this.actions.length < 16) this.actions.push([SB.PlayerAction, Action.RIDING_JUMP, Math.max(0, Math.min(100, Math.floor(power) || 0))]);
    };
    // (the clock runs as the host's does from the first tick, before its first SetTime)
    level.doDaylightCycle = info.gameRules.doDaylightCycle !== false;
    this.level = level;
    this.player = player;
    this.sink = chunks;
    sessionOfLevel.set(level, this);
    this.menus = new ClientMenus(player, {
      send: (pk) => this.send(pk),
      entity: (id) => this.byNetId(id),
      show: (m) => this.hooks.openMenu?.(m),
      hide: (m) => this.hooks.closeMenu?.(m),
      beforeClick: () => this.sendCreative(),
      afterClick: () => this.inventorySent(),
      inventorySlot: (i) => {
        this.slots[i] = stackKey(slotStack(player, i));
      },
      ghostRecipe: (m, recipe) => this.hooks.ghostRecipe?.(m, recipe),
    });
    this.rainTarget = info.rainLevel;
    this.thunderTarget = info.thunderLevel;
    this.state = 'play';
    // (the login puts us in place: the loading screen waits for the chunks round us)
    this.loading = { since: this.ticks, placed: this.ticks, asked: -1, chunks: 0, lastChunk: -1 };
  }

  /**
   * vanilla handleRespawn: a new level. Everything shown of the old one goes (the other players, the entities, the chunks
   * being lit, the cracks), our player gets out of bed and off what it rode, and the game lets go of its world; the
   * weather comes afresh as the host has it there. The host's teleport puts us in place, and its chunks follow
   */
  private changeDimension(dim: string, reason: ReceivingReason): void {
    // (as the host woke our player there: vanilla ServerPlayer.changeDimension)
    if (this.player!.isSleeping()) this.player!.stopSleepInBed(true);
    for (const m of this.mirrors.values()) dropCopy(m);
    this.mirrors.clear();
    for (const c of this.entities.values()) dropCopy(c.e);
    this.entities.clear();
    this.waiting.clear();
    this.waitingCount = 0;
    this.pending.clear();
    this.target = null;
    // (the host's bars are its old dimension's: those of the new come as it shows them)
    this.bossBars.clear();
    this.level!.destroyProgress.clear();
    this.player!.removeVehicle();
    this.rainTarget = this.thunderTarget = 0;
    // (the loading screen, till the host is there and puts us in place: a teleport; then the chunks round us)
    this.loading = { since: this.ticks, placed: -1, asked: -1, chunks: 0, lastChunk: -1 };
    this.hooks.changeDimension?.(dim, reason);
  }

  /**
   * (stage 5) whether we're still waiting on our loading screen for the host's chunks round us (after the login, or
   * taken along to another dimension): as far as what the host sends goes (Game.tick waits for them to be drawn, too)
   */
  get stillLoading(): boolean {
    return this.loading !== null;
  }

  /**
   * (stage 5, each tick) on the loading screen: in, once the chunks it waits for have come; else, long enough after the
   * host put us in place (or took us along and hasn't put us anywhere), we ask for them again (SB.Resync), every so often
   * while it lasts, saying in the console what we have and haven't, and what came lately: to find out why, if it does
   */
  private checkLoading(): void {
    const l = this.loading;
    if (!l || this.inCredits) return;
    const missing = this.missingChunks();
    if (!missing.length && l.placed >= 0) {
      this.loading = null;
      return;
    }
    const waited = this.ticks - l.since;
    const due = l.asked >= 0 ? this.ticks - l.asked >= RESYNC_EVERY_TICKS : l.placed >= 0 ? this.ticks - l.placed >= RESYNC_AFTER_TICKS : waited >= RESYNC_UNPLACED_TICKS;
    if (!due) return;
    l.asked = this.ticks;
    this.send([SB.Resync, missing.flat(), Math.min(waited, 0x7fffffff), l.placed >= 0]);
    console.warn(`multiplayer: still on the loading screen after ${(waited / 20).toFixed(1)} s: asked the host for the world again`, this.loadingReport(missing));
  }

  /** (the loading screen) the chunks it waits for round our player (net/chunkData.ts loadingChunks) that aren't in yet */
  private missingChunks(): [number, number][] {
    const p = this.player!, world = this.level!.world, out: [number, number][] = [];
    for (const [cx, cz] of loadingChunks(p.x, p.z, this.info!.viewDistance)) {
      const key = Chunk.key(cx, cz);
      if (!world.chunks.has(key) || this.pending.has(key)) out.push([cx, cz]);
    }
    return out;
  }

  /** (a stuck loading screen) what we have of the world and what came lately, for the console */
  private loadingReport(missing: [number, number][]): Record<string, unknown> {
    const l = this.loading!, p = this.player!, world = this.level!.world, now = this.ticks;
    return {
      dimension: world.dim.id,
      at: [p.x, p.y, p.z].map((v) => Math.round(v * 100) / 100),
      chunk: [Math.floor(p.x) >> 4, Math.floor(p.z) >> 4],
      viewDistance: this.info!.viewDistance,
      waitedTicks: now - l.since,
      placedTicksAgo: l.placed >= 0 ? now - l.placed : null,
      missing: missing.map(([cx, cz]) => `${cx},${cz}${this.pending.has(Chunk.key(cx, cz)) ? ' (being lit)' : ''}`),
      chunksInWorld: world.chunks.size,
      chunksBeingLit: this.pending.size,
      chunksSince: l.chunks,
      lastChunkTicksAgo: l.lastChunk >= 0 ? now - l.lastChunk : null,
      lately: this.latelyIds.map((id, i) => `${CB_NAMES.get(id) ?? id}@-${now - this.latelyAt[i]}`).join(' '),
    };
  }

  /** vanilla ClientPacketListener.handleLevelChunkWithLight: checked, then lit and put in the world (replacing any) */
  private levelChunk(cx: number, cz: number, sections: (Uint16Array | null)[], biomes: Uint8Array, cave: Uint8Array | null, bes: Value[]): void {
    const blocks = columnFromSections(sections);
    if (!blocks) return this.fail('a block that does not exist');
    if (!biomesOk(biomes, cave)) return this.fail('a biome that does not exist');
    const list: SavedBlockEntity[] = [];
    for (const v of bes) {
      const d = savedBlockEntity(v, cx, cz);
      if (!d) return this.fail('bad block entity');
      list.push(d);
    }
    const key = Chunk.key(cx, cz);
    if (this.loading) {
      this.loading.chunks++;
      this.loading.lastChunk = this.ticks;
    }
    if (this.level!.world.chunks.has(key) || this.pending.has(key)) this.sink!.remove(cx, cz);
    this.pending.set(key, { updates: [], blockEntities: new Map() });
    this.sink!.add(cx, cz, blocks, biomes, cave, list);
  }

  /** (the chunk sink) a chunk is in the world: what the host changed in it meanwhile goes in too */
  chunkReady(cx: number, cz: number): void {
    const key = Chunk.key(cx, cz);
    const pend = this.pending.get(key);
    if (!pend) return;
    this.pending.delete(key);
    const u = pend.updates, world = this.level!.world;
    for (let i = 0; i < u.length; i += 4) world.setState(u[i], u[i + 1], u[i + 2], u[i + 3]);
    for (const d of pend.blockEntities.values()) this.putBlockEntity(d);
  }

  /** vanilla handleChunkBlocksUpdate */
  private blockUpdates(u: Int32Array): void {
    const world = this.level!.world, n = stateCount();
    for (let i = 0; i < u.length; i += 4) {
      const x = u[i], y = u[i + 1], z = u[i + 2], st = u[i + 3];
      if (y < MIN_Y || y >= MAX_Y || st < 0 || st >= n) return this.fail('a block that does not exist');
      const pend = this.pending.get(Chunk.key(x >> 4, z >> 4));
      if (pend) pend.updates.push(x, y, z, st);
      else if (world.isLoaded(x, z)) world.setState(x, y, z, st);
    }
  }

  private putBlockEntity(d: SavedBlockEntity): void {
    const be = blockEntityFromHost(d);
    if (be) this.level!.world.setBlockEntity(be);
  }

  /** vanilla handleAddEntity for a player (with its PlayerInfo): a mirror of it, where it is and in what it holds */
  private addPlayer(p: Value[]): void {
    const id = p[1] as number;
    if (id === this.playerId || this.entities.has(id)) return;
    const had = this.mirrors.get(id);
    if (had) dropCopy(had);
    const m = new MirrorPlayer(this.level!, id);
    m.uuid = (p[2] as string).toLowerCase();
    m.profileName = (p[3] as string).replace(/[\u0000-\u001f\u007f§]/g, '');
    m.setGameMode(p[12] === 'survival' || p[12] === 'adventure' || p[12] === 'spectator' ? p[12] : 'creative');
    m.place(p[4] as number, p[5] as number, p[6] as number, p[7] as number, p[8] as number, p[9] as number, p[10] as number, p[11] as number);
    (p[13] as Value[]).forEach((it, slot) => setEquipment(m, slot, itemFromHost(it)));
    this.mirrors.set(id, m);
    this.level!.addMirrorEntity(m);
    this.arrived(id, m);
  }

  /**
   * vanilla handleAddEntity: our copy of an entity, made from its record (or afresh, for the kinds that have none),
   * where the host says, with all its fields. One this game can't make is left out (said once in the console)
   */
  private addEntity(p: Value[]): void {
    const id = p[1] as number, type = p[2] as string;
    if (id === this.playerId || this.mirrors.has(id)) return;
    const had = this.entities.get(id);
    if (had) {
      dropCopy(had.e);
      this.entities.delete(id);
    }
    const level = this.level!;
    let e: Entity | null = null;
    try {
      e = createFromPayload(level, type, p[3]);
    } catch (err) {
      if (!this.unshown.has(type)) console.warn(`multiplayer: making a ${type}`, err);
    }
    if (!e) {
      if (!this.unshown.has(type)) console.warn(`multiplayer: a ${type} from the host that can't be shown`);
      this.unshown.add(type);
      return;
    }
    const c = new EntityMirror(e, id);
    const [x, y, z, yRot, xRot, head, body, flags] = p.slice(4, 12) as number[];
    c.place(x, y, z, yRot, xRot, head, body, flags);
    const why = applyData(e, p[12], this.resolve);
    if (why) return this.fail(why);
    e.setPos(e.x, e.y, e.z);
    this.entities.set(id, c);
    this.copies.set(e, c);
    level.addMirrorEntity(e);
    this.arrived(id, e);
  }

  /** our player, or our copy of a player or an entity, by the host's id */
  private byNetId(id: number): Entity | null {
    if (id === this.playerId) return this.player;
    return this.mirrors.get(id) ?? this.entities.get(id)?.e ?? null;
  }

  /** (applyData) an entity a field names: our copy of it, or, if it hasn't come yet, null till it does */
  private readonly resolve = (id: number, e: Entity, field: string | null): Entity | null => {
    const found = this.byNetId(id);
    if (found || field === null || this.waitingCount >= MAX_WAITING) return found;
    let w = this.waiting.get(id);
    if (!w) this.waiting.set(id, (w = []));
    w.push([e, field]);
    this.waitingCount++;
    return null;
  };

  /** the entity the host calls `id` has come: the fields that named it before it did have it now (if they still name nothing) */
  private arrived(id: number, e: Entity): void {
    const w = this.waiting.get(id);
    if (!w) return;
    this.forget(id);
    for (const [holder, field] of w) {
      const rec = holder as unknown as Record<string, unknown>;
      if (!holder.removed && rec[field] === null) rec[field] = e;
    }
  }

  private forget(id: number): void {
    const w = this.waiting.get(id);
    if (!w) return;
    this.waitingCount -= w.length;
    this.waiting.delete(id);
  }

  /** vanilla handleSetEntityPassengersPacket: who rides `vid`, in its seats' order (those we don't know of aside) */
  private setPassengers(vid: number, ids: number[]): void {
    const v = this.byNetId(vid);
    if (!v || v === this.player) return;
    const riders: Entity[] = [];
    for (const id of ids) {
      const r = this.byNetId(id);
      if (r && r !== v && !riders.includes(r)) riders.push(r);
    }
    // (getting off, a rider stays where it is till the host says where it went: a teleport for us, a move for the rest)
    for (const r of [...v.passengers]) if (!riders.includes(r)) r.removeVehicle();
    const me = this.player!, wasOn = me.vehicle === v;
    for (const r of riders) {
      if (r.vehicle === v) continue;
      if (r.vehicle) r.removeVehicle();
      r.startRiding(v, true);
    }
    const seats = v.passengers.filter((r) => riders.includes(r));
    seats.sort((a, b) => riders.indexOf(a) - riders.indexOf(b));
    v.passengers.length = 0;
    v.passengers.push(...seats);
    if (!wasOn && me.vehicle === v) {
      // (vanilla: getting in a boat turns you its way)
      if (BOAT_TYPES.includes(v.type)) me.yaw = me.yawO = me.headYaw = v.yaw;
      this.hooks.mounted?.(v);
    }
  }

  // -------------------------------------------------------------------------
  // the guest's own tick

  /**
   * this tick's attack and use buttons (Game.tick's clicks and held buttons, which the host acts on), and the entity
   * under the crosshair (what they go to, if the host agrees)
   */
  input(attackPressed: boolean, attackHeld: boolean, usePressed: boolean, useHeld: boolean, target: Entity | null = null): void {
    this.attackPressed ||= attackPressed;
    this.usePressed ||= usePressed;
    this.attackHeld = attackHeld;
    this.useHeld = useHeld;
    this.target = target;
  }

  /** the drop key (with Ctrl, the whole stack): the host throws it, and tells us what's left (vanilla DROP_ITEM) */
  drop(all: boolean): void {
    if (this.state === 'play' && this.actions.length < 16) this.actions.push([SB.PlayerAction, all ? Action.DROP_ALL : Action.DROP, 0]);
  }

  /** the death screen's Respawn (vanilla ClientboundClientCommandPacket PERFORM_RESPAWN) */
  respawn(): void {
    this.action([SB.ClientCommand, 0]);
  }

  /**
   * (the End Poem) over or skipped (vanilla WinScreen's onFinished: PERFORM_RESPAWN): the host puts our player home, the
   * loading screen waiting for it from now
   */
  creditsOver(): void {
    if (!this.inCredits) return;
    this.inCredits = false;
    if (this.loading) this.loading.since = this.ticks;
    // (sent as it is, not queued with the actions: whatever else is waiting, this goes)
    if (this.state === 'play') this.send([SB.ClientCommand, 0]);
  }

  /** the in-bed screen's Leave Bed (vanilla sendWakeUp: STOP_SLEEPING) */
  stopSleeping(): void {
    this.action([SB.PlayerAction, Action.STOP_SLEEPING, 0]);
  }

  /** the swap key: the host swaps our hands, and tells us (vanilla SWAP_ITEM_WITH_OFFHAND) */
  swapHands(): void {
    this.action([SB.PlayerAction, Action.SWAP_HANDS, 0]);
  }

  /** the inventory key while riding a horse or a chest boat: the host opens its inventory (vanilla OPEN_INVENTORY) */
  openVehicleInventory(): void {
    this.action([SB.PlayerAction, Action.OPEN_INVENTORY, 0]);
  }

  /** survival's pick-block: the stack in `slot` (past the hotbar) into our hand, which the host does (vanilla ServerboundPickItemPacket) */
  pickSlot(slot: number): void {
    if (slot >= 9 && slot < 36) this.action([SB.PickItem, slot]);
  }

  private action(a: Value[]): void {
    if (this.state === 'play' && this.actions.length < 16) this.actions.push(a);
  }

  /** (our player's dropHandler) an item thrown out of the creative inventory (vanilla handleCreativeModeItemDrop: slot -1) */
  dropCreative(s: ItemStack): void {
    if (this.state === 'play' && this.actions.length < 16) this.actions.push([SB.SetCreativeModeSlot, -1, itemToWire(s)]);
  }

  /**
   * the book and quill's Done and Sign (vanilla ServerboundEditBookPacket): what's written in the book in inventory
   * slot `slot` (a hotbar slot, or 40 for the offhand), or its title as it's signed; the host writes it in
   */
  editBook(slot: number, pages: string[], title: string | null): void {
    if (this.state !== 'play' || (slot > 8 && slot !== 40)) return;
    const text = pages.slice(0, 100).map((s) => s.slice(0, 1024));
    const t = title === null ? null : title.slice(0, 32);
    if (t === '') return;
    this.send([SB.EditBook, slot, text, t]);
  }

  /** (the recipe book) a recipe clicked in menu `m`: the host fills its grid from our inventory (vanilla ServerboundPlaceRecipePacket) */
  placeRecipe(m: CraftingMenuBase | FurnaceMenu, recipe: string, all: boolean): void {
    if (this.state === 'play') this.menus?.placeRecipe(m, recipe, all);
  }

  /**
   * vanilla ClientLevel.tick for a guest: the clock and the weather as the host has them, our player (once its chunk
   * is here) and the others eased along; no blocks, mobs or anything else of the world's own doing
   */
  tickLevel(): void {
    const level = this.level;
    if (this.state !== 'play' || !level) return;
    level.gameTime++;
    if (level.doDaylightCycle) level.dayTime++;
    level.rainO = level.rain;
    level.rain = this.rainTarget;
    level.thunderO = level.thunder;
    level.thunder = this.thunderTarget;
    level.updateSkyBrightness();
    const p = this.player!;
    // (vanilla LivingEntity.updatingUsingItem: the item in use, the stack in that hand whatever the host last sent of
    // it, counted on as the host counts it)
    if (p.useItem) {
      const held = p.inventory.inHand(p.useHand);
      if (held && held.item === p.useItem.item) p.useItem = held;
      p.useItemRemaining--;
      p.usingItemTicks = p.ticksUsingItem() + 1;
    }
    // (vanilla ClientLevel.tickEntities: each thing that rides nothing, then its riders, each after what it rides)
    for (const m of this.mirrors.values()) if (!m.removed && !m.vehicle) this.tickTree(m, 0);
    for (const c of this.entities.values()) if (!c.e.removed && !c.e.vehicle) this.tickTree(c.e, 0);
    if (!p.removed && !p.vehicle && level.world.isLoaded(Math.floor(p.x), Math.floor(p.z))) p.tick();
    level.pruneRemoved();
  }

  /** a copy, then its riders, each put in its seat (vanilla ClientLevel.tickPassenger); our own player rides as ever */
  private tickTree(e: Entity, depth: number): void {
    if (e !== this.player) this.tickCopy(e);
    for (const r of [...e.passengers]) {
      if (r.removed || r.vehicle !== e) continue;
      if (r === this.player) {
        if (this.level!.world.isLoaded(Math.floor(r.x), Math.floor(r.z))) r.rideTick();
      } else if (this.tickCopy(r)) {
        try {
          e.positionRider(r);
        } catch (err) {
          this.broken(r, err);
        }
      }
      if (r.passengers.length && depth < 8) this.tickTree(r, depth + 1);
    }
  }

  /** one copy's tick (a player's or another entity's); one that fails is dropped from view (said once in the console) */
  private tickCopy(e: Entity): boolean {
    try {
      if (e instanceof MirrorPlayer) e.tick();
      else this.copies.get(e)?.tick();
      return true;
    } catch (err) {
      this.broken(e, err);
      return false;
    }
  }

  private broken(e: Entity, err: unknown): void {
    if (!this.unshown.has(e.type)) console.error(`multiplayer: a ${e.type} from the host`, err);
    this.unshown.add(e.type);
    dropCopy(e);
  }

  /**
   * the host's id for `e`: one of our copies, or a part of one, which vanilla numbers after its entity, one each
   * (EnderDragon.setId: an ender dragon's head, neck, body, tail and wings); -1 if it's neither
   */
  private netIdOf(e: Entity): number {
    const c = this.copies.get(e);
    if (c) return c.netId;
    const parent = (e as { parent?: unknown }).parent;
    const parts = parent && (parent as { subEntities?: unknown }).subEntities;
    const pc = Array.isArray(parts) ? this.copies.get(parent as Entity) : undefined;
    const i = pc ? (parts as unknown[]).indexOf(e) : -1;
    return pc && i >= 0 ? pc.netId + 1 + i : -1;
  }

  /** (end of the guest's tick) where our player is, what the buttons did, what's changed in the inventory: sent */
  sendTick(): void {
    if (this.state !== 'play') return this.flush();
    this.checkLoading();
    const p = this.player!, i = p.input;
    let flags = poseFlags(p);
    if (this.attackHeld) flags |= PoseFlag.ATTACK_HELD;
    if (this.useHeld) flags |= PoseFlag.USE_HELD;
    if (i.forward) flags |= PoseFlag.FORWARD;
    if (i.back) flags |= PoseFlag.BACK;
    if (i.left) flags |= PoseFlag.LEFT;
    if (i.right) flags |= PoseFlag.RIGHT;
    if (i.jump) flags |= PoseFlag.JUMP;
    if (p.horizontalCollision) flags |= PoseFlag.HORIZONTAL_COLLISION;
    const t = this.target;
    const target = t && !t.removed ? (t instanceof MirrorPlayer ? t.netId : this.netIdOf(t)) : -1;
    // (the look first, so the host clicks where we looked)
    this.send([SB.MovePlayer, p.x, p.y, p.z, p.yaw, p.pitch, flags, target]);
    const inv = p.inventory;
    if (inv.selected !== this.selected) {
      this.selected = inv.selected;
      this.send([SB.SetCarriedItem, inv.selected]);
    }
    this.sendCreative();
    if (this.attackPressed) this.send([SB.PlayerAction, Action.ATTACK, 0]);
    if (this.usePressed) this.send([SB.PlayerAction, Action.USE, 0]);
    this.attackPressed = this.usePressed = false;
    for (const a of this.actions) this.send(a);
    this.actions = [];
    this.flush();
  }

  /** (a creative inventory is ours to fill; anything else in it is the host's doing, which it tells us) what we changed in it */
  private sendCreative(): void {
    const p = this.player, inv = p?.inventory;
    if (!p || !inv || inv.version === this.invVersion || p.gameMode !== 'creative') return;
    this.invVersion = inv.version;
    for (let slot = 0; slot < SLOT_COUNT; slot++) {
      const s = slotStack(p, slot), key = stackKey(s);
      if (key === this.slots[slot]) continue;
      this.slots[slot] = key;
      this.send([SB.SetCreativeModeSlot, slot, itemToWire(s)]);
    }
  }

  /** (after a click in a menu) our inventory as it is now is what the host will make of the click: not ours to send */
  private inventorySent(): void {
    const p = this.player;
    if (!p) return;
    for (let slot = 0; slot < SLOT_COUNT; slot++) this.slots[slot] = stackKey(slotStack(p, slot));
    this.invVersion = p.inventory.version;
  }

  /** receive, tick and send, in the order the game does them (for the tests; the game calls them between its own steps) */
  tick(): void {
    this.receive();
    this.tickLevel();
    this.sendTick();
  }

  /** (signs) a sign editor's Done (vanilla ServerboundSignUpdatePacket): the side's four lines, for the host to check and write */
  signUpdate(x: number, y: number, z: number, front: boolean, lines: readonly string[]): void {
    if (this.state !== 'play') return;
    const l = [0, 1, 2, 3].map((i) => String(lines[i] ?? '').slice(0, 384));
    this.send([SB.SignUpdate, x, y, z, front, l[0], l[1], l[2], l[3]]);
  }

  /** a line typed in chat (vanilla ClientPacketListener.sendChat / sendCommand) */
  chat(text: string): void {
    const msg = text.trim().replace(/\s+/g, ' ').slice(0, MAX_CHAT);
    if (!msg || this.state !== 'play') return;
    if (msg.startsWith('/')) this.send([SB.ChatCommand, msg.slice(1)]);
    else this.send([SB.Chat, msg]);
  }

  private send(p: Value[]): void {
    if (this.state !== 'closed') this.out.push(p);
  }

  /**
   * what's waiting, to the host: as one message, or, for a busy tick (a drag across a chest's slots, a book signed with
   * the rest), as several within the host's limits on a message's packets and bytes
   */
  private flush(): void {
    if (!this.out.length || this.state === 'closed') return;
    const msg = this.out;
    this.out = [];
    for (let i = 0; i < msg.length; i += MAX_GUEST_PACKETS) this.sendPart(msg.slice(i, i + MAX_GUEST_PACKETS));
  }

  private sendPart(part: Value[]): void {
    const bytes = encodeBundle(part, (p, e) => unsent(p, e));
    if (bytes.length <= MAX_GUEST_MESSAGE) return this.transport.send(HOST_PEER, bytes);
    if (part.length === 1) return unsent(part[0], new CodecError('too big to send'));
    const half = part.length >> 1;
    this.sendPart(part.slice(0, half));
    this.sendPart(part.slice(half));
  }

  // -------------------------------------------------------------------------
  // the end

  /** we're leaving (vanilla ClientLevel.disconnect): the host hears it, nothing more comes */
  leave(): void {
    if (this.state === 'closed') return;
    if (this.state === 'play' || this.state === 'login') {
      this.out = [[SB.Disconnect, 'Quitting']];
      this.flush();
    }
    this.state = 'closed';
    this.endReason = 'Left';
    this.transport.close();
  }

  /** the host sent something this game can't take: we leave, saying why */
  private fail(why: string): void {
    if (this.state === 'play' || this.state === 'login') {
      this.out = [[SB.Disconnect, `Bad data from the host: ${why}`.slice(0, 256)]];
      this.flush();
    }
    this.lost(`Bad data from the host: ${why}`);
  }

  /** the connection's over, not by our choice */
  private lost(reason: string): void {
    if (this.state === 'closed') return;
    this.state = 'closed';
    this.endReason = reason;
    this.transport.close();
    this.hooks.disconnected(reason);
  }
}

function slotStack(p: Player, slot: number): ItemStack | null {
  const inv = p.inventory;
  return slot < SLOT_ARMOR ? inv.main[slot] : slot < SLOT_OFFHAND ? inv.armor[slot - SLOT_ARMOR] : inv.offhand;
}

/** a mirror's hands and armour (CB.SetEquipment's slots) */
function setEquipment(m: Player, slot: number, s: ItemStack | null): void {
  const inv = m.inventory;
  if (slot === 0) inv.main[inv.selected] = s;
  else if (slot === 1) inv.offhand = s;
  else inv.armor[slot - 2] = s;
}

/** a copy the host no longer shows: gone, off what it rode, its riders off it (where they are, till the host says) */
function dropCopy(e: Entity): void {
  e.removed = true;
  for (const r of [...e.passengers]) r.removeVehicle();
  e.removeVehicle();
}
