---
title: Prompt 模板外部化
date: 2026-06-24 18:10:00
categories:
  - - 项目
    - mu-ai-agnet
tags:
  - AI Agent
  - Spring AI
  - PromptTemplate
  - 模板引擎
---
**2026-06-24**🌱上海: ☀️  🌡️+90°F 🌬️S8mph

# mu-ai-agent-5

## 前言

在前面的几篇文章中，我们的 prompt 都是直接硬编码在 Java 代码里的 — 用字符串拼接构造用户消息，或者写一个 `static final String` 常量当系统提示词。这种做法在小规模项目里没什么问题，但随着 prompt 越来越多、越来越长，弊端就显现出来了：

- 想调一下措辞让模型回答更好？得改 Java 代码、重新编译、重新部署
- 多个方法里都有大段的 prompt 字符串，代码可读性很差
- 想统一修改 prompt 风格？得到处翻、到处改

这个问题其实在 Web 开发中早有成熟的解决方案 — 把文本从代码中分离出来，放到独立的模板文件中。就像国际化（i18n）把文案放到 `.properties` 文件里一样，我们也可以把 prompt 放到资源文件中，运行时再加载和填充变量。

这次就来动手实现一套 Prompt 模板外部化方案，顺便把 Spring AI 内置的 `PromptTemplate` 类摸了一遍。

---

## Prompt 外置的核心思路

用一个类比来理解：

```
国际化（i18n）:
  代码: getMessage("welcome", userName)
  文件: messages_zh.properties → welcome=你好，{0}

Prompt 模板:
  代码: render("single-question", Map.of("topic", "JVM"))
  文件: single-question.txt → 请围绕「{topic}」出一道面试题...
```

两者的模式完全一样：**文本外置 + 变量占位符 + 运行时填充**。区别只是 i18n 面向用户界面文案，Prompt 模板面向大模型的输入。

整个方案分三层：

```
resources/prompts/          ← 模板文件层（纯文本，运营可编辑）
    ├── single-question.txt
    ├── question-list.txt
    └── ...
PromptTemplateService       ← 服务层（加载 + 缓存 + 渲染）
    └── render("name", vars)
StructuredOutputApp         ← 业务层（调用服务获取 prompt）
    └── chatClient.prompt().user(promptText)
```

---

## Spring AI 的 PromptTemplate

Spring AI 内置了一个 `PromptTemplate` 类，底层使用 StringTemplate（ST4）引擎。它支持两种初始化方式：

### 方式 A：从字符串创建

```java
// 模板直接写在 Java 代码中
PromptTemplate pt = new PromptTemplate("请围绕「{topic}」出一道面试题");
String text = pt.render(Map.of("topic", "JVM"));
// 结果: "请围绕「JVM」出一道面试题"
```

我们之前在 `ReReadingAdvisor` 里就是这么用的：

```java
// ReReadingAdvisor 中的用法
String augmented = PromptTemplate.builder()
        .template("{re2_input_query}\nRead the question again: {re2_input_query}")
        .variables(Map.of("re2_input_query", userText))
        .build()
        .render();
```

这种方式模板还是硬编码在代码里，并没有解决外部化的问题。

### 方式 B：从 Resource 创建

```java
// 模板存放在资源文件中
PromptTemplate pt = new PromptTemplate(
        new ClassPathResource("prompts/single-question.txt"));

// render() 返回纯文本 String
String text = pt.render(Map.of("topic", "JVM"));

// create() 返回 Prompt 对象（可直接传给 ChatClient）
Prompt prompt = pt.create(Map.of("topic", "JVM"));
```

这个 `Resource` 构造器是关键 — 它让 `PromptTemplate` 可以直接从 classpath 资源文件加载模板，不需要我们自己写文件读取逻辑。

### render() vs create()

`PromptTemplate` 有两个核心渲染方法，返回值类型不同：

| 方法 | 返回类型 | 用途 |
|---|---|---|
| `render(Map)` | `String` | 拿到纯文本，传给 `.user(text)` |
| `create(Map)` | `Prompt` | 直接传给 `chatClient.prompt(prompt)` |

`create()` 内部就是调 `render()` 拿到文本，再封装成 `new Prompt(new UserMessage(text))`。两种写法效果一样，看个人习惯。

---

## 动手实现：两种方案

我实现了两种方案来对比不同的使用风格：

### 方案一：PromptTemplateService（封装层 + 缓存）

创建一个 Spring Bean 封装模板加载和渲染，内部用 `ConcurrentHashMap` 缓存 `PromptTemplate` 实例：

```java
@Slf4j
@Component
public class PromptTemplateService {

    private static final String TEMPLATE_DIR = "prompts/";
    private static final String TEMPLATE_EXT = ".txt";

    // 缓存 PromptTemplate 实例，避免重复读文件
    private final ConcurrentHashMap<String, PromptTemplate> templateCache
            = new ConcurrentHashMap<>();

    // 渲染为纯文本
    public String render(String templateName, Map<String, Object> variables) {
        return getPromptTemplate(templateName).render(variables);
    }

    // 渲染为 Prompt 对象
    public Prompt renderAsPrompt(String templateName, Map<String, Object> variables) {
        return getPromptTemplate(templateName).create(variables);
    }

    // 加载模板原文（用于系统提示词等无变量场景）
    public String loadTemplate(String templateName) {
        return getPromptTemplate(templateName).getTemplate();
    }

    private PromptTemplate getPromptTemplate(String templateName) {
        return templateCache.computeIfAbsent(templateName, name -> {
            String path = TEMPLATE_DIR + name + TEMPLATE_EXT;
            ClassPathResource resource = new ClassPathResource(path);
            if (!resource.exists()) {
                throw new RuntimeException("Prompt 模板文件不存在: classpath:" + path);
            }
            return new PromptTemplate(resource);
        });
    }
}
```

几个设计要点：

- **缓存的是 PromptTemplate 实例**，不是原始字符串。因为 `PromptTemplate` 内部持有模板文本，每次只需调 `render(variables)` 传入不同变量即可，不需要重新读文件
- **`computeIfAbsent()` 是原子操作**，线程安全。Spring Bean 可能被多线程并发调用，用 `ConcurrentHashMap` 而不是普通 `HashMap`
- **懒加载** — 模板首次使用时才从文件读取，未使用的模板不会被加载

使用时非常简洁：

```java
public class StructuredOutputApp {

    private final PromptTemplateService promptTemplateService;

    public InterviewQuestion getSingleQuestion(String topic) {
        // 一行代码：加载模板 + 填充变量 + 拿到文本
        String promptText = promptTemplateService.render("single-question",
                Map.of("topic", topic));
        return chatClient.prompt()
                .user(promptText)
                .call()
                .entity(InterviewQuestion.class);
    }
}
```

### 方案二：直接使用 PromptTemplate（无封装层）

不创建额外的服务类，在每个方法里直接 `new PromptTemplate(Resource)`：

```java
public class PromptTemplateDirectApp {

    public InterviewQuestion getSingleQuestion(String topic) {
        // ① 从 classpath 资源文件创建 PromptTemplate
        PromptTemplate template = new PromptTemplate(
                new ClassPathResource("prompts/single-question.txt"));

        // ② create() = render() + 封装为 Prompt 对象
        Prompt prompt = template.create(Map.of("topic", topic));

        // ③ 传给 ChatClient
        return chatClient.prompt(prompt)
                .call()
                .entity(InterviewQuestion.class);
    }

    public List<InterviewQuestion> getQuestionList(String topic, int count) {
        // 也可以用 render() 拿纯文本，再传给 .user()
        PromptTemplate template = new PromptTemplate(
                new ClassPathResource("prompts/question-list.txt"));
        String promptText = template.render(Map.of("topic", topic, "count", count));

        return chatClient.prompt()
                .user(promptText)
                .call()
                .entity(new ParameterizedTypeReference<List<InterviewQuestion>>() {});
    }
}
```

### 两种方案对比

| | PromptTemplateService | 直接使用 PromptTemplate |
|---|---|---|
| 额外类 | 需要创建一个 Service | 不需要 |
| 缓存 | 有，模板只加载一次 | 无，每次创建新实例 |
| 调用简洁度 | `service.render("name", vars)` 一行 | 每次都要 `new PromptTemplate(Resource)` |
| 适用场景 | 模板多、高频调用 | 模板少、一次性使用 |

实际项目中推荐方案一。模板文件虽然不大，但每次 `new PromptTemplate(Resource)` 都会做一次 IO 读取，高频场景下有缓存会更高效。

---

## 模板文件设计

所有模板文件统一放在 `src/main/resources/prompts/` 下，使用 `.txt` 格式：

```
resources/prompts/
├── interview-system.txt       # 系统提示词（无变量）
├── single-question.txt        # 单道题 → 变量: {topic}
├── question-list.txt          # 题目列表 → 变量: {topic}, {count}
├── question-map.txt           # 分类Map → 变量: {categories}
├── study-plan.txt             # 复习计划 → 变量: {techDirection}, {focusAreas}
└── question-manual.txt        # 手动解析 → 变量: {topic}, {formatInstruction}
```

以 `single-question.txt` 为例，内容就一行：

```
请围绕「{topic}」出一道 Java 后端面试题，包含参考答案、关键要点、难度等级和追问方向
```

`{topic}` 就是变量占位符，运行时由 `PromptTemplate` 替换为实际值。语法和 `ReReadingAdvisor` 里的 `{re2_input_query}` 完全一致。

### 系统提示词的外置

`InterViewApp` 的系统提示词也从硬编码改成了文件加载：

```java
// 改造前 — 硬编码在 Java 中
private static final String SYSTEM_PROMPT = "你是面试助手，专注于 Java 后端...";
chatClient = ChatClient.builder(model)
        .defaultSystem(SYSTEM_PROMPT)
        .build();

// 改造后 — 从资源文件加载
private static final String SYSTEM_PROMPT_TEMPLATE = "interview-system";
chatClient = ChatClient.builder(model)
        .defaultSystem(promptTemplateService.loadTemplate(SYSTEM_PROMPT_TEMPLATE))
        .build();
```

`loadTemplate()` 调的是 `PromptTemplate.getTemplate()`，返回模板文件的原始文本，不做任何变量替换。这样修改系统提示词只需要编辑 txt 文件，不用碰 Java 代码。

---

## 源码分析：PromptTemplate 内部实现

看了 `PromptTemplate` 的源码，它的核心流程很清晰：

```
构造阶段:
  new PromptTemplate(Resource)
    → 读取 Resource 的 InputStream
    → 将文件内容存为内部字符串 template

渲染阶段:
  render(Map variables)
    → 创建 StringTemplate（ST4）引擎实例
    → 将 template 字符串交给 ST4 解析
    → ST4 识别 {key} 占位符，用 variables 中对应的值替换
    → 返回替换后的纯文本 String

create(Map variables)
    → 内部调用 render(variables) 得到文本
    → 封装为 new Prompt(new UserMessage(text))
    → 返回 Prompt 对象
```

ST4 引擎的变量语法就是 `{variableName}`，和我们在模板文件里写的一致。它比简单的 `String.replace()` 更规范 — 比如变量未赋值时会有明确的报错，而不是静默保留占位符。

---

## 新增/修改文件

```
src/main/java/com/muzi/muaiagent/
├── service/
│   └── PromptTemplateService.java         # 模板加载服务（方案一）
└── app/
    ├── PromptTemplateDirectApp.java        # 直接使用 PromptTemplate（方案二）
    ├── StructuredOutputApp.java            # [修改] 改用 PromptTemplateService
    └── InterViewApp.java                   # [修改] 系统提示词从文件加载

src/main/resources/prompts/
├── interview-system.txt                    # 系统提示词
├── single-question.txt                     # 单道题模板
├── question-list.txt                       # 题目列表模板
├── question-map.txt                        # 分类Map模板
├── study-plan.txt                          # 复习计划模板
└── question-manual.txt                     # 手动解析模板
```

---

## 遇到的问题

### 1. JSON 大括号与 ST4 变量占位符冲突

`question-manual.txt` 的模板中原本把 JSON 格式描述直接写在文件里：

```
请围绕「{topic}」出一道 Java 后端面试题。
请严格按照以下 JSON 格式返回：
{
  "question": "面试问题",
  "referenceAnswer": "参考答案"
}
```

结果运行时报错 — ST4 引擎把 JSON 的 `{` 和 `}` 当成了变量占位符来解析，试图找 `"question"` 这个变量名，当然找不到。

**解决**：把 JSON 格式描述从模板文件中拿出来，定义成 Java 常量，作为 `{formatInstruction}` 变量传入：

```java
// 模板文件 question-manual.txt — 只保留占位符
请围绕「{topic}」出一道 Java 后端面试题。
{formatInstruction}
```

```java
// Java 代码 — JSON 格式作为变量值传入
private static final String JSON_FORMAT_INSTRUCTION = """
        请严格按照以下 JSON 格式返回：
        {
          "question": "面试问题",
          "referenceAnswer": "参考答案"
        }""";

template.render(Map.of("topic", topic, "formatInstruction", JSON_FORMAT_INSTRUCTION));
```

**经验**：模板文件中不能出现字面量的 `{` 和 `}`，除非它们是变量占位符。如果模板内容需要包含大括号（比如 JSON 示例、代码片段），要么把那段内容作为变量值传入，要么用 ST4 的转义语法。这一点和 Thymeleaf、Freemarker 等模板引擎类似。

### 2. PromptTemplate 的 API 在不同版本中有差异

查文档时发现 `PromptTemplate` 的 API 在不同 Spring AI 版本中有变化。早期的 `render()` 返回 `Prompt`，后来的版本改成了返回 `String`，新增了 `create()` 返回 `Prompt`。

**解决**：以项目中 `ReReadingAdvisor` 的实际用法为准 — `render()` 返回 `String`。同时查了 Spring AI 官方 Javadoc 确认当前版本的完整 API：

| 方法 | 返回类型 |
|---|---|
| `render()` | `String` |
| `render(Map)` | `String` |
| `create()` | `Prompt` |
| `create(Map)` | `Prompt` |
| `getTemplate()` | `String`（返回模板原文） |

**经验**：Spring AI 还在快速迭代中，遇到 API 对不上文档的情况，最靠谱的办法是直接在 IDE 里看 `PromptTemplate.class` 的方法列表，或者用 `mvn dependency:tree` 确认实际引入的版本。

---

## 心得体会

Prompt 外部化这件事，技术上其实很简单 — 无非就是把字符串从代码搬到文件里，运行时再读回来。但它的价值不在于代码量的减少，而在于**关注点分离**：调 prompt 的人不需要懂 Java，改代码的人不需要关心措辞。这在实际团队协作中非常重要，尤其是当产品经理或运营同学也想参与 prompt 调优的时候。

`PromptTemplate` 的 `Resource` 构造器是个很贴心的设计，一行代码就能从 classpath 加载模板文件，省去了自己写文件读取的样板代码。配合 `ConcurrentHashMap` 做个简单的缓存，就是一个够用的生产级方案了。

JSON 大括号的坑挺有意思的。其实所有模板引擎都有类似的问题 — 模板语法和业务内容冲突。解决思路也都是一样的：把冲突的内容提取为变量。这个技巧在写 Thymeleaf、Freemarker 模板时也经常用到，不算什么新问题。

和之前几篇文章串联起来看：第 2 篇讲了 Advisor 链（`ReReadingAdvisor` 里第一次用到了 `PromptTemplate`），第 3 篇讲了结构化输出（`entity()` 和手动解析），第 4 篇讲了记忆持久化。这篇算是把 prompt 管理这一块补全了。到目前为止，一个 AI Agent 应用的核心组件 — 模型调用、Advisor 链、结构化输出、记忆管理、Prompt 模板 — 基本都过了一遍。

下一步打算把这些组件整合成一个完整的面试助手 REST API，配合 Swagger 文档暴露出去，做一个真正可以交互的 demo。

---

> 项目地址：[mu-ai-agent](https://github.com/MuziGeek/mu-ai-agent)
