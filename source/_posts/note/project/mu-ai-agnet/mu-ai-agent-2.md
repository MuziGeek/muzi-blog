---
title: 自定义Advisor实现敏感词过滤
date: 2026-06-07 12:00:00
categories:
  - - 项目
    - mu-ai-agnet
tags:
  - AI Agent
  - Spring AI
  - Advisor
  - DFA算法
---
**2026-06-07**🌱上海: ☀️ 🌡️+79°F 🌬️N8mph

# Mu-ai-agent-2

## 前言

在 Spring AI 的 ChatClient 体系中，**Advisor** 是一套非常优雅的拦截器机制，类似于 Spring MVC 的 Interceptor 或 Servlet 的 Filter。它可以让你在 AI 请求发送前和响应返回后插入自定义逻辑，而不需要改动业务代码。

这次的需求是：在用户输入发给 AI 模型之前，检查是否包含敏感词，如果有则替换为 `***`。通过实现一个 `SensitiveWordAdvisor`，顺便把 Advisor 链的底层原理摸了一遍。

---

## Advisor 是什么

可以把 Advisor 想象成一条流水线上的 " 质检工位 "：

```java
用户输入 → [Advisor1.before] → [Advisor2.before] → ... → AI 模型
AI 响应 → [...after] → [Advisor2.after] → [Advisor1.after] → 返回用户
```

Spring AI 提供了三种粒度的 Advisor 接口：

| 接口 | 特点 | 适用场景 |
|------|------|---------|
| **BaseAdvisor** | 实现 `before()` + `after()` 即可，同时支持同步和流式 | 大多数场景 |
| **CallAdvisor** | 手动控制同步调用链，可决定是否传递 | 需要短路/跳过逻辑 |
| **StreamAdvisor** | 手动控制流式调用链 | 流式聚合处理 |

本次实现选用 `BaseAdvisor`，最简单也最常用。

多个 Advisor 通过 `getOrder()` 决定执行顺序：值越小越先执行 `before()`，越后执行 `after()`。类比进办公楼—保安检查（order=0）→ 前台登记（order=1）→ 进会议室（AI 模型），出来时顺序反过来。

---

## 动手实现：SensitiveWordAdvisor

### 1. DFA 敏感词过滤器

敏感词匹配用 DFA（确定有限自动机 / Trie 前缀树）实现，核心思想是把所有敏感词构建成一棵前缀树：

```java
root → [暴] → [力] → END
              [乱] → END
```

" 暴力 " 和 " 暴乱 " 共享了 " 暴 " 这个前缀节点，节省内存。匹配时采用**最长匹配**策略—词库有 " 中国 " 和 " 中国人 "，输入 " 中国人 " 会匹配更长的 " 中国人 "。

核心代码：

```java
@Component
public class SensitiveWordFilter {

    private final Map<Character, Object> root = new HashMap<>();
    private final Set<String> wordSet = new HashSet<>();

    // 启动时从 classpath:sensitive-words.txt 加载词库
    @PostConstruct
    public void init() {
        // 逐行读取，跳过 # 注释和空行
        // 每个词调用 addWordToDfa() 构建前缀树
    }

    // 将单个词插入 DFA
    private void addWordToDfa(String word) {
        Map<Character, Object> currentNode = root;
        for (int i = 0; i < word.length(); i++) {
            char ch = word.charAt(i);
            Object child = currentNode.get(ch);
            if (child == null) {
                Map<Character, Object> newNode = new HashMap<>();
                currentNode.put(ch, newNode);
                currentNode = newNode;
            } else {
                currentNode = (Map<Character, Object>) child;
            }
            if (i == word.length() - 1) {
                currentNode.put('\0', Collections.singletonMap("isEnd", true));
            }
        }
    }

    // 替换敏感词为 ***
    public String replaceSensitiveWords(String text) {
        StringBuilder result = new StringBuilder();
        int i = 0;
        while (i < text.length()) {
            int len = matchLength(text, i);  // DFA 匹配
            if (len > 0) {
                result.append("***");
                i += len;      // 跳过整个敏感词
            } else {
                result.append(text.charAt(i));
                i++;
            }
        }
        return result.toString();
    }
}
```

敏感词放在 `src/main/resources/sensitive-words.txt`，每行一个词，`#` 开头为注释，修改词库不需要改代码。

### 2. 编写 Advisor

```java
public class SensitiveWordAdvisor implements BaseAdvisor {

    private final SensitiveWordFilter sensitiveWordFilter;
    private int order = 0;

    @Override
    public ChatClientRequest before(ChatClientRequest request, AdvisorChain chain) {
        String userText = request.prompt().getUserMessage().getText();

        if (sensitiveWordFilter.containsSensitiveWord(userText)) {
            String filtered = sensitiveWordFilter.replaceSensitiveWords(userText);
            logger.warn("检测到敏感词，已替换。原始长度: {}, 替换后长度: {}",
                    userText.length(), filtered.length());

            return request.mutate()
                    .prompt(request.prompt().augmentUserMessage(filtered))
                    .build();
        }
        return request;
    }

    @Override
    public ChatClientResponse after(ChatClientResponse response, AdvisorChain chain) {
        return response;  // 只过滤输入，输出透传
    }
}
```

这里有两个关键 API—`mutate()` 和 `augmentUserMessage()`，下面详细分析它们的源码。

### 3. 集成到 ChatClient

```java
public InterViewApp(ChatModel dashscopeChatModel, SensitiveWordFilter sensitiveWordFilter) {
    ChatMemory chatMemory = MessageWindowChatMemory.builder()
            .chatMemoryRepository(new InMemoryChatMemoryRepository())
            .maxMessages(10)
            .build();

    chatClient = ChatClient.builder(dashscopeChatModel)
            .defaultSystem(SYSTEM_PROMPT)
            .defaultAdvisors(
                MessageChatMemoryAdvisor.builder(chatMemory).build(),
                new SensitiveWordAdvisor(sensitiveWordFilter),  // 敏感词过滤
                MyLoggerAdvisor.builder().build()
            )
            .build();
}
```

---

## 源码分析

### mutate()—不可变对象的 " 变异 "

`ChatClientRequest` 是一个 Java `record`，天然不可变—所有字段都是 `final`，无法直接修改。要 " 修改 " 只能基于旧对象创建新的：

```java
// ChatClientRequest 源码
public record ChatClientRequest(Prompt prompt, Map<String, Object> context) {

    public Builder mutate() {
        return new Builder()
            .prompt(this.prompt.copy())           // 深拷贝 Prompt
            .context(new HashMap<>(this.context)); // 拷贝 context
    }
}
```

调用 `mutate()` 拿到一个 Builder（里面是旧数据的拷贝），在上面改完再 `.build()` 得到新对象。原来的对象完全没被动过。

为什么这样设计？因为 Advisor 链中多个 Advisor 可能并发处理同一个请求，不可变模式保证互不干扰。

> 注意：record 保证的是**引用不可变**（不能把 `prompt` 字段指向另一个对象），不是深层不可变。所以 `mutate()` 里特意做了 `new HashMap<>(this.context)` 防止引用共享。

### augmentUserMessage()—替换用户消息

```java
// Prompt 源码
public Prompt augmentUserMessage(String newUserText) {
    return augmentUserMessage(
        userMessage -> userMessage.mutate().text(newUserText).build()
    );
}

public Prompt augmentUserMessage(Function<UserMessage, UserMessage> augmenter) {
    var messagesCopy = new ArrayList<>(this.messages);

    // 从后往前找最后一条 UserMessage（对话历史中可能有多个）
    for (int i = messagesCopy.size() - 1; i >= 0; i--) {
        Message message = messagesCopy.get(i);
        if (message instanceof UserMessage userMessage) {
            messagesCopy.set(i, augmenter.apply(userMessage));  // 替换
            break;
        }
    }

    return new Prompt(messagesCopy,
        null == this.chatOptions ? null : this.chatOptions.copy());
}
```

关键点：
- 从后往前找，因为 " 当前用户输入 " 是最后一条 UserMessage
- 用 `augmenter.apply()` 处理这条消息（Lambda 内部做了 `mutate().text(newText).build()`）
- 其他消息（SystemMessage、历史 AssistantMessage 等）保持不变
- 返回新的 Prompt 对象

### 整条调用链展开

```java
// 我们写的一行代码
request.mutate().prompt(request.prompt().augmentUserMessage(filtered)).build();

// 实际展开后的完整流程：
UserMessage original = request.prompt().getUserMessage();      // 取出原始消息
UserMessage modified = original.mutate()                       // 拿到 Builder
    .text("关于***的问题")                                       // 设置新文本
    .build();                                                   // 新 UserMessage

List<Message> msgsCopy = new ArrayList<>(prompt.getMessages());// 拷贝消息列表
msgsCopy.set(lastIndex, modified);                              // 替换最后一条

Prompt newPrompt = new Prompt(msgsCopy, prompt.getOptions());   // 新 Prompt

ChatClientRequest.Builder builder = request.mutate();           // 拷贝整个 request
builder.prompt(newPrompt);                                      // 设置新 Prompt
ChatClientRequest newRequest = builder.build();                 // 新 Request
```

每一步都产生新对象，旧对象不被修改。这就是不可变链的精髓。

---

## Advisor 链的传递机制

这是理解整个机制最关键的部分。Spring AI 用 `DefaultAroundAdvisorChain` 实现链条传递，内部用 `Deque`（双端队列）存放所有 Advisor：

```java
// DefaultAroundAdvisorChain 源码（核心）
public ChatClientResponse nextCall(ChatClientRequest chatClientRequest) {
    var advisor = this.callAdvisors.pop();  // 弹出一个 Advisor
    return advisor.adviseCall(chatClientRequest, this);  // 让它处理，链条自身也传进去
}
```

而 `BaseAdvisor` 的 `adviseCall()` 是这样的：

```java
default ChatClientResponse adviseCall(ChatClientRequest request, CallAdvisorChain chain) {
    ChatClientRequest processed = before(request, chain);      // 你的 before()
    ChatClientResponse response = chain.nextCall(processed);   // 传给下一个！
    return after(response, chain);                              // 你的 after()
}
```

关键在 `chain.nextCall(processed)`—把 `before()` 返回的新对象传回给链条，链条再 `pop()` 出下一个 Advisor。

### 完整执行流程

```java
Request_0: UserMessage = "关于暴力的问题"
    │
    ▼  SensitiveWordAdvisor.before()
Request_1: UserMessage = "关于***的问题"        ← 敏感词被替换
    │
    ▼  MessageChatMemoryAdvisor.before()
Request_2: [SystemMessage, 历史消息..., "关于***的问题"]  ← 追加上下文
    │
    ▼  MyLoggerAdvisor.before()
Request_2:（不变，仅记录日志）
    │
    ▼  ChatModelCallAdvisor → DashScope qwen-plus → Response
    │
    ▼  沿 after() 反向回传 → 返回给用户
```

**" 每个 Advisor 都创建新对象，怎么统一？"**—答案是：不需要统一。这是管道（Pipeline）不是并行，每个 Advisor 在上一个的结果上修改，最后到达 AI 模型的已经是包含所有修改的最终版本。就像接力赛的接力棒，每一棒传给下一个人，终点那根已经经历了所有加工。

---

## 新增文件

```java
src/main/java/com/muzi/muaiagent/
├── filter/
│   └── SensitiveWordFilter.java       # DFA 敏感词过滤器
└── advisor/
    └── SensitiveWordAdvisor.java      # 自定义 Advisor
src/main/resources/
└── sensitive-words.txt                # 敏感词词库
```

### 修改文件

```java
src/main/java/com/muzi/muaiagent/app/
└── InterViewApp.java                  # 注入 SensitiveWordFilter，添加 Advisor
```

---

## 遇到的问题

### 1. 不可变对象怎么修改？

一开始不太理解 `mutate()` 的设计，以为可以直接 `request.setPrompt()`。实际上 `ChatClientRequest` 是 Java record，所有字段都是 `final`。

**解决**：理解不可变对象模式—不能改旧的，只能基于旧的创建新的。`mutate()` → Builder → `.build()` 三步走。

### 2. augmentUserMessage 是替换还是追加？

方法名叫 "augment"（增强），容易以为是追加文本。

**解决**：看源码发现它实际上是**替换**最后一条 UserMessage 的全部文本。如果需要追加效果（比如 ReReadingAdvisor），需要在 `before()` 里自己拼接好完整文本再传进去。

### 3. 多个 Advisor 的 order 怎么配？

三个 Advisor 都是 `order=0`，执行顺序取决于注册顺序。

**解决**：`DefaultAroundAdvisorChain` 使用 `OrderComparator.sort()` 排序，order 相同时保持注册顺序。建议给不同 Advisor 设置不同的 order 值让顺序更明确。

---

## 心得体会

这次实现最大的收获是把 Spring AI Advisor 链的底层机制彻底搞清楚了。之前只是知道 " 在 before 里改请求，在 after 里改响应 "，但不理解新对象是怎么传递和统一的。

看了 `DefaultAroundAdvisorChain` 的源码后恍然大悟—它用 Deque + pop 实现了责任链，每个 Advisor 调用 `chain.nextCall(新对象)` 把修改后的请求传给下一个。根本不存在 " 统一 " 这个步骤，管道本身就是统一的。

DFA 算法也很有意思，之前一直用暴力 `contains()` 做敏感词匹配，换成 Trie 之后性能差距巨大。10000 个词 + 200 字文本，暴力法最坏 200 万次比较，DFA 只要 2000 次操作。

下一步考虑把敏感词从文件迁移到数据库，支持热更新，不用重启应用就能修改词库。

---

> 项目地址：[mu-ai-agent](https://github.com/xxx/mu-ai-agent)
