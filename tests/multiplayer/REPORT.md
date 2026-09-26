# Multiplayer, stage 1: report

## Progress

- 16:26 UTC: started; surveyed the code; baseline regression on `main` (2902baa): 132 of 138 (see §6).
- 17:08: **R0.1** `Level.players` committed (80b72f3); regression 136 of 138.
- 17:16: **R0.2** `Level.isClientSide` / `Player.remote` committed (42f840e).
- 17:18: **R0.3** change hooks committed (240cc85, the last R0 commit); regression 136 of 138, the two failures
  rerun alone against `main` (§6).
- 18:55: **M1** (host, guest, codec, transports, screens, name tags) committed; a two-window browser check of every
  "done means" item passes. Next: the `tests/multiplayer/m1-*.mjs` suites, the full regression, this report.

## 3. Single-player changes

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
