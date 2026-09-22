// Mining / placing / picking — vanilla MultiPlayerGameMode + Minecraft.handleKeybinds timing.

import type { Level } from './level';
import type { Player } from '../entity/player';
import { raycast, BlockHit } from './raycast';
import { destroyProgress, placementState, canReplace, canSurvive, isCorrectTool } from './blockRules';
import { BLOCKS, STATE_BLOCK, FLAGS, F_AIR, F_WATER, F_REPLACEABLE, COLLISION, getBlock, S } from '../world/block';
import { DX, DY, DZ } from '../world/dir';
import { blockForItem, itemForBlock, ItemStack, getItem } from '../item/item';
import { AABB } from '../core/aabb';
import { ItemEntity } from '../entity/itemEntity';
import { FLUID_WATER } from '../world/fluids';

export class Interaction {
  hit: BlockHit | null = null;
  destroying = false;
  dX = 0;
  dY = 0;
  dZ = 0;
  destroyProgress = 0;
  destroyTicks = 0;
  destroyDelay = 0;
  rightClickDelay = 0;
  missTime = 0;
  /** -1 or 0..9 */
  get destroyStage(): number {
    return this.destroying && this.destroyProgress > 0 ? Math.min(9, Math.floor(this.destroyProgress * 10) - 1) : -1;
  }

  constructor(readonly level: Level, readonly player: Player) {}

  reach(): number {
    return this.player.gameMode === 'creative' ? 5 : 4.5;
  }

  /** Update target from camera (called per frame and per tick). */
  pick(ex: number, ey: number, ez: number, yaw: number, pitch: number): void {
    const pr = (pitch * Math.PI) / 180, yr = (yaw * Math.PI) / 180;
    const dx = -Math.sin(yr) * Math.cos(pr), dy = -Math.sin(pr), dz = Math.cos(yr) * Math.cos(pr);
    this.hit = raycast(this.level.world, ex, ey, ez, dx, dy, dz, this.reach());
  }

  /** Attack button pressed this tick. */
  startAttack(): void {
    const p = this.player;
    if (this.missTime > 0) return;
    const h = this.hit;
    if (!h) {
      if (p.gameMode !== 'creative') this.missTime = 10;
      p.resetAttackStrength();
      p.swing();
      return;
    }
    this.startDestroy(h);
    p.swing();
  }

  private startDestroy(h: BlockHit): void {
    const p = this.player;
    if (p.gameMode === 'creative') {
      this.destroyDelay = 5;
      this.destroyBlock(h.x, h.y, h.z);
      return;
    }
    if (!this.destroying || !this.same(h)) {
      const held = p.inventory.selectedItem?.item ?? null;
      const prog = destroyProgress(h.state, held, p.eyeFluid === FLUID_WATER, p.onGround);
      if (prog >= 1) {
        this.destroyBlock(h.x, h.y, h.z);
      } else {
        this.destroying = true;
        this.dX = h.x;
        this.dY = h.y;
        this.dZ = h.z;
        this.destroyProgress = 0;
        this.destroyTicks = 0;
      }
    }
  }

  private same(h: BlockHit): boolean {
    return h.x === this.dX && h.y === this.dY && h.z === this.dZ;
  }

  /** Attack button held this tick. */
  continueAttack(held: boolean): void {
    const p = this.player;
    if (this.missTime > 0) this.missTime--;
    if (!held) {
      this.destroying = false;
      this.destroyProgress = 0;
      return;
    }
    const h = this.hit;
    if (!h) {
      this.destroying = false;
      return;
    }
    if (this.destroyDelay > 0) {
      this.destroyDelay--;
      return;
    }
    if (p.gameMode === 'creative') {
      this.destroyDelay = 5;
      this.destroyBlock(h.x, h.y, h.z);
      p.swing();
      return;
    }
    if (!this.destroying || !this.same(h)) {
      this.startDestroy(h);
      p.swing();
      return;
    }
    const st = this.level.world.getState(h.x, h.y, h.z);
    if (FLAGS[st] & F_AIR) {
      this.destroying = false;
      return;
    }
    const item = p.inventory.selectedItem?.item ?? null;
    this.destroyProgress += destroyProgress(st, item, p.eyeFluid === FLUID_WATER, p.onGround);
    const b = BLOCKS[STATE_BLOCK[st]];
    if (this.destroyTicks % 4 === 0) {
      // vanilla plays hits at pitch 0.5; the synthesized block.*.hit takes already bake that in
      this.level.sound.play(`block.${b.sound}.hit`, h.x + 0.5, h.y + 0.5, h.z + 0.5, 0.25, 1);
    }
    this.destroyTicks++;
    this.level.particles.blockHit(h.x, h.y, h.z, st, h.face);
    p.swing();
    if (this.destroyProgress >= 1) {
      this.destroying = false;
      this.destroyBlock(h.x, h.y, h.z);
      this.destroyProgress = 0;
      this.destroyTicks = 0;
      this.destroyDelay = 5;
    }
  }

  private destroyBlock(x: number, y: number, z: number): void {
    const p = this.player;
    const st = this.level.world.getState(x, y, z);
    if (FLAGS[st] & F_AIR) return;
    const b = BLOCKS[STATE_BLOCK[st]];
    if (b.hardness < 0 && p.gameMode !== 'creative') return;
    const held = p.inventory.selectedItem;
    // swords can't break blocks in creative
    if (p.gameMode === 'creative' && held?.item.tool?.type === 'sword') return;
    const survival = p.gameMode === 'survival' || p.gameMode === 'adventure';
    this.level.destroyBlock(x, y, z, survival, held?.item ?? null);
    if (survival) {
      p.food.addExhaustion(0.005);
      if (held && held.item.tool && b.hardness > 0) this.damageHeld(1);
      else if (held && held.item.tool && held.item.tool.type !== 'sword' && b.hardness === 0) {
        /* no durability loss on instant blocks */
      }
    }
    void isCorrectTool;
  }

  damageHeld(n: number): void {
    const p = this.player;
    const s = p.inventory.selectedItem;
    if (!s || !s.item.maxDamage) return;
    s.damage += n;
    if (s.damage >= s.item.maxDamage) {
      p.inventory.setSelectedItem(null);
      this.level.sound.play('entity.item.break', p.x, p.y, p.z, 0.8, 0.8 + Math.random() * 0.4);
    }
    p.inventory.version++;
  }

  /** Use button pressed or held (vanilla repeats every 4 ticks). */
  onOpenContainer: ((kind: string, x: number, y: number, z: number) => void) | null = null;

  use(pressed: boolean, held: boolean): void {
    if (this.rightClickDelay > 0) this.rightClickDelay--;
    if (!(pressed || (held && this.rightClickDelay === 0))) return;
    this.rightClickDelay = 4;
    const p = this.player;
    const stack = p.inventory.selectedItem;
    const h = this.hit;
    // blocks with a menu (vanilla Block.useWithoutItem), skipped when sneaking with an item
    if (h && !(p.crouching && stack) && p.gameMode !== 'spectator') {
      const name = BLOCKS[STATE_BLOCK[this.level.getState(h.x, h.y, h.z)]].name;
      if ((name === 'crafting_table' || name === 'furnace' || name === 'chest') && this.onOpenContainer) {
        this.onOpenContainer(name, h.x, h.y, h.z);
        p.swing();
        return;
      }
    }
    if (h && stack) {
      if (this.placeBlock(h, stack)) {
        p.swing();
        return;
      }
    }
    if (stack) this.useItem(stack);
  }

  private placeBlock(h: BlockHit, stack: ItemStack): boolean {
    const p = this.player;
    const world = this.level.world;
    let block = blockForItem(stack.item);
    if (stack.item.id === 'water_bucket') block = getBlock('water');
    if (stack.item.id === 'lava_bucket') block = getBlock('lava');
    if (!block) return false;
    // replace the clicked block if replaceable (tall grass, snow layer 1...), else place against the face
    let x = h.x, y = h.y, z = h.z;
    const clicked = world.getState(x, y, z);
    const clickedBlock = BLOCKS[STATE_BLOCK[clicked]];
    const replaceClicked = FLAGS[clicked] & F_REPLACEABLE && clickedBlock !== block && !(clickedBlock.name === 'water' && block.name !== 'water');
    // slab merging into a double slab
    if (clickedBlock === block && block.name.endsWith('_slab')) {
      const type = block.get(clicked, 'type');
      if ((type === 'bottom' && h.face === 1) || (type === 'top' && h.face === 0)) {
        return this.commitPlace(x, y, z, block.with(clicked, 'type', 'double'), stack, block.sound);
      }
    }
    // snow layers stack
    if (clickedBlock === block && block.name === 'snow') {
      const l = block.get<number>(clicked, 'layers');
      if (l < 8) return this.commitPlace(x, y, z, block.with(clicked, 'layers', l + 1), stack, block.sound);
    }
    if (!replaceClicked) {
      x += DX[h.face];
      y += DY[h.face];
      z += DZ[h.face];
    }
    if (y < -64 || y >= 320) return false;
    const target = world.getState(x, y, z);
    const targetBlock = BLOCKS[STATE_BLOCK[target]];
    if (!(canReplace(target, block) || (targetBlock.name === 'water' && block.name !== 'water'))) {
      // slab into slab at adjacent position
      if (targetBlock === block && block.name.endsWith('_slab') && block.get(target, 'type') !== 'double') {
        return this.commitPlace(x, y, z, block.with(target, 'type', 'double'), stack, block.sound);
      }
      return false;
    }
    const st = placementState(block, {
      world, x, y, z, face: replaceClicked ? 1 : h.face, hitY: h.hy - h.y, yaw: p.yaw, pitch: p.pitch, sneaking: p.crouching, clickedState: clicked,
    });
    if (st === null) return false;
    if (!canSurvive(world, x, y, z, st)) return false;
    // don't place inside entities
    const boxes = COLLISION[st];
    if (boxes) {
      for (const c of boxes) {
        const bb = new AABB(x + c[0], y + c[1], z + c[2], x + c[3], y + c[4], z + c[5]);
        if (bb.intersects(p.bb)) return false;
        for (const e of this.level.entities) {
          if (e !== p && !(e instanceof ItemEntity) && !e.removed && bb.intersects(e.bb)) return false;
        }
      }
    }
    // double-height plants need the block above
    if (block.propIndex('half') >= 0 && block.s.props?.some((pp) => pp.values.includes('upper'))) {
      const above = world.getState(x, y + 1, z);
      if (!canReplace(above, block)) return false;
      this.level.setBlock(x, y + 1, z, block.with(st, 'half', 'upper'), false);
      return this.commitPlace(x, y, z, block.with(st, 'half', 'lower'), stack, block.sound);
    }
    return this.commitPlace(x, y, z, st, stack, block.sound);
  }

  private commitPlace(x: number, y: number, z: number, st: number, stack: ItemStack, sound: string): boolean {
    const p = this.player;
    this.level.setBlock(x, y, z, st);
    const isBucket = stack.item.id.endsWith('_bucket');
    if (isBucket) this.level.sound.play(stack.item.id === 'lava_bucket' ? 'item.bucket.empty_lava' : 'item.bucket.empty', x + 0.5, y + 0.5, z + 0.5, 1, 1);
    else this.level.sound.play(`block.${sound}.place`, x + 0.5, y + 0.5, z + 0.5, 1, 0.8);
    if (p.gameMode !== 'creative') {
      if (isBucket) p.inventory.setSelectedItem(ItemStack.of('bucket'));
      else p.inventory.consumeSelected(1);
    }
    return true;
  }

  private useItem(stack: ItemStack): void {
    const p = this.player;
    // bucket pickup
    if (stack.item.id === 'bucket') {
      const pr = (p.pitch * Math.PI) / 180, yr = (p.yaw * Math.PI) / 180;
      const eye = p.y + p.eyeHeight;
      const h = raycast(this.level.world, p.x, eye, p.z, -Math.sin(yr) * Math.cos(pr), -Math.sin(pr), Math.cos(yr) * Math.cos(pr), this.reach(), true);
      if (h && FLAGS[h.state] & F_WATER && BLOCKS[STATE_BLOCK[h.state]].name === 'water' && BLOCKS[STATE_BLOCK[h.state]].get(h.state, 'level') === 0) {
        this.level.setBlock(h.x, h.y, h.z, 0);
        this.level.sound.play('item.bucket.fill', h.x + 0.5, h.y + 0.5, h.z + 0.5, 1, 1);
        if (p.gameMode !== 'creative') {
          if (stack.count === 1) p.inventory.setSelectedItem(ItemStack.of('water_bucket'));
          else {
            p.inventory.consumeSelected(1);
            p.inventory.add(ItemStack.of('water_bucket'));
          }
        }
        p.swing();
      } else if (h && BLOCKS[STATE_BLOCK[h.state]].name === 'lava' && BLOCKS[STATE_BLOCK[h.state]].get(h.state, 'level') === 0) {
        this.level.setBlock(h.x, h.y, h.z, 0);
        this.level.sound.play('item.bucket.fill_lava', h.x + 0.5, h.y + 0.5, h.z + 0.5, 1, 1);
        if (p.gameMode !== 'creative') {
          if (stack.count === 1) p.inventory.setSelectedItem(ItemStack.of('lava_bucket'));
          else {
            p.inventory.consumeSelected(1);
            p.inventory.add(ItemStack.of('lava_bucket'));
          }
        }
        p.swing();
      }
    }
  }

  /** Middle click: pick block (creative puts it in the hotbar). */
  pickBlock(): void {
    const h = this.hit;
    if (!h) return;
    const p = this.player;
    const b = BLOCKS[STATE_BLOCK[h.state]];
    const it = itemForBlock(b.name) ?? (b.name === 'water' ? getItem('water_bucket') : undefined);
    if (!it) return;
    const inv = p.inventory;
    for (let i = 0; i < 9; i++) {
      if (inv.main[i]?.item === it) {
        inv.selected = i;
        inv.version++;
        return;
      }
    }
    if (p.gameMode !== 'creative') {
      const slot = inv.findSlot((s) => s.item === it);
      if (slot >= 9) {
        const tmp = inv.main[inv.selected];
        inv.main[inv.selected] = inv.main[slot];
        inv.main[slot] = tmp;
        inv.version++;
      }
      return;
    }
    // creative: use an empty hotbar slot or replace the selected one
    let target = inv.selected;
    if (inv.main[target]) {
      for (let i = 0; i < 9; i++)
        if (!inv.main[i]) {
          target = i;
          break;
        }
    }
    inv.selected = target;
    inv.setSlot(target, new ItemStack(it, 1));
  }

  /** Q: drop one (or the whole stack with ctrl) */
  drop(all: boolean): void {
    const p = this.player;
    const s = p.inventory.selectedItem;
    if (!s) return;
    const n = all ? s.count : 1;
    const out = new ItemStack(s.item, n, s.damage);
    p.inventory.consumeSelected(n);
    this.throwItem(out);
    p.swing();
  }

  throwItem(stack: ItemStack): void {
    const p = this.player;
    const e = new ItemEntity(this.level, stack);
    const eye = p.y + p.eyeHeight - 0.3;
    e.moveTo(p.x, eye, p.z);
    e.pickupDelay = 40;
    const f8 = Math.sin((p.pitch * Math.PI) / 180), f2 = Math.cos((p.pitch * Math.PI) / 180);
    const f3 = Math.sin((p.yaw * Math.PI) / 180), f4 = Math.cos((p.yaw * Math.PI) / 180);
    const f5 = Math.random() * Math.PI * 2, f6 = 0.02 * Math.random();
    e.dx = -f3 * f2 * 0.3 + Math.cos(f5) * f6;
    e.dy = -f8 * 0.3 + 0.1 + (Math.random() - Math.random()) * 0.1;
    e.dz = f4 * f2 * 0.3 + Math.sin(f5) * f6;
    this.level.addEntity(e);
  }
}

export { S };
