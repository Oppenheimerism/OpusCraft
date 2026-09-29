// (signs) The crafting recipes of the signs and hanging signs (vanilla VanillaRecipeProvider.signBuilder and
// hangingSign): six planks over a stick make three signs; two chains over six stripped logs (or stems) make six
// hanging signs. The oak sign's is recipes.ts's own. Bamboo's need its planks and stripped block, which the game
// hasn't got yet: those two are left out till it has (recipes.ts drops a recipe whose items don't exist).

import { SIGN_WOODS, hangingSignLog, signPlanks } from '../world/blocksSigns';

type Ing = string | string[];
type ShapedFn = (result: string, count: number, pattern: string[], key: Record<string, Ing>) => void;

export function registerSignRecipes(shaped: ShapedFn): void {
  for (const w of SIGN_WOODS) {
    if (w !== 'oak') shaped(`${w}_sign`, 3, ['###', '###', ' X '], { '#': signPlanks(w), X: 'stick' });
    shaped(`${w}_hanging_sign`, 6, ['X X', '###', '###'], { '#': hangingSignLog(w), X: 'chain' });
  }
}
