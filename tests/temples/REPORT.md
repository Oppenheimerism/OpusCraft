# Temples: report

## 1. Branch and milestones

Branch: `claude/stoic-johnson-waevai` (from main at 5dfd44d).

| Milestone | State | Commits |
|---|---|---|
| M1 desert pyramid and swamp hut | done | 9aa2261 Desert pyramids and swamp huts: sandstone pyramids in the desert with four chests over a TNT trap … |
| M2 redstone components | done: dust, torches, repeaters (M2a), tripwire (M2b), dispensers and droppers (M2c), pistons (M2d) | 74b9613 Redstone dust, redstone torches and repeaters: …; ef67ff5 Tripwire hooks and string: …; 18b3665 Dispensers and droppers: …; 73f0c79 Pistons and sticky pistons: … |
| (merge) | main merged in (strongholds, silverfish, wolves); conflicts resolved keeping both sides | 9593ea6 Merge strongholds, silverfish in infested stone, and wolves from main into the temples branch |
| M3 igloo and jungle temple | done | "Jungle temples and igloos: …" (see `git log`; the commit after 9593ea6) |
| M4 archaeology | not started | |

## 2. Shared files changed (all additive hooks)

- `src/world/gen/generator.ts`: builds `this.temples = new Temples(...)` next to the villages and hands it to the decorator.
  `firstFreeHeight(x, z, oceanFloor = false)` gained the flag (OCEAN_FLOOR_WG: water doesn't stop the scan), for the
  pyramid's height; the one changed line is the aquifer check at the end of the loop.
- `src/world/gen/features.ts`: `Decorator.temples` field, and `this.temples?.place(ctx)` just before `this.villages?.place(ctx)`
  in the SURFACE_STRUCTURES step.
- `src/game/spawner.ts`: in `mobsAt`, after the nether fortress check: `const o = structureMobsAt(this.level, cat, x, y, z); if (o) return o;`
  (a structure's spawn_overrides, generic: `src/game/structureSpawns.ts` has `registerSpawnOverrides({ overrides: { monster: { boundingBox: 'piece' | 'full', spawns } }, startsAt })`;
  the pillager outpost's `full` override can register there too).
- `src/game/commands.ts`: in `locate`, a block inserted after `const x = ..., z = ...;` that handles the temple ids and returns
  (`templeKind(name)` / `locateTemple(...)` from `src/game/temples.ts`); nothing else in the command changed.
- `src/game/loot.ts`: `chests/desert_pyramid` added after `chests/nether_bridge` (under a `// temples` comment).
- `src/world/gen/structure.ts` (not on the shared list, but used by fortresses and mineshafts): `transformState` now also
  does what vanilla's `mirror`/`rotate` do to stair shapes (`STAIR_FLIP`: left/right swapped when a z-facing stair is
  mirrored) and to `axis`. (Main has since added the side properties and door hinges itself; at the merge I kept main's
  lines and dropped my copies, so each is done once; only the comment on main's side-property block names vines,
  tripwire and redstone wire too.) Fortresses and mineshafts only place default states of those blocks, so they're unchanged.

New files: `src/world/gen/temples.ts` (placement of all four kinds), `templePiece.ts` (ScatteredFeaturePiece and helpers),
`desertPyramid.ts`, `swampHut.ts`, `src/game/temples.ts` (main-thread locator), `src/game/structureSpawns.ts`.

M2 (all additive):
- `src/world/blocks.ts`: `registerRedstoneComponents()` (new file `src/world/blocksRedstoneComponents.ts`) right after `registerRedstoneBlocks()`.
- `src/game/blockBehavior.ts`: three optional hooks on `BlockBehavior`: `setPlacedBy`, `playerWillDestroy`, `triggerEvent` (block events, for pistons).
- `src/game/interaction.ts`: calls `playerWillDestroy` just before `level.destroyBlock` in `destroyBlock`, and `setPlacedBy` after `setBlock` in `commitPlace`.
- `src/game/level.ts`: `willTickThisTick(x, y, z, block)`; `updateNeighborsAt(x, y, z, source, skip = -1)` (vanilla updateNeighborsAtExceptFromFacing).
- `src/render/mesher.ts`: `case 'redstone'` in `tintFor` (dust colour by power, `src/world/redstoneColor.ts`).
- `src/item/item.ts`: `blockForItem`: redstone places `redstone_wire`, string places `tripwire`; a small loop before `itemForBlock` giving the redstone torch, repeater and tripwire hook items their flat sprites.
  (The comment on the crossbow's `reg` line still says it can't be crafted; I left that line alone, since the illager
  work may touch it. It can be crafted now.)
- `src/audio/synth.ts`: `Object.assign(SOUNDS, redstoneSounds(SOUNDS))` after `SOUNDS` (`src/audio/gen/redstone.ts`).
- `src/textures/blocks.ts`: `registerRedstoneTextures(T)` after `registerVillageTextures(T)` (`src/textures/blocklib/redstone.ts`).
- `src/inventory/recipes.ts`: redstone torch, repeater and tripwire hook after the redstone lamp; the crossbow's
  "left out" comment replaced by its recipe. `src/gui/screens/creative.ts`: `REDSTONE_ORDER` extended.
- `src/game/redstone/components.ts`: imports `./wire`, `./torch`, `./repeater`, `./tripwire`, `./dispenser` (new files; `support.ts` is vanilla isFaceSturdy).
- `src/world/blockEntity.ts`: `registerBlockEntityType(name, make)`, looked up first in `createBlockEntity` (the dispenser
  and dropper register theirs from `src/game/redstone/dispenser.ts`; the pistons' moving block will too).
- `src/game/villageBlocks.ts`: `isCompostable(id)` exported (the dropper asks before it puts something in a composter).
- `src/gui/screens/index.ts`: `installDispenserScreen(game)` after `installJobSiteScreens(game)` (new
  `src/gui/screens/dispenser.ts`, `src/inventory/dispenserMenu.ts`, GUI texture in `src/textures/redstoneGui.ts`).
- `src/inventory/recipes.ts`: dispenser and dropper after the tripwire hook.
- New `src/entity/thrownExperienceBottle.ts`: bottles o' enchanting are now thrown (by players too) and leave experience.
- Pistons (M2d):
  - `src/game/level.ts`: vanilla block events — `blockEvent(x, y, z, block, a, b)` queues one (once each), `runBlockEvents()`
    runs them after the random ticks (new ones too, unloaded ones wait) through the block's `triggerEvent`;
    `handlingTick` (true during scheduled ticks and block events); `UPDATE_MOVE_BY_PISTON = 64`, and `setBlock` now
    passes `moving` (that flag) to `onRemove`/`onPlace` instead of always false.
  - `src/entity/entity.ts`: `DYNAMIC_COLLISION[blockId]` (collision from more than the state: a moving piston's comes from
    its block entity), consulted in `collisionBoxes` only where `COLLISION[st]` is null; a `pistonMoving` flag that keeps
    `maybeBackOffFromEdge` out of a piston's push (vanilla only backs off for MoverType.SELF/PLAYER).
  - `src/game/blockRules.ts`: `blockDrops(..., harvest = true)`: false skips the "needs the right tool" check (vanilla
    requiresCorrectToolForDrops only applies to a player's harvest; a piston breaking a lantern drops it).
  - `src/game/fluidTicks.ts`: `holds` refuses `moving_piston` (vanilla forceSolidOn: water doesn't flow into it).
  - `src/game/blockBehavior.ts`: optional `cloneItem(state)` hook (vanilla getCloneItemStack); `src/game/interaction.ts`
    `pickBlock` asks it first (a sticky piston's head picks a sticky piston).
  - `src/render/entityRenderers.ts`: `this.pistons.render(...)` right after `this.village.render(...)` (new
    `src/render/pistonRenderer.ts`).
  - `src/game/redstone/components.ts`: `import './piston'` (new `src/game/redstone/piston.ts`); recipes for the piston and
    sticky piston after the dropper; piston textures in `src/textures/blocklib/redstone.ts`; the two piston sounds are
    synthesized in `src/audio/gen/redstone.ts`.

M3 (all additive):
- `src/world/gen/temples.ts` (mine): `TEMPLE_KINDS` gains `igloo` and `jungle_pyramid`; two `case`s in the layout.
- `src/game/temples.ts` (mine): `minecraft:igloo` and `minecraft:jungle_pyramid` in the `/locate` ids.
- `src/game/loot.ts`: `chests/igloo_chest`, `chests/jungle_temple` and `chests/jungle_temple_dispenser` right after
  `chests/desert_pyramid` (main's stronghold tables follow them).
- New files: `src/world/gen/jungleTemple.ts` (JungleTemplePiece), `src/world/gen/igloo.ts` (the three templates and
  IglooPieces). `tests/temples/lib.mjs` gained `pieceLevel` (pieces placed chunk by chunk into a flat world with a Level).
- The merge of main (9593ea6): conflicts in `src/audio/synth.ts`, `src/game/loot.ts`, `src/world/gen/features.ts` and
  `src/world/gen/generator.ts` were side by side additions (my temples and redstone next to main's strongholds,
  silverfish and wolves); both sides kept.

## 3. Open points

- **Heights.** Vanilla moves a pyramid to the lowest OCEAN_FLOOR_WG under it (minus 0-2) and a hut to the mean
  MOTION_BLOCKING_NO_LEAVES under it, reading the chunk being decorated. Chunk workers generate chunks in any order, so
  here both are worked out from the bare noise terrain (`firstFreeHeight`, exact per column) when the temple is laid
  out, the same in every worker and on the main thread. Differences from vanilla: carver holes and lakes under a
  temple don't count. The pyramid's 0-2 drop is drawn from the start's large-feature random after the orientation.
- **Randoms.** Placement, orientation and the pyramid's suspicious-sand choice / collapsed-roof spot are vanilla's
  randoms (salted/large-feature/positional LegacyRandom). The per-chunk decoration random (chest loot seeds) is the
  codebase's usual hash-seeded `Rand`, not vanilla's Xoroshiro feature seed; the terrain isn't vanilla's anyway.
  `level.getRandom()` (cellar stairs' sand/sandstone, collapsed roof mix) is a positional random per chunk, so, as in
  vanilla, the two blocks of the cellar stairway can differ across a chunk border.
- **Swamp huts have no lowest-Y rule**: vanilla's SwampHutStructure isn't a SinglePieceStructure (huts stand in water).
  The brief listed the rule for both; I followed vanilla.
- **Suspicious sand (hook):** `placeSuspiciousSand` in `desertPyramid.ts` (marked `HOOK(archaeology)`) places plain sand
  until M4. The 5-7 chosen spots and the roof spot are already worked out as vanilla does.
- **Cats (hooks):** `SwampHutPiece.spawnCat` and the creature override in `structureSpawns.ts` (`HOOK(cats)`).
- **Dune armor trim template** is in the loot table (weight 1 vs 6 empty, count 2) but rolls nothing until the item exists
  (the existing convention).
- Structure order in the step: vanilla goes by name (desert_pyramid, igloo, jungle_pyramid, pillager_outpost, …,
  swamp_hut, village_*); temples are placed together just before villages.
- **Sturdy faces.** The redstone components use vanilla's isFaceSturdy from the collision shape (`support.ts`), so dust,
  torches and repeaters go on glass as in vanilla. The game's existing `isSturdyFace` (blockRules) only reads the
  occlusion bits, so plain torches and levers still can't go on glass; I left that alone.
- **Dust.** Vanilla's per-direction `updateShape` is done for all sides at once (same results); dust's neighbour
  updates walk the seven positions in java.util.HashSet order, as vanilla does. The overlay texture
  (redstone_dust_overlay, fully transparent in vanilla) is left out of the models.
- **Tripwire.** As vanilla 1.21, including its quirks: breaking string without shears trips the line for one look (the
  hooks click on, then off 10 ticks later as they let go; the detach sound only plays when the power didn't change),
  cutting it with shears disarms it first so the hooks just let go; hooks reach 41 blocks (40 pieces of string); only
  string still there gets its `attached` changed (1.20.2+, no string duplication). Every entity in the string's shape
  presses it (vanilla's `isIgnoringBlockTriggers` is false for all of them). The models are my own, after vanilla's:
  the hook's arm is raised while loose, level with the string when attached and dipped when tripped, with the end of
  the string running into its ring; string lies at 1.5 px, taut rows of the texture when attached. Both blocks use the
  default (stone) sounds, as vanilla's Properties.of() does.

- **Dispensers and droppers.** As vanilla 1.21.0: triggered 4 ticks after power arrives (at it or, by
  quasi-connectivity, at the block above it, noticed on its next update), once per rising edge; a random filled slot
  (vanilla's reservoir sampling); empty, the higher click. Behaviours for everything the game has that vanilla
  dispenses: arrows (tipped ones keep their potion), tridents, snowballs, eggs, splash and lingering potions, bottles
  o' enchanting, fire charges, spawn eggs, boats and chest boats, minecarts and chest minecarts, TNT, water and lava
  buckets (waterlogging what can hold water), empty buckets (sources and waterlogged blocks), glass bottles, water
  bottles (dirt, coarse and rooted dirt to mud), flint and steel (fire, portals, campfires, TNT), bone meal, shears
  (sheep), armour, carved pumpkins (iron golems, else onto a head) and saddles (pigs, striders); anything else is
  thrown out. Shields go into an off hand once the shield item exists (another branch). Buckets and bottles fill as
  1.21.0 does (the full one into the first empty slot, else thrown out), and vanilla's second click when a boat,
  minecart, full bucket or potion falls back to being thrown out is kept. The dropper puts one item at a time into the
  container in front (chests, barrels, dispensers, droppers, furnaces by face, brewing stands by face, composters from
  above, chest minecarts and chest boats), as a hopper would, silently, and keeps it if it won't go in; otherwise it
  throws it out like a dispenser. Deviations: a mob from a spawn egg is finalized as a spawn egg's (the game has no
  "dispenser" spawn reason); horse armour is just thrown out (vanilla would hand it to an empty-handed player's main
  hand, or a zombie's body slot; there are no horses); no custom names ("Dispenser"/"Dropper" always). Things the game
  doesn't have yet (fireworks, wind charges, shulker boxes, heads, armour stands, honeycomb, respawn anchors, beehives,
  fish and powder snow buckets, horses and llamas) aren't dispensed specially.

- **Pistons.** As vanilla 1.21.0 (PistonBaseBlock, PistonHeadBlock, MovingPistonBlock, PistonMovingBlockEntity,
  PistonStructureResolver): power at any side but the front, or by quasi-connectivity at the block above (noticed on
  the piston's next update), queues a block event; the push moves up to 12 blocks and breaks the PushReaction DESTROY
  ones in the way (dropping their loot, with break particles and no sound); obsidian, crying obsidian, unbreakable
  blocks, BLOCK ones (anvils, grindstones, heads, moving blocks), extended pistons and blocks with a block entity
  (chests, furnaces, dispensers, banners…) don't move; a sticky piston pulls one NORMAL block (or a retracted piston)
  back, and a short pulse (the pushed block still moving: TRIGGER_DROP) leaves it behind. The moving block entity
  goes half a block a tick and puts its block down on the third tick after the event (reshaped to its new neighbours;
  one that can't stay there breaks, a waterlogged one comes out dry), pushing entities in its way (each at most 0.51 a
  tick along an axis, however many pistons; area effect clouds and flying players are left alone; entities on a block
  pushed sideways aren't carried). Its collision is the block where it has got to, not in the way of what it's pushing;
  a retracting piston's base stays solid. Breaking a head breaks the piston (dropping it; in creative without), a
  piston broken takes its head. Block PushReactions are a table after vanilla's Blocks.java (in `piston.ts`).
  Deviations and hooks: slime and honey blocks don't exist yet — the structure resolver already branches through them
  (by name) but their effects on entities (slime launching, honey carrying) are left for when they're added; there's no
  world border to check; game events (BLOCK_ACTIVATE etc.) aren't sent (no sculk); moving blocks are drawn with the
  light where they came from and the chunk meshes' face shading, without ambient occlusion. This game ticks entities
  before the scheduled ticks and block events (vanilla after); pistons keep to the game's order. Nothing special is
  done for zero-tick pulses (block events run in vanilla's order, new ones in the same pass, so what follows from that
  ordering happens as in vanilla). The item model is vanilla's piston_inventory (the platform on top).

- **Jungle temple.** JungleTemplePiece block for block as I know vanilla's (the storeys, roof, stairs, cellar, both
  traps, the puzzle; MossStoneSelector: each stone block 40% cobblestone, else mossy, drawn in vanilla's y, x, z
  order; the vines). As in vanilla, the pieces with orientation south or west are mirrored, which puts the levers the
  other way round: facing the levers, the solution is left, right, right, left with orientation north or east and
  right, left, left, right with south or west; either way it's the lever furthest from the stairs, the nearest, the
  nearest back, the furthest back. The height is the mean MOTION_BLOCKING_NO_LEAVES height over the box from the bare terrain
  (as the hut's; see Heights), and SinglePieceStructure's lowest-Y rule over 12 x 15 applies. The cellar (y -4 to -1)
  is below the piece's box, as in vanilla. Vanilla's placedMainChest/placedHiddenChest/placedTrap1/placedTrap2 flags
  aren't kept: the temple always lies within its start chunk, and a chest or dispenser is only placed in the chunk
  that holds it and where there isn't one already (vanilla createDispenser's check). Chest and dispenser loot seeds
  come from the per-chunk random (see Randoms).
- **Jungle temple loot:** bamboo and the wild armor trim template (count 2, weight 1 vs 2 empty) roll nothing until the
  items exist.
- **Igloo templates.** Vanilla's igloo/top, igloo/middle and igloo/bottom can't be shipped; `igloo.ts` authors them
  block by block as I remember them, checked against the wiki's descriptions: the dome (7 x 5 x 8: two ice windows, a
  red bed, a furnace, a crafting table, a redstone torch on the back wall, white carpet over the trapdoor), the shaft
  segment (3 x 3 x 3, a ladder, some infested stone bricks) and the basement (7 x 6 x 9: a table of upside-down spruce
  stairs with the brewing stand and a potted cactus, a water cauldron at level 2, the chest, red carpet, two wall
  torches, two cells behind iron bars). Values I wasn't sure of: which bricks are infested, the torches' and carpet's
  exact places, the brewing stand's potion in its first bottle slot, the villagers' facing (turned with the piece).
  Followed exactly: IglooPieces' random draws (the turn, the 50% basement, 4-11 segments), pivots and offsets, the
  pieces' order, the ground rule (WORLD_SURFACE_WG at the dome's doorstep, the dome's floor replacing the top block),
  the chest's data marker (air, and chests/igloo_chest in the chest under it), and the trapdoor turned into a snow
  block when the block under it is neither air nor a ladder. Vanilla reads the height as each piece is placed; here
  it comes from the bare terrain (see Heights), the same value for every piece.
- **Igloo sign (hook):** the sign on the wall between the cells (with arrows pointing to each) is left out: the game
  has no sign blocks yet (`HOOK(signs)` in `igloo.ts`).
- **Igloo villagers:** a plains villager and a plains zombie villager without a profession, persistent, loaded from
  the template's entities through the existing entity loading (villager.ts and zombieVillager.ts untouched).

## Work in progress (next steps, for the next session or after a context compaction)

- **M4**: archaeology for the desert pyramid (the brush, suspicious sand and gravel, archaeology/desert_pyramid, sherds,
  decorated pots, then the pyramid's suspicious sand in place of the `HOOK(archaeology)` plain sand).

## 4. Tests

Run with `node tests/temples/<file>.mjs` (Node 22, after `npm ci`).

- `tests/temples/m1.mjs`: **81 passed, 0 failed.** Placement (biomes, one per region in its 24 x 24 window, the lowest-Y
  rule with a made-up terrain, the real seed 12345), both pieces in all four orientations (key blocks, same layout
  whichever way they face, chests facing into the room, stairs turned right), the loot table (4000 chests), the TNT trap
  in a real generated pyramid with a ticking Level (a zombie on the plate sets off all nine TNT; an item doesn't), the
  witch, the hut's spawn override through `NaturalSpawner.mobsAt`, `/locate` through `executeCommand`, and the cost
  (≈ the same ms per chunk with and without temples; looking up nearby temples is cached).
- `tests/temples/m2.mjs`: **46 passed, 0 failed** so far. Dust (power 15 down to 0 along a line, connections, the end
  of a line drawn through, cross/dot on right-click, a dot staying a dot, steps up and down a block, a block over the
  lower dust cutting the step, on glass but not on a bottom slab, popping off without a floor, what it powers: the lamp
  under it and the one it points into, not one beside it); torches (standing and wall placement, light 7, out 2 ticks
  after its block is powered and lit 2 ticks after, strongly powering the block above, burning out after 8 toggles in
  60 ticks with the fizz and smoke, relighting later); repeaters (placement facing, delays 1-4 exactly 2-8 ticks,
  output 15 from an input of 1, no input from the side, right-click cycling, locking by a powered repeater into its
  side and not by dust).
- `tests/temples/m2b-tripwire.mjs`: **47 passed, 0 failed.** Hook placement (on a wall facing away from it, not on a
  bare floor, on the wall when clicking the floor beside it, dropping off without its wall), string (placed by the string
  item, in mid-air, joining up), drops, attaching (not with a gap, both hooks and all the string when the last piece goes
  in, the attach sound, not side by side or to a hook facing away, 41 apart yes and 42 no), tripping (an item falling on
  it, both hooks' strong and weak power lighting lamps, the click sounds, staying on while something's there, letting go
  within 10 ticks, a zombie, loose string), breaking the string (trips, then lets go at the next look, the rest goes
  slack), shears (no trip, detach sounds, the cut piece not put back), a disarmed piece, a broken hook, and the recipes
  (two hooks; the crossbow).
- `tests/temples/m2c-dispenser.mjs`: **111 passed, 0 failed.** Placement (facing the player, up and down), the block
  entity (nine slots, saved and loaded with its loot table), hardness, drops and spilling when broken; triggering (4
  ticks after power, once while held, again after the power goes, quasi-connectivity needing an update, a lever, the
  empty click), the random slot (3000 draws over three slots); dropping (position, speed, sound, smoke, facing down);
  arrows (position 0.7 out and 0.1 up, speed, pickup), tipped arrows, tridents, snowballs, eggs, potions, the bottle o'
  enchanting's experience, fire charges; spawn eggs (on a slab too), TNT, boats (on water, over water, thrown out on
  land with two clicks), chest boats, minecarts (on and over a rail, thrown out without); buckets (water, lava onto
  grass, waterlogging stairs, picking water up with one or several buckets, no free slot, flowing water, at stone),
  glass bottles, water bottles to mud; flint and steel (fire, TNT, a campfire, nothing to light, worn out), bone meal,
  shears; armour onto a zombie and a player, a carved pumpkin on a head and on an iron T (a golem), saddles; the
  dropper into a chest (one at a time, merging, silent, keeping it when full), into nothing, another dropper, a
  furnace from the side and above, a brewing stand, a composter, a chest minecart; the loot table rolled on firing and
  on opening; the menu (slot layout, shift-click both ways, reach, broken); the recipes. Also checked in the browser
  (headless Chromium): both blocks in every facing, water poured and arrows fired by power, both screens.
  (The projectile speed bounds were widened in M2d to the whole spread, 0.97-1.23: they failed about one run in a
  hundred.)
- `tests/temples/m2d-piston.mjs`: **149 passed, 0 failed.** The blocks (hardness, drops, items, not conductors, shapes of
  the base, head and short head, no shape or mesh for the moving block, light), textures and sounds; placement facing;
  power from behind, beside, under and on top but not in front; quasi-connectivity (from two above and diagonally,
  only on an update, both ways); the event and the moving blocks' timing, block entities and states; 12 blocks yes,
  13 no; what won't move (obsidian, bedrock, chests, furnaces, anvils, banners, extended pistons, heads, the world's
  top and bottom) and what will (glass, fences, carpets, TNT, a retracted piston…); breaking torches, flowers, water,
  lanterns, cobwebs, snow, dust, repeaters, buttons, plates, pumpkins, melons, beds (both halves, one bed), fire and
  leaves, with doTileDrops off too; retracting (head gone at once, base moving, the contract sound); sticky pulls (one
  block of a line; not obsidian, flowers, chests or anvils; a piston yes; downwards); the short pulse leaving the
  block, changes of mind before the event, events queued once; a repeater's tick setting a piston off the same tick;
  power moved with a redstone block, TNT primed, sand falling, a carpet breaking, waterlogged blocks drying, torches
  popping off; entities pushed along and lifted (not carried sideways, not flying players or clouds; the 0.51 limit);
  collision of the moving head and a retracting base; the head (breaking either part, creative, needing its piston,
  pick-block); water kept out of a moving block; saving the moving block entities; the recipes. Also checked in the
  browser (headless Chromium): pistons in every facing, extended and not, sticky faces, blocks mid-push (a grass block
  keeps its colour) and mid-pull, the inventory icons.

- `tests/temples/m3a-jungle-temple.mjs`: **124 passed, 0 failed.** Placement (in an all-jungle world one temple per
  region in its 24 x 24 window; bamboo jungles too; not sparse jungles, plains or deserts; its own salt), the lowest-Y
  rule over 12 x 15 (a low corner at (x + 12, z + 15) rules it out, one past the footprint doesn't), the floor at the
  average ground height, inside its start chunk; seed 12345's temples all in jungles above sea level. In all four
  orientations: the foundation and the 40/60 moss mix, the entrance stairs and the stairway down, both traps (hooks,
  string, dust, the dispensers and the vines over them), the puzzle (levers on chiseled stone bricks, sticky pistons,
  the repeater and dust), both chests and both dispensers with their loot tables and loaded as block entities; and in
  a ticking Level: a zombie in each trap's string makes its dispenser shoot an arrow along the passage or across the
  room (arrows from its loot), and the levers in order (far, near, near back, far back) open the ground floor over the
  hidden chest. The wrong order (near, far, far, near) leaves a hole a block deep; the middle lever works nothing. The
  three loot tables (the enchanted book, bamboo rolling nothing, the arrows), `/locate`, and the real temple nearest
  0,0 for seed 12345 generated as the chunk workers do it.
- `tests/temples/m3b-igloo.mjs`: **84 passed, 0 failed.** Placement (in an all-snowy-plains world one per region in its
  window; snowy taigas and slopes too; not plains, taigas, frozen peaks or ice spikes; no lowest-Y rule; its own salt);
  the layout over 256 igloos (about half with basements, all four turns, all of 4-11 segments; vanilla's piece order;
  the dome's floor at the ground's top at its doorstep; the segments stacked without a gap; trapdoor, shaft and ladder
  in one column). In all four turns: every template block placed and turned across the chunks it spans, the dome
  sealed but for its doorway, the bed, crafting table, furnace (with its block entity), ice windows and torch, the
  ladder from the trapdoor to the basement floor, infested bricks, the brewing stand with its splash potion of
  weakness, the potted cactus, cauldron and chest (chests/igloo_chest, the data marker gone to air), bars, rug and
  torches, the villager and zombie villager (plains, no profession, persistent) each shut in its cell. Without a
  basement: a snow block in the trapdoor's place, or the trapdoor over a hollow. Loading both mobs; curing: the
  thrown potion from the brewing stand weakens the zombie villager and the golden apple from the chest starts the
  cure. The loot (always one golden apple, 2-8 of the rest), seed 12345, `/locate`, and the real igloo's block
  entities and mobs.
- Both M3 structures were also looked at in the browser (headless Chromium, seed 12345): the temple outside, both
  traps, the levers before and after, the hole and the hidden chest; the igloo outside, inside, and its basement with
  the two cells.

## 5. Browser checklist (seed 12345, `http://localhost:5173/?seed=12345`)

Coordinates from the locator (the start chunk's corner, as `/locate` prints it):

- **Desert pyramid** `/locate structure minecraft:desert_pyramid` → 5856, ~, 5936. Box x 5856-5876, z 5936-5956, floor at
  y 67, entrance on the north side (faces north). `/tp @s 5866 90 5925`.
  Look at: the two towers with the orange/chiseled patterns, the terracotta star in the hall (blue at 5866 67 5946),
  the shaft under it to the treasure room (y 56): four chests in alcoves, the stone pressure plate at 5866 56 5946 over
  TNT at y 54 (stepping on it must blow the room); the 5x5 patch of sand/sandstone in the hall floor at the south-east
  and the sand-filled cellar under it (y 63-66), reached by stairs hidden under sand. Open a chest: desert pyramid loot.
- **Swamp hut** `/locate structure minecraft:swamp_hut` → -4400, ~, -2928. Box x -4400 to -4394, z -2928 to -2920,
  y 63-69, porch and door on the south side. `/tp @s -4397 70 -2912`. Look at: the hut on oak stilts over water, the witch inside (it doesn't despawn),
  cauldron, crafting table, potted red mushroom. At night witches (and only witches) spawn inside the hut's box.
- **Jungle temple** `/locate structure minecraft:jungle_pyramid` → 544, ~, -3264. Box x 544-558, z -3264 to -3253, ground
  floor at y 120; orientation west, so the entrance (four stairs and the doorway) is on the east side:
  `/tp @s 562 122 -3259` and look west (the ground falls away there; fly). Look at: the cobblestone/mossy mix, vines,
  three storeys. Take the stairway down from the middle of the ground floor to the cellar (walking level y 117):
  - trap 1: string at x 550, z -3262 and -3261 (hooks at z -3263 and -3260); walking through it fires the dispenser
    hidden behind a vine at 557 118 -3261 west along the passage at you;
  - trap 2: string along z -3257 from x 554 to 556 (hooks at 553 and 557), right beside the chest at 555 117 -3256
    (jungle temple loot); stepping in it fires the dispenser behind the vines at 555 118 -3255 north over the chest
    and across the string (the dispensers hold arrows);
  - the puzzle: three levers at 546 118 -3256 / -3255 / -3254 on chiseled stone bricks. Standing at x 545 facing east
    (this temple is mirrored), flip right (z -3254) on, left (z -3256) on, left off, right off: the sticky pistons
    shuffle, and a block of the ground floor at 550 120 -3256 goes, opening the way down to the hidden chest at
    548 117 -3255. The wrong order (left, right, right, left here) only leaves a hole a block deep; the middle lever
    does nothing.
- **Igloo** `/locate structure minecraft:igloo` → -2320, ~, -2464. Dome x -2320 to -2314, z -2464 to -2457, floor at
  y 108, doorway on the north side (turned 0): `/tp @s -2317 109 -2463` (in the doorway) and look south. Inside: the
  red bed, crafting table, furnace, redstone torch, ice windows, white carpet. This one has a basement: break the third
  carpet in (at -2317 109 -2459), open the trapdoor under it and climb down the ladder (6 shaft segments, 23 rungs) to
  the basement (floor y 84): the brewing stand at -2315 86 -2459 with a splash potion of weakness, the potted cactus,
  the cauldron, the chest at -2318 85 -2459 (igloo loot, always a golden apple), red carpet, two torches, and behind
  iron bars the villager (west cell) and the zombie villager (east cell). Throw the potion at the zombie villager, break
  a bar and give it the golden apple: it shakes, and turns into a villager a few minutes later. Neither mob despawns.
- **Redstone dust** (craft or /give redstone): lay a line from a redstone block — it glows darker further out, 15
  blocks reach; right-click a lone piece: cross ↔ dot; it climbs the side of a block that has dust on top.
- **Redstone torch** (redstone + stick): on a block with a lever, it goes out when the lever is on; a torch clock
  (a torch powering its own block through dust) burns out with a fizz and smoke. Light level 7.
- **Repeater** (3 stone, 2 torches, redstone): right-click to set 1-4; a second powered repeater pointing into its side
  locks it (the bedrock bar shows).
- **Dispenser / dropper** (7 cobblestone round a bow over redstone / the same without the bow): placed, the mouth faces
  you (round for the dispenser, square for the dropper). Right-click: the 3x3 screen. Put in arrows, a water bucket,
  bone meal, a spawn egg, flint and steel, armour… and give it a pulse (a button): it clicks and uses one (arrows fly,
  water pours, the crop in front grows, the mob appears, a fire lights, a zombie in front puts on the helmet); empty,
  a higher click. A dropper facing a chest puts one item in per pulse, silently; facing nothing it throws it out.
  A redstone block diagonally above a dispenser doesn't fire it until a block beside it changes (quasi-connectivity).
- **Tripwire** (hooks: iron ingot, stick, planks; string): two hooks on blocks facing each other with string between
  (up to 40 pieces): they click and drop level as the last piece goes in. Walk through: they click, dip, and a lamp by
  either hook's block lights; out of it, they let go within half a second. Break a piece by hand: a short pulse, then
  the hooks rise; cut one with shears: no pulse. Throw an item on the string: it stays tripped while the item lies there.
- **Pistons** (3 planks, 4 cobblestone, iron ingot, redstone; sticky: slimeball on a piston): placed, the wooden face
  points at you. Put a lever or button beside it: it shoves out with a hiss-and-knock, pushing up to 12 blocks (13
  won't go; obsidian or a chest in the line stops it; a torch or flower in the way pops off); stand in front: you're
  pushed; stand on one facing up: you're lifted. Power off: the head slides back, a sticky one pulling its block with
  it (not obsidian, a chest or a flower). A redstone block two above a piston (or diagonally above) doesn't fire it
  until a block beside it is placed or broken (quasi-connectivity). Break the head: the piston drops.
