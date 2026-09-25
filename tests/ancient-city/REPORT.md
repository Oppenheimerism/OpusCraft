# The deep dark: report

## 1. Branch and milestones

Branch: `claude/cool-volta-f4wms4` (from main at 42e2ea3; main merged in at 5138ca8 (the ocean), bf4ffb8 (the outer
End, the snow golem), after M2 at 03a11e2 (parrots, /summon data) and after M3 at b2c18f9 (turtles, fireworks,
axolotls, rabbits, goats, foxes, frogs and tadpoles; main at ac9d889); main hadn't moved by the end of M4).

| Milestone | State | Commits |
|---|---|---|
| M1 blocks and items | done: sculk, sculk vein, the catalyst (bloom), the sculk sensor and calibrated sensor (phases, tendrils, amethyst, waterlogging, the active glow), the shrieker (can_summon, shrieking, waterlogged), reinforced deepslate, cracked deepslate bricks and tiles, chiseled deepslate, the 17 candles (1–4, lit, waterlogged, flames and smoke, light 3 per candle), echo shard, recovery compass, disc fragment 5, music disc 5 with its own procedural song; the darkness effect's visuals | 46939f1 |
| M2 the ancient city | done: the structure set (random spread 24/8, salt 20083232), the jigsaw start (city_center by its city_anchor at y −27, size 7, 116 blocks, only where the deep dark is at the start's centre, beard_box), 3 centres, 10 quarters with the outer wall and gate, 20 buildings and ruins, 12 walls, the entrance tunnel (6 pieces), sculk pieces; the start / generic / walls processor lists with vanilla's position random; `chests/ancient_city` and `chests/ancient_city_ice_box`; the deep dark's sculk_vein and sculk_patch_deep_dark, the city's sculk_patch_ancient_city, and the SculkSpreader behind them; `/locate structure minecraft:ancient_city` | d22523e (merge of main: 03a11e2) |
| M3 vibrations and sculk behaviour | done: the game events (vanilla GameEvent's 45 and the 15 resonances, their radii, frequencies and tags) and their dispatcher (listeners by chunk, catalysts told last and nearest first); vibrations (vanilla VibrationSystem: the tick's nearest candidate, higher frequency on a tie, travelling a block a tick with its particle, stopped by wool in the way, muffled by wool or carpet where it happens and by dropped wool, not made by sneaking or spectating, saved on its way and shown again when loaded); the sculk sensor and calibrated sensor (30 or 10 ticks active then 10 cooling, power by distance out of 8 or 16, redstone out, strongly into the block below, the calibrated sensor's back filter, amethyst resonance with its chime, stepping on one, the comparator's frequency, the red specks); the shrieker (warning players, the answer from the dark nearer each time, darkness, broken mid-shriek, stepping on one, a hook for the warden); each player's warning level (vanilla WardenSpawnTracker: shared within 16 blocks, 10 s cooldown, falling after 10 min, saved); the catalyst (a death within 8 blocks: its experience becomes charge that spreads sculk, the bloom and its souls, cursors saved); Swift Sneak; Sneak 100 and It Spreads; the vibration, shriek, sculk charge, charge pop, sculk soul and dust transition particles; the warden's four answers (procedural); game events made all over the world (moving, landing, splashing, blocks placed, broken and changed, containers, doors, buttons, levers, plates, tripwires, pistons, dispensers, eating and drinking, using items, projectiles, explosions, lightning, equipment, shearing, taking hold of a mob, mounting, teleports, damage and deaths) | ffece32, 7fd0733, eaf6d6b, 63f6a17, 43f2ff0 (merge of main: b2c18f9), 5766374 (the report) |
| M4 the warden | done: the warden (vanilla Warden, WardenAi and its behaviours, AngerManagement, WardenEntitySensor): 500 health, 30 attack (knockback 1.5), speed 0.3, follow range 24, 0.9 by 2.9; no knockback (blasts aside, as 1.21), no fire or lava; blind, it hears through its tendrils (twitching and clicking) every #warden_can_listen vibration within 16 blocks of its head, its own steps never; anger per suspect (35 a vibration, a bump or being sniffed out, a shot's owner 10 then 35, a hit 100; a point a second off; agitated at 40, angry at 80; saved by uuid) with the ambient and listening sounds of each level; investigating where it was disturbed, sniffing (within 6 blocks), wandering; the roar (4.2 s, the sound 1.25 s in) and then melee (30 on normal, every 18 ticks, knocking a shield down) or the sonic boom (15 blocks across and 20 up or down, through walls; charged 1.75 s; 10 on normal, 6 easy, 15 hard, past armour, enchantments and shields; thrown 2.5 back and 0.5 up; 10 s before the first, 2 s between); darkness (13 s) every 6 s to the players within 20 blocks; the heartbeat, every 2 s calm to every 0.5 s angry; emerging (6.7 s) when a shrieker summons it and digging away (5 s) after a minute undisturbed, untouchable meanwhile, the ground crumbling round it; a sculk catalyst and 5 experience; summoned at a can_summon shrieker's fourth warning (vanilla SpawnUtil: 20 tries within 5 blocks, 6 up or down, where it fits); WardenModel with emerge, dig, roar, sniff, sonic boom and attack keyframed, its walk, sway and look, the tendrils flaring, the heart beating and the spots pulsing (the four emissive layers); the procedural skin and layers; the sonic boom's rings; the rest of its voice (16 more sounds, 65 variants, procedural); the spawn egg, `/summon minecraft:warden` | 1c51139 (the warden), the report (listed below) |

M3's commits (the subjects are the player-facing messages; their opening words):
- ffece32 "Groundwork for the sculk sensors: the game events vibrations are made of (a step, a block placed or broken, a
  chest opened, food eaten, an arrow landing and the rest), each with the frequency a sensor picks up..."
- 7fd0733 "More groundwork for the sculk sensors and shriekers: how a vibration is heard (the nearest of a tick's, wool
  in the way stopping it, wool or carpet muffling it, sneaking hiding steps and landings) and each player's warning
  level..."
- eaf6d6b "Sculk sensors now hear the world: a step, a landing, a block placed or broken, a chest or door opened, a lever
  pulled, food eaten, a shot fired, a mob hurt or dying..." (sensors, shriekers, catalysts, Swift Sneak)
- 63f6a17 "Sculk sensors now hear the rest of the world: arrows and other projectiles landing, armour and saddles put on
  or taken off..." (the rest of the emission sites, the particles, the warden's answers, the M3 tests, dropped wool)
- b2c18f9 "Merge main (turtles, fireworks, axolotls, rabbits, goats, foxes, frogs and tadpoles) into the deep dark"
- 43f2ff0 "Sculk sensors now hear the newcomers too: a turtle laying her eggs, an egg broken, eggs cracking and
  hatching; a frog laying its spawn; a fox picking berries..., a rabbit nibbling a carrot; a goat horn blown; and a
  firework rocket..."
- 5766374 "The deep dark's report: M3 done (vibrations, sculk sensors and calibrated sensors, shriekers and the warnings
  they give, the catalyst, Swift Sneak...)"

M4's commits:
- 1c51139 "The warden: a shrieker's fourth warning calls it up out of the ground, clawing its way into the world over
  six and a half seconds. Blind, it hears..." (everything in M4: the entity, its brain and anger, the summons, the
  model, animations, textures and layers, the sonic boom's particle, its sounds, the egg, the M4 test)
- the report's own commit: "The deep dark's report: M4 done..."

## 2. Shared files changed (all additive)

- `src/world/blocks.ts`, `src/textures/blocks.ts`: an import and one call each (`registerDeepDarkBlocks()`,
  `registerSculkTextures(T)`) after the fossils' (after main's frogs' since the merge after M3, so main's blocks keep
  their ids).
- `src/world/block.ts`: an `emissive?` block setting and an `EMISSIVE` per-state table (vanilla
  `BlockBehaviour.Properties.emissiveRendering`), filled in `finalizeBlocks`.
- `src/render/mesher.ts`: emissive states mesh at full brightness (`FULL_BRIGHT` in `lightPacked` and the flat branch).
- `src/game/blockBehavior.ts`: a `canBeReplaced?(state, block, sneaking)` hook (vanilla `Block.canBeReplaced`); since
  the merge after M3 it's main's `canBeReplaced?(state, stack, sneaking)`, which the candles now use.
- `src/game/blockRules.ts`: `isMultiface(name)` (glow lichen and sculk vein share the multiface rules, in
  `canReplace` too); experience for the sculk blocks. (M1 had `canReplace` ask a `canBeReplaced(state, block,
  sneaking)` hook; since main's turtle eggs brought `canBeReplaced(state, stack, sneaking)`, asked in
  `interaction.ts`, the candles use main's, as vanilla's CandleBlock reads the item in hand.)
- `src/game/shapeUpdates.ts`: `isMultiface` in place of the glow lichen name checks.
- `src/game/interaction.ts`: `replaceClicked` uses `isMultiface` (main's `canBeReplaced` with the stack and the sneak
  key serves candles as it does turtle eggs);
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

M3 (vibrations and the sculk's behaviour):
- `src/game/level.ts`: `gameEvent(event, x, y, z, ctx)` (vanilla Level.gameEvent, posting to
  `gameEventDispatcher.ts`); `destroyBlock(..., breaker)` gains a last `breaker` parameter (null by default; `false`
  where vanilla removes the block without the event) and posts block_destroy; the particle sink's optional
  `vibration`, `shriek`, `sculkCharge`, `dustTransition`; projectiles loaded from a save marked as shot (`markShot`).
- `src/game/blockBehavior.ts`: `stepOn?` (vanilla Block.stepOn, which main's turtle eggs brought too: one hook,
  called by main's `floorWithHook` in `entity.ts`, the block holding the entity up) and `analogOutput?`
  (getAnalogOutputSignal).
- `src/entity/entity.ts`: (`stepOn` is main's call since the merge; hit_ground comes after main's `fallOn`) the
  movement emission split into sounds and events (`emitsMovementEvents()`, default: whatever makes step sounds;
  bats, boats and minecarts say yes) with step/swim/flap events, `isOnRails()` (a minecart's going counts as
  steps), `supportingState()` (the block actually stood on, a carpet over the stone), hit_ground on landing,
  splash, entity_die in `kill()`, entity_mount/dismount, entity_place.
- `src/entity/living.ts`: `skipDropExperience`; entity_damage in `hurt` (vanilla actuallyHurt).
- `src/entity/mob.ts`: entity_die before the loot, experience only if no catalyst took it; `equipEvent` first in
  `onEquipItem`; item_interact_start/finish. `src/entity/player.ts`: `wardenSpawnTracker` (ticked, saved in
  `game.ts` / typed in `src/storage/worldStore.ts`), item_interact_start/finish, entity_die, Swift Sneak's
  sneaking speed (`0.3 + 0.15 x level`, at most 1).
- `src/game/advancements.ts`: the `avoid_vibration` and `kill_mob_near_sculk_catalyst` criteria (Sneak 100, It
  Spreads).
- `src/game/game.ts`: the sculk particles in the level's particle sink; container open/close events for chests.
  `src/gui/screens/container.ts`: a minecart or boat container closed. `src/world/blockEntity.ts`,
  `src/world/shulkerBoxEntity.ts`: container_open/close on the first opener and the last.
- `src/world/sculkSpreader.ts` (M2's): cursors saved and loaded, dropped past 1024 blocks, waiting where blocks don't
  tick.
- `src/render/particles.ts`: a `sculk` field (`src/render/sculkParticles.ts`) ticked, rendered, cleared and counted
  with the rest; `spawn` hands it the kinds it doesn't know (sculk_charge_pop, sculk_soul).
  `src/render/particleAtlas.ts`: `Object.assign(src, sculkParticleTextures())`.
- `src/audio/synth.ts`: `Object.assign(SOUNDS, wardenSounds())`.
- Game events where vanilla makes them, one or two lines each, the vanilla method named beside each: `interaction.ts`
  (placing, breaking, using items on blocks and mobs, bone meal, tilling, stripping, berries, fire, buckets and
  entity_interact), `redstone/components.ts` (buttons, levers, plates, doors, trapdoors, gates), `redstone/tripwire.ts`,
  `redstone/piston.ts`, `redstone/dispenser.ts` (an empty dispenser; not the dropper, as vanilla),
  `redstone/dispenseItems.ts` (TNT, shears, armour, fire, buckets), `redstone/wire.ts`, `repeater.ts`, `fluidTicks.ts`,
  `randomTicks.ts`, `fallingBlock.ts` (no breaker), `explosion.ts`, `candles.ts`, `villageBlocks.ts` (bells, composters,
  cauldrons, lecterns, flower pots, campfires), `decoratedPot.ts`, `banners.ts`, `shulkerBox.ts`, `chorus.ts`,
  `fishBuckets.ts`, `potionItems.ts`, `raidVillagers.ts`; `arrow.ts`, `throwable.ts`, `fireball.ts`, `llama.ts`,
  `shulkerBullet.ts` (projectile_land), `tnt.ts`, `lightning.ts`, `monsters.ts` (creeper, enderman), `shulker.ts`,
  `silverfish.ts`, `villager.ts`, `ravager.ts`, `thrownPotion.ts`, `snowGolem.ts`, `animals.ts` (sheep, pig's
  saddle), `horse.ts`, `strider.ts`, `elytra.ts`, `boat.ts`, `minecart.ts`, `itemFrame.ts`, `endCrystal.ts`, `bat.ts`,
  `enderDragon.ts`, `raider.ts`, `inventory/menus.ts` (armour put on in the inventory).
- After the merge, in main's new files, the same way: `game/turtleEggs.ts` (an egg of a clutch broken, cracking,
  hatching), `entity/turtle.ts` (eggs laid), `entity/frog.ts` (spawn laid), `entity/fox.ts` (eating, berries off a bush
  or a cave vine; its chorus fruit already goes through `chorusTeleport`), `entity/rabbit.ts` (a carrot nibbled),
  `game/goatHorn.ts` (instrument_play), `entity/fireworkRocket.ts` (projectile_shoot, projectile_land, explode). Main's
  axolotl and tadpole buckets already went through the fish buckets' entity_place, its frogspawn through
  `destroyBlock`.

New files: `src/game/gameEvents.ts`, `gameEventDispatcher.ts`, `vibrations.ts`, `sculkSensor.ts`, `sculkShrieker.ts`,
`sculkCatalyst.ts`, `wardenSpawnTracker.ts` (`src/game/sculk.ts` re-exports the block entities),
`src/render/sculkParticles.ts`, `src/textures/sculkParticles.ts`, `src/audio/gen/warden.ts`.

M4 (the warden), each marked "(M4 ...)":
- `src/entity/mob.ts`: `| 'triggered'` on `SpawnReason` (vanilla MobSpawnType.TRIGGERED: called up by a shrieker).
- `src/entity/living.ts`: `BYPASSES_ARMOR.add('sonicBoom')` under the set.
- `src/item/enchantHelper.ts`: `damageProtection` gives none against `sonicBoom` (vanilla #bypasses_enchantments).
- `src/entity/shield.ts`: `canDisableShield` asks the attacker's own `canDisableShield?()` first (vanilla
  Warden.canDisableShield).
- `src/game/explosion.ts`: `explode` and `windBurst` pass over an entity whose `ignoreExplosion?()` is true (vanilla
  Entity.ignoreExplosion: a warden digging or emerging).
- `src/entity/ai/pathfinder.ts`: an optional `stepDistance?(a, b)` on `NodeEvaluator`, which `findPath` uses for a
  step's length when it's there (vanilla PathFinder.distance, which the warden's overrides with the XZ distance).
- `src/game/game.ts`: the `sonicBoom` death message.
- `src/game/spawner.ts`: `import { Warden }` (its module also fills `shriekerHooks.summonWarden`); `warden` in
  `MOB_TYPES` and `ENTITY_NAMES`, after main's frogs.
- `src/item/item.ts`: `warden_spawn_egg`, at the end of the deep dark's block. `src/textures/mobs.ts`: its colours in
  `EGGS`.
- `src/render/entityRenderers.ts`: `WardenRenderer` imported, built from `this.raiders.kit` with the others, tried in
  `renderMob` after the frogs; `WARDEN_SHADOW_RADIUS` in `shadowRadius`.
- `src/render/particleAtlas.ts`, `src/audio/synth.ts`: comments only (the sonic boom's sprites come with the sculk
  particles', the warden's sounds with its answers).
- My M3 files: `vibrations.ts` (an entity's own `dampensVibrations?()`), `gameEventDispatcher.ts` (an entity's
  listener goes on the register of the section it listens from each time its feet change section, vanilla
  DynamicGameEventListener.move; dropped once it leaves the level), `render/sculkParticles.ts` and
  `textures/sculkParticles.ts` (the sonic_boom particle and its 16 frames), `audio/gen/warden.ts` (the rest of the
  warden's voice).

New files: `src/entity/warden.ts` (the entity, its listener, summoning), `wardenAi.ts` (its brain: activities,
memories, behaviours, sensor), `wardenAnger.ts` (AngerManagement), `src/render/wardenRenderer.ts` (WardenModel, the
animations, the emissive layers), `src/textures/warden.ts` (the skin and the four layers).

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
- M3: there are no comparators yet, so a sensor's frequency (vanilla getAnalogOutputSignal) is only an
  `analogOutput` hook on its behaviour for them to read.
- M3: nothing makes note_block_play, jukebox_play or jukebox_stop_play yet (no note blocks or jukeboxes); the events
  and their frequencies are defined. Goat horns (from main) make instrument_play.
- M3: since the merge, what an entity steps on is main's `floorWithHook` (the block whose collision box is a hair under
  its feet); vanilla's stepOn goes 0.2 down from the supporting block (getOnPosLegacy). The two differ only for a
  carpet laid on top of a sensor or shrieker: vanilla still sets it off when you walk over the carpet, here it doesn't.
  Left as main has it (a shared file).
- M3: a single-player game, so the container events of block containers are by `level.player` (vanilla: whoever opened
  it); projectiles loaded from a save count as shot already (vanilla saves HasBeenShot; the effect is the same).
- M3: nothing tramples farmland and there's no cake yet, so their block_change events wait for them.
- M3: the dropper makes no game event when it's empty and clicks, as in vanilla (the dispenser does).
- M3: `src/item/equipment.ts` (not mine) counts a jack o'lantern as a helmet; in vanilla 1.21 only the carved
  pumpkin is equipable, so putting a jack o'lantern on a head here makes an equip event, not unequip.
- M3: the warden's answers to a shrieker's warnings are procedural, like every sound here. (Since M4
  `shriekerHooks.summonWarden` calls up the warden, and `WardenSpawnTracker.hasNearbyWarden` finds it.)
- M4: the warden's moves are keyframed to vanilla WardenAnimation's lengths and beats (emerge 6.68 s with its arm
  slams, dig 5 s, roar 4.2 s, sniff 4.16 s, sonic boom 3 s, attack 0.33 s), but the curves are drawn afresh, as are its
  skin, layers and voice (no game files), so it moves and looks like vanilla's without matching it frame for frame.
- M4: nothing here has teams, the entity Invulnerable flag, NoAI or the world border, so `canTargetEntity` checks the
  rest (alive, in its level, not creative or spectator, not an armour stand or another warden). Paths don't tell
  powder snow or unpassable rails apart, so its malus for them (8 and 0) is left out. Vanilla's NEAREST_PLAYERS
  sensor isn't ported: nothing of the warden's reads it.
- M4: its listener goes on the register on its first tick (vanilla: as it's added to the level), so a vibration in
  between isn't heard. When it stands up from emerging, it isn't nudged out of blocks (vanilla
  fudgePositionAfterSizeChange); a summons checks it has room standing first, as vanilla's does.
- M4, vanilla's quirks kept: each of a summons' 20 tries that finds a spot makes a warden, which growls (agitated and
  ambient) even when it doesn't fit and is thrown away, so a shrieker with no room round it sounds as if one is
  coming; a warden `/summon`ed with entity data (`{}`) isn't finalized, so has no minute's grace and digs away at
  once; the sonic boom lands 35 ticks after the charge, a tick after the animation's beat (the brain's memories
  expire a tick late); and 1.21 knocks back by explosion_knockback_resistance, which the warden hasn't got, so
  a blast throws it.

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
- `tests/ancient-city/m3-vibrations.mjs`: 137 checks, all pass (10 runs out of 10 before the merge, 5 of 5 after;
  with the level ticking: a block placed 5 blocks off sets a sensor off 5 ticks later with power 6, the particle and
  the clicking, 30 ticks active, 10 cooling, deaf meanwhile; power and timing at every distance for both sensors; the
  nearest of a tick's vibrations, the higher frequency on a tie, nothing else while one's on its way; wool in the way,
  around the corner of one wool block but not two, wool and carpet placed, walking on carpet, a dropped wool block
  landing; a player's steps setting a sensor off at the right time and strength, sneaking steps and landings unheard
  with Sneak 100, stepping onto a sensor sneaking; the calibrated sensor's back filter with a redstone block and with
  dust at 13; amethyst passing frequency 13 on with its chime; a vibration saved on its way and loaded; the
  shrieker's chain from a step through a sensor, the warning levels 1 to 4 with their answers, the 10 s cooldown, the
  warden hook, zombies and arrows, placed shriekers, peaceful and doWardenSpawning, broken mid-shriek, players
  sharing levels, darkness; the tracker's cooldown, decay, bounds and save; the catalyst taking a zombie's
  experience, blooming, spreading sculk and using up its charge, the nearer of two, babies, too far, a player's
  death, It Spreads, its cursors saved; Swift Sneak I to III; and block_place, flint and steel's quirk, shearing,
  entity_damage, equip/unequip, prime_fuse, explode, projectile_shoot and projectile_land where vanilla makes them).
  It found dropped wool not muffling its landing (the item's stack was read from the wrong field), fixed. After the
  merge, main's newcomers: a turtle egg broken, cracking and hatching, a frog laying spawn, a fox eating a chorus
  fruit (eat, then teleport) and picking berries off a bush and a vine, a rabbit's bites (the last making none), a
  goat horn blown, a rocket shot, bursting and striking a ceiling. Since M4 its warning-level checks put a stand-in on
  `shriekerHooks.summonWarden` (the real one now summons a warden) and check the fourth warning asks it once, the
  angry answer coming only when it finds no room.
- `tests/ancient-city/m4-warden.mjs`: 69 checks, all pass (6 runs out of 6 in a row at the end, 8 of 8 while it was
  written; with the level ticking, on flat deepslate): the attributes, size, fire, shields, vibrations dampened,
  no despawning, the drop and experience, egg and name; a shrieker's fourth warning (the shriek's end, within 5
  blocks, on the ground, emerging a block tall, agitated, no answer from the dark; the emerge sound and 134 ticks in
  place, untouchable, the ground breaking up 4.5 s; then standing 2.9 tall); no warning with a warden within 48
  blocks; no room under a low roof (twenty tries heard, the angry answer instead); summonWarden's spots; anger from a
  player's step 10 blocks off (10 ticks, 35), the tendrils and clicks, listening, going to see, deaf 2 s, cooling a
  point a second; at 80 the roar (its sound 25 ticks in, 84 ticks), then the fight: 10 s before any boom, the blow
  of 30 on normal with its sound and knockback, the boom 2 s off after it; hurt (+100, after them at once; an archer
  12 blocks off angers it without drawing it off); a shot (10, then 35 and the archer's spot); a bump (35, once a
  second); sniffing (84 ticks, 35 at the nearest within 6); the sonic boom (charged, landing 35 ticks on, loud, 10 on
  normal, 6 easy, 15 hard, through diamond and Protection IV, through a shield, a fifth off with Resistance, the
  push from its chest 2.5 by 0.5, 2 s to the next); a shield knocked down 5 s; digging (after a minute undisturbed
  and not walking, a block tall, untouchable, gone after 100 ticks with no drops; a disturbance restarting the minute;
  never when named; at once when /summoned with data); darkness every 6 s within 20 blocks (13 s of it); the
  heartbeat (every 2 s calm, 0.5 s angry, lit each beat); death (the catalyst, 5 experience, the cry); saving and
  loading (memories with their time left, the listener with a vibration on its way, anger found again by uuid); its
  own steps unheard by a sensor; blasts (not while emerging; standing, hurt and thrown); lava and fire harmless.
- At the end of M4: `npm run typecheck` clean; every suite passes, run one after another (ancient-city m1 100, m2 42,
  m3 137, m4 69; temples m1 to m4c; mansion m1 to m3). The M1 test's use-on helper presses the sneak key as well as
  crouching (candles, like main's turtle eggs, read the key, vanilla isSecondaryUseActive). Run side by side with the
  other suites, the mansion's m3 generation-cost check can miss its time budget; alone it passes.
- M4 was also looked at in the browser (headless Chromium, the dev server): the model, its proportions and every
  animation, the emissive layers, the sonic boom's rings, a live warden in survival hearing, sniffing and angering; its
  sounds by their spectrograms.

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
- M3, in creative on flat ground (`/gamemode creative`): `/setblock ~3 ~ ~ minecraft:sculk_sensor` and
  `/setblock ~4 ~ ~ minecraft:redstone_lamp`; step about near it: a teal ripple flies to it, it clicks, its tendrils
  glow and the lamp lights for a second and a half; hold sneak and walk: nothing. Put `minecraft:white_wool` between
  you and it: placing blocks behind the wool isn't heard. An `minecraft:amethyst_block` against the sensor chimes as it
  goes off. A calibrated sculk sensor's input is the side toward whoever placed it: with a lever on that side switched
  on it hears only frequency 15 (a death, an explosion).
- Shrieker: `/gamemode survival`, `/difficulty normal`, `/setblock ~2 ~ ~ minecraft:sculk_shrieker[can_summon=true]`
  and step onto it: rings rise and it shrieks; four and a half seconds later something growls from the dark and
  darkness falls. Every 10 s or more a step again: the growl comes nearer (warnings 2 and 3); at the fourth a warden
  claws its way up out of the ground within 5 blocks of the shrieker (M4; under a roof too low for it, an angry
  growl answers instead). `/setblock ~2 ~ ~ minecraft:sculk_shrieker` (a placed one) just shrieks.
- Catalyst: `/setblock ~ ~-1 ~3 minecraft:sculk_catalyst`, `/summon zombie ~ ~ ~5`, `/kill @e[type=zombie]`: the
  catalyst blooms, two souls rise and sculk spreads through the ground where the zombie fell, glowing as it goes.
- In the city (`/tp @s 560.5 -36 -230.5 90 35`, survival): the sensors and shriekers are live, and the shriekers there
  can summon: four warnings there bring up a warden.
- Near a sensor: blow a goat horn (the creative inventory has all eight calls; `/give` makes one with no call, which
  does nothing, as in vanilla); `/give @s minecraft:firework_rocket` and set one off beside it: it clicks for the
  launch (the burst, usually further up than its 8 blocks, isn't heard).
- M4, the warden, on flat ground in survival (`/gamemode survival`, `/difficulty normal`): `/summon minecraft:warden
  ~ ~ ~8`. Its heart beats every two seconds (a deep double thud, its chest lighting up with it), two sets of spots
  on it pulse slowly by turns, and every six seconds darkness washes over you. Walk: at each step its tendrils flare
  and click and it turns to listen; it comes to where you were and stops to sniff, head raised; sneak and it hears
  nothing. A few more steps and it's angry: its heart races, it roars (ribcage flung open), then comes for you: one
  blow is 30 (a raised shield is knocked down for 5 s).
- The sonic boom: `/summon minecraft:warden ~ ~ ~8`, then `/fill ~3 ~ ~ ~3 ~3 ~ minecraft:stone`,
  `/tp @s ~3 ~4 ~` (on the pillar, out of its reach), `/give @s minecraft:bow` and `/give @s minecraft:arrow 64`,
  and shoot it: it roars; ten seconds after, its chest opens and glows as it charges, and a line of rings bursts from
  it to you: 10 whatever armour you wear, throwing you off the pillar (and it comes over to finish you). While you're
  out of its reach it booms again every few seconds (15 blocks across, 20 up or down, walls or not). (Tried in
  headless Chromium with these commands and a real arrow: the roar within a second of the hit, the boom about 12 s
  after the roar ended, 20 health to 10.)
- Digging away: in creative it can't sense you, so after a minute undisturbed it digs back down (5 s, the ground
  crumbling round it) and is gone. `/summon minecraft:warden ~ ~ ~8 {}` (with entity data) digs away at once, as in
  vanilla. Name one with a name tag and it stays.
- Its death: `/kill @e[type=minecraft:warden]` drops a sculk catalyst, and 5 experience too if you've hit it in the
  last 5 s (vanilla: experience only for a kill a player had a hand in). The spawn egg (creative, Spawn Eggs, deep
  teal with cyan spots) places one standing.
