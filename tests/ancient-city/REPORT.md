# The deep dark: report

## 1. Branch and milestones

Branch: `claude/cool-volta-f4wms4` (from main at 42e2ea3; main merged in at 5138ca8, the ocean).

| Milestone | State | Commits |
|---|---|---|
| M1 blocks and items | done: sculk, sculk vein, the catalyst (bloom), the sculk sensor and calibrated sensor (phases, tendrils, amethyst, waterlogging, the active glow), the shrieker (can_summon, shrieking, waterlogged), reinforced deepslate, cracked deepslate bricks and tiles, chiseled deepslate, the 17 candles (1–4, lit, waterlogged, flames and smoke, light 3 per candle), echo shard, recovery compass, disc fragment 5, music disc 5 with its own procedural song; the darkness effect's visuals | (this commit) |
| M2 the ancient city | not started | |
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

## 3. Open points

- No jukebox in the game: music disc 5 plays nowhere yet. Its song is a music pool (`music_disc.5`, 2:58) and
  `src/item/jukeboxSongs.ts` holds vanilla's jukebox_song data (length, comparator output) for the jukebox to use.
- No armour trims: the Ward and Silence templates are a hook in the M2 loot tables (entries for items the game lacks
  roll nothing, as the other tables do).
- No cake block, so no candle cakes.
- No bees: honeycomb exists (creative, loot) so candles can be crafted.
- The compass, recovery compass and clock read their angle for the local player even when shown as a dropped item or
  in an item frame (vanilla uses the holder/frame; the difference is small).
- The calibrated sensor faces the way the player looks when placed (its input side toward them), as vanilla.
- The sculk sensor's comparator output (`lastVibrationFrequency`) is kept in its block entity for M3.

## 4. Tests

- `tests/ancient-city/m1-blocks.mjs`: 100 checks, all pass (states, shapes, light, emissive, hardness, tools,
  sounds, drops and experience, pistons, placement and block entities, candles lit and put out every way, the
  burning arrow, items, recipes, tabs, the recovery compass, darkness's blend, textures, models, sounds, the music).
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
