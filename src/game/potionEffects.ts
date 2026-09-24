// What the 1.21 potions' effects do (vanilla WindChargedMobEffect, WeavingMobEffect, OozingMobEffect,
// InfestedMobEffect): a burst of wind, webs, slimes when their bearer is killed; silverfish when it's hurt.

import { MOB_EFFECTS } from '../entity/effects';
import type { LivingEntity } from '../entity/living';
import type { Level } from './level';
import { FLAGS, F_AIR, F_REPLACEABLE, S } from '../world/block';
import { sturdyUp } from '../world/gen/structure';
import { createMob } from './spawner';
import { windBurst } from './explosion';

/** vanilla Mth.randomBetweenInclusive */
function between(level: Level, lo: number, hi: number): number {
  return lo + level.random.nextInt(hi - lo + 1);
}

// vanilla WindChargedMobEffect.onMobRemoved: a wind charge's burst where it died, 3 across, pushing (never hurting)
MOB_EFFECTS.wind_charged.onMobRemoved = (e) => {
  windBurst(e.level, e, e.x, e.y + e.height / 2, e.z, 3);
};

// vanilla WeavingMobEffect.onMobRemoved: 2 or 3 cobwebs in the blocks round where it died (a mob's only with
// mobGriefing): up to 15 tries at a spot within a block that's free and stands on something sturdy
MOB_EFFECTS.weaving.onMobRemoved = (e) => {
  const level = e.level;
  if (e.type !== 'player' && !level.gameRules.mobGriefing) return;
  const max = between(level, 2, 3);
  const bx = Math.floor(e.x), by = Math.floor(e.y), bz = Math.floor(e.z);
  const w = level.world;
  const picked: [number, number, number][] = [];
  for (let i = 0; i < 15; i++) {
    const x = between(level, bx - 1, bx + 1), y = between(level, by - 1, by + 1), z = between(level, bz - 1, bz + 1);
    if (picked.some((p) => p[0] === x && p[1] === y && p[2] === z)) continue;
    if (!(FLAGS[w.getState(x, y, z)] & (F_AIR | F_REPLACEABLE)) || !sturdyUp(w.getState(x, y - 1, z))) continue;
    picked.push([x, y, z]);
    if (picked.length >= max) break;
  }
  for (const [x, y, z] of picked) {
    level.setBlock(x, y, z, S('cobweb'));
    // vanilla level event 3018: a puff as the web is spun
    for (let i = 0; i < 30; i++) level.particles.spawn?.('poof', x + Math.random(), y + Math.random(), z + Math.random(), 0, 0, 0);
    level.sound.play('block.cobweb.place', x + 0.5, y + 0.5, z + 0.5, 1, 1);
  }
};

// vanilla OozingMobEffect.onMobRemoved: two slimes of size 2 where it died, but no more than entity cramming leaves
// room for among the slimes already within 2 blocks
MOB_EFFECTS.oozing.onMobRemoved = (e) => {
  const level = e.level;
  const cramming = Number(level.gameRules.maxEntityCramming);
  const want = 2;
  let n = want;
  if (cramming >= 1) {
    const near = level.getEntities(e.bb.inflate(2), (o) => o.type === 'slime' && o !== e).length;
    n = Math.max(0, Math.min(cramming - Math.min(near, cramming), want));
  }
  for (let i = 0; i < n; i++) {
    const s = createMob('slime', level) as (LivingEntity & { setSlimeSize(size: number, reset: boolean): void }) | null;
    if (!s) return;
    s.setSlimeSize(2, true);
    s.moveTo(e.x, e.y + 0.5, e.z, level.random.nextFloat() * 360, 0);
    level.addEntity(s);
  }
};

// vanilla InfestedMobEffect.onMobHurt: one time in ten, 1 or 2 silverfish burst out halfway up, thrown off a little
// to either side of where it looks (when the game has silverfish)
MOB_EFFECTS.infested.onMobHurt = (e) => {
  const level = e.level;
  if (level.random.nextFloat() > 0.1) return;
  const n = between(level, 1, 2);
  for (let i = 0; i < n; i++) {
    const s = createMob('silverfish', level);
    if (!s) return;
    const g = -Math.PI / 2 + level.random.nextFloat() * Math.PI;
    // the look vector ×0.3 (×1.5 up), turned about y by g
    const yr = (e.yaw * Math.PI) / 180, xr = (e.pitch * Math.PI) / 180;
    const lx = -Math.sin(yr) * Math.cos(xr) * 0.3, ly = -Math.sin(xr) * 0.3 * 1.5, lz = Math.cos(yr) * Math.cos(xr) * 0.3;
    const c = Math.cos(g), sn = Math.sin(g);
    s.moveTo(e.x, e.y + e.height / 2, e.z, level.random.nextFloat() * 360, 0);
    s.dx = lx * c + lz * sn;
    s.dy = ly;
    s.dz = -lx * sn + lz * c;
    level.addEntity(s);
    level.sound.play('entity.silverfish.hurt', s.x, s.y, s.z, 1, 1);
  }
};
