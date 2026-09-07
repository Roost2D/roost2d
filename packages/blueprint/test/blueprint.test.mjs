import assert from 'node:assert/strict';
import test from 'node:test';
import { gameBlueprintSchema, BlueprintSession, blueprintJsonSchema } from '../dist/index.js';

const fixture = () => ({ schemaVersion: '1', title: 'Reference', tagline: 'Keep the beacon lit.', seed: 73, foundation: 'action', presentation: { projection: 'top-down', orientation: 'any' }, theme: { kit: 'woodland', biome: 'forest', timeOfDay: 'dusk', accent: '#ffca85', player: 'fox', enemy: 'slime', collectible: 'crystal' }, world: { width: 960, height: 640 }, player: { movement: 'free', speed: 240, jumpHeight: 130 }, rules: { goal: 'survive', target: 8, durationSeconds: 45, lives: 5, difficulty: 'normal' }, combat: { enemySpeed: 50, damage: 2, spawnSeconds: 1.5, towerCost: 10 }, feel: { particles: true, shake: true, audio: true }, controls: { primary: 'Space', secondary: 'ShiftLeft', touch: 'stick-actions' }, assets: [], extensions: [], decisions: [] });
test('canonical schema rejects incompatible mechanics, traversal and duplicate identities', () => {
  assert.equal(gameBlueprintSchema.parse(fixture()).foundation, 'action');
  assert.ok(blueprintJsonSchema.properties.foundation);
  for (const change of [b => b.presentation.projection = 'side', b => b.player.movement = 'platform', b => b.rules.goal = 'defend', b => b.controls.touch = 'placement', b => b.assets.push({ id: 'hero', role: 'player', path: 'public/assets/../bad.png' }), b => b.extensions.push(...[1, 2].map(() => ({ id: 'dash', path: 'src/extensions/dash.ts' })))]) {
    const b = fixture(); change(b); assert.equal(gameBlueprintSchema.safeParse(b).success, false);
  }
});
test('sessions replay a seed, pause, and reset extension lifecycle', () => {
  const blueprint = fixture(); blueprint.extensions.push({ id: 'example', path: 'src/extensions/example.ts' });
  let starts = 0, disposals = 0;
  const factory = context => { let x = context.random.next(); return { update(dt, input) { x += dt * input.x; }, snapshot: () => ({ player: { x, y: 0 }, objective: 'Move', progression: x, terminalState: 'playing', actions: { move: x } }) }; };
  const extensions = [{ id: 'example', create() { starts++; return { dispose() { disposals++; } }; } }];
  const session = new BlueprintSession(blueprint, factory, extensions), initial = session.snapshot().player;
  const input = { x: 1, y: 0, primary: false, secondary: false };
  session.advance(1000 / 60, input); assert.notDeepEqual(session.snapshot().player, initial);
  session.setPaused(true); const paused = session.snapshot(); session.advance(100, input); assert.deepEqual(session.snapshot(), paused);
  session.restart(); assert.deepEqual(session.snapshot().player, initial); assert.equal(starts, 2); assert.equal(disposals, 1);
  session.dispose(); session.dispose(); assert.equal(disposals, 2);
  assert.throws(() => new BlueprintSession(blueprint, factory), /registry mismatch/);
});
test('art overrides and compiled extension modules are unambiguous', () => {
  const b = fixture();
  b.assets = ['one', 'two'].map(id => ({ id, role: 'player', path: `public/assets/${id}.png` }));
  assert.equal(gameBlueprintSchema.safeParse(b).success, false);
  b.assets = [];
  b.extensions = ['one', 'two'].map(id => ({ id, path: 'src/extensions/shared.ts' }));
  assert.equal(gameBlueprintSchema.safeParse(b).success, false);
});
test('extension commands and event hooks are deterministic without rendering', () => {
  const blueprint = fixture(); blueprint.extensions = [{ id: 'boost', path: 'src/extensions/boost.ts' }];
  const factory = context => { let progress = 0; return {
    update() { context.emit({ type: 'tick', x: 0, y: 0 }); },
    applyCommand(command) { if (command.type !== 'boost') return false; progress++; return true; },
    snapshot: () => ({ player: { x: progress, y: 0 }, objective: 'Move', progression: progress, terminalState: 'playing', actions: {} }),
  }; };
  const extension = { id: 'boost', create: context => ({ onEvent(event) { if (event.type === 'tick') context.command({ type: 'boost' }); } }) };
  const a = new BlueprintSession(blueprint, factory, [extension]), b = new BlueprintSession(blueprint, factory, [extension]);
  const input = { x: 0, y: 0, primary: false, secondary: false };
  for (let i = 0; i < 10; i++) { a.advance(1000 / 60, input); a.drainEvents(); b.advance(1000 / 60, input); }
  assert.deepEqual(a.snapshot(), b.snapshot()); assert.equal(a.snapshot().progression, 10);
});
