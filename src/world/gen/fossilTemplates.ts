// The fossils' templates (vanilla fossil/spine_1..4 and fossil/skull_1..4, which ship as .nbt files and can't be
// used), authored in code after their style: bone blocks laid along the bones, the rest left as the rock is. Four
// lengths of spine with their ribs (a long one arched over its rib cage, a short one with a drooping tail, one bent
// along its length, one lying flattened) and four skulls (a big one with its jaw, a horned one, a long-snouted one
// and a small one). Vanilla's coal overlays (fossil/*_coal) have the same shape in coal ore: world/gen/fossil.ts
// lays them over the bones from these.

import { TemplateBuilder, type MansionTemplate } from './mansionBuilder';

/** the bone block along each axis ('.': the rock left as it is) */
const KEY = { x: 'bone_block[axis=x]', y: 'bone_block[axis=y]', z: 'bone_block[axis=z]', '.': 'void' };

/** a fossil from its layers, bottom up, each rows north to south joined by '|' (characters west to east) */
function fossil(name: string, layers: string[]): MansionTemplate {
  const rows = layers.map((l) => l.split('|'));
  const b = new TemplateBuilder(name, rows[0][0].length, layers.length, rows[0].length);
  layers.forEach((l, y) => b.layer(y, l, KEY));
  return b.build();
}

// prettier-ignore
const TEMPLATES: Record<string, () => MansionTemplate> = {
  // the backbone along the top of an arched rib cage, a spine sticking up from each other bone
  spine_1: () => fossil('spine_1', [
    '.............|....z.z.z....|.............|.............|.............|....z.z.z....|.............',
    '....y.y.y....|.............|.............|.............|.............|.............|....y.y.y....',
    '..y.y.y.y.y..|.............|.............|.............|.............|.............|..y.y.y.y.y..',
    '.............|..z.z.z.z.z..|..z.z.z.z.z..|xxxxxxxxxxxxx|..z.z.z.z.z..|..z.z.z.z.z..|.............',
    '.............|.............|.............|.y.y.y.y.y.y.|.............|.............|.............',
  ]),
  // a shorter backbone, three ribs shortening toward the tail, which droops
  spine_2: () => fossil('spine_2', [
    '.........|.z.......|.........|.z.......|.........',
    '.y.y.....|.........|........y|.........|.y.y.....',
    '.y.y.y...|.........|........y|.........|.y.y.y...',
    '.........|.z.z.z...|xxxxxxxx.|.z.z.z...|.........',
  ]),
  // a backbone bent along its length, four pairs of ribs off it
  spine_3: () => fossil('spine_3', [
    '....y.y....|...........|...........|...........|....y.y....|...........|...........',
    '....y.y....|...........|.y.......y.|...........|....y.y....|...........|.y.......y.',
    '...........|....z.z....|....xxx....|.zxxz.zxxz.|xx.......xx|.z.......z.|...........',
  ]),
  // a rib cage lying flattened, the backbone down its middle
  spine_4: () => fossil('spine_4', [
    '.......|y.....y|.......|y.....y|.......|.......|.......|y.....y|.......',
    '...z...|.xxzxx.|...z...|.xxzxx.|...z...|xxxzxxx|...z...|.xxzxx.|...z...',
  ]),
  // a big skull, its eyes and nose open, teeth hanging over the lower jaw
  skull_1: () => fossil('skull_1', [
    '.....|.z.z.|.z.z.|.z.z.|.z.z.|.z.z.|.xxx.',
    '.zzz.|z...z|z...z|.zzz.|.y.y.|.y.y.|..y..',
    'zzzzz|z...z|z...z|zzzzz|.z.z.|.z.z.|.zzz.',
    'zzzzz|z...z|z...z|z.z.z|.zzz.|.zzz.|..z..',
    '.zzz.|.zzz.|.zzz.|.....|.....|.....|.....',
  ]),
  // a broad skull with a horn curling up from either side
  skull_2: () => fossil('skull_2', [
    '.......|..z.z..|..z.z..|..z.z..|..xxx..',
    '..zzz..|.z...z.|.zzzzz.|..y.y..|...y...',
    '.zzzzz.|.z...z.|.zzzzz.|..z.z..|..zzz..',
    '.zzzzz.|.z...z.|.z.z.z.|..zzz..|..zzz..',
    '.zzzzz.|xzzzzzx|.zzzzz.|.......|.......',
    '.......|y.....y|.......|.......|.......',
  ]),
  // a long narrow skull, all snout
  skull_3: () => fossil('skull_3', [
    '...|z.z|z.z|z.z|z.z|z.z|z.z|.z.|...',
    'zzz|z.z|zzz|z.z|z.z|z.z|z.z|z.z|.z.',
    'zzz|z.z|.z.|.z.|.z.|.z.|.z.|.z.|.z.',
  ]),
  // a small skull, one great eye socket
  skull_4: () => fossil('skull_4', [
    '.zz.|.zz.|.z.z|.z.z|.zz.',
    'zzzz|z..z|zzzz|.zz.|.zz.',
    'zzzz|z..z|z.zz|.zz.|....',
    '.zz.|.zz.|....|....|....',
  ]),
};

/** vanilla FossilFeatureConfiguration.fossilStructures, in its order */
export const FOSSILS = ['spine_1', 'spine_2', 'spine_3', 'spine_4', 'skull_1', 'skull_2', 'skull_3', 'skull_4'];

const built = new Map<string, MansionTemplate>();
export function fossilTemplate(name: string): MansionTemplate {
  let t = built.get(name);
  if (!t) built.set(name, (t = TEMPLATES[name]()));
  return t;
}
