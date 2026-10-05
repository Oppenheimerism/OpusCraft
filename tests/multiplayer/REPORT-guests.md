# What LAN guests were missing: report

Branch `claude/vibrant-hypatia-2p2ou6`, from `main` at b935350. Part 1 of the brief: what two people playing survival
on two computers found a guest couldn't do. Each lettered milestone is committed and pushed on its own. a to e are in
`main` already (merged as 4b3a7d6 and 52f4331); the branch was then brought up to `main` at 2d08345 (the wither merged;
a fast-forward, nothing rewritten), and f onwards are built on that. `PROTOCOL_VERSION` is 8 (b935350's 7), bumped once
for all of part 1.

## 1. Milestones

| | Milestone | State | Commit |
|---|---|---|---|
| a | Advancements for guests | done | a96b5a5 A guest playing on someone's LAN world now has advancements of its own… |
| b | Boss bars for guests | done | 6f92a50 A guest now sees the boss bars the host's world shows it… |
| c | Hitting the ender dragon; the fight from a guest's side | done | 5d949fb A guest can hurt the Ender Dragon… |
| d | Firework rockets for a gliding guest | done | 97d0271 A firework rocket now speeds up a guest gliding with an elytra… |
| e | The End Poem | done | c1004a4 In a LAN world, leaving the End through its exit portal no longer leaves the guests on "Loading terrain..."… |
| f | Being disconnected | done | (this commit) |
| g | The survival sweep | not started | |

### a. Advancements

A guest now has advancements of its own, as each player has in vanilla (`PlayerAdvancements` per `ServerPlayer`):

- **Met on the host.** Every criterion the host's own player meets, a guest's player meets the same way: what it holds,
  kills and is killed by, eats, places, sleeps in, breeds, tames, trades, enchants, brews, loots, rides; where it stands
  (its biome and structures every 20 ticks, the outer End, trial chambers, bastions, a fall from the top of the world,
  a ride across lava); the dimension the host takes it to (We Need to Go Deeper, The End?, Subspace Bubble); an end
  gateway (Remote Getaway); the dragon it respawns (The End... Again...); every criterion the world's own code meets
  through `level.onPlayerTrigger` (shields, totems, raids, buckets, the trial chambers', the spyglass, the honey block,
  and so on). Each guest's are its own: the host's player and the other guests get nothing from it.
- **Kept with its player.** Saved in its record (`game/playerData.ts`, the field the host's own player's already had)
  and there when it comes back.
- **Shown to the guest.** The host tells the guest its progress (`CB.UpdateAdvancements`, vanilla
  `ClientboundUpdateAdvancementsPacket`): all of it as it joins, as a reset with no toasts, then each advancement whose
  criteria changed, at the end of the tick. Its toasts and its advancements screen (L) are its own game's, from that.
  A guest's own game meets no criteria itself (vanilla `ClientAdvancements`): what it sees is the host's to judge.
- **Announced to everyone.** "Alex has made the advancement [Stone Age]" (goals and challenges in their own words and
  colours) goes to the host's chat and every guest's, if `announceAdvancements` is on, as vanilla's
  `PlayerList.broadcastSystemMessage`. The host's own advancements now reach its guests' chat too; they didn't.

**Found on the way, single-player too:** right-clicking a tame horse (getting on it, saddling it) threw an error in the
game's own advancement hook (`player_interacted_with_entity` read a horse's `bodyArmor`, which is a method on a horse
and a field on a wolf), and an error in a tick stops the game's frame loop. Fixed for both the host's own player and
guests by one helper, `game/progressTriggers.ts` (a horse's body armour is now read through its method).

### b. Boss bars

A guest now sees every boss bar the host's world shows its player, as vanilla's `ServerBossEvent` shows each bar to its
own players: the dragon's to the players in its arena (alive, within 192 blocks), a raid's to those round it, and any
other kind added later. Each comes with its name, progress, colour, notches (overlay) and the three flags: darken the
sky, play the boss music, close in the fog (`CB.BossEvent`, all of a bar whenever any of it changes; `CB.BossEventRemove`
when it's no longer shown). On the guest the bar is changed in place, so its overlay slides the progress along as the
host's does; the boss music (`music.dragon`) and the End's fog follow from the overlay as they do for the host.

Nothing in the net code names the dragon. Every bar comes from `game/bossBars.ts`: a list of sources, each saying which
bars it shows a player (the dragon fight's and the raids' are there), asked by the game's own HUD for its player, by the
host for each guest, and answered on a guest by its session with what the host sent. **A new boss (the wither) needs
only `addBossBarSource((level, viewer) => [...])`**, or a line in that list; its bar then reaches guests by itself.
`BossBar.darkenScreen` (optional) and `BossHealthOverlay.shouldDarkenScreen()` are new: the flag reaches a guest's
overlay; drawing the darkened sky from `hud.bossOverlay.shouldDarkenScreen()` is the wither branch's (no boss here
darkens the sky yet), and done that way it works for guests too.

### c. Hitting the ender dragon, and the fight from a guest's side

**Why a guest couldn't hurt it.** Three things, each enough on its own:

- A guest's copy of the dragon never laid its parts out: vanilla's client places the eight part boxes round the dragon
  in its own `aiStep`, and a copy's own tick never runs here, so its boxes stayed where they were made (at 0, 0, 0) and
  its crosshair never found the dragon. Worse, the entity data had taken the copy's `head`, `neck`, `body`, … fields
  for references to host entities the guest had no copy of, and set them to nothing.
- Even with a part under its crosshair, a guest named nothing to the host (only copies have the host's ids), and the
  host would have refused the dragon itself (only its parts can be picked).
- The copy's 64-tick trail (vanilla `positions`) was never filled and its phase never followed the host's, so a guest
  drew the dragon always facing south, its neck and tail straight, its head hanging as if it sat.

**What it does now.**

- The copy works out what vanilla's client does in its `aiStep` (`EnderDragon.animateMirror`): the phase the host says
  it's in (a field `phase`, vanilla `DATA_PHASE`, kept by `DragonPhaseManager.setPhase`, followed as vanilla's
  `onSyncedDataUpdated`), its trail, and its parts laid out round it (`tickParts(false)`; the wings' buffet, the bite,
  the blocks eaten and the fight's bookkeeping stay the host's, vanilla's `ServerLevel` checks). Its breath, roars and
  bursts are the host's, heard and seen from there.
- A guest names the part under its crosshair as vanilla's client does: the dragon's id, then one more for each part in
  order (vanilla `EnderDragon.setId`). No new packet: it's `MovePlayer`'s target. The host finds the part among the
  entities it has shown that guest (`EntityTracker.partById`, vanilla `ServerLevel.getEntityOrPart`), checks the reach
  against **that part's own box** (3 blocks and vanilla's 3 more, `canInteractWithEntity(box, 3.0)`), and the blow goes
  to the part: the head takes it in full, the rest a quarter plus one; a perched dragon shrugs off arrows, set alight.
- The entity data never sends an entity's own parts nor lets a host overwrite them (any entity's, not the dragon's by
  name); the dragon's trail pointer and growl countdown are each side's own.

**The fight from a guest's side** (`tests/multiplayer/m8-dragon.mjs`, a real End and fight, the guest in survival):

| What | As the guest has it |
|---|---|
| Its phases (circling, landing, perched: scanning, roaring, breathing; taking off; swooping; dying) | follows the host's (was stuck at the one it came into view in) |
| How it's drawn: facing, neck and tail (its trail), its wings' beat, its hurt flash | as the host's, a few ticks behind (was: always facing south, straight) |
| Hitting it: sword, through the part under the crosshair; reach against that part | head in full, the rest ¼ + 1; a part 6 blocks off isn't hit, though the dragon's own box is a block and a half away |
| Hit enough while perched (a quarter of its health) | takes off |
| Arrows at a perched dragon | no harm, set alight |
| Its roar, its breath, the cloud of breath before it | heard, seen; the cloud hurts the guest standing in it (instant damage) |
| A fireball spat at the guest as it swoops | seen and heard; its cloud where it bursts |
| The crystals: the healing beam, a crystal broken by the guest's blow | the beam to the crystal the host has it to; blown up, gone |
| The death: coming apart over the portal, the rays, its roar | seen and heard |
| Its experience | taken by the guest |
| Free the End | the guest's, whose blow brought it down |
| The exit portal, the egg, a gateway, the boss bar going | in the guest's world, gone from its screen |
| Through the gateway | out on the outer islands, told where it is, the world there sent |

### d. Firework rockets for a gliding guest

**Why.** A rocket used while gliding is fixed to the glider and, every tick, pushes it along its look. On the host
that push went to the host's copy of the guest's player, whose place and speed the guest's own moves overwrite each
tick; the guest's own game, which moves its player, never got it. Vanilla's client runs the rocket's tick too, and it
is the client's copy of the rocket that pushes the client's own player.

**Now.** A guest's copy of a rocket fixed to the guest's own gliding player gives it that push in the guest's own tick
(`FireworkRocket.animateMirror`, the same lines as the host's tick, `boostGlider`), before the guest's player moves, as
vanilla's client does; and the copy keeps by whoever it's fixed to. A guest's copy of any entity that has an
`animateMirror` now gets it called (`EntityMirror.tick`; before, only living ones). Measured in the test: a gliding
guest went from 0.29 to 0.52 blocks a tick with a rocket before (the host's own player: 1.67); now to 1.5 to 1.67,
within a quarter of a block a tick of the host's own player.

**Checked as well:** a rocket a guest sets off on a block (from where it clicked, one used up; the guest sees it rise
and hears it go, its sparks and its burst with its stars as made) and one shot from a guest's crossbow (loaded from
the other hand, flying along its look and drawn on its back, heard; bursting on the pig it hits and hurting it, the
guest out of its reach unhurt). Both worked; nothing changed there.

### e. The End Poem

**Why a guest was stuck.** The host's world is the only one there is: when the host leaves a dimension its guests go
with it, and come in beside it once it's there. Going home through the End's exit portal for the first time, the
host's own arrival waited for its poem (seven minutes and more), and its level stood still meanwhile, only keeping its
guests alive on the way (`HostServer.idleTick`). So every guest sat on "Loading terrain..." until the host's poem was
over or skipped, with nothing to do and no way on.

**What vanilla does.** The player going through gets the poem (`ServerPlayer.showEndCredits` → `WIN_GAME`) and is taken
out of its level meanwhile; the server goes on for everyone else. When the poem is over or skipped, the client sends
`PERFORM_RESPAWN` and the player comes back at its bed or by the world spawn, keeping everything
(`PlayerList.respawn(player, true)`, with the `CHANGED_DIMENSION` trigger from the End). Each player sees it once
(`seenCredits`).

**Decision: each gets its own poem, the world goes on, nobody waits for anybody.** In a world open to LAN:

- **The host:** the world goes on during its poem, as vanilla's server does. Home comes in behind the poem as after any
  end portal and the host's player is put there, but **out of the level till its poem is over**, as vanilla's is out of
  every level (`Player.wonGame`): not among the level's players nor the entities anything finds (so no mob goes for it,
  nothing pushes, hits or picks it, it doesn't count for sleeping or spawning), not ticking, not hurt, gone from the
  guests' worlds, and hearing nothing of the world (the credits' music alone). Its poem stays over the end portal's
  starfield as before. Over or skipped (Esc), it's back in the level where home put it.
- **Each guest taken along that hasn't seen the poem gets its own** (`CB.WinGame`): the same screen as the host's,
  skippable with Esc, over its loading screen's stars. Meanwhile it's out of the world (still on its way, as any guest
  taken along is), nobody times out, and its loading screen doesn't ask the host for the world again (it isn't stuck,
  it's watching). Over or skipped, its game says so (`SB.ClientCommand` 0, vanilla's `PERFORM_RESPAWN`), "Loading
  terrain..." comes up, and the host brings it home as vanilla's respawn after the credits does: **at its bed** (whose
  chunks are asked for and waited for a few seconds, as a respawn's are) **or by the world spawn**, keeping everything
  but its fire and its breath, its trip from the End counted. If the host has gone on meanwhile (say, to the Nether),
  its poem rolls on as it's taken along, and it comes in beside the host there.
- **A guest that has seen the poem, or a dead one,** comes in beside the host as soon as home is in, as it always has.
- **A guest that leaves in the middle of its poem** is kept where it was in the End, the poem seen (vanilla keeps the
  player where it was too).
- **Never stuck:** the host doesn't wait for its guests' poems, nor they for the host's or each other's. A guest whose
  "over" got lost would ask for the world again from its loading screen (as any slow guest does), and the host takes
  that as its poem over too.
- **Single-player is unchanged:** with no LAN, the host's arrival still waits for its poem, its level standing still.

Why not something simpler: making guests wait for the host's poem is the bug; giving guests no poem and letting them in
beside the host while its own plays would leave the host's player standing frozen in a running world (and take the
poem from each guest); skipping the host's poem when it has guests would take it from the host. Each player's own
poem, out of the world while it plays, back home after, is vanilla's own behaviour.

### f. Being disconnected under load (the Nether's crowds)

**What was sent.** Measured with the test harness (a scratch sweep over every mob kind, eight of each round a guest, and
a basalt delta's crowd), before this change:

- **48 magma cubes cost a guest about 1000 packets a second** (62 KiB/s before compression), the lead's number. Nearly
  all of it was each cube's `squish`, `oSquish` and `targetSquish`, sent every tick: after each landing the squish eases
  back by ×0.6 a tick, so its value changes every tick for well over a minute. Vanilla syncs none of it: its client
  works the squish out from the cube landing and leaving the ground.
- **Particles vanilla's client makes itself, sent as the host's:** a dragon's breath cloud 580 a second each, a warden
  digging or emerging 310 a second, a breeze's dust 117, a blaze's smoke 40, an enderman's portal specks 40, a phantom's
  40, a glow squid's 20, and a slime's or magma cube's splash as it lands (16 to 65 each landing).
- **Fields that change every tick, which vanilla doesn't sync or its client counts:** a squid's and a glow squid's
  tentacles and tilt, a guardian's tail and spikes, a chicken's and a parrot's wings, a warden's heartbeat, a breeze's
  whirl countdown, a blaze's next height, a goat's and a frog's jump and ram cooldowns, a fox's time since it ate, a
  trader's llama's time left, the block every mob's feet were last checked in for Soul Speed, the piglins' and hoglins'
  brain memories, and a hurt mob's red flash counting down (ten packets a hurt).

**What drops the guest** (reproduced in real time: a host and a guest through the relay at 20 ticks a second, the
relay's link to the guest throttled by a proxy; scratch, not in the repo):

- None of the game's own backlogs or rate limits is reached by this. The host bundles a tick's packets into one message
  for each guest, so a guest gets 20 messages a second however many packets are in them: the guest's limit (2400
  messages waiting between two of its ticks) would take two minutes of its game standing still; the relay's rate limit
  (800 messages a second) is on what a guest sends, not on what it's sent; the host's own backlog limit likewise.
- The keep-alive doesn't drop it here either: the host and the guest each take any message as a sign of life, not only
  the keep-alive's answer, so an answer stuck behind a queue doesn't time a guest out (vanilla's server does: a
  keep-alive answered 15 s late is "Timed out"; that may be what the lead had in mind).
- **What happens is that the guest falls further and further behind.** The host's link to the relay is local and never
  pushes back, so what the guest's link can't carry waits in the relay (and the computers' socket buffers). With 48
  cubes over a link of 16 KiB/s the guest fell behind by 0.3 s every second (18 s after a minute); at 8 KiB/s, 98 s
  behind after two and a half minutes, without end: its world shows what happened a minute ago while the host acts on
  its clicks now. It is let go only when the relay holds 32 MB for it ("The connection couldn't keep up with the host.",
  tens of minutes at those rates, the sockets' own buffers taking the first megabytes: with the relay's limit cut to
  1 MB it was still connected, 98 s behind, after 150 s), or by its own game when more than 2400 messages reach it at
  once (as a queue let go all together does: a throttle lifted, a page frozen in the background).
- `?mplag=` and `tests/multiplayer/m5-latency.mjs`: lag on its own (20 to 200 ms) piles nothing up, and m5-latency
  passes before and after. One thing to know: under `?mplag=` each message the page receives waits on a timer, which
  browsers run once a second in a background tab (Chrome, after five minutes hidden: once a minute), so a test page
  with `?mplag=` left in the background reads one message a second and falls behind for as long as it's hidden. The
  flag is for testing only.

**Confidence.** That the flood is what the lead saw: high (the numbers match). That the drop came from the guest falling
behind over a link or a game that couldn't keep up, and was then let go by the relay's or the guest's limit: medium (I
can't see the lead's network or computers; a LAN's Wi-Fi carries 20 KiB/s easily, a tunnel or a busy network may not,
and a guest's game slowed by thousands of particles a second falls behind the same way, in its own queue). That it was
the keep-alive timing out: low, for this code (see above). If it happens again, the reason on the guest's Disconnected
screen tells which: "The connection couldn't keep up with the host." (the relay), "too much, too fast" (its game),
"Timed out" (nothing heard for 30 s).

**Decision: don't send what the guest's game works out, as vanilla's server doesn't; and when a guest falls behind
anyway, send it only what can't wait until it catches up, then the rest afresh, rather than letting it go.**

- **Worked out by the guest's copies** (each copy's `animateMirror`, the same lines as the host's tick, as vanilla's
  client runs them): a slime's and magma cube's squish and landing splash (from the on-ground flag its moves carry); a
  chicken's and a parrot's wings; a squid's and glow squid's tentacles and tilt (the beat's speed is still sent); a
  guardian's tail, spikes and bubbles; a warden's heartbeat, tendrils and digging dust; a breeze's dust and whirl; a
  blaze's smoke and burning sound; an enderman's portal specks; a phantom's specks and wing flaps; a glow squid's
  sparks; a dragon's breath cloud's puffs; a hurt mob's red flash running out, sent as it starts (also a warden's
  tendrils and a glow squid's dark). The host's own player still sees all of them: they're played for it
  (`Level.clientEffects`), just not sent. Not sent at all: the host-only counters listed above.
- **A copy counts its age from the host's** (sent as it comes into view): animations the host starts at an age (a
  frog's croak and leap, a warden's emerging, a breeze's slide, a bat taking off) played from the wrong tick on a guest
  before, whose copies counted from when they first saw them.
- **A guest that falls behind** (new `CB.Ping` / `SB.Pong`, vanilla's ping and pong packets): the host asks each guest
  how far it's got every half second. A guest whose latest answer is to a question asked more than 5 s ago is behind:
  until its answers come within 2 s again, it's sent only what can't wait (blocks changing, its own player's health,
  inventory, menus, chat, the time) and not where the others and the world's entities are, how they look, new chunks,
  sounds or particles. Once caught up it's sent every entity's and player's fields afresh (their places and riders go
  as ever, being what changed since last sent; whatever came or went meanwhile comes or goes). The guest that keeps up
  meanwhile is sent everything as ever. The console says when a guest falls behind and when it's caught up. The
  relay's 32 MB limit stays as the last resort.

**Results.** The 48 cubes with 4 blazes and 4 endermen: about 100 packets a second, 4.4 KiB/s (was over 1000 packets,
60 KiB/s). From the sweep, eight of each, packets a second before → after: magma cube 168 → 10, slime 242 → 38,
blaze 520 → 34, enderman 349 → 28, squid 162 → 2, glow squid 322 → 2, guardian 225 → 55, chicken 191 → 45, parrot 198
→ 39, fox 198 → 45, goat 210 → 51, trader llama 196 → 29, breeze 1124 → 22, warden 2532 → 1, phantom 406 → 64, a
dragon's breath cloud 4641 → 1; what's left is mostly their moves. The real-time reproduction: over 16 KiB/s the guest
now keeps up (0.1 s behind); over 2 KiB/s, slower than even the crowd's new traffic, the host takes it for behind
every 15 s or so, it catches up within 5 to 8 s, it's never more than 7 s behind and never let go (before: further
behind without end).

Why not something simpler: a bigger relay buffer only puts the drop off while the guest falls further behind; sending
entity data every other tick to everyone loses changes (an entity's data is worked out once a tick for all guests
together, `net/entityData.ts`); compressing harder doesn't make a slow link faster.

## 2. Shared files changed (for merging)

| File | What changed, and the hook |
|---|---|
| `src/net/config.ts` | `PROTOCOL_VERSION` 7 → 8. |
| `src/net/protocol.ts` | `CB.UpdateAdvancements` = 100, `CB.BossEvent` = 101, `CB.BossEventRemove` = 102 (numbered from 100, clear of other branches' packets), `BOSS_BAR_COLORS`, `BOSS_BAR_OVERLAYS`, and their field checks. |
| `src/net/server/session.ts` | `progress` (a `GuestProgress`): loaded with the guest's record, hooked to its player and its `Interaction`, ticked after its clicks, flushed at the end of the tick, saved with its record; dimension changes and beds tell it; a `MerchantMenu` shown to the guest gets its `onTraded`. `bossBars` (a `BossBarSync`): synced at the end of `flush()`, cleared in `leaveDimension`. |
| `src/net/server/hostServer.ts` | `hookGuestProgress(this)` in the constructor (undone on close); a guest's block menus get its `menuEvents`. |
| `src/net/client/clientSession.ts` | handles `CB.UpdateAdvancements` (checked by `readProgress`) → `ClientHooks.advancements`; `bossBars` (the host's bars, by id) from `CB.BossEvent`/`CB.BossEventRemove`, cleared on `ChangeDimension`, and a boss bar source answering for the guest's own player. |
| `src/gui/hud.ts` | the boss overlay's line: `bossBarsShownTo(game.level, game.level.player)` in place of the dragon's and the raids' bars by name (the same bars in single-player). A branch adding its own boss here should add a source in `game/bossBars.ts` instead. |
| `src/gui/bossOverlay.ts` | `BossBar.darkenScreen?` and `shouldDarkenScreen()`. |
| `src/game/game.ts` | the guest's `PlayerAdvancements` is `remote`; the `advancements` client hook (toasts); the host's announcement also to guests (`server?.hostChatted`); a guest's archaeology loot, decorated pot, dragon respawn and end gateway go to `level.onPlayerTrigger`; the piglin's thrown-item trigger is the thrower's; `interactedPayload` replaces the inline body-armour code. The line `tests/end/elytra.mjs` greps for is untouched. |
| `src/game/advancements.ts` | `PlayerAdvancements.remote` (two lines). |
| `src/game/level.ts`, `src/entity/mob.ts` | `onThrownItemPickedUp` gets the thrower as a third argument. |
| `tests/multiplayer/m4-playerdata.mjs` | one check expected a guest's record to have no advancements; it now expects the guest's own. |
| `src/entity/enderDragon.ts` | `phase` (vanilla `DATA_PHASE`); `animateMirror()` (a guest's copy: phase, trail, parts); the trail's lines moved to `recordPosition()`; `tickParts(server)`: the host's part of it (`server`: buffet, bite, walls, fight) behind a flag, the layout shared. The host's tick does what it did. |
| `src/entity/dragonPhases.ts` | `DragonPhaseManager.setPhase` keeps `dragon.phase` (one line). |
| `src/net/entityData.ts` | an entity's own parts (`subEntities`) never sent nor overwritten, by any field naming one; `ender_dragon`'s `posPointer` and `growlTime` not sent. |
| `src/net/server/entityTracker.ts` | `partById(id)`. |
| `src/net/server/session.ts` (again) | `targetEntity` also finds a part (`tracker.partById`). |
| `src/net/client/clientSession.ts` (again) | `netIdOf(e)`: a part of a copy is named by its dragon's id and its place (`MovePlayer`'s target). |
| `src/entity/fireworkRocket.ts` | the push to a glider moved into `boostGlider(a)` (the host's tick unchanged); `animateMirror()` for a guest's copy. |
| `src/net/client/entityMirror.ts` | calls `animateMirror()` on any copy that has one, not only living ones (two lines). |
| `src/game/endTravel.ts` | `showEndCredits`: with `g.server` (open to LAN) home doesn't wait for the poem, the host's player is `wonGame` while it plays, `g.server.showEndCredits()` gives the guests theirs; after it, "Loading terrain..." only if home isn't in yet. Single-player takes the same lines as before. |
| `src/game/game.ts` (again) | at arrival the poem isn't closed if the host is out of the world; `render` draws the starfield behind it while the host is out (`starfieldFrom`: the starfield's clock, the same as before on a loading screen); `sound.tick` skipped while out; the guest hook `winGame` → `guestWinGame()` (the WinScreen over the loading, `creditsOver` once it's done, the arrival waiting for it); `guestChangedDimension` leaves the poem up if one is playing; `guestPoem` let go on leaving. |
| `src/entity/player.ts` | `wonGame` (vanilla `ServerPlayer.wonGame`); `isInvulnerableTo` is true while it's set. |
| `src/game/level.ts` (again) | `players()`, `getEntities()` and the entity loop in `tick()` leave out a `wonGame` player (never set in single-player). |
| `src/net/effects.ts` | the host's own ears don't hear the level while its player is `wonGame` (the guests still do). |
| `src/net/entityData.ts` (again) | a player's `wonGame` isn't sent. |
| `src/net/protocol.ts` (again) | `CB.WinGame` = 103 (no fields); `SB.ClientCommand`'s doc. |
| `src/net/server/session.ts` (again) | `winGame()`, `creditsOver()`, `held`; `arrive()` now waits for a bed's chunks after a poem and puts the guest in with `comeIn()` (the old body, plus the respawn-after-credits placing); `askForBed()` and `respawnPlace()` taken out of `respawn()`/`respawnNow()` (a death's respawn does what it did); `ClientCommand` in `handle` and `handleIdle`; `resync` takes a watching guest's ask as its poem over; the bed wait in `tick()` while travelling. |
| `src/net/server/hostServer.ts` (again) | `showEndCredits()`; the "left behind" check skips `held` guests. |
| `src/net/client/clientSession.ts` (again) | `CB.WinGame` → `ClientHooks.winGame` (straight `creditsOver()` without one); `inCredits` pauses `checkLoading`; `creditsOver()` sends `ClientCommand` 0 at once. |
| `tests/multiplayer/lib.mjs` | the test guest's `winGame` hook counts `poems` (the test says when each is over). |
| `src/game/level.ts` (again) | `clientEffects(fn)` and `onClientEffects`: vanilla's client-side particles and sounds, played for the game's own player; a host sends them to nobody (single-player: `fn` runs as before, the same random numbers in the same order). |
| `src/net/server/hostServer.ts` (again) | `onClientEffects` → `runLocal` (undone on close); `broadcastNear(…, passing)`: a sound or particles skip a guest that's behind. |
| `src/net/entityData.ts` (again) | more host-only fields in `NOT_SENT` (Soul Speed's last block, brain memories) and `NOT_SENT_BY_TYPE` (what the copies work out); `COUNTDOWN` (a hurt flash, a warden's tendrils, a glow squid's dark: sent as they start); `$tick` (the entity's age) in `DataWatcher.full`, taken by `applyData`. A branch adding a mob whose fields change every tick should add them here, or work them out in its `animateMirror`. |
| `src/entity/living.ts` | `animateMirror` also counts down `hurtTime` (a copy's only). |
| `src/entity/monsters.ts` | Slime: the landing moved into `land(host)`, `animateMirror`; Enderman: `portalParticles()`, `animateMirror`. The host's ticks do what they did. |
| `src/entity/animals.ts`, `src/entity/parrot.ts` | Chicken `flapWings()`, Parrot `calculateFlapping(glide)`, each with `animateMirror`. |
| `src/entity/blaze.ts`, `src/entity/breeze.ts`, `src/entity/phantom.ts`, `src/entity/warden.ts`, `src/entity/glowSquid.ts`, `src/entity/guardian.ts`, `src/entity/areaEffectCloud.ts`, `src/entity/water.ts` (Squid) | each one's client-side lines moved into a method of their own, called through `level.clientEffects` by the host's tick and by the copy's `animateMirror`; Guardian's `clientHalf(host)`. Same order of random numbers in single-player. |
| `src/net/protocol.ts` (again) | `CB.Ping` = 104, `SB.Pong` = 60 (numbered clear of other branches' packets). |
| `src/net/config.ts` (again) | `PING_TICKS`, `SLOW_TICKS`, `CAUGHT_UP_TICKS`. |
| `src/net/server/session.ts` (again) | pings in `tick()` and `idleTick()`; `pong()`; `slow`, `checkPace()` and `refresh()` in `flush()`; `tickChunks(more)` sends no new chunks while behind. |
| `src/net/server/entityTracker.ts` (again) | `refresh()`: every tracked entity's fields afresh. |
| `src/net/client/clientSession.ts` (again) | answers `CB.Ping` with `SB.Pong`. |

New files: `src/net/advancementSync.ts`, `src/net/server/guestProgress.ts`, `src/game/progressTriggers.ts`,
`src/game/bossBars.ts`, `src/net/server/bossBarSync.ts`, `tests/multiplayer/m8-advancements.mjs`,
`tests/multiplayer/m8-bossbars.mjs`, `tests/multiplayer/m8-dragon.mjs`, `tests/multiplayer/m8-fireworks.mjs`,
`tests/multiplayer/m8-endpoem.mjs`, `tests/multiplayer/m8-load.mjs`.

## 3. Open points

- Vanilla sends a player only the advancements visible to it; here the guest is sent its progress and works out what's
  visible itself (the advancements are the build's own). What it shows is the same.
- Advancement rewards (experience, loot) aren't implemented for anyone in this game; guests are no different.
- Statistics are still the host's alone.
- Boss bars go whole on any change (vanilla sends only the part that changed); a bar is some 40 bytes, and the dragon's
  changes only when it's hurt.
- Only the pink bar and the raid's red notched one have textures in this game; a colour another branch adds needs its
  sprites, as it does for the host.
- (c) The head's box lies inside the neck's (vanilla's sizes and offsets: 1 and 3 wide, 6.5 and 5.5 blocks out), and
  seen from in front of a perched dragon the two share a face: which one the crosshair lands on is a tie, as it is in
  vanilla (the first in the list, the head, when they are exactly level). A diving dragon's head hangs below its neck.
- (c) Found, not changed (single-player alike, and part 1 leaves single-player as it is): vanilla's `Player.attack`
  counts a blow to a part against its dragon (`parentMob`) for the weapon's wear, `lastHurtMob` and the damage
  particles; here a blow to a part wears no sword and shows no particles, for the host as for guests.
- (c) The dragon's breath and its bursts as it dies reach a guest as the host's particles, within 32 blocks (vanilla
  `sendParticles`); vanilla's client makes them itself and shows them as far as it draws the dragon. (A breath cloud's
  puffs are now the guest's copy's own: f.)
- (c) The dragon's wing beat (`flapTime`) and turn (`yRotA`) still go to guests each tick: the wings stay in step with
  the flap sound the host plays, and a few numbers for one entity are nothing (vanilla's client counts its own).
- (d) A rocket's sparks are the host's particles, made where the host has the rocket, by its copy of the guest's
  player: a guest flying at a rocket's pace sees its sparks trail a little behind it (the round trip's worth of flight;
  vanilla's client makes them at its own player). The rocket itself isn't drawn while it's fixed to a glider (vanilla
  `shouldRender`), so nothing else shows it.
- (d) The guest's push lasts while the guest has the copy: from its coming to its going, each a one-way trip after the
  host's, so as long as the host's rocket lives.
- (e) Guests taken along get the poem though they didn't step into the portal themselves (in vanilla each sees it when
  it goes through on its own): taking guests along is how this game runs one dimension at a time, and giving each its
  poem then is the nearest thing.
- (e) The host's player waits out its poem at home in the Overworld (only one dimension runs), and the chunks round it
  stay loaded; vanilla's is in no level and holds none.
- (e) The host's player is put home as its poem starts (at its bed or near the world spawn), not as it ends, as
  vanilla's respawn would: a bed broken meanwhile doesn't send it to the world spawn. Its trip home (`changed_dimension`)
  counts as home comes in (no advancement hangs on End → Overworld).
- (e) What can't be checked headless: the host's poem kept up through its arrival with the starfield behind it, and a
  guest's poem kept up through a second `ChangeDimension`. Both are a few lines of `Game`; see the checklist.
- (f) The thresholds (behind past 5 s, caught up within 2 s, a ping every half second) are mine; vanilla has nothing like
  it (its client either keeps up or times out).
- (f) While a guest is behind, its copies stand where they were last told, its chunks don't come (walking fast, it may
  reach the edge of what it has for a few seconds), and it hears and sees no sounds or particles from the host; whatever
  it does itself is taken by the host as ever.
- (f) Still sent as they change, being small: the dragon's wing beat and turn (c), a dolphin's moistness out of water
  (vanilla syncs it too), a rabbit's jump counters, a shulker's peek while it opens, a horse's tail swish, a mob's arm
  swing (vanilla: an animate packet). A mob's moves still go as full positions (vanilla sends small ones as steps).
- (f) A squid's copy begins its tentacles' beat again itself (vanilla's client holds it till the server's event says
  it's begun): the beat's speed is the host's, its phase the copy's own.
- (f) The sounds vanilla plays on its client only (`playLocalSound`: a blaze burning, a breeze's whirl, a phantom's
  flap, a warden's heartbeat, a guardian flopping on land) are now made by the guest's copy, at its own random
  moments, rather than sent at the host's.
- (f) Not reproduced: the lead's own disconnect (which screen said what). The browser checks of the slow-guest handling
  were done headless with real sockets, not in two browser windows.
- (f) The wither (merged from the other branch) sends its smoke to guests as particles, 60 a second for one wither
  (vanilla: its client's own); one line in its file (`level.clientEffects` round the smoke, and the same call from an
  `animateMirror`) would make it the copy's, as here for the blaze. Left to that branch.

## 4. Tests

- `tests/multiplayer/m8-advancements.mjs`: 47 checks. Joining (a reset, nothing done, the guest's own game meeting
  nothing); Stone Age from what's held, on the host and the guest, its toast once, the line in all three chats, vanilla's
  words; a root (no toast, no line); `announceAdvancements` off; a kill and being killed; bread eaten (1/40 of A
  Balanced Diet, shown alike); a trade; a tame horse got on (the host's tick not broken; the payload's body armour from a
  horse's method and a wolf's field); a bed; a biome; 17 effects at once (a challenge's purple line); the Nether with
  the host; the host's own advancement in the guests' chats; leaving and coming back (kept, told as a reset, no toasts or
  lines again); a host sending advancements or criteria that don't exist, `__proto__`, `constructor`, bad shapes (the
  guest leaves, saying why) and a good one (taken). Passes in memory, and through the relay with 20 to 200 ms of lag
  (`MP_NET=ws MP_LAG=20-200 MP_LAG_SEED=12345`).
- `tests/multiplayer/m8-bossbars.mjs`: 29 checks. A bar from a source added later (as the wither's will be): to the
  guest it's shown to only, with its flags, its screen darkening; its progress followed within the tick on the same bar
  (the overlay sliding to it); nothing sent while nothing changes; its name, colour, notches and flags changed; shown
  to the other guest as it is now; taken from one, then both. The dragon's in the End: both guests' with the music and
  the fog, going down as it's hurt, lost by a guest 400 blocks off, gone when it's killed, let go on the way home and
  not seen in the Overworld. A host sending a colour, overlay, progress, flag, name length or shape that's wrong (the
  guest leaves, saying why), a name with formatting (shown plain), a removal of a bar it never had (taken). Passes in
  memory and through the relay with lag.
- `tests/multiplayer/m8-dragon.mjs`: 44 checks, on a generated End with its fight. The guest's copy (its parts its own,
  laid out where the host had them a few ticks before, its trail turning, its wings, its phase); the perched dragon hit
  by the guest's sword through the part under its crosshair (head in full, neck a quarter plus one, parts out of reach
  and the dragon itself not hit, part ids past its eight refused), an arrow glancing off; taking off; roar, breath and
  its cloud; a fireball spat at the guest; the crystals' beam and one broken; the death, the roar, the experience,
  Free the End, the exit portal, the egg, a gateway, the bar gone; through the gateway. Passes in memory (three runs),
  and through the relay with lag (seeds 12345 and 777).
- `tests/multiplayer/m8-fireworks.mjs`: 16 checks. A gliding guest and the host's own player, each with a rocket: the
  guest's fixed to it on both sides, its speed up to a rocket's pace as the host's own player's is, the host's copy of
  it following, the push gone with the rocket; a rocket set off on a block (from the click, used up, seen rising and
  heard, its sparks, its burst and star); one shot from a crossbow (loaded from the other hand, shot along the look on
  its back, heard, bursting on a pig and hurting it). Without the fix, the speed checks fail (0.52 against 1.67). Passes
  in memory (repeatedly) and through the relay with lag (seeds 12345 and 777).
- `tests/multiplayer/m8-endpoem.mjs`: 35 checks, six guests. The host through the exit portal the first time: seen,
  out of the End at once, its poem over the loading, out of the level; everyone taken along; Alex, Cleo, Eve and Fay
  get the poem, Bea (seen it) and Dee (dead) don't. Cleo skips hers before the host is home and comes in with it. Home
  in, the host is put there at once with its poem still rolling; Bea and dead Dee come in beside it, Cleo by the world
  spawn (its trip from the End counted), the three still watching stay out. The level goes on; the host's player isn't
  among the players or the entities found, isn't ticking or hurt, and is gone from the guests' worlds. Fay leaves in
  the middle (kept in the End, the poem seen). 45 seconds on: nobody times out, no loading screen asks for the world
  again. Alex's poem over: its far bed's chunks asked for and waited for, then home beside its bed, keeping its
  diamonds, levels and health, fire out and breath back, its bed its own. The host's poem over: back where home put
  it, among the players, in the guests' worlds. The host goes on to the Nether while Eve watches: Eve taken along, its
  poem not restarted; over, it comes in beside the host there. Passes in memory and through the relay with lag (seeds
  12345, 777 and 4242, repeatedly). `tests/end/credits.mjs` (single-player: home waits for the poem) passes unchanged.
- `tests/multiplayer/m8-load.mjs`: 29 checks. A basalt delta's crowd round a guest (48 magma cubes, 4 blazes, 4
  endermen): the cubes' data seldom, no particles sent, under 200 packets a second and 12 KiB/s; the copies squishing,
  splashing flame as they land, the blazes smoking and burning and the endermen trailing specks on the guest, the host
  still seeing its own; each copy's age the host's. A hurt cube: its flash on the copy, run out a tick at a time, sent
  once. A dragon's breath cloud: its puffs the copy's own, none sent. A second guest whose game stops: not behind at
  3 s, behind past 5 s and not let go; while behind, sent nothing of where things are or how they look, nor sounds or
  particles, a few small messages a second, its game not flooded, while the guest that keeps up gets everything; its
  game going on, it catches up within a second or two and is sent it all afresh: a sheep dyed, a cube moved, a cube
  and a pig gone and a pig come meanwhile, and every entity it's shown where the host has it, with its size and
  health. Passes in memory and through the relay with lag (seeds 12345, 777 and 4242).
- Through the relay with lag (`MP_NET=ws MP_LAG=20-200 MP_LAG_SEED=12345`) every m8 suite passes. Several older
  suites (m1-blocks, m1-chunks, m1-leave, m1-login, m1-players, m1-world, m2-actions, m2-entities, m3-menus,
  m3-survival, m4-dimensions, m6-commands) fail under that lag on `main` too (2d08345, the same seed), with the same
  checks give or take a few that come and go between runs on either: their ticks were written for a network that
  answers within the tick. Not changed. `tests/ocean/m2.mjs` ("never drowning") and `tests/goat/goat.mjs` ("hurt, it
  runs") each failed once in a run and passed three times after, on this branch and on `main` alike.
- Every other multiplayer suite passes, with all of `tests/end/`, `tests/saves/player.mjs`, the horse, wolf, frog and
  armadillo suites, and `tests/remaining-mobs/load-order.mjs`. `npm run typecheck` is clean.

## 5. Checklist for the lead

`npm run lan`, then two windows at `http://localhost:4173` (host: Singleplayer → a Survival world → Esc → Open to LAN →
Start LAN World; guest: Multiplayer → the world → a name → Join Server).

1. The guest picks up a log, crafts planks and a crafting table: no toast for the root, then e.g. "Stone Age" once it
   holds cobblestone: a toast on the guest's screen only, and "Alex has made the advancement [Stone Age]" in both chats.
2. The guest presses L: its advancements screen shows what it has done, not the host's.
3. The host earns one (say, Stone Age too): its line appears in the guest's chat as well.
4. `/gamerule announceAdvancements false` on the host: the guest's next one shows a toast but no chat line.
5. The guest leaves and joins again by the same name: its advancements are still there (L), with no toasts.
6. The host walks through a nether portal: the guest gets "We Need to Go Deeper".
7. The host goes to the End with the guest (or `/execute in minecraft:the_end run tp @s 0 70 0` once the guest has
   joined): both see the Ender Dragon's pink bar, with the dragon's music; when either hits the dragon, the bar goes down
   in both windows. A raid (Bad Omen into a village) shows its red notched bar to the guest near it.
8. The guest right-clicks a tame horse (`/summon horse ~ ~ ~2 {Tame:1b}`) and gets on; so does the host with another:
   the game keeps running smoothly in both windows.
9. In the End with the guest: the dragon, in the guest's window, faces the way it flies, its neck and tail bending as
   in the host's. When it perches on the portal, the guest walks up to its head and hits it with a sword: the boss
   bar goes down in both windows (a full blow on the head, less elsewhere). The guest sees its breath, its fireballs
   and the purple beam to the crystal healing it; when it dies, its coming apart, the portal, the egg and a gateway;
   it takes the experience, and an ender pearl thrown into the gateway takes it to the outer islands.
10. The guest, wearing an elytra (`/give Alex elytra`, `/give Alex firework_rocket 16`), jumps off something high and
    glides, then right-clicks with a rocket: it shoots forward as the host does with one; the rocket used up. A rocket
    set off on the ground and one shot from a loaded crossbow (rocket in the other hand) fly and burst in both windows.
11. The dragon dead, host and guest in the End, neither having left it through the exit portal before (a new world, a
    new guest name): the host walks into the exit portal. Both windows show the End Poem over the stars. The guest
    presses Esc: "Loading terrain..." for a moment, then it's home (its bed, or by the world spawn) and can play, while
    the host's poem still rolls (the host's player isn't in the world meanwhile: the guest doesn't see it). The host
    presses Esc: it's home, and the guest sees it appear. The second time through, nobody gets the poem, and the guest
    comes in beside the host at once.
12. In the Nether (a basalt delta, or `/summon magma_cube` a few dozen times round the guest): the guest's window keeps
    up, its magma cubes squashing as they land and splashing flame, blazes smoking, endermen trailing purple specks, as
    in the host's. With the guest's window throttled (Chrome DevTools → Network → a slow preset) it lags a little but
    keeps up; on a preset slower than the crowd, the host's console says "Alex is 5.0 s behind…", the guest's mobs
    stand still a few seconds, then "Alex has caught up" and everything is where the host has it. Nobody is
    disconnected.
