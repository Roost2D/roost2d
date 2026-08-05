# Scenes and fixed updates

Scenes have explicit load, enter, fixed-update, render, exit, and dispose phases. Loading happens once; entering and exiting may happen many times.

```ts
runtime.registerScene('level', async () => ({
  id: 'level',
  async load({ services }) { await services.get<LevelAssets>('assets').load(); },
  enter({ scheduler }) { scheduler.after(500, spawnFirstWave); },
  fixedUpdate({ deltaMs }) { simulation.step(deltaMs); },
  render(_deltaMs, alpha) { view.draw(simulation, alpha); },
  exit() { simulation.pause(); },
  dispose() { view.destroy(); },
}));
```

Systems run before the active scene. Plugins install once into the shared context. Pausing stops fixed updates but keeps rendering, which is useful for pause menus and responsive overlays.
