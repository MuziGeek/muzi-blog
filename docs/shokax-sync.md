# ShokaX 同步约定

博客主题只从官方仓库 `theme-shoka-x/hexo-theme-shokaX` 的 `main` 分支同步。个人 fork 不参与博客的更新链路。

当前同步基线记录在根目录 `.shokax-upstream.json`。先运行：

```powershell
pnpm run theme:check
```

发现更新后，在独立分支中抓取官方提交并以 subtree 方式同步 `themes/shokax`。主题目录不得包含博客专属功能；聊天助手、Live2D、Waline 视觉覆盖由站点层的 `scripts/shokax-inject.js`、`theme_injects/` 和 `source/css/muzi-shokax-custom.css` 维护。维护命令位于 `tooling/`，避免被 Hexo 当作站点插件加载。

每次生成、预览或部署前，运行 `pnpm run theme:prepare`。Hexo 会把主题 `scripts/` 中的所有文件当作插件加载，不能与 TypeScript 源码共存；因此官方服务端 TypeScript 源码保存在 `vendor/shokax-scripts/`，该命令先在临时目录完整转译，再替换主题目录中的 CommonJS 脚本。源码受版本控制，生成的 JavaScript 保持忽略且不得被 Git 跟踪。

以后更新主题时，先以 subtree 同步官方主题。官方 TypeScript 会暂时回到 `themes/shokax/scripts/`；此时必须依次运行 `pnpm run theme:sync-sources`、`pnpm run theme:prepare` 和 `pnpm run theme:verify`。`theme:sync-sources` 会完整镜像官方脚本源码到 `vendor/shokax-scripts`，再从活动目录移走源码；`theme:prepare` 会清理官方已删除脚本对应的陈旧 JS。除此之外，`themes/shokax` 应与官方提交一致。

同步后至少执行：

```powershell
pnpm run validate:posts
pnpm run theme:prepare
pnpm run theme:verify
git diff --check
```

完整 Hexo 构建必须禁用 Summary AI 的网络调用，并核对 `summary.json` 在构建前后的哈希；不要让主题同步触发付费摘要请求。
