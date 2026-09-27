// Entry point.

import { Game } from './game/game';
import { installScreens } from './gui/screens';
import { TitleScreen, newWorldMeta } from './gui/screens/menus';
import { openToLanOnceSpawned, joinFirstLanWorld, guestModeParam, JoinMultiplayerScreen } from './gui/screens/multiplayer';
import { MULTIPLAYER_ENABLED } from './net/config';
import { getWorldMeta } from './storage/worldStore';

const params = new URLSearchParams(location.search);
/**
 * ?mp=host (with &world=<id>, or a quick-start world) opens the world to LAN once it's in, its guests playing in
 * &guests=survival (the default), creative, adventure or spectator; ?mp=join joins one (&code=, the join code, for one
 * on another computer). ?join=<code> (the link a host sends friends) opens Multiplayer with the code filled in.
 * ?mplag=20-200 (testing) holds back what comes through the relay 20 to 200 ms, at random, in order
 */
const mp = MULTIPLAYER_ENABLED ? params.get('mp') : null;
const guests = guestModeParam(params.get('guests'));
const joinCode = MULTIPLAYER_ENABLED ? params.get('join') : null;
const lag = /^(\d{1,4})-(\d{1,4})$/.exec(params.get('mplag') ?? '');

async function main(): Promise<void> {
  const canvas = document.getElementById('gl') as HTMLCanvasElement;
  const ui = document.getElementById('ui') as HTMLCanvasElement;
  const game = new Game(canvas, ui);
  await game.init();
  installScreens(game);
  (window as unknown as Record<string, unknown>).__game = game;
  if (lag) game.netLag = { min: +lag[1], max: Math.max(+lag[1], +lag[2]) };
  if (params.has('seed') || params.has('quick')) {
    // developer quick-start: throwaway world that is never saved
    const mode = params.get('mode') ?? 'survival';
    const meta = newWorldMeta('__quick', 'Quick Test', params.get('seed') ?? 'test', mode, 'normal', false, true);
    meta.transient = true;
    if (params.has('t')) meta.dayTime = +params.get('t')!;
    if (params.has('rd')) game.opts.renderDistance = +params.get('rd')!;
    await game.startWorld(meta);
    if (mp === 'host') openToLanOnceSpawned(game, guests);
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
      openToLanOnceSpawned(game, guests);
    } else game.setScreen(new TitleScreen(game, true));
  } else if (mp === 'join') {
    game.setScreen(new TitleScreen(game, false));
    joinFirstLanWorld(game, params.get('code') ?? '');
  } else if (joinCode !== null) {
    game.setScreen(new JoinMultiplayerScreen(game, new TitleScreen(game, false), joinCode));
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
