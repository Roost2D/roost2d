export interface Envelope<T = unknown> { version: 1; type: string; id: string; sentAt: number; payload: T; }
export type ConnectionState = 'idle' | 'connecting' | 'open' | 'closed' | 'error';
export interface MessageTransport {
  readonly state: ConnectionState;
  connect?(): void | Promise<void>;
  send(message: string): void;
  subscribe(listener: (message: string) => void): () => void;
  subscribeState?(listener: (state: ConnectionState) => void): () => void;
  close(): void;
}

export function encodeEnvelope<T>(type: string, id: string, payload: T, sentAt = Date.now()): string { return JSON.stringify({ version: 1, type, id, sentAt, payload } satisfies Envelope<T>); }
export function decodeEnvelope(value: string): Envelope {
  const parsed: unknown = JSON.parse(value); if (!parsed || typeof parsed !== 'object') throw new Error('Envelope must be an object');
  const envelope = parsed as Partial<Envelope>; if (envelope.version !== 1 || typeof envelope.type !== 'string' || typeof envelope.id !== 'string' || typeof envelope.sentAt !== 'number' || !('payload' in envelope)) throw new Error('Unsupported or malformed envelope'); return envelope as Envelope;
}

export class MessageChannel {
  constructor(private readonly transport: MessageTransport) {}
  connect(): void | Promise<void> { return this.transport.connect?.(); }
  send<T>(type: string, id: string, payload: T): void { this.transport.send(encodeEnvelope(type, id, payload)); }
  subscribe(listener: (message: Envelope) => void): () => void { return this.transport.subscribe((value) => listener(decodeEnvelope(value))); }
  close(): void { this.transport.close(); }
}

interface WorkerLike extends EventTarget { postMessage(message: unknown): void; terminate?(): void; }
export class LocalWorkerTransport implements MessageTransport {
  state: ConnectionState = 'idle'; private readonly listeners = new Set<(message: string) => void>(); private readonly stateListeners = new Set<(state: ConnectionState) => void>();
  private readonly onMessage = (event: Event) => { const data = (event as MessageEvent).data; const value = typeof data === 'string' ? data : JSON.stringify(data); for (const listener of this.listeners) listener(value); };
  constructor(private readonly worker: WorkerLike) {}
  connect(): void { if (this.state === 'open') return; this.setState('connecting'); this.worker.addEventListener('message', this.onMessage); this.setState('open'); }
  send(message: string): void { if (this.state !== 'open') throw new Error('Worker transport is not open'); this.worker.postMessage(message); }
  subscribe(listener: (message: string) => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  subscribeState(listener: (state: ConnectionState) => void): () => void { this.stateListeners.add(listener); return () => this.stateListeners.delete(listener); }
  close(): void { if (this.state === 'closed') return; this.worker.removeEventListener('message', this.onMessage); this.worker.terminate?.(); this.setState('closed'); }
  private setState(state: ConnectionState): void { this.state = state; for (const listener of this.stateListeners) listener(state); }
}

export interface SocketLike extends EventTarget { readonly readyState: number; send(message: string): void; close(code?: number, reason?: string): void; }
export class SocketTransport implements MessageTransport {
  state: ConnectionState = 'idle'; private socket?: SocketLike; private readonly listeners = new Set<(message: string) => void>(); private readonly stateListeners = new Set<(state: ConnectionState) => void>();
  constructor(private readonly url: string, private readonly createSocket: (url: string) => SocketLike = (value) => new WebSocket(value)) {}
  connect(): Promise<void> {
    if (this.state === 'open') return Promise.resolve(); this.setState('connecting'); this.socket = this.createSocket(this.url);
    return new Promise((resolve, reject) => {
      const open = () => { cleanup(); this.bind(); this.setState('open'); resolve(); };
      const error = () => { cleanup(); this.setState('error'); reject(new Error(`WebSocket connection failed: ${this.url}`)); };
      const cleanup = () => { this.socket?.removeEventListener('open', open); this.socket?.removeEventListener('error', error); };
      this.socket!.addEventListener('open', open); this.socket!.addEventListener('error', error);
    });
  }
  send(message: string): void { if (this.state !== 'open' || !this.socket) throw new Error('Socket transport is not open'); this.socket.send(message); }
  subscribe(listener: (message: string) => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  subscribeState(listener: (state: ConnectionState) => void): () => void { this.stateListeners.add(listener); return () => this.stateListeners.delete(listener); }
  close(code = 1000, reason = 'closed'): void { this.socket?.close(code, reason); this.socket = undefined; this.setState('closed'); }
  private bind(): void {
    this.socket!.addEventListener('message', (event) => { const data = (event as MessageEvent).data; if (typeof data !== 'string') return; for (const listener of this.listeners) listener(data); });
    this.socket!.addEventListener('close', () => this.setState('closed')); this.socket!.addEventListener('error', () => this.setState('error'));
  }
  private setState(state: ConnectionState): void { this.state = state; for (const listener of this.stateListeners) listener(state); }
}

export interface TimedSnapshot<T> { timeMs: number; value: T; }
export class SnapshotBuffer<T> {
  private readonly snapshots: TimedSnapshot<T>[] = [];
  constructor(private readonly maximum = 120) {}
  push(snapshot: TimedSnapshot<T>): void { const existing = this.snapshots.findIndex(({ timeMs }) => timeMs === snapshot.timeMs); if (existing >= 0) this.snapshots[existing] = snapshot; else this.snapshots.push(snapshot); this.snapshots.sort((a, b) => a.timeMs - b.timeMs); while (this.snapshots.length > this.maximum) this.snapshots.shift(); }
  sample(timeMs: number, interpolate: (from: T, to: T, alpha: number) => T): T | undefined {
    if (!this.snapshots.length) return undefined; if (timeMs <= this.snapshots[0]!.timeMs) return this.snapshots[0]!.value; if (timeMs >= this.snapshots.at(-1)!.timeMs) return this.snapshots.at(-1)!.value;
    const nextIndex = this.snapshots.findIndex(({ timeMs: value }) => value >= timeMs); const from = this.snapshots[nextIndex - 1]!; const to = this.snapshots[nextIndex]!; return interpolate(from.value, to.value, (timeMs - from.timeMs) / (to.timeMs - from.timeMs));
  }
  prune(beforeMs: number): void { while (this.snapshots.length > 2 && this.snapshots[1]!.timeMs < beforeMs) this.snapshots.shift(); }
  clear(): void { this.snapshots.length = 0; }
  get size(): number { return this.snapshots.length; }
}

export class SnapshotInterpolator<T> {
  constructor(readonly buffer: SnapshotBuffer<T>, public delayMs: number, private readonly interpolate: (from: T, to: T, alpha: number) => T) {}
  sample(localTimeMs: number, clockOffsetMs = 0): T | undefined { return this.buffer.sample(localTimeMs + clockOffsetMs - this.delayMs, this.interpolate); }
}

export class ClockSynchronizer {
  private readonly offsets: number[] = [];
  constructor(private readonly maximumSamples = 20) {}
  record(localSentMs: number, localReceivedMs: number, serverMs: number): number { const offset = serverMs - (localSentMs + localReceivedMs) / 2; this.offsets.push(offset); while (this.offsets.length > this.maximumSamples) this.offsets.shift(); return offset; }
  get offsetMs(): number { if (!this.offsets.length) return 0; const sorted = [...this.offsets].sort((a, b) => a - b); return sorted[Math.floor(sorted.length / 2)]!; }
  toServerTime(localMs: number): number { return localMs + this.offsetMs; }
  reset(): void { this.offsets.length = 0; }
}
