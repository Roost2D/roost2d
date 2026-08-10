import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import ts from 'typescript';

const root = resolve('.');
const snapshotPath = resolve(root, 'reports/public-api.json');
const packageRoot = resolve(root, 'packages');
const packageDirectories = (await readdir(packageRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => resolve(packageRoot, entry.name))
  .sort();

const packages = [];
for (const directory of packageDirectories) {
  const manifest = JSON.parse(await readFile(resolve(directory, 'package.json'), 'utf8'));
  if (manifest.private || !manifest.name?.startsWith('@roost2d/')) continue;
  const typesPath = manifest.exports?.['.']?.types ?? manifest.types;
  if (typeof typesPath !== 'string') throw new Error(`${manifest.name} has no public TypeScript declaration entrypoint`);
  packages.push({ name: manifest.name, declarationPath: resolve(directory, typesPath) });
}

const program = ts.createProgram(packages.map(({ declarationPath }) => declarationPath), {
  module: ts.ModuleKind.NodeNext,
  moduleResolution: ts.ModuleResolutionKind.NodeNext,
  noEmit: true,
  skipLibCheck: true,
  target: ts.ScriptTarget.ESNext,
});
const diagnostics = ts.getPreEmitDiagnostics(program).filter(({ category }) => category === ts.DiagnosticCategory.Error);
if (diagnostics.length) {
  throw new Error(`Could not inspect public declarations:\n${ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: (name) => name,
    getCurrentDirectory: () => root,
    getNewLine: () => '\n',
  })}`);
}

const checker = program.getTypeChecker();
const snapshot = { schema: 'roost2d.public-api/v1', packages: {} };
for (const entry of packages) {
  const source = program.getSourceFile(entry.declarationPath);
  const symbol = source && checker.getSymbolAtLocation(source);
  if (!source || !symbol) throw new Error(`Could not inspect ${entry.name} declarations`);
  const declaration = (await readFile(entry.declarationPath, 'utf8')).replace(/\r\n/g, '\n');
  snapshot.packages[entry.name] = {
    entrypoint: '.',
    exports: checker.getExportsOfModule(symbol).map(({ escapedName }) => String(escapedName)).sort(),
    declarationSha256: createHash('sha256').update(declaration).digest('hex'),
  };
}

const serialized = `${JSON.stringify(snapshot, null, 2)}\n`;
if (process.argv.includes('--write')) {
  await mkdir(dirname(snapshotPath), { recursive: true });
  await writeFile(snapshotPath, serialized);
  console.log(`Wrote ${snapshotPath}`);
} else {
  const expected = await readFile(snapshotPath, 'utf8').catch((error) => error?.code === 'ENOENT' ? undefined : Promise.reject(error));
  if (expected !== serialized) throw new Error('Public API snapshot changed. Review it, then run npm run api:snapshot and commit reports/public-api.json.');
  console.log(`Public API snapshot verified for ${packages.length} packages.`);
}
