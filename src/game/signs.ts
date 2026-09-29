// What signs do (vanilla SignBlock, StandingSignBlock, WallSignBlock, CeilingHangingSignBlock, WallHangingSignBlock,
// SignItem, HangingSignItem, StandingAndWallBlockItem, the SignApplicators and ServerGamePacketListenerImpl's
// handleSignUpdate): a sign stands on a block or goes on the side of one, whichever the player looks at first allows, a
// hanging sign hangs under a block or from the side of one; placed, its editor opens for the front. Clicked, its editor
// opens for the side the player is on, unless it's waxed (then it only knocks) or somebody else is editing it. A dye
// colours the text of the side clicked, a glow ink sac makes it glow and an ink sac stops it; honeycomb waxes the sign
// for good. What the editor sends is checked as the server checks it: the player who may edit it, near enough, the
// sign not waxed, four lines no longer than 384 characters, with no formatting or control characters. The blocks are in
// world/blocksSigns, the block entity in world/signBlockEntity, the looks in render/signRenderer and the editor in
// gui/screens/signEdit.

import { BLOCKS, STATE_BLOCK, COLLISION, FACE_OCC, getBlock, type Block, type Box } from '../world/block';
import { DOWN, UP, DX, DZ, DIR_NAMES, OPPOSITE, dirFromYaw, type Dir } from '../world/dir';
import type { World } from '../world/world';
import { registerBehavior, type ItemUseResult, type UseContext } from './blockBehavior';
import { lookingDirections, type PlaceContext } from './blockRules';
import { legacySolid } from './banners';
import { particlesOnFaces } from './copper';
import { mayBuild } from '../inventory/lecternMenu';
import { SignBlockEntity, SignText, SIGN_COLORS, SIGN_LINES, cleanSignLine, playerTooFarToEdit, MAX_SIGN_LINE_LENGTH, type SignColor } from '../world/signBlockEntity';
import { SIGN_WOODS, signOf, isHangingSign, isWallHangingSign, hangingSignShape } from '../world/blocksSigns';
import type { ItemStack } from '../item/item';
import type { Player } from '../entity/player';
import type { Level } from './level';

const blk = (st: number): Block => BLOCKS[STATE_BLOCK[st]];
const px = (v: number) => v / 16;

// ---------------------------------------------------------------------------
// Where they go

/** vanilla BlockPlaceContext.getNearestLookingDirections (as game/banners.ts has it) */
function nearestLookingDirections(ctx: PlaceContext): number[] {
  const dirs = lookingDirections(ctx.yaw, ctx.pitch);
  if (ctx.replaceClicked) return dirs;
  const first = OPPOSITE[ctx.face];
  return [first, ...dirs.filter((d) => d !== first)];
}

/** vanilla getStateForPlacement's WATERLOGGED: placed into still water */
function inWater(world: World, x: number, y: number, z: number): boolean {
  const cur = world.getState(x, y, z);
  const b = blk(cur);
  return (b.name === 'water' && b.get<number>(cur, 'level') === 0) || (b.propIndex('waterlogged') >= 0 && b.get<boolean>(cur, 'waterlogged'));
}

/** vanilla RotationSegment.convertToSegment(yRot + 180): a sign turned to face whoever placed it */
export function signRotation(yaw: number): number {
  return Math.floor(((yaw + 180) * 16) / 360 + 0.5) & 15;
}

/** vanilla StandingSignBlock.canSurvive: something solid under it */
function standingSurvives(world: World, x: number, y: number, z: number): boolean {
  return legacySolid(world.getState(x, y - 1, z));
}

/** vanilla WallSignBlock.canSurvive: something solid behind it */
function wallSurvives(world: World, x: number, y: number, z: number, st: number): boolean {
  const f = DIR_NAMES.indexOf(blk(st).get<string>(st, 'facing') as (typeof DIR_NAMES)[number]);
  return legacySolid(world.getState(x - DX[f], y, z - DZ[f]));
}

/**
 * vanilla BlockBehaviour.getBlockSupportShape: what a block holds up with (its collision shape; a hanging sign's is its
 * whole shape, so signs hang one under another; leaves hold nothing up)
 */
function supportBoxes(st: number): Box[] {
  const b = blk(st);
  const s = signOf(b.name);
  if (s?.kind === 'hanging_sign') return hangingSignShape(b.get<number>(st, 'rotation'));
  if (s?.kind === 'wall_hanging_sign') {
    const ew = b.get<string>(st, 'facing') === 'east' || b.get<string>(st, 'facing') === 'west';
    return ew ? [[px(6), px(14), 0, px(10), 1, 1], [px(7), 0, px(1), px(9), px(10), px(15)]] : [[0, px(14), px(6), 1, 1, px(10)], [px(1), 0, px(7), px(15), px(10), px(9)]];
  }
  if (b.s.isLeaves) return [];
  // (vanilla SoulSandBlock / MudBlock.getBlockSupportShape: a whole block, though they're lower)
  if (FACE_OCC[st] === 63 || b.name === 'soul_sand' || b.name === 'mud') return [[0, 0, 0, 1, 1, 1]];
  return COLLISION[st] ?? [];
}

/** the part of `boxes` on face `face` of the block, as rectangles across it (pixels: the face's two other axes) */
function faceRects(boxes: Box[], face: Dir): [number, number, number, number][] {
  const out: [number, number, number, number][] = [];
  for (const b of boxes) {
    const [x0, y0, z0, x1, y1, z1] = b.map((v) => v * 16);
    if (face === DOWN && y0 <= 0) out.push([x0, z0, x1, z1]);
    else if (face === UP && y1 >= 16) out.push([x0, z0, x1, z1]);
    else if (face === 2 && z0 <= 0) out.push([x0, y0, x1, y1]);
    else if (face === 3 && z1 >= 16) out.push([x0, y0, x1, y1]);
    else if (face === 4 && x0 <= 0) out.push([z0, y0, z1, y1]);
    else if (face === 5 && x1 >= 16) out.push([z0, y0, z1, y1]);
  }
  return out;
}

/** whether the rectangles cover [a0, a1] × [b0, b1] (checked every quarter pixel) */
function covers(rects: [number, number, number, number][], a0: number, b0: number, a1: number, b1: number): boolean {
  if (!rects.length) return false;
  for (let a = a0 + 0.125; a < a1; a += 0.25)
    for (let b = b0 + 0.125; b < b1; b += 0.25) if (!rects.some((r) => a >= r[0] && a <= r[2] && b >= r[1] && b <= r[3])) return false;
  return true;
}

/** vanilla isFaceSturdy(SupportType.CENTER): the face's middle two pixels square held up */
export function centerSturdy(st: number, face: Dir): boolean {
  return covers(faceRects(supportBoxes(st), face), 7, 7, 9, 9);
}

/** vanilla isFaceSturdy(SupportType.FULL): the whole face */
export function fullSturdy(st: number, face: Dir): boolean {
  return covers(faceRects(supportBoxes(st), face), 0, 0, 16, 16);
}

/** vanilla CeilingHangingSignBlock.canSurvive: the middle of the underside of the block above holds it */
function ceilingSurvives(world: World, x: number, y: number, z: number): boolean {
  return centerSturdy(world.getState(x, y + 1, z), DOWN);
}

/** vanilla Direction.getClockWise of a horizontal facing name */
const CLOCKWISE: Record<string, number> = { north: 5, east: 3, south: 4, west: 2 };

/** vanilla Block.isFaceFull(getCollisionShape(), DOWN): a full underside (a hanging sign hangs from it on straight chains) */
function fullUnderside(st: number): boolean {
  return covers(faceRects(COLLISION[st] ?? [], DOWN), 0, 0, 16, 16);
}

/**
 * vanilla WallHangingSignBlock.canAttachTo: a wall hanging sign swings from a full side of a block, or from another
 * wall hanging sign turned the same way
 */
function canAttachTo(world: World, facing: string, x: number, y: number, z: number, face: Dir): boolean {
  const st = world.getState(x, y, z);
  const b = blk(st);
  if (isWallHangingSign(b.name)) {
    const other = b.get<string>(st, 'facing');
    return (other === 'north' || other === 'south') === (facing === 'north' || facing === 'south');
  }
  return fullSturdy(st, face);
}

/** vanilla WallHangingSignBlock.canPlace: a block to hang from on either side along the bracket */
function wallHangingCanPlace(world: World, x: number, y: number, z: number, facing: string): boolean {
  const cw = CLOCKWISE[facing], ccw = OPPOSITE[cw];
  return canAttachTo(world, facing, x + DX[cw], y, z + DZ[cw], ccw as Dir) || canAttachTo(world, facing, x + DX[ccw], y, z + DZ[ccw], cw as Dir);
}

/** vanilla WallSignBlock.getStateForPlacement: the first way the player looks with something solid there to go on */
function wallSignPlacement(wall: Block, ctx: PlaceContext): number | null {
  for (const d of nearestLookingDirections(ctx)) {
    if (d === UP || d === DOWN) continue;
    const st = wall.state({ facing: DIR_NAMES[OPPOSITE[d]] });
    if (wallSurvives(ctx.world, ctx.x, ctx.y, ctx.z, st)) return wall.with(st, 'waterlogged', inWater(ctx.world, ctx.x, ctx.y, ctx.z));
  }
  return null;
}

/**
 * vanilla WallHangingSignBlock.getStateForPlacement: the first way the player looks, across the face clicked, with a
 * block to hang from along it
 */
function wallHangingPlacement(wall: Block, ctx: PlaceContext): number | null {
  const clickedAxis = ctx.face >> 1;
  for (const d of nearestLookingDirections(ctx)) {
    if (d === UP || d === DOWN || d >> 1 === clickedAxis) continue;
    const facing = DIR_NAMES[OPPOSITE[d]];
    if (wallHangingCanPlace(ctx.world, ctx.x, ctx.y, ctx.z, facing)) return wall.state({ facing, waterlogged: inWater(ctx.world, ctx.x, ctx.y, ctx.z) });
  }
  return null;
}

/** vanilla RotationSegment.convertToDirection: the way a hanging sign square to the world faces (null between) */
function rotationDirection(r: number): number | null {
  return r === 0 ? 2 : r === 4 ? 5 : r === 8 ? 3 : r === 12 ? 4 : null;
}

/**
 * vanilla CeilingHangingSignBlock.getStateForPlacement: on straight chains, square to the world and facing the player,
 * from a full underside; on a vee of chains, turned to face the player, from anything narrower or when sneaking; under
 * another hanging sign turned the same way it hangs straight on, whatever's above
 */
function ceilingPlacement(ceiling: Block, ctx: PlaceContext): number {
  const w = ctx.world;
  const above = w.getState(ctx.x, ctx.y + 1, ctx.z);
  const ab = blk(above);
  const facing = dirFromYaw(ctx.yaw);
  let attached = !fullUnderside(above) || ctx.sneaking;
  if (isHangingSign(ab.name) && !ctx.sneaking) {
    const other = ab.propIndex('facing') >= 0 ? DIR_NAMES.indexOf(ab.get<string>(above, 'facing') as (typeof DIR_NAMES)[number]) : rotationDirection(ab.get<number>(above, 'rotation'));
    if (other !== null && other >> 1 === facing >> 1) attached = false;
  }
  // (vanilla convertToSegment(direction.getOpposite()): the direction's 2D value times four)
  const rotation = attached ? signRotation(ctx.yaw) : [0, 4, 8, 12][[3, 4, 2, 5].indexOf(OPPOSITE[facing])];
  return ceiling.state({ attached, rotation, waterlogged: inWater(w, ctx.x, ctx.y, ctx.z) });
}

// ---------------------------------------------------------------------------
// Which side the player is on

/** vanilla SignBlock.getYRotationDegrees (a standing or ceiling sign's rotation, a wall one's Direction.toYRot) */
export function signYRotation(st: number): number {
  const b = blk(st);
  if (b.propIndex('rotation') >= 0) return b.get<number>(st, 'rotation') * 22.5;
  return { south: 0, west: 90, north: 180, east: 270 }[b.get<string>(st, 'facing') as 'north'] ?? 0;
}

/** vanilla getSignHitboxCenterPosition: a wall sign's board's middle, the block's for the rest */
function hitboxCenter(st: number): [number, number] {
  const b = blk(st);
  if (signOf(b.name)?.kind !== 'wall_sign') return [0.5, 0.5];
  return { north: [0.5, 0.9375], south: [0.5, 0.0625], east: [0.0625, 0.5], west: [0.9375, 0.5] }[b.get<string>(st, 'facing') as 'north'] as [number, number];
}

/** vanilla Mth.wrapDegrees */
function wrapDegrees(d: number): number {
  let f = d % 360;
  if (f >= 180) f -= 360;
  if (f < -180) f += 360;
  return f;
}

/** vanilla SignBlockEntity.isFacingFrontText: the player is on the side the sign faces */
export function isFacingFrontText(be: SignBlockEntity, st: number, p: { x: number; z: number }): boolean {
  const [cx, cz] = hitboxCenter(st);
  const d = p.x - (be.x + cx), e = p.z - (be.z + cz);
  const f = signYRotation(st);
  const g = (Math.atan2(e, d) * 180) / Math.PI - 90;
  return Math.abs(wrapDegrees(g - f)) <= 90;
}

// ---------------------------------------------------------------------------
// The editor

type SignEditorHook = (p: Player, be: SignBlockEntity, front: boolean) => void;
let editorHook: SignEditorHook | null = null;

/**
 * the game's sign editor (gui/screens/signEdit.ts): the game's own player's opens on its screen, a guest's player's on
 * its guest's (net/)
 */
export function setSignEditorHook(f: SignEditorHook | null): void {
  editorHook = f;
}

/** vanilla SignBlock.openTextEdit: `p` may edit it now (nobody else), and its editor opens for that side */
export function openTextEdit(p: Player, be: SignBlockEntity, front: boolean): void {
  be.playerWhoMayEdit = p.uuid;
  editorHook?.(p, be, front);
}

/**
 * (a guest) vanilla ClientPacketListener.handleOpenSignEditor: the host opened a sign's editor for our player (ignored
 * when there's no sign there)
 */
export function openSignEditorFromHost(level: Level, p: Player, x: number, y: number, z: number, front: boolean): boolean {
  const be = level.world.getBlockEntity(x, y, z);
  if (!(be instanceof SignBlockEntity)) return false;
  editorHook?.(p, be, front);
  return true;
}

/**
 * (the editor) what's being typed on a sign's side, shown on the sign meanwhile (vanilla's screen sets its own copy
 * of the sign's text as it's typed): here, for the game that's typing only, and the sign itself left as it is till
 * the editor is done
 */
const PREVIEW = new Map<string, { front: boolean; text: SignText }>();

/** show `text` on a side of the sign at (x, y, z) in place of its own, or (null) stop */
export function setSignPreview(x: number, y: number, z: number, front: boolean, text: SignText | null): void {
  const key = `${x},${y},${z}`;
  if (text) PREVIEW.set(key, { front, text });
  else PREVIEW.delete(key);
}

/** a side's text as it's to be drawn: the editor's while it's open on it, the sign's own otherwise */
export function signTextShown(be: SignBlockEntity, front: boolean): SignText {
  const p = PREVIEW.size ? PREVIEW.get(be.key) : undefined;
  return p && p.front === front ? p.text : be.getText(front);
}

/** vanilla SignBlock.otherPlayerIsEditingSign */
function otherPlayerIsEditing(p: Player, be: SignBlockEntity): boolean {
  return be.playerWhoMayEdit !== null && be.playerWhoMayEdit !== p.uuid;
}

/**
 * vanilla ServerGamePacketListenerImpl.handleSignUpdate → SignBlockEntity.updateSignText: what `p`'s editor sent for
 * the sign at (x, y, z), taken only from the player who may edit it, near enough to, and only when it isn't waxed. The
 * lines lose their formatting and anything that can't be typed; there must be four, none longer than 384 characters.
 * True if it took them
 */
export function updateSignText(level: Level, p: Player, x: number, y: number, z: number, front: boolean, lines: readonly string[]): boolean {
  if (!level.world.isLoaded(x, z)) return false;
  const be = level.world.getBlockEntity(x, y, z);
  if (!(be instanceof SignBlockEntity)) return false;
  if (lines.length !== SIGN_LINES || lines.some((l) => typeof l !== 'string' || l.length > MAX_SIGN_LINE_LENGTH)) return false;
  if (be.waxed || be.playerWhoMayEdit !== p.uuid || playerTooFarToEdit(level, be, p.uuid)) {
    // (vanilla: "Player ... just tried to change non-editable sign")
    return false;
  }
  be.updateText((t) => {
    let out = t;
    for (let i = 0; i < SIGN_LINES; i++) out = out.setMessage(i, cleanSignLine(lines[i]));
    return out;
  }, front);
  be.playerWhoMayEdit = null;
  return true;
}

// ---------------------------------------------------------------------------
// Dyes, ink and wax (vanilla SignApplicator: DyeItem, GlowInkSacItem, InkSacItem, HoneycombItem)

interface Applicator {
  /** vanilla canApplyToSign (by default: the side has something written on it) */
  canApply(t: SignText): boolean;
  /** vanilla tryApplyToSign: true if it changed the sign */
  apply(level: Level, be: SignBlockEntity, front: boolean): boolean;
}

function textApplicator(f: (t: SignText) => SignText, sound: string): Applicator {
  return {
    canApply: (t) => t.hasMessage(),
    apply(level, be, front) {
      if (!be.updateText(f, front)) return false;
      level.sound.play(sound, be.x + 0.5, be.y + 0.5, be.z + 0.5, 1, 1);
      return true;
    },
  };
}

const APPLICATORS = new Map<string, Applicator>();
for (const c of SIGN_COLORS) APPLICATORS.set(`${c}_dye`, textApplicator((t) => t.setColor(c as SignColor), 'item.dye.use'));
APPLICATORS.set('glow_ink_sac', textApplicator((t) => t.setGlowing(true), 'item.glow_ink_sac.use'));
APPLICATORS.set('ink_sac', textApplicator((t) => t.setGlowing(false), 'item.ink_sac.use'));
APPLICATORS.set('honeycomb', {
  // (vanilla HoneycombItem.canApplyToSign: a blank sign may be waxed too)
  canApply: () => true,
  apply(level, be) {
    if (!be.setWaxed(true)) return false;
    // (level event 3003: the wax_on specks on every face, item.honeycomb.wax_on)
    particlesOnFaces(level, be.x, be.y, be.z, 'wax_on');
    level.sound.play('item.honeycomb.wax_on', be.x + 0.5, be.y + 0.5, be.z + 0.5, 1, 1);
    return true;
  },
});

/** vanilla SignApplicator: what an item does to a sign, if anything */
export function signApplicator(id: string): Applicator | undefined {
  return APPLICATORS.get(id);
}

/** vanilla HangingSignItem: any hanging sign */
function isHangingSignItem(s: ItemStack): boolean {
  return /_hanging_sign$/.test(s.item.id) && !s.item.id.includes('_wall_');
}

/** vanilla SignBlock.useItemOn: a dye, ink or honeycomb on the side of the sign the player's on */
function signUseItemOn(level: Level, x: number, y: number, z: number, st: number, stack: ItemStack, ctx: UseContext): ItemUseResult {
  const be = level.world.getBlockEntity(x, y, z);
  if (!(be instanceof SignBlockEntity)) return 'pass';
  // vanilla CeilingHangingSignBlock / WallHangingSignBlock.shouldTryToChainAnotherHangingSign: a hanging sign held to
  // one's underside goes under it (no sign here runs commands when clicked)
  if (isHangingSign(blk(st).name) && isHangingSignItem(stack) && ctx.face === DOWN) return 'skip';
  const p = ctx.player;
  const a = signApplicator(stack.item.id);
  if (!a || !mayBuild(p) || be.waxed || otherPlayerIsEditing(p, be)) return 'pass';
  const front = isFacingFrontText(be, st, p);
  if (!a.canApply(be.getText(front)) || !a.apply(level, be, front)) return 'pass';
  level.gameEvent('block_change', x + 0.5, y + 0.5, z + 0.5, { entity: p, state: st });
  // (vanilla ServerPlayerGameMode.useItemOn: item_used_on_block, for Glow and Behold!)
  level.onPlayerTrigger?.(p, 'item_used_on_block', { usedOnBlock: { item: stack.item.id, block: blk(st).name } });
  // (vanilla ItemStack.consume: not in creative)
  if (p.gameMode !== 'creative') p.inventory.withHand(ctx.hand ?? 'main', () => p.inventory.consumeSelected(1));
  return 'success';
}

/**
 * vanilla SignBlock.useWithoutItem: a waxed sign only knocks; otherwise its editor opens for the side the player is on,
 * if nobody else is editing it and the player may build
 */
function signUse(level: Level, x: number, y: number, z: number, st: number, ctx: UseContext): boolean {
  const be = level.world.getBlockEntity(x, y, z);
  if (!(be instanceof SignBlockEntity)) return false;
  const p = ctx.player;
  const front = isFacingFrontText(be, st, p);
  if (be.waxed) {
    level.sound.play('block.sign.waxed_interact_fail', x + 0.5, y + 0.5, z + 0.5, 1, 1);
    return true;
  }
  if (otherPlayerIsEditing(p, be) || !mayBuild(p)) return false;
  openTextEdit(p, be, front);
  return true;
}

/** vanilla SignItem.updateCustomBlockEntityTag: placed, a sign opens its editor for the front */
function signPlacedBy(level: Level, x: number, y: number, z: number, _st: number, placer: Player): void {
  const be = level.world.getBlockEntity(x, y, z);
  if (be instanceof SignBlockEntity) openTextEdit(placer, be, true);
}

// ---------------------------------------------------------------------------

for (const w of SIGN_WOODS) {
  const standing = getBlock(`${w}_sign`), wall = getBlock(`${w}_wall_sign`);
  const ceiling = getBlock(`${w}_hanging_sign`), wallHanging = getBlock(`${w}_wall_hanging_sign`);
  const common = { useItemOn: signUseItemOn, use: signUse, setPlacedBy: signPlacedBy };
  registerBehavior(standing.name, {
    ...common,
    /**
     * vanilla SignItem (StandingAndWallBlockItem, attached below): in the order the player looks, standing when that's
     * down, on the wall when it's to a side; never from above
     */
    placement(ctx) {
      const onWall = wallSignPlacement(wall, ctx);
      for (const d of nearestLookingDirections(ctx)) {
        if (d === UP) continue;
        if (d === DOWN) {
          if (standingSurvives(ctx.world, ctx.x, ctx.y, ctx.z)) return standing.state({ rotation: signRotation(ctx.yaw), waterlogged: inWater(ctx.world, ctx.x, ctx.y, ctx.z) });
        } else if (onWall !== null) return onWall;
      }
      return null;
    },
    canSurvive: (world, x, y, z) => standingSurvives(world, x, y, z),
  });
  registerBehavior(wall.name, { ...common, canSurvive: wallSurvives });
  registerBehavior(ceiling.name, {
    ...common,
    /**
     * vanilla HangingSignItem (StandingAndWallBlockItem, attached above): in the order the player looks, hanging under
     * the block above when that's up, from the side of a block when it's to a side; never on the floor
     */
    placement(ctx) {
      const onWall = wallHangingPlacement(wallHanging, ctx);
      for (const d of nearestLookingDirections(ctx)) {
        if (d === DOWN) continue;
        if (d === UP) {
          if (ceilingSurvives(ctx.world, ctx.x, ctx.y, ctx.z)) return ceilingPlacement(ceiling, ctx);
        } else if (onWall !== null) return onWall;
      }
      return null;
    },
    canSurvive: (world, x, y, z) => ceilingSurvives(world, x, y, z),
  });
  // (vanilla WallHangingSignBlock has no canSurvive of its own: it stays when what it hangs from goes)
  registerBehavior(wallHanging.name, common);
}
