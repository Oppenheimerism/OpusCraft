# Multiplayer, stage 4 (M4): report

Branch `claude/confident-bell-kdzc4i`, from stage 3's head c827580, with `main`'s 769cdd9 (stage 3, merged as it was)
merged in on the way. M4 is done: stage 4's first two parts, a guest's player kept with the host's world, and guests
following the host to the Nether and the End, with the fix the user asked for on the way (the offhand saved with the
world). M5, the network transport, waits for the user, as asked. Earlier reports: `REPORT.md` (stage 1),
`REPORT-stage2.md`, `REPORT-stage3.md`; what they say still holds unless this one says otherwise.

## Progress

- Sep 27, 14:08 UTC: the go-ahead for M4. `origin/main` hadn't moved since stage 3 began (0467041).
- 14:19: behind the scenes (0d031bb): how a player is saved with the world and read back moved into one place,
  `game/playerData.ts`, for the host's guests to use too. Nothing changes in play.
- 14:21: **the offhand kept with the world** (e90183a), with a suite of its own (33854f2, 15 checks; 8 of them fail
  without the fix).
- 14:34: **part 1, a guest's player kept with the host's world** (a4f0b85), with its suite (aec9c32, 68 checks).
- 14:45: `origin/main` merged (e727fac): `main` had merged stage 3 as it was (769cdd9), so no file changed.
- 15:17: **part 2, guests go where the host goes** (d3f7694), with two suites (245f20c: 58 and 38 checks).
- 15:29: the full regression on 245f20c: 157 of 163, the six failures all on the earlier stages' flaky lists (§6).
- 15:38: **a guest held to its name's uuid** (acf3b82), with 7 more checks in `m4-security.mjs` (94d544d, 45 in all);
  two earlier tests changed for it (§3).
- 16:16: the two-window check in Chromium found that **a guest standing still in a nether portal was never told** it
  isn't its to take: fixed (ceef396), with 2 more checks in `m4-dimensions.mjs` (5a1bc78, 60 in all).
- 16:30: the browser check passing at 5a1bc78, 23 of 23, twice in a row (§6).
- 16:41: the full regression on 5a1bc78: 161 of 163, the two failures flaky on `main` too; every failure of both runs
  run again alone on the branch and on `main` (§6).
- 16:58: this report.

## 1. What a player can do now

### Coming back as you left

A guest that leaves (or is sent home when the host saves and quits) and joins the same world again by the same name
finds its player as it left it: where it stood and where it looked, its inventory, offhand and armour, its health,
food, experience and effects, its spawn point (its bed), its hotbar slot, its recipe book, and flying if it was. As on
a vanilla LAN world, a guest is its name: the same name is the same player in any window (its uuid is vanilla's
offline one, made from the name), and it plays in whatever game mode the world is open in (the LAN screen's, as vanilla
forces it). Someone new starts by the world spawn with nothing, as before.

- Asleep when it left: it was woken as it went, so its bed is free again, and it's back beside the bed.
- Dead when it left: it's back on its death screen, and respawns as ever.
- Riding something alone (a boat, a horse, a minecart): what it rode went with it and comes back with it (vanilla's
  `RootVehicle`). Something another player rides too stays in the world.
- Kept in another dimension than the one the host is in now: it comes in beside the host, with everything; what it
  rode waits where it left it.

The host keeps its guests' players with the world: read from the save when a guest joins, kept when it leaves and
whenever the world is saved (the autosave, Save and Quit), and written with the world under
`<world>/data/playerdata/<uuid>` (vanilla's `playerdata/<uuid>.dat`), so a world's backup takes them along and deleting
the world deletes them. A quick-start world (`?quick`), never saved, keeps them for as long as it's open.

### Following the host

The host runs one dimension, its own. So when the host goes through a nether portal or an end portal (to the End or
home from it), respawns in another dimension, or is sent to one by a command (`/execute in … run tp`), everyone comes
along instead of being sent home (stage 3 sent them home: "The host went to another dimension, where guests can't
follow yet."):

- each guest is taken out of what it was doing there: its menu closed, what it held put back in its inventory; woken;
  off what it rode, which stays behind;
- its game shows the loading screen with the host's, with the nether portal's swirl or the End's stars;
- once the host is there, it comes in beside the host, with the portal's whoosh; arriving in the portal the host came
  out of, it isn't taken back through it.

On the way the guests can still chat (and are answered if they try a command) and change hotbar slot, and nobody is
timed out, however long the host takes (the End Poem's minutes included). A guest that leaves on the way is kept where
it was, in the dimension it left; one that joins on the way comes in beside the host once it's there.

A guest's own nether portal or end portal isn't its to take: once it has stood in one as long as that takes a player (a
nether portal's four seconds in Survival), it's told "Only the host can take everyone to another dimension.", once
while it stands there. An end gateway, which stays within the End, takes a guest to its exit as it would anything.

A guest respawning at a bed whose chunks aren't loaded (the bed far from everyone) now waits for them, a few seconds at
most, and comes back beside its bed; stage 3 respawned it at once by the world spawn and forgot its bed ("You have no
home bed…"). If they don't come in five seconds it respawns by the world spawn with its bed kept. While the host is in
the Nether or the End, a guest respawns beside the host there, its bed kept for when they're home.

### Single-player

What's in your offhand is now kept when the world is saved: a shield, a torch or a map in the offhand used to vanish
on Save and Quit. Worlds saved before load with an empty offhand, as they did. Nothing else changes.

## 2. The architecture as built

New:

| Module | What it does |
|---|---|
| `game/playerData.ts` | A player as it's kept with the world (vanilla `Player.addAdditionalSaveData` / `readAdditionalSaveData`, with `ServerPlayer`'s): `savePlayer(player, dimension, books)` and `loadPlayer(player, record)`, used for the game's own player (the world's meta, as before) and for the host's guests alike; the record's fields are what they were, with the offhand beside the armour. `PlayerDataStore` (vanilla `PlayerDataStorage`): a world's guests' players, each read when its guest comes (from memory, else the save), kept as it leaves and at every save, and written with the world, those changed since the last save. |
| `net/offlineUuid.ts` | Vanilla `UUIDUtil.createOfflinePlayerUUID`: "OfflinePlayer:" and the name through MD5, as a version 3 uuid (`UUID.nameUUIDFromBytes`). MD5 is written out (RFC 1321, some 50 lines): the browser's `crypto.subtle` has none, and no new npm dependencies. |

Changed:

| Module | What changed |
|---|---|
| `net/protocol.ts`, `net/config.ts` | `PROTOCOL_VERSION` (in `config.ts`) is 5 (4 in part 1, 5 in part 2), and `RESPAWN_BED_WAIT_TICKS` is new there. The login says whether the guest's player is flying. From the host, `ChangeDimension [dimension, reason]` (vanilla `ClientboundRespawnPacket`, with `ReceivingLevelScreen`'s reason: `nether_portal`, `end_portal` or `other`). A dimension, in `ChangeDimension` and in the login, must be one of vanilla's three (§5). |
| `net/server/session.ts` | Logging in (vanilla `PlayerList.load` and `placeNewPlayer`): the guest's uuid must be its name's (§5); its player is read from the save before it's let in, its seat and name held meanwhile; its player comes from what was kept, in the world's game mode; a read that fails turns it away with a reason. Leaving (vanilla `ServerPlayer.disconnect`, `PlayerList.remove`): woken, its menus closed, kept, and what it rode alone taken away with it. Another dimension: `leaveDimension` (out of what it was doing, everything it was shown let go, `ChangeDimension` sent), `arrive` (beside the host, not to go straight back through a portal, its inventory sent again), and, on the way, `idleTick` (below). Respawning: at a bed whose chunks aren't in, it asks for them (a ticket, as its own chunks have) and waits, `RESPAWN_BED_WAIT_TICKS` (100) at most; in another dimension, beside the host, the bed kept. A move that reaches the host after the host moved its player the same tick (an end gateway, a pearl) is dropped: the guest is told where it is instead. What a guest's player stands in (a pressure plate, a tripwire, a portal: `checkInsideBlocks`) is checked every tick, moved or not, as a player's own travel does it in vanilla; it used to be checked only on the ticks a move came in, and a guest's moves don't come one a tick. |
| `net/server/hostServer.ts` | Hooks for the world's keeping (`loadGuest`, `saveGuest`, and `leaveInDimension` for what a guest rode, put back in the dimension it left). `saveAll()` (vanilla `PlayerList.saveAll`). `hostLeavingDimension`, `hostArrived` and `idleTick`, called by the game as the host goes, arrives and waits. |
| `net/server/menuSync.ts`, `entityTracker.ts` | `resync()` (everything the guest has open sent again) and `clear()` (nothing it was shown is there any more), for the way to another dimension. |
| `net/client/clientSession.ts` | `ChangeDimension`: every player and entity shown dropped, the cracks and the chunks being lit let go, the guest's player woken and off what it rode, then the game's hook. |
| `game/game.ts` | A `PlayerDataStore` for each world the game opens (none for a guest's copy); `writeWorld` keeps the guests' players (`server.saveAll()`) and writes them before the meta. `openToLan` gives the host its hooks for them. `changeDimension` tells the server its guests are going (it used to close the world to them); `tick` keeps the server's `idleTick` going while the host waits on a loading screen, and `hostArrived` once it's in. The guest's side, `guestChangedDimension`: the world let go as `changeDimension` lets go of the host's, the loading screen up, the whoosh on arrival. A portal an entity entered is `portalEntered` (it was a closure inside `setUpWorld`), with the guests' rule. |
| `game/spawner.ts` | `carriesOnePlayer` (vanilla `hasExactlyOnePlayerPassenger`): what carries one player is saved with that player, not with its chunk (§3). |
| `storage/worldStore.ts` | `WorldMeta.player.offhand`. |
| `gui/screens/multiplayer.ts` | A window's uuid is its name's (it was a random one, kept per tab). |

### While the host waits

Whenever the host is on a loading screen (a new dimension's chunks, the End Poem, a far bed's), its level stands still.
Guests on their way to the next dimension are kept alive by `ServerPlayerSession.idleTick`: what needs no world is
heard (chat, commands, keep-alives, the hotbar, leaving), everything else is let go (a move, a click, a menu click: all
of it for the world left behind), every packet still checked; keep-alives go out, and the timeout counts. A menu click
let go this way would leave the guest showing a click the host never made, so on arrival its inventory is sent again.
Waiting for the host to respawn in its own dimension, guests are left as stage 3 left them: what they say waits for the
level to tick again, then is taken in order (a few seconds at most, well inside the limits on what may wait).

### Where it departs from the plan or from vanilla, and why

- **One dimension at a time.** Vanilla runs every dimension at once, and each player goes its own way. Here the host's
  game runs one dimension, its own, so the guests go where the host goes, and a guest's own nether or end portal is
  refused with a reason. Running several dimensions at once would mean several levels ticking in the host's window;
  that is a much bigger change, and not needed for playing together.
- **Everyone arrives beside the host.** Vanilla puts each player at the exit of the portal it went through; here they
  all went through the host's.
- **A far bed's chunks are waited for.** Vanilla reads the bed where it is, loading its chunk there and then; chunks
  load in the background here, so the respawn waits for them, up to five seconds.
- **The host holds a guest to its name's uuid**, rather than working the uuid out and ignoring the guest's, as vanilla
  does in offline mode; the result is the same, and a guest that gives another uuid is told so (§5).
- **The guests' players are kept in the save's `chunks` store**, keyed `<world>/data/playerdata/<uuid>`, where the
  other data of a world already goes (the portals' and the rest), rather than as files.

## 3. Single-player changes

- **The offhand** (e90183a), as the user asked: `savePlayer` writes it beside the armour and `loadPlayer` reads it
  back; a record without it (saved before) reads as an empty offhand, as it always did. `tests/saves/player.mjs` checks
  a shield worn, enchanted and named, a stack of 16 pearls, an empty offhand, a save from before, and that the record
  keeps every field it had, in order; without the fix 8 of its 15 checks fail.
- **Behind the scenes** (0d031bb): `Game.writeWorld` and `setUpWorld` save and read the player through
  `game/playerData.ts`, the same fields in the same order as before (the new suite checks the record's keys).
- `game/spawner.ts` `isChunkSaved`: a vehicle is left out of its chunk's save when exactly one player rides it (it was:
  any player). With one player in the world, that's the same thing; with two in one boat, the boat now stays with its
  chunk, as in vanilla.
- `game/game.ts`: `portalEntered` is the closure it was, as a method, with the guests' rule changed (its line for Remote
  Getaway is as it was: `tests/end/elytra.mjs` finds it in the source). `changeDimension` calls
  `server?.hostLeavingDimension` where it called `stopHosting`; `tick` calls `server?.idleTick()` and
  `server?.hostArrived()`: all of it nothing without a server. `writeWorld` calls `server?.saveAll()` and
  `playerData.save()`, which has nothing to write in single-player.
- `net/protocol.ts`: a login's dimension is checked; guests only.

Tests of earlier stages that changed, each for a reason, with nothing weakened:

- `tests/multiplayer/lib.mjs`, the harness: guests' uuids are their names' (vanilla's offline ones) unless a test gives
  another, as the host now holds them to; a host may be given more hooks; a guest is flying at login if the host says
  so; a host world's chunks are lit as their dimension is (the Nether's and the End's without sky light: the same
  as before for the Overworld); `stepIdle` and `hostChangeDimension`, the host waiting on a loading screen and going to
  another dimension as the game does it.
- `tests/multiplayer/m1-login.mjs`, "a uuid already in the world": a guest saying hello as "Other" with a guest's uuid
  already in was turned away with "You are already in this world (in another window?)"; it's now turned away before
  that, because the uuid isn't its name's, and the check now expects that reason, the whole of it. The check it made
  (the second window turned away, saying why) is the same. The host's "already in this world" check stays, behind the
  new one.
- `tests/multiplayer/m2-actions.mjs`: the hello it writes out by hand (a guest clicking on a pig in the message it says
  hello in) gave a random uuid, and would now be turned away before its click; it gives its name's, as the game does.
  What's checked is the same.

## 4. R0

Nothing this stage: all five R0 steps were done in stages 1 to 3.

## 5. Security

Still nothing listens on a network interface: no `--host` in any npm script or in `vite.config.ts`, and
`BroadcastChannel` stays inside one browser. The earlier stages' checks all stand; these are new.

### Checked on the host, for what a guest sends

- **Who a guest is.** Its uuid must be vanilla's offline uuid of its name, dashes and all (its letters in either case:
  the host has read uuids in small letters since stage 1); anything else is "Bad data: that uuid isn't the name's",
  another's included, and the uuid of its name written with other capitals (bob's, for Bob: "bob" is another player, as
  in vanilla). Before, the host took any 1 to 36 hex digits and dashes: a guest could have come in as "Bob" with the
  uuid of a player not in the world, Alex's say, and been given Alex's player as the world kept it, inventory and all.
  The uuid names the record (`playerdata/<uuid>`), so nothing but hex digits and dashes can reach the save's key (a uuid
  like `../../worlds/x` is bad data).
- **A record that can't be read** (the save failing) turns the guest away with a reason ("Couldn't read your player
  from this world's save.") rather than letting it start afresh, which would overwrite what was kept at the next save.
  Its seat and name are held while it's read, so two windows can't both come in as one name meanwhile.
- **What a guest gets from its record** is what the host saved: it can't send its own. The game mode is the world's,
  whatever the record says.
- **On the way to another dimension**, every packet is checked as ever, and anything malformed lets the guest go with
  its reason; so do too much too fast (the limits on what may wait), chat spam (counted as ever) and illegal chat.
  The timeout counts too: a guest that goes quiet while the host waits is let go after 30 seconds. What's let go
  unread on the way is only what the checks passed.
- **A guest's portals** are the host's to take: its own nether and end portals do nothing but tell it so (once while it
  stands in one: the portal's cooldown, kept up while it stays), and a guest's game never takes a portal itself. The
  host counts a guest's time in a portal every tick, whenever its moves come.

### Checked on a guest, for what the host sends

- **`ChangeDimension`**: a dimension that is one of vanilla's three, and a reason of the three, exactly two fields;
  anything else and the guest leaves, saying why. "constructor", "__proto__", "toString" and the like are refused:
  looked up as they were, they would have given Object's own members for a dimension.
- **The login's dimension**, likewise (before, any text of up to 32 characters: a host naming the dimension
  "constructor" made a guest's world of Object's constructor, and broke its game). Found while writing stage 4.
- **Coming before the login**, a `ChangeDimension` has the guest leave ("expected to be let in first").

### Still unchecked, or known weak

- **Who a guest is** is its name alone, as on a vanilla LAN world (offline mode): whoever joins as "Alex" is Alex, with
  everything Alex's player had kept with the world. Between windows of one browser it can't be otherwise; the internet
  transport (M5) will need something better, which is the user's to decide.
- A guest's record is as safe as the world's save: whoever can change the save can change it.
- Stage 1 to 3's lists still hold.

## 6. Tests

### The new suites

| Suite | Checks | What it covers |
|---|---|---|
| `tests/saves/player.mjs` | 15 | A player saved with the world and read back: the offhand (a shield worn, enchanted and named; a stack of 16 pearls; empty), a save from before the offhand was kept, and the record's fields, in order. |
| `tests/multiplayer/m4-playerdata.mjs` | 68 | Uuids (Notch's is vanilla's; every name's is what MD5 makes of it). A guest joins, plays, leaves and the world is opened again: back where it was, looking where it looked, with its inventory, offhand, armour, health, food, levels, effects, spawn, hotbar slot and recipe book, on the host and in its own game; someone new starts by the spawn with nothing; the world's game mode wins; flying stays flying. Asleep: woken as it leaves, the bed free. Dead: its death screen, then its bed. Alone in a boat: the boat leaves and comes back with it; a boat two share stays. Kept in the Nether with the host in the Overworld: in beside the host, its boat put back in the Nether. While its player is read, its name and seat are held; leaving meanwhile leaves no trace; a failed read turns it away and overwrites nothing; a quick-test world writes nothing; a host that keeps nobody lets guests in at once; a uuid that's a path never reaches the save. |
| `tests/multiplayer/m4-dimensions.mjs` | 60 | The host to the Nether: both guests told with the swirl, their worlds let go, a crafting table closed with its logs put back, a boat left behind. On the way: chat, a command answered, the hotbar; a move and a use of the old world's let go; nobody timed out in 35 s; a guest joining waits. There: beside the host, in its portal without being taken back, the Nether as the host has it, each other seen, no rain; the use pressed on the way placed nothing (pressed there, it places). Home: a guest leaving on the way kept where it was in the Nether, a save meanwhile keeping the rest there too, a click on the way shown undone. The End: a sleeper woken with its bed free, an end gateway taking a guest to its exit and its next move not undoing it, its own end portal refused once, dead there respawned by the host with its bed kept. Home from the End: dead on the way, respawning there; a far bed waited for, then respawned at; its chunks not coming, the world spawn after five seconds with the bed kept. A guest standing still in a nether portal, its moves reaching the host every other tick only: told after its 80 ticks there that the portal isn't its to take, not taken, and not told again while it stays. The portals themselves: a guest's refused, the host's taken, a guest's own game taking none. |
| `tests/multiplayer/m4-security.mjs` | 45 | At a guest's hello: another's uuid (a guest's in the world, or a name's that isn't), its name's uuid in other capitals, a made-up one, one without its dashes: each turned away, saying why; its own let in, and its own in capital letters let in as itself. On the host, on the way to another dimension, each let go with its reason while the other guest goes on with the host, whose waiting doesn't throw: bytes that aren't data, a move whose coordinate is text, a packet only a host sends, a second hello, more messages than may wait, a menu click that's text, chat spam, a chat line with a control character, and nothing at all for 30 seconds; and only the good guest comes in with the host. On a guest: a `ChangeDimension` to "constructor", "__proto__", "toString", "hasOwnProperty", "the_moon", "Overworld", "", a number, null, true or a list, for a reason that isn't one, without its reason or with a field too many, and a login in "constructor", "__proto__" or "the_moon": each has it leave, saying why; one before the login too. Two good ones take it along, and it's put where the host says there. |

Stage 1 to 3's fourteen suites (990 checks) all still pass. In all: 17 multiplayer suites, 1163 checks.

Each fix was shown to be needed by running its checks without it: without the offhand in the record, 8 of
`tests/saves/player.mjs`'s checks fail; without the dropped stale move, the two end gateway checks (the guest stays in
the gateway on both sides); without the inventory sent again on arrival, the click on the way shows done on the guest
and not on the host; with stage 3's respawn, the seven far-bed and in-the-End checks (the bed forgotten, the guest by
the world spawn at once); with stage 3's login check, the three logins in a dimension that isn't one are taken;
without the host's uuid check, the five refusals at hello fail (Carol comes in with Dave's uuid, Bob with bob's; the
rest are turned away, but for something else) and so does `m1-login`'s changed check; with the move's
`checkInsideBlocks` as it was, the guest standing in a nether portal is never told (both its checks fail).

### The full regression

`node scripts/regress.mjs -j 4` (every `tests/<dir>/*.mjs`, 4 at a time), 163 suites now (stage 3's 159 and this
stage's four):

| Commit | Passed | Failed |
|---|---|---|
| 245f20c (part 2 and its suites) | 157 of 163 | cat/ocelot, drowned/drowned, illagers/illagers, illagers/raids, temples/m1 (a timing check), wolf/wolf |
| **5a1bc78 (final)** | **161 of 163** | cat/ocelot, illagers/illagers |

None of these is this branch's: all six are on the earlier stages' lists of suites that fail now and then on `main`
too, and nothing they load changed between the two runs (only `net/server/session.ts`, which no single-player suite
loads). Each was run again alone, 3 times on the branch (5a1bc78) and 3 times on `main` (769cdd9):

- **cat/ocelot** (both runs), "one that trusts you doesn't run": alone, all 6 passed. It's the check stage 1 found
  failing 3 times in 18 on the branch and on `main` alike (`REPORT.md` §6).
- **illagers/illagers** (both runs), "evoker conjures fangs": alone, it failed 2 times in 3 on the branch and 2 in 3 on
  `main`: the evoker casts whatever its dice say in the 30 seconds the check gives it.
- **drowned/drowned** (245f20c), "at night it rises from the sea bed": alone, it failed once in 3 on the branch; on
  `main` twice in 3 (that check once, "19% with looting III" once).
- **temples/m1** (245f20c), "chunks with a pyramid in them take no more than 25% longer": 57.9 ms a chunk against 43.9,
  timed while three other suites ran. It times chunk generation, which this branch doesn't touch (nothing under
  `src/world/gen/` or `tests/temples/` differs from `main`). Alone, all 6 passed.
- **illagers/raids** (245f20c), "a farmer throws the hero bread…; a child a poppy": alone, once in 3 on the branch and
  never in 3 on `main`, which isn't enough to tell. So with `Math.random` seeded, seeds 1 to 30 on each: the same six
  seeds fail on both (7, 14, 15, 25, 26 and 30), each with the same villager's wrong gift on both.
- **wolf/wolf** (245f20c), "within ten blocks it stays put": alone, once in 3 on the branch (with "it comes after its
  owner"), never in 3 on `main`; seeded likewise, the same three seeds fail on both (4, 20 and 21), each on the same
  check on both.

The multiplayer suites and `tests/saves/player.mjs` passed in both runs.

### A real two-window check, in headless Chromium

The game built (`vite build`) and served (`vite preview`, no `--host`) at 5a1bc78, and two pages of one headless
Chromium (SwiftShader), each with the guest's name kept for its window as the Multiplayer screen keeps it; 23 checks in
two rounds (a scratch script, not in the repository, as in the earlier stages):

- **Kept with the world.** A saved Survival world opened to LAN; Alex joins. The host gives Alex 5 logs, a shield worn
  to 17 in its offhand and an iron helmet, and puts it at 13 health (hungry enough not to heal back); Alex walks to a
  spot the host cleared for it and picks hotbar slot 3. The host saves and quits: Alex is sent home, and the save has
  Alex's record under `<world>/data/playerdata/<uuid>`, in the Overworld, with the logs, the shield and 13 health. The
  host opens the world again (its own shield still in its offhand: the single-player fix, in the real game) and opens
  it to LAN; Alex's window reloads and joins by the same name: where it was, with the logs, the worn shield, the
  helmet, 13 health and slot 3, and the host has it so too.
- **Following the host.** A quick creative world, Steve joining in Survival. The host builds an obsidian frame and lights
  it with flint and steel, as a player does; Steve is shown the portal. The host walks in: Steve's game shows the swirl,
  then Steve is in the Nether beside the host, the blocks round them the host's block for block, the host in sight.
  Steve walks out of the portal and back in: told "Only the host can take everyone to another dimension.", still in the
  Nether. Steve killed there: it respawns beside the host, in the Nether. The host out of its portal and back in: Steve
  home with it, beside it. The host into an end portal (`/setblock ~ ~ ~ end_portal`): the End's stars on Steve's
  loading screen, then both on the obsidian platform. The host home by `/execute in minecraft:overworld run tp @s …`:
  Steve home with it, beside it.
- Neither guest window wrote anything to the browser's saves (IndexedDB's writes counted in each page), and every kind
  of entity a guest was shown could be drawn. No page error in either window.

At 5a1bc78 the full check passed twice in a row, 23 of 23 each time (after round B passed on its own in the run before,
and round A in the one before that). On the way there it found one bug of the stage's own, and the script some of its
own:

- **The bug**: Steve standing in the Nether portal was never told anything (the refusal's check failed in every run
  before the fix): the host counted Steve's time in the portal only on the ticks one of its moves came in, and with two
  windows' ticks out of step that never added up to four seconds. Fixed (ceef396, §2), with a test that reproduces it
  in node by letting the guest's moves reach the host every other tick (5a1bc78).
- The script's: a portal made with `/fill … nether_portal` doesn't stand (a single-player difference from vanilla, §8),
  so the frame is lit with flint and steel; Alex healed back from 13 health while it waited (now it's hungry enough not
  to); and the spot Alex first walked to, a few blocks from where it joined, hurt it as it waited (now the host clears
  a spot for it first).
- Once, and not since: going home from the End by the command, Steve's game was told to come along and never put
  anywhere (§8). That was at 94d544d; the same trip has passed seven times since, three of them at 5a1bc78 with both
  windows' state recorded should it happen again.

## 7. The two-window check for the lead

Setup as before (no `--host`: everything stays on this machine):

```sh
git fetch origin claude/confident-bell-kdzc4i && git checkout claude/confident-bell-kdzc4i
npm install
npm run build && npx vite preview      # http://localhost:4173/
```

Two browser **windows** side by side, not tabs. The guest's name is asked on the Multiplayer screen and kept for the
window; `?mp=join` uses it.

**Kept with the world**

1. Window A: Singleplayer → Create New World (Survival) → in → Esc → Open to LAN → Start LAN World.
2. Window B: Multiplayer → the world → name "Alex" → Join Server. Put a shield in Alex's offhand (the host throws one
   over, or drops it with Q), fill a few hotbar slots, walk somewhere and look at something; jump down a few blocks to
   lose a heart.
3. The host saves and quits (Esc → Save and Quit): Alex is sent home. The host opens the world again and opens it to
   LAN again; in window A the host's own offhand still holds what it held (single-player's fix).
4. Window B joins again as "Alex": where it was, looking where it looked, with its things, its offhand, its hearts.
   Join as "Steve" instead: someone new, by the spawn, with nothing. Back as "Alex": Alex again.
5. Alex sleeps in a bed at night and the window is closed while it sleeps: rejoining, it's beside the bed, and the bed
   is free. Alex dies and the window is closed on its death screen: rejoining, it's on its death screen.

**Following the host**

6. The host builds a nether portal (obsidian, 4 by 5, lit with flint and steel) and walks in: in window B the swirl
   shows, then Alex is in the Nether beside the host. They see each other; Alex's chat reaches the host on the way.
7. Alex walks out of the portal, and back in, and stands there four seconds: "Only the host can take everyone to another
   dimension.", once. Alex dies there (lava): it respawns beside the host, in the Nether.
8. The host goes back through the portal: Alex comes home with it. Alex's bed still works (it respawns there once, the
   bed's chunks loaded: stand far from it, die, and it comes back beside it).
9. In a creative world opened to LAN with guests in Creative too, the host does `/setblock ~ ~ ~ end_portal`: the
   End's stars, then both on the obsidian platform. `/execute in minecraft:overworld run tp @s 0 100 0`: both home,
   beside each other (in the air: Creative spares the fall).
10. While the host is on its loading screen, Alex closes its window: rejoining after, it's where it was when the host
    left, or beside the host if the host's in another dimension by then.

## 8. Left for later, known issues, questions

**Known issues in stage 4**

- While the host watches the End Poem, its guests wait on the loading screen, the End's stars behind it; they don't
  see the poem (vanilla shows it to each player that leaves the End the first time).
- The host dying in the Nether or the End takes everyone home with it when it respawns in the Overworld.
- A guest can't go to another dimension on its own: one dimension at a time (§2).
- The dragon's health bar isn't shown to guests, nor a raid's: there's no boss bar packet yet.
- A guest's advancements and statistics still aren't kept (a guest earns none yet: stage 3's list).
- A guest's player kept in the Nether or the End, coming back while the host is in another dimension, comes in beside
  the host; vanilla would put it back where it was, in the dimension it left.
- **Seen once, not understood: a guest left on the loading screen.** In one run of the browser check (§6), the host went
  home from the End by `/execute in minecraft:overworld run tp`, and the guest's game, told to come along (its world was
  the Overworld's), was never put anywhere: it waited on the loading screen at its place in the End for the three
  minutes the script gave it, with no sign of being disconnected and nothing in either window's console, while the host
  played on at home. The same trip has passed seven times since (in the browser check, and in two scripts that record
  the host's copy of the guest, its session and the guest's game at every step), and the test harness's version of it
  passes in node. Reading the code along the way found no path that fits what was seen. If the lead sees it (§7, step
  9), closing the guest's window and joining again gets the guest out, beside the host; what the host and the guest each
  have at that moment (the browser check's script now records it on a failure) would say where it stuck.
- Stage 1 to 3's lists still hold, less what stage 4 did (a guest's data kept, other dimensions).

**Found in single-player, not changed here**

- `/execute in minecraft:constructor run …` (or `__proto__`, `toString`…) is taken as a dimension: `commands.ts` looks
  the name up in the list of dimensions without checking it's one of its own entries, so it gets Object's constructor,
  and the game breaks as it tries to go there. A guest can't cause it (only the host types commands in its world), and
  fixing it changes single-player, so it's left for a change of its own (a one-line `hasOwnProperty` check).
- `/fill … nether_portal` inside an obsidian frame leaves no portal (found writing the browser check): each portal
  block placed has its neighbours check their frame, and a portal block whose portal isn't whole yet goes out, so
  they put each other out as they're placed. Vanilla's `NetherPortalBlock.updateShape` leaves a portal block be when
  the neighbour that changed is a portal block too, or across the portal's plane; here `updateShape` isn't told which
  neighbour changed. A frame lit with flint and steel, or by fire, is unaffected (it's lit whole at once).

**Questions for the user**

- M5 (the network transport) waits for the user's go-ahead. With it comes the question of who a guest is: its name alone
  is enough between windows of one browser, not across the internet.

## 9. Times

- Started 14:08 UTC on Sep 27, finished 16:58: about two hours and fifty minutes of wall clock.
- Part 1 (with the offhand and the player's record moved into one place) took until 14:34, part 2 until 15:17; the
  uuid held to the name until 15:38.
- About an hour went on the browser check: the script's own mistakes (the portal it made with `/fill`, a guest that
  healed, a spot that hurt), the real bug it found (the guest's portal time), and chasing the loading screen the guest
  was once left on (§8), which the scripts recording both windows' state never saw again. The rest was the regressions
  and proving their failures aren't this branch's.
