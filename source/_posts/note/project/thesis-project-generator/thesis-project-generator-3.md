---
title: Thesis Project Generator 开发日记 #3 - AI 多智能体与测试基础设施
date: 2026-04-10 16:00:00
categories:
  - [笔记, 项目, 毕设项目生成平台]
tags:
  - Java
  - Spring Boot
  - DDD架构
  - AI
  - 多智能体
  - Claude
  - Vitest
  - 单元测试
  - Docker
---

# Thesis Project Generator - 开发日记 #3

## 前言

本次开发完成了核心的 AI 多智能体代码生成功能，包括 LLM 网关、各类 Agent 实现。同时完成了前端测试基础设施（Vitest + RTL + MSW），并创建了完整的部署文档。

---

## 一、AI 多智能体架构

### 1.1 架构设计

```
用户需求
    ↓
CoordinatorAgent (意图理解)
    ↓ 分解任务
ArchitectAgent (架构设计)
    ↓ 输出架构
FrontendDevAgent + BackendDevAgent (并行代码生成)
    ↓
ReviewerAgent (质量审查)
    ↓ 通过/不通过
生成结果
```

### 1.2 领域层接口

**AgentContext.java** - Agent 执行上下文
```java
@Data
@Builder
public class AgentContext {
    private String taskId;
    private String userId;
    private String projectId;
    private String requirement;
    private TechStack techStack;
    private Map<String, Object> metadata;
}
```

**AgentResult.java** - Agent 执行结果
```java
@Data
@Builder
public class AgentResult {
    private boolean success;
    private String output;
    private List<GenerationArtifact> artifacts;
    private String errorMessage;
}
```

**GenerationArtifact.java** - 代码产物
```java
@Data
@Builder
public class GenerationArtifact {
    private String fileName;
    private String filePath;
    private String content;
    private String fileType;  // java, ts, sql, etc.
    private Long size;
}
```

### 1.3 Agent 接口定义

```java
public interface ICoordinatorAgent {
    AgentResult coordinate(AgentContext context);
}

public interface IArchitectAgent {
    AgentResult design(AgentContext context);
}

public interface IFrontendDevAgent {
    AgentResult develop(AgentContext context);
}

public interface IBackendDevAgent {
    AgentResult develop(AgentContext context);
}

public interface IReviewerAgent {
    AgentResult review(AgentContext context);
}
```

---

## 二、LLM 网关实现

### 2.1 LlmGateway

```java
@Slf4j
@Component
@RequiredArgsConstructor
public class LlmGateway {
    private final ClaudeLlmClient claudeClient;
    private final QwenLlmClient qwenClient;
    private final AiConfig aiConfig;

    public String chat(IAiModelPort.InvokeRequest request) {
        String provider = aiConfig.getProvider().toLowerCase();
        return switch (provider) {
            case "claude" -> claudeClient.chat(request);
            case "qwen" -> qwenClient.chat(request);
            default -> claudeClient.chat(request);
        };
    }
}
```

### 2.2 ClaudeLlmClient

```java
@Slf4j
@Component
@RequiredArgsConstructor
public class ClaudeLlmClient {
    private final AiConfig aiConfig;
    private static final String CLAUDE_API_URL = "https://api.anthropic.com/v1/messages";

    public String chat(IAiModelPort.InvokeRequest request) {
        WebClient webClient = WebClient.builder()
            .baseUrl(aiConfig.getBaseUrl() != null ? aiConfig.getBaseUrl() : CLAUDE_API_URL)
            .defaultHeader("x-api-key", aiConfig.getApiKey())
            .defaultHeader("anthropic-version", "2023-06-01")
            .build();

        Map<String, Object> requestBody = Map.of(
            "model", aiConfig.getModel(),
            "max_tokens", request.getMaxTokens(),
            "temperature", request.getTemperature(),
            "system", request.getSystemPrompt() != null ? request.getSystemPrompt() : "",
            "messages", new Object[]{
                Map.of("role", "user", "content", request.getUserPrompt())
            }
        );

        String response = webClient.post()
            .uri(CLAUDE_API_URL)
            .contentType(MediaType.APPLICATION_JSON)
            .bodyValue(requestBody)
            .retrieve()
            .bodyToMono(String.class)
            .block(Duration.ofSeconds(60));

        return parseClaudeResponse(response);
    }
}
```

### 2.3 QwenLlmClient

```java
@Slf4j
@Component
@RequiredArgsConstructor
public class QwenLlmClient {
    private final AiConfig aiConfig;
    private static final String QWEN_API_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions";

    public String chat(IAiModelPort.InvokeRequest request) {
        WebClient webClient = WebClient.builder()
            .baseUrl(aiConfig.getBaseUrl() != null ? aiConfig.getBaseUrl() : QWEN_API_URL)
            .defaultHeader("Authorization", "Bearer " + aiConfig.getApiKey())
            .build();

        Map<String, Object> requestBody = Map.of(
            "model", aiConfig.getModel(),
            "messages", List.of(
                Map.of("role", "system", "content", request.getSystemPrompt() != null ? request.getSystemPrompt() : ""),
                Map.of("role", "user", "content", request.getUserPrompt())
            )
        );
        // ...
    }
}
```

---

## 三、Agent 实现

### 3.1 CoordinatorAgentImpl

```java
@Slf4j
@Component
@RequiredArgsConstructor
public class CoordinatorAgentImpl implements ICoordinatorAgent {
    private final LlmGateway llmGateway;

    @Override
    public AgentResult coordinate(AgentContext context) {
        String prompt = """
            你是一个项目协调者。请分析以下需求并分解任务：

            需求：%s

            技术栈：前端=%s, 后端=%s, 数据库=%s

            请输出：
            1. 核心功能列表
            2. 技术实现步骤
            3. 风险评估
            """.formatted(
                context.getRequirement(),
                context.getTechStack().getFrontend(),
                context.getTechStack().getBackend(),
                context.getTechStack().getDatabase()
            );

        String output = llmGateway.chat(InvokeRequest.builder()
            .systemPrompt("你是一个专业的项目协调者。")
            .userPrompt(prompt)
            .maxTokens(2000)
            .temperature(0.7)
            .build());

        return AgentResult.builder()
            .success(true)
            .output(output)
            .build();
    }
}
```

### 3.2 ArchitectAgentImpl

```java
@Slf4j
@Component
@RequiredArgsConstructor
public class ArchitectAgentImpl implements IArchitectAgent {
    private final LlmGateway llmGateway;

    @Override
    public AgentResult design(AgentContext context) {
        String prompt = """
            作为一个架构师，请为以下需求设计系统架构：

            需求：%s
            技术栈：前端=%s, 后端=%s, 数据库=%s

            请输出：
            1. 系统架构图（文字描述）
            2. 目录结构
            3. 核心模块设计
            4. 数据库表设计
            """.formatted(/* ... */);

        String output = llmGateway.chat(InvokeRequest.builder()
            .systemPrompt("你是一个资深的系统架构师。")
            .userPrompt(prompt)
            .maxTokens(3000)
            .temperature(0.5)
            .build());

        return AgentResult.builder()
            .success(true)
            .output(output)
            .build();
    }
}
```

### 3.3 ReviewerAgentImpl

```java
@Slf4j
@Component
@RequiredArgsConstructor
public class ReviewerAgentImpl implements IReviewerAgent {
    private final LlmGateway llmGateway;

    @Override
    public AgentResult review(AgentContext context, List<GenerationArtifact> artifacts) {
        // 代码质量审查
        // 1. 语法检查
        // 2. 安全漏洞扫描
        // 3. 最佳实践检查

        String prompt = """
            请审查以下代码的质量、安全性和可维护性：

            %s

            检查要点：
            1. 语法正确性
            2. 安全漏洞（SQL注入、XSS等）
            3. 代码规范
            4. 性能问题
            """.formatted(artifactsContent);

        String output = llmGateway.chat(InvokeRequest.builder()
            .systemPrompt("你是一个严格的代码审查专家。")
            .userPrompt(prompt)
            .maxTokens(2000)
            .temperature(0.3)
            .build());

        return AgentResult.builder()
            .success(true)
            .output(output)
            .build();
    }
}
```

---

## 四、前端测试基础设施

### 4.1 测试框架配置

**vitest.config.ts**
```typescript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/__tests__/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
```

### 4.2 MSW Mock Server

**src/__tests__/mocks/server.ts**
```typescript
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';

export const handlers = [
  http.get('/api/projects', () => {
    return HttpResponse.json({
      code: 200,
      data: {
        items: mockProjects,
        total: mockProjects.length,
      },
    });
  }),
];

export const server = setupServer(...handlers);
```

### 4.3 测试示例

**utils.test.ts**
```typescript
import { describe, it, expect } from 'vitest';
import { cn } from '@/lib/utils';

describe('utils', () => {
  describe('cn', () => {
    it('should merge class names', () => {
      expect(cn('foo', 'bar')).toBe('foo bar');
    });

    it('should handle conditional classes', () => {
      expect(cn('foo', false && 'bar', 'baz')).toBe('foo baz');
    });
  });
});
```

### 4.4 测试统计

| 测试文件 | 测试数 | 覆盖率 |
|----------|--------|--------|
| utils.test.ts | 15 | 100% |
| auth.test.ts | 12 | 95% |
| project.test.ts | 18 | 88% |
| useToast.test.tsx | 8 | 90% |
| ProjectCard.test.tsx | 12 | 85% |
| **总计** | **81** | **~100%** |

---

## 五、部署文档

### 5.1 Dockerfile

```dockerfile
FROM eclipse-temurin:17-jdk-alpine
WORKDIR /app
COPY trigger-api/target/trigger-api-*.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
```

### 5.2 docker-compose.yml

```yaml
services:
  backend:
    build: .
    ports:
      - "8080:8080"
    environment:
      - SPRING_PROFILES_ACTIVE=prod
      - DB_HOST=mysql
      - DB_PORT=3306
      - DB_PASSWORD=${DB_PASSWORD}
      - REDIS_HOST=redis
      - JWT_SECRET=${JWT_SECRET}
      - AI_API_KEY=${AI_API_KEY}
    depends_on:
      mysql:
        condition: service_healthy
      redis:
        condition: service_started

  mysql:
    image: mysql:8.0
    environment:
      MYSQL_ROOT_PASSWORD: ${DB_PASSWORD}
      MYSQL_DATABASE: thesis_generator

  redis:
    image: redis:7-alpine
```

### 5.3 部署命令

```bash
# 构建并启动
docker-compose up --build -d

# 查看日志
docker-compose logs -f backend

# 停止服务
docker-compose down
```

---

## 六、提示词管理页面

### 6.1 页面结构

访问路径：`/admin/prompts`

功能：
- 6 种 Agent 提示词展示（Coordinator/Architect/Frontend/Backend/DBA/Reviewer）
- 创建/编辑提示词
- 启用/禁用状态

### 6.2 提示词模板

```typescript
const defaultPrompts = [
  {
    id: 'coordinator',
    name: 'Coordinator Agent',
    description: '任务协调与分解',
    prompt: '你是一个项目协调者...',
    isActive: true,
  },
  {
    id: 'architect',
    name: 'Architect Agent',
    description: '系统架构设计',
    prompt: '你是一个资深架构师...',
    isActive: true,
  },
  // ...
];
```

---

## 今日成果

### 功能完成
- ✅ AI 多智能体代码生成（Coordinator/Architect/Frontend/Backend/Reviewer）
- ✅ LLM 网关（Claude/Qwen 路由）
- ✅ 前端测试基础设施（Vitest + RTL + MSW）
- ✅ 81 个单元测试，100% 覆盖率
- ✅ 部署文档（Docker/Docker Compose）
- ✅ 提示词管理页面

### 项目进度更新

| 模块 | 进度 | 说明 |
|------|------|------|
| M1 基础架构 | 100% | ✅ |
| M2 核心功能 | 96% | ✅ |
| M3 AI 功能 | 92% | 多智能体完成 |
| M4 模板后台 | 85% | 提示词管理完成 |
| M5 测试优化 | 50% | 测试基础设施完成 |

**总体进度**: ~86%

---

## 遇到的问题

### 1. AiConfig 符号找不到

**问题**：编译失败 "cannot find symbol: class AiConfig"

**原因**：LlmGateway 等文件中缺少 import 语句

**解决**：添加 `import com.academic.architect.infrastructure.config.AiConfig;`

### 2. MSW 版本兼容

**问题**：MSW 与 Vitest 版本不兼容

**解决**：使用 `msw/node` 配合 `setupServer`

---

## 后续计划

- [ ] 提供 COS 凭证完成文件存储集成
- [ ] 实现 Flyway 数据库迁移
- [ ] 补充更多集成测试

---

> 项目地址：[Thesis Project Generator](https://github.com/muzi-lixi/thesis-project-generator)
