---
title: "木南 AI 智能体开发笔记 #11 - 预检索实现图解复盘"
date: 2026-10-08 15:10:17
categories:
  - ["笔记", "项目", "木南 AI 智能体"]
tags:
  - "AI Agent"
  - "Spring AI"
  - "RAG"
  - "Advisor"
  - "预检索"
---

# Mu-ai-agent-11

## 前言

#10 写预检索改造时，重点放在「为什么这么改」：多轮追问检索稀散的病因、四个组件的取舍、默认值怎么定。这一篇换个角度，用三张图把「改动之后到底怎么跑」完整拆一遍——文字只做图的补充，想看决策过程的去翻 #10 就好。

行文依据是仓库的当前实现：预检索与检索阶段已经拆成两个配置类，所以这篇里的链路图比 #10 的版本多了合并与后处理两环。

## 图一：预检索站在链路的哪个位置
![01-advisor-chain.png](https://cdn.easymuzi.cn/img/20261008151219781.png)

一次 RAG 问答由三个 advisor 接力完成，`order` 决定先后：

- 记忆 advisor（order = -2147482648）最先跑，把对话历史写进 prompt；
- 检索增强 advisor（order = 0）居中，预检索、检索、上下文注入都发生在它的 `before` 阶段；
- 日志 advisor（order = 1）最后，记录的是「模型真正看到的请求」。

这个顺序是硬约束，不是风格偏好：检索增强 advisor 要从 prompt 里读对话历史来做指代消解，记忆 advisor 不先跑，它拿到的就是空历史。违反了不会报错——只是「它和实体有什么区别？」里的「它」永远指不明白，检索质量悄悄退化。

正因为这条关系是隐式的，我在 `RagApp` 里把两个 order 提成了常量，并让测试做相对比较，把「顺序不能反」钉成一条会失败的断言。

## 图二：advisor 内部的七个环节
![02-pipeline-phases.png](https://cdn.easymuzi.cn/img/20261008151452155.png)

`RetrievalAugmentationAdvisor.before` 阶段干的事，按图从左到右：

**预检索（蓝色一列）只负责把 query 变好。** 构造 `Query`（text 取用户最新发言，history 取 prompt 全部指令）→ 串行跑转换器链（默认只开压缩，一次大模型调用）→ 查询扩展（生成 3 条措辞不同的变体并保留原始查询，又一次大模型调用）。默认链路每次问答因此比改造前多 2 次大模型调用。

**检索阶段负责把文档取好。** 每条查询各自检索一次、各取回 topK=4 → `ConcatenationDocumentJoiner` 把多路结果展开去重 → 检索后处理再做一次按内容去重与截断。第三环是自研的 `DeduplicationDocumentPostProcessor`——Spring AI 1.1.8 只有 `DocumentPostProcessor` 接口，没有内置实现；合并器按文档对象身份去重，同一个语义片段被切成内容相近、对象不同的 chunk 时它管不住，所以还要按文本内容兜一次底。

**上下文注入负责把结果喂好。** 按中文模板把文档片段拼进用户消息，交给 qwen-plus 作答。

## 图三：一条 query 的变形过程

![03-query-transform.png](https://cdn.easymuzi.cn/img/20261008151438091.png)

把三张图里最直观的一张放最后。输入是那句经典的多轮追问，压缩结果取自实测日志：

```text
【压缩】原始问题：它和实体有什么区别？
【压缩】加工结果：聚合根与普通实体在领域驱动设计（DDD）中的核心区别是什么？
```

「它」被正确还原成了「聚合根」——上一轮问过「什么是聚合根？」，这段历史就是压缩组件的原料。这也是图一里那条 order 约束的真实收益。

扩展之后，4 条查询（3 变体 + 原始查询）各自检索 topK=4，最多取回 16 篇文档片段，经合并去重和后处理兜底后进入上下文。`include-original: true` 是召回率的保险：大模型改写可能跑偏，留下原始查询能保证「至少不比不做扩展更差」。

## 实现落点

| 文件                                        | 职责                                                        |
| ----------------------------------------- | --------------------------------------------------------- |
| `PreRetrievalProperties`                  | 预检索配置：压缩 / 改写 / 翻译 / 扩展 + `advisor-order`                 |
| `PreRetrievalPipeline`                    | record：有序转换器列表 + 可选扩展器，测试可直接断言                            |
| `PreRetrievalConfig`                      | 按开关装配链路；`composeQueryTransformers` 是不依赖 Spring 的静态纯函数     |
| `RetrievalProperties` / `RetrievalConfig` | 检索阶段：search / joiner / augmenter / post-retrieval 四组配置与装配 |
| `DeduplicationDocumentPostProcessor`      | 检索后按内容去重 + 按数量截断                                          |
|                                           |                                                           |

预检索只管 query 加工、检索阶段只管取文档，两个 `@ConfigurationProperties` 前缀（`mu-ai.rag.preretrieval` 与 `mu-ai.rag.retrieval`）把这条边界也画进了配置结构里。

## 开关与成本

四个加工环节全部可独立开关，默认只开「压缩 + 扩展」：

| 能力 | 默认 | 一句话理由 |
| --- | --- | --- |
| 压缩 | 开 | 有对话记忆，多轮追问是主要形态，收益最直接 |
| 改写 | 关 | 与压缩职责重叠，串行白多一次大模型调用 |
| 翻译 | 关 | 中文提问 + 中文知识库，翻译必然降低召回 |
| 扩展 | 开 | 对召回提升最明显，多一次调用可以接受 |

调成本只动 YAML，不改代码：关掉扩展回到只多 1 次调用；调大 `number-of-queries` 则检索次数线性增长、去重前文档上限 = 查询条数 × topK。

## 四个容易踩的点

**1. advisor 顺序是隐式契约。** 依赖来自框架「从 prompt 读历史」的实现方式，接口签名上看不出来，违反了也不报错。对这类约束，注释不够，得有断言。

**2. 两个对称的 API，空值行为完全相反。** 反查字节码确认：`queryExpander(null)` 安全（框架内部 `if != null` 判断，只是跳过扩展）；转换器列表走的是 `Assert.noNullElements(...)`，集合本身非 null、元素也不许 null。所以 `PreRetrievalPipeline` 的紧凑构造器把 null 归一成空列表，扩展器则保持 null。

**3. 默认英文模板必须中文化。** `ContextualQueryAugmenter` 的默认模板是英文的，夹在中文 prompt 里实测会让回答风格突变、偶尔冒出 "Based on the context..." 的腔调。换成等价中文模板即可，但 `{context}` 与 `{query}` 两个占位符一个都不能删，少一个渲染时直接抛错。

**4. topK 是每条查询的上限，不是总量。** 开着扩展时，进入上下文的片段最多是 topK 的好几倍。想控制总量靠检索后处理的 `max-documents` 截断，不是靠调小 topK。

## 怎么验证

测试分两层：确定性的用纯逻辑断言，概率性的看日志人工判断。

| 测试类 | 用例数 | 特点 |
| --- | --- | --- |
| `PreRetrievalPipelineTest` | 7 | 不启 Spring、不调模型，断言「开关 → 链路 → 顺序」 |
| `PreRetrievalConfigTest` | 4 | 容器装配 + order 不变量 |
| `RetrievalConfigTest` | 5 | 检索阶段装配与默认值 |
| `DeduplicationDocumentPostProcessorTest` | 5 | 纯内存，验证去重与截断规则 |
| `PreRetrievalTransformerLlmTest` | 4 | 全带 `@Tag("llm")`，真实调用只断言「变了」，不断言「变成什么」 |

日常回归跑 `mvn -B test -DexcludedGroups=llm`，改了加工逻辑再单独跑 llm 那组看日志。

## 小结

三张图各说一句话：

- 图一：预检索嵌在 advisor 链中间，前面必须先有记忆注入，后面必须留给日志；
- 图二：query 加工（预检索）和文档获取（检索阶段）是两段独立可配置的流水线；
- 图三：一条含混的追问，经过压缩还原主语、扩展撒网变体，才变成四条「检索友好」的查询。

检索质量的优化没有魔法，就是把「模型真正看到的 query 和上下文」一层层摆出来看——图是最好的摆法。

---

> 项目地址：[mu-ai-agent](https://github.com/MuziGeek/mu-ai-agent)
