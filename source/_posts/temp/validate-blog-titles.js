const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const POSTS_ROOT = path.resolve(__dirname, '..');

function walkMarkdownFiles(directory, files = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'temp') walkMarkdownFiles(fullPath, files);
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      files.push(fullPath);
    }
  }
  return files;
}

function readFrontmatter(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) throw new Error('缺少 Frontmatter');
  return yaml.load(match[1]) || {};
}

function hasOuterDoubleQuotes(value) {
  const title = String(value || '').trim();
  return title.length >= 2 && title.startsWith('"') && title.endsWith('"');
}

function hasRepeatedSeriesPrefix(value) {
  const title = String(value || '').trim();
  const match = title.match(/^(.+?)\s+-\s+"([\s\S]+)"$/);
  if (!match) return false;
  const prefix = match[1].trim();
  let inner = match[2].trim();
  while (inner.length >= 2 && inner.startsWith('"') && inner.endsWith('"')) {
    inner = inner.slice(1, -1).trim();
  }
  return inner.startsWith(prefix + ' - ');
}

const issues = [];
const files = walkMarkdownFiles(POSTS_ROOT);
for (const filePath of files) {
  const relativePath = path.relative(POSTS_ROOT, filePath).replaceAll('\\', '/');
  try {
    const { title } = readFrontmatter(filePath);
    if (typeof title !== 'string' || !title.trim()) {
      issues.push(relativePath + ': title 不能为空');
    } else if (hasOuterDoubleQuotes(title)) {
      issues.push(relativePath + ': title 不要包含外围双引号');
    } else if (hasRepeatedSeriesPrefix(title)) {
      issues.push(relativePath + ': title 包含重复的系列前缀');
    }
  } catch (error) {
    issues.push(relativePath + ': ' + error.message);
  }
}

if (issues.length) {
  console.error('博客标题校验失败（' + issues.length + ' 项）：');
  issues.forEach((issue) => console.error('- ' + issue));
  process.exitCode = 1;
} else {
  console.log('博客标题校验通过：' + files.length + ' 篇文章。');
}
