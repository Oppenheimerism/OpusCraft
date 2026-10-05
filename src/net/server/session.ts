// One guest on the host (vanilla ServerPlayer with its ServerGamePacketListenerImpl and ChunkMap's view of it): its
// player, a real Player in the host's level that the guest moves; the clicks it sends, done by an Interaction of its
// own as the host does its own player's; the chunks it has been sent; and everything it's told, a tick at a time.

import type { Value } from '../codec';
import { decode, encodeBundle, CodecError } from '../codec';
import { SB, CB, Action, PoseFlag, CLICK_TYPES, checkPacket, packetFault, isAllowedChat, SLOT_ARMOR, SLOT_OFFHAND, SLOT_COUNT, ANIMATE_SWING_MAIN_HAND, ANIMATE_SWING_OFF_HAND, type LoginInfo, type ReceivingReason } from '../protocol';
import { PROTOCOL_VERSION, BUILD_ID, MAX_GUEST_MESSAGE, MAX_GUEST_PACKETS, MESSAGES_PER_TICK, MAX_GUEST_BACKLOG, MAX_GUEST_BACKLOG_BYTES, MAX_LOGIN_BACKLOG, MAX_GUESTS, LOGIN_TICKS, KEEPALIVE_TICKS, TIMEOUT_TICKS, GUEST_VIEW_DISTANCE, CHUNKS_PER_TICK, MAX_MOVE_PER_TICK, MOVES_KEPT_PER_TICK, RESYNC_MIN_TICKS, CHAT_SPAM_STEP, CHAT_SPAM_LIMIT, NAME_PATTERN, DROP_SPAM_STEP, DROP_SPAM_LIMIT, ENTITY_REACH_SLACK, MAX_MOTION, RESPAWN_BED_WAIT_TICKS } from '../config';
import type { PeerId } from '../transport/transport';
import { creativeItem, itemToWire } from '../items';
import { applyPoseFlags, equipment, poseFlags, stackKey } from '../playerState';
import { playerStatus, effectList, effectsChanged, effectsSent } from '../playerStatus';
import { claimMatches } from '../menus';
import { ServerMenus } from './menuSync';
import { levelChunkPacket, inView } from '../chunkData';
import { offlinePlayerUuid } from '../offlineUuid';
import type { HostServer } from './hostServer';
import { EntityTracker } from './entityTracker';
import { GuestProgress } from './guestProgress';
import { BossBarSync } from './bossBarSync';
import type { Entity } from '../../entity/entity';
import { Player } from '../../entity/player';
import { Interaction } from '../../game/interaction';
import { deathMessage, dropDeathLoot, resetForRespawn, playerHurtSound, playerFallSound } from '../../game/playerDeath';
import { useBed, findRespawn, MSG, type SleepHost } from '../../game/sleep';
import { areaComplete } from '../../game/respawnLogic';
import { writeBook } from '../../game/books';
import { PlayerRecipeBook } from '../../inventory/recipeBook';
import { savePlayer, loadPlayer, type SavedPlayer } from '../../game/playerData';
import { carriesOnePlayer, loadEntity } from '../../game/spawner';
import { entityContainerMenu } from '../../game/openMenu';
import { ChestBoat } from '../../entity/boat';
import { AbstractHorse } from '../../entity/horse';
import { raycast } from '../../game/raycast';
import { Chunk } from '../../world/chunk';
import type { ItemStack } from '../../item/item';
import type { Hand } from '../../item/inventory';
import type { ContainerMenu } from '../../inventory/container';
import type { Level } from '../../game/level';
import { MerchantMenu } from '../../inventory/merchantMenu';
// (signs)
import { updateSignText } from '../../game/signs';

/** a player another guest (or the host's player) sees, as last sent */
interface Seen {
  move: string;
  equip: string[];
  swinging: boolean;
  swingTime: number;
}

/** a move the guest said it made, checked, waiting for its player's tick (Player.remoteMove) */
interface Move {
  x: number;
  y: number;
  z: number;
  yRot: number;
  xRot: number;
  flags: number;
}

/** (MovePlayer's target) no entity under the crosshair */
const NO_TARGET = -1;

/** the kinds of packet that couldn't be sent to a guest, told once each (a bug in whatever built them) */
const unsentIds = new Set<Value>();
function unsent(p: Value, e: CodecError): void {
  const id = Array.isArray(p) ? p[0] : null;
  if (unsentIds.has(id)) return;
  unsentIds.add(id);
  console.error(`multiplayer: a packet (${String(id)}) left out of a message to a guest`, e);
}

export class ServerPlayerSession {
  state: 'login' | 'play' | 'gone' = 'login';
  name = '';
  uuid = '';
  player: Player | null = null;
  interaction: Interaction | null = null;
  /** its menus: the inventory's, and whatever a block or an entity opened for it */
  menus: ServerMenus | null = null;
  /** messages as they came, handled at the start of the host's next ticks */
  private readonly inbox: Uint8Array[] = [];
  private inboxBytes = 0;
  /** (deliver) why it's to be let go at the next tick, if it is */
  private refused: string | null = null;
  /** what goes out at the end of this tick, as one message */
  private out: Value[] = [];
  private ticks = 0;
  private lastHeard = 0;
  private chatSpam = 0;
  /** when the chat spam count was last let down (performance.now()) */
  private lastDecay = performance.now();
  private keepAliveId = 0;
  viewDistance = GUEST_VIEW_DISTANCE;
  /** where the guest last said it was (and was believed): where its chunks are sent round */
  private pos = { x: 0, y: 0, z: 0 };
  /** where its player was last put, by a move of its own or a teleport: anywhere else, and the host has moved it since */
  private placed = { x: 0, y: 0, z: 0 };
  /** the moves come in since its player's last tick, to be taken in turn in the next (MOVES_KEPT_PER_TICK at most) */
  private moves: Move[] = [];
  private teleportId = 0;
  private awaitingTeleport: number | null = null;
  private attackPressed = false;
  private usePressed = false;
  private attackHeld = false;
  private useHeld = false;
  /** the entity under the guest's crosshair, as it said (its id; checked when the host clicks for it) */
  private target = NO_TARGET;
  /** the drop key's presses this tick (vanilla ServerboundPlayerActionPacket DROP_ITEM / DROP_ALL_ITEMS) */
  private drops: boolean[] = [];
  /** vanilla dropSpamThrottler: what a creative guest throws out of its inventory */
  private dropSpam = 0;
  /** what its player rode at the end of the last tick (getting off, it's put where the host has it) */
  private riding: Entity | null = null;
  /** its experience as the guest was last told */
  private xp = '';
  /** its health, food, air and the rest as the guest was last told (PlayerStatus) */
  private status = '';
  /** its effects as the guest was last told, and when (UpdateEffects) */
  private fxSent = new Map<string, [number, number, number, string]>();
  /** the bed it's asleep in as the guest was last told ('' awake) */
  private sleeping = '';
  /** its game mode as the guest has it */
  private gameMode = '';
  /** the hotbar slot the guest has in hand */
  private selected = 0;
  /** the item it's using as the guest was last told: its hand, how long the use lasts, and when it began ('' none) */
  private using = '';
  /** its items' cooldowns as the guest was last told: ticks left, and when */
  private readonly cooldowns = new Map<string, [number, number]>();
  /** how fast it was going sideways by the last move (a glide into a wall hurts by the speed it loses) */
  private lastSpeed = 0;
  /** the entities other than players it sees (vanilla ChunkMap.TrackedEntity) */
  readonly tracker = new EntityTracker(this);
  /** chunks the guest has, by Chunk.key (vanilla ChunkTrackingView) */
  readonly sent = new Set<number>();
  /** block changes in its chunks this tick: x, y, z, state */
  private blockUpdates: number[] = [];
  /** what each block entity in its chunks looked like when last sent, by key */
  readonly blockEntities = new Map<string, string>();
  /** the players it sees */
  private readonly seen = new Map<Player, Seen>();
  /** its own crack in a block, as last put in the level */
  private crack = '';
  /** its own player's swing, as last seen */
  private swing = { swinging: false, swingTime: 0 };
  /** what its inventory held, slot by slot, as the guest last had it */
  private readonly slots: string[] = new Array(SLOT_COUNT).fill('');
  private invVersion = -1;
  /**
   * its recipe book (vanilla ServerRecipeBook): the recipes it has unlocked, from what it has held (vanilla's recipe
   * advancements), told to the guest as they come; the recipe book's clicks count only for these
   */
  readonly recipes = new PlayerRecipeBook();
  /** (guests' advancements) its advancements (vanilla ServerPlayer.getAdvancements): met here, kept with its player, told to it */
  readonly progress = new GuestProgress(this);
  /** (guests' boss bars) the boss bars it's shown, as it was last told them */
  private readonly bossBars = new BossBarSync();
  /** when each plain message was last shown (so a held button doesn't repeat it every few ticks) */
  private readonly notices = new Map<string, number>();
  /** (logging in) its player as the world last kept it, being read: the guest is let in once it's here */
  private reading: { done: boolean; failed: boolean; data: SavedPlayer | null } | null = null;
  /** on its way to the host's next dimension with it: out of the level, shown nothing, its moves not taken (leaveDimension) */
  travelling = false;
  /** (travelling) the dimension it left, where it still is till it's put in the next */
  private travelFrom = '';
  /** (respawning at a bed whose chunks aren't in) ticks left to wait for them, and whether they've been asked for */
  private respawnWait = 0;
  private respawnTicket = false;
  /**
   * (the End Poem) vanilla ServerPlayer.wonGame: taken out of the End by the host's exit portal, it's watching the End
   * Poem and the credits, out of the world (travelling) till it says they're over (creditsOver); then `afterCredits`
   * till it's home (vanilla PlayerList.respawn(player, true): at its bed or by the world spawn, keeping everything)
   */
  private wonGame = false;
  private afterCredits = false;
  /** (stage 5) when it last asked for the world again from its loading screen (resync), in its ticks */
  private lastResync = -Infinity;

  constructor(readonly server: HostServer, readonly peer: PeerId) {}

  get level() {
    return this.server.level;
  }

  /** (the state can change under a handler: a packet may drop the guest) */
  private get isGone(): boolean {
    return this.state === 'gone';
  }

  /** it said who it is and was let in, its player still being read: a seat, and its name and uuid, are taken */
  get loggingIn(): boolean {
    return this.reading !== null && this.state === 'login';
  }

  /**
   * (the End Poem) out of the world on its way home for a reason of its own, not left behind: its End Poem playing, or,
   * once it's over, its bed's chunks coming in
   */
  get held(): boolean {
    return this.travelling && (this.wonGame || this.respawnWait > 0);
  }

  // -------------------------------------------------------------------------
  // in

  /**
   * (the transport, as it comes) a message, kept for the next tick: one too big, or more waiting than a guest would
   * send, and the guest is let go then (nothing more of it is kept meanwhile)
   */
  deliver(data: Uint8Array): void {
    if (this.state === 'gone' || this.refused) return;
    if (data.length > MAX_GUEST_MESSAGE) {
      this.refused = 'Bad data: a message too big';
      return;
    }
    const most = this.state === 'login' ? MAX_LOGIN_BACKLOG : MAX_GUEST_BACKLOG;
    if (this.inbox.length >= most || this.inboxBytes + data.length > MAX_GUEST_BACKLOG_BYTES) {
      this.refused = 'Sending too much, too fast';
      this.inbox.length = 0;
      this.inboxBytes = 0;
      return;
    }
    this.inbox.push(data);
    this.inboxBytes += data.length;
  }

  /** handle what came since the last tick, a tick's worth at most (vanilla Connection.tick → the packet listener) */
  receive(): void {
    this.ticks++;
    this.decaySpam();
    if (this.refused) return this.disconnect(this.refused);
    // (its player being read: what it says waits till it's in)
    const job = this.reading;
    if (job) {
      if (!job.done) return;
      this.reading = null;
      if (job.failed) return this.disconnect("Couldn't read your player from this world's save.");
      this.placeNewPlayer(job.data);
      if (this.isGone) return;
    }
    this.drain((p) => this.handle(p));
  }

  /**
   * (HostServer.idleTick: the host on a loading screen, its level still) on its way to the host's next dimension with it:
   * what needs no world is heard (chat, keep-alives, the hotbar, leaving) and the rest let go, being for the dimension it
   * left; kept alive both ways, the End Poem's minutes included. Otherwise (the host waiting where it is, on a far bed's
   * chunks) what it says waits for the level, its time not counted, as it always has; so does one still saying who it is
   */
  idleTick(): void {
    if (this.state !== 'play' || !this.travelling) return;
    this.ticks++;
    this.decaySpam();
    if (this.refused) return this.disconnect(this.refused);
    this.drain((p) => this.handleIdle(p));
    if (this.isGone) return;
    if (this.ticks - this.lastHeard > TIMEOUT_TICKS) return this.disconnect('Timed out');
    if (this.ticks % KEEPALIVE_TICKS === 0) this.send([CB.KeepAlive, ++this.keepAliveId]);
    this.sendOut();
  }

  /** (vanilla's chat spam count goes down a tick at a time; here by the real time too, if more: a host whose window is hidden ticks slowly, its guests don't) */
  private decaySpam(): void {
    const now = performance.now();
    this.chatSpam = Math.max(0, this.chatSpam - Math.max(1, (now - this.lastDecay) / 50));
    this.lastDecay = now;
  }

  /** a tick's worth of what came, each packet checked, then `handle`d; anything wrong drops the guest */
  private drain(handle: (p: Value[]) => void): void {
    const inbox = this.inbox.splice(0, MESSAGES_PER_TICK);
    for (const data of inbox) {
      if (this.isGone) return;
      this.inboxBytes -= data.length;
      let msg: Value;
      try {
        msg = decode(data, MAX_GUEST_MESSAGE);
      } catch (e) {
        return this.disconnect(e instanceof CodecError ? `Bad data: ${e.message}` : 'Bad data');
      }
      if (!Array.isArray(msg) || msg.length > MAX_GUEST_PACKETS) return this.disconnect('Bad data: not a message');
      this.lastHeard = this.ticks;
      for (const p of msg) {
        const bad = checkPacket(p, 'guest');
        if (bad) return this.disconnect(`Bad data: ${bad}`);
        try {
          handle(p as Value[]);
        } catch (e) {
          console.error('multiplayer: handling a guest packet', e);
          // (what went wrong and with what, on the guest's Disconnected screen, where it can be read and passed on)
          return this.disconnect(`Something went wrong with what you sent (${packetFault(SB, (p as Value[])[0], e)})`);
        }
        if (this.isGone) return;
      }
    }
  }

  private handle(p: Value[]): void {
    const id = p[0] as number;
    if (this.state === 'login') {
      if (id !== SB.Hello) return this.disconnect('Say hello first');
      // (another version's hello is looked at no further than its version)
      if (p[1] !== PROTOCOL_VERSION) return this.disconnect((p[1] as number) < PROTOCOL_VERSION ? 'Outdated game! This world is open in a newer one.' : 'Outdated host! This world is open in an older one.');
      return this.hello(p[2] as string, p[3] as string, (p[4] as string).toLowerCase(), p[5] as number, p[6] as string);
    }
    const pl = this.player!;
    switch (id) {
      case SB.Hello:
        return this.disconnect('Already here');
      case SB.KeepAlive:
        return;
      case SB.MovePlayer:
        this.target = p[7] as number;
        return this.moved({ x: p[1] as number, y: p[2] as number, z: p[3] as number, yRot: p[4] as number, xRot: p[5] as number, flags: p[6] as number });
      case SB.AcceptTeleportation:
        if (p[1] === this.awaitingTeleport) this.awaitingTeleport = null;
        return;
      case SB.PlayerAction:
        if (p[1] === Action.ATTACK) this.attackPressed = true;
        else if (p[1] === Action.USE) this.usePressed = true;
        // (a tick's worth: a guest's drop key repeats no faster than a player's would)
        else if ((p[1] === Action.DROP || p[1] === Action.DROP_ALL) && this.drops.length < 4) this.drops.push(p[1] === Action.DROP_ALL);
        else if (p[1] === Action.RIDING_JUMP) this.ridingJump(p[2] as number);
        // (vanilla SWAP_ITEM_WITH_OFFHAND: the host swaps, and tells the guest what its hands have)
        else if (p[1] === Action.SWAP_HANDS) {
          if (pl.health > 0 && !pl.isSleeping()) this.interaction!.swapHands();
        }
        // (vanilla handlePlayerCommand STOP_SLEEPING: Leave Bed)
        else if (p[1] === Action.STOP_SLEEPING && pl.isSleeping()) pl.stopSleepInBed(false);
        // (vanilla handlePlayerCommand OPEN_INVENTORY: what it rides has an inventory of its own)
        else if (p[1] === Action.OPEN_INVENTORY && pl.health > 0) this.openVehicleInventory();
        return;
      case SB.SetCarriedItem:
        pl.inventory.selected = this.selected = p[1] as number;
        pl.inventory.version++;
        return;
      case SB.SetCreativeModeSlot:
        return this.creativeSlot(p[1] as number, p[2] as Value);
      case SB.Chat:
        return this.chat(p[1] as string);
      case SB.ChatCommand:
        // (vanilla handleChatCommand: counted as chat is; and commands need permission, which a guest hasn't here yet)
        if (this.spammed()) return;
        return this.systemChat('§cOnly the host can use commands.');
      case SB.Disconnect:
        return this.gone('left');
      case SB.ClientCommand:
        return this.wonGame ? this.creditsOver() : this.respawn();
      case SB.PickItem:
        return this.pickSlot(p[1] as number);
      case SB.ContainerClick:
        return this.menus!.click(p[1] as number, p[2] as number, p[3] as number, p[4] as number, CLICK_TYPES[p[5] as number], p[6] as [number, number][], p[7] as number);
      case SB.ContainerButtonClick:
        return this.menus!.button(p[1] as number, p[2] as number);
      case SB.ContainerClose:
        return this.menus!.guestClosed(p[1] as number);
      case SB.RenameItem:
        return this.menus!.rename(p[1] as string);
      case SB.SelectTrade:
        return this.menus!.selectTrade(p[1] as number);
      case SB.SlotStateChanged:
        return this.menus!.slotState(p[1] as number, p[2] as number, p[3] as boolean);
      case SB.PlaceRecipe:
        return this.menus!.placeRecipe(p[1] as number, p[2] as string, p[3] as boolean);
      case SB.EditBook:
        return this.editBook(p[1] as number, p[2] as string[], p[3] as string | null);
      case SB.Resync:
        return this.resync(p[1] as number[], p[2] as number, p[3] as boolean);
      case SB.SignUpdate:
        // (signs) vanilla handleSignUpdate: checked there (who may edit it, how near, not waxed, what the lines hold)
        updateSignText(this.level, pl, p[1] as number, p[2] as number, p[3] as number, p[4] as boolean, p.slice(5, 9) as string[]);
        return;
    }
  }

  /** (idleTick) what's heard while the level stands still; the rest is for a world the guest isn't in (yet) */
  private handleIdle(p: Value[]): void {
    switch (p[0] as number) {
      case SB.Hello:
        return this.disconnect('Already here');
      case SB.AcceptTeleportation:
        if (p[1] === this.awaitingTeleport) this.awaitingTeleport = null;
        return;
      case SB.SetCarriedItem:
        this.player!.inventory.selected = this.selected = p[1] as number;
        this.player!.inventory.version++;
        return;
      case SB.Chat:
        return this.chat(p[1] as string);
      case SB.ChatCommand:
        if (this.spammed()) return;
        return this.systemChat('§cOnly the host can use commands.');
      case SB.Disconnect:
        return this.gone('left');
      case SB.Resync:
        // (on its way with the host, which isn't there itself yet: it's put in when the host is, as ever)
        return this.resync(p[1] as number[], p[2] as number, p[3] as boolean);
      case SB.ClientCommand:
        // (its End Poem over before the host is home: it comes in with the host)
        if (this.wonGame) this.creditsOver();
        return;
    }
  }

  /**
   * (stage 5) the guest is still on its loading screen a while after it should have come in (ClientSession.checkLoading),
   * and says which of the chunks it waits for haven't come. Taken along to another dimension and never put in, though
   * the host is there: it's put in now. Otherwise it's put where its player is again, and every chunk in its view is sent
   * again, the nearest first (what it waits for having gone missing, so may others). What the host has of it goes to the
   * console, with what the guest said, to find out why if it happens again. One every RESYNC_MIN_TICKS at most: the rest
   * are let be
   */
  private resync(missing: number[], waited: number, placed: boolean): void {
    if (this.ticks - this.lastResync < RESYNC_MIN_TICKS) return;
    this.lastResync = this.ticks;
    const p = this.player!, world = this.level.world;
    const chunks: string[] = [];
    for (let i = 0; i + 1 < missing.length; i += 2) {
      const key = Chunk.key(missing[i], missing[i + 1]), c = world.chunks.get(key);
      chunks.push(`${missing[i]},${missing[i + 1]}: ${this.sent.has(key) ? 'sent' : 'not sent'}, ${!c ? 'not loaded here' : c.lightMerged ? 'loaded here' : 'being lit here'}`);
    }
    const hostThere = !this.server.travelling;
    console.warn(`multiplayer: ${p.profileName ?? 'a guest'} is still on its loading screen after ${(waited / 20).toFixed(1)} s, and asks for the world again`, {
      guestSays: { placed, missing: chunks },
      host: { dimension: world.dim.id, onItsWay: !hostThere, ticks: this.ticks },
      guest: {
        travelling: this.travelling,
        travelFrom: this.travelling ? this.travelFrom : null,
        at: [p.x, p.y, p.z].map((v) => Math.round(v * 100) / 100),
        pos: [this.pos.x, this.pos.y, this.pos.z].map((v) => Math.round(v * 100) / 100),
        awaitingTeleport: this.awaitingTeleport,
        viewDistance: this.viewDistance,
        chunksSent: this.sent.size,
        state: this.state,
      },
    });
    if (this.travelling) {
      // (its End Poem over as far as it knows, though what said so never came: it asks from its loading screen)
      if (this.wonGame) return this.creditsOver();
      // (forgotten on the way: the host has been there a while)
      if (hostThere) this.arrive();
      return;
    }
    // (put where its player is again: a teleport it takes, the chunks round there sent afresh, and their block entities)
    this.teleport(p.x, p.y, p.z, p.yaw, p.pitch);
    this.sent.clear();
    this.blockEntities.clear();
  }

  /**
   * vanilla ServerLoginPacketListenerImpl: who it is, checked; then its player as the world last kept it is read (vanilla
   * PlayerList.load), and it's let in at the first tick after (placeNewPlayer)
   */
  private hello(build: string, name: string, uuid: string, viewDistance: number, code: string): void {
    if (build !== BUILD_ID) return this.disconnect('This world is open in a different version of the game. Reload both windows so they run the same one.');
    const srv = this.server;
    // (the join code, before anything is said of who's here: net/joinCode.ts, where it's given from waiting after too many wrong ones)
    const verdict = srv.checkJoinCode(this.peer, code);
    if (verdict === 'wrong') return this.disconnect("That join code isn't right. Ask the host for the one on their screen.");
    if (verdict !== 'ok') return this.disconnect(`Too many wrong join codes from here: try again in ${Math.max(1, Math.ceil(verdict / 20))} seconds.`);
    if (!NAME_PATTERN.test(name)) return this.disconnect('That name can only have letters, digits and _ (3 to 16 of them).');
    // (vanilla offline mode: a player is its name, its uuid made from the name, the host's to work out; a guest giving
    // another's, which would be another's player kept with the world, is refused)
    if (uuid !== offlinePlayerUuid(name)) return this.disconnect("Bad data: that uuid isn't the name's");
    // (the guests in, and those let in whose players are still being read)
    const others = [...srv.sessions.values()].filter((s) => s !== this && (s.state === 'play' || s.loggingIn));
    if (others.length >= MAX_GUESTS) return this.disconnect('The world is full.');
    const taken = (n: string) => n.toLowerCase() === name.toLowerCase();
    if (taken(srv.hooks.hostName()) || others.some((s) => taken(s.name))) return this.disconnect(`Someone called ${name} is already playing here.`);
    if (srv.level.playerByUuid(uuid) || [...srv.sessions.values()].some((s) => s !== this && s.uuid === uuid)) return this.disconnect('You are already in this world (in another window?).');
    this.name = name;
    this.uuid = uuid;
    this.viewDistance = Math.min(GUEST_VIEW_DISTANCE, viewDistance);
    const load = srv.hooks.loadGuest;
    if (!load) return this.placeNewPlayer(null);
    const job: { done: boolean; failed: boolean; data: SavedPlayer | null } = { done: false, failed: false, data: null };
    this.reading = job;
    void Promise.resolve()
      .then(() => load(uuid))
      .then(
        (d) => {
          job.data = d;
          job.done = true;
        },
        (e) => {
          console.error(`multiplayer: reading ${name}'s player`, e);
          job.failed = job.done = true;
        },
      );
  }

  /**
   * vanilla PlayerList.placeNewPlayer: its player in the level, as `pd` kept it if it's been here before (where it was,
   * what it had, what it rode alone; dead if it left dead), else new by the world spawn; and the guest let in. In
   * whatever game mode the world is open in, as vanilla's LAN world has everyone (IntegratedServer.getForcedGameType).
   * A player kept in another dimension than the host's comes in by the host, what it rode left where it was
   */
  private placeNewPlayer(pd: SavedPlayer | null): void {
    const srv = this.server, level = srv.level;
    const p = new GuestPlayer(level, this);
    if (pd) loadPlayer(p, pd);
    p.uuid = this.uuid;
    p.remote = true;
    p.profileName = this.name;
    p.setGameMode(srv.guestGameMode);
    this.gameMode = p.gameMode;
    p.food.difficulty = level.difficulty;
    p.food.naturalRegen = !!level.gameRules.naturalRegeneration;
    // (vanilla ServerPlayer: its hurts and its death are heard by everyone near, itself too; a landing's by the others,
    // its own game having played it)
    p.onHurtSound = (pl, src) => srv.heardByAll(() => playerHurtSound(level.sound, pl, src));
    p.onFall = (pl, _dmg, dist) => playerFallSound(level.sound, pl, dist);
    p.onDeath = (_pl, src) => this.died(src);
    this.progress.hookPlayer(p);
    const here = !!pd && (pd.dimension ?? 'overworld') === level.world.dim.id;
    const dead = !!pd && (!!pd.dead || pd.health <= 0);
    if (!here) {
      const [x, y, z] = srv.hooks.spawnPoint();
      p.moveTo(x, y, z, 0, 0);
    }
    // (it left dead: dead it comes back, on its death screen, respawning as ever)
    if (dead) {
      p.health = 0;
      p.dead = true;
    }
    p.remoteMove = () => this.applyMove();
    level.addEntity(p);
    this.player = p;
    this.pos = { x: p.x, y: p.y, z: p.z };
    this.placed = { x: p.x, y: p.y, z: p.z };
    // vanilla RootVehicle: back on what it rode alone as it left
    if (pd?.vehicle && !dead) {
      if (!here) srv.hooks.leaveInDimension?.(pd.dimension ?? 'overworld', pd.vehicle);
      else {
        const v = loadEntity(pd.vehicle, level);
        if (v) {
          level.addEntity(v);
          p.startRiding(v, true);
        }
      }
    }
    this.recipes.load(pd?.recipeBook);
    this.progress.load(pd?.advancements);
    const it = (this.interaction = srv.guestInteraction(this, p));
    this.progress.hookInteraction(it);
    // (what doesn't fit in its inventory, or it throws out, lands in the world: vanilla Player.drop)
    p.dropHandler = (s) => it.throwItem(s);
    this.menus = new ServerMenus({
      player: p,
      slots: this.slots,
      send: (pk) => this.send(pk),
      resendSlot: (i) => {
        this.slots[i] = '\u0000';
        this.invVersion = -1;
      },
      knowsRecipe: (id) => this.recipes.known.has(id),
    });
    // (vanilla ServerRecipeBook.sendInitialRecipeBook, then ClientboundRecipeBookAddPacket as more are unlocked)
    this.recipes.onUnlock = (rs) => this.send([CB.RecipeBookAdd, rs.map((r) => r.id), false]);
    this.state = 'play';
    this.lastHeard = this.ticks;
    const info: LoginInfo = {
      playerId: p.id,
      worldName: srv.hooks.worldName(),
      dimension: level.world.dim.id,
      gameMode: p.gameMode,
      difficulty: level.difficulty,
      hardcore: false,
      gameRules: { ...level.gameRules },
      gameTime: level.gameTime,
      dayTime: level.dayTime,
      raining: level.raining,
      thundering: level.thundering,
      rainLevel: level.rain,
      thunderLevel: level.thunder,
      x: p.x, y: p.y, z: p.z, yRot: p.yaw, xRot: p.pitch,
      flying: p.flying,
      viewDistance: this.viewDistance,
      hostName: srv.hooks.hostName(),
    };
    this.send([CB.Login, info as unknown as Value]);
    this.send(srv.weatherPacket());
    if (this.recipes.known.size) this.send([CB.RecipeBookAdd, [...this.recipes.known], true]);
    // (vanilla: a player that comes in dead is shown the death screen, with nothing on it of how it died)
    if (dead) this.send([CB.PlayerCombatKill, '']);
    srv.joined(this);
  }

  /** vanilla handleMovePlayer: believed if it's not too far from the last, else the guest is put back */
  private moved(m: Move): void {
    const p = this.player!;
    // (vanilla: the dead and the sleeping stay put; a sleeper looks about)
    if (p.health <= 0 || p.isSleeping()) {
      this.attackHeld = this.useHeld = false;
      this.steer(0);
      if (p.isSleeping()) {
        p.yaw = p.headYaw = m.yRot;
        p.pitch = m.xRot;
      }
      return;
    }
    this.attackHeld = !!(m.flags & PoseFlag.ATTACK_HELD);
    this.useHeld = !!(m.flags & PoseFlag.USE_HELD);
    this.steer(m.flags);
    // (vanilla: moves before the guest has taken a teleport are the old place's, and don't count)
    if (this.awaitingTeleport !== null) return;
    if (p.vehicle) {
      // (vanilla: a rider goes where what it rides takes it; the guest has a say only in where it looks, which the
      // mount goes by before the rider's tick)
      p.yaw = p.headYaw = m.yRot;
      p.pitch = m.xRot;
      this.keepMove(m);
      return;
    }
    const d2 = (m.x - this.pos.x) ** 2 + (m.y - this.pos.y) ** 2 + (m.z - this.pos.z) ** 2;
    if (d2 > MAX_MOVE_PER_TICK * MAX_MOVE_PER_TICK) {
      // (vanilla "moved too quickly!")
      this.teleport(this.pos.x, this.pos.y, this.pos.z, m.yRot, m.xRot);
      return;
    }
    // (below the world, the void has it as it would the host's player: Entity.checkBelowWorld on the host)
    this.pos = { x: m.x, y: m.y, z: m.z };
    this.keepMove(m);
  }

  /**
   * a move, for its player's next tick. A guest's moves come a tick apart, but a network can hold some back and let them
   * through together: each is taken in turn (vanilla handles each move packet as it comes), so a landing between two
   * hops is still a landing, and a fall adds up only while it falls. Past MOVES_KEPT_PER_TICK, the latest stands in for
   * the ones after the last kept
   */
  private keepMove(m: Move): void {
    if (this.moves.length < MOVES_KEPT_PER_TICK) this.moves.push(m);
    else this.moves[this.moves.length - 1] = m;
  }

  /**
   * vanilla handlePlayerInput: the movement keys the guest holds, as its player's own (what steers a mount or a boat,
   * vanilla Player.rideTick and the mounts' getRiddenInput; the sneak key gets it off)
   */
  private steer(f: number): void {
    const p = this.player!, i = p.input;
    i.forward = !!(f & PoseFlag.FORWARD);
    i.back = !!(f & PoseFlag.BACK);
    i.left = !!(f & PoseFlag.LEFT);
    i.right = !!(f & PoseFlag.RIGHT);
    i.jump = !!(f & PoseFlag.JUMP);
    i.sneak = !!(f & PoseFlag.SHIFT);
    // (vanilla LivingEntity.aiStep's xxa and zza, as the guest's own tick makes them)
    p.xxa = ((i.left ? 1 : 0) - (i.right ? 1 : 0)) * 0.98;
    p.zza = ((i.forward ? 1 : 0) - (i.back ? 1 : 0)) * 0.98;
  }

  /**
   * (Player.remoteMove, in its tick) where the guest said it went, if it said, and then, moved or not, what it's in:
   * pressure plates, tripwires, portals (vanilla checkInsideBlocks, which a player's travel does every tick, standing
   * still too). What the blocks do about it, a plate's click, is the world's doing, not the player's own: the guest hears
   * it too. (A guest's moves don't reach the host one a tick, its game's ticks not the host's: one standing still in a
   * nether portal is in it every tick all the same, its time there adding up as the host's own player's does)
   */
  private applyMove(): void {
    const p = this.player;
    if (!p) return;
    this.takeMove(p);
    if (p.health > 0 && !p.vehicle && !p.isSleeping()) this.server.heardByAll(() => p.checkInsideBlocks());
  }

  /** the guest's moves come in since its player's last tick, each in turn (takeOneMove), if any did */
  private takeMove(p: Player): void {
    if (!this.moves.length) return;
    const moves = this.moves;
    this.moves = [];
    for (const m of moves) if (!this.takeOneMove(p, m)) return;
  }

  /**
   * one of the guest's moves: where it went, with the look and pose it said, and what that did: a fall's damage when it
   * lands, the hunger a jump costs, a glide into a wall (vanilla handleMovePlayer and ServerPlayer.doCheckFallDamage).
   * False if the moves after it don't count either (its player dead, asleep, or put elsewhere by the host)
   */
  private takeOneMove(p: Player, m: Move): boolean {
    if (p.health <= 0 || p.isSleeping()) return false;
    if (p.vehicle) {
      // (riding: its look and pose; where it is is its seat)
      applyPoseFlags(p, m.flags);
      p.yaw = p.headYaw = m.yRot;
      p.pitch = m.xRot;
      this.lastSpeed = 0;
      return true;
    }
    // (put somewhere else by the host since, earlier this tick: an ender pearl landing, an end gateway letting it out,
    // a piston. The move is from before that, and the guest is told where it is instead: placedByHost's teleport)
    if (moved(p, this.placed)) return false;
    const dx = m.x - p.x, dy = m.y - p.y, dz = m.z - p.z;
    // (knocked or blown about this tick, before its move came in: that motion stands, for the guest to be told)
    if (!p.hurtMarked) {
      p.dx = dx;
      p.dy = dy;
      p.dz = dz;
    }
    const wasOnGround = p.onGround, wasGliding = p.fallFlying;
    applyPoseFlags(p, m.flags);
    p.setPos(m.x, m.y, m.z);
    this.placed = { x: p.x, y: p.y, z: p.z };
    p.yaw = m.yRot;
    p.pitch = m.xRot;
    p.headYaw = m.yRot;
    // (vanilla handleMovePlayer: off the ground going up is a jump, and costs what the host's own jumps do)
    if (wasOnGround && !p.onGround && dy > 0) p.food.addExhaustion(p.sprinting ? 0.2 : 0.05);
    // (what the guest's own travel does to its fall, which the host's copy doesn't run: a ladder or vine held, a slow
    // glide; flying, and slow falling or levitation, keep it at nothing, as the player's tick does too)
    if (p.onClimbable()) p.fallDistance = 0;
    if (p.fallFlying && dy > -0.5 && p.fallDistance > 1) p.fallDistance = 1;
    // (vanilla handleFallFlyingCollisions, from the speed it had before and after the wall the guest says it hit)
    const speed = Math.sqrt(dx * dx + dz * dz);
    if (wasGliding && p.fallFlying && m.flags & PoseFlag.HORIZONTAL_COLLISION) {
      const o = Math.fround((this.lastSpeed - speed) * 10 - 3);
      if (o > 0) {
        this.level.sound.play(`entity.player.${Math.trunc(o) > 4 ? 'big' : 'small'}_fall`, p.x, p.y, p.z, 1, 1);
        p.hurt(o, 'flyIntoWall');
      }
    }
    this.lastSpeed = speed;
    if (p.health <= 0) return false;
    // (vanilla ServerPlayer.doCheckFallDamage)
    p.doCheckFallDamage(dy, p.onGround);
    // (vanilla ServerPlayer.move: a turtle egg or a sculk shrieker underfoot hears it; the world's doing, heard by all)
    if (p.onGround && p.health > 0) this.server.heardByAll(() => p.stepOnFloor());
    if (p.flying || p.hasEffect('slow_falling') || p.hasEffect('levitation')) p.fallDistance = 0;
    return true;
  }

  /** vanilla ServerGamePacketListenerImpl.teleport: the guest's player goes there, and the host waits to hear it did */
  teleport(x: number, y: number, z: number, yRot: number, xRot: number): void {
    const p = this.player;
    if (!p) return;
    this.teleportId = (this.teleportId + 1) & 0x7fffffff;
    this.awaitingTeleport = this.teleportId;
    this.pos = { x, y, z };
    this.moves = [];
    this.lastSpeed = 0;
    p.moveTo(x, y, z, yRot, xRot);
    this.placed = { x: p.x, y: p.y, z: p.z };
    this.send([CB.PlayerPosition, x, y, z, yRot, xRot, this.teleportId]);
  }

  /**
   * vanilla ServerPlayer.teleportTo, by a command: out of bed and off what it rides, its fall and its speed gone, and
   * the guest told where it is (the chunks round there follow, as they do wherever it goes)
   */
  teleportTo(x: number, y: number, z: number, yRot: number, xRot: number): void {
    const p = this.player;
    if (!p || p.removed || p.health <= 0) return;
    if (p.isSleeping()) p.stopSleepInBed(true);
    p.removeVehicle();
    p.dx = p.dy = p.dz = 0;
    p.fallDistance = 0;
    this.teleport(x, y, z, yRot, xRot);
  }

  /** vanilla handleSetCreativeModeSlot: a real item, rebuilt from the host's creative list */
  private creativeSlot(slot: number, v: Value): void {
    const p = this.player!;
    if (p.gameMode !== 'creative') return;
    const s = creativeItem(v);
    if (s === 'bad') return this.disconnect('Invalid creative inventory action');
    if (slot < 0) {
      // (vanilla: slot -1 throws the item out, as many as a creative player likes, but not too many too fast)
      if (s && this.dropSpam < DROP_SPAM_LIMIT) {
        this.dropSpam += DROP_SPAM_STEP;
        this.interaction!.throwItem(s);
      }
      return;
    }
    const inv = p.inventory;
    if (slot < SLOT_ARMOR) inv.main[slot] = s;
    else if (slot < SLOT_OFFHAND) inv.armor[slot - SLOT_ARMOR] = s;
    else inv.offhand = s;
    inv.version++;
    // (what the guest has is what it said; the host's copy may have left some data off, which is the host's to keep)
    this.slots[slot] = stackKey(this.slotStack(slot));
    this.invVersion = inv.version;
  }

  private slotStack(slot: number): ItemStack | null {
    const inv = this.player!.inventory;
    return slot < SLOT_ARMOR ? inv.main[slot] : slot < SLOT_OFFHAND ? inv.armor[slot - SLOT_ARMOR] : inv.offhand;
  }

  /** vanilla handleChat: plain text, not too much of it */
  private chat(text: string): void {
    if (!isAllowedChat(text)) return this.disconnect('Illegal characters in chat');
    if (this.spammed()) return;
    const msg = text.trim().replace(/\s+/g, ' ');
    if (msg) this.server.broadcastChat(`<${this.name}> ${msg}`);
  }

  /** vanilla detectRateSpam: 20 a line, less a tick's worth each tick; past 200, the guest is kicked */
  private spammed(): boolean {
    this.chatSpam += CHAT_SPAM_STEP;
    if (this.chatSpam <= CHAT_SPAM_LIMIT) return false;
    this.disconnect('Kicked for spamming');
    return true;
  }

  // -------------------------------------------------------------------------
  // another dimension

  /**
   * (HostServer.hostLeavingDimension) vanilla ServerPlayer.changeDimension, for a guest the host takes along: out of what
   * it was doing (its menus closed, what they held back in its inventory; woken; off what it rode, which stays), all it
   * was shown of this dimension let go, as its own game lets go of its world (vanilla ClientboundRespawnPacket), and its
   * moves not taken till it's put in the next one (arrive)
   */
  leaveDimension(dim: string, reason: ReceivingReason): void {
    if (this.state !== 'play') return;
    const p = this.player!;
    if (this.crack) this.level.destroyBlockProgress(p.id, 0, 0, 0, -1);
    this.crack = '';
    this.menus!.closeAll(true);
    if (p.isSleeping()) p.stopSleepInBed(true);
    this.sleeping = '';
    p.removeVehicle();
    this.riding = null;
    if (p.isUsingItem()) p.stopUsingItem();
    this.releaseRespawnTicket();
    this.respawnWait = 0;
    this.server.hooks.setTicket(`player:${p.id}`, null);
    this.sent.clear();
    this.blockEntities.clear();
    this.blockUpdates = [];
    this.tracker.clear();
    this.seen.clear();
    this.bossBars.clear();
    this.moves = [];
    this.target = NO_TARGET;
    this.attackPressed = this.usePressed = this.attackHeld = this.useHeld = false;
    this.drops = [];
    // (a teleport it can't have taken: its moves are the old dimension's till it takes the one arrive sends)
    this.awaitingTeleport = -1;
    if (!this.travelling) {
      this.travelFrom = this.level.world.dim.id;
      this.progress.leavingDimension(this.travelFrom, p);
    }
    this.travelling = true;
    this.send([CB.ChangeDimension, dim, reason]);
  }

  /**
   * (HostServer.hostArrived) in the host's new dimension, beside the host (vanilla puts each where its own portal led;
   * here all went through the host's), not to go back through a portal at once, and shown the world from there, and
   * its inventory as it is
   */
  arrive(): void {
    if (this.state !== 'play' || !this.travelling || this.held) return;
    // (home after its End Poem, in the Overworld: at its bed, whose chunks are asked for first and waited for a few
    // seconds at most, as a respawn's are)
    if (this.afterCredits && this.level.world.dim.id === 'overworld' && !this.bedLoaded()) return this.askForBed();
    this.comeIn();
  }

  /**
   * in the host's dimension at last: beside the host; or, home after its End Poem (vanilla PlayerList.respawn(player,
   * true)), at its bed or by the world spawn, a new player keeping everything but its fire and its breath
   */
  private comeIn(): void {
    this.travelling = false;
    const p = this.player!, host = this.level.player;
    p.removed = false;
    if (!this.level.entities.includes(p)) this.level.addEntity(p);
    p.portal = null;
    p.portalCooldown = p.dimensionChangingDelay();
    p.fallDistance = 0;
    p.dx = p.dy = p.dz = 0;
    this.menus!.resync();
    if (this.afterCredits) {
      this.afterCredits = false;
      p.remainingFireTicks = 0;
      p.air = 300;
      const [x, y, z, yaw] = this.respawnPlace();
      this.teleport(x, y, z, yaw, 0);
    } else this.teleport(host.x, host.y, host.z, host.yaw, host.pitch);
    // (vanilla ServerPlayer.triggerDimensionChangeTriggers, where it came in; after the End Poem, handleClientCommand's
    // CHANGED_DIMENSION from the End)
    const to = this.level.world.dim.id;
    if (this.travelFrom !== to) this.progress.changedDimension(this.travelFrom, to, p);
  }

  /**
   * (HostServer.showEndCredits, the host going home through the End's exit portal) vanilla ServerPlayer.showEndCredits:
   * taken along alive, it hasn't seen the End Poem: seen now, and shown it (WIN_GAME), out of the world till it's over
   */
  winGame(): void {
    const p = this.player;
    if (this.state !== 'play' || !this.travelling || !p || p.seenCredits || p.health <= 0 || p.dead) return;
    p.seenCredits = true;
    this.wonGame = true;
    this.send([CB.WinGame]);
  }

  /**
   * (the guest's PERFORM_RESPAWN while it's watching) its End Poem is over or skipped: home, now, or with the host if it
   * isn't home itself yet (hostArrived)
   */
  private creditsOver(): void {
    this.wonGame = false;
    this.afterCredits = true;
    if (!this.server.travelling) this.arrive();
  }

  // -------------------------------------------------------------------------
  // tick

  /** after the level's tick: the guest's clicks, its crack, keeping alive, and its chunks */
  tick(): void {
    if (this.state === 'login') {
      if (this.ticks > LOGIN_TICKS) this.disconnect('Took too long to log in');
      return;
    }
    if (this.state !== 'play') return;
    if (this.ticks - this.lastHeard > TIMEOUT_TICKS) return this.disconnect('Timed out');
    if (this.ticks % KEEPALIVE_TICKS === 0) this.send([CB.KeepAlive, ++this.keepAliveId]);
    // (on its way to another dimension: nothing of this one to do; home after its End Poem, once its bed's chunks are in
    // or it has waited long enough)
    if (this.travelling) {
      if (this.respawnWait > 0 && (this.bedLoaded() || --this.respawnWait === 0)) this.comeIn();
      return;
    }
    if (this.dropSpam > 0) this.dropSpam--;
    // (a rider is where its mount took it, round which its chunks are sent)
    const p = this.player!;
    if (p.vehicle && !p.removed) this.pos = { x: p.x, y: p.y, z: p.z };
    // (Game.applyGameRules and the difficulty, for the host's own player: its hunger as the host's)
    p.food.difficulty = this.level.difficulty;
    p.food.naturalRegen = !!this.level.gameRules.naturalRegeneration;
    this.tickInteraction();
    this.progress.tick();
    this.menus!.tick();
    this.tickChunks();
    // (respawning at a bed whose chunks were asked for: once they're in, or it's waited long enough)
    if (this.respawnWait > 0 && (this.bedLoaded() || --this.respawnWait === 0)) this.respawnNow();
  }

  /** vanilla handlePlayerCommand START_RIDING_JUMP: the leap of the mount it steers, with the charge the guest let go at */
  private ridingJump(power: number): void {
    const mount = this.player!.jumpableVehicle();
    if (!mount || mount.jumpCooldown() !== 0) return;
    mount.onPlayerJump(power);
    if (power > 0) mount.handleStartJump(power);
  }

  /** what Game.tick does with its own player's buttons, with this guest's (vanilla ServerPlayerGameMode) */
  private tickInteraction(): void {
    const p = this.player!, it = this.interaction!;
    if (p.removed || p.health <= 0) {
      this.drops = [];
      this.attackPressed = this.usePressed = false;
      it.continueAttack(false);
      return;
    }
    this.pick();
    if (this.attackPressed) it.startAttack();
    it.continueAttack(this.attackHeld && !p.isUsingItem());
    it.use(this.usePressed, this.useHeld);
    it.tickUsingItem();
    // (vanilla handlePlayerAction DROP_ITEM: what's in hand, thrown, the guest's inventory told of it after)
    for (const all of this.drops) if (p.gameMode !== 'spectator') it.drop(all);
    this.drops = [];
    this.attackPressed = this.usePressed = false;
    // (vanilla ServerLevel.destroyBlockProgress: the crack it's making, for everyone round it to see)
    const stage = it.destroyStage;
    const crack = stage >= 0 ? `${it.dX},${it.dY},${it.dZ},${stage}` : '';
    if (crack !== this.crack) {
      this.crack = crack;
      this.level.destroyBlockProgress(p.id, it.dX, it.dY, it.dZ, stage);
    }
  }

  /**
   * vanilla GameRenderer.pick from the guest's eyes: the entity the guest says is under its crosshair (another player
   * too: players fight), if it could be (vanilla handleInteract's checks), else the block it looks at. A player it
   * doesn't say it looks at hides the block behind it
   */
  private pick(): void {
    const p = this.player!, it = this.interaction!;
    const ex = p.x, ey = p.y + p.eyeHeight, ez = p.z;
    const e = this.targetEntity(ex, ey, ez);
    if (e) {
      it.entityHit = e;
      it.hit = null;
      return;
    }
    const pr = (p.pitch * Math.PI) / 180, yr = (p.yaw * Math.PI) / 180;
    const dx = -Math.sin(yr) * Math.cos(pr), dy = -Math.sin(pr), dz = Math.cos(yr) * Math.cos(pr);
    const reach = it.reach();
    const bh = raycast(this.level.world, ex, ey, ez, dx, dy, dz, Math.max(reach, it.entityReach()));
    let d = bh ? bh.dist : Math.max(reach, it.entityReach());
    for (const o of this.level.players()) {
      if (o === p || o.removed || o.gameMode === 'spectator') continue;
      const h = o.bb.inflate(o.pickRadius()).clip(ex, ey, ez, ex + dx * d, ey + dy * d, ez + dz * d);
      if (h) d = Math.min(d, h.t * d);
    }
    it.entityHit = null;
    it.hit = bh && bh.dist < reach && bh.dist <= d ? bh : null;
  }

  /**
   * the entity the guest says it looks at, if it may: one it's been shown and that's still here (or a part of one, an
   * ender dragon's: vanilla getEntityOrPart), that can be picked, isn't what it rides, and whose box is in its reach
   * from its eyes (vanilla canInteractWithEntity, with its slack: a part's own box)
   */
  private targetEntity(ex: number, ey: number, ez: number): Entity | null {
    if (this.target === NO_TARGET) return null;
    const p = this.player!, e = this.tracker.byId(this.target) ?? this.tracker.partById(this.target) ?? this.seenPlayer(this.target);
    if (!e || e.removed || !e.isPickable() || e.rootVehicle() === p.rootVehicle()) return null;
    const b = e.bb.inflate(e.pickRadius());
    const dx = Math.max(b.minX - ex, 0, ex - b.maxX), dy = Math.max(b.minY - ey, 0, ey - b.maxY), dz = Math.max(b.minZ - ez, 0, ez - b.maxZ);
    const r = this.interaction!.entityReach() + ENTITY_REACH_SLACK;
    return dx * dx + dy * dy + dz * dz < r * r ? e : null;
  }

  /** a player it's been shown (a guest's or the host's), by id */
  private seenPlayer(id: number): Player | null {
    for (const o of this.seen.keys()) if (o.id === id) return o.gameMode === 'spectator' ? null : o;
    return null;
  }

  /** vanilla ChunkMap.updateChunkTracking: send the nearest missing chunks, forget the far ones */
  private tickChunks(): void {
    const world = this.level.world;
    const cx = Math.floor(this.pos.x) >> 4, cz = Math.floor(this.pos.z) >> 4, vd = this.viewDistance;
    this.server.hooks.setTicket(`player:${this.player!.id}`, [cx, cz, vd]);
    const near = (x: number, z: number, r: number) => inView(x - cx, z - cz, r);
    for (const key of this.sent) {
      const c = world.chunks.get(key);
      const kx = Math.floor(key / 65536) - 32768, kz = (key % 65536) - 32768;
      if (!c || !near(kx, kz, vd + 1)) {
        this.sent.delete(key);
        for (const k of [...this.blockEntities.keys()]) {
          const [x, , z] = k.split(',').map(Number);
          if (x >> 4 === kx && z >> 4 === kz) this.blockEntities.delete(k);
        }
        this.send([CB.ForgetLevelChunk, kx, kz]);
      }
    }
    const want: [Chunk, number][] = [];
    for (let dz = -vd; dz <= vd; dz++)
      for (let dx = -vd; dx <= vd; dx++) {
        if (!near(cx + dx, cz + dz, vd)) continue;
        const c = world.chunks.get(Chunk.key(cx + dx, cz + dz));
        if (c && c.lightMerged && !this.sent.has(c.key)) want.push([c, dx * dx + dz * dz]);
      }
    want.sort((a, b) => a[1] - b[1]);
    for (let i = 0; i < want.length && i < CHUNKS_PER_TICK; i++) {
      const c = want[i][0];
      this.sent.add(c.key);
      this.send(levelChunkPacket(world, c));
      for (const be of world.chunkBlockEntities(c.cx, c.cz)) this.blockEntities.set(be.key, this.server.blockEntityJson(be));
    }
  }

  /** a block changed in one of its chunks */
  blockChanged(x: number, y: number, z: number, state: number): void {
    this.blockUpdates.push(x, y, z, state);
  }

  // -------------------------------------------------------------------------
  // out

  send(p: Value[]): void {
    if (this.state !== 'gone') this.out.push(p);
  }

  /** a line in the guest's chat (or over its hotbar) */
  systemChat(text: string, overlay = false): void {
    this.send([CB.SystemChat, text, overlay]);
  }

  /** a plain message for something the guest can't do yet, at most once a second for the same thing */
  notice(text: string): void {
    const last = this.notices.get(text);
    if (last !== undefined && this.ticks - last < 20) return;
    this.notices.set(text, this.ticks);
    this.systemChat(text, true);
  }

  /** (end of the host's tick, before the block entities) the block changes in its chunks */
  flushBlocks(): void {
    if (this.state !== 'play' || !this.blockUpdates.length) return;
    this.send([CB.BlockUpdates, new Int32Array(this.blockUpdates)]);
    this.blockUpdates = [];
  }

  /** (end of the host's tick) what the guest sees of the others, its inventory's changes, and off it all goes */
  flush(): void {
    if (this.state !== 'play' || this.travelling) return this.sendOut();
    this.flushBlocks();
    this.trackPlayers();
    this.tracker.tick(this.ticks);
    this.dismounted();
    // (the open menu's slots first: the inventory's that it shows go with its state number; the rest after)
    this.menus!.broadcast();
    this.syncInventory();
    this.syncExperience();
    this.syncStatus();
    this.placedByHost();
    this.progress.flush();
    this.bossBars.sync(this.level, this.player!, (pk) => this.send(pk));
    this.sendOut();
  }

  /**
   * vanilla ServerPlayer.teleportTo: its player put somewhere by the host rather than by its own move (an ender
   * pearl's landing, a chorus fruit, a piston's push), so the guest is told, as a teleport its later moves wait on
   */
  private placedByHost(): void {
    const p = this.player!;
    if (p.removed || p.vehicle || p.isSleeping() || p.health <= 0 || this.awaitingTeleport !== null) return;
    const d2 = (p.x - this.pos.x) ** 2 + (p.y - this.pos.y) ** 2 + (p.z - this.pos.z) ** 2;
    if (d2 > 1e-8) this.teleport(p.x, p.y, p.z, p.yaw, p.pitch);
  }

  /** whether the guest knows of `e` (itself, a player it sees, an entity it's been shown): who a rider can be to it */
  knows(e: Entity): boolean {
    return e === this.player || this.seen.has(e as Player) || this.tracker.has(e);
  }

  /**
   * vanilla ServerPlayer.stopRiding → dismountTo: a guest's player that got off (the sneak key, its mount gone) is put
   * where the host has it, after it's been told it's off (SetPassengers)
   */
  private dismounted(): void {
    const p = this.player!, v = p.vehicle;
    if (this.riding && !v && !p.removed) this.teleport(p.x, p.y, p.z, p.yaw, p.pitch);
    this.riding = v;
  }

  /**
   * vanilla ServerPlayer.doTick's lastSent* and its synched data, for its own player: its health, food and air
   * (PlayerStatus), a knock or a blast (SetEntityMotion), its effects, its bed, its game mode, the hotbar slot the host
   * put in its hand and its items' cooldowns, each when it changed
   */
  private syncStatus(): void {
    const p = this.player!;
    if (p.hurtMarked) {
      p.hurtMarked = false;
      const v = (d: number) => (Number.isFinite(d) ? Math.max(-MAX_MOTION, Math.min(MAX_MOTION, d)) : 0);
      this.send([CB.SetEntityMotion, v(p.dx), v(p.dy), v(p.dz)]);
    }
    const status = playerStatus(p), key = status.join(',');
    if (key !== this.status) {
      this.status = key;
      this.send([CB.PlayerStatus, ...status]);
    }
    if (effectsChanged(p, this.fxSent, this.ticks)) {
      this.fxSent = effectsSent(p, this.ticks);
      this.send([CB.UpdateEffects, effectList(p)]);
    }
    const bed = p.sleepingPos ? p.sleepingPos.join(',') : '';
    if (bed !== this.sleeping) {
      this.sleeping = bed;
      this.send([CB.SetSleeping, p.sleepingPos ? [...p.sleepingPos] : null]);
      // (up, beside the bed: vanilla stopSleeping's teleport)
      if (!p.sleepingPos && p.health > 0) this.teleport(p.x, p.y, p.z, p.yaw, p.pitch);
    }
    if (p.gameMode !== this.gameMode) {
      this.gameMode = p.gameMode;
      this.send([CB.GameMode, p.gameMode]);
    }
    // (vanilla DATA_LIVING_ENTITY_FLAGS for its own player: eating, drinking, a bow drawn, a shield up; the guest counts
    // the use on from there, as the host does)
    const using = p.useItem ? `${p.useHand},${p.useDuration},${this.ticks - p.ticksUsingItem()}` : '';
    if (using !== this.using) {
      this.using = using;
      const t = (n: number, lo: number) => (Number.isFinite(n) ? Math.max(lo, Math.min(72000, Math.round(n))) : 0);
      this.send([CB.SetUsingItem, p.useItem ? (p.useHand === 'off' ? 1 : 0) : -1, t(p.useDuration, 0), t(p.useItemRemaining, -72000)]);
    }
    const inv = p.inventory;
    if (inv.selected !== this.selected) {
      this.selected = inv.selected;
      this.send([CB.SetCarriedItem, inv.selected]);
    }
    // (vanilla ItemCooldowns.onCooldownStarted / onCooldownEnded: when one starts or is cut short, not each tick of it)
    for (const [id, left] of p.cooldowns) {
      const had = this.cooldowns.get(id);
      if (had && Math.abs(had[0] - (this.ticks - had[1]) - left) <= 1) continue;
      this.cooldowns.set(id, [left, this.ticks]);
      const t = (n: number | undefined) => (n !== undefined && Number.isFinite(n) ? Math.max(0, Math.min(72000, Math.round(n))) : 0);
      this.send([CB.SetCooldown, id, t(left), t(p.cooldownTotals.get(id))]);
    }
    for (const [id, [left, at]] of this.cooldowns)
      if (!p.cooldowns.has(id)) {
        this.cooldowns.delete(id);
        if (left - (this.ticks - at) > 1) this.send([CB.SetCooldown, id, 0, 0]);
      }
  }

  /** vanilla ServerPlayer's lastSentExp: the experience bar */
  private syncExperience(): void {
    const p = this.player!;
    const key = `${p.xpProgress},${p.xpLevel},${p.xpTotal}`;
    if (key === this.xp) return;
    this.xp = key;
    const n = (v: number) => (Number.isFinite(v) ? Math.max(0, Math.min(0x7fffffff, Math.floor(v))) : 0);
    this.send([CB.SetExperience, Number.isFinite(p.xpProgress) ? Math.max(0, Math.min(1, p.xpProgress)) : 0, n(p.xpLevel), n(p.xpTotal)]);
  }

  private sendOut(): void {
    if (!this.out.length) return;
    const msg = this.out;
    this.out = [];
    let bytes: Uint8Array;
    try {
      bytes = encodeBundle(msg, (p, e) => unsent(p, e));
    } catch (e) {
      console.error('multiplayer: a message to a guest', e);
      return;
    }
    this.server.transport.send(this.peer, bytes);
  }

  /** vanilla ChunkMap.TrackedEntity for players: the others in view come, move, swing and change what they hold */
  private trackPlayers(): void {
    const me = this.player!;
    const cx = Math.floor(this.pos.x) >> 4, cz = Math.floor(this.pos.z) >> 4, r = this.viewDistance;
    const here = new Set<Player>();
    for (const o of this.level.players()) {
      if (o === me || o.removed) continue;
      const ocx = Math.floor(o.x) >> 4, ocz = Math.floor(o.z) >> 4;
      if (Math.max(Math.abs(ocx - cx), Math.abs(ocz - cz)) > r || !this.sent.has(Chunk.key(ocx, ocz))) continue;
      here.add(o);
      const move = [o.x, o.y, o.z, o.yaw, o.pitch, o.headYaw, o.bodyYaw, poseFlags(o)];
      const key = move.join(',');
      const equip = equipment(o).map(stackKey);
      let s = this.seen.get(o);
      if (!s) {
        s = { move: key, equip, swinging: o.swinging, swingTime: o.swingTime };
        this.seen.set(o, s);
        this.send([CB.AddPlayer, o.id, o.uuid, this.server.nameOf(o), ...move.slice(0, 7), move[7], o.gameMode, equipment(o).map(itemToWire)]);
        this.send([CB.SetEntityData, o.id, this.server.dataFull(o)]);
        continue;
      }
      const data = this.server.dataChanges(o);
      if (data) this.send([CB.SetEntityData, o.id, data]);
      if (key !== s.move) {
        s.move = key;
        this.send([CB.MoveEntity, o.id, ...move]);
      }
      const now = equipment(o);
      for (let i = 0; i < 6; i++)
        if (equip[i] !== s.equip[i]) {
          s.equip[i] = equip[i];
          this.send([CB.SetEquipment, o.id, i, itemToWire(now[i])]);
        }
      if (swungAgain(o, s)) this.send([CB.Animate, o.id, o.swingingArm === 'off' ? ANIMATE_SWING_OFF_HAND : ANIMATE_SWING_MAIN_HAND]);
      s.swinging = o.swinging;
      s.swingTime = o.swingTime;
    }
    const gone: number[] = [];
    for (const o of this.seen.keys())
      if (!here.has(o)) {
        this.seen.delete(o);
        gone.push(o.id);
      }
    if (gone.length) this.send([CB.RemoveEntities, gone]);
    // (its own swings are the host's to say: the guest doesn't guess at them)
    if (swungAgain(me, this.swing)) this.send([CB.Animate, me.id, me.swingingArm === 'off' ? ANIMATE_SWING_OFF_HAND : ANIMATE_SWING_MAIN_HAND]);
    this.swing.swinging = me.swinging;
    this.swing.swingTime = me.swingTime;
  }

  /**
   * (vanilla ServerPlayer's inventory listener, for the player's own slots) what the host did to the guest's inventory
   * (an armour piece put on by using it, a bucket filled) goes back to the guest
   */
  private syncInventory(): void {
    const inv = this.player!.inventory;
    if (inv.version === this.invVersion) return;
    this.invVersion = inv.version;
    // (vanilla's recipe advancements, inventory_changed: what it holds now unlocks recipes, as the host's own does)
    this.recipes.checkInventory([...inv.main, ...inv.armor, inv.offhand]);
    for (let slot = 0; slot < SLOT_COUNT; slot++) {
      const s = this.slotStack(slot), key = stackKey(s), had = this.slots[slot];
      this.slots[slot] = key;
      if (!claimMatches(had, key)) this.send([CB.ContainerSetSlot, slot, itemToWire(s)]);
    }
  }

  // -------------------------------------------------------------------------
  // dying, sleeping

  /**
   * vanilla ServerPlayer.die: heard by everyone near, told to everyone (showDeathMessages), what it carried dropped,
   * and the guest's death screen (or, with doImmediateRespawn, straight back)
   */
  private died(source: string): void {
    const p = this.player!, level = this.level, srv = this.server;
    // (what its menus held, a crafting grid's or its cursor's, is dropped where it died, keepInventory or not)
    this.menus!.closeAll(true);
    srv.heardByAll(() => level.sound.play('entity.player.death', p.x, p.y, p.z, 1, 1));
    const msg = deathMessage(source, p, this.name).slice(0, 1024);
    if (level.gameRules.showDeathMessages) srv.broadcastChat(msg);
    dropDeathLoot(level, p);
    p.removeVehicle();
    this.send([CB.PlayerCombatKill, msg]);
    if (level.gameRules.doImmediateRespawn) this.respawn();
  }

  /**
   * vanilla handleClientCommand PERFORM_RESPAWN → PlayerList.respawn: back alive, at its bed (facing it) if that's still
   * there and clear, else by the world spawn (the bed forgotten, and the guest told so). Vanilla reads the bed where it
   * is, loading its chunk there and then: here the chunks round it are asked for, and it waits for them (a few seconds
   * at most). The host in another dimension, it comes back by the host, its bed kept for when they're home
   */
  private respawn(): void {
    const p = this.player!;
    if ((p.health > 0 && !p.dead) || this.travelling || this.respawnWait > 0) return;
    if (this.level.world.dim.id === 'overworld' && !this.bedLoaded()) return this.askForBed();
    this.respawnNow();
  }

  /** its bed's chunks asked for, to wait for them a few seconds at most (respawnWait) */
  private askForBed(): void {
    const p = this.player!, [bx, , bz] = p.respawnPos!;
    this.respawnWait = RESPAWN_BED_WAIT_TICKS;
    this.respawnTicket = true;
    this.server.hooks.setTicket(`respawn:${p.id}`, [bx >> 4, bz >> 4, 1]);
  }

  private releaseRespawnTicket(): void {
    if (!this.respawnTicket || !this.player) return;
    this.respawnTicket = false;
    this.server.hooks.setTicket(`respawn:${this.player.id}`, null);
  }

  /** its bed's chunks (and theirs round them) are in, or it has none */
  private bedLoaded(): boolean {
    const b = this.player!.respawnPos;
    return !b || areaComplete(this.level.world, b[0], b[2], b[0], b[2]);
  }

  private respawnNow(): void {
    const p = this.player!;
    resetForRespawn(p, !!this.level.gameRules.keepInventory);
    const [x, y, z, yaw] = this.respawnPlace();
    this.send([CB.Respawn]);
    this.teleport(x, y, z, yaw, 0);
    p.dx = p.dy = p.dz = 0;
  }

  /**
   * vanilla ServerPlayer.findRespawnPositionAndUseSpawnBlock: where it comes back, and which way it faces: its bed if
   * it's still there and clear, else by the world spawn (the bed forgotten, and the guest told so)
   */
  private respawnPlace(): [number, number, number, number] {
    const p = this.player!, level = this.level;
    this.releaseRespawnTicket();
    this.respawnWait = 0;
    // (a bed that couldn't be looked at, its chunks not in or the host elsewhere, is kept)
    const looked = level.world.dim.id === 'overworld' && this.bedLoaded();
    const bed = looked ? findRespawn(level, p) : null;
    if (looked && !bed && p.respawnPos) {
      this.systemChat(MSG.noRespawnBlock);
      p.respawnPos = null;
    }
    const [x, y, z] = bed ? [bed.x, bed.y, bed.z] : this.server.hooks.spawnPoint();
    return [x, y, z, bed ? bed.yaw : 0];
  }

  /** (its Interaction) a bed it used: to sleep in, or set its spawn by (game/sleep.ts, as the host's own player does) */
  useBed(x: number, y: number, z: number): void {
    const host: SleepHost = { level: this.level, player: this.player!, overlay: (m) => this.systemChat(m, true), chat: (m) => this.systemChat(m), onSlept: () => this.progress.trigger('slept') };
    useBed(host, x, y, z);
  }

  /**
   * vanilla handlePickItem: survival's pick-block, the stack in `slot` of the inventory (past the hotbar) swapped into
   * the hand (as Interaction.pickBlock does for the host's own player)
   */
  private pickSlot(slot: number): void {
    const p = this.player!, inv = p.inventory;
    if (slot < 9 || p.gameMode === 'creative' || p.gameMode === 'spectator' || p.health <= 0) return;
    const tmp = inv.main[inv.selected];
    inv.main[inv.selected] = inv.main[slot];
    inv.main[slot] = tmp;
    inv.version++;
  }

  // -------------------------------------------------------------------------
  // menus and books

  /** (HostServer.showMenu) vanilla ServerPlayer.openMenu: `m`, made for its player, shown to the guest */
  showMenu(m: ContainerMenu): boolean {
    if (this.state !== 'play' || !this.menus || this.player!.health <= 0) {
      m.removed();
      return false;
    }
    // (a trade made earns it What a Deal!: Game.openMerchant, for the host's own player)
    if (m instanceof MerchantMenu) m.onTraded = () => this.progress.trigger('villager_trade', { tradeY: this.player!.y });
    return this.menus.open(m);
  }

  /**
   * vanilla HasCustomInventoryScreen.openCustomInventoryScreen: the inventory key while riding a chest boat opens its
   * chest; on a horse, its inventory (if the horse will have it)
   */
  private openVehicleInventory(): void {
    const p = this.player!, v = p.vehicle;
    if (v instanceof ChestBoat) this.showMenu(entityContainerMenu(this.level, p, v));
    else if (v instanceof AbstractHorse) v.openInventory(p);
  }

  /** (HostServer.openBook) a book it used, in `hand`: its screen, to read or write in (vanilla ClientboundOpenBookPacket) */
  openBook(hand: Hand): void {
    this.send([CB.OpenBook, hand === 'off' ? 1 : 0]);
  }

  /**
   * vanilla handleEditBook: what the guest wrote in the book and quill in its hotbar slot or offhand (40), or signed
   * it as: plain text, no control characters but new lines, no formatting sign; a title of 1 to 32 characters
   */
  private editBook(slot: number, pages: string[], title: string | null): void {
    const p = this.player!;
    if ((slot > 8 && slot !== 40) || p.health <= 0) return;
    const text = pages.map((s) => s.replace(/[\u0000-\u0009\u000b-\u001f\u007f§]/g, ''));
    let sign: { title: string; author: string } | null = null;
    if (title !== null) {
      const t = title.replace(/[\u0000-\u001f\u007f§]/g, '').trim();
      if (!t) return;
      sign = { title: t, author: this.name };
    }
    writeBook(p, slot, text, sign);
  }

  // -------------------------------------------------------------------------
  // leaving

  /** vanilla ServerGamePacketListenerImpl.disconnect: tell the guest why, then let it go */
  disconnect(reason: string): void {
    if (this.state === 'gone') return;
    this.out = [[CB.Disconnect, reason]];
    this.sendOut();
    this.gone(reason);
    this.server.transport.disconnect(this.peer);
  }

  /**
   * vanilla PlayerList.saveAll / remove: its player kept with the world as it is now (with its recipe book, and what it
   * rides alone), for when it comes back
   */
  save(): void {
    const p = this.player;
    if (this.state !== 'play' || !p) return;
    // (on its way to another dimension, it's still where it was in the one it left)
    const dim = this.travelling ? this.travelFrom : this.level.world.dim.id;
    this.server.hooks.saveGuest?.(this.uuid, savePlayer(p, dim, { advancements: this.progress.advancements.save(), recipeBook: this.recipes.save() }));
  }

  /**
   * it's gone (left, dropped, or the connection went): its player out of bed (vanilla ServerPlayer.disconnect), kept
   * for when it comes back, and out of the level, with what it rode alone (vanilla PlayerList.remove)
   */
  gone(reason: string): void {
    if (this.state === 'gone') return;
    const was = this.state;
    const p = this.player;
    if (p && was === 'play') {
      if (this.crack) this.level.destroyBlockProgress(p.id, 0, 0, 0, -1);
      // (vanilla Player.remove: the open menu closed, a chest's lid shut, what the menus held dropped where it stood)
      p.disconnected = true;
      if (p.isSleeping()) p.stopSleepInBed(true);
      this.menus?.closeAll(false);
      this.save();
      const v = p.vehicle;
      if (v && carriesOnePlayer(v)) {
        p.removeVehicle();
        removeWithRiders(v);
      }
    }
    this.releaseRespawnTicket();
    this.state = 'gone';
    this.out = [];
    if (p) {
      p.remove();
      this.server.hooks.setTicket(`player:${p.id}`, null);
    }
    this.server.left(this, was === 'play', reason);
  }
}

/**
 * a guest's player on the host: what its own tick sets off (a sprint's dust, a splash) the guest's game makes for
 * itself, so it isn't sent back to it (vanilla level.playSound(player, ...) leaves out the player it's for)
 */
class GuestPlayer extends Player {
  constructor(level: Level, private readonly session: ServerPlayerSession) {
    super(level);
  }

  override tick(): void {
    const srv = this.session.server;
    srv.actor = this.session;
    try {
      super.tick();
    } finally {
      srv.actor = null;
    }
  }
}

/** `p` isn't where it was put (`at`): something moved it since */
function moved(p: Player, at: { x: number; y: number; z: number }): boolean {
  return Math.abs(p.x - at.x) > 1e-9 || Math.abs(p.y - at.y) > 1e-9 || Math.abs(p.z - at.z) > 1e-9;
}

/** vanilla UNLOADED_WITH_PLAYER: what a leaving guest rode alone goes with it, and whatever else rode that */
function removeWithRiders(e: Entity): void {
  for (const r of [...e.passengers]) if (r.type !== 'player') removeWithRiders(r);
  e.remove();
}

/** a swing that started since last seen (LivingEntity.swing sets swingTime back to -1) */
function swungAgain(p: Player, s: { swinging: boolean; swingTime: number }): boolean {
  return p.swinging && (!s.swinging || p.swingTime < s.swingTime);
}
