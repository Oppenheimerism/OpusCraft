// Sound playback (Web Audio) with vanilla-like attenuation, categories and music.

import type { GameOptions } from '../game/options';
import type { Player } from '../entity/player';
import type { Game } from '../game/game';
import { MinecartSounds } from './minecartSounds';
import { BiomeAmbience } from './biomeAmbience';

const SR = 44100;

/** a looping sound its owner updates every tick (vanilla AbstractTickableSoundInstance) */
export class LoopSound {
  x = 0;
  y = 0;
  z = 0;
  volume = 0;
  pitch = 1;
  /** vanilla Attenuation.NONE + relative: heard at full volume wherever the listener is */
  relative = false;
  stopped = false;
  src: AudioBufferSourceNode | null = null;
  gain: GainNode | null = null;
  pan: StereoPannerNode | null = null;
  constructor(readonly name: string) {}
  stop(): void {
    this.stopped = true;
  }
}

type Category = 'master' | 'music' | 'blocks' | 'weather' | 'hostile' | 'friendly' | 'players' | 'ambient';

function categoryOf(name: string): Category {
  // vanilla plays these with SimpleSoundInstance.forLocalAmbience (SoundSource.AMBIENT)
  if (name === 'block.portal.trigger' || name === 'block.portal.travel') return 'ambient';
  // vanilla global level event 1038 plays the end portal's opening as SoundSource.HOSTILE
  if (name === 'block.end_portal.spawn') return 'hostile';
  // vanilla CrossbowItem: the loading sounds are SoundSource.PLAYERS (the rest the shooter's source)
  if (name.startsWith('item.crossbow.')) return 'players';
  if (name.startsWith('block.') || name.startsWith('item.')) return 'blocks';
  if (name.startsWith('weather.') || name.startsWith('entity.lightning')) return 'weather';
  if (name.startsWith('ambient.')) return 'ambient';
  if (/entity\.(zombie|skeleton|creeper|spider|enderman|slime|witch|drowned|husk|stray|phantom)/.test(name)) return 'hostile';
  if (name.startsWith('entity.player') || name.startsWith('entity.generic') || name.startsWith('entity.item') || name.startsWith('entity.experience') || name.startsWith('entity.arrow')) return 'players';
  if (name.startsWith('entity.')) return 'friendly';
  if (name.startsWith('ui.')) return 'master';
  return 'master';
}

// alias events not synthesized to ones that are
const ALIASES: [RegExp, string][] = [
  [/^block\.(cherry_wood|bamboo_wood)\./, 'block.wood.'],
  [/^block\.(cherry_wood|bamboo_wood|nether_wood)_(button|pressure_plate)\./, 'block.wooden_$2.'],
  [/^block\.(moss_carpet)\./, 'block.moss.'],
  [/^block\.(cherry_leaves|azalea_leaves|azalea|flowering_azalea|cherry_sapling|sweet_berry_bush|vine|cave_vines|spore_blossom|hanging_roots|lily_pad|moss|grass)\./, 'block.grass.'],
  [/^block\.(polished_deepslate|deepslate_bricks|deepslate_tiles)\./, 'block.deepslate.'],
  [/^block\.(calcite|tuff|dripstone_block|pointed_dripstone|stone|copper|spawner|sponge)\./, 'block.stone.'],
  [/^block\.(rooted_dirt)\./, 'block.gravel.'],
  [/^block\.(powder_snow)\./, 'block.snow.'],
  [/^block\.(cobweb)\./, 'block.stone.'],
  [/^block\.(hard_crop)\./, 'block.wood.'],
  // the nether wart crop (vanilla SoundType.NETHER_WART): stone steps, its planting sound on place
  [/^block\.nether_wart\.(?=step|hit)/, 'block.stone.'],
  [/^block\.nether_wart\.place$/, 'item.nether_wart.plant'],
  // vanilla sounds.json: a lightning strike's crack is the explosion samples (random/explode1-4), played low
  [/^entity\.lightning_bolt\.impact$/, 'entity.generic.explode'],
  // vanilla sounds.json: some villagers at work make their workstation's own sound
  [/^entity\.villager\.work_weaponsmith$/, 'block.grindstone.use'],
  [/^entity\.villager\.work_armorer$/, 'block.blast_furnace.fire_crackle'],
  [/^entity\.villager\.work_butcher$/, 'block.smoker.smoke'],
  [/^entity\.villager\.work_farmer$/, 'block.composter.fill'],
  [/^entity\.villager\.work_fisherman$/, 'block.barrel.open'],
  [/^entity\.villager\.work_leatherworker$/, 'item.armor.equip_leather'],
  [/^entity\.villager\.work_librarian$/, 'item.book.page_turn'],
];

/** how late (ms) a sound that had to be generated first may still start */
const WAIT_MS = 250;

export class SoundManager {
  ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private readonly buffers = new Map<string, AudioBuffer | null>();
  /** plays asked for while no take of the sound was loaded yet */
  private readonly waiting = new Map<string, { cat: Category; volume: number; pitch: number; x: number; y: number; z: number; ui: boolean; t: number }[]>();
  private readonly pending = new Map<number, (d: Float32Array | null) => void>();
  private worker: Worker | null = null;
  private nextId = 1;
  private variants: Record<string, number> = {};
  private musicCount = 0;
  /** situational music pools (vanilla music.nether.<biome>): event -> track count */
  private musicPools: Record<string, number> = {};
  private listener = { x: 0, y: 0, z: 0, yaw: 0 };
  private musicSource: AudioBufferSourceNode | null = null;
  private musicGain: GainNode | null = null;
  private musicPlaying = false;
  private nextSongDelay = 100;
  private menuMusicStarted = false;
  private opts: GameOptions | null = null;
  private moodiness = 0;
  private active: { src: AudioBufferSourceNode; gain: GainNode; pan: StereoPannerNode; x: number; y: number; z: number; vol: number; range: number; cat: Category; ui: boolean }[] = [];
  private musicLoading = false;
  private readonly loops: LoopSound[] = [];
  private readonly minecarts = new MinecartSounds(this);
  readonly biomeAmbience = new BiomeAmbience(this);

  constructor() {
    const unlock = () => this.ensure();
    window.addEventListener('pointerdown', unlock, { once: false });
    window.addEventListener('keydown', unlock, { once: false });
  }

  private ensure(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    try {
      this.ctx = new AudioContext({ sampleRate: SR });
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this.worker = new Worker(new URL('./audioWorker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (e) => {
        const d = e.data;
        if (d.type === 'ready') {
          this.variants = d.sounds;
          this.musicCount = d.music;
          this.musicPools = d.pools ?? {};
          for (const n of ['ui.button.click', 'block.grass.step', 'block.stone.step', 'block.wood.step', 'block.gravel.step', 'block.sand.step', 'block.grass.break', 'block.stone.break', 'block.wood.break', 'block.gravel.break', 'block.grass.hit', 'block.stone.hit', 'block.wood.hit', 'block.gravel.hit', 'entity.item.pickup', 'block.grass.place', 'block.stone.place', 'block.wood.place']) {
            const v = this.variants[n] ?? 0;
            for (let i = 0; i < v; i++) this.load(n, i);
          }
          return;
        }
        if (d.type === 'data') {
          const cb = this.pending.get(d.id);
          this.pending.delete(d.id);
          cb?.(d.data);
        }
      };
    } catch (e) {
      console.warn('audio unavailable', e);
    }
  }

  private request(msg: Record<string, unknown>): Promise<Float32Array | null> {
    return new Promise((resolve) => {
      if (!this.worker) return resolve(null);
      const id = this.nextId++;
      this.pending.set(id, resolve);
      this.worker.postMessage({ ...msg, id, sr: SR });
    });
  }

  private load(name: string, variant: number): void {
    const key = name + '#' + variant;
    if (this.buffers.has(key) || !this.ctx) return;
    this.buffers.set(key, null);
    void this.request({ type: 'sound', name, variant }).then((d) => {
      if (!d || !this.ctx) return;
      const b = this.ctx.createBuffer(1, d.length, SR);
      b.copyToChannel(d as Float32Array<ArrayBuffer>, 0);
      this.buffers.set(key, b);
      // a sound asked for before any take of it was ready plays now, if it is still fresh (the first thunderclap)
      const w = this.waiting.get(name);
      if (!w) return;
      this.waiting.delete(name);
      const now = performance.now();
      for (const p of w) if (now - p.t < WAIT_MS) this.startBuffer(b, p.cat, p.volume, p.pitch, p.x, p.y, p.z, p.ui);
    });
  }

  private resolveName(name: string): string {
    if (this.variants[name]) return name;
    for (const [re, rep] of ALIASES) {
      if (re.test(name)) {
        const n = name.replace(re, rep);
        if (this.variants[n]) return n;
      }
    }
    return name;
  }

  private catVolume(cat: Category): number {
    const o = this.opts;
    if (!o) return 1;
    const v = { master: 1, music: o.musicVolume, blocks: o.blocksVolume, weather: o.weatherVolume, hostile: o.hostileVolume, friendly: o.friendlyVolume, players: o.playersVolume, ambient: o.ambientVolume }[cat];
    return v * o.masterVolume;
  }

  play(name: string, x: number, y: number, z: number, volume = 1, pitch = 1): void {
    this.start(name, volume, pitch, x, y, z, false);
  }

  playUI(name: string, volume = 1, pitch = 1): void {
    this.start(name, volume, pitch, 0, 0, 0, true);
  }

  private start(name: string, volume: number, pitch: number, x: number, y: number, z: number, ui: boolean): void {
    this.ensure();
    if (!this.ctx || !this.master) return;
    // (the category is the event's own: an aliased take plays under the source that asked for it)
    const cat = categoryOf(name);
    name = this.resolveName(name);
    const n = this.variants[name];
    if (!n) return;
    const v = Math.floor(Math.random() * n);
    const key = name + '#' + v;
    const buf = this.buffers.get(key);
    if (!buf) {
      this.load(name, v);
      // try another loaded variant
      for (let i = 0; i < n; i++) {
        const b2 = this.buffers.get(name + '#' + i);
        if (b2) return this.startBuffer(b2, cat, volume, pitch, x, y, z, ui);
      }
      let w = this.waiting.get(name);
      if (!w) this.waiting.set(name, (w = []));
      if (w.length < 4) w.push({ cat, volume, pitch, x, y, z, ui, t: performance.now() });
      return;
    }
    this.startBuffer(buf, cat, volume, pitch, x, y, z, ui);
  }

  private startBuffer(buf: AudioBuffer, cat: Category, volume: number, pitch: number, x: number, y: number, z: number, ui: boolean): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = Math.max(0.5, Math.min(2, pitch));
    const gain = ctx.createGain();
    const pan = ctx.createStereoPanner();
    src.connect(gain).connect(pan).connect(this.master!);
    const e = { src, gain, pan, x, y, z, vol: Math.min(1, volume), range: 16 * Math.max(1, volume), cat, ui };
    this.applySpatial(e);
    src.start();
    this.active.push(e);
    src.onended = () => {
      const i = this.active.indexOf(e);
      if (i >= 0) this.active.splice(i, 1);
    };
  }

  private applySpatial(e: SoundManager['active'][number]): void {
    let g = e.vol * this.catVolume(e.cat);
    let p = 0;
    if (!e.ui) {
      const l = this.listener;
      const dx = e.x - l.x, dy = e.y - l.y, dz = e.z - l.z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      g *= Math.max(0, 1 - d / e.range);
      // pan by angle relative to facing (yaw 0 = +Z)
      const yr = (l.yaw * Math.PI) / 180;
      const rx = -Math.cos(yr), rz = -Math.sin(yr);
      if (d > 0.01) p = Math.max(-1, Math.min(1, ((dx * rx + dz * rz) / d) * 0.8));
    }
    e.gain.gain.value = g;
    e.pan.pan.value = p;
  }

  update(p: Player | null, opts: GameOptions): void {
    this.opts = opts;
    if (p) {
      this.listener.x = p.x;
      this.listener.y = p.y + p.eyeHeight;
      this.listener.z = p.z;
      this.listener.yaw = p.yaw;
    }
    for (const e of this.active) this.applySpatial(e);
    this.updateLoops();
    if (this.musicGain) this.musicGain.gain.value = this.catVolume('music') * 0.9;
  }

  /** start a looping sound, silent until its owner turns the volume up */
  loop(name: string): LoopSound {
    const s = new LoopSound(name);
    this.loops.push(s);
    return s;
  }

  /** per frame: loop volumes and positions (a silent loop holds no audio node) */
  private updateLoops(): void {
    for (let i = this.loops.length - 1; i >= 0; i--) {
      const s = this.loops[i];
      let g = 0, p = 0;
      if (!s.stopped) {
        g = Math.min(1, s.volume) * this.catVolume(categoryOf(s.name));
        if (!s.relative) {
          const l = this.listener;
          const dx = s.x - l.x, dy = s.y - l.y, dz = s.z - l.z;
          const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
          g *= Math.max(0, 1 - d / (16 * Math.max(1, s.volume)));
          const yr = (l.yaw * Math.PI) / 180;
          if (d > 0.01) p = Math.max(-1, Math.min(1, ((-dx * Math.cos(yr) - dz * Math.sin(yr)) / d) * 0.8));
        }
      }
      if (g <= 0) {
        if (s.src) {
          try {
            s.src.stop();
          } catch {
            /* already stopped */
          }
          s.src.disconnect();
          s.src = null;
        }
        if (s.stopped) this.loops.splice(i, 1);
        continue;
      }
      if (!s.src && !this.startLoop(s)) continue;
      s.gain!.gain.value = g;
      s.pan!.pan.value = p;
      s.src!.playbackRate.value = Math.max(0.5, Math.min(2, s.pitch));
    }
  }

  private startLoop(s: LoopSound): boolean {
    if (!this.ctx || !this.master) return false;
    const name = this.resolveName(s.name);
    if (!this.variants[name]) return false;
    const buf = this.buffers.get(name + '#0');
    if (!buf) {
      this.load(name, 0);
      return false;
    }
    const ctx = this.ctx;
    if (!s.gain || !s.pan) {
      s.gain = ctx.createGain();
      s.pan = ctx.createStereoPanner();
      s.gain.connect(s.pan).connect(this.master);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.connect(s.gain);
    // somewhere into the loop, so carts that start together don't play in phase
    src.start(0, Math.random() * buf.duration);
    s.src = src;
    return true;
  }

  /** per game tick: music scheduling and ambience */
  tick(game: Game): void {
    if (!this.ctx) return;
    const p = game.player;
    this.minecarts.tick(game.level, p);
    // biome loops, additions and (where the biome has its own) mood (vanilla BiomeAmbientSoundsHandler)
    const biomeMood = this.biomeAmbience.tick(game);
    // game music (vanilla MusicManager: 12000..24000 tick gaps); a biome with its own music (the
    // Nether's music.nether.<biome>) picks from that pool when the next track is due
    if (!this.musicPlaying && !this.musicLoading && this.musicCount > 0) {
      if (--this.nextSongDelay <= 0) {
        this.nextSongDelay = 12000 + Math.floor(Math.random() * 12000);
        const pool = this.biomeAmbience.music(game);
        const n = pool ? (this.musicPools[pool] ?? 0) : 0;
        if (pool && n > 0) void this.playMusic(Math.floor(Math.random() * n), false, pool);
        else void this.playMusic(Math.floor(Math.random() * this.musicCount));
      }
    }
    // cave ambience (vanilla AmbientSoundHandler mood; biomes with their own mood use that instead)
    const w = game.world;
    const bx = Math.floor(p.x), by = Math.floor(p.y + p.eyeHeight), bz = Math.floor(p.z);
    const ox = bx + Math.floor(Math.random() * 17) - 8, oy = by + Math.floor(Math.random() * 17) - 8, oz = bz + Math.floor(Math.random() * 17) - 8;
    const st = w.getState(ox, oy, oz);
    const l = w.getLight(ox, oy, oz);
    if (st === 0 && !biomeMood) {
      const sky = l >> 4, blk = l & 15;
      if (sky === 0 && blk < 1) this.moodiness += 1 / 6000;
      else this.moodiness -= (Math.max(sky, blk) - 1) / 6000;
      this.moodiness = Math.max(0, Math.min(1, this.moodiness));
      if (this.moodiness >= 1) {
        this.play('ambient.cave', ox + 0.5, oy + 0.5, oz + 0.5, 0.7, 0.8 + Math.random() * 0.2);
        this.moodiness = 0;
      }
    }
  }

  private async playMusic(index: number, menu = false, pool?: string): Promise<void> {
    if (!this.ctx || !this.master) return;
    this.musicLoading = true;
    const d = await this.request(menu ? { type: 'menu' } : pool ? { type: 'pool', pool, index } : { type: 'music', index });
    this.musicLoading = false;
    if (!d || !this.ctx) return;
    const b = this.ctx.createBuffer(1, d.length, SR);
    b.copyToChannel(d as Float32Array<ArrayBuffer>, 0);
    this.stopMusic();
    const src = this.ctx.createBufferSource();
    src.buffer = b;
    const g = this.ctx.createGain();
    g.gain.value = this.catVolume('music') * 0.9;
    src.connect(g).connect(this.master);
    src.start();
    this.musicSource = src;
    this.musicGain = g;
    this.musicPlaying = true;
    src.onended = () => {
      if (this.musicSource === src) {
        this.musicPlaying = false;
        this.musicSource = null;
        if (menu) this.menuMusicStarted = false;
      }
    };
  }

  menuMusic(opts: GameOptions): void {
    this.opts = opts;
    if (!this.ctx || this.menuMusicStarted || this.musicLoading) return;
    if (!this.variants || !Object.keys(this.variants).length) return;
    this.menuMusicStarted = true;
    void this.playMusic(0, true);
  }

  stopMusic(): void {
    if (this.musicSource) {
      try {
        this.musicSource.stop();
      } catch {
        /* already stopped */
      }
    }
    this.musicSource = null;
    this.musicPlaying = false;
    this.menuMusicStarted = false;
    this.nextSongDelay = 100;
  }

  stopAll(): void {
    for (const e of this.active) {
      try {
        e.src.stop();
      } catch {
        /* ignore */
      }
    }
    this.active.length = 0;
    for (const s of this.loops) s.stop();
    this.updateLoops();
    this.stopMusic();
  }
}
