# Multiplayer, stage 2: report

Branch `claude/confident-bell-kdzc4i`, from `main` at 3a0c9e6 (stage 1, merged with the ancient city and bastion
work). Stage 2 is done: R0.5 and M2, with clicking entities, riding and picking up. Stage 3 wasn't started. Stage 1's
report is `REPORT.md`, next to this one; what it says still holds unless this one says otherwise.

## Progress

- Sep 26, 23:09 UTC: `origin/main` merged (a fast-forward to 3a0c9e6: all of stage 1 was in it). 23:12: stage 2
  started; the regression at 3a0c9e6: 146 of 147 (§6).
- 23:25: **R0.5**, the entity net registry, committed (d17844e). Nothing changes in play.
- Sep 27, 00:09: **M2** committed (a99537d), with its three suites (bce46eb).
- 00:21: full regression on bce46eb: 148 of 150. Both failures rerun alone on the branch and on `main`, and shown to be
  the suites' own randomness (§6).
- 00:32: a two-window check in headless Chromium: the four stage 2 phases pass, and stage 1's 57 checks pass on the
  same build (§6).
- 00:40: a fix found while checking what the host sends: an entity whose record held a number that isn't one (NaN)
  would have made the guest leave; now only that entity isn't shown (f3ef3b1, its tests a59badb).
- 00:51: full regression on a59badb, the final head: 146 of 150. The four failures are the suites' own randomness: with
  `Math.random` seeded, each of them does exactly the same on the branch as on `main`, seed for seed (§6).
- 01:10: the browser check passes on the final build.
- 01:15: this report.
- Next (stage 3, not started): Survival for guests (health, hunger, damage, death), inventories, containers and menus,
  crafting, combat, and R0.4.

## 1. What a player can do now

A guest now sees everything round it that the host sees, not only the host's player: mobs, animals and villagers;
dropped items and experience orbs; arrows, tridents, snowballs, potions, fireballs and whatever else is thrown or shot;
primed TNT and falling sand; boats, minecarts, item frames, leads, end crystals, lightning. They move smoothly, where
the host has them, and look as they do there: a red or sheared sheep, a calf, a name over a mob's head, a saddle,
armour and what a mob holds, a creeper swelling, a mob on fire, invisible, or flashing red when hurt, a dying one
falling over and puffing into smoke, a rocket bursting in its colours. They ride each other as on the host (a
chicken jockey), and each player sees the other in its boat.

The guest can now also:

- hit a mob: the host hurts it, as it would for its own player;
- use things on mobs and the world as the host's player would: shear a sheep, milk a cow, tie a lead, saddle a pig or
  a tame horse, put a boat on water or a minecart on a rail, bring a mob out of a spawn egg;
- get in a boat or a minecart, or on a saddled horse, pig or strider, and steer with W, A, S and D ("Press Left Shift
  to Dismount"); a pig goes where it looks with a carrot on a stick, and a horse leaps as far as Space was held; Shift
  gets off;
- pick up items and orbs by walking over them: they fly into it with the pop;
- drop what it holds with Q (Ctrl+Q the whole stack), or throw things out of the creative inventory.

The host decides all of it; the guest shows what the host says. Guests still play in Creative and can't be hurt.
What they can't do yet says so ("That can't be used by guests yet."): a horse's, donkey's or llama's inventory, chest
boats and chest minecarts, villagers' trades, chests and the other containers; beds and portals as before.
Single-player plays as before.

## 2. The architecture as built

New in `src/net/`:

| Module | What it does |
|---|---|
| `net/entityNet.ts` (R0.5) | The entity net registry (vanilla `EntityType` with `getAddEntityPacket` and `handleAddEntity`). `spawnPayload(e)`: what a guest is sent to make its copy. Mobs, dropped items, boats, minecarts, arrows, tridents, rockets, item frames, end crystals and leash knots go as their saved record without riders (`saveEntityRecord` in `game/spawner.ts`), minus what vanilla never shows another player: a chest minecart's or chest boat's contents, a donkey's packs, a piglin's pockets, loot tables, memories, trades and gossip. Orbs, primed TNT, falling blocks, thrown things, fireballs, lightning, area clouds, wind charges, evoker fangs and the rest are never saved, so they're made afresh by their kind. `createFromPayload(level, type, record)`: the guest's copy, through the same `loadEntity` as a chunk's entities. |
| `net/entityData.ts` | An entity's state on the wire (vanilla `SynchedEntityData`). This game's entities keep what they show in plain fields, and each renderer reads whichever it likes, so the host sends all of an entity's own fields except those in `NOT_SENT`: its wiring, its place and motion (`MoveEntity` carries those), what the guest works out itself (its clock and its walk), and the busiest host-only bookkeeping (AI timers, what its senses last found). Numbers, flags and text go as they are; an item as the wire's item; another entity as its id; short lists of those; a horse's or llama's first two container slots (saddle and armour, or carpet); a pig's or strider's `steering` part as its own fields; effects as `[id, amplifier]`. Countdowns that only matter as "running or not" (a baby's age, fire, anger, conversion) go as their sign. `DataWatcher` remembers what was sent of each entity, so each tick sends only what changed; the host works a tick's changes out once for all its guests. `applyData` is the guest's side (§5). |
| `net/server/entityTracker.ts` | One per guest (vanilla `ChunkMap.TrackedEntity` and `ServerEntity`). Each tick, what's in range comes into view (`AddEntity`: record, place, look and every field), moves (`MoveEntity`: each tick it moved; a living thing every third tick, vanilla's update interval, each mob on its own phase), changes (`SetEntityData`), takes riders on or lets them off (`SetPassengers`), and goes out of view (`RemoveEntities`). The range is vanilla's `clientTrackingRange` for the kind (items and orbs 6 chunks, arrows and thrown things 4, monsters 8, animals 10, the warden and end crystals 16, and so on), capped at the guest's view distance less one chunk, and only where the guest has the chunk. What the guest rides is always in view. |
| `net/client/entityMirror.ts` | One of the host's entities on a guest (vanilla's client-side entity, which only eases along as the server says). Placed at once when it comes, then eased into each move over 3 ticks for a living thing and 1 for the rest (vanilla `lerpTo`); a move of more than 8 blocks is taken at once. Its walk animation is worked out from how it moved, and an item's bob and spin and an orb's shimmer count on here. Its own tick (AI, physics) never runs on a guest. A rider is put in its seat by what it rides (vanilla `positionRider`). |

Changed:

| Module | What changed |
|---|---|
| `net/protocol.ts` | `PROTOCOL_VERSION` is 2: a window still on stage 1 is told "Outdated game!" or "Outdated host!". New host packets `AddEntity`, `SetEntityData`, `SetPassengers`, `TakeItemEntity` and `SetExperience`; `MoveEntity` and `RemoveEntities` now carry entities as well as players. `MovePlayer` now carries the entity under the guest's crosshair (its id, or −1) and the guest's movement keys (W, S, A, D and Space: vanilla `ServerboundPlayerInputPacket`). `PlayerAction` has an argument, and the actions DROP, DROP_ALL and RIDING_JUMP. `SetCreativeModeSlot` with slot −1 throws the item out (vanilla's creative drop). |
| `net/server/session.ts` | A guest's clicks go to the entity under its crosshair if the host agrees it could be clicked (§5), else to the block, as in stage 1. Its movement keys steer what it rides. While it rides, the host takes only its look from its moves; when it gets off, it's put where the host has it. The drop key, the riding jump, pickup (the guest's player now picks things up on the host as any player does), the experience bar, and the tracker's flush after the players'. |
| `net/server/hostServer.ts` | The per-entity `DataWatcher`s, shared by all guests and pruned each tick; the host level's `onTake` hook: `TakeItemEntity` to every guest that sees the item or orb, and the pickup pop now heard by the taker too. |
| `net/client/clientSession.ts` | The guest's copies: made from `AddEntity` (one that can't be made is left out, and told once in the console), moved, changed, given riders, removed. A field naming an entity that hasn't come yet is filled in when it comes. Its own player's riding: in or out as the host says, never getting off by itself; its keys and the riding jump go to the host. Pickup animations, the experience bar, the drop key. |
| `net/effects.ts` | Particles about an entity now go too: a death's smoke (`poof`), crits, hearts and the like round an entity (`emitAround`), and a rocket's burst with its stars. |
| `net/codec.ts` | It now refuses to encode a number that isn't finite, as it refused to decode one, and `encodeBundle` leaves out only the packet that can't go rather than the tick's whole message (f3ef3b1, §5). |

### Where it departs from the plan, and why

- **Ranges and update rates.** The plan said "~80 blocks; items/xp every 20 ticks, living every tick". Ranges are
  vanilla's per kind instead, which are shorter for items and arrows, the many small things. The rates are the other
  way round: a living thing's move goes every third tick (vanilla's `updateInterval` of 3, eased in over three), and
  everything else goes each tick it moves. A vanilla client runs an item's or an arrow's physics itself between the
  server's updates; here a guest's copies never tick themselves, so an item sent every 20 ticks would jump. Nothing
  is sent for what doesn't move or change, so items lying still and parked boats cost nothing.
- **No `EntityEvent`, no `Animate` or `SetEquipment` for mobs, no `SetEntityMotion`.** What vanilla sends as events
  (the hurt flash, a death, a wolf shaking, an arm swinging) and a mob's equipment are fields here (`hurtTime`,
  `deathTime`, `shaking`, `swingTime`, `armorItems`, `mainHand`), so the field sync carries them. Motion isn't needed,
  since copies don't simulate.
- **`SetEntityData` sends every field but a denylist, not per-kind declarations.** Renderers read arbitrary fields, so
  sending everything but a list keeps each renderer's oddity right (a creeper's swell, a sheep's wool, a wolf's
  shake, a shulker's peek, a goat's horns) without touching each entity. m2-entities makes all 97 kinds on a guest
  and checks their fields against the host's.
- **Riding is here, and host-steered.** The plan put riding in M3, steered by the rider's game (vanilla's
  client-authoritative `MoveVehicle`). The user asked for it in stage 2. The guest sends its keys (as vanilla's
  `PlayerInput` does) and the host moves the vehicle with the game's own boat, horse, pig, strider and minecart code;
  the guest's copy follows like any entity. So nothing a guest says about a vehicle has to be believed, and no vehicle
  code changed. The cost is a round trip between pressing a key and the boat moving on the guest's screen: a tick or
  two between two windows, more over the internet (question 2).
- **Dragon parts** can't be clicked by a guest yet (§8). A dragon lives in the End, where guests can't follow the host.

## 3. Single-player changes

Every change below leaves single-player as it was; the regression (§6) says it did. Each new branch is on
`level.isClientSide` (always false in single-player) or on a guest's hooks.

- `entity/entity.ts` `startRiding`: returns before the riding advancement's trigger on a client-side level (the host
  triggers it).
- `entity/living.ts`: new `animateMirror()`, which runs the existing `updateWalkAnimation`; only a guest's copies call
  it.
- `entity/player.ts`:
  - `rideTick`: the sneak key gets you off only when not client-side (a guest gets off when the host says so);
  - `aiStep`'s touch of orbs and arrows: only when not client-side;
  - `rideJump`: on a client-side level the leap goes to the new `onRidingJump` hook (null in single-player) instead
    of to the mount;
  - stage 1's `canRide` override (no riding for remote players) is gone; in single-player it always gave the base
    answer;
  - `noPickup`'s comment: stage 1's guest players no longer set it (a guest's copies of other players still do).
- `game/spawner.ts`: new `saveEntityRecord(e)`, the existing record without riders; single-player doesn't call it.
- `game/game.ts`: the drop key, the creative inventory's throw-away, the crosshair's entity and two client hooks
  (`took`, `mounted`) all go through `client` (a guest); single-player makes the same calls as before.
- `gui/screens/horse.ts`: a horse's inventory opened by a player other than the game's own (a guest's, on the host) is
  refused politely; the game's own player opens it as before.
- `render/entityRenderers.ts`: on a client-side level each entity is drawn inside a `try` (one a host sent that won't
  draw is left out and told once); single-player draws exactly as before, without the `try`.

No test pinned anything that moved. `tests/multiplayer/m1-security.mjs` changed only in its raw guest packets, which
now have the new shapes (`MovePlayer`'s eighth field, `PlayerAction`'s argument); every check is as it was.

## 4. The last R0 commit

**d17844e** (R0.5, the entity net registry). Nothing changes in play. R0.4 (menus, player data, respawn and death out
of `Game`) is still left for stage 3, which needs it.

## 5. Security

Still nothing listens on a network interface: no `--host` in any npm script or in `vite.config.ts`, and
`BroadcastChannel` stays inside one browser. Stage 1's checks all stand; these are new.

### Checked on the host, for what a guest sends

- **The entity under the crosshair** (`MovePlayer`): −1 or a whole number from 0 to 2³¹−1, else "Bad data". It counts
  only if it's an entity this guest was shown and still sees, isn't removed, can be clicked (vanilla `isPickable`),
  isn't something the guest rides, and has its box within the guest's entity reach plus 3 blocks of its eyes (vanilla
  `canInteractWithEntity(box, 3.0)`; the 3 allows for a moving mob, which a guest sees a tick or three late).
  Otherwise the click goes to the block, as in stage 1. Players can't be hit (no fighting yet). A made-up id, or one
  the guest wasn't shown, does nothing.
- **Movement keys**: only known flag bits.
- **PlayerAction**: action 0–4 and argument 0–100, else "Bad data". At most 4 drops a tick (more are ignored), none in
  spectator mode. A riding jump counts only on a mount the guest steers that can jump now (its cooldown).
- **Throwing out of the creative inventory** (slot −1): only in Creative, the item rebuilt by the host with stage 1's
  checks ("Invalid creative inventory action" otherwise), and vanilla's `dropSpamThrottler`: +20 an item, −1 a tick,
  refused from 1480, so 74 at once.
- **Riding**: the host ignores the guest's position while it rides and moves the vehicle itself. Getting off, the
  guest is put where the host has it (a `PlayerPosition`, whose confirmation later moves wait for, as in stage 1).
- **Everything else a guest does to an entity** (hitting, shears, leads, saddles, buckets, eggs) runs the host's own
  code for the guest's player, with the host's reach, cooldowns and rules.

### Checked on a guest, for what the host sends

- **AddEntity**: an id; a kind of 1–32 lowercase letters and `_`; a position inside the world; finite angles; known
  flags; a record (an object) or null; fields (an object). The kind must be one the registry knows. A record must
  name that kind, have finite numbers where `loadEntity` expects them, and hold no `__proto__`, `constructor` or
  `prototype` key in any JSON text inside it. It's loaded inside a `try`; an entity that can't be made is left out
  (told once).
- **SetEntityData**: field names must be identifiers of at most 64 characters, else the guest leaves. A value is taken
  only into a field its copy already has, and only of the kind it holds there (a number for a number, an item for an
  item); anything else is let be. Items must pass the item check; entities go as ids (one not seen yet is filled in
  when it comes, and at most 4096 such wait); lists are at most 256 long; containers go only into containers; effects
  must exist, with an amplifier of 0–255. What the guest works out itself (`NOT_SENT`) is never taken. Anything
  malformed: "Bad data from the host: bad entity data" (or "… field", "… list", "bad effects").
- **MoveEntity** for entities: inside the world, finite angles. **SetPassengers**: at most 64 riders, known ones only;
  an entity riding itself, twice, or in a loop is refused by the game's own riding rules. **TakeItemEntity**: an
  amount of 0–127. **SetExperience**: progress 0–1, and a level and total that are whole numbers ≥ 0.
- **Particles about an entity**: only known kinds, a whole-number id (an unknown one is ignored), and a rocket's stars
  of known shapes, each with at most 64 colours of 24 bits.
- Each copy's tick and drawing is inside a `try`: a copy that throws is dropped (told once), not the game.
- Ids the guest doesn't know are ignored in every packet.

### The host's own slips (f3ef3b1)

The codec refused a number that isn't finite when decoding, but not when encoding. So an entity whose saved record
held a NaN (a bug somewhere in the game) would have made every guest that saw it refuse the host's whole message and
leave, with "Bad data from the host: not a finite number". Now the host checks each `AddEntity` before sending it: an
entity that can't be sent isn't shown (told once in the console) until it can be, and the tick's other packets still
go. An entity more than 20 million blocks up, past what the wire takes, isn't shown either. On both sides, a packet
that can't be encoded is now left out on its own, instead of the whole tick's message with it.

### Still unchecked, or known weak

- **A hostile host** can still:
  - set any plain value into a field that is null on the guest's fresh copy, since the guest can't tell that field's
    kind. A renderer that then throws leaves that entity undrawn, not the frame.
  - send as many entities as fit in its messages (16 MB each); there's no count limit beyond the message caps.
- **No line of sight** for a guest's click on an entity (vanilla's server doesn't check it either): within reach and
  its 3 blocks of slack, a guest could hit a mob through a thin wall.
- **Pose flags and movement keys** are believed, as in stage 1. The keys only steer what the host's own physics moves.
- **No authentication**, the shared channel, and the rest of stage 1's list still hold.

## 6. Tests

### The new suites (`tests/multiplayer/`, headless, host and guests in one process, as in stage 1)

| Suite | Checks | What it covers |
|---|---|---|
| `m2-entities.mjs` | 49 | Every kind the registry knows (97) made on a guest, of its kind, with every field the host sends as the host has it; chests' contents, villagers' trades, gossip and memories not sent; records that aren't right refused. Shown within its range and the view, not past them; coming into and going out of view as the guest walks. A mob's move on the guest within six ticks, eased, not jumped; a jump of more than 8 blocks taken at once; an item falling tick by tick and lying where it landed. Fields: sheared and dyed, a baby, a name, a creeper's swell, on fire, invisible, a horse's and a pig's saddle, an item's stack, hurt, an effect or a fire gone. A chicken jockey; the host's player in a boat. A death: falling over, the smoke, gone. A rocket's burst with its stars. A hundred mobs round a guest for 10 seconds: all those in view shown, for under 16 KB a tick. |
| `m2-actions.mjs` | 51 | Hitting a mob in reach (the guest sees it flinch), not one past reach + 3, not one it wasn't shown or a made-up id, not a player. Shears (the wool drops, seen), a blank name tag (nothing, as vanilla), a lead tied and seen by both guests, let go. A boat: in, rowed by the keys, the guest's player where the seat is (not where the guest said), out where the host puts it. A horse steered the way the guest looks, the jump bar and the leap; a pig with a carrot on a stick; a minecart. Items and orbs picked up, into the inventory on both sides, flying to the taker as both guests see it, the pops, the experience. Q, Ctrl+Q, throwing out of the creative inventory, a hundred throws at once (74 go), a bad item (disconnected), sixty drop presses in a tick (four go). |
| `m2-security.mjs` | 46 | A guest's new fields: bad crosshair ids, a riding jump past 100, missing arguments, unknown keys, bad slots, two swords thrown at once, each disconnecting it with its reason while the host plays on; harmless ones doing nothing. A host's entity packets: bad kinds, off the world, bad items in fields and lists, unknown effects and amplifiers, bad field names, an entity where a list goes, lists past 256, objects that are neither items nor entities, `__proto__` (the guest leaves saying why, `Object.prototype` untouched); a record of another kind, fields of the wrong kind or the guest's own, its own player as an entity, unknown ids, impossible riders, particles that make no sense, its vehicle gone under it, a target that comes later, 6000 that never come (the guest stays, and all is as it should be). The host's own slips: a NaN can't be encoded, only its packet is left out, an entity whose record holds one isn't shown while a pig added in the same tick is. |

Stage 1's eight suites (403 checks) all still pass. In all: 11 suites, 549 checks.

### The full regression

`node scripts/regress.mjs` (every `tests/<dir>/*.mjs`, 3 at a time):

| Commit | Passed | Failed |
|---|---|---|
| 3a0c9e6 (`main`: stage 1, ancient cities, bastions) | 146 of 147 | illagers/illagers |
| bce46eb (M2 and its suites) | 148 of 150 | illagers/raids, villager/gossip |
| **a59badb (final)** | **146 of 150** | illagers/illagers, trader/trader, villager/gossip, wolf/wolf |

Each failure rerun alone, the same number of times on the branch and on `main` (a worktree at 3a0c9e6 with
`node_modules` linked):

| Suite: the check that failed | Branch, alone: failed | `main`, alone: failed |
|---|---|---|
| illagers/illagers: "evoker conjures fangs" (on the known-flaky list) | 2 of 3 | 1 of 3 |
| illagers/raids: "a farmer throws the hero bread, pie or cookies; a child a poppy" | 0 of 3 | 1 of 3 |
| trader/trader: "he runs" (and, in the reruns, "a zombie goes for him", "and a drowned", and one on his offers) | 2 of 23 | 3 of 23 |
| villager/gossip: "the golem turns on the player" | 3 of 33 | 1 of 33 |
| wolf/wolf (on the known-flaky list): "within ten blocks it stays put", "it comes after its owner" | 9 of 23 | 4 of 23 |

The counts differ a little both ways, all within chance (Fisher's exact test: wolf p ≈ 0.19, gossip p ≈ 0.6, the others
p = 1). To settle it, each of the five suites was then run whole with `Math.random` seeded (a `--import` that replaces
it with a seeded generator), seeds 1 to 30, on the branch and on `main`:

| Suite | Seeds failing, branch | Seeds failing, `main` | Output, branch against `main` |
|---|---|---|---|
| illagers/illagers | 15 of 30 | 15 of 30 | identical, byte for byte, for all 30 seeds |
| illagers/raids | 11 of 30 | 11 of 30 | identical for all 30 |
| trader/trader | 1 of 30 | 1 of 30 | identical for all 30 |
| villager/gossip | 3 of 30 | 3 of 30 | identical for all 30 |
| wolf/wolf | 6 of 30 | 6 of 30 | identical for all 30 |

With the same random numbers, every one of these suites does exactly the same thing on the branch as on `main`, check
for check and number for number: stage 2 changes nothing in them. They fail now and then because every mob's
randomness is seeded from `Math.random()`, which is different each run: a frightened villager running out of the
golem's sight, a tame wolf strolling towards its owner before it's told to follow, an evoker's fangs, a trader's
flight, his random offers. The golem's and the wolf's scenarios alone, seeds 1 to 300, fail on the same seeds on both
too (40 of 300 and 49 of 300).

### A real two-window check, in headless Chromium

Not in the repo: a Playwright script in my scratch space (one browser, two pages on `vite preview`, driven through
`window.__game`), with four new phases and 49 checks:

- **E** (13): ten mobs summoned in a glass yard round the guest (a red sheep, a pig, a calf, a chicken, a brown horse
  with white markings, a wolf, a villager, a creeper named Bob, a skeleton with a bow, a zombie in an iron helmet).
  The guest has each, of its kind, where the host has it, looking as it should. A pig the host moves moves; a wolf
  killed on the host falls over and goes; a cow taken 200 blocks off goes. Every kind could be drawn.
- **F** (6): the guest hits a pig: it's hurt and knocked back on the host, and flashes red on the guest.
- **G** (15): a pool and a boat. The guest boards (and is told how to get out), rows with W on both sides, and gets
  out with Shift where the host put it.
- **H** (15): Q throws one stone on the host, both sides show 4 left, and the guest sees it; walking onto it 2 seconds
  later picks it up on both sides, flying to the guest. An orb gives the guest experience. A summoned arrow falls and
  sticks in the floor, seen by the guest.

Every phase also checks that the guest's page wrote nothing to IndexedDB. The screenshots show what's expected: the
guest's view of the mobs, the pig flashing red, the guest in its boat, the host watching it row, the thrown stone, the
arrow in the floor.

The first run failed 5 checks in phase E, all in the script itself: its count took in animals born with chunks loading
farther off, and its "zombie" was one from a cave nearby. It now looks only at the mobs it summoned. After that all 49
passed on bce46eb's build, and stage 1's script (57 checks) passed on the same build. On the final build (a59badb) all
49 pass again.

`npx tsc --noEmit`: clean. `npx vite build`: succeeds.

**Traffic.** m2-entities' hundred mobs on a flat world, 10 seconds: in one run 86 in view cost 2.3 KB a tick (45 KB/s,
27 bytes a mob a tick); in another, 91 cost 4.7 KB a tick (52 bytes a mob a tick). Wandering, panicking or burning
mobs change more fields. Joining is still mostly chunks (4.5 MB in the first 30 ticks at view distance 4).

## 7. The two-window check for the lead

Setup as for stage 1 (no `--host`: everything stays on this machine):

```sh
git fetch origin claude/confident-bell-kdzc4i && git checkout claude/confident-bell-kdzc4i
npm install
npm run build && npx vite preview      # http://localhost:4173/
```

Two browser **windows** side by side, not tabs.

- Window A, the host: `http://localhost:4173/?quick&mp=host&mode=creative` (a throwaway Creative world, open to LAN
  at once), or Singleplayer → a world → Esc → Open to LAN → Start LAN World.
- Window B, the guest: `http://localhost:4173/?mp=join`, or Multiplayer → the LAN world → Join Server.

Stage 1's steps all still apply, except its step 10: the guest now does get in a boat, and on a saddled pig. The
host's commands below use the host's position (`~`), so stand the host next to the guest first.

**Seeing**

1. Walk the guest round: the same animals stand and graze in the same places in both windows, and walk smoothly, not
   from block to block. The host's `/time set night` brings monsters; they ignore the guest (Creative).
2. Host: `/summon sheep ~2 ~ ~ {Color:14b}`, `/summon creeper ~ ~ ~2 {CustomName:'"Bob"'}`,
   `/summon cow ~ ~ ~-2 {Age:-24000}`, `/summon zombie ~-2 ~ ~ {ArmorItems:[{},{},{},{id:"minecraft:iron_helmet",Count:1b}]}`.
   The guest sees a red sheep, "Bob" over the creeper, a calf, and the zombie's helmet.
3. The host hits the cow until it dies (a sword is quicker): the guest sees it flash red at each hit, run, fall over
   and puff into smoke, and its drops land.
4. The host fires a firework rocket (creative inventory, right-click the ground) and shoots an arrow: the guest sees
   the rocket rise and burst in its colours, and the arrow fly and stick.
5. The host gets in a boat on water: the guest sees it sitting in the boat, and the boat moving.

**Doing**

6. The guest left-clicks a pig: the pig flashes red in both windows and runs off, and the host sees the guest's arm
   swing.
7. The guest takes shears (creative inventory, Tools & Utilities) and right-clicks a sheep: sheared in both windows,
   and its wool drops. The guest walks over the wool: it flies into its inventory with a pop.
8. A bucket on a cow: a milk bucket appears in the guest's inventory. A lead on a cow: the lead runs from the cow to
   the guest in both windows, and the cow follows the guest; right-click it again to let go.
9. An oak boat right-clicked on water: the boat appears in both windows. Right-click the boat: the guest is in it, with
   "Press Left Shift to Dismount". W, A, S, D row it (the host sees the guest row); Shift gets out, next to the boat
   in both windows.
10. Host: `/summon horse ~ ~ ~3 {Tame:1b}`. The guest right-clicks it with a saddle (saddled in both windows), then
    with an empty hand: on it. W goes where the guest looks; holding Space fills the jump bar, and letting go leaps.
    Shift gets off. Shift + right-click (its inventory) says "That can't be used by guests yet."
11. A pig, saddled the same way: with a carrot on a stick in hand it goes where the guest looks.
12. Rails, then a minecart on them: right-click to get in, Shift to get out.
13. Q drops one of what the guest holds, Ctrl+Q the stack: thrown in both windows. After 2 seconds, walking over it
    picks it back up. Dragging an item out of the creative inventory's window throws it, too.
14. Host: `/summon experience_orb ~ ~ ~` next to the guest: it flies to the guest and pops. (Its experience bar isn't
    shown in Creative, as in vanilla; the experience is kept for when guests can play Survival.)

**Edge cases**

15. The guest right-clicks a chest minecart, or Shift + right-clicks a chest boat (a plain right-click gets in):
    "That can't be used by guests yet." A horse's inventory likewise (step 10).
16. The host `/kill`s the horse the guest is riding: the guest is off, standing where the horse was, in both windows.
17. The guest rows a boat a long way off: the boat stays under it, and the world keeps coming in round it.

## 8. Left for later, known issues, questions

**Stage 3 and later**

- M3: Survival for guests (health, hunger, damage, death), inventories and containers (chests, horse and llama
  inventories, chest boats and minecarts), crafting, villagers' trades, combat between players, and R0.4.
- M4: guests' data kept with the host's world; guests following the host to other dimensions.
- M5: the network transport (WebRTC codes, then the relay).

**Known issues in stage 2**

- A guest can't click the ender dragon's parts, and the dragon's trail (its `positions`) isn't sent, so a dragon a
  guest saw would be drawn with a still neck and tail. Guests can't reach the End yet.
- A mob's list of other entities (a few AI lists, not drawn) drops ids the guest hasn't seen yet, and doesn't fill them
  in later as single fields do.
- A vibration's particles (the sculk sensor's line to what it heard) and dust that changes colour stay on the host.
- A parrot on the host's shoulder isn't shown to guests.
- Guests don't earn advancements; as planned, they are the host's own player's for now.
- A guest's experience bar is kept but not shown, since guests play in Creative.
- A copy's AI objects (its goals) are empty on a guest; nothing draws from them.
- Riding responds a round trip late (a tick or two between two windows).
- Stage 1's list still holds, less "guests see no mobs, items or other entities" and "the guest's Q loses the item".

**Questions for the user**

1. Once guests can be hurt (stage 3), should players be able to hurt each other? Vanilla's LAN worlds allow it, and
   there's no switch on the LAN screen. I'd follow vanilla.
2. Riding is steered by the host from the guest's keys. Between two windows it responds in a tick or two. Over the
   internet (the WebRTC stage) every press would wait for the connection's round trip. Vanilla lets the rider's own
   game move the vehicle, with the host checking it. I'd keep the host steering until the internet transport comes,
   then switch to vanilla's way. Is that the order you want?

## 9. Times

- Started 23:12 UTC on Sep 26, finished 01:15 UTC on Sep 27: about 2 hours of wall clock.
- Roughly 45 minutes of it was debugging: the copies that some mobs couldn't take (a bat's, a piglin's target position
  as a list), the pig's saddle living in its steering part, the suites' own positions and timing (walking too fast,
  the host's player taking the item first, mobs burning or running off), and at the end the host's NaN slip and
  proving the two regression failures were `main`'s too.
