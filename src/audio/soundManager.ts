// Sound playback (Web Audio) with vanilla-like attenuation, categories and music.

import type { GameOptions } from '../game/options';
import type { Player } from '../entity/player';
import type { Game } from '../game/game';
import { MinecartSounds } from './minecartSounds';
import { ElytraSounds } from './elytraSounds';
import { BiomeAmbience } from './biomeAmbience';

/**
 * vanilla Musics: the situational music whose timing isn't the game music's (12000..24000 ticks apart, never
 * cutting in) — the End's, and the dragon fight's and the credits', which cut off whatever else is playing and
 * start at once
 */
const MUSIC_TIMING: Record<string, { min: number; max: number; replace: boolean }> = {
  'music.end': { min: 6000, max: 24000, replace: true },
  'music.dragon': { min: 0, max: 0, replace: true },
  'music.credits': { min: 0, max: 0, replace: true },
};

/** vanilla Musics.MENU: the title screen's pieces, 20..600 ticks apart, cutting off whatever else is playing */
const MENU_MUSIC = { pool: 'music.menu', min: 20, max: 600 };

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

type Category = 'master' | 'music' | 'records' | 'blocks' | 'weather' | 'hostile' | 'friendly' | 'players' | 'ambient';

function categoryOf(name: string): Category {
  // (jukebox) vanilla SimpleSoundInstance.forJukeboxSong: SoundSource.RECORDS ("Jukebox/Note Blocks")
  if (name.startsWith('music_disc.')) return 'records';
  // vanilla plays these with SimpleSoundInstance.forLocalAmbience (SoundSource.AMBIENT)
  if (name === 'block.portal.trigger' || name === 'block.portal.travel') return 'ambient';
  // vanilla global level event 1038 plays the end portal's opening as SoundSource.HOSTILE
  if (name === 'block.end_portal.spawn') return 'hostile';
  // vanilla ChorusFruitItem plays its teleport as SoundSource.PLAYERS
  if (name === 'item.chorus_fruit.teleport') return 'players';
  // vanilla CompassItem.useOn: the lock onto a lodestone, SoundSource.PLAYERS
  if (name === 'item.lodestone_compass.lock') return 'players';
  // vanilla Shulker and ShulkerBullet.getSoundSource: HOSTILE
  if (name.startsWith('entity.shulker')) return 'hostile';
  // vanilla ElytraOnPlayerSoundInstance: SoundSource.PLAYERS
  if (name === 'item.elytra.flying') return 'players';
  // vanilla: a rocket's launch and its burst are SoundSource.AMBIENT (a dispenser's shot NEUTRAL)
  if (name.startsWith('entity.firework_rocket.') && name !== 'entity.firework_rocket.shoot') return 'ambient';
  // vanilla CrossbowItem: the loading sounds are SoundSource.PLAYERS (the rest the shooter's source)
  if (name.startsWith('item.crossbow.')) return 'players';
  // (the shield's thud and crack are its holder's: a player's)
  if (name.startsWith('item.shield.')) return 'players';
  // (Stage 4: illagers) the totem is its user's (a player's, mostly); the raiders and the vex are hostile
  if (name === 'item.totem.use') return 'players';
  if (/^entity\.(pillager|vindicator|evoker|evoker_fangs|vex|ravager|illusioner)\./.test(name)) return 'hostile';
  // (vanilla Rabbit.getSoundSource: the killer bunny's is HOSTILE, and only it bites)
  if (name === 'entity.rabbit.attack') return 'hostile';
  // (Stage 5: ocean) the guardians are hostile
  if (/^entity\.(guardian|elder_guardian)\./.test(name)) return 'hostile';
  // (vanilla: a fish scooped up is the player's sound, one poured out SoundSource.NEUTRAL)
  if (name === 'item.bucket.fill_fish' || name === 'item.bucket.fill_axolotl') return 'players';
  if (name === 'item.bucket.empty_fish' || name === 'item.bucket.empty_axolotl') return 'friendly';
  // (M8: goats) vanilla Goat.mobInteract plays the milking at the player (SoundSource.PLAYERS)
  if (name === 'entity.goat.milk' || name === 'entity.goat.screaming.milk') return 'players';
  // (M9: frogs) a tadpole scooped up and poured out as a fish is; a frog lays its spawn with SoundSource.BLOCKS
  if (name === 'item.bucket.fill_tadpole') return 'players';
  if (name === 'item.bucket.empty_tadpole') return 'friendly';
  if (name === 'entity.frog.lay_spawn') return 'blocks';
  // (Stage 4: raids) the horn is vanilla's SoundSource.NEUTRAL; the bottle and the omens are the drinker's (a player's)
  if (name === 'event.raid.horn') return 'friendly';
  if (name.startsWith('item.ominous_bottle.') || name.startsWith('event.mob_effect.')) return 'players';
  if (name.startsWith('block.') || name.startsWith('item.')) return 'blocks';
  if (name.startsWith('weather.') || name.startsWith('entity.lightning')) return 'weather';
  if (name.startsWith('ambient.')) return 'ambient';
  if (/entity\.(zombie|skeleton|creeper|spider|enderman|slime|witch|drowned|husk|stray|phantom|ender_dragon|dragon_fireball|silverfish)/.test(name)) return 'hostile';
  // (vanilla ItemFrame.getSoundSource is the default NEUTRAL: "Friendly Creatures", not the dropped item's)
  if (name.startsWith('entity.item_frame')) return 'friendly';
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
  [/^block\.(hard_crop)\./, 'block.wood.'],
  // the nether wart crop (vanilla SoundType.NETHER_WART): stone steps, its planting sound on place
  [/^block\.nether_wart\.(?=step|hit)/, 'block.stone.'],
  [/^block\.nether_wart\.place$/, 'item.nether_wart.plant'],
  // vanilla SoundType.CROP places with item.crop.plant: the same planting sound, however it's planted
  [/^item\.crop\.plant$/, 'block.crop.place'],
  // vanilla sounds.json: a potion is thrown with the bow's twang (random/bow) and smashes as glass does (random/glass)
  [/^entity\.(splash|lingering)_potion\.throw$/, 'entity.arrow.shoot'],
  [/^entity\.splash_potion\.break$/, 'block.glass.break'],
  // vanilla sounds.json: a lightning strike's crack is the explosion samples (random/explode1-4), played low
  [/^entity\.lightning_bolt\.impact$/, 'entity.generic.explode'],
  // vanilla sounds.json: the dragon's fireball bursting and an end gateway opening are the explosion samples too, its
  // spit the ghast's, its idle roar its growl, and a death that has none of its own the hurt grunt
  [/^(entity\.dragon_fireball\.explode|block\.end_gateway\.spawn)$/, 'entity.generic.explode'],
  [/^entity\.ender_dragon\.shoot$/, 'entity.ghast.shoot'],
  [/^entity\.ender_dragon\.ambient$/, 'entity.ender_dragon.growl'],
  [/^entity\.generic\.death$/, 'entity.player.hurt'],
  // vanilla sounds.json: chorus fruit teleports with the enderman's portal samples
  [/^item\.chorus_fruit\.teleport$/, 'entity.enderman.teleport'],
  // and a shulker teleports with them too
  [/^entity\.shulker\.teleport$/, 'entity.enderman.teleport'],
  // vanilla sounds.json: a shield breaking (or knocked down) is the item-break sample, random/break
  [/^item\.shield\.break$/, 'entity.item.break'],
  // vanilla sounds.json: a dispenser shoots a rocket with the bow's twang, random/bow
  [/^entity\.firework_rocket\.shoot$/, 'entity.arrow.shoot'],
  // vanilla sounds.json: some villagers at work make their workstation's own sound
  [/^entity\.villager\.work_weaponsmith$/, 'block.grindstone.use'],
  [/^entity\.villager\.work_armorer$/, 'block.blast_furnace.fire_crackle'],
  [/^entity\.villager\.work_butcher$/, 'block.smoker.smoke'],
  [/^entity\.villager\.work_farmer$/, 'block.composter.fill'],
  [/^entity\.villager\.work_fisherman$/, 'block.barrel.open'],
  [/^entity\.villager\.work_leatherworker$/, 'item.armor.equip_leather'],
  [/^entity\.villager\.work_librarian$/, 'item.book.page_turn'],
  // (Stage 5: ocean) the wet sponge's steps and knocks are the dry one's (both stone's here)
  [/^block\.wet_sponge\.(?!dries)/, 'block.stone.'],
];

/** how late (ms) a sound that had to be generated first may still start */
const WAIT_MS = 250;

/** (jukebox) how many rendered songs are kept: all nineteen discs' at once would be over 600 MB */
const SONGS_KEPT = 4;

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
  /** how many title-screen pieces there are, and real time not yet counted in ticks while there's no world */
  private menuCount = 0;
  private menuTime = 0;
  private menuLast = 0;
  private opts: GameOptions | null = null;
  private moodiness = 0;
  private active: { src: AudioBufferSourceNode; gain: GainNode; pan: StereoPannerNode; x: number; y: number; z: number; vol: number; range: number; cat: Category; ui: boolean }[] = [];
  private musicLoading = false;
  /** the situational pool playing (or on its way), and a count that turns away a track that's been cut off */
  private musicPool: string | null = null;
  private musicReq = 0;
  /**
   * music rendered before it's wanted, by pool (null while it's on its way): the credits', once the dragon is dead for
   * a player who hasn't seen them. Vanilla streams the piece and starts it at once; ours takes seconds to render,
   * seconds the End Poem would otherwise open in silence
   */
  private readonly readyMusic = new Map<string, AudioBuffer | null>();
  private readonly loops: LoopSound[] = [];
  /**
   * (jukebox) vanilla LevelRenderer.playingJukeboxSongs: the song each jukebox is playing, by position (`e` null
   * while it's still being rendered), and the last few songs played, kept so a disc put back in starts at once
   */
  private readonly jukeboxSongs = new Map<string, { e: SoundManager['active'][number] | null }>();
  private readonly songBuffers = new Map<string, AudioBuffer>();
  private readonly minecarts = new MinecartSounds(this);
  private readonly elytra = new ElytraSounds(this);
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
          this.menuCount = d.menu ?? 0;
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
    const v = { master: 1, music: o.musicVolume, records: o.recordsVolume, blocks: o.blocksVolume, weather: o.weatherVolume, hostile: o.hostileVolume, friendly: o.friendlyVolume, players: o.playersVolume, ambient: o.ambientVolume }[cat];
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

  /**
   * (jukebox) vanilla LevelRenderer.playJukeboxSong (level event 1010): the song from the jukebox at (x, y, z),
   * SimpleSoundInstance.forJukeboxSong: at the block's middle, volume 4 (heard fading linearly out to 64 blocks), not
   * looping. The song is rendered first (a few seconds, the first time); it starts when it's ready
   */
  playJukeboxSong(event: string, x: number, y: number, z: number): void {
    this.stopJukeboxSong(x, y, z);
    this.ensure();
    if (!this.ctx || !this.master) return;
    const key = `${x},${y},${z}`;
    const entry: { e: SoundManager['active'][number] | null } = { e: null };
    this.jukeboxSongs.set(key, entry);
    const start = (buf: AudioBuffer) => {
      if (this.jukeboxSongs.get(key) !== entry || !this.ctx) return;
      const ctx = this.ctx;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const gain = ctx.createGain();
      const pan = ctx.createStereoPanner();
      src.connect(gain).connect(pan).connect(this.master!);
      const e = { src, gain, pan, x: x + 0.5, y: y + 0.5, z: z + 0.5, vol: 1, range: 16 * 4, cat: 'records' as Category, ui: false };
      this.applySpatial(e);
      src.start();
      this.active.push(e);
      entry.e = e;
      src.onended = () => {
        const i = this.active.indexOf(e);
        if (i >= 0) this.active.splice(i, 1);
        if (this.jukeboxSongs.get(key) === entry) this.jukeboxSongs.delete(key);
      };
    };
    const cached = this.songBuffers.get(event);
    if (cached) {
      // (the most recently played kept last)
      this.songBuffers.delete(event);
      this.songBuffers.set(event, cached);
      return start(cached);
    }
    void this.request({ type: 'pool', pool: event, index: 0 }).then((d) => {
      if (!d || !this.ctx) return;
      const b = this.ctx.createBuffer(1, d.length, SR);
      b.copyToChannel(d as Float32Array<ArrayBuffer>, 0);
      this.songBuffers.delete(event);
      this.songBuffers.set(event, b);
      for (const old of this.songBuffers.keys()) if (this.songBuffers.size > SONGS_KEPT) this.songBuffers.delete(old);
      start(b);
    });
  }

  /** (jukebox) vanilla LevelRenderer.stopJukeboxSong (level event 1011): the jukebox at (x, y, z) falls silent */
  stopJukeboxSong(x: number, y: number, z: number): void {
    const key = `${x},${y},${z}`;
    const entry = this.jukeboxSongs.get(key);
    if (!entry) return;
    this.jukeboxSongs.delete(key);
    if (!entry.e) return;
    try {
      entry.e.src.stop();
    } catch {
      /* already stopped */
    }
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
    this.elytra.tick(game.level, p);
    // biome loops, additions and (where the biome has its own) mood (vanilla BiomeAmbientSoundsHandler)
    const biomeMood = this.biomeAmbience.tick(game);
    // game music (vanilla MusicManager: 12000..24000 tick gaps); a biome with its own music (the
    // Nether's music.nether.<biome>) picks from that pool when the next track is due
    const situation = this.biomeAmbience.music(game);
    const timing = situation ? MUSIC_TIMING[situation] : undefined;
    // (vanilla MusicManager.tick: music that replaces cuts off other music, and comes after at most its longest gap)
    if (timing?.replace && (this.musicPlaying || this.musicLoading) && this.musicPool !== situation) {
      this.stopMusic();
      this.nextSongDelay = Math.floor(Math.random() * (Math.floor(timing.min / 2) + 1));
    }
    if (timing) this.nextSongDelay = Math.min(this.nextSongDelay, timing.max);
    if (!this.musicPlaying && !this.musicLoading && this.musicCount > 0) {
      if (--this.nextSongDelay <= 0) {
        this.nextSongDelay = timing ? timing.min + Math.floor(Math.random() * (timing.max - timing.min + 1)) : 12000 + Math.floor(Math.random() * 12000);
        const pool = situation;
        const n = pool ? (this.musicPools[pool] ?? 0) : 0;
        if (pool && n > 0) void this.playMusic(Math.floor(Math.random() * n), false, pool);
        // (the End's situations have only their own music)
        else if (!timing) void this.playMusic(Math.floor(Math.random() * this.musicCount));
      }
    }
    // (the credits' music got ready while the exit portal is open to a player who has the End Poem to come, and let go
    // otherwise: the credits are over, or they left the End some other way)
    if (game.world.dim.id === 'the_end' && game.level.dragonFight?.dragonKilled && !p.seenCredits) this.prefetchMusic('music.credits');
    else this.readyMusic.delete('music.credits');
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
    if (menu) pool = MENU_MUSIC.pool;
    this.musicLoading = true;
    this.musicPool = pool ?? null;
    const req = ++this.musicReq;
    // (a piece rendered before it was wanted starts at once: a pool's only track, or one of its others)
    let b = pool ? this.readyMusic.get(pool) : undefined;
    if (!b) {
      const d = await this.request(menu ? { type: 'menu', index } : pool ? { type: 'pool', pool, index } : { type: 'music', index });
      if (req !== this.musicReq) return;
      if (!d || !this.ctx) {
        this.musicLoading = false;
        return;
      }
      b = this.ctx.createBuffer(1, d.length, SR);
      b.copyToChannel(d as Float32Array<ArrayBuffer>, 0);
    }
    this.musicLoading = false;
    // (whatever was playing stops; when the next piece is due stays as it was set)
    this.stopSource();
    this.musicPool = pool ?? null;
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
      }
    };
  }

  /**
   * vanilla MusicManager.tick with Musics.MENU while there's no world (called every frame, counted out in ticks of
   * 50 ms): one of the title screen's pieces, whole, then 1 to 30 s of quiet before the next; other music is cut off,
   * with the menu's coming within half a second
   */
  menuMusic(opts: GameOptions): void {
    this.opts = opts;
    if (!this.ctx || this.menuCount <= 0) return;
    const now = performance.now();
    this.menuTime = Math.min(this.menuTime + (this.menuLast ? now - this.menuLast : 0), 1000);
    this.menuLast = now;
    for (; this.menuTime >= 50; this.menuTime -= 50) {
      if ((this.musicPlaying || this.musicLoading) && this.musicPool !== MENU_MUSIC.pool) {
        this.stopMusic();
        this.nextSongDelay = Math.floor(Math.random() * (MENU_MUSIC.min / 2 + 1));
      }
      this.nextSongDelay = Math.min(this.nextSongDelay, MENU_MUSIC.max);
      if (!this.musicPlaying && !this.musicLoading && this.nextSongDelay-- <= 0) {
        // (counted down only while nothing plays: the quiet after this piece)
        this.nextSongDelay = MENU_MUSIC.min + Math.floor(Math.random() * (MENU_MUSIC.max - MENU_MUSIC.min + 1));
        void this.playMusic(Math.floor(Math.random() * this.menuCount), true);
      }
    }
  }

  /** stop the piece playing, leaving when the next is due as it is */
  private stopSource(): void {
    if (this.musicSource) {
      try {
        this.musicSource.stop();
      } catch {
        /* already stopped */
      }
    }
    this.musicSource = null;
    this.musicPlaying = false;
  }

  stopMusic(): void {
    this.stopSource();
    this.nextSongDelay = 100;
    // (a track still on its way is turned away when it comes)
    this.musicReq++;
    this.musicLoading = false;
    this.musicPool = null;
  }

  /** start a situational pool's music now, whatever is playing (vanilla MusicManager.startPlaying: the credits') */
  playSituationalMusic(pool: string): void {
    const n = this.musicPools[pool] ?? 0;
    if (!this.ctx || n <= 0) return;
    void this.playMusic(Math.floor(Math.random() * n), false, pool);
  }

  /**
   * vanilla MusicManager.tick while a screen sets the music with no gap between tracks (WinScreen's Musics.CREDITS),
   * called each frame whatever the game is doing: that pool's music, cutting in, and again as soon as it ends
   */
  keepSituationalMusic(pool: string): void {
    if ((this.musicPlaying || this.musicLoading) && this.musicPool === pool) return;
    this.playSituationalMusic(pool);
  }

  /** vanilla MusicManager.stopPlaying(music): stop the music if it's that pool's (and let go of it, if rendered ahead) */
  stopSituationalMusic(pool: string): void {
    if ((this.musicPlaying || this.musicLoading) && this.musicPool === pool) this.stopMusic();
    this.readyMusic.delete(pool);
  }

  /** render a pool's music now, to start at once when it's asked for (one of its tracks, kept until let go) */
  private prefetchMusic(pool: string): void {
    const n = this.musicPools[pool] ?? 0;
    if (!this.ctx || n <= 0 || this.readyMusic.has(pool)) return;
    this.readyMusic.set(pool, null);
    void this.request({ type: 'pool', pool, index: Math.floor(Math.random() * n) }).then((d) => {
      // (let go of while it was on its way: dropped)
      if (!d || !this.ctx || !this.readyMusic.has(pool)) return;
      const b = this.ctx.createBuffer(1, d.length, SR);
      b.copyToChannel(d as Float32Array<ArrayBuffer>, 0);
      this.readyMusic.set(pool, b);
    });
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
    // (jukebox) and the songs still being rendered don't start after all
    this.jukeboxSongs.clear();
    for (const s of this.loops) s.stop();
    this.updateLoops();
    this.stopMusic();
  }
}
