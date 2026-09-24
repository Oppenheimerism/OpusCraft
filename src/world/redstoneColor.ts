// Redstone dust's colour by its power (vanilla RedStoneWireBlock.COLORS and getColorForPower): dark red at 0,
// brightening to red-orange at 15. The mesher tints the dust with it; its particles use the same colours.

/** vanilla COLORS: [r, g, b] in 0..1 for each power */
export const REDSTONE_COLORS: [number, number, number][] = [];
for (let i = 0; i <= 15; i++) {
  const f = i / 15;
  const g = f * 0.6 + (f > 0 ? 0.4 : 0.3);
  const h = Math.min(1, Math.max(0, f * f * 0.7 - 0.5));
  const j = Math.min(1, Math.max(0, f * f * 0.6 - 0.7));
  REDSTONE_COLORS.push([Math.fround(g), Math.fround(h), Math.fround(j)]);
}

/** vanilla getColorForPower (Mth.color of the floats × 255, floored) */
export function redstoneColor(power: number): number {
  const [r, g, b] = REDSTONE_COLORS[power];
  return (Math.floor(r * 255) << 16) | (Math.floor(g * 255) << 8) | Math.floor(b * 255);
}
