# The wither, the beacon and six blocks: report

What this branch adds to the game, one milestone at a time in the brief's order: the wither, then the beacon, then
six blocks (slime block, scaffolding, note block, trapped chest, target, respawn anchor), then the remaining mobs if
there is time. Everything is procedural. Textures, models and sounds are drawn or synthesised by the game's own code,
and no Mojang asset is used.

## 1. Branch and milestones

Branch: `claude/determined-turing-0anamq`, from main at `b935350`.

| # | Milestone | State | Commit |
|---|---|---|---|
| 1 | The wither: building it, its charge, its purple bar darkening the world, its AI, heads and skulls, its armour, healing, drops, the wither rose, `/summon` with its data, the spawn egg, Withering Heights | done | the commit that adds this row ("The wither. …") |
| 2 | The beacon | not started | |
| 3a | Slime block | not started | |
| 3b | Scaffolding | not started | |
| 3c | Note block | not started | |
| 3d | Trapped chest | not started | |
| 3e | Target | not started | |
| 3f | Respawn anchor | not started | |
| 4 | Endermite, camel, allay, sniffer (torchflower, pitcher plant), skeleton horse trap, zombie horse | only if all else is done | |

`PROTOCOL_VERSION` is unchanged. The wither needs nothing new on the wire: its state syncs through the existing
entity-data fields, and guests draw its bar from their own copy of it.

## 2. Shared files changed, and hooks

Every new line in a shared file is marked with a `(the wither)` comment that names the vanilla class it follows. The
changes are small and additive, except for the three behaviour fixes listed at the end of this section.

### Milestone 1: the wither

**New files**
- `src/entity/wither.ts`: `WitherBoss` and `WitherSkull`, plus `witherBars`, `witherCanDestroy` and
  `WITHER_SPAWN_TICKS`.
- `src/game/witherSpawn.ts`: the two block patterns, `checkWitherSpawn`, `canSpawnWither` (for the dispenser) and
  `setPlacedBy` on both wither skeleton skull blocks.
- `src/game/witherRose.ts`: the rose's behaviour (soils, withering what stands in it, smoke) and the rose a wither's
  victim leaves.
- `src/world/blocksWither.ts`: `wither_rose` and `potted_wither_rose`.
- `src/item/itemsWither.ts`: the nether star, the wither spawn egg, and the rose's creative-tab place.
- `src/inventory/recipesWither.ts`: black dye from a wither rose. The beacon's recipe goes here too.
- `src/render/witherRenderer.ts`: the wither model (vanilla `WitherBossModel`), its armour layer and the skull
  renderer.
- `src/textures/wither.ts`: the skins (`wither`, `wither_invulnerable`, `wither_armor`).
- `src/audio/gen/wither.ts`: 11 sound takes (ambient 4, hurt 4, death, shoot, spawn).
- `tests/wither/wither.mjs`, `tests/wither/wither-mp.mjs` and this report.

**Registration lines** (one import and one call each)
- `src/world/blocks.ts`: `registerWitherBlocks()`.
- `src/item/item.ts`: `registerWitherItems(…)`.
- `src/inventory/recipes.ts`: `registerWitherRecipes(shaped, shapeless)`.
- `src/game/level.ts`: `import './witherSpawn'` and `import './witherRose'`, beside the other behaviour modules.
- `src/audio/synth.ts`: `witherSounds()`. `entity.wither.break_block` reuses the zombie's wooden-door break, as
  vanilla's `sounds.json` does.
- `src/textures/blocks.ts`: the rose's texture. The texture itself is a `wither_rose` entry in
  `src/textures/blocklib/plants.ts`.
- `src/textures/bossBar.ts`: the purple bar sprites.
- `src/textures/mobs.ts`: the spawn egg's colours, `['wither', 0x141414, 0x4d72a0]`.

**Hooks and small additions**
- `src/entity/living.ts`: a new `DEATH_HOOKS` object. `src/entity/mob.ts` and `src/entity/player.ts` call
  `DEATH_HOOKS.witherRose?.(this)` in `die()`, following vanilla `LivingEntity.die` and `ServerPlayer.die`, which call
  `createWitherRose`. The hook object avoids an import cycle.
- `src/entity/fireball.ts`: a new `inertia()` method (vanilla `getInertia`), 0.95 by default. A blue skull returns
  0.73.
- `src/game/explosion.ts`: an `explosionResistance` hook on the exploding entity (vanilla
  `Entity.getBlockExplosionResistance`). A blue skull caps the resistance of anything the wither can break at 0.8,
  fluids included, which is why a blue skull can blow water away.
- `src/game/blockPattern.ts`: a match now reports `forwards` (vanilla `BlockPatternMatch.getForwards`), which gives
  the new wither its facing.
- `src/game/redstone/dispenseItems.ts`: the wither skeleton skull's dispenser behaviour. Where `canSpawnMob` allows
  it, the skull is set down looking back at the dispenser (vanilla `RotationSegment.convertToSegment(facing)`) and
  the spawn is checked. Otherwise the skull goes on the head of a mob in front, as any mob head does.
- `src/gui/bossOverlay.ts`: `BossBar.darkenScreen`, `shouldDarkenScreen()`, and `tickDarken()` / `darkenWorld()`
  (vanilla `GameRenderer.darkenWorldAmount`: +0.05 a tick while a bar asks, −0.0125 a tick after).
- `src/gui/hud.ts`: `witherBars(…)` joins the dragon's and the raids' bars, and the darkening ticks.
- `src/render/lightmap.ts`: a new last parameter, `darkenWorld` (vanilla `LightTexture`: each colour lerps toward
  itself × (0.7, 0.6, 0.6)).
- `src/render/renderer.ts` and `src/game/game.ts`: the darkening reaches the lightmap and the fog colour (vanilla
  `FogRenderer`'s boss colour modifier).
- `src/render/entityRenderers.ts`: draws the wither and its skulls; both glow at block light 15. The armour texture
  wraps rather than clamps so its swirl can scroll. Shadow radius 1.
- `src/gui/screens/creative.ts`: items with `creativeTab: 'none'` stay out of every tab. Only the wither spawn egg uses
  this, as in vanilla.
- `src/game/spawner.ts`: `MOB_TYPES.wither`, and `ENTITY_NAMES` for `wither` and `wither_skull`.
- `src/net/entityNet.ts` and `src/net/server/entityTracker.ts`: guests can make `wither_skull` copies (tracking range
  4, as vanilla's). `wither: 10` was already there.
- `src/game/playerDeath.ts`: `witherSkull` → "<name> was shot by a skull from <killer>".
- `src/game/advancements.ts`: Withering Heights is now wired to `summoned_entity` / `wither` (it was `never`).
- `src/audio/soundManager.ts`: the wither's and the wither skeleton's sounds play in the hostile category.
- `src/world/blocksVillage.ts`: `pottedModel` is now exported, so the potted rose is built like the other potted
  plants.

**Behaviour fixes in shared code** (vanilla-faithful; each has a test)
- **Explosions now drop what they break whatever tool it would need.** In `src/game/explosion.ts`, `blockDrops(…)`
  now gets `harvest = false`. Vanilla `BlockBehaviour.onExplosionHit` rolls the loot table with an empty hand and
  never asks for the correct tool. Before, a blast on stone, ores or obsidian dropped nothing; now stone leaves
  cobblestone (one time in the blast's radius, every time for TNT) and an ore its ore's drop. This applies to every
  blast: TNT, creepers, ghast fireballs, beds, the wither and its skulls.
- **`Level.destroyBlock` has a new last parameter, `harvest = true`.** The wither passes `false`: vanilla
  `Level.destroyBlock(pos, true, wither)` drops the loot with no tool check, so a wither breaking obsidian drops
  obsidian. Nothing else changes.
- **Other sessions' tests that counted things the wither adds** now allow for them:
  - `tests/remaining-mobs/mooshroom.mjs`: vanilla's creative tab lists a ninth suspicious stew, the wither rose's
    (wither, 7 s), after lily of the valley's, once the rose exists.
  - `tests/villages/flowerpot.mjs`: 32 potted plants with the potted wither rose.
  - `tests/end/silverfish.mjs`: the stone floor under a blast now leaves cobblestone; the check still requires that
    the infested blocks themselves drop nothing.

## 3. Open points and deviations

**Choices where the brief and vanilla differ (vanilla chosen)**
- **No creative-tab place for the wither spawn egg.** Vanilla keeps it out of every tab (as with the ender dragon's
  egg); get it with `/give @s wither_spawn_egg`. The brief asks for a creative place for every new thing; I followed
  vanilla. The nether star (Ingredients, after the heavy core) and the wither rose (Natural Blocks, after lily of the
  valley) are in the tabs. When the torchflower arrives it goes between lily of the valley and the wither rose,
  vanilla's order.
- **Creative players standing in a wither rose get the wither effect,** and it does them no harm. Vanilla's
  `isInvulnerableTo` doesn't cover creative mode; only `hurt` refuses the damage.

**Faithful quirks**
- **The model's right head is turned by head index 0,** which is the head on the wither's left. Vanilla's model has
  the same swap. The skulls are fired from the real head positions.
- **A dispensed skull looks back at the dispenser,** following vanilla's `convertToSegment(facing)`.

**Known gaps**
- **Wither skulls and other fireballs are not saved.** The `Fireball` base class has no save support yet, so skulls
  in flight vanish on reload. The wither itself saves and loads: its health, charge, name and data.
- **The spawn roar reaches every player in the wither's dimension only.** Vanilla broadcasts it to every dimension,
  and there is no `globalSoundEvents` game rule or `Silent` flag to turn it off.
- **The host's own bar shows withers within min(10, render distance − 1) chunks horizontally.** This is the cap the
  guest tracker uses, so host and guests see the same bars.
- **When one skull could finish two patterns, the one chosen may differ from vanilla's,** because `BlockPattern.find`
  scans in a different order. Either way exactly one wither is made.
- **The rose's soil list includes `muddy_mangrove_roots`,** which this world doesn't have yet. This is harmless.

**Multiplayer**
- **Withering Heights for guests:** the host fires it for every non-spectator player within the wither's box inflated
  by 50 (tested for both). On this branch, `level.onPlayerTrigger` only reaches the host's own player (`game.ts`),
  so guests get it once the guests' branch routes triggers to them.
- **Boss bars on guests:** a guest draws its bar from its own copy of the wither. If the guests' branch adds a host→guest
  boss-bar sync, it must leave withers out, or guests will see two bars.

**Outside this branch's scope**
- **Creeper kill messages.** The shared explosion code credits a blast to someone only when the exploding entity has
  an owner. So a creeper's victim reads "<name> blew up", where vanilla (`Explosion.getIndirectSourceEntityInternal`:
  a living source is its own cause) says "<name> was blown up by Creeper". The wither passes its own damage source,
  so its blast reads "was blown up by Wither" as in vanilla. The creeper is left as it was.

## 4. Tests and the regression summary

**Milestone 1**
- `node tests/wither/wither.mjs`: 142 checks, all ok. It covers:
  - the wither's numbers;
  - building it every way round, with soul soil, wall skulls and a dispenser (not in peaceful, not by `/setblock`,
    not with a skeleton skull);
  - the charge;
  - what hurts it;
  - targeting (not undead, ghasts, creative players or armour stands), flying, and both kinds of skull;
  - skull damage and effects by difficulty;
  - blue skulls through obsidian and water, but not bedrock, and nothing with mob griefing off;
  - blocks broken a second after it is hit, with their drops;
  - healing, despawn, save and load, `/summon` with its data, the spawn egg;
  - its death, the nether star and its XP;
  - roses where its victims fall, and the rose block (soils, withering, smoke, pot, dye, stew, creative place);
  - the death message, its sounds and Withering Heights;
  - its bar (range, purple, darkening), the overlay's darkening and the lightmap;
  - its skins, model and renderer.
- `node tests/wither/wither-mp.mjs`: 28 checks, all passed, over `tests/multiplayer/lib.mjs`. A guest finishes the
  wither with its own skull (the host makes it, and both players get Withering Heights). Then the guest:
  - sees the charge, with the bar filling, and can't hurt it;
  - hears the roar;
  - sees black skulls fly at a cow, with the targets and head turns synced, and the cow withered;
  - hurts it, sees the blocks round it broken and its armour come on at half health;
  - sees the rose the cow leaves, is withered standing in one, and sees the nether star;
  - and its world matches the host's throughout.
- `node tests/remaining-mobs/load-order.mjs`: all ok.
- `npm run typecheck`: clean. `npm run build`: builds.
- **Headless Chromium** (`/opt/pw-browsers/chromium`, driven over the DevTools protocol from a scratch script):
  - The game starts at `?seed=12345&mode=creative` with no console errors.
  - A summoned wither charges and the darkening comes on.
  - The milestone screenshot shows an armoured wither and a pale charging one, wither roses, two purple bars and
    the darkened world. The repository keeps no images, so it isn't committed.

**Full regression** (`node scripts/regress.mjs -j 2`, 199 suites, run once the wither was in): 193 passed, 6 failed.
- `bastions/m2a-structure`: it runs `git show 16017d7:…`, and this clone is shallow, so the commit isn't there. This
  is the environment, not the code.
- `remaining-mobs/mooshroom` and `villages/flowerpot`: the counts above, now updated; both pass.
- `illagers/illagers` (evoker fangs), `remaining-mobs/panda` and `wolf/wolf`: on the brief's flaky list. I reran each
  on this branch and on `b935350` in a separate worktree. Evoker fangs failed 3 of 4 runs on the base. Panda passed
  3 of 3 on both. Wolf failed 3 of 10 on both.

After the explosion fix, I reran every suite that touches blasts, `destroyBlock`, dispensers or block drops: 54 +
35 + 27 suites. All passed apart from:
- `end/silverfish`: updated, as above;
- one placement in my own test, made robust;
- `illagers/raids`: its hero-gift check also fails on the base (1 of 6 runs).

## 5. Browser checklist

Start with `npm run dev` and open `http://localhost:5173/?seed=12345&mode=creative`. Type the commands in chat (`t`).

**The wither**
1. Build one:
   - Run `/difficulty normal`, `/give @s soul_sand 4` and `/give @s wither_skeleton_skull 3`.
   - Place a T of soul sand (one block, three across on top) and put the three skulls along the top, the last one
     by hand.
   - Check that the blocks vanish and a small, pale wither appears. It flashes blue and grows over 11 seconds.
   - Check that a purple "Wither" bar fills at the top of the screen while the world darkens and reddens.
   - Check that it ends with a blast and a roar, and that the advancement toast says Withering Heights.
2. Switch to `/gamemode survival`. Check that it flies above you and its three heads fire black skulls at you
   (wither II on normal).
   - It ignores you in creative, and it never attacks zombies or skeletons.
3. Hit it. Check that a second later every block round it breaks, with the zombie's door-breaking sound, and that
   the blocks drop (obsidian too).
4. Give it a long fight, or use `/effect give @e[type=wither] instant_health 1 5`: instant health harms the undead,
   192 here, taking it from 300 to about 110. Below half health:
   - check that it is armoured, with a swirl scrolling over it;
   - check that arrows bounce off.
5. Kill it with `/kill @e[type=wither]` or by fighting. Check that it drops a glowing nether star, 50 XP worth of
   orbs, and that the bar goes away.
   - Afterwards the sky lightens slowly (about 4 seconds).
6. Check that anything it kills leaves a wither rose where it fell, or the rose as an item if it can't be placed
   there.

**Commands**
7. `/summon wither ~ ~ ~5 {Invul:220,CustomName:'"Boss"'}`: check that it charges and its bar reads "Boss".
8. `/summon wither ~ ~ ~5`: check that it appears at full health without charging (vanilla).
9. `/give @s wither_spawn_egg`: check that the egg makes a wither at full health without charging. The egg isn't in
   the creative tabs, as in vanilla.

**The rose and the dispenser**
10. Stand in a wither rose in survival: check that you get the wither effect.
    - It needs grass, dirt, farmland, soul sand, soul soil, netherrack, mud and the like underneath, and it gives
      off wisps of smoke.
    - Check that it goes in a flower pot and crafts into black dye.
11. Put a dispenser with wither skeleton skulls facing a T that has two skulls. Power it, and check that it finishes
    the wither.

**LAN guest**
1. Open the world to LAN and join from a second browser (as `npm run lan` and the multiplayer reports describe).
2. As the guest, place the last skull on a T:
   - check that the host makes the wither;
   - check that the guest sees it charge, with its own purple bar filling and the darkening, and hears the roar.
3. Check that the guest sees the black skulls fly and the side heads turn, and gets withered when hit.
4. Check that a guest's hits land once the charge is over, and that its bar drops for both players.
5. Below half health, check that the guest also sees the armour swirl.
6. Kill it, and check that the guest sees the nether star and its bar goes away.
7. Check that a rose left by a mob is in the guest's world too, and withers the guest when they stand in it.
