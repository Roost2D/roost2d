export interface PointerState {
  x: number; y: number; startX: number; startY: number; deltaX: number; deltaY: number;
  buttons: number; down: boolean; dragging: boolean; pointerId?: number; pointerType?: string;
}
export interface GestureState { tap: boolean; hold: boolean; drag: boolean; pinchScale: number; panX: number; panY: number; }
export interface ActionState { down: boolean; pressed: boolean; released: boolean; value: number; }
export interface InputContext { id: string; enabled?: boolean; blocksLower?: boolean; actions: ReadonlySet<string>; }
export interface InputManagerOptions { holdMs?: number; dragThreshold?: number; gamepadDeadZone?: number; now?: () => number; }

interface Binding { action: string; codes: Set<string>; contextId?: string; }
interface TrackedPointer { x: number; y: number; startX: number; startY: number; buttons: number; pointerType?: string; }

export class InputManager {
  /** Keyed by code; one entry per context, since the same key may mean different things per context. */
  private readonly bindings = new Map<string, Binding[]>();
  private readonly actions = new Map<string, ActionState>();
  private readonly contexts: InputContext[] = [];
  private readonly pointers = new Map<number, TrackedPointer>();
  /** The pointer the public `pointer`/gesture state follows; other fingers must not disturb it. */
  private primaryPointerId?: number;
  private enabled = true;
  private blocked = false;
  private pointerDownAt = 0;
  private previousPinchDistance = 0;
  private readonly now: () => number;
  readonly pointer: PointerState = { x: 0, y: 0, startX: 0, startY: 0, deltaX: 0, deltaY: 0, buttons: 0, down: false, dragging: false };
  readonly gestures: GestureState = { tap: false, hold: false, drag: false, pinchScale: 1, panX: 0, panY: 0 };

  private readonly onKeyDown = (event: Event) => {
    if (!this.enabled || this.blocked || !(event instanceof KeyboardEvent)) return;
    const binding = this.resolve(event.code); if (!binding) return;
    const state = this.state(binding.action); if (!state.down) state.pressed = true; state.down = true; state.value = 1;
  };
  private readonly onKeyUp = (event: Event) => {
    if (!(event instanceof KeyboardEvent)) return;
    // Release every binding for the code: a context change between down and up must not strand a key.
    for (const binding of this.bindings.get(event.code) ?? []) {
      const state = this.state(binding.action); if (state.down) state.released = true; state.down = false; state.value = 0;
    }
  };
  private readonly onPointerDown = (event: Event) => {
    if (!this.enabled || this.blocked || !(event instanceof PointerEvent)) return;
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, buttons: event.buttons, pointerType: event.pointerType });
    if (this.primaryPointerId === undefined) this.promotePrimary(event.pointerId);
    this.updatePinch();
  };
  private readonly onPointerMove = (event: Event) => {
    if (!(event instanceof PointerEvent)) return;
    const tracked = this.pointers.get(event.pointerId);
    if (!tracked) return; // Hover-only pointers are not active gesture participants.
    const previousX = tracked.x; const previousY = tracked.y;
    tracked.x = event.clientX; tracked.y = event.clientY; tracked.buttons = event.buttons;
    // Pan is a whole-surface gesture; the public pointer state tracks only the primary pointer.
    this.gestures.panX += event.clientX - previousX; this.gestures.panY += event.clientY - previousY;
    if (this.primaryPointerId === event.pointerId) {
      this.pointer.x = event.clientX; this.pointer.y = event.clientY; this.pointer.buttons = event.buttons;
      this.pointer.deltaX += event.clientX - previousX; this.pointer.deltaY += event.clientY - previousY;
      const distance = Math.hypot(event.clientX - this.pointer.startX, event.clientY - this.pointer.startY);
      if (this.pointer.down && distance >= this.options.dragThreshold) this.pointer.dragging = this.gestures.drag = true;
    }
    this.updatePinch();
  };
  private readonly onPointerUp = (event: Event) => {
    if (!(event instanceof PointerEvent)) return;
    this.pointers.delete(event.pointerId); this.previousPinchDistance = 0;
    if (this.primaryPointerId !== event.pointerId) return; // A second finger lifting must not cancel the primary drag.
    if (this.pointer.down && !this.pointer.dragging && this.now() - this.pointerDownAt < this.options.holdMs) this.gestures.tap = true;
    this.pointer.down = false; this.pointer.dragging = false; this.pointer.buttons = event.buttons; this.primaryPointerId = undefined;
    const [next] = this.pointers.keys();
    if (next !== undefined) this.promotePrimary(next); // A still-down finger continues the gesture.
  };

  private promotePrimary(pointerId: number): void {
    const tracked = this.pointers.get(pointerId); if (!tracked) return;
    this.primaryPointerId = pointerId; this.pointerDownAt = this.now();
    Object.assign(this.pointer, { x: tracked.x, y: tracked.y, startX: tracked.x, startY: tracked.y, deltaX: 0, deltaY: 0, buttons: tracked.buttons, down: true, dragging: false, pointerId, pointerType: tracked.pointerType });
  }

  private readonly options: Required<Omit<InputManagerOptions, 'now'>>;
  constructor(private readonly target: EventTarget = globalThis.window, options: InputManagerOptions = {}) {
    if (!target) throw new Error('An input EventTarget is required');
    this.options = { holdMs: options.holdMs ?? 450, dragThreshold: options.dragThreshold ?? 8, gamepadDeadZone: options.gamepadDeadZone ?? 0.15 };
    this.now = options.now ?? (() => performance.now());
    target.addEventListener('keydown', this.onKeyDown); target.addEventListener('keyup', this.onKeyUp);
    target.addEventListener('pointerdown', this.onPointerDown); target.addEventListener('pointermove', this.onPointerMove);
    target.addEventListener('pointerup', this.onPointerUp); target.addEventListener('pointercancel', this.onPointerUp);
  }

  /**
   * Binds `codes` to `action`. The same code may be bound in different input contexts; binding it
   * twice within one context is an error rather than a silent steal from the previous owner.
   */
  bind(action: string, codes: readonly string[], contextId?: string): void {
    const binding: Binding = { action, codes: new Set(codes), contextId };
    for (const code of binding.codes) {
      const existing = this.bindings.get(code) ?? [];
      const conflict = existing.find((candidate) => candidate.action !== action && candidate.contextId === contextId);
      if (conflict) throw new Error(`Input code ${code} is already bound to ${conflict.action}${contextId ? ` in context ${contextId}` : ''}`);
    }
    // Commit only after every code passes preflight so a failed rebind preserves the old mapping.
    this.unbind(action);
    for (const code of binding.codes) { const existing = this.bindings.get(code) ?? []; existing.push(binding); this.bindings.set(code, existing); }
    this.state(action);
  }
  rebind(action: string, codes: readonly string[], contextId?: string): void { this.bind(action, codes, contextId); }
  unbind(action: string): void {
    for (const [code, bindings] of this.bindings) {
      const remaining = bindings.filter((binding) => binding.action !== action);
      if (remaining.length) this.bindings.set(code, remaining); else this.bindings.delete(code);
    }
    this.actions.delete(action);
  }
  pushContext(context: InputContext): void { this.removeContext(context.id); this.contexts.push({ ...context, enabled: context.enabled ?? true }); }
  removeContext(id: string): boolean { const index = this.contexts.findIndex((context) => context.id === id); if (index < 0) return false; this.contexts.splice(index, 1); return true; }
  setEnabled(enabled: boolean): void { this.enabled = enabled; if (!enabled) this.releaseAll(); }
  setBlocked(blocked: boolean): void { this.blocked = blocked; if (blocked) this.releaseAll(); }
  isDown(action: string): boolean { return this.state(action).down; }
  wasPressed(action: string): boolean { return this.state(action).pressed; }
  wasReleased(action: string): boolean { return this.state(action).released; }
  value(action: string): number { return this.state(action).value; }
  consumePressed(action: string): boolean { const state = this.state(action); const pressed = state.pressed; state.pressed = false; return pressed; }

  update(): void {
    if (this.pointer.down && !this.pointer.dragging && this.now() - this.pointerDownAt >= this.options.holdMs) this.gestures.hold = true;
    const gamepads = globalThis.navigator?.getGamepads?.() ?? [];
    for (const gamepad of gamepads) if (gamepad) {
      for (let index = 0; index < gamepad.buttons.length; index += 1) this.applyGamepadValue(`Gamepad${index}`, gamepad.buttons[index]!.value);
      for (let index = 0; index < gamepad.axes.length; index += 1) this.applyGamepadValue(`GamepadAxis${index}`, Math.abs(gamepad.axes[index]!) >= this.options.gamepadDeadZone ? gamepad.axes[index]! : 0);
    }
  }
  endFrame(): void {
    for (const state of this.actions.values()) { state.pressed = false; state.released = false; }
    Object.assign(this.gestures, { tap: false, hold: false, drag: false, pinchScale: 1, panX: 0, panY: 0 });
    this.pointer.deltaX = 0; this.pointer.deltaY = 0;
  }
  dispose(): void {
    this.target.removeEventListener('keydown', this.onKeyDown); this.target.removeEventListener('keyup', this.onKeyUp);
    this.target.removeEventListener('pointerdown', this.onPointerDown); this.target.removeEventListener('pointermove', this.onPointerMove);
    this.target.removeEventListener('pointerup', this.onPointerUp); this.target.removeEventListener('pointercancel', this.onPointerUp);
    this.bindings.clear(); this.actions.clear(); this.contexts.length = 0; this.pointers.clear(); this.primaryPointerId = undefined;
  }

  private state(action: string): ActionState { let state = this.actions.get(action); if (!state) { state = { down: false, pressed: false, released: false, value: 0 }; this.actions.set(action, state); } return state; }
  /** Picks the active binding for a code, preferring the top-most context over a context-free one. */
  private resolve(code: string): Binding | undefined {
    const candidates = this.bindings.get(code); if (!candidates?.length) return undefined;
    let best: Binding | undefined; let bestRank = -2;
    for (const binding of candidates) {
      if (!this.isBindingActive(binding)) continue;
      const rank = binding.contextId ? this.contexts.findIndex((context) => context.id === binding.contextId) : -1;
      if (rank >= bestRank) { best = binding; bestRank = rank; }
    }
    return best;
  }
  private isBindingActive(binding: Binding): boolean {
    if (!binding.contextId || !this.contexts.length) return true;
    for (let index = this.contexts.length - 1; index >= 0; index -= 1) {
      const context = this.contexts[index]!; if (context.enabled && context.id === binding.contextId && context.actions.has(binding.action)) return true;
      if (context.enabled && context.blocksLower) return false;
    }
    return false;
  }
  private applyGamepadValue(code: string, value: number): void {
    const binding = this.resolve(code); if (!binding) return;
    const state = this.state(binding.action); const down = Math.abs(value) > this.options.gamepadDeadZone;
    if (down && !state.down) state.pressed = true; if (!down && state.down) state.released = true; state.down = down; state.value = value;
  }
  private updatePinch(): void {
    if (this.pointers.size !== 2) { this.previousPinchDistance = 0; return; }
    const [a, b] = [...this.pointers.values()]; const distance = Math.hypot(a!.x - b!.x, a!.y - b!.y);
    if (this.previousPinchDistance > 0) this.gestures.pinchScale *= distance / this.previousPinchDistance;
    this.previousPinchDistance = distance;
  }
  private releaseAll(): void { for (const state of this.actions.values()) { if (state.down) state.released = true; state.down = false; state.value = 0; } }
}

/** Backwards-compatible name for the initial action-map API. */
export class InputMap extends InputManager {}
