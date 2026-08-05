export interface PointerState {
  x: number; y: number; startX: number; startY: number; deltaX: number; deltaY: number;
  buttons: number; down: boolean; dragging: boolean; pointerId?: number; pointerType?: string;
}
export interface GestureState { tap: boolean; hold: boolean; drag: boolean; pinchScale: number; panX: number; panY: number; }
export interface ActionState { down: boolean; pressed: boolean; released: boolean; value: number; }
export interface InputContext { id: string; enabled?: boolean; blocksLower?: boolean; actions: ReadonlySet<string>; }
export interface InputManagerOptions { holdMs?: number; dragThreshold?: number; gamepadDeadZone?: number; now?: () => number; }

interface Binding { action: string; codes: Set<string>; contextId?: string; }

export class InputManager {
  private readonly bindings = new Map<string, Binding>();
  private readonly actions = new Map<string, ActionState>();
  private readonly contexts: InputContext[] = [];
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private enabled = true;
  private blocked = false;
  private pointerDownAt = 0;
  private previousPinchDistance = 0;
  private readonly now: () => number;
  readonly pointer: PointerState = { x: 0, y: 0, startX: 0, startY: 0, deltaX: 0, deltaY: 0, buttons: 0, down: false, dragging: false };
  readonly gestures: GestureState = { tap: false, hold: false, drag: false, pinchScale: 1, panX: 0, panY: 0 };

  private readonly onKeyDown = (event: Event) => {
    if (!this.enabled || this.blocked || !(event instanceof KeyboardEvent)) return;
    const binding = this.bindings.get(event.code); if (!binding || !this.isBindingActive(binding)) return;
    const state = this.state(binding.action); if (!state.down) state.pressed = true; state.down = true; state.value = 1;
  };
  private readonly onKeyUp = (event: Event) => {
    if (!(event instanceof KeyboardEvent)) return;
    const binding = this.bindings.get(event.code); if (!binding) return;
    const state = this.state(binding.action); if (state.down) state.released = true; state.down = false; state.value = 0;
  };
  private readonly onPointerDown = (event: Event) => {
    if (!this.enabled || this.blocked || !(event instanceof PointerEvent)) return;
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY }); this.pointerDownAt = this.now();
    Object.assign(this.pointer, { x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, deltaX: 0, deltaY: 0, buttons: event.buttons, down: true, dragging: false, pointerId: event.pointerId, pointerType: event.pointerType });
    this.updatePinch();
  };
  private readonly onPointerMove = (event: Event) => {
    if (!(event instanceof PointerEvent)) return;
    const previousX = this.pointer.x; const previousY = this.pointer.y;
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    this.pointer.x = event.clientX; this.pointer.y = event.clientY; this.pointer.deltaX += event.clientX - previousX; this.pointer.deltaY += event.clientY - previousY; this.pointer.buttons = event.buttons;
    const distance = Math.hypot(event.clientX - this.pointer.startX, event.clientY - this.pointer.startY);
    if (this.pointer.down && distance >= this.options.dragThreshold) this.pointer.dragging = this.gestures.drag = true;
    this.gestures.panX += event.clientX - previousX; this.gestures.panY += event.clientY - previousY; this.updatePinch();
  };
  private readonly onPointerUp = (event: Event) => {
    if (!(event instanceof PointerEvent)) return;
    this.pointers.delete(event.pointerId);
    if (this.pointer.down && !this.pointer.dragging && this.now() - this.pointerDownAt < this.options.holdMs) this.gestures.tap = true;
    this.pointer.down = false; this.pointer.dragging = false; this.pointer.buttons = event.buttons; this.previousPinchDistance = 0;
  };

  private readonly options: Required<Omit<InputManagerOptions, 'now'>>;
  constructor(private readonly target: EventTarget = globalThis.window, options: InputManagerOptions = {}) {
    if (!target) throw new Error('An input EventTarget is required');
    this.options = { holdMs: options.holdMs ?? 450, dragThreshold: options.dragThreshold ?? 8, gamepadDeadZone: options.gamepadDeadZone ?? 0.15 };
    this.now = options.now ?? (() => performance.now());
    target.addEventListener('keydown', this.onKeyDown); target.addEventListener('keyup', this.onKeyUp);
    target.addEventListener('pointerdown', this.onPointerDown); target.addEventListener('pointermove', this.onPointerMove);
    target.addEventListener('pointerup', this.onPointerUp); target.addEventListener('pointercancel', this.onPointerUp);
  }

  bind(action: string, codes: readonly string[], contextId?: string): void {
    this.unbind(action);
    const binding: Binding = { action, codes: new Set(codes), contextId };
    for (const code of codes) this.bindings.set(code, binding); this.state(action);
  }
  rebind(action: string, codes: readonly string[], contextId?: string): void { this.bind(action, codes, contextId); }
  unbind(action: string): void { for (const [code, binding] of this.bindings) if (binding.action === action) this.bindings.delete(code); this.actions.delete(action); }
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
    this.bindings.clear(); this.actions.clear(); this.contexts.length = 0; this.pointers.clear();
  }

  private state(action: string): ActionState { let state = this.actions.get(action); if (!state) { state = { down: false, pressed: false, released: false, value: 0 }; this.actions.set(action, state); } return state; }
  private isBindingActive(binding: Binding): boolean {
    if (!binding.contextId || !this.contexts.length) return true;
    for (let index = this.contexts.length - 1; index >= 0; index -= 1) {
      const context = this.contexts[index]!; if (context.enabled && context.id === binding.contextId && context.actions.has(binding.action)) return true;
      if (context.enabled && context.blocksLower) return false;
    }
    return false;
  }
  private applyGamepadValue(code: string, value: number): void {
    const binding = this.bindings.get(code); if (!binding || !this.isBindingActive(binding)) return;
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
