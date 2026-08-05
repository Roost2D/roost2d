import type { AssetBundleV1, AssetFileV1, AssetManifestV1, AssetProfileId, AssetVariantV1 } from '@roost2d/contracts';
import { validateAssetManifest } from '@roost2d/contracts';

export interface AssetResolverOptions {
  /** Required origin or path prefix. Config never supplies a production host by default. */
  baseUrl: string | URL;
  profile?: AssetProfileId;
}

export interface ResolvedAsset { file: AssetFileV1; variant: AssetVariantV1; url: URL; }

export class AssetCatalog {
  readonly files: ReadonlyMap<string, AssetFileV1>;
  readonly bundles: ReadonlyMap<string, AssetBundleV1>;
  constructor(readonly manifest: AssetManifestV1) {
    const errors = validateAssetManifest(manifest);
    if (errors.length) throw new Error(`Invalid asset manifest:\n${errors.join('\n')}`);
    const files = new Map<string, AssetFileV1>();
    for (const file of manifest.files) { files.set(file.id, file); for (const alias of file.aliases ?? []) files.set(alias, file); }
    this.files = files;
    this.bundles = new Map(manifest.bundles.map((bundle) => [bundle.id, bundle]));
  }
  file(id: string): AssetFileV1 | undefined { return this.files.get(id); }
  requireFile(id: string): AssetFileV1 { const file = this.file(id); if (!file) throw new Error(`Unknown asset: ${id}`); return file; }
  bundle(id: string): AssetBundleV1 | undefined { return this.bundles.get(id); }
  requireBundle(id: string): AssetBundleV1 { const bundle = this.bundle(id); if (!bundle) throw new Error(`Unknown asset bundle: ${id}`); return bundle; }
}

export class AssetManifestResolver {
  readonly catalog: AssetCatalog;
  readonly profile: AssetProfileId;
  readonly baseUrl: URL;

  constructor(readonly manifest: AssetManifestV1, options: AssetResolverOptions) {
    if (!options.baseUrl) throw new Error('baseUrl is required; asset manifests never choose a host implicitly');
    this.catalog = new AssetCatalog(manifest);
    this.baseUrl = resolveDirectoryUrl(options.baseUrl);
    this.profile = options.profile ?? 'default';
  }

  resolve(assetId: string): ResolvedAsset {
    const file = this.catalog.requireFile(assetId);
    const variant = file.variants.find((candidate) => candidate.profile === this.profile) ?? file.variants.find((candidate) => candidate.profile === 'default');
    if (!variant) throw new Error(`No ${this.profile} or default variant for asset: ${assetId}`);
    return { file, variant, url: new URL(variant.path, this.baseUrl) };
  }
  bundle(bundleId: string): AssetBundleV1 { return this.catalog.requireBundle(bundleId); }
}

export interface LoadedAsset { asset: ResolvedAsset; bytes: ArrayBuffer; fromCache: boolean; }
export interface AssetFailure { assetId: string; error: unknown; optional: boolean; }
export interface BundleLoadResult { assets: LoadedAsset[]; failures: AssetFailure[]; }
export interface AssetLoadProgress { loaded: number; total: number; assetId: string; failed: boolean; }
export interface AssetLoaderOptions { fetch?: typeof globalThis.fetch; onProgress?: (progress: AssetLoadProgress) => void; }

export class LazyAssetLoader {
  private readonly loaded = new Map<string, Promise<LoadedAsset>>();
  private readonly downloaded = new Map<string, Promise<ArrayBuffer>>();
  private readonly fetcher: typeof globalThis.fetch;
  private readonly onProgress?: (progress: AssetLoadProgress) => void;
  private readonly failures: AssetFailure[] = [];

  constructor(private readonly resolver: AssetManifestResolver, options: AssetLoaderOptions | typeof globalThis.fetch = {}) {
    const normalized = typeof options === 'function' ? { fetch: options } : options;
    const fetcher = normalized.fetch ?? globalThis.fetch;
    if (!fetcher) throw new Error('A fetch implementation is required to load assets');
    this.fetcher = fetcher; this.onProgress = normalized.onProgress;
  }

  load(assetId: string): Promise<LoadedAsset> {
    const canonicalId = this.resolver.resolve(assetId).file.id;
    const existing = this.loaded.get(canonicalId);
    if (existing) return existing.then((result) => ({ ...result, fromCache: true }));
    const pending = this.fetchAsset(canonicalId).catch((error) => { this.loaded.delete(canonicalId); throw error; });
    this.loaded.set(canonicalId, pending);
    return pending;
  }

  async loadBundle(bundleId: string): Promise<LoadedAsset[]> { return (await this.loadBundleDetailed(bundleId)).assets; }

  async loadBundleDetailed(bundleId: string): Promise<BundleLoadResult> {
    const bundle = this.resolver.bundle(bundleId);
    let completed = 0;
    const operations = bundle.items.map(async (item) => {
      try {
        const asset = await this.load(item.assetId);
        this.onProgress?.({ loaded: ++completed, total: bundle.items.length, assetId: item.assetId, failed: false });
        return { asset };
      } catch (error) {
        if (item.fallbackAssetId) {
          try {
            const asset = await this.load(item.fallbackAssetId);
            this.onProgress?.({ loaded: ++completed, total: bundle.items.length, assetId: item.assetId, failed: false });
            return { asset };
          } catch (fallbackError) { error = new AggregateError([error, fallbackError], `Asset and fallback failed: ${item.assetId}`); }
        }
        const failure = { assetId: item.assetId, error, optional: !item.required } satisfies AssetFailure;
        this.failures.push(failure);
        this.onProgress?.({ loaded: ++completed, total: bundle.items.length, assetId: item.assetId, failed: true });
        if (item.required) throw error;
        return { failure };
      }
    });
    const results = await Promise.all(operations);
    return { assets: results.flatMap((result) => result.asset ? [result.asset] : []), failures: results.flatMap((result) => result.failure ? [result.failure] : []) };
  }

  getFailures(): readonly AssetFailure[] { return this.failures; }
  isLoaded(assetId: string): boolean { return this.loaded.has(this.resolver.resolve(assetId).file.id); }
  unload(assetId: string): boolean { return this.loaded.delete(this.resolver.resolve(assetId).file.id); }
  clear(): void { this.loaded.clear(); this.downloaded.clear(); this.failures.length = 0; }

  private async fetchAsset(assetId: string): Promise<LoadedAsset> {
    const asset = this.resolver.resolve(assetId);
    const cacheKey = asset.url.href;
    const existingDownload = this.downloaded.get(cacheKey);
    const bytes = await (existingDownload ?? this.download(cacheKey, assetId));
    if (bytes.byteLength !== asset.variant.bytes) throw new Error(`Integrity preflight failed for ${assetId}: expected ${asset.variant.bytes} bytes, received ${bytes.byteLength}`);
    if (!(await hasExpectedSha256(bytes, asset.variant.integrity.value))) throw new Error(`SHA-256 integrity check failed for ${assetId}`);
    return { asset, bytes, fromCache: Boolean(existingDownload) };
  }

  private download(url: string, assetId: string): Promise<ArrayBuffer> {
    const pending = this.fetcher(url).then(async (response) => {
      if (!response.ok) throw new Error(`Failed to load ${assetId}: ${response.status} ${response.statusText}`);
      return response.arrayBuffer();
    }).catch((error) => { this.downloaded.delete(url); throw error; });
    this.downloaded.set(url, pending); return pending;
  }
}

export function selectAssetProfile(manifest: AssetManifestV1, maximumTextureSize: number, preferred: AssetProfileId = 'high'): AssetProfileId {
  const candidate = manifest.profiles[preferred];
  if (candidate && candidate.maxAtlasSize <= maximumTextureSize) return preferred;
  const compatible = Object.entries(manifest.profiles)
    .filter(([, profile]) => profile.maxAtlasSize <= maximumTextureSize)
    .sort(([, a], [, b]) => b.maxAtlasSize - a.maxAtlasSize);
  if (!compatible.length) throw new Error(`No asset profile supports maximum texture size ${maximumTextureSize}`);
  return compatible[0]![0];
}

export async function fetchAssetManifest(url: string | URL, fetcher: typeof globalThis.fetch = globalThis.fetch): Promise<AssetManifestV1> {
  if (!fetcher) throw new Error('A fetch implementation is required');
  const response = await fetcher(url);
  if (!response.ok) throw new Error(`Failed to load asset manifest: ${response.status} ${response.statusText}`);
  const manifest = await response.json() as AssetManifestV1;
  const errors = validateAssetManifest(manifest);
  if (errors.length) throw new Error(`Invalid asset manifest:\n${errors.join('\n')}`);
  return manifest;
}

async function hasExpectedSha256(bytes: ArrayBuffer, expected: string): Promise<boolean> {
  if (!globalThis.crypto?.subtle) throw new Error('Web Crypto is required for integrity validation');
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  const encoded = toBase64(new Uint8Array(digest));
  return `sha256-${encoded}` === expected;
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return globalThis.btoa(binary);
}

function resolveDirectoryUrl(value: string | URL): URL {
  const base = typeof value === 'string' && /^[a-z][a-z\d+.-]*:/i.test(value) ? new URL(value) : new URL(value, globalThis.location?.href ?? 'http://localhost/');
  if (!base.pathname.endsWith('/')) base.pathname += '/';
  return base;
}
