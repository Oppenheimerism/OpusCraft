# Multiplayer, stage 5 (M5, the network transport): report

Branch `claude/confident-bell-kdzc4i`, from stage 4's head 2b5606c, with `main`'s 57c4137 merged in on the way (stage 4
merged as it was, and the fixes of the two single-player problems stage 4's §8 found). M5 is done as agreed: **plan A**,
a friend on the same network joins the host's world from their own computer, through a small relay on the host's
computer (`npm run lan`); and **plan A′** made ready, the same relay behind an HTTPS tunnel, rehearsed on this machine
only. Nothing was put on the internet, cloudflared wasn't downloaded or run, no account was made, nothing was pushed to
`main`; the one download was the `ws` package from npm, as agreed. (One slip: a `curl` meant for the tunnel's local
stand-in went to this sandbox's outbound proxy instead, asking for `test-tunnel.trycloudflare.com`, a made-up name; the
proxy refused it, so nothing reached Cloudflare. It was run again with the proxy bypassed, on this machine.) WebRTC
(plan B) wasn't started; the `Transport` interface stays as it was but for an optional method and a reason on leaving
(§4), ready for another kind. Earlier reports: `REPORT.md` (stage 1), `REPORT-stage2.md`, `REPORT-stage3.md`,
`REPORT-stage4.md`; what they say still holds unless this one says otherwise.

## Progress

All times UTC, Sep 27.

- 17:24: the go-ahead for M5. `origin/main` had nothing new for this branch yet (stage 4 was being reviewed).
- 18:16: **the stage** (f485d7a): the relay, the WebSocket transports, the join code, `npm run lan`, the background
  clock. `origin/main` merged in (948768b): stage 4 as it was (378ef2e), the two single-player fixes and a drowned
  test's (57c4137); no conflicts, nothing multiplayer touches. The relay's suite (53b9865).
- 18:35: the multiplayer suites can run over WebSockets through the relay (1adaac5); all 18 pass that way.
- 19:08: the lag run (20 to 200 ms each way) made steady and repeatable (8cd9931), and **two bugs it found fixed,
  with the loading screen's self-rescue** (2d9ed05), and `m5-latency.mjs`; 19:15, that suite made to run its own
  networks (8662f69).
- 19:46: the browser check passing, 39 of 39, with two Chromium processes through this machine's network address
  (§6), after fixing mistakes of its script's own.
- 19:50: the tunnel rehearsal passing (§6): 18 checks through a local stand-in for cloudflared, and 5 without
  `--tunnel`.
- 19:52: a page come through a tunnel says rightly where a world can be opened to others (07f11fd).
- 20:02: the full regression at 07f11fd: 166 of 167; the one failure (illagers' "evoker conjures fangs") fails on
  `main` too (§6).
- 20:05: the multiplayer suites over the relay, 19 of 19; with 20 to 200 ms of lag, 8 of 19 whole and 58 of their
  1287 checks failing, each looked at (§6). Each of the stage's fixes taken out in turn: its checks fail without it.
- 20:10: without the relay (a plain static server), two tabs of one browser play as before (§6).
- 20:12: `npm run lan` shows what the relay sees, with the time (cf2e5a8).
- 20:18: found writing the user's checklist: stopping `npm run lan` cut every connection, and friends saw "Connection
  lost". Now they're told `The host's game server stopped.` (7c0f6de), with 3 more checks in `m5-relay.mjs`
  (176767c), and a real browser saw it so; the multiplayer suites again, in memory and through the relay.
- 20:26: this report.

## 1. Playing with friends (怎么和朋友一起玩)

### The host (the Mac)

It needs this branch's code and Node 20.19 or newer (Vite 8's minimum; Node 22 is fine). Once:

```sh
git fetch origin claude/confident-bell-kdzc4i && git checkout claude/confident-bell-kdzc4i
npm install
```

Each time you play:

```sh
npm run lan
```

It builds the game (seconds, or a minute on a slow computer), then serves it on the Mac's network, port 4173, and
says where:

```
  On this computer, open http://localhost:4173
  ...
  Friends on the same network (Wi-Fi) open:
    http://10.x.y.z:4173

  Anyone on the same network can open this page; only those with the join code get into your world.
  ...
  Friends joining show up below, with where they connect from.
  Keep this window open while you play. Ctrl+C stops the server.
```

(Vite also warns twice that `vite.config.ts` uses `__dirname`: that was there before and is harmless.)

1. On the Mac, open **http://localhost:4173** (localhost, not the 10.x address: only a page opened at localhost on the
   computer running the game can open its world to other computers).
2. Singleplayer → a world → in it, Esc → **Open to LAN** → the friends' game mode → **Start LAN World**.
3. The chat says `Local game hosted. Join code: ABCD-EFGH` and `Friends on your network can join at
   http://10.x.y.z:4173/?join=ABCDEFGH`. The pause menu (Esc) shows the code and the link under its buttons, and
   **Copy Join Link** copies the link. Send it to your friends (a message, an email).

Every time a world is opened to LAN it gets a new code, and the one before stops working. Another window of the Mac's
own browser can join as before, without a code (it's the host's own).

### A friend (Windows, or any computer on the same network)

Nothing to install but an up-to-date browser (Chrome or Edge; the checks here use Chromium).

1. Open the link. The Multiplayer screen opens with the code filled in and the host's world listed and chosen
   ("LAN World", the host's name and the world's, "At 10.x.y.z:4173").
2. Type a name (3 to 16 letters, digits or `_`) in the Name box → **Join Server**.

Without the link: open `http://10.x.y.z:4173` → Multiplayer → type the code in the Code box → the world → Join Server.
A friend is their name, as on a vanilla LAN world: joining again by the same name, they're back as they left, kept with
the host's world (stage 4).

### When it doesn't connect

1. **The page doesn't open at all** (the browser can't reach the site):
   - Are both computers on the same network, the same Wi-Fi? A VPN on either can get in the way:
     turn it off.
   - The Mac's firewall. The first time, macOS asks whether "node" may accept incoming network connections: choose
     **Allow**. If it was denied: System Settings → Network → Firewall → Options…, find `node` and allow incoming
     connections (or remove it from the list and start `npm run lan` again, to be asked again).
   - Is `npm run lan` still running, and is the link's address the one it printed? The address changes when the Mac
     joins another network. If it printed several, try each.
   - Some networks keep their computers from reaching each other (a guest network, a café's). The network you tested on let
     you; if another doesn't, use a **phone's hotspot**: both computers join it, `npm run lan` is started again (Ctrl+C,
     then again) for the new address, and the host saves and quits and opens the world to LAN again for a new link.
2. **The page opens but the world isn't listed**, or Join Server says `No world is open to LAN there right now.`: the
   host hasn't opened the world to LAN, or opened it in a page at the 10.x address instead of localhost (the Mac's chat
   says so).
3. `That join code isn't right. Ask the host for the one on their screen.`: use the code on the host's pause menu now.
   After three wrong ones from one computer it has to wait before trying again: 5 seconds, then 10, 20… up to five
   minutes (`Too many wrong join codes from here: try again in … seconds.`).
4. `Couldn't reach the host's computer.`: `npm run lan` isn't running (or the network changed under it).
   `The host's game server stopped.`: it was stopped (Ctrl+C, or its window closed).
5. `Timed out`, `Connection lost`: the connection was gone for 30 seconds (vanilla's time), or broke.
6. **The terminal**: every friend who presses Join Server shows up in `npm run lan`'s window
   (`relay: a guest connected from 10.…`, and `left` when they go). If a friend presses Join Server and nothing shows
   up, their page isn't reaching the Mac at all: point 1.
7. If `npm run lan` was stopped or restarted while the world was open, the Mac's chat says the LAN server stopped:
   friends are sent home; save and quit and open the world to LAN again.

The host's world keeps its pace while its window is minimised or behind another (§2), but not while the Mac sleeps:
keep it awake (plugged in, the lid open).

### Farther off, later: through a tunnel (plan A′)

Ready in the code and rehearsed here with a stand-in (§6), never against Cloudflare itself. When you want it:

1. Install cloudflared on the Mac: `brew install cloudflared` (with Homebrew), or the macOS download on Cloudflare's
   page for it (developers.cloudflare.com → Cloudflare One → Connections → Connect networks → Downloads). A "quick
   tunnel" (TryCloudflare) needs no Cloudflare account.
2. In one terminal: `npm run lan -- --tunnel` (the game on the Mac only; friends come in through the tunnel).
3. In another: `cloudflared tunnel --url http://localhost:4173`. It prints an address like
   `https://some-random-words.trycloudflare.com`.
4. On the Mac, open http://localhost:4173 and open the world to LAN. The chat says `Friends can join through your
   tunnel: its https address, then /?join=ABCDEFGH`; send friends
   `https://some-random-words.trycloudflare.com/?join=ABCDEFGH`.
5. They open it wherever they are and join as above. Their page is https, so the game reaches the relay over wss at the
   same address, and the connection is encrypted as far as Cloudflare, and from Cloudflare to the Mac.

The address changes every time cloudflared starts. Anyone who has it can open the game's page and see the world's name
and the host's on their Multiplayer screen; only the join code gets them in (§5). It's one or the other: with
`--tunnel` the network address isn't served, and without it the tunnel's address is turned away. Ctrl+C in both
terminals when you're done.

## 2. What a player can do now, and how it's built

### What's new in play

- **Friends on other computers join a world opened to LAN** (above): the join code on the host's screen, the link with
  it, the Multiplayer screen listing the world on the computer the page came from as well as the other windows' (as
  vanilla's LAN list does, through the relay instead of a broadcast). Everything stages 1 to 4 made works between
  computers as between windows: building, chests and menus, fighting and being hurt, dying and respawning, following the
  host to the Nether and the End, being kept with the world.
- **Leaving is clean and says why.** The host saving and quitting, or closing its page: `The host closed the world.`
  The relay stopping: `The host's game server stopped.` A guest whose network goes: the host lets it go after vanilla's
  30 seconds (keep-alives every 15, as before). A wrong code, a full world, a world closed in the meantime: each says so.
  Failing to join goes back to the Multiplayer screen with the code kept.
- **Minimised or behind another tab, a world keeps its pace**, the host's and a guest's alike, with nothing drawn
  meanwhile; a guest in the background keeps answering its host and isn't dropped.
- **An uneven network doesn't hurt or strand anyone** (the two bugs the lag run found, §6): moves that arrive bunched
  up are each taken, and a guest still on its loading screen after a while asks the host for the world again.

### The pieces

New:

| Module | What it does |
|---|---|
| `scripts/relay.mjs` | The relay, at `/__mp` on the game's own server, over the `ws` package: where the host's page and its guests' pages meet. It passes their bytes along and reads none of them (the game checks everything, the join code included). The host's page keeps one WebSocket to it for all its guests, framed `[op][guest id][payload]` (JOIN with where the guest connects from, DATA, LEAVE; KICK from the host); each guest's page keeps one of its own; each Multiplayer screen one more, told of the world as the host describes it (never with the code). It looks after itself: §5. `relayLimits(NET)` turns `src/net/config.ts`'s limits into its options, for `vite.config.ts` and the tests alike; the server keeps its relay under `RELAY_KEY`, for `npm run lan` to stop it first. |
| `scripts/lan.mjs` | `npm run lan`: builds the game, serves the build with Vite's preview server on every address the computer has, port 4173, prints where friends can open it and the reminder that anyone on the network can open the page; shows the relay's comings and goings (with the time) and the server's warnings, nothing else. Stopped (Ctrl+C, its window closed), it stops the relay first, so each page is told why. `--tunnel`: this computer only (127.0.0.1), and only then are `*.trycloudflare.com` names let in (Vite's `preview.allowedHosts`, which the relay follows too). |
| `src/net/transport/webSocket.ts` | The game's side: `WebSocketHostTransport` and `WebSocketGuestTransport` (the `Transport` of stage 1, like BroadcastChannel's), and `RelayWorldList` for the Multiplayer screen. The relay's address is the page's own: `ws://` on an http page, `wss://` on an https one, never a written-in host or port. Every message has a byte in front: as it is, or deflated (`CompressionStream('deflate-raw')`), which the host does to messages of 1 KB or more (chunks above all; a guest's are small and go as they are). Inflating stops a byte past the game's limit on a message (so a small bomb can't unpack to gigabytes), and what doesn't unpack goes on empty for the game to refuse with a reason, as it does any bad message. Messages keep their order whatever takes longer to squash. The relay's close codes become the player's words (above). For testing, `latency` (the page's `?mplag=20-200`) holds everything back 20 to 200 ms at random, in order. |
| `src/net/transport/combined.ts` | A world open two ways at once: to the host browser's other windows (BroadcastChannel, as before) and to other computers (the relay). Each guest is a peer of one of them. |
| `src/net/joinCode.ts` | The join code: 8 characters of Crockford's base 32 (no I, L, O or U; 40 bits), from `crypto.getRandomValues`, shown as `ABCD-EFGH`; typing is forgiving (case, spaces, dashes, I/L/O for 1/1/0). `JoinCodeGuard`: the host's check, compared in full every time, by where each guest connects from (§5). |
| `src/game/backgroundClock.ts`, `clockWorker.ts` | A worker whose timer beats every 50 ms, started while the game hosts or is a guest: §2 below. |

Changed:

| Module | What changed |
|---|---|
| `net/protocol.ts`, `net/config.ts` | `PROTOCOL_VERSION` 6 (stage 4's was 5). A guest's hello carries the join code. `SB.Resync` (below). The relay's limits, the join code's waits, `MOVES_KEPT_PER_TICK`, the resync's times. |
| `net/server/session.ts` | The hello: the join code checked first, before anything is said of who's in the world (§5). Moves: each move that came in since the last tick is taken in turn (up to a second's worth), no longer only the last (§6, the first bug). A resync (below). The round view a guest is sent chunks in, as before, is now `inView` (`net/chunkData.ts`), which its loading screen uses too. |
| `net/server/hostServer.ts` | Holds the join code and its guard; says the world (without the code) to the relay for other computers' Multiplayer screens, as it already did to the other windows (which get the code: they're the host player's own). A guest left "on its way" to the host's dimension after the host arrived is put in at the next tick, said in the console. |
| `net/client/clientSession.ts` | The loading screen's self-rescue (below), and a record of what came lately, for the console if it's ever needed. |
| `game/game.ts` | Opening to LAN: a new code each time, the relay transport beside BroadcastChannel's (or why not: a page not at localhost, no relay running), the chat lines above. Joining through the relay. The background clock while hosting or joined. The frame not drawn while the page is hidden in multiplayer. The guest's loading screen waits for the chunks the host sends it (§6, the second bug). |
| `gui/screens/multiplayer.ts`, `ingame.ts`, `main.ts` | The Multiplayer screen: a Name box and a Code box, the relay's world listed with the other windows', a code needed for the relay's (not for a window's). The pause menu while hosting: the code and the link, Copy Join Link where the page may use the clipboard. `?join=CODE` opens Multiplayer with it; `?mp=join&code=` joins at once (tests); `?mplag=` (tests). |
| `vite.config.ts` | The relay on the preview server (`configurePreviewServer`: `npm run preview`, this computer only; `npm run lan`) and the dev server (`configureServer`: this computer only), with `src/net/config.ts`'s limits. |
| `package.json` | `"lan": "node scripts/lan.mjs"`; **`ws` 8.21.3** as a devDependency, pinned (the one new dependency, as agreed; it has none of its own). |

### Keeping pace in the background

A hidden page gets no animation frames and its own timers slow to once a second (after five minutes, in Chrome, to
once a minute). While the game hosts or is a guest, a worker beats every 50 ms: its messages aren't timers and aren't
slowed, and each one, while the page is hidden (or its frames have stopped for a quarter of a second), runs a frame:
the ticks due, the chunks' loading, the sound's bookkeeping, nothing drawn. Shown again, the page draws as before. In
single-player nothing of this runs: a hidden single-player page does what it always did.

### The loading screen's self-rescue (SB.Resync)

A guest still on its loading screen 5 seconds after the host put it in place (or 15 after the host took it along to
another dimension without putting it anywhere yet) asks the host for the world again, then every 10 seconds while it
waits, saying which of the chunks it waits for haven't come. The host (one ask every 4 seconds at most) puts a guest
left on its way where it belongs, or puts it where its player is and sends every chunk in its view again. Both write
what they had to the browser's console: on the guest, how long, which chunks it has and lacks, the last packets that
came; on the host, what it sent of those chunks and when, whether each is loaded or being lit, and the guest's state.
Stage 4's §8 guest "left on the loading screen, not understood" would now come in by itself after 15 seconds, and the
console would say what happened. None of the browser checks needed it.

### Where it departs from the plan or from vanilla, and why

- **A join code**, which vanilla's LAN worlds don't have (anyone who sees one can join): here the network may be a
  school's. The host's game checks it, not the relay.
- **The host's page must be at localhost.** The relay lets only a page on the computer running it, asked for as
  localhost and not come through a proxy or a tunnel, host; the page opened by the network address is a guest's.
- **One world open to other computers per computer at a time** (vanilla gives each LAN world its own port). A second
  page trying is told another page on the computer has one open, and stays open to its browser's windows.
- **Compression**: vanilla compresses each packet over 256 bytes, both ways, with zlib. Here a whole tick's message
  from the host, when it's 1 KB or more, with the browser's deflate-raw; a guest's are small.
- **Where friends open the game**: the chat's and the pause menu's link uses the first network address the computer
  has (the terminal lists them all). A Mac with more than one (a VPN, a second network) may show the wrong one first.

## 3. Single-player changes

None meant to be seen, and none seen in the regression (§6):

- `Game.frame` doesn't draw while the page is hidden **in multiplayer** only; single-player draws as before (a hidden
  page's frames and timers are the browser's to slow, as before). The background clock's beat does nothing in
  single-player, and the clock runs only while hosting or joined.
- `ChunkManager.isReady` takes an optional test of which chunks count; single-player passes none, so the same 5 by 5
  around the player counts as before (`LOADING_RADIUS` is the 2 it was). The loading screen's wait is counted for a
  guest's console note only.
- The pause menu of a world not open to LAN is as it was; `?join=` is new on the page's address; a page come through
  a tunnel that opens its world to LAN says where that can be done properly (07f11fd).
- Checked for a page opened by the network address, which isn't a secure context (so no `crypto.randomUUID`, no
  `navigator.storage`, no clipboard, no `crypto.subtle`): the game already falls back where it uses them (the
  entities' uuids, the save's persistence request, a book's copy), and the join code uses `crypto.getRandomValues`,
  which every page has. The browser check plays a whole round from such a page without an error (§6).

## 4. R0

Nothing: M5 needed no refactor of what stages 1 to 4 built. The `Transport` interface gained an optional
`address(peer)` (where a guest connects from, for the join code's waits) and a reason on `onPeer`'s leaving (a relay's
word that the host's page went).

## 5. Security

### The relay (scripts/relay.mjs)

- **Who may connect at all**: only a page of the game's own site. The `Origin` must be the address the page asks for
  (so another site open in a friend's browser can't use it), and that address must be an IP address, localhost or an
  allowed name (Vite's rule against DNS rebinding: a far site's name made to point at the computer). Anything else is
  refused before the WebSocket opens (403).
- **Who may host**: a connection from the computer itself (loopback), asked for as localhost, with none of the headers
  a proxy or a tunnel adds (`X-Forwarded-For`, `Cf-Connecting-Ip`, `Forwarded`, `X-Real-Ip`, `Via` and the rest):
  a tunnel's connections come from loopback too, and those headers are how they're told apart. One host at a time.
- **How many**: 64 connections in all, 8 from one place (an address; through a tunnel, the address it says it passes
  on), 15 guests (the world's 7, and 8 logging in), 32 Multiplayer screens.
- **How big and how fast** (from `src/net/config.ts`): a guest's message at most the game's own 320 KB, a host's
  16 MB; a guest's rate 800 messages and 2 MB a second, in bursts up to what the game lets wait (1000 messages,
  2 MB); a guest whose connection can't take what the host sends it (32 MB waiting) is let go.
- **Time**: a host that hasn't described its world, or a guest that hasn't said anything, 10 seconds after connecting
  is let go; a connection not heard from at all (not even its answer to the pings every 10 seconds) for 30 seconds is
  gone.
- **Bad frames**: a text frame from a guest, a host's frame of the wrong kind, a frame too big, a broken WebSocket frame
  (the `ws` package parses the protocol: nothing is parsed by hand): that connection is closed, with a code its page
  turns into words. It never reads the game's bytes.
- `npm run dev` and `npm run preview` still listen on this computer only; `npm run lan` is the one command that opens
  anything to the network, and it serves only the built game and the relay (the dev server's screenshot endpoint is
  the dev server's alone).

### The join code, on the host

- A guest's hello must carry the code; the host's game checks it before anything is said of who's in the world (a
  wrong one hears only that it's wrong). It's compared in full every time.
- From one place, three wrong codes in a row and it waits 5 seconds before trying again, twice as long after each
  further wrong one, up to 5 minutes; while it waits, what it gives isn't looked at. From everywhere together, at
  most 20 wrong codes a minute, then everyone waits. With 40 bits, trying every code at 20 a minute would take about a
  hundred thousand years.
- Windows of the host's own browser join without typing it (they're told it: they're the host player's own).
- A new code every time the world is opened to LAN.

### What's left beyond the join code

- **Who a guest is** is still its name, as on a vanilla LAN world in offline mode: anyone with the code can join as
  any name that isn't playing at that moment, and so take over that player as it was kept with the world (its
  inventory, its place). The same name can't join twice at once. Something stronger is plan B's.
- **No encryption on the LAN**: `ws://` and `http://`. Someone on the same network who can see or redirect its traffic
  (an open Wi-Fi; on others, by tricking the computers' address lookups) could read the join code as a guest sends it,
  and the chat; alter what passes; or give a friend a different page than the game at `http://10.x.y.z:4173`. Through
  the tunnel it's https and wss end to end as far as Cloudflare, which sees everything that passes.
- **Anyone on the network (or with the tunnel's address) can open the page** and see the open world's name and the
  host player's name on the Multiplayer screen, as vanilla's LAN broadcast shows everyone; and connect to the relay,
  within its limits. Nothing more without the code.
- **Denial of service**: someone on the network can take the relay's connections (8 per address, 64 in all), fill the
  guests' places for 10 seconds at a time, or give 20 wrong codes a minute so that friends have to wait too (the
  price of the limit on guessing). Through a tunnel, many far addresses can do the same. They can't get in, only get
  in the way; closing the world and opening it again doesn't stop them, stopping `npm run lan` does.
- **The code can leak**: whoever has the link can join while the world is open. There's no kick or ban for the host
  yet; closing the world and opening it to LAN again gives a new code.
- **Vite's preview server faces the network** (or the internet, through the tunnel): it's a development tool, not built
  for that. Keep the project's packages up to date, and run `npm run lan` only while playing. Node's default HTTP
  timeouts apply to it (a slow request can hold a connection for a while).
- **A tunnel's word for where a friend comes from** (`Cf-Connecting-Ip`, else the last `X-Forwarded-For`) is taken for
  the limits and the code's waits, and only from a connection that comes from the computer itself (anyone else's
  headers are ignored): Cloudflare sets `Cf-Connecting-Ip` itself, and the last `X-Forwarded-For` is the nearest
  proxy's. Behind any other proxy, a friend could make up the first. Several friends behind one address share its 8
  connections.
- Stage 1 to 4's lists still hold (every packet checked on both sides; a guest never writes to its browser's saves).

## 6. Tests

### The new suites

| Suite | Checks | What it covers |
|---|---|---|
| `tests/multiplayer/m5-relay.mjs` | 81 | The relay on a server of its own, with real WebSockets from this machine's loopback and network addresses, saying what a browser says or what one wouldn't. Who: a page of another site, one with no Origin or "null", one asked for by a name that isn't this computer's (DNS rebinding) and a tunnel's name outside tunnel mode are refused; the site's own, by localhost or by the network address, let in. Who hosts: a page on another computer, one asked for by the network address, and one with any proxy's or tunnel's header can't; one at a time, another once it's gone; in tunnel mode, told friends come through the tunnel. Guests: none without a host; the host hears each join with where it connects from, its frames as they are, under a number of its own; one the host lets go hears what was sent it first; the host hears one leave; when the host goes, every guest is told. The Multiplayer screens: told at once, when the world changes, when it closes; one that says anything let go. Where from: the tunnel's word, the nearest proxy's, or "proxied". The limits: per place and in all, screens, a message's size (the game's own, through `vite.config.ts`), its rate in messages and bytes, a guest that can't keep up, the handshake and idle times, frames that aren't the relay's, a broken frame. Stopping: found on its server, every page told "shutdown", no one taken after. |
| `tests/multiplayer/m5-latency.mjs` | 46 | Moves two at a time (a guest's ticks and the host's out of step): ten seconds of hopping cost no hearts and each hop its hunger, as on the host; a fall of ten blocks hurts for seven, once; more than a second's worth at once. A render distance of 2: the host sends all but the corners of the 5 by 5, the guest comes in and asks nothing. Stuck on the loading screen: nothing asked before five seconds, then asked, with the console note; the host sends the chunks again and the rest of the view with them, and the guest comes in where the host has it. A guest left on its way: put in at the host's next tick. The host still loading after fifteen seconds: asked once each, "not yet", then they come in. Ten asks at once are one; one in the wrong shape lets the guest go, saying why. Then a host and two guests **through the relay with 20 to 200 ms each way**: in, walking (never put back), a block placed, a chest, a zombie's blow, a minute and a quarter with nobody timed out, the Nether and back, the host closing the world. |

Each fix was shown to be needed by running its checks without it (at 07f11fd, the change undone for the run only):

- **Only the last of a tick's moves taken** (stage 4's way): ten seconds of hopping leave the guest at 3.8 health of
  20 (16 points, eight hearts: the commit message's "sixteen hearts" should say sixteen points), with 1.05 of hunger's
  exhaustion for 17 hops where each hop's own should add up; and the ten-block fall does no harm at all, its landing
  missed. 3 checks fail.
- **The loading screen waiting for the whole 5 by 5** (stage 4's way): with the 21 chunks the host sends at render
  distance 2, the old check never says ready; the suite checks both.
- **The guest never asking again**: the guest whose chunks were lost never comes in, and the guests of a host still
  loading never hear from it. 7 checks fail. (A guest left on its way still comes in: the host puts it in by itself.)

No existing check was weakened, skipped or removed. What changed in the earlier suites, for the new protocol and to
run over the relay:

- A guest's hello carries the join code now: the harness's guests give the test host's (`makeGuest`, `rawGuest`),
  and `m2-actions.mjs`'s hand-made hello does too.
- `m1-leave.mjs`: the guest made to join by hand joins the new way (another window's world by its id, with a code),
  and its stand-in game has the background clock a joined page keeps; over the relay, a guest whose host goes away
  hears `The host closed the world.` (the relay says so) where in memory it hears `Connection lost`: it expects the
  one its network gives.
- `rawGuest`'s reason for being let go is the host's Disconnect as before, or else what its transport said: over the
  relay, a message too big is turned away by the relay first, with the same words.
- The security suites' stand-in hosts (a host that's only a transport) wait out the lag after their ticks as `step()`
  does (nothing changes without `MP_LAG`).

### The multiplayer suites over WebSockets, and with lag

`MP_NET=ws node scripts/regress.mjs tests/multiplayer/m*.mjs` runs every network a multiplayer suite makes through the
relay, each on a server of its own, carried by the game's own WebSocket transports, deflate and all
(`tests/multiplayer/net/`: a worker with the relays and the sockets, the tests' ticks kept in lockstep by waiting till
everything sent so far has arrived). `MP_LAG=20-200` holds each message back 20 to 200 ms of the tests' time as well,
in order (what's sent at once arrives together, as over a socket); `MP_LAG_SEED` makes a run repeatable, and each run
says its seed. To let the lag catch up, each of a test's steps runs 9 ticks more than it asks for with `MP_LAG`
(`lib.mjs`'s `SETTLE`); `m5-latency.mjs` makes its own networks, lag included, and counts ticks exactly.

| Run | At | Suites whole | Checks passing |
|---|---|---|---|
| in memory, as always | 176767c | 19 of 19 | 1290 of 1290 |
| `MP_NET=ws` (through the relay) | 176767c | 19 of 19 | 1290 of 1290 |
| `MP_NET=ws MP_LAG=20-200 MP_LAG_SEED=12345` | cf2e5a8 | 8 of 19 | 1229 of 1287 |

(The lag run was before `m5-relay.mjs`'s last 3 checks; that suite makes its own servers, lag or not.)

With the lag, the security suites, `m1-transport`, `m4-playerdata`, `m5-relay` and `m5-latency` pass whole. The 58
checks that fail were each looked at, and each is the test's own timing, not the game's: the suites were written for a
network that answers within the tick, and their steps are 10 ticks long with this lag. Four kinds:

- **Compared tick for tick** (21): the guest's copy of something checked against the host's at the same moment, when
  with the lag the guest is 1 to 4 ticks behind, which is what lag is. `m1-login`'s time; `m1-world`'s clock (7: the
  start, tick for tick, a slipped clock put right, `/time set` the next tick, `doDaylightCycle` off, the game time,
  on again) and weather (4: 10 ticks off); `m2-entities`' falling item and creeper's swell; `m3-menus`' furnace
  (1568/1565), eating's countdown (25/23), and the grindstone's (the guest still had a copy of an orb the host had
  already taken, its removal on the way); `m3-survival`'s effects (3: 192/189) and the morning after sleeping (the
  guest hears the new time with the next SetTime, sent every second as vanilla sends it; the check looks three steps
  after the wake).
- **Counted in steps** (5): each step is ten ticks, so a count per step is ten times as much: `m1-chunks`' "at most
  six a tick" (45 in a step), `m1-world`'s SetTime "every second" (30 in 60 steps) and "the host's time went on as
  ever", `m1-leave`'s keep-alives (2 where 1 was counted), `m4-dimensions`' portal cooldown.
- **Over by the time it's checked** (19): something short that came and went within the step's extra ticks: `m1-blocks`'
  crack stages (5), a swing (6 ticks: `m1-players` 4, `m2-actions` 1), a flinch and knockback, the easing of a copy's
  move (`m1-players`, `m2-entities`), and hurt hearts healed back before they're looked at (`m3-survival`'s zombie,
  the host's blow, fire; and the saturation a jump should have taken, which healing used up).
- **Set up a tick at a time** (13): `m1-leave`'s guest, left in the air for two steps to place a block below it, has
  landed on that spot in the 20 ticks those steps now are, and a block can't go where a player stands (seen by running
  it alone with its positions printed); `m3-menus`' thrown diamonds flew 2.24 blocks in the extra ticks, and holding
  "use" for 52 steps ate two breads, not one; `m3-survival`'s walks made of teleports each count as a fall in vanilla's
  reckoning and, ten ticks a step, add up to a deadly one first (its 6 death checks see "Alex fell from a high place";
  run again with those falls undone, they pass), with the fall, slow falling (it ran out during a 412-tick walk up)
  and pearl checks after them.

The lag run found two real bugs, fixed in 2d9ed05 with `m5-latency.mjs`: moves bunched up by the network lost a
hop's landing (and so hurt a hopping guest, or didn't hurt a falling one), and a guest at render distance 2 waited on
its loading screen for chunks the host never sends it. `m5-latency.mjs` checks both at the exact ticks, without the
steps' extra ticks.

### The full regression

`node scripts/regress.mjs` (every `tests/<dir>/*.mjs`, 3 at a time), 167 suites now: stage 4's 163, `main`'s two
new ones (`tests/commands/lookups.mjs`, `tests/misc/portal-fill.mjs`) and this stage's two. At 07f11fd:
**166 of 167 in 13.2 minutes.** The one failure is `illagers/illagers`, "evoker conjures fangs", on the earlier
stages' list of checks that fail now and then on `main` too (the evoker casts whatever its dice say in the 30 seconds
the check gives it). Run again alone, 3 times on the branch (07f11fd) and 3 times on `main` (57c4137): it failed once
in 3 on the branch and twice in 3 on `main`, the same check each time. Every other suite passed, the single-player
ones included. What came after 07f11fd changed only `scripts/` and `tests/`: the multiplayer suites were run again
at 176767c, all 19 passing, in memory and through the relay (above). `tsc --noEmit` is clean at 176767c, and
`vite build` succeeds.

### A real check, two browsers through the network address

The game served by `npm run lan`, built at 8662f69 (what came after changes nothing this check sees), and **two
Chromium processes**, as two computers: the host's page at `http://localhost:4173`,
the guest's at `http://192.0.2.2:4173`, this machine's network address (not loopback, so not a secure context, as a
friend's is). Driven over the bare DevTools protocol (a scratch script, not in the repository, as in the earlier
stages): Playwright keeps every page "visible", so a tab in the background wouldn't be one. 39 checks, passing in
full at the end (`smoke5-5`):

- **In**: the host opens a Survival world to LAN: a join code in the chat, the link with this machine's address,
  **Copy Join Link** on the pause menu. The guest opens the link: not a secure context (no `randomUUID`, storage
  manager, clipboard); the Multiplayer screen with the code filled in and the host's world listed through the relay and
  chosen; named Alex, Join Server: in, and the host's chat says so.
- **Playing**: two seconds of W, the host has Alex where it walked; a plank placed, in both worlds, one fewer in
  its hand on both; a chest the host filled opened by Alex, its diamonds shift-clicked into Alex's inventory on the
  host; hurt for five, and Alex's own game shows 15 health.
- **The host in the background** (another tab in front, `visibilityState` hidden) for 10 s: its world at 20.0 ticks a
  second, and the guest's clock with it (20.1).
- **The guest in the background** for 45 s, its browser throttling hidden pages hard after 10 s instead of 5 minutes
  (`--enable-features=IntensiveWakeUpThrottling:grace_period_seconds/10`): its page's own 50 ms timers ran once a
  second, its game at 19.9 ticks a second, still in, not timed out.
- **Lag**: a second guest, Steve, in another tab with `?mplag=20-200`: in, walks, the host has it where it went and
  never puts it back, Alex sees it there; it leaves.
- **The Nether**: the host lights an obsidian frame with flint and steel and walks in: Alex's swirl and loading
  screen, then Alex in the Nether beside the host, the blocks round them the host's block for block; the host back
  through: Alex home beside it; no loading screen needed the self-rescue.
- **Closing**: Save and Quit: `The host closed the world.` The host opens a world to LAN again: a new code; the old
  code turned away with its reason; the new one lets Alex in again (its name kept in its tab). The host's tab closed:
  `The host closed the world.` Alex's page never wrote to the browser's saves; no page errors or console errors in
  any page.
- **The server stopped** (at 7c0f6de, a separate run): `npm run lan` given Ctrl+C while Alex plays: Alex's page says
  `The host's game server stopped.`; the host plays on, its chat saying the LAN server stopped; the terminal showed the
  world open, Alex connecting from 192.0.2.2, Alex leaving and the world closed, each with its time.

Found on the way:

- **Chrome doesn't slow a page down while it plays sound**, and the game's sound starts by itself: in the first runs
  the guest's hidden page wasn't throttled at all, which proved nothing. With the page's sound off (the check stubs
  `AudioContext`) it was throttled, and the game kept its pace. In play, a guest's page is spared while the game makes
  any sound, and throttled once it's quiet; either way the worker keeps time. (On a blank page the same flags stop a
  50 ms timer altogether after the first ten seconds, none in the next forty, while a worker's messages keep coming
  19.9 a second; the game's page was slowed to once a second only, for reasons of Chrome's own, so the "once a
  minute" case is shown by the blank page and its worker, not by the game's page.)
- The script's own mistakes: a class name looked up in the minified build, `/give` and `/clear` aimed at a guest
  (the host's commands act on its own player: stage 3's §8), and a quick world reopened by an id it never had. The
  guest sent a hotbar slot of 9 or more when the script set one, and the host rightly dropped it: `Bad data: packet
  5: bad field 0`.

### The tunnel rehearsed on this machine

`npm run lan -- --tunnel` at 07f11fd, and a stand-in for cloudflared: a small HTTPS reverse proxy (a scratch script)
on this machine's port 443 with a self-signed certificate for `test-tunnel.trycloudflare.com`, passing every request
and WebSocket upgrade to `127.0.0.1:4173` as cloudflared does (from loopback, the Host kept, with `Cf-Connecting-Ip`,
`X-Forwarded-For`, `X-Forwarded-Proto`, `Cf-Visitor` and `Cf-Ray`). The friend's browser, another Chromium process,
had that name mapped to this machine's network address and took the certificate; nothing left the machine. 18 checks:

- The network address isn't served in tunnel mode; the tunnel's name is let in and gets the game; the relay refuses a
  page come through the tunnel that asks to host, and one of another site.
- The host at localhost: its world open, the relay saying friends come through a tunnel (no address to give), the chat
  saying to send the tunnel's https address with `/?join=CODE`.
- The friend at `https://test-tunnel.trycloudflare.com/?join=CODE`: a secure context; the host's world listed; the
  relay reached over `wss://` at the page's own address; in, the host has it at the address the tunnel passed on
  (not loopback), it walks and the host has it there.
- A page come through the tunnel opening its own world to LAN: open to its browser's windows only, saying why, while
  the host goes on hosting and the friend playing. The host closes the world: the friend is told.

Then `npm run lan` without `--tunnel`, the stand-in still in front: the tunnel's name gets Vite's "not allowed" page
(403) and the relay refuses it for a guest, a Multiplayer screen and a host (403 each); the network address serves
the game.

### Without the relay

The build served by a plain static server (`python3 -m http.server`, no `/__mp` there), two tabs of one headless
Chromium, 6 checks: the host opens a world to LAN, and the chat says only windows of this browser can join, the
game's LAN server not running; the other tab joins with `?mp=join` through BroadcastChannel, with no code to give; the
host has it, it walks and the host has it there; the host closes the world and it's told. No page errors.

## 7. The check for the user: the Mac hosting, Windows joining

Both on the same network (a campus Wi-Fi). The Mac set up as in §1 (`npm install` once, then `npm run lan`, "Allow" if macOS
asks about node); on Windows, only a browser. Each step says what should happen; if something else does, the Mac's
terminal (the relay's lines), both browsers' consoles (F12 on Windows, ⌥⌘J in Chrome on the Mac: the lines starting
`multiplayer:`) and a screenshot say where it went wrong.

1. **Hosting.** Mac: http://localhost:4173 → Singleplayer → Create New World (Survival) → in. Esc → Open to LAN →
   Game Mode Survival → Start LAN World. The chat: `Local game hosted. Join code: ABCD-EFGH` and `Friends on your
   network can join at http://10.….…:4173/?join=ABCDEFGH`. Esc: the code and the link under the buttons; Copy Join
   Link shows `Copied!` and the link pastes. The terminal: `relay: a world is open to LAN`.
2. **Joining.** Windows: open the link. Multiplayer, the code filled in, "LAN World" (the Mac's player and world,
   "At 10.….…:4173, 1/8 players") chosen. Name `Alex` → Join Server → Loading terrain → in, by the world spawn. The
   Mac's chat: `Alex joined the game`; the terminal: `relay: a guest connected from 10.…` (Windows' address).
3. **Playing together.** Walk to each other: each sees the other walk, smoothly, and its name. Windows breaks and
   places blocks; the Mac sees them, and the other way round. The Mac places a chest with something in it; Windows
   opens it and takes it. Chat (T) both ways. The Mac hits Alex: Alex's hearts drop and its screen tilts; Alex jumps
   off something four or five blocks high: it loses hearts once, as in single-player; Alex hops about for ten
   seconds: no hearts lost. Alex eats when hungry.
4. **The host in the background.** Mac: minimise the browser, or put another tab in front, for a minute. On Windows
   the world goes on as before: the sun moves, animals and mobs move, Alex's chat reaches the host. Back on the Mac:
   no jump or rush.
5. **The friend in the background.** Windows: put another tab in front for six minutes or more (Chrome slows a
   hidden page hard after five, unless the game is making a sound). Back: still in the world, not `Timed out`; the
   Mac never said Alex left.
6. **The Nether.** The Mac builds an obsidian frame (4 wide, 5 high), lights it with flint and steel, walks in: on
   Windows the swirl, then Alex in the Nether beside the host. Back through the portal: both home.
7. **Leaving and coming back.** Windows: Esc → Disconnect; the Mac: `Alex left the game`. Multiplayer → Join Server
   again (the code is still there): Alex where it was, with its things.
8. **A wrong code.** Windows: Disconnect, change one letter of the code, Join Server: `That join code isn't right. Ask
   the host for the one on their screen.`, back on the Multiplayer screen with the code kept. Three wrong ones quickly,
   then a fourth: `Too many wrong join codes from here: try again in … seconds.` After that, the right one: in.
9. **The host closing.** Mac: Esc → Save and Quit to Title. Windows: `The host closed the world.` The Mac opens the
   world again and opens it to LAN: a new code and link. The old link on Windows: `That join code isn't right…`; the
   new one: in. Then close the Mac's tab: Windows: `The host closed the world.`
10. **The friend's network going.** Windows: open the world again (step 9), then turn Wi-Fi off for a minute. Within
    about 30 seconds the Mac says Alex left; Windows shows `Timed out` or `Connection lost`. With Wi-Fi back,
    joining again works.
11. **The server stopping.** Ctrl+C in the Mac's terminal: Windows: `The host's game server stopped.`; the Mac's chat:
    `The LAN server stopped: only windows of this browser can join now.`
12. **Only `npm run lan` is on the network.** With `npm run preview` (or `npm run dev`) running on the Mac instead,
    Windows can't open `http://10.….…:4173` (or `:5173`).

## 8. Left for later, known issues, questions

**Known issues and limits in M5**

- **After `npm run lan` restarts, the host has to open the world to LAN again** (Save and Quit, open it, Open to LAN):
  the host's page doesn't reconnect to a relay that went away, and friends are sent home meanwhile.
- **The link shows the first network address** the computer has; with a VPN or two networks it may be the wrong one
  (the terminal lists them all).
- **The host can't kick or ban a guest** (its commands act on its own player: stage 3's list). Closing the world and
  opening it again changes the code.
- **The tunnel is rehearsed, not tried**: the stand-in does what cloudflared is documented to do (keeps the Host,
  adds its headers, passes WebSockets). If a cloudflared version rewrote the Host to `localhost:4173`, the relay would
  refuse its pages as another site's (their Origin wouldn't match): the first real try will tell.
- **Who a guest is**, the network in the clear, and the rest of §5's list.
- Vite warns twice at `npm run lan` that `vite.config.ts` uses `__dirname` (in the screenshot and build-id plugins
  that were there before): harmless, and left alone.
- Stage 4's "guest left on the loading screen, seen once" wasn't seen again; the self-rescue (§2) would now bring
  such a guest in by itself after 15 seconds, and both consoles would say what each had.
- Stage 1 to 4's lists still hold.

**Questions for the user**

- Plan B (WebRTC, and who a guest really is beyond its name): when, and what identity should mean (a password per
  player kept by the host? something tied to the browser?). The `Transport` interface is ready for another kind; the
  relay could carry WebRTC's signalling.
- Should the host get `/kick` (vanilla's needs cheats on)? It's small, and the one way to be rid of a guest short of
  closing the world.

## 9. Times

- Started 17:24 UTC on Sep 27, finished 20:26: three hours of wall clock.
- The relay, the transports, the join code, `npm run lan` and the background clock took until 18:16; the relay's
  suite with them; running the suites through the relay until 18:35.
- The lag run until 19:15: making it steady and repeatable, sorting its failures one by one, and the two bugs and the
  self-rescue it led to.
- The browser check and the tunnel rehearsal until 19:52, most of it the script's own mistakes and finding out why a
  hidden guest page wasn't throttled at first (its sound). The rest: the regressions, taking each fix out to show it's
  needed, and this report.
