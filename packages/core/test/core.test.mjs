import assert from 'node:assert/strict';
import test from 'node:test';
import { EventBus, FixedStepClock, GameRuntime, Scheduler, SeededRandom } from '../dist/index.js';

test('fixed clock produces deterministic ticks', () => {
  const clock = new FixedStepClock(10);
  let ticks = 0;
  assert.equal(clock.advance(25, () => { ticks += 1; }), 2);
  assert.equal(ticks, 2);
});

test('runtime switches scenes and separates fixed/render updates', async () => {
  const calls = []; const runtime = new GameRuntime({ stepMs: 10 });
  runtime.registerScene('one', () => ({ id: 'one', load: () => calls.push('load'), enter: () => calls.push('enter'), fixedUpdate: () => calls.push('fixed'), render: () => calls.push('render'), exit: () => calls.push('exit') }));
  runtime.registerScene('two', () => ({ id: 'two', enter: () => calls.push('enter-two') }));
  await runtime.switchScene('one'); runtime.advance(25); await runtime.switchScene('two');
  assert.deepEqual(calls, ['load', 'enter', 'fixed', 'fixed', 'render', 'exit', 'enter-two']); await runtime.dispose();
});

test('scheduler and seeded random remain deterministic', () => {
  const scheduler = new Scheduler(); let calls = 0; scheduler.every(10, () => { calls += 1; }); scheduler.update(25); assert.equal(calls, 2);
  const a = new SeededRandom(42); const b = new SeededRandom(42); assert.deepEqual([a.next(), a.next(), a.next()], [b.next(), b.next(), b.next()]);
});

test('seeded random preserves the historical stream and stable checkpoint cursor', () => {
  let legacyState = 0x8fffffff;
  const legacyNext = () => {
    let value = legacyState += 0x6d2b79f5;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
  const random = new SeededRandom(0x8fffffff);
  for (let draw = 0; draw < 200_000; draw += 1) assert.equal(random.next(), legacyNext());
  assert.deepEqual(random.checkpoint(), { seed: 4259250175, draws: 3392 });
});

test('seeded random checkpoints survive JSON and millions of draws', () => {
  const random = new SeededRandom(123456);
  for (let draw = 0; draw < 5_000_000; draw += 1) random.next();
  const checkpoint = JSON.parse(JSON.stringify(random.checkpoint()));
  const restored = SeededRandom.fromCheckpoint(checkpoint);
  for (let draw = 0; draw < 100; draw += 1) assert.equal(restored.next(), random.next());
  assert.equal(restored.restore(restored.checkpoint()), restored);
});

test('seeded random rejects malformed checkpoints', () => {
  const random = new SeededRandom(1);
  for (const checkpoint of [
    { seed: -1, draws: 0 },
    { seed: 0x1_0000_0000, draws: 0 },
    { seed: 0, draws: -1 },
    { seed: 0, draws: 65_536 },
    { seed: 1.5, draws: 0 },
  ]) assert.throws(() => random.restore(checkpoint), /Invalid seeded random checkpoint/);
});

/** A frame driver that runs frames only when pumped, so scheduling is fully observable. */
function manualDriver() {
  const state = { requests: 0, cancels: 0, pending: new Map(), nextHandle: 1, time: 0 };
  const driver = {
    request(callback) { state.requests += 1; const handle = state.nextHandle++; state.pending.set(handle, callback); return handle; },
    cancel(handle) { state.cancels += 1; state.pending.delete(handle); },
    now: () => state.time
  };
  state.pump = (deltaMs = 16) => {
    state.time += deltaMs;
    const due = [...state.pending]; state.pending.clear();
    for (const [, callback] of due) callback(state.time);
    return due.length;
  };
  return { driver, state };
}

// B1 — the frame callback re-armed after advance() regardless of a stop() during the tick.
test('stop() from inside a fixed update actually stops the loop', async () => {
  const { driver, state } = manualDriver();
  const runtime = new GameRuntime({ stepMs: 10 });
  let ticks = 0;
  runtime.registerScene('one', () => ({ id: 'one', fixedUpdate: () => { ticks += 1; runtime.stop(); } }));
  await runtime.switchScene('one');
  runtime.start(driver);
  state.pump(16);
  assert.equal(ticks, 1);
  assert.equal(state.pump(16), 0, 'no further frame may be scheduled after stop()');
  assert.equal(ticks, 1);
  await runtime.dispose();
});

// A plain frameHandle re-check would leave two loops running here.
test('stop() then start() inside one frame leaves exactly one loop', async () => {
  const { driver, state } = manualDriver();
  const runtime = new GameRuntime({ stepMs: 10 });
  let restarted = false;
  runtime.registerScene('one', () => ({ id: 'one', fixedUpdate: () => { if (restarted) return; restarted = true; runtime.stop(); runtime.start(driver); } }));
  await runtime.switchScene('one');
  runtime.start(driver);
  state.pump(16);
  assert.equal(state.pending.size, 1, 'exactly one loop may be armed');
  assert.equal(state.pump(16), 1);
  assert.equal(state.pending.size, 1);
  await runtime.dispose();
});

// B11 — an in-flight switchScene used to repopulate loadedScenes after teardown.
test('dispose settles an in-flight scene switch instead of racing it', async () => {
  const runtime = new GameRuntime({ stepMs: 10 });
  let released;
  const gate = new Promise((resolve) => { released = resolve; });
  const exits = [];
  runtime.registerScene('slow', () => ({ id: 'slow', load: () => gate, exit: () => exits.push('exit') }));
  runtime.registerScene('after', () => ({ id: 'after' }));
  const switching = runtime.switchScene('slow');
  await new Promise((resolve) => setImmediate(resolve)); // the switch is now genuinely parked on load()
  const disposal = runtime.dispose();
  released();
  await switching;
  await disposal;
  assert.deepEqual(exits, ['exit'], 'dispose must tear down the scene the in-flight switch installed');
  await assert.rejects(runtime.switchScene('after'), /disposed/);
  assert.throws(() => runtime.start({ request: () => 1, cancel() {}, now: () => 0 }), /disposed/);
  await runtime.dispose();
});

test('event bus unsubscribes listeners', () => {
  const bus = new EventBus();
  let calls = 0;
  const stop = bus.on('ready', () => { calls += 1; });
  bus.emit('ready', undefined);
  stop();
  bus.emit('ready', undefined);
  assert.equal(calls, 1);
});
