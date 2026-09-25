// (trial chambers) The trial chambers' particle sprites, 8 by 8 like the rest of the sheet: the wisps a trial spawner
// sends up its sides as it sees a player (vanilla particle/trial_spawner_detection_0..4, and its ominous blue
// ..._ominous_0..4), dwindling from a tall flame-tongue to an ember as they rise; Trial Omen's swirl (particle/
// trial_omen, a teal curl); the spark an ominous item spawner draws in (particle/ominous_spawning, a soft white dot
// the particle tints from blue to white); and the spark a vault draws from its player to its keyhole (particle/
// vault_connection, a warm glint). render/particles.ts makes them move.

import { img, pattern, type TexImage } from './tex';

function sprite(rows: string[], inks: Record<string, number>): TexImage {
  const t = img(8, 8);
  pattern(t, 0, 0, rows, inks);
  return t;
}

/** the detection wisp at each age: a flame-tongue rising, thinning and shrinking to a spark */
const DETECTION: string[][] = [
  ['...o....', '...yo...', '..oyy...', '..yWyo..', '.oyWWy..', '.yWWWyo.', '.oyWWyo.', '..oyyo..'],
  ['........', '...o....', '...yo...', '..oyy...', '..yWyo..', '..yWWy..', '..oyWy..', '...oo...'],
  ['........', '........', '...o....', '...yo...', '..oWy...', '..yWy...', '..oyo...', '........'],
  ['........', '........', '........', '...o....', '...Wy...', '...yo...', '........', '........'],
  ['........', '........', '........', '........', '...y....', '...o....', '........', '........'],
];

export function trialChamberParticleTextures(): Record<string, () => TexImage> {
  const out: Record<string, () => TexImage> = {};
  DETECTION.forEach((rows, i) => {
    // the trial spawner's orange, and its ominous soul-fire blue
    out[`trial_spawner_detection_${i}`] = () => sprite(rows, { o: 0xe0701c, y: 0xffb23a, W: 0xfff0b0 });
    out[`trial_spawner_detection_ominous_${i}`] = () => sprite(rows, { o: 0x1f8fb8, y: 0x5fd0f0, W: 0xd8fbff });
  });
  // Trial Omen's teal curl, rising like an effect's swirl
  out.trial_omen = () =>
    sprite(['........', '..tTTt..', '.T....T.', '.T.tt.T.', '.t.T..T.', '...tTt..', '..T.....', '........'], { T: 0x3fe0d8, t: 0x16a6a6 });
  // (white, so the particle's own colour shows: the ominous blue to white)
  out.ominous_spawning = () => sprite(['........', '........', '...ww...', '..wWWw..', '..wWWw..', '...ww...', '........', '........'], { W: 0xffffff, w: 0xc8c8c8 });
  out.vault_connection = () => sprite(['........', '........', '...o....', '..oYo...', '...o....', '........', '........', '........'], { Y: 0xfff2c0, o: 0xf0a040 });
  return out;
}
