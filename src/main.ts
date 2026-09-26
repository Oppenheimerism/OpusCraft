// Entry point.

import { Game } from './game/game';
import { installScreens } from './gui/screens';
import { TitleScreen, newWorldMeta } from './gui/screens/menus';
import { openToLanOnceSpawned, joinFirstLanWorld } from './gui/screens/multiplayer';
import { MULTIPLAYER_ENABLED } from './net/config';
import { getWorldMeta } from './storage/worldStore';

const params = new URLSearchParams(location.search);
/** ?mp=host (with &world=<id>, or a quick-start world) opens the world to LAN once it's in; ?mp=join joins one */
const mp = MULTIPLAYER_ENABLED ? params.get('mp') : null;

async function main(): Promise<void> {
  const canvas = document.getElementById('gl') as HTMLCanvasElement;
  const ui = document.getElementById('ui') as HTMLCanvasElement;
  const game = new Game(canvas, ui);
  await game.init();
  installScreens(game);
  (window as unknown as Record<string, unknown>).__game = game;
  if (params.has('seed') || params.has('quick')) {
    // developer quick-start: throwaway world that is never saved
    const mode = params.get('mode') ?? 'survival';
    const meta = newWorldMeta('__quick', 'Quick Test', params.get('seed') ?? 'test', mode, 'normal', false, true);
    meta.transient = true;
    if (params.has('t')) meta.dayTime = +params.get('t')!;
    if (params.has('rd')) game.opts.renderDistance = +params.get('rd')!;
    await game.startWorld(meta);
    if (mp === 'host') openToLanOnceSpawned(game);
    if (params.has('t')) game.freezeTime = true;
    if (params.has('x')) {
      const wait = setInterval(() => {
        if (!game.spawned) return;
        clearInterval(wait);
        game.teleport(+params.get('x')!, +(params.get('y') ?? 100), +(params.get('z') ?? 0), +(params.get('yaw') ?? 0), +(params.get('pitch') ?? 0));
        if (params.has('fly')) game.player.flying = true;
      }, 50);
    }
  } else if (mp === 'host' && params.get('world')) {
    // (a saved world by its id; the title screen if there's none)
    const meta = await getWorldMeta(params.get('world')!);
    if (meta) {
      await game.startWorld(meta);
      openToLanOnceSpawned(game);
    } else game.setScreen(new TitleScreen(game, true));
  } else if (mp === 'join') {
    game.setScreen(new TitleScreen(game, false));
    joinFirstLanWorld(game);
  } else {
    game.setScreen(new TitleScreen(game, true));
  }
  game.run();
}

main().catch((e) => {
  console.error(e);
  // (as text: an error's message can carry anything)
  const pre = document.createElement('pre');
  pre.style.cssText = 'color:#f55;padding:16px;white-space:pre-wrap';
  pre.textContent = String(e?.stack ?? e);
  document.body.replaceChildren(pre);
});
