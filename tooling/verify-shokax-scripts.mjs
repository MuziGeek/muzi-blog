import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import {
  collectFiles,
  compileSource,
  isTypeScriptEntry,
  outputPathFor,
  relativePath,
  runtimeRoot,
  sourceRoot
} from './shokax-script-utils.mjs';

const sourceFiles = (await collectFiles(sourceRoot)).filter((sourcePath) => isTypeScriptEntry(relativePath(sourceRoot, sourcePath)));
const expected = new Map(await Promise.all(sourceFiles.map(async (sourcePath) => {
  const relative = relativePath(sourceRoot, sourcePath);
  return [outputPathFor(relative), (await compileSource(sourcePath, relative)).code];
})));
const runtimeFiles = await collectFiles(runtimeRoot);
const runtime = new Map(runtimeFiles.map((filePath) => [relativePath(runtimeRoot, filePath), filePath]));
const failures = [];

for (const relative of runtime.keys()) {
  if (!relative.endsWith('.js')) failures.push(`unexpected active theme script: ${relative}`);
  if (!expected.has(relative)) failures.push(`stale or unknown generated script: ${relative}`);
}

for (const [relative, expectedCode] of expected) {
  const runtimePath = runtime.get(relative);
  if (!runtimePath) {
    failures.push(`missing generated script: ${relative}`);
    continue;
  }
  if (await readFile(runtimePath, 'utf8') !== expectedCode) {
    failures.push(`generated script is stale: ${relative}`);
  }
}

const trackedFiles = execFileSync('git', ['ls-files', '--', 'themes/shokax/scripts'], { encoding: 'utf8' })
  .split(/\r?\n/)
  .filter(Boolean);
if (trackedFiles.length > 0) {
  failures.push(`runtime scripts must not be tracked by Git: ${trackedFiles.join(', ')}`);
}

if (failures.length > 0) {
  throw new Error(`ShokaX script verification failed:\n- ${failures.join('\n- ')}`);
}

console.log(`Verified ${expected.size} generated ShokaX runtime scripts; source and generated files are isolated.`);
