// What the wither rose does (vanilla WitherRoseBlock and LivingEntity.createWitherRose): it grows where any flower
// grows (#dirt and farmland) and on netherrack, soul sand and soul soil; it gives off wisps of smoke; and anything
// alive that walks into it is withered for two seconds (not in peaceful; the wither and wither skeletons can't be).
// It's where the wither leaves its mark: whatever it kills (the wither getting the credit for the death, as vanilla's
// getKillCredit) leaves a wither rose where it fell, set in the ground if mobs may grief and a rose can grow there,
// else dropped as an item. Its pot, its black dye and its suspicious stew (wither for 7 s) are game/villageBlocks.ts's,
// inventory/recipesWither.ts's and game/suspiciousStew.ts's.

import type { Level } from './level';
import type { World } from '../world/world';
import { BLOCKS, STATE_BLOCK, FLAGS, F_AIR, getBlock } from '../world/block';
import { registerBehavior } from './blockBehavior';
import { canSurvive } from './blockRules';
import { horizontalOffset } from '../world/blockOffset';
import { LivingEntity, DEATH_HOOKS } from '../entity/living';
import { ItemEntity } from '../entity/itemEntity';
import { MobEffectInstance, MOB_EFFECTS } from '../entity/effects';
import { WitherBoss } from '../entity/wither';
import { ItemStack } from '../item/item';

const ROSE = getBlock('wither_rose');

/** vanilla WitherRoseBlock.mayPlaceOn: what a flower grows in (#dirt, farmland), and netherrack, soul sand and soul soil */
const ROSE_SOIL = new Set([
  'dirt', 'grass_block', 'podzol', 'coarse_dirt', 'mycelium', 'rooted_dirt', 'moss_block', 'mud', 'muddy_mangrove_roots', 'farmland',
  'netherrack', 'soul_sand', 'soul_soil',
]);

registerBehavior('wither_rose', {
  /** vanilla BushBlock.canSurvive with WitherRoseBlock.mayPlaceOn */
  canSurvive(world: World, x: number, y: number, z: number): boolean {
    return ROSE_SOIL.has(BLOCKS[STATE_BLOCK[world.getState(x, y - 1, z)]].name);
  },
  /**
   * vanilla entityInside: something alive walking into it, not in peaceful, is withered for 2 s (what can't be withered
   * isn't: the wither, wither skeletons). (A creative player too, though it takes no harm, as vanilla's
   * isInvulnerableTo reads only an entity's own Invulnerable flag; never a spectator, which passes through blocks)
   */
  entityInside(level, _x, _y, _z, _st, e) {
    if (level.isClientSide || level.difficulty === 'peaceful' || !(e instanceof LivingEntity)) return;
    if (e.type === 'player' ? (e as { gameMode?: string }).gameMode === 'spectator' : e.isInvulnerableTo('wither')) return;
    e.addEffect(new MobEffectInstance(MOB_EFFECTS.wither, 40));
  },
  /** vanilla animateTick: three tries at a wisp of smoke, from its middle (set off as the flower is) up to a fifth of a block on */
  animateTick(level, x, y, z) {
    const [ox, oz] = horizontalOffset(ROSE, x, z);
    const cx = x + 0.5 + ox, cz = z + 0.5 + oz;
    for (let i = 0; i < 3; i++) {
      if (Math.random() < 0.5) level.particles.spawn?.('smoke', cx + Math.random() / 5, y + (0.5 - Math.random()), cz + Math.random() / 5, 0, 0, 0);
    }
  },
});

/**
 * vanilla LivingEntity.createWitherRose (from Mob's and Player's deaths): if the wither has the credit for `victim`'s
 * death, a wither rose where it fell: in the ground at its feet when mobs may grief, that block is air and a rose can
 * grow there; else an item there
 */
export function createWitherRose(victim: LivingEntity): void {
  const level: Level = victim.level;
  if (level.isClientSide) return;
  // (vanilla getKillCredit: the player who hit it lately, else the mob)
  const credit = victim.lastHurtByPlayer ?? victim.lastHurtByMob;
  if (!(credit instanceof WitherBoss)) return;
  const x = Math.floor(victim.x), y = Math.floor(victim.y), z = Math.floor(victim.z);
  if (level.gameRules.mobGriefing && FLAGS[level.getState(x, y, z)] & F_AIR && canSurvive(level.world, x, y, z, ROSE.defaultState)) {
    level.setBlock(x, y, z, ROSE.defaultState);
    return;
  }
  const it = new ItemEntity(level, ItemStack.of('wither_rose'));
  it.moveTo(victim.x, victim.y, victim.z, 0, 0);
  it.dx = level.random.nextDouble() * 0.2 - 0.1;
  it.dy = 0.2;
  it.dz = level.random.nextDouble() * 0.2 - 0.1;
  level.addEntity(it);
}

DEATH_HOOKS.witherRose = createWitherRose;
