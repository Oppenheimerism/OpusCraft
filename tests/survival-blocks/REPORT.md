# Survival blocks: report

Branch `claude/beautiful-goldberg-xx0i72`, from `origin/main` at `93288e7`. One commit per milestone, pushed before the
next was started. No history rewritten, nothing pushed to `main`.

| # | Milestone | Commit | State |
|---|-----------|--------|-------|
| 1 | Signs and hanging signs (11 woods) | `89f4d4a` | done |
| 2 | Ender chest | `4cba979` | done |
| 3 | Cake and candle cakes | see `git log` (the "Cake and candle cakes" commit) | done |
| 4 | Spyglass | | to do |
| 5 | Armour stand | | to do |
| 6 | Minecarts and rails | | to do |

Where nobody could be asked, the choice closest to vanilla 1.21 was made; each such choice is listed under the
milestone's "Deviations and open points".

---

## M3: cake and candle cakes

The cake block and item, and the 17 candle cakes (plain candle and 16 colours), lit or not.

- **Cake** (`src/world/blocksCake.ts`, `src/game/cake.ts`, vanilla `CakeBlock`): `bites` 0–6, eaten from the west
  side 2 px a slice (vanilla `SHAPE_BY_BITE`, 14×8×14 whole); strength 0.5, wool sounds, no tool, map colour none,
  forced solid (a cake, sign or banner stands on it), broken by pistons, needs something solid under it (breaks
  without drops otherwise), drops nothing even with silk touch, and water doesn't wash it away. Using it: only if
  hungry, or in creative (vanilla `canEat(false)`), +2 food and +0.4 saturation (`FoodData.eat(2, 0.1)`), the `eat`
  game event; after the 7th slice the block goes (`block_destroy`). Not hungry: the click passes on to the held item.
  A comparator reads `(7 − bites) × 2` (14 whole → 2). Eating makes no sound, as in vanilla.
- **Candles into it** (vanilla `CakeBlock.useItemOn`): any of the 17 candles used on an **uneaten** cake makes that
  candle's candle cake (1 candle used, none in creative; `block.cake.add_candle`, `block_change`). On a bitten cake the
  click eats a slice instead (if hungry).
- **Candle cakes** (vanilla `CandleCakeBlock`/`AbstractCandleBlock`): `lit`; light 3 while lit; the cake's shape plus
  the candle's (7..9 × 8..14); cut-out layer; a small flame over the wick (and now and then smoke and the crackle).
  Lit by flint and steel or a fire charge (their use goes straight to lighting it, it isn't eaten), by a dispenser's
  flint and steel, by a burning arrow. Put out by an empty hand on the candle (the click above the cake's middle,
  vanilla `candleHit`), a splash of water or a wind burst. Otherwise using it eats it as an uneaten cake: the candle
  drops and a cake with one slice gone is left. Comparator 14; drops its candle when broken (or when its support
  goes); picks as a cake; has no item of its own.
- **Item, recipe, creative**: the cake item stacks to 1, is drawn as its (already existing) sprite, and sits in the
  Food & Drinks tab after the cookie. Recipe: 3 milk buckets, 2 sugar, an egg, 3 wheat; the 3 buckets stay in the
  grid (the milk bucket now has vanilla's crafting remainder, `bucket`). Composting, the villager trade and the trial
  chamber loot that already named `cake` now work, since the item exists.
- **Textures** (`src/textures/cake.ts`): `cake_top` (frosting with red cherries), `cake_side` (frosting and drips over
  golden sponge with a jam line, drawn in the tile's lower half), `cake_bottom` (baked crust), `cake_inner` (the cut
  face); candle cakes use the candles' own textures (lit/unlit) on vanilla's `template_cake_with_candle` model.
- **Sounds** (`src/audio/gen/cake.ts`): `block.cake.add_candle` (3 takes: a damp squish and a small wax knock); the
  rest are wool's and the candles' existing ones.
- **Saving**: plain block states (`bites`, `lit`), kept by name in the chunk palette.
- **Multiplayer**: all host-side: a guest's clicks eat, add candles, light and put out; the guest's world, its food
  and inventory follow; everyone near hears it; a late joiner gets the states with the chunk.

**New files**: `src/world/blocksCake.ts`, `src/game/cake.ts`, `src/textures/cake.ts`, `src/item/itemsCake.ts`,
`src/audio/gen/cake.ts`; tests `tests/survival-blocks/cake.mjs`, `tests/survival-blocks/cake-mp.mjs`.

**Shared files touched** (a line or a few each, marked `(cake)`): `src/world/blocks.ts` (`registerCakeBlocks()`),
`src/game/level.ts` (`import './cake'`), `src/item/item.ts` (`registerCakeItems`), `src/inventory/recipes.ts` (the
recipe), `src/textures/blocks.ts` (`registerCakeTextures`), `src/audio/synth.ts` (`cakeSounds`),
`src/game/candles.ts` (a small `registerCandleKin` hook: `lightCandle`/`extinguishCandle` — used by flint and steel,
fire charges, dispensers and splash water — also try the candle cakes), `src/game/windBurst.ts` (a wind burst puts
out lit candles and candle cakes, vanilla `AbstractCandleBlock.onExplosionHit`), `src/game/redstone/piston.ts`
(candle cakes break when pushed), `src/game/banners.ts` (`legacySolid` also true for cakes).

**Deviations and open points**
- Wind bursts now also put out ordinary lit candles (the same vanilla method covers both; they didn't before).
- "Birthday Song" (an allay drops a cake at a note block) stays `never`: there are no allays in this game.
- There are no statistics, so `eat_cake_slice` isn't counted.
- The cake texture and the `block.cake.add_candle` sound are our own procedural versions.

**Tests**: `tests/survival-blocks/cake.mjs` (67 checks: states, shapes, strength, sounds, forced solid, pistons, map
colour, candle cake states/light/shape/layer, models, item/sprite/stack/tab/order, pick block, recipe and crafting
at a table with the buckets left, faces, the add-candle sound, composting, placing (a cake on a cake), eating when
full/hungry/creative, food and saturation (capped), `eat`/`block_destroy`, 7 slices, no drops, the analog output
for every bite and a real comparator, adding candles (consumed; not on a bitten cake; not consumed in creative),
flint and steel and fire charge lighting (not eaten, light 3), the flame, putting out by hand (hiss, smoke, event),
eating a lit and an unlit candle cake (candle dropped), holding an item, dispenser, burning arrow, splash water, wind
burst (also candles), drops, losing support, saving a chunk) and `tests/survival-blocks/cake-mp.mjs` (20 checks).

**Try it** (http://localhost:5173/?seed=12345):
1. Creative → Food & Drinks: the cake after the cookie (it stacks to 1). Survival: craft it (3 milk buckets, 2 sugar,
   an egg, 3 wheat): the buckets stay in the grid.
2. Place it on the ground (not on air). With a full hunger bar right-click does nothing; when hungry each click eats a
   slice (+1 drumstick); the 7th finishes it. Put a comparator against it: 14, then 2 less a slice.
3. Right-click a fresh cake with any candle: a candle cake. Flint and steel lights it (light 3, flame); an empty hand
   on the candle blows it out; a click on the cake part eats a slice and the candle pops off.
4. Break a candle cake: its candle drops; break a cake: nothing. Push them with a piston: they break.
5. LAN: a guest eats, adds a candle, lights and blows it out; the host sees the same.

---

## M2: ender chest

The ender chest block and item, and each player's own 27 ender slots that every ender chest opens onto.

- **Block** (`src/world/blocksEnderChest.ts`): `facing` (placed facing the player) and `waterlogged`; hardness 22.5,
  blast resistance 600, a pickaxe needed (any tier), light 7, stone sounds and map colour, vanilla's 1..15 × 0..14 shape
  for collision and outline, no comparator output. Drops 8 obsidian, or itself with silk touch (vanilla
  `blocks/ender_chest`). Hoppers don't see it as a container (as in vanilla). Breaking it angers piglins that see it
  (it was already in this game's `#guarded_by_piglins` list).
- **Opening** (`src/game/enderChest.ts`, vanilla `EnderChestBlock.useWithoutItem`): not while a redstone conductor is on
  top (glass, a slab, a chest are fine); opens a 3-row chest menu titled **Ender Chest** over the opener's own
  `PlayerEnderChest` (27 slots); piglins that see it are angered (vanilla `angerNearbyPiglins(player, true)`). The menu
  stays valid only while that chest exists and the player is within reach + 4 (vanilla `stillValidBlockEntity`).
  Spectators can't open it (vanilla: no menu provider) and never count as openers.
- **Lid, sounds, events** (`src/world/enderChestBlockEntity.ts`, vanilla `ContainerOpenersCounter` +
  `ChestLidController`): the first opener plays `block.ender_chest.open` (volume 0.5, pitch 0.9–1.0) and fires
  `container_open`; the last one out plays `block.ender_chest.close` and fires `container_close`; each change sends the
  block event (1, count) that moves the lid 0.1 per tick, eased as vanilla (`1 − (1 − f)³`). Every 5 ticks while open
  it drops openers removed from the level and re-sends the count (as vanilla's recheck). Portal motes: 3 per animate
  tick from the corner columns (vanilla `animateTick`).
- **Rendering** (`src/render/enderChestRenderer.ts`): vanilla `ChestModel` (bottom 14×10×14, lid 14×5×14 hinged at the
  back, lock 2×4×1 sharing the lid's pivot) with a procedural 64×64 sheet (`src/textures/enderChest.ts`: obsidian with
  pearl-green frames and a green gem latch), drawn in the block's light like the other block-entity renderers; the
  item/GUI icon is a 3-box block model on the atlas (`ender_chest_*` faces).
- **Item, recipe, creative**: stacks to 64, 8 obsidian around an eye of ender, Functional Blocks tab (between the
  barrel and the respawn anchor, as vanilla); it's not a furnace fuel (it used to match the chest's fuel rule).
- **Sounds** (`src/audio/gen/enderChest.ts`): open = stone lid grinding up, air drawn in, a hollow shimmering hum;
  close = air out, heavy stone knock, the hum sinking.
- **Saving**: the slots are kept with the player (`enderItems` in `savePlayer`/`loadPlayer`, `src/game/playerData.ts`):
  the host's own player in the world's meta, each LAN guest in its `playerdata/<uuid>` record. Saves from before have
  none (an empty ender chest). The block entity saves nothing but its position; the lid state is never saved.
- **Dying**: the inventory drops, the ender slots don't; respawning keeps them (same player object).
- **Multiplayer**: guests open it through the host (the host builds the menu over the guest's own slots, the guest's
  game shows a copy titled Ender Chest); two guests at one chest each see only their own; the lid state (open/closed,
  from, since which game tick) goes to guests in the block entity's update data only (not saved), so their copies
  animate the lid on their own clock; sounds are heard by everyone near. A guest's slots persist through leaving and
  rejoining, closing the tab (the host drops the session and saves the record at once), the host saving, quitting
  and reopening the world, and death.

**New files**: `src/world/blocksEnderChest.ts`, `src/world/enderChestBlockEntity.ts`, `src/game/enderChest.ts`,
`src/render/enderChestRenderer.ts`, `src/textures/enderChest.ts`, `src/audio/gen/enderChest.ts`; tests
`tests/survival-blocks/ender-chest.mjs`, `tests/survival-blocks/ender-chest-mp.mjs`.

**Shared files touched** (a line or two each, marked `(ender chests)`): `src/world/blocks.ts`
(`registerEnderChestBlock()`), `src/game/level.ts` (`import './enderChest'`), `src/game/playerData.ts` (`enderItems`
saved and loaded), `src/storage/worldStore.ts` (the `enderItems` field's type), `src/textures/blocks.ts`
(`registerEnderChestTextures`), `src/render/entityRenderers.ts` (calls `EnderChestRenderer`), `src/audio/synth.ts`
(`enderChestSounds`), `src/inventory/recipes.ts` (the recipe), `src/item/item.ts` (Functional Blocks tab; excluded
from the chest fuel rule), `src/net/chunkData.ts` (`visibleBlockEntity` merges a block entity's optional
`visibleData()` — only the ender chest's lid uses it). No protocol change. The existing `tests/saves/player.mjs` lists the saved
player record's fields exactly; `enderItems` was added to its list.

**Deviations and open points**
- Vanilla's `ChestModel` lock pivot: the lock turns about the lid's own hinge (0, 9, 1) so it stays on the lid.
- The ender chest item icon is a static block model (vanilla draws the chest's block-entity model in the GUI); it looks
  the same shut.
- No statistics in this game, so `open_enderchest` isn't counted.
- The sounds are generated (vanilla has recordings).

**Tests**: `tests/survival-blocks/ender-chest.mjs` (80 checks: block properties, light, shape, drops by tool and silk
touch, recipe, item/tab/fuel, sounds, texture sheet (every model face solid), item model, lid easing, placing and
facing, waterlogging, opening, menu title/size/slots, openers and active chest, sounds and game events, lid timing,
two players' separate slots, closing order, other chests opening onto the same slots, conductor above, reach, broken
while open, the 5-tick recheck (a lost block event, a removed player), spectators, piglins, motes, the guest's copy of
the lid, nothing saved on the block, save/load of the slots (and old saves), death and respawn) and
`tests/survival-blocks/ender-chest-mp.mjs` (38 checks: a guest opens it by clicking; menu title and slots; lid heard
by both guests and animated in their copies; shift-clicking in; two guests' slots separate; lid stays up while one is
still in; blocked by stone above; closed out of reach; leave with it open (lid shuts, record kept) and rejoin; close
the tab with it open and come back by the same name; death keeps it; the host's own player's slots; host saves and
quits with guests in, reopens: all three players' slots back). Existing suites re-run after the change, all passing:
`tests/saves/roundtrip.mjs`, `saves/player.mjs`, `multiplayer/m3-menus.mjs`, `m4-playerdata.mjs`, `m1-blocks.mjs`,
`m1-chunks.mjs`, `m1-security.mjs`, `survival-blocks/signs.mjs`, `signs-mp.mjs`, `end/shulkerbox.mjs`, `end/blocks.mjs`,
`menus/banners.mjs`, `bastions/m1a-blocks.mjs`, `ancient-city/m1-blocks.mjs`. `npm run typecheck` clean.
(M1's full regression, run in the background meanwhile: 171 of 172 suites passed; the one failure was
`saves/roundtrip.mjs`'s "never more than 100 ms without the page getting a turn" under the parallel run's load, which
passes when run alone.)

**Try it** (http://localhost:5173/?seed=12345):
1. Creative → Functional Blocks: the ender chest after the barrel. Survival: craft it from 8 obsidian + eye of ender.
2. Place it: it faces you, glows (light 7), purple motes drift about it. Right-click: "Ender Chest", the lid rises with
   its sound. Put something in, close (the lid falls), place a second ender chest far away: the same things are in it.
3. Put a stone block on top: it won't open; glass on top: it opens. Mine it with a pickaxe: 8 obsidian; with silk
   touch: the chest. The things inside are still in any other ender chest.
4. Die with things in it: they don't drop; they're there after respawning.
5. LAN: open to LAN, join from a second tab. The guest opens the same chest: its own empty slots; the host sees the lid
   up while the guest looks in. The guest puts something in, closes the tab, joins again with the same name: it's
   still there. Save and quit the host world (a world made from the title screen), reopen, open to LAN, the guest
   joins: still there.

---

## M1: signs and hanging signs

Oak, spruce, birch, jungle, acacia, dark oak, mangrove, cherry, bamboo, crimson and warped: a standing sign (16
rotations), a wall sign, a hanging sign (straight chains, or a vee of chains when `attached`, 16 rotations) and a wall
hanging sign for each, all waterloggable: 44 blocks, 22 items.

- **Blocks** (`src/world/blocksSigns.ts`): vanilla's properties, shapes (standing 4..12 column; wall 4.5..12.5 against
  the wall; hanging 14×10 board square to the world or the 10×16 square when turned between; wall hanging bracket
  plus board, the bracket being the only collision), hardness 1, axe, map colour of the planks, lava lights the
  overworld woods' (vanilla `ignitedByLava`), not the nether ones'. Sounds: signs sound as their wood (`wood`,
  `cherry_wood`, `bamboo_wood`, `nether_wood`); hanging signs have vanilla's four hanging-sign sound types
  (`hanging_sign`, `nether_wood_hanging_sign`, `bamboo_wood_hanging_sign`, `cherry_wood_hanging_sign`).
- **Placing** (`src/game/signs.ts`, vanilla `StandingAndWallBlockItem`/`SignItem`/`HangingSignItem`): tried in the
  order the player looks; standing on anything legacy-solid (signs and banners count, vanilla `forceSolidOn`), on a
  wall's solid face, under a block whose underside's centre is sturdy (a bottom slab yes, a top slab no), under a
  fence or a hanging sign; sneaking or a partial underside gives the vee (`attached`), turned to any of 16; a hanging
  sign held to another's underside chains under it square and straight on; a wall hanging sign goes across the face
  clicked and needs something to hang from along its bracket (a sturdy face or another wall hanging sign on the same
  axis). Standing, wall and ceiling signs break when their support goes; a wall hanging sign stays (as in vanilla).
- **Editor** (`src/gui/screens/signEdit.ts`, vanilla `SignEditScreen`/`HangingSignEditScreen`): opens on placing
  (front) and on right-click (the side the player is on: vanilla `isFacingFrontText`), 4 lines no wider than 90 px
  (60 px on a hanging sign), cursor blink, selection, Ctrl+A/C/V/X, Home/End, arrows, Up/Down/Enter between lines, Done;
  the sign drawn big behind the text at vanilla's scales (a standing sign's board and stick, a wall sign's board 35 px
  lower, a hanging sign's 16×16 picture at 4.5×). While typing, the sign in the world shows what is typed (in this game
  only). It closes when the sign goes or the player walks out of reach.
- **Writing** (vanilla `ServerGamePacketListenerImpl.handleSignUpdate` → `SignBlockEntity.updateSignText`): taken only
  from the player the sign is open for, within reach + 4 blocks, not waxed, exactly 4 lines of at most 384 characters;
  formatting codes (`§x`) and control characters are stripped. Nobody else can open a sign while it is being edited.
- **Dyes, ink, wax** (vanilla `SignApplicator`): any of the 16 dyes colours the side the player is on (only if it has
  text), glow ink sac makes it glow, ink sac undoes the glow, honeycomb waxes the sign (with the wax particles and
  sound; a waxed sign can't be edited or dyed and knocks with `block.sign.waxed_interact_fail`). The item is used up
  except in creative; each fires the `block_change` game event. **Glow and Behold!** (`husbandry/make_a_sign_glow`)
  is now earned (it was `never`).
- **Rendering** (`src/render/signRenderer.ts`, vanilla `SignRenderer`/`HangingSignRenderer`): the models at vanilla's
  sizes and transforms with procedural 64×32 textures per wood; text in the game font at vanilla's scale and offsets
  (lines 10 apart and 90 wide on a sign, 9 and 60 on a hanging sign; a line too wide is cut as `Font.split` cuts it);
  dark text colour = 0.4 × the dye's; glowing text full-bright with the 8-way outline within 16 blocks (always for
  black, whose outline is cream `0xF0EBCC`); both sides drawn; within the block-entity view distance (64).
- **Items, recipes, creative**: stack of 16; 6 planks + stick → 3 signs; 2 chains + 6 stripped logs/stems → 6 hanging
  signs (the bamboo ones have no recipe here because bamboo planks and the stripped bamboo block don't exist yet; they
  are still in the creative tab and in loot); fuel 200 / 800 ticks (none for crimson and warped); recipe-book groups
  `wooden_sign` / `hanging_sign`; all 22 in the Functional Blocks tab in vanilla's order where the oak sign was.
- **Saving**: the chunk's block entities, as vanilla's NBT keys (`front_text`/`back_text` as
  `{"messages","color","has_glowing_text"}` and `is_waxed`); a damaged save is cleaned up on load (lines cleaned, cut to
  384, padded to 4; unknown colour → black).
- **Multiplayer**: guests see signs and text (they come with the chunk, and every change is sent as block-entity data);
  a guest who places or clicks a sign gets its editor on its own screen (the host sends the block, its text, then
  `CB.OpenSignEditor`, as vanilla's `ServerPlayer.openTextEdit` does); the guest's Done sends `SB.SignUpdate`, which the
  host checks as above before writing and broadcasting. Malformed packets (a line over 384, wrong field count or
  types, out-of-world positions) disconnect the guest with a reason.

**New files**: `src/world/blocksSigns.ts`, `src/world/signBlockEntity.ts`, `src/game/signs.ts`,
`src/gui/screens/signEdit.ts`, `src/render/signRenderer.ts`, `src/textures/signs.ts`, `src/item/itemsSigns.ts`,
`src/inventory/recipesSigns.ts`, `src/audio/gen/signs.ts`; tests `tests/survival-blocks/signs.mjs`,
`tests/survival-blocks/signs-mp.mjs`.

**Shared files touched** (each a registration line or a few lines, marked `(signs)`):
`src/world/blocks.ts` (`registerSignBlocks()`), `src/item/item.ts` (`registerSignItems`), `src/textures/blocks.ts`
(bamboo planks/stripped block textures if missing), `src/textures/items.ts` (hanging sign icons),
`src/inventory/recipes.ts` (`registerSignRecipes`), `src/inventory/recipeBook.ts` (`hanging_sign` group before
`wooden_sign`), `src/gui/screens/creative.ts` (tab order), `src/audio/synth.ts` (`signSounds`), `src/game/level.ts`
(`import './signs'`), `src/game/banners.ts` (`legacySolid` also true for signs), `src/game/shapeUpdates.ts` (wall
posts: hanging signs aren't in `#wall_post_override`), `src/game/advancements.ts` (Glow and Behold! criterion),
`src/render/entityRenderer.ts` (`DrawState.polygonOffset`, vanilla's text layering), `src/render/entityRenderers.ts`
(calls `SignRenderer`), `src/gui/screens/index.ts` (`installSignScreens`), `src/gui/screens/book.ts` (exports its text
field helpers), `src/net/protocol.ts` (`SB.SignUpdate = 40`, `CB.OpenSignEditor = 80` with validators),
`src/net/config.ts` (`PROTOCOL_VERSION` 6 → 7, the branch's one bump), `src/net/server/session.ts`,
`src/net/server/hostServer.ts` (`openSignEditor`), `src/net/client/clientSession.ts` (`signUpdate`).

**Hooks**: `setSignEditorHook(f)` (game/signs.ts; the GUI installs it, routing a guest's player's editor to
`HostServer.openSignEditor`), `setSignPreview` / `signTextShown` (editor preview), `setSignScopingHook(f)`
(render/signRenderer.ts; the spyglass makes glow outlines visible at any distance: wired in M4).

**Deviations and open points**
- Bamboo signs and hanging signs have no crafting recipe: bamboo planks and the stripped bamboo block aren't in the
  game yet. Their particle textures are drawn only if nothing else registers them.
- The update's distance check is applied to every kind of sign (vanilla's `playerIsTooFarToEdit` covers the same).
- Clicking a sign never runs commands (no click events in this game's text).
- The line cut uses the game font's advances (vanilla `StringSplitter`); formatting isn't supported, so lines are
  plain text.
- The hanging signs' sounds are generated as the wood's sound mixed with a chain's rattle (vanilla has its own
  recordings).
- The pre-existing thin orange seam lines visible in some screenshots of the test stage appear without any sign too
  (a renderer artefact unrelated to this work).

**Tests**: `tests/survival-blocks/signs.mjs` (120 checks: blocks, items, recipes, placing, survival, writing and its
refusals, sides, dyes/glow/ink/wax, the advancement, save/load, text layout, the editor's keys) and
`tests/survival-blocks/signs-mp.mjs` (59 checks: guest places → its editor opens on its screen → host validates and
broadcasts; another guest can't write meanwhile; dyes/glow/ink/wax from a guest; back side; too far; hanging sign; the
host's own player editing; a late joiner sees text; malformed packets). Existing suites re-run after the change:
`tests/menus/banners.mjs`, `tests/multiplayer/m1-login.mjs`, `m1-security.mjs`, `m1-transport.mjs`, `m1-blocks.mjs`,
`m2-actions.mjs`: all pass. `npm run typecheck` clean.

**Try it** (`npm run dev`, then http://localhost:5173/?seed=12345):
1. Creative: the Functional Blocks tab lists every wood's sign and hanging sign after the tinted glass.
2. Place an oak sign on the ground: the editor opens; type 4 lines (try a too-long line, arrows, Ctrl+A), Done. The
   text faces you. Walk round: the back is blank; right-click from behind edits the back.
3. Put one on a wall, on another sign, under a block (straight chains), under a fence or while sneaking (vee of
   chains), on the side of a block (wall hanging sign), under a hanging sign (it chains). Break the block under/behind
   each: they drop, except the wall hanging sign.
4. Right-click written text with red dye, a glow ink sac (glows, outlined), an ink sac (stops), honeycomb (wax
   particles; now clicking only knocks). Get "Glow and Behold!".
5. In a world made from the title screen (the `?seed=` quick-start world is never saved): save and quit, reopen:
   text, colours, glow and wax are still there.
6. LAN: open to LAN, join from a second tab (`?join=<code>` or `?mp=join`). The guest places a sign: the editor opens
   on the guest's screen; after Done the host sees the text. While one edits, the other's click does nothing. A guest
   who joins later sees all the signs' text.
