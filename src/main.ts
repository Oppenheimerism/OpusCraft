// Entry point (temporary free-camera harness; the full game shell comes later).

import './world/blocks';
import { generateBlockTextures } from './textures/index';
import { Atlas } from './render/atlas';
import { Renderer, Camera } from './render/renderer';
import { World } from './world/world';
import { WorkerPool } from './worker/pool';
import { ChunkManager } from './world/chunkManager';

const params = new URLSearchParams(location.search);

async function main(): Promise<void> {
  const canvas = document.getElementById('gl') as HTMLCanvasElement;
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, powerPreference: 'high-performance' })!;
  if (!gl) throw new Error('WebGL2 not supported');
  const t0 = performance.now();
  const { textures, missing } = generateBlockTextures();
  if (missing.length) console.warn('missing textures', missing);
  const atlas = new Atlas(textures);
  atlas.upload(gl);
  console.log(`textures: ${textures.size} in ${(performance.now() - t0).toFixed(0)}ms, atlas ${atlas.size}`);
  const renderer = new Renderer(gl, atlas);
  const seed = params.get('seed') ?? 'test';
  const workers = Math.max(2, Math.min(6, (navigator.hardwareConcurrency || 4) - 2));
  const pool = new WorkerPool(workers, seed, atlas.sprites);
  await pool.ready;
  const world = new World();
  const cm = new ChunkManager(world, pool, renderer.world);
  const rd = +(params.get('rd') ?? 12);
  cm.renderDistance = rd;
  renderer.renderDistance = rd;

  const cam: Camera = {
    x: +(params.get('x') ?? 0.5),
    y: +(params.get('y') ?? 110),
    z: +(params.get('z') ?? 0.5),
    yaw: +(params.get('yaw') ?? 0),
    pitch: +(params.get('pitch') ?? 20),
    fov: 70,
  };
  let dayTime = +(params.get('t') ?? 1000);
  let ticks = 0;
  const freezeTime = params.has('t');

  const resize = () => {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
    renderer.resize(canvas.width, canvas.height);
  };
  window.addEventListener('resize', resize);
  resize();

  // free camera controls
  const keys = new Set<string>();
  window.addEventListener('keydown', (e) => keys.add(e.code));
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  canvas.addEventListener('click', () => canvas.requestPointerLock());
  document.addEventListener('mousemove', (e) => {
    if (document.pointerLockElement !== canvas) return;
    cam.yaw += e.movementX * 0.15;
    cam.pitch = Math.max(-90, Math.min(90, cam.pitch + e.movementY * 0.15));
  });

  (window as unknown as Record<string, unknown>).__mc = { cam, world, cm, renderer, pool, atlas, setTime: (t: number) => (dayTime = t) };

  let last = performance.now();
  let acc = 0;
  let frames = 0, fpsTime = last, fps = 0;
  const info = document.createElement('div');
  info.style.cssText = 'position:absolute;left:4px;top:4px;color:#fff;font:12px monospace;z-index:5;text-shadow:1px 1px #000;white-space:pre';
  document.body.appendChild(info);

  const frame = (now: number) => {
    const dt = Math.min(0.25, (now - last) / 1000);
    last = now;
    acc += dt;
    while (acc >= 0.05) {
      acc -= 0.05;
      ticks++;
      if (!freezeTime) dayTime += 1;
      atlas.tick();
      renderer.lightmap.tick();
    }
    const speed = (keys.has('ControlLeft') ? 60 : 12) * dt;
    const yr = (cam.yaw * Math.PI) / 180;
    const fx = -Math.sin(yr), fz = Math.cos(yr);
    if (keys.has('KeyW')) { cam.x += fx * speed; cam.z += fz * speed; }
    if (keys.has('KeyS')) { cam.x -= fx * speed; cam.z -= fz * speed; }
    if (keys.has('KeyA')) { cam.x += fz * speed; cam.z -= fx * speed; }
    if (keys.has('KeyD')) { cam.x -= fz * speed; cam.z += fx * speed; }
    if (keys.has('Space')) cam.y += speed;
    if (keys.has('ShiftLeft')) cam.y -= speed;
    cm.setCenter(cam.x, cam.z);
    cm.update();
    const biome = world.getBiome(Math.floor(cam.x), Math.floor(cam.z));
    renderer.render(cam, { dayTime, ticks, partial: acc / 0.05, weather: { rain: 0, thunder: 0, flash: 0 }, biome, gamma: 0.5, nightVision: 0 });
    frames++;
    if (now - fpsTime > 1000) {
      fps = frames;
      frames = 0;
      fpsTime = now;
    }
    info.textContent = `${fps} fps  chunks ${world.chunks.size}  sections ${renderer.world.stats.drawn}/${renderer.world.stats.sections}  quads ${renderer.world.stats.quads}\n` +
      `pos ${cam.x.toFixed(1)} ${cam.y.toFixed(1)} ${cam.z.toFixed(1)}  gen pending ${cm.pendingGen()}  busy ${pool.busy()}  meshMB ${(renderer.world.totalBytes() / 1e6).toFixed(1)}`;
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

main().catch((e) => {
  console.error(e);
  document.body.innerHTML = `<pre style="color:#f55;padding:16px">${String(e?.stack ?? e)}</pre>`;
});
