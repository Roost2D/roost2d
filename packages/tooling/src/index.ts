import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, realpath, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, relative, resolve, sep } from 'node:path';
import sharp from 'sharp';
import type { AssetFileV1, AssetManifestV1, AssetVariantV1, AtlasFrameV1, AtlasManifestV1, RightsManifestV1 } from '@roost2d/contracts';
import { isSha256SRI, validateAnimationClip, validateAssetManifest, validateAtlasManifest, validateRigDefinition, validateRightsManifest } from '@roost2d/contracts';

export type JsonReadResult = { ok: true; value: unknown } | { ok: false; errors: string[] };

/** Reads and parses JSON without ever handing a malformed value to a validator. */
export async function readJsonFile(path: string): Promise<JsonReadResult> {
  let text: string;
  try { text = await readFile(path, 'utf8'); } catch { return { ok: false, errors: [`missing or unreadable file: ${path}`] }; }
  try { return { ok: true, value: JSON.parse(text) as unknown }; } catch (error) { return { ok: false, errors: [`invalid JSON in ${path}: ${(error as Error).message}`] }; }
}

export interface InventoryEntry { path: string; bytes: number; sha256: string; }
export interface ImageInspection extends InventoryEntry { width: number; height: number; alpha: boolean; pixelsSha256: string; }
export function sha256Hex(bytes: Uint8Array): string { return createHash('sha256').update(bytes).digest('hex'); }
export function sha256SRI(bytes: Uint8Array): string { return `sha256-${createHash('sha256').update(bytes).digest('base64')}`; }

export interface PixiAtlasImportOptions { profile: string; imagePath?: string; }
export interface PixiAtlasImportResult { atlas: AtlasManifestV1; frames: ReadonlyMap<string, AtlasFrameV1>; }

/**
 * Imports Pixi's v7/v8 spritesheet JSON without depending on Pixi at runtime. The generated
 * contract keeps source extents, trim offsets, and rotation so browser adapters do not need to
 * guess how a packer represented a frame.
 */
export async function importPixiAtlas(atlasFile: string, options: PixiAtlasImportOptions): Promise<PixiAtlasImportResult> {
  const parsed = await readJsonFile(atlasFile);
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  const source = record(parsed.value, 'Pixi atlas');
  const rawFrames = record(source.frames, 'Pixi atlas frames');
  const meta = record(source.meta ?? {}, 'Pixi atlas metadata');
  const requestedImage = options.imagePath ?? meta.image;
  if (typeof requestedImage !== 'string' || !requestedImage) throw new Error('Pixi atlas requires meta.image or imagePath');
  const imagePath = await containedPath(dirname(resolve(atlasFile)), requestedImage);
  if (!imagePath) throw new Error(`Pixi atlas image escapes its directory: ${requestedImage}`);
  const [imageBytes, metadata] = await Promise.all([readFile(imagePath), sharp(imagePath).metadata()]);
  if (!metadata.width || !metadata.height) throw new Error(`Unable to inspect atlas image: ${imagePath}`);
  const frames = new Map<string, AtlasFrameV1>();
  for (const [id, rawFrame] of Object.entries(rawFrames)) {
    const entry = record(rawFrame, `Pixi frame ${id}`);
    const rect = record(entry.frame, `Pixi frame ${id}.frame`);
    const sourceSize = record(entry.sourceSize ?? rect, `Pixi frame ${id}.sourceSize`);
    const spriteSourceSize = entry.spriteSourceSize === undefined ? undefined : record(entry.spriteSourceSize, `Pixi frame ${id}.spriteSourceSize`);
    const x = number(rect.x, `${id}.frame.x`); const y = number(rect.y, `${id}.frame.y`); const width = number(rect.w ?? rect.width, `${id}.frame.width`); const height = number(rect.h ?? rect.height, `${id}.frame.height`);
    const sourceWidth = number(sourceSize.w ?? sourceSize.width, `${id}.sourceSize.width`); const sourceHeight = number(sourceSize.h ?? sourceSize.height, `${id}.sourceSize.height`);
    if (x < 0 || y < 0 || width <= 0 || height <= 0 || sourceWidth <= 0 || sourceHeight <= 0) throw new Error(`Pixi frame ${id} has invalid dimensions`);
    frames.set(id, {
      x, y, width, height, sourceWidth, sourceHeight,
      ...(spriteSourceSize ? { offsetX: number(spriteSourceSize.x, `${id}.spriteSourceSize.x`), offsetY: number(spriteSourceSize.y, `${id}.spriteSourceSize.y`) } : {}),
      ...(entry.rotated === true ? { rotated: true } : {}),
      ...(entry.trimmed === true ? { trimmed: true } : {})
    });
  }
  const atlas: AtlasManifestV1 = { schema: 'roost2d.atlas/v1', profile: options.profile, image: requestedImage.split('\\').join('/'), integrity: { algorithm: 'sha256', value: sha256SRI(imageBytes) }, width: metadata.width, height: metadata.height, frames: Object.fromEntries(frames) };
  const errors = validateAtlasManifest(atlas); if (errors.length) throw new Error(`Invalid imported Pixi atlas:\n${errors.join('\n')}`);
  return { atlas, frames };
}

export interface AssetManifestVariantInput extends Omit<AssetVariantV1, 'bytes' | 'integrity' | 'scale' | 'width' | 'height' | 'frame'> {
  scale?: number;
  frame?: AtlasFrameV1;
  /** Resolve the frame from a Pixi v7/v8 atlas JSON stored under the same manifest root. */
  atlas?: { file: string; frameId: string };
}
export interface AssetManifestFileInput extends Omit<AssetFileV1, 'variants'> { variants: AssetManifestVariantInput[]; }
export interface AssetManifestBuildConfig {
  root: string;
  version: string;
  generatedAt: string;
  rightsDocumentPath: string;
  profiles: AssetManifestV1['profiles'];
  files: AssetManifestFileInput[];
  bundles: AssetManifestV1['bundles'];
}

/** Builds an integrity-complete `roost2d.assets/v1` manifest from checked-in asset inputs. */
export async function buildAssetManifest(config: AssetManifestBuildConfig): Promise<AssetManifestV1> {
  if (!config || typeof config !== 'object') throw new Error('Asset manifest config is required');
  const root = resolve(config.root);
  const rightsPath = await containedPath(root, config.rightsDocumentPath);
  if (!rightsPath) throw new Error(`rightsDocumentPath escapes manifest root: ${config.rightsDocumentPath}`);
  const atlasCache = new Map<string, PixiAtlasImportResult>();
  const files: AssetFileV1[] = [];
  for (const input of config.files) {
    const variants: AssetVariantV1[] = [];
    for (const variant of input.variants) {
      const absolute = await containedPath(root, variant.path);
      if (!absolute) throw new Error(`${input.id}: asset path escapes manifest root: ${variant.path}`);
      const bytes = await readFile(absolute);
      const profile = config.profiles[variant.profile];
      if (!profile) throw new Error(`${input.id}: unknown profile ${variant.profile}`);
      let frame = variant.frame;
      if (variant.atlas) {
        const atlasPath = await containedPath(root, variant.atlas.file);
        if (!atlasPath) throw new Error(`${input.id}: atlas path escapes manifest root: ${variant.atlas.file}`);
        const cacheKey = `${atlasPath}\u0000${variant.profile}`;
        const imported = atlasCache.get(cacheKey) ?? await importPixiAtlas(atlasPath, { profile: variant.profile });
        atlasCache.set(cacheKey, imported); frame = imported.frames.get(variant.atlas.frameId);
        if (!frame) throw new Error(`${input.id}: missing Pixi atlas frame ${variant.atlas.frameId}`);
      }
      const dimensions = input.mediaType.startsWith('image/') ? await sharp(bytes).metadata() : undefined;
      variants.push({
        profile: variant.profile,
        path: variant.path,
        bytes: bytes.byteLength,
        integrity: { algorithm: 'sha256', value: sha256SRI(bytes) },
        scale: variant.scale ?? profile.scale,
        ...(dimensions?.width ? { width: dimensions.width } : {}),
        ...(dimensions?.height ? { height: dimensions.height } : {}),
        ...(variant.frameId ? { frameId: variant.frameId } : {}),
        ...(frame ? { frame } : {})
      });
    }
    files.push({ ...input, variants });
  }
  const manifest: AssetManifestV1 = { schema: 'roost2d.assets/v1', version: config.version, generatedAt: config.generatedAt, rightsDocumentSha256: sha256Hex(await readFile(rightsPath)), profiles: config.profiles, files, bundles: config.bundles };
  const errors = validateAssetManifest(manifest); if (errors.length) throw new Error(`Invalid generated asset manifest:\n${errors.join('\n')}`);
  return manifest;
}

/** Rights hashes for portable text sources use UTF-8 LF bytes, independent of checkout EOLs. */
export function sourceSha256Hex(bytes: Uint8Array, sourcePath: string): string {
  const canonical = /\.(?:json|txt|md|csv|xml|ya?ml)$/i.test(sourcePath)
    ? Buffer.from(Buffer.from(bytes).toString('utf8').replace(/\r\n?/g, '\n'), 'utf8')
    : bytes;
  return sha256Hex(canonical);
}

export async function createInventory(root: string): Promise<InventoryEntry[]> {
  const entries: InventoryEntry[] = [];
  for (const absolute of await walk(resolve(root))) { const bytes = await readFile(absolute); entries.push({ path: relative(root, absolute).split(sep).join('/'), bytes: bytes.byteLength, sha256: sha256Hex(bytes) }); }
  return entries.sort((a, b) => a.path.localeCompare(b.path));
}

export async function inspectImages(root: string): Promise<ImageInspection[]> {
  const result: ImageInspection[] = [];
  for (const absolute of (await walk(resolve(root))).filter((path) => /\.(?:png|jpe?g|webp)$/i.test(path))) {
    const bytes = await readFile(absolute); const image = sharp(bytes); const metadata = await image.metadata(); const pixels = await image.ensureAlpha().raw().toBuffer();
    if (!metadata.width || !metadata.height) throw new Error(`Cannot read image dimensions: ${absolute}`);
    result.push({ path: relative(root, absolute).split(sep).join('/'), bytes: bytes.byteLength, sha256: sha256Hex(bytes), width: metadata.width, height: metadata.height, alpha: metadata.hasAlpha ?? false, pixelsSha256: sha256Hex(pixels) });
  }
  return result.sort((a, b) => a.path.localeCompare(b.path));
}

export function findDuplicateImages(images: readonly ImageInspection[]): Array<{ pixelsSha256: string; paths: string[] }> {
  return [...images.reduce((groups, image) => { const paths = groups.get(image.pixelsSha256) ?? []; paths.push(image.path); groups.set(image.pixelsSha256, paths); return groups; }, new Map<string, string[]>())]
    .filter(([, paths]) => paths.length > 1).map(([pixelsSha256, paths]) => ({ pixelsSha256, paths }));
}

export async function verifyManifestFiles(manifest: unknown, assetRoot: string): Promise<string[]> {
  const errors = validateAssetManifest(manifest);
  if (errors.length) return errors; // Structural failure: never walk the filesystem with rejected data.
  const { files } = manifest as AssetManifestV1; const root = resolve(assetRoot);
  for (const file of files) for (const variant of file.variants) {
    const absolute = await containedPath(root, variant.path); if (!absolute) { errors.push(`${file.id}: path escapes asset root`); continue; }
    try { const [bytes, info] = await Promise.all([readFile(absolute), stat(absolute)]); if (info.size !== variant.bytes) errors.push(`${file.id}: expected ${variant.bytes} bytes, got ${info.size}`); const integrity = sha256SRI(bytes); if (!isSha256SRI(variant.integrity.value) || integrity !== variant.integrity.value) errors.push(`${file.id}: SHA-256 integrity mismatch`); } catch { errors.push(`${file.id}: missing ${variant.path}`); }
  }
  return errors;
}

export async function verifyRightsFiles(manifest: unknown, sourceRoot: string): Promise<string[]> {
  const errors = validateRightsManifest(manifest);
  if (errors.length) return errors; // Structural failure: never walk the filesystem with rejected data.
  const { assets, excludedPaths } = manifest as RightsManifestV1; const root = resolve(sourceRoot); const listed = new Set<string>();
  const excluded = new Set(excludedPaths.map((path) => path.replace(/^sources\//, '')));
  for (const asset of assets) {
    const path = asset.sourcePath.replace(/^sources\//, ''); listed.add(path);
    const absolute = await containedPath(root, path); if (!absolute) { errors.push(`${asset.id}: path escapes source root`); continue; }
    try { if (sourceSha256Hex(await readFile(absolute), asset.sourcePath) !== asset.sha256) errors.push(`${asset.id}: source SHA-256 mismatch`); } catch { errors.push(`${asset.id}: missing ${asset.sourcePath}`); }
  }
  for (const entry of await createInventory(root)) if (!listed.has(entry.path) && !excluded.has(entry.path)) errors.push(`unclassified source file: sources/${entry.path}`);
  return errors;
}

export interface AtlasSourceConfig { directory: string; prefix?: string; }
export interface AtlasProfileConfig { id: string; maxSize: number; scale: number; padding?: number; extrude?: number; powerOfTwo?: boolean; }
export interface AtlasBuildConfig { sources: AtlasSourceConfig[]; output: string; name: string; profiles: AtlasProfileConfig[]; rotation?: false; }
interface AtlasInput { id: string; path: string; width: number; height: number; bytes: Buffer; }
interface PackedItem { input: AtlasInput; x: number; y: number; width: number; height: number; outerWidth: number; outerHeight: number; }

export async function buildAtlases(config: AtlasBuildConfig, options: { dryRun?: boolean } = {}): Promise<Array<{ image: string; json: string; frames: number }>> {
  if (!config.sources.length || !config.profiles.length || !config.name) throw new Error('Atlas config requires sources, profiles, and name');
  const inputs: AtlasInput[] = [];
  for (const source of config.sources) for (const path of (await walk(resolve(source.directory))).filter((value) => /\.(?:png|jpe?g|webp)$/i.test(value))) {
    const metadata = await sharp(path).metadata(); if (!metadata.width || !metadata.height) throw new Error(`Unable to inspect ${path}`);
    const id = [source.prefix, relative(source.directory, path).replace(/\.[^.]+$/, '').split(sep).join('/')].filter(Boolean).join('/'); inputs.push({ id, path, width: metadata.width, height: metadata.height, bytes: await readFile(path) });
  }
  inputs.sort((a, b) => a.id.localeCompare(b.id)); const duplicate = inputs.find((input, index) => inputs.findIndex(({ id }) => id === input.id) !== index); if (duplicate) throw new Error(`Duplicate atlas id: ${duplicate.id}`);
  const outputs: Array<{ image: string; json: string; frames: number }> = [];
  for (const profile of config.profiles) {
    const pages = pack(inputs, profile); for (let index = 0; index < pages.length; index += 1) {
      const page = pages[index]!; const base = `${config.name}-${profile.id}-${String(index + 1).padStart(3, '0')}`; const imagePath = resolve(config.output, `${base}.png`); const jsonPath = resolve(config.output, `${base}.json`);
      if (!options.dryRun) {
        await mkdir(dirname(imagePath), { recursive: true }); const composites = await Promise.all(page.items.map(async (item) => {
          const extrude = profile.extrude ?? 0; let image = sharp(item.input.bytes).resize(item.width, item.height, { kernel: sharp.kernel.nearest }); if (extrude) image = image.extend({ top: extrude, bottom: extrude, left: extrude, right: extrude, extendWith: 'copy' });
          return { input: await image.png().toBuffer(), left: item.x - extrude, top: item.y - extrude };
        }));
        const png = await sharp({ create: { width: page.width, height: page.height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite(composites).png({ compressionLevel: 9, adaptiveFiltering: false, palette: false }).toBuffer();
        await writeFile(imagePath, png); const frames = Object.fromEntries(page.items.map((item) => [item.input.id, { x: item.x, y: item.y, width: item.width, height: item.height, sourceWidth: item.input.width, sourceHeight: item.input.height }]));
        const atlas: AtlasManifestV1 = { schema: 'roost2d.atlas/v1', profile: profile.id, image: basename(imagePath), integrity: { algorithm: 'sha256', value: sha256SRI(png) }, width: page.width, height: page.height, frames };
        await writeFile(jsonPath, `${JSON.stringify(atlas, null, 2)}\n`);
      }
      outputs.push({ image: imagePath, json: jsonPath, frames: page.items.length });
    }
  }
  return outputs;
}

export async function validateAtlasFiles(atlasFile: string): Promise<string[]> {
  const parsed = await readJsonFile(atlasFile);
  if (!parsed.ok) return parsed.errors;
  const errors = validateAtlasManifest(parsed.value);
  if (errors.length) return errors; // The image path is only trustworthy once the contract accepts it.
  const atlas = parsed.value as AtlasManifestV1;
  const imagePath = await containedPath(dirname(resolve(atlasFile)), atlas.image);
  if (!imagePath) return [`atlas image escapes the atlas directory: ${atlas.image}`];
  try { const [bytes, metadata] = await Promise.all([readFile(imagePath), sharp(imagePath).metadata()]); if (sha256SRI(bytes) !== atlas.integrity.value) errors.push('atlas image integrity mismatch'); if (metadata.width !== atlas.width || metadata.height !== atlas.height) errors.push('atlas image dimensions mismatch'); } catch { errors.push(`missing atlas image ${atlas.image}`); }
  return errors;
}

export async function validateRigFile(path: string): Promise<string[]> {
  const parsed = await readJsonFile(path);
  return parsed.ok ? validateRigDefinition(parsed.value) : parsed.errors;
}

export async function validateAnimationFile(path: string, rigPath?: string): Promise<string[]> {
  const parsed = await readJsonFile(path);
  if (!parsed.ok) return parsed.errors;
  let rig: unknown;
  if (rigPath) {
    const parsedRig = await readJsonFile(rigPath);
    if (!parsedRig.ok) return parsedRig.errors;
    const rigErrors = validateRigDefinition(parsedRig.value);
    if (rigErrors.length) return rigErrors;
    rig = parsedRig.value;
  }
  const clips = animationClips(parsed.value);
  if (!clips) return [`${path}: expected a clip, an array of clips, or { animations: [...] }`];
  return clips.flatMap((clip) => validateAnimationClip(clip, rig));
}

function animationClips(value: unknown): unknown[] | undefined {
  if (Array.isArray(value)) return value as unknown[];
  if (typeof value !== 'object' || value === null) return undefined;
  const animations = (value as { animations?: unknown }).animations;
  if (animations === undefined) return [value];
  return Array.isArray(animations) ? animations as unknown[] : undefined;
}
export function assertBudgets(label: string, actualBytes: number, maximumBytes: number): void { if (actualBytes > maximumBytes) throw new Error(`${label} is ${actualBytes} bytes; budget is ${maximumBytes} bytes`); }

export async function createProject(directory: string): Promise<void> {
  const root = resolve(directory); try { if ((await readdir(root)).length) throw new Error(`Project directory is not empty: ${root}`); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  await mkdir(resolve(root, 'src'), { recursive: true });
  await writeFile(resolve(root, 'package.json'), `${JSON.stringify({ name: basename(root), private: true, type: 'module', scripts: { dev: 'vite', build: 'vite build' }, dependencies: { '@roost2d/core': '^0.1.0', '@roost2d/pixi': '^0.1.0', 'pixi.js': '^8.0.0' }, devDependencies: { typescript: '^5.8.0', vite: '^8.0.0' } }, null, 2)}\n`);
  await writeFile(resolve(root, 'index.html'), '<div id="game"></div><script type="module" src="/src/main.ts"></script>\n');
  await writeFile(resolve(root, 'src/main.ts'), "import { GameRuntime } from '@roost2d/core';\nconst runtime = new GameRuntime();\nconsole.log('Roost2D ready', runtime);\n");
}

/** Ensures the Node-only package does not accidentally take a browser runtime dependency. */
export async function verifyToolingBoundary(sourceRoot: string): Promise<string[]> {
  const forbidden = [/from\s+['"]pixi\.js['"]/, /from\s+['"]gsap['"]/, /from\s+['"]@roost2d\/(?:pixi|rig2d)['"]/]; const findings: string[] = [];
  for (const entry of await createInventory(sourceRoot)) { if (!entry.path.endsWith('.ts')) continue; const source = await readFile(resolve(sourceRoot, entry.path), 'utf8'); if (forbidden.some((pattern) => pattern.test(source))) findings.push(`forbidden runtime import: ${entry.path}`); }
  return findings;
}
export async function verifyToolingPackageGraph(packageFile: string): Promise<string[]> {
  const manifest = JSON.parse(await readFile(packageFile, 'utf8')) as { dependencies?: Record<string, string>; peerDependencies?: Record<string, string>; optionalDependencies?: Record<string, string> }; const allowed = new Set(['@roost2d/contracts', 'sharp']); const findings: string[] = [];
  for (const group of [manifest.dependencies, manifest.peerDependencies, manifest.optionalDependencies]) for (const dependency of Object.keys(group ?? {})) if (!allowed.has(dependency)) findings.push(`tooling package dependency is not allowed: ${dependency}`); return findings;
}

function pack(inputs: AtlasInput[], profile: AtlasProfileConfig): Array<{ width: number; height: number; items: PackedItem[] }> {
  const padding = profile.padding ?? 2; const extrude = profile.extrude ?? 1; const pages: Array<{ width: number; height: number; items: PackedItem[] }> = []; let page = { x: padding + extrude, y: padding + extrude, rowHeight: 0, usedWidth: 1, usedHeight: 1, items: [] as PackedItem[] };
  const ordered = [...inputs].sort((a, b) => (b.height - a.height) || (b.width - a.width) || a.id.localeCompare(b.id));
  for (const input of ordered) {
    const width = Math.max(1, Math.round(input.width * profile.scale)); const height = Math.max(1, Math.round(input.height * profile.scale)); const outerWidth = width + padding * 2 + extrude * 2; const outerHeight = height + padding * 2 + extrude * 2;
    if (outerWidth > profile.maxSize || outerHeight > profile.maxSize) throw new Error(`${input.id} exceeds atlas size ${profile.maxSize}`);
    if (page.x + width + padding + extrude > profile.maxSize) { page.x = padding + extrude; page.y += page.rowHeight; page.rowHeight = 0; }
    if (page.y + height + padding + extrude > profile.maxSize) { pages.push(finishPage(page, profile)); page = { x: padding + extrude, y: padding + extrude, rowHeight: 0, usedWidth: 1, usedHeight: 1, items: [] }; }
    page.items.push({ input, x: page.x, y: page.y, width, height, outerWidth, outerHeight }); page.x += outerWidth; page.rowHeight = Math.max(page.rowHeight, outerHeight); page.usedWidth = Math.max(page.usedWidth, page.x); page.usedHeight = Math.max(page.usedHeight, page.y + height + padding + extrude);
  }
  if (page.items.length) pages.push(finishPage(page, profile)); return pages;
}
function finishPage(page: { usedWidth: number; usedHeight: number; items: PackedItem[] }, profile: AtlasProfileConfig) { const size = (value: number) => profile.powerOfTwo ? 2 ** Math.ceil(Math.log2(value)) : value; return { width: Math.min(profile.maxSize, size(page.usedWidth)), height: Math.min(profile.maxSize, size(page.usedHeight)), items: page.items }; }
async function walk(directory: string): Promise<string[]> { const result: string[] = []; for (const entry of await readdir(directory, { withFileTypes: true })) { const absolute = resolve(directory, entry.name); if (entry.isDirectory()) result.push(...await walk(absolute)); else if (entry.isFile()) result.push(absolute); } return result; }
function isInside(root: string, path: string): boolean { return path === root || path.startsWith(root + sep); }
function record(value: unknown, label: string): Record<string, unknown> { if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(`${label} must be an object`); return value as Record<string, unknown>; }
function number(value: unknown, label: string): number { if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${label} must be a finite number`); return value; }

/**
 * Resolves `relativePath` under `root` and returns it only when it is genuinely contained. A lexical
 * prefix test alone is not enough: a symlink or Windows junction inside the root can point anywhere,
 * so the candidate itself (including a final-file symlink) is canonicalised before the comparison.
 * Returns `undefined` — never a path — when containment cannot be established, so callers fail closed.
 */
async function containedPath(root: string, relativePath: string): Promise<string | undefined> {
  const absoluteRoot = resolve(root);
  const lexical = resolve(absoluteRoot, relativePath);
  if (!isInside(absoluteRoot, lexical)) return undefined;
  const realRoot = await realpath(absoluteRoot).catch(() => undefined);
  if (!realRoot) return undefined;
  const realCandidate = await realpath(lexical).catch(() => undefined);
  if (realCandidate) return isInside(realRoot, realCandidate) ? realCandidate : undefined;
  const realDirectory = await realpath(dirname(lexical)).catch(() => undefined);
  if (!realDirectory) return lexical; // Directory does not exist; the read below reports it as missing.
  const canonical = resolve(realDirectory, basename(lexical));
  return isInside(realRoot, canonical) ? canonical : undefined;
}
