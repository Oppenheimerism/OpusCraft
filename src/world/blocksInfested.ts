// The infested blocks (vanilla InfestedBlock / InfestedRotatedPillarBlock): stone, cobblestone, the four stone
// bricks and deepslate with a silverfish inside. They look exactly like their host blocks (the same models and
// textures), take half as long to break, give way to any blast, and release their silverfish when broken without
// silk touch (game/infestedBlocks.ts); silk touch gets the host block instead. A silverfish burrowing into one of
// the hosts turns it into its infested twin (entity/silverfish.ts).

import { registerBlock, getBlock, blockOf, BLOCK_BY_NAME } from './block';

/** vanilla InfestedBlock.BLOCK_BY_HOST: host → infested twin */
export const INFESTED_BY_HOST: Record<string, string> = {
  stone: 'infested_stone',
  cobblestone: 'infested_cobblestone',
  stone_bricks: 'infested_stone_bricks',
  mossy_stone_bricks: 'infested_mossy_stone_bricks',
  cracked_stone_bricks: 'infested_cracked_stone_bricks',
  chiseled_stone_bricks: 'infested_chiseled_stone_bricks',
  deepslate: 'infested_deepslate',
};

/** infested twin → host */
export const HOST_BY_INFESTED: Record<string, string> = Object.fromEntries(Object.entries(INFESTED_BY_HOST).map(([h, i]) => [i, h]));

/** vanilla MapColor.CLAY / DEEPSLATE */
const MAP_CLAY = 0xa4a8b8, MAP_DEEPSLATE = 0x646464;

export function registerInfestedBlocks(): void {
  for (const [host, name] of Object.entries(INFESTED_BY_HOST)) {
    const h = getBlock(host);
    // vanilla InfestedBlock: destroyTime half the host's, explosion resistance 0.75, no tool needed to get what it
    // drops (a pickaxe is still the quick way: #mineable/pickaxe); the model is the host's own (the deepslate keeps
    // its axis)
    registerBlock(name, {
      props: h.props, defaults: host === 'deepslate' ? { axis: 'y' } : undefined,
      hardness: h.hardness / 2, resistance: 0.75, sound: h.sound, tool: 'pickaxe', requiresTool: false,
      mapColor: host === 'deepslate' ? MAP_DEEPSLATE : MAP_CLAY,
      model: h.s.model,
    });
  }
}

// block ids, looked up on first use (the registry is filled by then)
let hostIds: Map<number, number> | null = null;
let infestedIds: Map<number, number> | null = null;

function tables(): void {
  if (hostIds) return;
  hostIds = new Map();
  infestedIds = new Map();
  for (const [host, name] of Object.entries(INFESTED_BY_HOST)) {
    const h = BLOCK_BY_NAME.get(host), i = BLOCK_BY_NAME.get(name);
    if (!h || !i) continue;
    hostIds.set(h.id, i.id);
    infestedIds.set(i.id, h.id);
  }
}

/** vanilla InfestedBlock.isCompatibleHostBlock: a block a silverfish can burrow into */
export function isCompatibleHostBlock(state: number): boolean {
  tables();
  return hostIds!.has(blockOf(state).id);
}

/** the block is one of the infested ones (vanilla `instanceof InfestedBlock`) */
export function isInfestedBlock(state: number): boolean {
  tables();
  return infestedIds!.has(blockOf(state).id);
}

/** carry the properties both states have (the deepslate's axis) from `from` onto `to`'s default state */
function carry(from: number, toName: string): number {
  const fb = blockOf(from), tb = getBlock(toName);
  let st = tb.defaultState;
  for (const p of tb.props) if (fb.propIndex(p.name) >= 0) st = tb.with(st, p.name, fb.get(from, p.name));
  return st;
}

/** vanilla InfestedBlock.infestedStateByHost */
export function infestedStateByHost(host: number): number {
  return carry(host, INFESTED_BY_HOST[blockOf(host).name]);
}

/** vanilla InfestedBlock.hostStateByInfested */
export function hostStateByInfested(infested: number): number {
  return carry(infested, HOST_BY_INFESTED[blockOf(infested).name]);
}
