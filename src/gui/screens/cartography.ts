// The cartography table's screen (vanilla CartographyTableScreen): the map as it will come out — small in the middle of a
// bigger sheet for paper, two sheets for an empty map, a padlock on it for a glass pane — and a red cross over the arrow
// when a locked map can't be zoomed out or locked again, or one is already as far out as it goes.

import type { Game } from '../../game/game';
import type { GuiGraphics } from '../guiGraphics';
import { AbstractContainerScreen } from './container';
import type { CartographyTableMenu } from '../../inventory/cartographyMenu';
import type { MapItemSavedData } from '../../game/mapData';
import { viewedMapData } from '../../game/maps';
import { mapRGBA } from '../../world/mapColors';
import '../../textures/jobSiteGui';

/** each map's picture on a canvas, redrawn when its colours change */
const pictures = new WeakMap<MapItemSavedData, { canvas: HTMLCanvasElement; version: number }>();

function picture(d: MapItemSavedData): HTMLCanvasElement {
  let p = pictures.get(d);
  if (!p) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    p = { canvas, version: -1 };
    pictures.set(d, p);
  }
  if (p.version !== d.colorVersion) {
    p.canvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(mapRGBA(d.colors).buffer), 128, 128), 0, 0);
    p.version = d.colorVersion;
  }
  return p.canvas;
}

export class CartographyTableScreen extends AbstractContainerScreen<CartographyTableMenu> {
  constructor(game: Game, menu: CartographyTableMenu) {
    super(game, menu, 'Cartography Table');
    this.titleLabelY -= 2;
  }

  renderBg(g: GuiGraphics): void {
    const i = this.leftPos, j = this.topPos;
    g.sprite('container_cartography_table', i, j, 176, 166);
    const add = this.menu.additionalSlot.item?.item.id;
    const hasMap = add === 'map', hasPaper = add === 'paper', hasGlass = add === 'glass_pane';
    const map = this.menu.mapSlot.item;
    let maxed = false;
    const d = map?.item.id === 'filled_map' ? viewedMapData(map) : null;
    if (d) {
      if (d.locked) {
        maxed = true;
        if (hasPaper || hasGlass) g.sprite('cartography_table_error', i + 35, j + 31, 28, 21);
      }
      if (hasPaper && d.scale >= 4) {
        maxed = true;
        g.sprite('cartography_table_error', i + 35, j + 31, 28, 21);
      }
    }
    // vanilla renderResultingMap
    if (hasPaper && !maxed) {
      g.sprite('cartography_table_scaled_map', i + 67, j + 13, 66, 66);
      this.renderMap(g, d, i + 85, j + 31, 0.226);
    } else if (hasMap) {
      g.sprite('cartography_table_duplicated_map', i + 67 + 16, j + 13, 50, 66);
      this.renderMap(g, d, i + 86, j + 16, 0.34);
      g.sprite('cartography_table_duplicated_map', i + 67, j + 13 + 16, 50, 66);
      this.renderMap(g, d, i + 70, j + 32, 0.34);
    } else if (hasGlass) {
      g.sprite('cartography_table_map', i + 67, j + 13, 66, 66);
      this.renderMap(g, d, i + 71, j + 17, 0.45);
      g.sprite('cartography_table_locked', i + 118, j + 60, 10, 14);
    } else {
      g.sprite('cartography_table_map', i + 67, j + 13, 66, 66);
      this.renderMap(g, d, i + 71, j + 17, 0.45);
    }
  }

  /** vanilla renderMap: the picture 128 × `scale` across (with the markers an item frame would show: none of the game's) */
  private renderMap(g: GuiGraphics, d: MapItemSavedData | null, x: number, y: number, scale: number): void {
    if (!d) return;
    const s = g.scale;
    g.ctx.imageSmoothingEnabled = false;
    g.ctx.drawImage(picture(d), 0, 0, 128, 128, Math.round(x * s), Math.round(y * s), Math.round(128 * scale * s), Math.round(128 * scale * s));
  }
}
