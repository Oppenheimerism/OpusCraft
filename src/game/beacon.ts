// (the beacon) The beacon (vanilla BeaconBlock and BeaconBlockEntity): a nether star in a glass case on obsidian, set
// on a stepped pyramid of iron, gold, emerald, diamond or netherite blocks (one to four tiers: 3x3, 5x5, 7x7, 9x9).
// Each tick it climbs ten blocks up its column toward the top of the world (vanilla tick's scan): its beam goes up
// through anything that lets light through (and bedrock), stained glass or panes colouring it (the first one its own
// colour, each one after mixed half and half with the colour below), and anything opaque cutting it off. Every four
// seconds it counts the tiers of its pyramid (vanilla updateBase) and, lit with a power chosen, gives that power to
// every player (spectators aside) within 10 blocks more for each tier (above it, as high as the world): speed or
// haste with one tier, resistance or jump boost with two, strength with three; with all four, regeneration as well
// or the primary power stronger (II). It hums each time (block.beacon.ambient); it powers up and down with its own
// sounds, and those near it as it powers up get Bring Home the Beacon (Beaconator with all four tiers). Its screen
// (gui/screens/beacon.ts) takes an iron ingot, gold ingot, emerald, diamond or netherite ingot to choose the powers.
// The beam itself is render/beaconRenderer.ts.

import { BlockEntity, registerBlockEntityType } from '../world/blockEntity';
import { BLOCKS, STATE_BLOCK, OPACITY } from '../world/block';
import { registerBehavior } from './blockBehavior';
import { AABB } from '../core/aabb';
import { MobEffectInstance, MOB_EFFECTS } from '../entity/effects';
import { DYE_COLORS, DYE_DIFFUSE } from '../entity/animals';
import { ItemStack, ITEMS } from '../item/item';
import type { Level } from './level';

/** vanilla BeaconBlockEntity.BEACON_EFFECTS: the powers of each tier (the last, with all four, the secondary's) */
export const BEACON_EFFECTS: readonly (readonly string[])[] = [['speed', 'haste'], ['resistance', 'jump_boost'], ['strength'], ['regeneration']];
/** vanilla VALID_EFFECTS */
const VALID_EFFECTS = new Set(BEACON_EFFECTS.flat());
/** vanilla #beacon_base_blocks */
export const BEACON_BASE_BLOCKS: ReadonlySet<string> = new Set(['iron_block', 'gold_block', 'emerald_block', 'diamond_block', 'netherite_block']);
/** vanilla #beacon_payment_items */
export const BEACON_PAYMENT_ITEMS: ReadonlySet<string> = new Set(['iron_ingot', 'gold_ingot', 'emerald', 'diamond', 'netherite_ingot']);
/** vanilla BeaconBlock's own colour (BeaconBeamBlock.getColor: white) */
const WHITE = DYE_DIFFUSE[0];

/** vanilla filterEffect: only a beacon's own powers count */
export function filterEffect(id: string | null | undefined): string | null {
  const s = id ? id.replace(/^minecraft:/, '') : '';
  return VALID_EFFECTS.has(s) ? s : null;
}

/** the tier (0-3) whose powers include `id` (the primary's); -1 for none */
export function effectTier(id: string): number {
  return BEACON_EFFECTS.findIndex((t) => t.includes(id));
}

/** vanilla BeaconBeamBlock.getColor: the colour a block gives the beam (stained glass and panes, and the beacon itself); null for any other */
export function beamColor(st: number): number | null {
  const n = BLOCKS[STATE_BLOCK[st]].name;
  if (n === 'beacon') return WHITE;
  const m = /^(.+)_stained_glass(_pane)?$/.exec(n);
  if (!m) return null;
  const i = DYE_COLORS.indexOf(m[1]);
  return i < 0 ? null : DYE_DIFFUSE[i];
}

/** vanilla FastColor.ARGB32.average: each channel's halfway (rounded down) */
export function averageColor(a: number, b: number): number {
  const ch = (s: number) => (((a >> s) & 255) + ((b >> s) & 255)) >> 1;
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

/** vanilla BeaconBlockEntity.BeaconBeamSection: a length of the beam, one colour */
export interface BeamSection {
  color: number;
  height: number;
}

/** vanilla updateBase: the whole tiers of the pyramid under (x, y, z), from the top (up to four) */
export function pyramidLevels(level: Level, x: number, y: number, z: number): number {
  let i = 0;
  for (let j = 1; j <= 4; i = j++) {
    const k = y - j;
    if (k < level.world.dim.minY) break;
    for (let l = x - j; l <= x + j; l++)
      for (let m = z - j; m <= z + j; m++) if (!BEACON_BASE_BLOCKS.has(BLOCKS[STATE_BLOCK[level.getState(l, k, m)]].name)) return i;
  }
  return i;
}

export class BeaconBlockEntity extends BlockEntity {
  readonly id = 'beacon';
  /** vanilla levels: the whole tiers under it, counted every four seconds (0: dark) */
  levels = 0;
  /** vanilla primaryPower and secondaryPower: the effects chosen (null: none yet) */
  primary: string | null = null;
  secondary: string | null = null;
  /** vanilla name: the name of the beacon item it was placed from */
  customName: string | null = null;
  /** vanilla beamSections: the beam as the last whole scan found it, bottom up */
  beamSections: BeamSection[] = [];
  /** vanilla checkingBeamSections and lastCheckY: the scan under way */
  private checking: BeamSection[] = [];
  private lastCheckY = 0;

  constructor(x: number, y: number, z: number) {
    super(x, y, z, 0);
  }

  /** vanilla applyImplicitComponents: the name of the beacon item it was placed from */
  override applyComponents(s: ItemStack): void {
    this.customName = s.tag?.customName ?? null;
  }

  /** vanilla getBeamSections: none while it's dark */
  shownBeam(): BeamSection[] {
    return this.levels === 0 ? [] : this.beamSections;
  }

  /** vanilla BeaconBlockEntity.tick (on the host; a guest's copy is kept by it) */
  override tick(level: Level): void {
    if (this.removed) return;
    const i = this.x, j = this.y, k = this.z;
    let y: number;
    if (this.lastCheckY < j) {
      y = j;
      this.checking = [];
      this.lastCheckY = j - 1;
    } else y = this.lastCheckY + 1;
    let section: BeamSection | null = this.checking.length ? this.checking[this.checking.length - 1] : null;
    // (vanilla Heightmap WORLD_SURFACE; here the top of whatever stops the sky, as high as anything that colours or
    // cuts off the beam goes)
    const top = level.world.heightAt(i, k);
    for (let n = 0; n < 10 && y <= top; n++) {
      const st = level.getState(i, y, k);
      const c = beamColor(st);
      if (c !== null) {
        if (this.checking.length <= 1) {
          section = { color: c, height: 1 };
          this.checking.push(section);
        } else if (section) {
          if (c === section.color) section.height++;
          else {
            section = { color: averageColor(section.color, c), height: 1 };
            this.checking.push(section);
          }
        }
      } else {
        if (!section || (OPACITY[st] >= 15 && BLOCKS[STATE_BLOCK[st]].name !== 'bedrock')) {
          this.checking.length = 0;
          this.lastCheckY = top;
          break;
        }
        section.height++;
      }
      y++;
      this.lastCheckY++;
    }
    const was = this.levels;
    if (level.gameTime % 80 === 0) {
      if (this.beamSections.length) this.levels = pyramidLevels(level, i, j, k);
      if (this.levels > 0 && this.beamSections.length) {
        this.applyEffects(level);
        playBeaconSound(level, i, j, k, 'block.beacon.ambient');
      }
    }
    if (this.lastCheckY >= top) {
      this.lastCheckY = level.world.dim.minY - 1;
      this.beamSections = this.checking;
      if (!level.isClientSide) {
        const on = this.levels > 0;
        if (was <= 0 && on) {
          playBeaconSound(level, i, j, k, 'block.beacon.activate');
          // (vanilla CriteriaTriggers.CONSTRUCT_BEACON for the players in the box from it down 4, grown 10 across and 5 up and down)
          const box = new AABB(i, j - 4, k, i, j, k).inflate(10, 5, 10);
          for (const p of level.players()) if (p.gameMode !== 'spectator' && box.intersects(p.bb)) level.onPlayerTrigger?.(p, 'construct_beacon', { beaconLevel: this.levels });
        } else if (was > 0 && !on) playBeaconSound(level, i, j, k, 'block.beacon.deactivate');
      }
    }
    if (this.levels !== was) this.version++;
  }

  /**
   * vanilla applyEffects: the primary power (II with all four tiers and both the same) to every player in the box 10
   * more than a tier's worth round it, up to the top of the world, for 9 + 2 a tier seconds; with all four tiers a
   * different secondary as well. Ambient: the faint particles and the beacon's blue frame
   */
  private applyEffects(level: Level): void {
    const primary = this.primary;
    if (level.isClientSide || !primary) return;
    const levels = this.levels, d = levels * 10 + 10;
    const amp = levels >= 4 && primary === this.secondary ? 1 : 0;
    const ticks = (9 + levels * 2) * 20;
    const box = new AABB(this.x, this.y, this.z, this.x + 1, this.y + 1, this.z + 1).inflate(d).expandTowards(0, level.world.dim.maxY - level.world.dim.minY, 0);
    const players = level.players().filter((p) => p.gameMode !== 'spectator' && box.intersects(p.bb));
    for (const p of players) p.addEffect(new MobEffectInstance(MOB_EFFECTS[primary], ticks, amp, true, true));
    const secondary = this.secondary;
    if (levels >= 4 && secondary && secondary !== primary) for (const p of players) p.addEffect(new MobEffectInstance(MOB_EFFECTS[secondary], ticks, 0, true, true));
  }

  /**
   * vanilla's data slot 1 and 2 set (BeaconMenu.updateEffects): the powers chosen, the payment taken; the selection
   * sound while the beam's lit
   */
  setPowers(level: Level, primary: string | null, secondary: string | null): void {
    if (!level.isClientSide && this.beamSections.length) playBeaconSound(level, this.x, this.y, this.z, 'block.beacon.power_select');
    this.primary = filterEffect(primary);
    this.secondary = filterEffect(secondary);
    this.version++;
  }

  // (vanilla saveAdditional: Levels saved but, as vanilla, not read back: it's counted again, and the beam lights four
  // seconds or so after loading, with its power-up sound)
  protected override saveData(): Record<string, number | string> | undefined {
    const d: Record<string, number | string> = { Levels: this.levels };
    if (this.primary) d.primary_effect = this.primary;
    if (this.secondary) d.secondary_effect = this.secondary;
    if (this.customName) d.CustomName = this.customName;
    return d;
  }

  protected override loadData(d: Record<string, number | string>): void {
    this.primary = filterEffect(typeof d.primary_effect === 'string' ? d.primary_effect : null);
    this.secondary = filterEffect(typeof d.secondary_effect === 'string' ? d.secondary_effect : null);
    this.customName = typeof d.CustomName === 'string' ? d.CustomName : null;
  }
}

/** vanilla BeaconBlockEntity.playSound: from its middle, the blocks' sounds */
export function playBeaconSound(level: Level, x: number, y: number, z: number, name: string): void {
  level.sound.play(name, x + 0.5, y + 0.5, z + 0.5, 1, 1);
}

registerBlockEntityType('beacon', (x, y, z) => new BeaconBlockEntity(x, y, z));

registerBehavior('beacon', {
  /** vanilla blocks/beacon loot: itself, its name kept (copy_components minecraft:custom_name) */
  drops(_st, _tool, _r, _silk, _fortune, be) {
    const s = new ItemStack(ITEMS.get('beacon')!, 1);
    if (be instanceof BeaconBlockEntity && be.customName !== null) s.tag = { customName: be.customName };
    return [s];
  },
  /** vanilla BeaconBlockEntity.setRemoved: the power-down sound whenever it goes, lit or not */
  onRemove(level, x, y, z, _state, now) {
    if (BLOCKS[STATE_BLOCK[now]].name !== 'beacon') playBeaconSound(level, x, y, z, 'block.beacon.deactivate');
  },
});
