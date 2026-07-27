import { copyFile, mkdir, mkdtemp, rename, rm, unlink } from 'node:fs/promises';
import path from 'node:path';
import {
  collectFiles,
  isSourceFile,
  relativePath,
  runtimeRoot,
  sourceRoot,
  themeRoot
} from './shokax-script-utils.mjs';

const runtimeFiles = await collectFiles(runtimeRoot);
const sourceEntries = runtimeFiles.filter((filePath) => isSourceFile(relativePath(runtimeRoot, filePath)));

if (sourceEntries.length === 0) {
  throw new Error('No official TypeScript files found in themes/shokax/scripts. Run this command immediately after a subtree update, before theme:prepare.');
}

const stagingRoot = await mkdtemp(path.join(themeRoot, '.scripts-source-staging-'));
const stagingSourceRoot = path.join(stagingRoot, 'shokax-scripts');
const backupRoot = path.join(themeRoot, `.scripts-source-backup-${process.pid}`);

try {
  await Promise.all(sourceEntries.map(async (sourcePath) => {
    const relative = relativePath(runtimeRoot, sourcePath);
    const targetPath = path.join(stagingSourceRoot, relative);
    await mkdir(path.dirname(targetPath), { recursive: true });
    await copyFile(sourcePath, targetPath);
  }));

  await rm(backupRoot, { recursive: true, force: true });
  await rename(sourceRoot, backupRoot);
  await rename(stagingSourceRoot, sourceRoot);

  await Promise.all(sourceEntries.map((sourcePath) => unlink(sourcePath)));
  await rm(backupRoot, { recursive: true, force: true });
  console.log(`Synchronized ${sourceEntries.length} official TypeScript source files into vendor/shokax-scripts.`);
} catch (error) {
  await rm(stagingRoot, { recursive: true, force: true });
  throw error;
} finally {
  await rm(stagingRoot, { recursive: true, force: true });
}
