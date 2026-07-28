---
title: "木南 AI 智能体配置中心开发笔记"
date: 2026-07-07 14:46:02
categories:
  - ["笔记", "项目", "木南图库"]
tags:
  - "AI"
  - "Agent"
  - "Prompt"
  - "Spring AI"
  - "Vue"
---
**2026-07-07**🌱上海: ☁️  🌡️+37°C

# 背景
这次改造的核心目标，是把木南项目里的 AI 智能体从“前端按钮 + 固定逻辑”的形态，推进到一个可以后台管理、可以观察运行过程、可以持续演进的配置中心。

在这个版本之前，某些所谓智能体更像是前端快捷入口。比如“拼豆达人”只是一个前端提示词按钮，没有后端 Agent 定义、工具链、Prompt 版本和运行日志，因此它不适合作为真实智能体保留。

本轮最终收敛的范围是 `智能体配置中心 v1 + 旅游助手闭环`：

- 后台可以管理智能体定义、Prompt 模板和工具绑定。
- Prompt 主视图只展示当前生效版本，历史版本通过展开区查看。
- 旅游助手走真实后端能力，并能通过后台 Prompt 配置影响运行结果。
- 前台 `/ai/chat` 只保留真实入口，不再展示“拼豆达人”伪智能体。
- 工作流仍坚持真实 action log，不做前端伪造步骤。

# 设计原则
主流智能体不是简单堆多个按钮，而是把能力拆成几层稳定资产：

- Agent Definition：智能体的名称、描述、启用状态、默认模型和展示信息。
- Instructions / Prompt：系统提示词、用户模板、变量说明、版本发布和回退。
- Tools：后端注册的真实工具能力，以及每个 Agent 对工具的启停和降级策略。
- Runtime Planner：运行时根据用户输入、显式能力和可用工具选择执行路径。
- Trace：把意图分析、工具调用、降级、错误和最终结果记录成可观察流程。

后台可视化应该管理的是“配置资产”，而不是让管理员动态写代码。工具的 Java 实现、鉴权逻辑、数据库写入和高风险动作仍由后端代码管控。

# 配置中心结构
本轮新增的配置中心主要围绕三类数据展开：

## 智能体定义
智能体定义负责回答“有哪些 Agent 可以被用户或系统使用”。

典型字段包括：

- `mode`：运行模式标识，例如 `TRAVEL_ASSISTANT`。
- `name`、`description`、`icon`：后台和前台展示信息。
- `status`：是否启用。
- `defaultModel`、`defaultModelType`：默认模型策略。
- `visibleInShortcut`、`sortOrder`：前端快捷入口展示控制。

配置缺失时，运行时会回退到代码内置默认定义，保证服务可以启动。

## Prompt 模板
Prompt 模板负责回答“这个 Agent 应该以什么身份、什么要求、什么输出结构工作”。

本轮把旅游助手的核心提示词迁移到后台模板，拆成：

- `SYSTEM`：角色、边界、输出规范。
- `USER_TEMPLATE`：基于上下文变量渲染的用户请求模板。

Prompt 管理采用“草稿 -> 预览 -> 发布”的方式。发布后新版本成为当前生效版本，旧版本进入历史区，方便回看和回退。

Prompt tab 的显示逻辑也做了收敛：

- 主列表只展示每个 `智能体 + 工具 + Prompt类型` 的当前生效版本。
- 草稿、禁用版本和旧发布版本不再混在主表里。
- 展开行展示历史版本，支持预览、复制草稿、发布和禁用。
- 智能体名称和筛选项来自同一份 Agent 定义，避免名称不一致。

## 工具绑定
工具绑定负责回答“某个 Agent 可以用哪些工具，以及工具不可用时怎么办”。

旅游助手目前有 8 个工具绑定：

```text
request_analysis
reference_resolution
user_space_lookup
weather_lookup
station_picture_search
station_post_search
image_save_to_space
travel_plan
```

工具被禁用时，不应让整条智能体流程崩掉，而是记录一条可读的降级 action，并让后续步骤继续运行。

# 旅游助手闭环
旅游助手是这个配置中心的第一个完整落地样板。

前台 `/ai/chat` 点击“旅游助手”后，不再只是拼一段固定提示词，而是在请求里携带：

```json
{
  "mode": "AUTO",
  "preferredCapability": "TRAVEL_ASSISTANT"
}
```

后端运行时会按优先级选择能力：

1. 用户显式指定的 mode。
2. 前端传入的 `preferredCapability`。
3. 自动意图识别。
4. 普通对话兜底。

旅游助手的 `TravelPlanTool` 不再维护大段硬编码 Prompt，而是通过统一的 Prompt 服务读取后台发布版本。没有发布模板、模板被禁用或配置仓储异常时，会回退到内置默认 Prompt，避免线上链路被配置问题阻断。

模型调用层也补齐了 `systemPrompt` 支持：

- DashScope chat 会传入 system / user message。
- OpenAI-compatible 协议会构造 system + user messages。
- 没有系统提示词时保持原有调用行为。

# 前后台体验
后台新增了独立的 `AI管理` 菜单分组，将 AI 相关入口统一收拢：

- AI聊天
- AI智能体配置
- 知识库

`AI智能体配置` 页面包含三个 Tab：

- 智能体配置：查看和启停 Agent。
- Prompt 模板：管理当前 Prompt 和历史版本。
- 工具绑定：查看和调整工具启停、阶段、降级策略。

前台 `/ai/chat` 工具栏则保持克制，只保留真实入口：

- 添加
- 模型选择
- 图像生成
- 旅游助手
- 更多

“拼豆达人”这类没有真实后端 Agent、Prompt、工具链和工作流的入口已经移除。真实拼豆业务本身不受影响，只是不再伪装成 AI 智能体。

# 验证记录
本次完成度核查的关键结果：

```text
AI service 内部管理接口：
- agents/page: code=0, total=7
- agent-prompts/groups: code=0, TRAVEL_ASSISTANT 有 2 个 Prompt 分组
- tool-bindings/list: code=0, TRAVEL_ASSISTANT 有 8 个工具绑定

前端入口：
- /ai/chat 已保留图像生成、旅游助手、更多
- 已移除“拼豆达人”
- 旅游助手请求会携带 preferredCapability=TRAVEL_ASSISTANT
```

验证命令：

```bash
cd munan-vue
npm run type-check

cd munan-ai
mvn -pl munan-ai-service -am test

cd munan-biz
mvn test
```

验证结果：

```text
munan-vue type-check: 通过
munan-ai-service tests: 40 tests, 0 failures, 0 errors
munan-biz tests: 29 tests, 0 failures, 0 errors
```

# 边界与后续
这个版本可以认为是“智能体配置中心 v1 闭环完成”，但不是全部 AI 平台能力完成。

已经完成：

- 后台 Agent 配置中心。
- 旅游助手 Prompt 后台可视化管理。
- Prompt 当前版本和历史版本分层展示。
- 工具绑定配置与降级策略入口。
- 前台旅游助手真实能力入口。
- 模型调用支持 system prompt。

暂未纳入本轮：

- 用户自定义 MCP。
- 浏览器直连插件或本地 stdio MCP。
- 后台动态上传工具代码。
- 天气供应商真实接入。
- 所有智能体的 Prompt 深度治理。
- 任意拖拽式工作流编排。

交付前还需要特别检查 Git 状态：本轮智能体配置中心涉及不少新增文件，如果这些文件仍处于未跟踪状态，就只能说明本机开发闭环可用，还不能说明项目在其他环境可复现。正式提交前，需要确认相关 Java、Vue、SQL、测试文件都已经纳入版本管理，或者明确写入忽略规则。

这次改造最重要的收获，是把“智能体”从前端概念变成了后端可治理的运行单元。后续继续扩展写作助手、视觉工坊或 MCP 连接器时，都应该沿用同一套 Agent Definition、Prompt Template、Tool Binding 和 Action Trace 模型，而不是再新增一批无法追踪的快捷按钮。
