# @roost2d/input

Named actions across keyboard, pointer/touch gestures, and gamepads, with rebinding and modal contexts.

```sh
npm install @roost2d/input
```

```ts
import { InputManager } from '@roost2d/input';
const input = new InputManager(window);
input.bind('confirm', ['Enter', 'Space', 'Gamepad0']);
```

Call `update()` before reading actions, `endFrame()` afterward, and `dispose()` to remove listeners. [Input guide](https://github.com/Roost2D/roost2d/blob/main/docs/input.md).
