// The first-time player tutorial (vanilla Tutorial and its TutorialStepInstances):
// move → find a tree → punch it → open the inventory → craft planks. The step is
// a client option, so once finished it never shows again. Hints are toasts.

import { TutorialToast } from '../gui/toasts';
import type { ToastComponent } from '../gui/toasts';

export type TutorialStep = 'movement' | 'find_tree' | 'punch_tree' | 'open_inventory' | 'craft_planks' | 'none';

const LOGS = /(_log|_wood|_stem|_hyphae)$/;
const TREE_BLOCKS = /(_log|_wood|_leaves|_stem|_hyphae|^nether_wart_block|^warped_wart_block)$/;

export interface TutorialHost {
  toasts: ToastComponent;
  /** survival or adventure (the tutorial only guides survival players) */
  isSurvival(): boolean;
  /** everything the player holds (item ids) */
  inventoryItems(): Set<string>;
  /** key names as shown in hints (vanilla Tutorial.key: bold key names) */
  keyName(action: 'forward' | 'left' | 'back' | 'right' | 'jump' | 'attack' | 'inventory'): string;
  /** the game is played with fingers (game/touch.ts): the hints name what's on the screen, not keys */
  touch?(): boolean;
  getStep(): TutorialStep;
  setStepOption(s: TutorialStep): void;
}

interface StepInstance {
  tick(): void;
  clear(): void;
  onInput?(moving: boolean): void;
  onMouse?(dx: number, dy: number): void;
  onLookAt?(block: string): void;
  onDestroyBlock?(block: string, progress: number): void;
  onGetItem?(items: Set<string>): void;
  onOpenInventory?(): void;
}

const bold = (s: string) => `§l${s}§r`;

export class Tutorial {
  private instance: StepInstance | null = null;
  constructor(private readonly host: TutorialHost) {}

  /** (re)start for the current option value (vanilla Tutorial.start) */
  start(): void {
    this.instance?.clear();
    this.instance = this.create(this.host.getStep());
  }

  stop(): void {
    this.instance?.clear();
    this.instance = null;
  }

  setStep(s: TutorialStep): void {
    this.host.setStepOption(s);
    this.start();
  }

  tick(): void {
    this.instance?.tick();
  }

  onInput(moving: boolean): void {
    this.instance?.onInput?.(moving);
  }
  onMouse(dx: number, dy: number): void {
    this.instance?.onMouse?.(dx, dy);
  }
  onLookAt(block: string): void {
    this.instance?.onLookAt?.(block);
  }
  onDestroyBlock(block: string, progress: number): void {
    this.instance?.onDestroyBlock?.(block, progress);
  }
  onGetItem(items: Set<string>): void {
    this.instance?.onGetItem?.(items);
  }
  onOpenInventory(): void {
    this.instance?.onOpenInventory?.();
  }

  private create(step: TutorialStep): StepInstance | null {
    const h = this.host;
    const t = this;
    switch (step) {
      case 'movement': {
        // vanilla MovementTutorialStepInstance
        let timeWaiting = 0, timeMoved = 0, timeLooked = 0, moved = false, turned = false, moveCompleted = -1, lookCompleted = -1;
        let moveToast: TutorialToast | null = null, lookToast: TutorialToast | null = null;
        return {
          tick() {
            timeWaiting++;
            if (moved) {
              timeMoved++;
              moved = false;
            }
            if (turned) {
              timeLooked++;
              turned = false;
            }
            if (timeMoved >= 40 && moveCompleted === -1) moveCompleted = timeWaiting;
            if (timeLooked >= 40 && lookCompleted === -1) lookCompleted = timeWaiting;
            if (moveCompleted !== -1 && lookCompleted !== -1) {
              t.setStep(h.isSurvival() ? 'find_tree' : 'none');
              return;
            }
            moveToast?.updateProgress(timeMoved / 40);
            lookToast?.updateProgress(timeLooked / 40);
            if (timeWaiting >= 100) {
              if (moveCompleted === -1 && !moveToast) {
                const title = `Move with ${bold(h.keyName('forward'))}, ${bold(h.keyName('left'))}, ${bold(h.keyName('back'))} and ${bold(h.keyName('right'))}`;
                if (h.touch?.()) moveToast = new TutorialToast('movement_keys', 'Move: your left thumb', 'Jump: the arrow button', true);
                else moveToast = new TutorialToast('movement_keys', title, `Jump with ${bold(h.keyName('jump'))}`, true);
                h.toasts.add(moveToast);
              } else if (moveCompleted !== -1 && timeWaiting - moveCompleted >= 20 && lookCompleted === -1 && !lookToast) {
                lookToast = new TutorialToast('mouse', 'Look around', h.touch?.() ? 'Drag a finger to turn' : 'Use your mouse to turn', true);
                h.toasts.add(lookToast);
              }
            }
          },
          clear() {
            moveToast?.hide();
            lookToast?.hide();
            moveToast = lookToast = null;
          },
          onInput(moving) {
            if (moving) moved = true;
          },
          onMouse(dx, dy) {
            if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) turned = true;
          },
        };
      }
      case 'find_tree': {
        // vanilla FindTreeTutorialStepInstance: the hint only after five minutes
        let timeWaiting = 0;
        let toast: TutorialToast | null = null;
        return {
          tick() {
            timeWaiting++;
            if (!h.isSurvival()) {
              t.setStep('none');
              return;
            }
            if (timeWaiting === 1 && [...h.inventoryItems()].some((id) => TREE_BLOCKS.test(id))) {
              t.setStep('craft_planks');
              return;
            }
            if (timeWaiting >= 6000 && !toast) {
              toast = new TutorialToast('tree', 'Find a tree', 'Punch it to collect wood', false);
              h.toasts.add(toast);
            }
          },
          clear() {
            toast?.hide();
            toast = null;
          },
          onLookAt(block) {
            if (TREE_BLOCKS.test(block)) t.setStep('punch_tree');
          },
          onGetItem(items) {
            if ([...items].some((id) => TREE_BLOCKS.test(id))) t.setStep('craft_planks');
          },
        };
      }
      case 'punch_tree': {
        // vanilla PunchTreeTutorialStepInstance
        let timeWaiting = 0, resetCount = 0;
        let toast: TutorialToast | null = null;
        return {
          tick() {
            timeWaiting++;
            if (!h.isSurvival()) {
              t.setStep('none');
              return;
            }
            if (timeWaiting === 1 && [...h.inventoryItems()].some((id) => LOGS.test(id))) {
              t.setStep('craft_planks');
              return;
            }
            if ((timeWaiting >= 600 || resetCount > 3) && !toast) {
              toast = new TutorialToast('tree', 'Destroy the tree', h.touch?.() ? 'Hold a finger on it' : `Hold down ${bold(h.keyName('attack'))}`, true);
              h.toasts.add(toast);
            }
          },
          clear() {
            toast?.hide();
            toast = null;
          },
          onDestroyBlock(block, progress) {
            const log = LOGS.test(block);
            if (log && progress > 0) {
              toast?.updateProgress(progress);
              if (progress >= 1) t.setStep('open_inventory');
            } else if (toast) toast.updateProgress(0);
            else if (log) resetCount++;
          },
          onGetItem(items) {
            if ([...items].some((id) => LOGS.test(id))) t.setStep('open_inventory');
          },
        };
      }
      case 'open_inventory': {
        // vanilla OpenInventoryTutorialStep
        let timeWaiting = 0;
        let toast: TutorialToast | null = null;
        return {
          tick() {
            timeWaiting++;
            if (!h.isSurvival()) {
              t.setStep('none');
              return;
            }
            if (timeWaiting >= 600 && !toast) {
              toast = new TutorialToast('recipe_book', 'Open your inventory', h.touch?.() ? 'Tap the three dots' : `Press ${bold(h.keyName('inventory'))}`, false);
              h.toasts.add(toast);
            }
          },
          clear() {
            toast?.hide();
            toast = null;
          },
          onOpenInventory() {
            t.setStep('craft_planks');
          },
        };
      }
      case 'craft_planks': {
        // vanilla CraftPlanksTutorialStep
        let timeWaiting = 0;
        let toast: TutorialToast | null = null;
        return {
          tick() {
            timeWaiting++;
            if (!h.isSurvival()) {
              t.setStep('none');
              return;
            }
            if (timeWaiting === 1 && [...h.inventoryItems()].some((id) => id.endsWith('_planks'))) {
              t.setStep('none');
              return;
            }
            if (timeWaiting >= 1200 && !toast) {
              toast = new TutorialToast('wooden_planks', 'Craft wooden planks', 'The recipe book can help', false);
              h.toasts.add(toast);
            }
          },
          clear() {
            toast?.hide();
            toast = null;
          },
          onGetItem(items) {
            if ([...items].some((id) => id.endsWith('_planks'))) t.setStep('none');
          },
        };
      }
      default:
        return null;
    }
  }
}
