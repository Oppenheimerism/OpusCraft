// Zombie villagers (vanilla ZombieVillager): a villager a zombie kills (on normal half the time, on hard always)
// rises as one, keeping its biome's outfit, its trade, its offers and what it remembered; a few spawn in the dark
// like any zombie. Weakened, and given a golden apple, one starts to shake, and three to five minutes later (sooner
// among iron bars and beds) it's a villager again, grateful to whoever cured it.

import { Zombie, infection } from './monsters';
import { Villager, PROFESSIONS, villagerTypeAt, type VillagerType, type Profession } from './villager';
import { MerchantOffer, type SavedOffer } from './trading';
import type { GossipEntry } from './gossip';
import { MobEffectInstance, MOB_EFFECTS } from './effects';
import { EQUIPMENT_SLOTS, type Mob, type SpawnReason } from './mob';
import type { LivingEntity } from './living';
import type { Player } from './player';
import type { Level } from '../game/level';
import type { ItemStack } from '../item/item';
import { BLOCKS, STATE_BLOCK } from '../world/block';

/**
 * vanilla Mob.convertTo: the new mob takes the old one's place, turned the same way, as young as it was, as
 * unwilling to despawn and riding what it rode; the old one is gone at once (no death, no drops)
 */
function convertTo<T extends Mob>(from: Mob, to: T): T {
  to.moveTo(from.x, from.y, from.z, from.yaw, from.pitch);
  to.bodyYaw = to.bodyYawO = from.bodyYaw;
  to.headYaw = to.headYawO = from.headYaw;
  if (to instanceof Villager) to.setAge(from.isBaby() ? -24000 : 0);
  else if (to instanceof Zombie) to.setBaby(from.isBaby());
  if (from.persistenceRequired) to.persistenceRequired = true;
  from.level.addEntity(to);
  const vehicle = from.vehicle;
  if (vehicle) {
    from.stopRiding();
    to.startRiding(vehicle, true);
  }
  from.remove();
  return to;
}

export class ZombieVillager extends Zombie {
  override readonly type: string = 'zombie_villager';
  villagerType: VillagerType = 'plains';
  profession: Profession;
  merchantLevel = 1;
  /** vanilla villagerXp */
  xp = 0;
  /** vanilla tradeOffers: its offers as a villager, kept as they were saved */
  tradeOffers: SavedOffer[] | null = null;
  /** vanilla gossips: what it remembered as a villager */
  gossips: GossipEntry[] | null = null;
  /** vanilla DATA_CONVERTING_ID: it's being cured */
  converting = false;
  /** vanilla villagerConversionTime: how long the cure has to go */
  conversionTime = 0;
  /** vanilla conversionStarter: the uuid of whoever gave it the golden apple */
  conversionStarter: string | null = null;

  constructor(level: Level) {
    super(level);
    // (vanilla: any profession at all, the jobless and nitwits too)
    this.profession = PROFESSIONS[this.random.nextInt(PROFESSIONS.length)];
  }

  /** vanilla ZombieVillager.finalizeSpawn: dressed for where it is */
  override finalizeSpawn(reason?: SpawnReason): void {
    this.villagerType = villagerTypeAt(this.level, this.x, this.y, this.z);
    super.finalizeSpawn(reason);
  }

  /** vanilla removeWhenFarAway: not while it's being cured, nor once it has traded */
  override removeWhenFarAway(_d2: number): boolean {
    return !this.converting && this.xp === 0;
  }

  /** vanilla ZombieVillager.mobInteract: a golden apple starts the cure, but only while it's weakened */
  interact(p: Player, stack: ItemStack | null): 'success' | 'consume' | 'pass' {
    if (stack?.item.id !== 'golden_apple') return 'pass';
    if (!this.hasEffect('weakness')) return 'consume';
    if (p.gameMode !== 'creative') p.inventory.consumeSelected(1);
    this.startConverting(p.uuid, this.random.nextInt(2401) + 3600);
    return 'success';
  }

  /** vanilla startConverting: the weakness goes, strength for as long as the cure takes, and a hiss of the cure */
  private startConverting(starter: string | null, time: number): void {
    this.conversionStarter = starter;
    this.conversionTime = time;
    this.converting = true;
    this.removeEffect('weakness');
    this.addEffect(new MobEffectInstance(MOB_EFFECTS.strength, time, 0));
    // (vanilla entity event 16)
    this.level.sound.play('entity.zombie_villager.cure', this.x, this.y + this.eyeHeight, this.z, 1 + this.random.nextFloat(), this.random.nextFloat() * 0.7 + 0.3);
  }

  override tick(): void {
    if (this.isAlive && this.converting) {
      this.conversionTime -= this.conversionProgress();
      if (this.conversionTime <= 0) {
        this.finishConversion();
        return;
      }
    }
    super.tick();
  }

  /** vanilla getConversionProgress: now and then, iron bars and beds within 4 hurry the cure along */
  private conversionProgress(): number {
    let i = 1;
    if (this.random.nextFloat() < 0.01) {
      let j = 0;
      const x0 = Math.floor(this.x), y0 = Math.floor(this.y), z0 = Math.floor(this.z);
      for (let x = x0 - 4; x < x0 + 4 && j < 14; x++)
        for (let y = y0 - 4; y < y0 + 4 && j < 14; y++)
          for (let z = z0 - 4; z < z0 + 4 && j < 14; z++) {
            const n = BLOCKS[STATE_BLOCK[this.level.world.getState(x, y, z)]].name;
            if (n === 'iron_bars' || n.endsWith('_bed')) {
              if (this.random.nextFloat() < 0.3) i++;
              j++;
            }
          }
    }
    return i;
  }

  /**
   * vanilla finishConversion: a villager again, with its outfit, trade, offers, experience and memories; what it
   * had picked up drops (the gear it rose with is lost), whoever cured it is well remembered, and it's dizzy
   */
  private finishConversion(): void {
    const level = this.level;
    const bx = Math.floor(this.x), by = Math.floor(this.y), bz = Math.floor(this.z);
    const v = convertTo(this, new Villager(level));
    for (const slot of EQUIPMENT_SLOTS) {
      const s = this.getItemBySlot(slot);
      if (s && this.equipmentDropChance(slot) > 1) this.spawnAtLocation(s);
    }
    v.villagerType = this.villagerType;
    v.setProfession(this.profession);
    v.merchantLevel = this.merchantLevel;
    if (this.gossips) v.gossips.load(this.gossips);
    if (this.tradeOffers) v.setOffers(this.tradeOffers.map((o) => MerchantOffer.load(o)).filter((o): o is MerchantOffer => !!o));
    v.xp = this.xp;
    v.finalizeSpawn('conversion');
    v.refreshBrain();
    const p = level.player;
    if (this.conversionStarter && p && p.uuid === this.conversionStarter) {
      level.onCuredZombieVillager?.(p, v);
      v.onReputationEvent('zombie_villager_cured', p);
    }
    v.addEffect(new MobEffectInstance(MOB_EFFECTS.nausea, 200, 0));
    // (vanilla level event 1027)
    const r = this.random;
    level.sound.play('entity.zombie_villager.converted', bx + 0.5, by + 0.5, bz + 0.5, 1, (r.nextFloat() - r.nextFloat()) * 0.2 + 1);
  }

  override ambientSound(): string {
    return 'entity.zombie_villager.ambient';
  }
  override hurtSound(): string {
    return 'entity.zombie_villager.hurt';
  }
  override deathSound(): string {
    return 'entity.zombie_villager.death';
  }
  override stepSound(): string {
    return 'entity.zombie_villager.step';
  }

  protected override saveData(): Record<string, number | string | boolean> {
    const d: Record<string, number | string | boolean> = {
      ...super.saveData(),
      vtype: this.villagerType,
      profession: this.profession,
      level: this.merchantLevel,
      xp: this.xp,
      conversionTime: this.converting ? this.conversionTime : -1,
    };
    if (this.tradeOffers) d.offers = JSON.stringify(this.tradeOffers);
    if (this.gossips?.length) d.gossips = JSON.stringify(this.gossips);
    if (this.conversionStarter) d.conversionPlayer = this.conversionStarter;
    return d;
  }

  protected override loadData(d: Record<string, number | string | boolean>): void {
    super.loadData(d);
    if (typeof d.vtype === 'string') this.villagerType = d.vtype as VillagerType;
    if (PROFESSIONS.includes(d.profession as Profession)) this.profession = d.profession as Profession;
    this.merchantLevel = Math.max(1, Math.min(5, Number(d.level ?? 1)));
    this.xp = Number(d.xp ?? 0);
    if (typeof d.offers === 'string') this.tradeOffers = JSON.parse(d.offers) as SavedOffer[];
    if (typeof d.gossips === 'string') this.gossips = JSON.parse(d.gossips) as GossipEntry[];
    // (vanilla starts the cure again, from where it had got to)
    const t = Number(d.conversionTime ?? -1);
    if (t > -1) this.startConverting(typeof d.conversionPlayer === 'string' ? d.conversionPlayer : null, t);
  }
}

/**
 * vanilla Zombie.killedEntity (the rest, the difficulty and the coin, is the zombie's): the villager it killed rises
 * as a zombie villager that keeps everything it was, with the infection's groan
 */
infection.convert = (zombie: Zombie, victim: LivingEntity): boolean => {
  if (!(victim instanceof Villager)) return false;
  const zv = convertTo(victim, new ZombieVillager(zombie.level));
  zv.finalizeSpawn('conversion');
  zv.villagerType = victim.villagerType;
  zv.profession = victim.profession;
  zv.merchantLevel = victim.merchantLevel;
  zv.gossips = victim.gossips.save();
  zv.tradeOffers = victim.getOffers().map((o) => o.save());
  zv.xp = victim.xp;
  // (vanilla level event 1026, where the zombie is)
  const r = zombie.random;
  zombie.level.sound.play('entity.zombie.infect', Math.floor(zombie.x) + 0.5, Math.floor(zombie.y) + 0.5, Math.floor(zombie.z) + 0.5, 2, (r.nextFloat() - r.nextFloat()) * 0.2 + 1);
  return true;
};
