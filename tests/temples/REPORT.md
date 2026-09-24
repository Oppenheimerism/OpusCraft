# Temples: report

## 1. Branch and milestones

Branch: `claude/stoic-johnson-waevai` (from main at 5dfd44d).

| Milestone | State | Commits |
|---|---|---|
| M1 desert pyramid and swamp hut | done | 9aa2261 Desert pyramids and swamp huts: sandstone pyramids in the desert with four chests over a TNT trap … |
| M2 redstone components | partly done: dust, torches, repeaters (M2a); tripwire, dispensers/droppers, pistons to come | M2a: "Redstone dust, redstone torches and repeaters: …" (see `git log`) |
| M3 igloo and jungle temple | not started | |
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
  does what vanilla's `mirror`/`rotate` do to stair shapes (left/right swapped when a z-facing stair is mirrored), to
  north/east/south/west side properties (vines, tripwire, redstone wire), to `axis` and to door hinges. Fortresses and
  mineshafts only place default states of those blocks, so they're unchanged.

New files: `src/world/gen/temples.ts` (placement of all four kinds), `templePiece.ts` (ScatteredFeaturePiece and helpers),
`desertPyramid.ts`, `swampHut.ts`, `src/game/temples.ts` (main-thread locator), `src/game/structureSpawns.ts`.

M2 so far (all additive):
- `src/world/blocks.ts`: `registerRedstoneComponents()` (new file `src/world/blocksRedstoneComponents.ts`) right after `registerRedstoneBlocks()`.
- `src/game/blockBehavior.ts`: three optional hooks on `BlockBehavior`: `setPlacedBy`, `playerWillDestroy`, `triggerEvent` (block events, for pistons).
- `src/game/interaction.ts`: calls `playerWillDestroy` just before `level.destroyBlock` in `destroyBlock`, and `setPlacedBy` after `setBlock` in `commitPlace`.
- `src/game/level.ts`: `willTickThisTick(x, y, z, block)`; `updateNeighborsAt(x, y, z, source, skip = -1)` (vanilla updateNeighborsAtExceptFromFacing).
- `src/render/mesher.ts`: `case 'redstone'` in `tintFor` (dust colour by power, `src/world/redstoneColor.ts`).
- `src/item/item.ts`: `blockForItem`: redstone places `redstone_wire`; a small loop before `itemForBlock` giving the redstone torch and repeater items their flat sprites.
- `src/audio/synth.ts`: `Object.assign(SOUNDS, redstoneSounds(SOUNDS))` after `SOUNDS` (`src/audio/gen/redstone.ts`).
- `src/textures/blocks.ts`: `registerRedstoneTextures(T)` after `registerVillageTextures(T)` (`src/textures/blocklib/redstone.ts`).
- `src/inventory/recipes.ts`: redstone torch and repeater after the redstone lamp. `src/gui/screens/creative.ts`: `REDSTONE_ORDER` extended.
- `src/game/redstone/components.ts`: imports `./wire`, `./torch`, `./repeater` (new files; `support.ts` is vanilla isFaceSturdy).

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

## Work in progress (next steps, for the next session or after a context compaction)

- **M2b tripwire**: register `tripwire_hook` (facing, powered, attached) and `tripwire` (powered, attached, disarmed,
  n/e/s/w booleans, `item: 'string'`; `blockForItem('string')` → tripwire) in `blocksRedstoneComponents.ts` (props
  already declared); behaviour `game/redstone/tripwire.ts` as vanilla TripWireHookBlock.calculateState (41 blocks),
  TripWireBlock.updateSource (south and west), checkPressed + 10-tick recheck, `playerWillDestroy` with shears sets
  DISARMED; sounds are already registered (`block.tripwire.*`). Recipe: tripwire hook ×2 (iron ingot, stick, planks);
  the crossbow recipe (stick, iron, string, tripwire hook) becomes possible.
- **M2c dispenser/dropper**: 9-slot block entity with loot table (register a factory in `createBlockEntity`),
  getRandomSlot, TRIGGERED with a 4-tick delay, DispenseItemBehavior for every item the game has, the dropper into
  containers; 3x3 menu/screen opened through a hook like `setVillageMenuHook`, GUI texture `dispenser` (176x166).
- **M2d pistons**: Level block-event queue run after scheduled ticks (dispatches `triggerEvent`), PistonMovingBlockEntity
  ticking in `world.blockEntities`, PistonStructureResolver (12), a PushReaction table, sticky pull, quasi-connectivity,
  entity pushing, a renderer for moving blocks (after `village.render` in `render/entityRenderers.ts`), and a
  collision hook for moving_piston in `entity.ts collisionBoxes`; piston sounds need synthesizing.

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
- Jungle temple and igloo: M3.
- **Redstone dust** (craft or /give redstone): lay a line from a redstone block — it glows darker further out, 15
  blocks reach; right-click a lone piece: cross ↔ dot; it climbs the side of a block that has dust on top.
- **Redstone torch** (redstone + stick): on a block with a lever, it goes out when the lever is on; a torch clock
  (a torch powering its own block through dust) burns out with a fizz and smoke. Light level 7.
- **Repeater** (3 stone, 2 torches, redstone): right-click to set 1-4; a second powered repeater pointing into its side
  locks it (the bedrock bar shows).
