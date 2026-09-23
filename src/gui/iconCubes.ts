// Inventory-style 3D cube icons for blocks the game doesn't place yet but whose
// icons appear (advancements): which block textures go on which faces.

export interface IconCube {
  up: string;
  side: string;
  /** the face that shows on the right of an inventory icon (vanilla north) */
  north?: string;
  down?: string;
  translucent?: boolean;
}

export const ICON_CUBES: Record<string, IconCube> = {
  end_stone: { up: 'end_stone', side: 'end_stone' },
  note_block: { up: 'note_block', side: 'note_block' },
  jukebox: { up: 'jukebox_top', side: 'jukebox_side' },
  target: { up: 'target_top', side: 'target_side' },
  honey_block: { up: 'honey_block_top', side: 'honey_block_side', translucent: true },
  bee_nest: { up: 'bee_nest_top', side: 'bee_nest_side', north: 'bee_nest_front' },
  chiseled_bookshelf: { up: 'chiseled_bookshelf_top', side: 'chiseled_bookshelf_side', north: 'chiseled_bookshelf_occupied' },
  crafter: { up: 'crafter_top', side: 'crafter_side', north: 'crafter_north' },
  chiseled_tuff: { up: 'chiseled_tuff_top', side: 'chiseled_tuff' },
  oxidized_copper_bulb: { up: 'oxidized_copper_bulb', side: 'oxidized_copper_bulb' },
  verdant_froglight: { up: 'verdant_froglight_top', side: 'verdant_froglight_side' },
};

/** every texture the cube icons use (they must be in the block atlas) */
export function iconCubeTextures(): string[] {
  const out = new Set<string>();
  for (const c of Object.values(ICON_CUBES)) for (const t of [c.up, c.side, c.north, c.down]) if (t) out.add(t);
  return [...out];
}
