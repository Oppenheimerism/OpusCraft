# What LAN guests were missing: report

Branch `claude/vibrant-hypatia-2p2ou6`, from `main` at b935350. Part 1 of the brief: what two people playing survival
on two computers found a guest couldn't do. Each lettered milestone is committed and pushed on its own.
`PROTOCOL_VERSION` is 8 on this branch (main's 7), bumped once for all of part 1.

## 1. Milestones

| | Milestone | State | Commit |
|---|---|---|---|
| a | Advancements for guests | done | a96b5a5 A guest playing on someone's LAN world now has advancements of its own… |
| b | Boss bars for guests | done | (this commit) |
| c | Hitting the ender dragon; the fight from a guest's side | not started | |
| d | Firework rockets for a gliding guest | not started | |
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

New files: `src/net/advancementSync.ts`, `src/net/server/guestProgress.ts`, `src/game/progressTriggers.ts`,
`src/game/bossBars.ts`, `src/net/server/bossBarSync.ts`, `tests/multiplayer/m8-advancements.mjs`,
`tests/multiplayer/m8-bossbars.mjs`.

## 3. Open points

- Vanilla sends a player only the advancements visible to it; here the guest is sent its progress and works out what's
  visible itself (the advancements are the build's own). What it shows is the same.
- Advancement rewards (experience, loot) aren't implemented for anyone in this game; guests are no different.
- Statistics are still the host's alone.
- Boss bars go whole on any change (vanilla sends only the part that changed); a bar is some 40 bytes, and the dragon's
  changes only when it's hurt.
- Only the pink bar and the raid's red notched one have textures in this game; a colour another branch adds needs its
  sprites, as it does for the host.

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
- Every other multiplayer suite passes, with `tests/end/elytra.mjs`, `tests/saves/player.mjs`, the horse, wolf, frog
  and armadillo suites, and `tests/remaining-mobs/load-order.mjs`. `npm run typecheck` is clean.

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
