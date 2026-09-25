# The deep dark: report

## 1. Branch and milestones

Branch: `claude/cool-volta-f4wms4` (from main at 42e2ea3; main merged in at 5138ca8 (the ocean), bf4ffb8 (the outer
End, the snow golem) and after M2 (parrots, /summon data)).

| Milestone | State | Commits |
|---|---|---|
| M1 blocks and items | done: sculk, sculk vein, the catalyst (bloom), the sculk sensor and calibrated sensor (phases, tendrils, amethyst, waterlogging, the active glow), the shrieker (can_summon, shrieking, waterlogged), reinforced deepslate, cracked deepslate bricks and tiles, chiseled deepslate, the 17 candles (1–4, lit, waterlogged, flames and smoke, light 3 per candle), echo shard, recovery compass, disc fragment 5, music disc 5 with its own procedural song; the darkness effect's visuals | 46939f1 |
| M2 the ancient city | done: the structure set (random spread 24/8, salt 20083232), the jigsaw start (city_center by its city_anchor at y −27, size 7, 116 blocks, only where the deep dark is at the start's centre, beard_box), 3 centres, 10 quarters with the outer wall and gate, 20 buildings and ruins, 12 walls, the entrance tunnel (6 pieces), sculk pieces; the start / generic / walls processor lists with vanilla's position random; `chests/ancient_city` and `chests/ancient_city_ice_box`; the deep dark's sculk_vein and sculk_patch_deep_dark, the city's sculk_patch_ancient_city, and the SculkSpreader behind them; `/locate structure minecraft:ancient_city` | d22523e (merge of main: 03a11e2) |
| M3 vibrations and sculk behaviour | not started | |
| M4 the warden | not started | |

## 2. Shared files changed (all additive)

- `src/world/blocks.ts`, `src/textures/blocks.ts`: an import and one call each (`registerDeepDarkBlocks()`,
  `registerSculkTextures(T)`) after the fossils'.
- `src/world/block.ts`: an `emissive?` block setting and an `EMISSIVE` per-state table (vanilla
  `BlockBehaviour.Properties.emissiveRendering`), filled in `finalizeBlocks`.
- `src/render/mesher.ts`: emissive states mesh at full brightness (`FULL_BRIGHT` in `lightPacked` and the flat branch).
- `src/game/blockBehavior.ts`: a `canBeReplaced?(state, block, sneaking)` hook (vanilla `Block.canBeReplaced`).
- `src/game/blockRules.ts`: `isMultiface(name)` (glow lichen and sculk vein share the multiface rules);
  `canReplace(target, block, sneaking = false)` asks the behaviour first; experience for the sculk blocks.
- `src/game/shapeUpdates.ts`: `isMultiface` in place of the glow lichen name checks.
- `src/game/interaction.ts`: `replaceClicked` and `canReplace` pass the sneaking flag and ask `canBeReplaced`;
  flint and steel / fire charge: `lightCampfire(...) || lightCandle(...)`.
- `src/game/redstone/piston.ts`: candles and sculk vein added to the DESTROYED pattern.
- `src/game/redstone/dispenseItems.ts`: a dispensed flint and steel lights candles too.
- `src/entity/thrownPotion.ts`: a water splash puts candles out (`extinguishCandle` before `dowseCampfire`).
- `src/game/level.ts`: `import './sculk'; import './candles';` after the desert wells.
- `src/item/item.ts`: one "(the deep dark)" block before `itemForBlock`: the new items, their creative positions and
  the moved deepslate variants; honeycomb (for the candle recipe, after rabbit hide).
- `src/inventory/recipes.ts`: candles (and the 16 dyed), calibrated sensor, recovery compass, disc 5 from nine
  fragments, chiseled deepslate, cracked bricks and tiles (smelting). `recipeBook.ts`: calibrated sensor in the
  redstone category, the `dyed_candle` group.
- `src/gui/screens/creative.ts`: the sensors, shrieker, amethyst block and white wool also in the redstone tab
  (`REDSTONE_ALSO`, vanilla lists them in both).
- `src/textures/items.ts`: `...DEEP_DARK_ITEMS` last in the sprite list.
- `src/audio/synth.ts`: `Object.assign(SOUNDS, sculkSounds())`; the disc's pool in `MUSIC_POOLS` and the first line
  of `generatePoolMusic`.
- `src/render/itemRenderer.ts`, `src/gui/guiGraphics.ts`: `dialTexture(stack)` picks the compass, recovery compass and
  clock frames (the compass and clock now turn as well).
- `src/game/game.ts`: `setDialViewer(...)` and `darkness: darknessVisuals(...)` in `renderWorld`; the last death
  position saved and loaded (`lastDeath`, typed in `src/storage/worldStore.ts`).
- `src/entity/player.ts`: `lastDeathLocation`, set in `die()`.
- `src/entity/effects.ts`: `blendDuration` (22 ticks for darkness) and the blend factor on `MobEffectInstance`
  (vanilla 1.21 `MobEffectInstance.BlendState`); `src/entity/living.ts`: loaded effects skip the blend.
- `src/render/effectVisuals.ts`, `renderer.ts`, `lightmap.ts`: darkness's fog (in to 15 blocks, to black), the sky
  and clouds hidden, the pulsing lightmap and the brightness taken off (vanilla `DarknessFogFunction`,
  `LightTexture.calculateDarknessScale`).
- `src/render/particles.ts`: `small_flame` (the candles').

New files: `src/world/blocksDeepDark.ts`, `src/game/sculk.ts`, `src/game/candles.ts`, `src/item/compass.ts`,
`src/item/jukeboxSongs.ts`, `src/textures/blocklib/sculk.ts`, `src/textures/itemlib/deepDark.ts`,
`src/audio/gen/sculk.ts`, `src/audio/gen/disc5.ts`.

M2 (the ancient city):
- `src/world/gen/generator.ts`: `import { AncientCities }`; a `readonly ancientCities` built after the strongholds
  and handed to the decorator; `biome3(x, y, z)` (the biome at a block's quart, the underground ones included, as
  `generate()` gives it); the chunk's beard adds `this.ancientCities.beardFor(cx, cz)` through `addBeards`.
- `src/world/gen/features.ts`: an `ancientCities` field on the `Decorator`, placed at the start of the
  UNDERGROUND_DECORATION step (before the infested stone); `deepDarkFeatures(ctx, rand)` after the vegetation, before
  freezing (the deep dark's VEGETAL_DECORATION features).
- `src/game/commands.ts`: `/locate structure minecraft:ancient_city` (Overworld only), before the villages.

New files: `src/world/sculkSpreader.ts` (vanilla SculkSpreader, ChargeCursor, the sculk behaviours and the vein's
MultifaceSpreader, for world generation now and the catalyst in M3), `src/world/gen/deepDark.ts` (sculk_vein,
sculk_patch_deep_dark / _ancient_city), `src/world/gen/ancientCity.ts` (placement, layout, sculk, beard, /locate),
`ancientCityTemplates.ts` (templates, pool elements, processors), `ancientCityDesign.ts`, `ancientCityCenter.ts`
(the three centres and ten quarters), `ancientCityPieces.ts` (buildings, walls, entrance, the pools with vanilla's
weights), `src/game/ancientCities.ts` (loot tables, the locator).

## 3. Open points

- No jukebox in the game: music disc 5 plays nowhere yet. Its song is a music pool (`music_disc.5`, 2:58) and
  `src/item/jukeboxSongs.ts` holds vanilla's jukebox_song data (length, comparator output) for the jukebox to use.
- No armour trims: the Ward and Silence templates are in the M2 loot table (4 and 1 against 75 empty, two at a time)
  and roll nothing until the items exist, as in the other tables.
- No cake block, so no candle cakes.
- No bees: honeycomb exists (creative, loot) so candles can be crafted.
- The compass, recovery compass and clock read their angle for the local player even when shown as a dropped item or
  in an item frame (vanilla uses the holder/frame; the difference is small).
- The calibrated sensor faces the way the player looks when placed (its input side toward them), as vanilla.
- The sculk sensor's comparator output (`lastVibrationFrequency`) is kept in its block entity for M3.
- The city's templates are written in code from what's known of vanilla's (no game files): the pools, weights,
  processors, connectors' names, sizes (the centre 44 across, the city 30 high on a floor at y −52) and the kinds of
  pieces follow vanilla, but the layout inside each piece is my own (a grid of quarters round the centre, the frame's
  shape, the buildings' rooms), so a city looks like vanilla's without matching it block for block.
- A city is only as common as the deep dark at y −27 at its start's centre (1–3% of regions on the seeds tried:
  12345, 1, 42), which follows the existing cave-biome approximation in `pickCaveBiome` (its surface-biome distance
  counts depth only); a closer multi-noise match there would make cities more common, as vanilla's seem to be.
- The deep dark's own sculk patches and veins are kept to the chunk being decorated (outside it reads as air, writes
  are let go), so a patch near a chunk's edge is cut short; vanilla writes into the neighbouring chunks.
- The city's sculk patches are grown once per city on the city as its pieces stand (the rock round it counted as
  deepslate), each chunk taking its part, so they're the same whatever order the chunks are made in (vanilla's depend
  on the order).
- Cost: the city's chunks take about half as long again to generate (37 → 55 ms each here; the layout and its sculk
  worked out once per city and worker), mostly from the deep dark's own sculk patches, which find far more open
  space in a city; spread over its region it's about 3 ms a chunk (7%).
- Aquifers can flood parts of a city with water (or lava near the bottom), as in vanilla.

## 4. Tests

- `tests/ancient-city/m1-blocks.mjs`: 100 checks, all pass (states, shapes, light, emissive, hardness, tools,
  sounds, drops and experience, pistons, placement and block entities, candles lit and put out every way, the
  burning arrow, items, recipes, tabs, the recovery compass, darkness's blend, textures, models, sounds, the music).
- `tests/ancient-city/m2-city.mjs`: 42 checks, all pass (the processors' position random against a BigInt
  Mth.getSeed + LegacyRandomSource, one start a region in its first 16 chunks, cities only where the deep dark is and
  in every region where it is, /locate's ring order, the start at y −27 with its anchor at −28 and floor at −52, the
  centre, quarters, entrance, buildings and sculk pieces, all within 116 blocks and none cutting into another, the
  blocks built, about 30% cracked, block entities for every chest, sensor, shrieker, catalyst, campfire and skull,
  the chests' loot tables, the loot itself (Swift Sneak I–III books, the damaged enchanted hoe, Regeneration II, the
  trims' pool, the ice box's stew), sculk in the deep dark and nowhere else, and the time a city costs).
- `npm run typecheck`: clean. `tests/temples/*` and `tests/mansion/*` still pass.

## 5. Browser checklist

`http://localhost:5173/?seed=12345&mode=creative`
- Creative tabs: the sculk family before the cobweb in Natural Blocks, the sensors and shrieker also in Redstone, candles
  in Colored Blocks, deepslate variants in Building Blocks, echo shard, fragments, disc and recovery compass in their
  tabs.
- `/setblock ~ ~ ~2 minecraft:sculk_sensor[sculk_sensor_phase=active]` glows in the dark; place candles, stack up to
  four, light with flint and steel, put out with an empty hand.
- `/effect give @s minecraft:darkness 30`: the fog closes in and the light pulses.
- Die, respawn: the recovery compass points back to where you died.
- M2: from the world spawn (−0.5, 63, −11.5), `/locate structure minecraft:ancient_city` gives [528, ~, −224]
  (569 blocks away). `/effect give @s minecraft:night_vision infinite 0 true` to see by, then
  `/tp @s 528.5 -46 -203.5 180 -8`: the frame at the centre, lined with reinforced deepslate, from its steps;
  `/tp @s 528.5 -48.5 -262.5 180 0`: the gate in the outer wall and the tunnel beyond; `/tp @s 560.5 -36 -230.5 90 35`:
  over the east quarter (sculk, sensors, shriekers, lamp posts, a chest). Chests hold the city's loot; the one in the
  ice box (if the city has one) its own.
