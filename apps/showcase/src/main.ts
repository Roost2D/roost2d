import { Application, Container, Graphics } from 'pixi.js';
import { AssetManifestResolver } from '@roost2d/assets';
import { FixedStepClock, SeededRandom } from '@roost2d/core';
import { browserMemoryBytes, Diagnostics } from '@roost2d/diagnostics';
import { scalePop } from '@roost2d/effects';
import { InputManager } from '@roost2d/input';
import { depthFor, gridToScreen, screenToCell, tileDiamond } from '@roost2d/isometric';
import { Camera2D, LayerStack } from '@roost2d/pixi';
import './style.css';

const canvasHost = document.querySelector<HTMLDivElement>('#canvas')!;
const status = document.querySelector<HTMLElement>('#status')!;
const summary = document.querySelector<HTMLElement>('#summary')!;
const form = document.querySelector<HTMLFormElement>('#asset-form')!;
const baseUrlInput = document.querySelector<HTMLInputElement>('#base-url')!;
const profileInput = document.querySelector<HTMLSelectElement>('#profile')!;
const fpsOutput = document.querySelector<HTMLElement>('#fps')!;
const tickOutput = document.querySelector<HTMLElement>('#ticks')!;
const tileOutput = document.querySelector<HTMLElement>('#tile')!;
const inputOutput = document.querySelector<HTMLElement>('#input-state')!;

void bootstrap();

async function bootstrap(): Promise<void> {
  const app = new Application();
  await app.init({ width: 640, height: 430, background: '#09111e', antialias: true, autoDensity: true, resolution: devicePixelRatio });
  canvasHost.append(app.canvas);

  const layers = new LayerStack([
    { id: 'ground', order: 0 },
    { id: 'actors', order: 10, sortable: true },
    { id: 'effects', order: 20 },
  ] as const);
  const camera = new Camera2D();
  camera.setViewport(640, 430); camera.setPosition(320, 210); camera.container.addChild(layers.root); app.stage.addChild(camera.container);

  const projection = { tileWidth: 78, tileHeight: 39, origin: { x: 320, y: 64 } };
  for (let y = 0; y < 7; y += 1) for (let x = 0; x < 7; x += 1) {
    const points = tileDiamond({ x, y }, projection).flatMap((point) => [point.x, point.y]);
    const color = (x + y) % 2 ? 0x162a3d : 0x122235;
    layers.get('ground').addChild(new Graphics().poly(points).fill({ color }).stroke({ color: 0x31506b, width: 1 }));
  }

  const actor = new Container(); actor.zIndex = depthFor({ x: 3, y: 3 });
  const shadow = new Graphics().ellipse(0, 13, 18, 7).fill({ color: 0x000000, alpha: 0.35 });
  const body = new Graphics().circle(0, 0, 16).fill({ color: 0xf2b84b }).stroke({ color: 0xffdc8a, width: 3 });
  const eye = new Graphics().circle(5, -4, 2.4).fill(0x152238);
  actor.addChild(shadow, body, eye); layers.get('actors').addChild(actor);

  const input = new InputManager(window);
  input.bind('left', ['ArrowLeft', 'KeyA']); input.bind('right', ['ArrowRight', 'KeyD']);
  input.bind('up', ['ArrowUp', 'KeyW']); input.bind('down', ['ArrowDown', 'KeyS']); input.bind('pulse', ['Space', 'Gamepad0']);
  const clock = new FixedStepClock(1000 / 60, 5); const random = new SeededRandom(20260804);
  const diagnostics = new Diagnostics(90, () => performance.now(), browserMemoryBytes);
  const position = { x: 3, y: 3 }; const previous = { ...position }; const target = { ...position };
  const effectTarget = { x: 0, y: 0, scaleX: 1, scaleY: 1 }; let pulse = scalePop(effectTarget, 0, 1); pulse.reset(); pulse.update(1);
  let ticks = 0;

  const chooseTarget = (x: number, y: number) => { target.x = Math.max(0, Math.min(6, x)); target.y = Math.max(0, Math.min(6, y)); };
  app.canvas.addEventListener('pointerdown', (event) => {
    const rect = app.canvas.getBoundingClientRect();
    const screen = { x: (event.clientX - rect.left) * 640 / rect.width, y: (event.clientY - rect.top) * 430 / rect.height };
    const world = camera.screenToWorld(screen); const cell = screenToCell(world, projection); chooseTarget(cell.x, cell.y);
  });

  app.ticker.add((ticker) => {
    diagnostics.beginFrame(); input.update();
    clock.advance(ticker.deltaMS, ({ deltaMs }) => {
      previous.x = position.x; previous.y = position.y;
      const keyboardX = Number(input.isDown('right')) - Number(input.isDown('left'));
      const keyboardY = Number(input.isDown('down')) - Number(input.isDown('up'));
      if (keyboardX || keyboardY) chooseTarget(target.x + keyboardX * deltaMs / 220, target.y + keyboardY * deltaMs / 220);
      const rate = Math.min(1, deltaMs / 130); position.x += (target.x - position.x) * rate; position.y += (target.y - position.y) * rate;
      if (input.consumePressed('pulse')) { pulse = scalePop(effectTarget, 0.42 + random.next() * 0.08, 260); pulse.reset(); inputOutput.textContent = 'Pulse effect triggered through the named input action.'; }
      pulse.update(deltaMs); ticks += 1;
    });
    const alpha = clock.alpha; const rendered = { x: previous.x + (position.x - previous.x) * alpha, y: previous.y + (position.y - previous.y) * alpha };
    const point = gridToScreen(rendered, projection); actor.position.set(point.x, point.y - 13); actor.scale.set(effectTarget.scaleX, effectTarget.scaleY); actor.zIndex = depthFor(rendered);
    input.endFrame(); const frameMs = diagnostics.endFrame(); diagnostics.set('fixedTicks', ticks);
    fpsOutput.textContent = frameMs > 0 ? (1000 / frameMs).toFixed(0) : '—'; tickOutput.textContent = String(ticks); tileOutput.textContent = `${Math.round(position.x)}, ${Math.round(position.y)}`;
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const baseUrl = baseUrlInput.value; const manifestUrl = new URL('runtime/manifest.json', baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);
      status.textContent = 'Loading manifest…'; const response = await fetch(manifestUrl);
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      const manifest = await response.json(); const resolver = new AssetManifestResolver(manifest, { baseUrl, profile: profileInput.value });
      summary.textContent = `${manifest.files.length} logical assets\n${manifest.bundles.length} lazy bundles\nprofile: ${resolver.profile}\nGPU budget: ${(manifest.profiles[resolver.profile].gpuBudgetBytes / 1048576).toFixed(0)} MiB`;
      status.textContent = 'Manifest validated. The host can now lazy-load a selected bundle.';
    } catch (error) { status.textContent = `Manifest unavailable: ${error instanceof Error ? error.message : String(error)}`; summary.textContent = ''; }
  });
}
