// One guest on the host (vanilla ServerPlayer with its ServerGamePacketListenerImpl and ChunkMap's view of it): its
// player, a real Player in the host's level that the guest moves; the clicks it sends, done by an Interaction of its
// own as the host does its own player's; the chunks it has been sent; and everything it's told, a tick at a time.

import type { Value } from '../codec';
import { decode, encodeBundle, CodecError } from '../codec';
import { SB, CB, Action, PoseFlag, checkPacket, isAllowedChat, SLOT_ARMOR, SLOT_OFFHAND, SLOT_COUNT, ANIMATE_SWING_MAIN_HAND, ANIMATE_SWING_OFF_HAND, type LoginInfo } from '../protocol';
import { PROTOCOL_VERSION, BUILD_ID, MAX_GUEST_MESSAGE, MAX_GUEST_PACKETS, MESSAGES_PER_TICK, MAX_GUEST_BACKLOG, MAX_GUEST_BACKLOG_BYTES, MAX_LOGIN_BACKLOG, MAX_GUESTS, LOGIN_TICKS, KEEPALIVE_TICKS, TIMEOUT_TICKS, GUEST_VIEW_DISTANCE, CHUNKS_PER_TICK, MAX_MOVE_PER_TICK, CHAT_SPAM_STEP, CHAT_SPAM_LIMIT, NAME_PATTERN, DROP_SPAM_STEP, DROP_SPAM_LIMIT, ENTITY_REACH_SLACK } from '../config';
import type { PeerId } from '../transport/transport';
import { creativeItem, itemToWire } from '../items';
import { applyPoseFlags, equipment, poseFlags, stackKey } from '../playerState';
import { levelChunkPacket } from '../chunkData';
import type { HostServer } from './hostServer';
import { EntityTracker } from './entityTracker';
import type { Entity } from '../../entity/entity';
import { Player } from '../../entity/player';
import { Interaction } from '../../game/interaction';
import { raycast } from '../../game/raycast';
import { Chunk } from '../../world/chunk';
import { MIN_Y } from '../../world/constants';
import type { ItemStack } from '../../item/item';
import type { Level } from '../../game/level';

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
  private move: Move | null = null;
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
  /** when each plain message was last shown (so a held button doesn't repeat it every few ticks) */
  private readonly notices = new Map<string, number>();

  constructor(readonly server: HostServer, readonly peer: PeerId) {}

  get level() {
    return this.server.level;
  }

  /** (the state can change under a handler: a packet may drop the guest) */
  private get isGone(): boolean {
    return this.state === 'gone';
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
    // (vanilla's chat spam count goes down a tick at a time; here by the real time too, if more: a host whose window
    // is hidden ticks slowly, its guests don't)
    const now = performance.now();
    this.chatSpam = Math.max(0, this.chatSpam - Math.max(1, (now - this.lastDecay) / 50));
    this.lastDecay = now;
    if (this.refused) return this.disconnect(this.refused);
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
          this.handle(p as Value[]);
        } catch (e) {
          console.error('multiplayer: handling a guest packet', e);
          return this.disconnect('Something went wrong with what you sent');
        }
        if (this.isGone) return;
      }
    }
  }

  private handle(p: Value[]): void {
    const id = p[0] as number;
    if (this.state === 'login') {
      if (id !== SB.Hello) return this.disconnect('Say hello first');
      return this.hello(p[1] as number, p[2] as string, p[3] as string, (p[4] as string).toLowerCase(), p[5] as number);
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
        return;
      case SB.SetCarriedItem:
        pl.inventory.selected = p[1] as number;
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
    }
  }

  /** vanilla ServerLoginPacketListenerImpl + PlayerList.placeNewPlayer */
  private hello(protocol: number, build: string, name: string, uuid: string, viewDistance: number): void {
    if (protocol !== PROTOCOL_VERSION) return this.disconnect(protocol < PROTOCOL_VERSION ? 'Outdated game! This world is open in a newer one.' : 'Outdated host! This world is open in an older one.');
    if (build !== BUILD_ID) return this.disconnect('This world is open in a different version of the game. Reload both windows so they run the same one.');
    if (!NAME_PATTERN.test(name)) return this.disconnect('That name can only have letters, digits and _ (3 to 16 of them).');
    const srv = this.server;
    if (srv.guestCount() >= MAX_GUESTS) return this.disconnect('The world is full.');
    const taken = (n: string) => n.toLowerCase() === name.toLowerCase();
    if (taken(srv.hooks.hostName()) || [...srv.sessions.values()].some((s) => s !== this && s.state === 'play' && taken(s.name))) return this.disconnect(`Someone called ${name} is already playing here.`);
    if (srv.level.playerByUuid(uuid) || [...srv.sessions.values()].some((s) => s !== this && s.uuid === uuid)) return this.disconnect('You are already in this world (in another window?).');
    this.name = name;
    this.uuid = uuid;
    this.viewDistance = Math.min(GUEST_VIEW_DISTANCE, viewDistance);
    const level = srv.level;
    const p = new GuestPlayer(level, this);
    p.uuid = uuid;
    p.remote = true;
    p.profileName = name;
    p.setGameMode(srv.guestGameMode);
    const [x, y, z] = srv.hooks.spawnPoint();
    p.moveTo(x, y, z, 0, 0);
    p.remoteMove = () => this.applyMove();
    level.addEntity(p);
    this.player = p;
    this.pos = { x, y, z };
    const it = (this.interaction = srv.guestInteraction(this, p));
    // (what doesn't fit in its inventory, or it throws out, lands in the world: vanilla Player.drop)
    p.dropHandler = (s) => it.throwItem(s);
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
      x, y, z, yRot: 0, xRot: 0,
      viewDistance: this.viewDistance,
      hostName: srv.hooks.hostName(),
    };
    this.send([CB.Login, info as unknown as Value]);
    this.send(srv.weatherPacket());
    srv.joined(this);
  }

  /** vanilla handleMovePlayer: believed if it's not too far from the last, else the guest is put back */
  private moved(m: Move): void {
    this.attackHeld = !!(m.flags & PoseFlag.ATTACK_HELD);
    this.useHeld = !!(m.flags & PoseFlag.USE_HELD);
    this.steer(m.flags);
    // (vanilla: moves before the guest has taken a teleport are the old place's, and don't count)
    if (this.awaitingTeleport !== null) return;
    const p = this.player!;
    if (p.vehicle) {
      // (vanilla: a rider goes where what it rides takes it; the guest has a say only in where it looks, which the
      // mount goes by before the rider's tick)
      p.yaw = p.headYaw = m.yRot;
      p.pitch = m.xRot;
      this.move = m;
      return;
    }
    const d2 = (m.x - this.pos.x) ** 2 + (m.y - this.pos.y) ** 2 + (m.z - this.pos.z) ** 2;
    if (d2 > MAX_MOVE_PER_TICK * MAX_MOVE_PER_TICK) {
      // (vanilla "moved too quickly!")
      this.teleport(this.pos.x, this.pos.y, this.pos.z, m.yRot, m.xRot);
      return;
    }
    if (m.y < this.level.world.dim.minY - 64) {
      // (below the world: a guest can't die yet, so it's put back at the spawn)
      const [x, y, z] = this.server.hooks.spawnPoint();
      this.teleport(x, y, z, m.yRot, m.xRot);
      this.systemChat('You fell out of the world, and are back at the spawn.');
      return;
    }
    this.pos = { x: m.x, y: m.y, z: m.z };
    this.move = m;
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

  /** (Player.remoteMove, in its tick) where the guest said it went, with the look and pose it said */
  private applyMove(): void {
    const p = this.player, m = this.move;
    if (!p || !m) return;
    this.move = null;
    if (p.vehicle) {
      // (riding: its look and pose; where it is is its seat)
      applyPoseFlags(p, m.flags);
      p.yaw = p.headYaw = m.yRot;
      p.pitch = m.xRot;
      return;
    }
    p.dx = m.x - p.x;
    p.dy = m.y - p.y;
    p.dz = m.z - p.z;
    applyPoseFlags(p, m.flags);
    p.setPos(m.x, m.y, m.z);
    p.yaw = m.yRot;
    p.pitch = m.xRot;
    p.headYaw = m.yRot;
    if (p.flying || p.onGround) p.fallDistance = 0;
    // (pressure plates, tripwires, portals: vanilla ServerPlayer.doCheckFallDamage / checkInsideBlocks. What the
    // blocks do about it, a plate's click, is the world's doing, not the player's own: the guest hears it too)
    const srv = this.server, actor = srv.actor;
    srv.actor = null;
    try {
      p.checkInsideBlocks();
    } finally {
      srv.actor = actor;
    }
  }

  /** vanilla ServerGamePacketListenerImpl.teleport: the guest's player goes there, and the host waits to hear it did */
  teleport(x: number, y: number, z: number, yRot: number, xRot: number): void {
    const p = this.player;
    if (!p) return;
    this.teleportId = (this.teleportId + 1) & 0x7fffffff;
    this.awaitingTeleport = this.teleportId;
    this.pos = { x, y, z };
    this.move = null;
    p.moveTo(x, y, z, yRot, xRot);
    this.send([CB.PlayerPosition, x, y, z, yRot, xRot, this.teleportId]);
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
    if (this.dropSpam > 0) this.dropSpam--;
    // (a rider is where its mount took it, round which its chunks are sent)
    const p = this.player!;
    if (p.vehicle && !p.removed) this.pos = { x: p.x, y: p.y, z: p.z };
    this.tickInteraction();
    this.tickChunks();
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
    if (p.removed) return;
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
   * vanilla GameRenderer.pick from the guest's eyes: the entity the guest says is under its crosshair, if it could be
   * (vanilla handleInteract's checks), else the block it looks at. Players hide the block behind them; clicking one
   * does nothing yet (no fighting between players)
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
   * the entity the guest says it looks at, if it may: one it's been shown and that's still here, that can be picked,
   * isn't what it rides, and whose box is in its reach from its eyes (vanilla canInteractWithEntity, with its slack)
   */
  private targetEntity(ex: number, ey: number, ez: number): Entity | null {
    if (this.target === NO_TARGET) return null;
    const p = this.player!, e = this.tracker.byId(this.target);
    if (!e || e.removed || !e.isPickable() || e.rootVehicle() === p.rootVehicle()) return null;
    const b = e.bb.inflate(e.pickRadius());
    const dx = Math.max(b.minX - ex, 0, ex - b.maxX), dy = Math.max(b.minY - ey, 0, ey - b.maxY), dz = Math.max(b.minZ - ez, 0, ez - b.maxZ);
    const r = this.interaction!.entityReach() + ENTITY_REACH_SLACK;
    return dx * dx + dy * dy + dz * dz < r * r ? e : null;
  }

  /** vanilla ChunkMap.updateChunkTracking: send the nearest missing chunks, forget the far ones */
  private tickChunks(): void {
    const world = this.level.world;
    const cx = Math.floor(this.pos.x) >> 4, cz = Math.floor(this.pos.z) >> 4, vd = this.viewDistance;
    this.server.hooks.setTicket(`player:${this.player!.id}`, [cx, cz, vd]);
    const near = (x: number, z: number, r: number) => (x - cx) ** 2 + (z - cz) ** 2 <= r * r + r;
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
    if (this.state !== 'play') return this.sendOut();
    this.flushBlocks();
    this.trackPlayers();
    this.tracker.tick(this.ticks);
    this.dismounted();
    this.syncInventory();
    this.syncExperience();
    this.sendOut();
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
        continue;
      }
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
    for (let slot = 0; slot < SLOT_COUNT; slot++) {
      const s = this.slotStack(slot), key = stackKey(s);
      if (key === this.slots[slot]) continue;
      this.slots[slot] = key;
      this.send([CB.ContainerSetSlot, slot, itemToWire(s)]);
    }
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

  /** it's gone (left, dropped, or the connection went): its player leaves the level */
  gone(reason: string): void {
    if (this.state === 'gone') return;
    const was = this.state;
    this.state = 'gone';
    this.out = [];
    const p = this.player;
    if (p) {
      if (this.crack) this.level.destroyBlockProgress(p.id, 0, 0, 0, -1);
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

  /** (stage 1) nothing hurts a guest's player, not even /kill or the void: a guest has no dying yet */
  override isInvulnerableTo(_source: string): boolean {
    return true;
  }
}

/** a swing that started since last seen (LivingEntity.swing sets swingTime back to -1) */
function swungAgain(p: Player, s: { swinging: boolean; swingTime: number }): boolean {
  return p.swinging && (!s.swinging || p.swingTime < s.swingTime);
}
