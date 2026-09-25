// The villagers' part in a raid (vanilla SetRaidStatus, ResetRaidStatus, RingBell, MoveToSkySeeingSpot,
// CelebrateVillagersSurvivedRaid, VillagerGoalPackages.getPreRaidPackage / getRaidPackage, GiveGiftToHero and the
// gameplay/hero_of_the_village/*_gift loot tables), plugged into the villager's brain through entity/villager.ts's
// villagerRaidHooks.
//
// While the bar fills before the first wave (and between waves) the villagers rush to the meeting point, ringing
// the bell when they get there; while a wave is on they run for the beds and stay hidden; once it's won they come
// out under the open sky and cheer (vanilla's fireworks aren't here yet). A Hero of the Village gets a gift now and
// then from any villager who sees them — something of its trade, a poppy from a child, seeds from one with none.

import type { Level } from './level';
import type { Player } from '../entity/player';
import type { Raid } from './raids';
import { villagerRaidHooks, villagerBehaviors as V, type Villager, type VillagerActivity } from '../entity/villager';
import { Behavior, oneShot, triggerOneShuffled, type BehaviorControl } from '../entity/ai/brain';
import { bellRinger } from './villageBlocks';
import { LOOT_TABLES, rollLoot } from './loot';
import { ITEMS, ItemStack } from '../item/item';
import { potionStack } from '../item/potions';
import { BLOCKS, STATE_BLOCK } from '../world/block';

type Pkg = [number, BehaviorControl<Villager>][];
type Pos = [number, number, number];

/** vanilla VillagerGoalPackages' speed (0.5) */
const SPEED = 0.5;

/** vanilla ServerLevel.getRaidAt(villager.blockPosition()) */
function raidAt(v: Villager): Raid | null {
  const [x, y, z] = V.blockPos(v);
  return (v.level as Level).raids.raidAt(x, y, z);
}

/** a behaviour tried as a trigger (vanilla composes one-shots so): true if it went */
const asTrigger = (b: BehaviorControl<Villager>) => (v: Villager, now: number): boolean => {
  if (!b.tryStart(v, now)) return false;
  b.doStop(v, now);
  return true;
};

/** vanilla BehaviorBuilder.sequence(triggerIf(pred), next) */
const when = (pred: (v: Villager) => boolean, next: BehaviorControl<Villager>): BehaviorControl<Villager> => {
  const t = asTrigger(next);
  return oneShot<Villager>((v, now) => pred(v) && t(v, now));
};

/** vanilla SetRaidStatus (core): now and then, with a raid on here, its default is PRE_RAID before a wave comes and RAID while one's on */
function setRaidStatus(): BehaviorControl<Villager> {
  return oneShot<Villager>((v) => {
    if (v.level.random.nextInt(20) !== 0) return false;
    const raid = raidAt(v);
    if (raid) {
      const a: VillagerActivity = raid.hasFirstWaveSpawned() && !raid.isBetweenWaves() ? 'raid' : 'pre_raid';
      v.brain.setDefaultActivity(a);
      v.brain.setActiveActivityIfPossible(a, v);
    }
    return true;
  });
}

/** vanilla ResetRaidStatus: the raid over (stopped or lost) or gone, back to its day */
function resetRaidStatus(): BehaviorControl<Villager> {
  return oneShot<Villager>((v, now) => {
    if (v.level.random.nextInt(20) !== 0) return false;
    const raid = raidAt(v);
    if (!raid || raid.isStopped() || raid.isLoss()) {
      v.brain.setDefaultActivity('idle');
      v.updateActivityFromSchedule(now);
    }
    return true;
  });
}

/** vanilla RingBell: at the meeting point (within 3), now and then it rings the bell */
function ringBell(): BehaviorControl<Villager> {
  return oneShot<Villager>((v) => {
    const mp = v.mem.meetingPoint;
    if (!mp || v.level.random.nextFloat() <= 0.95) return false;
    const [x, y, z] = V.blockPos(v);
    if ((mp[0] - x) ** 2 + (mp[1] - y) ** 2 + (mp[2] - z) ** 2 < 9 && BLOCKS[STATE_BLOCK[v.level.world.getState(mp[0], mp[1], mp[2])]].name === 'bell') bellRinger.ring(v.level, mp[0], mp[1], mp[2], null, v);
    return true;
  });
}

/** vanilla MoveToSkySeeingSpot.hasNoBlocksAbove: the sky right above, and nothing over its head */
function hasNoBlocksAbove(v: Villager, p: Pos): boolean {
  return v.level.canSeeSky(p[0], p[1], p[2]) && v.level.motionBlockingHeight(p[0], p[2]) <= v.y;
}

/** vanilla MoveToSkySeeingSpot: indoors, somewhere within 10 under the open sky */
function moveToSkySeeingSpot(speed: number): (v: Villager) => boolean {
  return (v) => {
    if (v.mem.walkTarget) return false;
    const [x, y, z] = V.blockPos(v);
    if (v.level.canSeeSky(x, y, z)) return false;
    const r = v.random;
    for (let i = 0; i < 10; i++) {
      const p: Pos = [x + r.nextInt(20) - 10, y + r.nextInt(6) - 3, z + r.nextInt(20) - 10];
      if (!hasNoBlocksAbove(v, p)) continue;
      v.mem.walkTarget = V.walkTo(p, speed, 0);
      break;
    }
    return true;
  };
}

/** vanilla CelebrateVillagersSurvivedRaid(600, 600): the raid won, out under the sky it cheers (and, in vanilla, lets off fireworks) */
function celebrateVillagersSurvivedRaid(): BehaviorControl<Villager> {
  let raid: Raid | null = null;
  return new Behavior<Villager>({
    min: 600,
    max: 600,
    canStart: (v) => {
      raid = raidAt(v);
      return !!raid && raid.isVictory() && hasNoBlocksAbove(v, V.blockPos(v));
    },
    canStillUse: () => !!raid && !raid.isStopped(),
    tick: (v) => {
      if (v.random.nextInt(100) === 0) v.playSound('entity.villager.celebrate', v.soundVolume(), v.voicePitch());
    },
    stop: (v, now) => {
      raid = null;
      v.updateActivityFromSchedule(now);
    },
  });
}

// vanilla gameplay/hero_of_the_village/*_gift (one roll each; the fletcher's is below)
const one = (...items: string[]) => [{ rolls: 1, entries: items.map((item) => ({ item, weight: 1 })) }];
const GIFTS: Partial<Record<string, string>> = {};
for (const [prof, items] of Object.entries({
  armorer: ['chainmail_helmet', 'chainmail_chestplate', 'chainmail_leggings', 'chainmail_boots'],
  butcher: ['cooked_rabbit', 'cooked_chicken', 'cooked_porkchop', 'cooked_beef', 'cooked_mutton'],
  cartographer: ['map', 'paper'],
  cleric: ['redstone', 'lapis_lazuli'],
  farmer: ['bread', 'pumpkin_pie', 'cookie'],
  fisherman: ['cod', 'salmon'],
  leatherworker: ['leather'],
  librarian: ['book'],
  mason: ['clay'],
  shepherd: ['white', 'orange', 'magenta', 'light_blue', 'yellow', 'lime', 'pink', 'gray', 'light_gray', 'cyan', 'purple', 'blue', 'brown', 'green', 'red', 'black'].map((c) => c + '_wool'),
  toolsmith: ['stone_pickaxe', 'stone_axe', 'stone_hoe', 'stone_shovel'],
  weaponsmith: ['stone_axe', 'golden_axe', 'iron_axe'],
})) {
  const table = `gameplay/hero_of_the_village/${prof}_gift`;
  LOOT_TABLES[table] = one(...items);
  GIFTS[prof] = table;
}
/** the fletcher's: an arrow 26 times in 39, else a tipped arrow of one of these (half the time none: set_count 0-1) */
const FLETCHER_POTIONS = ['swiftness', 'slowness', 'strength', 'healing', 'harming', 'leaping', 'regeneration', 'fire_resistance', 'water_breathing', 'invisibility', 'night_vision', 'weakness', 'poison'];

/** vanilla GiveGiftToHero.getItemToThrow */
function giftFor(v: Villager): ItemStack[] {
  if (v.isBaby()) return [ItemStack.of('poppy')];
  if (v.profession === 'fletcher') {
    const k = v.random.nextInt(26 + FLETCHER_POTIONS.length);
    if (k < 26) return [ItemStack.of('arrow')];
    const tipped = ITEMS.get('tipped_arrow');
    return tipped && v.random.nextInt(2) === 1 ? [potionStack(tipped, FLETCHER_POTIONS[k - 26])] : [];
  }
  const table = GIFTS[v.profession];
  if (table) return rollLoot(table, v.random);
  return [ItemStack.of('wheat_seeds')];
}

/**
 * vanilla GiveGiftToHero(100): a villager that can see a Hero of the Village goes up to them (within 5) and, a second
 * after it's turned to them, throws them a gift; the next one no sooner than 30 seconds to five and a half minutes
 * later (and only after it has seen a hero for 600 tries at first)
 */
function giveGiftToHero(): BehaviorControl<Villager> {
  let timeUntilNextGift = 600, given = false, startedAt = 0;
  const hero = (v: Villager): Player | null => {
    const p = v.mem.visibleLiving.find((e) => e.type === 'player') as Player | undefined;
    return p && p.hasEffect('hero_of_the_village') ? p : null;
  };
  return new Behavior<Villager>({
    min: 100,
    max: 100,
    canStart: (v) => {
      if (!hero(v)) return false;
      if (timeUntilNextGift > 0) {
        timeUntilNextGift--;
        return false;
      }
      return true;
    },
    start: (v, now) => {
      given = false;
      startedAt = now;
      const p = hero(v)!;
      v.mem.interactionTarget = p;
      v.mem.lookTarget = { e: p, eyes: true };
    },
    canStillUse: (v) => !!hero(v) && !given,
    tick: (v, now) => {
      const p = hero(v)!;
      v.mem.lookTarget = { e: p, eyes: true };
      const [x, y, z] = V.blockPos(v), [px, py, pz] = V.blockPos(p);
      if ((x - px) ** 2 + (y - py) ** 2 + (z - pz) ** 2 < 25) {
        if (now - startedAt > 20) {
          for (const s of giftFor(v)) V.throwItem(v, s, p.x, p.y, p.z);
          given = true;
        }
      } else v.mem.walkTarget = V.walkAfter(p, 0.5, 5);
    },
    stop: (v) => {
      timeUntilNextGift = 600 + v.level.random.nextInt(6001);
      v.mem.interactionTarget = null;
      v.mem.walkTarget = null;
      v.mem.lookTarget = null;
    },
  });
}

/** vanilla raidExistsAndNotVictory (which, despite its name, is true once the raid is won) */
const raidWon = (v: Villager): boolean => !!raidAt(v)?.isVictory();
/** vanilla raidExistsAndActive: a raid on here that's neither won nor lost */
const raidOn = (v: Villager): boolean => {
  const r = raidAt(v);
  return !!r && r.isActive() && !r.isVictory() && !r.isLoss();
};

/** vanilla VillagerGoalPackages.getPreRaidPackage: to the meeting point (or about the village) at a run, the bell rung there */
function preRaidPackage(): Pkg {
  return [
    [0, ringBell()],
    [0, triggerOneShuffled<Villager>([[asTrigger(V.setWalkTargetFromBlockMemory('meetingPoint', SPEED * 1.5, 2, 150, 200)), 6], [asTrigger(V.villageBoundRandomStroll(SPEED * 1.5)), 2]])],
    [5, V.minimalLook()],
    [99, resetRaidStatus()],
  ];
}

/** vanilla VillagerGoalPackages.getRaidPackage: won, outdoors to celebrate; still on, into hiding by a bed */
function raidPackage(): Pkg {
  return [
    [0, when(raidWon, triggerOneShuffled<Villager>([[moveToSkySeeingSpot(SPEED), 5], [asTrigger(V.villageBoundRandomStroll(SPEED * 1.1)), 2]]))],
    [0, celebrateVillagersSurvivedRaid()],
    [2, when(raidOn, V.locateHidingPlace(24, SPEED * 1.4, 1))],
    [5, V.minimalLook()],
    [99, resetRaidStatus()],
  ];
}

villagerRaidHooks.core = () => [[0, setRaidStatus()]];
villagerRaidHooks.gift = () => [[3, giveGiftToHero()]];
villagerRaidHooks.activities = () => [
  ['pre_raid', preRaidPackage()],
  ['raid', raidPackage()],
];
villagerRaidHooks.raidHere = (v) => raidAt(v) !== null;
// vanilla Villager.customServerAiStep: one tick in a hundred, a villager in an active raid that isn't over sweats
villagerRaidHooks.aiStep = (v) => {
  if (v.random.nextInt(100) !== 0) return;
  const raid = raidAt(v);
  if (raid && raid.isActive() && !raid.isOver()) v.addParticlesAroundSelf('splash');
};
