# @roost2d/input

Named actions across keyboard, pointer/touch gestures, and gamepads, with rebinding and modal contexts.

```sh
npm install @roost2d/input
```

```ts
import { InputManager, gamepadAxisCode, gamepadButtonCode } from '@roost2d/input';
const input = new InputManager(window);
input.bind('confirm', ['Enter', 'Space', 'Gamepad0']);
input.bind('player-two-move-x', [gamepadAxisCode(0, 1)]);
input.bind('player-two-dash', [gamepadButtonCode(0, 1)]);
```

Unqualified legacy codes such as `Gamepad0` and `GamepadAxis0` accept the strongest input from any controller. Qualified helpers isolate one browser gamepad by its `gamepad.index`. Call `update()` before reading actions, `endFrame()` afterward, and `dispose()` to remove listeners. [Input guide](https://github.com/Roost2D/roost2d/blob/main/docs/input.md).
