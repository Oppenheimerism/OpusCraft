// Mining / placing / picking — vanilla MultiPlayerGameMode + Minecraft.handleKeybinds timing.

import type { Level } from './level';
import type { Player } from '../entity/player';
import { raycast, BlockHit } from './raycast';
import { destroyProgress, placementState, canReplace, canSurvive, isCorrectTool, blockExperience } from './blockRules';
import { BLOCKS, STATE_BLOCK, FLAGS, F_AIR, F_WATER, F_OPAQUE, F_REPLACEABLE, COLLISION, FACE_OCC, OUTLINE, getBlock, S } from '../world/block';
import { updateShape, hasShapeUpdates } from './shapeUpdates';
import { DX, DY, DZ, DIR_NAMES, dirFromYaw } from '../world/dir';
import { blockForItem, itemForBlock, ItemStack, getItem } from '../item/item';
import { AABB } from '../core/aabb';
import { ItemEntity } from '../entity/itemEntity';
import { FLUID_WATER } from '../world/fluids';
import type { Entity } from '../entity/entity';
import { LivingEntity } from '../entity/living';
import { Animal } from '../entity/animals';
import { Creeper, bowPower } from '../entity/monsters';
import { Arrow } from '../entity/arrow';
import { PrimedTnt } from '../entity/tnt';
import { ThrownItem, ThrownKind } from '../entity/throwable';
import { createMob } from './spawner';
import { SpawnerBlockEntity } from '../world/blockEntity';
import { playerAttack } from './combat';
import { canPlaceFire, fireStateAt, placeFire } from './fire';

export class Interaction {
  hit: BlockHit | null = null;
  /** entity under the crosshair (vanilla crosshairPickEntity) */
  entityHit: Entity | null = null;
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

  entityReach(): number {
    return this.player.gameMode === 'creative' ? 5 : 3;
  }

  /** Update target from camera (vanilla GameRenderer.pick: blocks and entities). */
  pick(ex: number, ey: number, ez: number, yaw: number, pitch: number): void {
    const pr = (pitch * Math.PI) / 180, yr = (yaw * Math.PI) / 180;
    const dx = -Math.sin(yr) * Math.cos(pr), dy = -Math.sin(pr), dz = Math.cos(yr) * Math.cos(pr);
    const d0 = this.reach(), d1 = this.entityReach();
    let d2 = Math.max(d0, d1);
    const bh = raycast(this.level.world, ex, ey, ez, dx, dy, dz, d2);
    let d4 = d2 * d2;
    if (bh) {
      d4 = bh.dist * bh.dist;
      d2 = bh.dist;
    }
    const p = this.player;
    const x1 = ex + dx * d2, y1 = ey + dy * d2, z1 = ez + dz * d2;
    const box = p.bb.expandTowards(dx * d2, dy * d2, dz * d2).inflate(1);
    let best: Entity | null = null, bestD = d4;
    for (const e of this.level.getEntities(box, (e) => e.isPickable() && e !== p, p)) {
      const eb = e.bb.inflate(e.pickRadius());
      if (eb.contains(ex, ey, ez)) {
        if (bestD >= 0) {
          best = e;
          bestD = 0;
        }
        continue;
      }
      const h = eb.clip(ex, ey, ez, x1, y1, z1);
      if (!h) continue;
      const hd = (h.t * d2) ** 2;
      if (hd < bestD || bestD === 0) {
        if (bestD === 0) continue;
        best = e;
        bestD = hd;
      }
    }
    this.entityHit = null;
    this.hit = null;
    if (best && bestD < d4) {
      if (bestD < d1 * d1) this.entityHit = best;
    } else if (bh && bh.dist < d0) this.hit = bh;
  }

  /** Attack button pressed this tick. */
  startAttack(): void {
    const p = this.player;
    if (this.missTime > 0) return;
    if (p.isUsingItem()) return;
    if (this.entityHit) {
      playerAttack(this.level, p, this.entityHit, (n) => this.damageHeld(n));
      p.swing();
      return;
    }
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
      // vanilla stopDestroyBlock: the tutorial counts abandoned attempts
      if (this.destroying) this.onDestroyProgress?.(this.level.getBlockName(this.dX, this.dY, this.dZ), -1);
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
    this.onDestroyProgress?.(b.name, Math.min(1, this.destroyProgress));
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
    // vanilla BaseFireBlock.playerWillDestroy: punching out fire fizzes
    if (b.name === 'fire') this.level.sound.play('block.fire.extinguish', x + 0.5, y + 0.5, z + 0.5, 0.5, 2.6 + (Math.random() - Math.random()) * 0.8);
    this.level.destroyBlock(x, y, z, survival, held?.item ?? null);
    if (survival && this.level.gameRules.doTileDrops) {
      const xp = blockExperience(st, held?.item ?? null, this.level.random);
      if (xp > 0) this.level.awardExperience(x + 0.5, y + 0.5, z + 0.5, xp);
    }
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
    const p = this.player;
    // vanilla handleKeybinds: while using an item, releasing the key releases it
    if (p.isUsingItem()) {
      if (!held) this.releaseUsingItem();
      return;
    }
    if (!(pressed || (held && this.rightClickDelay === 0))) return;
    this.rightClickDelay = 4;
    const stack = p.inventory.selectedItem;
    // entity interaction (vanilla Player.interactOn → Mob.mobInteract)
    const e = this.entityHit;
    if (e && p.gameMode !== 'spectator') {
      if (e instanceof Animal && e.interact(p, stack)) {
        p.swing();
        return;
      }
      if (e instanceof Creeper && e.interact(p, stack)) {
        p.swing();
        return;
      }
      if (stack && stack.item.id.endsWith('_spawn_egg') && e instanceof Animal && e.type === stack.item.id.slice(0, -10)) {
        // spawn egg on a matching animal spawns a baby
        const baby = e.makeBaby();
        baby.setAge(-24000);
        baby.moveTo(e.x, e.y, e.z, 0, 0);
        this.level.addEntity(baby);
        if (p.gameMode !== 'creative') p.inventory.consumeSelected(1);
        p.swing();
        return;
      }
    }
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
    if (h && p.gameMode !== 'spectator' && this.useOnBlock(h, stack)) return;
    // vanilla TntBlock.useItemOn: flint and steel / fire charge primes TNT
    if (h && stack && (stack.item.id === 'flint_and_steel' || stack.item.id === 'fire_charge') && this.level.getBlockName(h.x, h.y, h.z) === 'tnt') {
      this.level.setBlock(h.x, h.y, h.z, 0);
      PrimedTnt.prime(this.level, h.x, h.y, h.z, p);
      if (stack.item.id === 'flint_and_steel') {
        this.level.sound.play('item.flintandsteel.use', h.x + 0.5, h.y + 0.5, h.z + 0.5, 1, Math.random() * 0.4 + 0.8);
        if (p.gameMode !== 'creative') this.damageHeld(1);
      } else if (p.gameMode !== 'creative') p.inventory.consumeSelected(1);
      p.swing();
      return;
    }
    // vanilla SpawnEggItem.useOn
    if (h && stack && stack.item.id.endsWith('_spawn_egg') && p.gameMode !== 'spectator') {
      // on a spawner: it spawns this mob from now on
      const be = this.level.world.getBlockEntity(h.x, h.y, h.z);
      if (be instanceof SpawnerBlockEntity) {
        be.setEntityId(stack.item.id.slice(0, -10));
        this.level.world.getChunk(h.x >> 4, h.z >> 4)!.modified = true;
        if (p.gameMode !== 'creative') p.inventory.consumeSelected(1);
        p.swing();
        return;
      }
      const replace = FLAGS[h.state] & F_REPLACEABLE || COLLISION[h.state]?.length === 0;
      const x = replace ? h.x : h.x + DX[h.face], y = replace ? h.y : h.y + DY[h.face], z = replace ? h.z : h.z + DZ[h.face];
      const mob = createMob(stack.item.id.slice(0, -10), this.level);
      if (mob) {
        const up = !replace && h.face === 1;
        mob.moveTo(x + 0.5, y + (up ? 0 : 0), z + 0.5, Math.random() * 360, 0);
        mob.bodyYaw = mob.headYaw = mob.yaw;
        mob.finalizeSpawn('egg');
        this.level.addEntity(mob);
        if (p.gameMode !== 'creative') p.inventory.consumeSelected(1);
        p.swing();
      }
      return;
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
    let st = placementState(block, {
      world, x, y, z, face: replaceClicked ? 1 : h.face, hitY: h.hy - h.y, hitX: h.hx - x, hitZ: h.hz - z, yaw: p.yaw, pitch: p.pitch, sneaking: p.crouching, clickedState: clicked,
    });
    if (st === null) return false;
    if (!canSurvive(world, x, y, z, st)) return false;
    // neighbour-dependent state at placement (vanilla getStateForPlacement connections)
    if (hasShapeUpdates(st) && !block.name.endsWith('_door') && !block.name.endsWith('_bed')) {
      const u = updateShape(world, x, y, z, st);
      if (u) st = u;
    }
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
    // double-height plants and doors need the block above
    if (block.propIndex('half') >= 0 && block.s.props?.some((pp) => pp.values.includes('upper'))) {
      const above = world.getState(x, y + 1, z);
      if (y + 1 >= 320 || !canReplace(above, block)) return false;
      this.level.setBlock(x, y + 1, z, block.with(st, 'half', 'upper'), false);
      return this.commitPlace(x, y, z, block.with(st, 'half', 'lower'), stack, block.sound);
    }
    // beds: foot here, head one block further in the facing direction (vanilla BedItem)
    if (block.name.endsWith('_bed')) {
      const d: Record<string, [number, number]> = { north: [0, -1], south: [0, 1], west: [-1, 0], east: [1, 0] };
      const [dx, dz] = d[block.get<string>(st, 'facing')];
      const hx = x + dx, hz = z + dz;
      const headTarget = world.getState(hx, y, hz);
      if (!canReplace(headTarget, block) || !(FACE_OCC[world.getState(hx, y - 1, hz)] & 2)) return false;
      const bb = new AABB(hx, y, hz, hx + 1, y + 0.5625, hz + 1);
      if (bb.intersects(p.bb)) return false;
      this.level.setBlock(hx, y, hz, block.with(st, 'part', 'head'), false);
      return this.commitPlace(x, y, z, block.with(st, 'part', 'foot'), stack, block.sound);
    }
    return this.commitPlace(x, y, z, st, stack, block.sound);
  }

  /** right-click actions on blocks (vanilla useWithoutItem / item useOn); true if handled */
  private useOnBlock(h: BlockHit, stack: ItemStack | null): boolean {
    const p = this.player;
    const lvl = this.level;
    const st = lvl.getState(h.x, h.y, h.z);
    const b = BLOCKS[STATE_BLOCK[st]];
    const n = b.name;
    const sneakingWithItem = p.crouching && !!stack;
    // doors, trapdoors, fence gates toggle by hand (iron ones need redstone)
    if (!sneakingWithItem && (n.endsWith('_door') || n.endsWith('_trapdoor') || n.endsWith('_fence_gate')) && !n.startsWith('iron_')) {
      let ns = b.with(st, 'open', !b.get(st, 'open'));
      if (n.endsWith('_fence_gate') && !b.get(st, 'open')) {
        // vanilla FenceGateBlock.useWithoutItem: swings away from the player
        const f = DIR_NAMES[dirFromYaw(p.yaw)];
        const opp: Record<string, string> = { north: 'south', south: 'north', east: 'west', west: 'east' };
        if (b.get(st, 'facing') === opp[f]) ns = b.with(ns, 'facing', f);
      }
      lvl.setBlock(h.x, h.y, h.z, ns);
      const open = b.get(ns, 'open');
      const kind = n.endsWith('_door') ? 'wooden_door' : n.endsWith('_trapdoor') ? 'wooden_trapdoor' : 'fence_gate';
      lvl.sound.play(`block.${kind}.${open ? 'open' : 'close'}`, h.x + 0.5, h.y + 0.5, h.z + 0.5, 1, Math.random() * 0.1 + 0.9);
      p.swing();
      return true;
    }
    if (!sneakingWithItem && n.endsWith('_bed')) {
      this.onUseBed?.(h.x, h.y, h.z);
      p.swing();
      return true;
    }
    if (!stack) return false;
    const id = stack.item.id;
    // vanilla HoeItem.useOn: grass/dirt/path → farmland (coarse dirt → dirt)
    if (stack.item.tool?.type === 'hoe' && h.face !== 0) {
      const above = lvl.getState(h.x, h.y + 1, h.z);
      if (FLAGS[above] & F_AIR && (n === 'grass_block' || n === 'dirt' || n === 'dirt_path' || n === 'coarse_dirt' || n === 'rooted_dirt')) {
        const to = n === 'coarse_dirt' ? S('dirt') : n === 'rooted_dirt' ? S('dirt') : S('farmland');
        lvl.setBlock(h.x, h.y, h.z, to);
        if (n === 'rooted_dirt') ItemEntity.drop(lvl, h.x, h.y, h.z, ItemStack.of('hanging_roots'));
        lvl.sound.play('item.hoe.till', h.x + 0.5, h.y + 0.5, h.z + 0.5, 1, 1);
        if (p.gameMode !== 'creative') this.damageHeld(1);
        p.swing();
        return true;
      }
    }
    // vanilla BoneMealItem.useOn
    if (id === 'bone_meal' && this.boneMeal(h.x, h.y, h.z, st)) {
      if (p.gameMode !== 'creative') p.inventory.consumeSelected(1);
      lvl.sound.play('item.bone_meal.use', h.x + 0.5, h.y + 0.5, h.z + 0.5, 1, 1);
      this.growthParticles(h.x, h.y, h.z);
      p.swing();
      return true;
    }
    // vanilla FlintAndSteelItem.useOn: light a fire on the clicked face
    if (id === 'flint_and_steel' || id === 'fire_charge') {
      const fx = h.x + DX[h.face], fy = h.y + DY[h.face], fz = h.z + DZ[h.face];
      if (canPlaceFire(lvl.world, fx, fy, fz)) {
        placeFire(lvl, fx, fy, fz, fireStateAt(lvl.world, fx, fy, fz));
        if (id === 'flint_and_steel') {
          lvl.sound.play('item.flintandsteel.use', fx + 0.5, fy + 0.5, fz + 0.5, 1, Math.random() * 0.4 + 0.8);
          if (p.gameMode !== 'creative') this.damageHeld(1);
        } else {
          lvl.sound.play('item.firecharge.use', fx + 0.5, fy + 0.5, fz + 0.5, 1, (Math.random() - Math.random()) * 0.2 + 1);
          if (p.gameMode !== 'creative') p.inventory.consumeSelected(1);
        }
        p.swing();
        return true;
      }
    }
    return false;
  }

  onUseBed: ((x: number, y: number, z: number) => void) | null = null;
  /** a block was placed by the player (advancements: planted seeds) */
  onPlaced: ((name: string) => void) | null = null;
  /** food or a drink was finished */
  onConsumed: ((id: string) => void) | null = null;
  /** mining progress on the targeted block (tutorial) */
  onDestroyProgress: ((name: string, progress: number) => void) | null = null;

  /** vanilla BoneMealItem.addGrowthParticles */
  private growthParticles(x: number, y: number, z: number): void {
    const lvl = this.level;
    const st = lvl.getState(x, y, z);
    if (FLAGS[st] & F_AIR) return;
    let count = 15, spread = 0.5, height: number;
    if (FLAGS[st] & F_OPAQUE) {
      // grass and other full blocks: flowers spring up all around
      y++;
      count *= 3;
      spread = 3;
      height = 1;
    } else height = Math.max(0, ...(OUTLINE[st]?.map((b) => b[4]) ?? [1]));
    const gauss = () => Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());
    lvl.particles.spawn?.('happy_villager', x + 0.5, y + 0.5, z + 0.5, 0, 0, 0);
    for (let i = 0; i < count; i++) {
      const px = x + 0.5 - spread + Math.random() * spread * 2, py = y + Math.random() * height, pz = z + 0.5 - spread + Math.random() * spread * 2;
      if (FLAGS[lvl.getState(Math.floor(px), Math.floor(py) - 1, Math.floor(pz))] & F_AIR) continue;
      lvl.particles.spawn?.('happy_villager', px, py, pz, gauss() * 0.02, gauss() * 0.02, gauss() * 0.02);
    }
  }

  /** vanilla BonemealableBlock.performBonemeal for crops, stems, saplings and grass */
  private boneMeal(x: number, y: number, z: number, st: number): boolean {
    const lvl = this.level;
    const b = BLOCKS[STATE_BLOCK[st]];
    const n = b.name;
    if (n === 'wheat' || n === 'carrots' || n === 'potatoes' || n === 'beetroots') {
      const max = n === 'beetroots' ? 3 : 7;
      const age = b.get<number>(st, 'age');
      if (age >= max) return false;
      const grow = n === 'beetroots' ? 1 : 2 + Math.floor(Math.random() * 4);
      lvl.setBlock(x, y, z, b.with(st, 'age', Math.min(max, age + grow)));
      return true;
    }
    if (n === 'pumpkin_stem' || n === 'melon_stem') {
      const age = b.get<number>(st, 'age');
      if (age >= 7) return false;
      lvl.setBlock(x, y, z, b.with(st, 'age', Math.min(7, age + 2 + Math.floor(Math.random() * 4))));
      return true;
    }
    if (n.endsWith('_sapling')) {
      if (Math.random() < 0.45) lvl.randomTicks.advanceSapling(x, y, z, st);
      return true;
    }
    if (n === 'grass_block') {
      // scatter grass and flowers on nearby grass blocks
      for (let i = 0; i < 128; i++) {
        let px = x, py = y + 1, pz = z;
        let ok = true;
        for (let j = 0; j < i / 16; j++) {
          px += Math.floor(Math.random() * 3) - 1;
          py += Math.floor((Math.floor(Math.random() * 3) - 1) * Math.floor(Math.random() * 3) / 2);
          pz += Math.floor(Math.random() * 3) - 1;
          if (BLOCKS[STATE_BLOCK[lvl.getState(px, py - 1, pz)]].name !== 'grass_block') {
            ok = false;
            break;
          }
        }
        if (!ok || !(FLAGS[lvl.getState(px, py, pz)] & F_AIR)) continue;
        const r = Math.random();
        const plant = r < 0.8 ? 'short_grass' : r < 0.9 ? 'dandelion' : 'poppy';
        lvl.setBlock(px, py, pz, S(plant));
      }
      return true;
    }
    return false;
  }

  private commitPlace(x: number, y: number, z: number, st: number, stack: ItemStack, sound: string): boolean {
    const p = this.player;
    this.level.setBlock(x, y, z, st);
    this.onPlaced?.(BLOCKS[STATE_BLOCK[st]].name);
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
    const it = stack.item;
    // food / drinks (vanilla Item.use → startUsingItem when edible)
    if (it.food) {
      if (p.gameMode === 'creative' || it.food.alwaysEat || p.food.needsFood()) p.startUsingItem(stack, it.food.fast ? 16 : 32);
      return;
    }
    if (it.id === 'milk_bucket') {
      p.startUsingItem(stack, 32);
      return;
    }
    // vanilla EggItem / SnowballItem / EnderpearlItem.use
    if (it.id === 'egg' || it.id === 'snowball' || it.id === 'ender_pearl') {
      if (it.id === 'ender_pearl' && p.cooldowns.get('ender_pearl')) return;
      const t = new ThrownItem(this.level, it.id as ThrownKind, p);
      t.shootFromRotation(p, p.pitch, p.yaw, 0, 1.5, 1);
      this.level.addEntity(t);
      this.level.sound.play('entity.arrow.shoot', p.x, p.y, p.z, 0.5, 0.4 / (Math.random() * 0.4 + 0.8));
      if (it.id === 'ender_pearl') p.cooldowns.set('ender_pearl', 20);
      if (p.gameMode !== 'creative') p.inventory.consumeSelected(1);
      p.swing();
      return;
    }
    // vanilla BowItem.use: needs arrows unless creative
    if (it.id === 'bow') {
      if (p.gameMode === 'creative' || p.inventory.findSlot((s) => s.item.id === 'arrow') >= 0) p.startUsingItem(stack, 72000);
      return;
    }
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

  /** vanilla LivingEntity.updatingUsingItem (called every tick) */
  tickUsingItem(): void {
    const p = this.player;
    const u = p.useItem;
    if (!u) return;
    if (p.inventory.selectedItem !== u || p.health <= 0) {
      p.stopUsingItem();
      return;
    }
    p.usingItemTicks = p.ticksUsingItem() + 1;
    const edible = !!u.item.food || u.item.id === 'milk_bucket';
    if (edible) {
      const used = p.useDuration - p.useItemRemaining;
      if (used > Math.floor(p.useDuration * 0.21875) && p.useItemRemaining % 4 === 0) this.itemUseEffects(u);
    }
    if (--p.useItemRemaining === 0) this.completeUsingItem();
  }

  private itemUseEffects(s: ItemStack): void {
    const p = this.player;
    if (s.item.id === 'milk_bucket') this.level.sound.play('entity.generic.drink', p.x, p.y, p.z, 0.5, Math.random() * 0.1 + 0.9);
    else this.level.sound.play('entity.generic.eat', p.x, p.y, p.z, 0.5 + 0.5 * Math.floor(Math.random() * 2), (Math.random() - Math.random()) * 0.2 + 1);
  }

  /** vanilla completeUsingItem → Item.finishUsingItem */
  private completeUsingItem(): void {
    const p = this.player;
    const s = p.useItem!;
    p.stopUsingItem();
    const it = s.item;
    if (it.food || it.id === 'milk_bucket') this.onConsumed?.(it.id);
    if (it.food) {
      this.itemUseEffects(s);
      p.food.eat(it.food.nutrition, it.food.saturation);
      this.level.sound.play('entity.player.burp', p.x, p.y, p.z, 0.5, Math.random() * 0.1 + 0.9);
      if (p.gameMode !== 'creative') {
        p.inventory.consumeSelected(1);
        const rem = it.food.remainder;
        if (rem) {
          const r = ItemStack.of(rem);
          if (!p.inventory.selectedItem) p.inventory.setSelectedItem(r);
          else if (p.inventory.add(r) > 0) p.dropItem(r, false);
        }
      }
      p.inventory.version++;
    } else if (it.id === 'milk_bucket') {
      if (p.gameMode !== 'creative') p.inventory.setSelectedItem(ItemStack.of('bucket'));
    }
  }

  /** vanilla releaseUsingItem → BowItem.releaseUsing */
  releaseUsingItem(): void {
    const p = this.player;
    const s = p.useItem;
    const used = p.ticksUsingItem();
    p.stopUsingItem();
    if (!s || s.item.id !== 'bow') return;
    const creative = p.gameMode === 'creative';
    const slot = p.inventory.findSlot((x) => x.item.id === 'arrow');
    if (slot < 0 && !creative) return;
    const f = bowPower(used);
    if (f < 0.1) return;
    if (!creative && slot >= 0) {
      const a = p.inventory.main[slot]!;
      a.count--;
      if (a.count <= 0) p.inventory.main[slot] = null;
      p.inventory.version++;
    }
    const arrow = new Arrow(this.level, p);
    arrow.pickup = creative ? 'creative_only' : 'allowed';
    arrow.shootFromRotation(p, p.pitch, p.yaw, 0, f * 3, 1);
    arrow.crit = f === 1;
    this.level.addEntity(arrow);
    if (!creative) this.damageHeld(1);
    this.level.sound.play('entity.arrow.shoot', p.x, p.y, p.z, 1, 1 / (Math.random() * 0.4 + 1.2) + f * 0.5);
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
    const out = s.copyWithCount(n);
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
