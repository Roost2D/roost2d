export type Unsubscribe = () => void;

export interface Vec2 { x: number; y: number; }
export interface Rect { x: number; y: number; width: number; height: number; }
export interface Disposable { dispose(): void | Promise<void>; }

export class EventBus<Events extends Record<string, unknown>> {
  private readonly listeners = new Map<keyof Events, Set<(event: Events[keyof Events]) => void>>();

  on<Key extends keyof Events>(type: Key, listener: (event: Events[Key]) => void): Unsubscribe {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener as (event: Events[keyof Events]) => void);
    this.listeners.set(type, listeners);
    return () => listeners.delete(listener as (event: Events[keyof Events]) => void);
  }

  once<Key extends keyof Events>(type: Key, listener: (event: Events[Key]) => void): Unsubscribe {
    let unsubscribe: Unsubscribe = () => undefined;
    unsubscribe = this.on(type, (event) => { unsubscribe(); listener(event); });
    return unsubscribe;
  }

  emit<Key extends keyof Events>(type: Key, event: Events[Key]): void {
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener(event);
  }

  clear(type?: keyof Events): void {
    if (type === undefined) this.listeners.clear();
    else this.listeners.delete(type);
  }
}

export interface Tick {
  deltaMs: number;
  elapsedMs: number;
  frame: number;
}

/** Deterministic fixed-step accumulator. Rendering remains caller-controlled. */
export class FixedStepClock {
  private accumulatorMs = 0;
  private elapsedMs = 0;
  private frame = 0;

  constructor(public readonly stepMs = 1000 / 60, public readonly maxCatchUpSteps = 5) {
    if (!(stepMs > 0)) throw new Error('stepMs must be positive');
    if (!Number.isInteger(maxCatchUpSteps) || maxCatchUpSteps < 1) throw new Error('maxCatchUpSteps must be a positive integer');
  }

  advance(deltaMs: number, onTick: (tick: Tick) => void): number {
    this.accumulatorMs += Math.max(0, Number.isFinite(deltaMs) ? deltaMs : 0);
    let steps = 0;
    while (this.accumulatorMs >= this.stepMs && steps < this.maxCatchUpSteps) {
      this.accumulatorMs -= this.stepMs;
      this.elapsedMs += this.stepMs;
      this.frame += 1;
      onTick({ deltaMs: this.stepMs, elapsedMs: this.elapsedMs, frame: this.frame });
      steps += 1;
    }
    if (steps === this.maxCatchUpSteps) this.accumulatorMs = Math.min(this.accumulatorMs, this.stepMs);
    return steps;
  }

  get alpha(): number { return this.accumulatorMs / this.stepMs; }
  get currentFrame(): number { return this.frame; }
  get currentTimeMs(): number { return this.elapsedMs; }
  reset(): void { this.accumulatorMs = 0; this.elapsedMs = 0; this.frame = 0; }
}

export class DisposalScope implements Disposable {
  private disposed = false;
  private readonly resources: Disposable[] = [];

  add<T extends Disposable>(resource: T): T {
    if (this.disposed) { void resource.dispose(); throw new Error('DisposalScope is already disposed'); }
    this.resources.push(resource);
    return resource;
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    const errors: unknown[] = [];
    for (const resource of this.resources.splice(0).reverse()) {
      try { await resource.dispose(); } catch (error) { errors.push(error); }
    }
    if (errors.length) throw new AggregateError(errors, 'One or more resources failed to dispose');
  }
}

export class ServiceRegistry {
  private readonly values = new Map<symbol | string, unknown>();

  register<T>(key: symbol | string, value: T): T {
    if (this.values.has(key)) throw new Error(`Service is already registered: ${String(key)}`);
    this.values.set(key, value);
    return value;
  }

  replace<T>(key: symbol | string, value: T): T { this.values.set(key, value); return value; }
  has(key: symbol | string): boolean { return this.values.has(key); }
  get<T>(key: symbol | string): T {
    if (!this.values.has(key)) throw new Error(`Unknown service: ${String(key)}`);
    return this.values.get(key) as T;
  }
  tryGet<T>(key: symbol | string): T | undefined { return this.values.get(key) as T | undefined; }
  delete(key: symbol | string): boolean { return this.values.delete(key); }
  clear(): void { this.values.clear(); }
}

export interface RandomSource {
  next(): number;
  integer(minInclusive: number, maxExclusive: number): number;
  pick<T>(items: readonly T[]): T;
}

/** Small reproducible PRNG suitable for gameplay decisions, not cryptography. */
export class SeededRandom implements RandomSource {
  private state: number;
  constructor(seed = 0x6d2b79f5) { this.state = seed >>> 0; }
  next(): number {
    let value = this.state += 0x6d2b79f5;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  }
  integer(minInclusive: number, maxExclusive: number): number {
    if (!Number.isInteger(minInclusive) || !Number.isInteger(maxExclusive) || maxExclusive <= minInclusive) throw new Error('Invalid integer range');
    return minInclusive + Math.floor(this.next() * (maxExclusive - minInclusive));
  }
  pick<T>(items: readonly T[]): T {
    if (!items.length) throw new Error('Cannot pick from an empty collection');
    return items[this.integer(0, items.length)]!;
  }
}

export interface ObjectPoolOptions<T> {
  reset?: (value: T) => void;
  destroy?: (value: T) => void;
  maximumRetained?: number;
  prewarm?: number;
}

export class ObjectPool<T> {
  private readonly available: T[] = [];
  private readonly active = new Set<T>();
  private readonly reset: (value: T) => void;
  private readonly destroy: (value: T) => void;
  private readonly maximumRetained: number;
  constructor(
    private readonly create: () => T,
    resetOrOptions: ((value: T) => void) | ObjectPoolOptions<T> = () => undefined,
    destroy: (value: T) => void = () => undefined,
    maximumRetained = 256
  ) {
    const options = typeof resetOrOptions === 'function'
      ? { reset: resetOrOptions, destroy, maximumRetained }
      : resetOrOptions;
    this.reset = options.reset ?? (() => undefined);
    this.destroy = options.destroy ?? (() => undefined);
    this.maximumRetained = options.maximumRetained ?? 256;
    if (!Number.isInteger(this.maximumRetained) || this.maximumRetained < 0) throw new Error('ObjectPool maximumRetained must be a non-negative integer');
    this.prewarm(options.prewarm ?? 0);
  }

  acquire(): T {
    const value = this.available.pop() ?? this.create();
    this.active.add(value);
    return value;
  }
  release(value: T): boolean {
    if (!this.active.delete(value)) return false;
    this.reset(value);
    if (this.available.length < this.maximumRetained) this.available.push(value);
    else this.destroy(value);
    return true;
  }
  releaseAll(): void { for (const value of [...this.active]) this.release(value); }
  prewarm(count: number): void {
    if (!Number.isInteger(count) || count < 0) throw new Error('ObjectPool prewarm count must be a non-negative integer');
    while (this.available.length < Math.min(count, this.maximumRetained)) this.available.push(this.create());
  }
  /** Stable snapshot so callers may safely release entries while iterating. */
  activeValues(): readonly T[] { return [...this.active]; }
  retainedValues(): readonly T[] { return [...this.available]; }
  trim(maximumRetained = 0): number {
    if (!Number.isInteger(maximumRetained) || maximumRetained < 0) throw new Error('ObjectPool trim limit must be a non-negative integer');
    let removed = 0;
    while (this.available.length > maximumRetained) { this.destroy(this.available.pop()!); removed += 1; }
    return removed;
  }
  dispose(): void {
    for (const value of [...this.active, ...this.available]) this.destroy(value);
    this.active.clear(); this.available.length = 0;
  }
  get activeCount(): number { return this.active.size; }
  get retainedCount(): number { return this.available.length; }
  get totalCount(): number { return this.active.size + this.available.length; }
}

interface ScheduledTask { id: number; remainingMs: number; intervalMs?: number; callback: () => void; }

/** Fixed-update scheduler. It advances only when the owning runtime advances. */
export class Scheduler {
  private nextId = 1;
  private readonly tasks = new Map<number, ScheduledTask>();
  after(delayMs: number, callback: () => void): number { return this.add(delayMs, undefined, callback); }
  every(intervalMs: number, callback: () => void): number { return this.add(intervalMs, intervalMs, callback); }
  cancel(id: number): boolean { return this.tasks.delete(id); }
  clear(): void { this.tasks.clear(); }
  update(deltaMs: number): void {
    for (const task of [...this.tasks.values()]) {
      task.remainingMs -= deltaMs;
      while (task.remainingMs <= 0 && this.tasks.has(task.id)) {
        task.callback();
        if (task.intervalMs === undefined) { this.tasks.delete(task.id); break; }
        task.remainingMs += task.intervalMs;
      }
    }
  }
  private add(delayMs: number, intervalMs: number | undefined, callback: () => void): number {
    if (!(delayMs >= 0) || (intervalMs !== undefined && !(intervalMs > 0))) throw new Error('Invalid schedule duration');
    const id = this.nextId++;
    this.tasks.set(id, { id, remainingMs: delayMs, intervalMs, callback });
    return id;
  }
}

export interface SceneContext {
  readonly services: ServiceRegistry;
  readonly events: EventBus<Record<string, unknown>>;
  readonly scheduler: Scheduler;
  readonly random: RandomSource;
  readonly runtime: GameRuntime;
  /** Present only while a scene lifecycle callback is running. */
  readonly transition?: SceneTransitionContext;
}

export interface SceneTransitionContext<TData = unknown> {
  readonly fromId?: string;
  readonly toId: string;
  readonly data?: TData;
}

export type SceneLifetime = 'cached' | 'transient';
export interface SceneRegistrationOptions { lifetime?: SceneLifetime; }
export type SceneFactory = (transition: SceneTransitionContext, context: SceneContext) => Scene | Promise<Scene>;

export interface Scene {
  readonly id: string;
  load?(context: SceneContext): void | Promise<void>;
  enter?(context: SceneContext): void | Promise<void>;
  fixedUpdate?(tick: Tick, context: SceneContext): void;
  render?(deltaMs: number, alpha: number, context: SceneContext): void;
  exit?(context: SceneContext): void | Promise<void>;
  dispose?(): void | Promise<void>;
}

export interface System extends Partial<Disposable> {
  readonly id: string;
  fixedUpdate?(tick: Tick, context: SceneContext): void;
  render?(deltaMs: number, alpha: number, context: SceneContext): void;
}

export interface Plugin extends Partial<Disposable> {
  readonly id: string;
  install(context: SceneContext): void | Promise<void>;
}

export interface FrameDriver {
  request(callback: (timeMs: number) => void): unknown;
  cancel(handle: unknown): void;
  now(): number;
}

export const browserFrameDriver: FrameDriver | undefined = typeof globalThis.requestAnimationFrame === 'function' ? {
  request: (callback) => globalThis.requestAnimationFrame(callback),
  cancel: (handle) => globalThis.cancelAnimationFrame(handle as number),
  now: () => globalThis.performance.now()
} : undefined;

export interface RuntimeEvents extends Record<string, unknown> {
  'runtime:paused': { paused: boolean };
  'scene:changing': SceneTransitionContext;
  'scene:changed': SceneTransitionContext & { previousId?: string; currentId: string };
}

export interface GameRuntimeOptions {
  stepMs?: number;
  maxCatchUpSteps?: number;
  seed?: number;
  services?: ServiceRegistry;
}

export class GameRuntime implements Disposable {
  readonly clock: FixedStepClock;
  readonly services: ServiceRegistry;
  readonly scheduler = new Scheduler();
  readonly random: RandomSource;
  readonly events = new EventBus<RuntimeEvents>();
  readonly context: SceneContext;
  private readonly sceneFactories = new Map<string, { factory: SceneFactory; lifetime: SceneLifetime }>();
  private readonly loadedScenes = new Map<string, Scene>();
  private readonly systems = new Map<string, System>();
  private readonly plugins = new Map<string, Plugin>();
  private current?: Scene;
  private frameHandle?: unknown;
  private frameDriver?: FrameDriver;
  private lastFrameMs = 0;
  private switching = Promise.resolve();
  /** Incremented by every `start`/`stop`, so a frame callback can tell whether its loop still owns the runtime. */
  private runGeneration = 0;
  private disposing = false;
  paused = false;

  constructor(options: GameRuntimeOptions = {}) {
    this.clock = new FixedStepClock(options.stepMs, options.maxCatchUpSteps);
    this.services = options.services ?? new ServiceRegistry();
    this.random = new SeededRandom(options.seed);
    this.context = { services: this.services, events: this.events as unknown as EventBus<Record<string, unknown>>, scheduler: this.scheduler, random: this.random, runtime: this };
  }

  registerScene(id: string, factory: SceneFactory, options: SceneRegistrationOptions = {}): this {
    if (!id || this.sceneFactories.has(id)) throw new Error(`Duplicate or empty scene id: ${id}`);
    const lifetime = options.lifetime ?? 'cached';
    if (lifetime !== 'cached' && lifetime !== 'transient') throw new Error(`Unknown scene lifetime: ${String(lifetime)}`);
    this.sceneFactories.set(id, { factory, lifetime }); return this;
  }

  addSystem(system: System): this {
    if (this.systems.has(system.id)) throw new Error(`Duplicate system: ${system.id}`);
    this.systems.set(system.id, system); return this;
  }

  async addPlugin(plugin: Plugin): Promise<this> {
    if (this.plugins.has(plugin.id)) throw new Error(`Duplicate plugin: ${plugin.id}`);
    await plugin.install(this.context); this.plugins.set(plugin.id, plugin); return this;
  }

  switchScene<TData = unknown>(id: string, data?: TData): Promise<Scene> {
    const operation = this.switching.then(async () => {
      if (this.disposing) throw new Error('GameRuntime is disposed');
      const registration = this.sceneFactories.get(id);
      if (!registration) throw new Error(`Unknown scene: ${id}`);
      const previous = this.current;
      if (previous?.id === id) return previous;
      const transition: SceneTransitionContext<TData> = { fromId: previous?.id, toId: id, ...(data === undefined ? {} : { data }) };
      const context = this.contextFor(transition);
      const cached = registration.lifetime === 'cached' ? this.loadedScenes.get(id) : undefined;
      const next = cached ?? await registration.factory(transition, context);
      if (next.id !== id) throw new Error(`Scene factory for ${id} returned ${next.id}`);
      // Preparation completes before the active scene is disturbed. A failed factory/load leaves it active.
      if (!cached) {
        await next.load?.(context);
        if (registration.lifetime === 'cached') this.loadedScenes.set(id, next);
      }
      this.events.emit('scene:changing', transition);
      await previous?.exit?.(context);
      try {
        this.current = next;
        await next.enter?.(context);
      } catch (error) {
        this.current = previous;
        await previous?.enter?.(this.contextFor({ fromId: id, toId: previous?.id ?? '' }));
        if (registration.lifetime === 'transient') await next.dispose?.();
        throw error;
      }
      if (previous && this.sceneFactories.get(previous.id)?.lifetime === 'transient') await previous.dispose?.();
      this.events.emit('scene:changed', { ...transition, previousId: previous?.id, currentId: id });
      return next;
    });
    this.switching = operation.then(() => undefined, () => undefined);
    return operation;
  }

  setPaused(paused: boolean): void {
    if (this.paused === paused) return;
    this.paused = paused; this.events.emit('runtime:paused', { paused });
  }
  pause(): void { this.setPaused(true); }
  resume(): void { this.setPaused(false); }

  advance(deltaMs: number): number {
    if (this.paused) { this.render(deltaMs); return 0; }
    const steps = this.clock.advance(deltaMs, (tick) => {
      this.scheduler.update(tick.deltaMs);
      for (const system of this.systems.values()) system.fixedUpdate?.(tick, this.context);
      this.current?.fixedUpdate?.(tick, this.context);
    });
    this.render(deltaMs);
    return steps;
  }

  start(driver: FrameDriver = browserFrameDriver!): void {
    if (!driver) throw new Error('A frame driver is required outside a browser');
    if (this.disposing) throw new Error('GameRuntime is disposed');
    if (this.frameHandle !== undefined) return;
    const generation = ++this.runGeneration;
    this.frameDriver = driver; this.lastFrameMs = driver.now();
    const frame = (timeMs: number) => {
      if (generation !== this.runGeneration) return;
      const deltaMs = Math.max(0, Math.min(1000, timeMs - this.lastFrameMs));
      this.lastFrameMs = timeMs; this.advance(deltaMs);
      // A scene may have called stop() — or stop() then start() — during that advance. Only the
      // loop that still owns the runtime re-arms; a handle check alone would schedule two loops.
      if (generation !== this.runGeneration) return;
      this.frameHandle = driver.request(frame);
    };
    this.frameHandle = driver.request(frame);
  }

  stop(): void {
    this.runGeneration += 1;
    if (this.frameHandle !== undefined) this.frameDriver?.cancel(this.frameHandle);
    this.frameHandle = undefined; this.frameDriver = undefined;
  }

  private render(deltaMs: number): void {
    for (const system of this.systems.values()) system.render?.(deltaMs, this.clock.alpha, this.context);
    this.current?.render?.(deltaMs, this.clock.alpha, this.context);
  }

  private contextFor(transition: SceneTransitionContext): SceneContext {
    return { ...this.context, transition };
  }

  async dispose(): Promise<void> {
    if (this.disposing) return;
    this.disposing = true;
    this.stop();
    // Settle any in-flight switchScene first, or it repopulates loadedScenes after teardown.
    await this.switching;
    await this.current?.exit?.(this.context);
    const scenes = new Set<Scene>([...this.loadedScenes.values(), ...(this.current ? [this.current] : [])]);
    for (const scene of [...scenes].reverse()) await scene.dispose?.();
    for (const system of [...this.systems.values()].reverse()) await system.dispose?.();
    for (const plugin of [...this.plugins.values()].reverse()) await plugin.dispose?.();
    this.loadedScenes.clear(); this.systems.clear(); this.plugins.clear(); this.sceneFactories.clear();
    this.scheduler.clear(); this.services.clear(); this.events.clear(); this.current = undefined;
  }
}
