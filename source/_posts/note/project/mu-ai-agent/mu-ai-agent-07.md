---
title: "木南 AI 智能体开发笔记 #7 - \"木南 AI 智能体开发笔记 #7 - RAG 知识库问答\""
date: 2026-06-26 15:20:00
categories:
  - ["笔记", "项目", "木南 AI 智能体"]
tags:
  - "AI Agent"
  - "Spring AI"
  - "RAG"
  - "VectorStore"
  - "Tika"
  - "DashScope"
---
**2026-06-26**🌱上海: ☀️ 🌡️+95°F 🌬️SE6mph

# Mu-ai-agent-7

## 前言

前面几篇文章把 AI Agent 的核心组件都过了一遍：模型调用、Advisor 链、结构化输出、记忆管理、Prompt 模板、多模态视觉。但还有一个非常实用的场景没涉及—**让 AI 基于我们自己的文档来回答问题**，也就是 RAG（Retrieval-Augmented Generation，检索增强生成）。

用大白话说，RAG 做的事情就是：

1. 把文档切成小块，每块转成向量存到向量数据库里
2. 用户提问时，先把问题也转成向量，去数据库里搜最相关的文档片段
3. 把搜到的文档片段拼到 prompt 里，让 AI 基于这些上下文回答

这样做的好处很明显—AI 不再是 " 凭空编造 " 答案，而是有据可依。对于企业内部知识库、技术文档问答这类场景特别实用。

这次就来给我们的面试助手项目加一个 RAG 模块，把 `resources/document/Java8Gu5/DDD/` 下的 DDD 相关文档变成可以问答的知识库。

---

## RAG 的整体架构

先画个全局流程图，理解各组件的配合关系：

```java
离线阶段（知识库构建）:
resources/document/Java8Gu5/DDD/*.md     ← 原始 Markdown 文档
    ↓ TikaDocumentReader
解析为 Document 对象列表
    ↓ TokenTextSplitter
切分为更小的文本块（chunks）
    ↓ DashScope text-embedding-v3
每个 chunk 转为高维向量
    ↓ VectorStore.add()
写入 SimpleVectorStore（内存）

在线阶段（RAG 问答）:
用户提问
    ↓
MessageChatMemoryAdvisor  ← 对话记忆（多轮上下文）
    ↓
QuestionAnswerAdvisor     ← 向量检索 → 把相关文档拼入 prompt
    ↓
MyLoggerAdvisor           ← 日志记录
    ↓
DashScope qwen-plus 模型
    ↓
返回基于知识库的回答
```

整个流程分两层：离线层负责 " 喂数据 "，在线层负责 " 查数据 + 生成回答 "。代码上也做了对应的分离。

---

## 依赖引入

RAG 涉及三个能力，需要三个 Spring AI 模块：

```xml
<!-- 文档解析：Apache Tika，支持 Markdown/PDF/DOCX/HTML 等几十种格式 -->
<dependency>
    <groupId>org.springframework.ai</groupId>
    <artifactId>spring-ai-tika-document-reader</artifactId>
</dependency>

<!-- 向量存储：SimpleVectorStore，基于内存的向量数据库，适合开发和小规模数据 -->
<dependency>
    <groupId>org.springframework.ai</groupId>
    <artifactId>spring-ai-vector-store</artifactId>
</dependency>

<!-- Advisor：QuestionAnswerAdvisor，自动在 prompt 中注入检索到的文档片段 -->
<dependency>
    <groupId>org.springframework.ai</groupId>
    <artifactId>spring-ai-advisors-vector-store</artifactId>
</dependency>
```

版本号都由 `spring-ai-bom 1.1.8` 管理，不需要显式指定。

这里有个小坑：`SimpleVectorStore` 的 artifactId 是 `spring-ai-vector-store`，而不是直觉上的 `spring-ai-vector-store-simple`。后者在 Maven Central 上根本不存在。确认 artifactId 最靠谱的方式是去 <https://repo1.maven.org/maven2/org/springframework/ai/> 看目录列表。

---

## Embedding 模型配置

RAG 需要一个向量化模型（Embedding Model），把文本转成高维向量。DashScope 提供了 `text-embedding-v3` 模型，配置非常简单：

```yaml
spring:
  ai:
    dashscope:
      # 已有的 chat 和 vision 配置...
      chat:
        options:
          model: qwen-plus
      vision:
        model: qwen-vl-max
      # 新增 Embedding 配置
      embedding:
        options:
          model: text-embedding-v3
```

`spring-ai-alibaba-starter-dashscope` 会自动根据这个配置注册一个 `EmbeddingModel` Bean。Spring AI 的 `SimpleVectorStore` 需要注入这个 Bean 来做文本向量化。

---

## 配置类：RagConfig

`SimpleVectorStore` 是一个基于内存的向量存储实现，构造时需要传入 `EmbeddingModel`。用一个 `@Configuration` 类来注册 Bean：

```java
@Configuration
public class RagConfig {

    @Bean
    public VectorStore vectorStore(EmbeddingModel embeddingModel) {
        return SimpleVectorStore.builder(embeddingModel).build();
    }
}
```

这里的 `EmbeddingModel` 就是上一步由 `spring-ai-alibaba-starter-dashscope` 自动注册的 DashScope Embedding 模型 Bean。`SimpleVectorStore` 内部会用这个模型将文本转为向量，并在查询时计算余弦相似度。

生产环境通常会换成持久化的向量存储（如 PgVector、Redis、Milvus 等），但接口都是 `VectorStore`，上层代码完全不用改。这也是 Spring AI 向量存储的设计优势—面向接口编程，底层实现可替换。

---

## 文档加载器：DocumentLoader

这是整个 RAG 流程中最核心的一步—把原始文档变成向量数据。`DocumentLoader` 负责扫描、解析、分块、写入四个步骤：

```java
@Slf4j
@Component
@RequiredArgsConstructor
public class DocumentLoader {

    private final VectorStore vectorStore;

    @Value("classpath:document/Java8Gu5/DDD")
    private Resource dddDir;

    public int loadDddDocuments() throws IOException {
        ResourcePatternResolver resolver = new PathMatchingResourcePatternResolver();
        Resource[] resources = resolver.getResources(
                "classpath:document/Java8Gu5/DDD/**/*.md");

        if (resources.length == 0) {
            log.warn("未找到 DDD 目录下的任何文档");
            return 0;
        }

        log.info("扫描到 {} 个文档文件", resources.length);

        List<Document> allChunks = new ArrayList<>();
        TokenTextSplitter splitter = new TokenTextSplitter();

        for (Resource resource : resources) {
            String filename = resource.getFilename();
            try {
                // ① Tika 解析：Markdown → Document 对象
                TikaDocumentReader reader = new TikaDocumentReader(resource);
                List<Document> documents = reader.get();

                // ② 添加来源元数据（检索时可以看到出自哪个文件）
                documents.forEach(doc ->
                        doc.getMetadata().put("source", filename));

                // ③ TokenTextSplitter 分块
                List<Document> chunks = splitter.apply(documents);
                allChunks.addAll(chunks);
                log.info("解析文件 [{}] → {} 个原始文档 → {} 个分块",
                        filename, documents.size(), chunks.size());
            } catch (Exception e) {
                log.error("解析文件 [{}] 失败，跳过: {}",
                        filename, e.getMessage());
            }
        }

        // ④ 批量写入向量存储
        if (!allChunks.isEmpty()) {
            vectorStore.add(allChunks);
            log.info("共写入 {} 个文档分块到向量存储", allChunks.size());
        }

        return resources.length;
    }
}
```

几个值得说的点：

### TikaDocumentReader

`TikaDocumentReader` 是 Spring AI 封装的 Apache Tika 解析器。Tika 是一个通用的文档解析库，支持几十种格式（PDF、DOCX、HTML、TXT、Markdown 等），统一输出为 `Document` 对象。`Document` 是 Spring AI 的核心数据模型，包含文本内容和元数据（metadata）。

用 Tika 的好处是格式无关—以后如果要加 PDF 或 Word 文档到知识库，不需要改任何代码，Tika 会根据文件扩展名自动选择解析策略。

### TokenTextSplitter

原始的 Markdown 文档可能很长（几千字），直接转成向量的话，检索精度会很低。`TokenTextSplitter` 按 token 数量将文档切成更小的块，默认配置是每个块约 800 个 token，块之间有约 350 个 token 的重叠（保证上下文不丢失）。

这个 " 分块 " 步骤是 RAG 效果的关键。块太大，检索不精准；块太小，上下文不完整。`TokenTextSplitter` 的默认参数在大多数场景下表现还不错，后续可以根据实际效果调整。

### VectorStore.add()

`vectorStore.add(chunks)` 做了两件事：① 调用 `EmbeddingModel` 将每个 chunk 的文本转为向量；② 将向量和原文一起存入 `SimpleVectorStore` 的内存数据结构中。后续调用 `similaritySearch()` 时，它会计算查询向量和所有文档向量的余弦相似度，返回最相关的 top-K 个文档。

---

## RAG 问答：RagApp

文档加载好了，现在需要一个入口来串联 RAG 检索 + AI 对话。`RagApp` 的设计思路和之前的 `InterViewApp` 类似，核心区别是在 Advisor 链中加入了 `QuestionAnswerAdvisor`：

```java
@Slf4j
@Component
public class RagApp {

    private final ChatClient chatClient;
    private final DocumentLoader documentLoader;

    public RagApp(ChatModel chatModel, VectorStore vectorStore,
                  DocumentLoader documentLoader) {
        this.documentLoader = documentLoader;

        // 对话记忆：内存存储 + 滑动窗口
        var chatMemory = MessageWindowChatMemory.builder()
                .chatMemoryRepository(new InMemoryChatMemoryRepository())
                .maxMessages(10)
                .build();

        chatClient = ChatClient.builder(chatModel)
                .defaultSystem("你是一个专业的技术问答助手，请根据提供的知识库文档"
                        + "回答用户问题。如果知识库中没有相关信息，请如实告知。")
                .defaultAdvisors(
                        MessageChatMemoryAdvisor.builder(chatMemory).build(),
                        QuestionAnswerAdvisor.builder(vectorStore).build(),
                        MyLoggerAdvisor.builder().build()
                )
                .build();
    }

    public int initKnowledgeBase() throws IOException {
        return documentLoader.loadDddDocuments();
    }

    public String doChatWithRag(String message, String chatId) {
        ChatResponse chatResponse = chatClient
                .prompt()
                .user(message)
                .advisors(spec -> spec.param(
                        ChatMemory.CONVERSATION_ID, chatId))
                .call()
                .chatResponse();

        String content = null;
        if (chatResponse != null && chatResponse.getResult() != null) {
            content = chatResponse.getResult().getOutput().getText();
        }
        log.info("RAG 回答: {}", content);
        return content;
    }
}
```

### QuestionAnswerAdvisor 的工作原理

`QuestionAnswerAdvisor` 实现了 Spring AI 的 `BaseAdvisor` 接口，在 `before()` 阶段拦截请求，做的事情是：

```java
① 拿到用户的问题文本
② 调用 vectorStore.similaritySearch(query) 检索最相关的文档
③ 把检索到的文档片段拼接到用户 prompt 的后面
④ 将增强后的 prompt 传递给下游（AI 模型）
```

用户完全感知不到这个检索过程—对他们来说，就是在跟 AI 对话，但 AI 的回答会基于知识库内容，而不是纯靠 " 幻觉 " 生成。

### Advisor 链的执行顺序

```java
用户提问 "什么是领域驱动设计？"
    ↓
① MessageChatMemoryAdvisor  ← 将问题存入对话记忆
    ↓
② QuestionAnswerAdvisor     ← 向量检索，找到 DDD 文档中的相关片段
    ↓
③ MyLoggerAdvisor           ← 记录增强后的完整 prompt
    ↓
DashScope qwen-plus         ← 基于检索到的文档 + 对话上下文生成回答
    ↓
返回答案
```

---

## 单元测试

写了一个 `@SpringBootTest` 集成测试来验证完整的 RAG 流程：

```java
@Slf4j
@SpringBootTest
class RagAppTest {

    @Resource
    private RagApp ragApp;

    @BeforeEach
    void setUp() throws IOException {
        int count = ragApp.initKnowledgeBase();
        log.info("知识库初始化完成，导入 {} 个文档", count);
        Assertions.assertTrue(count > 0, "应至少导入 1 个文档");
    }

    @Test
    void testRagChat() {
        String chatId = UUID.randomUUID().toString();

        // 第一轮：基于 DDD 知识库提问
        String answer1 = ragApp.doChatWithRag(
                "什么是领域驱动设计？", chatId);
        Assertions.assertNotNull(answer1);
        Assertions.assertFalse(answer1.isBlank());

        // 第二轮：追问（测试对话记忆）
        String answer2 = ragApp.doChatWithRag(
                "DDD 的分层架构是怎么样的？", chatId);
        Assertions.assertNotNull(answer2);

        // 第三轮：再追问聚合概念
        String answer3 = ragApp.doChatWithRag(
                "什么是聚合和聚合根？", chatId);
        Assertions.assertNotNull(answer3);
    }
}
```

`@BeforeEach` 中初始化知识库，确保每次测试前向量存储里都有数据（`SimpleVectorStore` 是内存存储，每个测试类启动时是空的）。三轮对话测试了两件事：① RAG 检索能命中 DDD 文档；② `MessageChatMemoryAdvisor` 让多轮对话保持上下文连贯。

---

## 新增/修改文件

```java
src/main/java/com/muzi/muaiagent/
├── rag/
│   ├── config/
│   │   └── RagConfig.java                  # VectorStore Bean 配置
│   ├── loader/
│   │   └── DocumentLoader.java             # Tika 解析 + 分块 + 向量化写入
│   └── app/
│       └── RagApp.java                     # RAG 问答入口
│
src/main/resources/
├── application.yml                         # [修改] 新增 embedding 模型配置
├── document/Java8Gu5/DDD/                  # 知识库文档目录
│   ├── ✅如何理解领域驱动设计？.md
│   ├── ✅DDD的分层架构是怎么样的？.md
│   ├── ✅什么是聚合，什么是聚合根？.md
│   ├── ✅什么是领域事件？.md
│   └── ✅什么是充血模型和贫血模型？.md

src/test/java/com/muzi/muaiagent/
└── RagAppTest.java                         # RAG 问答集成测试

pom.xml                                     # [修改] 新增 tika、vector-store、advisors 依赖
```

---

## 遇到的问题

### 1. SimpleVectorStore 的 artifactId 不是直觉上的名字

写依赖时第一反应是 `spring-ai-vector-store-simple`，结果 Maven 报找不到版本。去 Maven Central 查了 `org.springframework.ai` 下的所有 artifact，发现根本没有这个名字。`SimpleVectorStore` 类在 `spring-ai-vector-store` 模块中，和 `VectorStore` 接口在同一个 artifact 里。

**经验**：Spring AI 的模块命名不完全按类名来。向量存储相关的类（`VectorStore`、`SimpleVectorStore`、`SearchRequest` 等）都在 `spring-ai-vector-store` 这一个模块里。遇到不确定的 artifactId，直接去 Maven Central 搜 `org.springframework.ai` 看目录列表最靠谱。

### 2. QuestionAnswerAdvisor 在单独的 Advisors 模块中

一开始以为 `QuestionAnswerAdvisor` 和 `MessageChatMemoryAdvisor` 一样，已经被 `spring-ai-alibaba-starter-dashscope` 传递引入了。结果编译时报 `ClassNotFoundException`。

用 `mvn dependency:tree` 查了一下，`spring-ai-advisors-vector-store` 并没有被任何 starter 传递引入，需要单独声明依赖。这也符合 Spring AI 的模块化思路—Advisor 是可选的增强组件，用哪个就引哪个。

### 3. Windows 下 Maven 的 JAVA_HOME 设置

编译时习惯性用 `set JAVA_HOME=E:\Java\jdk21`，结果 Maven 报 " 不支持发行版本 21"—说明 `set` 在 Git Bash 环境下不生效，JDK 版本回退到了系统默认的 JDK 8。

**解决**：改用 `export JAVA_HOME="E:/Java/jdk21"`（export 而非 set）。这是 Git Bash 和 CMD 的环境变量设置差异，和 Spring AI 无关，但每次都容易踩。

---

## 心得体会

RAG 这个功能，实现起来其实不复杂—Spring AI 把文档解析、向量存储、检索增强这些底层能力都封装好了，我们只需要把几个组件拼在一起就行。`TikaDocumentReader` 负责 " 读 "，`TokenTextSplitter` 负责 " 切 "，`SimpleVectorStore` 负责 " 存 "，`QuestionAnswerAdvisor` 负责 " 查 "。四步走，一个完整的技术文档问答系统就搭起来了。

但 RAG 的效果好不好，关键不在代码量，而在几个工程细节：

- **分块策略**：`TokenTextSplitter` 的默认参数（800 token/块，350 token 重叠）在大多数场景下够用，但如果文档结构很规整（比如有明确的标题层级），可以换成按段落或标题分块，效果更好
- **文档质量**：知识库文档本身的质量直接决定了回答质量。垃圾进，垃圾出
- **Embedding 模型选择**：DashScope 的 `text-embedding-v3` 是目前中文效果最好的向量化模型之一，1024 维，性价比很高
- **向量存储的选型**：`SimpleVectorStore` 是纯内存的，重启就丢了。生产环境需要换持久化方案（PgVector、Redis、Milvus 等），但代码层面只需要换一个 Bean 定义，上层完全不感知

从项目整体来看，这篇文章算是把 RAG 的基础能力补齐了。之前有 Advisor 链、结构化输出、记忆管理、Prompt 模板、多模态视觉，现在又有了知识库检索。一个完整的 AI Agent 应用所需的核心组件基本都到位了。

下一步打算把 RAG 和之前的面试助手结合起来—让面试助手不仅能聊天出题，还能根据知识库里的面试题来生成更精准的问答。

---

> 项目地址：[mu-ai-agent](https://github.com/MuziGeek/mu-ai-agent)
