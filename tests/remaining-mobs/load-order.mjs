// Headless check that the game's modules load as a browser loads them (node tests/remaining-mobs/load-order.mjs;
// remaining mobs, found in milestone 4): in main.ts's order, the game first. An import cycle can leave a module's
// export unset while another module uses it as it loads; the dispenser's hive hooks and the beehive did, from the bee
// (milestone 1) on, so the game didn't start in a browser at all. The other tests load their modules in orders of their
// own and missed it; this one loads them the way main.ts does, so a cycle like that shows here as it would there.
import { loadModules } from '../../scripts/load.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 600000).unref();

let fails = 0;
const check = (name, cond, extra = '') => { if (!cond) fails++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };

// (main.ts's imports, in its order; main.ts itself reads the page's address as it loads)
const MAIN = ['/src/game/game.ts', '/src/gui/screens/index.ts', '/src/gui/screens/menus.ts', '/src/gui/screens/multiplayer.ts', '/src/net/config.ts', '/src/storage/worldStore.ts'];
let mods = null, close = null, err = null;
try {
  ({ mods, close } = await loadModules([...MAIN, '/src/game/redstone/hiveDispense.ts', '/src/game/spawner.ts']));
} catch (e) {
  err = e;
}
check('the game\'s modules load in main.ts\'s order (the game first), as in a browser', !err && !!mods, err ? String(err.message).slice(0, 200) : '');
if (mods) {
  const hooks = mods[MAIN.length].hiveDispense;
  check('...the beehive has set the dispenser\'s hooks (shears, a glass bottle)', typeof hooks?.shear === 'function' && typeof hooks?.bottle === 'function');
  const { MOB_TYPES } = mods[MAIN.length + 1];
  check('...every mob the remaining-mobs branch adds is there to be made', ['bee', 'phantom', 'panda', 'mooshroom', 'armadillo'].every((t) => typeof MOB_TYPES?.[t] === 'function'));
}

await close?.();
console.log(fails ? `${fails} FAILED` : 'all ok');
process.exit(fails ? 1 : 0);
