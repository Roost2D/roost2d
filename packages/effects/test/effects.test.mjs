import assert from 'node:assert/strict';
import test from 'node:test';
import { EffectPool, TimedEffect, Trail, fade, sampleProceduralEffect, scalePop } from '../dist/index.js';

test('timed effects finish deterministically', () => {
  const values = []; const effect = new TimedEffect(100, (value) => values.push(value)); effect.reset();
  assert.equal(effect.update(40), false); assert.equal(effect.update(60), true); assert.equal(values.at(-1), 1);
});

test('generic visual helpers restore stable values', () => {
  const target = { x: 0, y: 0, alpha: 1, scaleX: 1, scaleY: 1 };
  const fading = fade(target, 0, 100); fading.reset(); fading.update(100); assert.equal(target.alpha, 0);
  const pop = scalePop(target, .5, 100); pop.reset(); pop.update(100); assert.equal(target.scaleX, 1);
});

// B2 — update() looped forever because elapsedMs could never drop below a non-positive interval.
test('Trail rejects an interval that would spin forever', () => {
  for (const interval of [0, -1, NaN]) assert.throws(() => new Trail(interval, 4, () => ({ x: 0, y: 0, value: 0 })), /intervalMs must be positive/);
  for (const maximum of [0, -1, NaN]) assert.throws(() => new Trail(10, maximum, () => ({ x: 0, y: 0, value: 0 })), /maximumPoints must be positive/);
  const trail = new Trail(10, 2, () => ({ x: 1, y: 2, value: 'p' }));
  trail.update(35);
  assert.equal(trail.points.length, 2, 'the trail is capped at maximumPoints');
});

// B10 — the effects pool no longer collides with core's differently-shaped ObjectPool.
test('EffectPool recycles updatables under its own name', () => {
  let created = 0;
  const pool = new EffectPool(() => { created += 1; let age = 0; return { update(delta) { age += delta; return age >= 10; }, reset() { age = 0; } }; });
  const first = pool.acquire();
  assert.equal(pool.activeCount, 1);
  pool.update(10);
  assert.equal(pool.activeCount, 0, 'a finished effect returns itself to the pool');
  assert.equal(pool.acquire(), first, 'the released instance is reused');
  assert.equal(created, 1);
});

test('procedural effects sample deterministically on a caller-owned clock', () => {
  const descriptor = { id: 'egg', kind: 'projectile', durationMs: 400, color: 0xffffff, distance: 160 };
  assert.deepEqual(sampleProceduralEffect(descriptor, 200), sampleProceduralEffect(descriptor, 200));
  assert.equal(sampleProceduralEffect(descriptor, 200).offsetX, 80);
  assert.equal(sampleProceduralEffect(descriptor, 400).complete, true);
  assert.throws(() => sampleProceduralEffect({ ...descriptor, durationMs: 0 }, 0), /positive/);
});
