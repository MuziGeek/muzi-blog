const fs = require('fs');
const path = require('path');
const { Notice, TFolder, parseYaml } = require('obsidian');

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DIARY_FILENAME_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const CHINESE_PATTERN = /[\u3400-\u9fff]/;
const MAX_TAGS = 5;

function formatDate(date) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function dateFilename(date) {
  return formatDate(date).slice(0, 10);
}

function normalizeSlug(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed || CHINESE_PATTERN.test(trimmed) || /[^A-Za-z0-9_\s-]/.test(trimmed)) {
    throw new Error('文件名只能包含英文、数字、空格、下划线和连字符，且不能包含中文。');
  }
  const slug = trimmed
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  const sequence = slug.match(/^(.*)-(\d)$/);
  const normalized = sequence ? `${sequence[1]}-0${sequence[2]}` : slug;
  if (!SLUG_PATTERN.test(normalized)) throw new Error('文件名格式无效。');
  return normalized;
}

function getRepositoryConfig(app) {
  const vaultRoot = app.vault.adapter.basePath;
  const repositoryRoot = path.resolve(vaultRoot, '..', '..');
  const configPath = path.join(repositoryRoot, '_config.yml');
  const config = parseYaml(fs.readFileSync(configPath, 'utf8'));
  const categoryMap = config.category_map || {};
  const slugToLabel = new Map(Object.entries(categoryMap).map(([label, slug]) => [String(slug), label]));
  return { categoryMap, slugToLabel };
}

function categoriesForFolder(folderPath, slugToLabel) {
  const segments = folderPath.split('/').filter(Boolean);
  const categories = segments.map((segment) => slugToLabel.get(segment));
  const missing = segments.filter((segment, index) => !categories[index]);
  if (missing.length) {
    throw new Error(`目录 “${missing.join('、')}” 未登记在 _config.yml 的 category_map 中。`);
  }
  return categories;
}

function getPostFolders(app) {
  const folders = [];
  const visit = (node) => {
    if (!(node instanceof TFolder)) return;
    if (node.path && !node.path.startsWith('temp') && !node.path.startsWith('.')) folders.push(node.path);
    node.children.forEach(visit);
  };
  visit(app.vault.getRoot());
  return folders.sort((left, right) => left.localeCompare(right));
}

function getExistingTags(app) {
  const tags = new Set();
  for (const file of app.vault.getMarkdownFiles()) {
    if (file.path.startsWith('temp/')) continue;
    const cache = app.metadataCache.getFileCache(file);
    const frontmatterTags = cache?.frontmatter?.tags;
    const values = Array.isArray(frontmatterTags) ? frontmatterTags : frontmatterTags ? [frontmatterTags] : [];
    values.forEach((tag) => tags.add(String(tag).replace(/^#/, '').trim()));
  }
  return [...tags].filter(Boolean).sort((left, right) => left.localeCompare(right));
}

async function chooseTags(quickAddApi, existingTags) {
  const selected = [];
  while (selected.length < MAX_TAGS) {
    const choices = ['完成', '新增标签', ...existingTags.filter((tag) => !selected.includes(tag))];
    const display = choices.map((choice) => {
      if (choice === '完成' || choice === '新增标签') return choice;
      return `标签：${choice}`;
    });
    const choice = await quickAddApi.suggester(display, choices);
    if (!choice || choice === '完成') break;
    if (choice === '新增标签') {
      const tag = String(await quickAddApi.inputPrompt('新增标签（可留空取消）') || '').trim().replace(/^#/, '');
      if (tag && !selected.includes(tag)) selected.push(tag);
      continue;
    }
    selected.push(choice);
  }
  return selected;
}

function formatPost({ title, date, categories, tags, body }) {
  const lines = [
    '---',
    `title: ${JSON.stringify(title)}`,
    `date: ${date}`,
    'categories:',
    `  - [${categories.map((category) => JSON.stringify(category)).join(', ')}]`,
    'tags:'
  ];
  if (tags.length) lines.push(...tags.map((tag) => `  - ${JSON.stringify(tag)}`));
  else lines[lines.length - 1] = 'tags: []';
  lines.push('---', '');
  return `${lines.join('\n')}${body}`;
}

function auditExistingPosts(app, slugToLabel) {
  const issues = [];
  for (const file of app.vault.getMarkdownFiles()) {
    if (file.path.startsWith('temp/')) continue;
    const relative = file.path.replace(/\.md$/, '');
    const segments = relative.split('/');
    const filename = segments.pop();
    if (!segments.every((segment) => SLUG_PATTERN.test(segment))) issues.push(`${file.path}: 目录名不符合规范`);
    if (!(segments.join('/') === 'note/diary' && DIARY_FILENAME_PATTERN.test(filename)) && !SLUG_PATTERN.test(filename)) {
      issues.push(`${file.path}: 文件名不符合规范`);
    }
    if (segments.some((segment) => !slugToLabel.has(segment))) issues.push(`${file.path}: 目录未配置分类映射`);
    const frontmatter = app.metadataCache.getFileCache(file)?.frontmatter || {};
    if (!frontmatter.date) issues.push(`${file.path}: 缺少 date`);
    if (!frontmatter.title || !CHINESE_PATTERN.test(String(frontmatter.title))) issues.push(`${file.path}: title 缺少中文描述`);
    const expectedCategories = segments.map((segment) => slugToLabel.get(segment));
    const categories = frontmatter.categories;
    const actualCategories = Array.isArray(categories) && Array.isArray(categories[0]) ? categories[0] : [];
    if (JSON.stringify(actualCategories) !== JSON.stringify(expectedCategories)) {
      issues.push(`${file.path}: categories 与目录不一致`);
    }
  }
  return issues;
}

async function openFile(app, file) {
  await app.workspace.getLeaf('tab').openFile(file);
}

module.exports = async ({ app, quickAddApi }) => {
  const { slugToLabel } = getRepositoryConfig(app);
  const issues = auditExistingPosts(app, slugToLabel);
  if (issues.length) {
    new Notice(`发现 ${issues.length} 个历史格式问题；请先完成迁移后再创建新文章。`);
    return;
  }

  const type = await quickAddApi.suggester(['博客笔记', '日常日记'], ['blog', 'diary']);
  if (!type) return;

  const now = new Date();
  const existingTags = getExistingTags(app);
  let folderPath;
  let filename;
  let title;
  let body = '';

  if (type === 'diary') {
    folderPath = 'note/diary';
    filename = dateFilename(now);
    const existing = app.vault.getAbstractFileByPath(`${folderPath}/${filename}.md`);
    if (existing) {
      await openFile(app, existing);
      return;
    }
    const subject = String(await quickAddApi.inputPrompt('日记主题（可留空）') || '').trim();
    if (subject && !CHINESE_PATTERN.test(subject)) {
      new Notice('日记主题需要包含中文描述。');
      return;
    }
    title = subject ? `日记 ${filename} - ${subject}` : `日记 ${filename}`;
    body = '## 今日记录\n\n## 今日收获\n\n## 明日计划\n';
  } else {
    const folders = getPostFolders(app);
    folderPath = await quickAddApi.suggester(folders, folders);
    if (!folderPath) return;
    try {
      categoriesForFolder(folderPath, slugToLabel);
      filename = normalizeSlug(await quickAddApi.inputPrompt('英文文件名，例如 mu-ai-agent-8'));
    } catch (error) {
      new Notice(error.message);
      return;
    }
    title = String(await quickAddApi.inputPrompt('中文文章标题') || '').trim();
    if (!title || !CHINESE_PATTERN.test(title)) {
      new Notice('文章标题不能为空，且必须包含中文描述。');
      return;
    }
  }

  const targetPath = `${folderPath}/${filename}.md`;
  if (app.vault.getAbstractFileByPath(targetPath)) {
    new Notice(`文件已存在：${targetPath}`);
    return;
  }

  const categories = categoriesForFolder(folderPath, slugToLabel);
  const tags = await chooseTags(quickAddApi, existingTags);
  const file = await app.vault.create(targetPath, formatPost({
    title,
    date: formatDate(now),
    categories,
    tags,
    body
  }));
  await openFile(app, file);
};
