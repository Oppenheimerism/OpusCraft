# Multiplayer, stage 3: report

Branch `claude/confident-bell-kdzc4i`, from `main` at 932b1dc (stage 2, merged with campfire cooking, dried kelp, the
lodestone compass, the music discs and the credits music), with `main`'s 0467041 (Soul Speed, Frost Walker, magma)
merged in on the way. Stage 3 is done: R0.4 and M3, with PvP as in vanilla, as asked. Stage 1's report is
`REPORT.md` and stage 2's is `REPORT-stage2.md`, next to this one; what they say still holds unless this one says
otherwise.

## Progress

- Sep 27, 03:25 UTC: `origin/main` merged (a fast-forward to 932b1dc). Stage 3 started; the regression at 932b1dc:
  151 of 154 (§6).
- 03:47: **R0.4** committed (30f20da): menus, death and respawn out of the game shell. Nothing changes in play.
- 04:24: **M3, Survival for guests** committed (6454213), with its suite (6b20df1). The regression on 6b20df1: 154 of
  155 (§6).
- 05:30: **M3, menus** committed (f4e789a): inventories, containers, crafting, trading, books, using items; with two
  suites (096db73).
- 05:36: `origin/main` merged again (0915bf6: Soul Speed, Frost Walker, magma burning what stands on it), with a check
  of a guest on magma (92d82d6). 05:38: a check in stage 2's entity suite made steady (cff6794, §6).
- 05:47: full regression on cff6794: 157 of 159; both failures shown to be `main`'s too (§6).
- 06:06: checking this report's claims against the code found a guest's recipe book empty (unlocking ran only on the
  host's own game) and a recipe whose 75-character name was refused as bad data. Fixed, with "N/M players sleeping"
  as vanilla shows it on a LAN world (d193abe, its tests 49ad596). The full regression on 49ad596: 157 of 159 (§6).
- 06:17: a guest's ender pearl and chorus fruit didn't take it anywhere: the host moved its player, and the guest's
  next step put it back. Fixed (08ab030, its tests 1acb076).
- 06:27: full regression on 1acb076, the final head: 158 of 159; the one failure, a timing check, shown to be the
  machine's load (§6).
- 06:46: the browser check, 35 checks in two real windows, all passed (§6).
- 07:05: this report.
- Next: stage 4's first two parts (guests' data kept with the host's world; guests following the host to other
  dimensions), with a report of its own, `REPORT-stage4.md`. M5 (the network transport) waits for the user.

## 1. What a player can do now

The host picks what its guests play in, on the LAN screen, as vanilla's "Open to LAN" does: Survival (the default),
Spectator, Creative or Adventure (`?mp=host&guests=…` does the same). A guest in Survival:

- is hurt by what hurts the host's player: mobs, arrows and explosions, falls, fire and lava, magma unless it sneaks,
  drowning, suffocating, starving, cactus and berry bushes, freezing, a glide into a wall, the void, and other players
  (PvP is on, as on a vanilla LAN world). It flinches with its screen tilting, is knocked back where the host says, and
  sees its hearts, golden hearts, food, air, effects and cooldowns as the host has them. Jumping costs food, a full
  food bar heals, an empty one starves. Armour, enchantments, shields and potions count as they do for the host.
- dies: the death screen says how ("Alex was slain by Zombie"), everyone reads it in the chat, what it carried and
  some of its experience fall where it died (unless keepInventory), and Respawn brings it back at its bed or near the
  world spawn, whole and fed (at once with doImmediateRespawn).
- sleeps in a bed, which sets its respawn point; the night passes once every player is asleep (spectators don't
  count), and Leave Bed gets it up. Everyone reads "1/2 players sleeping" over the hotbar as players get into bed or
  out, and "Sleeping through this night" once they all have, as on a vanilla LAN world.
- opens its inventory and every menu the host's player can: the crafting table, furnaces, smokers and blast furnaces,
  chests, barrels, shulker boxes, chest minecarts and chest boats, the brewing stand,
  enchanting table, anvils, grindstone, stonecutter, smithing table, loom, cartography table, a lectern's book,
  dispensers, droppers, hoppers, crafters, a villager's or wandering trader's trades, and a horse's, donkey's, mule's or
  llama's inventory (with the inventory key while riding, as in vanilla). Every kind of click works: picking up,
  halves, shift-clicks, drags, double-clicks, number keys, F, Q and throwing out of the window. A click shows at once;
  the host makes it for real and puts right whatever came out otherwise (another player took those emeralds first).
- shares a chest with another player, each seeing the other's changes; the lid stays up until the last one leaves.
- uses the recipe book: what it has held unlocks recipes, each with its toast, as for the host's player (the host
  keeps each guest's); a recipe clicked fills the grid (or a furnace's input), or shows in outline without the
  ingredients.
- writes in a book and quill, signs it as itself, and reads written books; puts a book on a lectern and turns its
  pages.
- eats and drinks, draws a bow, loads and fires a crossbow, raises a shield, throws a trident: slowed while it uses
  one, as the host's player is, and seen doing it by everyone. An ender pearl it throws takes it where it lands, a
  chorus fruit somewhere nearby.
- swaps hands with F, and pick-block brings a stack from past the hotbar to hand.

Everyone near now hears a player hurt, land hard and die (the host's too), and sees other players flash red, burn,
fall over dead, lie asleep in a bed, glow, eat, draw a bow or raise a shield. Death messages reach everyone and name
the players in them, the host's own death too.

What they still can't do says so: a portal ("Portals don't take guests yet."), which stage 4 is for. Single-player
plays as before.

## 2. The architecture as built

New:

| Module | What it does |
|---|---|
| `game/openMenu.ts` (R0.4) | Every menu a block or an entity opens, made in one place for whoever used it (vanilla `MenuProvider.createMenu`): `blockMenu(level, player, kind, x, y, z)` and `entityContainerMenu(level, player, entity)`, with what opening one does to the world (a chest's lid and sound, a barrel's, the loot table filled, the game event, the advancements' triggers for the host's own player). The job-site blocks', dispensers', hoppers', crafters', shulker boxes' and horses' hooks all come here, and the menu goes to `ShowMenu`: the game's screen for its own player, the guest's session for a guest's. |
| `game/playerDeath.ts` (R0.4) | A player's death and coming back, the host's own and its guests' alike: the death message (vanilla `CombatTracker`'s wording), what's dropped (inventory and experience, keepInventory), the fresh start on respawning (`resetForRespawn`), and the hurt and fall sounds everyone hears (`playerHurtSound`, `playerFallSound`). |
| `net/playerStatus.ts` | A guest's own player as the host has it (vanilla `ClientboundSetHealthPacket`, the player's own synched data, `UpdateMobEffect`): health, max health, absorption, food, saturation, air, burning, frozen, the hurt flash and its direction, dying, invulnerable time; and its effects. Built on the host, checked and clamped into the guest's player. The guest counts down between packets what the host counts down too (air, a flash, an effect's time), so only what changed goes. |
| `net/menus.ts` | Menus on the wire, both ends: which kind a menu is (vanilla `MenuType`: 21 kinds), its title, what a guest needs to make its copy (a horse's id and chest columns, a crafter's slots), the numbers each kind shows besides its slots (vanilla `ContainerData`: a furnace's flame and arrow, a brewing stand's fuel and bubbles, an enchanting table's costs, hints and seed, an anvil's cost, a stonecutter's and loom's pick, a lectern's page, a crafter's switched-off slots), a trader's offers, and a stack's hash (32-bit FNV-1a of its item, count, damage and data; vanilla `HashedStack`). |
| `net/server/menuSync.ts` | A guest's menus on the host (vanilla `ServerPlayer`'s `inventoryMenu`, `containerMenu` and `ContainerSynchronizer`): its inventory's, always there as menu 0, and the one it has open, numbered 1 to 100 and round again. A click is checked (§5), made by the host, and whatever the guest said it made of it (a hash per slot it changed, and of its cursor) is taken as what the guest shows. At the end of the tick each slot, the cursor and each number that isn't what the guest shows is sent, with the menu's state number. A click made on an out-of-date view (another player moved something first) has the whole menu sent again (vanilla's `stateId` check). A menu closes when its block or entity goes, its owner is out of reach, or it dies; closing puts back the cursor and a crafting grid as vanilla does. The recipe book's clicks, buttons, the anvil's name, a trade picked, a crafter's switches. |
| `net/client/clientMenus.ts` | A guest's copies (vanilla's client-side menus and `MultiPlayerGameMode.handleInventoryMouseClick`): the game's own kind of menu over containers of its own, which the host fills. A click is made on the copy at once, with nothing it would do to the world done (no sound, nothing dropped, no experience, no block touched), and sent with the hashes of the slots it changed. A trader is a stand-in with the host's offers (vanilla `ClientSideMerchant`). |

Changed:

| Module | What changed |
|---|---|
| `net/protocol.ts` | `PROTOCOL_VERSION` is 3. From the guest: `ContainerClick`, `ContainerButtonClick`, `ContainerClose`, `RenameItem`, `SelectTrade`, `SlotStateChanged`, `PlaceRecipe`, `PickItem`, `ClientCommand` (respawn), `EditBook`; `PlayerAction` gains `SWAP_HANDS`, `STOP_SLEEPING` and `OPEN_INVENTORY`, and `MovePlayer`'s flags one for running into a wall. From the host: `PlayerStatus`, `SetEntityMotion` (knocked back), `PlayerCombatKill` (the death screen), `Respawn`, `GameMode`, `SetCarriedItem`, `SetCooldown`, `UpdateEffects`, `SetSleeping`, `SetUsingItem`, `OpenScreen`, `ContainerSetContent`, `MenuSetSlot`, `SetCarried`, `ContainerSetData`, `ContainerClose`, `MerchantOffers`, `OpenBook`, `PlaceGhostRecipe`, `RecipeBookAdd`. A recipe's name may be up to 128 characters (the longest is 75). A guest's message may be up to 320 KB (was 64 KB): a book of 100 pages of 1024 characters, which vanilla allows, is the biggest single packet. |
| `net/server/session.ts` | A guest's recipe book (vanilla `ServerRecipeBook`): unlocked from what it holds, as the host's own player's is, and sent to it (`RecipeBookAdd`). A guest's player is no longer invulnerable. Wherever the host puts its player other than by its own move (a pearl's landing, a chorus fruit), it's told as a teleport (vanilla `ServerPlayer.teleportTo`). Its moves count toward a fall and its damage, a jump costs food, a glide into a wall hurts, a turtle egg, sculk shrieker, magma block or pressure plate underfoot hears it (vanilla `doCheckFallDamage`, `checkInsideBlocks`). Its status, effects, cooldowns, experience and what it's using go to it when they change; a knockback or a blast as `SetEntityMotion`. Death (menus closed, sound, message, drops, the death screen) and respawn (bed or world spawn). Beds through the host's own `game/sleep.ts`. Swap hands, pick-block, menus, books, the inventory key while riding. |
| `net/server/hostServer.ts` | The guests' game mode (`guestGameMode`, from the LAN screen). A guest's `Interaction` opens menus and beds as the host's does (stage 2 refused them). `heardByAll`: sounds a guest's player makes that its own game doesn't make for itself (being hurt, dying, a plate clicking under it) go to it too. `announceSleepStatus`: "N/M players sleeping" over everyone's hotbar (vanilla `ServerLevel.announceSleepStatus`, for a published world). |
| `net/entityData.ts` | What a guest is told of another player (`PLAYER_FIELDS`): health, dying, the hurt flash, burning, frozen, asleep and where, what it's using and with which hand, and its effects' looks (glowing, invisible). A player's place, pose and hands still come from the players' own packets. |
| `net/client/clientSession.ts` | The guest's side of all of that: its player's status, knockback, death screen, respawn, game mode, cooldowns, effects, sleeping, the item it's using, its menus and books. |
| `game/game.ts` | The pieces R0.4 moved out went to `game/openMenu.ts` and `game/playerDeath.ts`. The guest's game asks the host to respawn, leave bed, swap hands, pick a slot and open what it rides; the host shows a guest's menu, trade or book on the guest's screen instead of refusing it. |
| `gui/screens/multiplayer.ts` | The LAN screen's Game Mode button works (it was greyed out at Creative). |

### Where it departs from the plan, and why

- **Clicks are predicted, as vanilla's are.** The plan said "no prediction at first". A menu that waits a round trip
  for every click feels broken even between two windows (the item jumps back to where it was, then moves), and
  vanilla's client predicts every click. So the guest clicks its own copy at once and says what it made of it; the
  host clicks for real and corrects only what differs. The guest's prediction has no say in the outcome: it's used
  only to decide what the host needn't send back (§5).
- **Slots are claimed by hash, not by stack.** The first cut sent each changed slot's whole stack back to the host,
  which was bigger and gave the host a stack it had to validate only to compare it. Vanilla 1.21.5 sends hashes
  (`HashedStack`), and so does this.
- **The guest never simulates a menu's machinery.** A furnace's progress, a brewing stand's, the enchanting table's
  offers, a villager's trades and the anvil's cost are the host's numbers, sent as vanilla's `ContainerData` and
  `MerchantOffers`. A guest's copy of a furnace or brewing stand doesn't tick.
- **A guest's player on the host isn't split into a `ServerPlayer`.** The plan worried about splitting `Player`. It
  wasn't needed: a guest's player is the game's own `Player` in the host's level with `remote = true`, and the few
  places that differ ask `level.isClientSide` (the guest's side) or `remote` (the host's copy of a guest).
- **Riding stays host-steered**, as the user agreed; vanilla's rider-driven model comes with the internet transport.

## 3. Single-player changes

Every change below leaves single-player as it was; the regression (§6) says it did.

**R0.4 (30f20da)**, behind the scenes:

- The menus of blocks and entities are made in `game/openMenu.ts` rather than in `Game.openContainer` and the screens
  (`gui/screens/container.ts`, `crafter.ts`, `dispenser.ts`, `horse.ts`, `jobSites.ts`, `index.ts`, `game/jobSites.ts`,
  `game/shulkerBox.ts`). The screen is still the game's; only who makes the menu moved.
- What closing a chest, barrel or shulker box does (the lid shutting, its sound, the game event) now belongs to its
  menu (`ChestMenu.onClosed`) rather than its screen, so it happens however the menu closes. A chest's lid sounds now
  go through `level.sound`, which in single-player is the same sink as before.
- A player's death message, drops and respawn reset moved from `game/game.ts` to `game/playerDeath.ts`, unchanged.
  `tests/end/elytra.mjs` read the "experienced kinetic energy" message out of `game.ts`'s source; it now reads it from
  `playerDeath.ts` (the pattern moved, the check is the same).

**M3 (6454213, f4e789a)**:

- `entity/entity.ts`: `hurtMarked` (vanilla's: knocked or blown this tick), set by knockback, explosions, wind charges
  and a riptide's throw; nothing in single-player reads it. `stepOnFloor()`: the block underfoot hearing a step, taken
  out of `move()` unchanged so a guest's moves can call it.
- `entity/living.ts`: `baseMaxHealth` is public (the host sends it); `markEffectsChanged()`; `heal()` does nothing on a
  guest's level (the host says how healthy it is).
- `entity/player.ts`: `doCheckFallDamage` (vanilla's name for the check the player's own move makes, for a move another
  game made); the death's last effects (`triggerOnDeathMobEffects`) not run on a guest's level; `disconnected`, false
  in single-player.
- `game/level.ts`, `game/sleep.ts`: `onWakeUpAll`, a hook called as a night slept through wakes everyone (vanilla
  `wakeUpAllPlayers`, whose waking isn't announced); null in single-player.
- `inventory/container.ts`, `merchantMenu.ts`: what a closing menu gives back goes through one `giveBack`, which for the
  game's own player puts it in the inventory as before (drops only a host's guest's that has left or died, vanilla
  `dropOrPlaceInInventory`).
- `inventory/enchantMenus.ts`: an anvil's chance of wearing and the grindstone's orbs are skipped on a guest's level.
  `game/itemBehavior.ts` `craftedBy`: likewise.
- `inventory/menus.ts`: `recipeTarget`, what the recipe book fills, moved out of `gui/recipeBookComponent.ts`
  unchanged; `game/books.ts` `writeBook`, what signing or editing a book does, moved out of `gui/screens/book.ts`
  unchanged. The screens call them as before.
- `game/interaction.ts`: `onPickSlot`, a hook for a guest's pick-block (null in single-player).
- `game/spawner.ts` `entityDisplayName`: a player with a `profileName` goes by it (null in single-player, where the
  death messages say the player's name as they always did).
- `game/game.ts`: the hurt, fall and death sounds go through `level.sound` (the same sink in single-player);
  `deathCause()` for the death screen (the same message in single-player); the guest-only paths (its recipe book
  filled by the host among them) are behind `this.client` or `this.server`.
- `gui/screens/multiplayer.ts`, `main.ts`: the LAN screen's game mode and `&guests=`.

Tests of earlier stages that changed, each for a reason that is now different, with nothing weakened:

- `m1-players.mjs`: stage 1 checked that a guest falling out of the world was put back at the spawn unhurt, because a
  guest couldn't die. Now the void kills it, as it does the host's player; the section checks that it dies of it, is
  told how, everyone reads it, and respawns at the spawn whole (5 checks where there were 3).
- `m1-security.mjs`, `m2-security.mjs`: "an action that doesn't exist" and "movement keys that don't exist" used the
  first unused value, which stage 3 now uses (the swap key, Leave Bed, the wall a glide runs into); they now use the
  first past the last. The oversized-message check's label says 320 KB.
- `m3-security.mjs` (this stage's own, 49ad596): "a recipe name of 65 characters" is now "of 129 characters", since
  the limit rose from 64 to 128 when a real recipe turned out to be named in 75; it still sits one past the limit.
  Its checks of a furnace's recipe or one too big for the 2x2 grid now give the guest what those recipes are made of
  first, so that the rule each checks, and not the recipe being locked, is what stops them.
- `m2-actions.mjs`: "a player under the crosshair isn't hurt (no fighting yet)" is now "a creative player … isn't hurt",
  and checks the player is in Creative; survival players fighting is in `m3-survival.mjs`.
- `m2-entities.mjs` (cff6794): its zombie is kept out of the sun (§6).

## 4. The last R0 commit

**30f20da** (R0.4: menus, player death and respawn out of `Game`). Nothing changes in play. All five R0 steps are now
done.

## 5. Security

Still nothing listens on a network interface: no `--host` in any npm script or in `vite.config.ts`, and
`BroadcastChannel` stays inside one browser. Stages 1 and 2's checks all stand; these are new.

### Checked on the host, for what a guest sends

Every new packet's fields are checked for their types and ranges before anything reads them; anything malformed
disconnects that guest with "Bad data: packet N: bad field F" while the host and the others play on. Then:

- **Clicks** (`ContainerClick`): a menu id of 0–255, a state number of 0–32767, a slot of −999 or 0–63, a button of
  0–40, a known click type, at most 64 changed slots each with a slot of 0–63 and a 32-bit hash. It counts only for the
  menu the guest has open now (another id is ignored), with a slot the menu has and a button that click type has
  (vanilla `isValidSlotIndex`), from a living player that isn't a spectator, and at most 80 in a tick (a drag across
  every slot is 66). A click that fails any of these, or is made on an out-of-date state number, has the whole menu
  sent again as it is. A lectern's slot can't be clicked (its book is taken with the button).
- **What the guest says it made of a click** is never believed: the host makes the click itself and keeps the guest's
  hashes only as "what the guest shows now". Any slot where the host's stack isn't what the guest claimed goes back to
  the guest at the end of the tick. A guest that claims diamonds gets none, and is shown what it really has.
- **Buttons**: 0–4095, only for the open menu, only a menu that has buttons, only from a living non-spectator in
  reach; the menu's own `clickMenuButton` decides the rest (an enchanting offer it can pay for, a stonecutter recipe
  that exists, a lectern page, a loom pattern).
- **The anvil's name**: at most 50 characters (vanilla), only with an anvil open. **A trade**: 0–255, only with a
  trader open; the trade must exist and be affordable, as for the host's player. **A crafter's switch**: slot 0–8, only
  with a crafter open, not a spectator's.
- **The recipe book**: a recipe name of 1–128 characters, which must be a recipe the book has, one this guest has
  unlocked (vanilla `ServerRecipeBook.contains`: a locked one isn't placed, nor shown in outline), of this menu's kind
  (crafting or this furnace's), and fit its grid. What unlocks a guest's recipes is what the host sees it hold.
- **Books** (`EditBook`): a hotbar slot or the offhand, at most 100 pages of 1024 characters, a title of 1–32. There
  must be a book and quill there. Every control character but new lines, and the `§` formatting sign, is taken out of
  the pages; a title left with nothing is refused. The author is the guest's name, whatever it says.
- **Respawn**: only when dead. **Pick-block**: a slot of 9–35, not in Creative or Spectator, only alive. **Swap
  hands**: alive and awake. **Leave Bed**: asleep. **The inventory key while riding**: only a chest boat or a horse it
  rides, and the horse decides (a wild one won't open).
- **Moves** in Survival: a fall is counted by the host from the heights the guest's moves go through, and the
  landing's damage is the host's. Whether the guest is on the ground is its own word, as in vanilla, so a changed game
  that always says it is takes no fall damage (vanilla's servers have the same weakness). The void, suffocation,
  drowning, fire, freezing and the rest are the host's own ticks for the guest's player.
- **PvP**: a guest can hit a player only under the same rules as a mob (in reach, seen, not a creative or spectating
  player); the damage is the host's.

### Checked on a guest, for what the host sends

- **Every new packet's fields**, for types and ranges (health 0–4096, food 0–20, a game mode that exists, cooldowns on
  items that exist, effects that exist with amplifiers of 0–255, a bed inside the world, a menu kind of the 21, slots
  and data indexes the menu has, offers of items that exist, at most 64 offers). Anything malformed: the guest leaves,
  saying why ("Bad data from the host: a menu of the wrong size").
- **Titles and death messages** are plain text: control characters and `§` are taken out; nothing from the host goes
  into HTML.
- **Recipes unlocked** (`RecipeBookAdd`): at most 4096 names of 1–128 characters, each a recipe the book has, else
  the guest leaves ("a recipe that does not exist").
- **A menu for something the guest hasn't got** (a horse it doesn't see): the guest closes it again, telling the host.
- Packets for a menu that isn't open, or of the wrong kind (offers for a chest), are let be. A lectern page out of
  range reads as the first. An item not held can't be "in use".

### Still unchecked, or known weak

- **Hashes can collide.** A guest's claim about a slot is a 32-bit hash. A guest whose copy got a different stack of
  the same hash wouldn't be corrected in that slot (one chance in four billion per slot), but the host's stack is still
  the real one: it's only what the guest's screen shows. Vanilla's hashes are 32-bit too.
- **Who a guest is**: still only its name (stage 1's list).
- **A hostile host** can still tell a guest anything about its own player (dead, starving, anywhere), as a vanilla
  server can. It can't make the guest's game run anything or write anywhere.
- Stage 1 and 2's lists still hold.

## 6. Tests

### The new suites (`tests/multiplayer/`, headless, host and guests in one process, as before)

| Suite | Checks | What it covers |
|---|---|---|
| `m3-survival.mjs` | 95 | Joining in the host's game mode, whole and fed. A zombie's hit on normal, the guest's hearts, flinch and camera tilt following, knocked back where the host says, heard by everyone. Guests hitting each other, the host's player hitting a guest and a guest the host's player, a spectator not there to be hit, game mode changes told. A ten-block fall hurting for seven, heard by the others, none with slow falling. A jump costing food; saturation, then the food bar; starving to half a heart. Effects given, counted down, drunk again, taken by milk; absorption's and health boost's hearts; another player glowing. Burning and put out; air. A death: the death screen saying how, everyone told, the drops and experience where it died, the other guest seeing it fall, the dead not walking or clicking, the respawn whole and fed, asked twice doing nothing; keepInventory and doImmediateRespawn. A bed: asleep, the respawn point set, the bed taken for everyone, seen asleep, the night waiting for the others, Leave Bed, the morning, respawning beside the bed and, once it's broken, at the spawn with vanilla's message; "1/3 players sleeping", "0/3" on getting up and "Sleeping through this night" over everyone's hotbar, spectators' too, and nothing on the morning's waking. Swapping hands, pick-block, the hotbar slot, cooldowns. An ender pearl thrown, landing the guest where it lands on both sides, hurt for five, its moves going on from there; a chorus fruit. A glide into a wall. Magma: not while sneaking, burnt standing, not in Frost Walker boots, and "discovered the floor was lava". |
| `m3-menus.mjs` | 232 | After every step what the guest shows is the host's, slot for slot, cursor and whole inventory too. The inventory's own menu with every kind of click. A chest shared by two guests and the host, both grabbing one stack in one tick, out of reach, broken, the lid. A barrel, a shulker box, a chest minecart, a chest boat and a donkey (the inventory key while riding). A crafting table; the recipe book, its recipes unlocked by what the guest holds, on the host and told to the guest with toasts, the other guest's not; a furnace (its experience given once); a brewing stand. The enchanting table, anvil and grindstone. A villager's trade. The stonecutter, loom, smithing and cartography tables; a lectern; a crafter; a dispenser, dropper and hopper. Books written, signed and read. Death with a chest open, keepInventory keeping the inventory but not the grid and cursor, a spectator's click, guests leaving with things on their cursor. Eating, a bow, a crossbow, a trident thrown, a shield. |
| `m3-security.mjs` | 112 | Every malformed menu packet from a guest disconnects it with a reason, the host's tick unharmed. Well-formed ones it couldn't have made do nothing or have the menu sent again: a closed or wrong menu, slots and keys that aren't there, a lie about what it holds, 81 clicks in a tick, buttons, names, trades, switches and recipes with nothing or the wrong thing open, a written book, a title of nothing, an old view, a recipe the guest hasn't unlocked; the book's longest recipe name taken. A host whose menus or recipes make no sense is left by its guest; a title's formatting shows as plain text; a horse it hasn't got closes its menu again. |

Stage 1's eight suites (405 checks: two more than before, §3) and stage 2's three (146) all still pass. In all: 14
suites, 990 checks.

### The full regression

`node scripts/regress.mjs` (every `tests/<dir>/*.mjs`, 3 or 4 at a time):

| Commit | Passed | Failed |
|---|---|---|
| 932b1dc (`main`: stage 2, the discs, campfire cooking, dried kelp, the lodestone compass) | 151 of 154 | drowned/drowned, illagers/illagers, trial-chambers/m4b-breeze |
| 6b20df1 (R0.4, Survival for guests and its suite) | 154 of 155 | illagers/illagers |
| cff6794 (menus and their suites, `main`'s magma merged) | 157 of 159 | illagers/raids, villager/gossip |
| 49ad596 (the recipe book, sleeping's count) | 157 of 159 | cat/ocelot, illagers/illagers |
| **1acb076 (final)** | **158 of 159** | temples/m1 (a timing check) |

None of these failures is this branch's. Stage 1 and 2 found the same suites flaky on `main` (their reports list
drowned, illagers, raids, gossip, wolf and the trader); here each was shown again:

- **temples/m1** (1acb076), "chunks with a pyramid in them take no more than 25% longer": 47.4 ms a chunk against
  34.1, measured while three other suites ran. It times chunk generation, which this branch doesn't touch (nothing
  under `src/world/gen/` or `tests/temples/` differs from `main`). Alone, 3 runs on the branch and 3 on `main`: all 6
  passed, at 33 to 38 ms a chunk either way.
- **illagers/raids** (cff6794), "a farmer throws the hero bread…; a child a poppy": alone, it failed 0 of 3 times on
  the branch and 2 of 3 on `main`. With `Math.random` seeded, 30 runs on each (seeds 1 to 30): 6 failures on the
  branch, 5 on `main`.
- **villager/gossip** (cff6794), "the golem turns on the player after 100 ticks": alone, 0 of 3 failures on either;
  seeded, 5 of 30 on the branch and 3 of 30 on `main`.
- **cat/ocelot** (49ad596), "one that trusts you doesn't run", and **illagers/illagers**, "evoker conjures fangs":
  alone, 3 runs each on the branch and on `main`. Ocelot passed all 6; the evoker's fangs failed once in 3 on the
  branch and once in 3 on `main`. Ocelot's check is the one stage 1 found failing 3 times in 18 on both (`REPORT.md`
  §6).

Both of the last two, and raids and gossip, passed in the final run.

Those seeded runs count how often a suite fails; they can't pair a branch run with a `main` run seed for seed. Vite's
module loader draws a random number for each module it loads, and the branch loads a few more, which shifts every
number the game draws after. Leaving Vite's own draws unseeded fixes that (a scratch loader, outside the repository):
seed 1 of raids then ran identically on both.

**m2-entities**, stage 2's entity suite, failed once while stage 3 was checked, on "a hurt zombie flashes red on the
guest". Rerun, it failed 1 time in 13. The zombie stood in daylight and burnt, hurt once a second, and a hit landing
in the half second after a burn doesn't flash a mob red again (vanilla's invulnerable ticks). The suite can't be run on
`main` (it's this branch's), so the cause was proven instead: kept in the shade (`isSunBurnTick` off for that zombie
only) it passed 16 runs of 16, then 4 more. The check itself is unchanged (cff6794).

### A real two-window check, in headless Chromium

`npx vite build`, `npx vite preview` (localhost only), and a scratch Playwright script (not in the repository)
driving two pages of one headless Chromium, as in stages 1 and 2: a host at
`?quick&mode=survival&mp=host&guests=survival` and a guest at `?mp=join`. 35 checks in four rounds, each on a fresh
world:

- **A**: the guest plays in Survival. E opens its inventory with the host's menu behind it; a log right-clicked into
  the 2x2 grid puts planks in the host's result slot and the rest on the cursor; shift-clicking the result crafts
  them, on both sides; the screen closes and the host is told. A chest the host filled opens on the guest and shows
  what's in it; diamonds shift-clicked out and bread picked up and put down leave the host's chest empty, the host's
  copy of the guest's inventory and the guest's own holding them; the chest is open on the host while the guest has
  it, and shut when Escape closes it.
- **B**: a crafting table opens. The guest's recipe book has what its planks, coal and raw iron make, and not a
  furnace or TNT; a recipe clicked has the host put the sticks' planks in the grid, and the guest shows it; the sticks
  are crafted. A furnace: lit and cooking, its flame and arrow the host's, the guest's a few ticks behind.
- **C**: a book and quill used opens its screen on the guest; signed, the host and the guest both have a written book
  by the guest, its `§` taken out. Bread: the host has the guest eating and the guest shows it; one gone and the food
  bar up, on both sides.
- **D**: with a chest open and emeralds on its cursor, the guest is killed: the chest closes, the death screen shows,
  the emeralds drop where it died; Respawn brings it back whole.
- After each round: the guest wrote nothing to the browser's storage, and every kind of entity it was shown could be
  drawn.

The script's first runs failed 5, then 1 or 2, of its own checks, none of them the game's: it read one window just
after acting in the other, before the host's window had ticked (two pages of software-rendered WebGL tick slowly and
unevenly), and it knew screens by their class names, which the production build shortens. Made to wait for what it
checks, it passed 35 of 35, twice. Stage 2's browser check, run again on this build (with `&guests=creative`, since guests
now play in Survival unless the host says otherwise): 48 of its 49 checks passed. The one that didn't, "a mob the
host moves moves on the guest too", and its neighbour "and where the host has it", read a mob's place in one window
and then the other, and take it that the mob stands still meanwhile; its round alone failed one or the other in each
of 3 runs on this build and in 2 of 3 on `main`'s. A trace of the pig's moves showed the guest's copy where the
host's was, a tick behind at most, as the pig strolled off from where the host had put it.

`npx tsc --noEmit`: clean. `npx vite build`: succeeds.

## 7. The two-window check for the lead

Setup as before (no `--host`: everything stays on this machine):

```sh
git fetch origin claude/confident-bell-kdzc4i && git checkout claude/confident-bell-kdzc4i
npm install
npm run build && npx vite preview      # http://localhost:4173/
```

Two browser **windows** side by side, not tabs.

- Window A, the host: `http://localhost:4173/?quick&mp=host&mode=creative&guests=survival` (a throwaway world, the host
  in Creative to set things up, its guests in Survival), or Singleplayer → a world → Esc → Open to LAN → Game Mode:
  Survival → Start LAN World.
- Window B, the guest: `http://localhost:4173/?mp=join`, or Multiplayer → the LAN world → Join Server.

The host's commands act on the host's own player only (guests can't be named in them yet), so the host hands the
guest things through a chest, or drops them with Q.

**Survival**

1. The guest has hearts and a food bar. The host `/summon zombie ~3 ~ ~` near the guest (`/time set night` first if the
   sun burns it): it goes for the guest, each hit takes hearts in the guest's window, the guest's screen tilts and it's
   knocked back, and the host hears it.
2. The guest jumps off something ten blocks high: it lands hurt, with the thud, in both windows.
3. The guest keeps jumping: the food bar goes down (after a while; saturation first).
4. The guest walks into lava, or lets the zombie win: the death screen says how, both chats say it, what it carried
   lies where it died. Respawn: it's back at the spawn, whole and fed.
5. The host gives itself a bed (creative inventory), places it, and `/time set night`. The guest right-clicks it:
   asleep, "Respawn point set", and both windows read "1/2 players sleeping" over the hotbar. The host sleeps in another
   bed: "Sleeping through this night", then morning. Break the guest's bed and kill the guest
   (lava): it respawns at the spawn with "You have no home bed or charged respawn anchor, or it was obstructed".
6. The guest hits the host's player (the host in Survival: `/gamemode survival`): it's hurt. The host hits back.

**Menus**

7. The host places a chest and fills it from the creative inventory (cobblestone, planks, iron ingots, coal, a stack
   of emeralds, a book and quill). The guest opens it (the lid opens, heard by both), takes things out with clicks,
   shift-clicks, drags and double-clicks, and puts some back. The host opens it too: both windows see every change.
8. With the guest's cursor holding something, the host breaks the chest: the guest's screen closes, what it held on
   the cursor goes back to its inventory, the chest's contents drop.
9. When the guest first takes planks from the chest, recipe toasts pop up in its window. E, then the 2x2 grid: four
   planks make a crafting table; shift-click the result. Place it, open it, open the recipe book (the green book): the
   planks' recipes are there; click one: its ingredients go in the grid. Make a furnace; smelt the iron with coal: the
   arrow and flame fill in, the ingots come out, and the experience comes once.
10. The host places an enchanting table, an anvil, a grindstone, a stonecutter, a loom, a smithing table, a cartography
    table, a brewing stand, a barrel, a hopper, a dispenser and a crafter: the guest opens each and uses it (the
    enchanting table needs levels; the host can't give them, so let the guest earn a few by smelting).
11. A villager (`/summon villager ~ ~ ~2 {VillagerData:{profession:"minecraft:farmer",level:2}}`): the guest opens its
    trades and buys something with the emeralds.
12. The guest writes in the book and quill (right-click with it), signs it: a written book by the guest's name. Put it
    on a lectern: both can read it; the guest turns pages and takes it.
13. The guest eats (the food bar goes up, the host sees it eat), draws a bow, raises a shield in the offhand (F).
    It throws an ender pearl (from the chest): it's where the pearl landed, in both windows, a little hurt.
14. `/summon donkey ~ ~ ~2 {Tame:1b,ChestedHorse:1b,SaddleItem:{id:"minecraft:saddle",Count:1b}}`. The guest rides it
    and presses E: the donkey's inventory with its chest. A chest boat likewise.

**Edge cases**

15. Guest leaves (closes its window) with a stack on its cursor in the crafting table: the stack falls where it stood
    in the host's window.
16. The guest walks into a nether portal: "Portals don't take guests yet." (Stage 4.)

## 8. Left for later, known issues, questions

**Stage 4 and later**

- M4: guests' data kept with the host's world (a guest who leaves and comes back finds its inventory, health and
  spawn as it left them; today it starts afresh); guests following the host to the Nether and the End.
- M5: the network transport.

**Known issues in stage 3**

- Guests earn no advancements, and have no statistics; as planned, they are the host's own player's for now.
- A guest's recipe book, like the rest of it, starts afresh each time it joins (stage 4 keeps it).
- A hardcore world's guests aren't handled: a guest who dies there respawns as in a normal world (vanilla makes it a
  spectator).
- Guests don't hear other players' footsteps, and a sculk sensor doesn't hear a guest's (a shrieker does); a parrot on
  a shoulder isn't shown.
- A riptide trident's spin and lift are the host's; the guest's own view of it is rough.
- A shulker box's lid, the enchanting table's book and a bell don't move on a guest's screen (guests don't tick block
  entities).
- A cartography table with a filled map: the guest has no map data, so its preview is empty until the host's result
  comes (a moment later).
- Spectators can't open containers to look in (vanilla lets them): this game's single-player doesn't either, and
  guests match it.
- On the host's own death, what was in its crafting grid or on its cursor goes back to its (emptied) inventory rather
  than dropping, as single-player always has; guests follow vanilla (dropped).
- A guest's clicks with a chest open that touch its armour or offhand go through stage 1's inventory channel, so those
  slots aren't numbered with the chest's; nothing visible comes of it.
- Riding is still host-steered (§2).
- Stage 1 and 2's lists still hold, less what stage 3 did (Survival, menus, beds, fighting, experience shown).

**Found in single-player, not changed here**

- The offhand isn't saved with the world: `Game.writeWorld` writes the main inventory and the armour, not the
  offhand, so a shield or a totem held there is gone when the world is opened again. It's `main`'s as much as this
  branch's, and fixing it changes single-player, so it's left for a change of its own (a two-line fix in
  `writeWorld` and `setUpWorld`, and a field in `WorldMeta.player`).

**Questions for the user**

None for stage 3. The two from stage 2 are answered: PvP follows vanilla, and riding stays host-steered until the
internet transport.

## 9. Times

- Started 03:25 UTC on Sep 27, finished 07:05: about three hours and forty minutes of wall clock.
- Roughly an hour and a quarter of it was debugging: the test suites' own setup (modules a menu needed, a villager that
  lost its job, slots that moved, the host's own player taking an item first), one real desync the menus suite found
  (a stack of nothing hashed as a stack, fixed in `stackKey`), the merge with `main`'s magma, the browser check's own
  timing, and proving the regression's failures weren't this branch's.
- Checking this report against the code, line by line, found three things the suites hadn't: the empty recipe book, the
  refused 75-character recipe name, and the ender pearl that didn't move its guest. Each was fixed and given checks.
