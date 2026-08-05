import assert from 'node:assert/strict';
import test from 'node:test';
import { isSha256SRI, validateAssetManifest, validateRightsManifest } from '../dist/index.js';

const sri = 'sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
const manifest = {
  schema: 'roost2d.assets/v1', version: '0.1.0', generatedAt: '1970-01-01T00:00:00.000Z', rightsDocumentSha256: 'a'.repeat(64),
  profiles: { default: { maxAtlasSize: 2048, scale: .5, gpuBudgetBytes: 64 } },
  files: [{ id: 'atlas.one', mediaType: 'image/png', aliases: ['one'], variants: [{ profile: 'default', path: 'runtime/atlas.png', bytes: 1, integrity: { algorithm: 'sha256', value: sri }, scale: .5 }] }],
  bundles: [{ id: 'core', lazy: false, items: [{ assetId: 'one', required: true }] }]
};

test('accepts exactly SHA-256 SRI values', () => {
  assert.equal(isSha256SRI(sri), true);
  assert.equal(isSha256SRI('sha256-short'), false);
});

test('validates aliases and relative asset paths', () => {
  assert.deepEqual(validateAssetManifest(manifest), []);
  assert.deepEqual(validateAssetManifest({ ...manifest, files: [{ ...manifest.files[0], license: 'PROPRIETARY-REPLACEMENT-PACK' }] }), []);
  assert.match(validateAssetManifest({ ...manifest, files: [{ ...manifest.files[0], variants: [{ ...manifest.files[0].variants[0], path: 'https://bad.example/a.png' }] }]}).join('\n'), /relative/);
});

test('validates simple Chikn community terms without a repository sublicense', () => {
  const rights = {
    schema: 'chikn-game-assets.rights/v1',
    version: '0.1.0-rc.0',
    generatedAt: '1970-01-01T00:00:00.000Z',
    assets: [{ id: 'rights/chikn/a', sourcePath: 'sources/chikn/a.png', category: 'character', license: 'CHIKN-COMMUNITY-NONCOMMERCIAL', ownership: 'third-party-chikn-rights-holder', commercialUse: 'separate-agreement-required', attribution: 'Chikn community assets', hostingAuthorized: true, communityUseAuthorized: true, sublicenseGrantedByRepository: false, sha256: 'a'.repeat(64) }],
    excludedPaths: [],
  };
  assert.deepEqual(validateRightsManifest(rights), []);
  assert.match(validateRightsManifest({ ...rights, assets: [{ ...rights.assets[0], sublicenseGrantedByRepository: true }] }).join('\n'), /sublicense/);
});
