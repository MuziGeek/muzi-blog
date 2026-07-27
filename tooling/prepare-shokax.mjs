import { mkdir, mkdtemp, readdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  collectFiles,
  compileSource,
  isTypeScriptEntry,
  outputPathFor,
  relativePath,
  runtimeRoot,
  sourceRoot,
  themeRoot
} from './shokax-script-utils.mjs';

const sourceFiles = (await collectFiles(sourceRoot)).filter((sourcePath) => isTypeScriptEntry(relativePath(sourceRoot, sourcePath)));
if (sourceFiles.length === 0) {
  throw new Error(`No TypeScript theme scripts found in ${sourceRoot}`);
}

const runtimeFiles = await collectFiles(runtimeRoot);
const unexpectedFiles = runtimeFiles.filter((filePath) => !filePath.endsWith('.js'));
if (unexpectedFiles.length > 0) {
  throw new Error(`themes/shokax/scripts contains source or unknown files: ${unexpectedFiles.map((filePath) => relativePath(runtimeRoot, filePath)).join(', ')}. Run pnpm run theme:sync-sources after syncing upstream.`);
}

const stagingRoot = await mkdtemp(path.join(themeRoot, '.scripts-runtime-staging-'));
const stagingRuntimeRoot = path.join(stagingRoot, 'scripts');
const backupRoot = path.join(themeRoot, `.scripts-runtime-backup-${process.pid}`);

try {
  await Promise.all(sourceFiles.map(async (sourcePath) => {
    const relative = relativePath(sourceRoot, sourcePath);
    const outputPath = path.join(stagingRuntimeRoot, outputPathFor(relative));
    const result = await compileSource(sourcePath, relative);
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, result.code);
  }));

  await rm(backupRoot, { recursive: true, force: true });
  await rename(runtimeRoot, backupRoot);
  await rename(stagingRuntimeRoot, runtimeRoot);
  await rm(backupRoot, { recursive: true, force: true });
  console.log(`Prepared ${sourceFiles.length} ShokaX scripts from vendored TypeScript sources.`);
} finally {
  await rm(stagingRoot, { recursive: true, force: true });
}
