---
title: "木南 AI 智能体开发笔记 #3 - \"木南 AI 智能体开发笔记 #3 - Spring AI 结构化输出\""
date: 2026-06-07 12:30:00
categories:
  - ["笔记", "项目", "木南 AI 智能体"]
tags:
  - "AI Agent"
  - "Spring AI"
  - "结构化输出"
  - "BeanOutputConverter"
---
**2026-06-07**🌱上海: ☀️  🌡️+79°F 🌬️N8mph

# mu-ai-agent-3

## 前言

默认情况下，大模型返回的是一段纯文本字符串。但在实际开发中，我们往往需要把 AI 的输出转换成 Java 对象来使用 — 比如存入数据库、返回给前端、做进一步的业务处理。

Spring AI 提供了 `entity()` 方法来实现这个需求，底层由 `BeanOutputConverter` 驱动，能自动根据你的 Java 类生成 JSON Schema 并附加到 prompt 中，让模型返回符合格式的 JSON，再自动反序列化为对象。

这次围绕"面试指导"场景，测试了 5 种结构化输出方式。

---

## 实体类设计

### InterviewQuestion — 单道面试题

```java
@Data
@NoArgsConstructor
@AllArgsConstructor
public class InterviewQuestion {
    private String question;           // 面试问题
    private String referenceAnswer;    // 参考答案
    private List<String> keyPoints;    // 关键要点
    private String difficultyLevel;    // 难度等级：入门/中级/高级
    private List<String> followUpDirections; // 追问方向
    private String techCategory;       // 技术分类
}
```

注意事项：必须有无参构造器（Jackson 反序列化需要），字段名直接映射为 JSON key。

### InterviewStudyPlan — 复习计划（复杂嵌套）

```java
@Data
@NoArgsConstructor
@AllArgsConstructor
public class InterviewStudyPlan {
    private String techDirection;                    // 技术方向
    private List<String> focusAreas;                 // 考察重点
    private List<InterviewQuestion> questions;       // 嵌套的题目列表
    private String learningAdvice;                   // 学习建议
    private Integer estimatedMinutes;                // 建议复习时长
}
```

这个类内部嵌套了 `List<InterviewQuestion>`，用来验证 Spring AI 对多层嵌套的 JSON Schema 生成能力。

---

## 五种结构化输出方式

### 方式 1：单个 Bean — entity(Class)

最简单也最常用，直接传 Class：

```java
public InterviewQuestion getSingleQuestion(String topic) {
    return chatClient.prompt()
            .user("请围绕「" + topic + "」出一道 Java 后端面试题，" +
                  "包含参考答案、关键要点、难度等级和追问方向")
            .call()
            .entity(InterviewQuestion.class);
}
```

Spring AI 在背后做了四件事：

1. 根据 `InterviewQuestion` 的字段自动生成 JSON Schema
2. 在 prompt 末尾追加格式指令（告诉模型"你必须返回符合这个 Schema 的 JSON"）
3. 模型返回 JSON 字符串
4. `BeanOutputConverter` 用 Jackson 反序列化为对象

### 方式 2：List — entity(ParameterizedTypeReference)

返回多个对象的列表：

```java
public List<InterviewQuestion> getQuestionList(String topic, int count) {
    return chatClient.prompt()
            .user("请围绕「" + topic + "」出 " + count + " 道面试题")
            .call()
            .entity(new ParameterizedTypeReference<List<InterviewQuestion>>() {});
}
```

为什么不能写 `entity(List.class)`？因为 Java 的泛型擦除 — `List.class` 在运行时丢失了元素类型信息，Jackson 不知道 List 里应该放 `InterviewQuestion` 还是 `String`。`ParameterizedTypeReference` 通过匿名子类保留泛型信息来解决这个问题。

### 方式 3：Map — entity(ParameterizedTypeReference)

返回按 key 组织的映射：

```java
public Map<String, InterviewQuestion> getQuestionMap(List<String> categories) {
    return chatClient.prompt()
            .user("请分别针对「" + String.join("、", categories) + "」各出一道题")
            .call()
            .entity(new ParameterizedTypeReference<Map<String, InterviewQuestion>>() {});
}
```

Map 的 key 是分类名（如 "JVM"），value 是该分类下的面试题。同样需要 `ParameterizedTypeReference`。

### 方式 4：复杂嵌套 — entity(Class) with nested structures

最接近真实业务的用法，实体类内部包含嵌套的子对象列表：

```java
public InterviewStudyPlan getStudyPlan(String techDirection, List<String> focusAreas) {
    return chatClient.prompt()
            .user("请为「" + techDirection + "」方向的求职者制定面试复习计划，" +
                  "重点考察：" + String.join("、", focusAreas) + "，包含 2-3 道练习题")
            .call()
            .entity(InterviewStudyPlan.class);
}
```

Spring AI 会递归生成完整的 JSON Schema，包括嵌套层的 `InterviewQuestion` 定义。最终返回的 `InterviewStudyPlan` 对象里直接包含了 `List<InterviewQuestion>`，用起来很自然。

### 方式 5：手动 Prompt + Jackson

完全手动控制，自己描述 JSON 格式、自己解析：

```java
public InterviewQuestion getQuestionManual(String topic) {
    String formatInstruction = """
            请严格按照以下 JSON 格式返回，不要包含任何额外说明：
            {
              "question": "面试问题",
              "referenceAnswer": "参考答案",
              "keyPoints": ["要点1", "要点2"],
              "difficultyLevel": "入门/中级/高级",
              "followUpDirections": ["追问方向1"],
              "techCategory": "技术分类"
            }
            """;

    String rawJson = chatClient.prompt()
            .user("请围绕「" + topic + "」出一道面试题。\n" + formatInstruction)
            .call()
            .content();  // 注意：这里用 .content() 拿原始字符串

    // 手动清理 markdown 代码块标记
    rawJson = rawJson.trim()
            .replaceAll("^```json\\s*", "")
            .replaceAll("\\s*```$", "");

    // 手动反序列化
    return new ObjectMapper().readValue(rawJson, InterviewQuestion.class);
}
```

与 `entity()` 的对比：

| | entity() 自动方式 | 手动方式 |
|---|---|---|
| JSON Schema | 自动生成 | 手写描述 |
| 格式指令 | 自动附加到 prompt | 自己拼到 prompt 里 |
| 反序列化 | 自动 | 手动调 Jackson |
| 适用场景 | 标准场景 | 需要精细控制 prompt 时 |

---

## BeanOutputConverter 源码分析

看了 `BeanOutputConverter` 的源码，它的核心就两个方法：

### getFormat() — 生成格式指令

```java
public String getFormat() {
    String template = """
            Your response should be in JSON format.
            Do not include any explanations, only provide a RFC8259 compliant JSON response.
            Do not include markdown code blocks in your response.
            Here is the JSON Schema instance your output must adhere to:
            ```%s```
            """;
    return String.format(template, this.jsonSchema);
}
```

这段指令会被自动追加到 prompt 末尾。其中 `jsonSchema` 是用 `victools jsonschema-generator` 库根据 Java 类自动生成的 JSON Schema 字符串。

### convert() — 解析模型返回

```java
public T convert(String text) {
    text = text.trim();
    // 自动清理 markdown 代码块标记
    if (text.startsWith("```") && text.endsWith("```")) {
        // 去掉 ```json 和 ``` 包裹
    }
    return objectMapper.readValue(text, objectMapper.constructType(this.type));
}
```

它会先清理模型可能返回的 ` ```json ... ``` ` 包裹，再用 Jackson 反序列化。容错性还不错。

---

## 单元测试

每种方式对应一个测试方法，运行后可直接观察输出：

```java
@SpringBootTest
public class StructuredOutputTest {

    @Autowired
    private StructuredOutputApp structuredOutputApp;

    @Test
    @DisplayName("方式1：entity(Class) → 单个 InterviewQuestion")
    void testSingleBean() {
        InterviewQuestion question = structuredOutputApp
                .getSingleQuestion("JVM 垃圾回收机制");
        
        assertNotNull(question);
        assertNotNull(question.getQuestion());
        assertNotNull(question.getKeyPoints());
        assertFalse(question.getKeyPoints().isEmpty());
        // 打印观察
        log.info("问题: {}", question.getQuestion());
        log.info("要点: {}", question.getKeyPoints());
    }

    @Test
    @DisplayName("方式4：entity(Class) → 复杂嵌套 InterviewStudyPlan")
    void testNestedObject() {
        InterviewStudyPlan plan = structuredOutputApp
                .getStudyPlan("Java 后端", List.of("HashMap", "线程池"));
        
        assertNotNull(plan);
        assertNotNull(plan.getQuestions());
        assertFalse(plan.getQuestions().isEmpty());
        // 嵌套的题目列表也能正确反序列化
        for (InterviewQuestion q : plan.getQuestions()) {
            log.info("题: {} | 难度: {}", q.getQuestion(), q.getDifficultyLevel());
        }
    }
}
```

运行方式：`mvn test -Dtest=StructuredOutputTest`，或在 IDEA 中右键运行单个方法。

---

## 新增文件

```java
src/main/java/com/muzi/muaiagent/
├── model/
│   ├── InterviewQuestion.java       # 面试题实体
│   └── InterviewStudyPlan.java      # 复习计划实体（含嵌套）
└── app/
    └── StructuredOutputApp.java     # 5 种结构化输出方式
src/test/java/com/muzi/muaiagent/structured/
└── StructuredOutputTest.java        # 单元测试
```

---

## 遇到的问题

### 1. DataSource 自动配置报错

`spring-ai-alibaba-starter-memory` 引入了 JDBC 相关依赖，Spring Boot 自动尝试配置 DataSource 但没配数据库。

**解决**：`@SpringBootApplication(exclude = {DataSourceAutoConfiguration.class})`

### 2. API Key 未生效

`.env` 文件里的 Key 不被 Spring Boot 识别，跑测试时 `${AI_DASHSCOPE_API_KEY}` 解析失败。

**解决**：创建 `application-local.yml`，直接写 api-key 值（已在 .gitignore 中排除）。

### 3. jsonschema 版本冲突

```
NoClassDefFoundError: com/github/victools/jsonschema/generator/AnnotationHelper
```

`spring-ai-alibaba-bom` 把 `jsonschema-generator` 锁定在 4.31.1，但 `jsonschema-module-jackson` 是 4.37.0，后者需要的 `AnnotationHelper` 类在旧版中不存在。

**解决**：在 pom 中显式声明 `jsonschema-generator 4.37.0` 覆盖 BOM 的旧版本。

```xml
<dependency>
    <groupId>com.github.victools</groupId>
    <artifactId>jsonschema-generator</artifactId>
    <version>4.37.0</version>
</dependency>
```

### 4. Map 输出时模型"偷懒"返回字符串

测试方式 3（Map 输出）时，Jackson 反序列化报错：

```
MismatchedInputException: Cannot construct instance of InterviewQuestion:
no String-argument constructor/factory method to deserialize from String value
('请解释Java中的Minor GC和Major GC的区别...')
```

看报错信息发现，模型返回的 JSON 长这样：

```json
{ "JVM": "请解释Java中的Minor GC和Major GC的区别..." }
```

而期望的格式是：

```json
{ "JVM": { "question": "...", "referenceAnswer": "...", "keyPoints": [...] } }
```

**原因**：`Map<String, InterviewQuestion>` 这种结构对模型来说比较特殊。虽然 `BeanOutputConverter` 生成了完整的 JSON Schema，但模型在面对"Map 的 value 是复杂对象"这种场景时，倾向于把 value 简化成一个字符串。

**解决**：在 prompt 中明确列出 value 对象必须包含的字段名，并强调"value 不能是字符串"：

```java
.user("请分别针对「" + categoryStr + "」各出一道面试题。\n" +
      "要求：以分类名称作为 Map 的 key，value 必须是一个完整的对象，" +
      "包含 question（问题）、referenceAnswer（参考答案）、" +
      "keyPoints（关键要点列表）、difficultyLevel（难度等级）、" +
      "followUpDirections（追问方向列表）、techCategory（技术分类）这些字段。\n" +
      "注意：value 不能是字符串，必须是包含上述所有字段的 JSON 对象。")
```

**经验**：Schema 是保底，prompt 描述是加强。对于复杂结构（Map、嵌套 List），光靠自动生成的 Schema 有时候不够，配合明确的文字描述效果更好。这也是方式 5（手动方式）存在的意义 — 当自动 Schema 效果不理想时，你有完全的控制权来优化 prompt。

---

## 心得体会

结构化输出是 Spring AI 中非常实用的功能。之前每次让 AI 返回结构化数据，都要自己在 prompt 里写一大段格式说明，还要手动解析 JSON、处理 markdown 代码块包裹。现在用 `entity()` 一行代码就搞定了，而且自动生成的 JSON Schema 比我手写格式描述精确得多，模型的理解也更好。

`ParameterizedTypeReference` 的设计挺巧妙的，用匿名子类的方式绕过了 Java 泛型擦除的限制。这个技巧其实在 Spring 其他地方也有用到（比如 `RestTemplate.exchange()`），理解了原理就不难记住。

版本冲突的坑比较隐蔽，`NoClassDefFoundError` 一开始还以为是缺依赖，后来才发现是两个库版本不对齐。这种问题在 BOM 管理的项目中很常见，遇到时可以用 `mvn dependency:tree` 查看实际解析的版本。

最有意思的是 Map 输出的"偷懒"问题。模型并不是看不懂 Schema，而是在 `Map<String, 复杂对象>` 这种结构下，它更容易走"捷径"把 value 简化成字符串。这说明结构化输出并不是"配好 Schema 就万事大吉"，对于复杂结构仍然需要在 prompt 层面做引导。实际开发中如果某个结构的输出不稳定，优先考虑加强 prompt 描述，而不是怀疑框架。

---

> 项目地址：[mu-ai-agent](https://github.com/xxx/mu-ai-agent)
