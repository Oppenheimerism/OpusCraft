// A world as one file, for Make Backup and Import World (storage/worldTransfer.ts). Vanilla backs a world up as a
// zip of its folder (LevelStorageSource.LevelStorageAccess.makeWorldBackup); a world here is records in IndexedDB,
// so the file holds those records just as they are:
//
//   "MCWORLD" 0       magic, 8 bytes
//   u32               the format's version (FORMAT_VERSION)
//   u32, JSON         the manifest (WorldFileManifest), UTF-8
//   u8, u32, bytes    each record: its store (1 worlds, 2 chunks, 3 entities), its length, the record (writeValue)
//   u8 0              the end
//
// little-endian, and the whole of it gzip'd where the browser has CompressionStream (a file is read either way). A
// record keeps everything IndexedDB keeps of it (each kind of typed array, undefined, NaN and -0, holes in arrays,
// lone surrogates in strings, BigInts, Dates, Maps and Sets), so a world comes back bit for bit.

export const FORMAT_VERSION = 1;
/** "MCWORLD\0" */
const MAGIC = [0x4d, 0x43, 0x57, 0x4f, 0x52, 0x4c, 0x44, 0x00];
/** the stores a world's records come from, by their number in the file (0 ends it) */
export const RECORD_STORES = ['worlds', 'chunks', 'entities'] as const;
export type RecordStore = (typeof RECORD_STORES)[number];

const MAX_MANIFEST = 1 << 20;
const MAX_RECORD = 1 << 26;
/** how much is written before it's handed on (to the gzip stream) */
const FLUSH_BYTES = 1 << 20;

export interface WorldFileManifest {
  /** the world's id (the name of its folder, as vanilla has it) and its name */
  id: string;
  name: string;
  /** when the file was made (ms) */
  exported: number;
  /** how many records of each store follow (for the progress shown while importing) */
  records: Record<RecordStore, number>;
}

/** why a file can't be imported: not a world file, one from a newer version, a damaged one, or a browser that can't unpack it */
export type WorldFileProblem = 'not_world' | 'newer' | 'damaged' | 'unsupported';

export class WorldFileError extends Error {
  constructor(readonly problem: WorldFileProblem, message: string) {
    super(message);
    this.name = 'WorldFileError';
  }
}

const damaged = (why: string) => new WorldFileError('damaged', why);

// ---------------------------------------------------------------------------
// Bytes

class ByteWriter {
  bytes = new Uint8Array(1 << 16);
  length = 0;
  private view = new DataView(this.bytes.buffer);

  /** room for n more bytes: where they go (the buffer may be a new one after, so it's read after this) */
  private reserve(n: number): number {
    const at = this.length;
    if (at + n > this.bytes.length) {
      let cap = this.bytes.length * 2;
      while (cap < at + n) cap *= 2;
      const b = new Uint8Array(cap);
      b.set(this.bytes.subarray(0, at));
      this.bytes = b;
      this.view = new DataView(b.buffer);
    }
    this.length = at + n;
    return at;
  }
  u8(v: number): void {
    const at = this.reserve(1);
    this.bytes[at] = v;
  }
  u16(v: number): void {
    const at = this.reserve(2);
    this.view.setUint16(at, v, true);
  }
  u32(v: number): void {
    const at = this.reserve(4);
    this.view.setUint32(at, v, true);
  }
  u32At(at: number, v: number): void {
    this.view.setUint32(at, v, true);
  }
  i32(v: number): void {
    const at = this.reserve(4);
    this.view.setInt32(at, v, true);
  }
  f64(v: number): void {
    const at = this.reserve(8);
    this.view.setFloat64(at, v, true);
  }
  varuint(v: number): void {
    while (v >= 0x80) {
      this.u8((v & 0x7f) | 0x80);
      v = Math.floor(v / 128);
    }
    this.u8(v);
  }
  raw(b: Uint8Array): void {
    const at = this.reserve(b.length);
    this.bytes.set(b, at);
  }
  /** what's been written (a copy), and the writer emptied */
  take(): Uint8Array<ArrayBuffer> {
    const out = this.bytes.slice(0, this.length);
    this.length = 0;
    return out;
  }
}

class ByteReader {
  pos = 0;
  private readonly view: DataView;
  constructor(readonly bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }
  private need(n: number): number {
    const at = this.pos;
    if (n < 0 || at + n > this.bytes.length) throw new RangeError('past the end of the record');
    this.pos = at + n;
    return at;
  }
  u8(): number {
    return this.bytes[this.need(1)];
  }
  u16(): number {
    return this.view.getUint16(this.need(2), true);
  }
  i32(): number {
    return this.view.getInt32(this.need(4), true);
  }
  f64(): number {
    return this.view.getFloat64(this.need(8), true);
  }
  varuint(): number {
    let v = 0;
    for (let m = 1; ; m *= 128) {
      const b = this.u8();
      v += (b & 0x7f) * m;
      if (b < 0x80) return v;
      if (m > 2 ** 42) throw new RangeError('number too long');
    }
  }
  bytesOf(n: number): Uint8Array {
    const at = this.need(n);
    return this.bytes.subarray(at, at + n);
  }
}

// ---------------------------------------------------------------------------
// Values (what IndexedDB's structured clone keeps)

const T_UNDEFINED = 0, T_NULL = 1, T_FALSE = 2, T_TRUE = 3, T_INT = 4, T_FLOAT = 5, T_STRING = 6, T_STRING16 = 7;
const T_ARRAY = 8, T_HOLE = 9, T_OBJECT = 10, T_VIEW = 11, T_BUFFER = 12, T_BIGINT = 13, T_DATE = 14, T_MAP = 15, T_SET = 16;

/** typed arrays and DataView, by their number in the file */
const VIEW_KINDS = ['Int8Array', 'Uint8Array', 'Uint8ClampedArray', 'Int16Array', 'Uint16Array', 'Int32Array', 'Uint32Array', 'Float32Array', 'Float64Array', 'BigInt64Array', 'BigUint64Array', 'DataView'];
const VIEWS = [Int8Array, Uint8Array, Uint8ClampedArray, Int16Array, Uint16Array, Int32Array, Uint32Array, Float32Array, Float64Array, BigInt64Array, BigUint64Array, DataView] as unknown as (new (b: ArrayBuffer) => ArrayBufferView)[];

const utf8 = new TextEncoder();
const utf8Strict = new TextDecoder('utf-8', { fatal: true });
/** a high surrogate with no low one after it, or a low one with no high one before it (which UTF-8 can't carry) */
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/;

function writeString(w: ByteWriter, s: string): void {
  if (LONE_SURROGATE.test(s)) {
    w.u8(T_STRING16);
    w.varuint(s.length);
    for (let i = 0; i < s.length; i++) w.u16(s.charCodeAt(i));
    return;
  }
  const b = utf8.encode(s);
  w.u8(T_STRING);
  w.varuint(b.length);
  w.raw(b);
}

function writeValue(w: ByteWriter, v: unknown): void {
  switch (typeof v) {
    case 'undefined':
      w.u8(T_UNDEFINED);
      return;
    case 'boolean':
      w.u8(v ? T_TRUE : T_FALSE);
      return;
    case 'number':
      if ((v | 0) === v && !Object.is(v, -0)) {
        w.u8(T_INT);
        w.i32(v);
      } else {
        w.u8(T_FLOAT);
        w.f64(v);
      }
      return;
    case 'string':
      writeString(w, v);
      return;
    case 'bigint':
      w.u8(T_BIGINT);
      writeString(w, v.toString());
      return;
    case 'object':
      break;
    default:
      throw new TypeError(`can't write a ${typeof v}`);
  }
  if (v === null) {
    w.u8(T_NULL);
    return;
  }
  if (Array.isArray(v)) {
    w.u8(T_ARRAY);
    w.varuint(v.length);
    for (let i = 0; i < v.length; i++) {
      if (i in v) writeValue(w, v[i]);
      else w.u8(T_HOLE);
    }
    return;
  }
  if (ArrayBuffer.isView(v)) {
    const kind = VIEW_KINDS.indexOf(Object.prototype.toString.call(v).slice(8, -1));
    if (kind < 0) throw new TypeError(`can't write a ${Object.prototype.toString.call(v)}`);
    w.u8(T_VIEW);
    w.u8(kind);
    w.varuint(v.byteLength);
    w.raw(new Uint8Array(v.buffer, v.byteOffset, v.byteLength));
    return;
  }
  if (v instanceof ArrayBuffer) {
    w.u8(T_BUFFER);
    w.varuint(v.byteLength);
    w.raw(new Uint8Array(v));
    return;
  }
  if (v instanceof Date) {
    w.u8(T_DATE);
    w.f64(v.getTime());
    return;
  }
  if (v instanceof Map) {
    w.u8(T_MAP);
    w.varuint(v.size);
    for (const [k, x] of v) {
      writeValue(w, k);
      writeValue(w, x);
    }
    return;
  }
  if (v instanceof Set) {
    w.u8(T_SET);
    w.varuint(v.size);
    for (const x of v) writeValue(w, x);
    return;
  }
  const proto = Object.getPrototypeOf(v);
  if (proto !== Object.prototype && proto !== null) throw new TypeError(`can't write a ${proto?.constructor?.name ?? 'object'}`);
  const keys = Object.keys(v);
  w.u8(T_OBJECT);
  w.varuint(keys.length);
  for (const k of keys) {
    writeString(w, k);
    writeValue(w, (v as Record<string, unknown>)[k]);
  }
}

function readString(r: ByteReader, tag: number): string {
  const n = r.varuint();
  if (tag === T_STRING) return utf8Strict.decode(r.bytesOf(n));
  let s = '';
  for (let i = 0; i < n; i++) s += String.fromCharCode(r.u16());
  return s;
}

function readValue(r: ByteReader): unknown {
  const t = r.u8();
  switch (t) {
    case T_UNDEFINED:
      return undefined;
    case T_NULL:
      return null;
    case T_FALSE:
      return false;
    case T_TRUE:
      return true;
    case T_INT:
      return r.i32();
    case T_FLOAT:
      return r.f64();
    case T_STRING:
    case T_STRING16:
      return readString(r, t);
    case T_BIGINT: {
      const s = readValue(r);
      if (typeof s !== 'string') throw new TypeError('bad BigInt');
      return BigInt(s);
    }
    case T_ARRAY: {
      const n = r.varuint();
      if (n > r.bytes.length) throw new RangeError('array longer than its record');
      const a = new Array(n);
      for (let i = 0; i < n; i++) {
        if (r.bytes[r.pos] === T_HOLE) r.pos++;
        else a[i] = readValue(r);
      }
      return a;
    }
    case T_OBJECT: {
      const n = r.varuint();
      const o: Record<string, unknown> = {};
      for (let i = 0; i < n; i++) {
        const k = readValue(r);
        if (typeof k !== 'string') throw new TypeError('bad key');
        const v = readValue(r);
        // (a key "__proto__" is the object's own, as structured clone has it, not its prototype)
        if (k === '__proto__') Object.defineProperty(o, k, { value: v, writable: true, enumerable: true, configurable: true });
        else o[k] = v;
      }
      return o;
    }
    case T_VIEW: {
      const View = VIEWS[r.u8()];
      if (!View) throw new TypeError('unknown typed array');
      const bytes = r.bytesOf(r.varuint()).slice();
      const per = (View as unknown as { BYTES_PER_ELEMENT?: number }).BYTES_PER_ELEMENT ?? 1;
      if (bytes.length % per) throw new RangeError('typed array of a broken length');
      return new View(bytes.buffer);
    }
    case T_BUFFER:
      return r.bytesOf(r.varuint()).slice().buffer;
    case T_DATE:
      return new Date(r.f64());
    case T_MAP: {
      const n = r.varuint();
      const m = new Map<unknown, unknown>();
      for (let i = 0; i < n; i++) {
        const k = readValue(r);
        m.set(k, readValue(r));
      }
      return m;
    }
    case T_SET: {
      const n = r.varuint();
      const s = new Set<unknown>();
      for (let i = 0; i < n; i++) s.add(readValue(r));
      return s;
    }
  }
  throw new TypeError(`unknown value tag ${t}`);
}

/** a record as bytes, keeping all of what IndexedDB keeps of it */
export function encodeValue(v: unknown): Uint8Array {
  const w = new ByteWriter();
  writeValue(w, v);
  return w.take();
}

export function decodeValue(bytes: Uint8Array): unknown {
  const r = new ByteReader(bytes);
  const v = readValue(r);
  if (r.pos !== bytes.length) throw new RangeError('bytes left over after the record');
  return v;
}

// ---------------------------------------------------------------------------
// The file

/** writes a world file into `sink` a piece at a time (worldTransfer.exportWorld) */
export class WorldFileWriter {
  private readonly w = new ByteWriter();

  constructor(private readonly sink: (bytes: Uint8Array<ArrayBuffer>) => Promise<void>, manifest: WorldFileManifest) {
    this.w.raw(Uint8Array.from(MAGIC));
    this.w.u32(FORMAT_VERSION);
    const m = utf8.encode(JSON.stringify(manifest));
    this.w.u32(m.length);
    this.w.raw(m);
  }

  record(store: RecordStore, value: unknown): void {
    this.w.u8(RECORD_STORES.indexOf(store) + 1);
    const at = this.w.length;
    this.w.u32(0);
    writeValue(this.w, value);
    this.w.u32At(at, this.w.length - at - 4);
  }

  /** hands what's written on to the sink once there's a good piece of it (or all of it) */
  async flush(all = false): Promise<void> {
    if (this.w.length >= FLUSH_BYTES || (all && this.w.length)) await this.sink(this.w.take());
  }

  async end(): Promise<void> {
    this.w.u8(0);
    await this.flush(true);
  }
}

/** reads a world file a piece at a time as it streams in (worldTransfer.importWorld) */
export class WorldFileReader {
  private buf: Uint8Array = new Uint8Array(0);
  private pos = 0;
  private ended = false;

  constructor(private readonly pull: () => Promise<Uint8Array | null>, readonly cancel: () => void = () => {}) {}

  /** n bytes buffered from pos (false: the stream ended first) */
  private async fill(n: number): Promise<boolean> {
    while (this.buf.length - this.pos < n) {
      if (this.ended) return false;
      let chunk: Uint8Array | null;
      try {
        chunk = await this.pull();
      } catch (e) {
        // (DecompressionStream: the gzip is broken, or cut short)
        throw damaged(`can't be unpacked: ${(e as Error)?.message ?? e}`);
      }
      if (!chunk) {
        this.ended = true;
        return false;
      }
      const rest = this.buf.length - this.pos;
      if (!rest) this.buf = chunk;
      else {
        const b = new Uint8Array(rest + chunk.length);
        b.set(this.buf.subarray(this.pos));
        b.set(chunk, rest);
        this.buf = b;
      }
      this.pos = 0;
    }
    return true;
  }

  private async take(n: number): Promise<Uint8Array> {
    if (!(await this.fill(n))) throw damaged('it ends early');
    const at = this.pos;
    this.pos += n;
    return this.buf.subarray(at, at + n);
  }

  private async u32(): Promise<number> {
    const b = await this.take(4);
    return new DataView(b.buffer, b.byteOffset, 4).getUint32(0, true);
  }

  /** the magic, the version and the manifest, checked */
  async header(): Promise<WorldFileManifest> {
    if (!(await this.fill(MAGIC.length)) || MAGIC.some((b, i) => this.buf[this.pos + i] !== b)) throw new WorldFileError('not_world', 'not a world file');
    this.pos += MAGIC.length;
    const version = await this.u32();
    if (version > FORMAT_VERSION) throw new WorldFileError('newer', `format ${version}, newer than ${FORMAT_VERSION}`);
    if (version < 1) throw damaged(`format ${version}`);
    const n = await this.u32();
    if (n > MAX_MANIFEST) throw damaged('manifest too long');
    let m: Partial<WorldFileManifest> | null;
    try {
      m = JSON.parse(utf8Strict.decode(await this.take(n)));
    } catch (e) {
      if (e instanceof WorldFileError) throw e;
      throw damaged('manifest unreadable');
    }
    if (!m || typeof m !== 'object' || typeof m.id !== 'string' || typeof m.name !== 'string') throw damaged('manifest without a world');
    const rec = (m.records ?? {}) as Partial<Record<RecordStore, number>>;
    const count = (s: RecordStore) => (Number.isFinite(rec[s]) ? Math.max(0, rec[s]!) : 0);
    return { id: m.id, name: m.name, exported: Number(m.exported) || 0, records: { worlds: count('worlds'), chunks: count('chunks'), entities: count('entities') } };
  }

  /** the next record, or null at the end */
  async next(): Promise<{ store: RecordStore; value: unknown } | null> {
    const s = (await this.take(1))[0];
    if (s === 0) return null;
    const store = RECORD_STORES[s - 1];
    if (!store) throw damaged(`unknown store ${s}`);
    const n = await this.u32();
    if (n > MAX_RECORD) throw damaged('record too long');
    const bytes = await this.take(n);
    try {
      return { store, value: decodeValue(bytes) };
    } catch (e) {
      throw damaged(`unreadable record: ${(e as Error)?.message ?? e}`);
    }
  }

  /** after the end: the stream read out (which is when gzip checks the whole file), with nothing more in it */
  async close(): Promise<void> {
    if (await this.fill(1)) throw damaged('more after the end');
  }
}

/** a world file to read, gzip'd or not */
export async function openWorldFile(file: Blob): Promise<WorldFileReader> {
  const head = new Uint8Array(await file.slice(0, 2).arrayBuffer());
  let stream: ReadableStream<Uint8Array<ArrayBuffer>> = file.stream();
  if (head[0] === 0x1f && head[1] === 0x8b) {
    if (typeof DecompressionStream === 'undefined') throw new WorldFileError('unsupported', "this browser can't unpack gzip");
    stream = stream.pipeThrough(new DecompressionStream('gzip'));
  }
  const r = stream.getReader();
  return new WorldFileReader(
    async () => {
      const x = await r.read();
      return x.done ? null : x.value;
    },
    () => void r.cancel().catch(() => {}),
  );
}

/** where a world file is written: gzip'd into a Blob where the browser has CompressionStream, else as it is */
export function worldFileSink(): { write(bytes: Uint8Array<ArrayBuffer>): Promise<void>; close(): Promise<Blob>; abort(): void } {
  if (typeof CompressionStream === 'undefined') {
    const parts: BlobPart[] = [];
    return {
      write: async (b) => void parts.push(b),
      close: async () => new Blob(parts, { type: 'application/octet-stream' }),
      abort: () => void (parts.length = 0),
    };
  }
  const cs = new CompressionStream('gzip');
  const writer = cs.writable.getWriter();
  // (read as it's written, or the stream would fill up and stop the writer)
  const blob = new Response(cs.readable).blob();
  blob.catch(() => {});
  return {
    write: (b) => writer.write(b),
    close: async () => {
      await writer.close();
      return new Blob([await blob], { type: 'application/octet-stream' });
    },
    abort: () => void writer.abort().catch(() => {}),
  };
}

// ---------------------------------------------------------------------------
// Names

/** vanilla SharedConstants.ILLEGAL_FILE_CHARACTERS */
const ILLEGAL_FILE_CHARACTERS = /[/\n\r\t\0\f`?*\\<>|":]/g;
/** vanilla FileUtil.RESERVED_WINDOWS_FILENAMES */
const RESERVED_WINDOWS_FILENAMES = /^(?:.*\.|(?:COM|CLOCK\$|CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?)$/is;
/** vanilla FileUtil.COPY_COUNTER_PATTERN */
const COPY_COUNTER_PATTERN = /^(.*) \((\d*)\)$/s;

/**
 * vanilla FileUtil.findAvailableName: the name made safe for a folder, then " (1)", " (2)" and so on until it isn't
 * taken (a name already ending in a counter counts on from it)
 */
export function findAvailableName(name: string, taken: (n: string) => boolean): string {
  name = name.replace(ILLEGAL_FILE_CHARACTERS, '_').replace(/[./"]/g, '_');
  if (RESERVED_WINDOWS_FILENAMES.test(name)) name = '_' + name + '_';
  return countOn(name, taken, 255);
}

/** findAvailableName's counting on its own: for a world's name in the list, which can be anything */
export function countOn(name: string, taken: (n: string) => boolean, maxLength = Infinity): string {
  let i = 0;
  const m = COPY_COUNTER_PATTERN.exec(name);
  if (m) {
    name = m[1];
    i = Number(m[2]) || 0;
  }
  if (name.length > maxLength) name = name.slice(0, maxLength);
  for (;; i++) {
    let s = name;
    if (i !== 0) {
      const suffix = ` (${i})`;
      if (s.length > maxLength - suffix.length) s = s.slice(0, maxLength - suffix.length);
      s += suffix;
    }
    if (!taken(s)) return s;
  }
}
