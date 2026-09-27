// (multiplayer) the background clock's worker: a message every `ms` once told a number, none once told 0. A worker's
// timers keep time while its page is hidden, when the page's own slow to once a second, or once a minute.

let timer: ReturnType<typeof setInterval> | null = null;

self.onmessage = (e: MessageEvent<number>) => {
  if (timer !== null) clearInterval(timer);
  timer = null;
  const ms = e.data;
  if (typeof ms === 'number' && ms > 0) timer = setInterval(() => postMessage(0), ms);
};
