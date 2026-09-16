# Input

Bind physical controls to game actions and query actions inside the loop:

```ts
import { InputManager, gamepadAxisCode, gamepadButtonCode } from '@roost2d/input';

const input = new InputManager(window);
input.bind('move-left', ['ArrowLeft', 'KeyA']);
input.bind('confirm', ['Enter', 'Space', 'Gamepad0']);
input.bind('player-two-x', [gamepadAxisCode(0, 1)]);
input.bind('player-two-confirm', [gamepadButtonCode(0, 1)]);

input.update();
if (input.isDown('move-left')) player.move(-1);
if (input.consumePressed('confirm')) menu.confirm();
input.endFrame();
```

Legacy `Gamepad0` and `GamepadAxis0` bindings mean “any controller” and use the connected controller with the strongest absolute value for that control. Passing a browser gamepad index to the helpers produces qualified codes such as `Gamepad:1:Button:0` and isolates local players. Tests and non-window hosts can inject `getGamepads` in the manager options.

Contexts can block lower-priority controls while a modal or menu is active. Pointer input exposes tap, hold, drag, pan, and two-pointer pinch state. Rebinding replaces the action's old physical codes. Always dispose the manager to remove DOM listeners.
