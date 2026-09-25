// The trial chambers' own blocks (1.21): the heavy core (vanilla HeavyCoreBlock), what an ominous vault can give,
// which with a breeze rod makes a mace; the trial spawner (vanilla TrialSpawnerBlock: its state and whether it's
// ominous, what it does is game/trialSpawner.ts) and the vault (vanilla VaultBlock: which way it faces, its state and
// whether it's ominous; game/vault.ts); and (M5) the crafter (blocksCrafter.ts).

import { registerBlock, P, Layer, enumProp, boolProp, type Box } from './block';
import type { DirName } from './dir';
import type { FaceDef, ModelDef } from './models';
import { MAP_COLORS, MapColor } from './mapColors';
import { registerCrafterBlock } from './blocksCrafter';

const px = (v: number) => v / 16;
const bx = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): Box => [px(x0), px(y0), px(z0), px(x1), px(y1), px(z1)];

/** vanilla models/block/heavy_core.json: an 8-pixel cube on the floor, its top, bottom and sides from the texture's quarters */
function heavyCoreModel(): ModelDef {
  const t = 'heavy_core';
  const side = { tex: t, uv: [0, 8, 8, 16] as [number, number, number, number] };
  return {
    particle: t,
    elements: [{
      from: [4, 0, 4], to: [12, 8, 12],
      faces: { north: side, east: side, south: side, west: side, up: { tex: t, uv: [0, 0, 8, 8] }, down: { tex: t, uv: [8, 0, 16, 8], cull: 'down' } },
    }],
  };
}

/** vanilla TrialSpawnerState, in its order (BlockStateProperties.TRIAL_SPAWNER_STATE) */
export const TRIAL_SPAWNER_STATES = ['inactive', 'waiting_for_players', 'active', 'waiting_for_reward_ejection', 'ejecting_reward', 'cooldown'] as const;
export type TrialSpawnerStateName = (typeof TRIAL_SPAWNER_STATES)[number];
/** vanilla TrialSpawnerState.lightLevel */
const TRIAL_SPAWNER_LIGHT: Record<TrialSpawnerStateName, number> = { inactive: 0, waiting_for_players: 4, active: 8, waiting_for_reward_ejection: 8, ejecting_reward: 8, cooldown: 0 };
/** vanilla VaultState, in its order (VaultBlock.STATE) */
export const VAULT_STATES = ['inactive', 'active', 'unlocking', 'ejecting'] as const;
export type VaultStateName = (typeof VAULT_STATES)[number];

/** vanilla BlockStateProperties.OMINOUS */
const OMINOUS = boolProp('ominous');

const DIRS: DirName[] = ['down', 'up', 'north', 'south', 'west', 'east'];

/**
 * vanilla models/block/cube_bottom_top_inner_faces.json (and template_vault.json, the front to the north): the cube,
 * and the same faces again just inside it facing in, so the far side of the cage shows through its gaps
 */
function innerFacesCube(t: Record<DirName, string>, particle: string): ModelDef {
  const out: Partial<Record<DirName, FaceDef>> = {}, inner: Partial<Record<DirName, FaceDef>> = {};
  for (const d of DIRS) {
    out[d] = { tex: t[d], cull: d };
    inner[d] = { tex: t[d] };
  }
  return { particle, elements: [{ from: [0, 0, 0], to: [16, 16, 16], faces: out }, { from: [15.998, 15.998, 15.998], to: [0.002, 0.002, 0.002], faces: inner }] };
}

/** vanilla BlockModelGenerators.createTrialSpawner: which sides and top each state shows (the bottom's always the same) */
function trialSpawnerModel(state: TrialSpawnerStateName, ominous: boolean): ModelDef {
  const o = ominous ? '_ominous' : '';
  const [side, top] =
    state === 'inactive' || state === 'cooldown' ? ['side_inactive', 'top_inactive']
    : state === 'ejecting_reward' ? ['side_active', 'top_ejecting_reward']
    : ['side_active', 'top_active'];
  const s = `trial_spawner_${side}${o}`, t = `trial_spawner_${top}${o}`;
  return innerFacesCube({ down: 'trial_spawner_bottom', up: t, north: s, south: s, west: s, east: s }, s);
}

/** vanilla BlockModelGenerators.createVault: its front, sides and top by state, the ominous vault's own set */
function vaultModel(state: VaultStateName, ominous: boolean): ModelDef {
  const o = ominous ? '_ominous' : '';
  const front = state === 'inactive' ? 'front_off' : state === 'active' ? 'front_on' : 'front_ejecting';
  const side = state === 'inactive' ? 'side_off' : 'side_on';
  const top = state === 'ejecting' ? 'top_ejecting' : 'top';
  const s = `vault_${side}${o}`;
  return innerFacesCube({ down: `vault_bottom${o}`, up: `vault_${top}${o}`, north: `vault_${front}${o}`, south: s, west: s, east: s }, s);
}

/** vanilla createHorizontalFacingDispatch */
const FACING_Y: Record<string, number> = { north: 0, east: 90, south: 180, west: 270 };

export function registerTrialChamberBlocks(): void {
  // (M5) the crafter
  registerCrafterBlock();

  // vanilla Blocks.HEAVY_CORE: strength 10, blast resistance 1200, SoundType.HEAVY_CORE, metal on maps, pushed by
  // pistons (PushReaction.NORMAL), waterloggable; drops itself to any tool (a pickaxe mines it faster)
  const core = heavyCoreModel();
  registerBlock('heavy_core', {
    props: [P.waterlogged], hardness: 10, resistance: 1200, sound: 'heavy_core', tool: 'pickaxe', opaque: false, aoCaster: false, opacity: 0,
    faceOcclusion: 0, collision: [bx(4, 0, 4, 12, 8, 12)], mapColor: MAP_COLORS[MapColor.METAL], model: () => ({ model: core }),
  });

  // vanilla Blocks.TRIAL_SPAWNER: stone on maps, strength 50, SoundType.TRIAL_SPAWNER, lit by its state, never blocks
  // the view (isViewBlocking never), no occlusion (a cage); mined with a pickaxe, and it drops nothing
  const spawnerModels = new Map<string, ModelDef>();
  for (const st of TRIAL_SPAWNER_STATES) for (const o of [false, true]) spawnerModels.set(`${st}${o}`, trialSpawnerModel(st, o));
  registerBlock('trial_spawner', {
    props: [enumProp('trial_spawner_state', [...TRIAL_SPAWNER_STATES]), OMINOUS], hardness: 50, resistance: 50, sound: 'trial_spawner', tool: 'pickaxe',
    light: (s) => TRIAL_SPAWNER_LIGHT[s.get('trial_spawner_state') as TrialSpawnerStateName], layer: Layer.CUTOUT, opaque: false, aoCaster: false,
    viewBlocking: false, mapColor: MAP_COLORS[MapColor.STONE],
    model: (s) => ({ model: spawnerModels.get(`${s.get('trial_spawner_state')}${s.get('ominous')}`)! }),
  });

  // vanilla Blocks.VAULT: the same, but it faces the way it was set down facing the player, and is half lit when idle
  // and fully lit otherwise (VaultState.LightLevel HALF_LIT 6, LIT 12)
  const vaultModels = new Map<string, ModelDef>();
  for (const st of VAULT_STATES) for (const o of [false, true]) vaultModels.set(`${st}${o}`, vaultModel(st, o));
  registerBlock('vault', {
    props: [P.facingH, enumProp('vault_state', [...VAULT_STATES]), OMINOUS], hardness: 50, resistance: 50, sound: 'vault', tool: 'pickaxe',
    light: (s) => (s.get('vault_state') === 'inactive' ? 6 : 12), layer: Layer.CUTOUT, opaque: false, aoCaster: false, viewBlocking: false,
    mapColor: MAP_COLORS[MapColor.STONE],
    model: (s) => ({ model: vaultModels.get(`${s.get('vault_state')}${s.get('ominous')}`)!, y: FACING_Y[s.get('facing') as string] }),
  });
}
