# Trial chambers: report

## 1. Branch and milestones

Branch: `claude/kind-mccarthy-eu2t01` (from main at ac9d889).

| Milestone | State | Commits |
|---|---|---|
| M1 tuff, copper, lightning rod, items | done | 307e1f4 (the blocks, items, recipes and advancements), e6fd0e4 (the three discs' songs) |
| M2 trial spawner and vault | done | 1df4069 |
| M3 trial chambers and `/locate` | done | f5b4e0d |
| M4 breeze, wind charges, bogged, mace | done | fa07a44 |
| M5 crafter and advancements | done | the commit that adds this line ("The crafter, and five more advancements. …") |

## 2. Shared files changed, and hooks

All small and additive; each new line is marked `(trial chambers)`.

### M1

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

### M2

- `src/game/level.ts`: `import './trialChambers'` (new `src/game/trialChambers.ts`, which loads the trial spawner, the
  vault and the honey bottle).
- `src/game/baseSpawner.ts`: `spawnRulesOk` exported (a trial spawner checks the same rules).
- `src/game/interaction.ts`: a spawn egg used on a trial spawner sets its mob, as on a spawner. A drinking item's gulp
  is its own `drinkSound` if it has one (vanilla `getDrinkingSound`; the honey bottle's). `src/game/itemBehavior.ts`:
  the optional `drinkSound` field.
- `src/game/loot.ts`: two optional fields and their three lines in `rollLoot`: a pool's `chance` (vanilla
  `random_chance` on the pool) and an entry's `table` (vanilla nested `loot_table` entries). The trial chambers'
  tables are in the new `src/game/trialChamberLoot.ts`.
- `src/game/commands.ts`: `/setblock` reads block entity data after the block (`{...}`, spaces allowed, the mode after
  it) and hands it to the new block entity's `readBlockEntityData(nbt)` if it has one; `parseBlock` drops the data
  from the block name. New `src/game/snbt.ts` reads the data.
- `src/game/advancements.ts`: `item_used_on_block` takes an optional `state` (block properties to match), and the
  payload carries the block's properties. Under Lock and Key and Revaulting now have criteria (they were `never`).
- `src/entity/effects.ts`: Trial Omen swirls its own `trial_omen` particle.
- `src/render/entityRenderers.ts`: a `TrialChamberRenderers` field; one call after the archaeology renderers (the
  trial spawner's mob and the vault's item, drawn in their cages through the spawner's `base` pose), one branch for
  the ominous item spawner. New `src/render/trialChamberRenderers.ts`.
- `src/render/particles.ts`: `trial_spawner_detection(_ominous)`, `ominous_spawning`, `vault_connection`, `small_flame`
  and `trial_omen`, and four optional particle fields for them (`straight`, `colorLerp`, `lifetimeAlpha`, `upright`).
  `src/render/particleAtlas.ts`: their sprites (new `src/textures/trialChamberParticles.ts`).
- `src/audio/synth.ts`: `Object.assign(SOUNDS, trialChamberSounds())` (new `src/audio/gen/trialChambers.ts`).
- `src/textures/itemlib/smithing.ts`: `tablet` exported (for the two new trim templates).
- New files besides those: `src/game/trialSpawner.ts`, `src/game/vault.ts`, `src/game/trialChamberSight.ts`,
  `src/game/honeyBottle.ts` and `src/entity/ominousItemSpawner.ts`.

### M3

- `src/world/gen/generator.ts`: imports `TrialChambers` and `quartBiome3d` (new `src/world/gen/trialChambers.ts`), a
  `trialChambers` field, placed in the underground structures' step after the mineshafts and buried treasure and
  before the fossils (vanilla `UNDERGROUND_STRUCTURES`), and `encapsulateFor(cx, cz)` added to the beard line (the
  ground round them filled in).
- `src/world/gen/jigsaw.ts`: `jigsawAssemble` takes two optional parameters, `padding` (vanilla `DimensionPadding`)
  and `alias` (vanilla `PoolAliasLookup`); `beard` is exported. Connectors can carry vanilla's `selection_priority`
  and `placement_priority` (`selection`, `placement`): a piece's connectors are sorted by the first after shuffling,
  and the queue of pieces is vanilla's `SequencedPriorityIterator`. With every priority 0, as in all the other
  structures, it's the same breadth-first queue as before (the temples', mansion's and villages' tests are unchanged).
- `src/game/commands.ts`: `/locate structure trial_chambers` (new `src/game/trialChamberStructure.ts`, which also has
  `inTrialChambers` for M5's advancement).
- `src/game/decoratedPot.ts`: a pot can hold a loot table (`lootTable`, `lootSeed`, `unpackLoot`, saved and loaded),
  rolled the first time it's looked in or broken, as vanilla's `RandomizableContainer`.
- `src/game/trialChamberLoot.ts` (M2's): the structure's chest, barrel, dispenser and pot tables.
- New besides: `src/world/gen/trialChamberPieces.ts` (the template grid, the pool element with the processors) and
  `src/world/gen/trialChamberTemplates.ts` (every piece and pool).

### M4

- `src/entity/entity.ts`: `FALL_HOOKS` (`landing`, `moved`), called from `checkFallDamage`. They say how much of a
  landing's fall counts and keep a player's current impulse from move to move (vanilla `Player.currentImpulseImpactPos`
  and the rest). New `src/game/windBurst.ts` sets them.
- `src/entity/living.ts` (the lead's file; one hook): `ARMOR_EFFECTIVENESS.modify`, applied in `damageAfterArmor`
  (vanilla `modifyArmorEffectiveness`, for the mace's Breach). New `src/game/mace.ts` sets it round the blow. Nothing
  else in the file changed.
- `src/entity/arrow.ts`, `throwable.ts`, `fireball.ts`, `fireworkRocket.ts`: before striking an entity they ask
  `deflectedBy` (new `src/entity/projectileDeflection.ts`), so a breeze turns them back.
- `src/entity/ai/brainBehaviors.ts`: `moveToTargetSink(o)` takes vanilla's `min` and `max` run times and a subclass's
  own `start` and `stop` (the breeze's slide). Called with no argument, it is as before.
- `src/entity/monsters.ts`: `Skeleton.reassessWeaponGoal` asks `hardAttackInterval()` (20) and `attackInterval()` (40);
  the bogged overrides both.
- `src/game/spawner.ts`: the breeze and the bogged in `MOB_TYPES` and `ENTITY_NAMES`, with the two wind charges'
  names. Swamps and mangrove swamps list the bogged (weight 50, in fours) and skeletons down from 100 to 70.
- `src/game/combat.ts`: the mace's smash bonus (after the attack-strength scaling, before the critical hit), its damage
  source, Breach round `target.hurt`, `maceHurtEnemy` after the blow, `maceWindBurst` after the post-attack effects,
  its point of wear, and the fall spent.
- `src/game/interaction.ts`: shears on a bogged, as on a snow golem. The mace breaks no blocks in creative and takes
  two points of wear a block.
- `src/game/redstone/dispenseItems.ts`: the wind charge's dispense behaviour; dispensed shears shear a bogged.
- `src/game/trialChambers.ts`: imports `./windCharges` (new: using a wind charge, and the ominous item spawner's).
- `src/game/potionEffects.ts`: the Wind Charged effect's burst goes through `windBurstAt`, as vanilla's does: 3 to 5
  across, setting blocks off. The older `windBurst` in `src/game/explosion.ts` is no longer called; I left it in place.
- `src/game/level.ts`: an optional `dustPillar` particle; `src/render/particles.ts` makes it and `src/game/game.ts`
  wires it. `game.ts` also has the death messages for `windCharge` and `maceSmash`.
- `src/item/enchantments.ts`: the mace in `ENCHANTABLE.weapon`, `fire_aspect`, `mace` and `durability` (their
  comments already named it). `src/item/enchantHelper.ts`: enchantability 15 for the mace, and `windCharge` damage
  counts as a projectile's. `src/inventory/enchantMenus.ts`: breeze rods repair the mace.
- `src/render/entityRenderers.ts`: a `BreezeRenderers` field (new `src/render/breezeRenderer.ts`): the breeze in
  `renderMob`, wind charges in `renderEntity` with four times the render distance, the breeze's shadow. The bogged:
  its models (new `src/render/boggedModel.ts`), armour, the skeleton's animation with its mushrooms hidden once
  sheared, its moss through the stray's clothing layer (now by type), and its shadow.
- `src/render/itemRenderer.ts`: the mace and the breeze rod are held like tools.
- `src/audio/synth.ts`: `Object.assign(SOUNDS, trialCombatSounds())` (new `src/audio/gen/trialCombat.ts`). It reuses
  the skeleton's sounds from `gen/mobs.ts`, which were already exported.
- M1's own files: the two spawn eggs in `src/item/itemsTrialChambers.ts` and their sprites in
  `src/textures/itemlib/trialChambers.ts`.
- New besides: `src/entity/breeze.ts`, `src/entity/bogged.ts`, `src/entity/windCharge.ts`, `src/game/windCharges.ts`,
  `src/textures/breeze.ts` and `src/textures/bogged.ts`.

### M5

- `src/game/redstone/dispenser.ts`: `InsertTarget` is exported. A new `CONTAINER_TARGETS` list lets other files add
  block entities that droppers put things into, and `containerAt` asks it before looking for a container entity. The
  crafter adds itself to it.
- `src/inventory/menus.ts`: `armorDye` and `tippedArrow` are exported, so the crafter makes the same special recipes
  as a crafting table.
- `src/game/advancements.ts`: four new criteria (`player_killed_entity`, `fall_after_explosion`, `player_hurt_entity`
  and `crafter_recipe_crafted`), with their payload fields and matching. Five advancements that were impossible now
  use them, or the existing `structure` criterion.
- `src/game/game.ts`: `tickProgress` calls the new `tickTrialChamberProgress`, after the outer End's.
- `src/game/combat.ts`: after a blow lands on a living target, a `player_hurt_entity` trigger with the damage, its
  source and the weapon in hand. The damage source is now kept in a variable for it.
- `src/gui/screens/index.ts` installs the crafter's screen. `src/gui/screens/creative.ts` puts the crafter after the
  dropper in the redstone tab.
- `src/inventory/recipeBook.ts`: the crafter's recipe goes under redstone.
- `src/render/particles.ts`: `white_smoke` shares the smoke's case, with vanilla's fixed colour.
- `src/audio/synth.ts`: `crafterSounds()` joins M4's line.
- My own earlier files: the recipe in `src/inventory/recipesTrialChambers.ts`, the block in
  `src/world/blocksTrialChambers.ts`, its textures in `src/textures/blocklib/trialChambers.ts`, the game module in
  `src/game/trialChambers.ts`, Blowback's trigger in `src/entity/windCharge.ts`, and Who Needs Rockets?'s in
  `src/game/windBurst.ts` (the hook M4 left for it).
- New besides: `src/world/blocksCrafter.ts` (the block and its models), `src/game/crafter.ts` (its block entity,
  redstone, crafting and output), `src/inventory/crafterMenu.ts`, `src/gui/screens/crafter.ts`,
  `src/textures/crafterGui.ts`, `src/textures/blocklib/crafter.ts`, `src/audio/gen/crafter.ts` and
  `src/game/trialChamberProgress.ts`.
- `blockBehavior.ts`, `player.ts` and `living.ts` are unchanged in M5.

## 3. Open points, deviations, uncertain values, hooks

### M5

- **From memory.** These values are my best recollection of vanilla 1.21, not checked against its code:
  - which texture each face shows in each of the four models (`crafter`, `_triggered`, `_crafting` and
    `_crafting_triggered`);
  - the sound variant counts: 3 for the craft, 2 for the fail;
  - the crafter's place in the creative tabs: the redstone tab after the dropper, and no other tab;
  - Who Needs Rockets? checking 7 blocks, though its description says 8;
  - the experience vanilla gives for the two challenges: 40 for Blowback and 50 for Over-Overkill.
- **No experience rewards.** The game's advancements give none, so these don't either.
- **The textures are my own.** They are drawn from the lead's advancement icon for the crafter (`iconblocks.ts`), so
  the block matches its icon. The unpowered redstone is dark. A crafter only crafts while powered, so its crafting
  faces keep the redstone lit and add an amber glow.
- **The screen.** The slots, the redstone indicator and the result are at vanilla's positions. The panel and the arrow
  are my own drawing.
- **No hoppers or comparators.** The game has neither. Droppers fill a crafter as vanilla's hoppers do: one item at a
  time into the emptiest slot that is on. The comparator reading is ready as `crafterAnalogOutput` in
  `src/game/crafter.ts`.
- **Recipe unlocking.** The game unlocks a recipe when the player gets any of its ingredients, so iron or a crafting
  table unlocks the crafter. Vanilla waits for a dropper.
- **Remainders.** No recipe in the game uses a bucket, a honey bottle or dragon's breath, so the remainders a crafter
  would give back never come up. Book cloning leaves the original book, and the tests use that.
- **Only when something comes out.** As in vanilla, the craft sound, the smoke and Crafters Crafting Crafters happen
  only when an item comes out of the front. A crafter filling a container in front of it is silent.
- **Advancements:**
  - Minecraft: Trial(s) Edition checks every 20 ticks whether the player stands inside one of the trial chambers'
    pieces, as vanilla's location trigger does. Spectators count, as in vanilla.
  - A wind charge alone lifts a standing player about 6.1 blocks here. Who Needs Rockets? needs a jump as well, with
    the charge thrown down on the jump's first tick (8.3 blocks). A tick later gives 5.9.
  - Over-Overkill counts a blow only when it lands. The damage checked is the blow's before armour, as vanilla's
    `dealtDamage` is.
  - Blowback is detected where a wind charge hits: the victim dies of the charge's point and the kill goes to a player.
- **Templates.** No trial chambers piece places a crafter, so the jigsaw's rotation needs no `orientation` rule.
- **Deep dark hooks.** None needed. As far as I recall, vanilla's crafter emits no game events of its own.

### M4

- **From memory.** These values are my best recollection of vanilla 1.21, not checked against its code:
  - the bogged's swamp weights (50, in fours, skeletons down to 70) and its moss layer's 0.2 inflation;
  - the sound variant counts;
  - the `mace_smash` damage type and its message, "was smashed by";
  - the breeze sensing players within 16 blocks in its line of sight;
  - its long jump aiming at the target's centre;
  - what its "shoot when stuck" behaviour requires;
  - the sign of its head's bob;
  - Who Needs Rockets?'s 7 blocks (see M5).
- **Its animations are my own.** The breeze's shoot, slide, slide-back and jump are written afresh. Its inhale has no
  animation.
- **Wind charges:**
  - Gust particles appear all at once; vanilla's emitters spread them over 4 to 8 ticks.
  - Wind charges aren't saved with their chunk, like the game's fireballs.
  - A charge strikes anything within 0.3 of its path.
  - There are no candles for a burst to put out.
  - TNT and creepers don't set a player's current impulse. Vanilla's do, though only a wind charge's forgives the fall.
- **A breeze's aim.** Its spread is vanilla's `5 - difficulty × 4`, which comes out wider on hard (-7) than on easy (1).
  I kept that.
- **What a breeze turns back.** Arrows, tridents, snowballs, eggs, ender pearls, potions, bottles o' enchanting,
  fireballs and firework rockets. Llama spit and shulker bullets still go their own way.
- **A breeze's long jump.** One that runs out of time leaves the breeze without friction, as vanilla's does.
  `living.ts` still uses 0.4 as the depth for jumping in fluids; only the breeze's own swim behaviour uses its eye
  height.
- **Shearing a bogged ignores `doMobLoot`.** I believe 1.21.0 did too.
- **The mace:**
  - A mob holding one neither smashes nor breaches. Vanilla mobs don't smash either, but a mob's blow would carry
    Breach.
  - Wind Burst goes off at the wielder's feet with no source. As in 1.21.0, the fall back from the height it gives
    isn't forgiven unless another smash follows.
  - It is held with the handheld tool transforms; vanilla's `handheld_mace` may differ slightly.
  - Over-Overkill and Who Needs Rockets? got their criteria in M5, Who Needs Rockets? through the
    fall-after-explosion hook (`impulseHooks` in `windBurst.ts`).
- **Audio check.** The breeze's whistles, whirls, inhale and charge swell in on purpose, so `scripts/audio-check.mjs`
  flags them as "late onset" (40 ms or more). 124 of the game's existing sounds carry the same flag. No other flags.
- **Deep dark hooks.** None added in M4. Vanilla's game events here would be `EXPLODE` (bursts), `PROJECTILE_SHOOT`,
  `SHEAR`, `HIT_GROUND` and `ENTITY_ACTION`; they go where the sounds are played.

### M3

- **The pieces are my own.** No vanilla structure files are used: every room, corridor and hallway is drawn in code in
  tuff bricks, polished and chiseled tuff, waxed copper, grates and bulbs. The pool names, the eight chambers' names
  (chamber_1, 2, 4, 8, assembly, eruption, slanted, pedestal), the start pool `trial_chambers/chamber/end`, the spawner
  pools and the aliases are vanilla's; their shapes and the pools' weights are mine. I added a few pieces of my own: a
  dead-end alcove (`corridor/end_1`), a hallway ending at a chamber's door, and a storeroom a door opens onto when no
  chamber fits (most of the rest are walled off by a cap).
- **Sizes.** The weights were tuned so a trial chambers has about 12 chambers (5 to 25), 250 to 800 pieces, and two
  chambers opening off the end room. Over 12 structures on seed 12345, 79% of doors lead into a chamber or a storeroom.
- **Placement is vanilla's.** Random spread 34/12, salt 94251327; the start height -40..-20 drawn first; the start
  room at the chunk's corner lowered to it; the biome at the start's own height (so the deep dark, a cave biome, is
  kept out); pool aliases from vanilla's positional random; size 20; 116 blocks across. `dimension_padding` 10 is from
  memory.
- **Priorities.** The doors are tried first in their piece (`selection_priority` 1), so a chamber gets its room before
  the corridor goes on. Vanilla's own templates use these priorities, but I don't know their values.
- **Every chamber is furnished.** The spawner, vault and supply chest pools fall back to themselves. So a chamber
  placed at the structure's last step still gets them, where vanilla's empty fallback would leave it bare.
- **Openings.** Where a door or a corridor's end is half blocked by a neighbour, or reaches the 116-block limit, it
  opens onto the ground round. Vanilla does the same. The encapsulation keeps that ground solid (98% just round the
  pieces in the test's chunks).
- **Loot.** The tables' weights, counts and damage follow vanilla 1.21 as best I know them. Items the game lacks roll
  nothing: bamboo planks, bamboo hanging signs, scaffolding and cake.
- **Not there yet.** There are no candles (the game has none), so the decor is pots, flower pots with dead bushes,
  and barrels. The dispensers aren't wired to anything. The breeze spawners showed a placeholder until M4 brought the
  breeze. The "poison skeleton" spawners name the bogged, which also came in M4.
- **Cost.** Chunks round a trial chambers take about 10% longer: 40.7 ms against 37.0, the best of five runs each.
  Most of it is the encapsulation's per-block sum, which is cached per column. Laying one out takes about 15 ms, once
  per structure.
- **Deep dark.** `trialChambersBiome` already keeps out `B.deep_dark`; no hook needed.

### M2

- **Trial spawner configs are named**, as vanilla's later `trial_spawner` registry names them
  (`trial_chamber/melee/zombie/normal`, `.../ominous`). Vanilla 1.21.0 kept each config inline in the block entity.
  `/setblock` reads the names, `spawn_data`, the range and the cooldown, but not an inline config.
- **Spawn reason.** Trial spawner mobs spawn with the game's `spawner` reason. In this game only villagers read the
  reason, and vanilla treats the two alike there.
- **Creative tabs.** The trial spawner sits after the spawner in the functional tab, where this game keeps the spawner;
  vanilla lists both in the spawn eggs tab. The vault is after the end portal frame.
- **Loot uncertainty.** The reward tables' weights and counts follow vanilla 1.21 as best I know them; the enchantment
  levels on the vaults' enchanted books and gear are my closest reading. The trial spawners' armed mobs get their
  armour without trims or enchantments.
- **Trims don't exist**, so the flow and bolt templates the vaults give are kept but do nothing yet.
- **The ominous item spawner isn't saved** with the chunk (it lives 3 to 6 seconds).
- **Vault particle range**: `connected_particles_range` stays at its default (4.5), as vanilla's does unless a
  structure sets it.
- **Slimes** from a trial spawner are size 2 and 3 (vanilla's `Size` 1 and 2).
- **A Balanced Diet** can now be completed: it already asked for the honey bottle, which didn't exist before.
- **Deep dark hooks**: `(deep dark hook)` comments in `trialSpawner.ts` and `ominousItemSpawner.ts` mark vanilla's
  `GameEvent.ENTITY_PLACE`, where a mob comes out and where an item spawner lets go of its item.

### M1


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
| `m2a-trial-spawner.mjs` | placing it and a spawn egg; who it sees (creative, spectators, range 14, line of sight through glass and bars but not stone), once a second; one player: 2 at once, 40 ticks apart, 6 in all, the reward, the 30-minute cooldown and the next trial; two players: the second joining unseen, 3 at once, 8 in all, a reward each; every config's numbers, slimes and baby zombies; peaceful and `doMobSpawning`; the 47/48-block tracking limit; saving; Bad Omen to Trial Omen, going ominous before, during and after a trial, armed mobs, item spawners every 8 s dropping the same thing, the ominous reward, and back to normal after the cooldown | all pass (90) |
| `m2b-vault.mjs` | placing it; lighting up within 4 blocks and going idle past 4.5 (creative yes, spectators no, no sight needed); the display item and its spin; the keyhole sparks; refusals and their 15-tick limit, renamed and ominous keys; a key taking, unlocking, ejecting an item a second with rising pitch, and closing; once per player, the refusal sound, a second player; creative; the ominous vault; Under Lock and Key and Revaulting; the reward tables' odds; 128 players remembered; saving, and a vanilla config read in | all pass (59) |
| `m2c-assets.mjs` | every texture of all 44 states (the ominous ones bluer, the lit ones brighter); the item icons and creative positions; both sound groups and every sound played, rendered clean; each new particle's lifetime, colour and motion, and its sprites on the sheet; the honey bottle (drunk when full, 40 ticks, food, poison cured, the bottle back, its own slurp, creative, A Balanced Diet); `/setblock` data for vaults and trial spawners; the cage renderers | all pass (54) |
| `m3a-structure.mjs` | the start chunk against an independent java.util.Random with the salt; the start heights (all 21, the first draw); no deep dark, the biome at the start's height; the end room and its floor; the aliases against vanilla's positional random (300 starts), ranged and slow ranged together; 12 layouts: no overlaps, within 116 blocks and the padding, every spawner the structure's mob, every chamber furnished, 4 or more chambers, most doors leading somewhere; every piece walked from every way in to every way out, vault and chest; four whole structures walked from the end room to every vault, chest, barrel, dispenser and pot; the time to lay one out and to look for one | all pass (24) |
| `m3b-generation.mjs` | real chunks at seed 12345's nearest: the end room, its entrance chests and their loot, the spawners' configs, the vaults normal and ominous and their facing, the pots, the ground round it solid, being in one; every loot table and spawner config the pieces name, what each table gives, the supply rolls, the dispenser's arrows, worn and enchanted tools; a pot's loot through saving, looking in and breaking, and its odds; every copper bulb against vanilla's positional random; nothing over a spawner, chest or bedrock; no waterlogging; the encapsulation against vanilla's formula at 900 points; `/locate` in the Overworld and the Nether; the cost per chunk | all pass (29) |
| `m4a-wind-charges.mjs` | throwing (from the eye at 1.5, one used, 10 ticks' cooldown, none used in creative), flying dead straight; the burst at a wall and on a pig (a point of damage, the push, nothing 6 blocks off); an oak door opened by a thrown charge and every kind of block set off or left alone (iron ones), a bell only by a direct hit or a breeze-sized burst, a breeze's burst only with `mobGriefing`; thrown up by one's own charge and down unhurt, the fall start told once, a breeze's charge's fall hurting; dispensers, ominous trial spawners, a blow turning a charge (not in its first 5 ticks), the top of the world; the Wind Charged effect's burst | all pass (44) |
| `m4b-breeze.mjs` | 30 health, its size and eyes, 10 experience, the spawn egg, the trial spawner config; idle strolling, whistling and whirling, leaving a creative player be; a fight: taking the player on, inhaling before every shot, charges from its snout with its burst sound, its poses, leaping; up close, sliding away then shooting; a player gone creative let go; an arrow and a snowball turned back once each, a player's charge hurting it and another breeze's not; no fall damage; its loot with and without looting and a player; a trial spawner bringing out a breeze | all pass (33) |
| `m4c-bogged.mjs` | 16 health, a bow, its sounds and spawn egg; a shot every 70 ticks on hard and 90 on normal, poison for 100 ticks; burning in the sun; shearing by hand (two mushrooms from its head, the snip, a point of wear, only once, creative, saved) and by dispenser; its loot (a poison arrow about half the time on a player's kill, never more than one, bones and arrows); swamp and mangrove swamp spawns, none on the plains, no natural breezes; a trial spawner's poison skeletons | all pass (24) |
| `m4d-mace.mjs` | the damage at 9 heights against vanilla's formula, density, gliding, the damage source; the smash: the stop, the impulse, the three sounds, the 750 dust specks, the push and who is spared, the wear, creative; the landing spray and no fall damage; breach and its clamp; wind burst I to III and its conditions; mining wear, creative; enchantability, repair, the enchantments it takes and the table's | all pass (43) |
| `m4e-assets.mjs` | the breeze's, wind charge's and bogged's textures (the wind tiling, the mirrored mushroom cards, the moss, the bones), the spawn eggs; the breeze, wind charge and bogged models; all 23 new sounds rendered clean, and every sound name the new code plays; the dust pillar particle; the gust | all pass (24) |
| `m5a-crafter.mjs` | the block: 48 states, strength, drops, map colour and sounds; its recipe, book category and creative place; placing it (11 looks); redstone: powered when placed, the 4-tick delay, the 6-tick glow, once per pulse, a one-tick pulse, the glow ending with the power, no quasi-connectivity; recipes: a 2x2 anywhere, whole results, one of each item used, mirrored, shapeless, remainders, tipped arrows, fireworks, nothing to make, empty; where the item comes out, its smoke and clunk; into a chest, a full chest and another crafter; droppers filling it evenly, skipping switched-off and full slots; switching slots, the comparator count, saving; the menu and the screen's clicks; pistons; breaking; Crafters Crafting Crafters near, far, spectating and into a chest | all pass (65) |
| `m5b-advancements.mjs` | the tree, frames and icons; Minecraft: Trial(s) Edition in the end room of seed 12345's trial chambers, every 20 ticks, not outside or in the Nether; Blowback for a breeze killed by a breeze's charge struck back, not by a player's own charge or for a zombie; Who Needs Rockets? for a jump and a wind charge, and for a charge thrown down as the jump starts (8.3 blocks), not a charge alone, one thrown a tick late or a breeze's; Over-Overkill at 105 and at 135 with Density V, not 90 or a sword; the breeze and the bogged in Monster Hunter and Monsters Hunted | all pass (29) |
| `m5c-assets.mjs` | the 14 textures: sizes, the icon's top, front and side, west mirroring east, the redstone dim unpowered and lit powered, amber while crafting; all 48 states' models: the right textures facing the right ways, each picture upright; the item drawn as the block; the screen's sprites; both sounds rendered clean; the white smoke's colour and motion | all pass (36) |

Also run: `npm run typecheck` (clean); `tests/temples/*` and `tests/mansion/*` (all pass); `scripts/audio-check.mjs` (no
warnings for the new sounds, except once a "slow" flag on the ominous spawner's boom at 24 ms against a 20 ms limit on
its first, cold render; 15 ms when run again).

For M3 the jigsaw engine changed under the villages and outposts too. Their layouts on made-up terrain (40,383 pieces
over five village kinds and the outposts, 64 regions each) hash the same before and after. The pieces were also
checked in the browser: screenshots of the end room and five chambers looked right, with no errors in the console.

For M4, every test above passes again, as do `tests/temples/*` and `tests/mansion/*`. One timing check in
`tests/mansion/m2-ruined-portals.mjs` failed once while two suites ran side by side (54 ms a chunk against 41); run
alone it passes. In the browser, screenshots showed:
- a breeze close up and in a fight;
- two bogged, one sheared;
- the mace in both views, and its dust pillar;
- a wind charge in flight;
- the breeze and bogged spawners below, woken in survival.

The console showed no errors.

For M5, every test above passes, as do `tests/temples/*` and `tests/mansion/*`; this time the ruined-portals timing
check passed with two suites running. `npm run typecheck` is clean, and `node scripts/audio-check.mjs crafter` gives no
warnings. In the browser, at seed 12345 in creative, screenshots showed:
- four crafters idle, powered, crafting and facing up (the last placed by
  `/setblock ~ ~ ~-3 minecraft:crafter[orientation=up_north]`), and its item as a small crafter in the hotbar;
- its screen with two slots switched off and the tooltip over an empty one; clicking a slot switched it off and on;
- a lever flicked beside it: it glowed amber and puffed white smoke, and a crafting table flew out;
- its screen while powered, the redstone lit and one plank fewer in each slot;
- a crafter crafting a crafter, with the toast and chat line for Crafters Crafting Crafters;
- the redstone tab: sticky piston, dispenser, dropper, crafter, TNT.

The console showed no errors.

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
- **Trial spawner**: `/difficulty normal`, then
  `/setblock ~3 ~ ~ minecraft:trial_spawner{normal_config:"minecraft:trial_chamber/melee/zombie/normal",ominous_config:"minecraft:trial_chamber/melee/zombie/ominous"}`.
  A zombie spins slowly inside. `/gamemode survival` (it never sees creative players): within a second it flares up
  with orange wisps, and zombies come out, 3 at a time and 6 in all. Kill them all: its shutter opens, it throws out a
  trial key or some consumables, and it goes dark for 30 minutes. A spawn egg used on a trial spawner sets its mob.
- **Ominous trial spawner**: `/effect give @s minecraft:bad_omen 6000 1`, then place another spawner as above and walk
  up to it in survival. The Bad Omen becomes 30 minutes of Trial Omen with a boom, and the spawner turns soul blue. Its
  zombies come armed. Every 8 seconds a spinning item appears over you or a zombie and drops after 3 to 6 seconds: a
  lingering potion, arrows, a fire charge or a wind charge. Its reward is an ominous trial key or ominous consumables.
- **Vault**: `/setblock ~3 ~ ~ minecraft:vault` (it's also in the functional tab) and `/give @s minecraft:trial_key 2`.
  Within 4 blocks it lights up, something it may give spins inside, and faint sparks drift from its keyhole to you. Use
  a key on it: it takes the key, unlocks, and pops out 2 to 5 things, one a second. Under Lock and Key is awarded. The
  second key is refused with a clunk: each vault rewards a player once.
- **Ominous vault**:
  `/setblock ~3 ~ ~ minecraft:vault[ominous=true]{config:{key_item:{id:"minecraft:ominous_trial_key"},loot_table:"minecraft:chests/trial_chambers/reward_ominous"}}`
  and `/give @s minecraft:ominous_trial_key`. It glows blue, refuses a plain trial key, and opens for the ominous one.
  Revaulting is awarded.
- **Honey bottle**: `/give @s minecraft:honey_bottle`. It can be drunk at full hunger, slurping, and it cures poison
  and leaves a glass bottle.
- **Finding trial chambers**: `/locate structure minecraft:trial_chambers`. From the world spawn it answers
  `[-480, ~, -304]`; the one nearest to 0,0 is at `[0, ~, 224]`. Both lie 20 to 50 blocks below y 0.
- **Teleporting down to them**: use `/gamemode spectator` before a far `/tp`. The game lets a teleported player fall
  before a far chunk has loaded, and 30 blocks down that ends in the void. Switch back to creative or survival once the
  rooms are drawn.
- **The trial chambers at -480, -304** (zombies, strays and cave spiders, all mobs the game has): `/tp @s -474 -33 -311`
  stands in its end room, two entrance chests along the walls, doors into two chambers and corridors out of each end.
  `/effect give @s minecraft:night_vision 99999 0` helps see the corridors.
- **A spawner chamber**: `/tp @s -468 -33 -287 -90 0` stands in the doorway of a long hall of pillars (chamber_2),
  looking in at three pedestals. `/difficulty normal` and `/gamemode survival`: the spawners wake one after another,
  zombies, strays and cave spiders.
- **By the vaults**: `/tp @s -463 -33 -279 0 10` in the same hall faces its two vaults on their copper dais.
  `/give @s minecraft:trial_key 2` and use one on each.
- **An ominous vault in place**: in the trial chambers at 0, 224, `/tp @s 7 -37 208 180 10` stands on the walkway of the
  pit (chamber_4) facing its vault and its ominous vault. Its spawners (spiders, silverfish and, since M4, the bogged)
  are down in the pit.

**M4: the breeze, wind charges, the bogged and the mace.** Mobs attack survival players only. To watch in safety, use
`/effect give @s minecraft:resistance 99999 4` and `/effect give @s minecraft:night_vision 99999 0`.

- **Breeze**: `/summon minecraft:breeze ~ ~ ~5` in creative. It drifts about whistling, its rods spinning round its
  head, its wind swirling. In `/gamemode survival` it breathes in and fires wind charges that burst on you and throw you
  about. It leaps high behind you, and slides away when you're within 4 blocks. Arrows shot at it bounce back. Killed,
  it drops 1 or 2 breeze rods.
- **Breeze spawner**:
  `/setblock ~3 ~ ~ minecraft:trial_spawner{normal_config:"minecraft:trial_chamber/breeze/normal",ominous_config:"minecraft:trial_chamber/breeze/ominous"}`
  in a dark room, then survival. It brings out 2 breezes, one at a time.
- **Wind charges**: `/give @s minecraft:wind_charge 64`. Look straight down and throw one: it lifts you about 6
  blocks, and you land unhurt. Throw one at an oak door, trapdoor, fence gate, lever, button or bell to set it off;
  iron doors don't move. Or place `/setblock ~2 ~ ~ minecraft:dispenser[facing=east]`, put charges in and power it.
- **Bogged**: at night or somewhere dark, `/summon minecraft:bogged ~ ~ ~5`. It is mossy grey-green bones with red and
  brown mushrooms on its head. In survival its arrows poison you for 5 seconds, and it shoots less often than a
  skeleton. Use `/give @s minecraft:shears` on it: two mushrooms fall and its head is bare. Swamps and mangrove
  swamps bring it in fours at night.
- **Mace**: `/give @s minecraft:mace`, then `/summon minecraft:zombie ~ ~ ~2` two or three times, and go into survival:
  1. `/tp @s ~ ~10 ~` over the zombies and hit one as you fall onto it. There's a crash and a pillar of dust. The
     others are thrown away, you stop dead, and you land without fall damage.
  2. `/enchant @s minecraft:wind_burst 3` and smash again: a gust throws you back up for the next blow.
  3. `/enchant @s minecraft:density 5` hits harder. Breach instead cuts through armoured mobs.
  4. A mace is mended with breeze rods at an anvil.
- **Breezes in a trial chambers**: `/gamemode spectator`, then `/tp @s -493 -33 -310 270 10`. This stands by a breeze
  spawner in the chamber beside the end room at -480, -304. Switch to survival and it wakes.
- **Bogged in a trial chambers**: `/gamemode spectator`, then `/tp @s 0 -31 240 0 5`. This stands on the upper
  walkway of chamber_8 in the trial chambers at 0, 224, by its bogged spawners. In survival they come out shooting
  poison arrows.
  - The pit at 0, 224 (`/tp @s 7 -37 208 180 10`) now brings bogged down in the pit too.
  - A breeze spawner stands at 8, -35, 244.

**M5: the crafter and the advancements.**

- **Crafter**: it's in the redstone tab after the dropper. Placed, its mouth faces you. Look steeply down or up to
  place it facing up or down. `/setblock ~ ~ ~-3 minecraft:crafter[orientation=up_north]` places one facing up.
- **Its screen**: right-click it. Clicking an empty grid slot with nothing in hand switches it off: it's crossed out,
  clicks lower, and takes nothing. Click it again, or press a hotbar number over it, to switch it back on. Hovering an
  empty slot that's on says "Click to disable slot". Four oak planks in a 2x2 show a crafting table on the right.
- **Crafting**: place a lever beside it and flick it on. Four ticks later it glows amber, clunks, puffs white smoke out
  of its mouth and throws out a crafting table, using one of each item. It crafts once for each flick on. With nothing
  it can make, it gives a dull click.
- **Filling it**: a dropper facing into it puts in one item at a time, into the emptiest slot that's on. A chest in
  front of a crafter catches what it makes, silently. Pistons can't move it, and breaking it drops its contents.
- **Crafters Crafting Crafters**: fill a crafter with iron ingots round a crafting table, with redstone, a dropper and
  redstone along the bottom row. Power it while you're within 8 blocks.
- **Minecraft: Trial(s) Edition**: `/gamemode spectator`, then `/tp @s -474 -33 -311`, the end room of the trial
  chambers at -480, -304. It's awarded within a second.
- **Who Needs Rockets?**: `/give @s minecraft:wind_charge 16` and `/gamemode survival`. Look straight down and press
  jump and use together: the burst lifts you about 8 blocks. Thrown a tick late, or without a jump, it lifts you about
  6, not enough.
- **Over-Overkill**: `/give @s minecraft:mace`, `/summon minecraft:zombie ~ ~ ~2` two or three times,
  `/effect give @s minecraft:resistance 99999 4` and `/gamemode survival`. Then `/tp @s ~ ~50 ~` and hit a zombie as
  you land. It takes a fall of about 47 blocks, or 20 with `/enchant @s minecraft:density 5`.
- **Blowback**: `/summon minecraft:breeze ~ ~ ~6` and `/gamemode survival`, with the resistance above. Wear it down:
  `/effect give @e[type=minecraft:breeze] minecraft:instant_damage 1 1` twice leaves it 6 health, and a stone sword
  hit leaves 1. Then face it and strike its next wind charge as it reaches you: it flies back the way you look.
