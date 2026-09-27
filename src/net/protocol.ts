// The multiplayer packets, by vanilla's names (net.minecraft.network.protocol.game.*): each one an array, [id, ...fields],
// and a tick's worth of them bundled into one message. Before anything reads a packet, `checkPacket` checks every field's
// type and range; a packet that fails (or has an id nobody knows) drops the peer that sent it. What a field means (a
// block state that exists, a move that isn't too far) is the receiver's to check on top.

import type { Value } from './codec';
import { MAX_CHAT } from './config';
import { SECTIONS, CAVE_BIOME_LEVELS } from '../world/constants';

/** guest → host (vanilla Serverbound*Packet) */
export const SB = {
  /** [protocol, build, name, uuid, viewDistance]: the first thing a guest says (vanilla ServerboundHelloPacket) */
  Hello: 0,
  /** [id]: the answer to the host's KeepAlive */
  KeepAlive: 1,
  /**
   * [x, y, z, yRot, xRot, flags (PoseFlag: the pose, the buttons held, the movement keys), target]: where the guest's
   * player is, each tick, and the entity under its crosshair (its id, or -1): what its clicks go to (vanilla
   * ServerboundMovePlayerPacket with ServerboundPlayerInputPacket, and ServerboundInteractPacket's entity)
   */
  MovePlayer: 2,
  /** [teleportId]: the guest's player is where the host put it */
  AcceptTeleportation: 3,
  /** [action (Action), argument]: a button pressed this tick; the host does with it what it would with its own player's */
  PlayerAction: 4,
  /** [slot 0-8]: the hotbar slot in hand */
  SetCarriedItem: 5,
  /** [slot (SLOT_*), item or null]: what the guest's creative inventory now has in a slot; slot -1 throws the item out */
  SetCreativeModeSlot: 6,
  /** [text] */
  Chat: 7,
  /** [text, without the slash] */
  ChatCommand: 8,
  /** [reason]: the guest is leaving */
  Disconnect: 9,
} as const;

/** host → guest (vanilla Clientbound*Packet) */
export const CB = {
  /** [LoginInfo] */
  Login: 0,
  /** [reason] */
  Disconnect: 1,
  /** [id] */
  KeepAlive: 2,
  /** [cx, cz, sections (Uint16Array or null) x SECTIONS, biomes, caveBiomes or null, block entities] */
  LevelChunk: 3,
  /** [cx, cz] */
  ForgetLevelChunk: 4,
  /** [Int32Array of x, y, z, state]: blocks that changed this tick (vanilla ClientboundSectionBlocksUpdatePacket) */
  BlockUpdates: 5,
  /** [saved block entity]: what a block entity shows */
  BlockEntityData: 6,
  /** [breaker id, x, y, z, stage 0-9 or -1] (vanilla ClientboundBlockDestructionPacket) */
  BlockDestruction: 7,
  /** [gameTime, dayTime, daylight cycle on] */
  SetTime: 8,
  /** [raining, thundering, rain level, thunder level] (vanilla ClientboundGameEventPacket's weather events) */
  Weather: 9,
  /** [x, y, z, yRot, xRot, teleportId]: where the guest's player is to be (vanilla ClientboundPlayerPositionPacket) */
  PlayerPosition: 10,
  /** [id, uuid, name, x, y, z, yRot, xRot, yHeadRot, yBodyRot, flags, gameMode, equipment (6 items)] */
  AddPlayer: 11,
  /** [ids] */
  RemoveEntities: 12,
  /** [id, x, y, z, yRot, xRot, yHeadRot, yBodyRot, flags]: another player or an entity, as it is this tick (flags: a player's PoseFlag; an entity's ON_GROUND) */
  MoveEntity: 13,
  /** [id, action (ANIMATE_*)] */
  Animate: 14,
  /** [id, slot (EQUIP_*), item or null] */
  SetEquipment: 15,
  /** [name, x, y, z, volume, pitch] */
  Sound: 16,
  /** [method, args]: a particle sink call (net/effects.ts) */
  LevelParticles: 17,
  /** [text, overlay]: a line of chat, or the action bar's */
  SystemChat: 18,
  /** [slot (SLOT_*), item or null]: what the host did to the guest's own inventory (vanilla ClientboundContainerSetSlotPacket) */
  ContainerSetSlot: 19,
  /**
   * [id, type, record or null, x, y, z, yRot, xRot, yHeadRot, yBodyRot, flags, data]: an entity comes into view, made
   * from its record (net/entityNet.ts), then given its fields (net/entityData.ts)
   */
  AddEntity: 20,
  /** [id, data]: an entity's fields that changed (vanilla ClientboundSetEntityDataPacket) */
  SetEntityData: 21,
  /** [vehicle id, rider ids]: who rides it, in its seats' order (vanilla ClientboundSetPassengersPacket) */
  SetPassengers: 22,
  /** [taken id, taker id, amount]: something picked up (vanilla ClientboundTakeItemEntityPacket) */
  TakeItemEntity: 23,
  /** [progress 0-1, level, total]: the guest's own experience (vanilla ClientboundSetExperiencePacket) */
  SetExperience: 24,
} as const;

/** SB.PlayerAction's actions (vanilla ServerboundPlayerActionPacket.Action / ServerboundUseItemPacket): what the host does with its own player's clicks */
export const Action = {
  /** the attack button went down: vanilla START_DESTROY_BLOCK, or an attack on the entity looked at */
  ATTACK: 0,
  /** the use button went down: vanilla UseItemOn, Interact or UseItem, whichever the look finds */
  USE: 1,
  /** the drop key: one of what's in hand (vanilla DROP_ITEM) */
  DROP: 2,
  /** the drop key with Ctrl: the whole stack (vanilla DROP_ALL_ITEMS) */
  DROP_ALL: 3,
  /** a jump charged on the mount being steered: the argument is its power, 0-100 (vanilla ServerboundPlayerCommandPacket START_RIDING_JUMP) */
  RIDING_JUMP: 4,
} as const;

/** a player's pose and state, as bits (vanilla Entity.DATA_SHARED_FLAGS_ID and DATA_POSE) */
export const PoseFlag = {
  ON_GROUND: 1,
  /** shift held (vanilla isShiftKeyDown) */
  SHIFT: 2,
  CROUCHING: 4,
  SPRINTING: 8,
  SWIMMING: 16,
  /** in the swimming (or crawling) pose */
  SWIM_POSE: 32,
  FALL_FLYING: 64,
  GLIDE_POSE: 128,
  FLYING: 256,
  /** (a riptide spin) */
  SPIN_POSE: 512,
  /** (guest → host only) the attack button is held */
  ATTACK_HELD: 1024,
  /** (guest → host only) the use button is held */
  USE_HELD: 2048,
  /** (guest → host only) the movement keys (vanilla ServerboundPlayerInputPacket: what a mount or a boat is steered by) */
  FORWARD: 4096,
  BACK: 8192,
  LEFT: 16384,
  RIGHT: 32768,
  JUMP: 65536,
} as const;
const ALL_FLAGS = 131071;

/** CB.Animate's actions (vanilla ClientboundAnimatePacket) */
export const ANIMATE_SWING_MAIN_HAND = 0;
export const ANIMATE_SWING_OFF_HAND = 3;

/** CB.SetEquipment's slots (vanilla EquipmentSlot order) */
export const EQUIP_MAINHAND = 0, EQUIP_OFFHAND = 1, EQUIP_FEET = 2, EQUIP_LEGS = 3, EQUIP_CHEST = 4, EQUIP_HEAD = 5;

/** SB.SetCreativeModeSlot's slots: the 36 of the inventory (hotbar first), the armour (feet to head), the offhand */
export const SLOT_ARMOR = 36, SLOT_OFFHAND = 40, SLOT_COUNT = 41;

/** what the host tells a guest as it joins (vanilla ClientboundLoginPacket) */
export interface LoginInfo {
  playerId: number;
  worldName: string;
  dimension: string;
  gameMode: string;
  difficulty: string;
  hardcore: boolean;
  gameRules: Record<string, boolean | number>;
  gameTime: number;
  dayTime: number;
  raining: boolean;
  thundering: boolean;
  rainLevel: number;
  thunderLevel: number;
  x: number;
  y: number;
  z: number;
  yRot: number;
  xRot: number;
  viewDistance: number;
  hostName: string;
}

// ---------------------------------------------------------------------------
// field checks

type Check = (v: Value | undefined) => boolean;

/** the world's edge (vanilla WorldBorder's largest: 29,999,984) */
export const WORLD_EDGE = 30_000_000;
/** vanilla Level.clampVertical */
const WORLD_HEIGHT_EDGE = 20_000_000;

const int = (min: number, max: number): Check => (v) => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
const num = (min: number, max: number): Check => (v) => typeof v === 'number' && v >= min && v <= max;
const bool: Check = (v) => typeof v === 'boolean';
const str = (min: number, max: number, re?: RegExp): Check => (v) => typeof v === 'string' && v.length >= min && v.length <= max && (!re || re.test(v));
const orNull = (c: Check): Check => (v) => v === null || c(v);
const u8 = (min: number, max: number): Check => (v) => v instanceof Uint8Array && v.length >= min && v.length <= max;
const obj: Check = (v) => typeof v === 'object' && v !== null && !Array.isArray(v) && !ArrayBuffer.isView(v);
const arr = (max: number, each: Check): Check => (v) => Array.isArray(v) && v.length <= max && v.every(each);

const X = num(-WORLD_EDGE, WORLD_EDGE), Y = num(-WORLD_HEIGHT_EDGE, WORLD_HEIGHT_EDGE);
const ANGLE = num(-1e7, 1e7), PITCH = num(-90, 90);
const BX = int(-WORLD_EDGE, WORLD_EDGE), BY = int(-WORLD_HEIGHT_EDGE, WORLD_HEIGHT_EDGE);
const CHUNK = int(-(WORLD_EDGE >> 4) - 1, (WORLD_EDGE >> 4) + 1);
const ID = int(0, 0x7fffffff);
const UUID = str(1, 36, /^[0-9a-f-]+$/i);
const TEXT = (max: number): Check => str(0, max);
const FLAGS = int(0, ALL_FLAGS);
/** an item: [id, count, damage, tag or null] (what it means, net/items.ts checks) */
export const ITEM: Check = orNull((v) => Array.isArray(v) && v.length === 4 && str(1, 64)(v[0]) && int(1, 127)(v[1]) && int(0, 65535)(v[2]) && orNull(obj)(v[3]));
const SECTION = (v: Value | undefined) => v === null || (v instanceof Uint16Array && v.length === 4096);

const SERVERBOUND: Check[][] = [];
// (a name that isn't one is turned away with a word on what a name is: ServerPlayerSession.hello)
SERVERBOUND[SB.Hello] = [int(0, 0x7fffffff), str(1, 64), str(0, 64), UUID, int(2, 32)];
SERVERBOUND[SB.KeepAlive] = [ID];
SERVERBOUND[SB.MovePlayer] = [X, Y, X, ANGLE, PITCH, FLAGS, int(-1, 0x7fffffff)];
SERVERBOUND[SB.AcceptTeleportation] = [ID];
SERVERBOUND[SB.PlayerAction] = [int(0, 4), int(0, 100)];
SERVERBOUND[SB.SetCarriedItem] = [int(0, 8)];
SERVERBOUND[SB.SetCreativeModeSlot] = [int(-1, SLOT_COUNT - 1), ITEM];
SERVERBOUND[SB.Chat] = [str(1, MAX_CHAT)];
SERVERBOUND[SB.ChatCommand] = [str(0, MAX_CHAT)];
SERVERBOUND[SB.Disconnect] = [TEXT(256)];

const CLIENTBOUND: Check[][] = [];
CLIENTBOUND[CB.Login] = [obj];
CLIENTBOUND[CB.Disconnect] = [TEXT(1024)];
CLIENTBOUND[CB.KeepAlive] = [ID];
CLIENTBOUND[CB.LevelChunk] = [CHUNK, CHUNK, (v) => Array.isArray(v) && v.length === SECTIONS && v.every(SECTION), u8(256, 256), orNull(u8(CAVE_BIOME_LEVELS * 16, CAVE_BIOME_LEVELS * 16)), arr(65536, obj)];
CLIENTBOUND[CB.ForgetLevelChunk] = [CHUNK, CHUNK];
CLIENTBOUND[CB.BlockUpdates] = [(v) => v instanceof Int32Array && v.length % 4 === 0];
CLIENTBOUND[CB.BlockEntityData] = [obj];
CLIENTBOUND[CB.BlockDestruction] = [ID, BX, BY, BX, int(-1, 9)];
CLIENTBOUND[CB.SetTime] = [num(0, Number.MAX_SAFE_INTEGER), num(-Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER), bool];
CLIENTBOUND[CB.Weather] = [bool, bool, num(0, 1), num(0, 1)];
CLIENTBOUND[CB.PlayerPosition] = [X, Y, X, ANGLE, PITCH, ID];
CLIENTBOUND[CB.AddPlayer] = [ID, UUID, str(1, 16), X, Y, X, ANGLE, PITCH, ANGLE, ANGLE, FLAGS, str(1, 16), (v) => Array.isArray(v) && v.length === 6 && v.every(ITEM)];
CLIENTBOUND[CB.RemoveEntities] = [arr(4096, ID)];
CLIENTBOUND[CB.MoveEntity] = [ID, X, Y, X, ANGLE, ANGLE, ANGLE, ANGLE, FLAGS];
CLIENTBOUND[CB.Animate] = [ID, int(0, 5)];
CLIENTBOUND[CB.SetEquipment] = [ID, int(0, 5), ITEM];
CLIENTBOUND[CB.Sound] = [str(1, 128), X, Y, X, num(0, 1024), num(0, 16)];
// (a rocket's stars go as a list, which net/effects.ts checks)
CLIENTBOUND[CB.LevelParticles] = [str(1, 32), arr(16, (v) => typeof v === 'number' || str(0, 64)(v) || Array.isArray(v))];
CLIENTBOUND[CB.SystemChat] = [TEXT(4096), bool];
CLIENTBOUND[CB.ContainerSetSlot] = [int(0, SLOT_COUNT - 1), ITEM];
CLIENTBOUND[CB.AddEntity] = [ID, str(1, 32, /^[a-z_]+$/), orNull(obj), X, Y, X, ANGLE, ANGLE, ANGLE, ANGLE, FLAGS, obj];
CLIENTBOUND[CB.SetEntityData] = [ID, obj];
CLIENTBOUND[CB.SetPassengers] = [ID, arr(64, ID)];
CLIENTBOUND[CB.TakeItemEntity] = [ID, ID, int(0, 127)];
CLIENTBOUND[CB.SetExperience] = [num(0, 1), int(0, 0x7fffffff), int(0, 0x7fffffff)];

/**
 * the packet `p` if it's one `from` could send with fields of the right types and ranges, else a reason to drop whoever
 * sent it
 */
export function checkPacket(p: Value, from: 'guest' | 'host'): string | null {
  if (!Array.isArray(p) || p.length === 0) return 'not a packet';
  const id = p[0];
  const table = from === 'guest' ? SERVERBOUND : CLIENTBOUND;
  const fields = typeof id === 'number' && Number.isInteger(id) ? table[id] : undefined;
  if (!fields) return `unknown packet ${String(id).slice(0, 16)}`;
  if (p.length !== fields.length + 1) return `packet ${id}: ${p.length - 1} fields`;
  for (let i = 0; i < fields.length; i++) if (!fields[i](p[i + 1])) return `packet ${id}: bad field ${i}`;
  return null;
}

/** the checks on a LoginInfo's fields (CB.Login carries it as an object) */
export function checkLogin(v: Value): LoginInfo | null {
  if (!obj(v)) return null;
  const o = v as Record<string, Value>;
  const rules = o.gameRules;
  const ok =
    ID(o.playerId) && str(0, 64)(o.worldName) && str(1, 32)(o.dimension) && str(1, 16)(o.gameMode) && str(1, 16)(o.difficulty) && bool(o.hardcore) &&
    obj(rules) && Object.keys(rules as object).length <= 256 && Object.values(rules as object).every((r) => typeof r === 'boolean' || typeof r === 'number') &&
    num(0, Number.MAX_SAFE_INTEGER)(o.gameTime) && num(-Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER)(o.dayTime) && bool(o.raining) && bool(o.thundering) &&
    num(0, 1)(o.rainLevel) && num(0, 1)(o.thunderLevel) && X(o.x) && Y(o.y) && X(o.z) && ANGLE(o.yRot) && PITCH(o.xRot) && int(2, 32)(o.viewDistance) && str(0, 16)(o.hostName);
  return ok ? (o as unknown as LoginInfo) : null;
}

/** vanilla StringUtil.isAllowedChatCharacter: no formatting sign, no control characters */
export function isAllowedChat(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 0xa7 || c < 32 || c === 127) return false;
  }
  return true;
}
