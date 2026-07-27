import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { transform } from 'esbuild';

export const projectRoot = process.cwd();
export const themeRoot = path.join(projectRoot, 'themes', 'shokax');
export const sourceRoot = path.join(projectRoot, 'vendor', 'shokax-scripts');
export const runtimeRoot = path.join(themeRoot, 'scripts');

export async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectFiles(entryPath);
    return entry.isFile() ? [entryPath] : [];
  }));
  return files.flat();
}

export function relativePath(root, target) {
  return path.relative(root, target).split(path.sep).join('/');
}

export function isSourceFile(relative) {
  return relative === 'tsconfig.json' || relative.endsWith('.ts');
}

export function isTypeScriptEntry(relative) {
  return relative.endsWith('.ts') && !relative.endsWith('.d.ts');
}

export function outputPathFor(relative) {
  return relative.replace(/\.ts$/, '.js');
}

export async function compileSource(sourcePath, relative) {
  return transform(await readFile(sourcePath, 'utf8'), {
    loader: 'ts',
    format: 'cjs',
    target: 'node20',
    sourcefile: relative
  });
}
