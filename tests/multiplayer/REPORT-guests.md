# What LAN guests were missing: report

Branch `claude/vibrant-hypatia-2p2ou6`, from `main` at b935350. Part 1 of the brief: what two people playing survival
on two computers found a guest couldn't do. Each lettered milestone is committed and pushed on its own.
`PROTOCOL_VERSION` is 8 on this branch (main's 7), bumped once for all of part 1.

## 1. Milestones

| | Milestone | State | Commit |
|---|---|---|---|
| a | Advancements for guests | done | a96b5a5 A guest playing on someone's LAN world now has advancements of its own… |
| b | Boss bars for guests | done | 6f92a50 A guest now sees the boss bars the host's world shows it… |
| c | Hitting the ender dragon; the fight from a guest's side | done | 5d949fb A guest can hurt the Ender Dragon… |
| d | Firework rockets for a gliding guest | done | (this commit) |
| e | The End Poem | not started | |
| f | Being disconnected | not started | |
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

New files: `src/net/advancementSync.ts`, `src/net/server/guestProgress.ts`, `src/game/progressTriggers.ts`,
`src/game/bossBars.ts`, `src/net/server/bossBarSync.ts`, `tests/multiplayer/m8-advancements.mjs`,
`tests/multiplayer/m8-bossbars.mjs`, `tests/multiplayer/m8-dragon.mjs`, `tests/multiplayer/m8-fireworks.mjs`.

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
- (c) The dragon's breath, its bursts as it dies and a cloud's puffs reach a guest as the host's particles, within 32
  blocks (vanilla `sendParticles`); vanilla's client makes them itself and shows them as far as it draws the dragon.
- (c) The dragon's wing beat (`flapTime`) and turn (`yRotA`) still go to guests each tick: the wings stay in step with
  the flap sound the host plays, and a few numbers for one entity are nothing (vanilla's client counts its own).
- (d) A rocket's sparks are the host's particles, made where the host has the rocket, by its copy of the guest's
  player: a guest flying at a rocket's pace sees its sparks trail a little behind it (the round trip's worth of flight;
  vanilla's client makes them at its own player). The rocket itself isn't drawn while it's fixed to a glider (vanilla
  `shouldRender`), so nothing else shows it.
- (d) The guest's push lasts while the guest has the copy: from its coming to its going, each a one-way trip after the
  host's, so as long as the host's rocket lives.

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
