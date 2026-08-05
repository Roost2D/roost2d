import assert from 'node:assert/strict';
import test from 'node:test';
import { InputManager } from '../dist/index.js';

class KeyboardEventMock extends Event { constructor(type, code) { super(type); this.code = code; } }
globalThis.KeyboardEvent = KeyboardEventMock;

test('action mappings report press, hold, release, and rebinding', () => {
  const target = new EventTarget(); const input = new InputManager(target);
  input.bind('move-left', ['KeyA']); target.dispatchEvent(new KeyboardEventMock('keydown', 'KeyA'));
  assert.equal(input.wasPressed('move-left'), true); assert.equal(input.isDown('move-left'), true);
  input.endFrame(); assert.equal(input.wasPressed('move-left'), false);
  target.dispatchEvent(new KeyboardEventMock('keyup', 'KeyA')); assert.equal(input.wasReleased('move-left'), true);
  input.rebind('move-left', ['ArrowLeft']); target.dispatchEvent(new KeyboardEventMock('keydown', 'KeyA')); assert.equal(input.isDown('move-left'), false);
  input.dispose();
});
