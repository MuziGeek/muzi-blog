---
title: "木南 AI 智能体开发笔记 #10 - RAG 预检索优化"
date: 2026-09-16 18:30:00
categories:
  - ["笔记", "项目", "木南 AI 智能体"]
tags:
  - "AI Agent"
  - "Spring AI"
  - "RAG"
  - "Advisor"
  - "预检索"
---

# Mu-ai-agent-10

## 前言

前三篇把 RAG 这条链路从无到有搭了起来：#7 用 `TikaDocumentReader` + `TokenTextSplitter` + `text-embedding-v3` 跑通检索增强问答，#8 把内存版向量库换成 `PgVectorStore` 做持久化，#9 把 embedding 请求的切批职责收进 `BatchingStrategy`。

链路是通的，但检索质量一直有个说不清的毛病：**多轮追问时，检索结果会稀散**。

问题出在 `QuestionAnswerAdvisor` 上。它做的事很朴素——拿用户的原始 query，直接丢给向量库：

```java
chatClient = ChatClient.builder(chatModel)
        .defaultAdvisors(
                MessageChatMemoryAdvisor.builder(chatMemory).build(),
                QuestionAnswerAdvisor.builder(vectorStore).build(),   // 原始 query 直接检索
                MyLoggerAdvisor.builder().build()
        )
        .build();
```

用户第二句话说 "它和实体有什么区别？"，向量库收到的就是这一整句。没有主语、没有上下文，embedding 出来的向量自然抓不住重点，检索回来的片段和真正想问的东西对不上。

这一篇换掉这个 advisor，在**检索发生之前**插进一道加工环节——也就是 Spring AI 里的「预检索优化」（pre-retrieval）。

---

## 预检索在解决什么

传统 RAG 的隐含假设是「用户问什么，就拿什么去检索」。这个假设在真实场景里基本不成立：

- **多轮追问**："它和实体有什么区别？" —— 「它」是谁？
- **口语化表达**："那个啥，聚合根到底是个啥玩意儿" —— 用词和文档完全不一致
- **长会话淹没**：关键信息夹在几十轮闲聊里，单看最后一句根本不知道在问什么

预检索就是在向量检索**之前**先对 query 做加工，把它变成一条「检索友好」的完整问题。Spring AI 1.1.8 提供了四类手段：

| 能力 | 实现类 | 干的事 |
| --- | --- | --- |
| 查询压缩 | `CompressionQueryTransformer` | 把整段对话历史压成一句可独立检索的问题 |
| 查询重写 | `RewriteQueryTransformer` | 把口语化提问润色成检索友好的措辞 |
| 查询翻译 | `TranslationQueryTransformer` | 翻译成目标语言后再检索 |
| 多查询扩展 | `MultiQueryExpander` | 一条问题扩成若干变体，各自检索后合并去重 |

四类能力都藏在 `spring-ai-rag` 这个模块里，包路径是 `org.springframework.ai.rag.preretrieval.query.*`——**不是** `spring-ai-advisors-vector-store`，两个模块职责完全不同。

---

## 换掉 advisor

`RetrievalAugmentationAdvisor` 实现的是 `BaseAdvisor`，和项目里既有的记忆、日志 advisor 是同一种东西，所以替换方式很自然：

```java
chatClient = ChatClient.builder(chatModel)
        .defaultSystem("你是一个专业的技术问答助手，请根据提供的知识库文档回答用户问题。如果知识库中没有相关信息，请如实告知。")
        .defaultAdvisors(
                MessageChatMemoryAdvisor.builder(chatMemory)
                        .order(MEMORY_ADVISOR_ORDER)
                        .build(),
                retrievalAugmentationAdvisor,                       // 预检索 + 检索 + 上下文注入
                MyLoggerAdvisor.builder().order(LOGGER_ADVISOR_ORDER).build()
        )
        .build();
```

装配方式和改造前一模一样，真正的变化在这个 advisor 内部——它把「加工 query → 检索 → 拼上下文」串成了一条流水线：

```text
用户提问
  ↓
① MessageChatMemoryAdvisor      把对话历史注入 prompt
  ↓
② RetrievalAugmentationAdvisor
     从 prompt 取「用户最新发言」当 query、取「全部 instructions」当 history
     → 串行跑完转换器链
     → 展开成多条查询
     → 每条查询各自检索一次，合并去重
     → 用模板把上下文拼进用户消息
  ↓
③ MyLoggerAdvisor               记录「模型真正看到的请求」
  ↓
qwen-plus 基于知识库作答
```

---

## 顺序不是风格问题

三个 advisor 现在都显式写了 `order`。**这不是为了好看，顺序在这里是有语义的。**

```java
public static final int MEMORY_ADVISOR_ORDER = Ordered.HIGHEST_PRECEDENCE + 1000;  // -2147482648
public static final int LOGGER_ADVISOR_ORDER = 1;
```

关键在这一句：`RetrievalAugmentationAdvisor` 在 `before` 阶段是从 `request.prompt().getInstructions()` 里取对话历史来构造检索用的 `Query` 的。而这份历史，是 `MessageChatMemoryAdvisor` 注入进 prompt 的。

所以**记忆必须先跑**。顺序反了会怎样？不会抛异常、不会报错——只是压缩组件拿到一份空历史，"它和实体有什么区别？" 里的「它」永远指不明白，检索质量悄悄退化。这类「静默失效」比抛异常难查得多。

日志 advisor 排在最后同理：它记录的是「模型真正看到的请求」，也就包含了检索注入的上下文。排在检索之前的话，日志里只有用户原话，排查 "到底检索到了什么" 时无从下手。

因为这三条关系都是隐式的，我把顺序值提成了常量，并写了一条断言把不变量钉死：

```java
Assertions.assertTrue(order > RagApp.MEMORY_ADVISOR_ORDER,
        "检索增强 advisor 必须排在记忆 advisor 之后，否则读不到对话历史，多轮指代消解会静默失效");
Assertions.assertTrue(order < RagApp.LOGGER_ADVISOR_ORDER,
        "检索增强 advisor 必须排在日志 advisor 之前，否则日志看不到注入后的上下文");
```

---

## 四项能力，默认只开两项

四项全部实现、全部可单独开关，但默认配置是「压缩 + 扩展」开，「改写 + 翻译」关。这个取舍有明确理由：

| 能力 | 默认 | 理由 |
| --- | --- | --- |
| 压缩 | **开** | 项目有对话记忆，多轮追问是主要交互形态，收益最直接 |
| 改写 | 关 | 与压缩职责重叠（都在解决多轮指代与措辞），串行跑白白多一次大模型调用 |
| 翻译 | 关 | 知识库与提问都是中文，翻成英文再检索中文库**必然降低召回** |
| 扩展 | **开** | 对召回提升最明显，代价是多一次大模型调用，可以接受 |

也就是说，默认链路每轮问答比改造前多 **2 次大模型调用**（压缩 1 次 + 扩展 1 次）。想进一步省成本，把 `expansion.enabled` 也设为 false，恢复到只多 1 次——不用改一行代码。

翻译这项特别值得说明一下：它在标准预检索里是标配能力，但对**中文提问 + 中文知识库**的场景是有害的。所以我保留了它的完整实现与配置项，只是默认关着——它的价值在「知识库换成外文语料」时才显现。这种「能力实现，但默认不启用」的处理，比直接不做要诚实。

---

## 装配设计：转换器为什么不注册成 Bean

四个组件都实现/继承自 `QueryTransformer` 或 `QueryExpander`。最直觉的做法是把它们都注册成 Bean，让 Spring 注入。我没这么做，原因是「开关」会因此变成隐式状态：

- 关掉的组件不该出现在链路上，但容器里 Bean 存不存在与 `enabled` 开关是两回事；
- 注册成同类型 Bean 后，注入 `List<QueryTransformer>` 既可能出现多候选歧义；
- 想知道「哪些开关真正生效了」，只能靠反射去翻 `RetrievalAugmentationAdvisor` 的私有字段。

改成：组件在装配方法里按需构建，装配结果收敛到一个显式的 record 上：

```java
public record PreRetrievalPipeline(List<QueryTransformer> transformers, QueryExpander expander) {
    public PreRetrievalPipeline {
        transformers = (transformers == null) ? List.of() : List.copyOf(transformers);
    }
}
```

这样测试可以直接注入这个 Bean，断言「链路里有几个转换器、分别是谁、扩展器开没开」，不用启大模型也不用碰反射。

控制「开关 → 链路内容」的映射抽成了一个不依赖 Spring 的静态纯函数：

```java
public static List<QueryTransformer> composeQueryTransformers(PreRetrievalProperties props,
                                                              QueryTransformer compression,
                                                              QueryTransformer rewrite,
                                                              QueryTransformer translation) {
    List<QueryTransformer> chain = new ArrayList<>();
    if (props.getCompression().isEnabled() && compression != null) {
        chain.add(compression);
    }
    if (props.getRewrite().isEnabled() && rewrite != null) {
        chain.add(rewrite);
    }
    if (props.getTranslation().isEnabled() && translation != null) {
        chain.add(translation);
    }
    return chain;
}
```

纯函数的意义在于：最容易出错的地方（配置读取 + 装配顺序）可以用零成本的单元测试覆盖，不需要启动容器。

### 转换器的执行顺序

三个转换器的排列顺序遵循「**先消解指代，再润色措辞，最后换语言**」：

1. **压缩最优先**——它负责把 "它 / 这个 / 那怎么办" 补全成完整问题。放在改写之后的话，改写面对的仍是一个没有主语的残缺句子，等于白跑；
2. **改写居中**——此时句子已经完整，可以专注优化措辞与术语；
3. **翻译最后**——它的输出语言与输入不同，必须放在所有「同语言内加工」之后，否则后面几步都要在非母语文本上工作。

---

## 检索参数：从「框架默认」变成「显式配置」

改造前 `QuestionAnswerAdvisor` 的检索参数全是默认值。现在显式写出来：

```java
@Bean
public DocumentRetriever documentRetriever(VectorStore vectorStore, PreRetrievalProperties props) {
    Double threshold = (props.getRetrieval().getSimilarityThreshold() > 0)
            ? props.getRetrieval().getSimilarityThreshold()
            : null; // 非正数解释为「不设阈值」

    return VectorStoreDocumentRetriever.builder()
            .vectorStore(vectorStore)
            .topK(props.getRetrieval().getTopK())
            .similarityThreshold(threshold)
            .build();
}
```

取值刻意与改造前保持一致（`topK=4`、`similarityThreshold=0.0`），目的是让「换 advisor」这件事本身不改变检索结果——**行为差异只来自新增的预检索环节**，否则以后排查时分不清是哪里引起的变化。

为什么不吃默认值：默认值属于框架的实现细节，升级 Spring AI 时可能变化，而它直接决定「给模型喂多少上下文」。写死在配置里，行为才可复现、可对比。

阈值留 0 也是有意为之。改用余弦距离后，本项目实测的相似度绝对值偏高（命中 0.82、勉强相关也有 0.43），拿绝对阈值拦截很容易把有用内容一起丢掉。真要设阈值，应该先用日志观察一批真实查询的分布再定。

> 注意 `topK` 是**每条查询**的上限。启用多查询扩展后，最终合并进上下文的总条数可能是它的若干倍（变体条数 × topK，再去重）。

---

## 上下文模板中文化

`RetrievalAugmentationAdvisor` 默认用 `ContextualQueryAugmenter` 把检索结果拼进用户消息，但这个模板是**英文的**。中文问答里夹一段英文指令，实测表现为回答风格突变、偶尔夹带 "Based on the context..." 这类腔调。

所以换成了等价的中文模板，规则一条没增没减，只是换语言：

```java
private static final String CONTEXT_PROMPT_TEMPLATE = """
        以下是检索到的上下文信息。

        ---------------------
        {context}
        ---------------------

        请严格依据上述上下文回答问题，不要使用上下文之外的知识。

        请遵守以下规则：

        1. 如果上下文中没有答案，直接说明你不知道。
        2. 不要出现 "根据上下文"、"提供的资料" 这类说法。

        问题：{query}

        回答：
        """;
```

`{context}` 与 `{query}` 是框架回填的占位符，**两个都必须保留**，少一个渲染时就会抛错。

另一个开关是 `allowEmptyContext`。框架默认 `false`——检索为空时用兜底提示词让模型拒答。本项目设成 `true`，因为 system 提示词里已经写了「如果知识库中没有相关信息，请如实告知」，拒答的职责统一由 system 承担；两处都管会造成提示词重复，也让回答风格多一层不可控的模板影响。

---

## 配置树

11 个配置项、5 个分组，全部带默认值，开箱即用：

```yaml
mu-ai:
  rag:
    preretrieval:
      compression:
        enabled: true                     # 多轮追问是最常见形态，默认开
      rewrite:
        enabled: false                    # 与压缩重叠，默认关
        target-search-system: vector store
      translation:
        enabled: false                    # 中文库翻译有害，默认关
        target-language: English
      expansion:
        enabled: true
        number-of-queries: 3              # 再多收益递减，检索次数线性增长
        include-original: true            # 保留原查询，保证「最坏也不比不扩展差」
      retrieval:
        top-k: 4                          # 与改造前一致
        similarity-threshold: 0.0         # <= 0 解释为「不设阈值」
      augmenter:
        allow-empty-context: true         # 拒答统一交给 system 提示词
      advisor-order: 0                    # 必须大于记忆 advisor 的 order
```

`include-original: true` 是**召回率的保险**：大模型改写有可能跑偏，留下原始查询，能保证「至少不比不做扩展更差」。

这里用 `@ConfigurationProperties` 而不是逐条 `@Value`，是因为配置项到了 11 个、还带嵌套结构，`@Value` 要写 11 行参数再逐个拼默认值。既有的 `EmbeddingBatchingConfig` 只有 3 个平铺参数，用 `@Value` 是合适的；配置一多，取舍就反过来了。

---

## 单元测试

分三层，各自守一段职责：

| 测试类 | 用例数 | 特点 |
| --- | --- | --- |
| `PreRetrievalPipelineTest` | 7 | 纯逻辑，不启 Spring、不调模型 |
| `PreRetrievalConfigTest` | 4 | 容器装配 + order 不变量，不调模型 |
| `PreRetrievalTransformerLlmTest` | 4 | 全部 `@Tag("llm")`，逐项验证真实效果 |
| `PgVectorVectorStoreConfigTest` | 7（新增 1） | 端到端，其中 2 例带 `@Tag("llm")` |

### 断言按配置，而不是按写死的默认值

`PreRetrievalConfigTest` 里验证「链路内容与开关一致」用的是这个写法：

```java
Assertions.assertEquals(preRetrievalProperties.getCompression().isEnabled(),
        activeTransformers.contains(CompressionQueryTransformer.class),
        "压缩开关与链路内容不一致，请检查 PreRetrievalConfig.composeQueryTransformers");
```

四个方向都验一遍：**开关说开的必须真在链路里**（漏装配），**说关的必须真不在**（装配了但没生效）。

这里特意不写死「默认恰好 1 个转换器」。因为链路内容与 YAML 里的开关是同一份事实，写死之后一改 YAML 就得跟着改测试——测试变成配置的复读机，反而不如直接校验一致性。真正需要钉死的默认值放在 `PreRetrievalPipelineTest#testDocumentedDefaults` 里单独守。

### 大模型用例的断言为什么这么松

`PreRetrievalTransformerLlmTest` 里每个用例都真实调用 qwen-plus。断言只写「确定性事实」：

```java
Assertions.assertNotEquals(query.text(), compressed.text(),
        "压缩结果与原始问题完全相同，说明这一环没有生效");
```

不写死期望的加工结果——大模型输出无法逐字预测，写死只会得到一个天天红的测试。加工结果打印到日志里**供人工核对**，质量判断交给人，稳定性交给断言。

翻译那条更刻意：只断言「变了」，**不**断言「一定是英文」。模型偶尔会把专有名词原样保留，逐字校验语言很容易造成偶发失败。

### 端到端补了一例多轮追问

原来那例 `testChatWithRag` 用的是全新会话，历史为空，压缩组件拿不到任何上下文——等于没被真正执行。而多轮追问恰恰是压缩存在的理由，所以补了一例：

```java
String chatId = "test-rag-multiturn-" + System.currentTimeMillis();
ragApp.doChatWithRag("什么是聚合根？", chatId);
// 第二轮故意省略主语
ragApp.doChatWithRag("它和实体有什么区别？", chatId);
```

同一个 `chatId` 才会共享对话记忆。这个用例实际验证的是「记忆 advisor 先注入历史 → 检索增强 advisor 才去读」这个顺序，也就是前面那条 order 不变量的真实效果。

### 跑法

```bash
mvn -B test -DexcludedGroups=llm    # 22 个用例，日常回归
mvn -B test -Dtest=PreRetrievalTransformerLlmTest   # 单独看四项能力效果
```

---

## 实测效果

四项能力各自单独跑了一次，加工结果如下（日志原件）：

```text
【压缩】原始问题：它和实体有什么区别？
【压缩】加工结果：聚合根与普通实体在领域驱动设计（DDD）中的核心区别是什么？

【重写】原始问题：那个啥，聚合根到底是个啥玩意儿，跟实体啥区别啊
【重写】加工结果：聚合根与实体的核心区别是什么？

【翻译】原始问题：什么是聚合根？它和实体有什么区别？
【翻译】加工结果：What is an aggregate root? How does it differ from an entity?

【扩展】一条问题扩成 3 条变体，连同保留的原始查询共 4 条参与检索
```

压缩那条最能说明问题：输入的 "它" 被正确还原成了 "聚合根"——这正是多轮场景下检索质量的关键一步。

搜索链路端到端也验了。多轮用例第二轮的回答正确理解了 "它" 指代聚合根，说明「记忆先注入 → 预检索再读」这条顺序在真实运行中是通的。

测试汇总：

- 排除 llm：**22/22 绿**
- 带 llm：`PreRetrievalTransformerLlmTest` 4/4、`PgVectorVectorStoreConfigTest` 7/7 绿

---

## 新增/修改文件

```java
src/main/java/com/muzi/muaiagent/
└── rag/
    ├── app/
    │   └── RagApp.java                    # [修改] QuestionAnswerAdvisor → RetrievalAugmentationAdvisor，
    │                                      #        三个 advisor 显式 order，顺序值提为常量
    └── config/
        ├── PreRetrievalProperties.java    # 新增：11 个配置项 / 5 个分组
        ├── PreRetrievalPipeline.java      # 新增：链路装配结果 record
        └── PreRetrievalConfig.java        # 新增：4 个 Bean + 中文模板 + 静态装配函数

src/main/resources/application.yml         # [修改] 新增 mu-ai.rag.preretrieval.* 配置树
pom.xml                                    # [修改] 显式声明 spring-ai-rag

src/test/java/com/muzi/muaiagent/rag/
├── PreRetrievalPipelineTest.java          # 新增：7 例纯逻辑
├── PreRetrievalConfigTest.java            # 新增：4 例容器装配
├── PreRetrievalTransformerLlmTest.java    # 新增：4 例，全带 @Tag("llm")
└── PgVectorVectorStoreConfigTest.java     # [修改] 补多轮追问端到端用例
```

---

## 遇到的问题

### 1. 两个对称的 API，空值行为完全相反

装配时有两处需要「关掉就不传」：转换器链和扩展器。按直觉，两处的处理方式应该一样，但实际正好相反。

反查字节码后确认：

- `queryExpander(null)` 是**安全**的——`RetrievalAugmentationAdvisor.before` 里对它是 `if (queryExpander != null)` 判断，传 null 只是跳过扩展；
- 而转换器列表一侧，框架调的是 `Assert.noNullElements(...)`，要求**集合本身非 null**（元素也不允许 null）。

所以扩展器传 null、转换器列表归一成空列表：

```java
public PreRetrievalPipeline {
    transformers = (transformers == null) ? List.of() : List.copyOf(transformers);
}
```

这两个 API 长得很对称，行为却相反。顺带一提，这类地方的差异靠读文档经常看不出来——我这次是直接反查本地 Maven 仓库里的 jar（`javap` 看方法签名与字节码）确认的，一共挡掉了五处类似的误判，其中就包括 `PromptTemplate` 的实际位置（在 `spring-ai-model`，不是直觉上的 `client-chat`）。**凡是按记忆写 import 或者猜 builder 方法名，编译期就会付出代价。**

### 2. 依赖必须显式声明

改造前项目直接 `import` 的类型里没有 `spring-ai-rag` 的，改造后有了。这个模块之前是经 `spring-ai-alibaba-starter-dashscope → autoconfigure-dashscope → dashscope` 传递引入的（声明 `spring-ai-rag:1.1.2`），版本再被 `spring-ai-bom:1.1.8` 覆盖。

传递依赖能编译通过，但隐患和 #9 里 jtokkit 的情况一样：上游一调整依赖树，这些类型会在编译期无声消失。

```xml
<dependency>
    <groupId>org.springframework.ai</groupId>
    <artifactId>spring-ai-rag</artifactId>
</dependency>
```

不写 version，由 BOM 管理。**这条原则再重复一次：只要代码里 import 了某个库的类型，它就该出现在自己的 `pom.xml` 里，哪怕是「反正会被传递进来」的。**

### 3. 一个不再被引用的依赖

`spring-ai-advisors-vector-store` 里只有 `QuestionAnswerAdvisor` 和 `VectorStoreChatMemoryAdvisor` 两个类。改造后前者不再被引用（测试里还留了一处反向断言：容器里不该再有 `QuestionAnswerAdvisor` Bean）。

我暂时保留了它，只把注释改成与实际一致——因为 `VectorStoreChatMemoryAdvisor` 是下一步「记忆也走向量召回」的自然选项，而移除会动到传递依赖树，收益不抵风险。

---

## 心得体会

这一篇做的是「往检索前面插一道加工」，但真正花时间的不是那四个组件——它们都是框架现成的。花时间的是**把隐式关系变成显式约束**。

三条值得记下来：

**第一，组件能力全都要，但默认值要按场景定。** 四项预检索能力对中文知识库的价值完全不同：压缩和扩展收益直接，改写与压缩重叠，翻译甚至有害。合理的做法不是「能开就开」，而是四项都实现、都留开关，然后给一组**有理由**的默认值。默认配置是给绝大多数情况的，不是给「功能展示」的。

**第二，顺序是一种契约，不是配置细节。** 记忆 advisor 必须在检索增强之前，这个约束来自 `RetrievalAugmentationAdvisor` 内部从 prompt 读历史的实现方式。它没有写在任何接口签名里，违反了也不报错——只是多轮指代永远消解不掉。对这类隐式契约，光注释不够，得写成断言。我把 order 提为常量并让测试做相对比较，就是为了让「顺序不能反」这件事有地方可验。

**第三，大模型参与的逻辑，测试要分开两层。** 「开关生效了没、链路装对了没」是确定性的，可以用纯逻辑测试断言，跑一次几毫秒；「加工出来的 query 好不好」是概率性的，只能看日志人工判断。把这两者混在一起，结果要么测试天天红，要么放弃了本该有的保护。分层之后，日常回归跑前者，改了相关代码再跑后者看日志——成本与收益才对得上。

下一篇想回头看看检索本身，把这一篇里故意留成 0 的相似度阈值调一调——先拿真实查询的分布数据说话。

---

> 项目地址：[mu-ai-agent](https://github.com/MuziGeek/mu-ai-agent)
