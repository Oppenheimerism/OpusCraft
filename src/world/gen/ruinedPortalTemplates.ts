// The ruined portals' thirteen templates (vanilla ruined_portal/portal_1-10 and giant_portal_1-3), built in code in
// vanilla's manner: an obsidian frame, standing or fallen flat, with blocks gone from it, on a scorched patch of
// netherrack with a lava pocket or two, stone brick rubble (stairs, slabs, walls, iron bars), a gold block or three
// and a chest. The processors in world/gen/ruinedPortal age them as they're placed: gold taken, lava cooled, crying
// obsidian, cracked and mossy bricks. Layer 0 goes where the ground's top block is: what it doesn't set stays as
// the ground has it; above it, what isn't set is air (cleared only where the portal has an air pocket).

import { TemplateBuilder, type Blk, type MansionTemplate } from './mansionBuilder';

/** which way a frame stands (along x or z) or that it has fallen flat */
export type Lie = 'x' | 'z' | 'flat';

/** where a template's frame is: its lower corner, how it lies, and its outer width and height */
export interface PortalFrame {
  x: number;
  y: number;
  z: number;
  lie: Lie;
  w: number;
  h: number;
}

const AIR = 'air', O = 'obsidian', N = 'netherrack', L = 'lava', G = 'gold_block';
const S = 'stone_bricks', C = 'chiseled_stone_bricks', K = 'cracked_stone_bricks', BARS = 'iron_bars', WALL = 'stone_brick_wall';
const stair = (facing: string, half = 'bottom'): Blk => `stone_brick_stairs[facing=${facing},half=${half}]`;
const slab = (type = 'bottom'): Blk => `stone_brick_slab[type=${type}]`;
const chest = (facing: string): Blk => `chest[facing=${facing}]`;

/** the ground layers' key */
const GROUND: Record<string, Blk> = { N, L, G, O, S, C, K };

/**
 * an obsidian frame `w` wide and `h` tall (corners included) from its lower corner: standing along x or z, or lying
 * flat along x and z; `gaps` are the blocks it has lost, counted (along, up) from that corner
 */
function frame(b: TemplateBuilder, x: number, y: number, z: number, lie: Lie, w: number, h: number, gaps: [number, number][] = []): PortalFrame {
  for (let i = 0; i < w; i++)
    for (let j = 0; j < h; j++) {
      if (i > 0 && i < w - 1 && j > 0 && j < h - 1) continue;
      const gap = gaps.some(([a, c]) => a === i && c === j);
      if (lie === 'x') b.set(x + i, y + j, z, gap ? AIR : O);
      else if (lie === 'z') b.set(x, y + j, z + i, gap ? AIR : O);
      else b.set(x + i, y, z + j, gap ? AIR : O);
    }
  return { x, y, z, lie, w, h };
}

const TEMPLATES = new Map<string, { template: MansionTemplate; frame: PortalFrame }>();

function portal(name: string, sx: number, sy: number, sz: number, build: (b: TemplateBuilder) => PortalFrame): void {
  const b = new TemplateBuilder(name, sx, sy, sz);
  b.fill(0, 1, 0, sx - 1, sy - 1, sz - 1, AIR);
  const f = build(b);
  TEMPLATES.set(name, { template: b.build(), frame: f });
}

// ---------------------------------------------------------------------------------------------------------------
// The ten small ones: a 4 x 5 frame each

// a frame standing in the ground, its top corner and a block below it gone
portal('portal_1', 7, 5, 6, (b) => {
  b.layer(0, ' NN|NNNNN|NNNNNNN|NNNNNN| NNN N|  N', GROUND);
  const f = frame(b, 1, 0, 2, 'x', 4, 5, [[2, 4], [3, 4], [3, 3]]);
  b.set(5, 1, 3, G).set(0, 1, 3, chest('south')).set(5, 1, 1, stair('west'));
  return f;
});

// on a stone brick plinth, beside the stump of a wall with a barred window
portal('portal_2', 9, 6, 7, (b) => {
  b.layer(0, '   NNN|  NNNNNN| NSSSSSSN|NNSSSSSSN| NSSSSSSN|  NNNNNN|   NN N', GROUND);
  b.fill(0, 1, 3, 1, 2, 3, S).set(0, 3, 3, S).set(1, 3, 3, BARS).set(0, 4, 3, stair('east'));
  const f = frame(b, 3, 1, 3, 'x', 4, 5, [[0, 3], [0, 4], [1, 4]]);
  b.set(8, 1, 5, slab()).set(2, 1, 5, stair('north')).set(5, 1, 5, G).set(2, 1, 1, chest('west'));
  return f;
});

// fallen flat round a pool of lava
portal('portal_3', 7, 3, 8, (b) => {
  b.layer(0, '  NNN| NNNNN|NNLLNN|NNLLNNN| NLLNN| NNNNN|  NNN|   N', GROUND);
  const f = frame(b, 1, 1, 1, 'flat', 4, 5, [[3, 0], [3, 1], [0, 3], [2, 4]]);
  b.set(5, 1, 6, chest('east')).set(6, 1, 3, G).set(0, 1, 2, stair('north')).set(5, 1, 2, S).set(5, 2, 2, stair('west'));
  return f;
});

// up a flight of steps on a raised floor
portal('portal_4', 9, 7, 8, (b) => {
  b.layer(0, '  NNNN| NNNNNNN|NNSSSSSSN|NNSSSSSSN|NNSSSSSSN| NNSSSNN|  NNNNN|   N N', GROUND);
  b.layer(1, '||  SSNSSS|  SSSSCS|  NSSSSS|   dddd', { S, N, C, d: stair('north') });
  const f = frame(b, 3, 2, 3, 'x', 4, 5, [[0, 2], [0, 3], [2, 4], [3, 4]]);
  b.set(7, 2, 4, G).set(1, 1, 3, chest('west')).set(2, 2, 2, stair('east')).set(8, 1, 4, slab());
  return f;
});

// one side fallen in, two of its blocks lying by it
portal('portal_5', 8, 5, 6, (b) => {
  b.layer(0, '  NNN|NNNNNNN|NNNNNNN|NNNNNNNN| NNNNNLN|  NNN', GROUND);
  const f = frame(b, 1, 0, 2, 'x', 4, 5, [[3, 1], [3, 2], [3, 3], [3, 4], [2, 4]]);
  b.set(5, 1, 3, O).set(6, 1, 2, O).set(0, 1, 1, G).set(0, 1, 3, chest('east')).set(5, 1, 1, S).set(6, 1, 1, stair('west'));
  return f;
});

// between two pillars, the lintel broken, iron bars to one side
portal('portal_6', 10, 6, 7, (b) => {
  b.layer(0, '   NNNN| NNNNNNNN|NNNNNNNNN|NSNNNNNNSN|NNNNSSNNN| NNNSSNN|   NSS', GROUND);
  b.fill(1, 1, 3, 1, 2, 3, S).set(1, 3, 3, C).set(1, 4, 3, S).set(1, 5, 3, stair('east')).set(2, 5, 3, slab('top')).set(3, 5, 3, slab('top'));
  b.set(8, 1, 3, S).set(8, 2, 3, K).set(8, 3, 3, slab()).fill(7, 1, 3, 7, 2, 3, BARS);
  const f = frame(b, 3, 0, 3, 'x', 4, 5, [[3, 3], [3, 4]]);
  b.set(8, 1, 5, chest('west')).set(2, 1, 4, G);
  return f;
});

// fallen and broken in two, the end that broke off propped on bricks
portal('portal_7', 9, 3, 9, (b) => {
  b.layer(0, '    NN| NNNNNNN|NNNNNNNNN|NNNNNNNN| NNNNNNN| NNLLNNN| NNNNNN|  NNNN|   NN', GROUND);
  const f = frame(b, 1, 1, 3, 'flat', 4, 5, [[0, 4], [1, 4], [3, 2], [3, 3]]);
  b.fill(5, 1, 1, 6, 1, 1, S).fill(5, 2, 1, 6, 2, 1, O).set(7, 1, 2, O);
  b.set(7, 1, 5, G).set(0, 1, 1, chest('south')).set(6, 1, 7, stair('north')).set(7, 1, 6, slab());
  return f;
});

// inside low walls, a lava pocket behind it
portal('portal_8', 9, 5, 8, (b) => {
  b.layer(0, '  NNNNN| NNNNNNN|NNNNLLNN|NNNNNNNNN|NNNNNNNN| NNNNNNN|  NNNN N|   N', GROUND);
  for (const x of [1, 2, 3, 5, 6]) b.set(x, 1, 1, WALL);
  b.fill(0, 1, 2, 0, 1, 4, WALL).set(0, 1, 1, S).set(0, 2, 1, WALL).set(7, 1, 1, S);
  const f = frame(b, 2, 0, 4, 'x', 4, 5, [[0, 2], [0, 3]]);
  b.set(7, 1, 6, chest('north')).set(1, 1, 6, G).set(7, 1, 3, stair('west')).set(8, 1, 3, S);
  return f;
});

// on a pedestal with steps up the front and gold set in its side
portal('portal_9', 7, 7, 7, (b) => {
  b.layer(0, '  NNN| NNNNNN|NSSSSSN|NSSSSSN|NSSSSSN| NNNNNN|  N NN', GROUND);
  b.layer(1, '|| SNSSS| SSSSSG| SSNSS|  dd', { S, N, G, d: stair('north') });
  const f = frame(b, 1, 2, 3, 'x', 4, 5, [[1, 4], [0, 4], [3, 1]]);
  b.set(0, 1, 5, chest('east')).set(5, 2, 2, stair('south')).set(6, 0, 1, L);
  return f;
});

// sunk in a mound of netherrack, a side and the top half gone, pieces of it about
portal('portal_10', 10, 5, 8, (b) => {
  b.layer(0, '  NNNNN| NNNNNNNN|NNNNNNNNNN|NNNNNNNNNN|NNNNNLNNN| NNNNNNNN|  NNN NN|    N', GROUND);
  b.set(2, 1, 3, N).set(2, 2, 3, N).set(2, 1, 2, N).set(3, 1, 2, N).set(7, 1, 3, N).set(7, 1, 4, N);
  const f = frame(b, 3, 0, 3, 'x', 4, 5, [[0, 1], [0, 2], [1, 4], [2, 4]]);
  b.set(1, 1, 5, O).set(8, 1, 1, O).fill(8, 1, 5, 8, 2, 5, BARS).set(0, 1, 2, chest('east')).set(4, 1, 5, G).set(9, 1, 4, stair('west'));
  return f;
});

// ---------------------------------------------------------------------------------------------------------------
// The three giant ones

// a 6 x 10 frame between two stumps of buttresses
portal('giant_portal_1', 12, 10, 9, (b) => {
  b.layer(0, '   NNNNNN| NNNNNNNLLNN|NNNNNNNNNNNN|NNNNNNNNNNNN|NNNNNNNNNNNN|NNNNNNNNNNNN| NNNNNNNNNN|  NNNNNNNN|    NN  N', GROUND);
  b.fill(2, 1, 4, 2, 2, 4, S).set(2, 3, 4, stair('east')).set(9, 1, 4, S).set(9, 2, 4, K).set(9, 3, 4, slab());
  const f = frame(b, 3, 0, 4, 'x', 6, 10, [[0, 6], [0, 7], [1, 9], [4, 9], [5, 9], [5, 8]]);
  b.set(1, 1, 2, G).set(10, 1, 6, G).set(5, 1, 6, G).set(2, 1, 6, chest('south')).fill(10, 1, 3, 10, 2, 3, BARS).set(1, 1, 5, stair('north')).set(4, 1, 2, stair('south'));
  return f;
});

// a 7 x 10 frame on a plinth with steps, between the stumps of two pillars
portal('giant_portal_2', 13, 12, 10, (b) => {
  b.layer(0, '    NNNNN|  NNNNNNNNN| NNNNNNNNNNN|NNSSSSSSSSSNN|NNSSSSSSSSSNN|NNSSSSSSSSSNN|NNSSSSSSSSSNN| NNNNNNNNNNN|  NNNNNNNNN|    NNN NN', GROUND);
  b.layer(1, '||||   SSSCSSS|   SNSSSSS|    ddddd', { S, C, N, d: stair('north') });
  b.fill(1, 1, 5, 1, 2, 5, S).set(1, 3, 5, C).set(1, 4, 5, S).set(11, 1, 5, S).set(11, 2, 5, slab());
  const f = frame(b, 3, 2, 4, 'x', 7, 10, [[6, 3], [6, 4], [6, 5], [2, 9], [3, 9]]);
  b.set(2, 1, 4, G).set(10, 1, 7, G).set(6, 1, 8, G).set(11, 1, 7, chest('west')).set(0, 1, 3, stair('east'));
  return f;
});

// a 7 x 10 frame fallen flat over lava, a piece of it broken off and propped on bricks
portal('giant_portal_3', 14, 3, 13, (b) => {
  b.layer(
    0,
    '   NNNNNNN| NNNNNNNNNNN|NNNNNNNNNNNNN|NNNNNNNNNNNNN|NNNNLLNNNNNNNN|NNNNNLNNNNNNN|NNNNNNNNNNNNN|NNNNNNLNNNNN|NNNNLNNNNNNN| NNNNNNNNNNN| NNNNNNNNNN|  NNNNNNNN|    NNNN',
    GROUND,
  );
  const f = frame(b, 2, 1, 1, 'flat', 7, 10, [[0, 7], [0, 8], [6, 2], [3, 9], [4, 9]]);
  b.fill(11, 1, 4, 11, 1, 5, S).fill(11, 2, 4, 11, 2, 5, O).set(12, 1, 6, O);
  b.fill(0, 1, 3, 0, 2, 3, S).set(0, 1, 4, stair('north')).set(10, 1, 9, S).set(10, 1, 10, slab()).fill(1, 1, 11, 1, 2, 11, BARS);
  b.set(9, 1, 2, G).set(3, 1, 11, G).set(6, 1, 3, G).set(12, 1, 9, chest('west'));
  return f;
});

/** vanilla RuinedPortalStructure.STRUCTURE_LOCATION_PORTALS and STRUCTURE_LOCATION_GIANT_PORTALS, in their order */
export const PORTALS = ['portal_1', 'portal_2', 'portal_3', 'portal_4', 'portal_5', 'portal_6', 'portal_7', 'portal_8', 'portal_9', 'portal_10'];
export const GIANT_PORTALS = ['giant_portal_1', 'giant_portal_2', 'giant_portal_3'];

export function portalTemplate(name: string): MansionTemplate {
  const t = TEMPLATES.get(name);
  if (!t) throw new Error('no ruined portal template ' + name);
  return t.template;
}

/** the frame a template's portal had (for putting it back together) */
export function portalFrame(name: string): PortalFrame {
  return TEMPLATES.get(name)!.frame;
}
