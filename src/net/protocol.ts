// The multiplayer packets, by vanilla's names (net.minecraft.network.protocol.game.*): each one an array, [id, ...fields],
// and a tick's worth of them bundled into one message. Before anything reads a packet, `checkPacket` checks every field's
// type and range; a packet that fails (or has an id nobody knows) drops the peer that sent it. What a field means (a
// block state that exists, a move that isn't too far) is the receiver's to check on top.

import type { Value } from './codec';
import { MAX_CHAT, PROTOCOL_VERSION } from './config';
import { SECTIONS, CAVE_BIOME_LEVELS } from '../world/constants';

/**
 * (a disconnect's reason, when something went wrong with a packet) the packet's name and what went wrong, short enough
 * to read on the Disconnected screen, so that what it says can be passed on: SB's 12 → "UseItemOn", an error's message
 */
export function packetFault(table: Readonly<Record<string, number>>, id: unknown, e: unknown): string {
  const name = Object.keys(table).find((k) => table[k] === id) ?? String(id);
  const what = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
  return `${name}: ${what}`.slice(0, 160);
}

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
  /**
   * [containerId, stateId, slot, button, type (CLICK_TYPES), changed [[slot, stack hash]...], carried's hash]: a click in
   * the menu it has open, with what the guest's game made of it: the slots it changed and what's on its cursor, each
   * as a hash of the stack (net/menus.ts stackHash; vanilla ServerboundContainerClickPacket's HashedStacks)
   */
  ContainerClick: 10,
  /** [containerId, button]: an enchanting offer, a stonecutter's recipe, a loom's pattern, a lectern's page (vanilla ServerboundContainerButtonClickPacket) */
  ContainerButtonClick: 11,
  /** [containerId]: the guest closed its menu (vanilla ServerboundContainerClosePacket) */
  ContainerClose: 12,
  /** [name]: what's typed in the anvil's box (vanilla ServerboundRenameItemPacket) */
  RenameItem: 13,
  /** [index]: the trade picked in a villager's list (vanilla ServerboundSelectTradePacket) */
  SelectTrade: 14,
  /** [containerId, slot, enabled]: a crafter's grid slot switched on or off (vanilla ServerboundContainerSlotStateChangedPacket) */
  SlotStateChanged: 15,
  /** [slot]: survival's pick-block, a slot of the inventory brought to hand (vanilla ServerboundPickItemPacket) */
  PickItem: 16,
  /** [action]: 0 respawn (vanilla ServerboundClientCommandPacket PERFORM_RESPAWN) */
  ClientCommand: 17,
  /** [slot, pages, title or null]: a book and quill written in, or signed with the title (vanilla ServerboundEditBookPacket) */
  EditBook: 18,
  /** [containerId, recipe (a recipe book id), all]: a recipe clicked in the recipe book, its ingredients to go in the grid (vanilla ServerboundPlaceRecipePacket) */
  PlaceRecipe: 19,
  /**
   * (stage 5) [missing, waited, placed]: still on the loading screen a while after it should have come in: the chunks it
   * waits for that haven't come (cx, cz, cx, cz, ...), how long it's waited (ticks), and whether the host had put it in
   * place. The host sends those again, or puts it in (net/server/session.ts resync); nothing like it in vanilla
   */
  Resync: 20,
  /**
   * (signs) [x, y, z, front, line 1, line 2, line 3, line 4]: the lines typed in a sign's editor, for the side it was
   * opened for (vanilla ServerboundSignUpdatePacket). Numbered from 40, out of the way of packets added elsewhere
   */
  SignUpdate: 40,
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
  /**
   * [health, max health, absorption, food, saturation, air, on fire, ticks frozen, hurt time, hurt direction, death
   * time, invulnerable time]: the guest's own player as the host has it (vanilla ClientboundSetHealthPacket, with
   * what SetEntityData and the hurt animation tell a player of itself)
   */
  PlayerStatus: 25,
  /** [dx, dy, dz]: the guest's player knocked or blown about (vanilla ClientboundSetEntityMotionPacket for its own player) */
  SetEntityMotion: 26,
  /** [message]: the guest's player died (vanilla ClientboundPlayerCombatKillPacket: the death screen) */
  PlayerCombatKill: 27,
  /** []: back alive (vanilla ClientboundRespawnPacket; where comes in a PlayerPosition) */
  Respawn: 28,
  /** [game mode] (vanilla ClientboundGameEventPacket CHANGE_GAME_MODE) */
  GameMode: 29,
  /** [slot 0-8]: the hotbar slot the host put in its hand (vanilla ClientboundSetCarriedItemPacket) */
  SetCarriedItem: 30,
  /** [item id, ticks left, of how many (0: not said)]: an item cooling down, or done if 0 are left (vanilla ClientboundCooldownPacket) */
  SetCooldown: 31,
  /** [effects: [id, amplifier, duration, ambient, visible, icon]...]: the guest's own player's effects (vanilla UpdateMobEffect / RemoveMobEffect) */
  UpdateEffects: 32,
  /** [sleeping at [x, y, z] or null]: the guest's player in bed or out (vanilla's sleeping pose and ClientboundGameEvent) */
  SetSleeping: 33,
  /** [hand (0 main, 1 off) or -1, duration, left]: the item the guest's player is using, if any (vanilla DATA_LIVING_ENTITY_FLAGS) */
  SetUsingItem: 34,
  /** [containerId, kind (MENU_KINDS), title, extra]: a menu opened for the guest (vanilla ClientboundOpenScreenPacket) */
  OpenScreen: 35,
  /** [containerId, stateId, items (every slot), carried]: everything in the menu (vanilla ClientboundContainerSetContentPacket) */
  ContainerSetContent: 36,
  /** [containerId, stateId, slot, item]: a slot of the menu that isn't the inventory's (vanilla ClientboundContainerSetSlotPacket) */
  MenuSetSlot: 37,
  /** [containerId, stateId, item]: what's on the guest's cursor (vanilla ClientboundContainerSetSlotPacket, slot -1) */
  SetCarried: 38,
  /** [containerId, index, value]: a furnace's flame, a brewing stand's bubbles, an enchanting table's offers (vanilla ClientboundContainerSetDataPacket) */
  ContainerSetData: 39,
  /** [containerId]: the host closed the guest's menu (vanilla ClientboundContainerClosePacket) */
  ContainerClose: 40,
  /** [containerId, offers, level, xp, show progress, can restock]: a trader's offers (vanilla ClientboundMerchantOffersPacket) */
  MerchantOffers: 41,
  /** [hand 0 or 1]: a book used, to be read or written in (vanilla ClientboundOpenBookPacket, and the book and quill's screen) */
  OpenBook: 42,
  /** [containerId, recipe]: a recipe clicked in the recipe book that the guest hasn't the ingredients for, shown in outline (vanilla ClientboundPlaceGhostRecipePacket) */
  PlaceGhostRecipe: 43,
  /**
   * [recipes (recipe book ids), replace]: recipes the guest's player has unlocked, newly (a toast, the tab bouncing) or,
   * replacing what it knew, all of them (vanilla ClientboundRecipeBookAddPacket)
   */
  RecipeBookAdd: 44,
  /**
   * [dimension, reason (RECEIVING_REASONS)]: the host went to another dimension and takes the guest along: its world is
   * let go and the loading screen shown (the nether portal's swirl, the end portal's stars, or neither) till the host
   * puts its player there (vanilla ClientboundRespawnPacket, with ReceivingLevelScreen's reason)
   */
  ChangeDimension: 45,
  /**
   * (signs) [x, y, z, front]: the sign's editor opened for the guest's player, for its front or its back (vanilla
   * ClientboundOpenSignEditorPacket; the block and its text come just before, as vanilla's ServerPlayer.openTextEdit
   * sends the block first). Numbered from 80, out of the way of packets added elsewhere
   */
  OpenSignEditor: 80,
} as const;

/** the dimensions there are (vanilla's three: a guest takes no other) */
export const DIMENSION_IDS: readonly string[] = ['overworld', 'the_nether', 'the_end'];
/** vanilla ReceivingLevelScreen.Reason: what the loading screen shows while changing dimension */
export const RECEIVING_REASONS = ['nether_portal', 'end_portal', 'other'] as const;
export type ReceivingReason = (typeof RECEIVING_REASONS)[number];

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
  /** the swap key: hand and offhand trade (vanilla SWAP_ITEM_WITH_OFFHAND) */
  SWAP_HANDS: 5,
  /** Leave Bed (vanilla ServerboundPlayerCommandPacket STOP_SLEEPING) */
  STOP_SLEEPING: 6,
  /** the inventory key while riding: a horse's inventory, a chest boat's chest (vanilla ServerboundPlayerCommandPacket OPEN_INVENTORY) */
  OPEN_INVENTORY: 7,
} as const;

/** SB.ContainerClick's click types, in vanilla ClickType's order */
export const CLICK_TYPES = ['pickup', 'quick_move', 'swap', 'clone', 'throw', 'quick_craft', 'pickup_all'] as const;

/** the menus a host opens for a guest (CB.OpenScreen's kind: vanilla MenuType) */
export const MENU_KINDS = [
  'crafting', 'furnace', 'smoker', 'blast_furnace', 'chest', 'shulker_box', 'brewing_stand', 'enchantment', 'anvil', 'grindstone',
  'merchant', 'stonecutter', 'smithing', 'loom', 'cartography', 'lectern', 'dispenser', 'dropper', 'hopper', 'crafter', 'horse',
] as const;
export type MenuKind = (typeof MENU_KINDS)[number];
/** the most slots a menu has (a chest's 27 or a horse's 17, and the inventory's 36) */
export const MAX_MENU_SLOTS = 64;
/** the id of the menu a player always has (vanilla InventoryMenu's containerId 0) */
export const INVENTORY_MENU = 0;

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
  /** (guest → host only) it ran into a wall this tick (vanilla ServerboundMovePlayerPacket's horizontalCollision: a glide into one hurts) */
  HORIZONTAL_COLLISION: 131072,
} as const;
const ALL_FLAGS = 262143;

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
  /** (stage 4) flying as it was when it left, if its game mode lets it (vanilla ClientboundPlayerAbilitiesPacket; absent: not) */
  flying?: boolean;
  viewDistance: number;
  hostName: string;
}

// ---------------------------------------------------------------------------
// field checks

type Check = (v: Value | undefined) => boolean;

/** the world's edge (vanilla WorldBorder's largest: 29,999,984) */
export const WORLD_EDGE = 30_000_000;
/** vanilla Level.clampVertical */
export const WORLD_HEIGHT_EDGE = 20_000_000;

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
// (a name that isn't one is turned away with a word on what a name is: ServerPlayerSession.hello; the join code, as typed)
SERVERBOUND[SB.Hello] = [int(0, 0x7fffffff), str(1, 64), str(0, 64), UUID, int(2, 32), str(0, 32)];
SERVERBOUND[SB.KeepAlive] = [ID];
SERVERBOUND[SB.MovePlayer] = [X, Y, X, ANGLE, PITCH, FLAGS, int(-1, 0x7fffffff)];
SERVERBOUND[SB.AcceptTeleportation] = [ID];
SERVERBOUND[SB.PlayerAction] = [int(0, 7), int(0, 100)];
SERVERBOUND[SB.SetCarriedItem] = [int(0, 8)];
SERVERBOUND[SB.SetCreativeModeSlot] = [int(-1, SLOT_COUNT - 1), ITEM];
SERVERBOUND[SB.Chat] = [str(1, MAX_CHAT)];
SERVERBOUND[SB.ChatCommand] = [str(0, MAX_CHAT)];
SERVERBOUND[SB.Disconnect] = [TEXT(256)];
const CONTAINER = int(0, 255), STATE = int(0, 0x7fff), SLOT = int(0, MAX_MENU_SLOTS - 1);
// (a slot -999 is outside the window; buttons as vanilla's click types use them, a drag's up to 10, a swap's key 0-8 or 40)
const HASH = int(-0x80000000, 0x7fffffff);
SERVERBOUND[SB.ContainerClick] = [CONTAINER, STATE, int(-999, MAX_MENU_SLOTS - 1), int(0, 40), int(0, CLICK_TYPES.length - 1), arr(MAX_MENU_SLOTS, (v) => Array.isArray(v) && v.length === 2 && SLOT(v[0]) && HASH(v[1])), HASH];
SERVERBOUND[SB.ContainerButtonClick] = [CONTAINER, int(0, 4095)];
SERVERBOUND[SB.ContainerClose] = [CONTAINER];
// (vanilla AnvilMenu.MAX_NAME_LENGTH)
SERVERBOUND[SB.RenameItem] = [str(0, 50)];
SERVERBOUND[SB.SelectTrade] = [int(0, 255)];
SERVERBOUND[SB.SlotStateChanged] = [CONTAINER, int(0, 8), bool];
SERVERBOUND[SB.PickItem] = [int(0, 35)];
SERVERBOUND[SB.ClientCommand] = [int(0, 0)];
// (vanilla WritableBookContent: 100 pages of 1024 characters; a title of 32)
SERVERBOUND[SB.EditBook] = [int(0, 40), arr(100, str(0, 1024)), orNull(str(1, 32))];
// (a recipe book id: the longest is 75 characters, cracked_polished_blackstone_bricks_from_smelting_polished_blackstone_bricks)
const RECIPE = str(1, 128);
SERVERBOUND[SB.PlaceRecipe] = [CONTAINER, RECIPE, bool];
// (the 5 by 5 a loading screen waits for, at most: net/chunkData.ts loadingChunks)
SERVERBOUND[SB.Resync] = [(v) => arr(50, CHUNK)(v) && (v as Value[]).length % 2 === 0, int(0, 0x7fffffff), bool];
// (signs: vanilla ServerboundSignUpdatePacket reads each line with readUtf(384))
const SIGN_LINE = str(0, 384);
SERVERBOUND[SB.SignUpdate] = [BX, BY, BX, bool, SIGN_LINE, SIGN_LINE, SIGN_LINE, SIGN_LINE];

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
const HEALTH = num(0, 4096);
CLIENTBOUND[CB.PlayerStatus] = [HEALTH, num(1, 4096), HEALTH, int(0, 20), num(0, 20), int(-20, 4096), bool, int(0, 0x7fffffff), int(0, 1000), ANGLE, int(0, 0x7fffffff), int(0, 1000)];
CLIENTBOUND[CB.SetEntityMotion] = [num(-10, 10), num(-10, 10), num(-10, 10)];
CLIENTBOUND[CB.PlayerCombatKill] = [TEXT(1024)];
CLIENTBOUND[CB.Respawn] = [];
CLIENTBOUND[CB.GameMode] = [str(1, 16)];
CLIENTBOUND[CB.SetCarriedItem] = [int(0, 8)];
CLIENTBOUND[CB.SetCooldown] = [str(1, 64), int(0, 72000), int(0, 72000)];
CLIENTBOUND[CB.UpdateEffects] = [arr(64, (v) => Array.isArray(v) && v.length === 6 && str(1, 64)(v[0]) && int(0, 255)(v[1]) && int(-1, 0x7fffffff)(v[2]) && bool(v[3]) && bool(v[4]) && bool(v[5]))];
CLIENTBOUND[CB.SetSleeping] = [orNull((v) => Array.isArray(v) && v.length === 3 && BX(v[0]) && BY(v[1]) && BX(v[2]))];
CLIENTBOUND[CB.SetUsingItem] = [int(-1, 1), int(0, 72000), int(-72000, 72000)];
CLIENTBOUND[CB.OpenScreen] = [int(1, 255), str(1, 32), TEXT(256), obj];
CLIENTBOUND[CB.ContainerSetContent] = [CONTAINER, STATE, arr(MAX_MENU_SLOTS, ITEM), ITEM];
CLIENTBOUND[CB.MenuSetSlot] = [CONTAINER, STATE, SLOT, ITEM];
CLIENTBOUND[CB.SetCarried] = [CONTAINER, STATE, ITEM];
CLIENTBOUND[CB.ContainerSetData] = [CONTAINER, int(0, 31), int(-0x80000000, 0x7fffffff)];
CLIENTBOUND[CB.ContainerClose] = [CONTAINER];
// (an offer: [first price's item, count, second's or null, count, result, uses, max uses, xp, price multiplier, demand, special price])
const COUNT = int(0, 127), BIG = int(-0x80000000, 0x7fffffff);
const OFFER: Check = (v) => Array.isArray(v) && v.length === 11 && str(1, 64)(v[0]) && COUNT(v[1]) && orNull(str(1, 64))(v[2]) && COUNT(v[3]) && v[4] !== null && ITEM(v[4]) && int(0, 0x7fffffff)(v[5]) && int(0, 0x7fffffff)(v[6]) && int(0, 0x7fffffff)(v[7]) && num(0, 1000)(v[8]) && BIG(v[9]) && BIG(v[10]);
CLIENTBOUND[CB.MerchantOffers] = [int(1, 255), arr(64, OFFER), int(0, 5), int(0, 0x7fffffff), bool, bool];
CLIENTBOUND[CB.OpenBook] = [int(0, 1)];
CLIENTBOUND[CB.PlaceGhostRecipe] = [CONTAINER, RECIPE];
// (every recipe in the book at most: inventory/recipeBook.ts has some 800)
CLIENTBOUND[CB.RecipeBookAdd] = [arr(4096, RECIPE), bool];
const DIMENSION: Check = (v) => typeof v === 'string' && DIMENSION_IDS.includes(v);
CLIENTBOUND[CB.OpenSignEditor] = [BX, BY, BX, bool];
CLIENTBOUND[CB.ChangeDimension] = [DIMENSION, (v) => typeof v === 'string' && (RECEIVING_REASONS as readonly string[]).includes(v)];

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
  // (a hello from another version of the game, whose hello may differ, is checked as far as its version: it's told which is the older)
  if (from === 'guest' && id === SB.Hello && p[1] !== PROTOCOL_VERSION && fields[0](p[1])) return null;
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
    ID(o.playerId) && str(0, 64)(o.worldName) && DIMENSION(o.dimension) && str(1, 16)(o.gameMode) && str(1, 16)(o.difficulty) && bool(o.hardcore) &&
    obj(rules) && Object.keys(rules as object).length <= 256 && Object.values(rules as object).every((r) => typeof r === 'boolean' || typeof r === 'number') &&
    num(0, Number.MAX_SAFE_INTEGER)(o.gameTime) && num(-Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER)(o.dayTime) && bool(o.raining) && bool(o.thundering) &&
    num(0, 1)(o.rainLevel) && num(0, 1)(o.thunderLevel) && X(o.x) && Y(o.y) && X(o.z) && ANGLE(o.yRot) && PITCH(o.xRot) && (o.flying === undefined || bool(o.flying)) && int(2, 32)(o.viewDistance) && str(0, 16)(o.hostName);
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
