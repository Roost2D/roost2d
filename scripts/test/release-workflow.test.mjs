import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

test('trusted publishing keeps project dependency execution outside the OIDC job', async () => {
  const workflow = await readFile(resolve('.github/workflows/publish.yml'), 'utf8');
  const [verifyJob, publishJob] = workflow.split(/\n  publish:\r?\n/);
  assert.ok(publishJob, 'separate publish job is missing');
  assert.match(verifyJob, /\n  verify:\r?\n/);
  assert.doesNotMatch(verifyJob, /id-token: write/);
  assert.match(publishJob, /environment: npm-publish/);
  assert.match(publishJob, /id-token: write/);
  assert.match(publishJob, /npm install --global npm@11\.5\.2/);
  assert.doesNotMatch(publishJob, /actions\/checkout@|npm ci/);
  assert.match(publishJob, /npm publish "\.\/dist-pack\/\$tarball" --access public --tag "\$RELEASE_TAG"/);
  assert.doesNotMatch(publishJob, /--provenance/, 'OIDC publishes generate provenance automatically');
});

test('trusted publishing requires exactly 13 ordered tarballs', async () => {
  const workflow = await readFile(resolve('.github/workflows/publish.yml'), 'utf8');
  assert.match(workflow, /ordered_tarballs < dist-pack\/publish-order\.txt/);
  assert.match(workflow, /"\$\{#ordered_tarballs\[@\]\}" -ne 13/);
  assert.match(workflow, /\^\[A-Za-z0-9\._-\]\+\\\.tgz\$/);
});
