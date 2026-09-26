// Every villager job site (vanilla PoiTypes) is a block with its vanilla name (node tests/villages/poi.mjs).
import { loadModules } from '../../scripts/load.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 120000).unref();
const { mods, close } = await loadModules(['/src/world/blocks.ts', '/src/world/block.ts', '/src/item/item.ts', '/src/game/villageBlocks.ts']);
const [, blockMod, itemMod] = mods;
const POI = {
  armorer: ['blast_furnace'], butcher: ['smoker'], cartographer: ['cartography_table'], cleric: ['brewing_stand'], farmer: ['composter'],
  fisherman: ['barrel'], fletcher: ['fletching_table'], leatherworker: ['cauldron', 'water_cauldron', 'lava_cauldron'], librarian: ['lectern'],
  mason: ['stonecutter'], shepherd: ['loom'], toolsmith: ['smithing_table'], weaponsmith: ['grindstone'], meeting: ['bell'], home: ['white_bed', 'red_bed'],
};
let fails = 0;
for (const [job, blocks] of Object.entries(POI))
  for (const b of blocks) {
    const ok = blockMod.BLOCK_BY_NAME.has(b);
    if (!ok) fails++;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${job}: ${b}`);
  }
// every new block has an item (or picks as one), a model for every state, and a hardness
const NEW = ['bell', 'barrel', 'composter', 'smoker', 'blast_furnace', 'cauldron', 'water_cauldron', 'lava_cauldron', 'lectern', 'cartography_table',
  'fletching_table', 'smithing_table', 'loom', 'stonecutter', 'brewing_stand', 'flower_pot', 'potted_poppy', 'potted_azalea_bush', 'campfire', 'soul_campfire'];
for (const n of NEW) {
  const b = blockMod.getBlock(n);
  let models = true;
  for (let st = b.firstState; st < b.firstState + b.stateCount; st++) if (!b.s.model?.(blockMod.STATE_VIEWS[st])) models = false;
  const item = itemMod.itemForBlock(n);
  const ok = models && !!item && b.hardness >= 0;
  if (!ok) fails++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${n}: ${b.stateCount} states, item ${item?.id}`);
}
console.log(fails ? `${fails} FAILED` : 'all ok');
await close();
process.exit(fails ? 1 : 0);
