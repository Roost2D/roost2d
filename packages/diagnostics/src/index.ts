export interface DiagnosticsSnapshot {
  counters: Readonly<Record<string, number>>;
  timings: Readonly<Record<string, number>>;
  fps?: number;
  frameTimeMs?: number;
  memoryBytes?: number;
  capturedAt: number;
}

class BoundedSamples {
  private readonly values: number[] = [];
  constructor(private readonly maximum: number) {}
  add(value: number): void { this.values.push(value); if (this.values.length > this.maximum) this.values.shift(); }
  average(): number { return this.values.length ? this.values.reduce((sum, value) => sum + value, 0) / this.values.length : 0; }
  percentile(percentile: number): number { if (!this.values.length) return 0; const sorted = [...this.values].sort((a, b) => a - b); return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * percentile))]!; }
  clear(): void { this.values.length = 0; }
}

export class Diagnostics {
  private readonly counters = new Map<string, number>();
  private readonly timings = new Map<string, number>();
  private readonly frameSamples: BoundedSamples;
  private frameStartedAt?: number;
  constructor(private readonly sampleCount = 120, private readonly now: () => number = () => performance.now(), private readonly memoryReader?: () => number | undefined) { this.frameSamples = new BoundedSamples(sampleCount); }
  increment(name: string, amount = 1): void { this.counters.set(name, (this.counters.get(name) ?? 0) + amount); }
  set(name: string, value: number): void { this.counters.set(name, value); }
  beginFrame(): void { this.frameStartedAt = this.now(); }
  endFrame(): number { const elapsed = Math.max(0, this.now() - (this.frameStartedAt ?? this.now())); this.frameSamples.add(elapsed); this.frameStartedAt = undefined; return elapsed; }
  measure<T>(name: string, operation: () => T): T { const start = this.now(); try { return operation(); } finally { this.timings.set(name, this.now() - start); } }
  async measureAsync<T>(name: string, operation: () => Promise<T>): Promise<T> { const start = this.now(); try { return await operation(); } finally { this.timings.set(name, this.now() - start); } }
  section(name: string): () => number { const start = this.now(); return () => { const elapsed = this.now() - start; this.timings.set(name, elapsed); return elapsed; }; }
  snapshot(): DiagnosticsSnapshot { const frameTimeMs = this.frameSamples.average(); return { counters: Object.fromEntries(this.counters), timings: Object.fromEntries(this.timings), fps: frameTimeMs > 0 ? 1000 / frameTimeMs : undefined, frameTimeMs, memoryBytes: this.memoryReader?.(), capturedAt: this.now() }; }
  exportJson(): string { return JSON.stringify(this.snapshot(), null, 2); }
  reset(): void { this.counters.clear(); this.timings.clear(); this.frameSamples.clear(); this.frameStartedAt = undefined; }
}

export class DiagnosticsOverlay {
  readonly element: HTMLPreElement;
  private timer?: ReturnType<typeof setInterval>;
  constructor(private readonly diagnostics: Diagnostics, parent: HTMLElement = document.body) { this.element = document.createElement('pre'); this.element.setAttribute('aria-live', 'off'); Object.assign(this.element.style, { position: 'fixed', top: '0', right: '0', zIndex: '2147483647', margin: '0', padding: '8px', color: '#d8ffe4', background: 'rgba(0,0,0,.78)', font: '12px/1.4 monospace', pointerEvents: 'none' }); parent.append(this.element); }
  start(intervalMs = 500): void { this.stop(); const update = () => { const snapshot = this.diagnostics.snapshot(); this.element.textContent = `FPS ${snapshot.fps?.toFixed(1) ?? 'n/a'}\nFrame ${snapshot.frameTimeMs?.toFixed(2) ?? 'n/a'} ms${snapshot.memoryBytes ? `\nMemory ${(snapshot.memoryBytes / 1048576).toFixed(1)} MiB` : ''}`; }; update(); this.timer = setInterval(update, intervalMs); }
  stop(): void { if (this.timer) clearInterval(this.timer); this.timer = undefined; }
  dispose(): void { this.stop(); this.element.remove(); }
}

export function browserMemoryBytes(): number | undefined { return (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize; }
