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

test('event bus unsubscribes listeners', () => {
  const bus = new EventBus();
  let calls = 0;
  const stop = bus.on('ready', () => { calls += 1; });
  bus.emit('ready', undefined);
  stop();
  bus.emit('ready', undefined);
  assert.equal(calls, 1);
});
