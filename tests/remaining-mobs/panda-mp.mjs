// Multiplayer checks for the panda (node tests/remaining-mobs/panda-mp.mjs; remaining mobs, milestone 3), over the
// multiplayer harness (tests/multiplayer/lib.mjs): a guest sees a panda as the host has it (its genes and so its
// skin, sitting with bamboo in its paws and eating it, rolling over, lying on its back, sulking, a cub's size and its
// sneeze), hears its munching and sees the crumbs; a guest's bamboo puts a panda in love, the host deciding, one piece
// used, and one that can't fall in love sits down and eats it; a guest plants bamboo (a shoot on the ground, stalk on
// the shoot) and cuts it down with a sword at a stroke.

import { loadNet, ENTITY_MODULES, flatHost, makeGuest, hostCopy, copyOf, step, assertMirrorEquals, check, exitWithStatus } from '../multiplayer/lib.mjs';

const { m, close } = await loadNet([...ENTITY_MODULES, '/src/entity/panda.ts', '/src/game/bamboo.ts', '/src/world/blocksBamboo.ts', '/src/world/blockOffset.ts']);

const host = flatHost(m, 4, { guestGameMode: 'survival' });
const lvl = host.level;
lvl.doDaylightCycle = false;
lvl.dayTime = 6000;
const g = makeGuest(host, 'Alex', { viewDistance: 3 });
step(host, 30);
const hg = hostCopy(host, g);
check('(the guest is in, in survival)', !!hg && !!g.world && hg.gameMode === 'survival');

/** a panda of `genes` at (x, 64, z), standing still (its AI off unless `ai`) */
function panda(x, z, genes = ['normal', 'normal'], { ai = false, baby = false } = {}) {
  const p = m.createMob('panda', lvl);
  p.moveTo(x, 64, z, 0, 0);
  p.finalizeSpawn('command');
  [p.mainGene, p.hiddenGene] = genes;
  p.persistenceRequired = true;
  if (baby) p.setAge(-24000);
  if (!ai) p.serverAiStep = () => {};
  lvl.addEntity(p);
  return p;
}
/** what the guest holds in its first hotbar slot (the host's copy given it, as /give would) */
function give(stack) {
  hg.inventory.main[0] = stack;
  hg.inventory.selected = 0;
  hg.inventory.version++;
  step(host, 3);
}
/** a click of `button` ('attack' or 'use') with `e`'s copy under the crosshair */
function click(button, e) {
  g.session.input(button === 'attack', false, button === 'use', false, e ? copyOf(g, e) : null);
  step(host, 1);
  g.session.input(false, false, false, false, null);
  step(host, 3);
}
/** the guest standing at (x, 64, z) looking at (tx, ty, tz) */
function standLooking(x, z, tx, ty, tz) {
  const p = g.player;
  p.flying = false;
  p.dx = p.dy = p.dz = 0;
  const dx = tx - x, dy = ty - (64 + p.eyeHeight), dz = tz - z;
  const yaw = (Math.atan2(dz, dx) * 180) / Math.PI - 90, pitch = (-Math.atan2(dy, Math.hypot(dx, dz)) * 180) / Math.PI;
  p.moveTo(x, 64, z, yaw, pitch);
  step(host, 4);
}

// ---------------------------------------------------------------------------
// seeing a panda
{
  const p = panda(3.5, 3.5, ['brown', 'brown']);
  step(host, 4);
  const c = copyOf(g, p);
  check('a guest has a copy of the host\'s panda, a panda, its genes the host\'s (brown: its brown skin)', c instanceof m.Panda && c.mainGene === 'brown' && c.hiddenGene === 'brown' && c.variant() === 'brown', `${c?.mainGene} ${c?.hiddenGene}`);
  p.mainGene = 'aggressive';
  p.hiddenGene = 'weak';
  step(host, 3);
  check('...its genes changed with the host\'s (aggressive shows)', c.variant() === 'aggressive');
  p.setItemSlot('mainhand', m.ItemStack.of('bamboo', 3));
  p.sit(true);
  step(host, 10);
  check('...sitting (eased back onto its haunches), bamboo in its paws', c.isSitting() && c.sitAmount === 1 && c.mainHand?.item.id === 'bamboo' && c.mainHand.count === 3);
  p.eat(true);
  step(host, 3);
  check('...eating it when the host\'s is (its head bobbing)', c.isEating() && c.eatCounter > 0);
  g.level.sounds.length = 0;
  g.level.particleCalls.length = 0;
  step(host, 40);
  const munches = g.level.sounds.filter((s) => s.name === 'entity.panda.eat').length;
  const crumbs = g.level.particleCalls.filter((x) => x.method === 'spawn' && x.args[0] === 'item_bamboo').length;
  check('...its munching heard, the crumbs of bamboo seen', munches >= 4 && crumbs === munches * 6, `${munches} munches, ${crumbs} crumbs`);
  p.eat(false);
  p.sit(false);
  p.setItemSlot('mainhand', null);
  step(host, 10);
  check('...up again, its paws empty', !c.isSitting() && c.sitAmount === 0 && !c.mainHand);
  p.mainGene = p.hiddenGene = 'playful';
  p.roll(true);
  step(host, 5);
  check('...rolling over when the host\'s is (how far on: its roll counter)', c.isRolling() && c.rollCounter > 0 && Math.abs(c.rollCounter - p.rollCounter) <= 3 && c.rollAmount > 0, `${c.rollCounter} vs ${p.rollCounter}`);
  step(host, 40);
  check('...and done', !c.isRolling() && c.rollCounter === 0);
  p.mainGene = 'lazy';
  p.setOnBack(true);
  step(host, 10);
  check('...a lazy one on its back', c.isOnBack() && c.onBackAmount === 1);
  p.setOnBack(false);
  p.unhappyCounter = 30;
  step(host, 3);
  check('...one sulking (shaking its head): its count', c.unhappyCounter > 0);
  step(host, 40);
  assertMirrorEquals(host, g, 'with a panda about');
  p.remove();
  step(host, 3);
  check('...gone when it is', !copyOf(g, p));
}

// ---------------------------------------------------------------------------
// a cub, and its sneeze
{
  const cub = panda(-3.5, 3.5, ['weak', 'weak'], { baby: true });
  step(host, 4);
  const c = copyOf(g, cub);
  check('a cub: half the size for the guest too (0.65 by 0.625), weak', c?.isBaby() && Math.abs(c.width - 0.65) < 1e-6 && Math.abs(c.height - 0.625) < 1e-6 && c.variant() === 'weak');
  g.level.sounds.length = 0;
  g.level.particleCalls.length = 0;
  cub.sneeze(true);
  step(host, 5);
  check('...about to sneeze: its head going back (its count)', c.isSneezing() && c.sneezeCounter > 0);
  step(host, 25);
  const heard = g.level.sounds.map((s) => s.name);
  const cloud = g.level.particleCalls.filter((x) => x.method === 'spawn' && x.args[0] === 'sneeze').length;
  check('...its breath drawn and its sneeze heard, its cloud seen', heard.includes('entity.panda.pre_sneeze') && heard.includes('entity.panda.sneeze') && cloud === 1 && !c.isSneezing(), `${heard.join()} ${cloud}`);
  cub.remove();
  step(host, 3);
}

// ---------------------------------------------------------------------------
// a guest feeds a panda bamboo
{
  const a = panda(2.5, -2.5, ['normal', 'normal']);
  step(host, 4);
  standLooking(0.5, -2.5, a.x, a.y + 0.6, a.z);
  give(m.ItemStack.of('bamboo', 5));
  check('(the guest has the bamboo)', g.player.inventory.main[0]?.item.id === 'bamboo' && g.player.inventory.main[0].count === 5);
  click('use', a);
  check('a guest\'s bamboo on a grown panda: in love on the host, one piece used', a.isInLove() && hg.inventory.main[0]?.count === 4, `${a.inLove} ${hg.inventory.main[0]?.count}`);
  step(host, 3);
  check('...the guest\'s own count down too', g.player.inventory.main[0]?.count === 4);
  // one on its breeding cooldown sits down and eats it
  const b = panda(-1.5, -2.5, ['normal', 'normal']);
  b.setAge(6000);
  step(host, 4);
  standLooking(0.5, -4.5, b.x, b.y + 0.6, b.z);
  click('use', b);
  step(host, 10);
  const cb = copyOf(g, b);
  check('...one that can\'t fall in love sits down with the one piece and eats it: the guest sees it', b.isSitting() && b.isEating() && b.mainHand?.count === 1 && cb.isSitting() && cb.isEating() && cb.mainHand?.item.id === 'bamboo' && hg.inventory.main[0]?.count === 3);
  // (not a panda it can't reach)
  const far = panda(12.5, -2.5, ['normal', 'normal']);
  step(host, 4);
  click('use', far);
  check('...but not one past its reach', !far.isInLove() && hg.inventory.main[0]?.count === 3);
  for (const x of [a, b, far]) x.remove();
  step(host, 3);
  assertMirrorEquals(host, g, 'after the feeding');
}

// ---------------------------------------------------------------------------
// a guest plants bamboo, and cuts it down
{
  lvl.setBlock(6, 63, -6, m.S('grass_block'));
  step(host, 3);
  give(m.ItemStack.of('bamboo', 4));
  standLooking(6.5, -8.5, 6.5, 64, -5.5);
  click('use', null);
  const shoot = m.blockOf(lvl.getState(6, 64, -6)).name;
  check('a guest planting bamboo on grass: a shoot, the host placing it, one piece used', shoot === 'bamboo_sapling' && hg.inventory.main[0]?.count === 3, shoot);
  const [ox, oz] = m.horizontalOffset(m.getBlock('bamboo_sapling'), 6, -6);
  standLooking(6.5, -8.5, 6.5 + ox, 64.75, -5.5 + oz);
  click('use', null);
  check('...bamboo on the shoot: stalk (the shoot under it stalk too)', m.blockOf(lvl.getState(6, 65, -6)).name === 'bamboo' && m.blockOf(lvl.getState(6, 64, -6)).name === 'bamboo' && hg.inventory.main[0]?.count === 2);
  step(host, 3);
  check('...the guest sees them', g.world.getState(6, 64, -6) === lvl.getState(6, 64, -6) && g.world.getState(6, 65, -6) === lvl.getState(6, 65, -6));
  // a sword at a stroke: the stalk falls, the block over it after it
  give(m.ItemStack.of('iron_sword'));
  const [sx, sz] = m.horizontalOffset(m.getBlock('bamboo'), 6, -6);
  standLooking(6.5, -8.5, 6.5 + sx, 64.5, -5.5 + sz);
  g.session.input(true, true, false, false);
  step(host, 1);
  g.session.input(false, false, false, false);
  step(host, 6);
  check('a guest\'s sword cuts through bamboo at a stroke (and the stalk over it falls)', lvl.getState(6, 64, -6) === 0 && lvl.getState(6, 65, -6) === 0, m.blockOf(lvl.getState(6, 64, -6)).name);
  step(host, 3);
  assertMirrorEquals(host, g, 'after the bamboo');
}

await exitWithStatus(close);
