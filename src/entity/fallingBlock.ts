// Falling sand/gravel/anvils (vanilla FallingBlockEntity, AnvilBlock.falling / onLand / onBrokenAfterFall).

import { Entity } from './entity';
import type { Level } from '../game/level';
import { FLAGS, F_AIR, F_WATER, F_LAVA, F_REPLACEABLE, BLOCKS, STATE_BLOCK } from '../world/block';
import { ItemEntity } from './itemEntity';
import { ItemStack, itemForBlock } from '../item/item';
import { LivingEntity } from './living';
import type { Player } from './player';
import { canSurvive } from '../game/blockRules';
import { damagedAnvil } from '../world/blocksEnchanting';

export class FallingBlockEntity extends Entity {
  readonly type = 'falling_block';
  time = 0;
  /** vanilla setHurtsEntities: damage per block fallen and its cap (falling stalactites) */
  private fallDamagePerDistance = 0;
  private fallDamageMax = 0;
  private damageSource = 'fallingBlock';
  /** vanilla cancelDrop: a damaged anvil that broke in the fall leaves nothing */
  private cancelDrop = false;
  /** vanilla Fallable.onBrokenAfterFall for the blocks that do something then (suspicious sand: game/archaeology.ts) */
  onBrokenAfterFall: ((level: Level, e: FallingBlockEntity) => void) | null = null;

  constructor(level: Level, public state: number) {
    super(level);
    this.setSize(0.98, 0.98);
  }

  static fall(level: Level, x: number, y: number, z: number, state: number): FallingBlockEntity {
    const e = new FallingBlockEntity(level, state);
    e.moveTo(x + 0.5, y, z + 0.5);
    level.world.setState(x, y, z, 0);
    // (vanilla: the block goes with UPDATE_ALL; the shapes around are the caller's)
    level.updateNeighborsAt(x, y, z, STATE_BLOCK[state]);
    level.addEntity(e);
    // vanilla AnvilBlock.falling: 2 damage per block fallen, at most 40
    if (e.isAnvil()) e.hurtEntities(2, 40, 'anvil');
    return e;
  }

  /** vanilla disableDrop: it won't be placed again or drop as an item, only break where it lands (suspicious sand) */
  disableDrop(): void {
    this.cancelDrop = true;
  }

  private isAnvil(): boolean {
    return BLOCKS[STATE_BLOCK[this.state]].name.endsWith('anvil');
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
    // an anvil that hurt something may crack a stage (5% + 5% per block), and a damaged one breaks
    if (this.isAnvil() && dmg > 0 && Math.random() < 0.05 + i * 0.05) {
      const next = damagedAnvil(this.state);
      if (next === null) this.cancelDrop = true;
      else this.state = next;
    }
  }

  override tick(): void {
    this.baseTick();
    // (vanilla takes the block before moving: an anvil cracked by this landing still drops as it was)
    const block = BLOCKS[STATE_BLOCK[this.state]];
    this.time++;
    this.dy -= 0.04;
    this.move(this.dx, this.dy, this.dz);
    this.dx *= 0.98;
    this.dy *= 0.98;
    this.dz *= 0.98;
    if (this.onGround) {
      const bx = Math.floor(this.x), by = Math.floor(this.y), bz = Math.floor(this.z);
      const cur = this.level.world.getState(bx, by, bz);
      const anvil = block.name.endsWith('anvil');
      this.remove();
      // vanilla AnvilBlock.onBrokenAfterFall (level event 1029) / pointed dripstone's (1045)
      const broken = () => {
        if (anvil) this.level.sound.play('block.anvil.destroy', bx + 0.5, by + 0.5, bz + 0.5, 1, Math.random() * 0.1 + 0.9);
        if (block.name === 'pointed_dripstone') this.level.sound.play('block.pointed_dripstone.land', bx + 0.5, by + 0.5, bz + 0.5, 2, Math.random() * 0.1 + 0.9);
        this.onBrokenAfterFall?.(this.level, this);
      };
      if (this.cancelDrop) broken();
      else if (FLAGS[cur] & (F_AIR | F_REPLACEABLE) && !(FLAGS[cur] & F_LAVA) && canSurvive(this.level.world, bx, by, bz, this.state)) {
        if (!(FLAGS[cur] & F_AIR) && !(FLAGS[cur] & F_WATER)) this.level.destroyBlock(bx, by, bz, true, null, false);
        this.level.setBlock(bx, by, bz, this.state);
        // vanilla AnvilBlock.onLand: level event 1031
        if (anvil) this.level.sound.play('block.anvil.land', bx + 0.5, by + 0.5, bz + 0.5, 0.3, Math.random() * 0.1 + 0.9);
        else this.level.sound.play(`block.${block.sound}.place`, bx + 0.5, by + 0.5, bz + 0.5, 1, 0.8);
      } else {
        const it = itemForBlock(block.name);
        if (it) ItemEntity.drop(this.level, bx, by, bz, new ItemStack(it, 1));
        broken();
      }
    } else if (this.time > 600 || this.y < -128) {
      this.remove();
    }
  }
}
