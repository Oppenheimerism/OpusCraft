// Where the job sites' screens plug in (vanilla MenuProvider → Player.openMenu for the stonecutter, smithing table,
// loom, cartography table and a lectern's book): the GUI installs the factory (gui/screens/jobSites.ts), the game
// shell asks it from Game.openContainer.

import type { Game } from './game';
import type { Screen } from '../gui/screen';

type JobSiteScreenFactory = (kind: string, x: number, y: number, z: number) => Screen | null;
let factory: JobSiteScreenFactory | null = null;

export function setJobSiteScreens(f: JobSiteScreenFactory | null): void {
  factory = f;
}

/** open the menu of the job site `kind` at (x, y, z), if it has one */
export function openJobSite(game: Game, kind: string, x: number, y: number, z: number): void {
  const s = factory?.(kind, x, y, z);
  if (s) game.setScreen(s);
}
