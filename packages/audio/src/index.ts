export type AudioChannelId = 'music' | 'sfx' | 'voice' | (string & {});

export class AudioMixer {
  private readonly groups = new Map<string, GainNode>();
  readonly master: GainNode;
  private muted = false;
  private masterVolume = 1;

  constructor(readonly context: AudioContext) {
    this.master = context.createGain(); this.master.connect(context.destination);
  }
  group(id: string): GainNode {
    let group = this.groups.get(id);
    if (!group) { group = this.context.createGain(); group.connect(this.master); this.groups.set(id, group); }
    return group;
  }
  setVolume(id: string, volume: number): void { this.group(id).gain.value = clampVolume(volume); }
  getVolume(id: string): number { return this.group(id).gain.value; }
  setMasterVolume(volume: number): void { this.masterVolume = clampVolume(volume); if (!this.muted) this.master.gain.value = this.masterVolume; }
  setMuted(muted: boolean): void { this.muted = muted; this.master.gain.value = muted ? 0 : this.masterVolume; }
  async resume(): Promise<void> { if (this.context.state !== 'running') await this.context.resume(); }
  disconnect(): void { for (const group of this.groups.values()) group.disconnect(); this.groups.clear(); this.master.disconnect(); }
  async dispose(): Promise<void> { this.disconnect(); if (this.context.state !== 'closed') await this.context.close(); }
}

export interface SoundDefinition {
  id: string;
  url: string;
  channel?: AudioChannelId;
  volume?: number;
  cooldownMs?: number;
  maxConcurrent?: number;
  loop?: boolean;
}
export interface PlayOptions { volume?: number; rate?: number; loop?: boolean; channel?: AudioChannelId; }
export interface PlayingSound { id: string; stop(): void; readonly ended: Promise<void>; }

export class AudioManager {
  readonly mixer: AudioMixer;
  private readonly definitions = new Map<string, SoundDefinition>();
  private readonly buffers = new Map<string, Promise<AudioBuffer>>();
  private readonly lastPlayed = new Map<string, number>();
  private readonly active = new Map<string, Set<AudioBufferSourceNode>>();
  private readonly playlists = new Map<string, { tracks: string[]; index: number }>();
  private removeResumeListeners?: () => void;

  constructor(readonly context: AudioContext, private readonly fetcher: typeof fetch = fetch) { this.mixer = new AudioMixer(context); }
  register(definition: SoundDefinition): this { if (this.definitions.has(definition.id)) throw new Error(`Duplicate sound: ${definition.id}`); this.definitions.set(definition.id, definition); return this; }
  registerMany(definitions: readonly SoundDefinition[]): this { for (const definition of definitions) this.register(definition); return this; }
  async load(id: string): Promise<AudioBuffer> {
    const definition = this.requireDefinition(id); let pending = this.buffers.get(id);
    if (!pending) {
      pending = this.fetcher(definition.url).then(async (response) => { if (!response.ok) throw new Error(`Failed to load sound ${id}: ${response.status}`); return this.context.decodeAudioData(await response.arrayBuffer()); }).catch((error) => { this.buffers.delete(id); throw error; });
      this.buffers.set(id, pending);
    }
    return pending;
  }
  async play(id: string, options: PlayOptions = {}): Promise<PlayingSound | undefined> {
    const definition = this.requireDefinition(id); const now = performance.now();
    if (now - (this.lastPlayed.get(id) ?? -Infinity) < (definition.cooldownMs ?? 0)) return undefined;
    // Register the active set and the cooldown *before* awaiting: two concurrent plays used to each
    // create their own Set, and the second overwrote the first, orphaning a source stop() never saw.
    let active = this.active.get(id);
    if (!active) { active = new Set(); this.active.set(id, active); }
    const maxConcurrent = definition.maxConcurrent ?? Infinity;
    if (active.size >= maxConcurrent) return undefined;
    this.lastPlayed.set(id, now);
    const buffer = await this.load(id);
    if (active.size >= maxConcurrent) return undefined; // Re-check: other plays may have started during the load.
    const source = this.context.createBufferSource(); source.buffer = buffer; source.playbackRate.value = Math.max(0.01, options.rate ?? 1); source.loop = options.loop ?? definition.loop ?? false;
    const gain = this.context.createGain(); gain.gain.value = clampVolume((definition.volume ?? 1) * (options.volume ?? 1));
    source.connect(gain); gain.connect(this.mixer.group(options.channel ?? definition.channel ?? 'sfx')); active.add(source);
    let resolveEnded!: () => void; const ended = new Promise<void>((resolve) => { resolveEnded = resolve; });
    const cleanup = () => { active.delete(source); source.disconnect(); gain.disconnect(); resolveEnded(); };
    source.addEventListener('ended', cleanup, { once: true }); source.start();
    return { id, ended, stop: () => { try { source.stop(); } catch { cleanup(); } } };
  }
  stop(id?: string): void {
    const groups = id ? [this.active.get(id)] : [...this.active.values()];
    for (const group of groups) for (const source of group ?? []) { try { source.stop(); } catch { source.disconnect(); } }
  }
  definePlaylist(id: string, tracks: readonly string[]): void { if (!tracks.length) throw new Error('Playlist requires at least one track'); for (const track of tracks) this.requireDefinition(track); this.playlists.set(id, { tracks: [...tracks], index: 0 }); }
  async playNext(id: string): Promise<PlayingSound | undefined> { const playlist = this.playlists.get(id); if (!playlist) throw new Error(`Unknown playlist: ${id}`); const track = playlist.tracks[playlist.index++ % playlist.tracks.length]!; return this.play(track, { channel: 'music' }); }
  enableFirstInteractionResume(target: EventTarget = window): void {
    this.removeResumeListeners?.(); const resume = () => { void this.mixer.resume(); this.removeResumeListeners?.(); };
    for (const event of ['pointerdown', 'keydown', 'touchstart']) target.addEventListener(event, resume, { once: true });
    this.removeResumeListeners = () => { for (const event of ['pointerdown', 'keydown', 'touchstart']) target.removeEventListener(event, resume); this.removeResumeListeners = undefined; };
  }
  unload(id: string): void { this.stop(id); this.buffers.delete(id); }
  async dispose(): Promise<void> { this.removeResumeListeners?.(); this.stop(); this.buffers.clear(); this.definitions.clear(); this.playlists.clear(); await this.mixer.dispose(); }
  private requireDefinition(id: string): SoundDefinition { const definition = this.definitions.get(id); if (!definition) throw new Error(`Unknown sound: ${id}`); return definition; }
}

function clampVolume(value: number): number { return Math.max(0, Math.min(1, value)); }
