// Falling sand/gravel (vanilla FallingBlockEntity).

import { Entity } from './entity';
import type { Level } from '../game/level';
import { FLAGS, F_AIR, F_WATER, F_LAVA, F_REPLACEABLE, BLOCKS, STATE_BLOCK } from '../world/block';
import { ItemEntity } from './itemEntity';
import { ItemStack, itemForBlock } from '../item/item';
import { LivingEntity } from './living';
import type { Player } from './player';
import { canSurvive } from '../game/blockRules';

export class FallingBlockEntity extends Entity {
  readonly type = 'falling_block';
  time = 0;
  /** vanilla setHurtsEntities: damage per block fallen and its cap (falling stalactites) */
  private fallDamagePerDistance = 0;
  private fallDamageMax = 0;
  private damageSource = 'fallingBlock';

  constructor(level: Level, readonly state: number) {
    super(level);
    this.setSize(0.98, 0.98);
  }

  static fall(level: Level, x: number, y: number, z: number, state: number): FallingBlockEntity {
    const e = new FallingBlockEntity(level, state);
    e.moveTo(x + 0.5, y, z + 0.5);
    level.world.setState(x, y, z, 0);
    level.addEntity(e);
    return e;
  }

  hurtEntities(perDistance: number, max: number, source: string): void {
    this.fallDamagePerDistance = perDistance;
    this.fallDamageMax = max;
    this.damageSource = source;
  }

  /** vanilla FallingBlockEntity.causeFallDamage: whatever it lands in takes the hit */
  protected override causeFallDamage(dist: number): void {
    if (this.fallDamagePerDistance <= 0) return;
    const i = Math.ceil(dist - 1);
    if (i < 0) return;
    const dmg = Math.min(Math.floor(i * this.fallDamagePerDistance), this.fallDamageMax);
    for (const e of this.level.getEntities(this.bb, (e) => e instanceof LivingEntity && e.isAlive && !(e.type === 'player' && (e as Player).gameMode !== 'survival' && (e as Player).gameMode !== 'adventure'), this)) {
      e.hurt(dmg, this.damageSource, this, this);
    }
  }

  override tick(): void {
    this.baseTick();
    this.time++;
    this.dy -= 0.04;
    this.move(this.dx, this.dy, this.dz);
    this.dx *= 0.98;
    this.dy *= 0.98;
    this.dz *= 0.98;
    if (this.onGround) {
      const bx = Math.floor(this.x), by = Math.floor(this.y), bz = Math.floor(this.z);
      const cur = this.level.world.getState(bx, by, bz);
      this.remove();
      if (FLAGS[cur] & (F_AIR | F_REPLACEABLE) && !(FLAGS[cur] & F_LAVA) && canSurvive(this.level.world, bx, by, bz, this.state)) {
        if (!(FLAGS[cur] & F_AIR) && !(FLAGS[cur] & F_WATER)) this.level.destroyBlock(bx, by, bz, true, null, false);
        this.level.setBlock(bx, by, bz, this.state);
        const b = BLOCKS[STATE_BLOCK[this.state]];
        this.level.sound.play(`block.${b.sound}.place`, bx + 0.5, by + 0.5, bz + 0.5, 1, 0.8);
      } else {
        const b = BLOCKS[STATE_BLOCK[this.state]];
        const it = itemForBlock(b.name);
        if (it) ItemEntity.drop(this.level, bx, by, bz, new ItemStack(it, 1));
        // vanilla onBrokenAfterFall (level event 1045 for dripstone)
        if (b.name === 'pointed_dripstone') this.level.sound.play('block.pointed_dripstone.land', bx + 0.5, by + 0.5, bz + 0.5, 2, Math.random() * 0.1 + 0.9);
      }
    } else if (this.time > 600 || this.y < -128) {
      this.remove();
    }
  }
}
