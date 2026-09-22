// Dye color families (approximate vanilla block colors).

export interface DyeColors {
  wool: number;
  terracotta: number;
  concrete: number;
  /** dye item / text color */
  dye: number;
}

export const DYE: Record<string, DyeColors> = {
  white: { wool: 0xeaeded, terracotta: 0xd1b2a1, concrete: 0xcfd5d6, dye: 0xf9fffe },
  orange: { wool: 0xf07613, terracotta: 0xa15325, concrete: 0xe06100, dye: 0xf9801d },
  magenta: { wool: 0xbd44b3, terracotta: 0x95576c, concrete: 0xa9309f, dye: 0xc74ebd },
  light_blue: { wool: 0x3aafd9, terracotta: 0x706c8a, concrete: 0x2389c6, dye: 0x3ab3da },
  yellow: { wool: 0xf8c627, terracotta: 0xba8523, concrete: 0xf0af15, dye: 0xfed83d },
  lime: { wool: 0x70b919, terracotta: 0x677534, concrete: 0x5ea818, dye: 0x80c71f },
  pink: { wool: 0xed8dac, terracotta: 0xa14e4e, concrete: 0xd5658e, dye: 0xf38baa },
  gray: { wool: 0x3e4447, terracotta: 0x392a23, concrete: 0x36393d, dye: 0x474f52 },
  light_gray: { wool: 0x8e8e86, terracotta: 0x876b62, concrete: 0x7d7d73, dye: 0x9d9d97 },
  cyan: { wool: 0x158991, terracotta: 0x575b5b, concrete: 0x157788, dye: 0x169c9c },
  purple: { wool: 0x792aac, terracotta: 0x764656, concrete: 0x64209c, dye: 0x8932b8 },
  blue: { wool: 0x35399d, terracotta: 0x4a3b5b, concrete: 0x2c2e8f, dye: 0x3c44aa },
  brown: { wool: 0x724728, terracotta: 0x4d3323, concrete: 0x603b1f, dye: 0x835432 },
  green: { wool: 0x546d1b, terracotta: 0x4c532a, concrete: 0x495b24, dye: 0x5e7c16 },
  red: { wool: 0xa12722, terracotta: 0x8f3d2e, concrete: 0x8e2020, dye: 0xb02e26 },
  black: { wool: 0x141519, terracotta: 0x251610, concrete: 0x080a0f, dye: 0x1d1d21 },
};
