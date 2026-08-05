# Input

Bind physical controls to game actions and query actions inside the loop:

```ts
const input = new InputManager(window);
input.bind('move-left', ['ArrowLeft', 'KeyA']);
input.bind('confirm', ['Enter', 'Space', 'Gamepad0']);

input.update();
if (input.isDown('move-left')) player.move(-1);
if (input.consumePressed('confirm')) menu.confirm();
input.endFrame();
```

Contexts can block lower-priority controls while a modal or menu is active. Pointer input exposes tap, hold, drag, pan, and two-pointer pinch state. Rebinding replaces the action's old physical codes. Always dispose the manager to remove DOM listeners.
