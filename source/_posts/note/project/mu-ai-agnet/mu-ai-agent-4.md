---
title: 聊天记忆持久化
date: 2026-06-09 20:00:00
categories:
  - - 项目
    - mu-ai-agnet
tags:
  - AI Agent
  - Spring AI
  - ChatMemory
  - Kryo
  - 多态序列化
---
**2026-06-09**🌱上海: ☀️ 🌡️+82°F 🌬️SE6mph

# Mu-ai-agent-4

## 前言

在前面的文章中，我们用 `MessageChatMemoryAdvisor` 让 AI 助手具备了 " 记住上下文 " 的能力—它能记住你之前问了什么，对话不再 " 断片 "。但当时用的是 `InMemoryChatMemoryRepository`，所有对话都存在内存里，应用一重启就全丢了。

这对于一个真正要上线的应用来说显然不行。这篇文章就来深入聊聊 Spring AI 的聊天记忆持久化：它是怎么设计的、为什么序列化 Message 对象会比想象中复杂、以及怎么自己实现一个数据库持久化方案。

---

## Spring AI 聊天记忆的架构

Spring AI 把 " 记忆 " 拆成了两层，职责很清晰：

```java
ChatMemory（接口）        ← 上层：记忆管理策略（滑动窗口、Token 限制等）
  └── MessageWindowChatMemory  ← 唯一内置实现：滑动窗口
        └── ChatMemoryRepository（接口）  ← 下层：具体存储（内存/文件/数据库/Redis）
```

`ChatMemory` 接口定义很简单：

```java
public interface ChatMemory {
    void add(String conversationId, List<Message> messages);  // 存消息
    List<Message> get(String conversationId);                 // 取消息
    void clear(String conversationId);                        // 清空
}
```

`ChatMemoryRepository` 接口也很简洁：

```java
public interface ChatMemoryRepository {
    List<String> findConversationIds();
    List<Message> findByConversationId(String conversationId);
    void saveAll(String conversationId, List<Message> messages);  // 全量替换
    void deleteByConversationId(String conversationId);
}
```

注意到一个关键设计：`saveAll()` 是**全量替换**而非追加。这和 `MessageWindowChatMemory` 的滑动窗口策略有关—它每次保存的可能是截断后的结果，所以需要覆盖旧数据。

---

## MessageWindowChatMemory 滑动窗口机制

`MessageWindowChatMemory` 是 Spring AI 内置的唯一 `ChatMemory` 实现。它的核心逻辑在 `process()` 方法中：

```java
private List<Message> process(List<Message> memoryMessages, List<Message> newMessages) {
    // 1. 合并旧消息和新消息
    List<Message> processedMessages = new ArrayList<>();
    //    如果新消息中有 SystemMessage，先把旧的 SystemMessage 移除（避免重复）
    processedMessages.addAll(过滤后的旧消息);
    processedMessages.addAll(newMessages);

    // 2. 如果总数没超限，直接返回
    if (processedMessages.size() <= this.maxMessages) {
        return processedMessages;
    }

    // 3. 超限时，从前往后淘汰旧消息，但 SystemMessage 永远不会被淘汰
    int messagesToRemove = processedMessages.size() - this.maxMessages;
    //    遍历：遇到 SystemMessage 跳过不删，其他的依次删除直到数量达标
    //    ...
}
```

有几个值得注意的点：

`maxMessages` 控制的是总消息数（不是 Token 数）。我们设了 `maxMessages=10`，表示一个会话最多保留 10 条消息。当第 11 条进来时，最早的非系统消息会被淘汰。

`SystemMessage` 享有 " 免死金牌 "—无论窗口怎么滑动，系统提示词永远不会被淘汰。这很合理，因为系统提示词定义了 AI 的角色和行为规则，丢了它对话就会 " 失忆 "。

新消息进来时，如果包含一个之前没见过的 `SystemMessage`，旧的 `SystemMessage` 会被移除，确保只有一个生效。

---

## Message 接口的多态序列化问题

这是理解聊天记忆持久化最核心的部分。

Spring AI 的 `Message` 是一个接口，有 4 个具体实现类：

```java
Message（接口）
  └── AbstractMessage（抽象基类，持有 messageType / textContent / metadata）
        ├── UserMessage        （用户消息，role=user，额外有 media 字段）
        ├── AssistantMessage   （AI 回复，role=assistant，额外有 toolCalls、media）
        ├── SystemMessage      （系统提示词，role=system）
        └── ToolResponseMessage（工具调用结果，role=tool）
```

`ChatMemoryRepository` 存的是 `List<Message>`，一个会话里的消息肯定是混合类型—用户说一句（`UserMessage`），AI 回一句（`AssistantMessage`），可能还有系统提示词（`SystemMessage`）。

问题来了：把这堆不同类型的对象存下来、再取回来时，怎么保证每个对象还原成正确的子类？

这就是经典的**多态序列化**问题。

---

## 三种存储方案

### 方案一：InMemoryChatMemoryRepository（内存）

最简单的实现，底层就是一个 `ConcurrentHashMap`：

```java
public final class InMemoryChatMemoryRepository implements ChatMemoryRepository {
    Map<String, List<Message>> chatMemoryStore = new ConcurrentHashMap<>();

    @Override
    public void saveAll(String conversationId, List<Message> messages) {
        this.chatMemoryStore.put(conversationId, messages);
    }

    @Override
    public List<Message> findByConversationId(String conversationId) {
        return this.chatMemoryStore.get(conversationId);
    }
}
```

对象直接存内存，不涉及任何序列化，所以不存在多态问题。优点是最简单、零配置；缺点是重启就没了。适合开发调试。

### 方案二：FileBasedChatMemory（Kryo 序列化）

这是我们之前自己实现的方案，用 Kryo 把 `List<Message>` 序列化为二进制文件：

```java
public class FileBasedChatMemory implements ChatMemoryRepository {

    private static final Kryo kryo = new Kryo();
    static {
        kryo.setRegistrationRequired(false);
        kryo.setInstantiatorStrategy(new StdInstantiatorStrategy());
    }

    @Override
    public void saveAll(String conversationId, List<Message> messages) {
        try (Output output = new Output(new FileOutputStream(file))) {
            kryo.writeObject(output, new ArrayList<>(messages));
        }
    }

    @Override
    public List<Message> findByConversationId(String conversationId) {
        try (Input input = new Input(new FileInputStream(file))) {
            return kryo.readObject(input, ArrayList.class);
        }
    }
}
```

每个会话对应一个 `.kryo` 文件，保存在 `chat-memory/` 目录下。Kryo 能自动处理多态序列化，下面详细分析原因。

### 方案三：数据库持久化

Spring AI 官方提供了 `JdbcChatMemoryRepository`，我们也自己实现了一个学习版 `DbChatMemoryRepository`。这种方案完全绕开序列化，后面重点分析。

三种方案的对比：

| 特性 | 内存（InMemory）| 文件（Kryo）| 数据库（JDBC）|
|------|-----------------|-------------|---------------|
| 多态处理 | 不涉及 | Kryo 自动嵌入类信息 | 手动拆解 + switch 还原 |
| 持久化 | ❌ 重启丢失 | ✅ 文件 | ✅ 数据库 |
| 数据可读性 | 内存对象 | 二进制不可读 | 明文 SQL 可直接查看 |
| 字段完整性 | 完整 | 完整 | 只保存 text + type |
| 分布式支持 | ❌ | ❌ 本地文件 | ✅ 共享数据库 |
| 查询能力 | 按会话 ID | 按会话 ID | 灵活 SQL 查询 |

---

## Kryo Vs JSON：多态序列化详解

### 为什么 Kryo " 自动 " 就能处理？

Kryo 序列化一个对象时，会在二进制流中**自动记录该对象的实际 Class 信息**。比如序列化一个 `UserMessage`，写入的数据大致是：

```java
[类标识: UserMessage] [messageType: USER] [textContent: "你好"] [metadata: {...}] [media: []]
```

反序列化时，Kryo 读取类标识，直接实例化对应的 `UserMessage`，不需要任何额外配置。

两个关键配置让它能 " 自动 " 工作：

```java
kryo.setRegistrationRequired(false);  // 不要求预注册类，允许序列化任意类
kryo.setInstantiatorStrategy(new StdInstantiatorStrategy());  // Objenesis 实例化策略
```

`StdInstantiatorStrategy` 特别重要—Spring AI 的 `AssistantMessage` 没有无参构造器（它的构造器至少需要 `String content`），普通反射会报 `NoSuchMethodException`，但 Objenesis 可以绕过构造器直接分配内存创建对象。

### JSON（Jackson）为什么不行？

如果用 Jackson 序列化 `List<Message>`，生成的 JSON 是这样的：

```json
[
  {"messageType": "USER", "textContent": "你好", "metadata": {}},
  {"messageType": "ASSISTANT", "textContent": "你好！", "toolCalls": [], "metadata": {}}
]
```

**反序列化时报错**：

```java
Cannot construct instance of `Message`: abstract types either need to be mapped
to concrete types, have custom deserializer, or contain additional type information
```

Jackson 看到声明类型是 `Message`（接口），不知道该实例化哪个具体类。要解决这个问题，有三种办法：

**方案 A**：给接口加 `@JsonTypeInfo` 注解。但 Spring AI 的源码你改不了。

**方案 B**：开启 Jackson 的 `DefaultTyping`，让每个对象都带上 `@class` 字段。能工作但 JSON 变得不干净，而且有安全风险（反序列化漏洞）。

**方案 C**：手动按类型分发—这就是 Spring AI 官方 JDBC 实现的做法，下面重点分析。

---

## Spring AI 官方 JDBC 实现源码分析

`JdbcChatMemoryRepository` 的解决思路非常优雅：**不做对象序列化，而是把 Message 拆成简单字段存入数据库**。

### 写入：拆解 Message

```java
// JdbcChatMemoryRepository 内部的 AddBatchPreparedStatement
public void setValues(PreparedStatement ps, int i) throws SQLException {
    var message = this.messages.get(i);
    ps.setString(1, this.conversationId);              // 会话 ID
    ps.setString(2, message.getText());                // 消息文本
    ps.setString(3, message.getMessageType().name());  // "USER" / "ASSISTANT" / "SYSTEM" / "TOOL"
    ps.setTimestamp(4, new Timestamp(...));            // 时间戳
}
```

数据库表结构（以 MySQL 方言为例）：

```sql
CREATE TABLE SPRING_AI_CHAT_MEMORY (
    conversation_id VARCHAR(255),
    content         TEXT,          -- 消息文本
    type            VARCHAR(20),   -- 消息类型枚举名
    timestamp       TIMESTAMP
);
```

### 读取：switch 手动还原

```java
// JdbcChatMemoryRepository 内部的 MessageRowMapper
public Message mapRow(ResultSet rs, int i) throws SQLException {
    var content = rs.getString(1);
    var type = MessageType.valueOf(rs.getString(2));

    return switch (type) {
        case USER      -> new UserMessage(content);
        case ASSISTANT -> new AssistantMessage(content);
        case SYSTEM    -> new SystemMessage(content);
        case TOOL      -> new ToolResponseMessage(List.of());
    };
}
```

用一个 switch 语句根据 `type` 列的值手动构造正确的子类。完全绕开了序列化框架的类型推断问题。

代价是 `AssistantMessage` 的 `toolCalls`、`media` 等复杂字段会丢失，只保留文本。但对于聊天记忆场景来说，历史对话中的工具调用记录通常不需要完整还原，文本内容就够了。

### 方言抽象

Spring AI 还做了一层方言抽象 `JdbcChatMemoryRepositoryDialect`，针对不同数据库提供不同的 SQL：

```java
public interface JdbcChatMemoryRepositoryDialect {
    String getSelectMessagesSql();     // 查询消息
    String getInsertMessageSql();      // 插入消息
    String getSelectConversationIdsSql(); // 查询会话列表
    String getDeleteMessagesSql();     // 删除消息

    // 自动检测数据库类型
    static JdbcChatMemoryRepositoryDialect from(DataSource dataSource) {
        String url = dataSource.getConnection().getMetaData().getURL().toLowerCase();
        if (url.contains("postgresql")) return new PostgresChatMemoryRepositoryDialect();
        if (url.contains("mysql"))      return new MysqlChatMemoryRepositoryDialect();
        if (url.contains("sqlserver"))  return new SqlServerChatMemoryRepositoryDialect();
        // ...
    }
}
```

MySQL 方言的 SQL：

```java
public class MysqlChatMemoryRepositoryDialect implements JdbcChatMemoryRepositoryDialect {
    public String getSelectMessagesSql() {
        return "SELECT content, type FROM SPRING_AI_CHAT_MEMORY " +
               "WHERE conversation_id = ? ORDER BY `timestamp`";
    }
    public String getInsertMessageSql() {
        return "INSERT INTO SPRING_AI_CHAT_MEMORY (conversation_id, content, type, `timestamp`) " +
               "VALUES (?, ?, ?, ?)";
    }
}
```

这种策略模式的设计让同一套代码可以无缝支持 MySQL、PostgreSQL、SQL Server、HSQLDB 等数据库。

---

## 自己实现数据库持久化

参考 Spring AI 官方的设计，我们自己实现了一个学习版的 `DbChatMemoryRepository`。核心逻辑和官方一致，但更简洁，方便理解原理。

### 建表

```sql
CREATE TABLE IF NOT EXISTS `chat_memory` (
    `id`              BIGINT AUTO_INCREMENT PRIMARY KEY,
    `conversation_id` VARCHAR(100) NOT NULL,
    `content`         TEXT,
    `type`            VARCHAR(20)  NOT NULL,
    `created_at`      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX `idx_conversation_id` (`conversation_id`),
    INDEX `idx_conversation_time` (`conversation_id`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

和官方表结构基本一致，多了自增主键 `id`，索引也做了优化。

### 实现代码

```java
public class DbChatMemoryRepository implements ChatMemoryRepository {

    private final JdbcTemplate jdbcTemplate;

    private static final String SQL_FIND_CONVERSATION_IDS =
            "SELECT DISTINCT conversation_id FROM chat_memory";
    private static final String SQL_FIND_BY_CONVERSATION =
            "SELECT content, type FROM chat_memory WHERE conversation_id = ? ORDER BY created_at";
    private static final String SQL_INSERT_MESSAGE =
            "INSERT INTO chat_memory (conversation_id, content, type, created_at) VALUES (?, ?, ?, ?)";
    private static final String SQL_DELETE_BY_CONVERSATION =
            "DELETE FROM chat_memory WHERE conversation_id = ?";

    public DbChatMemoryRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }
}
```

**查询—switch 还原子类**（和官方 MessageRowMapper 同样的策略）：

```java
@Override
public List<Message> findByConversationId(String conversationId) {
    return jdbcTemplate.query(SQL_FIND_BY_CONVERSATION, (rs, rowNum) -> {
        String content = rs.getString("content");
        MessageType type = MessageType.valueOf(rs.getString("type"));

        // 根据类型手动构造正确的 Message 子类
        return switch (type) {
            case USER      -> new UserMessage(content);
            case ASSISTANT -> new AssistantMessage(content);
            case SYSTEM    -> new SystemMessage(content);
            case TOOL      -> new ToolResponseMessage(List.of());
        };
    }, conversationId);
}
```

**保存—先删后插 + 递增时间戳**：

```java
@Override
public void saveAll(String conversationId, List<Message> messages) {
    deleteByConversationId(conversationId);  // 全量替换策略

    AtomicLong timestampSeq = new AtomicLong(Instant.now().toEpochMilli());
    jdbcTemplate.batchUpdate(SQL_INSERT_MESSAGE, messages, messages.size(), (ps, message) -> {
        ps.setString(1, conversationId);
        ps.setString(2, message.getText());
        ps.setString(3, message.getMessageType().name());
        ps.setTimestamp(4, new Timestamp(timestampSeq.getAndIncrement()));
    });
}
```

`AtomicLong` 递增时间戳的设计来自官方实现—确保同一批次插入的消息有严格的时间顺序（起始值为当前时间，每条 +1ms），查询时按 `created_at` 排序就能还原消息的先后顺序。

### 在 InterViewApp 中切换

三种存储方式只需改一行代码：

```java
public InterViewApp(ChatModel dashscopeChatModel, SensitiveWordFilter sensitiveWordFilter) {
    // 方式一：文件持久化（Kryo）
    ChatMemoryRepository repository = new FileBasedChatMemory(fileDir);

    // 方式二：内存（开发调试）
    // ChatMemoryRepository repository = new InMemoryChatMemoryRepository();

    // 方式三：数据库持久化（需要先建表 + 配置数据源）
    // ChatMemoryRepository repository = new DbChatMemoryRepository(jdbcTemplate);

    ChatMemory chatMemory = MessageWindowChatMemory.builder()
            .chatMemoryRepository(repository)
            .maxMessages(10)
            .build();

    // ...构建 ChatClient
}
```

如果要启用数据库方式，需要三步：执行建表 SQL、配置 `application.yml` 中的数据源、去掉 `MuAiAgentApplication` 上的 `exclude = {DataSourceAutoConfiguration.class}`。

---

## 新增/修改文件

```java
src/main/java/com/muzi/muaiagent/chatmemory/
├── FileBasedChatMemory.java       # 文件持久化（Kryo 序列化）
└── DbChatMemoryRepository.java    # 数据库持久化（学习版，手动拆解 Message）

src/main/resources/db/
└── chat_memory_schema.sql         # 建表 SQL

src/main/java/com/muzi/muaiagent/app/
└── InterViewApp.java              # 更新注释，增加数据库方式说明
```

---

## 遇到的问题

### 1. FileBasedChatMemory 编译报错：两个构造器

之前 InterViewApp 有两个构造器，都试图给 `final chatClient` 赋值，Java 编译器不允许。

**解决**：合并为一个构造器，用注释区分不同的存储方式切换。

### 2. DataSource 自动配置报错

`spring-ai-alibaba-starter-memory` 引入了 JDBC 依赖，Spring Boot 自动配置 DataSource 但没配数据库连接。

**解决**：`@SpringBootApplication(exclude = {DataSourceAutoConfiguration.class})`。如果后续要使用数据库方式，去掉这个 exclude 并配置好数据源即可。

### 3. Kryo 反序列化报 ClassCastException

早期版本 Kryo 反序列化出来的 `List` 被当成了 `List<Object>` 使用，转型失败。

**解决**：确保 `readObject` 时指定了正确的容器类型 `ArrayList.class`，Kryo 会根据二进制流中记录的类信息自动还原每个元素的正确子类。

---

## 心得体会

这次深入研究了 Spring AI 的聊天记忆持久化机制，最大的收获是理解了 " 多态序列化 " 这个核心问题。

之前理所当然地觉得 " 对象存下来再取出来 " 是很简单的事，直到认真看了 `Message` 的继承体系才发现：接口类型 + 多个实现类 = 序列化框架不知道怎么还原。Kryo 通过在二进制中嵌入类信息自动解决了这个问题，代价是数据不可读、不可移植；而 Spring AI 官方的 JDBC 实现用了一种更朴素也更优雅的方式—不做序列化，拆解为简单字段存储，读取时 switch 手动还原。

这种 " 拆解 + 手动还原 " 的思路其实很值得借鉴。在遇到复杂对象的持久化问题时，不要一上来就找序列化框架，先想想：我真的需要完整保存整个对象吗？很多时候只存关键字段就够了，反而更可控、更易维护。

`MessageWindowChatMemory` 的滑动窗口设计也很精巧—`SystemMessage` 永远不会被淘汰、全量替换的保存策略配合窗口截断。理解了这些细节，在实际项目中调整 `maxMessages` 参数时会更有把握。

下一步打算把数据库方式真正跑起来，配合 MySQL 做一次完整的端到端测试，验证重启后对话记忆的恢复效果。

---

> 项目地址：[mu-ai-agent](https://github.com/xxx/mu-ai-agent)
