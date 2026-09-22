// Entry point.

import { Game } from './game/game';
import type { GameMode } from './entity/player';

const params = new URLSearchParams(location.search);

async function main(): Promise<void> {
  const canvas = document.getElementById('gl') as HTMLCanvasElement;
  const ui = document.getElementById('ui') as HTMLCanvasElement;
  const game = new Game(canvas, ui, {
    renderDistance: +(params.get('rd') ?? 12),
  });
  await game.init();
  const mode = (params.get('mode') ?? 'survival') as GameMode;
  await game.startWorld(params.get('seed') ?? 'test', mode);
  if (params.has('t')) {
    game.level.dayTime = +params.get('t')!;
    game.freezeTime = true;
  }
  if (params.has('x')) {
    const wait = setInterval(() => {
      if (!game.spawned) return;
      clearInterval(wait);
      game.teleport(+params.get('x')!, +(params.get('y') ?? 100), +(params.get('z') ?? 0), +(params.get('yaw') ?? 0), +(params.get('pitch') ?? 0));
      if (params.has('fly')) game.player.flying = true;
    }, 50);
  }
  game.giveStarterItems();
  ui.addEventListener('click', () => game.input.lock());
  canvas.addEventListener('click', () => game.input.lock());
  (window as unknown as Record<string, unknown>).__game = game;
  game.run();
}

main().catch((e) => {
  console.error(e);
  document.body.innerHTML = `<pre style="color:#f55;padding:16px;white-space:pre-wrap">${String(e?.stack ?? e)}</pre>`;
});
