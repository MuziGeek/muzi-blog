---
title: "木南 AI 智能体开发笔记 #6 - \"木南 AI 智能体开发笔记 #6 - 多模态视觉理解（Qwen-VL）\""
date: 2026-06-26 13:50:00
categories:
  - ["笔记", "项目", "木南 AI 智能体"]
tags:
  - "AI Agent"
  - "Spring AI"
  - "Qwen-VL"
  - "多模态"
  - "DashScope"
---
**2026-06-26**🌱上海: ☀️ 🌡️+91°F 🌬️SE7mph

# Mu-ai-agent-6

## 前言

在前面的五篇文章中，我们的 AI 助手一直是个 " 纯文字选手 "—它能聊面试、记上下文、做结构化输出，但如果你给它发一张图片，它就完全看不懂了。这在很多场景下是个硬伤：比如用户拍了一张报错截图想让助手帮忙排查，或者上传了一张商品图想自动生成描述文案。

这次就来给 Agent 加上 " 眼睛 "—接入通义千问的视觉语言模型 Qwen-VL，让它具备图片理解能力。整体思路和前面的文本对话一样：复用 Spring AI 的 `ChatClient` 体系，通过 DashScope 的 API 调用 Qwen-VL 模型，只不过输入从纯文本变成了「文本 + 图片」。

实现下来发现，Spring AI 对多模态的支持其实已经很完善了。核心就是在 `UserMessage` 里塞一个 `Media` 对象，其他调用方式和之前的纯文本完全一样。唯一的坑在依赖版本管理上，后面会详细聊。

---

## 核心思路：一个 ChatModel，两套配置

先理清楚一个关键问题：调用 Qwen-VL 需要额外创建一个 `ChatModel` Bean 吗？

答案是**不需要**。Spring AI 的 `ChatClient` 支持请求级别的 `ChatOptions`，可以在同一次调用中覆盖默认的模型名和参数。所以我们复用现有的 `dashscopeChatModel` Bean，只需要在请求时传入一份 Qwen-VL 专属的配置即可：

```java
同一个 dashscopeChatModel Bean
├── 文本对话（默认）→ qwen-plus 模型 → 纯文本输入
└── 视觉理解（本次）→ qwen-vl-max 模型 → 文本 + 图片输入
```

这里有一个关键参数：`DashScopeChatOptions.withMultiModel(true)`。这个标志告诉 DashScope SDK 把请求路由到**多模态生成端点**（`/api/v1/services/aigc/multimodal-generation/generation`），而不是纯文本端点。没有这个标志，即使传了图片也会被忽略。

---

## Spring AI 的 Media API

Spring AI 用 `Media` 类表示一条多模态媒体内容。构造一个 `Media` 需要两样东西：**MIME 类型**和**数据来源**。数据来源支持三种方式：

```java
// 方式一：公网 URL（最常用，图片不需要经过应用服务器中转）
Media media = new Media(MimeTypeUtils.IMAGE_JPEG, URI.create("https://example.com/photo.jpg"));

// 方式二：Spring Resource（适合文件上传场景）
Media media = new Media(MimeTypeUtils.IMAGE_PNG, multipartFile.getResource());

// 方式三：ByteArrayResource（适合 Base64 解码后的字节数据）
Media media = new Media(MimeTypeUtils.IMAGE_PNG, new ByteArrayResource(imageBytes));
```

需要注意的是，Spring AI 1.0.x 的 `Media` 构造器接受 `URI` 而不是 `URL`—这是和早期版本的一个 API 变化，直接用 `URI.create()` 即可。

有了 `Media` 对象后，把它塞进 `UserMessage` 里：

```java
UserMessage message = UserMessage.builder()
        .text("请描述这张图片的内容")
        .media(List.of(media))
        .build();
```

`media()` 接受一个 `List<Media>`，意味着一条消息可以附带多张图片。之后的调用方式和纯文本完全一致：

```java
ChatResponse response = chatClient.prompt()
        .messages(message)              // 包含图片的 UserMessage
        .options(visionChatOptions)     // 切换到 Qwen-VL 模型
        .call()
        .chatResponse();
```

---

## 动手实现

整个功能分为四个部分：配置、核心逻辑、REST 接口、单元测试。

### 1. VisionConfig：视觉模型的 ChatOptions

```java
@Configuration
public class VisionConfig {

    @Value("${spring.ai.dashscope.vision.model:qwen-vl-max}")
    private String visionModel;

    @Bean
    public DashScopeChatOptions visionChatOptions() {
        return DashScopeChatOptions.builder()
                .withModel(visionModel)
                .withMultiModel(true)     // 关键：路由到多模态端点
                .build();
    }
}
```

这个 `@Bean` 只是一个配置对象，不是第二个 `ChatModel`。它会被注入到 `MultimodalApp` 中，在每次请求时作为 `options()` 参数传入。

对应的 YAML 配置：

```yaml
spring:
  ai:
    dashscope:
      vision:
        model: qwen-vl-max
```

### 2. MultimodalApp：核心业务逻辑

`MultimodalApp` 遵循和 `InterViewApp` 相同的模式—`@Component` 注入 `ChatModel`，用 `ChatClient` 发起调用。它提供三种图片输入方式：

```java
@Slf4j
@Component
public class MultimodalApp {

    private final ChatClient chatClient;
    private final DashScopeChatOptions visionChatOptions;

    public MultimodalApp(ChatModel dashscopeChatModel,
                         DashScopeChatOptions visionChatOptions) {
        this.visionChatOptions = visionChatOptions;
        this.chatClient = ChatClient.builder(dashscopeChatModel).build();
    }

    // 方式一：公网 URL
    public String analyzeImageUrl(String imageUrl, String question) {
        MimeType mimeType = detectImageMimeType(imageUrl);
        Media media = new Media(mimeType, URI.create(imageUrl));

        UserMessage message = UserMessage.builder()
                .text(question)
                .media(List.of(media))
                .build();

        ChatResponse response = chatClient.prompt()
                .messages(message)
                .options(visionChatOptions)
                .call()
                .chatResponse();

        return extractContent(response);
    }

    // 方式二：文件上传
    public String analyzeImageFile(MultipartFile file, String question) {
        Media media = new Media(
                MimeType.valueOf(file.getContentType()),
                file.getResource());
        // ... 同样的 UserMessage + chatClient 调用
    }

    // 方式三：Base64 编码
    public String analyzeImageBase64(String base64, String mime, String question) {
        byte[] bytes = Base64.getDecoder().decode(base64);
        Media media = new Media(
                MimeType.valueOf(mime),
                new ByteArrayResource(bytes));
        // ... 同样的 UserMessage + chatClient 调用
    }
}
```

三个方法的核心逻辑完全一样：构造 `Media` → 封装 `UserMessage` → 调用 `chatClient`。区别只在 `Media` 的数据来源。URL 方式有一个小细节—需要根据文件后缀自动检测 MIME 类型（`detectImageMimeType()`），因为 DashScope 需要正确的 MIME 才能解析图片。

### 3. MultimodalController：REST 接口

为了让三种输入方式都能在浏览器里直接测试，我用 Knife4j（Swagger UI）暴露了三个端点：

```java
@Tag(name = "多模态视觉理解", description = "图片理解、OCR、视觉问答")
@RestController
@RequestMapping("/multimodal")
public class MultimodalController {

    @Operation(summary = "通过图片URL分析图片")
    @GetMapping("/analyze-url")
    public ResponseEntity<Map<String, String>> analyzeByUrl(
            @RequestParam String imageUrl,
            @RequestParam(defaultValue = "请详细描述这张图片的内容") String question) {
        // ...
    }

    @Operation(summary = "上传图片文件进行分析")
    @PostMapping(value = "/analyze-upload", consumes = "multipart/form-data")
    public ResponseEntity<Map<String, String>> analyzeUpload(
            @RequestParam("file") MultipartFile file,
            @RequestParam(defaultValue = "请详细描述这张图片的内容") String question) {
        // ...
    }

    @Operation(summary = "通过Base64编码分析图片")
    @PostMapping("/analyze-base64")
    public ResponseEntity<Map<String, String>> analyzeBase64(
            @RequestBody Base64ImageRequest request) {
        // ...
    }
}
```

`Base64ImageRequest` 用了 Java Record，紧凑又清晰：

```java
public record Base64ImageRequest(
        String base64Image,
        String mimeType,
        String question
) {
    public Base64ImageRequest {
        if (question == null || question.isBlank())
            question = "请详细描述这张图片的内容";
        if (mimeType == null || mimeType.isBlank())
            mimeType = "image/jpeg";
    }
}
```

启动后访问 `http://localhost:8123/api/doc.html`，在 Knife4j 界面上就能直接测试这三个接口了。上传文件的端点还提供了拖拽上传的 UI，对调试很友好。

### 4. 单元测试

```java
@SpringBootTest
class MultimodalAppTest {

    @Resource
    private MultimodalApp multimodalApp;

    @Test
    void testAnalyzeImageUrl() {
        // 使用 DashScope 官方 OSS 托管的示例图片
        String result = multimodalApp.analyzeImageUrl(
                "https://dashscope.oss-cn-beijing.aliyuncs.com/images/dog_and_girl.jpeg",
                "请描述这张图片中的内容");
        Assertions.assertNotNull(result);
        Assertions.assertFalse(result.isBlank());
    }

    @Test
    void testAnalyzeImageBase64() {
        // 20x20 红色像素 PNG（Qwen-VL 要求最小 10x10）
        String base64 = "iVBORw0KGgoAAAANSUhEUgAAABQU...";
        String result = multimodalApp.analyzeImageBase64(
                base64, "image/png", "这张图片是什么颜色？");
        Assertions.assertNotNull(result);
    }
}
```

---

## 新增/修改文件

```java
src/main/java/com/muzi/muaiagent/
├── config/
│   └── VisionConfig.java                 # Qwen-VL 视觉模型 ChatOptions 配置
├── app/
│   └── MultimodalApp.java                # 多模态视觉理解核心逻辑
└── controller/
    └── MultimodalController.java         # REST 接口（URL/上传/Base64）

src/test/java/com/muzi/muaiagent/
└── MultimodalAppTest.java                # 集成测试（URL + Base64）

src/main/resources/
└── application.yml                       # [修改] 新增 vision.model 和 multipart 配置

pom.xml                                   # [修改] 依赖版本对齐（详见下文）
```

---

## 遇到的问题

### 1. Media 构造器的 API 变化

最初按照网上的示例用 `new Media(mimeType, new URL(imageUrl))` 来构造，结果编译报错—Spring AI 1.0.x 的 `Media` 类只接受 `URI` 或 `Resource`，不接受 `URL`。

**解决**：直接用 `URI.create(imageUrl)` 即可。URI 和 URL 在这个场景下效果一样，但 API 签名要求的是 URI。

### 2. UserMessage 的构造方式

早期版本的 `UserMessage` 有一个公开的两参数构造器 `new UserMessage(text, media)`，但在 Spring AI 1.0.x 中这个构造器变成了 `private`。

**解决**：改用 Builder 模式：

```java
// 旧写法（已不可用）
new UserMessage("描述图片", media);

// 新写法
UserMessage.builder()
        .text("描述图片")
        .media(List.of(media))
        .build();
```

### 3. Spring-ai-alibaba-core 1.0.0.2 的图片下载失败

最初用 BOM 1.0.0.2 默认的 `spring-ai-alibaba-core` 版本时，调用 Qwen-VL 直接报 `"Failed to download multimodal content"`。排查发现是 1.0.0.2 版本的 core 在序列化 `Media` URI 时有 bug，没有正确地把 URI 传递给 DashScope 的多模态 API。

**解决**：显式指定 `spring-ai-alibaba-core` 为 1.0.0.4，这个版本修复了 URI 序列化问题。

### 4. 测试图片 URL 不可达

第一次写测试用例时，用了一个阿里云帮助文档里的示例图片 URL。结果 DashScope 服务端下载图片失败—那个 URL 可能有防盗链限制或者区域限制。

**解决**：换成 DashScope 官方 OSS 托管的示例图片 `https://dashscope.oss-cn-beijing.aliyuncs.com/images/dog_and_girl.jpeg`。这个 URL 是 DashScope 文档里推荐的测试图，服务端一定能访问到。

### 5. Base64 测试图片太小

为了省事，最初用了一个 1x1 像素的红色 PNG 做 Base64 测试。结果 Qwen-VL 报错—它要求图片至少 10x10 像素。

**解决**：用代码生成了一个 20x20 像素的红色 PNG 图片用于测试。

### 6. 依赖版本对齐

这是最折腾的一个问题。项目的 BOM 是 `spring-ai-alibaba-bom` 1.0.0.2，它把 `autoconfigure-dashscope` 锁在 1.0.0.2。而 `DashScopeAudioSpeechAutoConfiguration` 这个自动配置类本身有 bug（`@ConditionalOnMissingBean` 类型推导失败），会导致启动时报错。

同时 `spring-ai-alibaba-starter-dashscope` 1.1.2.1（较新版本）内部依赖了 Spring AI 1.1.x 才有的 API（`AssistantMessage.builder()`），和项目的 Spring AI 1.0.x 完全不兼容。

**解决**：最终方案是保持 starter 版本由 BOM 1.0.0.2 统一管理，显式指定 core 为 1.0.0.4（修复 Media URI 问题），并通过 `@SpringBootApplication(excludeName = {…})` 排除有缺陷的 Audio/Image/Embedding/Moderation 自动配置。项目只需要 ChatModel，排除掉这些用不到的自动配置是合理且干净的做法。

```java
@SpringBootApplication(
        exclude = {DataSourceAutoConfiguration.class},
        excludeName = {
                "...DashScopeAudioSpeechAutoConfiguration",
                "...DashScopeAudioTranscriptionAutoConfiguration",
                "...DashScopeImageAutoConfiguration",
                "...DashScopeEmbeddingAutoConfiguration",
                "...DashScopeModerationAutoConfiguration"
        }
)
```

**经验**：Spring AI Alibaba 目前还处于快速迭代期，BOM 内部各模块的版本管理并不完全对齐。遇到自动配置启动失败时，最靠谱的排查方式是看 `CONDITIONS EVALUATION REPORT` 里的 `Negative matches` 和 `Unconditional classes`，定位到具体是哪个 AutoConfiguration 出了问题。如果项目不需要那些功能（比如不需要语音合成、图片生成），排除掉就好了，不需要为了 " 兼容性 " 去升级整个 Spring AI 框架。

---

## 心得体会

给 AI Agent 加 " 眼睛 " 这件事，从技术实现角度看其实不难—核心就是把 `Media` 对象塞进 `UserMessage`，其他调用方式和纯文本完全一样。Spring AI 把多模态和单模态的 API 统一得很好，不需要学一套新的调用方式。

比较有收获的是对 `ChatOptions` 的理解。之前一直以为切换模型需要创建新的 `ChatModel` Bean，实际上通过请求级别的 `options()` 就能覆盖。这意味着一个 `ChatModel` Bean 可以服务于多种场景：文本对话用 qwen-plus、视觉理解用 qwen-vl-max、甚至未来接入代码生成用 qwen-coder，都只需要在调用时传不同的 options。这个设计非常灵活，也避免了 Bean 膨胀。

依赖版本管理是这次最大的 " 学费 "。Spring AI 的生态还比较年轻，spring-ai-alibaba 的 BOM 管理和 Spring AI 框架本身的版本之间有不少微妙的问题。一个核心原则是：**尽量让 BOM 统一管理版本，只在必要时用显式版本号覆盖个别模块**。如果随意混用不同版本的模块，很容易遇到运行时 `ClassNotFoundException` 或 `NoSuchMethodError`。

和前面几篇文章串联起来看，到目前为止项目已经具备了：程序调用大模型（第 1 篇）、Advisor 链（第 2 篇）、结构化输出（第 3 篇）、聊天记忆（第 4 篇）、Prompt 模板外部化（第 5 篇），加上这篇的多模态视觉理解。一个 AI Agent 应用的核心拼图基本齐了。

下一步打算把 REST API 好好整理一下，配合 Knife4j 的文档做一个完整的接口测试界面，让所有功能都能在浏览器里直接体验。

---

> 项目地址：[mu-ai-agent](https://github.com/MuziGeek/mu-ai-agent)
