// Who a guest is to the host's world (vanilla UUIDUtil.createOfflinePlayerUUID, as a LAN world's players are, nobody
// signing them in): a uuid made from the name alone, "OfflinePlayer:" and the name through MD5 as a version 3 uuid
// (java.util.UUID.nameUUIDFromBytes). The same name is the same player each time it joins, whichever window it's in,
// and the host keeps its player under that uuid.

/** vanilla UUIDUtil.createOfflinePlayerUUID */
export function offlinePlayerUuid(name: string): string {
  const b = md5(new TextEncoder().encode(`OfflinePlayer:${name}`));
  b[6] = (b[6] & 0x0f) | 0x30;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** each round's shifts (RFC 1321) */
const SHIFTS = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
/** RFC 1321's table: the integer part of 2^32 × |sin(i + 1)| */
const K = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0);

/** RFC 1321 MD5 of `bytes` (what vanilla's name uuids are made with; nothing here relies on it being secret) */
export function md5(bytes: Uint8Array): Uint8Array {
  const n = bytes.length;
  const blocks = ((n + 8) >>> 6) + 1;
  const m = new Uint32Array(blocks * 16);
  for (let i = 0; i < n; i++) m[i >> 2] |= bytes[i] << ((i & 3) * 8);
  m[n >> 2] |= 0x80 << ((n & 3) * 8);
  // (the length in bits, low word then high)
  m[blocks * 16 - 2] = (n * 8) >>> 0;
  m[blocks * 16 - 1] = Math.floor(n / 0x20000000);
  let a0 = 0x67452301, b0 = 0xefcdab89 | 0, c0 = 0x98badcfe | 0, d0 = 0x10325476;
  for (let off = 0; off < m.length; off += 16) {
    let a = a0, b = b0, c = c0, d = d0;
    for (let i = 0; i < 64; i++) {
      let f: number, g: number;
      if (i < 16) {
        f = (b & c) | (~b & d);
        g = i;
      } else if (i < 32) {
        f = (d & b) | (~d & c);
        g = (5 * i + 1) & 15;
      } else if (i < 48) {
        f = b ^ c ^ d;
        g = (3 * i + 5) & 15;
      } else {
        f = c ^ (b | ~d);
        g = (7 * i) & 15;
      }
      const x = (a + f + K[i] + m[off + g]) | 0, s = SHIFTS[(i >> 4) * 4 + (i & 3)];
      a = d;
      d = c;
      c = b;
      b = (b + ((x << s) | (x >>> (32 - s)))) | 0;
    }
    a0 = (a0 + a) | 0;
    b0 = (b0 + b) | 0;
    c0 = (c0 + c) | 0;
    d0 = (d0 + d) | 0;
  }
  const out = new Uint8Array(16);
  [a0, b0, c0, d0].forEach((v, i) => {
    for (let j = 0; j < 4; j++) out[i * 4 + j] = (v >>> (j * 8)) & 0xff;
  });
  return out;
}
