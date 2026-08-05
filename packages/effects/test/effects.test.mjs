import assert from 'node:assert/strict';
import test from 'node:test';
import { TimedEffect, fade, scalePop } from '../dist/index.js';

test('timed effects finish deterministically', () => {
  const values = []; const effect = new TimedEffect(100, (value) => values.push(value)); effect.reset();
  assert.equal(effect.update(40), false); assert.equal(effect.update(60), true); assert.equal(values.at(-1), 1);
});

test('generic visual helpers restore stable values', () => {
  const target = { x: 0, y: 0, alpha: 1, scaleX: 1, scaleY: 1 };
  const fading = fade(target, 0, 100); fading.reset(); fading.update(100); assert.equal(target.alpha, 0);
  const pop = scalePop(target, .5, 100); pop.reset(); pop.update(100); assert.equal(target.scaleX, 1);
});
