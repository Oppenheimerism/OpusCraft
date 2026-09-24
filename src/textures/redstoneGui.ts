// GUI sprites of the redstone components' screens (vanilla textures/gui/container/dispenser.png): the dispenser's and
// dropper's panel, its 3x3 grid of slots in the middle over the player's inventory.

import { GUI_TEXTURES, panel, slotAt, playerInventory } from './gui';

GUI_TEXTURES['container_dispenser'] = () => {
  const t = panel(176, 166);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) slotAt(t, 62 + j * 18, 17 + i * 18);
  playerInventory(t, 84);
  return t;
};
