// M4a: the stables' hoglins as a player meets them: placed by the bastion (persistent, grown or a piglet), bred with
// crimson fungus (two fed, a piglet between them), and out of the Nether a zoglin after fifteen seconds.

import { load, check, exitWithStatus, flatLevel, playerAt, ticks } from './lib.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 600000).unref();

const { m, close } = await load(['/src/entity/hoglin.ts', '/src/game/spawner.ts', '/src/world/dimension.ts']);

function arena(nether = true) {
  const L = flatLevel(m, -2, -2, 1, 1, 64, 'hoglins');
  if (nether) L.world.dim = m.DIMENSIONS.the_nether;
  return L;
}
function hoglin(level, x, z) {
  const d = { id: 'hoglin', x: x + 0.5, y: 64, z: z + 0.5, yaw: 0, pitch: 0, dx: 0, dy: 0, dz: 0, health: 40, fire: 0, persistent: true, data: { finalize: 'structure' } };
  const e = m.loadEntity(d, level);
  level.addEntity(e);
  return e;
}

{
  const { level } = arena();
  let babies = 0;
  for (let i = 0; i < 200; i++) if (hoglin(level, (i % 20) - 10, Math.floor(i / 20) - 10).isBaby()) babies++;
  check(`placed by a bastion: persistent, one in five a piglet (${babies} of 200)`, level.entities.filter((e) => e.type === 'hoglin').every((h) => h.persistenceRequired) && babies > 20 && babies < 65);
}
{
  const { level } = arena();
  const a = hoglin(level, 0, 0), b = hoglin(level, 2, 0);
  a.setAge(0);
  b.setAge(0);
  const p = playerAt(m, level, 1.5, 64, 3.5, { creative: true, held: 'crimson_fungus' });
  p.inventory.main[0] = new m.ItemStack(m.ITEMS.get('crimson_fungus'), 8);
  const fed = [a, b].map((h) => h.interact(p, p.inventory.main[0]));
  check('bred: each takes crimson fungus', fed.every(Boolean) && a.inLove > 0 && b.inLove > 0);
  let piglet = null;
  for (let t = 0; t < 600 && !piglet; t++) {
    level.tick();
    piglet = level.entities.find((e) => e.type === 'hoglin' && e !== a && e !== b && e.isBaby());
  }
  check('bred: a piglet between them', !!piglet);
  const c = hoglin(level, -5, -5);
  c.setAge(0);
  check('bred: nothing but crimson fungus (not warped)', !c.interact(p, new m.ItemStack(m.ITEMS.get('warped_fungus'), 1)));
}
{
  const { level } = arena(false);
  const h = hoglin(level, 0, 0);
  ticks(level, 302);
  const z = level.entities.find((e) => e.type === 'zoglin');
  check('out of the Nether: a zoglin after fifteen seconds', h.removed && !!z && z.persistenceRequired);
}

await exitWithStatus(close);
