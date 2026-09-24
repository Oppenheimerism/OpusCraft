// Chat commands with vanilla 1.21 feedback strings and argument suggestions.

import type { Game } from './game';
import type { GameMode } from '../entity/player';
import { ITEMS, ItemStack } from '../item/item';
import { BLOCK_BY_NAME, BLOCKS, STATE_BLOCK } from '../world/block';
import { stateFromString } from '../storage/worldStore';
import { MIN_Y, MAX_Y } from '../world/constants';
import { saveWorldMeta } from '../storage/worldStore';
import { ItemEntity } from '../entity/itemEntity';
import { DEFAULT_GAME_RULES as GAME_RULES } from './gameRules';
import type { Entity } from '../entity/entity';
import { LivingEntity } from '../entity/living';
import { PrimedTnt } from '../entity/tnt';
import { ExperienceOrb } from '../entity/xpOrb';
import { Arrow } from '../entity/arrow';
import { ThrownTrident } from '../entity/thrownTrident';
import { createMob, entityDisplayName, summonableTypes } from './spawner';
import type { Mob } from '../entity/mob';
import { LightningBolt } from '../entity/lightning';
import { Creeper } from '../entity/monsters';
import { createMinecart, MINECART_TYPES } from '../entity/minecart';
import { createBoat, BOAT_TYPES, BOAT_WOODS } from '../entity/boat';
import { EndCrystal } from '../entity/endCrystal';
import { MOB_EFFECTS, MobEffect, MobEffectInstance, mobEffect } from '../entity/effects';
import { ENCHANTMENTS, areCompatible, canEnchant, enchantmentLine } from '../item/enchantments';
import { craftingEnchants, setCraftingEnchants, weaponOf } from '../item/enchantHelper';
import { DIMENSIONS, type DimensionType } from '../world/dimension';
import type { VillageKind } from '../world/gen/villages';
// (Stage 4: outposts)
import { locateOutpost } from './outposts';
// (Stage 5: ocean)
import { locateMonument } from './monuments';

class CommandError extends Error {
  constructor(msg: string, readonly pos = -1) {
    super(msg);
  }
}

const GAME_MODES: GameMode[] = ['survival', 'creative', 'adventure', 'spectator'];
const MODE_NAME: Record<string, string> = { survival: 'Survival Mode', creative: 'Creative Mode', adventure: 'Adventure Mode', spectator: 'Spectator Mode' };
const DIFFS = ['peaceful', 'easy', 'normal', 'hard'] as const;
const DIFF_NAME: Record<string, string> = { peaceful: 'Peaceful', easy: 'Easy', normal: 'Normal', hard: 'Hard' };
const TARGETS = ['@a', '@e', '@p', '@r', '@s'];
/** commands available without cheats (vanilla permission level 0) */
const PUBLIC = new Set(['help', 'list', 'me', 'msg', 'tell', 'w', 'trigger', 'random']);

/** vanilla's structure ids (for /locate; the ones not in the game are never found) */
const STRUCTURES = new Set(
  [
    'ancient_city', 'bastion_remnant', 'buried_treasure', 'desert_pyramid', 'end_city', 'fortress', 'igloo', 'jungle_pyramid', 'mansion', 'mineshaft',
    'mineshaft_mesa', 'monument', 'nether_fossil', 'ocean_ruin_cold', 'ocean_ruin_warm', 'pillager_outpost', 'ruined_portal', 'ruined_portal_desert',
    'ruined_portal_jungle', 'ruined_portal_mountain', 'ruined_portal_nether', 'ruined_portal_ocean', 'ruined_portal_swamp', 'shipwreck', 'shipwreck_beached',
    'stronghold', 'swamp_hut', 'trail_ruins', 'trial_chambers', 'village_desert', 'village_plains', 'village_savanna', 'village_snowy', 'village_taiga',
  ].map((n) => 'minecraft:' + n),
);

interface Tok {
  s: string;
  pos: number;
}

function tokenize(line: string): Tok[] {
  const out: Tok[] = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) out.push({ s: m[0], pos: m.index });
  return out;
}

interface Ctx {
  game: Game;
  line: string;
  args: Tok[];
  ok: (msg: string) => void;
  /** `execute in`: the dimension the command runs in (default: the player's) */
  dim?: DimensionType;
}

type Handler = (c: Ctx) => void;

interface CommandDef {
  usage: string[];
  run: Handler;
  /** suggestions for argument index i given previous args */
  suggest?: (game: Game, prev: string[], i: number) => string[];
}

function needArg(c: Ctx, i: number): string {
  const a = c.args[i];
  if (!a) throw new CommandError('Unknown or incomplete command, see below for error', c.line.length);
  return a.s;
}

function badArg(c: Ctx, i: number, msg = 'Incorrect argument for command'): never {
  throw new CommandError(msg, c.args[i]?.pos ?? c.line.length);
}

function parseIntArg(c: Ctx, i: number, min = -2147483648, max = 2147483647): number {
  const s = needArg(c, i);
  if (!/^-?\d+$/.test(s)) badArg(c, i, `Expected integer`);
  const v = parseInt(s, 10);
  if (v < min) badArg(c, i, `Integer must not be less than ${min}, found ${v}`);
  if (v > max) badArg(c, i, `Integer must not be more than ${max}, found ${v}`);
  return v;
}

/** single-player target selector: the player only */
function target(c: Ctx, i: number, optional = true): string {
  const a = c.args[i];
  if (!a) {
    if (optional) return c.game.playerName;
    return needArg(c, i);
  }
  const s = a.s;
  if (s === '@s' || s === '@p' || s === '@a' || s === '@r' || s === '@e' || s.startsWith('@s[') || s.startsWith('@p[') || s.startsWith('@a[')) return c.game.playerName;
  if (s === c.game.playerName) return s;
  throw new CommandError('No player was found', a.pos);
}

/** vanilla EntitySelector subset: @s @p @a @r @e with [type=...] and [type=!...], or the player name */
function selectEntities(c: Ctx, i: number): Entity[] {
  const a = c.args[i];
  const g = c.game;
  if (!a) return [g.player];
  const s = a.s;
  if (s === g.playerName) return [g.player];
  const m = /^@([spare])(?:\[(.*)\])?$/.exec(s);
  if (!m) throw new CommandError('No player was found', a.pos);
  if (m[1] !== 'e') return [g.player];
  let list: Entity[] = g.level.entities.filter((e) => !e.removed);
  for (const cond of (m[2] ?? '').split(',').filter(Boolean)) {
    const [k, v0] = cond.split('=');
    if (k.trim() !== 'type') continue;
    let v = (v0 ?? '').trim();
    const neg = v.startsWith('!');
    if (neg) v = v.slice(1);
    v = v.replace(/^minecraft:/, '');
    list = list.filter((e) => (e.type === v) !== neg);
  }
  return list;
}

/** coordinate with ~ relative and integer block-centering (vanilla Vec3Argument) */
function coord(c: Ctx, i: number, base: number, center: boolean): number {
  const s = needArg(c, i);
  if (s.startsWith('~')) {
    const rest = s.slice(1);
    if (!rest) return base;
    const v = Number(rest);
    if (!Number.isFinite(v)) badArg(c, i, 'Expected double');
    return base + v;
  }
  if (s.startsWith('^')) badArg(c, i, 'Cannot mix world & local coordinates (everything must either use ^ or not)');
  const v = Number(s);
  if (!Number.isFinite(v) || s === '') badArg(c, i, 'Expected double');
  if (center && /^-?\d+$/.test(s)) return v + 0.5;
  return v;
}

function blockPos(c: Ctx, i: number): [number, number, number] {
  const p = c.game.player;
  const bx = Math.floor(p.x), by = Math.floor(p.y), bz = Math.floor(p.z);
  const rd = (k: number, base: number) => {
    const s = needArg(c, i + k);
    if (s.startsWith('~')) return base + Math.floor(Number(s.slice(1) || '0'));
    if (!/^-?\d+$/.test(s)) badArg(c, i + k, 'Expected integer');
    return parseInt(s, 10);
  };
  return [rd(0, bx), rd(1, by), rd(2, bz)];
}

function parseBlock(c: Ctx, i: number): number {
  const s = needArg(c, i).replace(/^minecraft:/, '');
  const name = s.split('[')[0];
  if (!BLOCK_BY_NAME.has(name)) throw new CommandError(`Unknown block type 'minecraft:${name}'`, c.args[i].pos);
  return stateFromString(s);
}

function f6(v: number): string {
  return v.toFixed(6);
}

function parseTime(c: Ctx, i: number): number {
  const s = needArg(c, i);
  const m = /^(-?\d+(?:\.\d+)?)([dst]?)$/.exec(s);
  if (!m) badArg(c, i, 'Invalid unit');
  const v = parseFloat(m[1]);
  const mul = m[2] === 'd' ? 24000 : m[2] === 's' ? 20 : 1;
  return Math.round(v * mul);
}

function giveXpPoints(game: Game, n: number): void {
  const p = game.player;
  const need = (l: number) => (l >= 30 ? 112 + (l - 30) * 9 : l >= 15 ? 37 + (l - 15) * 5 : 7 + l * 2);
  p.xpTotal = Math.max(0, p.xpTotal + n);
  p.xpProgress += n / need(p.xpLevel);
  while (p.xpProgress < 0) {
    const f = p.xpProgress * need(p.xpLevel);
    if (p.xpLevel > 0) {
      p.xpLevel--;
      p.xpProgress = 1 + f / need(p.xpLevel);
    } else {
      p.xpLevel = 0;
      p.xpProgress = 0;
    }
  }
  while (p.xpProgress >= 1) {
    p.xpProgress = (p.xpProgress - 1) * need(p.xpLevel);
    p.xpLevel++;
    p.xpProgress /= need(p.xpLevel);
  }
}

function giveXpLevels(game: Game, n: number): void {
  const p = game.player;
  p.xpLevel += n;
  if (p.xpLevel < 0) {
    p.xpLevel = 0;
    p.xpProgress = 0;
    p.xpTotal = 0;
  }
}

function itemIds(): string[] {
  return [...ITEMS.keys()].map((k) => 'minecraft:' + k);
}

function blockIds(): string[] {
  return [...BLOCK_BY_NAME.keys()].map((k) => 'minecraft:' + k);
}

function effectIds(): string[] {
  return Object.keys(MOB_EFFECTS).sort().map((k) => 'minecraft:' + k);
}

/** vanilla ResourceArgument for minecraft:mob_effect */
function parseEffect(c: Ctx, i: number): MobEffect {
  const s = needArg(c, i);
  const e = mobEffect(s);
  if (!e) throw new CommandError(`Can't find element '${s.includes(':') ? s : 'minecraft:' + s}' of type 'minecraft:mob_effect'`, c.args[i].pos);
  return e;
}

function parseBool(c: Ctx, i: number): boolean {
  const s = needArg(c, i);
  if (s !== 'true' && s !== 'false') throw new CommandError(`Invalid boolean, expected 'true' or 'false' but found '${s}'`, c.args[i].pos);
  return s === 'true';
}

function targetName(c: Ctx, e: Entity): string {
  return e === c.game.player ? c.game.playerName : entityDisplayName(e);
}

/** vanilla EffectCommands: give (instant effects default to 1 tick, others 30 s) and clear */
function effectCommand(c: Ctx): void {
  const sub = needArg(c, 0);
  if (sub === 'give') {
    needArg(c, 1);
    const targets = selectEntities(c, 1);
    if (!targets.length) throw new CommandError('No entity was found');
    const e = parseEffect(c, 2);
    let ticks = e.instant ? 1 : 600;
    let k = 3;
    if (c.args[3]?.s === 'infinite') {
      ticks = -1;
      k = 4;
    } else if (c.args[3]) {
      const secs = parseIntArg(c, 3, 1, 1000000);
      ticks = e.instant ? secs : secs * 20;
      k = 4;
    }
    const amp = c.args[k] ? parseIntArg(c, k, 0, 255) : 0;
    const showParticles = c.args[k + 1] ? !parseBool(c, k + 1) : true;
    let n = 0;
    for (const t of targets) if (t instanceof LivingEntity && t.addEffect(new MobEffectInstance(e, ticks, amp, false, showParticles), c.game.player)) n++;
    if (!n) throw new CommandError('Unable to apply this effect (target is either immune to effects, or has something stronger)');
    c.ok(targets.length === 1 ? `Applied effect ${e.name} to ${targetName(c, targets[0])}` : `Applied effect ${e.name} to ${targets.length} targets`);
  } else if (sub === 'clear') {
    const targets = selectEntities(c, 1);
    if (!targets.length) throw new CommandError('No entity was found');
    const e = c.args[2] ? parseEffect(c, 2) : null;
    let n = 0;
    for (const t of targets) if (t instanceof LivingEntity && (e ? t.removeEffect(e.id) : t.removeAllEffects())) n++;
    if (!n) throw new CommandError(e ? "Target doesn't have the requested effect" : 'Target has no effects to remove');
    const one = targets.length === 1;
    if (e) c.ok(one ? `Removed effect ${e.name} from ${targetName(c, targets[0])}` : `Removed effect ${e.name} from ${targets.length} targets`);
    else c.ok(one ? `Removed every effect from ${targetName(c, targets[0])}` : `Removed every effect from ${targets.length} targets`);
  } else badArg(c, 0);
}

/** vanilla EnchantCommand: add an enchantment to each target's main-hand item */
function enchantCommand(c: Ctx): void {
  needArg(c, 0);
  const targets = selectEntities(c, 0);
  if (!targets.length) throw new CommandError('No entity was found');
  const raw = needArg(c, 1);
  const id = raw.replace(/^minecraft:/, '');
  const def = ENCHANTMENTS.get(id);
  if (!def) throw new CommandError(`Can't find element '${raw.includes(':') ? raw : 'minecraft:' + raw}' of type 'minecraft:enchantment'`, c.args[1].pos);
  const level = c.args[2] ? parseIntArg(c, 2, 0) : 1;
  if (level > def.maxLevel) throw new CommandError(`${level} is higher than the maximum level of ${def.maxLevel} supported by that enchantment`);
  const one = targets.length === 1;
  let n = 0;
  for (const t of targets) {
    if (!(t instanceof LivingEntity)) {
      if (one) throw new CommandError(`${targetName(c, t)} is not a valid entity for this command`);
      continue;
    }
    const held = weaponOf(t);
    if (!held) {
      if (one) throw new CommandError(`${targetName(c, t)} is not holding any item`);
      continue;
    }
    const cur = craftingEnchants(held);
    if (canEnchant(def, held.item) && Object.keys(cur).every((k) => areCompatible(k, id))) {
      // (ItemEnchantments.Mutable.upgrade: keeps the higher level)
      if (level > 0) setCraftingEnchants(held, { ...cur, [id]: Math.max(cur[id] ?? 0, level) });
      n++;
    } else if (one) throw new CommandError(`${held.displayName()} cannot support that enchantment`);
  }
  if (!n) throw new CommandError('Nothing changed. Targets either have no item in their hands or the enchantment could not be applied');
  c.game.player.inventory.version++;
  const l = enchantmentLine(id, level);
  const full = `${l.curse ? '§c' : '§7'}${l.text}§r`;
  c.ok(one ? `Applied enchantment ${full} to ${targetName(c, targets[0])}'s item` : `Applied enchantment ${full} to ${targets.length} entities`);
}

/** the enchantments / stored_enchantments components of an item argument (vanilla ItemParser), e.g. [enchantments={levels:{sharpness:5}}] */
function itemComponents(raw: string, stack: ItemStack): void {
  const re = /(?:minecraft:)?(stored_enchantments|enchantments)=\{\s*levels\s*:\s*\{([^}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    const levels: Record<string, number> = {};
    for (const e of m[2].matchAll(/["']?(?:minecraft:)?([a-z_]+)["']?\s*:\s*(\d+)/g)) if (ENCHANTMENTS.has(e[1]) && +e[2] > 0) levels[e[1]] = Math.min(255, +e[2]);
    const tag = stack.tag ?? {};
    tag[m[1] === 'stored_enchantments' ? 'stored' : 'enchantments'] = levels;
    stack.tag = tag;
  }
  // dyed_color=<int> or dyed_color={rgb:<int>,show_in_tooltip:<bool>} (vanilla DyedItemColor.CODEC)
  const dm = /(?:minecraft:)?dyed_color=(?:\{([^}]*)\}|(-?\d+))/.exec(raw);
  const rgb = dm ? (dm[1] !== undefined ? /rgb\s*:\s*(-?\d+)/.exec(dm[1])?.[1] : dm[2]) : undefined;
  if (dm && rgb !== undefined) {
    const tag = stack.tag ?? {};
    tag.dyedColor = +rgb & 0xffffff;
    if (dm[1] !== undefined && /show_in_tooltip\s*:\s*(false|0b)/.test(dm[1])) tag.dyedHidden = true;
    stack.tag = tag;
  }
}

/** the top-level {...} entries of an SNBT list `key:[...]` */
function snbtEntries(nbt: string, key: string): string[] | null {
  const m = new RegExp(`\\b${key}\\s*:\\s*\\[`).exec(nbt);
  if (!m) return null;
  const out: string[] = [];
  let depth = 0, start = -1;
  for (let j = m.index + m[0].length; j < nbt.length; j++) {
    const ch = nbt[j];
    if (ch === '{' || ch === '[') {
      if (depth === 0) start = j;
      depth++;
    } else if (ch === '}' || ch === ']') {
      if (depth === 0) break;
      if (--depth === 0) out.push(nbt.slice(start, j + 1));
    }
  }
  return out;
}

/** an SNBT item: {id:"minecraft:iron_helmet",count:1,components:{"minecraft:enchantments":{levels:{...}},"minecraft:dyed_color":..}} */
function snbtStack(e: string): ItemStack | null {
  const id = /\bid\s*:\s*"?(?:minecraft:)?([a-z_]+)"?/.exec(e)?.[1];
  const it = id ? ITEMS.get(id) : undefined;
  if (!it) return null;
  const s = new ItemStack(it, Math.max(1, Math.min(it.maxStack, +(/\bcount\s*:\s*(\d+)/.exec(e)?.[1] ?? 1))));
  const dmg = /"?(?:minecraft:)?damage"?\s*:\s*(\d+)/.exec(e)?.[1];
  if (dmg && it.maxDamage) s.damage = Math.min(it.maxDamage, +dmg);
  itemComponents(e.replace(/"?(?:minecraft:)?(stored_enchantments|enchantments|dyed_color)"?\s*:/g, '$1='), s);
  return s;
}

/**
 * vanilla Mob.readAdditionalSaveData for /summon's entity data: ArmorItems (feet to head) and HandItems (main, off),
 * ArmorDropChances / HandDropChances, CanPickUpLoot, PersistenceRequired
 */
function mobData(m: Mob, nbt: string): void {
  const slots = { ArmorItems: ['feet', 'legs', 'chest', 'head'], HandItems: ['mainhand', 'offhand'] } as const;
  for (const [key, names] of Object.entries(slots)) {
    const list = snbtEntries(nbt, key);
    list?.forEach((e, i) => {
      if (i < names.length) m.setItemSlot(names[i], snbtStack(e));
    });
    const chances = new RegExp(`\\b${key === 'ArmorItems' ? 'ArmorDropChances' : 'HandDropChances'}\\s*:\\s*\\[([^\\]]*)\\]`).exec(nbt)?.[1];
    chances?.split(',').forEach((f, i) => {
      const v = parseFloat(f);
      if (i < names.length && !Number.isNaN(v)) m.setDropChance(names[i], v);
    });
  }
  const flag = (k: string) => new RegExp(`\\b${k}\\s*:\\s*(1b|true)`).test(nbt);
  if (/\bCanPickUpLoot\s*:/.test(nbt)) m.canPickUpLoot = flag('CanPickUpLoot');
  if (flag('PersistenceRequired')) m.persistenceRequired = true;
  // (Stage 4: illagers) vanilla Vindicator's Johnny flag, or the name Johnny (its setCustomName; names aren't kept yet)
  if (flag('Johnny') || /\bCustomName\s*:[^,}]*\bJohnny\b/.test(nbt)) (m as { setCustomName?: (n: string) => void }).setCustomName?.('Johnny');
}

const coordSuggest = (i: number) => ['~', '~ ~', '~ ~ ~'].slice(0, 3 - (i % 3));

export const COMMANDS: Record<string, CommandDef> = {
  clear: {
    usage: ['/clear [<targets>] [<item>] [<maxCount>]'],
    suggest: (_g, _p, i) => (i === 0 ? TARGETS : i === 1 ? itemIds() : []),
    run: (c) => {
      const name = target(c, 0);
      const inv = c.game.player.inventory;
      const filter = c.args[1]?.s.replace(/^minecraft:/, '');
      if (filter && !ITEMS.has(filter)) throw new CommandError(`Unknown item 'minecraft:${filter}'`, c.args[1].pos);
      let max = c.args[2] ? parseIntArg(c, 2, 0) : -1;
      let n = 0;
      const clr = (arr: (ItemStack | null)[]) => {
        for (let i = 0; i < arr.length; i++) {
          const s = arr[i];
          if (!s || (filter && s.item.id !== filter)) continue;
          const take = max < 0 ? s.count : Math.min(s.count, max - n);
          if (take <= 0) continue;
          n += take;
          s.count -= take;
          if (s.count <= 0) arr[i] = null;
        }
      };
      clr(inv.main);
      clr(inv.armor);
      inv.version++;
      if (max === 0) max = -1;
      if (n === 0) throw new CommandError(`No items were found on player ${name}`);
      c.ok(`Removed ${n} item(s) from player ${name}`);
    },
  },
  defaultgamemode: {
    usage: ['/defaultgamemode (adventure|creative|spectator|survival)'],
    suggest: (_g, _p, i) => (i === 0 ? [...GAME_MODES].sort() : []),
    run: (c) => {
      const m = needArg(c, 0);
      if (!GAME_MODES.includes(m as GameMode)) badArg(c, 0);
      if (c.game.meta) {
        c.game.meta.gameMode = m;
        if (!c.game.meta.transient) void saveWorldMeta(c.game.meta);
      }
      c.ok(`The default game mode is now ${MODE_NAME[m]}`);
    },
  },
  difficulty: {
    usage: ['/difficulty [peaceful|easy|normal|hard]'],
    suggest: (_g, _p, i) => (i === 0 ? ['easy', 'hard', 'normal', 'peaceful'] : []),
    run: (c) => {
      const lvl = c.game.level;
      if (!c.args[0]) {
        c.ok(`The difficulty is ${DIFF_NAME[lvl.difficulty]}`);
        return;
      }
      const d = c.args[0].s;
      if (!(DIFFS as readonly string[]).includes(d)) badArg(c, 0);
      if (lvl.difficulty === d) throw new CommandError(`The difficulty did not change; it is already set to ${DIFF_NAME[d]}`);
      lvl.difficulty = d as (typeof DIFFS)[number];
      c.game.player.food.difficulty = lvl.difficulty;
      if (c.game.meta) {
        c.game.meta.difficulty = d;
        if (!c.game.meta.transient) void saveWorldMeta(c.game.meta);
      }
      c.ok(`The difficulty has been set to ${DIFF_NAME[d]}`);
    },
  },
  effect: {
    usage: ['/effect (clear|give) ...'],
    suggest: (_g, prev, i) =>
      i === 0 ? ['clear', 'give'] : i === 1 ? TARGETS : i === 2 ? effectIds() : prev[0] === 'give' && i === 3 ? ['infinite'] : prev[0] === 'give' && i === 5 ? ['false', 'true'] : [],
    run: (c) => effectCommand(c),
  },
  enchant: {
    usage: ['/enchant <targets> <enchantment> [<level>]'],
    suggest: (_g, _p, i) => (i === 0 ? TARGETS : i === 1 ? [...ENCHANTMENTS.keys()].sort().map((k) => 'minecraft:' + k) : []),
    run: (c) => enchantCommand(c),
  },
  experience: {
    usage: ['/experience (add|query|set) ...'],
    suggest: (_g, prev, i) => (i === 0 ? ['add', 'query', 'set'] : i === 1 ? TARGETS : i === 2 && prev[0] === 'query' ? ['levels', 'points'] : i === 3 ? ['levels', 'points'] : []),
    run: (c) => xpCommand(c),
  },
  fill: {
    usage: ['/fill <from> <to> <block> [destroy|hollow|keep|outline|replace]'],
    suggest: (_g, _p, i) => (i < 6 ? coordSuggest(i) : i === 6 ? blockIds() : i === 7 ? ['destroy', 'hollow', 'keep', 'outline', 'replace'] : []),
    run: (c) => {
      const [x0, y0, z0] = blockPos(c, 0);
      const [x1, y1, z1] = blockPos(c, 3);
      const st = parseBlock(c, 6);
      const mode = c.args[7]?.s ?? 'replace';
      if (!['destroy', 'hollow', 'keep', 'outline', 'replace'].includes(mode)) badArg(c, 7);
      const ax = Math.min(x0, x1), bx = Math.max(x0, x1), ay = Math.min(y0, y1), by = Math.max(y0, y1), az = Math.min(z0, z1), bz = Math.max(z0, z1);
      const vol = (bx - ax + 1) * (by - ay + 1) * (bz - az + 1);
      if (vol > 32768) throw new CommandError(`Too many blocks in the specified area (maximum 32768, specified ${vol})`);
      const lvl = c.game.level;
      let n = 0;
      for (let y = ay; y <= by; y++)
        for (let z = az; z <= bz; z++)
          for (let x = ax; x <= bx; x++) {
            if (y < MIN_Y || y >= MAX_Y || !c.game.world.getChunk(x >> 4, z >> 4)) continue;
            const edge = x === ax || x === bx || y === ay || y === by || z === az || z === bz;
            let want = st;
            if (mode === 'hollow' && !edge) want = 0;
            if (mode === 'outline' && !edge) continue;
            const cur = lvl.getState(x, y, z);
            if (mode === 'keep' && cur !== 0) continue;
            if (cur === want) continue;
            lvl.setBlock(x, y, z, want);
            n++;
          }
      if (!n) throw new CommandError('No blocks were filled');
      c.ok(`Successfully filled ${n} block(s)`);
    },
  },
  gamemode: {
    usage: ['/gamemode <gamemode> [<target>]'],
    suggest: (_g, _p, i) => (i === 0 ? ['adventure', 'creative', 'spectator', 'survival'] : i === 1 ? TARGETS : []),
    run: (c) => {
      const m = needArg(c, 0);
      if (!GAME_MODES.includes(m as GameMode)) throw new CommandError(`Unknown game mode: ${m}`, c.args[0].pos);
      target(c, 1);
      const p = c.game.player;
      if (p.gameMode === m) return;
      p.setGameMode(m as GameMode);
      c.ok(`Set own game mode to ${MODE_NAME[m]}`);
    },
  },
  gamerule: {
    usage: ['/gamerule <rule> [<value>]'],
    suggest: (_g, prev, i) => (i === 0 ? Object.keys(GAME_RULES).sort() : i === 1 && typeof GAME_RULES[prev[0]] === 'boolean' ? ['false', 'true'] : []),
    run: (c) => {
      const rule = needArg(c, 0);
      if (!(rule in GAME_RULES)) throw new CommandError('Unknown or incomplete command, see below for error', c.args[0].pos);
      const rules = c.game.level.gameRules;
      if (!c.args[1]) {
        c.ok(`Gamerule ${rule} is currently set to: ${rules[rule]}`);
        return;
      }
      const v = c.args[1].s;
      if (typeof GAME_RULES[rule] === 'boolean') {
        if (v !== 'true' && v !== 'false') throw new CommandError(`Invalid boolean, expected 'true' or 'false' but found '${v}'`, c.args[1].pos);
        rules[rule] = v === 'true';
      } else {
        rules[rule] = parseIntArg(c, 1);
      }
      c.game.applyGameRules();
      c.ok(`Gamerule ${rule} is now set to: ${rules[rule]}`);
    },
  },
  give: {
    usage: ['/give <targets> <item> [<count>]'],
    suggest: (_g, _p, i) => (i === 0 ? TARGETS : i === 1 ? itemIds() : []),
    run: (c) => {
      const name = target(c, 0, false);
      const id = needArg(c, 1).replace(/^minecraft:/, '').split('[')[0].split('{')[0];
      const item = ITEMS.get(id);
      if (!item) throw new CommandError(`Unknown item 'minecraft:${id}'`, c.args[1].pos);
      const count = c.args[2] ? parseIntArg(c, 2, 1) : 1;
      if (count > item.maxStack * 100) throw new CommandError(`Can't give more than ${item.maxStack * 100} of ${item.name}`);
      const p = c.game.player;
      let left = count;
      while (left > 0) {
        const n = Math.min(item.maxStack, left);
        left -= n;
        const stack = new ItemStack(item, n);
        itemComponents(c.args[1].s, stack);
        const rest = p.inventory.add(stack);
        if (rest > 0) {
          const e = new ItemEntity(c.game.level, stack.copyWithCount(rest));
          e.moveTo(p.x, p.y + 0.5, p.z);
          e.pickupDelay = 0;
          c.game.level.addEntity(e);
        }
      }
      p.inventory.version++;
      c.game.sound.play('entity.item.pickup', p.x, p.y, p.z, 0.2, ((Math.random() - Math.random()) * 0.7 + 1) * 2);
      c.ok(`Gave ${count} [${item.name}] to ${name}`);
    },
  },
  help: {
    usage: ['/help [<command>]'],
    suggest: (_g, _p, i) => (i === 0 ? Object.keys(COMMANDS).sort() : []),
    run: (c) => {
      const cheats = !!c.game.meta?.allowCommands;
      const names = c.args[0] ? [c.args[0].s] : Object.keys(COMMANDS).sort();
      for (const n of names) {
        const d = COMMANDS[n];
        if (!d || (!cheats && !PUBLIC.has(n))) {
          if (c.args[0]) throw new CommandError('Unknown or incomplete command, see below for error', c.args[0].pos);
          continue;
        }
        for (const u of d.usage) c.ok(u);
      }
    },
  },
  kill: {
    usage: ['/kill [<targets>]'],
    suggest: (_g, _p, i) => (i === 0 ? [...TARGETS, '@e[type=!player]'] : []),
    run: (c) => {
      const list = selectEntities(c, 0);
      if (!list.length) throw new CommandError('No entity was found');
      for (const e of list) {
        if (e === c.game.player) {
          const p = c.game.player;
          p.invulnerableTime = 0;
          p.hurt(Number.MAX_VALUE / 2, 'genericKill');
          if (p.health > 0) {
            p.health = 0;
            p.die('genericKill');
          }
        } else if (e instanceof LivingEntity && e.type !== 'ender_dragon') {
          e.invulnerableTime = 0;
          e.hurt(Number.MAX_VALUE / 2, 'genericKill');
        } else e.kill();
      }
      c.ok(list.length === 1 ? `Killed ${list[0] === c.game.player ? c.game.playerName : entityDisplayName(list[0])}` : `Killed ${list.length} entities`);
    },
  },
  summon: {
    usage: ['/summon <entity> [<pos>] [<nbt>]'],
    suggest: (_g, _p, i) => (i === 0 ? summonableTypes().map((t) => 'minecraft:' + t) : i < 4 ? coordSuggest(i - 1) : []),
    run: (c) => {
      const type = needArg(c, 0).replace(/^minecraft:/, '');
      const p = c.game.player;
      const x = c.args[1] ? coord(c, 1, p.x, true) : p.x;
      const y = c.args[2] ? coord(c, 2, p.y, false) : p.y;
      const z = c.args[3] ? coord(c, 3, p.z, true) : p.z;
      const lvl = c.game.level;
      let e: Entity | null = null;
      if (type === 'tnt') e = new PrimedTnt(lvl, x, y, z, null);
      else if (type === 'experience_orb') e = new ExperienceOrb(lvl, x, y, z, 1);
      else if (type === 'lightning_bolt') {
        const bolt = new LightningBolt(lvl);
        bolt.moveTo(x, y, z);
        e = bolt;
      }
      else if (type === 'arrow' || type === 'trident') {
        const a = type === 'trident' ? new ThrownTrident(lvl, null) : new Arrow(lvl, null);
        a.moveTo(x, y, z);
        e = a;
      } else if (MINECART_TYPES.includes(type)) {
        const cart = createMinecart(type, lvl)!;
        cart.moveTo(x, y, z, 0, 0);
        e = cart;
      } else if (type === 'end_crystal') {
        // (entity data: {ShowBottom:0b} hides the plinth)
        const cr = new EndCrystal(lvl, x, y, z);
        if (c.args[4] && /ShowBottom:\s*(0b|false)/.test(c.line.slice(c.args[4].pos))) cr.showBottom = false;
        e = cr;
      } else if (BOAT_TYPES.includes(type)) {
        // the wood is entity data in 1.21: /summon boat ~ ~ ~ {Type:"spruce"}
        const wood = c.args[4] ? /Type:\s*"?([a-z_]+)"?/.exec(c.line.slice(c.args[4].pos))?.[1] : undefined;
        const boat = createBoat(type, lvl, wood && BOAT_WOODS.includes(wood) ? wood : 'oak')!;
        boat.moveTo(x, y, z, 0, 0);
        e = boat;
      } else {
        const m = createMob(type, lvl);
        if (!m) throw new CommandError(`Can't find element 'minecraft:${type}' of type 'minecraft:entity_type'`, c.args[0].pos);
        m.moveTo(x, y, z, Math.random() * 360, 0);
        m.bodyYaw = m.headYaw = m.yaw;
        // (vanilla SummonCommand: a mob given entity data isn't finalized: none of the random gear)
        const nbt = c.args[4] ? c.line.slice(c.args[4].pos) : '';
        if (nbt.trimStart().startsWith('{')) mobData(m, nbt);
        else m.finalizeSpawn('command');
        // (entity data: a charged creeper is {powered:1b})
        if (m instanceof Creeper && /powered:\s*(1b|true)/.test(nbt)) m.powered = true;
        e = m;
      }
      lvl.addEntity(e);
      c.ok(`Summoned new ${entityDisplayName(e)}`);
    },
  },
  list: {
    usage: ['/list'],
    run: (c) => c.ok(`There are 1 of a max of 8 players online: ${c.game.playerName}`),
  },
  locate: {
    usage: ['/locate structure <structure>', '/locate biome <biome>', '/locate poi <poi>'],
    suggest: (_g, prev, i) => (i === 0 ? ['biome', 'poi', 'structure'] : i === 1 && prev[0] === 'structure' ? [...STRUCTURES].sort() : []),
    run: (c) => {
      // (only structures so far)
      if (needArg(c, 0) !== 'structure') badArg(c, 0);
      const id = needArg(c, 1);
      const name = id.includes(':') ? id : 'minecraft:' + id;
      if (!STRUCTURES.has(name)) throw new CommandError(`There is no structure with type "${id}"`);
      const dim = c.dim ?? c.game.world.dim;
      const p = c.game.player;
      const x = Math.floor(p.x), z = Math.floor(p.z);
      const village = /^minecraft:village_(plains|desert|savanna|snowy|taiga)$/.exec(name)?.[1] as VillageKind | undefined;
      const found =
        name === 'minecraft:fortress' && dim.id === 'the_nether'
          ? c.game.level.fortresses().nearest(x, z)
          : name === 'minecraft:stronghold' && dim.id === 'overworld'
            ? c.game.level.strongholds().nearest(p.x, p.y, p.z)
            : village && dim.id === 'overworld'
              ? c.game.level.villages().nearest(village, x, z)
              : name === 'minecraft:pillager_outpost' && dim.id === 'overworld'
                ? locateOutpost(c.game.level, x, z)
                : // (Stage 5: ocean)
                  name === 'minecraft:monument' && dim.id === 'overworld'
                  ? locateMonument(c.game.level, x, z)
                  : null;
      if (!found) throw new CommandError(`Could not find a structure of type "${name}" nearby`);
      c.ok(`The nearest ${name} is at §a[${found[0]}, ~, ${found[1]}]§r (${Math.floor(Math.hypot(found[0] - x, found[1] - z))} blocks away)`);
    },
  },
  me: {
    usage: ['/me <action>'],
    run: (c) => {
      needArg(c, 0);
      c.game.chat(`* ${c.game.playerName} ${c.line.slice(c.args[0].pos)}`);
    },
  },
  say: {
    usage: ['/say <message>'],
    run: (c) => {
      needArg(c, 0);
      c.game.chat(`[${c.game.playerName}] ${c.line.slice(c.args[0].pos)}`);
    },
  },
  seed: {
    usage: ['/seed'],
    run: (c) => c.ok(`Seed: §a[${c.game.meta?.seed ?? c.game.level.seed}]`),
  },
  setblock: {
    usage: ['/setblock <pos> <block> [destroy|keep|replace]'],
    suggest: (_g, _p, i) => (i < 3 ? coordSuggest(i) : i === 3 ? blockIds() : i === 4 ? ['destroy', 'keep', 'replace'] : []),
    run: (c) => {
      const [x, y, z] = blockPos(c, 0);
      const st = parseBlock(c, 3);
      const mode = c.args[4]?.s ?? 'replace';
      if (y < MIN_Y || y >= MAX_Y || !c.game.world.getChunk(x >> 4, z >> 4)) throw new CommandError('That position is not loaded');
      const lvl = c.game.level;
      const cur = lvl.getState(x, y, z);
      if ((mode === 'keep' && cur !== 0) || cur === st) throw new CommandError('Could not set the block');
      lvl.setBlock(x, y, z, st);
      c.ok(`Changed the block at ${x}, ${y}, ${z}`);
    },
  },
  setworldspawn: {
    usage: ['/setworldspawn [<pos>] [<angle>]'],
    suggest: (_g, _p, i) => (i < 3 ? coordSuggest(i) : []),
    run: (c) => {
      const [x, y, z] = c.args[0] ? blockPos(c, 0) : [Math.floor(c.game.player.x), Math.floor(c.game.player.y), Math.floor(c.game.player.z)];
      c.game.worldSpawn = [x, y, z];
      c.ok(`Set the world spawn point to ${x}, ${y}, ${z} [0.0]`);
    },
  },
  spawnpoint: {
    usage: ['/spawnpoint [<targets>] [<pos>] [<angle>]'],
    suggest: (_g, _p, i) => (i === 0 ? TARGETS : i < 4 ? coordSuggest(i - 1) : []),
    run: (c) => {
      const name = target(c, 0);
      const p = c.game.player;
      const [x, y, z] = c.args[1] ? blockPos(c, 1) : [Math.floor(p.x), Math.floor(p.y), Math.floor(p.z)];
      p.respawnPos = [x, y, z];
      p.respawnForced = true;
      c.ok(`Set spawn point to ${x}, ${y}, ${z} [0.0] in minecraft:overworld for ${name}`);
    },
  },
  execute: {
    usage: ['/execute in <dimension> run <command>', '/execute run <command>'],
    suggest: (_g, prev, i) => {
      const k = prev[i - 1];
      if (i === 0 || (k !== 'in' && prev[i - 2] === 'in')) return ['in', 'run'];
      if (k === 'in') return Object.keys(DIMENSIONS).map((d) => 'minecraft:' + d);
      if (k === 'run') return Object.keys(COMMANDS);
      return [];
    },
    run: (c) => executeSubcommand(c),
  },
  teleport: {
    usage: ['/teleport <location>', '/teleport <destination>', '/teleport <targets> <location>'],
    suggest: (_g, _p, i) => (i < 3 ? ['~', '~ ~', '~ ~ ~', ...TARGETS].slice(0, 3 - i) : []),
    run: (c) => tpCommand(c),
  },
  time: {
    usage: ['/time (add|query|set) ...'],
    suggest: (_g, prev, i) => (i === 0 ? ['add', 'query', 'set'] : i === 1 && prev[0] === 'set' ? ['day', 'midnight', 'night', 'noon'] : i === 1 && prev[0] === 'query' ? ['day', 'daytime', 'gametime'] : []),
    run: (c) => {
      const lvl = c.game.level;
      const sub = needArg(c, 0);
      if (sub === 'set') {
        const named: Record<string, number> = { day: 1000, noon: 6000, night: 13000, midnight: 18000 };
        const s = needArg(c, 1);
        const t = s in named ? named[s] : parseTime(c, 1);
        lvl.dayTime = t;
        c.ok(`Set the time to ${t % 24000}`);
      } else if (sub === 'add') {
        const t = parseTime(c, 1);
        lvl.dayTime += t;
        c.ok(`Set the time to ${((lvl.dayTime % 24000) + 24000) % 24000}`);
      } else if (sub === 'query') {
        const q = needArg(c, 1);
        if (q === 'daytime') c.ok(`The time is ${lvl.dayTime % 24000}`);
        else if (q === 'gametime') c.ok(`The time is ${lvl.gameTime}`);
        else if (q === 'day') c.ok(`The time is ${Math.floor(lvl.dayTime / 24000)}`);
        else badArg(c, 1);
      } else badArg(c, 0);
    },
  },
  weather: {
    usage: ['/weather (clear|rain|thunder) [<duration>]'],
    suggest: (_g, _p, i) => (i === 0 ? ['clear', 'rain', 'thunder'] : []),
    run: (c) => {
      const w = needArg(c, 0);
      if (w !== 'clear' && w !== 'rain' && w !== 'thunder') badArg(c, 0);
      const r = Math.random;
      const dur = c.args[1]
        ? parseTime(c, 1)
        : w === 'clear'
          ? 12000 + Math.floor(r() * 168000)
          : w === 'rain'
            ? 12000 + Math.floor(r() * 12000)
            : 3600 + Math.floor(r() * 12000);
      c.game.level.setWeather(w, dur);
      c.ok(w === 'clear' ? 'Set the weather to clear' : w === 'rain' ? 'Set the weather to rain' : 'Set the weather to rain & thunder');
    },
  },
};
COMMANDS.tp = COMMANDS.teleport;
COMMANDS.xp = COMMANDS.experience;

function xpCommand(c: Ctx): void {
  const sub = needArg(c, 0);
  const name = target(c, 1, false);
  const p = c.game.player;
  if (sub === 'query') {
    const kind = c.args[2]?.s ?? 'points';
    if (kind === 'levels') c.ok(`${name} has ${p.xpLevel} experience levels`);
    else if (kind === 'points') {
      const need = p.xpLevel >= 30 ? 112 + (p.xpLevel - 30) * 9 : p.xpLevel >= 15 ? 37 + (p.xpLevel - 15) * 5 : 7 + p.xpLevel * 2;
      c.ok(`${name} has ${Math.floor(p.xpProgress * need)} experience points`);
    } else badArg(c, 2);
    return;
  }
  const n = parseIntArg(c, 2, sub === 'set' ? 0 : -2147483648);
  const kind = c.args[3]?.s ?? 'points';
  if (kind !== 'levels' && kind !== 'points') badArg(c, 3);
  if (sub === 'add') {
    if (kind === 'levels') giveXpLevels(c.game, n);
    else giveXpPoints(c.game, n);
    c.ok(`Gave ${n} experience ${kind} to ${name}`);
  } else if (sub === 'set') {
    if (kind === 'levels') {
      p.xpLevel = n;
    } else {
      const need = p.xpLevel >= 30 ? 112 + (p.xpLevel - 30) * 9 : p.xpLevel >= 15 ? 37 + (p.xpLevel - 15) * 5 : 7 + p.xpLevel * 2;
      if (n > need) throw new CommandError('Unable to set experience points above the maximum points for the player\'s current level');
      p.xpProgress = n / need;
    }
    c.ok(`Set ${n} experience ${kind} on ${name}`);
  } else badArg(c, 0);
}

function tpCommand(c: Ctx): void {
  const p = c.game.player;
  const n = c.args.length;
  if (n === 0) needArg(c, 0);
  const first = c.args[0].s;
  const isTarget = first.startsWith('@') || first === c.game.playerName;
  if (n === 1 && isTarget) {
    const name = target(c, 0);
    c.ok(`Teleported ${name} to ${name}`);
    return;
  }
  const off = isTarget ? 1 : 0;
  if (isTarget) target(c, 0);
  const x = coord(c, off, p.x, true);
  const y = coord(c, off + 1, p.y, false);
  const z = coord(c, off + 2, p.z, true);
  let yaw = p.yaw, pitch = p.pitch;
  if (c.args[off + 3]) yaw = coord(c, off + 3, p.yaw, false);
  if (c.args[off + 4]) pitch = Math.max(-90, Math.min(90, coord(c, off + 4, p.pitch, false)));
  if (y < -20000000 || y > 20000000 || Math.abs(x) > 30000000 || Math.abs(z) > 30000000) throw new CommandError('Invalid position for teleport');
  if (c.dim && c.dim !== c.game.world.dim) {
    // to another dimension: the position as given (vanilla execute in doesn't scale it), and it counts as
    // changing dimension (vanilla ServerPlayer.teleportTo → triggerDimensionChangeTriggers)
    p.yaw = yaw;
    p.pitch = pitch;
    const from = c.game.world.dim, to = c.dim;
    c.game.changeDimension(to, x, y, z, (g) => {
      g.onChangedDimension(from, to);
      return true;
    }, true);
  } else c.game.teleport(x, y, z, yaw, pitch);
  c.ok(`Teleported ${c.game.playerName} to ${f6(x)}, ${f6(y)}, ${f6(z)}`);
}

/** vanilla ExecuteCommand, the `in` modifier only: `execute [in <dimension>]... run <command>` */
function executeSubcommand(c: Ctx): void {
  let i = 0;
  let dim = c.dim;
  for (;;) {
    const k = needArg(c, i);
    if (k === 'in') {
      const id = needArg(c, i + 1).replace(/^minecraft:/, '');
      dim = DIMENSIONS[id as keyof typeof DIMENSIONS];
      if (!dim) throw new CommandError(`Unknown dimension 'minecraft:${id}'`, c.args[i + 1].pos);
      i += 2;
    } else if (k === 'run') {
      i++;
      break;
    } else badArg(c, i);
  }
  const name = needArg(c, i).replace(/^minecraft:/, '');
  const def = COMMANDS[name];
  if (!def) badArg(c, i, 'Unknown or incomplete command, see below for error');
  def.run({ ...c, args: c.args.slice(i + 1), dim });
}

/** run a command line (without the leading slash) */
export function executeCommand(game: Game, line: string): void {
  const args = tokenize(line);
  const cmd = args.shift();
  const cheats = !!game.meta?.allowCommands;
  const err = (msg: string, pos: number) => {
    game.chat('§c' + msg);
    if (pos >= 0) {
      const before = line.slice(Math.max(0, pos - 10), pos);
      const after = line.slice(pos);
      game.chat(`§7${pos > 10 ? '...' : ''}${before}§c${after}§c<--[HERE]`);
    }
  };
  if (!cmd) {
    err('Unknown or incomplete command, see below for error', 0);
    return;
  }
  const name = cmd.s.replace(/^minecraft:/, '');
  const def = COMMANDS[name];
  if (!def || (!cheats && !PUBLIC.has(name))) {
    err('Unknown or incomplete command, see below for error', 0);
    return;
  }
  const ctx: Ctx = { game, line, args, ok: (m) => game.chat(m) };
  try {
    def.run(ctx);
  } catch (e) {
    if (e instanceof CommandError) {
      if (e.message === 'Unknown or incomplete command, see below for error' || e.message === 'Incorrect argument for command' || e.pos >= 0) err(e.message, e.pos);
      else game.chat('§c' + e.message);
    } else {
      console.error(e);
      game.chat('§cAn unexpected error occurred trying to execute that command');
    }
  }
}

/** suggestions for the token at the end of `text` (text excludes the slash) */
export function suggestCommand(game: Game, text: string): { start: number; list: string[] } {
  const cheats = !!game.meta?.allowCommands;
  const toks = tokenize(text);
  const endsWithSpace = text.length === 0 || /\s$/.test(text);
  const cur = endsWithSpace ? '' : toks[toks.length - 1]?.s ?? '';
  const start = endsWithSpace ? text.length : toks[toks.length - 1]?.pos ?? 0;
  const idx = endsWithSpace ? toks.length : toks.length - 1;
  const match = (list: string[]) => {
    const q = cur.toLowerCase();
    return list.filter((s) => {
      const l = s.toLowerCase();
      return l.startsWith(q) || (l.startsWith('minecraft:') && l.slice(10).startsWith(q));
    });
  };
  if (idx === 0) {
    const names = Object.keys(COMMANDS).filter((n) => cheats || PUBLIC.has(n)).sort();
    return { start, list: match(names) };
  }
  const def = COMMANDS[toks[0].s.replace(/^minecraft:/, '')];
  if (!def?.suggest || (!cheats && !PUBLIC.has(toks[0].s))) return { start, list: [] };
  const prev = toks.slice(1, idx).map((t) => t.s);
  return { start, list: match(def.suggest(game, prev, idx - 1)) };
}

export function describeBlock(st: number): string {
  return BLOCKS[STATE_BLOCK[st]].name;
}
