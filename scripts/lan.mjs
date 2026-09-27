// npm run lan: the game on this computer's network, for friends to join a world opened to LAN. It's the one command
// that opens the game beyond this computer (npm run dev and npm run preview stay on it), and it serves only the built
// game: it builds it, then serves the build with Vite's preview server on every address this computer has (port 4173),
// with the multiplayer relay at /__mp (vite.config.ts, scripts/relay.mjs), and says where friends can open it.
//
// npm run lan -- --tunnel: this computer only, for a tunnel (cloudflared, say) to pass friends in from farther off; only
// then are the tunnel's names (*.trycloudflare.com) let in. See tests/multiplayer/REPORT-m5.md, "Playing with friends".

import { build, preview } from 'vite';
import { networkInterfaces } from 'node:os';

const PORT = 4173;
const tunnel = process.argv.includes('--tunnel');
// (read by vite.config.ts's relay: friends come in through the tunnel, not from the network)
if (tunnel) process.env.MC_LAN_TUNNEL = '1';

console.log('Building the game...');
try {
  await build({ logLevel: 'warn' });
} catch (e) {
  console.error(`\nThe build failed: ${e?.message ?? e}`);
  process.exit(1);
}

let server;
try {
  server = await preview({
    logLevel: 'warn',
    preview: { host: tunnel ? '127.0.0.1' : '0.0.0.0', port: PORT, strictPort: true, open: false, allowedHosts: tunnel ? ['.trycloudflare.com'] : [] },
  });
} catch (e) {
  console.error(`\nCouldn't start the server on port ${PORT}: ${e?.message ?? e}`);
  console.error('Is the game running already (npm run lan or npm run preview in another window)? Stop that one first.');
  process.exit(1);
}

/** this computer's addresses on its networks (IPv4: what a friend types) */
function addresses() {
  const out = [];
  for (const list of Object.values(networkInterfaces()))
    for (const i of list ?? []) if (!i.internal && (i.family === 'IPv4' || i.family === 4) && !i.address.startsWith('169.254.')) out.push(i.address);
  return out;
}

const local = `http://localhost:${PORT}`;
const lines = ['', `  On this computer, open ${local}`, '  (In your world: Esc, Open to LAN, Start LAN World. You get a join code, and the pause menu shows it with a link to send.)', ''];
if (tunnel) {
  lines.push(
    '  Ready for a tunnel. In another terminal, start one to this computer, for instance:',
    `    cloudflared tunnel --url ${local}`,
    '  and send friends the https://....trycloudflare.com address it prints, with /?join=<your join code> after it.',
    '',
    '  Anyone who has that address can open this page; only those with the join code get into your world.',
  );
} else {
  const ips = addresses();
  if (ips.length) {
    lines.push('  Friends on the same network (Wi-Fi) open:');
    for (const ip of ips) lines.push(`    http://${ip}:${PORT}`);
  } else lines.push("  This computer isn't on a network right now: only it can open the game.");
  lines.push(
    '',
    '  Anyone on the same network can open this page; only those with the join code get into your world.',
    '  If a friend can\'t open it: are you both on the same network? (macOS asks whether "node" may accept incoming',
    '  connections: choose Allow.) A phone\'s hotspot that both computers join is a network too.',
  );
}
lines.push('', '  Keep this window open while you play. Ctrl+C stops the server.', '');
console.log(lines.join('\n'));

process.on('SIGINT', () => {
  void server.close().finally(() => process.exit(0));
});
