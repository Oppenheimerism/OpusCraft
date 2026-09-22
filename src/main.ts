// Entry point.

import { Game } from './game/game';
import { installScreens } from './gui/screens';
import { TitleScreen, newWorldMeta } from './gui/screens/menus';

const params = new URLSearchParams(location.search);

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
    if (params.has('t')) game.freezeTime = true;
    if (params.has('x')) {
      const wait = setInterval(() => {
        if (!game.spawned) return;
        clearInterval(wait);
        game.teleport(+params.get('x')!, +(params.get('y') ?? 100), +(params.get('z') ?? 0), +(params.get('yaw') ?? 0), +(params.get('pitch') ?? 0));
        if (params.has('fly')) game.player.flying = true;
      }, 50);
    }
  } else {
    game.setScreen(new TitleScreen(game, true));
  }
  game.run();
}

main().catch((e) => {
  console.error(e);
  document.body.innerHTML = `<pre style="color:#f55;padding:16px;white-space:pre-wrap">${String(e?.stack ?? e)}</pre>`;
});
