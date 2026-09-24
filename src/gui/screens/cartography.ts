// The cartography table's screen (vanilla CartographyTableScreen): the map as it will come out — small in the middle of a
// bigger sheet for paper, two sheets for an empty map, a padlock on it for a glass pane — and a red cross over the arrow
// when a locked map can't be zoomed out or locked again, or one is already as far out as it goes.

import type { Game } from '../../game/game';
import type { GuiGraphics } from '../guiGraphics';
import { AbstractContainerScreen } from './container';
import type { CartographyTableMenu } from '../../inventory/cartographyMenu';
import { DECORATION_TYPES, type MapItemSavedData, type DecorationType } from '../../game/mapData';
import { viewedMapData } from '../../game/maps';
import { mapRGBA } from '../../world/mapColors';
import { decorationAtlas } from '../../textures/mapTextures';
import { nameLayout } from '../../render/mapRenderer';
import '../../textures/jobSiteGui';

/** each map's picture on a canvas, redrawn when its colours change */
const pictures = new WeakMap<MapItemSavedData, { canvas: HTMLCanvasElement; version: number }>();

/** the markers' sprites on a canvas, and where each one is */
let markers: { canvas: HTMLCanvasElement; uv: Record<DecorationType, [number, number, number, number]> } | null = null;

function markerSheet(): NonNullable<typeof markers> {
  if (!markers) {
    const a = decorationAtlas();
    const canvas = document.createElement('canvas');
    canvas.width = a.tex.w;
    canvas.height = a.tex.h;
    canvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(a.tex.data), a.tex.w, a.tex.h), 0, 0);
    markers = { canvas, uv: a.uv };
  }
  return markers;
}

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

  /**
   * vanilla renderMap: the picture 128 × `scale` across, with the markers an item frame would show (banners, not
   * players) and their names, as vanilla MapRenderer draws them
   */
  private renderMap(g: GuiGraphics, d: MapItemSavedData | null, x: number, y: number, scale: number): void {
    if (!d) return;
    const s = g.scale;
    const ctx = g.ctx;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(picture(d), 0, 0, 128, 128, Math.round(x * s), Math.round(y * s), Math.round(128 * scale * s), Math.round(128 * scale * s));
    const shown = [...d.decorations.values()].filter((dec) => DECORATION_TYPES[dec.type].showOnItemFrame);
    if (!shown.length) return;
    const sheet = markerSheet();
    ctx.save();
    ctx.translate(Math.round(x * s), Math.round(y * s));
    ctx.scale(scale * s, scale * s);
    for (const dec of shown) {
      const [u0, , u1] = sheet.uv[dec.type];
      ctx.save();
      ctx.translate(dec.x / 2 + 64, dec.y / 2 + 64);
      ctx.rotate((((dec.rot * 360) / 16) * Math.PI) / 180);
      ctx.scale(4, 4);
      ctx.translate(-0.125, 0.125);
      // (vanilla's quad has the sprite's top at +y: upside down)
      ctx.scale(1, -1);
      ctx.drawImage(sheet.canvas, u0 * sheet.canvas.width, 0, (u1 - u0) * sheet.canvas.width, sheet.canvas.height, -1, -1, 2, 2);
      ctx.restore();
      if (dec.name === null) continue;
      const width = g.font.width(dec.name);
      const at = nameLayout(dec, width);
      ctx.save();
      ctx.translate(at.x, at.y);
      ctx.scale(at.scale, at.scale);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.fillRect(-1, -1, width + 2, 10);
      g.font.draw(ctx, dec.name, 0, 0, 0xffffff, 1);
      ctx.restore();
    }
    ctx.restore();
  }
}
