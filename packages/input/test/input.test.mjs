import assert from 'node:assert/strict';
import test from 'node:test';
import { InputManager } from '../dist/index.js';

class KeyboardEventMock extends Event { constructor(type, code) { super(type); this.code = code; } }
globalThis.KeyboardEvent = KeyboardEventMock;

class PointerEventMock extends Event {
  constructor(type, { pointerId = 1, clientX = 0, clientY = 0, buttons = 1, pointerType = 'touch' } = {}) {
    super(type);
    Object.assign(this, { pointerId, clientX, clientY, buttons, pointerType });
  }
}
globalThis.PointerEvent = PointerEventMock;

test('action mappings report press, hold, release, and rebinding', () => {
  const target = new EventTarget(); const input = new InputManager(target);
  input.bind('move-left', ['KeyA']); target.dispatchEvent(new KeyboardEventMock('keydown', 'KeyA'));
  assert.equal(input.wasPressed('move-left'), true); assert.equal(input.isDown('move-left'), true);
  input.endFrame(); assert.equal(input.wasPressed('move-left'), false);
  target.dispatchEvent(new KeyboardEventMock('keyup', 'KeyA')); assert.equal(input.wasReleased('move-left'), true);
  input.rebind('move-left', ['ArrowLeft']); target.dispatchEvent(new KeyboardEventMock('keydown', 'KeyA')); assert.equal(input.isDown('move-left'), false);
  input.dispose();
});

// B9 — bindings were keyed by code alone, so a second bind silently stole the key.
test('a code may be shared across contexts but not reused within one', () => {
  const input = new InputManager(new EventTarget());
  input.bind('jump', ['Space'], 'gameplay');
  input.bind('confirm', ['Space'], 'menu');
  assert.throws(() => input.bind('other', ['Space'], 'menu'), /already bound to confirm in context menu/);
  input.bind('shoot', ['KeyF']);
  assert.throws(() => input.bind('reload', ['KeyF']), /already bound to shoot/);
  input.unbind('confirm');
  input.bind('other', ['Space'], 'menu'); // free once the previous owner releases it
  input.dispose();
});

test('a conflicting rebind is transactional and preserves the previous mapping', () => {
  const target = new EventTarget(); const input = new InputManager(target);
  input.bind('jump', ['KeyJ']); input.bind('shoot', ['KeyF']);
  assert.throws(() => input.rebind('jump', ['KeyF']), /already bound to shoot/);
  target.dispatchEvent(new KeyboardEventMock('keydown', 'KeyJ'));
  assert.equal(input.isDown('jump'), true);
  input.dispose();
});

test('the top-most active context wins a shared code', () => {
  const target = new EventTarget(); const input = new InputManager(target);
  input.bind('jump', ['Space'], 'gameplay');
  input.bind('confirm', ['Space'], 'menu');
  input.pushContext({ id: 'gameplay', actions: new Set(['jump']) });
  target.dispatchEvent(new KeyboardEventMock('keydown', 'Space'));
  assert.equal(input.isDown('jump'), true);
  assert.equal(input.isDown('confirm'), false);
  target.dispatchEvent(new KeyboardEventMock('keyup', 'Space'));

  input.pushContext({ id: 'menu', actions: new Set(['confirm']), blocksLower: true });
  target.dispatchEvent(new KeyboardEventMock('keydown', 'Space'));
  assert.equal(input.isDown('confirm'), true);
  assert.equal(input.isDown('jump'), false, 'the blocked lower context must not also fire');
  input.dispose();
});

// B8 — deltas were diffed against whichever pointer moved last, and any pointerup cleared the drag.
test('a second finger does not hijack or cancel the primary pointer', () => {
  const target = new EventTarget(); const input = new InputManager(target, { dragThreshold: 5 });
  target.dispatchEvent(new PointerEventMock('pointerdown', { pointerId: 1, clientX: 100, clientY: 100 }));
  target.dispatchEvent(new PointerEventMock('pointermove', { pointerId: 1, clientX: 120, clientY: 100 }));
  assert.equal(input.pointer.dragging, true);
  assert.equal(input.pointer.deltaX, 20);

  // A second finger arrives far away; the primary delta must not jump to it.
  target.dispatchEvent(new PointerEventMock('pointerdown', { pointerId: 2, clientX: 400, clientY: 400 }));
  target.dispatchEvent(new PointerEventMock('pointermove', { pointerId: 2, clientX: 410, clientY: 400 }));
  assert.equal(input.pointer.deltaX, 20, 'the primary delta must ignore other pointers');
  assert.equal(input.pointer.x, 120);
  assert.equal(input.pointer.pointerId, 1);

  // Lifting the second finger must leave the primary drag intact.
  target.dispatchEvent(new PointerEventMock('pointerup', { pointerId: 2, clientX: 410, clientY: 400, buttons: 0 }));
  assert.equal(input.pointer.down, true, 'the primary drag survives another finger lifting');
  assert.equal(input.pointer.dragging, true);
  assert.equal(input.gestures.tap, false);
  input.dispose();
});

test('releasing the primary pointer promotes a finger that is still down', () => {
  const target = new EventTarget(); const input = new InputManager(target, { dragThreshold: 5 });
  target.dispatchEvent(new PointerEventMock('pointerdown', { pointerId: 1, clientX: 10, clientY: 10 }));
  target.dispatchEvent(new PointerEventMock('pointerdown', { pointerId: 2, clientX: 50, clientY: 50 }));
  target.dispatchEvent(new PointerEventMock('pointerup', { pointerId: 1, clientX: 10, clientY: 10, buttons: 0 }));
  assert.equal(input.pointer.pointerId, 2, 'the remaining finger becomes primary');
  assert.equal(input.pointer.down, true);
  assert.equal(input.pointer.buttons, 1, 'promotion preserves the remaining pointer buttons');
  assert.equal(input.pointer.startX, 50, 'the promoted pointer starts a fresh gesture');
  target.dispatchEvent(new PointerEventMock('pointerup', { pointerId: 2, clientX: 50, clientY: 50, buttons: 0 }));
  assert.equal(input.pointer.down, false);
  input.dispose();
});

test('hover movement is not tracked as a down pointer or pinch participant', () => {
  const target = new EventTarget(); const input = new InputManager(target);
  target.dispatchEvent(new PointerEventMock('pointermove', { pointerId: 99, clientX: 500, clientY: 500, buttons: 0, pointerType: 'mouse' }));
  assert.deepEqual({ x: input.pointer.x, y: input.pointer.y, buttons: input.pointer.buttons }, { x: 500, y: 500, buttons: 0 });
  assert.equal(input.pointer.down, false, 'hover position must not become an active pointer');
  assert.equal(input.pointerCount, 0, 'hover must not participate in gestures');
  target.dispatchEvent(new PointerEventMock('pointerdown', { pointerId: 1, clientX: 10, clientY: 10 }));
  target.dispatchEvent(new PointerEventMock('pointermove', { pointerId: 1, clientX: 20, clientY: 10 }));
  assert.equal(input.gestures.pinchScale, 1);
  target.dispatchEvent(new PointerEventMock('pointerup', { pointerId: 1, clientX: 20, clientY: 10, buttons: 0 }));
  assert.equal(input.pointer.down, false, 'the hover pointer must not be promoted after release');
  input.dispose();
});
