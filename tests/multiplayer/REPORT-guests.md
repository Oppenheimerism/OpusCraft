# What LAN guests were missing: report

Branch `claude/vibrant-hypatia-2p2ou6`, from `main` at b935350. Part 1 of the brief: what two people playing survival
on two computers found a guest couldn't do. Each lettered milestone is committed and pushed on its own.
`PROTOCOL_VERSION` is 8 on this branch (main's 7), bumped once for all of part 1.

## 1. Milestones

| | Milestone | State | Commit |
|---|---|---|---|
| a | Advancements for guests | done | (this commit) |
| b | Boss bars for guests | not started | |
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

## 2. Shared files changed (for merging)

| File | What changed, and the hook |
|---|---|
| `src/net/config.ts` | `PROTOCOL_VERSION` 7 → 8. |
| `src/net/protocol.ts` | `CB.UpdateAdvancements` = 100 (numbered from 100, clear of other branches' packets) and its field check. |
| `src/net/server/session.ts` | `progress` (a `GuestProgress`): loaded with the guest's record, hooked to its player and its `Interaction`, ticked after its clicks, flushed at the end of the tick, saved with its record; dimension changes and beds tell it; a `MerchantMenu` shown to the guest gets its `onTraded`. |
| `src/net/server/hostServer.ts` | `hookGuestProgress(this)` in the constructor (undone on close); a guest's block menus get its `menuEvents`. |
| `src/net/client/clientSession.ts` | handles `CB.UpdateAdvancements` (checked by `readProgress`) → `ClientHooks.advancements`. |
| `src/game/game.ts` | the guest's `PlayerAdvancements` is `remote`; the `advancements` client hook (toasts); the host's announcement also to guests (`server?.hostChatted`); a guest's archaeology loot, decorated pot, dragon respawn and end gateway go to `level.onPlayerTrigger`; the piglin's thrown-item trigger is the thrower's; `interactedPayload` replaces the inline body-armour code. The line `tests/end/elytra.mjs` greps for is untouched. |
| `src/game/advancements.ts` | `PlayerAdvancements.remote` (two lines). |
| `src/game/level.ts`, `src/entity/mob.ts` | `onThrownItemPickedUp` gets the thrower as a third argument. |
| `tests/multiplayer/m4-playerdata.mjs` | one check expected a guest's record to have no advancements; it now expects the guest's own. |

New files: `src/net/advancementSync.ts`, `src/net/server/guestProgress.ts`, `src/game/progressTriggers.ts`,
`tests/multiplayer/m8-advancements.mjs`.

## 3. Open points

- Vanilla sends a player only the advancements visible to it; here the guest is sent its progress and works out what's
  visible itself (the advancements are the build's own). What it shows is the same.
- Advancement rewards (experience, loot) aren't implemented for anyone in this game; guests are no different.
- Statistics are still the host's alone.

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
7. The guest right-clicks a tame horse (`/summon horse ~ ~ ~2 {Tame:1b}`) and gets on; so does the host with another:
   the game keeps running smoothly in both windows.
