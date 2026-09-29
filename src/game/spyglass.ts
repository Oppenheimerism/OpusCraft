// (spyglass) What the spyglass does (vanilla SpyglassItem, Player.isScoping and PlayerPredicate.looking_at).
//
// Used, it goes to the eye at once (item.spyglass.use heard by all round about) and stays there while the button is
// held, for up to a minute (1200 ticks, then it's lowered by itself), its holder walking at a fifth of the pace as
// with any item in use. Lowered (let go, or its minute up) it's heard again (item.spyglass.stop_using). While it's up
// its holder is scoping: in first person the view narrows to a tenth (not scaled by the FOV effects option), the
// mouse turns an eighth as fast, the hands aren't drawn and the scope's round view covers the screen; the dark sign
// text's glow outline shows at any distance; others see the arm raised and the spyglass held to the eye (the HUD, the
// hands, the arm and the model are render/'s and gui/'s). Each tick it's up the "using_item" trigger fires with
// what the holder looks at (an entity up to 100 blocks along the look, if nothing stands between their eyes): a
// parrot, a ghast or the ender dragon earns an advancement. Its recipe is found by holding an amethyst shard.

import { registerItemBehavior } from './itemBehavior';
import { AABB } from '../core/aabb';
import { BOOK_BY_ID } from '../inventory/recipeBook';
import type { Level } from './level';
import type { Player } from '../entity/player';
import type { Entity } from '../entity/entity';

/** vanilla SpyglassItem.USE_DURATION */
export const SPYGLASS_USE_DURATION = 1200;
/** vanilla SpyglassItem.ZOOM_FOV_MODIFIER */
export const SCOPE_FOV_MODIFIER = 0.1;
/** vanilla PlayerPredicate.LOOKING_AT_RANGE */
const LOOK_RANGE = 100;

/** vanilla Player.isScoping: the spyglass is in use */
export function isScoping(p: Player): boolean {
  return p.isUsingItem() && p.useItem?.item.id === 'spyglass';
}

/**
 * vanilla AbstractClientPlayer.getFieldOfViewModifier while scoping in first person: 0.1, as it is (the FOV effects
 * option doesn't scale it); null when not
 */
export function scopedFov(p: Player, firstPerson: boolean): number | null {
  return firstPerson && isScoping(p) ? SCOPE_FOV_MODIFIER : null;
}

/** vanilla MouseHandler.turnPlayer: scoping in first person the mouse turns by d³ rather than d³ × 8 */
export function scopeTurnFactor(p: Player, firstPerson: boolean): number {
  return firstPerson && isScoping(p) ? 1 / 8 : 1;
}

/**
 * vanilla PlayerPredicate.looking_at's entity: the nearest whose box the look meets within 100 blocks (any but a
 * spectator; ProjectileUtil.getEntityHitResult, blocks not in the way of it), if the eyes can see it
 * (LivingEntity.hasLineOfSight); null if none
 */
export function lookedAt(p: Player): Entity | null {
  const pr = (p.pitch * Math.PI) / 180, yr = (p.yaw * Math.PI) / 180;
  const ex = p.x, ey = p.y + p.eyeHeight, ez = p.z;
  const x1 = ex - Math.sin(yr) * Math.cos(pr) * LOOK_RANGE, y1 = ey - Math.sin(pr) * LOOK_RANGE, z1 = ez + Math.cos(yr) * Math.cos(pr) * LOOK_RANGE;
  const box = new AABB(Math.min(ex, x1), Math.min(ey, y1), Math.min(ez, z1), Math.max(ex, x1), Math.max(ey, y1), Math.max(ez, z1)).inflate(1);
  let best: Entity | null = null, bestT = Infinity;
  const spectator = (e: Entity) => e.type === 'player' && (e as Player).gameMode === 'spectator';
  for (const e of p.level.getEntities(box, (e) => !spectator(e), p)) {
    // (vanilla AABB.clip: nothing from inside a box)
    if (e.bb.contains(ex, ey, ez)) continue;
    const h = e.bb.clip(ex, ey, ez, x1, y1, z1);
    if (h && h.t < bestT) {
      best = e;
      bestT = h.t;
    }
  }
  return best && p.hasLineOfSight(best) ? best : null;
}

/** vanilla SpyglassItem.stopUsing: lowered, heard round about */
function stopUsing(level: Level, p: Player): void {
  level.sound.play('item.spyglass.stop_using', p.x, p.y, p.z, 1, 1);
}

registerItemBehavior('spyglass', {
  // vanilla SpyglassItem.use: heard, and up to the eye at once (ItemUtils.startUsingInstantly: the hand doesn't swing)
  use(level, p, stack) {
    if (p.gameMode === 'spectator') return 'pass';
    level.sound.play('item.spyglass.use', p.x, p.y, p.z, 1, 1);
    p.startUsingItem(stack, SPYGLASS_USE_DURATION);
    return 'success';
  },
  useTick(level, p, stack, remaining) {
    // vanilla ServerPlayer.updateUsingItem: USING_ITEM, with what the holder looks at (PlayerPredicate.looking_at)
    if (level.onPlayerTrigger) level.onPlayerTrigger(p, 'using_item', { usingItem: { item: stack.item.id, lookingAt: lookedAt(p)?.type ?? null } });
    // vanilla SpyglassItem.finishUsingItem: its minute up (the use completes this tick), lowered
    if (remaining === 1) stopUsing(level, p);
  },
  // vanilla SpyglassItem.releaseUsing
  releaseUsing: (level, p) => stopUsing(level, p),
});

// vanilla recipes/tools/spyglass: unlocked by an amethyst shard (not the copper)
const book = BOOK_BY_ID.get('spyglass');
if (book) book.unlockBy = new Set(['amethyst_shard']);
