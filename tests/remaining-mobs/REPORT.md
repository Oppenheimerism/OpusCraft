# Remaining mobs: report

The missing Java 1.21 mobs, one milestone at a time, in the brief's order. Everything is procedural: textures, models
and sounds are drawn or synthesised by the game's own code, and no Mojang asset is used.

## 1. Branch and milestones

Branch: `claude/optimistic-volta-xe2bah`, from main at 93288e7.

| # | Milestone | State | Commit |
|---|---|---|---|
| 1 | Bee: bee nest, beehive, honey bottle, honeycomb, honey block, honeycomb block | done | `295bada` "Bees. Bee nests hang from trees in meadows (every tree there), plains, sunflower plains, cherry groves and flower forests, …" |
| 2 | Phantom and insomnia | done | the commit that adds this row ("Phantoms. …") |
| 3 | Panda and bamboo | not started | |
| 4 | Mooshroom and huge mushrooms | not started | |
| 5 | Armadillo, scutes and wolf armour | not started | |
| 6 | Camel | not started | |
| 7 | Sniffer | not started | |
| 8 | Allay | not started | |
| 9 | Endermite | not started | |
| 10 | Skeleton horse trap and zombie horse | not started | |
| 11 | Wither (the beacon only if everything else is done) | not started | |

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

## 4. Tests and results

Run from the repository root with `node tests/remaining-mobs/<file>`. Each prints `ok`/`FAIL` lines and exits
non-zero on a failure.

| File | Checks | Result |
|---|---|---|
| `bee.mjs` | See below. | all pass (92), about 15 s |
| `bee-mp.mjs` | See below. | all pass (21), about 8 s |
| `phantom.mjs` | See below. | all pass (63), about 8 s |
| `phantom-mp.mjs` | See below. | all pass (13), about 8 s |

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

**Regression summary (milestone 1)**: `node scripts/regress.mjs -j 2` passed 169 of 172 suites in 19.3 min.
- `tests/end/credits-music.mjs` crashed because the new bee buzz loop read `level.entities` from the test's stand-in
  level. The loop now accepts a level without entities, and the suite passes.
- `tests/drowned/drowned.mjs` ("at night it rises from the sea bed") is on the brief's known-flaky list. Run alone, it
  passed twice.
- `tests/end/dragon.mjs` ("a crystal heals a point every half second") depends on the dragon's own random: it looks
  for crystals again 1 tick in 10, and after 3000 ticks of flight it may be over 32 blocks from all of them. Run
  alone, it passed four times. It doesn't touch bee code.

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
