// Builders for option widgets bound to GameOptions (vanilla OptionInstance).

import type { Game } from '../../game/game';
import type { GameOptions } from '../../game/options';
import { CycleButton, Slider, Widget } from '../screen';

type Keys<T> = { [K in keyof GameOptions]: GameOptions[K] extends T ? K : never }[keyof GameOptions];

export const onOff = (v: boolean): string => (v ? 'ON' : 'OFF');

function commit(game: Game, apply?: () => void): void {
  game.saveOptions();
  apply?.();
}

/** "Caption: ON/OFF" */
export function boolOption(game: Game, caption: string, key: Keys<boolean>, apply?: (v: boolean) => void, tooltip?: string): CycleButton<boolean> {
  const b = new CycleButton<boolean>(0, 0, 150, 20, caption, [true, false], game.opts[key] as boolean, onOff, (v) => {
    (game.opts[key] as boolean) = v;
    commit(game, () => apply?.(v));
  });
  b.tooltip = tooltip;
  return b;
}

/** cycle through indexed values stored as a number */
export function enumOption(game: Game, caption: string, key: Keys<number>, labels: string[], apply?: (v: number) => void, tooltip?: string): CycleButton<number> {
  const values = labels.map((_, i) => i);
  const b = new CycleButton<number>(0, 0, 150, 20, caption, values, game.opts[key] as number, (v) => labels[v], (v) => {
    (game.opts[key] as number) = v;
    commit(game, () => apply?.(v));
  });
  b.tooltip = tooltip;
  return b;
}

/** integer slider: min..max, step */
export function intSlider(game: Game, caption: string, key: Keys<number>, min: number, max: number, fmt: (v: number) => string, apply?: (v: number) => void, step = 1, applyOnRelease = false): Slider {
  const toVal = (f: number) => Math.round((min + f * (max - min)) / step) * step;
  const toF = (v: number) => (v - min) / (max - min);
  const s = new Slider(
    0,
    0,
    150,
    20,
    toF(game.opts[key] as number),
    (f) => `${caption}: ${fmt(toVal(f))}`,
    (f) => {
      const v = toVal(f);
      if (v === game.opts[key]) return;
      (game.opts[key] as number) = v;
      if (!applyOnRelease) apply?.(v);
    },
    () => {
      // snap handle to the chosen value
      s.value = toF(game.opts[key] as number);
      commit(game, () => {
        if (applyOnRelease) apply?.(game.opts[key] as number);
      });
    },
  );
  return s;
}

/** continuous 0..1 slider with custom label */
export function fracSlider(game: Game, caption: string, key: Keys<number>, fmt: (v: number) => string, apply?: (v: number) => void, min = 0, max = 1): Slider {
  return new Slider(
    0,
    0,
    150,
    20,
    ((game.opts[key] as number) - min) / (max - min),
    (f) => `${caption}: ${fmt(min + f * (max - min))}`,
    (f) => {
      (game.opts[key] as number) = min + f * (max - min);
      apply?.(game.opts[key] as number);
    },
    () => commit(game),
  );
}

export const pct = (v: number): string => `${Math.round(v * 100)}%`;
/** volume sliders: "Music: 100%" / "Music: OFF" */
export function volumeSlider(game: Game, caption: string, key: Keys<number>): Slider {
  return fracSlider(game, caption, key, (v) => (v <= 0 ? 'OFF' : pct(v)));
}

export function big(w: Widget): Widget {
  w.w = 310;
  return w;
}
