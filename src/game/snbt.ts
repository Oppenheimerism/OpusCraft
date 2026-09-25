// (trial chambers) Stringified NBT as vanilla's TagParser reads it, into plain values: a compound {key:value, ...} as an
// object, a list [...] (and a typed array [B; ...], [I; ...], [L; ...]) as an array, a quoted or bare string, a number
// with its b, s, L, f or d dropped, and true / false. For block entity data given to /setblock (commands.ts), read by
// the block entity (the vault's config, the trial spawner's). Anything it can't read ends what it has read so far.

export type SnbtValue = string | number | boolean | SnbtValue[] | { [k: string]: SnbtValue };

export function parseSnbt(text: string): SnbtValue | null {
  const s = text;
  let i = 0;
  const ws = () => {
    while (i < s.length && /\s/.test(s[i])) i++;
  };
  const quoted = (): string => {
    const q = s[i++];
    let v = '';
    while (i < s.length && s[i] !== q) {
      if (s[i] === '\\') i++;
      v += s[i++];
    }
    i++;
    return v;
  };
  // (vanilla StringReader.isAllowedInUnquotedString: letters, digits, _ - . and +)
  const bare = (): string => {
    let v = '';
    while (i < s.length && /[\w.+-]/.test(s[i])) v += s[i++];
    return v;
  };
  const value = (): SnbtValue | null => {
    ws();
    const ch = s[i];
    if (ch === '{') {
      i++;
      const o: { [k: string]: SnbtValue } = {};
      for (;;) {
        ws();
        if (s[i] === '}') {
          i++;
          return o;
        }
        const key = s[i] === '"' || s[i] === "'" ? quoted() : bare();
        ws();
        if (!key || s[i] !== ':') return o;
        i++;
        const v = value();
        if (v === null) return o;
        o[key] = v;
        ws();
        if (s[i] === ',') i++;
      }
    }
    if (ch === '[') {
      i++;
      // (a typed array's B; I; or L;)
      if (/^[BIL];/.test(s.slice(i, i + 2))) i += 2;
      const a: SnbtValue[] = [];
      for (;;) {
        ws();
        if (s[i] === ']') {
          i++;
          return a;
        }
        const v = value();
        if (v === null) return a;
        a.push(v);
        ws();
        if (s[i] === ',') i++;
      }
    }
    if (ch === '"' || ch === "'") return quoted();
    const v = bare();
    if (!v) return null;
    const num = /^([-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?)[bslfd]?$/i.exec(v);
    return num ? Number(num[1]) : v === 'true' ? true : v === 'false' ? false : v;
  };
  return value();
}

/** a compound's value as an object (null for anything else) */
export function snbtObject(v: SnbtValue | null | undefined): { [k: string]: SnbtValue } | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? v : null;
}

/** where the compound or list opening at `start` ends (just past its closing bracket; the text's end if it's left open) */
export function snbtEnd(text: string, start: number): number {
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"' || ch === "'") {
      for (i++; i < text.length && text[i] !== ch; i++) if (text[i] === '\\') i++;
    } else if (ch === '{' || ch === '[') depth++;
    else if ((ch === '}' || ch === ']') && --depth === 0) return i + 1;
  }
  return text.length;
}
