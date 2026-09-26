// A guest's end of the connection (vanilla ClientPacketListener with the bits of Minecraft.tick and ClientLevel that
// run for a world that's someone else's): it says hello, takes the world in as the host sends it (checked: it came
// from another game), runs its own player and eases the others along, and tells the host each tick where its player
// is and what its buttons did. The host decides everything else.

import type { Value } from '../codec';
import { decode, encode, CodecError } from '../codec';
import { SB, CB, Action, PoseFlag, checkPacket, checkLogin, SLOT_ARMOR, SLOT_OFFHAND, SLOT_COUNT, ANIMATE_SWING_OFF_HAND, type LoginInfo } from '../protocol';
import { PROTOCOL_VERSION, BUILD_ID, MAX_HOST_MESSAGE, MAX_HOST_BACKLOG, MAX_HOST_BACKLOG_BYTES, TIMEOUT_TICKS, MAX_CHAT } from '../config';
import { HOST_PEER, type PeerId, type Transport } from '../transport/transport';
import { itemFromHost, itemToWire } from '../items';
import { poseFlags, stackKey } from '../playerState';
import { columnFromSections, biomesOk, savedBlockEntity, blockEntityFromHost } from '../chunkData';
import { replayParticles } from '../effects';
import { MirrorPlayer } from './mirrorPlayer';
import type { Level } from '../../game/level';
import type { Player } from '../../entity/player';
import type { ItemStack } from '../../item/item';
import type { SavedBlockEntity } from '../../world/blockEntity';
import { Chunk } from '../../world/chunk';
import { MIN_Y, MAX_Y } from '../../world/constants';
import { stateCount } from '../../world/block';

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
}

export interface GuestIdentity {
  name: string;
  uuid: string;
  viewDistance: number;
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
  private out: Value[] = [];
  private quiet = 0;
  /** the other players, by the host's ids */
  readonly mirrors = new Map<number, MirrorPlayer>();
  /** chunks being lit, with what the host changed in them meanwhile */
  private readonly pending = new Map<number, { updates: number[]; blockEntities: Map<string, SavedBlockEntity> }>();
  private rainTarget = 0;
  private thunderTarget = 0;
  // this tick's buttons
  private attackPressed = false;
  private usePressed = false;
  private attackHeld = false;
  private useHeld = false;
  /** our inventory as the host last heard it, slot by slot, and our hotbar slot */
  private readonly slots: string[] = new Array(SLOT_COUNT).fill('');
  private invVersion = -1;
  private selected = -1;
  /** why it ended, if it has */
  endReason = '';

  constructor(readonly transport: Transport, readonly hooks: ClientHooks, readonly me: GuestIdentity) {
    transport.onPeer((peer, joined) => {
      if (peer !== HOST_PEER || this.state === 'closed') return;
      if (joined) {
        this.state = 'login';
        this.send([SB.Hello, PROTOCOL_VERSION, BUILD_ID, me.name, me.uuid, me.viewDistance]);
        this.flush();
      } else if (this.state === 'connecting') this.lost("Couldn't connect: nobody answered");
      // (what the host said before it went is read first, at the next tick: its Disconnect says why)
      else this.hostGone = true;
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
        try {
          this.handle(p as Value[]);
        } catch (e) {
          console.error('multiplayer: handling a packet from the host', e);
          return this.fail('something went wrong with it');
        }
        if (this.isClosed) return;
      }
    }
    if (this.hostGone) this.lost('Connection lost');
  }

  private get isClosed(): boolean {
    return this.state === 'closed';
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
            m.remove();
            this.mirrors.delete(eid);
          }
          level.destroyProgress.delete(eid);
        }
        return;
      case CB.MoveEntity: {
        const m = this.mirrors.get(p[1] as number);
        if (!m) return;
        m.lerpTo(p[2] as number, p[3] as number, p[4] as number, p[5] as number, p[6] as number, p[7] as number, p[8] as number);
        m.setPose(p[9] as number);
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
        replayParticles(level.particles, p[1] as string, p[2] as Value[]);
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
    }
  }

  private login(info: LoginInfo): void {
    this.info = info;
    this.playerId = info.playerId;
    const { level, player, chunks } = this.hooks.login(info);
    this.level = level;
    this.player = player;
    this.sink = chunks;
    this.rainTarget = info.rainLevel;
    this.thunderTarget = info.thunderLevel;
    this.state = 'play';
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
    if (id === this.playerId) return;
    this.mirrors.get(id)?.remove();
    const m = new MirrorPlayer(this.level!, id);
    m.uuid = (p[2] as string).toLowerCase();
    m.profileName = (p[3] as string).replace(/[\u0000-\u001f\u007f§]/g, '');
    m.setGameMode(p[12] === 'survival' || p[12] === 'adventure' || p[12] === 'spectator' ? p[12] : 'creative');
    m.place(p[4] as number, p[5] as number, p[6] as number, p[7] as number, p[8] as number, p[9] as number, p[10] as number, p[11] as number);
    (p[13] as Value[]).forEach((it, slot) => setEquipment(m, slot, itemFromHost(it)));
    this.mirrors.set(id, m);
    this.level!.addMirrorEntity(m);
  }

  // -------------------------------------------------------------------------
  // the guest's own tick

  /** this tick's attack and use buttons (Game.tick's clicks and held buttons, which the host acts on) */
  input(attackPressed: boolean, attackHeld: boolean, usePressed: boolean, useHeld: boolean): void {
    this.attackPressed ||= attackPressed;
    this.usePressed ||= usePressed;
    this.attackHeld = attackHeld;
    this.useHeld = useHeld;
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
    if (!p.removed && level.world.isLoaded(Math.floor(p.x), Math.floor(p.z))) p.tick();
    for (const m of this.mirrors.values()) if (!m.removed) m.tick();
    level.pruneRemoved();
  }

  /** (end of the guest's tick) where our player is, what the buttons did, what's changed in the inventory: sent */
  sendTick(): void {
    if (this.state !== 'play') return this.flush();
    const p = this.player!;
    let flags = poseFlags(p);
    if (this.attackHeld) flags |= PoseFlag.ATTACK_HELD;
    if (this.useHeld) flags |= PoseFlag.USE_HELD;
    // (the look first, so the host clicks where we looked)
    this.send([SB.MovePlayer, p.x, p.y, p.z, p.yaw, p.pitch, flags]);
    const inv = p.inventory;
    if (inv.selected !== this.selected) {
      this.selected = inv.selected;
      this.send([SB.SetCarriedItem, inv.selected]);
    }
    if (inv.version !== this.invVersion) {
      this.invVersion = inv.version;
      for (let slot = 0; slot < SLOT_COUNT; slot++) {
        const s = slotStack(p, slot), key = stackKey(s);
        if (key === this.slots[slot]) continue;
        this.slots[slot] = key;
        this.send([SB.SetCreativeModeSlot, slot, itemToWire(s)]);
      }
    }
    if (this.attackPressed) this.send([SB.PlayerAction, Action.ATTACK]);
    if (this.usePressed) this.send([SB.PlayerAction, Action.USE]);
    this.attackPressed = this.usePressed = false;
    this.flush();
  }

  /** receive, tick and send, in the order the game does them (for the tests; the game calls them between its own steps) */
  tick(): void {
    this.receive();
    this.tickLevel();
    this.sendTick();
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

  private flush(): void {
    if (!this.out.length || this.state === 'closed') return;
    const msg = this.out;
    this.out = [];
    this.transport.send(HOST_PEER, encode(msg));
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
      this.out = [[SB.Disconnect, `Bad data from the host: ${why}`]];
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
