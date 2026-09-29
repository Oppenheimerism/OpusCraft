// (armour stand) vanilla ArmorStand and ArmorStandItem: a wooden stand, placed on a block turned to face the one
// placing it (to the nearest eighth of a turn), that wears armour and (shown its arms) holds things. Right-clicked with
// something it can wear or hold, it takes it (one of a stack; a copy in creative) or swaps it for what it had; with an
// empty hand, what it has where it was clicked comes off (its boots low down, its helmet at the top). Two blows in
// quick succession (within five ticks) break it, dropping it and all it has; one only makes it wobble with a knock; a
// creative player's blow breaks it at once and drops nothing; an arrow, a trident, a fireball or a wind charge breaks
// it outright and a blast breaks it leaving only its gear. It doesn't take damage otherwise: it can't be hurt or
// pushed, only set alight, which burns it down (4 health a second, 20 of it), and it falls, landing from higher than
// three blocks with a clatter.
// Entity data (/summon): Small, NoBasePlate, ShowArms, Invisible (only what it wears shows, and nothing breaks it),
// Marker (no box at all: nothing hits, clicks or moves it), NoGravity, Pose, DisabledSlots, ArmorItems and HandItems,
// Invulnerable, CustomName and CustomNameVisible, Rotation. Drawn by render/armorStandRenderer.ts.

import { LivingEntity } from './living';
import type { Entity } from './entity';
import type { Player } from './player';
import type { SavedEntity } from './mob';
import { AbstractMinecart } from './minecart';
import type { Level } from '../game/level';
import { AABB } from '../core/aabb';
import { wrapDegrees } from '../core/math';
import { ItemStack, loadStack, saveStack } from '../item/item';
import type { EquipSlot } from '../item/enchantHelper';
import { armorIndex, equipableSlot, equipmentSlotForItem, equipSound } from '../item/equipment';
import { FLAGS, F_REPLACEABLE, S } from '../world/block';
import { DOWN, UP, NORTH, SOUTH, WEST, EAST, DX, DY, DZ } from '../world/dir';
import { registerItemBehavior } from '../game/itemBehavior';
import { BOOK_BY_ID } from '../inventory/recipeBook';
import { equipEvent } from '../game/vibrations';
import { ItemEntity } from './itemEntity';

/** a pose part's turn about x, y and z, in degrees (vanilla Rotations) */
export type Rotations = [number, number, number];

/** vanilla ArmorStand.DEFAULT_*_POSE */
export const DEFAULT_POSE: Readonly<Record<'head' | 'body' | 'leftArm' | 'rightArm' | 'leftLeg' | 'rightLeg', Readonly<Rotations>>> = {
  head: [0, 0, 0],
  body: [0, 0, 0],
  leftArm: [-10, 0, -10],
  rightArm: [-15, 0, 10],
  leftLeg: [-1, 0, -1],
  rightLeg: [1, 0, 1],
};

/** the Pose compound's keys (vanilla ArmorStand.writePose / readPose) and the fields they go in */
const POSE_KEYS = [['Head', 'headPose'], ['Body', 'bodyPose'], ['LeftArm', 'leftArmPose'], ['RightArm', 'rightArmPose'], ['LeftLeg', 'leftLegPose'], ['RightLeg', 'rightLegPose']] as const;
type PoseField = (typeof POSE_KEYS)[number][1];
const POSE_DEFAULTS: Record<PoseField, Readonly<Rotations>> = {
  headPose: DEFAULT_POSE.head, bodyPose: DEFAULT_POSE.body, leftArmPose: DEFAULT_POSE.leftArm,
  rightArmPose: DEFAULT_POSE.rightArm, leftLegPose: DEFAULT_POSE.leftLeg, rightLegPose: DEFAULT_POSE.rightLeg,
};

/** vanilla EquipmentSlot.getFilterFlag: each slot's bit in DisabledSlots (+8: can't be taken, +16: can't be put) */
const FILTER_FLAG: Record<EquipSlot, number> = { mainhand: 0, feet: 1, legs: 2, chest: 3, head: 4, offhand: 5 };

// vanilla EntityType.ARMOR_STAND: sized(0.5, 1.975), eye 1.7775; BABY_DIMENSIONS half that, eye 0.9875; a marker none
const WIDTH = 0.5, HEIGHT = 1.975, EYE = 1.7775, SMALL_EYE = 0.9875;

// the damage types that do something to it (vanilla #bypasses_invulnerability, #is_explosion, #ignites_armor_stands,
// #burns_armor_stands, #can_break_armor_stand and #always_kills_armor_stands)
const BYPASSES_INVULNERABILITY = new Set(['void', 'genericKill']);
const EXPLOSION = new Set(['explosion', 'playerExplosion', 'badRespawnPoint', 'fireworks']);
const IGNITES = new Set(['inFire', 'campfire']);
const BURNS = new Set(['onFire']);
const CAN_BREAK = new Set(['player', 'playerExplosion', 'maceSmash']);
const ALWAYS_KILLS = new Set(['arrow', 'trident', 'fireball', 'witherSkull', 'windCharge']);

/** SNBT readers /summon lends (game/commands.ts's): a list's entries, an item, a CustomName */
export interface SnbtReaders {
  entries(nbt: string, key: string): string[] | null;
  stack(entry: string): ItemStack | null;
  name(nbt: string): string | null;
}

export class ArmorStand extends LivingEntity {
  readonly type = 'armor_stand';
  /** vanilla handItems */
  mainHand: ItemStack | null = null;
  offHand: ItemStack | null = null;
  /** vanilla armorItems: feet, legs, chest, head */
  readonly armorItems: (ItemStack | null)[] = [null, null, null, null];
  /** vanilla invisible (Invisible): only what it wears and holds is drawn, and nothing breaks it */
  invisible = false;
  /** vanilla DATA_CLIENT_FLAGS: CLIENT_FLAG_SMALL, _SHOW_ARMS, _NO_BASEPLATE, _MARKER */
  small = false;
  showArms = false;
  noBasePlate = false;
  marker = false;
  /** vanilla disabledSlots (DisabledSlots) */
  disabledSlots = 0;
  /** vanilla Entity.invulnerable (Invulnerable): only a creative player (or /kill, or the void) breaks it */
  invulnerable = false;
  /** vanilla headPose … rightLegPose (DATA_*_POSE), in degrees */
  headPose: Rotations = [...DEFAULT_POSE.head];
  bodyPose: Rotations = [...DEFAULT_POSE.body];
  leftArmPose: Rotations = [...DEFAULT_POSE.leftArm];
  rightArmPose: Rotations = [...DEFAULT_POSE.rightArm];
  leftLegPose: Rotations = [...DEFAULT_POSE.leftLeg];
  rightLegPose: Rotations = [...DEFAULT_POSE.rightLeg];
  /** vanilla lastHit: the game time of the last blow that only shook it (it wobbles for five ticks after) */
  lastHit = -1000;

  constructor(level: Level) {
    super(level);
    // vanilla createAttributes: STEP_HEIGHT 0
    this.stepHeight = 0;
    this.refreshDimensions();
  }

  /** vanilla getDefaultDimensions: a marker has no size, a small one's half size */
  refreshDimensions(): void {
    if (this.marker) this.setSize(0, 0);
    else if (this.small) this.setSize(WIDTH / 2, HEIGHT / 2);
    else this.setSize(WIDTH, HEIGHT);
    this.noPhysics = this.marker;
  }

  /**
   * vanilla's eye heights (a marker's is the size it would have: it stands in for ArmorStand.getLightProbePosition,
   * the light it's drawn in taken from the stand's height rather than its feet)
   */
  override get eyeHeight(): number {
    return this.small ? SMALL_EYE : EYE;
  }

  setSmall(v: boolean): void {
    this.small = v;
    this.refreshDimensions();
  }

  setMarker(v: boolean): void {
    this.marker = v;
    this.refreshDimensions();
  }

  // --- what it wears and holds ----------------------------------------------

  getItemBySlot(slot: EquipSlot): ItemStack | null {
    if (slot === 'mainhand') return this.mainHand;
    if (slot === 'offhand') return this.offHand;
    return this.armorItems[armorIndex(slot)];
  }

  hasItemInSlot(slot: EquipSlot): boolean {
    return this.getItemBySlot(slot) !== null;
  }

  /** vanilla ArmorStand.setItemSlot (→ LivingEntity.onEquipItem: the piece's equip sound, EQUIP or UNEQUIP) */
  setItemSlot(slot: EquipSlot, s: ItemStack | null): void {
    const stack = s && s.count > 0 ? s : null;
    const old = this.getItemBySlot(slot);
    if (slot === 'mainhand') this.mainHand = stack;
    else if (slot === 'offhand') this.offHand = stack;
    else this.armorItems[armorIndex(slot)] = stack;
    equipEvent(this, old, stack);
    if (!stack || (old && old.sameItem(stack)) || this.tickCount === 0 || equipableSlot(stack.item) !== slot) return;
    const snd = equipSound(stack.item);
    if (snd) this.playSound(snd, 1, 1);
  }

  /** vanilla isDisabled: its bit in DisabledSlots, or a hand without its arms shown */
  isDisabled(slot: EquipSlot): boolean {
    return (this.disabledSlots & (1 << FILTER_FLAG[slot])) !== 0 || ((slot === 'mainhand' || slot === 'offhand') && !this.showArms);
  }

  /** vanilla LivingEntity.getEquipmentSlotForItem with ArmorStand.canUseSlot: its own slot unless that's disabled */
  slotForItem(s: ItemStack): EquipSlot {
    const slot = equipmentSlotForItem(s.item);
    return this.isDisabled(slot) ? 'mainhand' : slot;
  }

  /** vanilla ArmorStand.canTakeItem (a dispenser's armour): where it would go is free and not disabled */
  canTakeItem(s: ItemStack): boolean {
    const slot = this.slotForItem(s);
    return !this.hasItemInSlot(slot) && !this.isDisabled(slot);
  }

  // --- right-clicked ------------------------------------------------------------

  /**
   * vanilla ArmorStand.interactAt (the click's height up it from where `p` looks): a marker, or a name tag, passes it
   * on (a named tag then names it: vanilla NameTagItem); what's held goes on where it belongs (in a hand only with its
   * arms shown); an empty hand takes off what's where it was clicked. The click is spent whatever comes of it
   * ('consume': vanilla's client takes it, and nothing else is tried), and the hand swings only for a swap
   */
  playerInteract(p: Player, stack: ItemStack | null): boolean | 'consume' {
    if (this.marker) return false;
    if (stack?.item.id === 'name_tag') return this.nameWith(p, stack);
    if (p.gameMode === 'spectator') return true;
    const slot = stack ? equipmentSlotForItem(stack.item) : 'mainhand';
    if (!stack) {
      const clicked = this.getClickedSlot(this.clickedHeight(p));
      const s = this.isDisabled(clicked) ? slot : clicked;
      if (this.hasItemInSlot(s) && this.swapItem(p, s, null)) return true;
    } else {
      if (this.isDisabled(slot)) return 'consume';
      if ((slot === 'mainhand' || slot === 'offhand') && !this.showArms) return 'consume';
      if (this.swapItem(p, slot, stack)) return true;
    }
    return 'consume';
  }

  /** vanilla NameTagItem.interactLivingEntity: a named tag names it (one used up, none in creative) */
  private nameWith(p: Player, stack: ItemStack): boolean {
    const name = stack.tag?.customName;
    if (name === undefined || !this.isAlive) return false;
    this.setCustomName(name);
    if (p.gameMode !== 'creative') p.inventory.consumeSelected(1);
    return true;
  }

  /** the height up it that `p`'s look meets it (vanilla's interactAt vector: the hit, less its position) */
  clickedHeight(p: Player): number {
    const ex = p.x, ey = p.y + p.eyeHeight, ez = p.z;
    if (this.bb.contains(ex, ey, ez)) return ey - this.y;
    const pr = (p.pitch * Math.PI) / 180, yr = (p.yaw * Math.PI) / 180;
    const dx = -Math.sin(yr) * Math.cos(pr), dy = -Math.sin(pr), dz = Math.cos(yr) * Math.cos(pr);
    const reach = 8;
    const h = this.bb.clip(ex, ey, ez, ex + dx * reach, ey + dy * reach, ez + dz * reach);
    return h ? ey + dy * reach * h.t - this.y : (this.bb.maxY - this.bb.minY) / 2;
  }

  /** vanilla getClickedSlot: by the height clicked (a small one's scaled up), what it has there; else a hand */
  getClickedSlot(y: number): EquipSlot {
    const small = this.small;
    const d = y / (small ? 0.5 : 1);
    if (d >= 0.1 && d < 0.1 + (small ? 0.8 : 0.45) && this.hasItemInSlot('feet')) return 'feet';
    if (d >= 0.9 + (small ? 0.3 : 0) && d < 0.9 + (small ? 1 : 0.7) && this.hasItemInSlot('chest')) return 'chest';
    if (d >= 0.4 && d < 0.4 + (small ? 1 : 0.8) && this.hasItemInSlot('legs')) return 'legs';
    if (d >= 1.6 && this.hasItemInSlot('head')) return 'head';
    if (!this.hasItemInSlot('mainhand') && this.hasItemInSlot('offhand')) return 'offhand';
    return 'mainhand';
  }

  /**
   * vanilla swapItem: not when DisabledSlots says it can't be taken (+8) or put (+16); in creative, an empty slot
   * gets a copy of one; a single item (or nothing) swaps with what it had; one off a stack goes into an empty slot
   */
  private swapItem(p: Player, slot: EquipSlot, stack: ItemStack | null): boolean {
    const cur = this.getItemBySlot(slot);
    const flag = FILTER_FLAG[slot];
    if (cur && this.disabledSlots & (1 << (flag + 8))) return false;
    if (!cur && this.disabledSlots & (1 << (flag + 16))) return false;
    if (p.gameMode === 'creative' && !cur && stack) {
      this.setItemSlot(slot, stack.copyWithCount(1));
      return true;
    }
    if (!stack || stack.count <= 1) {
      this.setItemSlot(slot, stack);
      p.inventory.setSelectedItem(cur);
      return true;
    }
    if (cur) return false;
    const one = stack.copyWithCount(1);
    p.inventory.consumeSelected(1);
    this.setItemSlot(slot, one);
    return true;
  }

  // --- struck -----------------------------------------------------------------------

  /** vanilla Entity.isInvulnerableTo: gone, or invulnerable (but not to /kill, the void or a creative player) */
  private invulnerableTo(source: string, attacker: Entity | null | undefined): boolean {
    if (this.removed) return true;
    return this.invulnerable && !BYPASSES_INVULNERABILITY.has(source) && !isCreative(attacker);
  }

  /**
   * vanilla ArmorStand.hurt: /kill and the void remove it; invisible, a marker or invulnerable, nothing else touches
   * it; a blast breaks it (dropping its gear, not itself); fire and a campfire set it alight, or (alight) burn it a
   * little each tick, and burning takes 4 a second; a player's blow shakes it the first time and breaks it (dropping
   * it and its gear) if it comes within five ticks of the last; an arrow, a trident, a fireball or a wind charge breaks
   * it at once. A creative player breaks it with anything, dropping nothing; an adventurer can't break it at all.
   * Returns whether the blow counted (a shake or a break)
   */
  override hurt(_amount: number, source: string, attacker?: Entity | null, _direct?: Entity | null): boolean {
    if (this.level.isClientSide || this.removed) return false;
    if (BYPASSES_INVULNERABILITY.has(source)) {
      this.kill();
      return false;
    }
    if (this.invulnerableTo(source, attacker) || this.invisible || this.marker) return false;
    if (EXPLOSION.has(source)) {
      this.brokenByAnything();
      this.kill();
      return false;
    }
    if (IGNITES.has(source)) {
      if (this.isOnFire()) this.causeDamage(attacker, 0.15);
      else this.igniteForSeconds(5);
      return false;
    }
    if (BURNS.has(source) && this.health > 0.5) {
      this.causeDamage(attacker, 4);
      return false;
    }
    const always = ALWAYS_KILLS.has(source);
    if (!CAN_BREAK.has(source) && !always) return false;
    // (vanilla Abilities.mayBuild: not an adventurer, not a spectator)
    const gm = (attacker as { gameMode?: string } | null | undefined)?.gameMode;
    if (attacker?.type === 'player' && (gm === 'adventure' || gm === 'spectator')) return false;
    if (isCreative(attacker)) {
      this.playBrokenSound();
      this.showBreakingParticles();
      this.kill();
      return true;
    }
    const t = this.level.gameTime;
    if (t - this.lastHit > 5 && !always) {
      // vanilla entity event 32: the knock (the client's, at 0.3) and the wobble; ENTITY_DAMAGE by whoever struck it
      this.level.sound.play('entity.armor_stand.hit', this.x, this.y, this.z, 0.3, 1);
      this.level.gameEvent?.('entity_damage', this.x, this.y, this.z, { entity: attacker ?? null });
      this.lastHit = t;
    } else {
      this.brokenByPlayer();
      this.showBreakingParticles();
      this.kill();
    }
    return true;
  }

  /** vanilla causeDamage: burnt down to half a heart, it breaks (its gear dropped); otherwise ENTITY_DAMAGE */
  private causeDamage(attacker: Entity | null | undefined, amount: number): void {
    const f = this.health - amount;
    if (f <= 0.5) {
      this.brokenByAnything();
      this.kill();
    } else {
      this.health = f;
      this.level.gameEvent?.('entity_damage', this.x, this.y, this.z, { entity: attacker ?? null });
    }
  }

  /** vanilla brokenByPlayer: the stand itself drops (its name kept), then its gear */
  private brokenByPlayer(): void {
    const s = ItemStack.of('armor_stand');
    if (this.customName !== null) s.tag = { ...(s.tag ?? {}), customName: this.customName };
    this.popResource(Math.floor(this.y), s);
    this.brokenByAnything();
  }

  /** vanilla brokenByAnything: its sound, and what it held and wore dropped a block up */
  private brokenByAnything(): void {
    this.playBrokenSound();
    const by = Math.floor(this.y) + 1;
    for (const slot of ['mainhand', 'offhand'] as const) {
      const s = this.getItemBySlot(slot);
      if (!s) continue;
      this.popResource(by, s);
      if (slot === 'mainhand') this.mainHand = null;
      else this.offHand = null;
    }
    for (let i = 0; i < 4; i++) {
      const s = this.armorItems[i];
      if (!s) continue;
      this.popResource(by, s);
      this.armorItems[i] = null;
    }
  }

  /** vanilla Block.popResource at its block (row `by`): only with doTileDrops, as vanilla has it */
  private popResource(by: number, s: ItemStack): void {
    if (this.level.gameRules.doTileDrops) ItemEntity.drop(this.level, Math.floor(this.x), by, Math.floor(this.z), s);
  }

  /** vanilla playBrokenSound */
  private playBrokenSound(): void {
    this.level.sound.play('entity.armor_stand.break', this.x, this.y, this.z, 1, 1);
  }

  /** vanilla showBreakingParticles: ten bits of oak planks two thirds up it */
  private showBreakingParticles(): void {
    const st = S('oak_planks');
    const w = this.width / 4, h = this.height / 4;
    const bx = Math.floor(this.x), by = Math.floor(this.y), bz = Math.floor(this.z);
    for (let i = 0; i < 10; i++) {
      this.level.particles.blockParticle?.(this.x + gauss() * w, this.y + (this.height * 2) / 3 + gauss() * h, this.z + gauss() * w, gauss() * 0.05, gauss() * 0.05, gauss() * 0.05, st, bx, by, bz);
    }
  }

  playSound(name: string, volume: number, pitch: number): void {
    this.level.sound.play(name, this.x, this.y, this.z, volume, pitch);
  }

  /** vanilla LivingEntity.causeFallDamage's sound (ArmorStand.getFallSounds): a landing that would hurt clatters */
  protected override onFallDamage(): void {
    this.playSound('entity.armor_stand.fall', 1, 1);
  }

  // --- how it stands, moves and is met ---------------------------------------------

  /** vanilla tickHeadTurn: its body and head are always turned as it is */
  protected override updateBodyRotation(): void {
    this.bodyYawO = this.yawO;
    this.bodyYaw = this.yaw;
    this.headYawO = this.yawO;
    this.headYaw = this.yaw;
  }

  /** vanilla ArmorStand.travel: a marker doesn't move (hasPhysics) */
  override travel(sx: number, sy: number, sz: number): void {
    if (!this.marker) super.travel(sx, sy, sz);
  }

  /** vanilla ArmorStand.pushEntities: it shoves only a minecart one can ride that's right up against it */
  protected override pushEntities(): void {
    for (const e of this.level.getEntities(this.bb, (o) => o instanceof AbstractMinecart && o.type === 'minecart', this)) {
      if ((e.x - this.x) ** 2 + (e.y - this.y) ** 2 + (e.z - this.z) ** 2 <= 0.2) e.pushAgainst(this);
    }
  }

  override isPushable(): boolean {
    return false;
  }

  /** vanilla isPickable: not a marker */
  override isPickable(): boolean {
    return super.isPickable() && !this.marker;
  }

  /** vanilla isAffectedByPotions: splashes and clouds pass it by */
  override isAffectedByPotions(): boolean {
    return false;
  }

  /** vanilla ArmorStand.attackable: nothing makes it a target */
  override canBeSeenAsEnemy(): boolean {
    return false;
  }

  /** vanilla ArmorStand.ignoreExplosion: an invisible one isn't moved by a blast */
  ignoreExplosion(): boolean {
    return this.invisible;
  }

  /** vanilla setInvisible, as well as the effect */
  override isInvisible(): boolean {
    return this.invisible || super.isInvisible();
  }

  /** vanilla getPickResult */
  override pickResult(): string | null {
    return 'armor_stand';
  }

  /** (a guest's copy) a box as big as the host's flags say, should they change */
  override animateMirror(): void {
    super.animateMirror();
    if (Math.abs(this.bb.maxY - this.bb.minY - this.height) > 1e-6 || Math.abs(this.bb.maxX - this.bb.minX - this.width) > 1e-6) this.setPos(this.x, this.y, this.z);
  }

  // --- saving (vanilla addAdditionalSaveData: ArmorItems, HandItems, Invisible, Small, ShowArms, DisabledSlots,
  // NoBasePlate, Marker, Pose; with Entity's NoGravity, Invulnerable, CustomName and the rest)

  save(): SavedEntity {
    const data: Record<string, number | string | boolean> = {};
    if (this.invisible) data.invisible = true;
    if (this.small) data.small = true;
    if (this.showArms) data.showArms = true;
    if (this.noBasePlate) data.noBasePlate = true;
    if (this.marker) data.marker = true;
    if (this.disabledSlots) data.disabledSlots = this.disabledSlots;
    if (this.noGravityFlag) data.noGravity = true;
    if (this.invulnerable) data.invulnerable = true;
    // (vanilla writePose: only the parts not in their default pose)
    const pose: Record<string, number[]> = {};
    for (const [key, field] of POSE_KEYS) if (this[field].some((v, i) => v !== POSE_DEFAULTS[field][i])) pose[key] = [...this[field]];
    if (Object.keys(pose).length) data.pose = JSON.stringify(pose);
    return {
      id: this.type,
      uuid: this.hasUuid ? this.uuid : undefined,
      x: this.x, y: this.y, z: this.z, yaw: this.yaw, pitch: this.pitch, dx: this.dx, dy: this.dy, dz: this.dz,
      health: this.health,
      fire: this.remainingFireTicks,
      hand: this.mainHand ? saveStack(this.mainHand) : null,
      offhand: this.offHand ? saveStack(this.offHand) : undefined,
      armor: this.armorItems.some((a) => a) ? this.armorItems.map((a) => (a ? saveStack(a) : null)) : undefined,
      data,
      effects: this.activeEffects.size ? this.saveEffects() : undefined,
      name: this.customName ?? undefined,
      nameVisible: this.customNameVisible || undefined,
    };
  }

  load(d: SavedEntity): void {
    if (typeof d.uuid === 'string') this.uuid = d.uuid;
    const data = d.data ?? {};
    this.invisible = data.invisible === true;
    this.small = data.small === true;
    this.showArms = data.showArms === true;
    this.noBasePlate = data.noBasePlate === true;
    this.marker = data.marker === true;
    this.disabledSlots = typeof data.disabledSlots === 'number' ? data.disabledSlots | 0 : 0;
    this.noGravityFlag = data.noGravity === true;
    this.invulnerable = data.invulnerable === true;
    this.refreshDimensions();
    this.moveTo(d.x, d.y, d.z, d.yaw, d.pitch);
    this.bodyYaw = this.bodyYawO = this.headYaw = this.headYawO = d.yaw;
    this.dx = d.dx;
    this.dy = d.dy;
    this.dz = d.dz;
    if (typeof d.health === 'number' && d.health > 0) this.health = d.health;
    this.remainingFireTicks = d.fire;
    this.loadEffects(d.effects);
    // (straight into the slots: nothing plays on loading)
    this.mainHand = loadStack(d.hand);
    this.offHand = loadStack(d.offhand);
    for (let i = 0; i < 4; i++) this.armorItems[i] = loadStack(d.armor?.[i]);
    if (typeof d.name === 'string') this.setCustomName(d.name);
    this.customNameVisible = d.nameVisible === true;
    let pose: Record<string, unknown> = {};
    if (typeof data.pose === 'string') {
      try {
        const j: unknown = JSON.parse(data.pose);
        if (j && typeof j === 'object' && !Array.isArray(j)) pose = j as Record<string, unknown>;
      } catch {
        /* a pose that won't read: the default */
      }
    }
    for (const [key, field] of POSE_KEYS) this[field] = rotationsOf(Object.hasOwn(pose, key) ? pose[key] : null) ?? [...POSE_DEFAULTS[field]];
  }

  /**
   * /summon's entity data (vanilla readAdditionalSaveData): ArmorItems (feet to head) and HandItems (main, off),
   * Invisible, Small, ShowArms, DisabledSlots, NoBasePlate, Marker, Pose {Head, Body, LeftArm, RightArm, LeftLeg,
   * RightLeg: [x, y, z] in degrees}, and Entity's NoGravity, Invulnerable, CustomName, CustomNameVisible, Rotation
   */
  readEntityData(nbt: string, read: SnbtReaders): void {
    const flag = (k: string) => new RegExp(`\\b${k}\\s*:\\s*(1b|true)`).test(nbt);
    this.invisible = flag('Invisible');
    this.small = flag('Small');
    this.showArms = flag('ShowArms');
    this.noBasePlate = flag('NoBasePlate');
    this.marker = flag('Marker');
    this.noGravityFlag = flag('NoGravity');
    this.invulnerable = flag('Invulnerable');
    const ds = /\bDisabledSlots\s*:\s*(-?\d+)/.exec(nbt);
    if (ds) this.disabledSlots = Number(ds[1]) | 0;
    this.refreshDimensions();
    const slots = { ArmorItems: ['feet', 'legs', 'chest', 'head'], HandItems: ['mainhand', 'offhand'] } as const;
    for (const [key, names] of Object.entries(slots)) {
      read.entries(nbt, key)?.forEach((e, i) => {
        if (i < names.length) this.setItemSlot(names[i], read.stack(e));
      });
    }
    const pose = compoundAfter(nbt, 'Pose');
    if (pose !== null) {
      for (const [key, field] of POSE_KEYS) {
        const m = new RegExp(`\\b${key}\\s*:\\s*\\[([^\\]]*)\\]`).exec(pose);
        const r = m ? rotationsOf(m[1].split(',').map((v) => parseFloat(v))) : null;
        if (r) this[field] = r;
      }
    }
    const rot = /\bRotation\s*:\s*\[([^\]]*)\]/.exec(nbt);
    if (rot) {
      const [yaw, pitch] = rot[1].split(',').map((v) => parseFloat(v));
      if (Number.isFinite(yaw)) this.moveTo(this.x, this.y, this.z, wrapDegrees(yaw), Number.isFinite(pitch) ? Math.max(-90, Math.min(90, pitch)) : 0);
      this.bodyYaw = this.bodyYawO = this.headYaw = this.headYawO = this.yaw;
    }
    const name = read.name(nbt);
    if (name !== null) this.setCustomName(name);
    if (flag('CustomNameVisible')) this.customNameVisible = true;
  }
}

/** vanilla Rotations(ListTag): three finite numbers, each taken modulo 360; null if it isn't one */
function rotationsOf(v: unknown): Rotations | null {
  if (!Array.isArray(v) || v.length < 3) return null;
  const out = v.slice(0, 3).map((x) => (typeof x === 'number' && Number.isFinite(x) ? x % 360 : NaN));
  return out.some((x) => Number.isNaN(x)) ? null : (out as Rotations);
}

/** the text of the compound after `key:` in an SNBT compound (its braces matched), or null */
function compoundAfter(nbt: string, key: string): string | null {
  const m = new RegExp(`\\b${key}\\s*:\\s*\\{`).exec(nbt);
  if (!m) return null;
  let depth = 0;
  for (let i = m.index + m[0].length - 1; i < nbt.length; i++) {
    if (nbt[i] === '{') depth++;
    else if (nbt[i] === '}' && --depth === 0) return nbt.slice(m.index + m[0].length, i);
  }
  return null;
}

/** a player in creative mode (vanilla DamageSource.isCreativePlayer / Player.hasInfiniteMaterials) */
function isCreative(e: Entity | null | undefined): boolean {
  return e?.type === 'player' && (e as { gameMode?: string }).gameMode === 'creative';
}

function gauss(): number {
  let u = 0;
  while (u === 0) u = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random());
}

/**
 * vanilla EntityType.create(…, shouldOffsetY, shouldOffsetYMore) with getYOffset: from a block up, down onto what's
 * under it (as far as the block below's floor), in the block at (bx, by, bz); returns the height to add to `by`
 */
function yOffset(stand: ArmorStand, bx: number, by: number, bz: number): number {
  const box = new AABB(bx + 0.5 - stand.width / 2, by + 1, bz + 0.5 - stand.width / 2, bx + 0.5 + stand.width / 2, by + 1 + stand.height, bz + 0.5 + stand.width / 2);
  let d = -2;
  for (const c of stand.collisionBoxes(new AABB(bx, by - 1, bz, bx + 1, by + 1, bz + 1))) {
    if (c.maxX <= box.minX + 1e-7 || c.minX >= box.maxX - 1e-7 || c.maxZ <= box.minZ + 1e-7 || c.minZ >= box.maxZ - 1e-7) continue;
    if (c.maxY <= box.minY + 1e-7) d = Math.max(d, c.maxY - box.minY);
  }
  return 1 + d;
}

/**
 * vanilla ArmorStandItem.useOn: not on a block's underside, nor in adventure mode; in the block clicked if it could be
 * built over (tall grass), else next to it, where a stand's box meets no block and no entity at all (a dropped item
 * too); stood on what's under it, turned to face the placer to the nearest eighth, named as the item is. Its sound
 * (at 0.75, pitch 0.8) and ENTITY_PLACE, and one used up (none in creative)
 */
registerItemBehavior('armor_stand', {
  useOn(level, p, stack, h) {
    if (h.face === DOWN) return 'fail';
    if (p.gameMode === 'adventure') return 'pass';
    const replace = !!(FLAGS[level.getState(h.x, h.y, h.z)] & F_REPLACEABLE);
    const bx = replace ? h.x : h.x + DX[h.face], by = replace ? h.y : h.y + DY[h.face], bz = replace ? h.z : h.z + DZ[h.face];
    const stand = new ArmorStand(level);
    const box = new AABB(bx + 0.5 - WIDTH / 2, by, bz + 0.5 - WIDTH / 2, bx + 0.5 + WIDTH / 2, by + HEIGHT, bz + 0.5 + WIDTH / 2);
    if (stand.collisionBoxes(box).length || level.getEntities(box).length) return 'fail';
    const yaw = Math.floor((wrapDegrees(p.yaw - 180) + 22.5) / 45) * 45;
    stand.moveTo(bx + 0.5, by + yOffset(stand, bx, by, bz), bz + 0.5, yaw, 0);
    stand.bodyYaw = stand.bodyYawO = stand.headYaw = stand.headYawO = yaw;
    if (stack.tag?.customName !== undefined) stand.setCustomName(stack.tag.customName);
    level.addEntity(stand);
    level.sound.play('entity.armor_stand.place', stand.x, stand.y, stand.z, 0.75, 0.8);
    level.gameEvent?.('entity_place', stand.x, stand.y, stand.z, { entity: p });
    if (p.gameMode !== 'creative') p.inventory.consumeSelected(1);
    p.swing();
    return 'success';
  },
});

// vanilla recipes/armor_stand: unlocked by a smooth stone slab (not the sticks)
const book = BOOK_BY_ID.get('armor_stand');
if (book) book.unlockBy = new Set(['smooth_stone_slab']);

/** vanilla Direction.toYRot: a dispenser facing up or down turns its stand as it would facing east */
const DISPENSED_YAW: Record<number, number> = { [SOUTH]: 0, [WEST]: 90, [NORTH]: 180, [EAST]: 270, [UP]: 270, [DOWN]: 270 };

/**
 * vanilla DispenseItemBehavior for ARMOR_STAND: one stood in the block in front of a dispenser (x, y, z: that block),
 * facing the way it faces, named as the item is: where it is, with no check (EntityType.spawn without offsets)
 */
export function dispenseArmorStand(level: Level, x: number, y: number, z: number, facing: number, stack: ItemStack): void {
  const stand = new ArmorStand(level);
  const yaw = DISPENSED_YAW[facing] ?? 0;
  stand.moveTo(x + 0.5, y, z + 0.5, yaw, 0);
  stand.bodyYaw = stand.bodyYawO = stand.headYaw = stand.headYawO = yaw;
  if (stack.tag?.customName !== undefined) stand.setCustomName(stack.tag.customName);
  level.addEntity(stand);
}

