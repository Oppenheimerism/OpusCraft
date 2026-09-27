// Multiplayer settings: the one switch for the entry points, the protocol's version and its limits.

/**
 * Multiplayer on or off for everyone: false hides the "Open to LAN" and "Multiplayer" buttons (they show greyed out,
 * as before there was multiplayer) and ignores the ?mp= URL flags. Nothing else needs to change to switch it off.
 */
export const MULTIPLAYER_ENABLED = true;

/** bumped whenever a packet changes; host and guest must agree (vanilla SharedConstants.getProtocolVersion) */
export const PROTOCOL_VERSION = 6;

/** (vite.config.ts: a hash of src/ in a build) */
declare const __BUILD_ID__: string | undefined;
/**
 * this build's fingerprint: host and guest must run the same code, since the guest trusts the host's block and item
 * ids to mean the same things. 'dev' outside a build (tests, the dev server)
 */
export const BUILD_ID: string = typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'dev';

/**
 * the biggest message a guest may send the host (a tick's packets bundled; a book of 100 pages of 1024 characters, as
 * vanilla's ServerboundEditBookPacket allows, is the biggest single one)
 */
export const MAX_GUEST_MESSAGE = 320 * 1024;
/** the biggest message the host may send a guest (a tick's worth of chunks) */
export const MAX_HOST_MESSAGE = 16 * 1024 * 1024;
/** the most packets in one guest message (a tick's worth; more is someone flooding) */
export const MAX_GUEST_PACKETS = 64;

/** vanilla LAN: the host names itself on the LAN every 1.5 s; here every second, and a world not heard of for 3 s is gone */
export const ANNOUNCE_TICKS = 20;
export const ANNOUNCE_EXPIRE_MS = 3000;

/** vanilla ServerGamePacketListenerImpl: a keep-alive every 15 s, and a guest that hasn't answered for 30 s is gone */
export const KEEPALIVE_TICKS = 15 * 20;
export const TIMEOUT_TICKS = 30 * 20;

/** how far round a guest the host sends chunks (vanilla's view distance, capped as a LAN server would) */
export const GUEST_VIEW_DISTANCE = 8;
/** the most chunks a host sends a guest in one tick (nearest first) */
export const CHUNKS_PER_TICK = 6;

/** guests' names: vanilla's rules (3 to 16 of A-Z, a-z, 0-9 and _) */
export const NAME_PATTERN = /^[A-Za-z0-9_]{3,16}$/;
/** vanilla ChatScreen / ServerGamePacketListenerImpl: at most 256 characters */
export const MAX_CHAT = 256;
/** vanilla ServerGamePacketListenerImpl.chatSpamThrottler: each line adds 20, a tick takes 1 away, over 200 is spam */
export const CHAT_SPAM_STEP = 20;
export const CHAT_SPAM_LIMIT = 200;
/**
 * a guest's messages: one a tick is normal, and at most this many are handled in one of the host's ticks; after the
 * host stalled (a slow frame, a hidden window) the backlog is caught up on over the next ticks
 */
export const MESSAGES_PER_TICK = 40;
/**
 * vanilla's packet rate limit, here on what waits to be handled: a guest with more than this waiting (messages, and
 * bytes) is sending too much, too fast, and is let go (30 s of a normal guest's messages fit many times over; before
 * it has said who it is, a few)
 */
export const MAX_GUEST_BACKLOG = 1000;
export const MAX_GUEST_BACKLOG_BYTES = 2 * 1024 * 1024;
export const MAX_LOGIN_BACKLOG = 4;
/** the same on a guest for what the host sends (chunks included; a host that sends more is let go) */
export const MAX_HOST_BACKLOG = 2400;
export const MAX_HOST_BACKLOG_BYTES = 128 * 1024 * 1024;
/**
 * a guest respawning at a bed whose chunks aren't in waits this long for them (vanilla reads the bed where it is,
 * loading its chunk there and then); past that it respawns by the world spawn, its bed kept
 */
export const RESPAWN_BED_WAIT_TICKS = 100;
/** the most guests a host takes (vanilla's LAN server: 8 players) */
export const MAX_GUESTS = 7;
/**
 * the join code (net/joinCode.ts): a place that gives a wrong one this many times in a row waits this long before it
 * may try again (5 s), twice as long after each further wrong one, up to 5 minutes; and from everywhere together, at
 * most this many wrong ones a minute before everyone waits
 */
export const JOIN_CODE_FREE_TRIES = 3;
export const JOIN_CODE_WAIT_TICKS = 5 * 20;
export const JOIN_CODE_MAX_WAIT_TICKS = 5 * 60 * 20;
export const JOIN_CODE_WRONG_WINDOW_TICKS = 60 * 20;
export const JOIN_CODE_MAX_WRONG = 20;
/** a guest that hasn't said who it is by then is let go (vanilla ServerLoginPacketListenerImpl: 600 ticks) */
export const LOGIN_TICKS = 600;
/** the most connections a host keeps waiting to say who they are: more are turned away at once */
export const MAX_PENDING_LOGINS = 8;
/** vanilla ServerGamePacketListenerImpl: a move of more than 10 blocks in a tick isn't believed (100 blocks²) */
export const MAX_MOVE_PER_TICK = 10;
/**
 * vanilla ServerGamePacketListenerImpl.dropSpamThrottler: each item a creative guest throws out of its inventory adds
 * 20, a tick takes 1 away, and at 1480 more are refused
 */
export const DROP_SPAM_STEP = 20;
export const DROP_SPAM_LIMIT = 1480;
/**
 * vanilla ServerPlayer.canInteractWithEntity(box, 3.0): a guest's click on an entity counts within its reach and 3
 * blocks more (what it sees of a moving mob is a tick or three behind the host's)
 */
export const ENTITY_REACH_SLACK = 3;

/** vanilla ServerPlayer's containerCounter: menus are numbered 1 to 100, round again */
export const MAX_CONTAINER_ID = 100;
/** vanilla AbstractContainerMenu.incrementStateId: a menu's state number, round again past 32767 */
export const MAX_STATE_ID = 0x7fff;
/** a knockback or a blast sent to a guest is at most this fast, blocks a tick each way (vanilla SetEntityMotion's 3.9, and room for an explosion's) */
export const MAX_MOTION = 10;
/** the most clicks in a guest's menu the host takes in a tick (a drag across every slot is 66: start, 64 slots, end) */
export const MAX_CLICKS_PER_TICK = 80;

// ---------------------------------------------------------------------------
// the relay (scripts/relay.mjs, at /__mp on the game's own server; vite.config.ts hands it these): where a host's page
// and its guests' pages meet when they aren't windows of one browser

/** the most connections it keeps at once, of every kind; and from one address (a friend's windows, or one tunnel's far end) */
export const RELAY_MAX_CONNECTIONS = 64;
export const RELAY_MAX_PER_ADDRESS = 8;
/** the most guests connected at once: the world's, and as many again logging in (the host's game turns the rest away) */
export const RELAY_MAX_GUESTS = MAX_GUESTS + MAX_PENDING_LOGINS;
/** the most Multiplayer screens listening for the world at once */
export const RELAY_MAX_LISTENERS = 32;
/**
 * a guest's messages through it: as many a second as the host's game takes (MESSAGES_PER_TICK a tick), in bursts of up
 * to what the game lets wait (MAX_GUEST_BACKLOG, MAX_GUEST_BACKLOG_BYTES); a guest sending more is let go
 */
export const RELAY_GUEST_MESSAGES_PER_SECOND = MESSAGES_PER_TICK * 20;
export const RELAY_GUEST_BURST = MAX_GUEST_BACKLOG;
export const RELAY_GUEST_BYTES_PER_SECOND = MAX_GUEST_BACKLOG_BYTES;
export const RELAY_GUEST_BURST_BYTES = MAX_GUEST_BACKLOG_BYTES;
/** a guest whose connection doesn't take what the host sends it fast enough, with this much waiting, is let go */
export const RELAY_MAX_GUEST_BUFFER = 2 * MAX_HOST_MESSAGE;
/** what a host says of its world for the Multiplayer screens (net/transport/lan.ts's LanWorld, as JSON), at most */
export const RELAY_MAX_WORLD_INFO = 2048;
/** a connection that hasn't said anything by then (a host its world, a guest its hello) is let go */
export const RELAY_HANDSHAKE_MS = 10_000;
/** one not heard from at all (not even its answer to a ping) for this long is gone: vanilla's read timeout, 30 s */
export const RELAY_IDLE_MS = TIMEOUT_TICKS * 50;
/** how often it pings */
export const RELAY_PING_MS = 10_000;
