---
title: "木南 AI 智能体开发笔记 #9 - 嵌入请求的批处理策略"
date: 2026-09-15 17:10:00
categories:
  - ["笔记", "项目", "木南 AI 智能体"]
tags:
  - "AI Agent"
  - "Spring AI"
  - "DashScope"
  - "BatchingStrategy"
  - "Embedding"
---

# Mu-ai-agent-9

## 前言

前两篇把 RAG 链路搭了起来：`TikaDocumentReader` 读文档、`TokenTextSplitter` 切块、`text-embedding-v3` 向量化，再换到 `PgVectorStore` 做持久化。跑通之后，灌库环节留了个隐患。

知识库里的 7 篇 Markdown 最终切出 12 个分块，而 DashScope 的 embedding 接口对「单次请求的文本条数」是有硬性限制的。当时的写法是在 `DocumentLoader` 里手动按 10 条切片、循环提交：

```java
// 改造前：在业务代码里手动绕开厂商限制
for (int i = 0; i < allChunks.size(); i += 10) {
    int end = Math.min(i + 10, allChunks.size());
    vectorStore.add(allChunks.subList(i, end));
}
```

能跑，但把「DashScope 单次最多 10 条」这个**基础设施细节**硬塞进了业务代码。以后厂商改限制要改这里，而且别的调用方（检索、换用其他 VectorStore）还得各自再写一遍同样的循环。

后来翻 Spring AI 的源码才发现，官方早就为这件事留好了扩展点—`BatchingStrategy`。这一篇把它从头讲清楚，中间还踩了个坑：**这个扩展点的覆盖方式是静默的，改错了不会报错**。

---

## 批处理策略在哪儿被调用

先搞清楚它在调用链上的位置，不然容易把它当成一个孤立的工具类。

`VectorStore.add(List<Document>)` 会走到 `EmbeddingModel.embed(...)`，而 embedding 这一层才决定「一次 HTTP 请求发几条文本」。Spring AI 在 `EmbeddingModel` 的默认实现里把切批这件事抽了出来：

```java
// EmbeddingModel 接口的 default 实现（简化后）
default void embed(List<Document> documents, EmbeddingOptions options, BatchingStrategy batchingStrategy) {
    for (List<Document> batch : batchingStrategy.batch(documents)) {
        call(new EmbeddingRequest(batch, options));
    }
}
```

看得很清楚：**策略切出几批，就会发起几次 HTTP 请求**。所以「一次请求塞多少文档」这件事，完全由 `BatchingStrategy` 说了算。

这里还有个容易让人怀疑「策略到底生效没有」的细节：DashScope 的 `DashScopeEmbeddingModel` 覆写了这个三参 `embed(...)`，但它只是把默认的 options 补齐，然后转手调回上面的默认实现。也就是说策略是真的在起作用，不是被厂商实现绕过了。

---

## 默认策略的问题：只按 token 切，不管条数

不写任何配置时，`PgVectorStoreAutoConfiguration` 会装配它自带的默认策略：

```java
@Bean
@ConditionalOnMissingBean
BatchingStrategy pgVectorStoreBatchingStrategy() {
    return new TokenCountBatchingStrategy();   // CL100K_BASE + 8191 tokens + 保留 10%
}
```

`TokenCountBatchingStrategy` 干的事是按 **token 预算**切批：估算每篇文档的 token 数，攒到接近预算（默认 8191，再留出 10% 余量，实际可用约 7372）就切一刀。

问题在于：**它对「单批的文档条数」没有任何上限**。10 段很短的文本可能一共才几百个 token，远没碰到预算，但条数上早就越过了 DashScope 的线，服务端会直接拒绝。

条数和 token 是两把完全不同的尺子：

- 10 段短文本 → token 没超，**条数超了**
- 2 段超长文本 → 条数没超，**token 可能已经爆了**

所以两个上限必须同时生效，默认策略只守住了其中一个。

---

## 覆盖默认策略：注意它是静默的

覆盖方式很简单，自己声明一个 `BatchingStrategy` Bean 就行——上面那个默认策略带 `@ConditionalOnMissingBean`，会自动退让。

```java
@Bean
public BatchingStrategy batchingStrategy(...) {
    return new DashScopeBatchingStrategy(...);
}
```

**但这里有个必须知道的特性**：`@ConditionalOnMissingBean` 的特点是「被覆盖」和「没被覆盖」两种情况下**程序都能正常启动**。如果哪天这个配置类被挪走、扫描不到，或者引入的其他 Starter 也声明了 `BatchingStrategy`，结果是**静默退回默认策略**——请求照样发出去，只是可能因为单次条数超限被服务端拒绝，排查起来毫无头绪。

这类「失败方式是静默的」扩展点，光写实现不够，测试里必须断言「当前注入的确实是我这个实现」。后面测试那一节会专门说。

---

## 实现 DashScopeBatchingStrategy

思路是**两级切分**：先按条数分组，再交给现成的 token 策略细分。

```java
@Override
public List<List<Document>> batch(List<Document> documents) {
    if (documents == null || documents.isEmpty()) {
        return Collections.emptyList();
    }

    int total = documents.size();
    List<List<Document>> batches = new ArrayList<>();

    // 第一级：按条数上限分组
    for (int start = 0; start < total; start += maxDocumentsPerRequest) {
        int end = Math.min(start + maxDocumentsPerRequest, total);
        List<Document> group = documents.subList(start, end);

        // 第二级：token 预算细分（组内若有个别超长文档，由委托器兜住）
        batches.addAll(tokenCountDelegate.batch(group));
    }
    return batches;
}
```

委托器就是官方的 `TokenCountBatchingStrategy`，token 维度的切分逻辑没必要自己重写一遍。

### 顺序是一份硬契约

`BatchingStrategy.batch()` 的返回值有一个容易被忽略的约定：**展开后必须与原列表顺序完全一致，不能重排、不能去重**。

原因是 `embed(...)` 按**位置**把返回的向量回填给文档。策略一旦重排或漏掉文档，向量就会和文档错配——而且**不会报错**，只会静默把错误数据写进向量库。这种 bug 事后极难查。

用 `subList` 顺序切片、顺序拼接天然满足这个契约；官方 `TokenCountBatchingStrategy` 内部用 `LinkedHashMap` 保序，行为一致。

### 单个文档就超预算怎么办

`TokenCountBatchingStrategy` 遇到「单个文档的 token 数本身就超过预算」时会抛 `IllegalArgumentException`——它切不动了，再切上下文就断了。

这个异常信息原本只有一句「文档太大」，看不出是哪一篇。策略里包一层，把批次内每个文档的 `source` 和预估 token 补进异常信息：

```java
try {
    subBatches = tokenCountDelegate.batch(group);
} catch (IllegalArgumentException ex) {
    throw new IllegalArgumentException(buildOversizeMessage(group), ex);
}
```

报错会直接告诉你「第 3 个文档，来源：✅什么是聚合，什么是聚合根？.md，预估 9421 tokens」，比对着原始异常猜要省事得多。

---

## 配置类：EmbeddingBatchingConfig

三个参数都带默认值，开箱即用，需要调优时在 `application.yml` 里覆盖：

```java
@Bean
public BatchingStrategy batchingStrategy(
        @Value("${mu-ai.rag.batching.max-documents-per-request:10}") int maxDocumentsPerRequest,
        @Value("${mu-ai.rag.batching.max-input-tokens:8000}") int maxInputTokens,
        @Value("${mu-ai.rag.batching.reserve-percentage:0.1}") double reservePercentage) {
    return new DashScopeBatchingStrategy(
            EncodingType.CL100K_BASE, maxInputTokens, reservePercentage, maxDocumentsPerRequest);
}
```

```yaml
mu-ai:
  rag:
    batching:
      max-documents-per-request: 10     # 单次嵌入请求最多几条文本（DashScope 厂商限制）
      max-input-tokens: 8000            # 单批 token 预算
      reserve-percentage: 0.1           # 预留比例
```

取值上做了两个保守选择：

- **`CL100K_BASE`**：DashScope 没有公开自己的分词规则，只能借用 OpenAI 的编码做近似估算。估算偏大只是多切几批，偏小才会真的越界，所以宁可保守。
- **8000 而非默认的 8191**：留点余量。这个项目里真正的硬约束其实是**条数**（10 条），token 预算只是用来兜住少数几段超长文本——实测 12 个知识库分块合计约 3000 tokens，先被触发的必然是条数上限。

---

## 调用方变干净了

策略接管之后，`DocumentLoader` 里那段手动切片循环就删掉了，直接一次性提交：

```java
if (!allChunks.isEmpty()) {
    vectorStore.add(allChunks);
    log.info("共写入 {} 个文档分块到向量存储", allChunks.size());
}
```

收益不只是少了几行代码：

1. **厂商限制只在一处声明**，以后改限制只改策略；
2. **所有经由 `EmbeddingModel` 的调用都自动遵守**——灌库、检索、将来换别的 VectorStore 都一样；
3. 调用方不必再关心批次大小，把整份列表丢进去就行。

这正是把横切关注点从业务代码里抽出去的价值。

---

## 单元测试

5 个用例，覆盖策略生效性与切批规则：

```java
@Resource
private BatchingStrategy batchingStrategy;

@Test
@DisplayName("自定义批处理策略已生效，未被 Spring AI 默认策略覆盖")
void testCustomStrategyIsActive() {
    Assertions.assertInstanceOf(DashScopeBatchingStrategy.class, batchingStrategy,
            "批处理策略未被自定义实现覆盖，请检查 EmbeddingBatchingConfig 是否被扫描到");
}
```

注意这里是**按接口类型注入**的，而不是直接 `new` 一个自己测自己——只有这样才能验证「容器里最终生效的是哪个实现」。

其余四个用例：

| 用例 | 断言内容 |
| --- | --- |
| 条数超限被切批 | 12 个短文档 → 2 批，各批条数 `10 + 2` |
| 不丢文档且保序 | 25 个文档切批后展开，内容与顺序与原列表完全一致 |
| 单个文档超预算抛异常 | 抛 `IllegalArgumentException`，且异常信息里带来源文件名 |
| 空 / null 输入 | 返回空批次，而不是抛异常 |

这个测试不需要 `@Transactional`：它只调 `batch()` 这个纯内存方法做切批计算，既不写向量库也不调大模型。端到端的「策略 → DashScope → 落库」验证在原来的 `PgVectorVectorStoreConfigTest` 里。

---

## 实测效果

灌库结果与改造前完全一致，说明只是把切批的职责挪了地方，没有改变行为：

- 7 个 Markdown 文件 → 12 个分块 → **2 个批次**（10 + 2）
- 查询「什么是聚合根？」的相似度得分 **0.8209**，命中对应文档；另两条对照查询为 0.4438 / 0.4339，改造前后数值未变

策略内部会打两档日志：DEBUG 打每个批次的条数与预估 token（排查「为什么一次请求这么慢」时用），INFO 打汇总：

```text
批处理完成：12 个文档 → 2 个批次（单批上限 10 个文档）
```

---

## 新增/修改文件

```java
src/main/java/com/muzi/muaiagent/
└── rag/
    ├── config/
    │   ├── DashScopeBatchingStrategy.java    # 新增：条数 + token 双上限的切批策略
    │   └── EmbeddingBatchingConfig.java      # 新增：注册 Bean，覆盖 Spring AI 默认策略
    └── loader/
        └── DocumentLoader.java               # [修改] 删除手动 10 条切片，改为一次性提交

src/test/java/com/muzi/muaiagent/
└── rag/
    └── EmbeddingBatchingStrategyTest.java    # 新增：5 个用例，含「策略是否真的生效」的断言

pom.xml                                       # [修改] 显式声明 jtokkit 1.1.0
```

---

## 遇到的问题

### 1. jtokkit 的版本必须显式声明

`DashScopeBatchingStrategy` 直接引用了 `com.knuddels.jtokkit.api.EncodingType`，而这个库原本是经 `spring-ai-tika-document-reader → spring-ai-commons` 传递引入的。传递依赖能编译通过，但有两个隐患：上游一调整就会被无声移除，而且 `spring-ai-bom 1.1.8` 并不管理它的版本。

按「直接使用的库应显式声明」的原则补上，版本锁在原先传递引入的 1.1.0：

```xml
<dependency>
    <groupId>com.knuddels</groupId>
    <artifactId>jtokkit</artifactId>
    <version>1.1.0</version>
</dependency>
```

**经验**：只要代码里 import 了某个库的类型，它就该出现在自己的 `pom.xml` 里，哪怕是「反正会被传递进来」的。显式声明的代价是一行 XML，收益是不被上游的依赖调整牵连。

### 2. 覆盖机制不会告诉你它失败了

前面提过，`@ConditionalOnMissingBean` 的两种状态都能正常启动。写完策略后我一度怀疑「到底是我的实现生效了，还是静默退回了默认的」，因为两种情况下灌库都能跑通（12 个分块本来就没超 10 条多少）。

解决办法就是那条断言——**按接口类型注入，断言实现类**。它把「隐式的、静默的」配置关系变成了显式的、会失败的测试。这类场景值得形成习惯：凡是依赖条件装配、自动配置、Bean 覆盖的地方，都应该有一条「生效性断言」，否则出问题时排查成本极高。

---

## 心得体会

`BatchingStrategy` 这个扩展点本身很小，接口只有一个方法，实现也就几十行。真正值得记的是它背后的两个工程判断。

**第一，横切关注点应该只有一个事实来源。** 手动切片那段代码并不难写，难的是它会繁殖——今天在灌库处写一遍，明天检索处再写一遍，后天换 VectorStore 又写一遍。厂商限制一旦变化，就得全项目搜一遍。抽成策略之后，这个知识只存在于一个类里。

**第二，要警惕「静默失败」的扩展点。** 条件装配、自动配置、Bean 覆盖这类机制的手感很好，但它们天然缺少反馈：配置错了不报错，只是行为和预期不同。对这种地方，测试的价值不在覆盖多少分支，而在于把「生效」这件事本身变成可验证的。

下一篇准备回到知识库本身，看看换到持久化的 PgVector 之后，分块策略和检索质量还能怎么调优。

---

> 项目地址：[mu-ai-agent](https://github.com/MuziGeek/mu-ai-agent)
