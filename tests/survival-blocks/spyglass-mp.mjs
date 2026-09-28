// Multiplayer checks for the spyglass (node tests/survival-blocks/spyglass-mp.mjs): a guest's use button acts on the
// host, which raises the spyglass (its sound heard by everyone near) and tells the guest, whose own view then zooms
// (the FOV to 0.1, the mouse slowed); held, it stays up; let go, or its minute up, it's lowered (heard again) on both
// sides; a slot change drops it silently. Others see the guest's arm raised and the spyglass at its eye, as does a
// guest who joins while it's up; the host's own spyglass is seen by the guests the same way.
import { loadNet, ENTITY_MODULES, flatHost, makeGuest, hostCopy, step, check, exitWithStatus } from '../multiplayer/lib.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 300000).unref();

const { m, close } = await loadNet([...ENTITY_MODULES, '/src/game/spyglass.ts', '/src/game/itemBehavior.ts', '/src/render/playerPose.ts', '/src/render/model.ts', '/src/render/entityRenderer.ts']);

const host = flatHost(m, 5, { guestGameMode: 'survival', gameMode: 'survival' });
const lvl = host.level;
const a = makeGuest(host, 'Alex', { viewDistance: 4 });
const b = makeGuest(host, 'Steve', { viewDistance: 4 });
step(host, 30);
const ha = hostCopy(host, a);
/** `g`'s copy of the player `p` (another guest, or the host) */
const mirrorOf = (g, p) => g.session.mirrors.get(p.id) ?? null;
const heard = (g, n) => g.level.sounds.filter((s) => s.name === n).length;
const hostHeard = (n) => lvl.sounds.filter((s) => s.name === n).length;
/** the guest holding `stack` in its first hotbar slot, as the host gives it */
function hold(g, stack) {
  const inv = hostCopy(host, g).inventory;
  inv.main[0] = stack;
  inv.selected = 0;
  g.player.inventory.selected = 0;
  inv.version++;
  step(host, 3);
}
// (the guests a few blocks apart, looking along +x at nothing)
a.player.moveTo(0.5, 65, 0.5, -90, 0);
b.player.moveTo(0.5, 65, 4.5, -90, 0);
step(host, 5);
hold(a, m.ItemStack.of('spyglass'));

// ---------------------------------------------------------------------------
// raised, held, lowered
{
  const u0 = hostHeard('item.spyglass.use'), ua = heard(a, 'item.spyglass.use'), ub = heard(b, 'item.spyglass.use');
  a.session.input(false, false, true, true, null);
  step(host, 3);
  check('use: the spyglass up on the host', ha.isUsingItem() && ha.useItem?.item.id === 'spyglass' && m.isScoping(ha) && ha.useDuration === 1200);
  check('use: the guest told: it scopes (its view zooms to 0.1, the mouse slowed)', m.isScoping(a.player) && m.scopedFov(a.player, true) === 0.1 && m.scopeTurnFactor(a.player, true) === 1 / 8);
  check('use: heard on the host, by the guest and by the other guest', hostHeard('item.spyglass.use') === u0 + 1 && heard(a, 'item.spyglass.use') === ua + 1 && heard(b, 'item.spyglass.use') === ub + 1);
  const mirror = mirrorOf(b, ha);
  check('seen: the other guest sees the arm raised to the eye', !!mirror && m.playerArms(mirror, 'right').right === 'spyglass');
  check('seen: the host too', m.playerArms(ha, 'right').right === 'spyglass');
  // (and drawn with the spyglass at its eye: vanilla PlayerItemInHandLayer)
  const drawn = [];
  m.drawPlayerHeldItems({ begin() {}, quad() {}, flush() {} }, { render: (_b, _p, st, ctx) => drawn.push(`${st.item.id}@${ctx}`) }, new m.PoseStack(), m.playerModel(), mirror, 'right');
  check('seen: the other guest draws the spyglass at its eye', drawn.join() === 'spyglass@head', drawn.join());
  step(host, 40);
  check('held: still up 40 ticks on, on both sides, the countdowns together', m.isScoping(ha) && m.isScoping(a.player) && Math.abs(ha.useItemRemaining - a.player.useItemRemaining) <= 2, `${ha.useItemRemaining} ${a.player.useItemRemaining}`);
  const s0 = hostHeard('item.spyglass.stop_using'), sb = heard(b, 'item.spyglass.stop_using');
  a.session.input(false, false, false, false, null);
  step(host, 3);
  check('let go: lowered on the host and in the guest\'s view', !ha.isUsingItem() && !m.isScoping(a.player) && m.scopedFov(a.player, true) === null);
  check('let go: item.spyglass.stop_using heard, by the other guest too', hostHeard('item.spyglass.stop_using') === s0 + 1 && heard(b, 'item.spyglass.stop_using') === sb + 1);
  check('let go: the other guest sees the arm down', m.playerArms(mirrorOf(b, ha), 'right').right === 'item');
  check('let go: the spyglass still in the guest\'s hand', ha.inventory.main[0]?.item.id === 'spyglass' && a.player.inventory.main[0]?.item.id === 'spyglass');
}

// ---------------------------------------------------------------------------
// a slot change; a late joiner; the minute
{
  a.session.input(false, false, true, true, null);
  step(host, 3);
  const s0 = hostHeard('item.spyglass.stop_using');
  a.player.inventory.selected = 1;
  step(host, 3);
  check('slot change: dropped from the eye on both sides, silently', !ha.isUsingItem() && !m.isScoping(a.player) && hostHeard('item.spyglass.stop_using') === s0);
  check('slot change: the host has the guest on the other slot', hostCopy(host, a).inventory.selected === 1);
  a.session.input(false, false, false, false, null);
  a.player.inventory.selected = 0;
  step(host, 3);
  a.session.input(false, false, true, true, null);
  step(host, 3);
  const c = makeGuest(host, 'Kai', { viewDistance: 4 });
  step(host, 30);
  const late = mirrorOf(c, ha);
  check('late joiner: sees the guest with its spyglass up', m.isScoping(ha) && !!late && late.useItem?.item.id === 'spyglass' && m.playerArms(late, 'right').right === 'spyglass');
  const u1 = hostHeard('item.spyglass.use'), s1 = hostHeard('item.spyglass.stop_using');
  step(host, 1200);
  check('a minute: lowered by itself (heard), and up again at once with the button still down', hostHeard('item.spyglass.stop_using') === s1 + 1 && hostHeard('item.spyglass.use') === u1 + 1 && m.isScoping(ha) && m.isScoping(a.player));
  a.session.input(false, false, false, false, null);
  step(host, 3);
  check('a minute: let go, lowered', !ha.isUsingItem() && !m.isScoping(a.player));
}

// ---------------------------------------------------------------------------
// the host's own
{
  const hp = host.player;
  hp.inventory.main[hp.inventory.selected] = m.ItemStack.of('spyglass');
  hp.moveTo(0.5, 65, 8.5, -90, 0);
  const ua = heard(a, 'item.spyglass.use');
  const r = m.itemBehaviorOf('spyglass').use(lvl, hp, hp.inventory.selectedItem);
  step(host, 3);
  const seen = mirrorOf(a, hp);
  check('host: its spyglass up, heard and seen by the guests', r === 'success' && m.isScoping(hp) && heard(a, 'item.spyglass.use') === ua + 1 && !!seen && m.playerArms(seen, 'right').right === 'spyglass');
  hp.stopUsingItem();
  step(host, 3);
  check('host: lowered, the guests see it down', m.playerArms(mirrorOf(a, hp), 'right').right === 'item');
}

await exitWithStatus(close);
