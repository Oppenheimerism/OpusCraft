# Woodland mansions, ruined portals, desert wells and fossils: report

## 1. Branch and milestones

Branch: `claude/beautiful-darwin-4duqdn` (from main at f08dd21).

| Milestone | State | Commits |
|---|---|---|
| M1 woodland mansions | done: placement, the grid and every piece vanilla lays out, all 51 room templates, the markers (loot chests, evokers, vindicators; the allays' cells stand empty), the foundation, `/locate structure mansion` | 020ed44 Woodland mansions: great dark oak houses deep in dark forests, … |
| (merge) | main merged in (horses, donkeys and mules; leads and name tags): no conflicts | 2ff0fcd Merge remote-tracking branch 'origin/main' |
| M2 ruined portals | done: the seven kinds and all their setups (on the ground, half buried, sea bed, underground, in a mountain, the Nether), all 13 templates, vanilla's processors (crying obsidian, gold taken, lava cooled, magma, aged and mossy bricks, blackstone), the netherrack spread and drips, vines and jungle leaves, waterlogging, the loot chest, `/locate` for all seven; a repaired frame lights | M2COMMIT |
| M3 desert wells and fossils | not started | |

## 2. Shared files changed (all additive)

- `src/world/gen/generator.ts`: imports `WoodlandMansions`; a `readonly mansions` field built next to the temples (same
  `firstFreeHeight`/`quartBiome` terrain callbacks); the decorator's temples hook now places the temples, then the
  mansions: `this.decorator.temples = { place: (ctx) => (this.temples.place(ctx), this.mansions.place(ctx)) }`. (A
  test that sets `decorator.temples = null` switches both off; `tests/temples/m1.mjs` still passes.)
- `src/game/commands.ts`: `import { locateMansion } from './mansions'` and one more branch at the end of `/locate`'s
  chain (`minecraft:mansion` in the Overworld). `STRUCTURES` already had `minecraft:mansion`.
- `src/game/spawner.ts`: in `loadOne`, after `m.load(d)`: a mob saved with `data.finalize === 'structure'` is finalized
  as a structure spawn (`m.finalizeSpawn('structure')`), once, when its chunk first loads. That's how a mansion's
  vindicators get their iron axes (vanilla handleDataMarker finalizes with STRUCTURE). Any structure can use it.
- Loot: `chests/woodland_mansion` is registered from `src/game/mansions.ts` (as `chests/pillager_outpost` is from
  `outposts.ts`); `src/game/loot.ts` is untouched.
- M2, `src/world/gen/generator.ts`: imports `RuinedPortals`/`overworldPortalTerrain`; a `readonly ruinedPortals` field
  built after the mansions; the villages hook is wrapped so the portals go in after the villages (vanilla's order in
  the step): three new lines, the existing ones untouched.
- M2, `src/world/gen/nether.ts`: imports; a `readonly ruinedPortals` built next to the fortresses (from
  `worldSeed64(seed)`, so the Nether's portals are where vanilla's are); `this.ruinedPortals.place(ctx)` at the start
  of the SURFACE_STRUCTURES step in `decorate`, before the deltas.
- M2, `src/game/commands.ts`: `import { isRuinedPortal, locateRuinedPortal } from './ruinedPortals'` and one more
  branch at the end of `/locate`'s chain (the seven `ruined_portal*` ids, which `STRUCTURES` already had).
- M2, `src/world/gen/templePiece.ts`: `positionSeed` (vanilla `Mth.getSeed`) exported, for the portals' processors.
- M2 loot: `chests/ruined_portal` is registered from `src/game/ruinedPortals.ts`.

New files: `src/world/gen/mansion.ts` (placement, MansionGrid, MansionPiecePlacer, the pieces, afterPlace),
`src/world/gen/mansionBuilder.ts` (the template builder, shared with the portals), `src/world/gen/mansionTemplates.ts`
(walls, roofs, corridors, inner walls, the entrance), `src/world/gen/mansionRooms.ts` (the 51 rooms),
`src/game/mansions.ts` (main-thread locator, loot table), `tests/mansion/m1-mansion.mjs`; for M2
`src/world/gen/ruinedPortal.ts` (placement, the processors, the per-chunk placing), `src/world/gen/ruinedPortalTemplates.ts`
(the 13 templates), `src/game/ruinedPortals.ts` (main-thread locator for both dimensions, loot table),
`tests/mansion/m2-ruined-portals.mjs`.

## 3. Open points

### M1 woodland mansions

- **Templates.** Vanilla's `woodland_mansion/*.nbt` can't be used, so all 72 are authored in code (a small builder:
  boxes, layers of characters, data markers, and "soft" blocks that only go into air). The structural ones fit
  exactly where vanilla's MansionPiecePlacer puts the piece of that name (derived from its offsets): the outer walls
  (wall_flat on the ground storey with a cobblestone course, wall_window above with a dark oak band and pairs of
  windows), wall_corner, small_wall(_corner) under the third storey, roof / roof_front / roof_corner /
  roof_inner_corner (a flat top with a three-step eave), corridor_floor with a lantern, the carpet runners over the
  joints, indoors_wall/door_1/2 (birch above on the upper storeys), and the entrance hall (22 × 16 × 16: porch, a
  three-wide doorway, a double-height hall with a grand staircase to a gallery). How each looks is my own after
  vanilla's style; the sizes and positions are vanilla's.
- **Rooms.** All 51 of vanilla's room names exist with vanilla's sizes, doorways and the storeys they're drawn for
  (the draws from each FloorRoomCollection are vanilla's, `1x2_se1`'s `nextInt(1)` included). What's in each is
  rebuilt from memory, the most recognisable rooms first; which vanilla theme sits under which name is my mapping
  (vanilla's own contents per name I couldn't verify):

  | Template | Room | Template | Room |
  |---|---|---|---|
  | 1x1_a1 | flower room | 1x2_b1 | wool chicken statue |
  | 1x1_a2 | pumpkin ring room | 1x2_b2 | wool spider statue |
  | 1x1_a3 | office (chest) | 1x2_b3 | brewing room (evoker, chest) |
  | 1x1_a4 | checkerboard room | 1x2_b4 | study |
  | 1x1_a5 | white tulip sanctuary | 1x2_b5 | indoor garden |
  | 1x1_b1 | birch pillar room | 1x2_c1 | twin bedroom (chest) |
  | 1x1_b2 | bedroom (chest) | 1x2_c2 | jail cells (allays' markers, guard, chest) |
  | 1x1_b3 | small library | 1x2_c3 | birch library |
  | 1x1_b4 | allium room | 1x2_c4 | weaving room |
  | 1x1_as1 | secret: cobweb room (chest) | 1x2_d1 | master bedroom (chest) |
  | 1x1_as2 | secret: diamond block room | 1x2_d2 | jail cells (allays' markers, guard, chest) |
  | 1x1_as3 | secret: lava room (chest) | 1x2_d3 | wool pig statue |
  | 1x1_as4 | secret: obsidian room (chest) | 1x2_d4 | enchanting room (evoker) |
  | 1x2_a1 | dining room | 1x2_d5 | wardrobe (chest) |
  | 1x2_a2 | library | 1x2_se1 | secret: the big cobweb room (2 chests) |
  | 1x2_a3 | storage room (3 chests, guard) | 1x2_s1 | secret: fake End portal (chest) |
  | 1x2_a4 | wheat farm | 1x2_s2 | secret: hidden library (chest) |
  | 1x2_a5 | kitchen (chest) | 2x2_a1 | dining hall (guard) |
  | 1x2_a6 | forge (chest, guard) | 2x2_a2 | wool illager statue hall (2 guards) |
  | 1x2_a7 | tree chopping room | 2x2_a3 | meeting room (evoker, guard) |
  | 1x2_a8 | gallery (wool pictures) | 2x2_a4 | storage hall (3 chests, guard) |
  | 1x2_a9 | bedroom (chest) | 2x2_b1 | map room (chest, guard) |
  | 1x2_c_stairs | staircase up (chest, guard above) | 2x2_b2 | great library |
  | 1x2_d_stairs | staircase up (chest, guard above) | 2x2_b3 | arena (evoker, 2 guards, chest) |
  | 2x2_s1 | secret: vault (4 chests) | 2x2_b4 | greenhouse (a dark oak inside) |
  | | | 2x2_b5 | grand bedroom (chest, fireplace) |

  Left: vanilla's exact furnishing of each template, and any vanilla room types I couldn't recall well enough to
  rebuild (so they aren't here under other names); the rooms above use only blocks the game has (no cakes, candles,
  heads or paintings; the gallery's pictures are wool). On average a mansion has about 18 chests, 12 vindicators and
  2.5 evokers (150 layouts); vanilla's averages I don't know, so these are a judgement.
- **Staircase to the third storey.** `1x2_c_stairs`/`1x2_d_stairs` are 19 high: the second storey room, a straight
  flight up the west side through a well with a rail round it, and the third storey's floor and ceiling over both
  cells (the door's cell is part of the third storey, the other is its landing, where its corridor starts). A block
  round the edge carries the third storey's floor and ceiling as soft blocks: the joints beside the landing that no
  corridor piece covers (vanilla's offsets leave a corridor west or south of the landing without its joint) get a
  floor only where there's air, so an outer wall there isn't cut.
- **Corridor crossings.** Where four corridor cells meet, no piece covers the corner between them; the carpet pieces
  (9 wide, crossing to crossing) carry soft floor and ceiling there. In a hill the crossing's middle stays as the
  ground is.
- **Chest facing (vanilla quirk kept).** A chest marker's facing is turned with the piece but not mirrored, as in
  vanilla's handleDataMarker, so in a mirrored room some chests face their wall (they still open).
- **Allays (hook).** "Group of Allays" markers are in the two jail rooms; the game has no allays, so the marker becomes
  air and the cells stay empty. `HOOK(allays)` in `mansion.ts` handleDataMarker: vanilla spawns 1-3 (its level
  random's `nextInt(3) + 1`), persistent, finalized as STRUCTURE.
- **Woodland explorer map (hook).** `src/entity/trading.ts` (around line 272, "the explorer maps wait for monuments,
  mansions and trial chambers"): the cartographer's woodland explorer map can find its mansion with
  `locateMansion(level.seed, x, z)` from `src/game/mansions.ts` (the start chunk's corner; vanilla looks within 100
  regions and skips mansions already mapped, which would need a record of them).
- **Heights and biome.** As the temples: heights from the bare noise terrain (`firstFreeHeight` - 1, vanilla
  WORLD_SURFACE_WG), the same in every worker and on the main thread; carver holes and lakes don't count. The biome
  is the game's 2D biome at the start (vanilla reads the 3D biome at the start's x, y, z; the same thing at the
  surface). `#has_structure/woodland_mansion` is dark forest only, as in 1.21 (1.21.4 adds pale gardens).
- **Randoms.** Placement (salted, triangular), the turn, the grid, the room choices and piece order are vanilla's
  (the start chunk's large-feature random, drawn in vanilla's order). Chest loot seeds come from the per-chunk
  hash-seeded `Rand`, as for the temples.
- **Order in the step.** Mansions are placed right after the temples, before the outposts and villages (vanilla goes
  by name: …, jungle_pyramid, mansion, monument, pillager_outpost, …). They practically never meet.
- **Numbers used as vanilla's:** spacing 80, separation 20, salt 10387319, triangular spread; y 60; the 5 × 5 corners
  from the chunk's (7, 7) reaching the way it's turned; the 11 × 11 grid, entrance at (7, 4), corridor depths 6, 6, 3,
  3 and 4 on the third storey, room ids from 10; the loot table (1-3 rolls of lead 20, golden apple 15, enchanted
  golden apple 2, discs 13 and cat 15 each, name tag 20, chainmail chestplate 10, diamond hoe 15, diamond chestplate 5,
  enchanted book 10; 1-4 of iron 10, gold 5, bread 20, wheat 20, bucket 10, redstone 15, coal 15, melon, pumpkin and
  beetroot seeds 10 each; 3 of bone, gunpowder, rotten flesh, string 10 each, 1-8; the vex trim 1 vs empty 1).
  Unsure: the vex template's count (2, as the other trims), and that a mansion's corridors carry no markers.
- **Lights.** The rooms are lit with lanterns (and glowstone, jack o'lanterns, a campfire); vanilla's 1.11 templates
  predate lanterns, so this is a style choice.

### M2 ruined portals

- **Templates.** Vanilla's `ruined_portal/*.nbt` can't be used, so the 13 are authored in code with the mansions'
  builder, after vanilla's style: an obsidian frame (4 × 5 in the ten small ones; 6 × 10 and 7 × 10 in the giants)
  standing, or fallen flat in three of them, with 2 to 5 of its blocks gone; a netherrack base, lava pockets in eight;
  stone brick rubble (stairs, slabs, walls, iron bars, pillars, plinths, steps); one to three gold blocks; one chest.
  What each is: portal_1 a frame standing in the ground; _2 on a plinth by the stump of a wall with a barred window;
  _3 fallen round a lava pool; _4 up steps on a raised floor; _5 one side fallen in, two blocks lying by it; _6
  between two pillars under a broken lintel; _7 fallen and broken in two; _8 inside low walls with lava behind; _9 on
  a pedestal; _10 sunk in a netherrack mound; giant_portal_1 a 6 × 10 frame between buttress stumps; _2 a 7 × 10 on a
  plinth with steps; _3 a 7 × 10 fallen over lava, a piece broken off. The names, the count, which are giant and the
  5% chance of a giant are vanilla's; the contents and sizes are mine.
- **Setups.** As vanilla's `Structures.bootstrap`: standard (underground, air pocket 1, mossiness 0.2, can be cold,
  weight 0.5; on the ground, air pocket 0.5), desert (partly buried, 0, 0), jungle (on the ground, 0.5, 0.8,
  overgrown, vines), swamp (sea bed, 0, 0.5, vines), mountain (in the mountain, 1, 0.2, can be cold; on the ground,
  0.5), ocean (sea bed, 0, 0.8, can be cold), nether (0.5, 0, blackstone). Unsure: the mountain kind's second setup
  (on the ground), and in the Nether without an air pocket half at y 27-29 and half at 29-100.
- **Biomes.** vanilla's tags: standard #is_beach, #is_river, #is_taiga, #is_forest (grove included), mushroom fields,
  ice spikes, dripstone and lush caves, savanna, snowy plains, plains, sunflower plains; desert; #is_jungle; swamp and
  mangrove swamp; mountain #is_badlands, #is_hill, savanna plateau, windswept savanna, stony shore, #is_mountain
  (meadow, the peaks, snowy slopes, cherry grove); #is_ocean; #is_nether. The biome is read in 3D at the spot the
  kind picks (so an underground standard portal can stand in a lush or dripstone cave under a desert, and none in the
  deep dark), from the same climate as the chunks' cave biomes.
- **Placing by chunk.** Vanilla builds the whole portal from the chunk its middle is in, looking into the chunks
  round it. Here each chunk builds its own part: the template's blocks and the processors come out as vanilla's
  (their randoms are vanilla's, seeded by each block's position with `Mth.getSeed`), but the netherrack spread, the
  drips, the vines and the leaves draw from a hash per column (or block) instead of vanilla's one stream, and the
  spread's offset `m` from one per portal. The chest's loot seed is a positional hash.
- **The ground the spread sees.** Vanilla's spread reads the WORLD_SURFACE_WG / OCEAN_FLOOR_WG heightmaps, which don't
  move for anything placed in the features step, so it sees the ground as it was before the portal. Kept: on uneven
  ground the spread's netherrack and the drip under it (which goes in whatever is there) can eat into the frame's
  crying obsidian and its bottom row, as vanilla's can. The template's ground layer is re-paved round the middle, so
  the templates keep their gold and ruins above it.
- **Heights.** On the noise terrain as the temples (vanilla getBaseHeight and getBaseColumn: `firstFreeHeight` and
  `substanceAt`, three of the box's four corners solid), the same in every worker and on the main thread. In the
  Nether: the noise's netherrack, lava below y 32.
- **Lighting.** A standing frame lights once its gaps are filled and its crying obsidian swapped for obsidian (crying
  obsidian doesn't make a frame, as in vanilla). The fallen ones can't be lit where they lie.
- **Order in the step.** After the villages (vanilla: …, village_taiga, ruined_portal, …); in the Nether at the start of
  its SURFACE_STRUCTURES step.
- **Numbers used as vanilla's:** spacing 40, separation 15, salt 34222645, linear spread; the seven kinds each weight
  1, drawn and struck off; gold 30% gone, lava to magma 20% (always on the sea bed, netherrack when cold), netherrack to
  magma 7% (not when cold), obsidian 15% crying, bricks 50% aged (cracked or stairs, mossy by the setup's
  mossiness), stairs 50% to mossy stairs or a mossy slab, slabs and walls mossy by mossiness; the spread's chances by
  distance (1 × 9, 0.9, 0.9, 0.8, 0.7, 0.6, 0.4, 0.2: unsure of the table's length), drips 50% a block for up to 8,
  leaves 50%; vines on a random side; the loot table (4-8 rolls: obsidian, flint, iron nuggets, flint and steel, fire
  charge 40 each; golden apple, gold nuggets and the nine golden tools and armour, enchanted, 15 each; glistering
  melon, golden horse armour, light pressure plate, golden carrots, clock, gold ingots 5 each; bell, enchanted golden
  apple, gold block 1 each). Unsure: whether 1.21's table has a second pool (a lodestone, which the game hasn't got):
  left out.

## 4. Tests

Run with `node tests/mansion/<file>.mjs` (Node 22, after `npm ci`).

- `tests/mansion/m1-mansion.mjs`: **45 passed, 0 failed** (about 8 s). Placement with a made-up terrain (a mansion in
  every region of an all-dark-forest world, in its 60 × 60 window; the triangular spread; the start chunk from
  the salt, checked against java.util.Random worked independently; none in plains or forests; the y 60 rule and the
  corners in all four turns; the entrance at the start chunk's (7, 7) on the lowest corner's ground), seed 12345's
  mansions (dark forest, height); 150 layouts (the entrance first; every storey's room cells covered by exactly as
  many room cells, corridors by corridor floors; a wall piece on every outside edge of both storeys and the third;
  a roof over every cell; the staircase exactly when there's a third storey; every room's doorway meeting an inner
  door piece's opening in every turn and mirror; no rooms overlapping; all 51 rooms turning up); the room templates
  (sizes, a walkable doorway, markers inside with vanilla's names, headroom for every mob marker, nothing solid on a
  chest, a light in every room but the secret ones); the real mansion at seed 12345 generated as the chunk workers
  do (17 chests with the loot table, 12 vindicators and an evoker, all persistent, loading with an iron axe; every mob
  in the clear; the cobblestone foundation with nothing hollow; the front door open; stairs, fences and panes
  marked for shaping); `/locate` (and none in the Nether); the cost (laying out a mansion ≈ 1-2 ms, its chunks ≈ the
  same ms with and without it, the per-chunk lookup cached).
- `tests/mansion/m2-ruined-portals.mjs`: **61 passed, 0 failed** (about 12 s). Placement with made-up terrains
  (the start chunk from the salt 34222645, checked against java.util.Random; a portal of the right kind in every
  region of an all-plains, desert, jungle, swamp, meadow, ocean and Nether world, with the kind's setups; none in the
  deep dark, none of the Nether's in the Overworld or the Overworld's in the Nether; standard ones half underground,
  always with an air pocket, half on the ground with one half the time; one in twenty giant, every template, turn and
  mirror; the template, turn, mirror and height drawn in vanilla's order, checked against the random worked
  independently; the heights of each placement; cold in snowy plains; the box turned about the template's middle as
  vanilla's transform with a pivot); the templates (all 13, a chest and gold in each, 1-6 frame blocks lost, the frame
  sizes, lava in some, three fallen); the processors, over portals placed chunk by chunk into flat ground (crying
  obsidian 15%, gold taken 30%, lava kept 80%, magma 7%, bricks and stairs aged half the time; cold: lava to
  netherrack and no magma; on the sea bed: magma for lava, waterlogged stairs, slabs, walls, bars and chests; the
  jungle's vines each on one solid side and its persistent jungle leaves on netherrack, mostly mossy bricks; the
  Nether's blackstone and chains); the spread (round the middle, none beyond 15 blocks, drips below) and the air
  pocket underground; seed 12345's portals (the one under spawn: its chest with the loot table, filling from it when
  opened, its box cleared; as found its frame doesn't light, repaired with obsidian flint and steel lights it into a
  portal; the river, desert and Nether ones where the checklist says); `/locate` for the kinds in both dimensions (and
  none in the wrong one); the cost (working out a region's portal ≈ 1.5 ms, its chunks ≈ the same ms with and without
  it, the per-chunk lookup ≈ 10 µs).
- The temples suites (`tests/temples/*.mjs`) all still pass, before and after the merge, and `npm run typecheck`
  is clean.
- Also looked at in the browser (headless Chromium, seed 12345): the front from the forest (second storey windows,
  eaves, the third storey on the flat roof), the entrance hall with its runner and a vindicator, the illager statue
  on its plinth.

## 5. Browser checklist (seed 12345, `http://localhost:5173/?seed=12345`)

- **The mansion near spawn:** `/locate structure minecraft:mansion` → 640, ~, 480 (800 blocks away). The entrance is
  at 647 65 487, turned so the front faces north: `/tp @s 654 90 450 0 20` looks at it over the trees. The box is
  x 629-687, y 65-95, z 475-553 (L-shaped: the south-east corner is forest). Front door 654 66 480, porch step
  654 65 475; the hall behind it with the grand staircase to the gallery.
  - Ground storey (y 66): the wool illager statue hall around 654 66 544, the dining hall 662 66 528, the chicken
    statue 654 66 500, wheat farms 634 66 544 and 634 66 528.
  - Second storey (y 74): jails 634 74 528, 654 74 500, 678 74 508, 682 74 496 (empty cells: no allays); the great
    library 654 74 512; the big cobweb room (secret, walled in: dig in) 658 74 544; the staircase up at 674 74 528.
  - Third storey (y 85): the arena (evoker and vindicators) 662 85 512; secret rooms: diamond block 634 85 516,
    obsidian 650 85 508.
  - Check: chests open with woodland mansion loot (leads, name tags, discs, seeds, bones, maybe the vex trim, which
    rolls nothing until the item exists); vindicators carry iron axes and neither they nor the evokers despawn when
    you walk away; the cobblestone foundation under the walls where the ground dips; stairs, fences and panes joined
    up to their neighbours; no holes in the floors at corridor crossings.
- **Two more:** `/locate` from -2000, 600 → -2240, ~, 576 (entrance -2233 62 583); from 2900, -2200 → 2864, ~, -2224
  (entrance 2871 70 -2217).

Ruined portals (from spawn, 0 0):

- **Under spawn:** `/locate structure ruined_portal` → 16, ~, 0: portal_6 underground at y 15, in a cleared box in
  the rock (x 18-24, y 15-20, z -2..7). `/tp @s 24.3 16 7.3 145 5` stands in its corner looking at the frame, which
  runs north-south at x 21 with its bottom row in the netherrack floor (the top of its south pillar gone, crying
  obsidian in the lintel, iron bars and mossy stairs beside it); the chest at 19 16 6. Put obsidian in the gap and in
  place of the crying obsidian, then flint and steel on its floor: it lights.
- **On a river:** -544, ~, 240 (portal_1 on the water at y 62, its netherrack floating, drips below): `/tp @s -534 68
  253 140 25`.
- **Desert:** `/locate structure ruined_portal_desert` → 6000, ~, 6000: portal_3 fallen flat, half in the sand
  (y 65-67), with its lava pool: `/tp @s 6011 73 6013 140 30`.
- **Jungle:** `/locate structure ruined_portal_jungle` → 848, ~, -3056: portal_5 with vines and jungle leaves, mossy:
  `/tp @s 858 69 -3043 140 28`.
- **Swamp:** → 4032, ~, 3952 (portal_4 at y 63, vines). **Mountain:** → -1264, ~, -928 (portal_9 on the ground at
  y 64). **Ocean:** → -640, ~, -944 (portal_7 fallen on the sea bed at y 45: magma for lava, waterlogged rubble).
- **Giants:** -320, ~, -1824 (giant_portal_2 at y 77) and 2240, ~, -2368 (giant_portal_1 at y 72, in an air pocket).
- **Nether:** in the Nether, `/locate structure ruined_portal_nether` → 16, ~, 0: portal_6 in blackstone (chains for
  the bars) in a pocket in the netherrack at y 78.
- Check: frames with gaps and crying obsidian; netherrack and magma round each (none under a cold one's lava, which is
  netherrack), drips of it below; gold blocks (some taken); chests open with ruined portal loot (obsidian, flint,
  flint and steel, fire charges, golden things); `/locate structure ruined_portal_nether` in the Overworld finds none.
