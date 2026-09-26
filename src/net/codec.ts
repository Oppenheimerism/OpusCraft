// The protocol's wire format: a compact binary encoding of plain data (null, booleans, numbers, strings, arrays,
// plain objects and typed arrays), and nothing else, so what another computer sends can only ever become data.
// The save format's codec (storage/worldFile.ts) also carries Maps, Sets, Dates and BigInts and trusts its input;
// this one is smaller and bounded: every length is checked against the bytes left, nesting is limited, numbers must be
// finite and no key can reach an object's prototype. Decoding a message allocates at most a small multiple of its size.

export type Value =
  | null
  | boolean
  | number
  | string
  | Uint8Array
  | Uint16Array
  | Int16Array
  | Uint32Array
  | Int32Array
  | Float32Array
  | Float64Array
  | Value[]
  | { [k: string]: Value | undefined };

/** a message that isn't well-formed data (the peer that sent it is dropped) */
export class CodecError extends Error {}

const T_NULL = 0, T_FALSE = 1, T_TRUE = 2, T_INT = 3, T_FLOAT = 4, T_STRING = 5, T_ARRAY = 6, T_OBJECT = 7;
const T_U8 = 8, T_U16 = 9, T_I16 = 10, T_U32 = 11, T_I32 = 12, T_F32 = 13, T_F64 = 14;

/** nesting deeper than this is refused (packets are a few levels deep; an item's tag a few more) */
export const MAX_DEPTH = 24;

type TypedCtor = Uint16ArrayConstructor | Int16ArrayConstructor | Uint32ArrayConstructor | Int32ArrayConstructor | Float32ArrayConstructor | Float64ArrayConstructor;
const TYPED: [number, TypedCtor][] = [
  [T_U16, Uint16Array],
  [T_I16, Int16Array],
  [T_U32, Uint32Array],
  [T_I32, Int32Array],
  [T_F32, Float32Array],
  [T_F64, Float64Array],
];
/** (every browser that runs WebGL 2 is little-endian; the wire is too, so typed arrays go as their bytes) */
const LITTLE_ENDIAN = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;

const utf8 = new TextEncoder();
const utf8In = new TextDecoder('utf-8', { fatal: true });

class Writer {
  buf = new Uint8Array(1024);
  view = new DataView(this.buf.buffer);
  n = 0;

  room(k: number): void {
    if (this.n + k <= this.buf.length) return;
    let size = this.buf.length * 2;
    while (size < this.n + k) size *= 2;
    const b = new Uint8Array(size);
    b.set(this.buf.subarray(0, this.n));
    this.buf = b;
    this.view = new DataView(b.buffer);
  }

  byte(v: number): void {
    this.room(1);
    this.buf[this.n++] = v;
  }

  /** an unsigned 32-bit length or count, 7 bits a byte */
  varuint(v: number): void {
    this.room(5);
    v >>>= 0;
    while (v >= 0x80) {
      this.buf[this.n++] = (v & 0x7f) | 0x80;
      v >>>= 7;
    }
    this.buf[this.n++] = v;
  }

  bytes(b: Uint8Array): void {
    this.room(b.length);
    this.buf.set(b, this.n);
    this.n += b.length;
  }

  string(s: string): void {
    const b = utf8.encode(s);
    this.varuint(b.length);
    this.bytes(b);
  }
}

function write(w: Writer, v: Value | undefined, depth: number): void {
  if (depth > MAX_DEPTH) throw new CodecError('nested too deeply');
  if (v === null || v === undefined) return w.byte(T_NULL);
  switch (typeof v) {
    case 'boolean':
      return w.byte(v ? T_TRUE : T_FALSE);
    case 'number':
      if (Number.isInteger(v) && v >= -0x80000000 && v <= 0x7fffffff) {
        w.byte(T_INT);
        return w.varuint(((v << 1) ^ (v >> 31)) >>> 0);
      }
      w.byte(T_FLOAT);
      w.room(8);
      w.view.setFloat64(w.n, v, true);
      w.n += 8;
      return;
    case 'string':
      w.byte(T_STRING);
      return w.string(v);
  }
  if (Array.isArray(v)) {
    w.byte(T_ARRAY);
    w.varuint(v.length);
    for (const x of v) write(w, x, depth + 1);
    return;
  }
  if (v instanceof Uint8Array) {
    w.byte(T_U8);
    w.varuint(v.length);
    return w.bytes(v);
  }
  for (const [tag, C] of TYPED)
    if (v instanceof C) {
      w.byte(tag);
      w.varuint(v.length);
      if (LITTLE_ENDIAN) return w.bytes(new Uint8Array(v.buffer, v.byteOffset, v.byteLength));
      const size = C.BYTES_PER_ELEMENT, bytes = new Uint8Array(v.length * size), dv = new DataView(bytes.buffer);
      for (let i = 0; i < v.length; i++) setTyped(dv, tag, i * size, v[i]);
      return w.bytes(bytes);
    }
  const proto = Object.getPrototypeOf(v);
  if (typeof v === 'object' && (proto === Object.prototype || proto === null)) {
    const keys = Object.keys(v).filter((k) => (v as Record<string, unknown>)[k] !== undefined);
    w.byte(T_OBJECT);
    w.varuint(keys.length);
    for (const k of keys) {
      w.string(k);
      write(w, (v as Record<string, Value>)[k], depth + 1);
    }
    return;
  }
  // (a class instance or a function would lose what it is on the way: a bug in whoever built the packet)
  throw new CodecError(`can't send ${typeof v === 'object' ? (proto?.constructor?.name ?? 'object') : typeof v}`);
}

function setTyped(dv: DataView, tag: number, at: number, x: number): void {
  if (tag === T_U16) dv.setUint16(at, x, true);
  else if (tag === T_I16) dv.setInt16(at, x, true);
  else if (tag === T_U32) dv.setUint32(at, x, true);
  else if (tag === T_I32) dv.setInt32(at, x, true);
  else if (tag === T_F32) dv.setFloat32(at, x, true);
  else dv.setFloat64(at, x, true);
}

function getTyped(dv: DataView, tag: number, at: number): number {
  if (tag === T_U16) return dv.getUint16(at, true);
  if (tag === T_I16) return dv.getInt16(at, true);
  if (tag === T_U32) return dv.getUint32(at, true);
  if (tag === T_I32) return dv.getInt32(at, true);
  if (tag === T_F32) return dv.getFloat32(at, true);
  return dv.getFloat64(at, true);
}

/** `v` as bytes (throws CodecError for anything but plain data) */
export function encode(v: Value): Uint8Array {
  const w = new Writer();
  write(w, v, 0);
  return w.buf.slice(0, w.n);
}

class Reader {
  n = 0;
  readonly view: DataView;
  constructor(readonly buf: Uint8Array) {
    this.view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  }

  get left(): number {
    return this.buf.length - this.n;
  }

  byte(): number {
    if (this.n >= this.buf.length) throw new CodecError('cut short');
    return this.buf[this.n++];
  }

  varuint(): number {
    let v = 0;
    for (let shift = 0; shift < 35; shift += 7) {
      const b = this.byte();
      if (shift === 28 && b > 0x0f) throw new CodecError('number too long');
      v += (b & 0x7f) * 2 ** shift;
      if (!(b & 0x80)) return v;
    }
    throw new CodecError('number too long');
  }

  /** a length of `size`-byte things that must fit in what's left */
  length(size: number): number {
    const n = this.varuint();
    if (n * size > this.left) throw new CodecError('length past the end');
    return n;
  }

  string(): string {
    const n = this.length(1);
    const s = this.buf.subarray(this.n, this.n + n);
    this.n += n;
    try {
      return utf8In.decode(s);
    } catch {
      throw new CodecError('bad text');
    }
  }
}

function read(r: Reader, depth: number): Value {
  if (depth > MAX_DEPTH) throw new CodecError('nested too deeply');
  const tag = r.byte();
  switch (tag) {
    case T_NULL:
      return null;
    case T_FALSE:
      return false;
    case T_TRUE:
      return true;
    case T_INT: {
      const z = r.varuint();
      return z % 2 === 0 ? z / 2 : -(z + 1) / 2;
    }
    case T_FLOAT: {
      if (r.left < 8) throw new CodecError('cut short');
      const v = r.view.getFloat64(r.n, true);
      r.n += 8;
      if (!Number.isFinite(v)) throw new CodecError('not a finite number');
      return v;
    }
    case T_STRING:
      return r.string();
    case T_ARRAY: {
      // (every element takes at least a byte)
      const n = r.length(1);
      const out: Value[] = new Array(n);
      for (let i = 0; i < n; i++) out[i] = read(r, depth + 1);
      return out;
    }
    case T_OBJECT: {
      // (every entry takes at least two bytes: the key's length and the value's tag)
      const n = r.length(2);
      const out: Record<string, Value> = {};
      for (let i = 0; i < n; i++) {
        const k = r.string();
        if (k === '__proto__' || k === 'constructor' || k === 'prototype') throw new CodecError('bad key');
        out[k] = read(r, depth + 1);
      }
      return out;
    }
    case T_U8: {
      const n = r.length(1);
      const out = r.buf.slice(r.n, r.n + n);
      r.n += n;
      return out;
    }
  }
  for (const [t, C] of TYPED)
    if (t === tag) {
      const size = C.BYTES_PER_ELEMENT;
      const n = r.length(size);
      const out = new C(n);
      if (LITTLE_ENDIAN) new Uint8Array(out.buffer).set(r.buf.subarray(r.n, r.n + n * size));
      else for (let i = 0; i < n; i++) out[i] = getTyped(r.view, tag, r.n + i * size);
      r.n += n * size;
      if (tag === T_F32 || tag === T_F64) for (let i = 0; i < n; i++) if (!Number.isFinite(out[i])) throw new CodecError('not a finite number');
      return out;
    }
  throw new CodecError(`unknown tag ${tag}`);
}

/** the data in `bytes`, which must be exactly one value and at most `maxBytes` long (throws CodecError) */
export function decode(bytes: Uint8Array, maxBytes: number): Value {
  if (!(bytes instanceof Uint8Array)) throw new CodecError('not bytes');
  if (bytes.length > maxBytes) throw new CodecError(`message too big (${bytes.length} bytes)`);
  const r = new Reader(bytes);
  const v = read(r, 0);
  if (r.left) throw new CodecError('bytes after the end');
  return v;
}
