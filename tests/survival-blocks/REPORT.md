# Survival blocks: report

Branch `claude/beautiful-goldberg-xx0i72`, from `origin/main` at `93288e7`. One commit per milestone, pushed before the
next was started. No history rewritten, nothing pushed to `main`.

| # | Milestone | Commit | State |
|---|-----------|--------|-------|
| 1 | Signs and hanging signs (11 woods) | `89f4d4a` | done |
| 2 | Ender chest | `4cba979` | done |
| 3 | Cake and candle cakes | `76401ce` | done |
| 4 | Spyglass | `c606cc6` | done |
| 5 | Armour stand | `1e4f0c9` | done |
| 6 | Minecarts and rails | `baebec4` | done |

Where nobody could be asked, the choice closest to vanilla 1.21 was made; each such choice is listed under the
milestone's "Deviations and open points".

---

## Self-review (after M6)

After the last milestone, the spare time went on checking the milestones again: edge cases, saving and
multiplayer. Each fix is its own commit after M6's.

- **The armour stand's fire check** (`tests/survival-blocks/armor-stand.mjs`): "alight: burnt down in five seconds,
  its gear dropped" failed about two runs in five. It did so on M5's own commit too (5 of 12 runs of `1e4f0c9`). The
  player stood two blocks from the stand and now and then picked up the helmet the burnt stand dropped. The player
  now stands well away for that part, and 15 of 15 runs pass. Nothing in the game changed.
- **The full regression again, on M6's code** (`0a2e643`; nothing but this report changed while it ran): 179 of 182
  suites passed in 30.9 min. `drowned`, `illagers` and `wolf` failed checks that fail on `1e4f0c9` too. Run again,
  `wolf` failed 2 of 3 runs on each commit ("within ten blocks it stays put", "it comes after its owner"), and
  `drowned` passed 3 of 3 on each.
- **Minecart names saved; `/summon` reads the carts' data** (`src/entity/minecart.ts`,
  `src/entity/minecartVariants.ts`, `src/game/commands.ts`): a cart named from a renamed item lost its name when the
  world was saved and loaded. A cart's record had no name in it: the name is saved by the mobs' code, which carts
  don't use. Carts now save and load `CustomName` and `CustomNameVisible`, as vanilla's `Entity.saveWithoutId` does,
  and a guest who joins later gets the name with the cart's record. `/summon` now reads a cart's `CustomName`,
  `CustomNameVisible` and `Motion` (a part over 10 taken as 0, as vanilla does). For a chest or hopper minecart it
  reads `Items` (each in its `Slot`, none past the cart's size) or `LootTable` and `LootTableSeed` (rolled when the
  cart is first opened). It also reads a hopper minecart's `Enabled`, a TNT minecart's `TNTFuse`, and a furnace
  minecart's `Fuel`, `PushX` and `PushZ`. Tests: 7 new checks in `minecarts.mjs` (now 161): the name through a save
  (the check fails without the fix) and each kind's `/summon` data. `minecarts-mp.mjs`'s late joiner also sees a
  cart's name. Re-run and passing: `minecarts-mp.mjs`, `multiplayer/m2-entities.mjs`, `m2-actions.mjs`,
  `m6-commands.mjs`, `commands/summon.mjs`, `commands/lookups.mjs`, `survival-blocks/armor-stand.mjs`,
  `saves/roundtrip.mjs`. `npm run typecheck` clean.

---

## M6: minecarts and rails

The powered, detector and activator rails, and the hopper, TNT and furnace minecarts, built on vanilla 1.21.1's
`PoweredRailBlock`, `DetectorRailBlock`, `AbstractMinecart` (default physics, not the 1.21.2+ experiment),
`MinecartHopper`, `MinecartTNT` and `MinecartFurnace`. The plain rail, minecart and chest minecart were already in
the game; they now share the new code.

- **The three rails** (`src/world/blocksRails.ts`, `src/textures/railsPowered.ts`): they only run straight
  (north-south, east-west, or sloping up towards one side), each is `powered` or not, and they can be waterlogged.
  Strength 0.7, metal sounds, no collision. The outline is 2 px high, or 8 px on a slope. Models are the plain
  rail's, flat or tilted. The textures are our own: gold rails with a line of redstone down the middle (powered),
  iron rails with a stone plate and a redstone spot (detector), iron rails on dark sleepers with red bars between
  them (activator). The redstone is dull when unpowered and bright when powered.
- **Items, recipes, creative** (`src/item/itemsMinecarts.ts`): the rails are drawn flat in their block's texture, 64
  to a stack. Minecart with Hopper, Minecart with TNT and Minecart with Furnace are one to a stack, with the existing
  sprites. In Tools & Utilities they come after the boats in vanilla's order: rail, powered, detector and activator
  rail, then minecart, hopper, chest, furnace and TNT minecart. All nine are also listed in Redstone Blocks, after the
  observer (vanilla puts them after the cauldron, which that tab doesn't have here). Recipes: 6 powered rails from 6
  gold ingots, a stick and redstone (`X X`, `X#X`, `XRX`); 6 detector rails from 6 iron ingots, a stone pressure
  plate and redstone; 6 activator rails from 6 iron ingots, 2 sticks and a redstone torch (`XSX`, `X#X`, `XSX`). Each
  cart is its block plus a minecart, shapeless (fits in the inventory's 2×2 grid). The recipe book shows the rails
  once you hold a rail and the carts once you hold a minecart, under misc (vanilla's transportation).
- **Laying them** (`src/game/blockRules.ts`, `src/game/rails.ts`): north-south or east-west by the way you face, then
  joined to the rails around them like the plain rail, sloping up onto a rail one block higher. They never curve: at
  a corner they stay as laid. A plain rail still curves onto them. They pop off as items without a rigid block below
  (a hopper's rim counts), or without one under a slope's high end. They are waterlogged when placed in water.
- **Power** (`src/game/poweredRails.ts`, vanilla `findPoweredRailSignal`): a powered or activator rail is powered by
  any redstone next to it (a block, lever, torch, dust...). That power carries along up to 8 more rails of the same
  kind in a straight line (9 in all), up and down slopes. It isn't carried across a line running the other way, nor
  through a rail of the other kind, and it goes out the same way. When one changes, the blocks round the block under
  it are told (and round the block over a slope's top), as in vanilla.
- **Carts on powered rails** (`src/entity/minecart.ts`, vanilla `moveAlongTrack`): a powered one adds 0.06 a tick
  the way the cart is going, up to the 8 m/s cap. A cart at rest on a flat powered rail is pushed off a solid block at
  either end, away from it. An unpowered one halves a cart's speed each tick and stops it dead below 0.03, unless the
  player riding it is walking it along. A player holding forward in a stopped cart nudges it slowly, and now a LAN
  guest does too: its held keys and look count as its motion, since its movement is worked out on the guest's side.
- **Detector rail** (vanilla `DetectorRailBlock`): powered while any minecart is on it (a box inset 0.2, 0.8 high),
  and checked again every second until the cart has gone. It gives 15 to what's around it and strong power into the
  block under it. It tells the rails it leads to, so a powered rail in line with it is powered and carries the power
  on. A comparator behind it reads how full the first container minecart on it is (a chest's 27 slots, a hopper's
  5), rolling an unopened loot table first. A plain cart reads 0. It makes no game events of its own, as in vanilla.
  This game doesn't save scheduled ticks with the world, and drops them for a chunk that unloads. So a detector rail
  saved within a second of a cart leaving would have stayed powered for good. It now gets random ticks, and one that
  finds it powered with no check due looks again (the fix frogspawn already had).
- **Activator rail** (vanilla `activateMinecart`): each tick a cart is on one, it's told whether the rail is
  powered. A powered one throws a minecart's rider out and shakes the cart (a wobble and damage 50, which doesn't
  break it), lights a TNT minecart, and switches a hopper minecart off. The hopper minecart comes back on only over an
  unpowered activator rail.
- **A plain rail's junction**: a T-junction picks its curve again when a signal source next to it changes, now
  for any redstone power (it was only a redstone block before). With the power on, a T of rails north, south and east
  curves north-east; with it off, south-east. As in vanilla, setting a redstone block down doesn't flip it (vanilla
  tells the rail about the air that was replaced), but taking one away does.
- **Hopper minecart** (`src/entity/minecartVariants.ts`, vanilla `MinecartHopper`): 5 slots, no cooldown. Each tick
  it takes one item from the bottom of a container in the block above it. With no container there, it takes an item
  lying in the two blocks above it, and failing that, one lying right beside it. A hopper under the rail empties it, a
  hopper pointing at it fills it, and a dropper can fill it. Right-click opens a hopper's menu titled "Minecart with
  Hopper" (CONTAINER_OPEN/CLOSE). Broken, its items spill and it drops as itself. It saves its items and whether it's
  on (`Enabled`).
- **TNT minecart** (vanilla `MinecartTNT`): a powered activator rail lights it with the TNT hiss. It smokes and goes
  off 4 seconds later with power 4, plus up to 1.5 × its speed (at most 5) at random. Fire, lava or a blast light it
  with a short fuse (under 2 s), and so does breaking it while it's moving. Broken at rest, it drops as itself. A
  creative player's blow just removes it. A burning arrow sets it off at once, the blast credited to the shooter.
  Landing from 3 blocks or more sets it off (harder the higher), and so does crashing into something fast. Head-on,
  though, the crash has already stopped its speed that way, so it doesn't go off (as in vanilla). Once lit, its blast
  leaves rails, and the blocks under rails, alone. It's drawn flashing white every quarter second while lit, and in
  its last half second it swells to 1.3 times its size (`src/render/minecartContents.ts`). It saves its fuse
  (`TNTFuse`).
- **Furnace minecart** (vanilla `MinecartFurnace`): right-click with coal or charcoal to add 3 minutes (3600 ticks)
  of fuel, up to 32000. One is used, none in creative. With fuel, any right-click pushes it away from you. It runs at
  4 m/s (3 in water), its push turning with the track round bends. While fuelled its furnace is lit and it puffs large
  smoke. When the fuel runs out it stops pushing and coasts to a stop. It saves `Fuel`, `PushX` and `PushZ`.
- **Placing and dispensing**: every cart item (minecart, chest, hopper, TNT, furnace) sets its cart on a rail you
  click, half a block up on a slope. One item is used (none in creative), with ENTITY_PLACE. A dispenser sets them on
  the rail in front of it, or on a rail below an empty space in front. A renamed item names its cart, and a named cart
  drops an item with its name (vanilla keeps both ways). At first the name wasn't saved with the cart; the
  self-review fixed that.
- **Other**: arrows and tridents can hit minecarts (vanilla: anything that can be picked). Container minecarts are
  hopper and dropper targets. Iron golems aren't scooped up by a rolling minecart (a vanilla rule that was missing).
  The rolling and riding loops already covered every kind of cart.
- **Multiplayer**: guests are sent each cart as its record (not its items or loot table), then its fields as they
  change: a hopper minecart on or off, a TNT minecart's fuse (so it flashes on their side as on the host), and a
  furnace minecart's lit state (not its fuel count, which vanilla doesn't send either). A guest rides a cart smoothly
  and stays in its seat. On the guests' side a cart is now eased along over three ticks, as vanilla eases a cart
  (before, it moved in one), so it runs a tick or two behind the host's. It moves just as evenly when the host's ticks
  reach a guest unevenly (none in one tick, two in the next, as the two games' clocks drift), where before it stopped
  and then jumped, and it stops where the host's does. Guests see rails and detector rails powered, feed furnace
  minecarts, open hopper minecarts, set carts on rails, and hear the hiss and the blast.

**New files**: `src/world/blocksRails.ts`, `src/textures/railsPowered.ts`, `src/game/poweredRails.ts`,
`src/entity/minecartVariants.ts`, `src/item/itemsMinecarts.ts`, `src/render/minecartContents.ts`; tests
`tests/survival-blocks/minecarts.mjs`, `tests/survival-blocks/minecarts-mp.mjs`.

**Shared files touched** (marked `(minecarts)`): `src/entity/minecart.ts` (powered-rail boost and brake, the
activator call, `AbstractMinecartContainer` split out of `MinecartChest`, `destroy`/`discard`/`shouldSourceDestroy`,
the name kept, a guest rider's nudge, the carts made elsewhere, `redstoneSignal` exported), `src/game/rails.ts`
(`railConnections` and `railSignalChanged` exported; a junction heeds any redstone), `src/game/blockRules.ts` (the
new rails survive and are placed as the plain one), `src/game/explosion.ts` (an exploding entity's
`explosionSpares`), `src/game/interaction.ts` (every cart item places its cart with its name; a hopper minecart
opens), `src/game/game.ts`, `src/game/openMenu.ts`, `src/inventory/hopperMenu.ts`, `src/gui/screens/dispenser.ts`,
`src/net/menus.ts`, `src/net/client/clientMenus.ts` (the hopper minecart's menu and its title),
`src/game/redstone/dispenseItems.ts` (the new carts, named), `src/game/redstone/dispenser.ts` (any container minecart
is a target), `src/entity/arrow.ts` (arrows hit minecarts), `src/game/level.ts` (imports), `src/game/spawner.ts`
(names), `src/gui/screens/creative.ts` (the redstone tab), `src/inventory/recipes.ts` (six recipes),
`src/item/item.ts`, `src/world/blocks.ts`, `src/textures/blocks.ts` (registration),
`src/render/entityRenderers.ts` (the cart's contents drawn by `renderMinecartContents`; shadows),
`src/net/entityData.ts` and `src/net/entityNet.ts` (a furnace minecart's fuel and push, and loot tables, not sent),
`src/net/client/entityMirror.ts` (a minecart eased along over three ticks). No protocol change.

**Hooks**: `explosionSpares(x, y, z, state)` on an explosion's source entity (the lit TNT minecart); in
`minecart.ts`: `registerMinecartType(type, make)`, `activateMinecart(x, y, z, powered)`,
`shouldSourceDestroy(source)`, `discard()`, `destroy(source)`, and the `AbstractMinecartContainer` base class;
`HopperMenu`'s `title` and `onClosed`; the furnace minecart uses the existing duck-typed `playerInteract`.

**Deviations and open points**
- A hopper minecart looks for a container in the block a block and a half above it: a block's, or a container
  entity's in that block. Vanilla's entity search is a 1-block box centred there instead.
- A TNT minecart that goes off with nobody having lit it is its own blast's attacker (vanilla has none). A death by
  it therefore names the cart.
- A creative player's blow on a chest or hopper minecart now spills its contents (vanilla's `discard`), where the
  chest minecart used to vanish with them.
- `/summon` made the new carts but read no entity data for them at first. Since the self-review it reads each
  cart's own data (see there), but not Entity's other fields (`Rotation`, `NoGravity`, `Invulnerable`, `Passengers`...)
  nor a custom display block (`DisplayState`), which this game's carts don't have.
- There are no command-block or spawner minecarts in this game, so the detector rail has no command-block reading.
  Snowballs, eggs and other thrown things still don't hit carts (only arrows and tridents do), and arrows still
  don't hit boats; vanilla lets all of them. Those were left for the boats' and projectiles' own work.
- A guest's nudge uses the air speed a riding player moves with (0.02 × 0.91), as vanilla gives it, worked out from
  its keys on the host.
- A detector rail gets random ticks, which vanilla's doesn't, to make up for its lost check (vanilla saves it
  instead). A rail left powered like that goes off within about a minute on average rather than a second. Pressure
  plates and buttons have the same gap (one saved while pressed stays pressed after loading). They were left as they
  were, as the redstone switches' own work.
- Vanilla eases a cart's moves over five ticks, because its server sends them every third tick. The host here sends
  them every tick the cart moves, so three ticks are enough (the same as for mobs). A riding guest's view trails the
  host's cart by up to 0.8 blocks at full speed (two ticks).
- The plain rail's, minecart's and chest minecart's recipe book unlocks were left as they were. The textures are our
  own drawings.
- The visual check turned up a module-order bug that only the browser build shows: `dispenser.ts` loaded before
  `hopper.ts`, which fills one of its lists as it loads. `minecartVariants.ts` now loads `hopper.ts` first.

**Tests**: `tests/survival-blocks/minecarts.mjs` (154 checks): items, names, creative order (list and tab source),
recipes (right and wrong ingredients, 3×3 and 2×2), the recipe book, textures (see-through, glowing when powered,
gold against iron), block properties and drops. Laying: facing, joining, slopes, no curves at corners, plain rails
curving onto them, waterlogged, popping off (below, under a slope's top end, `doTileDrops`). Power: 9 from a redstone
block from either end, a lever on and off, not through the other kind, activator lines, up and down a slope, not
across, the neighbour updates below and over a slope. Carts: the boost, starting off a block (and not without one),
the brake (against the same cart on plain rails), the 0.4-a-tick cap. Detector: powered by a cart, a lamp lit, strong
power below only, powered rails it leads to, a comparator reading 0 for a plain cart, 15/1/0 for a chest minecart and
9 for a hopper minecart three slots full, a loot table rolled, off a second after the cart has gone, a cart rolling
over it, no game events. A detector rail gets random ticks. With its check lost, as after a save and load, a random tick
switches it off once the cart has gone, or keeps it on with its check due again while the cart is still there.
Activator: rider thrown out with a shake, unpowered does nothing, a TNT minecart lit (fuse,
hiss, smoke, blast on time, rails and blocks under them spared, others blown, a second TNT minecart lit by the blast
and going off), a hopper minecart switched off and on again. A junction flipped by a lever, not by a redstone block
set down; powered rails never curve. Hopper minecart: items above, beside, out of a chest above one a tick, beside
with an empty chest above, emptied by a hopper under the rail, filled by one pointing in, its menu (title, slots,
events, validity, the real right-click), saving, spilling (survival and creative). TNT minecart: dropped at rest, lit
when broken moving, fire, lava, creative, a cold and a burning arrow (credit), a burning arrow in flight, falls of 5
and 2, a diagonal crash and a head-on one, saving its fuse, game events. Furnace minecart: fuel from coal, charcoal,
none from an apple, the cap, creative, the push and 0.2-a-tick cap, burning down, lit and smoking, running out and
coasting to a stop, round a bend, the real right-click, saving, the drop. Placing each cart by item (slope, creative,
not on the ground, a name kept both ways) and by dispenser. A chest minecart's creative blow and save. Drawing the lit
TNT (flash, swell) and another cart's block.
`tests/survival-blocks/minecarts-mp.mjs` (33 checks): both guests see each kind where the host has it, lit or on or
not, but not what a hopper minecart holds, nor a furnace minecart's fuel count, nor a loot table; the furnace's smoke;
a guest climbs in and rides over powered rails, its copy (and the other guest's) a tick or two behind the host's and
moving every tick, sped up. The copy moves as evenly when a guest tick gets none of the host's ticks and the next gets
two: every move is within a quarter of the host's speed, where the old one-tick easing went 0.4, 0, 0.8. Once the
host's cart stops, the copy is just where the host's is. The guest is seated all the way, then gets out. Holding
forward nudges a stopped cart east; a
detector rail and its powered rails on and then off on the guests' side; a guest feeds a furnace minecart (one coal
used on both sides) and it pushes away from them, lit for both; a guest opens a hopper minecart's menu and
shift-clicks the apples out; a TNT minecart lit on an activator rail hisses for both guests, its fuse and flash
matching the host's each tick, and goes off, gone for them with the rails left; a guest sets a hopper minecart on a
rail; a guest who comes later sees a switched-off hopper minecart, a lit furnace minecart and a burning TNT one as
they are, and the rail's power going off. Existing suites re-run after the last changes, all passing:
`multiplayer/m2-entities.mjs` and `m2-actions.mjs` (the other carts and boats on the guests' side). `npm run typecheck`
clean.
Full regression (`node scripts/regress.mjs -j 2`), before the commit: 178 of 182 suites passed in 32.1 min. The run
reads the working tree as it goes, and the last changes were made while it ran; every multiplayer suite ran after the
guests' easing changed, and the minecart suites after the detector rail's random tick. The four failures:
- `drowned/drowned.mjs`, "19% with looting III", and `illagers/illagers.mjs`, "evoker conjures fangs": both suites are
  flaky on the previous commit too. The evoker's spell is picked at random, and that check failed 2 of 3 runs of
  `1e4f0c9` (and 7 of 9 here).
- `redstone2/hopper.mjs` crashed loading its modules in the same second that two rail files were saved. It passes on
  its own.
- `survival-blocks/armor-stand.mjs`, "alight: burnt down in five seconds, its gear dropped": flaky since M5 (5 of 12
  runs of `1e4f0c9` fail). The player stands two blocks off and sometimes picks up the helmet the stand drops. The
  fix is to the test, in the next commit.

**Try it** (http://localhost:5173/?seed=12345):
1. Creative → Tools & Utilities: after the boats, the rails and minecarts (also in Redstone Blocks, after the
   observer). Survival: craft 6 powered rails (6 gold ingots, a stick, redstone), detector and activator rails, and a
   minecart with a hopper, TNT or furnace (the block and a minecart).
2. Lay a long line of powered rails and put a redstone block beside the first one: nine light up. Break the redstone
   block: they go out. Put a lever beside a rail and flip it. Lay them up a slope: the power goes up it.
3. Set a minecart on plain rails leading into powered ones, get in and push off (hold W): the powered rails fling you
   along. Unpowered ones brake you to a stop. Put a solid block at the end of a powered rail and set a cart on it: it
   starts off by itself.
4. Put a detector rail in the line, with a redstone lamp beside it: the lamp lights while a cart is on it. Put a
   comparator behind the detector rail and stop a chest minecart with items on it: the comparator reads its fill.
5. Put a powered activator rail in the line: riding over it throws you out. A hopper minecart stops collecting there
   until it passes an unpowered activator rail. A TNT minecart lights on it (hiss, smoke) and goes off 4 s later,
   leaving the rails.
6. Hopper minecart: drop items on the track ahead of it and it picks them up; put a chest over the rails and it
   empties the chest as it passes; put a hopper under a rail and stop the cart over it: it's emptied. Right-click it:
   "Minecart with Hopper".
7. Furnace minecart: right-click it with coal. It pushes off away from you, smoking, and follows the track round
   bends. Right-click it again from the other end to send it back.
8. TNT minecart: break it while it's rolling (it lights) or shoot it with a flaming arrow (it goes off at once).
9. In a world made from the title screen: save and quit with a lit furnace minecart, a hopper minecart with items
   and a lit TNT minecart. Reopen: all as they were (the TNT minecart's fuse carries on).
10. LAN: the guest rides a minecart over powered rails (smooth on their screen), feeds a furnace minecart, opens a
    hopper minecart, and sees and hears a TNT minecart lit on an activator rail and going off; the host sees it all.

---

## M5: armour stand

The armour stand, entity and item: placed facing you, dressed and undressed with right-clicks, knocked over with two
quick blows, and posed with `/summon` data. Built on vanilla 1.21.1's `ArmorStand` and `ArmorStandItem`.

- **Item** (`src/item/itemsArmorStand.ts`): 16 to a stack, in the Functional Blocks tab after the decorated pot (where
  vanilla has it), drawn with the existing sprite. Recipe: six sticks round a smooth stone slab (`///`, ` / `, `/_/`),
  3×3 grid only. The recipe book finds it when you hold a smooth stone slab (vanilla `recipes/armor_stand`: not the
  sticks). Creative middle-click on a stand picks the item.
- **Placing** (`src/entity/armorStand.ts`, vanilla `ArmorStandItem.useOn`): goes on top of or beside the block you
  click, or into it if it's replaceable (grass). Never on a block's underside, and not in adventure mode (the click is
  passed on). It needs room: a 0.5 × 1.975 box with no block and no entity at all in it (a dropped item counts). It
  stands on whatever is under it (half a block down onto a slab, one block lower when placed on the side of a block
  over air), then falls if there's nothing there. It turns to face you, rounded to the nearest eighth of a turn, and
  takes the name of a renamed item. Sound: `entity.armor_stand.place` at 0.75 volume, pitch 0.8. Game event:
  `entity_place`. One item is used up (none in creative) and your hand swings.
- **Dressing it** (vanilla `interactAt`, `getClickedSlot`, `swapItem`): right-click with something it can wear and it
  goes on its slot: armour, a carved pumpkin or a mob head on the head, an elytra on the chest. It takes one off a
  stack; a single item swaps with what it had. Held items (swords, shields, anything) go in its hands only when its
  arms are shown: the main hand is its right. With an empty hand, you take off whatever is at the height you click:
  boots low down, then leggings, chestplate, helmet at the top (a small stand's heights scaled). Failing that, what's
  in its hands. In creative, an empty slot gets a copy and your item stays. `DisabledSlots` works as in vanilla: a
  slot's bit stops it being used at all, +8 stops taking, +16 stops putting. A click that does nothing still counts as
  used (vanilla's client consumes it): no swing, and your held item's own use doesn't run, so a helmet isn't put on
  your own head. Equip sounds and equip/unequip game events are the piece's own. A renamed name tag names the stand
  (the name shows only with `CustomNameVisible`, as in vanilla). A marker ignores clicks.
- **Breaking it** (vanilla `hurt`): a player's blow makes it wobble for 5 ticks. You hear `entity.armor_stand.hit` at
  0.3 volume and get `entity_damage`, but it takes no damage. A second blow within 5 ticks breaks it: the break sound,
  oak-plank particles, `entity_die`. It drops itself (with its name) and everything it wore and held. A creative
  player's blow breaks it at once and drops nothing. Adventure and spectator players can't break it. An arrow,
  trident, fireball, wither skull or wind charge breaks it outright. A blast breaks it too but drops only its gear.
  Invisible stands and markers can't be broken this way, and neither can invulnerable ones (except by a creative
  player). `/kill` and the void remove any stand, with no drops. Nothing drops with `doTileDrops` off. Nothing else
  hurts it, and it isn't pushed by mobs or targeted by them (wolves already skipped it), and potions don't affect it.
  A knockback weapon moves it, as in vanilla.
- **Fire and falls**: fire and campfires set it alight. While alight it loses 4 health a second (fire touching an
  already burning stand takes 0.15 more) and breaks after about 5 seconds, dropping its gear but not itself. It falls
  under gravity (not with `NoGravity`; a marker never moves). Landing from more than 3 blocks up plays
  `entity.armor_stand.fall`, with no damage. It pushes only a rideable minecart that's pressed right against it.
- **`/summon armor_stand ~ ~ ~ {…}`** (vanilla `readAdditionalSaveData`): `Small` (half size), `NoBasePlate`,
  `ShowArms`, `Invisible` (only what it wears shows), `Marker` (no box at all: can't be hit, clicked or moved; its eye
  height stays the size it would be, so it's lit at that height), `NoGravity`, `Pose` (`Head`, `Body`, `LeftArm`,
  `RightArm`, `LeftLeg`, `RightLeg`, each `[x, y, z]` in degrees, taken modulo 360), `DisabledSlots`, `ArmorItems`
  (feet to head), `HandItems` (main, off), `Invulnerable`, `CustomName`, `CustomNameVisible`, `Rotation`.
- **Dispensers** (`src/game/redstone/dispenseItems.ts`): a dispenser holding armour stands places one in front of it,
  facing the way the dispenser faces (up or down counts as east, like vanilla's `Direction.toYRot`), with no room
  check. A dispenser of armour puts it on a stand in front, into a free slot that isn't disabled; otherwise the armour
  is thrown out.
- **Drawn** (`src/render/armorStandRenderer.ts`, vanilla `ArmorStandRenderer`/`ArmorStandModel`): M1's smithing
  preview model and wood texture (`src/render/armorStandPreview.ts`), turned by its body. Each part follows its pose,
  and the body's sticks move with the body. Arms show only with `ShowArms`, and the base plate unless `NoBasePlate`.
  A small stand is drawn like a baby mob: its head scaled 0.75, its body half size. A struck stand wobbles
  (`sin(t/1.5·π)·3°` for 5 ticks). An invisible stand shows only its gear (a spectator sees a 15% ghost of it). On
  top, the existing layers draw its armour in the stand's pose (`src/render/armorLayer.ts`), what its hands hold (with
  or without arms), a worn elytra, and any non-armour head item. It's visible from 4× its size away (markers as a
  1-block entity).
- **Sounds** (`src/audio/gen/armorStand.ts`): place, hit, break and fall, 4 takes each. Our own: a stone plate and a
  wooden frame knocking, sticks clattering apart, a hollow wooden thud. Placing is in the Blocks volume category (as
  vanilla plays it); the rest are Friendly Creatures (neutral).
- **Saving** (`src/game/spawner.ts`): saved with its chunk, like item frames: flags, pose (only the parts off their
  default), `DisabledSlots`, gear, name, turn, health, fire, `NoGravity`, `Invulnerable`.
- **Multiplayer**: guests are sent a stand as its saved record, then its fields as they change. They see it placed,
  turned, posed, sized, dressed, invisible or named, and see it fall. A guest's right-click and blows are handled by
  the host, using the host's own view of what the guest is looking at, within reach. So a guest dresses and undresses
  stands, places them, and knocks them over; everyone sees the result and hears the equip, place, knock and break
  sounds. The wobble reaches guests through `lastHit` and their synced clock. Adventure guests, guests out of reach,
  and clicks on markers are refused. A guest who joins later sees each stand as it is.

**New files**: `src/entity/armorStand.ts`, `src/item/itemsArmorStand.ts`, `src/render/armorStandRenderer.ts`,
`src/audio/gen/armorStand.ts`; tests `tests/survival-blocks/armor-stand.mjs`, `tests/survival-blocks/armor-stand-mp.mjs`.

**Shared files touched** (a line or a few each, marked `(armour stand)`): `src/item/item.ts`
(`registerArmorStandItem`), `src/inventory/recipes.ts` (the recipe), `src/game/spawner.ts` (save/load, saved with the
chunk, name, summonable), `src/game/commands.ts` (`/summon` with its data), `src/game/interaction.ts` (an entity's own
interact may return `'consume'`: the click is spent with no swing), `src/game/combat.ts` (no `player_hurt_entity`
trigger for a stand, as vanilla's hurt never gets that far), `src/game/redstone/dispenseItems.ts` (placing stands,
armour onto stands), `src/render/entityRenderers.ts` (builds and calls `ArmorStandRenderer`, its render distance, its
name tag), `src/render/armorStandPreview.ts` (exports its texture), `src/net/entityNet.ts` (sent as its record),
`src/net/server/entityTracker.ts` (tracked within 10 chunks, as vanilla), `src/audio/synth.ts` (`armorStandSounds`),
`src/audio/soundManager.ts` (placing in the Blocks category). No protocol change.

**Hooks**: none new. `playerInteract` returning `'consume'` is the one addition to the existing duck-typed entity
interact. The stand also uses `ignoreExplosion` and `LivingEntity`'s `onFallDamage`, `animateMirror`,
`canBeSeenAsEnemy` and `isAffectedByPotions`.

**Deviations and open points**
- Based on vanilla 1.21.1 (no `mobGriefing` check on blasts; an invisible stand ignores explosions). The damage-type
  tag contents are from memory, including `mace_smash` in `can_break_armor_stand`.
- No block fall sound on landing (this game plays none for any mob). No `Silent`, `Glowing` or `entity_data` item
  component. A dispenser always puts armour in its natural slot (vanilla moves it to the main hand when that slot is
  disabled, which then fails anyway).
- The texture is M1's smithing-preview wood and smooth stone, and the sounds are our own (vanilla's are assets).
- No statistics in this game, so nothing is counted for using or breaking one.

**Tests**: `tests/survival-blocks/armor-stand.mjs` (104 checks). Item, recipe (table only, wrong slab, missing
stick), recipe book, names. Placing: the real click through pick and use, the eight turns, blocked by a block or any
entity, underside, adventure, creative, into grass, onto a slab, beside a block over air (one lower, then falls),
named. Dressing: chestplate, one off a stack, stack against a worn piece, swaps, boots/leggings, taking off by click
height, hands with and without arms, shield, pumpkin/elytra/head, creative copy and take, `DisabledSlots` (+8/+16),
name tag, marker. Breaking: wobble, after 5 ticks, double hit with drops and name, creative, adventure, arrow,
blast, invisible (blows, blast, `/kill`), invulnerable, `doTileDrops`, void. Fire (4 a second, burnt in 5 s, a fire
block), falls (6 blocks clatters, 2 don't), `NoGravity`, marker, small, not pushable/targeted/potions. `/summon` data,
dispensers (placing, armour, disabled slot, facing), save/load, sounds. Drawing: box counts with/without arms/plate,
pose rotations, invisible and the spectator ghost, layers, small, render distance, name.
`tests/survival-blocks/armor-stand-mp.mjs` (23 checks): both guests see a stand where it is and click its box; a
guest dresses it (heard by the other), puts a stick in its hand and takes both off by height; a disabled slot, out of
reach and a marker are refused; removal reaches the guests; a guest places one (seen, heard, one used on both sides);
a guest's blow wobbles it (seen on the other's clock, knock heard), a second quick one breaks it (gone everywhere,
drops on the host); an adventurer's blows do nothing; a creative guest's one blow breaks it with no drops; a late
joiner sees a small, posed, named, dressed stand; later pose, invisibility, gear and size changes reach them; a fall is
seen. Re-run after the change: all M1–M4 suites, `tests/armor/equip-test.mjs`, `tests/commands/summon.mjs`,
`lookups.mjs`, `tests/end/frames.mjs`, `elytra.mjs`, `skulls.mjs`, `tests/multiplayer/m2-entities.mjs`,
`m2-actions.mjs`, `m2-security.mjs`, `m3-survival.mjs`, `m6-commands.mjs`, `tests/saves/roundtrip.mjs`, `player.mjs`,
`tests/redstone2/hopper.mjs`: all pass. The save roundtrip's 100 ms stall check read 105 ms once with three suites
running at the same time and passed alone. `npm run typecheck` clean.

**Try it** (http://localhost:5173/?seed=12345):
1. Creative → Functional Blocks: the armour stand after the decorated pot. Survival: craft it (six sticks round a
   smooth stone slab).
2. Place one: it faces you (walk round and place more: 8 directions). On a slab it sits half a block down.
3. Right-click it with a helmet, chestplate, leggings and boots: each goes on with its sound. Right-click with an
   empty hand at its feet, knees, chest and head: each piece comes off.
4. `/summon armor_stand ~ ~ ~ {ShowArms:1b,Pose:{RightArm:[-90f,0f,0f]}}`: arms out. Give it a sword and a shield.
   Try `Small:1b`, `NoBasePlate:1b`, `Invisible:1b` with armour on, `Marker:1b`, `NoGravity:1b` placed in the air.
5. Hit it once: it wobbles with a knock. Hit it twice quickly: it breaks and drops itself and its gear. In creative,
   one hit breaks it with no drops. Shoot it with an arrow: it breaks. Set it alight (flint and steel on the
   ground at the edge of its block, beside the stand): it burns down in about 5 seconds.
6. `/summon armor_stand ~ ~10 ~`: it falls and lands with a clatter.
7. A dispenser with armour stands, powered: one is placed facing out. With armour in it: the armour goes on that stand.
8. In a world made from the title screen: dress and pose a stand, save and quit, reopen: it's still there as it was.
9. LAN: the guest dresses and undresses a stand and places its own; the host sees it and hears the sounds. The guest
   hits a stand twice: it breaks for everyone.

---

## M4: spyglass

The spyglass item: raised to the eye, it zooms the view in; others see it held there.

- **Item** (`src/item/itemsSpyglass.ts`, `src/game/spyglass.ts`, vanilla `SpyglassItem`): stacks to 1, no durability,
  Tools & Utilities tab after the clock (before the map, as vanilla). Recipe: an amethyst shard over two copper ingots
  in one column (vanilla's `" # ", " X ", " X "`, shrunk as vanilla's `ShapedRecipePattern` does: any column of a
  crafting table, not the 2×2 grid); the recipe book finds it when you hold an amethyst shard (vanilla
  `recipes/tools/spyglass`: not the copper).
- **Using it**: right-click (either hand; not in spectator) raises it at once, no hand swing (vanilla
  `startUsingInstantly`), `item.spyglass.use` heard round about, `item_interact_start`. It stays up while the button
  is held, at most 1200 ticks (a minute), then it's lowered by itself (`item.spyglass.stop_using`) and, with the button
  still held, raised again at once (vanilla `startUseItem` while the key is down). Let go (or a screen opens):
  lowered, `stop_using`, `item_interact_finish`. Switching slots drops it without a sound (vanilla `stopUsingItem`).
  Walking slows to a fifth and sprinting stops while it's up (the existing item-use rule). Nothing is used up;
  finishing its minute isn't "eating" (no consume trigger).
- **Scoping** (first person, vanilla `Player.isScoping`): the FOV goes to 0.1 (eased by half each tick; *not* scaled
  by the FOV Effects option, as vanilla returns it as is), the mouse turns an eighth as fast (vanilla `d³` instead of
  `d³ × 8`), neither hand is drawn, and the scope overlay covers the screen (`src/gui/spyglassOverlay.ts`, vanilla
  `renderSpyglassOverlay`: a square the screen's shorter side across, growing from 0.5× to 1.125× as it comes up,
  black around it, under the crosshair and hotbar, hidden with F1). Black glowing sign text shows its outline at any
  distance while scoping (M1's `setSignScopingHook`, now wired in `game.ts`). In third person the view isn't zoomed.
- **Seen by others** (`src/render/playerPose.ts`, `src/render/model.ts`, vanilla `HumanoidModel.ArmPose.SPYGLASS` and
  `PlayerItemInHandLayer.renderArmWithSpyglass`): the using arm raised along the look (head pitch − 110°, 15° more
  when crouching, clamped to −2.4…3.3 rad), turned 15° in across the face, no idle sway on that arm; the spyglass drawn
  at the head, before the eye on that arm's side, pointing where the head looks (its pitch kept within 30° up, 90°
  down); mid-swing it's drawn in the hand.
- **Model** (`src/render/spyglassRenderer.ts`, `src/textures/spyglass.ts`): our own 3D model (a 2×2 eyepiece with a
  leather grip into a 3×3 copper barrel, a pale-blue lens at its end, 13 px long) in the hands (first and third person)
  and at the head; the existing flat sprite in the inventory, on the ground and in item frames (as vanilla's 2D model
  in the GUI/GROUND/FIXED contexts).
- **Advancements** (`src/game/advancements.ts`): "Is It a Bird?", "Is It a Balloon?" and "Is It a Plane?" were
  `never`; now vanilla's `using_item` trigger fires every tick the spyglass is up with what the player looks at
  (vanilla `PlayerPredicate.looking_at`: the nearest entity whose box the look meets within 100 blocks, any but a
  spectator, then only if the eyes can see it): a parrot, a ghast, the ender dragon (any of its parts).
- **Sounds** (`src/audio/gen/spyglass.ts`): `item.spyglass.use` (a brass tube sliding out, rising, and a bright clink)
  and `item.spyglass.stop_using` (sliding shut, falling, and a duller knock); in the Players volume category (vanilla
  plays them as the player's sounds).
- **Saving**: a plain item; the use itself isn't saved (as vanilla).
- **Multiplayer**: the guest's button acts on the host, which raises it and tells the guest (`SetUsingItem`), whose
  own view then zooms, slows the mouse and shows the overlay; everyone near hears both sounds; other guests (and a
  guest who joins while it's up) and the host see the raised arm and the spyglass at the eye. Advancements are the
  host player's only (this game has none for guests).

**New files**: `src/game/spyglass.ts`, `src/item/itemsSpyglass.ts`, `src/render/spyglassRenderer.ts`,
`src/textures/spyglass.ts`, `src/textures/spyglassScope.ts`, `src/gui/spyglassOverlay.ts`,
`src/audio/gen/spyglass.ts`; tests `tests/survival-blocks/spyglass.mjs`, `tests/survival-blocks/spyglass-mp.mjs`.

**Shared files touched** (a few lines each, marked `(spyglass)`): `src/item/item.ts` (`registerSpyglassItem`),
`src/inventory/recipes.ts` (the recipe), `src/game/level.ts` (`import './spyglass'`), `src/game/itemBehavior.ts` (a new
optional `releaseUsing` hook) and `src/game/interaction.ts` (calls it when an item is let go), `src/game/advancements.ts`
(the `using_item` criterion and its payload; the three spyglass advancements use it), `src/game/game.ts` (the scoped
FOV, the mouse factor, `setSignScopingHook`), `src/gui/hud.ts` (draws the overlay first), `src/render/handRenderer.ts`
(no hands while scoping), `src/render/model.ts` (the `spyglass` arm pose; no idle sway for that arm),
`src/render/playerPose.ts` (the pose and the spyglass at the head), `src/render/entityRenderers.ts` (builds the
`SpyglassRenderer`), `src/audio/synth.ts` (`spyglassSounds`), `src/audio/soundManager.ts` (the Players category).

**Also fixed while checking it** (`src/game/game.ts`, the frame loop): a frame's time stamp could be behind the last
one's (the fallback timer's `performance.now()` against a `requestAnimationFrame` stamp taken before it, after a
stall), which made the partial tick negative for that frame: the view tilted as if hurt and hotbar icons squeezed for
a frame. The frame time now never goes back.

**Deviations and open points**
- The in-hand model and its texture, the scope texture and both sounds are our own (vanilla's are assets).
- No statistics in this game, so `used:spyglass` isn't counted.
- The recipe is written as its one column (`#`, `X`, `X`) because this game's recipe matcher doesn't shrink patterns;
  it matches exactly what vanilla's shrunk pattern does.

**Tests**: `tests/survival-blocks/spyglass.mjs` (64 checks: item, tab order, recipe in each column, not upside down,
not in the 2×2 grid, recipe-book unlock by the shard; use (sound at the player, event, no swing), scoped FOV and mouse
factor (first person only), held, let go (sound, event, still in hand), the full minute (lowered by itself, heard
once, raised again with the button held, not a consume), slot change (silent), offhand, spectator/creative/adventure,
the walking pace (a fifth) and no sprinting; what it looks at (nearest along the look, through the spyglass only, not
through a wall, not past 100 blocks, not a spectator) and all three advancements (parrot, ghast, dragon part); the arm
pose (angles, crouch, clamp, left arm, the other arm's sway); the model in each hand context and at the head, the
sprite elsewhere; drawn at the head only while in use and not mid-swing; the textures, the sounds, a save) and
`tests/survival-blocks/spyglass-mp.mjs` (18 checks: a guest raises it on the host, its own view zooms and its mouse
slows, heard by everyone, the other guest and the host see the pose and draw it at the eye, held 40 ticks in step, let
go on both sides, heard, the arm down, a slot change drops it silently, a late joiner sees it up, the minute (lowered,
heard, raised again with the button held), the host's own spyglass seen by the guests).

**Try it** (http://localhost:5173/?seed=12345):
1. Creative → Tools & Utilities: the spyglass after the clock. Survival: craft it (an amethyst shard over two copper
   ingots, in a column of the crafting table).
2. Hold right-click: it's raised with a slide and clink, the view zooms right in, the scope's round view grows to fill
   the screen, the mouse turns slowly, the hand is gone, you walk slowly. Let go: lowered with its sound.
3. F5 (third person): no zoom; look at yourself from the front (F5 twice): your arm is raised with the spyglass at
   your eye; look up and down: it follows; crouch: the arm lifts a little more.
4. Put a sign with black glowing text (glow ink sac) 30 blocks away: through the spyglass its light outline shows.
5. Find a parrot (jungle) and look at it through the spyglass: "Is It a Bird?". A ghast in the Nether: "Is It a
   Balloon?"; the ender dragon: "Is It a Plane?".
6. LAN: the guest holds right-click with a spyglass: its view zooms; the host (and other guests) see its arm raised and
   the spyglass at its eye, and hear it.

---

## M3: cake and candle cakes

The cake block and item, and the 17 candle cakes (plain candle and 16 colours), lit or not.

- **Cake** (`src/world/blocksCake.ts`, `src/game/cake.ts`, vanilla `CakeBlock`): `bites` 0–6, eaten from the west
  side 2 px a slice (vanilla `SHAPE_BY_BITE`, 14×8×14 whole); strength 0.5, wool sounds, no tool, map colour none,
  forced solid (a cake, sign or banner stands on it), broken by pistons, needs something solid under it (breaks
  without drops otherwise), drops nothing even with silk touch, and water doesn't wash it away. Using it: only if
  hungry, or in creative (vanilla `canEat(false)`), +2 food and +0.4 saturation (`FoodData.eat(2, 0.1)`), the `eat`
  game event; after the 7th slice the block goes (`block_destroy`). Not hungry: the click passes on to the held item.
  A comparator reads `(7 − bites) × 2` (14 whole → 2). Eating makes no sound, as in vanilla.
- **Candles into it** (vanilla `CakeBlock.useItemOn`): any of the 17 candles used on an **uneaten** cake makes that
  candle's candle cake (1 candle used, none in creative; `block.cake.add_candle`, `block_change`). On a bitten cake the
  click eats a slice instead (if hungry).
- **Candle cakes** (vanilla `CandleCakeBlock`/`AbstractCandleBlock`): `lit`; light 3 while lit; the cake's shape plus
  the candle's (7..9 × 8..14); cut-out layer; a small flame over the wick (and now and then smoke and the crackle).
  Lit by flint and steel or a fire charge (their use goes straight to lighting it, it isn't eaten), by a dispenser's
  flint and steel, by a burning arrow. Put out by an empty hand on the candle (the click above the cake's middle,
  vanilla `candleHit`), a splash of water or a wind burst. Otherwise using it eats it as an uneaten cake: the candle
  drops and a cake with one slice gone is left. Comparator 14; drops its candle when broken (or when its support
  goes); picks as a cake; has no item of its own.
- **Item, recipe, creative**: the cake item stacks to 1, is drawn as its (already existing) sprite, and sits in the
  Food & Drinks tab after the cookie. Recipe: 3 milk buckets, 2 sugar, an egg, 3 wheat; the 3 buckets stay in the
  grid (the milk bucket now has vanilla's crafting remainder, `bucket`). Composting, the villager trade and the trial
  chamber loot that already named `cake` now work, since the item exists.
- **Textures** (`src/textures/cake.ts`): `cake_top` (frosting with red cherries), `cake_side` (frosting and drips over
  golden sponge with a jam line, drawn in the tile's lower half), `cake_bottom` (baked crust), `cake_inner` (the cut
  face); candle cakes use the candles' own textures (lit/unlit) on vanilla's `template_cake_with_candle` model.
- **Sounds** (`src/audio/gen/cake.ts`): `block.cake.add_candle` (3 takes: a damp squish and a small wax knock); the
  rest are wool's and the candles' existing ones.
- **Saving**: plain block states (`bites`, `lit`), kept by name in the chunk palette.
- **Multiplayer**: all host-side: a guest's clicks eat, add candles, light and put out; the guest's world, its food
  and inventory follow; everyone near hears it; a late joiner gets the states with the chunk.

**New files**: `src/world/blocksCake.ts`, `src/game/cake.ts`, `src/textures/cake.ts`, `src/item/itemsCake.ts`,
`src/audio/gen/cake.ts`; tests `tests/survival-blocks/cake.mjs`, `tests/survival-blocks/cake-mp.mjs`.

**Shared files touched** (a line or a few each, marked `(cake)`): `src/world/blocks.ts` (`registerCakeBlocks()`),
`src/game/level.ts` (`import './cake'`), `src/item/item.ts` (`registerCakeItems`), `src/inventory/recipes.ts` (the
recipe), `src/textures/blocks.ts` (`registerCakeTextures`), `src/audio/synth.ts` (`cakeSounds`),
`src/game/candles.ts` (a small `registerCandleKin` hook: `lightCandle`/`extinguishCandle` — used by flint and steel,
fire charges, dispensers and splash water — also try the candle cakes), `src/game/windBurst.ts` (a wind burst puts
out lit candles and candle cakes, vanilla `AbstractCandleBlock.onExplosionHit`), `src/game/redstone/piston.ts`
(candle cakes break when pushed), `src/game/banners.ts` (`legacySolid` also true for cakes).

**Deviations and open points**
- Wind bursts now also put out ordinary lit candles (the same vanilla method covers both; they didn't before).
- "Birthday Song" (an allay drops a cake at a note block) stays `never`: there are no allays in this game.
- There are no statistics, so `eat_cake_slice` isn't counted.
- The cake texture and the `block.cake.add_candle` sound are our own procedural versions.

**Tests**: `tests/survival-blocks/cake.mjs` (67 checks: states, shapes, strength, sounds, forced solid, pistons, map
colour, candle cake states/light/shape/layer, models, item/sprite/stack/tab/order, pick block, recipe and crafting
at a table with the buckets left, faces, the add-candle sound, composting, placing (a cake on a cake), eating when
full/hungry/creative, food and saturation (capped), `eat`/`block_destroy`, 7 slices, no drops, the analog output
for every bite and a real comparator, adding candles (consumed; not on a bitten cake; not consumed in creative),
flint and steel and fire charge lighting (not eaten, light 3), the flame, putting out by hand (hiss, smoke, event),
eating a lit and an unlit candle cake (candle dropped), holding an item, dispenser, burning arrow, splash water, wind
burst (also candles), drops, losing support, saving a chunk) and `tests/survival-blocks/cake-mp.mjs` (20 checks).

**Try it** (http://localhost:5173/?seed=12345):
1. Creative → Food & Drinks: the cake after the cookie (it stacks to 1). Survival: craft it (3 milk buckets, 2 sugar,
   an egg, 3 wheat): the buckets stay in the grid.
2. Place it on the ground (not on air). With a full hunger bar right-click does nothing; when hungry each click eats a
   slice (+1 drumstick); the 7th finishes it. Put a comparator against it: 14, then 2 less a slice.
3. Right-click a fresh cake with any candle: a candle cake. Flint and steel lights it (light 3, flame); an empty hand
   on the candle blows it out; a click on the cake part eats a slice and the candle pops off.
4. Break a candle cake: its candle drops; break a cake: nothing. Push them with a piston: they break.
5. LAN: a guest eats, adds a candle, lights and blows it out; the host sees the same.

---

## M2: ender chest

The ender chest block and item, and each player's own 27 ender slots that every ender chest opens onto.

- **Block** (`src/world/blocksEnderChest.ts`): `facing` (placed facing the player) and `waterlogged`; hardness 22.5,
  blast resistance 600, a pickaxe needed (any tier), light 7, stone sounds and map colour, vanilla's 1..15 × 0..14 shape
  for collision and outline, no comparator output. Drops 8 obsidian, or itself with silk touch (vanilla
  `blocks/ender_chest`). Hoppers don't see it as a container (as in vanilla). Breaking it angers piglins that see it
  (it was already in this game's `#guarded_by_piglins` list).
- **Opening** (`src/game/enderChest.ts`, vanilla `EnderChestBlock.useWithoutItem`): not while a redstone conductor is on
  top (glass, a slab, a chest are fine); opens a 3-row chest menu titled **Ender Chest** over the opener's own
  `PlayerEnderChest` (27 slots); piglins that see it are angered (vanilla `angerNearbyPiglins(player, true)`). The menu
  stays valid only while that chest exists and the player is within reach + 4 (vanilla `stillValidBlockEntity`).
  Spectators can't open it (vanilla: no menu provider) and never count as openers.
- **Lid, sounds, events** (`src/world/enderChestBlockEntity.ts`, vanilla `ContainerOpenersCounter` +
  `ChestLidController`): the first opener plays `block.ender_chest.open` (volume 0.5, pitch 0.9–1.0) and fires
  `container_open`; the last one out plays `block.ender_chest.close` and fires `container_close`; each change sends the
  block event (1, count) that moves the lid 0.1 per tick, eased as vanilla (`1 − (1 − f)³`). Every 5 ticks while open
  it drops openers removed from the level and re-sends the count (as vanilla's recheck). Portal motes: 3 per animate
  tick from the corner columns (vanilla `animateTick`).
- **Rendering** (`src/render/enderChestRenderer.ts`): vanilla `ChestModel` (bottom 14×10×14, lid 14×5×14 hinged at the
  back, lock 2×4×1 sharing the lid's pivot) with a procedural 64×64 sheet (`src/textures/enderChest.ts`: obsidian with
  pearl-green frames and a green gem latch), drawn in the block's light like the other block-entity renderers; the
  item/GUI icon is a 3-box block model on the atlas (`ender_chest_*` faces).
- **Item, recipe, creative**: stacks to 64, 8 obsidian around an eye of ender, Functional Blocks tab (between the
  barrel and the respawn anchor, as vanilla); it's not a furnace fuel (it used to match the chest's fuel rule).
- **Sounds** (`src/audio/gen/enderChest.ts`): open = stone lid grinding up, air drawn in, a hollow shimmering hum;
  close = air out, heavy stone knock, the hum sinking.
- **Saving**: the slots are kept with the player (`enderItems` in `savePlayer`/`loadPlayer`, `src/game/playerData.ts`):
  the host's own player in the world's meta, each LAN guest in its `playerdata/<uuid>` record. Saves from before have
  none (an empty ender chest). The block entity saves nothing but its position; the lid state is never saved.
- **Dying**: the inventory drops, the ender slots don't; respawning keeps them (same player object).
- **Multiplayer**: guests open it through the host (the host builds the menu over the guest's own slots, the guest's
  game shows a copy titled Ender Chest); two guests at one chest each see only their own; the lid state (open/closed,
  from, since which game tick) goes to guests in the block entity's update data only (not saved), so their copies
  animate the lid on their own clock; sounds are heard by everyone near. A guest's slots persist through leaving and
  rejoining, closing the tab (the host drops the session and saves the record at once), the host saving, quitting
  and reopening the world, and death.

**New files**: `src/world/blocksEnderChest.ts`, `src/world/enderChestBlockEntity.ts`, `src/game/enderChest.ts`,
`src/render/enderChestRenderer.ts`, `src/textures/enderChest.ts`, `src/audio/gen/enderChest.ts`; tests
`tests/survival-blocks/ender-chest.mjs`, `tests/survival-blocks/ender-chest-mp.mjs`.

**Shared files touched** (a line or two each, marked `(ender chests)`): `src/world/blocks.ts`
(`registerEnderChestBlock()`), `src/game/level.ts` (`import './enderChest'`), `src/game/playerData.ts` (`enderItems`
saved and loaded), `src/storage/worldStore.ts` (the `enderItems` field's type), `src/textures/blocks.ts`
(`registerEnderChestTextures`), `src/render/entityRenderers.ts` (calls `EnderChestRenderer`), `src/audio/synth.ts`
(`enderChestSounds`), `src/inventory/recipes.ts` (the recipe), `src/item/item.ts` (Functional Blocks tab; excluded
from the chest fuel rule), `src/net/chunkData.ts` (`visibleBlockEntity` merges a block entity's optional
`visibleData()` — only the ender chest's lid uses it). No protocol change. The existing `tests/saves/player.mjs` lists the saved
player record's fields exactly; `enderItems` was added to its list.

**Deviations and open points**
- Vanilla's `ChestModel` lock pivot: the lock turns about the lid's own hinge (0, 9, 1) so it stays on the lid.
- The ender chest item icon is a static block model (vanilla draws the chest's block-entity model in the GUI); it looks
  the same shut.
- No statistics in this game, so `open_enderchest` isn't counted.
- The sounds are generated (vanilla has recordings).

**Tests**: `tests/survival-blocks/ender-chest.mjs` (80 checks: block properties, light, shape, drops by tool and silk
touch, recipe, item/tab/fuel, sounds, texture sheet (every model face solid), item model, lid easing, placing and
facing, waterlogging, opening, menu title/size/slots, openers and active chest, sounds and game events, lid timing,
two players' separate slots, closing order, other chests opening onto the same slots, conductor above, reach, broken
while open, the 5-tick recheck (a lost block event, a removed player), spectators, piglins, motes, the guest's copy of
the lid, nothing saved on the block, save/load of the slots (and old saves), death and respawn) and
`tests/survival-blocks/ender-chest-mp.mjs` (38 checks: a guest opens it by clicking; menu title and slots; lid heard
by both guests and animated in their copies; shift-clicking in; two guests' slots separate; lid stays up while one is
still in; blocked by stone above; closed out of reach; leave with it open (lid shuts, record kept) and rejoin; close
the tab with it open and come back by the same name; death keeps it; the host's own player's slots; host saves and
quits with guests in, reopens: all three players' slots back). Existing suites re-run after the change, all passing:
`tests/saves/roundtrip.mjs`, `saves/player.mjs`, `multiplayer/m3-menus.mjs`, `m4-playerdata.mjs`, `m1-blocks.mjs`,
`m1-chunks.mjs`, `m1-security.mjs`, `survival-blocks/signs.mjs`, `signs-mp.mjs`, `end/shulkerbox.mjs`, `end/blocks.mjs`,
`menus/banners.mjs`, `bastions/m1a-blocks.mjs`, `ancient-city/m1-blocks.mjs`. `npm run typecheck` clean.
(M1's full regression, run in the background meanwhile: 171 of 172 suites passed; the one failure was
`saves/roundtrip.mjs`'s "never more than 100 ms without the page getting a turn" under the parallel run's load, which
passes when run alone.)

**Try it** (http://localhost:5173/?seed=12345):
1. Creative → Functional Blocks: the ender chest after the barrel. Survival: craft it from 8 obsidian + eye of ender.
2. Place it: it faces you, glows (light 7), purple motes drift about it. Right-click: "Ender Chest", the lid rises with
   its sound. Put something in, close (the lid falls), place a second ender chest far away: the same things are in it.
3. Put a stone block on top: it won't open; glass on top: it opens. Mine it with a pickaxe: 8 obsidian; with silk
   touch: the chest. The things inside are still in any other ender chest.
4. Die with things in it: they don't drop; they're there after respawning.
5. LAN: open to LAN, join from a second tab. The guest opens the same chest: its own empty slots; the host sees the lid
   up while the guest looks in. The guest puts something in, closes the tab, joins again with the same name: it's
   still there. Save and quit the host world (a world made from the title screen), reopen, open to LAN, the guest
   joins: still there.

---

## M1: signs and hanging signs

Oak, spruce, birch, jungle, acacia, dark oak, mangrove, cherry, bamboo, crimson and warped: a standing sign (16
rotations), a wall sign, a hanging sign (straight chains, or a vee of chains when `attached`, 16 rotations) and a wall
hanging sign for each, all waterloggable: 44 blocks, 22 items.

- **Blocks** (`src/world/blocksSigns.ts`): vanilla's properties, shapes (standing 4..12 column; wall 4.5..12.5 against
  the wall; hanging 14×10 board square to the world or the 10×16 square when turned between; wall hanging bracket
  plus board, the bracket being the only collision), hardness 1, axe, map colour of the planks, lava lights the
  overworld woods' (vanilla `ignitedByLava`), not the nether ones'. Sounds: signs sound as their wood (`wood`,
  `cherry_wood`, `bamboo_wood`, `nether_wood`); hanging signs have vanilla's four hanging-sign sound types
  (`hanging_sign`, `nether_wood_hanging_sign`, `bamboo_wood_hanging_sign`, `cherry_wood_hanging_sign`).
- **Placing** (`src/game/signs.ts`, vanilla `StandingAndWallBlockItem`/`SignItem`/`HangingSignItem`): tried in the
  order the player looks; standing on anything legacy-solid (signs and banners count, vanilla `forceSolidOn`), on a
  wall's solid face, under a block whose underside's centre is sturdy (a bottom slab yes, a top slab no), under a
  fence or a hanging sign; sneaking or a partial underside gives the vee (`attached`), turned to any of 16; a hanging
  sign held to another's underside chains under it square and straight on; a wall hanging sign goes across the face
  clicked and needs something to hang from along its bracket (a sturdy face or another wall hanging sign on the same
  axis). Standing, wall and ceiling signs break when their support goes; a wall hanging sign stays (as in vanilla).
- **Editor** (`src/gui/screens/signEdit.ts`, vanilla `SignEditScreen`/`HangingSignEditScreen`): opens on placing
  (front) and on right-click (the side the player is on: vanilla `isFacingFrontText`), 4 lines no wider than 90 px
  (60 px on a hanging sign), cursor blink, selection, Ctrl+A/C/V/X, Home/End, arrows, Up/Down/Enter between lines, Done;
  the sign drawn big behind the text at vanilla's scales (a standing sign's board and stick, a wall sign's board 35 px
  lower, a hanging sign's 16×16 picture at 4.5×). While typing, the sign in the world shows what is typed (in this game
  only). It closes when the sign goes or the player walks out of reach.
- **Writing** (vanilla `ServerGamePacketListenerImpl.handleSignUpdate` → `SignBlockEntity.updateSignText`): taken only
  from the player the sign is open for, within reach + 4 blocks, not waxed, exactly 4 lines of at most 384 characters;
  formatting codes (`§x`) and control characters are stripped. Nobody else can open a sign while it is being edited.
- **Dyes, ink, wax** (vanilla `SignApplicator`): any of the 16 dyes colours the side the player is on (only if it has
  text), glow ink sac makes it glow, ink sac undoes the glow, honeycomb waxes the sign (with the wax particles and
  sound; a waxed sign can't be edited or dyed and knocks with `block.sign.waxed_interact_fail`). The item is used up
  except in creative; each fires the `block_change` game event. **Glow and Behold!** (`husbandry/make_a_sign_glow`)
  is now earned (it was `never`).
- **Rendering** (`src/render/signRenderer.ts`, vanilla `SignRenderer`/`HangingSignRenderer`): the models at vanilla's
  sizes and transforms with procedural 64×32 textures per wood; text in the game font at vanilla's scale and offsets
  (lines 10 apart and 90 wide on a sign, 9 and 60 on a hanging sign; a line too wide is cut as `Font.split` cuts it);
  dark text colour = 0.4 × the dye's; glowing text full-bright with the 8-way outline within 16 blocks (always for
  black, whose outline is cream `0xF0EBCC`); both sides drawn; within the block-entity view distance (64).
- **Items, recipes, creative**: stack of 16; 6 planks + stick → 3 signs; 2 chains + 6 stripped logs/stems → 6 hanging
  signs (the bamboo ones have no recipe here because bamboo planks and the stripped bamboo block don't exist yet; they
  are still in the creative tab and in loot); fuel 200 / 800 ticks (none for crimson and warped); recipe-book groups
  `wooden_sign` / `hanging_sign`; all 22 in the Functional Blocks tab in vanilla's order where the oak sign was.
- **Saving**: the chunk's block entities, as vanilla's NBT keys (`front_text`/`back_text` as
  `{"messages","color","has_glowing_text"}` and `is_waxed`); a damaged save is cleaned up on load (lines cleaned, cut to
  384, padded to 4; unknown colour → black).
- **Multiplayer**: guests see signs and text (they come with the chunk, and every change is sent as block-entity data);
  a guest who places or clicks a sign gets its editor on its own screen (the host sends the block, its text, then
  `CB.OpenSignEditor`, as vanilla's `ServerPlayer.openTextEdit` does); the guest's Done sends `SB.SignUpdate`, which the
  host checks as above before writing and broadcasting. Malformed packets (a line over 384, wrong field count or
  types, out-of-world positions) disconnect the guest with a reason.

**New files**: `src/world/blocksSigns.ts`, `src/world/signBlockEntity.ts`, `src/game/signs.ts`,
`src/gui/screens/signEdit.ts`, `src/render/signRenderer.ts`, `src/textures/signs.ts`, `src/item/itemsSigns.ts`,
`src/inventory/recipesSigns.ts`, `src/audio/gen/signs.ts`; tests `tests/survival-blocks/signs.mjs`,
`tests/survival-blocks/signs-mp.mjs`.

**Shared files touched** (each a registration line or a few lines, marked `(signs)`):
`src/world/blocks.ts` (`registerSignBlocks()`), `src/item/item.ts` (`registerSignItems`), `src/textures/blocks.ts`
(bamboo planks/stripped block textures if missing), `src/textures/items.ts` (hanging sign icons),
`src/inventory/recipes.ts` (`registerSignRecipes`), `src/inventory/recipeBook.ts` (`hanging_sign` group before
`wooden_sign`), `src/gui/screens/creative.ts` (tab order), `src/audio/synth.ts` (`signSounds`), `src/game/level.ts`
(`import './signs'`), `src/game/banners.ts` (`legacySolid` also true for signs), `src/game/shapeUpdates.ts` (wall
posts: hanging signs aren't in `#wall_post_override`), `src/game/advancements.ts` (Glow and Behold! criterion),
`src/render/entityRenderer.ts` (`DrawState.polygonOffset`, vanilla's text layering), `src/render/entityRenderers.ts`
(calls `SignRenderer`), `src/gui/screens/index.ts` (`installSignScreens`), `src/gui/screens/book.ts` (exports its text
field helpers), `src/net/protocol.ts` (`SB.SignUpdate = 40`, `CB.OpenSignEditor = 80` with validators),
`src/net/config.ts` (`PROTOCOL_VERSION` 6 → 7, the branch's one bump), `src/net/server/session.ts`,
`src/net/server/hostServer.ts` (`openSignEditor`), `src/net/client/clientSession.ts` (`signUpdate`).

**Hooks**: `setSignEditorHook(f)` (game/signs.ts; the GUI installs it, routing a guest's player's editor to
`HostServer.openSignEditor`), `setSignPreview` / `signTextShown` (editor preview), `setSignScopingHook(f)`
(render/signRenderer.ts; the spyglass makes glow outlines visible at any distance: wired in M4).

**Deviations and open points**
- Bamboo signs and hanging signs have no crafting recipe: bamboo planks and the stripped bamboo block aren't in the
  game yet. Their particle textures are drawn only if nothing else registers them.
- The update's distance check is applied to every kind of sign (vanilla's `playerIsTooFarToEdit` covers the same).
- Clicking a sign never runs commands (no click events in this game's text).
- The line cut uses the game font's advances (vanilla `StringSplitter`); formatting isn't supported, so lines are
  plain text.
- The hanging signs' sounds are generated as the wood's sound mixed with a chain's rattle (vanilla has its own
  recordings).
- The pre-existing thin orange seam lines visible in some screenshots of the test stage appear without any sign too
  (a renderer artefact unrelated to this work).

**Tests**: `tests/survival-blocks/signs.mjs` (120 checks: blocks, items, recipes, placing, survival, writing and its
refusals, sides, dyes/glow/ink/wax, the advancement, save/load, text layout, the editor's keys) and
`tests/survival-blocks/signs-mp.mjs` (59 checks: guest places → its editor opens on its screen → host validates and
broadcasts; another guest can't write meanwhile; dyes/glow/ink/wax from a guest; back side; too far; hanging sign; the
host's own player editing; a late joiner sees text; malformed packets). Existing suites re-run after the change:
`tests/menus/banners.mjs`, `tests/multiplayer/m1-login.mjs`, `m1-security.mjs`, `m1-transport.mjs`, `m1-blocks.mjs`,
`m2-actions.mjs`: all pass. `npm run typecheck` clean.

**Try it** (`npm run dev`, then http://localhost:5173/?seed=12345):
1. Creative: the Functional Blocks tab lists every wood's sign and hanging sign after the tinted glass.
2. Place an oak sign on the ground: the editor opens; type 4 lines (try a too-long line, arrows, Ctrl+A), Done. The
   text faces you. Walk round: the back is blank; right-click from behind edits the back.
3. Put one on a wall, on another sign, under a block (straight chains), under a fence or while sneaking (vee of
   chains), on the side of a block (wall hanging sign), under a hanging sign (it chains). Break the block under/behind
   each: they drop, except the wall hanging sign.
4. Right-click written text with red dye, a glow ink sac (glows, outlined), an ink sac (stops), honeycomb (wax
   particles; now clicking only knocks). Get "Glow and Behold!".
5. In a world made from the title screen (the `?seed=` quick-start world is never saved): save and quit, reopen:
   text, colours, glow and wax are still there.
6. LAN: open to LAN, join from a second tab (`?join=<code>` or `?mp=join`). The guest places a sign: the editor opens
   on the guest's screen; after Done the host sees the text. While one edits, the other's click does nothing. A guest
   who joins later sees all the signs' text.
