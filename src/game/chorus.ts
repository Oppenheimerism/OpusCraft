// The outer End's plants and rods: the chorus plant (vanilla ChorusPlantBlock) and its flower (ChorusFlowerBlock),
// the fruit that teleports whoever eats it (ChorusFruitItem), and end rods (EndRodBlock).
//
// A chorus plant only stands on end stone or more of itself: each piece joins the plant, flowers and end stone
// round it, and one that loses its footing breaks a tick later, taking whatever it held up with it a tick at a
// time. A young flower grows up, or branches out to the sides, and dies at the end of its growth.

import { STATE_BLOCK, FLAGS, F_AIR, getBlock } from '../world/block';
import { DIR_NAMES, DX, DY, DZ, OPPOSITE } from '../world/dir';
import type { World } from '../world/world';
import type { Level } from './level';
import { ItemStack } from '../item/item';
import { registerBehavior } from './blockBehavior';
import { registerItemBehavior } from './itemBehavior';
import { canSurvive } from './blockRules';
import { chorusIds, plantWithConnections, CHORUS_HORIZONTAL } from '../world/gen/chorusPlant';
import { randomTeleport, teleportParticles } from '../entity/teleport';
import type { Entity } from '../entity/entity';

/** vanilla Block.UPDATE_CLIENTS: the flower's growth doesn't tell its neighbours (their shapes still follow) */
const UPDATE_CLIENTS = 2;

const isAir = (st: number) => (FLAGS[st] & F_AIR) !== 0;

/**
 * vanilla ChorusPlantBlock.canSurvive: on end stone or more plant, or held from the side by a piece of plant that
 * is on something — though not when it's also got something above and below it
 */
export function plantSurvives(w: World, x: number, y: number, z: number): boolean {
  const { plant, endStone } = chorusIds();
  const below = w.getState(x, y - 1, z);
  const boxedIn = !isAir(w.getState(x, y + 1, z)) && !isAir(below);
  for (const [dx, dz] of CHORUS_HORIZONTAL) {
    if (STATE_BLOCK[w.getState(x + dx, y, z + dz)] !== plant) continue;
    if (boxedIn) return false;
    const under = STATE_BLOCK[w.getState(x + dx, y - 1, z + dz)];
    if (under === plant || under === endStone) return true;
  }
  return STATE_BLOCK[below] === plant || STATE_BLOCK[below] === endStone;
}

/**
 * vanilla ChorusFlowerBlock.canSurvive: on end stone or the plant, or out in the air with the plant beside it on
 * exactly one side and nothing on the others
 */
export function flowerSurvives(w: World, x: number, y: number, z: number): boolean {
  const { plant, endStone } = chorusIds();
  const below = w.getState(x, y - 1, z);
  if (STATE_BLOCK[below] === plant || STATE_BLOCK[below] === endStone) return true;
  if (!isAir(below)) return false;
  let beside = false;
  for (const [dx, dz] of CHORUS_HORIZONTAL) {
    const n = w.getState(x + dx, y, z + dz);
    if (STATE_BLOCK[n] === plant) {
      if (beside) return false;
      beside = true;
    } else if (!isAir(n)) return false;
  }
  return beside;
}

/** vanilla ChorusFlowerBlock.allNeighborsEmpty: nothing on any side of (x, y, z) but the one `except` points to */
function neighboursEmpty(w: World, x: number, y: number, z: number, except: number): boolean {
  return CHORUS_HORIZONTAL.every(([dx, dz], i) => i === except || isAir(w.getState(x + dx, y, z + dz)));
}

/** vanilla ChorusFlowerBlock.placeGrownFlower: level event 1033 (block.chorus_flower.grow) */
function placeGrownFlower(level: Level, x: number, y: number, z: number, age: number): void {
  level.setBlock(x, y, z, getBlock('chorus_flower').state({ age }), UPDATE_CLIENTS);
  level.sound.play('block.chorus_flower.grow', x + 0.5, y + 0.5, z + 0.5, 1, 1);
}

/** vanilla ChorusFlowerBlock.placeDeadFlower: age 5, level event 1034 (block.chorus_flower.death) */
function placeDeadFlower(level: Level, x: number, y: number, z: number): void {
  level.setBlock(x, y, z, getBlock('chorus_flower').state({ age: 5 }), UPDATE_CLIENTS);
  level.sound.play('block.chorus_flower.death', x + 0.5, y + 0.5, z + 0.5, 1, 1);
}

/** the plant's piece at (x, y, z), joined to what's round it now */
function plantHere(level: Level, x: number, y: number, z: number): number {
  return plantWithConnections((bx, by, bz) => level.getState(bx, by, bz), x, y, z);
}

/**
 * vanilla ChorusFlowerBlock.randomTick: with room above, a young flower grows up a block (sooner on a short stem,
 * sooner still right on end stone), leaving the plant behind it; failing that it may branch out to up to three
 * sides (four from a stem on end stone) a stage older; one that can do neither, or is at its last stage, dies
 */
function flowerRandomTick(level: Level, x: number, y: number, z: number, st: number): void {
  const w = level.world, r = level.random;
  const { plant, endStone } = chorusIds();
  if (!isAir(w.getState(x, y + 1, z)) || y + 1 >= w.dim.maxY) return;
  const age = getBlock('chorus_flower').get<number>(st, 'age');
  if (age >= 5) return;
  let grow = false, rooted = false;
  const below = STATE_BLOCK[w.getState(x, y - 1, z)];
  if (below === endStone) grow = true;
  else if (below === plant) {
    let j = 1;
    for (let k = 0; k < 4; k++) {
      const s = STATE_BLOCK[w.getState(x, y - (j + 1), z)];
      if (s !== plant) {
        if (s === endStone) rooted = true;
        break;
      }
      j++;
    }
    if (j < 2 || j <= r.nextInt(rooted ? 5 : 4)) grow = true;
  } else if (isAir(w.getState(x, y - 1, z))) grow = true;

  if (grow && neighboursEmpty(w, x, y + 1, z, -1) && isAir(w.getState(x, y + 2, z))) {
    level.setBlock(x, y, z, plantHere(level, x, y, z), UPDATE_CLIENTS);
    placeGrownFlower(level, x, y + 1, z, age);
  } else if (age < 4) {
    let tries = r.nextInt(4);
    if (rooted) tries++;
    let branched = false;
    for (let i = 0; i < tries; i++) {
      const d = r.nextInt(4);
      const [dx, dz] = CHORUS_HORIZONTAL[d];
      const bx = x + dx, bz = z + dz;
      if (isAir(w.getState(bx, y, bz)) && isAir(w.getState(bx, y - 1, bz)) && neighboursEmpty(w, bx, y, bz, (d + 2) & 3)) {
        placeGrownFlower(level, bx, y, bz, age + 1);
        branched = true;
      }
    }
    if (branched) level.setBlock(x, y, z, plantHere(level, x, y, z), UPDATE_CLIENTS);
    else placeDeadFlower(level, x, y, z);
  } else placeDeadFlower(level, x, y, z);
}

/** vanilla ChorusPlantBlock / ChorusFlowerBlock.tick: scheduled a tick after losing its footing, it breaks (and drops) */
function breakIfUnsupported(level: Level, x: number, y: number, z: number, st: number): void {
  if (!canSurvive(level.world, x, y, z, st)) level.destroyBlock(x, y, z, true);
}

registerBehavior('chorus_plant', {
  placement: (ctx) => plantWithConnections((x, y, z) => ctx.world.getState(x, y, z), ctx.x, ctx.y, ctx.z),
  canSurvive: (w, x, y, z) => plantSurvives(w, x, y, z),
  // vanilla updateShape: a connection follows the neighbour it's toward; one that can't stay keeps its shape and
  // breaks in a tick (breakDelay)
  updateShape: (w, x, y, z, st) => (plantSurvives(w, x, y, z) ? plantWithConnections((bx, by, bz) => w.getState(bx, by, bz), x, y, z) : st),
  breakDelay: 1,
  tick: breakIfUnsupported,
  // vanilla loot table blocks/chorus_plant: 0 or 1 chorus fruit
  drops: (_st, _tool, r) => {
    const n = r.nextInt(2);
    return n ? [ItemStack.of('chorus_fruit', n)] : [];
  },
});

registerBehavior('chorus_flower', {
  canSurvive: (w, x, y, z) => flowerSurvives(w, x, y, z),
  breakDelay: 1,
  tick: breakIfUnsupported,
  randomTick: flowerRandomTick,
  // vanilla ChorusFlowerBlock.onProjectileHit: a projectile breaks it off (dropping it)
  projectileHit(level, x, y, z, _st, _hit, projectile) {
    level.destroyBlock(x, y, z, true, null, true, null, projectile);
  },
});

// vanilla EndRodBlock
registerBehavior('end_rod', {
  // getStateForPlacement: out from the face it's put on — unless that's the end of another rod pointing this way,
  // when it points back at it
  placement(ctx) {
    const rod = getBlock('end_rod');
    const face = ctx.face;
    const against = ctx.world.getState(ctx.x - DX[face], ctx.y - DY[face], ctx.z - DZ[face]);
    const back = STATE_BLOCK[against] === rod.id && rod.get(against, 'facing') === DIR_NAMES[face];
    return rod.state({ facing: DIR_NAMES[back ? OPPOSITE[face] : face] });
  },
  // animateTick: now and then (one tick in five) a mote drifts off it, somewhere along the rod
  animateTick(level, x, y, z, st) {
    const d = DIR_NAMES.indexOf(getBlock('end_rod').get<string>(st, 'facing') as (typeof DIR_NAMES)[number]);
    const r = Math.random;
    const d0 = x + 0.55 - Math.fround(r() * 0.1), d1 = y + 0.55 - Math.fround(r() * 0.1), d2 = z + 0.55 - Math.fround(r() * 0.1);
    const d3 = 0.4 - (r() + r()) * 0.4;
    if (Math.floor(r() * 5) === 0) level.particles.spawn?.('end_rod', d0 + DX[d] * d3, d1 + DY[d] * d3, d2 + DZ[d] * d3, gauss() * 0.005, gauss() * 0.005, gauss() * 0.005);
  },
});

function gauss(): number {
  return Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());
}

// vanilla ChorusFruitItem: always edible (4 hunger, 0.3 saturation); once eaten it tries up to 16 times to put its
// eater somewhere within 8 blocks across and 8 up or down (within the dimension's logical height), and the fruit
// can't be eaten again for a second
registerItemBehavior('chorus_fruit', {
  use(_level, p, stack) {
    // (vanilla ServerPlayerGameMode.useItem: an item cooling down can't be used)
    if (p.cooldowns.get('chorus_fruit')) return 'pass';
    p.startUsingItem(stack, 32);
    return 'success';
  },
  finishUsing(level, p) {
    // vanilla Item.finishUsingItem → LivingEntity.eat: the food, the burp, one eaten
    p.food.eat(4, 0.3);
    level.sound.play('entity.player.burp', p.x, p.y, p.z, 0.5, Math.random() * 0.1 + 0.9);
    if (p.gameMode !== 'creative') p.inventory.consumeSelected(1);
    chorusTeleport(level, p);
    p.cooldowns.set('chorus_fruit', 20);
  },
});

/** vanilla ChorusFruitItem.finishUsingItem's teleport, for anyone that eats one */
export function chorusTeleport(level: Level, e: Entity): boolean {
  const dim = level.world.dim;
  for (let i = 0; i < 16; i++) {
    const x = e.x + (Math.random() - 0.5) * 16;
    const y = Math.min(Math.max(e.y + (Math.floor(Math.random() * 16) - 8), dim.minY), dim.minY + dim.logicalHeight - 1);
    const z = e.z + (Math.random() - 0.5) * 16;
    if (e.vehicle) e.stopRiding();
    const ox = e.x, oy = e.y, oz = e.z;
    if (!randomTeleport(e, x, y, z, false)) continue;
    level.gameEvent('teleport', ox, oy, oz, { entity: e });
    // (the eater has been put there: it sees its own particles round it, others the trail)
    e.xo = e.x;
    e.yo = e.y;
    e.zo = e.z;
    teleportParticles(e, e.x, e.y, e.z);
    level.sound.play('item.chorus_fruit.teleport', e.x, e.y, e.z, 1, 1);
    e.fallDistance = 0;
    return true;
  }
  return false;
}
