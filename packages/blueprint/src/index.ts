import { FixedStepClock, SeededRandom } from '@roost2d/core';
import { z } from 'zod';

const id = z.string().regex(/^[a-z][a-z0-9-]{0,47}$/);
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
export const FOUNDATION_CAPABILITIES = {
  action: { movement: 'free', goals: ['survive', 'collect'], projections: ['top-down', 'isometric'], actions: ['move', 'attack', 'dash'] },
  platformer: { movement: 'platform', goals: ['reach'], projections: ['side'], actions: ['move', 'jump', 'dash'] },
  defense: { movement: 'placement', goals: ['defend'], projections: ['top-down', 'isometric'], actions: ['select', 'place', 'upgrade'] },
} as const;

export const gameBlueprintSchema = z.object({
  schemaVersion: z.literal('1'),
  title: z.string().min(1).max(100),
  tagline: z.string().min(1).max(180),
  seed: z.number().int().min(1).max(2147483647),
  foundation: z.enum(['action', 'platformer', 'defense']),
  presentation: z.object({
    projection: z.enum(['side', 'top-down', 'isometric']),
    orientation: z.enum(['any', 'portrait', 'landscape']),
  }).strict(),
  theme: z.object({
    kit: z.enum(['woodland', 'neon', 'arcade']),
    biome: z.enum(['forest', 'city', 'cavern', 'coast', 'space']),
    timeOfDay: z.enum(['day', 'dusk', 'night']),
    accent: color,
    player: z.enum(['fox', 'wolf', 'chicken', 'robot', 'knight', 'slime']),
    enemy: z.enum(['slime', 'robot', 'bat', 'beetle']),
    collectible: z.enum(['crystal', 'coin', 'egg', 'star']),
  }).strict(),
  world: z.object({ width: z.number().int().min(640).max(3200), height: z.number().int().min(480).max(1200) }).strict(),
  player: z.object({ movement: z.enum(['free', 'platform', 'placement']), speed: z.number().min(100).max(450), jumpHeight: z.number().min(70).max(200) }).strict(),
  rules: z.object({
    goal: z.enum(['survive', 'collect', 'reach', 'defend']),
    target: z.number().int().min(3).max(30),
    durationSeconds: z.number().int().min(30).max(180),
    lives: z.number().int().min(1).max(8),
    difficulty: z.enum(['gentle', 'normal', 'hard']),
  }).strict(),
  combat: z.object({ enemySpeed: z.number().min(20).max(100), damage: z.number().min(1).max(5), spawnSeconds: z.number().min(0.6).max(3), towerCost: z.number().int().min(5).max(30) }).strict(),
  feel: z.object({ particles: z.boolean(), shake: z.boolean(), audio: z.boolean() }).strict(),
  controls: z.object({ primary: z.enum(['Space', 'KeyJ', 'KeyZ']), secondary: z.enum(['ShiftLeft', 'KeyK', 'KeyX']), touch: z.enum(['stick-actions', 'placement']) }).strict(),
  assets: z.array(z.object({ id, role: z.enum(['player', 'enemy', 'collectible', 'background']), path: z.string().regex(/^public\/assets\/[a-zA-Z0-9_./-]+\.(png|webp|jpg|svg)$/) }).strict()).max(12),
  extensions: z.array(z.object({ id, path: z.string().regex(/^src\/extensions\/[a-z][a-z0-9-]*\.ts$/) }).strict()).max(8),
  decisions: z.array(z.object({ id: z.enum(['foundation', 'projection', 'orientation', 'art', 'pace']), value: z.string().min(1).max(80), source: z.enum(['stated', 'assumed', 'user-edited']) }).strict()).max(5),
}).strict().superRefine((value, ctx) => {
  const capability = FOUNDATION_CAPABILITIES[value.foundation];
  if (capability.movement !== value.player.movement) ctx.addIssue({ code: 'custom', path: ['player', 'movement'], message: 'Movement does not match the foundation.' });
  if (!(capability.projections as readonly string[]).includes(value.presentation.projection)) ctx.addIssue({ code: 'custom', path: ['presentation', 'projection'], message: 'This foundation cannot use this projection.' });
  if (!(capability.goals as readonly string[]).includes(value.rules.goal)) ctx.addIssue({ code: 'custom', path: ['rules', 'goal'], message: 'This foundation cannot implement this goal.' });
  if ((value.foundation === 'defense') !== (value.controls.touch === 'placement')) ctx.addIssue({ code: 'custom', path: ['controls', 'touch'], message: 'Touch actions must cover the foundation.' });
  for (const field of ['assets', 'extensions', 'decisions'] as const) {
    if (new Set(value[field].map(item => item.id)).size !== value[field].length) ctx.addIssue({ code: 'custom', path: [field], message: 'IDs must be unique.' });
  }
  if (value.assets.some(asset => asset.path.split('/').includes('..'))) ctx.addIssue({ code: 'custom', path: ['assets'], message: 'Asset paths cannot traverse directories.' });
  if (new Set(value.assets.map(asset => asset.role)).size !== value.assets.length) ctx.addIssue({ code: 'custom', path: ['assets'], message: 'Each visual role may have one active override.' });
  if (new Set(value.extensions.map(extension => extension.path)).size !== value.extensions.length) ctx.addIssue({ code: 'custom', path: ['extensions'], message: 'Extension paths must be unique.' });
});

export type GameBlueprintV1 = z.infer<typeof gameBlueprintSchema>;
export const blueprintJsonSchema = z.toJSONSchema(gameBlueprintSchema);
export function parseBlueprint(value: unknown): GameBlueprintV1 { return gameBlueprintSchema.parse(value); }

export interface BlueprintInput { x: number; y: number; primary: boolean; secondary: boolean; pointer?: { x: number; y: number }; }
export interface BlueprintSnapshot {
  player: { x: number; y: number };
  objective: string;
  progression: number;
  terminalState: 'playing' | 'won' | 'lost';
  actions: Record<string, number>;
}
export interface BlueprintEvent { type: string; x: number; y: number; amount?: number; }
export interface BlueprintContext {
  readonly blueprint: GameBlueprintV1;
  readonly random: SeededRandom;
  emit(event: BlueprintEvent): void;
}
export interface BlueprintSimulation {
  update(deltaSeconds: number, input: BlueprintInput): void;
  snapshot(): BlueprintSnapshot;
  applyCommand?(command: Readonly<BlueprintCommand>): boolean;
  dispose?(): void;
}
/** Foundations explicitly accept or reject named mechanic commands. */
export interface BlueprintCommand { type: string; value?: number; x?: number; y?: number }
export interface BlueprintExtensionContext extends BlueprintContext {
  snapshot(): BlueprintSnapshot;
  command(command: Readonly<BlueprintCommand>): boolean;
}
export type FoundationFactory<S extends BlueprintSimulation = BlueprintSimulation> = (context: BlueprintContext) => S;
/** Compiled untrusted game code. Isolation is the host's responsibility. */
export interface BlueprintExtension {
  readonly id: string;
  create(context: BlueprintExtensionContext): { update?(deltaSeconds: number, input: Readonly<BlueprintInput>): void; onEvent?(event: Readonly<BlueprintEvent>): void; dispose?(): void };
}

export class BlueprintSession<S extends BlueprintSimulation> {
  readonly blueprint: GameBlueprintV1;
  private readonly clock = new FixedStepClock();
  private instances: ReturnType<BlueprintExtension['create']>[] = [];
  private events: BlueprintEvent[] = [];
  private pendingEvents: BlueprintEvent[] = [];
  private disposed = false;
  private paused = false;
  private restarts = -1;
  simulation!: S;

  constructor(blueprint: GameBlueprintV1, private readonly factory: FoundationFactory<S>, private readonly extensions: readonly BlueprintExtension[] = []) {
    this.blueprint = parseBlueprint(blueprint);
    const expected = this.blueprint.extensions.map(extension => extension.id);
    if (extensions.length !== expected.length || new Set(extensions.map(extension => extension.id)).size !== extensions.length || extensions.some(extension => !expected.includes(extension.id))) throw new Error('Blueprint extension registry mismatch.');
    this.restart();
  }

  restart(): void {
    if (this.disposed) throw new Error('Blueprint session is disposed.');
    this.simulation?.dispose?.();
    for (const extension of this.instances) extension.dispose?.();
    this.clock.reset(); this.events = []; this.pendingEvents = []; this.restarts += 1;
    const context: BlueprintContext = { blueprint: this.blueprint, random: new SeededRandom(this.blueprint.seed), emit: event => {
      if (this.events.length < 256) this.events.push({ ...event });
      if (this.pendingEvents.length < 256) this.pendingEvents.push({ ...event });
    } };
    this.simulation = this.factory(context);
    this.instances = this.extensions.map(extension => extension.create({ ...context,
      snapshot: () => this.simulation.snapshot(),
      command: command => this.simulation.applyCommand?.(command) ?? false,
    }));
  }

  setPaused(paused: boolean): void { this.paused = paused; }
  advance(deltaMs: number, input: BlueprintInput): number {
    if (this.disposed || this.paused) return 0;
    return this.clock.advance(deltaMs, tick => {
      const step = tick.deltaMs / 1000;
      this.simulation.update(step, input);
      for (const extension of this.instances) extension.update?.(step, input);
      const events = this.pendingEvents; this.pendingEvents = [];
      for (const event of events) for (const extension of this.instances) extension.onEvent?.(event);
    });
  }
  drainEvents(): BlueprintEvent[] {
    const events = this.events; this.events = [];
    return events;
  }
  snapshot(): BlueprintSnapshot & { restartCount: number; frame: number } { return { ...this.simulation.snapshot(), restartCount: this.restarts, frame: this.clock.currentFrame }; }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true; this.simulation.dispose?.();
    for (const extension of this.instances) extension.dispose?.();
    this.instances = []; this.events = []; this.pendingEvents = [];
  }
}
