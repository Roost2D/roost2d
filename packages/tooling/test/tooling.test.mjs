import assert from 'node:assert/strict';
import test from 'node:test';
import { resolve } from 'node:path';
import { verifyToolingBoundary, verifyToolingPackageGraph } from '../dist/index.js';

test('tooling source remains detached from browser runtime imports', async () => {
  assert.deepEqual(await verifyToolingBoundary(resolve('src')), []);
});

test('tooling package graph only permits contracts', async () => {
  assert.deepEqual(await verifyToolingPackageGraph(resolve('package.json')), []);
});
