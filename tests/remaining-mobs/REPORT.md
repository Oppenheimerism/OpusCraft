# Remaining mobs: report

The missing Java 1.21 mobs, one milestone at a time, in the brief's order. Everything is procedural: textures, models
and sounds are drawn or synthesised by the game's own code, and no Mojang asset is used.

## 1. Branch and milestones

Branch: `claude/optimistic-volta-xe2bah`, from main at 93288e7.

| # | Milestone | State | Commit |
|---|---|---|---|
| 1 | Bee: bee nest, beehive, honey bottle, honeycomb, honey block, honeycomb block | done | `295bada` "Bees. Bee nests hang from trees in meadows (every tree there), plains, sunflower plains, cherry groves and flower forests, …" |
| 2 | Phantom and insomnia | done | `4ee0b58` "Phantoms. Stay up three days without lying down in a bed and phantoms come for you at night: …" |
| 3 | Panda and bamboo | done | `76d00bc` "Pandas and bamboo. Bamboo jungles are thick with bamboo, with podzol round some of it, …" |
| 4 | Mooshroom and huge mushrooms | done | the commit that adds this row ("Mooshrooms and huge mushrooms. …") |
| 5 | Armadillo, scutes and wolf armour | not started | |
| 6 | Camel | not started | |
| 7 | Sniffer | not started | |
| 8 | Allay | not started | |
| 9 | Endermite | not started | |
| 10 | Skeleton horse trap and zombie horse | not started | |
| 11 | Wither (the beacon only if everything else is done) | not started | |

**Important: in the pushed commits of milestones 1 to 3, the game didn't start in a browser.** It stopped on a black
screen with "Cannot access 'hiveDispense' before initialization" in the console. The bee milestone put the
dispenser's hive hooks in `game/redstone/dispenseItems.ts`, and `game/beehive.ts` set them as it loaded. But the
dispenser's module imports the spawner, which imports the bee, which imports the beehive, so in the browser's module
order the beehive ran before the hooks existed. The headless tests load their modules in other orders and never hit
it. I found it in milestone 4, the first time I started the game in a headless browser. The fix is in the milestone 4
commit: the hooks have a module of their own with no imports (`game/redstone/hiveDispense.ts`). A new test,
`tests/remaining-mobs/load-order.mjs`, loads the modules in `main.ts`'s order, as a browser does. It fails on
`76d00bc` (Node reports the same cycle as "Cannot set properties of undefined (setting 'shear')") and passes now. From milestone 4 on, each milestone is also checked in a real browser (headless Chromium):
the dev server and the production build both start, and the new mob is summoned and screenshotted.

## 2. Shared files changed, and hooks

Each new line in a shared file is marked with a `(remaining mobs…)` comment. The changes are small and additive.

### Milestone 1: the bee

**New files**
- `src/entity/bee.ts`: the bee and its goals.
- `src/game/beehive.ts`: the nest, the hive and its block entity; smoke from a campfire; dispensers; the honey block.
- `src/world/blocksBees.ts`: the four blocks.
- `src/item/itemsRemainingMobs.ts`: the items and their creative-tab places.
- `src/inventory/recipesRemainingMobs.ts`: the recipes.
- `src/world/gen/beehiveDecorator.ts`: nests on trees.
- `src/render/beeRenderer.ts`: the model.
- `src/textures/bee.ts` and `src/textures/blocklib/bees.ts`: the skins and the block faces.
- `src/audio/gen/bee.ts`: 77 sound takes.
- `src/audio/beeSounds.ts`: each bee's buzzing loop.
- `tests/remaining-mobs/bee.mjs` and `bee-mp.mjs`: the tests.

**Registration lines** (one import and one call each):
- `src/world/blocks.ts`: `registerBeeBlocks()`.
- `src/item/item.ts`: `registerRemainingMobItems(…)`.
- `src/textures/blocks.ts`: `registerBeeTextures(T)`.
- `src/textures/mobs.ts`: the spawn egg's colours in `EGGS`.
- `src/inventory/recipes.ts`: `registerRemainingMobRecipes(…)`.
- `src/audio/synth.ts`: `Object.assign(SOUNDS, beeSounds())`.
- `src/game/level.ts`: `import './beehive'`.
- `src/game/spawner.ts`: `bee` in `MOB_TYPES` and `ENTITY_NAMES`.
- `src/render/entityRenderers.ts`: `BeeRenderers`, and its shadow radius (halved for a baby).
- `src/audio/soundManager.ts`: a `BeeSounds` field, ticked after the elytra's.

**Hooks and changed behaviour**
- `src/game/blockBehavior.ts`: `spawnAfterBreak` takes two optional arguments, `source` (who broke the block, or a
  blast's direct source) and `be` (its block entity as it was). The two callers pass them: `src/game/level.ts`
  (`destroyBlock`) and `src/game/explosion.ts`.
- `src/game/interaction.ts`: placing a block item applies its `blockState` tag (vanilla
  `BlockItemStateProperties`), so a hive keeps its honey level. The new helper is `withItemBlockState`.
- `src/item/item.ts`: `ItemTag` gains `bees` (vanilla `minecraft:bees`) and `blockState` (vanilla
  `minecraft:block_state`), which `cloneTag` and `sameTag` handle. The `BeeOccupant` type is new.
- `src/game/advancements.ts`:
  - two new criteria, `slide_down_block` and `bee_nest_destroyed`;
  - `item_used_on_block` takes `smokey`;
  - Sticky Situation, Bee Our Guest and Total Beelocation are no longer `never`.
- `src/game/poi.ts`: `bee_nest` and `beehive` points of interest (no tickets).
- `src/game/redstone/dispenseItems.ts`: a `hiveDispense` hook, used by shears and glass bottles; `game/beehive.ts`
  fills it in.
- `src/game/playerDeath.ts`: the death message "was stung to death".
- `src/render/particles.ts`: `dripping_honey`, `falling_honey`, `landing_honey` and `falling_nectar`, plus an
  `onHoneyDripLand` hook. `src/game/game.ts` uses the hook to play `block.beehive.drip` where a drop lands.
- `src/entity/ai/goals.ts`: `airRandomPosTowards` (vanilla `AirRandomPos.getPosTowards`).
- `src/entity/ai/navigation.ts`: `moveTo(x, y, z, speed, accuracy = 1)` (vanilla's accuracy argument; existing
  callers are unchanged).
- `src/entity/living.ts`: `blockJumpFactor()` reads the block's `jumpFactor` (vanilla `getBlockJumpFactor`); it
  always returned 1 before. Only the honey block has a factor other than 1.
- `src/world/gen/trees.ts`: `placeTree(…, bees?)` runs the beehive decorator after the vines.
- `src/world/gen/features.ts`: a `bees` chance per biome's trees, in vanilla's biomes. The nest has its own random,
  seeded from the tree's position, so every existing world's trees come out as before.
- `src/game/randomTicks.ts`:
  - a sapling (oak, birch or cherry) with a flower within 2 blocks grows with a 5% nest;
  - `growTreeInWorld` gives the new nest's block entity its bees.
- `src/inventory/recipeBook.ts`: the honey block goes under the redstone tab, and honey-to-sugar gets its own group.
- `src/gui/screens/creative.ts`:
  - the honey block is listed with the redstone blocks too, after the sticky piston (vanilla puts it after the slime
    block, which the game hasn't);
  - the bee nest is listed with the natural blocks too, after the hay bale (a new `NATURAL_ALSO`).
- `src/net/chunkData.ts`: a hive's `bees` and `flower_pos` aren't sent to guests (vanilla `BeehiveBlockEntity` has no
  update tag).
- **No `PROTOCOL_VERSION` bump.** No packet changed. The bee's fields ride the existing entity-data sync, and
  `BUILD_ID` already tells builds apart.

### Milestone 2: the phantom

**New files**
- `src/entity/phantom.ts`: the phantom, its move and look controls, and its four goals.
- `src/game/phantomSpawner.ts`: insomnia (vanilla `PhantomSpawner`).
- `src/render/phantomRenderer.ts`: the model, its animation and the glowing eyes.
- `src/textures/phantom.ts`: the skin and the eyes.
- `src/audio/gen/phantom.ts`: 23 sound takes.
- `tests/remaining-mobs/phantom.mjs` and `phantom-mp.mjs`: the tests.

**Registration lines**
- `src/game/spawner.ts`: `phantom` in `MOB_TYPES` and `ENTITY_NAMES`; a `phantoms` field (a `PhantomSpawner`) on
  `NaturalSpawner`, ticked first of the custom spawners (vanilla's order), with the same `spawnEnemies` as patrols.
- `src/render/entityRenderers.ts`: `PhantomRenderers`, its shadow radius (0.75), and one line in the distance cull:
  a phantom is drawn at any distance (vanilla `Phantom.shouldRenderAtSqrDistance`).
- `src/textures/mobs.ts`: the spawn egg's colours in `EGGS`.
- `src/item/itemsRemainingMobs.ts`: the spawn egg (the membrane item already existed).
- `src/audio/synth.ts`: `Object.assign(SOUNDS, phantomSounds())`, before the parrot's, so a parrot imitates it.

**Hooks and changed behaviour**
- `src/entity/player.ts`: a new `timeSinceRest` field (vanilla statistic `minecraft:time_since_rest`). It counts up
  once a tick on the host while the player isn't asleep. `startSleeping` (lying down in a bed) and `die` reset it.
- `src/game/playerData.ts` and `src/storage/worldStore.ts`: `timeSinceRest` is saved with the player, the host's and
  each guest's. A save from before loads as 0.
- `src/entity/monsters.ts`: `Monster.aiStep`'s bright-light boredom moved into a new `updateNoActionTime()` so the
  phantom can opt out (vanilla's phantom is a `FlyingMob`, not a `Monster`). Nothing changes for other monsters.
- `src/entity/rabbit.ts`: rabbits don't count the phantom as a monster to flee (vanilla `Monster.class`).
- `src/entity/cat.ts`: a comment only (`hiss` is now used).
- `src/render/particles.ts`: the `mycelium` particle (vanilla `SuspendedTownParticle`), the specks off a phantom's
  wingtips.
- **No `PROTOCOL_VERSION` bump.** No packet changed; the phantom's size and wingbeat offset ride the entity-data sync.

### Milestone 3: the panda and bamboo

**New files**
- `src/entity/panda.ts`: the panda, its genes, its move control and its goals (ten of them its own).
- `src/render/pandaRenderer.ts`: the model, its animation, the rolling, sitting and on-its-back poses, and what it
  holds (vanilla `PandaHoldsItemLayer`).
- `src/textures/panda.ts`: the seven skins.
- `src/audio/gen/panda.ts`: the panda's 39 sound takes, and bamboo's 23.
- `src/world/blocksBamboo.ts`: the bamboo stalk, the bamboo shoot (`bamboo_sapling`) and potted bamboo: their
  states, shapes and models.
- `src/world/blockOffset.ts`: vanilla's sideways nudge (`OffsetType.XZ`) for the blocks whose outline and collision
  move with the model. Only bamboo and its shoot are registered.
- `src/game/bamboo.ts`: planting, growth, bone meal, falling apart, a sword's single stroke, the offset collision.
- `src/world/gen/bambooFeature.ts`: bamboo in the jungles.
- `src/textures/blocklib/bamboo.ts` and `src/textures/itemlib/remainingMobs.ts`: bamboo's block faces and its item.
- `tests/remaining-mobs/panda.mjs` and `panda-mp.mjs`: the tests.

**Registration lines**
- `src/world/blocks.ts`: `registerBambooBlocks()`.
- `src/textures/blocks.ts`: `registerBambooTextures(T)`.
- `src/textures/items.ts`: `REMAINING_MOB_ITEMS` (the bamboo item's sprite).
- `src/textures/mobs.ts`: the spawn egg's colours in `EGGS`.
- `src/item/itemsRemainingMobs.ts`: the spawn egg, and the bamboo item's sprite, tab (natural blocks, before sugar
  cane) and fuel (50 ticks).
- `src/inventory/recipesRemainingMobs.ts`: a stick from two bamboo; `src/inventory/recipes.ts`: a comment.
- `src/audio/synth.ts`: `Object.assign(SOUNDS, pandaSounds())`.
- `src/game/level.ts`: `import './bamboo'`.
- `src/game/spawner.ts`: `panda` in `MOB_TYPES` and `ENTITY_NAMES`. The jungle spawn lists already named the panda
  (it was picked and nothing came); only their comment changed. The panda's spawn rule joins the other animals'
  (grass under it, light over 8).
- `src/render/entityRenderers.ts`: `PandaRenderers`, and its shadow radius (0.9, halved for a cub).

**Hooks and changed behaviour**
- `src/game/blockBehavior.ts`: two optional hooks on `BlockBehavior`:
  - `performBonemeal` (vanilla `BonemealableBlock`), which `src/game/boneMeal.ts` asks first;
  - `destroyProgress` (vanilla `getDestroyProgress`, a sword through bamboo), which `destroyProgress` in
    `src/game/blockRules.ts` asks first.
- `src/game/raycast.ts` and `src/render/overlay.ts`: a block registered in `world/blockOffset.ts` has its outline
  moved by its offset, for the block picked and the box drawn round it.
- `src/game/interaction.ts`, two lines:
  - a block placed from an item plays the placed block's own sound (vanilla `BlockItem.place` uses the placed state's
    `SoundType`), so bamboo planted as a shoot sounds like a shoot. The other items that place another block (a torch
    or a sign on a wall, and the like) already share their block's sound, so nothing else changes;
  - the check that a block isn't placed inside an entity uses the block's shape where it stands (vanilla
    `isUnobstructed`): a bamboo stalk's post, set off. A shulker box's shape without its block entity is the whole
    block, as before.
- `src/game/redstone/piston.ts`: `bamboo` is broken by pistons (the shoot and the pot already were, as a sapling and
  a potted plant).
- `src/world/blocksVillage.ts`: `bamboo` in `POTTABLE`, and `flowerPotElements` exported for potted bamboo's model.
- `src/world/gen/features.ts`: `bambooVegetation` runs before the jungles' trees. It has its own random, so a chunk
  without bamboo comes out exactly as before; where it placed bamboo, the heightmaps are worked out again.
- `src/world/gen/temperature.ts`: `biomeInfoNoise` (vanilla `Biome.BIOME_INFO_NOISE`), exported for bamboo's
  noise-based count.
- `src/render/particles.ts`: the `sneeze` particle (vanilla `PlayerCloudParticle.SneezeProvider`).
- `src/render/particleAtlas.ts`: bamboo and cake crumbs for the eating particles (the food items' crumbs were
  already there).
- `src/entity/rabbit.ts`: `isMonster` exported (the panda keeps 4 blocks from the same monsters).
- `tests/villages/flowerpot.mjs`: 31 potted plants now, with potted bamboo.
- `tests/saves/player.mjs`: its list of the saved player's fields gains `timeSinceRest`. Milestone 2 added that field
  and should have updated this list; see the regression summary in section 4.
- **No `PROTOCOL_VERSION` bump.** No packet changed. The panda's genes, counters and amounts ride the entity-data
  sync; the sneeze cloud and the crumbs ride the existing particle relay; the new blocks' states are block states
  like any others (`BUILD_ID` already tells builds apart).

### Milestone 4: the mooshroom and huge mushrooms

**New files**
- `src/entity/mooshroom.ts`: the mooshroom (vanilla `MushroomCow`, a `Cow`): its colour, lightning, shears, the
  bowl, flowers, breeding, saving, `/summon` data and its spawn rule.
- `src/render/mooshroomRenderer.ts`: the cow's model in the mooshroom's skin, with its three mushrooms (vanilla
  `MushroomCowMushroomLayer`).
- `src/textures/mooshroom.ts`: the red and brown skins.
- `src/audio/gen/mooshroom.ts`: the mooshroom's own 9 sound takes (convert 2, eat 4, milk 3). The suspicious milk
  shares the milk's takes, and the shears' snip is the sheep's, as in vanilla.
- `src/game/suspiciousStew.ts`: what each small flower puts in a stew, the four-ingredient recipes, the creative
  tabs' stews and the creative-mode tooltip.
- `src/world/blocksMushrooms.ts`: the brown and red mushroom blocks and the mushroom stem (six sides each, 64
  states), with their models.
- `src/textures/blocklib/mushrooms.ts`: their faces (the brown cap, the red cap, the stem, the inside).
- `src/world/gen/hugeMushroom.ts`: the huge brown and red mushrooms (vanilla `HugeBrownMushroomFeature`,
  `HugeRedMushroomFeature`), one a chunk on the mushroom fields and now and then in a dark forest tree's place.
- `src/game/mushrooms.ts`: the huge mushroom blocks closing their sides and dropping small mushrooms; small mushrooms
  surviving, spreading and growing huge with bone meal; mycelium's spores.
- `src/game/redstone/hiveDispense.ts`: the dispenser's hive hooks, moved here from `dispenseItems.ts` to fix the
  browser start (section 1).
- `tests/remaining-mobs/mooshroom.mjs`, `mooshroom-mp.mjs` and `load-order.mjs`: the tests.

**Registration lines**
- `src/world/blocks.ts`: `registerMushroomBlocks()`.
- `src/textures/blocks.ts`: `registerMushroomTextures(T)`.
- `src/textures/mobs.ts`: the spawn egg's colours in `EGGS`.
- `src/item/itemsRemainingMobs.ts`: the spawn egg; the three mushroom blocks in the natural blocks tab, after the
  flowering azalea leaves; the suspicious stew moved after the rabbit stew (vanilla's place in the tabs).
- `src/audio/synth.ts`: `Object.assign(SOUNDS, mooshroomSounds())`, and `entity.mooshroom.shear` sharing
  `entity.sheep.shear`.
- `src/game/level.ts`: `import './mushrooms'` and `import './suspiciousStew'`.
- `src/game/spawner.ts`: `mooshroom` in `MOB_TYPES` and `ENTITY_NAMES`; the mushroom fields' creatures (mooshrooms,
  weight 8, four to eight; the biome had none); the mooshroom's spawn rule.
- `src/render/entityRenderers.ts`: `MooshroomRenderers`, and its shadow radius (0.7, halved for a calf).
- `src/world/gen/features.ts`: `mushroomIslandVegetation` runs before the other vegetation; the dark forest's trees
  (a new `huge` flag on its `Deco`) ask `darkForestMushroom` first.

**Hooks and changed behaviour**
- `src/entity/animals.ts`: `Cow.type` is typed `string` instead of the literal `'cow'`, so the mooshroom can be a cow
  with a type of its own. Nothing else about the cow changes.
- `src/item/hoverText.ts`: `tooltipFlag` (vanilla `TooltipFlag.isCreative`). `src/gui/screens/container.ts` and
  `creative.ts` set it as they draw a tooltip (and the creative search sets it as it indexes one), so a suspicious
  stew names its effects only in creative mode, as in vanilla.
- `src/game/redstone/dispenseItems.ts`: a dispenser's shears shear a mooshroom, as they do a sheep. The hive hooks
  are imported from `./hiveDispense` and re-exported, so nothing that used them changes. `src/game/beehive.ts`
  imports them from there.
- Small mushrooms (`game/mushrooms.ts`, through the existing `canSurvive` hook): they now stay on mycelium, podzol or
  nylium in any light, and elsewhere only in raw light under 13 on a solid block (vanilla `MushroomBlock`). Before,
  the game kept them on any solid block. A mushroom in bright light elsewhere now breaks when a block next to it
  changes, as in vanilla.
- **No `PROTOCOL_VERSION` bump.** No packet changed. The mooshroom's colour rides the entity-data sync; the swirls,
  smoke and puff ride the particle relay; the new blocks' states are block states like any others. What's in a
  brown mooshroom (its stew effects) is a list of plain objects, which the sync doesn't send; guests don't need it,
  as in vanilla (the client doesn't know it either).

## 3. Open points, deviations, uncertain values, hooks

### Milestone 1: the bee

**Deviations**
- **Nest placement at chunk edges.** Worldgen puts a nest only inside the chunk being decorated. When the chosen spot
  is over the chunk's edge, the next free side of the trunk is used instead, or no nest. Vanilla can place into the
  neighbouring chunk.
- **Nest random.** The decorator draws from its own random, not the tree feature's, so existing worlds keep their
  trees. Positions can't match vanilla's for a given seed anyway: the game's trees aren't bit-identical to vanilla's.
- **Mangrove swamps.** The game has no mangrove tree; its mangrove-swamp stand-in trees take vanilla's 1% nest chance.
- **Stuck stingers.** Stingers stuck in a player aren't drawn (vanilla `BeeStingerLayer`). The game draws no stuck
  arrows either; the count isn't tracked.
- **Flowers the game lacks.** `FLOWERS` follows vanilla `#flowers`, so it also names flowers the game doesn't have
  yet (torchflower, pitcher plant). This is harmless and ready for when they arrive.
- **Honey block in the redstone tab.** It sits after the sticky piston, because the game has no slime block.

**Hooks left for later milestones**
- The Wither milestone: `BLAST_SOURCES` in `game/beehive.ts` already names `wither`, `wither_skull` and
  `tnt_minecart`, so their blasts will turn bees out of a nest once those entities exist.

**Values I'm not sure of**
- **Sounds.** All 77 takes are synthesised to sound like vanilla's, not copied. The buzz loop is 3.2 s; its pitch
  and volume follow vanilla `BeeSoundInstance` exactly.
- **Honey block recipe.** Its recipe book tab is redstone. I believe vanilla uses `RecipeCategory.REDSTONE`.
- **Saved fields.** A bee saves `AngerTime` and `NoGravity` even at their defaults, so `/summon` can set them. Vanilla
  omits a zero anger time.

**Choices where the brief was open** (the most vanilla-faithful option each time)
- **Guests don't know a hive's bees.** Vanilla's client doesn't either. They see the honey level, the drips and the
  bees going in and out.
- **A guest's creative slots keep only creative-tab variants** (an existing rule), so a guest copying a nest full of
  bees in creative gets an empty nest. In survival, a guest's silk-touch nest keeps its bees (tested).
- **Piston-pushed honey.** A honey block drags the blocks stuck to it. Honey lying on the ground therefore drags the
  ground and usually can't be pushed (over 12 blocks). This is vanilla.

### Milestone 2: the phantom

**Deviations**
- **The wingbeat's clock.** Vanilla counts a phantom's wingbeat from its own age, which each client counts for
  itself, and plays the flap sound and the wingtip specks on the client. Here the beat comes from the world's time
  plus the phantom's id × 3 (its `flapOffset`, sent to guests), and the host plays the flap and the specks and sends
  them on. So the host and every guest see and hear the same beat. The pace and sounds are vanilla's.
- **No statistics screen.** The game's Statistics button is disabled, so "Time Since Last Rest" isn't shown
  anywhere. It is counted, reset and saved as in vanilla.
- **Class.** The phantom extends the game's `Monster` class, as the ghast does, and overrides what vanilla's
  `FlyingMob` does differently: it doesn't keep players from sleeping, it swims and splashes with the generic
  sounds, bright light doesn't hasten its despawning, and rabbits don't flee it.

**Values I'm not sure of**
- **Sounds.** All 23 takes are synthesised to sound like vanilla's, not copied. I believe the counts match vanilla's
  `sounds.json` (ambient 5, bite 2, death 3, flap 6, hurt 3, swoop 4); I am least sure of the flap's 6.
- **The drawn pitch.** Vanilla `PhantomRenderer.setupRotations` turns the model by `getXRot()` as it stands this tick,
  not blended between ticks. I kept that, so the pitch moves in tick steps, as in vanilla.

**Choices where the brief was open** (the most vanilla-faithful option each time)
- **What rest is.** Lying down in a bed resets insomnia even if the night isn't skipped (vanilla resets the statistic
  as the player starts sleeping). Dying resets it too. Nothing else does.
- **The swoop cadence.** The goals are ported as vanilla has them. The sweep goal lets go of the target after every
  swoop, so the phantom climbs away, finds its player again about three seconds later and swoops half a second after
  that. The strategy goal's 8–11 second timer rarely matters, as in vanilla.
- **Guests.** A guest's insomnia is counted on the host (vanilla: server-side statistics) and kept in the guest's
  saved player data. Phantoms come for guests exactly as for the host's player.
- **Testing insomnia in the browser.** There is no `/tick sprint` or statistics command (vanilla has no command to
  set the statistic either), so the checklist uses the browser console to set it.

### Milestone 3: the panda and bamboo

**Deviations**
- **Podzol at chunk edges.** Worldgen puts bamboo's podzol only inside the chunk being decorated; a disc reaching
  over the edge stops at it. Vanilla can reach into the neighbouring chunk.
- **Bamboo positions for a seed.** The bamboo feature runs on its own random, so bamboo stands where vanilla's
  would for the same noise and counts, not at vanilla's exact spots (the game's terrain isn't bit-identical anyway).
- **A cub drops nothing.** Vanilla drops no loot and no experience from any baby animal (`shouldDropLoot`,
  `shouldDropExperience`). The game's other animals don't do that yet; I added it to the panda only, so as not to
  change every animal in this milestone.
- **The sneeze cloud.** It's vanilla's green, see-through cloud and lifetime, but it doesn't sink towards a player
  within 2 blocks as vanilla's `PlayerCloudParticle` does.
- **Cake.** Vanilla pandas also take up and eat cake. The game has no cake item yet (the other session is adding
  cakes), so the panda's code names `cake` by id and it will work when cake arrives. The crumbs are ready.
- **Eating on the host.** Vanilla plays the munching and the crumbs on each client from the synced eat counter. Here
  the host plays them and sends them on, so everyone sees and hears the same munches.
- **Two by Two for guests.** Breeding pandas counts for Two by Two, as before for the host only: guests have no
  advancements in the game yet.

**Values I'm not sure of**
- **Sounds.** All takes are synthesised to sound like vanilla's, not copied. The counts I believe vanilla has:
  ambient 5, aggressive ambient 4, worried ambient 3, can't breed 5, hurt 3, death 2, bite 3, eat 5, pre-sneeze 1,
  sneeze 3, step 5. Bamboo: place 6 (its break the same), step 6 (its hit, at half pitch, and its fall the same);
  the shoot: place 6 (its break the same), hit 5. I am least sure of the pre-sneeze's single take.
- **The spawn egg's colours** (0xe7e7e7 and 0x1b1b22) are from memory of vanilla `SpawnEggItem`.

**Choices where the brief was open** (the most vanilla-faithful option each time)
- **Vanilla quirks kept:**
  - a panda takes up a whole stack and eats it all at the end of one meal;
  - `/summon` with genes but no health or speed keeps 20 health and 0.15 speed (vanilla sets them only for a natural
    spawn or a birth), so `{MainGene:"weak",HiddenGene:"weak"}` looks weak with 20 health;
  - a worried panda gets up every tick outside a storm unless it's eating, so it seldom sits down to bamboo on the
    ground;
  - a rolling panda hops only when it's on the ground at a quarter turn, so it hops at the 1st, 14th and 28th ticks
    (the 7th and 21st come while it's in the air);
  - vanilla's panic goal finds a place to run only about two times in three on flat ground (a spot level with it),
    so a panic can start a tick or two late.
- **The model.** Vanilla's `PandaModel` doesn't put its body's tilt back after sitting in 1.17 and later; here each
  frame starts from the rest pose, which gives the look vanilla shows.
- **Guests.** A guest's bamboo feeds, breeds and tempts pandas, the host deciding, and a guest plants and cuts bamboo
  like anyone. No panda data is kept per player.

### Milestone 4: the mooshroom and huge mushrooms

**Deviations**
- **Who sees the flower's swirls.** In vanilla, the four swirls (or the two wisps of smoke when the mooshroom already
  holds a flower's effect) are shown only to the player who gave the flower, by that player's own client. Here the
  host makes them and sends them on, so everyone nearby sees them. The munching sound is heard by everyone nearby in
  both.
- **The suspicious stew recipes aren't in the recipe book.** They work in any crafting grid, as special recipes, but
  the recipe book doesn't list them. In vanilla they are ordinary shapeless recipes (`suspicious_stew_from_*`) and the
  book shows them.
- **Dark forests generated from now on.** A huge mushroom takes a tree's place, so the trees after it in that chunk
  come out differently from before (they draw on the same random). Only chunks generated from now on are affected;
  saved chunks keep what they have. The mushroom fields' huge mushrooms have a random of their own.
- **Flowers the game lacks.** The flower list names the wither rose (wither, 7 s) and the torchflower (night vision,
  5 s), which the game doesn't have yet. Their recipes and the wither stew in the creative tabs appear by themselves
  when those flowers arrive. So the creative tabs show 8 stews now; vanilla shows 9.

**Values I'm not sure of**
- **Stew durations.** I used the 1.20.2-and-later values: saturation 7 ticks (dandelion, blue orchid), night vision
  5 s (poppy, torchflower), fire resistance 3 s (allium), blindness 11 s (azure bluet), weakness 7 s (the tulips),
  regeneration 7 s (oxeye daisy), jump boost 5 s (cornflower), poison 11 s (lily of the valley), wither 7 s (wither
  rose). Older versions had some of these a second longer or shorter. I am fairly but not fully sure of this set.
- **Sounds.** All takes are synthesised to sound like vanilla's, not copied. The counts I believe vanilla has:
  convert 2, eat 4, milk 3 (the suspicious milk the same three).
- **The spawn egg's colours** (0xa00f10 and 0xb7b7b7) are from memory of vanilla `SpawnEggItem`.

**Choices where the brief was open** (the most vanilla-faithful option each time)
- **Vanilla quirks kept:**
  - lightning turns a mooshroom once per bolt, however many ticks the bolt flashes, and doesn't hurt it; the bolt
    still lights fire round it, as in vanilla;
  - a red huge mushroom's cap checks no room round its stem (vanilla's radius 0 for the red one), so it grows where a
    brown one wouldn't;
  - bone meal on a small mushroom is always used up, even when the huge mushroom fails (vanilla's
    `isBonemealSuccess` is a 40% roll and `isValidBonemealTarget` is always true);
  - small mushrooms in bright light away from mycelium, podzol or nylium break when a block next to them changes;
  - a calf can take a flower (vanilla only checks the colour), though it can't be milked or sheared.
- **Guests.** A guest's bowl, bucket, shears, flowers and wheat work on a mooshroom, the host deciding. What's in a
  brown mooshroom stays on the host, as vanilla keeps it on the server. Nothing is kept per player.

## 4. Tests and results

Run from the repository root with `node tests/remaining-mobs/<file>`. Each prints `ok`/`FAIL` lines and exits
non-zero on a failure.

| File | Checks | Result |
|---|---|---|
| `bee.mjs` | See below. | all pass (92), about 15 s |
| `bee-mp.mjs` | See below. | all pass (21), about 8 s |
| `phantom.mjs` | See below. | all pass (63), about 8 s |
| `phantom-mp.mjs` | See below. | all pass (13), about 8 s |
| `panda.mjs` | See below. | all pass (126), about 11 s |
| `panda-mp.mjs` | See below. | all pass (27), about 8 s |
| `mooshroom.mjs` | See below. | all pass (100), about 16 s |
| `mooshroom-mp.mjs` | See below. | all pass (20), about 7 s |
| `load-order.mjs` | See below. | all pass (3), about 9 s |

**`bee.mjs`** covers:
- **The bee:** health, speeds, attack, follow range, size, eyes, the baby, food, name, spawn egg, experience,
  sounds, no fall damage, hovering.
- **Flowers:** finding and pollinating one within 5 blocks, nectar, the pollinate sound, nectar specks, not in the
  rain, a sunflower's top.
- **Tempting and breeding.**
- **The hive:**
  - its block entity and point of interest;
  - a bee going in with nectar, its saved record, the hive learning its flower;
  - staying in at night, in the rain, or when blocked;
  - coming out by day, leaving honey, honey 0 to 5;
  - a homeless bee finding a hive within 20 blocks at night;
  - three bees at most.
- **Harvesting:**
  - shears: 3 honeycomb, one point of wear;
  - glass bottle: the honey bottle, the last bottle in hand;
  - angry bees with no smoke, calm ones with a campfire (5 blocks, not 6; unlit; soul campfire; one block in between
    but not two; carpets);
  - Bee Our Guest.
- **Breaking:**
  - by hand, a hive drops itself and a nest drops nothing, and the bees come out angry;
  - silk touch keeps the bees and honey, with the tooltip, Total Beelocation, and placing back facing the player;
  - creative; TNT; fire nearby; pistons can't move it.
- **The sting:** anger on being hit (20–39 s, spreading to bees that see it); the sting on easy, normal and hard
  (poison 0, 10 or 18 s); the lost stinger; dying within about a minute; rolling as it closes in.
- **Crops and water:** growing crops (at most 10 per pollination); drowning.
- **The honey block:**
  - speed factor 0.4, jump factor 0.5, collision box;
  - a 20-block fall does a fifth of the damage;
  - the slide (speed, fall distance reset, sound, particles), Sticky Situation;
  - pistons push and pull it with what's stuck to it.
- **Recipes and creative tabs.**
- **World generation:**
  - meadow trees at 100%, plains at 5%;
  - the nest faces south, with air in front, and holds 2 or 3 bees;
  - saplings grown near flowers.
- **Saving:** the bee's fields and a nest's bees.
- **`/summon` with entity data.**
- **Assets:** every sound name, and the loop lengths; the block sound groups; the four skins; the model parts; the
  renderer (skin choice, wings, rolling, shadow).

**`bee-mp.mjs`** (two players over the multiplayer harness) covers:
- **A guest's copy of a bee:** it has the host's nectar, anger, stinger, roll and baby size.
- **A guest's glass bottle on a full nest:** the host gives the honey bottle, the honey is gone for both, and the
  bees come out after the guest, who sees them angry.
- **A guest's silk-touch break:** the nest comes away with its bees and honey, and the guest picks it up and places
  it back. The guest's world doesn't know the bees inside (vanilla).
- **The mirror check:** the two worlds stay identical throughout.

**`phantom.mjs`** covers:
- **The phantom:** health, experience, size 0.9 × 0.5 and eyes, the bite (6 + size), undead, the monster category,
  its size from 0 to 64 (15% bigger a size), no fall damage, not keeping a player awake, its name, egg and sounds.
- **Loot:** a membrane half the time to a player's kill, never more than one, none otherwise; up to four with
  looting III.
- **Time since rest:** it counts up a tick at a time; a bed resets it and it stays 0 while asleep; death resets it;
  it's saved with the player, and an old save loads as 0.
- **The spawner:**
  - on hard, one to four phantoms together, 20 to 34 blocks over the player and at most 10 out; one to three and
    less often on normal; each try one to two minutes after the last;
  - none on peaceful, before three days, by day, under a roof, below sea level, for a spectator, with the
    `doInsomnia` rule off, with mob spawning off, or where the spot isn't open air;
  - four days awake is a quarter as likely as it can be; the natural spawner runs it.
- **Flight:** circling its anchor 5 to 15 blocks out, leaving a creative player be; finding a survival player, the
  swoop with its screech (volume 10), the anchor 20 to 39 blocks up, the bite (6 on normal) and its sound, pulling
  away and letting go, looking again about three seconds later; the highest of two players first; a cat breaking
  the swoop off with a hiss; a hurt breaking it off; burning by day and not by night.
- **Wings:** a `flap` game event every 25 ticks, the flap sound once a beat (volume and pitch 0.95–1), two mycelium
  specks a tick, the beat's clock.
- **Saving and `/summon`:** size and anchor saved; `/summon` with `Size` and `AX`/`AY`/`AZ`; without data it's made
  as a natural one (anchor 5 up); with data but no anchor it takes where it is.
- **Advancements:** Monster Hunter and Monsters Hunted count it; a piercing crossbow arrow killing two gives Two
  Birds, One Arrow.
- **Assets:** the 23 sound takes and the parrot's imitation; the skin (every box painted, the wingtips ragged),
  the eyes (only the eyes), the egg; the model's parts and wingbeat; the renderer (skin, then the eyes full bright
  and added; the size scale and the pitch; shadow 0.75).

**`phantom-mp.mjs`** (two players over the multiplayer harness) covers:
- **A guest's copy of a phantom:** its size and hitbox, its pitch, its wingbeat in time with the host's; the guest
  hears the flaps and sees the specks; the mirror check.
- **A guest's insomnia:** phantoms come over the guest, the guest sees them, and one bites it (9 on hard), with the
  hurt showing in the guest's game.
- **Sleeping:** the guest lies down in a bed with phantoms about (they don't keep it awake), and its insomnia resets.
- **Saved player data:** the guest's time since rest is kept when it leaves and is back when it rejoins.

**`panda.mjs`** covers:
- **Bamboo:**
  - planting: a shoot on grass, sand or gravel but not stone, never into water; stalk on a shoot (the shoot turning to
    stalk), thick on thick; hardness, sounds, no shoot item, the pick-block and drops;
  - growth: a shoot into stalk with small leaves, 12 to 16 tall (always done at 16), large leaves on the top two and
    small under them, thick all the way down, the top done growing and no more growth; none in the dark;
  - bone meal: a shoot at once, a stalk one or two more, not a finished one or a shoot with no room;
  - breaking: falling apart a block a tick from the bottom up, a bamboo each; a shoot with nothing under it; a sword
    at a stroke, anything else by hardness; pistons break it;
  - the offset: up to a quarter block, the collision post, the outline set off with it, wider with large leaves;
  - fire (60, 60), the flower pot, the stick, fuel 50, the creative tab, map colours;
  - worldgen: dozens of stalks a chunk in a bamboo jungle with podzol, a stalk now and then in a jungle, none in the
    plains; the sounds and textures.
- **The panda:**
  - numbers: health 20, speed 0.15, attack 6, size 1.3 × 1.25 (a cub half), eyes, category, pickup, no leash, food;
    its name and spawn egg;
  - genes: the random odds (checked over 160,000 draws), what shows (recessive brown and weak), by name, weak's 10
    health and lazy's 0.07 speed, spawned genes, inheritance with 1/32 mutations, a pack's cubs (one in five);
  - eating: going for bamboo within reach, taking the whole stack, sitting, munching every 5 ticks with 6 crumbs,
    finishing after 100 ticks with the eat game event, getting up; cake when it exists; a cub picks up but doesn't
    sit; not with mobGriefing off;
  - feeding and breeding: in love with one bamboo used; sulking (32 ticks, two grumbles) with no bamboo near; a cub
    with bamboo within 7; the breeding trigger for Two by Two; a cub growing a tenth of the way; one on cooldown sits
    and eats, dropping what it held; a click gets a panda off its back; a spawn egg gives a cub with its genes;
  - the sneeze: its timing, the cloud at the nose, grown pandas jumping (not a sitting one), slimeballs 1 in 700, the
    weak cub's rate (1 in 250 goal checks, plus 1 in 3000) against any other cub's;
  - rolling (32 ticks, the push, the hops), a lazy one on its back, a worried one cowering in a storm (refusing
    bamboo) and keeping away from players;
  - fighting: going for its attacker, the aggressive one joining in, the bite (6, its sound), calling it off after one
    bite, bamboo calling it off, getting up when hurt, panicking from fire but not a player's hit;
  - loot (one bamboo, a cub nothing), experience, sounds by gene, the step;
  - saving and loading (genes, health, speed), `/summon` with genes, without data, and an unknown gene;
  - spawning: the biome lists, the spawn rules (grass, light), a pack's cubs;
  - the particles, the skins (every box painted, the faces and snouts per gene), the model and its poses, the
    renderer (skin choice, sitting, the held bamboo, rolling, the shadow).

**`panda-mp.mjs`** (two players over the multiplayer harness) covers:
- **A guest's copy of a panda:** its genes and skin, sitting with bamboo in its paws, eating (the guest hears the
  munching and sees the crumbs), getting up, rolling (its counter), on its back, sulking, a cub's size, the sneeze
  (its count, the sounds, the cloud); the mirror check.
- **A guest's bamboo:** puts a panda in love on the host, one piece used on both sides; one on cooldown sits and eats
  it, which the guest sees; not a panda out of reach.
- **A guest's planting and cutting:** a shoot on grass, stalk on the shoot, the guest seeing both; a sword cuts the
  stalk at a stroke and the block above falls.

**`mooshroom.mjs`** covers:
- **The huge mushroom blocks:**
  - the brown and red caps and the stem: six sides each (64 states), all skin to begin with; hardness 0.2, wood's
    sound, an axe's; their models (skin on the true sides, uvlocked; the inside on the false ones) and items (in the
    natural blocks tab after the leaves);
  - placed against another of their own kind, the side between them closes on both, never to open again; not against
    another kind;
  - broken: a cap drops no small mushroom seven times in nine, and one or two the rest; the stem nothing; silk touch
    the block itself.
- **Small mushrooms:** they live on mycelium or podzol in full daylight, on stone only in the dark (a lamp's light
  counts), not on glass; they spread till five of a kind are about; bone meal grows a huge one four times in ten and
  is used either way; no growth without room (a block where the brown cap goes stops the brown, not the red).
- **Huge mushrooms:** the brown's flat cap 7 across with its corners cut and the red's dome of three rings with its
  3 by 3 roof, each face its skin or inside as vanilla has it; the stem 4 to 6 tall, one time in 12 twice that; one
  in every mushroom fields chunk (red or brown at even odds), none in the plains; in a dark forest, a brown one
  instead of a tree one time in 40 and a red one one time in 20 of the rest, and no other trees asking.
- **Mycelium's spores** (one tick in ten) and the four block textures.
- **The mooshroom:**
  - a cow's numbers (10 health, 0.2 speed, 0.9 by 1.4), a creature, red to begin with, its name, `/summon`, the spawn
    egg in its tab; mycelium the best ground to wander to;
  - the bowl (mushroom stew, the milking sound, the interaction game event; a stack of bowls; creative; not a calf);
    the bucket (milk);
  - shears: a cow in its place (health, name, turn, persistence kept), five mushrooms of its colour from the top of
    its back, the snip, the puff, the shear game event, a point of wear, the shears breaking on their last use; not a
    calf;
  - flowers to a brown one: one taken, its effect in it, four swirls and the munch (2 loud); a second one before a
    bowl goes up in smoke, not taken; then the bowl gives suspicious stew with that effect, with its own sound, and
    the next bowl plain stew; a red one takes none; a brown calf does; what each flower puts in;
  - lightning: red to brown once per bolt, whatever its flashes, unhurt and unburnt, with the shimmer (2 loud); the
    next bolt back to red; a bolt beside it;
  - breeding: wheat, a calf of their colour, the breeding trigger; a mooshroom and a cow don't mate; two of a colour
    have a calf of the other one time in 1024, two of different colours either at even odds; a spawn egg on one gives
    a calf of its colour; it counts for Two by Two;
  - loot and experience (a cow's), its voice (the cow's);
  - saving (`Type`, `stew_effects`); `/summon` with `Type`, with `stew_effects` (a missing duration is 160 ticks), an
    effect that doesn't exist (none taken), an unknown `Type` (red);
  - spawning: the mushroom fields' list (mooshrooms, weight 8, four to eight; no monsters; bats underground), the
    spawn rule (mycelium, raw light over 8 day or night, not grass, not the dark), the other animals' rule as it
    was (grass, not mycelium), herds in new chunks;
  - a dispenser's shears.
- **Suspicious stew:** the recipe in the 3 by 3 and 2 by 2 grids with a flower anywhere, nothing else allowed (the
  three without a flower still mushroom stew); the creative tabs' 8 stews in vanilla's order after the rabbit stew;
  the tooltip naming its effects only in creative mode; eating one (its effect, its food, the bowl back).
- **Looks:** both skins (the cow's layout, every box painted), the egg; the renderer (its own skin, three mushrooms of
  its colour where vanilla puts them, the head's one turning with the head, none on a calf or an invisible one, the
  shadow 0.7).

**`mooshroom-mp.mjs`** (two players over the multiplayer harness) covers:
- **A guest's copy of a mooshroom:** red as the host's, turned brown by lightning with the shimmer heard, a calf's
  size; gone when it is; the mirror check.
- **A guest's bowl, flower and shears:** mushroom stew in the guest's hand (the host deciding) with the milking heard;
  a flower taken into a brown one (the guest sees the swirls and hears the munch, but isn't told what's in it); the
  next bowl suspicious stew with the effect; shears leave a cow and five mushrooms on both sides, the puff seen and
  the snip heard, the shears worn.
- **A guest's bone meal:** a huge mushroom grows (the host growing it), the guest seeing it, one bone meal a try.
- **A guest in creative:** takes a suspicious stew from the creative tabs with its effect kept; a stew no tab has
  comes out plain on the host.

**`load-order.mjs`** loads the game's modules in `main.ts`'s order, as a browser does (section 1), and checks that
the beehive's dispenser hooks are set and that every mob this branch adds can be made.

**Also run**
- **`npm run typecheck`:** clean.
- **`node scripts/audio-check.mjs "entity\.bee|block\.beehive|block\.honey_block|block\.coral_block"`:** only "slow"
  flags, meaning a take needs 30–70 ms to generate. That's the long takes: the 3.2 s buzz loops and the hive's
  2-second hum. Sounds are made in a worker, like the minecart's and warden's long takes.
- **Textures:** viewed with `scripts/preview-textures.mjs`. The four bee skins (calm, angry, with nectar, both) have
  stripes, eyes that turn red when angry, pollen specks, pale wings, legs and stinger. The 13 block faces are the nest
  and hive, with and without honey, the honey block and the honeycomb block.
- **Regression before this commit** (`node scripts/regress.mjs -j 2`): see the summary below.
- **Milestone 2:** `node scripts/audio-check.mjs "^entity\.phantom"` flags only "slow" (21–35 ms) on the death and
  swoop takes, which carry a reverb tail. The skin, eyes and egg were viewed with `scripts/preview-textures.mjs`: a
  dark blue-grey body with a pale ridge, dusky wing membranes on pale bones, ragged trailing edges, and green eyes at
  the face's corners. Also rerun: `cat.mjs`, `parrot.mjs`, `rabbit.mjs`, `multiplayer/m4-playerdata.mjs`,
  `fixes/respawn.mjs`, `sounds/swim.mjs`, `bee.mjs` and `bee-mp.mjs` (all pass). The full regression runs before the
  last commit.
- **Milestone 3:** `node scripts/audio-check.mjs "entity\.panda|block\.bamboo"` gives no warnings. The skins were viewed
  with `scripts/preview-textures.mjs`: white fur with the black band round the shoulders, black legs and ears, the eye
  patches drooping outward, and each gene's face (sleepy slits, raised brows, a scowl, the tongue, the runny nose),
  and the brown panda's brown and tan. The regression was run for this milestone too (below): its first panda test
  run caught a slip in my change to `game/raycast.ts` (the block offset shadowed the ray's origin), fixed before this
  commit.
- **Milestone 4:** `node scripts/audio-check.mjs "entity\.mooshroom"` gives no warnings. The skins and the four block
  faces were viewed with `scripts/preview-textures.mjs`: a deep red hide dappled with pale grey spots, a grey muzzle
  and stockings (the brown one warm brown with cream), and the caps, stem and inside tiling without seams. **In a
  browser** (headless Chromium through Playwright, on the dev server and on `npm run build` plus `vite preview`), the
  game starts and loads a world. At `?seed=12345`, `/summon mooshroom` and `/summon mooshroom ~ ~ ~ {Type:"brown"}`
  showed red and brown mooshrooms with their three mushrooms (a calf with none). Bone meal's growth
  (`growHugeMushroom`) made a huge brown and a huge red mushroom on mycelium. I checked the screenshots.

**Regression summary (milestone 1)**: `node scripts/regress.mjs -j 2` passed 169 of 172 suites in 19.3 min.
- `tests/end/credits-music.mjs` crashed because the new bee buzz loop read `level.entities` from the test's stand-in
  level. The loop now accepts a level without entities, and the suite passes.
- `tests/drowned/drowned.mjs` ("at night it rises from the sea bed") is on the brief's known-flaky list. Run alone, it
  passed twice.
- `tests/end/dragon.mjs` ("a crystal heals a point every half second") depends on the dragon's own random: it looks
  for crystals again 1 tick in 10, and after 3000 ticks of flight it may be over 32 blocks from all of them. Run
  alone, it passed four times. It doesn't touch bee code.

**Regression summary (milestone 3)**: `node scripts/regress.mjs -j 3` passed 173 of 176 suites in 15.7 min.
- `tests/saves/player.mjs` failed on "the record has every field it had": the phantom milestone added `timeSinceRest`
  to the saved player and didn't update the test's list of fields. I missed it because milestone 2 had no full
  regression run. The list now has the field, and the suite passes.
- `tests/illagers/illagers.mjs` ("evoker conjures fangs") and `tests/illagers/raids.mjs` ("a farmer throws the hero
  bread…") are on the brief's known-flaky list. Run again on this branch and on main (93288e7, in a separate
  worktree), the same checks fail about as often on both: illagers failed 2 of 3 runs on the branch and 3 of 4 on
  main; raids failed 2 of 3 runs on each.
- I changed `game/interaction.ts` (the placement check) while the regression was running, so I reran every suite
  that drives `Interaction`, plus the shulker box, `saves/player.mjs` and the panda tests: 26 of 26 passed.
- From now on I run the full regression for every milestone.

**Regression summary (milestone 4)**: `node scripts/regress.mjs -j 2` passed 173 of 179 suites in 21.1 min.
- **`tests/llama/llama.mjs` caught a real bug of mine**: "llamas come in windswept_hills" and "savanna_plateau" found
  none. In the spawner's spawn-rule switch, I had put the mooshroom's `case` (with its `return`) just below the farm
  animals' shared cases, so the pig, cow, sheep, chicken, horse, donkey, mule, llama and trader llama all fell into the
  mooshroom's rule and could only spawn on mycelium. The mooshroom's case now stands on its own above them. A new
  check in `mooshroom.mjs` ("the other animals' as they were") fails with the old order and passes now. The llama
  suite passes.
- `tests/drowned/drowned.mjs` ("at night it rises from the sea bed") and `tests/illagers/illagers.mjs` ("evoker
  conjures fangs") are on the brief's known-flaky list. Both pass run alone.
- `tests/ancient-city/m2-city.mjs` failed its timing check ("the city's chunks take at most half as long again as
  without it": 63.5 vs 40.0 ms) with two suites running at once. It measures time on a busy machine, and it passes
  run alone.
- `tests/end/dragon.mjs` ("flaming: at 10 ticks a cloud of radius 5 on the ground in front of its head") and
  `tests/end/silverfish.mjs` ("a fall doesn't wake them", where the silverfish merged into the stone) each failed once.
  Both depend on the mob's own random, and both passed three more times on this branch and three times on main.
- Rerun after the fix, with the final code: all nine remaining-mobs suites, and the suites that test spawning or the
  animals near it (llama, polar bear, biome mobs, frog, fox, parrot, goat, rabbit, ocelot, horse, horse inventory,
  wolf). All pass. `wolf.mjs` (known-flaky) failed once on "within ten blocks it stays put" and then passed four times
  on the branch and four times on main.

## 5. Browser checklist

Start at `http://localhost:5173/?seed=12345` (`npm run dev`) in creative. For the angry-bee checks, use
`/gamemode survival` with `/effect give @s minecraft:resistance 99999 4`, since bees ignore creative players.

### Milestone 1: the bee

- **Finding bees:**
  - `/tp @s -85 90 -120` is south of a birch-forest bee nest at -85, 84, -125 (2 bees). Its front, with the hole,
    faces south.
  - `/tp @s 185 110 -166` is by a meadow nest at 185, 103, -171 (3 bees).
  - By day, the bees come out, drift about, and hover over flowers. Each goes back in after a while, dusted with
    pollen: the skin has white specks and pale drops fall from it. The nest's front fills with honey over time.
- **Summoning:**
  - `/summon minecraft:bee ~ ~1 ~3` makes a bee. `{HasNectar:1b}` gives it pollen; `{Age:-24000}` makes a baby.
  - The spawn egg is in the spawn eggs tab (yellow with dark brown spots).
  - Check the wings beat fast in flight and lie folded when it sits on the ground. A calm bee bobs gently, its
    antennae and legs swaying; an angry one flies level.
  - The buzz follows the bee. It's louder and higher-pitched the faster the bee flies, higher still for a baby, and
    silent while it hovers still.
- **A hive and honey:**
  1. `/time set night`, then `/setblock ~3 ~ ~ minecraft:beehive[facing=south,honey_level=5]`. This is a full hive
     with honey oozing from its front. Honey drips from underneath now and then, with a soft drip sound.
  2. `/summon minecraft:bee ~ ~1 ~` twice. The bees find the hive and go in, and stay in until
     morning. A hive with bees inside hums now and then.
  3. `/gamemode survival`, then use shears on the hive: 3 honeycomb, and the front empties. The bees burst out,
     red-eyed, and chase you.
  4. A glass bottle on a full hive gives a honey bottle instead. With a lit campfire up to 5 blocks under the hive
     (`/setblock ~3 ~ ~ minecraft:campfire` then `/setblock ~3 ~2 ~ minecraft:beehive[facing=south,honey_level=5]`),
     the bees stay calm and Bee Our Guest is awarded.
- **The sting** (survival, `/difficulty normal`): hit a bee. It and any bee nearby that sees it go red-eyed and fly at
  you, rolling over as they close in. A sting poisons you for 10 seconds (18 on hard, none on easy). The bee loses its
  stinger (it's gone from the model), calms down, and dies within about a minute.
- **Silk touch:**
  1. `/give @s minecraft:diamond_pickaxe`, then `/enchant @s minecraft:silk_touch`.
  2. Break a nest that has bees. The dropped nest's tooltip says "Bees: n / 3" and "Honey: n / 5".
  3. Place it back: the bees come out of it later.
  4. Break a nest with 3 bees for Total Beelocation.
  5. Without silk touch, a nest breaks to nothing and a hive drops itself; either way the bees come out angry.
- **The honey block:** `/give @s minecraft:honey_block 16` (in the natural and redstone tabs).
  - Walking on it is slow, and jumping only reaches about half height.
  - Build a wall of honey 20 blocks high and jump down beside it, pressing into it. You slide down slowly with a
    sticky sound and honey specks, take no fall damage, and get Sticky Situation.
  - A fall straight onto a honey block does a fifth of the damage.
  - A piston pushing a honey block moves the blocks stuck to it; a sticky piston pulls them back.
- **Recipes:**
  - honeycomb in the middle row with planks above and below: a beehive;
  - 4 honey bottles: a honey block, which gives 4 bottles back with 4 glass bottles;
  - a honey bottle: 3 sugar;
  - 4 honeycomb: a honeycomb block.
- **Sapling:** plant an oak or birch sapling with a flower next to it and bone meal it. About 1 tree in 20 grows with
  a nest.
- **LAN guest:** open a second window, host with Esc → Open to LAN, and join from the other window's Multiplayer
  screen. The guest should see:
  - the bees and their buzzing, nectar specks, red eyes, and the roll;
  - a baby's size;
  - honey appearing on a hive.

  The guest can bottle or shear a full hive, and the bees then chase the guest. In survival, the guest can break a
  nest with a silk-touch tool and place it back with its bees.

### Milestone 2: the phantom

- **Summoning** (`/time set night`, then `/gamemode survival`):
  - `/summon minecraft:phantom ~ ~12 ~` makes a phantom. It circles high, then screeches and swoops at you, bites
    and pulls away, and does it again a few seconds later.
  - Check the long wings beat slowly with a leathery flap, the tail sways, grey specks trail from the wingtips,
    the body tips nose-down as it dives, and the green eyes glow in the dark.
  - `/summon minecraft:phantom ~ ~12 ~ {Size:20}` is a much bigger one (four times the size) with a harder bite.
  - The spawn egg is in the spawn eggs tab (blue-grey with bright green spots).
  - With a cat (`/summon minecraft:cat`) near you, a phantom gives up its swoop as the cat hisses.
  - At sunrise (`/time set day`), phantoms under the open sky catch fire.
  - Kill one in survival: it sometimes drops a phantom membrane.
- **Insomnia** (the natural spawn): phantoms come after three in-game days without lying in a bed, which is an hour
  of play. To test it quickly, in survival, at night, out under the open sky, open the browser console and enter
  `__game.player.timeSinceRest = 200000; __game.spawner.phantoms.nextTick = 1`. The next tick is a try: on normal it
  brings one to three phantoms 20 to 34 blocks overhead about one time in three (one to four, about half the time, on
  hard). If none come, enter `__game.spawner.phantoms.nextTick = 1` again rather than waiting the one to two minutes
  to the next try. Then lie in a bed (it can be slept in with phantoms about) and check that
  `__game.player.timeSinceRest` is 0.
- **Two Birds, One Arrow:** with a Piercing crossbow, shoot through two phantoms in a line.
- **LAN guest:** open a second window, host with Esc → Open to LAN, and join from the other window's Multiplayer
  screen. The guest should see phantoms with their size, wingbeat, specks and glowing eyes, and hear the flaps and
  screeches. A survival guest is chased and bitten, and can sleep in a bed with phantoms about.

### Milestone 3: the panda and bamboo

- **Finding them:** at seed 12345 the nearest large bamboo jungle is about 3,000 blocks north:
  `/tp @s 790 90 -2930`. There is a small patch at `/tp @s 955 80 1800`. (Correction: an earlier version of this
  report said `/locate biome` finds one. It doesn't: the game's `/locate` finds structures only.) Check:
  - thick bamboo stalks standing off-centre in their blocks, large leaves at the tops, and podzol round some clumps;
  - pandas among them (spawned with the chunks, and after that as any animal);
  - in an ordinary jungle, a lone stalk now and then.
- **Summoning:**
  - `/summon minecraft:panda ~ ~ ~3` is a random one. `{MainGene:"brown",HiddenGene:"brown"}` is the brown panda;
    use `lazy`, `worried`, `playful`, `aggressive` or `weak` (for weak, both genes) for the others, and add
    `,Age:-24000` for a cub.
  - Each gene has its own face: sleepy slits (lazy), raised brows and sideways eyes (worried), a scowl (aggressive),
    the tongue out (playful), bleary eyes and a runny nose (weak).
  - The spawn egg is in the spawn eggs tab (white with black spots).
- **Bamboo in its paws:**
  1. Drop bamboo (Q) a few blocks from a grown panda. It walks over, takes the whole stack and sits back on its
     haunches with it.
  2. After a while it munches: its head bobs, bamboo crumbs fly, and you hear chewing.
  3. It eats the lot and gets up.
  4. Now and then it gets up before it's done and drops what's left.
- **Breeding:**
  1. Feed bamboo to two grown pandas with no bamboo growing within about 7 blocks. They shake their heads and grumble
     twice.
  2. Plant bamboo next to them, wait for the love hearts to end (about 30 s), and feed them again. A cub comes.
  3. Bamboo fed to a cub makes it grow up faster.
- **The cub's sneeze:** `/summon minecraft:panda ~ ~ ~3 {MainGene:"weak",HiddenGene:"weak",Age:-24000}` sneezes
  often. It draws a breath with its head back, then sneezes a green cloud. Grown pandas nearby jump. Sometimes a
  slimeball comes out.
- **Moods:**
  - a lazy panda lies on its back now and then, paws waving; clicking it gets it up;
  - a playful one rolls head over heels;
  - with `/weather thunder`, a worried one cowers where it is, trembling, and it keeps away from you in fine weather;
  - in survival, hit a panda: it bites you once and calms down. An aggressive one keeps on, and joins in when you
    hit one near it. Bamboo calls a fight off.
  - Killed, a panda drops one bamboo (a cub nothing).
- **Bamboo:**
  1. Plant it on grass, dirt, sand or gravel: a shoot. `/gamerule randomTickSpeed 300` speeds things up. The shoot
     grows into a stalk that gets thick, leafs out at the top and stops at 12 to 16 blocks.
  2. Bone meal grows a stalk one or two blocks at a time.
  3. The block outline sits on the stalk, set off with it.
  4. A sword cuts it at a stroke, and the stalk above falls apart block by block from the bottom up. A piston breaks
     it.
  5. It goes in a flower pot; two bamboo, one above the other, make a stick; it burns in a furnace.
  6. Listen for the hollow knock when placing and breaking it, and the rustle when walking by.
- **LAN guest:** open a second window, host with Esc → Open to LAN, and join from the other window's Multiplayer
  screen. The guest should see:
  - each panda's skin;
  - sitting and munching, with the crumbs and the bamboo in its paws;
  - rolling, lying on its back, sulking and a cub's sneeze.

  The guest can feed pandas bamboo (they fall in love, or sit and eat it), plant bamboo and cut it with a sword.

### Milestone 4: the mooshroom and huge mushrooms

- **Finding them:**
  - At seed 12345 the nearest large mushroom island is about 8,000 blocks north: `/tp @s 1684 85 -8256` lands in
    its middle, on mycelium. The island is about 250 blocks across. Check:
    - huge mushrooms all over it (a huge brown one stands at 1638, 80, -8298 and a red one at 1641, 80, -8283);
    - small mushrooms about, and grey spores drifting up off the mycelium;
    - herds of red mooshrooms (spawned with one chunk in ten, four to eight together);
    - no zombies or skeletons at night on the surface (`/time set night`).
  - A dark forest west of spawn: `/tp @s -262 85 -45` looks over a huge brown mushroom at -268, 72, -52 and a huge
    red one at -272, 67, -27, each standing where a tree would.
  - There is no `/locate biome` in the game (see milestone 3's correction).
- **Summoning:**
  - `/summon minecraft:mooshroom ~ ~ ~3` is a red one; `{Type:"brown"}` a brown one; `{Age:-24000}` a calf, which
    has no mushrooms.
  - Check the two mushrooms on its back and the one on its head (turning with its head), the red or brown hide with
    its pale spots, and that it walks and moos like a cow.
  - The spawn egg is in the spawn eggs tab (dark red with grey spots).
- **What a mooshroom gives** (`/gamemode survival` to see items used up):
  1. A bowl on a grown one: mushroom stew, with a slurping milk sound. A bucket: milk.
  2. Shears on a red one: a puff of smoke, and it's a plain cow, with five red mushrooms popping out of it. A name
     tag's name stays on the cow.
  3. A dispenser with shears in front of one does the same.
- **Suspicious stew:**
  1. `/summon minecraft:mooshroom ~ ~ ~3 {Type:"brown"}`, then use a small flower on it (for example an oxeye daisy).
     It munches loudly and gives off swirls, and the flower is used.
  2. Use a second flower: two wisps of smoke, and the flower isn't taken.
  3. A bowl now gives suspicious stew. Eating it gives the flower's effect (the oxeye daisy: regeneration for
     7 seconds). The next bowl is plain mushroom stew again.
  4. Crafting: a bowl, a brown mushroom, a red mushroom and a flower, anywhere in the grid (the 2 by 2 too), make
     suspicious stew.
  5. The creative food tab has 8 suspicious stews after the rabbit stew. In creative mode their tooltips name the
     effect and its length; in survival they don't.
  6. `/summon minecraft:mooshroom ~ ~ ~3 {Type:"brown",stew_effects:[{id:"minecraft:night_vision",duration:200}]}`
     gives a brown one whose next bowl is a 10-second night vision stew.
- **Lightning:** `/summon minecraft:mooshroom ~ ~ ~6`, then `/summon minecraft:lightning_bolt ~ ~ ~7` (a bolt within
  3 blocks of it). The red one turns brown with a rising shimmer and isn't hurt. Another bolt turns it back. Fire the
  bolt starts can still burn it, as in vanilla.
- **Breeding:** wheat on two red ones gives a red calf (about one in a thousand is brown). A red and a brown one
  have a calf of either colour. A mooshroom counts for Two by Two.
- **Huge mushrooms from bone meal:**
  1. Put a red or brown mushroom on mycelium or podzol (or on stone somewhere dark) with room above it.
  2. Bone meal it: about four times in ten it grows into a huge mushroom, 4 to 6 blocks tall (now and then twice
     that). A brown one has a flat cap 7 across; a red one a dome hanging down round its stem.
  3. A brown one needs clear room round its upper stem; a red one only its stem's column.
- **The huge mushroom blocks:**
  - A cap breaks quickly, fastest with an axe, and drops 0 to 2 small mushrooms (usually none); the stem drops
    nothing; with silk touch each drops itself.
  - Placed side by side, two caps (or two stems) close the face between them, showing the pale inside.
  - The three blocks are in the natural blocks tab after the flowering azalea leaves.
- **Small mushrooms:** in bright light they only live on mycelium, podzol or nylium. Placed on stone in daylight they
  can't be placed; one on stone in a dark cave lives, and it breaks if a torch lights it up and a block next to it
  changes. With `/gamerule randomTickSpeed 300` they spread slowly to spots near them, till five of a kind are about.
- **LAN guest:** open a second window, host with Esc → Open to LAN, and join from the other window's Multiplayer
  screen. The guest should see:
  - red and brown mooshrooms with their mushrooms, and calves without;
  - a mooshroom turning colour when struck by lightning, and hear the shimmer;
  - the swirls, the smoke, the shearing puff and the cow left behind, and huge mushrooms grown by anyone.

  The guest can milk a mooshroom with a bowl or a bucket, feed a brown one flowers and get suspicious stew, shear
  one, breed them with wheat, and grow huge mushrooms with bone meal.
