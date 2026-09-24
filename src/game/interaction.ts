// Mining / placing / picking — vanilla MultiPlayerGameMode + Minecraft.handleKeybinds timing.

import type { Level } from './level';
import type { Player } from '../entity/player';
import { raycast, BlockHit } from './raycast';
import { destroyProgress, placementState, canReplace, canSurvive, isCorrectTool, blockExperience, hasVacantFace } from './blockRules';
import { behaviorOf } from './blockBehavior';
import { lightCampfire, dowseCampfire } from './villageBlocks';
import { openSound } from './redstone/components';
import { BLOCKS, BLOCK_BY_NAME, STATE_BLOCK, FLAGS, F_AIR, F_WATER, F_LAVA, F_OPAQUE, F_REPLACEABLE, COLLISION, FACE_OCC, OUTLINE, getBlock, S } from '../world/block';
import { growHugeFungus, nyliumBoneMeal } from '../world/gen/netherFeatures';
import type { BlockAccess } from '../world/gen/patches';
import { updateShape, hasShapeUpdates } from './shapeUpdates';
import { DX, DY, DZ, DIR_NAMES, dirFromYaw } from '../world/dir';
import { blockForItem, itemForBlock, ItemStack, getItem, cloneTag } from '../item/item';
import { AABB } from '../core/aabb';
import { ItemEntity } from '../entity/itemEntity';
import { FLUID_WATER } from '../world/fluids';
import type { Entity } from '../entity/entity';
import { LivingEntity } from '../entity/living';
import { Animal } from '../entity/animals';
import { Creeper, bowPower } from '../entity/monsters';
import { Piglin, GUARDED_BY_PIGLINS } from '../entity/piglin';
import { Arrow } from '../entity/arrow';
import { PrimedTnt } from '../entity/tnt';
import { ThrownItem, ThrownKind } from '../entity/throwable';
import { createMob } from './spawner';
import { SpawnerBlockEntity } from '../world/blockEntity';
import { patchColumns, MOSS_BONEMEAL } from '../world/gen/lush';
import { runPatchColumn } from '../world/gen/patches';
import { Rand } from '../core/rng';
import { playerAttack } from './combat';
import { canPlaceFire, fireStateAt, placeFire } from './fire';
import { Minecart, MinecartChest, createMinecart } from '../entity/minecart';
import { Boat, ChestBoat, boatItemInfo, useBoatItem } from '../entity/boat';
import { isRail, railShape, isAscending } from './rails';
import { MobEffectInstance, MOB_EFFECTS } from '../entity/effects';
import { levelOf, miningEfficiency, submergedMiningSpeed, hurtAndBreak, hasBinding } from '../item/enchantHelper';
import { armorIndex, equipSound } from '../item/equipment';
import type { Hand } from '../item/inventory';
import { isCharged, performShooting, shootingPower, PLAYER_INACCURACY, playerProjectile, useDuration, crossbowUseTick, releaseUsing as releaseCrossbow } from '../item/crossbow';


/** vanilla InteractionHand.values(): the order the hands get a go at a right click */
const HANDS: readonly Hand[] = ['main', 'off'];
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
    // vanilla ProjectileUtil.getEntityHitResult: never the vehicle you're riding
    const root = p.rootVehicle();
    for (const e of this.level.getEntities(box, (e) => e.isPickable() && e !== p && e.rootVehicle() !== root, p)) {
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
    // vanilla Minecraft.startAttack: not while rowing
    if (p.handsBusy) return;
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
      const prog = destroyProgress(h.state, held, p.eyeFluid === FLUID_WATER, p.onGround, p.digSpeedEffectFactor(), miningEfficiency(p), submergedMiningSpeed(p));
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
    this.destroyProgress += destroyProgress(st, item, p.eyeFluid === FLUID_WATER, p.onGround, p.digSpeedEffectFactor(), miningEfficiency(p), submergedMiningSpeed(p));
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
    // vanilla Block.playerWillDestroy: breaking what piglins guard angers every one about, seen or not
    if (GUARDED_BY_PIGLINS.has(b.name)) Piglin.angerNearbyPiglins(p, false);
    // vanilla BaseFireBlock.playerWillDestroy: punching out fire fizzes
    if (b.name === 'fire') this.level.sound.play('block.fire.extinguish', x + 0.5, y + 0.5, z + 0.5, 0.5, 2.6 + (Math.random() - Math.random()) * 0.8);
    const silk = levelOf(held, 'silk_touch') > 0;
    this.level.destroyBlock(x, y, z, survival, held?.item ?? null, true, held);
    if (survival && this.level.gameRules.doTileDrops) {
      const xp = blockExperience(st, held?.item ?? null, this.level.random, silk);
      if (xp > 0) this.level.awardExperience(x + 0.5, y + 0.5, z + 0.5, xp);
    }
    // vanilla IceBlock.playerDestroy: without silk touch (#prevents_ice_melting) ice over something solid or liquid melts
    // (in an ultrawarm dimension it just goes)
    if (survival && b.name === 'ice' && !silk && !this.level.world.dim.ultraWarm) {
      const below = this.level.world.getState(x, y - 1, z);
      if (COLLISION[below]?.length || FLAGS[below] & (F_WATER | F_LAVA)) this.level.setBlock(x, y, z, S('water'));
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

  /** vanilla ItemStack.hurtAndBreak on the held item (unbreaking may cancel each point) */
  damageHeld(n: number): void {
    const p = this.player;
    const s = p.inventory.selectedItem;
    if (!s || !s.item.maxDamage) return;
    if (hurtAndBreak(s, n)) {
      p.inventory.setSelectedItem(null);
      this.level.sound.play('entity.item.break', p.x, p.y, p.z, 0.8, 0.8 + Math.random() * 0.4);
    }
    p.inventory.version++;
  }

  /** Use button pressed or held (vanilla repeats every 4 ticks). */
  onOpenContainer: ((kind: string, x: number, y: number, z: number) => void) | null = null;
  /** the player used an item on an entity, and something came of it (vanilla player_interacted_with_entity) */
  onInteractedWithEntity: ((stack: ItemStack | null, e: Entity) => void) | null = null;

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
    // vanilla Minecraft.startUseItem: not while rowing
    if (p.handsBusy) return;
    // the main hand has its go, then the offhand, until one of them does something (or fails outright)
    for (const hand of HANDS) {
      const stack = p.inventory.inHand(hand), count = stack?.count ?? 0;
      const r = p.inventory.withHand(hand, () => this.useHand(hand));
      if (r === 'pass') continue;
      // vanilla: the hand dips after an item's own use, or after using it on a block when that used some up (any, in creative)
      if (r === 'success' && (this.usedOn === 'item' || (this.usedOn === 'block' && stack && stack.count > 0 && (stack.count !== count || p.gameMode === 'creative')))) this.onItemUsed?.(hand);
      return;
    }
  }

  /** what the last hand's use went to (vanilla startUseItem's hit result cases) */
  private usedOn: 'entity' | 'block' | 'item' = 'item';

  /**
   * vanilla startUseItem for one hand: its item on the entity looked at, or the block (what the block does by
   * itself only on the main hand's turn), else the item's own use. Inside, selectedItem and consumeSelected mean
   * this hand's stack (Inventory.activeHand)
   */
  private useHand(hand: Hand): 'success' | 'pass' | 'fail' {
    const p = this.player;
    const main = hand === 'main';
    const stack = p.inventory.selectedItem;
    this.usedOn = 'entity';
    // entity interaction (vanilla Player.interactOn → Mob.mobInteract)
    const e = this.entityHit;
    if (e && p.gameMode !== 'spectator') {
      if (e instanceof Animal && e.interact(p, stack)) {
        if (p.vehicle === e) this.onMounted?.();
        p.swing();
        return 'success';
      }
      if (e instanceof Creeper && e.interact(p, stack)) {
        p.swing();
        return 'success';
      }
      // vanilla PiglinAi.mobInteract: a gold ingot for a grown piglin to admire
      if (e instanceof Piglin) {
        const before = stack?.copy() ?? null;
        if (e.interact(p, stack)) {
          this.onInteractedWithEntity?.(before, e);
          p.swing();
          return 'success';
        }
      }
      // vanilla Minecart.interact (climb in) / MinecartChest.interact (ContainerEntity.interactWithContainerVehicle)
      if (e instanceof Minecart && e.interact(p)) {
        this.onMounted?.();
        p.swing();
        return 'success';
      }
      if (e instanceof MinecartChest) {
        this.onOpenEntityContainer?.(e);
        // vanilla ContainerEntity.interactWithContainerVehicle
        Piglin.angerNearbyPiglins(p, true);
        p.swing();
        return 'success';
      }
      // vanilla Boat.interact (climb in) / ChestBoat.interact (sneaking or a full seat opens the chest)
      if (e instanceof Boat) {
        const r = e.interact(p);
        if (r === 'mounted') this.onMounted?.();
        else if (r === 'container' && e instanceof ChestBoat) {
          this.onOpenEntityContainer?.(e);
          Piglin.angerNearbyPiglins(p, true);
        }
        if (r) {
          p.swing();
          return 'success';
        }
      }
      if (stack && stack.item.id.endsWith('_spawn_egg') && e instanceof Animal && e.type === stack.item.id.slice(0, -10)) {
        // spawn egg on a matching animal spawns a baby
        const baby = e.makeBaby();
        baby.setAge(-24000);
        baby.moveTo(e.x, e.y, e.z, 0, 0);
        this.level.addEntity(baby);
        if (p.gameMode !== 'creative') p.inventory.consumeSelected(1);
        p.swing();
        return 'success';
      }
    }
    const h = this.hit;
    this.usedOn = 'block';
    // vanilla ServerPlayerGameMode.useItemOn: sneaking with something in either hand, the block does nothing itself
    const secondary = p.crouching && !!(p.inventory.inHand('main') || p.inventory.inHand('off'));
    // blocks with a menu (vanilla Block.useWithoutItem: only on the main hand's turn)
    if (main && h && !secondary && p.gameMode !== 'spectator') {
      const name = BLOCKS[STATE_BLOCK[this.level.getState(h.x, h.y, h.z)]].name;
      if ((name === 'crafting_table' || name === 'furnace' || name === 'chest' || name === 'enchanting_table' || name === 'grindstone' || name.endsWith('anvil') || name === 'barrel' || name === 'smoker' || name === 'blast_furnace') && this.onOpenContainer) {
        this.onOpenContainer(name, h.x, h.y, h.z);
        // vanilla ChestBlock / BarrelBlock.useWithoutItem: piglins who see a chest or barrel opened take it badly
        if (name === 'chest' || name === 'barrel') Piglin.angerNearbyPiglins(p, true);
        p.swing();
        return 'success';
      }
    }
    if (h && p.gameMode !== 'spectator' && this.useOnBlock(h, stack, main, secondary)) return 'success';
    // vanilla TntBlock.useItemOn: flint and steel / fire charge primes TNT
    if (h && stack && (stack.item.id === 'flint_and_steel' || stack.item.id === 'fire_charge') && this.level.getBlockName(h.x, h.y, h.z) === 'tnt') {
      this.level.setBlock(h.x, h.y, h.z, 0);
      PrimedTnt.prime(this.level, h.x, h.y, h.z, p);
      if (stack.item.id === 'flint_and_steel') {
        this.level.sound.play('item.flintandsteel.use', h.x + 0.5, h.y + 0.5, h.z + 0.5, 1, Math.random() * 0.4 + 0.8);
        if (p.gameMode !== 'creative') this.damageHeld(1);
      } else if (p.gameMode !== 'creative') p.inventory.consumeSelected(1);
      p.swing();
      return 'success';
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
        return 'success';
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
      return 'success';
    }
    if (h && stack) {
      if (this.placeBlock(h, stack)) {
        p.swing();
        return 'success';
      }
      // vanilla BlockItem.place: a block that can't go there fails the click, and the other hand gets no turn
      if (blockForItem(stack.item)) return 'fail';
    }
    this.usedOn = 'item';
    return stack && this.useItem(stack) ? 'success' : 'pass';
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
    // vanilla BucketItem.emptyContents: a block that holds water (a campfire) takes it in where it stands
    if (stack.item.id === 'water_bucket' && !world.dim.ultraWarm && behaviorOf(clicked)?.placeLiquid?.(this.level, x, y, z, clicked)) {
      this.level.sound.play('item.bucket.empty', x + 0.5, y + 0.5, z + 0.5, 1, 1);
      if (p.gameMode !== 'creative') p.inventory.setSelectedItem(ItemStack.of('bucket'));
      return true;
    }
    const clickedBlock = BLOCKS[STATE_BLOCK[clicked]];
    const replaceClicked =
      (FLAGS[clicked] & F_REPLACEABLE && clickedBlock !== block && !(clickedBlock.name === 'water' && block.name !== 'water')) ||
      (clickedBlock === block && block.name === 'glow_lichen' && hasVacantFace(clicked));
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
    if (y < world.dim.minY || y >= world.dim.maxY) return false;
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
      world, x, y, z, face: replaceClicked ? 1 : h.face, hitY: h.hy - h.y, hitX: h.hx - x, hitZ: h.hz - z, yaw: p.yaw, pitch: p.pitch, sneaking: p.crouching, clickedState: clicked, replaceClicked: !!replaceClicked,
    });
    if (st === null) return false;
    if (!canSurvive(world, x, y, z, st, true)) return false;
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
      // (vanilla DoublePlantBlock.setPlacedBy: the top half is waterlogged by what is up there)
      let upper = block.with(st, 'half', 'upper');
      if (block.propIndex('waterlogged') >= 0) upper = block.with(upper, 'waterlogged', BLOCKS[STATE_BLOCK[above]].name === 'water' && BLOCKS[STATE_BLOCK[above]].get(above, 'level') === 0);
      this.level.setBlock(x, y + 1, z, upper, false);
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
  private useOnBlock(h: BlockHit, stack: ItemStack | null, main: boolean, secondary: boolean): boolean {
    const p = this.player;
    const lvl = this.level;
    const st = lvl.getState(h.x, h.y, h.z);
    const b = BLOCKS[STATE_BLOCK[st]];
    const n = b.name;
    // (what the block does by itself, vanilla useWithoutItem: the main hand's turn, not sneaking with an item)
    const sneakingWithItem = secondary || !main;
    const ctx = { player: p, face: h.face, hx: h.hx, hy: h.hy, hz: h.hz, hand: (main ? 'main' : 'off') as Hand };
    // vanilla useItemOn: the held item on the block first, either hand (cauldrons, composters, lecterns, flower pots)
    const useOn = behaviorOf(st)?.useItemOn;
    let skipOwn = false;
    if (!secondary && stack && useOn) {
      const r = useOn(lvl, h.x, h.y, h.z, st, stack, ctx);
      if (r === 'success') {
        p.swing();
        return true;
      }
      if (r === 'consume') return true;
      skipOwn = r === 'skip';
    }
    // levers and buttons
    const own = behaviorOf(st)?.use;
    const used = !sneakingWithItem && !skipOwn && own ? own(lvl, h.x, h.y, h.z, st, ctx) : false;
    if (used) {
      if (used !== 'consume') p.swing();
      return true;
    }
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
      lvl.sound.play(openSound(n, b.get(ns, 'open') as boolean), h.x + 0.5, h.y + 0.5, h.z + 0.5, 1, Math.random() * 0.1 + 0.9);
      p.swing();
      return true;
    }
    if (!sneakingWithItem && n.endsWith('_bed')) {
      this.onUseBed?.(h.x, h.y, h.z);
      p.swing();
      return true;
    }
    // vanilla CaveVines.use: pick the glow berry
    if (!sneakingWithItem && (n === 'cave_vines' || n === 'cave_vines_plant') && b.get(st, 'berries')) {
      ItemEntity.drop(lvl, h.x, h.y, h.z, ItemStack.of('glow_berries'));
      lvl.sound.play('block.cave_vines.pick_berries', h.x + 0.5, h.y + 0.5, h.z + 0.5, 1, 0.8 + Math.random() * 0.4);
      lvl.setBlock(h.x, h.y, h.z, b.with(st, 'berries', false));
      p.swing();
      return true;
    }
    // vanilla SweetBerryBushBlock.useWithoutItem: pick a grown bush (bone meal grows one that isn't ripe instead)
    if (!sneakingWithItem && n === 'sweet_berry_bush' && b.get<number>(st, 'age') > 1 && !(stack?.item.id === 'bone_meal' && b.get<number>(st, 'age') < 3)) {
      const age = b.get<number>(st, 'age');
      ItemEntity.drop(lvl, h.x, h.y, h.z, ItemStack.of('sweet_berries', 1 + Math.floor(Math.random() * 2) + (age === 3 ? 1 : 0)));
      lvl.sound.play('block.sweet_berry_bush.pick_berries', h.x + 0.5, h.y + 0.5, h.z + 0.5, 1, 0.8 + Math.random() * 0.4);
      lvl.setBlock(h.x, h.y, h.z, b.with(st, 'age', 1));
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
    // vanilla AxeItem.useOn: strip a log, wood, stem or hyphae block, keeping its axis
    if (stack.item.tool?.type === 'axe' && /^(?!stripped_).+_(log|wood|stem|hyphae)$/.test(n) && BLOCK_BY_NAME.has('stripped_' + n)) {
      lvl.setBlock(h.x, h.y, h.z, S('stripped_' + n, { axis: b.get(st, 'axis') }));
      lvl.sound.play('item.axe.strip', h.x + 0.5, h.y + 0.5, h.z + 0.5, 1, 1);
      if (p.gameMode !== 'creative') this.damageHeld(1);
      p.swing();
      return true;
    }
    // vanilla BoneMealItem.useOn
    if (id === 'bone_meal' && this.boneMeal(h.x, h.y, h.z, st)) {
      if (p.gameMode !== 'creative') p.inventory.consumeSelected(1);
      lvl.sound.play('item.bone_meal.use', h.x + 0.5, h.y + 0.5, h.z + 0.5, 1, 1);
      this.growthParticles(h.x, h.y, h.z);
      p.swing();
      return true;
    }
    // vanilla MinecartItem.useOn: a cart on the clicked rail (half a block up on a slope)
    if ((id === 'minecart' || id === 'chest_minecart') && isRail(st)) {
      const cart = createMinecart(id, lvl)!;
      cart.moveTo(h.x + 0.5, h.y + 0.0625 + (isAscending(railShape(st)) ? 0.5 : 0), h.z + 0.5, 0, 0);
      lvl.addEntity(cart);
      if (p.gameMode !== 'creative') p.inventory.consumeSelected(1);
      p.swing();
      return true;
    }
    // vanilla ShovelItem.useOn: a shovel puts out a lit campfire (not from underneath)
    if (stack.item.tool?.type === 'shovel' && h.face !== 0 && dowseCampfire(lvl, h.x, h.y, h.z)) {
      if (p.gameMode !== 'creative') this.damageHeld(1);
      p.swing();
      return true;
    }
    // vanilla FlintAndSteelItem.useOn: light a campfire that is out, else a fire on the clicked face
    if (id === 'flint_and_steel' || id === 'fire_charge') {
      const lit = lightCampfire(lvl, h.x, h.y, h.z);
      const fx = lit ? h.x : h.x + DX[h.face], fy = lit ? h.y : h.y + DY[h.face], fz = lit ? h.z : h.z + DZ[h.face];
      if (lit || canPlaceFire(lvl.world, fx, fy, fz, DIR_NAMES[dirFromYaw(p.yaw)])) {
        if (!lit) placeFire(lvl, fx, fy, fz, fireStateAt(lvl.world, fx, fy, fz));
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
  /** the player climbed into a vehicle (vanilla "mount.onboard" hint) */
  onMounted: (() => void) | null = null;
  /** right-clicked a container entity (a chest minecart or chest boat) */
  onOpenEntityContainer: ((e: MinecartChest | ChestBoat) => void) | null = null;
  /** a block was placed by the player (advancements: planted seeds) */
  onPlaced: ((name: string) => void) | null = null;
  /** an item the player holds wore down (vanilla item_durability_changed), with what they ride */
  onItemDurability: ((item: string, vehicle: string | null) => void) | null = null;
  /** food or a drink was finished */
  onConsumed: ((id: string) => void) | null = null;
  /** the player fired a crossbow (vanilla shot_crossbow) */
  onShotCrossbow: (() => void) | null = null;
  /** an item use went through (vanilla ItemInHandRenderer.itemUsed: the item in that hand dips and comes back up) */
  onItemUsed: ((hand: Hand) => void) | null = null;
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
    // vanilla AzaleaBlock: grows into an azalea tree 45% of the time, if nothing wet is above it
    if (n === 'azalea' || n === 'flowering_azalea') {
      if (FLAGS[lvl.getState(x, y + 1, z)] & F_WATER) return false;
      if (Math.random() < 0.45) lvl.randomTicks.growAzalea(x, y, z, st);
      return true;
    }
    // vanilla CaveVines.performBonemeal: a glow berry
    if (n === 'cave_vines' || n === 'cave_vines_plant') {
      if (b.get(st, 'berries')) return false;
      lvl.setBlock(x, y, z, b.with(st, 'berries', true));
      return true;
    }
    // vanilla MossBlock.performBonemeal: a small moss patch with plants spreads round it (moss_patch_bonemeal)
    if (n === 'moss_block') {
      if (!(FLAGS[lvl.getState(x, y + 1, z)] & F_AIR)) return false;
      const r = new Rand((Math.random() * 2 ** 31) | 0);
      for (const c of patchColumns(r, MOSS_BONEMEAL, x, y + 1, z)) runPatchColumn(lvl.world.access, c);
      return true;
    }
    // vanilla RootedDirtBlock.performBonemeal: hanging roots under it
    if (n === 'rooted_dirt') {
      if (!(FLAGS[lvl.getState(x, y - 1, z)] & F_AIR)) return false;
      lvl.setBlock(x, y - 1, z, S('hanging_roots'));
      return true;
    }
    // vanilla BigDripleafBlock / BigDripleafStemBlock.performBonemeal: the leaf rises a block on a longer stem
    if (n === 'big_dripleaf' || n === 'big_dripleaf_stem') {
      let ty = y;
      while (BLOCKS[STATE_BLOCK[lvl.getState(x, ty, z)]].name === 'big_dripleaf_stem') ty++;
      const top = lvl.getState(x, ty, z);
      if (BLOCKS[STATE_BLOCK[top]].name !== 'big_dripleaf') return false;
      const above = lvl.getState(x, ty + 1, z);
      if (ty + 1 >= 320 || !(FLAGS[above] & F_AIR || BLOCKS[STATE_BLOCK[above]].name === 'water')) return false;
      const facing = BLOCKS[STATE_BLOCK[top]].get(top, 'facing');
      const water = (st: number) => BLOCKS[STATE_BLOCK[st]].name === 'water' && BLOCKS[STATE_BLOCK[st]].get(st, 'level') === 0 || !!(FLAGS[st] & F_WATER && BLOCKS[STATE_BLOCK[st]].propIndex('waterlogged') >= 0 && BLOCKS[STATE_BLOCK[st]].get(st, 'waterlogged'));
      lvl.setBlock(x, ty + 1, z, getBlock('big_dripleaf').state({ facing, waterlogged: water(above) }), false);
      lvl.setBlock(x, ty, z, getBlock('big_dripleaf_stem').state({ facing, waterlogged: water(top) }));
      return true;
    }
    // vanilla SmallDripleafBlock.performBonemeal: it grows into a big dripleaf 2 to 5 blocks tall
    if (n === 'small_dripleaf') {
      const by = b.get(st, 'half') === 'upper' ? y - 1 : y;
      const lower = lvl.getState(x, by, z);
      const facing = b.get(lower, 'facing');
      const upperState = lvl.getState(x, by + 1, z);
      lvl.setBlock(x, by + 1, z, b.get(upperState, 'waterlogged') ? S('water') : 0, false);
      const want = 2 + Math.floor(Math.random() * 4);
      let fit = 0;
      for (; fit < want && by + fit < 320; fit++) {
        const t = lvl.getState(x, by + fit, z);
        const tn = BLOCKS[STATE_BLOCK[t]].name;
        if (!(FLAGS[t] & F_AIR || tn === 'water' || tn === 'small_dripleaf')) break;
      }
      const inWater = (yy: number) => {
        const t = lvl.getState(x, yy, z);
        return BLOCKS[STATE_BLOCK[t]].name === 'water' || !!(BLOCKS[STATE_BLOCK[t]].propIndex('waterlogged') >= 0 && BLOCKS[STATE_BLOCK[t]].get(t, 'waterlogged'));
      };
      for (let yy = by; yy < by + fit - 1; yy++) lvl.setBlock(x, yy, z, getBlock('big_dripleaf_stem').state({ facing, waterlogged: inWater(yy) }), false);
      lvl.setBlock(x, by + Math.max(0, fit - 1), z, getBlock('big_dripleaf').state({ facing, waterlogged: inWater(by + Math.max(0, fit - 1)) }));
      return true;
    }
    // the nether: nylium sprouts its undergrowth, netherrack next to nylium turns into it, a fungus on its nylium may
    // grow huge, and vines grow on a few blocks
    if (n === 'crimson_nylium' || n === 'warped_nylium') {
      if (!(FLAGS[lvl.getState(x, y + 1, z)] & F_AIR)) return false;
      nyliumBoneMeal(this.liveAccess(), x, y, z, n === 'crimson_nylium', (Math.random() * 0x100000000) >>> 0);
      return true;
    }
    if (n === 'netherrack') {
      let crimson = false, warped = false;
      for (let dx = -1; dx <= 1; dx++)
        for (let dy = -1; dy <= 1; dy++)
          for (let dz = -1; dz <= 1; dz++) {
            const nn = BLOCKS[STATE_BLOCK[lvl.getState(x + dx, y + dy, z + dz)]].name;
            if (nn === 'crimson_nylium') crimson = true;
            if (nn === 'warped_nylium') warped = true;
          }
      if (!crimson && !warped) return false;
      const above = lvl.getState(x, y + 1, z);
      if (FLAGS[above] & F_OPAQUE) return false;
      lvl.setBlock(x, y, z, S(crimson && warped ? (Math.random() < 0.5 ? 'warped_nylium' : 'crimson_nylium') : warped ? 'warped_nylium' : 'crimson_nylium'));
      return true;
    }
    if (n === 'crimson_fungus' || n === 'warped_fungus') {
      const crimson = n === 'crimson_fungus';
      if (BLOCKS[STATE_BLOCK[lvl.getState(x, y - 1, z)]].name !== (crimson ? 'crimson_nylium' : 'warped_nylium')) return false;
      if (Math.random() < 0.4) growHugeFungus(this.liveAccess(), x, y, z, crimson, (Math.random() * 0x100000000) >>> 0);
      return true;
    }
    if (/^(weeping|twisting)_vines(_plant)?$/.test(n)) {
      // (on a piece of the plant, the head at its end grows)
      const head = n.replace('_plant', ''), dy = head === 'weeping_vines' ? -1 : 1;
      let hy = y;
      while (BLOCKS[STATE_BLOCK[lvl.getState(x, hy, z)]].name === head + '_plant') hy += dy;
      const hs = lvl.getState(x, hy, z);
      const hb = BLOCKS[STATE_BLOCK[hs]];
      if (hb.name !== head || !(FLAGS[lvl.getState(x, hy + dy, z)] & F_AIR)) return false;
      // vanilla NetherVines.getBlocksToGrowWhenBonemealed
      let count = 0;
      for (let p = 1; Math.random() < p; p *= 0.826) count++;
      let age = Math.min(hb.get<number>(hs, 'age') + 1, 25);
      for (let k = 0, ny = hy + dy; k < count && FLAGS[lvl.getState(x, ny, z)] & F_AIR; k++, ny += dy) {
        lvl.setBlock(x, ny, z, hb.with(hs, 'age', age));
        age = Math.min(age + 1, 25);
      }
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

  /** the level as a feature sees it (for what bone meal grows) */
  private liveAccess(): BlockAccess {
    const lvl = this.level;
    return { get: (x, y, z) => lvl.getState(x, y, z), set: (x, y, z, st) => lvl.setBlock(x, y, z, st) };
  }

  private commitPlace(x: number, y: number, z: number, st: number, stack: ItemStack, sound: string): boolean {
    const p = this.player;
    if (stack.item.id === 'water_bucket' && this.level.world.dim.ultraWarm) {
      // vanilla BucketItem.emptyContents: in the Nether the water boils away with a hiss
      const r = Math.random;
      this.level.sound.play('block.fire.extinguish', x + 0.5, y + 0.5, z + 0.5, 0.5, 2.6 + (r() - r()) * 0.8);
      for (let i = 0; i < 8; i++) this.level.particles.spawn?.('large_smoke', x + r(), y + r(), z + r(), 0, 0, 0);
      if (p.gameMode !== 'creative') p.inventory.setSelectedItem(ItemStack.of('bucket'));
      return true;
    }
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

  /** vanilla Item.use for the hand in use; false when nothing came of it (the other hand may try) */
  private useItem(stack: ItemStack): boolean {
    const p = this.player;
    const it = stack.item;
    // food / drinks (vanilla Item.use → startUsingItem when edible)
    if (it.food) {
      if (!(p.gameMode === 'creative' || it.food.alwaysEat || p.food.needsFood())) return false;
      p.startUsingItem(stack, it.food.fast ? 16 : 32);
      return true;
    }
    if (it.id === 'milk_bucket') {
      p.startUsingItem(stack, 32);
      return true;
    }
    // vanilla EggItem / SnowballItem / EnderpearlItem.use
    if (it.id === 'egg' || it.id === 'snowball' || it.id === 'ender_pearl') {
      if (it.id === 'ender_pearl' && p.cooldowns.get('ender_pearl')) return false;
      const t = new ThrownItem(this.level, it.id as ThrownKind, p);
      t.shootFromRotation(p, p.pitch, p.yaw, 0, 1.5, 1);
      this.level.addEntity(t);
      this.level.sound.play('entity.arrow.shoot', p.x, p.y, p.z, 0.5, 0.4 / (Math.random() * 0.4 + 0.8));
      if (it.id === 'ender_pearl') p.cooldowns.set('ender_pearl', 20);
      if (p.gameMode !== 'creative') p.inventory.consumeSelected(1);
      p.swing();
      return true;
    }
    // vanilla FoodOnAStickItem.use: riding the mount it steers (the warped fungus a strider, the carrot a pig), a
    // poke sends it off faster at a point of wear (seven for the carrot); worn out, it's a fishing rod again
    if (it.id === 'warped_fungus_on_a_stick' || it.id === 'carrot_on_a_stick') {
      const fungus = it.id === 'warped_fungus_on_a_stick';
      const v = p.vehicle as (Entity & { boost?(): boolean }) | null;
      if (v && v.controllingPassenger() === p && v.type === (fungus ? 'strider' : 'pig') && v.boost?.()) {
        const before = stack.damage;
        const broke = hurtAndBreak(stack, fungus ? 1 : 7, p.gameMode === 'creative');
        if (broke || stack.damage !== before) this.onItemDurability?.(it.id, v.type);
        if (broke) {
          this.level.sound.play('entity.item.break', p.x, p.y, p.z, 0.8, 0.8 + Math.random() * 0.4);
          const rod = ItemStack.of('fishing_rod');
          rod.tag = cloneTag(stack.tag);
          p.inventory.setSelectedItem(rod);
        }
        p.inventory.version++;
        p.swing();
        return true;
      }
      return false;
    }
    // vanilla CrossbowItem.use: loaded, it fires everything charged (and the hand dips as the used stack
    // changes); empty, it starts drawing when there's something to load (offhand, inventory, or creative)
    if (it.id === 'crossbow') {
      if (isCharged(stack)) {
        performShooting(this.level, p, stack, shootingPower(stack), PLAYER_INACCURACY, null);
        this.onShotCrossbow?.();
      } else if (playerProjectile(p)) p.startUsingItem(stack, useDuration(stack));
      else return false;
      return true;
    }
    // vanilla ArmorItem.use → Equipable.swapWithEquipmentSlot
    if (it.armor) return this.swapWithEquipmentSlot(stack);
    // vanilla BowItem.use: needs arrows unless creative
    if (it.id === 'bow') {
      if (!(p.gameMode === 'creative' || this.arrowSource())) return false;
      p.startUsingItem(stack, 72000);
      return true;
    }
    // vanilla BoatItem.use: a boat (or chest boat) where the eye ray meets a block or any fluid
    if (boatItemInfo(it.id)) {
      if (!useBoatItem(this.level, p, it.id, this.reach())) return false;
      if (p.gameMode !== 'creative') p.inventory.consumeSelected(1);
      p.swing();
      return true;
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
        return true;
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
        return true;
      }
    }
    return false;
  }

  /**
   * vanilla Equipable.swapWithEquipmentSlot: the held piece goes on and what was worn there comes to hand (a creative
   * player puts on a copy, and keeps the held one if the slot was empty); nothing over curse of binding (but in
   * creative) or over the very same stack, and then the other hand gets its turn. Putting it on plays its equip
   * sound (LivingEntity.onEquipItem)
   */
  private swapWithEquipmentSlot(stack: ItemStack): boolean {
    const p = this.player;
    const inv = p.inventory;
    const i = armorIndex(stack.item.armor!.slot);
    const cur = inv.armor[i];
    const creative = p.gameMode === 'creative';
    if (cur && ((hasBinding(cur) && !creative) || (cur.count === stack.count && cur.sameItem(stack)))) return false;
    inv.armor[i] = creative ? stack.copy() : stack;
    if (cur) inv.setSelectedItem(cur);
    else if (!creative) inv.setSelectedItem(null);
    inv.version++;
    if (!cur?.sameItem(stack)) this.level.sound.play(equipSound(stack.item) ?? 'item.armor.equip_generic', p.x, p.y, p.z, 1, 1);
    p.swing();
    return true;
  }

  /** vanilla LivingEntity.updatingUsingItem (called every tick) */
  tickUsingItem(): void {
    const p = this.player;
    const u = p.useItem;
    if (!u) return;
    if (p.inventory.inHand(p.useHand) !== u || p.health <= 0) {
      p.stopUsingItem();
      return;
    }
    p.usingItemTicks = p.ticksUsingItem() + 1;
    const edible = !!u.item.food || u.item.id === 'milk_bucket';
    if (edible) {
      const used = p.useDuration - p.useItemRemaining;
      if (used > Math.floor(p.useDuration * 0.21875) && p.useItemRemaining % 4 === 0) this.itemUseEffects(u);
    }
    // vanilla CrossbowItem.onUseTick: the loading sounds
    if (u.item.id === 'crossbow') crossbowUseTick(this.level, p, u, p.ticksUsingItem());
    // vanilla useOnRelease (the crossbow): it only finishes when let go, the countdown runs on below zero
    if (--p.useItemRemaining === 0 && u.item.id !== 'crossbow') p.inventory.withHand(p.useHand, () => this.completeUsingItem());
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
      // vanilla LivingEntity.addEatEffect: each food effect rolls its probability
      for (const [id, ticks, amp, chance] of it.food.effects ?? []) {
        const e = MOB_EFFECTS[id];
        if (e && Math.random() < chance) p.addEffect(new MobEffectInstance(e, ticks, amp));
      }
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
      // vanilla MilkBucketItem.finishUsingItem
      p.removeAllEffects();
      if (p.gameMode !== 'creative') p.inventory.setSelectedItem(ItemStack.of('bucket'));
    }
  }

  /** vanilla releaseUsingItem → BowItem.releaseUsing / CrossbowItem.releaseUsing (in the hand that was using it) */
  releaseUsingItem(): void {
    const p = this.player;
    p.inventory.withHand(p.useHand, () => this.releaseUsing());
  }

  private releaseUsing(): void {
    const p = this.player;
    const s = p.useItem;
    const used = p.ticksUsingItem();
    p.stopUsingItem();
    if (s?.item.id === 'crossbow') {
      // fully drawn it loads from the offhand or inventory (in creative nothing is used up)
      const ammo = playerProjectile(p);
      if (releaseCrossbow(this.level, p, s, used, ammo, p.gameMode === 'creative')) {
        const inv = p.inventory;
        if (inv.offhand && inv.offhand.count <= 0) inv.offhand = null;
        for (let i = 0; i < inv.main.length; i++) if (inv.main[i] && inv.main[i]!.count <= 0) inv.main[i] = null;
        inv.version++;
      }
      return;
    }
    if (!s || s.item.id !== 'bow') return;
    const creative = p.gameMode === 'creative';
    const ammo = this.arrowSource();
    if (!ammo && !creative) return;
    const f = bowPower(used);
    if (f < 0.1) return;
    // vanilla useAmmo: creative and infinity (ammo_use 0 for plain arrows) keep the arrow, and the shot one
    // can't be picked up (INTANGIBLE_PROJECTILE)
    const free = creative || levelOf(s, 'infinity') > 0;
    if (!free && ammo) {
      ammo.count--;
      const inv = p.inventory;
      if (inv.offhand && inv.offhand.count <= 0) inv.offhand = null;
      for (let i = 0; i < inv.main.length; i++) if (inv.main[i] && inv.main[i]!.count <= 0) inv.main[i] = null;
      inv.version++;
    }
    const arrow = new Arrow(this.level, p);
    arrow.pickup = free ? 'creative_only' : 'allowed';
    // the bow's power and punch act when the arrow hits; flame (projectile_spawned) sets it alight for 100 s
    arrow.weapon = s.copy();
    if (levelOf(s, 'flame') > 0) arrow.igniteForSeconds(100);
    arrow.shootFromRotation(p, p.pitch, p.yaw, 0, f * 3, 1);
    arrow.crit = f === 1;
    this.level.addEntity(arrow);
    if (!creative) this.damageHeld(1);
    this.level.sound.play('entity.arrow.shoot', p.x, p.y, p.z, 1, 1 / (Math.random() * 0.4 + 1.2) + f * 0.5);
  }

  /** vanilla Player.getProjectile for a bow: arrows in the offhand, then the main hand, then the inventory in order */
  private arrowSource(): ItemStack | null {
    const inv = this.player.inventory;
    const isArrow = (x: ItemStack | null): x is ItemStack => !!x && x.item.id === 'arrow' && x.count > 0;
    const off = inv.inHand('off'), main = inv.inHand('main');
    if (isArrow(off)) return off;
    if (isArrow(main)) return main;
    return inv.main.find(isArrow) ?? null;
  }

  /** Middle click: pick block (creative puts it in the hotbar; there an entity gives its item, vanilla getPickResult). */
  pickBlock(): void {
    const h = this.hit;
    const p = this.player;
    const picked = this.entityHit && p.gameMode === 'creative' ? this.entityHit.pickResult() : null;
    if (!h && !picked) return;
    const b = h ? BLOCKS[STATE_BLOCK[h.state]] : null;
    const it = picked ? getItem(picked) : itemForBlock(b!.name) ?? (b!.name === 'water' ? getItem('water_bucket') : undefined);
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

  /** vanilla SWAP_ITEM_WITH_OFFHAND (F): the two hands trade what they hold, and any use stops */
  swapHands(): void {
    const p = this.player;
    if (p.gameMode === 'spectator') return;
    const inv = p.inventory;
    const off = inv.offhand;
    inv.offhand = inv.main[inv.selected];
    inv.main[inv.selected] = off;
    inv.version++;
    p.stopUsingItem();
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
    e.thrower = p;
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
