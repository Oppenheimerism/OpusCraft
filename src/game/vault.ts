// The vault (1.21; vanilla VaultBlock and VaultBlockEntity, with VaultConfig, VaultServerData, VaultSharedData,
// VaultClientData and VaultState). Half lit and idle until a player (not a spectator) comes within 4 blocks who hasn't
// had its reward yet; then it lights up, shows one of the things it may give spinning in its cage (a new one each
// second), and sends faint sparks to each such player within 4.5 blocks. Its key (a trial key; an ominous vault's
// structure gives it the ominous trial key and the ominous reward) used on it rolls its reward, which comes out of the
// top an item a second, and that player is remembered (the last 128) and never rewarded by it again. Anything else
// used on it gets a refusing clunk, rate-limited.

import type { Level } from './level';
import { BlockEntity, registerBlockEntity } from '../world/blockEntity';
import { BLOCKS, STATE_BLOCK } from '../world/block';
import { VAULT_STATES, type VaultStateName } from '../world/blocksTrialChambers';
import { ITEMS, ItemStack, cloneTag, type ItemTag } from '../item/item';
import { Player } from '../entity/player';
import { rollLoot } from './loot';
import { spawnItem } from './redstone/dispenseItems';
import { registerBehavior } from './blockBehavior';
import { UP } from '../world/dir';
import { blockCloserThan, ejectItemParticles } from './trialSpawner';
import { parseSnbt, snbtObject } from './snbt';

/** vanilla VaultConfig */
export interface VaultConfig {
  lootTable: string;
  activationRange: number;
  deactivationRange: number;
  /** its key (vanilla key_item: one of it, with no other components) */
  keyItem: string;
  overrideLootTableToDisplay: string | null;
}

/** vanilla VaultConfig.DEFAULT: what a vault set down by hand has */
export const DEFAULT_VAULT_CONFIG: VaultConfig = {
  lootTable: 'chests/trial_chambers/reward', activationRange: 4, deactivationRange: 4.5, keyItem: 'trial_key', overrideLootTableToDisplay: null,
};
/** the ominous vaults' in the trial chambers (their templates give them this) */
export const OMINOUS_VAULT_CONFIG: VaultConfig = { ...DEFAULT_VAULT_CONFIG, lootTable: 'chests/trial_chambers/reward_ominous', keyItem: 'ominous_trial_key' };

/** vanilla VaultServerData.MAX_REWARD_PLAYERS */
const MAX_REWARD_PLAYERS = 128;
/** vanilla VaultState's pauses: players are looked for each second, and items come out a second apart */
const UPDATE_CONNECTED_PLAYERS_TICK_RATE = 20;
const DELAY_BETWEEN_EJECTIONS_TICKS = 20;
const DELAY_AFTER_LAST_EJECTION_TICKS = 20;
const DELAY_BEFORE_FIRST_EJECTION_TICKS = 20;
/** vanilla VaultBlockEntity.Server: the time an unlocked vault takes before its state moves on, and between refusals */
const UNLOCKING_DELAY_TICKS = 14;
const INSERT_FAIL_SOUND_BUFFER_TICKS = 15;

const FACING: Record<string, [number, number]> = { north: [0, -1], south: [0, 1], west: [-1, 0], east: [1, 0] };

const pitchJitter = (): number => (Math.random() - Math.random()) * 0.2 + 1;
const between = (lo: number, hi: number): number => lo + Math.random() * (hi - lo);

function gauss(): number {
  let u = 0;
  while (u === 0) u = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random());
}

type SavedStack = [string, number, number, ItemTag?];
const saveStack = (s: ItemStack): SavedStack => (s.tag ? [s.item.id, s.count, s.damage, cloneTag(s.tag)!] : [s.item.id, s.count, s.damage]);
function loadStack(d: SavedStack | null | undefined): ItemStack | null {
  const it = d && ITEMS.get(d[0]);
  return it ? new ItemStack(it, d[1], d[2], cloneTag(d[3] ?? null)) : null;
}

export class VaultBlockEntity extends BlockEntity {
  readonly id = 'vault';
  config: VaultConfig = { ...DEFAULT_VAULT_CONFIG };
  // vanilla VaultServerData
  /** rewarded_players, oldest first */
  readonly rewardedPlayers: string[] = [];
  stateUpdatingResumesAt = 0;
  /** items_to_eject: the reward still to come out, the next last */
  itemsToEject: ItemStack[] = [];
  lastInsertFailTimestamp = 0;
  totalEjectionsNeeded = 0;
  // vanilla VaultSharedData
  displayItem: ItemStack | null = null;
  connectedPlayers = new Set<string>();
  connectedParticlesRange = DEFAULT_VAULT_CONFIG.deactivationRange;
  // vanilla VaultClientData: the display item's spin, 10 degrees a tick
  spin = 0;
  oSpin = 0;
  private dirty = false;

  constructor(x: number, y: number, z: number) {
    super(x, y, z, 0);
  }

  /** the block's vault_state */
  state(level: Level): VaultStateName {
    const st = level.getState(this.x, this.y, this.z);
    const b = BLOCKS[STATE_BLOCK[st]];
    return b.name === 'vault' ? (b.get(st, 'vault_state') as VaultStateName) : 'inactive';
  }

  private ominous(level: Level): boolean {
    const st = level.getState(this.x, this.y, this.z);
    return BLOCKS[STATE_BLOCK[st]].get(st, 'ominous') === true;
  }

  override tick(level: Level): void {
    if (!level.isEntityTicking(this.x, this.z)) return;
    if (level.getBlockName(this.x, this.y, this.z) !== 'vault') return;
    this.tickServer(level);
    this.tickClient(level);
    if (this.dirty) {
      this.dirty = false;
      const c = level.world.getChunk(this.x >> 4, this.z >> 4);
      if (c) c.modified = true;
    }
  }

  // --- server (vanilla VaultBlockEntity.Server)

  private tickServer(level: Level): void {
    const s = this.state(level);
    // vanilla shouldCycleDisplayItem: a new one each second while it's active
    if (level.gameTime % 20 === 0 && s === 'active') this.cycleDisplayItemFromLootTable(level, s);
    if (level.gameTime >= this.stateUpdatingResumesAt) {
      const next = this.tickAndGetNext(level, s);
      if (next !== s) this.setVaultState(level, s, next);
    }
  }

  /** vanilla VaultState.tickAndGetNext */
  private tickAndGetNext(level: Level, s: VaultStateName): VaultStateName {
    switch (s) {
      case 'inactive':
        return this.updateStateForConnectedPlayers(level, this.config.activationRange);
      case 'active':
        return this.updateStateForConnectedPlayers(level, this.config.deactivationRange);
      case 'unlocking':
        this.pauseStateUpdatingUntil(level.gameTime + DELAY_BEFORE_FIRST_EJECTION_TICKS);
        return 'ejecting';
      case 'ejecting': {
        if (!this.itemsToEject.length) {
          // vanilla markEjectionFinished
          this.totalEjectionsNeeded = 0;
          this.dirty = true;
          return this.updateStateForConnectedPlayers(level, this.config.deactivationRange);
        }
        const progress = this.ejectionProgress();
        this.ejectResultItem(level, this.itemsToEject.pop()!, progress);
        this.displayItem = this.nextItemToEject();
        this.pauseStateUpdatingUntil(level.gameTime + (this.itemsToEject.length ? DELAY_BETWEEN_EJECTIONS_TICKS : DELAY_AFTER_LAST_EJECTION_TICKS));
        return 'ejecting';
      }
    }
  }

  private pauseStateUpdatingUntil(t: number): void {
    this.stateUpdatingResumesAt = t;
    this.dirty = true;
  }

  /** vanilla VaultState.updateStateForConnectedPlayers */
  private updateStateForConnectedPlayers(level: Level, range: number): VaultStateName {
    this.updateConnectedPlayersWithinRange(level, range);
    this.pauseStateUpdatingUntil(level.gameTime + UPDATE_CONNECTED_PLAYERS_TICK_RATE);
    return this.connectedPlayers.size ? 'active' : 'inactive';
  }

  /**
   * vanilla VaultSharedData.updateConnectedPlayersWithinRange: the players (PlayerDetector.INCLUDING_CREATIVE_PLAYERS:
   * any but spectators) whose block is within `range` of its, without line of sight, and not yet rewarded
   */
  updateConnectedPlayersWithinRange(level: Level, range: number): void {
    const now = new Set<string>();
    for (const p of level.players())
      if (blockCloserThan(p, this.x, this.y, this.z, range) && p.gameMode !== 'spectator' && !this.rewardedPlayers.includes(p.uuid)) now.add(p.uuid);
    if (now.size !== this.connectedPlayers.size || [...now].some((u) => !this.connectedPlayers.has(u))) {
      this.connectedPlayers = now;
      this.dirty = true;
    }
  }

  /** vanilla VaultBlockEntity.Server.setVaultState: the block takes the state, and the states' transitions run */
  private setVaultState(level: Level, from: VaultStateName, to: VaultStateName): void {
    const st = level.getState(this.x, this.y, this.z);
    const b = BLOCKS[STATE_BLOCK[st]];
    if (b.name !== 'vault') return;
    level.setBlock(this.x, this.y, this.z, b.with(st, 'vault_state', to));
    const ominous = b.get(st, 'ominous') === true;
    const cx = this.x + 0.5, cy = this.y + 0.5, cz = this.z + 0.5;
    // vanilla VaultState.onExit
    if (from === 'ejecting') level.sound.play('block.vault.close_shutter', cx, cy, cz, 1, 1);
    // vanilla VaultState.onEnter
    if (to === 'inactive') {
      this.displayItem = null;
      this.deactivationEvent(level, ominous);
    } else if (to === 'active') {
      if (!this.displayItem) this.cycleDisplayItemFromLootTable(level, to);
      this.activationEvent(level, ominous);
    } else if (to === 'unlocking') level.sound.play('block.vault.insert_item', cx, cy, cz, 1, 1);
    else if (to === 'ejecting') level.sound.play('block.vault.open_shutter', cx, cy, cz, 1, 1);
    this.dirty = true;
  }

  /** vanilla canEjectReward: it has a key, and isn't idle */
  private canEjectReward(s: VaultStateName): boolean {
    return !!this.config.keyItem && s !== 'inactive';
  }

  /** vanilla cycleDisplayItemFromLootTable: one of the things one roll of its table gives */
  private cycleDisplayItemFromLootTable(level: Level, s: VaultStateName): void {
    if (!this.canEjectReward(s)) this.displayItem = null;
    else {
      const items = rollLoot(this.config.overrideLootTableToDisplay ?? this.config.lootTable, level.random, { x: this.x + 0.5, y: this.y + 0.5, z: this.z + 0.5 });
      this.displayItem = items.length ? items[level.random.nextInt(items.length)] : null;
    }
    this.dirty = true;
  }

  /** vanilla VaultServerData.getNextItemToEject */
  private nextItemToEject(): ItemStack | null {
    return this.itemsToEject.length ? this.itemsToEject[this.itemsToEject.length - 1] : null;
  }

  /** vanilla VaultServerData.ejectionProgress: from 0 at the first item to 1 at the last */
  ejectionProgress(): number {
    if (this.totalEjectionsNeeded === 1) return 1;
    return 1 - (this.itemsToEject.length - 1) / (this.totalEjectionsNeeded - 1);
  }

  /** vanilla VaultState.ejectResultItem: thrown up out of its top, the sound rising as the reward runs out */
  private ejectResultItem(level: Level, s: ItemStack, progress: number): void {
    spawnItem(level, s, 2, UP, [this.x + 0.5, this.y + 1.2, this.z + 0.5]);
    // level event 3017
    ejectItemParticles(level, this.x, this.y, this.z);
    level.sound.play('block.vault.eject_item', this.x + 0.5, this.y + 0.5, this.z + 0.5, 1, 0.8 + 0.4 * progress);
    this.dirty = true;
  }

  /** vanilla isValidToInsert: its key exactly (a renamed one won't do) */
  private isValidToInsert(s: ItemStack): boolean {
    return s.item.id === this.config.keyItem && s.count >= 1 && (!s.tag || Object.keys(s.tag).length === 0);
  }

  /** vanilla playInsertFailSound: at most every 15 ticks */
  private playInsertFailSound(level: Level, sound: string): void {
    if (level.gameTime < this.lastInsertFailTimestamp + INSERT_FAIL_SOUND_BUFFER_TICKS) return;
    level.sound.play(sound, this.x + 0.5, this.y + 0.5, this.z + 0.5, 1, 1);
    this.lastInsertFailTimestamp = level.gameTime;
  }

  /**
   * vanilla VaultBlockEntity.Server.tryInsertKey: the wrong item is refused, and so is a player it has rewarded;
   * otherwise its reward is rolled, the key taken (not from a creative player), and it unlocks
   */
  tryInsertKey(level: Level, p: Player, stack: ItemStack): void {
    const s = this.state(level);
    if (!this.canEjectReward(s)) return;
    if (!this.isValidToInsert(stack)) {
      this.playInsertFailSound(level, 'block.vault.insert_item_fail');
      return;
    }
    if (this.rewardedPlayers.includes(p.uuid)) {
      this.playInsertFailSound(level, 'block.vault.reject_rewarded_player');
      return;
    }
    const items = rollLoot(this.config.lootTable, level.random, { x: this.x + 0.5, y: this.y + 0.5, z: this.z + 0.5 });
    if (!items.length) return;
    if (p.gameMode !== 'creative') p.inventory.consumeSelected(1);
    // vanilla unlock
    this.itemsToEject = items;
    this.totalEjectionsNeeded = items.length;
    this.displayItem = this.nextItemToEject();
    this.pauseStateUpdatingUntil(level.gameTime + UNLOCKING_DELAY_TICKS);
    this.setVaultState(level, s, 'unlocking');
    // vanilla addToRewardedPlayers
    this.rewardedPlayers.push(p.uuid);
    if (this.rewardedPlayers.length > MAX_REWARD_PLAYERS) this.rewardedPlayers.shift();
    this.updateConnectedPlayersWithinRange(level, this.config.deactivationRange);
    this.dirty = true;
  }

  // --- client (vanilla VaultBlockEntity.Client)

  private tickClient(level: Level): void {
    this.oSpin = this.spin;
    this.spin = wrapDegrees(this.spin + 10);
    if (level.gameTime % 20 === 0) this.emitConnectionParticlesForNearbyPlayers(level);
    const ominous = this.ominous(level);
    // vanilla shouldDisplayActiveEffects: someone it's waiting on, and something to show
    const lively = this.connectedPlayers.size > 0 && !!this.displayItem;
    // vanilla emitIdleParticles: smoke in the cage half the ticks, a flame with it while it's lively
    if (Math.random() <= 0.5) {
      const x = this.x + between(0.1, 0.9), y = this.y + between(0.25, 0.75), z = this.z + between(0.1, 0.9);
      level.particles.spawn?.('smoke', x, y, z, 0, 0, 0);
      if (lively) level.particles.spawn?.(ominous ? 'soul_fire_flame' : 'small_flame', x, y, z, 0, 0, 0);
    }
    // vanilla playIdleSounds
    if (lively && Math.random() <= 0.02)
      level.sound.play('block.vault.ambient', this.x + 0.5, this.y + 0.5, this.z + 0.5, Math.random() * 0.25 + 0.75, Math.random() + 0.5);
  }

  /** vanilla keyholePos: over the front face, 1.75 up (the sparks drop the last 1.2 of the way into the keyhole) */
  private keyholePos(level: Level): [number, number, number] {
    const st = level.getState(this.x, this.y, this.z);
    const [fx, fz] = FACING[BLOCKS[STATE_BLOCK[st]].get<string>(st, 'facing')] ?? [0, -1];
    return [this.x + 0.5 + fx * 0.5, this.y + 1.75, this.z + 0.5 + fz * 0.5];
  }

  /** vanilla emitConnectionParticlesForNearbyPlayers: for each player it's waiting on, near enough, 2 to 5 sparks */
  private emitConnectionParticlesForNearbyPlayers(level: Level): void {
    if (!this.connectedPlayers.size) return;
    const [kx, ky, kz] = this.keyholePos(level);
    const range = this.connectedParticlesRange;
    for (const p of level.players()) {
      if (!this.connectedPlayers.has(p.uuid)) continue;
      if ((Math.floor(p.x) - this.x) ** 2 + (Math.floor(p.y) - this.y) ** 2 + (Math.floor(p.z) - this.z) ** 2 > range * range) continue;
      // vanilla emitConnectionParticlesForPlayer: from the player's middle toward the keyhole, each a little astray
      const vx = p.x - kx, vy = p.y + p.height / 2 - ky, vz = p.z - kz;
      const n = 2 + Math.floor(Math.random() * 4);
      for (let j = 0; j < n; j++) level.particles.spawn?.('vault_connection', kx, ky, kz, vx + Math.random() - 0.5, vy + Math.random() - 0.5, vz + Math.random() - 0.5);
    }
  }

  /** level event 3015: it lit up (sparks to the players, smoke and flames in the cage, its sound) */
  private activationEvent(level: Level, ominous: boolean): void {
    this.emitConnectionParticlesForNearbyPlayers(level);
    for (let i = 0; i < 20; i++) {
      const x = this.x + between(0.1, 0.9), y = this.y + between(0.25, 0.75), z = this.z + between(0.1, 0.9);
      level.particles.spawn?.('smoke', x, y, z, 0, 0, 0);
      level.particles.spawn?.(ominous ? 'soul_fire_flame' : 'small_flame', x, y, z, 0, 0, 0);
    }
    level.sound.play('block.vault.activate', this.x + 0.5, this.y + 0.5, this.z + 0.5, 1, pitchJitter());
  }

  /** level event 3016: it went idle (flames drifting out of the middle of the cage, its sound) */
  private deactivationEvent(level: Level, ominous: boolean): void {
    for (let i = 0; i < 20; i++) {
      const x = this.x + between(0.4, 0.6), y = this.y + between(0.4, 0.6), z = this.z + between(0.4, 0.6);
      level.particles.spawn?.(ominous ? 'soul_fire_flame' : 'small_flame', x, y, z, gauss() * 0.02, gauss() * 0.02, gauss() * 0.02);
    }
    level.sound.play('block.vault.deactivate', this.x + 0.5, this.y + 0.5, this.z + 0.5, 1, pitchJitter());
  }

  /**
   * block entity data given with /setblock (vanilla loadWithComponents): its config ({config:{key_item:{id:
   * "minecraft:ominous_trial_key"},loot_table:"minecraft:chests/trial_chambers/reward_ominous"}} for an ominous one)
   */
  readBlockEntityData(nbt: string): void {
    const config = snbtObject(snbtObject(parseSnbt(nbt))?.config);
    if (config) this.config = parseVaultConfig(config);
  }

  // --- saving (vanilla VaultBlockEntity: config, server_data and shared_data)

  protected override saveData(): Record<string, number | string> {
    const c = this.config;
    return {
      config: JSON.stringify({
        loot_table: c.lootTable, activation_range: c.activationRange, deactivation_range: c.deactivationRange, key_item: c.keyItem,
        ...(c.overrideLootTableToDisplay ? { override_loot_table_to_display: c.overrideLootTableToDisplay } : {}),
      }),
      server_data: JSON.stringify({
        rewarded_players: this.rewardedPlayers, state_updating_resumes_at: this.stateUpdatingResumesAt,
        items_to_eject: this.itemsToEject.map(saveStack), total_ejections_needed: this.totalEjectionsNeeded,
      }),
      shared_data: JSON.stringify({
        display_item: this.displayItem ? saveStack(this.displayItem) : null, connected_players: [...this.connectedPlayers],
        connected_particles_range: this.connectedParticlesRange,
      }),
    };
  }

  protected override loadData(d: Record<string, number | string>): void {
    if (typeof d.config === 'string') this.config = parseVaultConfig(JSON.parse(d.config) as Record<string, unknown>);
    if (typeof d.server_data === 'string') {
      const v = JSON.parse(d.server_data) as Record<string, unknown>;
      this.rewardedPlayers.push(...((v.rewarded_players as string[] | undefined) ?? []).slice(-MAX_REWARD_PLAYERS));
      this.stateUpdatingResumesAt = Number(v.state_updating_resumes_at ?? 0);
      this.itemsToEject = ((v.items_to_eject as SavedStack[] | undefined) ?? []).map(loadStack).filter((s): s is ItemStack => !!s);
      this.totalEjectionsNeeded = Number(v.total_ejections_needed ?? 0);
    }
    if (typeof d.shared_data === 'string') {
      const v = JSON.parse(d.shared_data) as Record<string, unknown>;
      this.displayItem = loadStack(v.display_item as SavedStack | null);
      this.connectedPlayers = new Set((v.connected_players as string[] | undefined) ?? []);
      this.connectedParticlesRange = Number(v.connected_particles_range ?? DEFAULT_VAULT_CONFIG.deactivationRange);
    }
  }
}

/**
 * a vault's config from vanilla's NBT keys (loot_table, activation_range, deactivation_range, key_item as an id or
 * {id, count}, override_loot_table_to_display), the defaults for whatever's left out
 */
export function parseVaultConfig(v: Record<string, unknown>): VaultConfig {
  const name = (x: unknown) => (typeof x === 'string' && x ? x.replace(/^minecraft:/, '') : null);
  const key = typeof v.key_item === 'object' && v.key_item ? (v.key_item as { id?: unknown }).id : v.key_item;
  return {
    lootTable: name(v.loot_table) ?? DEFAULT_VAULT_CONFIG.lootTable,
    activationRange: Number(v.activation_range ?? DEFAULT_VAULT_CONFIG.activationRange),
    deactivationRange: Number(v.deactivation_range ?? DEFAULT_VAULT_CONFIG.deactivationRange),
    keyItem: name(key) ?? DEFAULT_VAULT_CONFIG.keyItem,
    overrideLootTableToDisplay: name(v.override_loot_table_to_display),
  };
}

/** vanilla Mth.wrapDegrees */
function wrapDegrees(a: number): number {
  let f = a % 360;
  if (f >= 180) f -= 360;
  if (f < -180) f += 360;
  return f;
}

registerBlockEntity((name, x, y, z) => (name === 'vault' ? new VaultBlockEntity(x, y, z) : null));

registerBehavior('vault', {
  /**
   * vanilla VaultBlock.useItemOn: anything held on an active vault tries to unlock it (and the click's done either
   * way); otherwise the click passes on. The advancements' item_used_on_block hears of every such use.
   */
  useItemOn(level, x, y, z, st, stack, ctx) {
    const b = BLOCKS[STATE_BLOCK[st]];
    if (stack.count <= 0 || b.get(st, 'vault_state') !== 'active') return 'pass';
    const be = level.world.getBlockEntity(x, y, z);
    if (!(be instanceof VaultBlockEntity)) return 'pass';
    const item = stack.item.id;
    be.tryInsertKey(level, ctx.player, stack);
    const now = level.getState(x, y, z);
    const nb = BLOCKS[STATE_BLOCK[now]];
    const props: Record<string, string | boolean> = {};
    for (const prop of nb.props) props[prop.name] = nb.get(now, prop.name) as string | boolean;
    level.onPlayerTrigger?.(ctx.player, 'item_used_on_block', { usedOnBlock: { item, block: nb.name, props } });
    return 'success';
  },
  // vanilla: no loot table, silk touch or not
  drops: () => [],
});

/** the states in their order (for tests and commands) */
export { VAULT_STATES };
