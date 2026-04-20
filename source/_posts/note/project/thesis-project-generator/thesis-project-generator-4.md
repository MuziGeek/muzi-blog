---
title: Thesis Project Generator 开发日记 #4 - AI 中转站支持与后端收尾
date: 2026-04-13 11:00:00
categories:
  - [笔记, 项目, 毕设项目生成平台]
tags:
  - Java
  - Spring Boot
  - DDD架构
  - AI
  - Claude
  - OpenAI兼容
  - 中转站
  - 腾讯COS
---

# Thesis Project Generator - 开发日记 #4

## 前言

本次开发完成了两个重要任务：1) 将 MinIO 替换为腾讯 COS，统一文件存储方案；2) 重构 AI 客户端架构，支持自定义中转站 API。同时对后端整体完成度进行了分析确认。

---

## 一、技术栈统一分析

### 1.1 问题发现

在审查项目时发现以下不一致：
- **CLAUDE.md** 文档写 PostgreSQL，实际使用 MySQL
- **MinIO** 配置存在但代码中只有 TODO 注释，从未真正实现
- 用户建议使用腾讯 COS 替代 MinIO

### 1.2 决定方案

| 组件 | 原计划 | 实际方案 |
|------|--------|----------|
| 数据库 | PostgreSQL ❌ | MySQL 8.0 ✅ |
| 文件存储 | MinIO ❌ | 腾讯 COS ✅ |

---

## 二、MinIO 替换为腾讯 COS

### 2.1 配置文件更新

**application.yml**
```yaml
# COS 配置
cos:
  region: ${COS_REGION:ap-guangzhou}
  secret-id: ${COS_SECRET_ID:}
  secret-key: ${COS_SECRET_KEY:}
  bucket: ${COS_BUCKET:thesis-generator}
  timeout: ${COS_TIMEOUT:5000}
```

**.env.example**
```bash
# COS 配置
COS_REGION=ap-guangzhou
COS_SECRET_ID=your_cos_secret_id
COS_SECRET_KEY=your_cos_secret_key
COS_BUCKET=thesis-generator
```

### 2.2 新增配置类

**CosConfig.java**
```java
@Data
@Component
@ConfigurationProperties(prefix = "cos")
public class CosConfig {
    private String region = "ap-guangzhou";
    private String secretId;
    private String secretKey;
    private String bucket = "thesis-generator";
    private int timeout = 5000;
}
```

### 2.3 领域层存储接口

**IFileStoragePort.java**
```java
public interface IFileStoragePort {
    String uploadFile(String fileName, InputStream inputStream, long size, String contentType);
    InputStream downloadFile(String filePath);
    void deleteFile(String filePath);
    String getFileUrl(String filePath);
}
```

### 2.4 COS 存储实现

**CosStoragePortImpl.java**
```java
@Slf4j
@Component
@RequiredArgsConstructor
public class CosStoragePortImpl implements IFileStoragePort {
    private final CosConfig cosConfig;

    @Override
    public String uploadFile(String fileName, InputStream inputStream, long size, String contentType) {
        COSClient cosClient = createCOSClient();
        try {
            String key = "papers/" + UUID.randomUUID().toString() + "_" + fileName;

            ObjectMetadata metadata = new ObjectMetadata();
            metadata.setContentLength(size);
            metadata.setContentType(contentType);

            PutObjectRequest putObjectRequest = new PutObjectRequest(
                cosConfig.getBucket(), key, inputStream, metadata
            );

            PutObjectResult result = cosClient.putObject(putObjectRequest);
            log.info("文件上传成功: {}, ETag: {}", key, result.getETag());

            return key;
        } finally {
            cosClient.shutdown();
        }
    }
}
```

### 2.5 PaperController 集成

原代码：
```java
// TODO: 保存文件到MinIO
String filePath = "/uploads/" + file.getOriginalFilename();
```

更新后：
```java
private final IFileStoragePort fileStoragePort;

// uploadPaper 方法中
String filePath = fileStoragePort.uploadFile(
    file.getOriginalFilename(),
    file.getInputStream(),
    file.getSize(),
    file.getContentType()
);
```

### 2.6 docker-compose.yml 更新

移除 MinIO 服务，添加 COS 环境变量：
```yaml
```bashironment:
  - COS_REGION=${COS_REGION:-ap-guangzhou}
  - COS_SECRET_ID=${COS_SECRET_ID:-}
  - COS_SECRET_KEY=${COS_SECRET_KEY:-}
  - COS_BUCKET=${COS_BUCKET:-thesis-generator}
```

---

## 三、AI 中转站支持

### 3.1 需求背景

用户需要支持自定义中转站（如 OneAPI、NewAPI、Groq 等）来调用 AI 模型，而非仅限于官方 API。

### 3.2 新增 OpenAiCompatibleLlmClient

```java
@Slf4j
@Component
@RequiredArgsConstructor
public class OpenAiCompatibleLlmClient {
    private final AiConfig aiConfig;

    public String chat(IAiModelPort.InvokeRequest request) {
        String baseUrl = resolveBaseUrl();
        String endpoint = resolveEndpoint();

        WebClient webClient = WebClient.builder()
            .baseUrl(baseUrl)
            .defaultHeader("Authorization", "Bearer " + aiConfig.getApiKey())
            .defaultHeader("Content-Type", "application/json")
            .build();

        Map<String, Object> requestBody = buildRequestBody(request);

        String response = webClient.post()
            .uri(endpoint)
            .contentType(MediaType.APPLICATION_JSON)
            .bodyValue(requestBody)
            .retrieve()
            .bodyToMono(String.class)
            .retryWhen(Retry.backoff(3, Duration.ofSeconds(1))
                .filter(this::isRetryableException))
            .block(Duration.ofSeconds(60));

        return parseResponse(response);
    }

    private String resolveBaseUrl() {
        // 优先使用配置的 baseUrl
        if (hasCustomBaseUrl()) {
            return aiConfig.getBaseUrl().trim();
        }
        // 否则根据 provider 使用默认地址
        return switch (aiConfig.getProvider().toLowerCase()) {
            case "claude" -> "https://api.anthropic.com";
            case "qwen" -> "https://dashscope.aliyuncs.com/compatible-mode/v1";
            default -> "https://api.openai.com/v1";
        };
    }
}
```

### 3.3 LlmGateway 路由优化

```java
public String chat(IAiModelPort.InvokeRequest request) {
    // 如果配置了 AI_BASE_URL，优先使用 OpenAI 兼容客户端
    if (hasCustomBaseUrl()) {
        log.info("使用自定义 baseUrl: {}", aiConfig.getBaseUrl());
        return customClient.chat(request);
    }

    // 否则根据 provider 调用对应的官方客户端
    String provider = aiConfig.getProvider().toLowerCase();
    return switch (provider) {
        case "claude" -> claudeClient.chat(request);
        case "qwen" -> qwenClient.chat(request);
        default -> customClient.chat(request);
    };
}
```

### 3.4 配置方式

#### 方式一：官方 API
```bash
AI_PROVIDER=claude
AI_API_KEY=sk-ant-xxx
AI_MODEL=claude-sonnet-4-20250514
# 不设置 AI_BASE_URL
```

#### 方式二：自定义中转站
```bash
AI_BASE_URL=https://your-proxy.com/v1
AI_MODEL=gpt-4-turbo
AI_API_KEY=sk-xxx
```

### 3.5 支持的中转站

- OneAPI
- NewAPI
- Groq
- LocalAI
- 任意 OpenAI 兼容 API

---

## 四、后端完成度分析

### 4.1 核心功能确认 ✅

| 模块 | Controller | 状态 |
|------|------------|------|
| 用户认证 | AuthController | ✅ 完成 |
| 用户管理 | UserController | ✅ 完成 |
| 项目管理 | ProjectController | ✅ 完成 |
| 模板管理 | TemplateController | ✅ 完成 |
| 论文解析 | PaperController | ✅ 完成 |
| AI生成 | GenerationController | ✅ 完成 |
| 管理后台 | AdminController | ✅ 完成 |
| 模板管理 | AdminTemplateController | ✅ 完成 |

### 4.2 AI 多智能体确认 ✅

```
CoordinatorAgent      ✅
ArchitectAgent       ✅
FrontendDevAgent     ✅
BackendDevAgent      ✅
ReviewerAgent        ✅
LlmGateway          ✅ (Claude/Qwen/中转站)
```

### 4.3 非核心 TODO (不影响 MVP)

| 位置 | 问题 | 影响 |
|------|------|------|
| `TemplateController:58` | `generateFromTemplate` | 可后续对接 |
| `GenerationController:94` | `cancelJob` | 可后续添加 |
| `ProjectController:216` | `getVersionArtifacts` | 已返回空列表 |
| `PaperController:117` | `updateAnalysis` | 非核心功能 |
| `PaperController:126` | `generateFromPaper` | 可后续实现 |

### 4.4 结论

> **后端核心功能已完全开发完成**，MVP 阶段可以使用。

---

## 五、项目进度总览

| 阶段 | 名称 | 状态 | 进度 |
|------|------|------|------|
| M1 | 基础架构搭建 | ✅ 已完成 | 100% |
| M2 | 核心功能开发 | ✅ 已完成 | ~96% |
| M3 | AI 功能集成 | ✅ 已完成 | ~92% |
| M4 | 模板与后台 | ✅ 已完成 | ~85% |
| M5 | 测试与优化 | 🔄 进行中 | ~60% |

**总体进度**: ~92%

---

## 六、环境变量配置总结

### .env.example AI 配置

```bash
# AI 配置
# 方式一：官方 API（不配置 BASE_URL 时使用）
AI_PROVIDER=openai  # openai / claude / qwen
AI_API_KEY=your_api_key
AI_MODEL=gpt-4-turbo-preview

# 方式二：自定义中转站（配置 BASE_URL 后优先使用）
# AI_BASE_URL=https://your-proxy.com/v1
# AI_MODEL=your-model-name

AI_MAX_TOKENS=8192
AI_TEMPERATURE=0.7

# COS 配置
COS_REGION=ap-guangzhou
COS_SECRET_ID=your_cos_secret_id
COS_SECRET_KEY=your_cos_secret_key
COS_BUCKET=thesis-generator
```

---

## 遇到的问题

### 1. docker-compose.yml 编辑出错

编辑时出现重复的 MinIO 服务定义，导致 YAML 格式错误。

**解决**：重写整个文件。

### 2. CosStoragePortImpl 中流关闭问题

下载文件后不应关闭 cosClient，让调用方处理流。

**解决**：在 finally 中不调用 shutdown()。

---

## 后续计划

### P0 优先级
- [ ] 提供 COS 凭证完成文件存储集成
- [ ] 集成测试
- [ ] E2E 测试 (Playwright)

### P1 优先级
- [ ] Flyway 数据库迁移
- [ ] 动态提示词管理
- [ ] 性能测试
- [ ] 安全审计

---

> 项目地址：[Thesis Project Generator](https://github.com/muzi-lixi/thesis-project-generator)
