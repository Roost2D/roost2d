import { Application, Container, Graphics, ImageSource, Rectangle, Sprite, Texture, type ApplicationOptions, type PointData, type TextureSource } from 'pixi.js';
import type { AssetManifestResolver, LazyAssetLoader } from '@roost2d/assets';
import type { RigDisplayFactory, RigDisplayNode, RigRuntime } from '@roost2d/rig2d';
import type { AtlasFrameV1, TextureRef } from '@roost2d/contracts';
import { sampleProceduralEffect, type ProceduralEffectDescriptor } from '@roost2d/effects';

export interface PixiHostOptions extends Partial<ApplicationOptions> {
  mount: HTMLElement;
  resizeTo?: Window | HTMLElement;
  onContextLost?: (event: Event) => void;
  onContextRestored?: (event: Event) => void;
}

export class PixiApplicationHost {
  readonly app = new Application();
  private resizeObserver?: ResizeObserver;
  private readonly listeners: Array<() => void> = [];
  private constructor(readonly mount: HTMLElement) {}

  static async create(options: PixiHostOptions): Promise<PixiApplicationHost> {
    const host = new PixiApplicationHost(options.mount);
    const { mount, resizeTo, onContextLost, onContextRestored, ...applicationOptions } = options;
    await host.app.init({ antialias: true, autoDensity: true, resolution: globalThis.devicePixelRatio || 1, ...applicationOptions });
    mount.replaceChildren(host.app.canvas);
    if (resizeTo) host.observeResize(resizeTo);
    const canvas = host.app.canvas;
    if (onContextLost) { canvas.addEventListener('webglcontextlost', onContextLost); host.listeners.push(() => canvas.removeEventListener('webglcontextlost', onContextLost)); }
    if (onContextRestored) { canvas.addEventListener('webglcontextrestored', onContextRestored); host.listeners.push(() => canvas.removeEventListener('webglcontextrestored', onContextRestored)); }
    return host;
  }

  resize(width: number, height: number): void { this.app.renderer.resize(Math.max(1, width), Math.max(1, height)); }
  dispose(): void {
    this.resizeObserver?.disconnect();
    for (const remove of this.listeners.splice(0)) remove();
    this.app.destroy({ removeView: true }, { children: true, texture: false, textureSource: false });
  }

  private observeResize(target: Window | HTMLElement): void {
    if (target instanceof Window) {
      const resize = () => this.resize(target.innerWidth, target.innerHeight);
      target.addEventListener('resize', resize); this.listeners.push(() => target.removeEventListener('resize', resize)); resize(); return;
    }
    this.resizeObserver = new ResizeObserver(([entry]) => { if (entry) this.resize(entry.contentRect.width, entry.contentRect.height); });
    this.resizeObserver.observe(target);
  }
}

export interface LayerDefinition<Id extends string = string> { id: Id; order: number; sortable?: boolean; }

export class LayerStack<Id extends string = string> {
  readonly root = new Container();
  private readonly layers = new Map<Id, Container>();
  constructor(definitions: readonly LayerDefinition<Id>[]) {
    this.root.sortableChildren = true;
    for (const definition of definitions) {
      if (this.layers.has(definition.id)) throw new Error(`Duplicate layer: ${definition.id}`);
      const layer = new Container(); layer.label = definition.id; layer.zIndex = definition.order; layer.sortableChildren = definition.sortable ?? true;
      this.layers.set(definition.id, layer); this.root.addChild(layer);
    }
  }
  get(id: Id): Container { const layer = this.layers.get(id); if (!layer) throw new Error(`Unknown layer: ${id}`); return layer; }
  add(id: Id, child: Container): Container { this.get(id).addChild(child); return child; }
  remove(id: Id, child: Container): Container { this.get(id).removeChild(child); return child; }
  destroy(): void { this.root.destroy({ children: true }); this.layers.clear(); }
}

export interface CameraBounds { x: number; y: number; width: number; height: number; }

export class Camera2D {
  readonly container = new Container();
  private viewportWidth = 1;
  private viewportHeight = 1;
  private bounds?: CameraBounds;
  minZoom = 0.1;
  maxZoom = 8;

  setViewport(width: number, height: number): void { this.viewportWidth = Math.max(1, width); this.viewportHeight = Math.max(1, height); this.clamp(); }
  setBounds(bounds?: CameraBounds): void { this.bounds = bounds; this.clamp(); }
  setPosition(x: number, y: number): void { this.container.pivot.set(x, y); this.container.position.set(this.viewportWidth / 2, this.viewportHeight / 2); this.clamp(); }
  pan(deltaX: number, deltaY: number): void { this.setPosition(this.container.pivot.x + deltaX, this.container.pivot.y + deltaY); }
  setZoom(zoom: number, focusScreen?: PointData): void {
    const before = focusScreen ? this.screenToWorld(focusScreen) : undefined;
    const next = Math.max(this.minZoom, Math.min(this.maxZoom, zoom)); this.container.scale.set(next);
    if (before && focusScreen) {
      const after = this.screenToWorld(focusScreen);
      this.container.pivot.x += before.x - after.x; this.container.pivot.y += before.y - after.y;
    }
    this.clamp();
  }
  worldToScreen(point: PointData): PointData { return this.container.toGlobal(point); }
  screenToWorld(point: PointData): PointData { return this.container.toLocal(point); }
  follow(point: PointData, smoothing = 1): void {
    const amount = Math.max(0, Math.min(1, smoothing));
    this.setPosition(this.container.pivot.x + (point.x - this.container.pivot.x) * amount, this.container.pivot.y + (point.y - this.container.pivot.y) * amount);
  }
  private clamp(): void {
    this.container.position.set(this.viewportWidth / 2, this.viewportHeight / 2);
    if (!this.bounds) return;
    const halfWidth = this.viewportWidth / (2 * this.container.scale.x); const halfHeight = this.viewportHeight / (2 * this.container.scale.y);
    const minX = this.bounds.x + Math.min(halfWidth, this.bounds.width / 2); const maxX = this.bounds.x + Math.max(this.bounds.width - halfWidth, this.bounds.width / 2);
    const minY = this.bounds.y + Math.min(halfHeight, this.bounds.height / 2); const maxY = this.bounds.y + Math.max(this.bounds.height - halfHeight, this.bounds.height / 2);
    this.container.pivot.set(Math.max(minX, Math.min(maxX, this.container.pivot.x)), Math.max(minY, Math.min(maxY, this.container.pivot.y)));
  }
}

/** One decoded atlas page, shared by every frame texture cut out of it. */
interface AtlasPage { pending: Promise<TextureSource>; source?: TextureSource; bitmap?: ImageBitmap; refCount: number; }

/**
 * Resolves logical frame assets into cropped Pixi textures, sharing each atlas page source.
 *
 * Every texture is decoded from bytes `LazyAssetLoader` has already integrity-checked. The loader
 * deliberately never asks Pixi to fetch the URL itself: two independent requests let a host serve
 * clean bytes to the verifying one and hostile bytes to the rendering one, and the check would
 * still pass. Because these sources are outside Pixi's `Assets` cache, nothing else will collect
 * them — `unload`/`clear` own their teardown.
 */
export class PixiAssetLoader {
  private readonly textures = new Map<string, Texture>();
  private readonly pages = new Map<string, AtlasPage>();
  private readonly pageUrls = new Map<string, string>();

  constructor(private readonly resolver: AssetManifestResolver, private readonly integrityLoader: LazyAssetLoader) {
    if (!integrityLoader) throw new Error('PixiAssetLoader requires a LazyAssetLoader: textures are only built from integrity-checked bytes');
  }

  async load(assetId: string): Promise<Texture> {
    const resolved = this.resolver.resolve(assetId); const canonicalId = resolved.file.id;
    const existing = this.textures.get(canonicalId); if (existing) return existing;
    const url = resolved.url.href;
    const page = this.pages.get(url) ?? this.openPage(url, canonicalId);
    const source = await page.pending;
    const settled = this.textures.get(canonicalId); if (settled) return settled; // a concurrent load won the race
    const frame = resolved.variant.frame;
    const texture = new Texture(frame ? textureOptions(source, frame, resolved.variant.scale) : { source });
    texture.label = resolved.variant.frameId ?? canonicalId;
    page.refCount += 1; this.textures.set(canonicalId, texture); this.pageUrls.set(canonicalId, url);
    return texture;
  }

  unload(assetId: string): void {
    const resolved = this.tryResolve(assetId); if (!resolved) return;
    const canonicalId = resolved.file.id;
    const texture = this.textures.get(canonicalId); if (!texture) return;
    this.textures.delete(canonicalId); texture.destroy(false);
    const url = this.pageUrls.get(canonicalId); this.pageUrls.delete(canonicalId);
    this.integrityLoader.unload(canonicalId);
    if (url === undefined) return;
    const page = this.pages.get(url); if (!page) return;
    page.refCount -= 1;
    if (page.refCount <= 0) this.closePage(url, page);
  }

  async clear(): Promise<void> {
    // Settle in-flight decodes first so nothing is destroyed while it is still being built.
    await Promise.allSettled([...this.pages.values()].map((page) => page.pending));
    for (const texture of this.textures.values()) texture.destroy(false);
    this.textures.clear(); this.pageUrls.clear();
    for (const [url, page] of [...this.pages]) this.closePage(url, page);
    this.integrityLoader.clear();
  }

  private tryResolve(assetId: string) { try { return this.resolver.resolve(assetId); } catch { return undefined; } }

  private openPage(url: string, assetId: string): AtlasPage {
    // `pending` is assigned on the very next line; the cast keeps the page identity available to decode().
    const page: AtlasPage = { refCount: 0, pending: undefined as unknown as Promise<TextureSource> };
    page.pending = this.decode(assetId, page).catch((error: unknown) => { this.pages.delete(url); throw error; });
    this.pages.set(url, page);
    return page;
  }

  private async decode(assetId: string, page: AtlasPage): Promise<TextureSource> {
    const { bytes, asset } = await this.integrityLoader.load(assetId);
    const bitmap = await createImageBitmap(new Blob([bytes], { type: asset.file.mediaType }));
    let source: TextureSource;
    try { source = new ImageSource({ resource: bitmap, resolution: asset.variant.scale }); }
    catch (error) { bitmap.close(); throw error; }
    page.bitmap = bitmap; page.source = source;
    return source;
  }

  private closePage(url: string, page: AtlasPage): void {
    this.pages.delete(url);
    try { page.source?.destroy(); } finally { page.bitmap?.close(); }
  }
}

export class PixiRigNode implements RigDisplayNode {
  constructor(readonly display: Container) {}
  get x(): number { return this.display.x; } set x(value: number) { this.display.x = value; }
  get y(): number { return this.display.y; } set y(value: number) { this.display.y = value; }
  get rotation(): number { return this.display.rotation; } set rotation(value: number) { this.display.rotation = value; }
  get scaleX(): number { return this.display.scale.x; } set scaleX(value: number) { this.display.scale.x = value; }
  get scaleY(): number { return this.display.scale.y; } set scaleY(value: number) { this.display.scale.y = value; }
  get alpha(): number { return this.display.alpha; } set alpha(value: number) { this.display.alpha = value; }
  get visible(): boolean { return this.display.visible; } set visible(value: boolean) { this.display.visible = value; }
  get zIndex(): number { return this.display.zIndex; } set zIndex(value: number) { this.display.zIndex = value; }
  get tint(): number | undefined { return this.display instanceof Sprite ? this.display.tint : undefined; } set tint(value: number | undefined) { if (this.display instanceof Sprite) this.display.tint = value ?? 0xffffff; }
  get anchorX(): number | undefined { return this.display instanceof Sprite ? this.display.anchor.x : undefined; } set anchorX(value: number | undefined) { if (this.display instanceof Sprite && value !== undefined) this.display.anchor.x = value; }
  get anchorY(): number | undefined { return this.display instanceof Sprite ? this.display.anchor.y : undefined; } set anchorY(value: number | undefined) { if (this.display instanceof Sprite && value !== undefined) this.display.anchor.y = value; }
}

function textureOptions(source: TextureSource, frame: AtlasFrameV1, scale: number) {
  if (!(scale > 0)) throw new Error('Asset variant scale must be positive');
  const logical = (value: number) => value / scale;
  const pixiFrame = frame.rotated
    ? new Rectangle(logical(frame.x), logical(frame.y), logical(frame.height), logical(frame.width))
    : new Rectangle(logical(frame.x), logical(frame.y), logical(frame.width), logical(frame.height));
  const orig = new Rectangle(0, 0, frame.sourceWidth, frame.sourceHeight);
  const trim = frame.trimmed || frame.offsetX !== undefined || frame.offsetY !== undefined
    ? new Rectangle(frame.offsetX ?? 0, frame.offsetY ?? 0, logical(frame.width), logical(frame.height))
    : undefined;
  return { source, frame: pixiFrame, orig, trim, rotate: frame.rotated ? 2 : 0 };
}

/** Pixi display adapter for renderer-neutral RigRuntime. Textures must be preloaded. */
export class PixiRigFactory implements RigDisplayFactory {
  readonly root = new Container();
  private readonly derivedTextures = new Set<Texture>();
  constructor(private readonly textures: ReadonlyMap<string, Texture>) { this.root.sortableChildren = true; }
  createBone(id: string): PixiRigNode { const display = new Container(); display.label = id; display.sortableChildren = true; return new PixiRigNode(display); }
  createAttachment(id: string, texture: TextureRef): PixiRigNode {
    const resolved = this.textures.get(texture.frameId ? `${texture.assetId}#${texture.frameId}` : texture.assetId) ?? this.textures.get(texture.assetId);
    if (!resolved) throw new Error(`Rig texture is not preloaded: ${texture.assetId}${texture.frameId ? `#${texture.frameId}` : ''}`);
    const layoutScale = texture.layoutScale ?? 1;
    if (!Number.isFinite(layoutScale) || layoutScale <= 0) throw new Error('Rig texture layoutScale must be a positive finite number');
    const displayTexture = layoutScale === 1 ? resolved : this.deriveLayoutTexture(resolved, layoutScale);
    const display = new Sprite(displayTexture); display.label = id; return new PixiRigNode(display);
  }
  attach(parent: RigDisplayNode | undefined, child: RigDisplayNode): void { const parentDisplay = parent instanceof PixiRigNode ? parent.display : this.root; const childDisplay = child instanceof PixiRigNode ? child.display : undefined; if (!childDisplay) throw new Error('PixiRigFactory received a foreign display node'); parentDisplay.addChild(childDisplay); }
  destroy(node: RigDisplayNode): void {
    if (!(node instanceof PixiRigNode)) return;
    const texture = node.display instanceof Sprite ? node.display.texture : undefined;
    node.display.destroy({ children: false, texture: false, textureSource: false });
    if (texture && this.derivedTextures.delete(texture)) texture.destroy(false);
  }
  destroyRoot(): void {
    this.root.destroy({ children: true, texture: false, textureSource: false });
    for (const texture of this.derivedTextures) texture.destroy(false);
    this.derivedTextures.clear();
  }

  private deriveLayoutTexture(texture: Texture, layoutScale: number): Texture {
    const scaled = (rectangle: Rectangle) => new Rectangle(
      rectangle.x * layoutScale,
      rectangle.y * layoutScale,
      rectangle.width * layoutScale,
      rectangle.height * layoutScale,
    );
    const derived = new Texture({
      source: texture.source,
      frame: texture.frame.clone(),
      orig: scaled(texture.orig),
      trim: texture.trim ? scaled(texture.trim) : undefined,
      rotate: texture.rotate,
    });
    this.derivedTextures.add(derived);
    return derived;
  }
}

/** Pixi renderer for the generic deterministic effect descriptors. */
export class PixiProceduralEffect {
  readonly display = new Container();
  private graphic?: Graphics;
  private sampleDescriptor: ProceduralEffectDescriptor;
  private baseX = 0;
  private baseY = 0;
  private baseRotation = 0;
  private baseScaleX = 1;
  private baseScaleY = 1;
  private followOrigin?: { source: Container; root: Container; x: number; y: number; rotation: number };

  constructor(readonly descriptor: ProceduralEffectDescriptor, parent: Container | PixiRigNode) {
    this.sampleDescriptor = descriptor;
    (parent instanceof PixiRigNode ? parent.display : parent).addChild(this.display);
    this.graphic = new Graphics(); this.display.addChild(this.graphic);
    this.draw();
    this.sample(0);
  }

  /**
   * Creates an effect at its authored rig origin. Detached effects are immediately reparented while
   * preserving the release transform, so later recoil or recovery cannot drag a projectile.
   */
  static fromRig(descriptor: ProceduralEffectDescriptor, rig: RigRuntime, effectRoot: Container): PixiProceduralEffect {
    const origin = descriptor.origin ?? { target: 'socket' as const, targetId: 'weapon' };
    const node = rig.node(origin.target, origin.targetId);
    if (!(node instanceof PixiRigNode)) throw new Error(`Effect origin is unavailable in the Pixi rig: ${origin.target}:${origin.targetId}`);
    const effect = new PixiProceduralEffect(descriptor, effectRoot);
    effect.placeAtOrigin(node.display, effectRoot, origin.x ?? 0, origin.y ?? 0, origin.rotation ?? 0);
    if (descriptor.visual?.kind === 'attachment-clone') {
      const visualNode = rig.node('attachment', descriptor.visual.attachmentId);
      if (!(visualNode instanceof PixiRigNode) || !(visualNode.display instanceof Sprite)) throw new Error(`Attachment clone source is not a Pixi sprite: ${descriptor.visual.attachmentId}`);
      effect.useAttachmentClone(visualNode.display);
    }
    if (descriptor.space === 'follow') effect.followOrigin = { source: node.display, root: effectRoot, x: origin.x ?? 0, y: origin.y ?? 0, rotation: origin.rotation ?? 0 };
    effect.captureBase();
    const target = descriptor.trajectory?.targetOffset;
    if (target) {
      const targetX = target.x * (rig.isMirrored ? -1 : 1);
      const delta = { x: targetX - effect.baseX, y: target.y - effect.baseY };
      effect.sampleDescriptor = { ...descriptor, trajectory: { ...descriptor.trajectory!, targetOffset: delta }, distance: Math.hypot(delta.x, delta.y) };
      if (descriptor.kind === 'beam') {
        effect.baseRotation = Math.atan2(delta.y, delta.x);
        effect.redrawBeam(Math.hypot(delta.x, delta.y));
      }
    }
    effect.sample(0);
    return effect;
  }

  sample(elapsedMs: number): boolean {
    if (this.followOrigin) {
      this.placeAtOrigin(this.followOrigin.source, this.followOrigin.root, this.followOrigin.x, this.followOrigin.y, this.followOrigin.rotation);
      this.captureBase();
    }
    const frame = sampleProceduralEffect(this.sampleDescriptor, elapsedMs);
    const exactClone = this.descriptor.visual?.kind === 'attachment-clone';
    this.display.alpha = exactClone ? (frame.complete ? 0 : 1) : frame.alpha;
    const sampledScale = exactClone ? 1 : frame.scale;
    this.display.scale.set(this.baseScaleX * sampledScale, this.baseScaleY * sampledScale);
    this.display.x = this.baseX + frame.offsetX;
    this.display.y = this.baseY + frame.offsetY;
    this.display.rotation = this.baseRotation + frame.rotation;
    return frame.complete;
  }

  destroy(): void { this.display.destroy({ children: true }); }

  private draw(): void {
    if (!this.graphic) return;
    const color = this.descriptor.color;
    const secondary = this.descriptor.secondaryColor ?? 0xffffff;
    const length = this.descriptor.length ?? 120;
    const width = this.descriptor.width ?? 8;
    const radius = this.descriptor.radius ?? 18;
    if (this.descriptor.kind === 'beam') {
      this.graphic.rect(0, -width / 2, length, width).fill({ color, alpha: 0.78 });
      this.graphic.rect(0, -width / 6, length, width / 3).fill({ color: secondary, alpha: 0.95 });
    } else if (this.descriptor.kind === 'slash') {
      this.graphic.arc(0, 0, radius * 2, -0.8, 0.8).stroke({ color, width, alpha: 0.9 });
    } else if (this.descriptor.kind === 'projectile') {
      this.graphic.circle(0, 0, radius).fill({ color }).stroke({ color: secondary, width: Math.max(2, width / 3) });
    } else if (this.descriptor.kind === 'burst') {
      this.graphic.circle(0, 0, radius).stroke({ color, width });
      this.graphic.circle(0, 0, radius * 0.45).fill({ color: secondary, alpha: 0.7 });
    } else {
      this.graphic.roundRect(-length * 0.5, -width * 0.5, length, width, width * 0.5).fill({ color, alpha: 0.55 });
    }
  }

  private redrawBeam(length: number): void {
    if (this.descriptor.kind !== 'beam' || !this.graphic) return;
    this.graphic.clear();
    const width = this.descriptor.width ?? 8;
    this.graphic.rect(0, -width / 2, length, width).fill({ color: this.descriptor.color, alpha: .78 });
    this.graphic.rect(0, -width / 6, length, width / 3).fill({ color: this.descriptor.secondaryColor ?? 0xffffff, alpha: .95 });
  }

  private useAttachmentClone(source: Sprite): void {
    this.graphic?.destroy(); this.graphic = undefined;
    const clone = new Sprite(source.texture);
    clone.anchor.copyFrom(source.anchor);
    clone.tint = source.tint;
    clone.alpha = source.alpha;
    clone.blendMode = source.blendMode;
    this.display.addChild(clone);
  }

  private captureBase(): void {
    this.baseX = this.display.x; this.baseY = this.display.y; this.baseRotation = this.display.rotation;
    this.baseScaleX = this.display.scale.x; this.baseScaleY = this.display.scale.y;
  }

  /** Places an effect in effect-root space using freshly sampled transforms from the rig tree. */
  private placeAtOrigin(source: Container, effectRoot: Container, x: number, y: number, rotation: number): void {
    const relative = source.getGlobalTransform();
    relative.prepend(effectRoot.getGlobalTransform().invert());
    // The calibrated point is expressed in the source attachment/socket's local axes.
    relative.tx += relative.a * x + relative.c * y;
    relative.ty += relative.b * x + relative.d * y;
    this.display.setFromMatrix(relative);
    this.display.rotation += rotation;
  }
}
