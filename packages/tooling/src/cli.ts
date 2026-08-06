#!/usr/bin/env node
import { writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import {
  buildAssetManifest, buildAtlases, createInventory, createProject, findDuplicateImages, inspectImages, readJsonFile,
  validateAnimationFile, validateAtlasFiles, validateRigFile, verifyManifestFiles,
  verifyRightsFiles, verifyToolingBoundary, verifyToolingPackageGraph, type AssetManifestBuildConfig, type AtlasBuildConfig
} from './index.js';

const [area, action, ...args] = process.argv.slice(2);

if (area === 'assets' && (action === 'scan' || action === 'inventory')) {
  const [directory, output = 'asset-inventory.json'] = args; requireValue(directory, 'roost2d assets scan <directory> [output]');
  const images = await inspectImages(resolve(directory)); await writeJson(output, { files: await createInventory(resolve(directory)), images, duplicates: findDuplicateImages(images) });
} else if (area === 'assets' && action === 'validate') {
  const [manifestFile, assetRoot] = args; requireValue(manifestFile && assetRoot, 'roost2d assets validate <manifest.json> <asset-root>');
  fail(await verifyManifestFiles(await readJson(resolve(manifestFile)), resolve(assetRoot)));
} else if (area === 'assets' && action === 'manifest') {
  const [configFile, output = 'asset-manifest.json'] = args; requireValue(configFile, 'roost2d assets manifest <config.json> [output]');
  const config = await readJson(resolve(configFile)) as AssetManifestBuildConfig;
  await writeJson(output, await buildAssetManifest({ ...config, root: resolve(dirname(resolve(configFile)), config.root) }));
} else if (area === 'atlas' && action === 'build') {
  const [configFile] = args; requireValue(configFile, 'roost2d atlas build <config.json> [--dry-run]'); const config = await readJson(resolve(configFile)) as AtlasBuildConfig; console.log(JSON.stringify(await buildAtlases(config, { dryRun: args.includes('--dry-run') }), null, 2));
} else if (area === 'atlas' && action === 'validate') {
  const [atlasFile] = args; requireValue(atlasFile, 'roost2d atlas validate <atlas.json>'); fail(await validateAtlasFiles(resolve(atlasFile)));
} else if (area === 'rig' && action === 'validate') {
  const [rigFile] = args; requireValue(rigFile, 'roost2d rig validate <rig.json>'); fail(await validateRigFile(resolve(rigFile)));
} else if (area === 'animation' && action === 'validate') {
  const [animationFile, rigFile] = args; requireValue(animationFile, 'roost2d animation validate <animations.json> [rig.json]'); fail(await validateAnimationFile(resolve(animationFile), rigFile ? resolve(rigFile) : undefined));
} else if (area === 'licenses' && action === 'validate') {
  const [rightsFile, sourceRoot] = args; requireValue(rightsFile && sourceRoot, 'roost2d licenses validate <rights.json> <source-root>'); fail(await verifyRightsFiles(await readJson(resolve(rightsFile)), resolve(sourceRoot)));
} else if (area === 'project' && action === 'create') {
  const [directory] = args; requireValue(directory, 'roost2d project create <directory>'); await createProject(resolve(directory));
} else if (area === 'verify-boundary') {
  const [sourceRoot] = [action, ...args]; requireValue(sourceRoot, 'roost2d verify-boundary <source-root>'); fail(await verifyToolingBoundary(resolve(sourceRoot)));
} else if (area === 'verify-package-boundary') {
  const [packageFile] = [action, ...args]; requireValue(packageFile, 'roost2d verify-package-boundary <package.json>'); fail(await verifyToolingPackageGraph(resolve(packageFile)));
} else {
  throw new Error('commands: assets scan|inventory|validate|manifest, atlas build|validate, rig validate, animation validate, licenses validate, project create');
}

function requireValue(value: unknown, usage: string): asserts value { if (!value) throw new Error(`usage: ${usage}`); }
async function readJson(path: string): Promise<unknown> { const parsed = await readJsonFile(path); if (!parsed.ok) throw new Error(parsed.errors.join('\n')); return parsed.value; }
function fail(errors: string[]): void { if (errors.length) throw new Error(errors.join('\n')); }
async function writeJson(path: string, value: unknown): Promise<void> { await writeFile(resolve(path), `${JSON.stringify(value, null, 2)}\n`); }
