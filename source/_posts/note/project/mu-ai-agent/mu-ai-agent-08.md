---
title: "木南 AI 智能体开发笔记 #8 - PgVector 向量持久化与集成测试"
date: 2026-09-15 14:30:00
categories:
  - ["笔记", "项目", "木南 AI 智能体"]
tags:
  - "AI Agent"
  - "Spring AI"
  - "PgVector"
  - "VectorStore"
  - "集成测试"
---

# Mu-ai-agent-8

## 前言

上一篇给项目接上了 RAG：`TikaDocumentReader` 读文档、`TokenTextSplitter` 切块、`text-embedding-v3` 向量化，最后存进 `SimpleVectorStore`。四步拼起来，技术文档问答就跑通了。

但收尾时我在心得体会里留了一句 " 生产环境需要换持久化方案（PgVector、Redis、Milvus 等）"，然后就翻篇了。这篇把它补上——换成 PgVector 之后，顺带把整条 RAG 链路第一次纳入集成测试。

先摆清楚内存版的两个硬伤：

- **重启即丢**。`SimpleVectorStore` 就是个 `ConcurrentHashMap`，应用一重启向量全没了，每次都要重新灌一遍知识库
- **测试不可重复**。集成测试里只能每次 `@BeforeEach` 重新灌库，跑一次几十秒起步；更别扭的是没法断言 " 库里本来有什么 "，因为每次进来都是空的

换成持久化存储之后，这两条同时解决。

---

## 为什么是 PgVector

向量库的选择挺多，选 PgVector 的理由非常实际：

| 方案 | 这里的取舍 |
| --- | --- |
| **PgVector** | 复用已有的 PostgreSQL，不引入新中间件；pgvector 扩展成熟，支持 HNSW 索引 |
| Redis | 需要 Redis Stack，运维多一个组件，且它的主场是内存缓存 |
| Milvus / Qdrant | 独立部署，适合百万级向量；当前知识库只有 7 篇文档、12 个分块，杀鸡用牛刀 |
| SimpleVectorStore | 内存版，就是这篇要替换掉的 |

规模是决定性的：知识库是个人整理的 DDD 笔记，量级在几十到几百个分块。这个体量下引入独立向量库，收益全落在运维成本上——负的。

还有一层是 Spring AI 的接口设计。`VectorStore` 是接口，`PgVectorStore` 和 `SimpleVectorStore` 都是它的实现，所以上层代码（`RagApp`、`DocumentLoader`）一行都不用改，只换 Bean 从哪来。这一点上一篇的结尾已经预告过，这篇算是把它兑现。

---

## 依赖与配置

### 引入依赖

`pom.xml` 里加 starter 和驱动：

```xml
<!--
    Spring AI PgVector 向量存储 Starter：
    基于 PostgreSQL pgvector 扩展的持久化向量存储，替代内存版 SimpleVectorStore。
    版本由 spring-ai-bom 1.1.8 管理，无需显式指定。
-->
<dependency>
    <groupId>org.springframework.ai</groupId>
    <artifactId>spring-ai-starter-vector-store-pgvector</artifactId>
</dependency>

<!--
    PostgreSQL JDBC 驱动：
    spring-ai-starter-vector-store-pgvector 已传递引入，显式声明为最佳实践，
    版本由 spring-boot-starter-parent 管理。
-->
<dependency>
    <groupId>org.postgresql</groupId>
    <artifactId>postgresql</artifactId>
    <scope>runtime</scope>
</dependency>
```

两个版本都由 BOM / parent 管，不用自己写——和上一篇踩的 jtokkit 那个坑正好相反，也正好凑成一条经验：**在 BOM 管理范围内的依赖不写版本，不在范围内的必须写**。

### 配置项逐条解释

`application.yml` 里新增一段：

```yaml
spring:
  datasource:
    url: ${DB_URL}
    username: ${DB_USERNAME}
    password: ${DB_PASSWORD}
  ai:
    vectorstore:
      pgvector:
        index-type: HNSW
        dimensions: 1024 # DashScope text-embedding-v3 默认输出 1024 维
        distance-type: COSINE_DISTANCE
        initialize-schema: true # 自动创建 vector_store 表，无需手动执行 DDL
        max-document-batch-size: 10000 # Optional: Maximum number of documents per batch
```

逐条说：

- **`dimensions: 1024`**：必须和 embedding 模型的输出维度一致。`text-embedding-v3` 是 1024 维，写错了插入时直接报维度不匹配。这个值同时是建表 DDL 里 `vector(1024)` 的来源
- **`index-type: HNSW`**：近似最近邻索引。另一条路是 `IVFFlat`，需要预先指定聚类中心数，更适合 " 批量导入完就不再频繁变更 " 的场景；HNSW 建索引慢一点、占空间多一点，但查询更稳，适合这种边写边查的用法
- **`distance-type: COSINE_DISTANCE`**：文本向量只关心方向不关心长度，余弦距离是默认选择
- **`initialize-schema: true`**：**这个默认是 false**。不打开表就不会被创建，第一次写入直接报 `relation "vector_store" does not exist`
- **`max-document-batch-size: 10000`**：这是**落库**时的分批大小，和上一篇的 embedding 请求分批（`BatchingStrategy`）是两件事，别混

数据源那三行用的是环境变量占位，真实值放在 `application-local.yml`，而那个文件在 `.gitignore` 里——这一点后面还会翻出来说。

---

## 自动配置做了什么

到这一步其实一行 Java 配置类都没写，但表已经建出来了。背后的链路值得拆开看。

`spring-ai-starter-vector-store-pgvector` 带进来一个 `PgVectorStoreAutoConfiguration`，生效条件是：

```java
@ConditionalOnClass({PgVectorStore.class, DataSource.class, JdbcTemplate.class})
@ConditionalOnProperty(name = "spring.ai.vectorstore.type",
                       havingValue = "pgvector", matchIfMissing = true)
```

注意 `matchIfMissing = true`——**不配 `spring.ai.vectorstore.type` 也照样生效**。反过来说，想关掉它不能靠 " 不配置 "，得显式设成 `none`。

### 建表时机

`PgVectorStore` 实现了 `InitializingBean`，建表发生在 `afterPropertiesSet()` 里，顺序是：

```text
CREATE EXTENSION IF NOT EXISTS vector
CREATE EXTENSION IF NOT EXISTS hstore
CREATE EXTENSION IF NOT EXISTS "uuid-ossp"   -- id-type=uuid 时才有
CREATE SCHEMA  IF NOT EXISTS <schema>
CREATE TABLE   IF NOT EXISTS <table> (...)
CREATE INDEX   IF NOT EXISTS <index> (...)
```

全部带 `IF NOT EXISTS`，所以重复启动是安全的。建表语句本身是个模板：

```sql
CREATE TABLE IF NOT EXISTS vector_store (
    id        uuid PRIMARY KEY,
    content   text,
    metadata  json,
    embedding vector(1024)
)
```

### 几个值得记住的默认值

| 配置项 | 默认值 |
| --- | --- |
| 表名 | `vector_store` |
| schema | `public` |
| 索引名 | `spring_ai_vector_index` |
| `id-type` | `uuid` |
| `index-type` | `hnsw` |
| `distance-type` | `cosine` |
| `initialize-schema` | `false` |
| `schema-validation` | `false` |
| `dimensions` | 兜底 1536 |

第一次看到 `dimensions` 的兜底值是 1536 时我愣了一下——那是 OpenAI `text-embedding-ada-002` 的维度，Spring AI 的总默认值是照着那边定的。所以**自家模型不是 1536 维时，这个配置必须写**，不写就是拿 1536 去建表。

`schema-validation` 默认关闭这点更值得留意：它不会校验已存在的表结构和当前配置是否一致。也就是说维度配错、改过，它不会提醒你，只会在写入的那一刻炸。

---

## 一个失效的 Profile 设计

项目里原本有个打算：在 `RagConfig` 里注册内存版 `SimpleVectorStore`，用 profile 切换，方便本地无数据库调试。

```java
@Bean
@Profile("simple-vector")
public VectorStore simpleVectorStore(EmbeddingModel embeddingModel) {
    return SimpleVectorStore.builder(embeddingModel).build();
}
```

想法很合理，但实际**切不过去**，而且两层原因叠在一起。

第一层，`PgVectorStoreAutoConfiguration` 里的条件是 `@ConditionalOnMissingBean`，判定的是返回类型 `PgVectorStore`：

```java
@Bean
@ConditionalOnMissingBean
PgVectorStore vectorStore(...) { ... }
```

而 `SimpleVectorStore` 不是 `PgVectorStore` 的子类。它的存在不满足 " 已有 PgVectorStore " 这个条件，于是 **PgVectorStore 的 Bean 照样被创建**，容器里同时有了两个 `VectorStore`。

第二层更隐蔽。`RagApp` 和 `DocumentLoader` 的构造参数名恰好叫 `vectorStore`：

```java
public RagApp(ChatModel chatModel, VectorStore vectorStore, DocumentLoader documentLoader) {
```

同一个类型出现多个候选 Bean 时，Spring 会拿参数名去比对 Bean 名。而自动配置的那个 Bean 方法就叫 `vectorStore`——名字对上了，于是注入的**依然是 PgVector**，`simple-vector` profile 形同虚设。

这件事我先记下来，没有改：当前默认 profile 就是 `local`，PgVector 本来就是想要的，这个缺陷不影响主流程。真正的修法是**把 `RagConfig` 里那套设计去掉**，需要内存版时改用 `spring.ai.vectorstore.type: none` 让自动配置退场，再自行提供 `SimpleVectorStore`。留着是因为它是个很好的反例：

> `@ConditionalOnMissingBean` 判定的是**返回类型**，不是接口。写条件装配的扩展点、或者想绕开别人的条件装配时，这一条必须先确认清楚。

---

## 集成测试

持久化最大的收益在这里兑现：向量库终于有了确定的、跨进程的状态，可以像测数据库那样测它。

### 注入方式：显式按名

```java
@Resource(name = "vectorStore")
private VectorStore pgVectorVectorStore;
```

为什么不用 `@Autowired` 按类型注入——看过上一节就明白了：容器里同时存在 `SimpleVectorStore` 和 `PgVectorStore` 时，按类型注入会有歧义，直接按 Bean 名指定最省事。

### `@Transactional` 是这套测试的地基

所有用例都加了 `@Transactional`：

```java
@Test
@DisplayName("写入文档 → 相似度检索")
@Transactional
void testAddAndSimilaritySearch() {
    ...
}
```

测试跑完自动回滚，写进去的文档不会留在库里。对 `testInitKnowledgeBase` 这种用例尤其关键——否则每跑一次回归就把整个知识库重复灌一遍，共享的数据库只会越来越脏。

这里我特意验证过一次，因为 " 看起来生效 " 和 " 真的生效 " 是两回事：**单独跑一次 `testInitKnowledgeBase`，跑之前和跑之后各导出一次全表，行数 18 → 18，没有增长**；同时 `target/surefire-reports` 里只有 3 次记录，和执行次数对得上。

### 断言为什么写得 " 宽松 "

向量库是共享的、有历史数据的，所以断言不能写死条数：

```java
Assertions.assertFalse(results.isEmpty(), "相似度检索结果不应为空");
Assertions.assertTrue(results.size() <= 5, "topK=5 时返回条数不应超过 5");
```

元数据过滤这类用例用 `allMatch`：

```java
Assertions.assertTrue(
        results.stream().allMatch(doc -> "meta1".equals(doc.getMetadata().get("meta1"))),
        "返回结果都应满足 meta1 = meta1");
```

思路是：**只断言与被测行为绑定的性质**（" 过滤条件必须成立 "），不断言那些会被环境改动的量（" 应该正好有 3 条 "）。后一种写法今天绿、明天红，最后就是被 `@Disabled` 掉。

### 会调大模型的用例单独标记

`testChatWithRag` 会真实调用 `qwen-plus`，耗时几十秒、产生 token 消耗，而且答案本身不确定。给它打上 `@Tag("llm")`：

```java
@Test
@Tag("llm")
@DisplayName("RAG 问答：知识库检索 + 大模型作答")
void testChatWithRag() throws IOException { ... }
```

日常回归排除它，只跑确定性的部分：

```bash
mvn -B test -DexcludedGroups=llm                                 # 快速回归
mvn -B test -Dtest=PgVectorVectorStoreConfigTest#testChatWithRag # 单独跑问答
```

用例内部的断言也要分层：**检索那一步是确定性的，就正常断言它必须命中**；大模型那一步只断言 " 回答非空非空白 "，答案对不对靠人看日志——日志里会把问题和回答完整打出来。

### 六个用例

| 用例 | 验证内容 |
| --- | --- |
| 写入 + 相似度检索 | 写入 3 条文档，查 "Spring"，排第一的确实是含 Spring 的那条 |
| 相似度阈值过滤 | 返回结果的得分全部 ≥ 阈值 |
| 元数据条件过滤 | `meta1 = meta1` 的过滤条件在结果中全部成立 |
| 元数据条件删除 | 删除后同样的查询命中数归零 |
| 知识库初始化 | 扫描 DDD 文档 → 灌库 → 用 DDD 问题检索能命中且带 `source` 元数据 |
| RAG 问答 | 灌库 → 检索命中 → 大模型基于知识库作答非空（`@Tag("llm")`） |

---

## 实测数据

灌库这条链路用真实知识库跑：

- 扫描 **7 个 Markdown** 文件 → 切出 **12 个分块**
- 查询 `什么是聚合根？` → 相似度 **0.8209**，命中 `✅什么是聚合，什么是聚合根？.md`（`source` 元数据正确）
- 第二名 0.4438，来自 `✅请详细描述DDD的实现流程？.md`

第一名的得分是第二名的近两倍，区分度够用。

RAG 问答用例跑了 **31.6 秒**（含大模型往返），回答里提到 " 订单聚合 / Order / OrderItem " 和 " 充血模型 "——都是命中文档里的内容，说明 `QuestionAnswerAdvisor` 拼接上下文这一步确实生效了。

启动日志里能看到自动配置的动作：

```text
Initializing PGVectorStore schema for table: vector_store in schema: public
vectorTableValidationsEnabled false
```

另外有一个观察值得单独记下来：**DashScope 的余弦相似度整体偏高**。查询 "Spring" 时，含 Spring 的文档得分 0.6384，完全无关的文档也有 0.5113。所以 `similarityThreshold` 别按直觉设成 0.7、0.8，那会把相关文档一起滤掉；测试里用的是 0.3。

---

## 排障：表里那些不是我写的行

灌库测试通过之后，我发现一件不对劲的事：`testMetadataFilter` 里按 `meta1` 过滤，命中的是 **3 条**，而用例只写了 1 条带 `meta1` 的文档。

第一反应是 " 表里有 2 条历史遗留行 "。为了确认，写了个临时 JDBC 程序导出全表——结果是 **18 行**：

| 条数 | 内容 | 元数据 |
| --- | --- | --- |
| 12 | DDD 知识库分块 | 带 `source` / `chunk_index` / `total_chunks` / `parent_document_id` |
| 6 | 「Spring AI rocks」/「The World is Big」/「You walk forward」**各 2 份副本** | 分别为 `meta1` / `{}` / `meta2` |

**原来的判断只对了一半。** 遗留的不是 2 行，是整份 3 条样例的 2 份副本 = 6 行。之前那个数字是从 "meta1 命中 3 条 " 反推出来的，只覆盖了带 `meta1` 的那一类，另外两类根本没进视野。这种 " 由一个观测点推断整体 " 的错误很典型，代价是清库的时候会少删。

确认现状之后做了两件事：

1. **清空前先备份**。18 条 `INSERT` 全量导出到 `.workbuddy/backup/vector_store_backup_2026-09-15.sql`（248 KB，含 id / content / metadata / embedding，可直接用 psql 恢复）
2. **清空整表**。清理脚本带行数校验——只有 " 实际行数 == 预期 18 " 且 " 导出条数 == 18 " 两个条件同时成立才执行 `DELETE`，否则中止

清完之后表结构、4 个扩展（`vector` / `hstore` / `uuid-ossp` / `plpgsql`）、主键索引和 `spring_ai_vector_index`(hnsw) 全部完好。

顺带查出一个安全问题：仓库根目录下还有一份 `application-local.yml`，处于已经 `git add` 进暂存区的状态，而它里面是明文的数据库密码和 API Key。`.gitignore` 只写了 `/src/main/resources/application-local.yml`（带路径锚点），管不到根目录的同名文件。执行 `git rm --cached` 把它从暂存区摘掉了，提交里没有密钥。

---

## 遇到的问题

### 1. 维度改了不生效

`initialize-schema` 建表用的是 `CREATE TABLE IF NOT EXISTS`。表已经存在时，这段 DDL **什么都不做**，不会更新列定义。

所以想从别的维度切到 1024（比如从兜底的 1536 切过来），改配置是没用的，必须先手动 `DROP TABLE vector_store` 或者 `ALTER` 那一列，让它重新建。

更麻烦的是前面提过的 `schema-validation` 默认关闭——它不会在启动时告诉你 " 表里的向量维度是 1536，而你配的是 1024 "，一直要等到插入数据才报错。

### 2. 这个属性不存在

想临时关掉 PgVector 时，我按直觉写过：

```yaml
# 错误写法：1.1.8 里没有这个属性，写了完全无效且不报错
spring:
  ai:
    vectorstore:
      pgvector:
        enabled: false
```

`spring.ai.vectorstore.pgvector` 下**没有 `enabled` 这个属性**。正确做法是设顶层的类型开关：

```yaml
spring:
  ai:
    vectorstore:
      type: none
```

（这个错误的写法在项目注释里躺了很久，属于典型的 " 看起来对、实际静默无效 "。）

### 3. metadata 是 json 不是 jsonb

`metadata` 列的类型是 `json`：

```sql
metadata  json
```

所以想判断 " 某条文档带不带 source 字段 " 时，写 `metadata ? 'source'` 会报：

```text
ERROR: operator does not exist: json ? unknown
```

`?` 是 jsonb 的操作符。json 列上要先取值再判断：

```sql
WHERE metadata->>'source' IS NOT NULL
```

建表语句是 Spring AI 写死的改不了，查库时按 json 的语法写就行。

### 4. 相似度得分别按直觉估

前面提过：`text-embedding-v3` 的余弦相似度整体偏高，无关文本也能到 0.5 以上。做阈值过滤时最好**先把得分打到日志里看一眼分布**再定阈值，别按其他模型的经验值直接填。

---

## 新增/修改文件

```text
pom.xml                                        # [修改] 新增 pgvector starter 与 postgresql 驱动

src/main/resources/application.yml             # [修改] 新增 spring.ai.vectorstore.pgvector 配置段

src/main/java/com/muzi/muaiagent/
└── rag/
    └── config/
        └── RagConfig.java                     # [修改] 注册 simple-vector profile 下的内存版 VectorStore

src/test/java/com/muzi/muaiagent/
└── rag/
    └── PgVectorVectorStoreConfigTest.java     # 新增：6 个用例的 PgVectorStore 集成测试

.workbuddy/backup/
└── vector_store_backup_2026-09-15.sql       # 清库前的全表备份（18 条 INSERT）
```

---

## 心得体会

这次改动真正的价值不在 " 换了个存储 "，而在于它让 RAG 从 " 能演示 " 变成了 " 可测试 "。

内存版向量库有个隐蔽的问题：它让测试看起来在测系统，其实是在测一次性的运行时状态。`@BeforeEach` 灌一遍、跑完丢掉，每个用例都在一个和真实环境无关的真空里跑。换成持久化之后，向量库成了一个有历史、有遗留数据、可能被人手工改动的真实依赖——麻烦，但这才是测试该面对的东西。

`@Transactional` 在这个前提下才是关键的一步。它让 " 会写外部系统的集成测试 " 重新变得可以反复执行，同时保留住 " 真实的库、真实的索引、真实的 SQL "。如果拿不准回滚到底有没有生效，就做一次前后对比导出——**别猜，量一次的成本远低于一次被污染的数据**。

第二条体会是关于诚实记录判断失误的。18 行这个数字让我意识到，前面那句 " 表里有 2 条遗留行 " 是从一个观测点推出来的，而我当时把它当成了结论。这种推断在排查里很常见，也很容易在下一步行动里放大成实际影响（比如按 2 行去删，剩下 16 行继续污染测试）。所以凡是要动数据，先做一次全量导出，拿实际数字说话。

最后是条件装配这层。`@ConditionalOnMissingBean` 判定的是返回类型而不是接口，加上 Spring 按参数名解析多候选 Bean 的行为，两件事叠在一起，让 `RagConfig` 里那个看起来合理的 profile 开关从头到尾没有生效过，而且不报任何错。**扩展点越 " 聪明 "，越需要一条会失败的断言来证明它真的在工作**——这一点算是和上一篇连上了。

---

> 项目地址：[mu-ai-agent](https://github.com/MuziGeek/mu-ai-agent)
