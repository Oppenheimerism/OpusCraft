// Maps (vanilla EmptyMapItem, MapItem, MapCloningRecipe and MapExtendingRecipe): using an empty map makes a filled one
// of the ground around you with an id of its own; held in either hand it draws what's around its holder, shaded by
// height (and water by depth), until it's locked; its tooltip gives the id; a crafting table copies it onto empty maps,
// or zooms it out with paper.

import { ItemStack } from '../item/item';
import type { Level } from './level';
import type { Player } from '../entity/player';
import type { Chunk } from '../world/chunk';
import { S, FLAGS, FACE_OCC, F_WATER, F_LAVA, F_OPAQUE } from '../world/block';
import { MIN_Y, SECTIONS } from '../world/constants';
import { MapColor, Brightness, packedId, mapColorOf } from '../world/mapColors';
import { MapItemSavedData, MAP_SIZE, mapStorage, currentMapStorage } from './mapData';
import { registerItemBehavior } from './itemBehavior';
import { registerHoverText, registerComponentTooltip } from '../item/hoverText';
import { registerCustomRecipe } from '../inventory/customRecipes';

/** vanilla MapItem.getSavedData(stack, level): the map's data, if it has an id and the world has it */
export function getSavedData(stack: ItemStack | null, level: Level): MapItemSavedData | null {
  const id = stack?.item.id === 'filled_map' ? stack.tag?.mapId : undefined;
  return id === undefined ? null : mapStorage(level).get(id);
}

/** the map's data as the one playing sees it (vanilla's client level: tooltips, screens, the map in hand) */
export function viewedMapData(stack: ItemStack | null): MapItemSavedData | null {
  const id = stack?.item.id === 'filled_map' ? stack.tag?.mapId : undefined;
  return id === undefined ? null : (currentMapStorage()?.get(id) ?? null);
}

/** vanilla MapItem.create: a filled map with a new id, its data made fresh around (x, z) */
export function createMap(level: Level, x: number, z: number, scale: number, trackingPosition: boolean, unlimitedTracking: boolean): ItemStack {
  const s = ItemStack.of('filled_map');
  const store = mapStorage(level);
  const id = store.freeMapId();
  store.set(id, MapItemSavedData.createFresh(x, z, scale, trackingPosition, unlimitedTracking, level.world.dim.id));
  s.tag = { mapId: id };
  return s;
}

// ---------------------------------------------------------------------------
// Drawing (vanilla MapItem.update)

/** vanilla Heightmap.Types.WORLD_SURFACE: the highest block that isn't air (MIN_Y - 1 for none) */
function surfaceY(c: Chunk, lx: number, lz: number): number {
  const col = (lz << 4) | lx;
  for (let s = SECTIONS - 1; s >= 0; s--) {
    const b = c.blocks[s];
    if (!b || c.nonAir[s] === 0) continue;
    for (let ly = 15; ly >= 0; ly--) if (b[(ly << 8) | col] !== 0) return MIN_Y + s * 16 + ly;
  }
  return MIN_Y - 1;
}

const isFluid = (st: number): boolean => (FLAGS[st] & (F_WATER | F_LAVA)) !== 0;

/** vanilla getCorrectStateForFluidBlock: under a fluid that doesn't cover a sturdy top, the fluid is what shows */
function correctStateForFluid(st: number): number {
  if (!isFluid(st) || FLAGS[st] & F_OPAQUE || FACE_OCC[st] & 2) return st;
  return FLAGS[st] & F_LAVA ? S('lava') : S('water');
}

/**
 * vanilla MapItem.update: sweeps the map around the viewer, a sixteenth of the columns each tick (and on past any
 * column that changed), out to 128 blocks (64 in the Nether). Each pixel takes the commonest map colour of its blocks'
 * tops (looking through what has no colour), lighter or darker than the pixel north of it as the ground rises or falls
 * (water by its depth instead), dithered in a checkerboard; the rim of the circle is drawn every other pixel. A
 * dimension with a ceiling shows only a noise of dirt and stone. Chunks that aren't loaded are left as they are.
 */
export function updateMap(level: Level, viewer: Player, data: MapItemSavedData): void {
  const dim = level.world.dim;
  if (dim.id !== data.dimension) return;
  const i = 1 << data.scale;
  const j = data.centerX, k = data.centerZ;
  const l = Math.trunc(Math.floor(viewer.x - j) / i) + 64;
  const i1 = Math.trunc(Math.floor(viewer.z - k) / i) + 64;
  let j1 = Math.trunc(MAP_SIZE / i);
  if (dim.hasCeiling) j1 = Math.trunc(j1 / 2);
  const holder = data.holdingPlayer(viewer);
  holder.step++;
  const minY = dim.minY;
  const bedrock = mapColorOf(S('bedrock'));
  const counts = new Map<MapColor, number>();
  let flag = false;
  for (let k1 = l - j1 + 1; k1 < l + j1; k1++) {
    if ((k1 & 15) !== (holder.step & 15) && !flag) continue;
    flag = false;
    let d0 = 0;
    for (let l1 = i1 - j1 - 1; l1 < i1 + j1; l1++) {
      if (k1 < 0 || l1 < -1 || k1 >= MAP_SIZE || l1 >= MAP_SIZE) continue;
      const i2 = (k1 - l) * (k1 - l) + (l1 - i1) * (l1 - i1);
      const rim = i2 > (j1 - 2) * (j1 - 2);
      const j2 = (Math.trunc(j / i) + k1 - 64) * i;
      const k2 = (Math.trunc(k / i) + l1 - 64) * i;
      const chunk = level.world.getChunk(j2 >> 4, k2 >> 4);
      if (!chunk) continue;
      counts.clear();
      let l2 = 0;
      let d1 = 0;
      if (dim.hasCeiling) {
        let i3 = (j2 + Math.imul(k2, 231871)) | 0;
        i3 = (Math.imul(Math.imul(i3, i3), 31287121) + Math.imul(i3, 11)) | 0;
        counts.set(((i3 >> 20) & 1) === 0 ? mapColorOf(S('dirt')) : mapColorOf(S('stone')), 1);
        d1 = 100;
      } else {
        for (let j3 = 0; j3 < i; j3++)
          for (let k3 = 0; k3 < i; k3++) {
            const lx = (j2 + j3) & 15, lz = (k2 + k3) & 15;
            let l3 = surfaceY(chunk, lx, lz) + 1;
            let color: MapColor;
            if (l3 <= minY + 1) color = bedrock;
            else {
              let st: number;
              do st = chunk.getState(lx, --l3, lz);
              while (mapColorOf(st) === MapColor.NONE && l3 > minY);
              if (l3 > minY && isFluid(st)) {
                let i4 = l3 - 1;
                let below: number;
                do {
                  below = chunk.getState(lx, i4--, lz);
                  l2++;
                } while (i4 > minY && isFluid(below));
                st = correctStateForFluid(st);
              }
              color = mapColorOf(st);
            }
            d1 += l3 / (i * i);
            counts.set(color, (counts.get(color) ?? 0) + 1);
          }
      }
      l2 = Math.trunc(l2 / (i * i));
      // (vanilla Multisets.copyHighestCountFirst: the commonest, the first seen on a tie)
      let color = MapColor.NONE, best = 0;
      for (const [c, n] of counts)
        if (n > best) {
          best = n;
          color = c;
        }
      let b: Brightness;
      if (color === MapColor.WATER) {
        const d2 = l2 * 0.1 + ((k1 + l1) & 1) * 0.2;
        b = d2 < 0.5 ? Brightness.HIGH : d2 > 0.9 ? Brightness.LOW : Brightness.NORMAL;
      } else {
        const d3 = ((d1 - d0) * 4) / (i + 4) + (((k1 + l1) & 1) - 0.5) * 0.4;
        b = d3 > 0.6 ? Brightness.HIGH : d3 < -0.6 ? Brightness.LOW : Brightness.NORMAL;
      }
      d0 = d1;
      if (l1 >= 0 && i2 < j1 * j1 && (!rim || ((k1 + l1) & 1) !== 0)) flag = data.updateColor(k1, l1, packedId(color, b)) || flag;
    }
  }
}

// ---------------------------------------------------------------------------
// Crafted and cartography-table maps (vanilla MapItem.onCraftedPostProcess)

/** vanilla MapItem.scaleMap: a new map, one step further out, of the same place */
function scaleMap(stack: ItemStack, level: Level): void {
  const d = getSavedData(stack, level);
  if (!d) return;
  const store = mapStorage(level);
  const id = store.freeMapId();
  store.set(id, d.scaled());
  stack.tag = { ...stack.tag, mapId: id };
}

/** vanilla MapItem.lockMap: a new map, a locked copy of this one */
export function lockMap(level: Level, stack: ItemStack): void {
  const d = getSavedData(stack, level);
  if (!d) return;
  const store = mapStorage(level);
  const id = store.freeMapId();
  store.set(id, d.lockedCopy());
  stack.tag = { ...stack.tag, mapId: id };
}

/** vanilla onCraftedPostProcess: what the cartography table or crafting grid asked of the map is done as it's taken */
export function onCraftedPostProcess(stack: ItemStack, level: Level): void {
  const pp = stack.tag?.mapPostProcessing;
  if (!pp) return;
  delete stack.tag!.mapPostProcessing;
  if (pp === 'lock') lockMap(level, stack);
  else scaleMap(stack, level);
}

// ---------------------------------------------------------------------------
// The items

registerItemBehavior('map', {
  // vanilla EmptyMapItem.use: one used up (not in creative) for a filled map of here, which takes its place in the
  // hand if that was the last, or goes into the inventory (or at your feet); the cartography table's sound
  use(level, p, stack) {
    const inv = p.inventory;
    if (p.gameMode !== 'creative') inv.consumeSelected(1);
    level.sound.play('ui.cartography_table.take_result', p.x, p.y, p.z, 1, 1);
    const map = createMap(level, Math.floor(p.x), Math.floor(p.z), 0, true, false);
    if (!inv.selectedItem || stack.count <= 0) inv.setSelectedItem(map);
    else if (inv.add(map.copy()) > 0) p.dropItem(map, false);
    return 'success';
  },
});

registerItemBehavior('filled_map', {
  // vanilla MapItem.inventoryTick: its carriers are marked on it, and it draws while in either hand (unless locked)
  inventoryTick(level, p, stack, _slot, selected) {
    const d = getSavedData(stack, level);
    if (!d) return;
    d.tickCarriedBy(p, stack);
    if (!d.locked && (selected || p.inventory.offhand === stack)) updateMap(level, p, d);
  },
  onCraftedBy(level, _p, stack) {
    onCraftedPostProcess(stack, level);
  },
});

// vanilla ItemStack.getTooltipLines: under a filled map's name, its id (unless it's been renamed)
registerComponentTooltip('before', (s) => {
  const id = s.tag?.mapId;
  return s.item.id === 'filled_map' && id !== undefined && s.tag?.customName === undefined ? [`§7Id #${id}`] : [];
});

// vanilla MapItem.appendHoverText: "Locked" on a locked map, or one the cartography table will lock (the scale is
// only told with advanced tooltips)
registerHoverText('filled_map', (s) => {
  const d = viewedMapData(s);
  return d && (d.locked || s.tag?.mapPostProcessing === 'lock') ? ['§7Locked'] : [];
});

// vanilla MapCloningRecipe (3×3 grids only): a filled map and any number of empty maps, nothing else, make as many copies
registerCustomRecipe({
  assemble(grid, width) {
    if (width < 3) return null;
    let map: ItemStack | null = null;
    let blanks = 0;
    for (const s of grid) {
      if (!s) continue;
      if (s.item.id === 'filled_map') {
        if (map) return null;
        map = s;
      } else if (s.item.id === 'map') blanks++;
      else return null;
    }
    return map && blanks > 0 ? map.copyWithCount(blanks + 1) : null;
  },
});

// vanilla MapExtendingRecipe: a filled map ringed by eight paper zooms it out one step (to 4 at most, never an explorer
// map), done as it's taken
registerCustomRecipe({
  assemble(grid, width) {
    if (width !== 3 || grid.length !== 9) return null;
    for (let n = 0; n < 9; n++) if (grid[n]?.item.id !== (n === 4 ? 'filled_map' : 'paper')) return null;
    const map = grid[4]!;
    const d = viewedMapData(map);
    if (!d || d.isExplorationMap() || d.scale >= 4) return null;
    const out = map.copyWithCount(1);
    out.tag = { ...out.tag, mapPostProcessing: 'scale' };
    return out;
  },
});
