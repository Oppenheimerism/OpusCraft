# Trial chambers: report

## 1. Branch and milestones

Branch: `claude/kind-mccarthy-eu2t01` (from main at ac9d889).

| Milestone | State | Commits |
|---|---|---|
| M1 tuff, copper, lightning rod, items | done | (the commit that adds this report) The copper age: tuff blocks, every copper block weathering … |
| M2 trial spawner and vault | not started | |
| M3 trial chambers and `/locate` | not started | |
| M4 breeze, wind charges, bogged, mace | not started | |
| M5 crafter and advancements | not started | |

## 2. Shared files changed, and hooks

All small and additive; each new line is marked `(trial chambers)`.

- `src/world/blocks.ts`: `stairBoxes` and `stairVariant` exported (for the tuff and copper stairs); `registerTuffBlocks()`,
  `registerCopperBlocks()` and `registerTrialChamberBlocks()` called after `registerFrogBlocks()` (new
  `blocksTuff.ts`, `blocksCopper.ts`, `blocksTrialChambers.ts`).
- `src/world/blocksExtra.ts`: `registerDoor` and `registerTrapdoor` exported, with an optional `extra: BlockSettings`
  spread last (the copper doors' resistance, weathering, map colour).
- `src/item/item.ts`: `registerTrialChamberItems(reg, ITEMS, ITEM_LIST)` before the sugar cane block (new
  `src/item/itemsTrialChambers.ts`: the new items and every creative-tab position).
- `src/textures/blocks.ts`: `registerTuffTextures`, `registerCopperTextures`, `registerTrialChamberTextures` after
  `registerOuterEndTextures(T)` (new `blocklib/tuff.ts`, `copper.ts`, `trialChambers.ts`). The copper bulb textures
  replace the icon-only `oxidized_copper_bulb` the advancements used; it's drawn the same way.
- `src/textures/items.ts`: `...TRIAL_CHAMBER_ITEMS` last (new `itemlib/trialChambers.ts`: the copper door sprites, the
  breeze rod).
- `src/textures/decoratedPot.ts`: three new `MOTIFS` (flow, guster, scrape); `src/textures/itemlib/archaeology.ts`:
  their sherd shapes in `SHARD_LIKE`; `src/game/decoratedPot.ts`: the three in `SHERDS`.
- `src/audio/synth.ts`: `Object.assign(SOUNDS, copperTuffSounds())` after the frogs' (new `src/audio/gen/copperTuff.ts`);
  `src/audio/gen/blocks.ts`: `stoneStep` and `stoneBreak` exported (tuff's sounds build on them). The discs' songs:
  `MUSIC_POOLS` also lists `DISC_MUSIC_POOLS`, and `generatePoolMusic` renders them (new `src/audio/gen/discMusic.ts`);
  `src/audio/gen/music.ts` only gained `export` on `MODES`, `parseChords`, `parseMelody`, `degMidi`, `TrackDef`,
  `renderTrack` and the types they use.
- `src/game/level.ts`: `import { findLightningRod } from './copper'` (new `src/game/copper.ts`, which also registers all
  the copper behaviour); in `findLightningTargetAround` the `(no lightning rods yet)` comment became the rod lookup.
- `src/entity/lightning.ts`: at the strike, `lightningStruck(lvl, this)` (vanilla powerLightningRod and
  clearCopperOnLightningStrike); before the bolt goes, `lightningStrikeTrigger(lvl, this, this.hitEntities)`. A
  `(deep dark hook)` comment marks where vanilla's `GameEvent.LIGHTNING_STRIKE` goes.
- `src/game/advancements.ts`: criteria `item_used_on_block` and `lightning_strike`, their payload fields and `matches`
  cases; Wax On, Wax Off, Lighten Up and Surge Protector now have them (they were `never`).
- `src/game/poi.ts`: the `lightning_rod` point of interest (no tickets).
- `src/game/shapeUpdates.ts`: the door rule takes any door as the other half and copies its state (vanilla 1.20.3
  DoorBlock), so a copper door's halves weather and get waxed together.
- `src/game/redstone/components.ts` (`openSound`): copper doors and trapdoors play their own sounds.
  `src/game/redstone/signal.ts`: copper bulbs don't conduct redstone.
- `src/render/particles.ts`: `wax_on`, `wax_off`, `scrape` and `electric_spark` (vanilla GlowParticle's providers).
- `src/inventory/recipes.ts`: `registerTrialChamberRecipes(shaped, shapeless)` before the pruning loop;
  `src/inventory/stonecutting.ts`: `...TRIAL_CHAMBER_STONECUTTING` at the end of the families (new
  `src/inventory/recipesTrialChambers.ts`); `src/inventory/recipeBook.ts`: `craftingCategory(result, r?)` puts waxing
  under building blocks, the bulbs under redstone, cut/chiseled copper and grates under building, the mace and wind
  charge under equipment; the two copper ingot recipes share vanilla's group.

## 3. Open points, deviations, uncertain values, hooks

- **Copper doors and trapdoors need any pickaxe** (tier 0) for their drop, the rest of the copper a stone one. I'm not
  sure vanilla's `needs_stone_tool` leaves the doors out; it's one setting in `blocksCopper.ts` if not.
- **Tuff bricks** are drawn as vertical bricks, and the chiseled blocks as a column top and a carved side; my own art.
- **One creative tab per item.** Vanilla lists the lightning rod under both functional and redstone blocks and the
  waxed copper bulbs under both building and redstone; here the rod is functional (after the suspicious gravel) and the
  bulbs are building. The heavy core sits in ingredients after the breeze rod (I'm not sure of vanilla's spot); the
  trial keys at the end of ingredients; the wind charge just before the bow (vanilla has snowballs and eggs in combat
  first; here they're ingredients).
- **Lighten Up** also counts the waxed exposed, weathered and oxidized bulbs, as vanilla's criterion lists them (taking
  the wax off doesn't make them brighter, but vanilla awards it).
- **Comparators don't exist yet.** `copperBulbAnalogOutput(state)` in `game/copper.ts` is the hook (15 lit, 0 out).
- **No jukebox yet.** The three discs' songs are original procedural pieces of about vanilla's lengths (176, 73 and
  299 s), served as music pools `music_disc.creator`, `music_disc.creator_music_box` and `music_disc.precipice`
  (`DISC_SONGS` in `gen/discMusic.ts` also has each disc's comparator level for the jukebox). Nothing plays them
  until there's a jukebox; the game's older discs have no songs at all.
- **Banner patterns**: the flow and guster banner patterns were already in the game; the vaults give them (M2).
- **Trims don't exist yet.** The bolt and flow armour trim templates are for the vaults' loot (M2), as other loot
  tables already name templates the game doesn't have.
- **Lightning rods in unloaded chunks** aren't found (the points of interest live with loaded chunks); vanilla reads
  them from disk. The "top of its column" test uses the game's heightmap, which skips blocks without collision.
- **Deep dark hook**: `(deep dark hook)` in `src/entity/lightning.ts` for `GameEvent.LIGHTNING_STRIKE`. Scraping,
  waxing and bulb toggles would send `BLOCK_CHANGE` in vanilla; they go through `level.setBlock`, where a general hook
  would catch them.
- Every copper block weathers with vanilla's odds and neighbour rule. A random tick tries with chance 0.05688889, then
  ((older + 1) / (older + same + 1))², three quarters of that for bare copper. It never ages while any copper within
  4 blocks (Manhattan distance) is younger. Doors weather from the lower half.

## 4. Tests and results

Run from the repository root with `node tests/trial-chambers/<file>`; each prints `ok`/`FAIL` lines and exits non-zero
on a failure.

| File | Checks | Result |
|---|---|---|
| `m1a-blocks.mjs` | all 13 tuff and 72 copper blocks, strength, tools, sounds, map colours, light, shapes, drops; the items and their creative-tab positions; every crafting and stonecutting recipe and its recipe book category | all pass (83) |
| `m1b-copper.mjs` | weathering odds and neighbour rule (and 40000 ticks against the expected rate), doors weathering together, random ticks through the level; the axe and honeycomb through the game's interaction (scrape, wax off, the shield rule, sneaking on doors, creative); the bulb's rising-edge toggle and light; the lightning rod: what it draws, its power and strong power, 8 ticks, the struck copper cleaned, the waxed left alone; channeling; the four advancements | all pass (83) |
| `m1c-assets.mjs` | every texture of every state of the 87 new blocks, each age different and greener, the bulbs, the rod; item icons; the seven sound groups and every sound the copper plays, rendered clean; the glow particles' colours, speeds and lifetimes; the sherds on a pot; the three disc songs' lengths and levels | all pass (39) |

Also run: `npm run typecheck` (clean); `tests/temples/*` and `tests/mansion/*` (all pass); `scripts/audio-check.mjs` (no
warnings for the new sounds).

## 5. Browser checklist

Start at `http://localhost:5173/?seed=12345` in creative.

- **Blocks**: every tuff and copper block is in the building tab, tuff before the bricks and copper after the block of
  copper. The lightning rod is in the functional tab. The heavy core, breeze rod and trial keys are in ingredients. The
  mace and wind charge are in combat. The discs are in tools.
- **Weathering**: `/gamerule randomTickSpeed 1000`, lay a patch of copper and watch it go exposed, weathered and
  oxidized. A younger block nearby holds the rest back.
- **Axe and honeycomb**: right-click copper with an axe to scrape an age off, with teal sparks. Honeycomb waxes it with
  amber sparks, and an axe takes the wax off with white sparks. A copper door opens unless you sneak.
- **Copper bulb**: a lever next to it toggles it on each flick on. It stays lit when the lever goes off. The light is
  15, 12, 8 or 4 by age.
- **Lightning rod**: `/weather thunder`, put a rod on a copper block under the sky, then
  `/summon lightning_bolt <rod x> <rod y + 1> <rod z>`. The rod sparks and glows, pulses redstone for 8 ticks, and the
  copper under it turns bare with patches round it cleaned. With a villager about 10 blocks off and no fire, Surge
  Protector is awarded.
- **Recipes**: 3 copper ingots stood up make a lightning rod. A breeze rod makes 4 wind charges. The heavy core on a
  breeze rod makes a mace. Tuff and copper go through the stonecutter.
