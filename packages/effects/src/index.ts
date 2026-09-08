export interface Updatable { update(deltaMs: number): boolean; reset(): void; }
export interface TransformTarget { x: number; y: number; scaleX?: number; scaleY?: number; alpha?: number; tint?: number; rotation?: number; }

export type ProceduralEffectKind = 'beam' | 'slash' | 'projectile' | 'burst' | 'trail';

/** Renderer-neutral description of a deterministic presentation effect. */
export interface ProceduralEffectDescriptor {
  id: string;
  kind: ProceduralEffectKind;
  durationMs: number;
  color: number;
  secondaryColor?: number;
  length?: number;
  width?: number;
  radius?: number;
  distance?: number;
}

export interface ProceduralEffectFrame {
  progress: number;
  alpha: number;
  scale: number;
  offsetX: number;
  rotation: number;
  complete: boolean;
}

/** Pure sampling keeps live rendering and exported frames on the same clock. */
export function sampleProceduralEffect(effect: ProceduralEffectDescriptor, elapsedMs: number): ProceduralEffectFrame {
  if (!(effect.durationMs > 0) || !Number.isFinite(effect.durationMs)) throw new Error('Effect durationMs must be positive');
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) throw new Error('Effect elapsedMs must be finite and non-negative');
  const progress = Math.min(1, elapsedMs / effect.durationMs);
  const envelope = Math.sin(progress * Math.PI);
  const moving = effect.kind === 'projectile' || effect.kind === 'trail';
  return {
    progress,
    alpha: progress >= 1 ? 0 : effect.kind === 'beam' ? Math.min(1, envelope * 2.4) : envelope,
    scale: effect.kind === 'burst' ? 0.35 + progress * 1.25 : 0.75 + envelope * 0.25,
    offsetX: moving ? (effect.distance ?? effect.length ?? 120) * progress : 0,
    rotation: effect.kind === 'slash' ? -0.85 + progress * 1.7 : 0,
    complete: progress >= 1,
  };
}

/** Recycles self-updating effects. Distinct from `@roost2d/core`'s general-purpose `ObjectPool`. */
export class EffectPool<T extends Updatable> {
  private readonly available: T[] = [];
  private readonly active = new Set<T>();
  constructor(private readonly create: () => T, private readonly maxSize = 256) {}
  acquire(): T { const item = this.available.pop() ?? this.create(); item.reset(); this.active.add(item); return item; }
  release(item: T): boolean { if (!this.active.delete(item)) return false; if (this.available.length < this.maxSize) this.available.push(item); return true; }
  update(deltaMs: number): void { for (const item of [...this.active]) if (item.update(deltaMs)) this.release(item); }
  clear(): void { this.active.clear(); this.available.length = 0; }
  get activeCount(): number { return this.active.size; }
}

export type Easing = (value: number) => number;
export const easing = {
  linear: (value: number) => value,
  easeOut: (value: number) => 1 - (1 - value) ** 3,
  easeInOut: (value: number) => value < 0.5 ? 4 * value ** 3 : 1 - (-2 * value + 2) ** 3 / 2
} satisfies Record<string, Easing>;

export class TimedEffect implements Updatable {
  private elapsedMs = 0;
  constructor(public durationMs: number, private readonly apply: (progress: number) => void, private readonly curve: Easing = easing.linear, private readonly complete?: () => void) {}
  reset(): void { this.elapsedMs = 0; this.apply(this.curve(0)); }
  update(deltaMs: number): boolean {
    this.elapsedMs += Math.max(0, deltaMs); const done = this.elapsedMs >= this.durationMs;
    this.apply(this.curve(Math.min(1, this.durationMs > 0 ? this.elapsedMs / this.durationMs : 1))); if (done) this.complete?.(); return done;
  }
}

export function fade(target: TransformTarget, to: number, durationMs: number, curve = easing.linear): TimedEffect {
  const from = target.alpha ?? 1; return new TimedEffect(durationMs, (progress) => { target.alpha = from + (to - from) * progress; }, curve);
}
export function scalePop(target: TransformTarget, amount = 0.2, durationMs = 180): TimedEffect {
  const x = target.scaleX ?? 1; const y = target.scaleY ?? 1;
  return new TimedEffect(durationMs, (progress) => { const wave = Math.sin(progress * Math.PI) * amount; target.scaleX = x + wave; target.scaleY = y + wave; }, easing.easeOut, () => { target.scaleX = x; target.scaleY = y; });
}
export function tintFlash(target: TransformTarget, tint: number, durationMs = 120): TimedEffect {
  const original = target.tint ?? 0xffffff; return new TimedEffect(durationMs, (progress) => { target.tint = progress < 0.5 ? tint : original; }, easing.linear, () => { target.tint = original; });
}

export class ScreenShake implements Updatable {
  private elapsedMs = 0; private originX = 0; private originY = 0;
  constructor(private readonly target: TransformTarget, public durationMs = 250, public amplitude = 8, private readonly random: () => number = Math.random) {}
  reset(): void { this.elapsedMs = 0; this.originX = this.target.x; this.originY = this.target.y; }
  update(deltaMs: number): boolean {
    this.elapsedMs += deltaMs; const progress = Math.min(1, this.elapsedMs / this.durationMs); const strength = this.amplitude * (1 - progress);
    this.target.x = this.originX + (this.random() * 2 - 1) * strength; this.target.y = this.originY + (this.random() * 2 - 1) * strength;
    if (progress >= 1) { this.target.x = this.originX; this.target.y = this.originY; return true; } return false;
  }
}

export interface Particle extends TransformTarget { velocityX: number; velocityY: number; lifeMs: number; ageMs: number; }
export class ParticleEmitter {
  private readonly particles = new Set<Particle>();
  constructor(private readonly create: () => Particle, private readonly release: (particle: Particle) => void = () => undefined) {}
  emit(x: number, y: number, count = 1): readonly Particle[] {
    const created: Particle[] = [];
    for (let index = 0; index < count; index += 1) { const particle = this.create(); Object.assign(particle, { x, y, ageMs: 0 }); this.particles.add(particle); created.push(particle); }
    return created;
  }
  update(deltaMs: number): void {
    for (const particle of [...this.particles]) { particle.ageMs += deltaMs; particle.x += particle.velocityX * deltaMs / 1000; particle.y += particle.velocityY * deltaMs / 1000; particle.alpha = Math.max(0, 1 - particle.ageMs / particle.lifeMs); if (particle.ageMs >= particle.lifeMs) { this.particles.delete(particle); this.release(particle); } }
  }
  clear(): void { for (const particle of this.particles) this.release(particle); this.particles.clear(); }
  get activeCount(): number { return this.particles.size; }
}

export class Trail<T> {
  private elapsedMs = 0; readonly points: Array<{ x: number; y: number; value: T }> = [];
  constructor(private readonly intervalMs: number, private readonly maximumPoints: number, private readonly capture: () => { x: number; y: number; value: T }) {
    // A non-positive interval makes update() spin forever, since elapsedMs never falls below it.
    if (!(intervalMs > 0)) throw new Error('Trail intervalMs must be positive');
    if (!(maximumPoints > 0)) throw new Error('Trail maximumPoints must be positive');
  }
  update(deltaMs: number): void { this.elapsedMs += deltaMs; while (this.elapsedMs >= this.intervalMs) { this.elapsedMs -= this.intervalMs; this.points.push(this.capture()); if (this.points.length > this.maximumPoints) this.points.shift(); } }
  clear(): void { this.points.length = 0; this.elapsedMs = 0; }
}
