// The jukebox meets the second half of redstone (the two were built apart): a hopper above puts a disc in and it
// plays, a hopper under it takes the disc out once the song has ended (only into an empty slot), and a comparator
// reads the disc's comparator output (cat: 2).

import { load, check, flatLevel, place, prop, ticks, stack, countIn, exitWithStatus } from './lib.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 300000).unref();

const { m, close } = await load(['/src/game/jukebox.ts', '/src/game/redstone/comparator.ts']);
const G = 64; // the floor: stone below, air from y 64

const hopperAt = (level, x, y, z, facing) => {
  place(m, level, 'hopper', x, y, z, { props: { facing, enabled: true } });
  return level.world.getBlockEntity(x, y, z);
};

// a hopper above feeds it one disc, which plays; the next waits
{
  const { level, world } = flatLevel(m, -1, -1, 1, 1);
  place(m, level, 'jukebox', 0, G, 0);
  const top = hopperAt(level, 0, G + 1, 0, 'down');
  top.container.set(0, stack(m, 'music_disc_cat'));
  top.container.set(1, stack(m, 'music_disc_13'));
  ticks(level, 30);
  const jb = world.getBlockEntity(0, G, 0);
  check('a hopper above puts a disc in', jb instanceof m.JukeboxBlockEntity && jb.getTheItem()?.item.id === 'music_disc_cat', jb?.getTheItem()?.item.id);
  check('the disc plays and has_record is set', jb.songPlayer.isPlaying() && prop(m, level, 0, G, 0, 'has_record') === true);
  check('the second disc stays in the hopper (it holds one)', countIn(top.container, 'music_disc_13') === 1 && countIn(top.container, 'music_disc_cat') === 0);
  top.container.set(1, stack(m, 'dirt'));
  top.container.set(2, null);
  ticks(level, 20);
  check('nothing but a disc goes in', jb.getTheItem()?.item.id === 'music_disc_cat' && countIn(top.container, 'dirt') === 1);
}

// a hopper under it is switched off by the playing jukebox's signal (15 while a song plays); when the song ends it
// takes the disc out, but only into an empty slot (vanilla canTakeItem: hasAnyMatching(isEmpty))
{
  const { level, world } = flatLevel(m, -1, -1, 1, 1);
  const below = hopperAt(level, 4, G, 0, 'east');
  place(m, level, 'jukebox', 4, G + 1, 0);
  const jb = world.getBlockEntity(4, G + 1, 0);
  jb.setTheItem(level, stack(m, 'music_disc_creator_music_box'));
  ticks(level, 30);
  check('while the song plays, its signal switches the hopper under it off', prop(m, level, 4, G, 0, 'enabled') === false && jb.getTheItem()?.item.id === 'music_disc_creator_music_box');
  ticks(level, 1600); // Creator (Music Box) lasts 73 s
  check('when the song ends, the hopper takes the disc out', !jb.getTheItem() && countIn(below.container, 'music_disc_creator_music_box') === 1);
  check('has_record clears', prop(m, level, 4, G + 1, 0, 'has_record') === false);

  const below2 = hopperAt(level, 8, G, 0, 'east');
  for (let i = 0; i < 5; i++) below2.container.set(i, stack(m, 'cobblestone', 1));
  place(m, level, 'jukebox', 8, G + 1, 0);
  const jb2 = world.getBlockEntity(8, G + 1, 0);
  jb2.setTheItem(level, stack(m, 'music_disc_creator_music_box'));
  ticks(level, 1600);
  check('a hopper with no empty slot (though not full) leaves the disc', jb2.getTheItem()?.item.id === 'music_disc_creator_music_box' && countIn(below2.container, 'cobblestone') === 5);
}

// a comparator reads the disc's comparator output
{
  const { level, world } = flatLevel(m, -1, -1, 1, 1);
  place(m, level, 'jukebox', 8, G, 0);
  place(m, level, 'comparator', 9, G, 0, { props: { facing: 'west', mode: 'compare', powered: false } });
  const st = level.getState(9, G, 0);
  m.behaviorOf(st).setPlacedBy(level, 9, G, 0, st, { gameMode: 'survival' });
  const out = () => m.getSignal(level.world, 9, G, 0, 4);
  ticks(level, 4);
  check('empty: the comparator reads 0', out() === 0, out());
  world.getBlockEntity(8, G, 0).setTheItem(level, stack(m, 'music_disc_cat'));
  ticks(level, 4);
  check('cat in: the comparator reads 2', out() === 2, out());
  world.getBlockEntity(8, G, 0).removeTheItem(level);
  ticks(level, 4);
  check('taken out: back to 0', out() === 0, out());
}

await exitWithStatus(close);
