// Primed TNT (vanilla PrimedTnt): 80-tick fuse, bouncing physics, explosion.

import { Entity } from './entity';
import type { Level } from '../game/level';
import { explode } from '../game/explosion';

export class PrimedTnt extends Entity {
  readonly type = 'tnt';
  fuse = 80;
  owner: Entity | null = null;

  constructor(level: Level, x: number, y: number, z: number, owner: Entity | null = null) {
    super(level);
    this.setSize(0.98, 0.98);
    this.moveTo(x, y, z);
    const d0 = Math.random() * Math.PI * 2;
    this.dx = -Math.sin(d0) * 0.02;
    this.dy = 0.2;
    this.dz = -Math.cos(d0) * 0.02;
    this.owner = owner;
  }

  /** vanilla TntBlock.prime */
  static prime(level: Level, x: number, y: number, z: number, owner: Entity | null): PrimedTnt {
    const t = new PrimedTnt(level, x + 0.5, y, z + 0.5, owner);
    level.addEntity(t);
    level.sound.play('entity.tnt.primed', t.x, t.y, t.z, 1, 1);
    return t;
  }

  override tick(): void {
    this.baseTick();
    this.dy -= 0.04;
    this.move(this.dx, this.dy, this.dz);
    this.dx *= 0.98;
    this.dy *= 0.98;
    this.dz *= 0.98;
    if (this.onGround) {
      this.dx *= 0.7;
      this.dy *= -0.5;
      this.dz *= 0.7;
    }
    this.fuse--;
    if (this.fuse <= 0) {
      this.remove();
      explode(this.level, this, this.x, this.y + 0.98 * 0.0625, this.z, 4, false, 'tnt');
    } else {
      this.level.particles.spawn?.('smoke', this.x, this.y + 0.5, this.z, 0, 0, 0);
    }
  }

  override hurt(): boolean {
    return false;
  }

  override isPushable(): boolean {
    return false;
  }

  protected override makesStepSounds(): boolean {
    return false;
  }
}
