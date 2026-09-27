# Multiplayer, stage 1: report

Branch `claude/confident-bell-kdzc4i` (from `main` at 2902baa). Stage 1 is done: R0.1–R0.3 and M1. R0.4 and R0.5
were left for the stages that need them (§2). Stage 2 wasn't started.

(Stages 2, 3 and 4, and M5, the network transport, have been done since, on the same branch: their reports are
`REPORT-stage2.md`, `REPORT-stage3.md`, `REPORT-stage4.md` and `REPORT-m5.md`, next to this one. How to play with
friends on other computers is in `REPORT-m5.md`, §1.)

## Progress

- 16:26 UTC: started; surveyed the code; baseline regression on `main` (2902baa): 132 of 138 (see §6).
- 17:08: **R0.1** `Level.players` committed (80b72f3); regression 136 of 138.
- 17:16: **R0.2** `Level.isClientSide` / `Player.remote` committed (42f840e).
- 17:18: **R0.3** change hooks committed (240cc85, the last R0 commit); regression 136 of 138, the two failures
  rerun alone against `main` (§6).
- 18:55: **M1** (host, guest, codec, transports, screens, name tags) committed (569eb79). A two-window browser check
  of every "done means" item passes (§6).
- 19:22: the seven `tests/multiplayer/m1-*.mjs` suites (2febdd1), and the host fixes they turned up (0a62b7b).
- 19:50: full regression on 2febdd1: 141 of 145; the four failures rerun alone on the branch and on `main` (§6).
- 20:15: the browser check on the final build found a guest's 5 s connect timeout too short for a busy machine. It is
  now 30 s (c3b8483), with a suite for the real transport (`m1-transport.mjs`, 354d6a5); the browser check passes.
- 20:44: full regression on 354d6a5, the final head: 144 of 146. Both failures rerun alone on the branch and on
  `main`; silverfish's also with seeded randomness, failing on the same seeds on both (§6).
- 21:05: this report.
- Next (stage 2, not started): the `EntityTracker`, mobs and items for guests.

## 1. What a player can do now

The host opens a world to the other windows of the same browser: Esc → **Open to LAN** → **Start LAN World**. In
another window, the title screen's **Multiplayer** lists that world; the player types a name and joins. Both players
see each other walk, jump, sneak, sprint, fly, swim, look about and swing their arms, with their names over their
heads (faint, and hidden by walls, while sneaking), and each sees what the other holds and wears. The guest plays in
Creative, with the creative inventory and hotbar; what it places is what it holds. Blocks either player breaks or
places show at once on both sides, with the crack, the sound and the particles. Time and weather match, and chat goes
both ways. A guest's commands are refused with a plain message. The open world doesn't pause behind the host's
menus. The guest's copy of the world is never saved.

When the host quits or goes to another dimension, the guest sees why on a "Connection Lost" screen and goes back to
the title. A guest that quits, closes its window or goes quiet for 30 seconds is let go, and "left the game" shows.
Things guests can't do yet say so in plain words, or simply do nothing:

- chests, other containers and beds;
- villagers' trades;
- riding, picking things up, being hurt;
- portals.

`?mp=host&world=<id>` (or `?quick&mp=host`) and `?mp=join` open and join a world straight from the address. Setting
`MULTIPLAYER_ENABLED = false` in `src/net/config.ts` switches all of it off: the two buttons go back to greyed out and
the flags are ignored. Single-player plays as before.

## 2. The architecture as built

All new code is under `src/net/`, except the screens (`src/gui/screens/multiplayer.ts`) and the `Game` glue.

| Module | What it does |
|---|---|
| `net/config.ts` | `MULTIPLAYER_ENABLED`, the protocol version, `BUILD_ID` (a hash of `src/` that `vite.config.ts` puts in a build; `'dev'` in the dev server and tests), and every limit (§5). |
| `net/codec.ts` | The wire format. A compact binary encoding of plain data only: null, booleans, numbers, strings, arrays, plain objects and typed arrays, into a `Uint8Array`. Decoding is bounded (§5). |
| `net/protocol.ts` | The packets, by vanilla's names: `SB.*` guest → host (Hello, KeepAlive, MovePlayer, AcceptTeleportation, PlayerAction, SetCarriedItem, SetCreativeModeSlot, Chat, ChatCommand, Disconnect) and `CB.*` host → guest (Login, Disconnect, KeepAlive, LevelChunk, ForgetLevelChunk, BlockUpdates, BlockEntityData, BlockDestruction, SetTime, Weather, PlayerPosition, AddPlayer, RemoveEntities, MoveEntity, Animate, SetEquipment, Sound, LevelParticles, SystemChat, ContainerSetSlot). Also `checkPacket` (every field's type and range), `checkLogin` and `isAllowedChat`. A tick's packets go as one message: `[[id, …fields], …]`. |
| `net/transport/transport.ts` | `Transport`: `send(peer, Uint8Array)`, `onMessage`, `onPeer(peer, joined)`, `disconnect(peer)`, `close()`. Reliable and ordered. Nothing in it is BroadcastChannel's. |
| `net/transport/memory.ts` | `MemoryNetwork` for the tests: a host endpoint and guests. Nothing arrives until `deliver()`, and every message is copied. `vanish()` is a window dying without a word. |
| `net/transport/broadcastChannel.ts` | Two windows of one browser. The host listens on a "door" channel named by its LAN id. A guest knocks with its own id; the host accepts on a private channel per guest, and data goes there. A "bye" post is a clean close; a guest that gets no answer within 30 s (vanilla's timeout) gives up. |
| `net/transport/lan.ts` | `LanAnnouncer`: the host says what's open once a second, and says so again when asked. `LanWorldList`: what the Multiplayer screen heard lately (gone after 3 s), as plain text. |
| `net/server/hostServer.ts` | `HostServer`, on the host's `Level`. It hooks the level's changes: `World.onBlockChanged`, `World.onBlockEntityChanged`, `Level.onDestroyBlockProgress`, and the sound and particle sinks. It sends the time every second (and at once after `/time`), the weather when it changes, chat, and the host's own crack. It accepts connections (at most 8 waiting to say hello) and closes the world to guests. |
| `net/server/session.ts` | `ServerPlayerSession`, one per guest, and `GuestPlayer`, the guest's player on the host (a `Player` with `remote = true`). The session handles the inbox (capped), each packet (checked), the login, moves (corrected when too fast), creative slots (rebuilt from the host's own item list), and chat with its spam limit. It replays the guest's clicks through a host-side `Interaction` (vanilla `ServerPlayerGameMode`). It tracks chunks: nearest first, 6 a tick, only once lit on the host, forgotten past view distance + 1. It sends the tick's block changes as one packet, block entities when what they show changed, and the other players (AddPlayer, MoveEntity, SetEquipment, Animate, RemoveEntities). It also syncs the guest's inventory back, and does keepalive and timeouts. |
| `net/client/clientSession.ts` | `ClientSession`, the guest's side. It says hello, takes the login, and passes chunks to a sink (in the game, `ChunkManager`'s remote mode; in the tests, `computeChunkLight`). It applies block updates, block entities, time, weather and corrections, and keeps the other players as mirrors. Each tick it sends its player's move, pose, buttons and inventory changes. Everything from the host is checked first. Anything it can't take makes it leave, saying why. |
| `net/client/mirrorPlayer.ts` | Another player as a guest sees it (vanilla `RemotePlayer`): eased over 3 steps, with the walk animation worked out from how far it moved. It never runs AI or physics. |
| `net/chunkData.ts` | What goes in `LevelChunk` and `BlockEntityData`. Containers' contents and loot tables are hidden, as vanilla hides them. Also the guest's checks on them. |
| `net/items.ts` | Items on the wire. `creativeItem`: what the host makes of a guest's creative slot. `itemFromHost`: what a guest makes of the host's items. |
| `net/playerState.ts` | Pose flags to and from a player; equipment; stack keys for diffs. |
| `net/effects.ts` | The host's broadcasting sinks: sounds within max(16, 16 × volume), particles within 32. On the guest, a whitelist of the particle calls that go across, with their arguments checked. |
| `gui/screens/multiplayer.ts` | Vanilla's `ShareToLanScreen` ("LAN World"), `JoinMultiplayerScreen` ("Play Multiplayer", with the LAN list and a name box), `ConnectScreen`, `DisconnectedScreen`; the `?mp=` helpers. |
| `game/game.ts` | `Game.mode` (`'single' \| 'host' \| 'client'`), `openToLan`, `stopHosting`, `joinWorld`, `leaveHost`, `connectionLost`, `refuseGuestMenu`, and the tick routing: the server's `receive()` before the level's tick and `tick()` after it; the guest's `receive` / `tickLevel` / `sendTick`. |
| `world/chunkManager.ts` | `remote` mode: nothing generated, loaded or saved. The host's chunks go to the workers' light job (`baked = 0x1ff`), and a newer copy of a chunk beats an older one still being lit. |
| `render/entityRenderers.ts`, `render/nameTagRenderer.ts` | Another player's name tag (vanilla `PlayerRenderer.renderNameTag`), discreet while sneaking. |

### Where it departs from the plan, and why

- **Codec.** It is new rather than `encodeValue`/`decodeValue` from `storage/worldFile.ts`. That codec trusts its
  input and carries Maps, Sets, Dates and BigInts. This one carries plain data only, and checks every length, the
  depth and the keys.
- **Clicks.** The guest sends no `UseItemOn` or `START/STOP_DESTROY` with positions. It sends its look (in
  `MovePlayer`), its button presses (`PlayerAction`) and which buttons it holds (flags). The host picks the target
  from the guest's eyes and makes the same `Interaction` calls `Game.tick` makes for its own player. So reach, target,
  break time and what's placed are all the host's. This is the plan's "Guest actions on the host" paragraph taken
  literally. The pick is blocks-only (players block the ray), because entities don't go across until stage 2.
- **Block updates.** One `BlockUpdates` packet per tick (an `Int32Array` of x, y, z, state) instead of
  `BlockUpdate`/`SectionBlocksUpdate`. Weather goes in a `Weather` packet rather than `GameEvent`. No `BlockEvent`
  yet (§8).
- **Block entities.** `BlockEntity.version` (R0.3) marks changes. For guests, what a block entity shows is also
  compared as JSON once a second, the plan's fallback. This catches changes made without `version`.
- **The guest's inventory.** In Creative it is the guest's own. The host mirrors it from `SetCreativeModeSlot`
  diffs, rebuilding each stack from its own item list, and sends back what the host changes (`ContainerSetSlot`).
- **Moving a remote player.** `Player.remote` plus a `remoteMove` hook in `aiStep` (R0.2) instead of skipping
  `travel()` in place. `checkInsideBlocks` still runs on the host, so pressure plates and tripwires work, and so do
  portals (which are refused).
- **Transport.** It has a `disconnect(peer)` for the host to drop one guest. The tests use `MemoryNetwork` with an
  explicit `deliver()`, not `MemoryTransport.pair({ latencyTicks })`: `step()` is host tick → deliver → guest ticks →
  deliver, so a test decides exactly when things arrive.
- **Time.** `SetTime` goes before the level's tick, as vanilla's does, so a guest's clock is the host's tick for
  tick. It also goes at once when the clock was changed between ticks (vanilla `forceTimeSynchronization`, after
  `/time set` and `/gamerule doDaylightCycle`).
- **Pausing.** The host never pauses once open to LAN, guests or not. This is vanilla `Minecraft.isPaused` for a
  published integrated server.
- **View distance.** The guest's is its render distance clamped to 2–8; the host caps it at 8 (`GUEST_VIEW_DISTANCE`).
- **R0.4 and R0.5 were left.** M1 didn't need them. R0.4 (menus, player data, respawn and death out of `Game`) belongs
  to M3/M4. R0.5 (the entity net registry) belongs to M2. For stage 1 the menu hooks now carry the player (§3), and a
  guest's player is refused politely.

## 3. Single-player changes

Every change below is meant to leave single-player exactly as it was. The regression (§6) says it did.

### R0.1: `Level.players` (commit 80b72f3)

`Level.player` stays: it is this game's own player (camera, HUD, what it hears, its screens). New on `Level`:

- `players()`: every player in the level, in the order they were added (vanilla `ServerLevel.players`). It is kept
  in step with `entities` (added in `addEntity`, pruned with the entities each tick, reset in `resetForDimension`).
  `level.player` is always in it, even when removed (dead) or never added as an entity, because every old site used
  `level.player` in those cases too.
- `nearestPlayer(x, y, z, max, test)`: vanilla `getNearestPlayer` (strictly nearer wins, so the first of equals;
  `d < max²`).
- `playersNear`, `hasNearbyAlivePlayer` (vanilla), `playerByUuid`, `randomPlayer(test)` (vanilla `getRandomPlayer`;
  a lone player is taken without a draw, so single-player's `level.random` sequence is untouched).
- `playSoundTo(p, …)` and an optional `SoundSink.playTo`: a sound for one player's ears (vanilla
  `ServerPlayer.connection.send(ClientboundSoundPacket)`); without `playTo` only the own player hears it.

Rule followed at every site: keep the site's own predicate (its `<` or `<=`, spectator and alive checks) exactly, per
player, and pick among several players the way vanilla does; with one player it is the same check in the same order.
Where vanilla differs from the old single-player predicate, the old predicate was kept (noted below).

Migrated sites (before → after):

| File | Before | After |
|---|---|---|
| `game/level.ts` `isEntityTicking` | within simulation distance of `player` (all if none) | of any player (all if none) |
| `game/level.ts` `tick` | `e === this.player` ticks where loaded | any `e.type === 'player'` does |
| `game/level.ts` `tick` | random ticks round `player` | `RandomTicker.tickAround(players())`: the first player's square in the old order, then only chunks the others add, each once |
| `game/spawner.ts` `tick` | chunks round `player`; caps from their count | the union round all players (first player's order kept); caps from the union's count (vanilla) |
| `game/spawner.ts` `spawnCategoryForChunk` | distance to `player` | to `nearestPlayer` (no spectator filter, as before; vanilla filters spectators) |
| `game/difficulty.ts` `tickInhabitedTime` | chunks round `player` (not spectator) | round each non-spectator player, each chunk once |
| `game/sleep.ts` `tickSleeping` | `player.isSleepingLongEnough()` | vanilla `SleepStatus`: all non-spectators asleep and as many asleep long enough (100 %: `playersSleepingPercentage` still not heeded, as before); wakes every sleeper |
| `game/baseSpawner.ts` `isNearPlayer` | `player` alive, not spectator, `< 16` | `hasNearbyAlivePlayer(…, 16)` |
| `game/endDragonFight.ts` | `hasPlayer` flag from `player` | `barPlayers` list (vanilla `dragonEvent.getPlayers()`); `hasPlayer` a getter; `shownBar(viewer = level.player)`; `onDragonSummoned(d, p)` per bar player |
| `game/raids.ts` `updatePlayers` | `hasPlayer` from `player` | `barPlayers` list; `shownBars(viewer = level.player)` |
| `game/raids.ts` `playSound` | horn for `player` | horn per player (vanilla), via `playSoundTo` |
| `game/catSpawner.ts`, `game/wanderingTraderSpawner.ts` | `player` | `randomPlayer(alive)` (vanilla `getRandomPlayer`) |
| `game/patrolSpawner.ts` | `player` | `randomPlayer()`, then the old spectator check |
| `game/trialSpawner.ts`, `game/wardenSpawnTracker.ts` | own `levelPlayers()` helpers | removed; `level.players()` (same order when the player is in `entities`, as in the game) |
| `game/vault.ts`, `game/sculkShrieker.ts` | `levelPlayers(level)` | `level.players()` |
| `game/gatewayTravel.ts` `arrive` | `e === level.player` stops | any player stops |
| `game/enchantEffects.ts` `channel`, `game/copper.ts` rod | bolt's cause if owner is `player` | if owner is any player |
| `game/copper.ts` `lightningStrikeTrigger` | `player` within 256 | each player within 256 (bystanders listed once) |
| `game/endPortal.ts` `portalSpawnSound`, `entity/enderDragon.ts` `globalSound` | played 2 blocks from `player` | per player, via `playSoundTo` |
| `game/ocean.ts` elder curse hook | face + moan for `player` | face on the own screen only; moan via `playSoundTo` |
| `world/blockEntity.ts` barrel, `world/shulkerBoxEntity.ts` | game event by `level.player` | `startOpen/stopOpen(level, opener = level.player)`; `game.ts` and `shulkerBox.ts` pass the real opener |
| `world/blockEntity.ts` enchanting table book | `player` not spectator `< 3` | `nearestPlayer(…, 3, not spectator)` |
| `entity/ai/goals.ts` `LookAtPlayerGoal.findLookAt` | `player` if in range and sight | `nearestPlayer` from the eyes with the same test |
| `entity/ai/goals.ts` `NearestAttackablePlayerGoal.canUse` | `player` with the checks | loops `players()` with the same checks, nearest from the eyes; new `acceptsPlayer(p)` hook for per-player conditions |
| `entity/polarBear.ts`, `entity/monsters.ts` (zombified piglin), `entity/ironGolem.ts` `AngryAtPlayerGoal` | `extraCondition`: `isAngryAt(level.player)` | `acceptsPlayer(p)`: `isAngryAt(p)` |
| `entity/ghast.ts` `GhastTargetGoal` | `extraCondition` on `player`'s y | `acceptsPlayer(p)` |
| `entity/drowned.ts` `DrownedTargetPlayerGoal` | `okTarget(level.player)` | `acceptsPlayer(p)`: `okTarget(p)` |
| `entity/monsters.ts` enderman stare goal | `player` staring | nearest staring player |
| `entity/monsters.ts` zombie reinforcements | `player` alive, not spectator, `< 7` | `hasNearbyAlivePlayer(…, 7)` |
| `entity/animals.ts` `TemptGoal` | `player` | `nearestPlayer`, same test |
| `entity/ai/brainBehaviors.ts` `senseTempting` | `player` | `nearestPlayer`, same test |
| `entity/wolf.ts` beg goal | `player` in range | nearest in range, then holding check (vanilla) |
| `entity/dolphin.ts` swim-with-player | `player` in range | nearest in range, then swimming check (vanilla) |
| `entity/evoker.ts` `AvoidPlayerGoal` | `player` | nearest with the same test |
| `entity/bat.ts` resting | `player` in reach | any player in reach |
| `entity/hoglin.ts` `senseVisibleLiving` | adds `player` if missing | adds any missing player |
| `entity/fox.ts` screech | no `player` in 16 | no non-spectator player in 16 |
| `entity/fox.ts`, `entity/wardenAnger.ts`, `entity/mob.ts` (lead), `entity/tamable.ts` (owner), `entity/zombieVillager.ts` (cure) | `player.uuid === u` | `playerByUuid(u)` (warden: still only players whose uuid exists) |
| `entity/dragonPhases.ts` `combatTarget` | `player` with the checks | nearest with the same checks; from the podium in the holding pattern and landing approach (vanilla), else from the dragon |
| `entity/enderDragon.ts` crystal destroyed | `player` | nearest attackable player (not in peaceful) |
| `entity/silverfish.ts` spawn rule | `player` survival `< 5` | `nearestPlayer(…, 5, same test)` |
| `entity/mob.ts` `checkDespawn` | `player` (return if spectator) | nearest non-spectator (vanilla `getNearestPlayer(this, -1)`) |
| `entity/guardian.ts` elder curse | `player` | each player in range |
| `entity/ironGolem.ts` `DefendVillageTargetGoal` | `player` | every seen player in the box against every seen villager; the last with a grudge (vanilla loop order) |
| `entity/itemEntity.ts` pickup | `player` | each player in turn while any is left |
| `entity/xpOrb.ts` follow | `player` `< 8` | `nearestPlayer(…, 8)`, then not spectator/dying (vanilla) |
| `entity/arrow.ts` | owner relinked to `level.player`; hooks if owner is `player` | owner uuid saved and relinked (`level.player` for old saves); hooks for any player, with the player |
| `entity/thrownTrident.ts`, `entity/lightning.ts` | hooks if `player` | hooks for any player, with the player |
| `entity/raider.ts` Voluntary Exile | `player` killed | whichever player killed (or last hurt) it |
| `entity/monsters.ts`, `entity/wolf.ts`, `entity/ironGolem.ts` anger save | on load angry at `level.player` | `AngryAt` uuid saved (vanilla); old saves still `level.player` |
| `render/entityRenderers.ts` cat lying | `player` asleep near | any player asleep near |
| `game/game.ts` hooks | fired for the one player | `onPlayerArrowHit`, `onPlayerTridentHit`, `onChanneledLightning`, `onPlayerCrossbowKill`, `onCuredZombieVillager`, `onDragonSummoned` now carry the player; the game awards only its own |

Kept as `level.player` (the local view): `render/entityRenderers.ts` (own player not drawn in first person, spectator
view), `render/oceanRenderers.ts` (a guardian's eye on the camera), `render/fireworkParticles.ts` (listener),
`entity/totem.ts` (the item over the own screen), `game/jukebox.ts` ("Now Playing" on the own action bar), the
default viewer of `shownBar`/`shownBars`, the default opener of `startOpen`/`stopOpen`, the fallbacks for old saves
(arrow owner, `AngryAt`), and `game/game.ts`'s assignment.

Known single-player edge differences: none expected. (A player asleep in a bed while in spectator mode would no
longer skip the night, as in vanilla; it could before.)

### R0.2: `Level.isClientSide` and `Player.remote` (commit 42f840e)

Both are off in single-player. Every new branch below is taken only when one of them is on.

- `game/level.ts`: `isClientSide = false`. When true (a guest's copy), nothing in the level changes blocks or ticks.
  These return early: `setBlock` (returns the state already there), `destroyBlock` (false),
  `scheduleTick`, `scheduleBlockTick`, `blockEvent`, `updateNeighborsAt`, `neighborChanged`, `updateNeighbors`,
  `fallStalactite`, `gameEvent`, `addEntity` (so nothing adds entities of its own), and a block entity's change
  doesn't update comparators. `addMirrorEntity(e)` is new: it puts in an
  entity the host sent, or the guest's own player, and keeps `players()` in step.
- `entity/living.ts`: `hurt` returns false when `isClientSide` (vanilla: only the server hurts things). New hooks
  `movedElsewhere()` / `moveFromElsewhere()` (false / nothing by default): in `aiStep`, an entity moved by another game
  runs the hook and its freezing instead of steering, jumping and travelling.
- `entity/player.ts`: `remote = false` and `remoteMove`. A remote player's `movedElsewhere()` is true and its move is
  `remoteMove`. Its pose is left as its game said. Food ticks only when not `isClientSide`, and `hurt` is refused
  on a client-side level.

### R0.3: change hooks (commit 240cc85)

- `world/world.ts`: `onBlockChanged(x, y, z, old, now)` (null by default) is called for every change of state: from
  `setState` (so `setBlock`, `setStateQuiet` and generation writes baked in from a neighbour too). `setState` now
  returns early for an unloaded chunk or an out-of-range y, as it did nothing there before.
- `world/blockEntity.ts`: `version`, counted up on each change to what it holds (vanilla `setChanged`).
- `game/level.ts`: `onDestroyBlockProgress(id, x, y, z, stage)` (null by default), called from `destroyBlockProgress`.

With nothing hooked (single-player), these are a null check each.

### M1 (commit 569eb79): what touched single-player files

- `game/game.ts`:
  - `startWorld` is split into `startWorkers` + `setUpWorld`. Single-player calls them in the same order with the
    same arguments.
  - `setUpWorld(meta, login?)`: every multiplayer branch is on `login`, which single-player never passes.
  - `tick()`: the level's tick, tickets, spawner and `tickProgress` run as before, in the same order; `server?.receive()`
    and `server?.tick()` are no-ops without a server. The ambient ticker runs in a closure, the same calls in the same
    order.
  - `isPaused()` also needs `mode === 'single'`, which it always is in single-player.
  - `sendChat`: a guest's lines go to the host. Single-player is unchanged apart from `server?.hostChatted` (a no-op).
  - `leaveWorld(next?)` saves as before, unless the world was a guest's. `next` defaults to the title screen, as before.
  - The village and shulker box menu hooks now carry the player: the menu opens for the game's own player, as before,
    and a guest's is refused.
  - The Nether/End change calls `stopHosting` (a no-op when not hosting).
  - New: `openToLan`, `stopHosting`, `guestSpawnPoint`, `joinWorld`, `leaveHost`, `connectionLost`, `onPageHide`,
    `refuseGuestMenu`.
- `game/level.ts`: the end-of-tick prune of removed entities moved into `pruneRemoved()` (the same loop), so a guest's
  level can call it.
- `entity/player.ts`: `profileName` (null in single-player, so no name tag), `noPickup` (false), `canRide` refused only
  for `remote` players, and the portal whoosh (`block.portal.trigger`) not played for a remote player.
- `entity/itemEntity.ts`: pickup also skips `noPickup` players. `entity/xpOrb.ts`: the orb follows the nearest player
  that isn't `noPickup`. Both are always false in single-player.
- `entity/living.ts`: `updateSwimAmount` private → protected (the mirror players call it).
- `game/shulkerBox.ts`, `game/villageBlocks.ts`: the menu hooks get the player, and may return `false` for "not
  opened".
- `gui/screens/crafter.ts`, `dispenser.ts` (and the hopper screen in it): a guest's player gets the refusal instead of a
  screen.
- `gui/screens/creative.ts` → `item/creativeStacks.ts`: `enchantedBooks` and `stacksOf` moved, unchanged, to a
  module of their own so the host can check a guest's creative items against the same lists. The `REDSTONE_ORDER`
  line that `tests/trial-chambers/m5a-crafter.mjs` greps is untouched.
- `gui/screens/menus.ts`: the title screen's Multiplayer button works (`active = MULTIPLAYER_ENABLED`).
  `gui/screens/ingame.ts`: the pause screen's Open to LAN works in single-player; a guest's quit button says
  "Disconnect". `gui/screens/options.ts`: difficulty is greyed out for a guest. `gui/screens/index.ts`: the connecting
  and disconnected screen factories.
- `world/world.ts`: `setBlockEntity(be)`, used only by a guest.
- `world/chunkManager.ts`: `remote` mode. Every remote branch is off in single-player; `reset()` also clears
  `remoteLatest` (empty in single-player).
- `render/entityRenderers.ts`: name tags for players with a `profileName` (never in single-player).
  `render/nameTagRenderer.ts`: `add(…, discrete = false)`; mobs' name tags draw as before.
- `main.ts`:
  - the `?mp=` flags;
  - the error page shows the error as text. It is a `<pre>` whose `textContent` is set, instead of `innerHTML` (§5).
    It looks the same.
- `vite.config.ts`: a `build-id` plugin (build only) that hashes `src/` into `__BUILD_ID__`. `npm run dev` and the tests
  don't use it. No `--host` anywhere.

### After M1 (0a62b7b, fb0c2f7, c3b8483)

Only `src/net/` changed, besides the suites. Nothing in single-player.


## 4. The last R0 commit

**240cc85** ("Behind the scenes: the world now says when any block changes …"). R0.1–R0.3 are 80b72f3, 42f840e and
240cc85; they change nothing in play and can be merged on their own. The regression at 240cc85: 136 of 138, with the
two failures shown flaky on `main` too (§6).

## 5. Security

Stage 1 listens on no network interface. There is no `--host` in any npm script or in `vite.config.ts`, and
`BroadcastChannel` stays inside one browser. The protocol is still built for data from other computers.

### Checked on the host, for everything a guest sends

- **Messages.**
  - At most 64 KB each (`MAX_GUEST_MESSAGE`) and 64 packets (`MAX_GUEST_PACKETS`).
  - Well-formed data. Every length must fit in what's left of the message, so nothing is allocated on a claimed
    length. Nesting is at most 24 levels. Numbers are finite and text is valid UTF-8. No `__proto__`, `constructor` or
    `prototype` keys, and nothing after the value.
  - Anything else disconnects the guest with "Bad data: …".
- **Rate.**
  - At most 40 messages are handled a tick (`MESSAGES_PER_TICK`); a backlog after a stall is caught up over the next
    ticks.
  - More than 1000 messages or 2 MB waiting (4 messages before the hello) → "Sending too much, too fast". Nothing
    more of that guest is kept meanwhile.
  - At most 8 connections wait to say hello; more are turned away at once. A hello must come first and only once,
    within 600 ticks.
- **Each packet** (`checkPacket`):
  - a known id and the exact number of fields;
  - every field's type and range: coordinates within ±30,000,000 across and ±20,000,000 up; pitch within ±90; only
    the known pose-flag bits; slots and actions in range; bounded strings;
  - items shaped `[id ≤ 64 chars, count 1–127, damage 0–65535, tag object or null]`.
- **Login.**
  - The protocol version and the build fingerprint must match: "Outdated game!" / "Outdated host!" / "a different
    version of the game. Reload both windows".
  - Names follow vanilla: 3–16 of `A–Z a–z 0–9 _`, and not taken in any case, the host's included.
  - The uuid must not already be in the world, and the world must not be full (7 guests).
- **Moves.**
  - More than 10 blocks in a tick is put back with a `PlayerPosition`, and later moves are ignored until the guest
    confirms that teleport's id (vanilla "moved too quickly").
  - Falling out of the world puts the guest back at the spawn with a message.
- **Clicks.**
  - A button press counts once a tick, however many are sent: sixty in a message break one block (tested).
  - The host picks the target from the guest's eyes, within the host's own `interaction.reach()`, and players in the
    way block it. Break times are the host's.
  - What's placed is what the host's copy of the guest holds, which is only what the host accepted into its slots.
- **Creative slots** (vanilla `handleSetCreativeModeSlot`):
  - only while in Creative;
  - the item must exist; the count at most its stack size; the damage at most its durability; otherwise "Invalid
    creative inventory action";
  - a tag is kept only if it matches a creative-tab variant, and then it's the host's own copy of that variant (or a
    decorated pot's four sherds); any other tag is dropped.
- **Chat.**
  - At most 256 characters.
  - No `§` or control characters: "Illegal characters in chat". Whitespace is squeezed.
  - Spam (vanilla): +20 a line, commands included, −1 a tick (or by real time, if more: a hidden host window). Over
    200 → "Kicked for spamming".
  - Commands are refused.
- **What guests can't do** does nothing harmful: menus, beds, portals, riding, picking up, being hurt, `/kill` from
  the host.
- **Errors.** An exception while handling a guest's packet is caught and logged, and that guest is disconnected
  ("Something went wrong with what you sent"). It never reaches the host's tick.

### Checked on a guest, for everything the host sends

- Messages up to 16 MB (chunks), and at most 2400 messages or 128 MB waiting.
- The same codec checks, and known packets with their fields' types and ranges. The login's fields are checked too
  (`checkLogin`).
- Chunks:
  - every section is 4096 entries;
  - every state id exists;
  - every biome id exists;
  - block entities have a loadable shape (`savedBlockEntity`) and are loaded in a `try`.
- Block updates must be inside the world with real states.
- Particles:
  - only whitelisted calls, with argument types checked;
  - state ids that exist, and faces 0–5.
- Sounds' names, positions, volumes and pitches are range-checked.
- Unknown item ids become nothing.
- Anything wrong makes the guest leave with "Bad data from the host: …" and tell the host why. It never throws in
  the guest's tick.

### Text

Names, chat and world names are drawn with the game's own font, never as HTML. The game's one `innerHTML` (the error
page in `main.ts`) is now `textContent`. LAN announcements from other windows are plain text:

- formatting codes (`§` and its letter) and control characters are stripped;
- names are cut to 64 characters, hosts to 16;
- ids must be hex;
- counts must be whole numbers;
- at most 32 worlds are listed.

### Still unchecked, or known weak

- **No authentication.** Any window can claim any name or uuid, as in vanilla's offline mode. Stage 4 has to decide
  what an invitation is (the WebRTC codes may be enough).
- **Movement isn't physics-checked.** Within 10 blocks a tick, a guest can go through blocks and fly (guests fly in
  Creative anyway). Pose flags (sneaking, sprinting, swimming) are believed. Vanilla's "moved wrongly" collision
  check isn't done.
- **Keepalives.** The ids aren't matched: any message counts as a sign of life, and no latency is measured.
- **Creative items.** Any item that exists is accepted, not only those in the tabs. This is vanilla's behaviour too.
- **A hostile host.** Item tags in block entities and in players' hands are only checked to be plain objects, and the
  guest's renderers then read them. A crafted tag could throw in the guest's frame (not the host's). Particle calls are
  checked but only budgeted by the message caps. A host's chat may carry `§` formatting, as a vanilla server's may.
- **The shared channel.** `BroadcastChannel` is shared by every page of the same origin. Such a page could also read
  the saves, so stage 1 treats it as trusted. The WebRTC transport replaces it.
- **The host's own traffic** isn't budgeted per tick: a huge `/fill` makes one big message. Beyond 16 MB the guest
  leaves.

## 6. Tests

### The new suites (`tests/multiplayer/`, headless, host and guests in one process over `MemoryNetwork` and the real codec)

Each one checks `assertMirrorEquals` after every scenario: blocks, biomes, what block entities show, and (where all 8
neighbours are there) the light the guest worked out itself against the host's.

| Suite | Checks | What it covers |
|---|---|---|
| `m1-login.mjs` | 41 | Let in two ticks after connecting, with the host's time, rules, weather, spawn and a ticket; 37 chunks for view distance 3; a second guest. Turned away with a reason: older/newer protocol, another build, seven bad names, the host's name or a guest's (any case), a uuid in use, not saying hello first, a second hello, no hello in 600 ticks, a full world, too many waiting. |
| `m1-chunks.mjs` | 26 | A generated world: ≤ 6 chunks a tick, exactly the circle in view (61 for distance 4), identical after lighting, the light really compared. Moving 6 chunks east: the new ones come, the old are forgotten (`ForgetLevelChunk`), the ticket follows. Host `setBlock`/`setState` on the guest within the tick. Block entities: a chest (contents hidden), a lectern's book shown and taken, a chest broken and placed in one tick, nothing resent while nothing changes. |
| `m1-players.mjs` | 46 | Each sees the other (keyed by the host's ids). Moves reach the host and ease in over 3 steps with the walk animation. 30 blocks at once is put back, and moves wait for the teleport. The void puts back at the spawn. Sneaking, sprinting, flying, swimming, both ways. What's held and worn. Swings. Out of view and back. A guest leaving. |
| `m1-blocks.mjs` | 51 | A guest places what it holds (the hotbar slot too) and breaks, the host and the other guest see it at once, with the place/break sound and particles. Reach: nothing past 5 blocks, a player in the way stops the click. The host's crack reaches the guests. A guest mining (survival on the host) cracks the block for everyone, the miner included, stage for stage, gone on letting go, the block broken for all after its time. A pressure plate a guest steps on clicks for it too. Sounds within 16 (more for loud ones), the host's ambience not sent. |
| `m1-world.mjs` | 39 | Time tick for tick, `SetTime` every second, a slipped clock put right, `/time set` and `doDaylightCycle` at once. Rain and thunder coming and going tick for tick, nothing sent while steady, a guest joining in the rain. Chat both ways and between guests; spaces squeezed; 256 characters; 257 disconnects; `§`, control characters, line breaks and tabs disconnect ("Illegal characters in chat"); a guest's command refused and not run; spam kicked (commands too), a second's pause forgiven. |
| `m1-security.mjs` | 147 | From a guest, each disconnecting with its reason while the host's tick doesn't throw and another guest plays on: garbage bytes, an empty or cut-short message, bytes after it, bad UTF-8, NaN and Infinity, lengths claiming billions, nesting too deep, `__proto__`/`constructor`/`prototype` keys (and `Object.prototype` untouched), not a message, 65 packets, unknown or non-integer or text ids, a host's packet, missing or extra fields, wrong types, coordinates and pitch out of range, unknown flags, bad slots and actions, bad items (unknown, too many, damage past breaking, damage on stone), a second hello, > 64 KB, a 1 MB chat line, > 1000 messages, > 2 MB. What's let through: 500 messages over a few ticks, sixty clicks as one, made-up item data dropped, a creative potion kept. From a host, each making the guest leave and say why: garbage, the wrong first packet, bad logins, a second login, unknown packets, states and biomes that don't exist, a wrong-sized section, bad block updates and block entities, an over-long name, a sound off the world, rain of 2, a 5000-character chat line, > 16 MB, > 2400 messages. The LAN list: plain text, cut to length, bad announcements dropped, at most 32. |
| `m1-transport.mjs` | 24 | The real `BroadcastChannel` transport, two ends in one process: guests let in on channels of their own, bytes both ways as sent (3 MB whole), nothing to the wrong guest, each end hearing the other leave or close, nobody let in after. Posts that aren't the protocol's (bad knocks, junk on a guest's channel, a second knock) ignored. Nobody answering: 30 s, then "not there"; a late answer still lets the guest in. A whole visit over it: login, 37 chunks, the mirror, a block placed, chat, leaving. |
| `m1-leave.mjs` | 29 | A guest quitting (`Disconnect`): "left the game" everywhere, its player and ticket gone, the others stop seeing it, what it built stays, its name free again. A closed window: dropped at once. A silent guest: kept alive by keepalives, dropped at 30 s, not at 29.5. The host closing: every guest told why. The host's window gone: "Connection lost". The host silent: the guest gives up at 30 s. No storage touched by anything in all of that. `Game.joinWorld` sets up a transient world (`meta.transient`, id `__guest`), and the game's save of it writes nothing. |

In all: 8 suites, 403 checks, all passing. Each takes 5–70 s.

### The full regression

`node scripts/regress.mjs -j 3` (every `tests/<dir>/*.mjs`), each run from a clean worktree of the commit:

| Commit | Passed | Failed |
|---|---|---|
| `main` 2902baa (before any change) | 132 of 138 | bastions/m3a-brute, frog, ocean/m2, rabbit, trial-chambers/m4a-wind-charges, wolf |
| 80b72f3 (R0.1) | 136 of 138 | illagers/illagers, ocean/m2 |
| 240cc85 (R0.3, the last R0 commit) | 136 of 138 | drowned, end/fireworks |
| 569eb79 (M1) | 135 of 138 | fox, illagers/raids, ocean/m2 |
| 2febdd1 (the M1 suites and fixes) | 141 of 145: all 7 new suites, and 134 of the 138 | cat/ocelot, goat, illagers/raids, trial-chambers/m5a-crafter |
| **354d6a5 (final)** | **144 of 146**: all 8 new suites, and 136 of the 138 | end/silverfish, illagers/raids |

A different handful fails in each run, on `main` as on the branch. Each failure was rerun alone, the same number of
times on the branch and on `main` (a worktree at 2902baa with `node_modules` linked), in the same way:

| Suite: the check that failed | Branch, alone: failed | `main`, alone: failed |
|---|---|---|
| illagers/illagers: "evoker conjures fangs" | 8 of 13 | 5 of 13 |
| end/fireworks: "a burst follows half the rocket's motion" | 1 of 13 | 5 of 13 |
| drowned: "a zombie's size and build" | 1 of 3 | 1 of 3 |
| ocean/m2 (on the known-flaky list) | 0 of 6 | 2 of 6 |
| fox: "…and kills it" | 0 of 3 | 1 of 3 |
| illagers/raids: "a farmer throws the hero bread, pie or cookies; a child a poppy" | 8 of 23 | 5 of 23 |
| cat/ocelot: "one that trusts you doesn't run" | 3 of 18 | 3 of 18 |
| trial-chambers/m5a-crafter: "ten puffs of white smoke out of its front" | 0 of 15 | 2 of 15 |
| goat: "hurt, it runs (at twice its pace)" | 0 of 15; that scenario alone, 300 times in a loop: 7 of 300 | 0 of 15; the loop: 9 of 300 |
| end/silverfish: "a fall doesn't wake them (it merged into the stone)" | 0 of 6; that scenario alone with `Math.random` seeded, seeds 1–300: 6 of 300 | 0 of 6; seeds 1–300: 6 of 300, on the same six seeds |

Why they vary from run to run:

- Every mob's `random` is seeded from `Math.random()` (`entity/mob.ts`), so mob AI differs each run: a fox's hunt, an
  ocelot's stroll, a goat's panic path, a villager finding the hero, an evoker's fangs.
- Some effects use `Math.random()` directly. In `game/crafter.ts`, a puff's speed out of the crafter's front can come
  out backwards (about 4 % of runs by its numbers).
- A silverfish slipping into the stone (vanilla's merge goal) takes the block under it, wherever its stroll has taken
  it, but the check counts only the stone left in the infested patch, so one that has strolled off the patch first
  fails it. With `Math.random` seeded, the branch and `main` fail on exactly the same six of 300 seeds (6, 40, 91, 111,
  143, 223): the branch changes nothing there.
- The branch changes none of that logic. R0.1 changed which player a mob considers, which is the same player when
  there's only one.
- The six suites that failed in `main`'s own baseline run all passed in the branch's final run.
- The final run's raids failure is the same check as 2febdd1's (its reruns are the raids row). The branch's higher
  counts for raids (8 of 23 against 5 of 23) and illagers (8 of 13 against 5 of 13) are within chance (Fisher's exact
  test: p ≈ 0.5 and 0.4), and fireworks goes the other way. The villagers' gift code and their
  senses are unchanged on the branch; R0.1 only moved the raid's bar and horn to a list of players.

### A real two-window check, in headless Chromium

Not in the repo. It is a Playwright script in my scratch space (one browser, two pages on `vite preview`), run on the
M1 build and again on the final build. It has 57 checks in four phases:

- **A**: hosting, the LAN list and joining; time, weather and chat, and the refused command; placing and breaking both
  ways, the crack, moves and the correction, sneaking; the chest refusal, the pig not ridden; no IndexedDB writes from
  the guest's page; the host quitting ("Connection Lost" → title).
- **B**: the guest closing its window; a second guest joining, then leaving by Disconnect.
- **C**: the host going to the Nether.
- **D**: a silent guest timed out.

All passed on the M1 build. On the final build, the first run stopped in phase B: the second guest's knock wasn't
answered within the 5 s connect timeout, while two software-rendered windows kept this machine's four cores busy. A
reproduction showed why: the host, ticking about twice a second, had let the guest in, but the guest had already given
up. A slow school computer could do the same, so the timeout is now vanilla's 30 s (c3b8483, with a test in
`m1-transport.mjs`), and the rerun passed all 57.

`npx tsc --noEmit`: clean. `npx vite build`: succeeds.

## 7. The two-window check for the lead

Setup (no `--host`: everything stays on this machine):

```sh
git fetch origin claude/confident-bell-kdzc4i && git checkout claude/confident-bell-kdzc4i
npm install
npm run build && npx vite preview      # http://localhost:4173/
# (or: npm run dev → http://localhost:5173/; both windows must come from the same server)
```

Open two browser **windows** side by side, not two tabs. A hidden tab slows its game to about a quarter speed, and a
guest that hears nothing for 30 s gives up.

**Window A, the host**

1. `http://localhost:4173/` → Singleplayer → open or create a world.
2. Esc → **Open to LAN** (now active) → the "LAN World" screen:
   - "Settings for Other Players", with "Game Mode: Creative" and "Allow Cheats: OFF" greyed out. Their tooltips say
     guests play in Creative and only the host can use commands in this version.
   - Two grey notes.
   - Press **Start LAN World**.
   - Expect: back in the game, with "Local game hosted: other windows of this browser can join it from Multiplayer"
     in the chat.
   - Esc again: Open to LAN is greyed out, and the world keeps going behind the pause menu (time, mobs).
   - Shortcut: `http://localhost:4173/?quick&mp=host` (a throwaway world, never saved, opened at once).

**Window B, the guest**

3. `http://localhost:4173/` → **Multiplayer** → "Play Multiplayer":
   - A "Name:" box (`Player###` by default). A name that isn't 3–16 letters, digits or `_` greys out Join Server and
     says why.
   - The list shows "Scanning for games on your local network", then within a second a "LAN World" entry:
     "`<host name>` - `<world name>`", "Another window of this browser, 0/7 players".
   - Double-click it (or select it, then **Join Server**).
   - Expect: "Connecting to the server..." → "Loading terrain..." → in the world at the host's spawn, in Creative (E
     opens the creative inventory).
   - Both chats: "`<name>` joined the game" in yellow.
   - Shortcut: `http://localhost:4173/?mp=join` joins the first world heard within 5 s.

**Together**

4. Walk, jump, sprint, fly (double space), swim, look about, swing (click in the air). Each window sees the other's
   player do it, with the name over its head. Sneak (Shift): the name goes faint and walls hide it.
5. Hold things and wear armour: the other window sees them.
6. Place and break blocks:
   - The guest takes blocks from the creative inventory; the host sees what it places and breaks at once, with the
     sounds and particles.
   - The same the other way round.
   - The host, in Survival, mining stone: the guest sees the crack grow.
7. Time and weather, from the host:
   - `/time set night`: the guest's sky goes dark at once.
   - `/weather rain`, then `/weather thunder`: both windows get them.
8. Chat (T) both ways. The guest typing `/time set day` gets a red "Only the host can use commands." and nothing
   happens.

**Edge cases**

9. The guest right-clicks a chest (or a barrel, furnace, crafting table, villager). The action bar says "That can't be
   used by guests yet."; a bed says "Beds can't be used by guests yet.". Nothing opens in either window.
10. The guest right-clicks a pig or a boat: it doesn't get on.
11. The guest walks into a Nether portal: "Portals don't take guests yet." It stays where it is.
12. **The host goes through a portal.**
    - The guest gets "Connection Lost", "The host went to another dimension, where guests can't follow yet.", then
      **Back to Title Screen**.
    - The host's chat says the guest left. The host can open to LAN again where it is.
13. The guest presses Esc → **Disconnect**: it's back at the Multiplayer screen, and the host sees "`<name>` left the
    game".
14. **The guest closes its window:** the host's chat says it left, at once.
15. **The host quits** (Esc → Save and Quit to Title): the guest gets "Connection Lost", "The host closed the world.",
    then the title.
16. Afterwards, window B's Singleplayer list has no new world, since the guest's copy is never saved. The host's world,
    reopened, has what the guest built.
17. A third window joining under the guest's name gets "Someone called `<name>` is already playing here."

## 8. Left for later, known issues, questions

**Stage 2 and later**

- M2: entities (mobs, items, xp orbs, projectiles, vehicles) for guests, and with them clicking entities, riding and
  picking up. The `EntityTracker` and R0.5 (the entity net registry).
- M3: Survival for guests (health, hunger, damage, death), inventories, containers and menus, crafting, combat, and
  R0.4. Guest commands with "Allow Cheats".
- M4: guests' data saved with the host's world, and guests following the host to other dimensions.
- M5: the network transport (WebRTC codes, then the relay). The `Transport` interface and the `Uint8Array` codec are
  ready for it. The 16 MB host-message cap assumes a LAN; chunks will want compressing.

**Known issues in stage 1**

- A guest's footsteps (and its landing and splash sounds) aren't heard by the others. Its player on the host doesn't
  walk: it is put where the guest says.
- Jukebox songs aren't heard by guests.
- Block events aren't sent: a chest's lid, a bell's swing, a piston's motion. Guests see the end state.
- Block entities don't tick on a guest, so what their tick animates stands still there (an enchanting table's book
  turning to a player, say).
- With a guest in, the host can't skip the night by sleeping: vanilla needs everyone asleep, and guests can't sleep
  yet.
- A host window hidden by the browser runs slowly, and a guest may time out if it's hidden long. The brief puts this
  out of scope.
- The guest's Q (drop) loses the item: there's no dropping yet. Harmless in Creative.
- Guests can't be hurt or die. The void puts them back at the spawn.
- Guests see no mobs, items or other entities (stage 2).
- Difficulty and game rules, other than the daylight cycle, are sent only at login.
- Spawners are resent every second, since their countdown is part of what they show. A little traffic.
- Chunks are forgotten at view distance + 1, not at the view distance, to avoid resending at a border.
- A guest's clicks, and its own crack, come back from the host a tick or two later.

**Questions for the user**

1. At most 7 guests (vanilla's LAN is 8 players with the host). Is that fine?
2. Once open to LAN, the host's world never pauses, even with nobody in (vanilla). Is that fine?
3. Both windows must run the same build (a hash of `src/`); dev-server windows always match. After a rebuild, the
   list says "Incompatible version! Reload both windows." Is that the wanted behaviour?

## 9. Times

- Started 16:26 UTC, finished 21:05 UTC: about 4.7 hours of wall clock.
- Roughly an hour of it was debugging:
  - mostly M1's two-window browser check: the guest kicked when the host's frames stalled (which became the per-tick
    budget), "Connection lost" instead of the host's reason, block entity data overwritten by later block updates,
    a stale light job winning, a guest's commands run locally;
  - then the suites' own timing, and the host fixes of 0a62b7b that the suites turned up;
  - last, the browser check on the final build: a second guest that never got in, which a reproduction traced to the
    guest's 5 s connect timeout firing while the busy host was still getting round to the knock (now 30 s, c3b8483).
