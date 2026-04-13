---
title: Thesis Project Generator 开发日记 #1 - 项目架构与核心功能
date: 2026-04-09 15:30:00
categories:
  - [笔记, 项目, 毕设项目生成平台]
tags:
  - Java
  - Spring Boot
  - DDD架构
  - WebSocket
  - MyBatis-Plus
  - STOMP协议
---

# Thesis Project Generator - 开发日记 #1

## 前言

今天继续完善 **Thesis Project Generator**（毕设项目生成平台）的后端核心功能。主要完成了版本管理模块的 API 实现，以及 WebSocket 推送从原生协议升级到 STOMP 协议。

---

## 项目概述

### 项目目标
帮助计算机专业学生通过分析论文或输入需求，自动生成可运行的项目脚手架代码。

### 技术架构
- **后端**：Java 17 + Spring Boot 3.2.3 + DDD 六边形架构
- **前端**：Next.js 14 + TypeScript + Tailwind CSS
- **数据库**：MySQL + Redis
- **AI**：Claude API / 通义千问

### DDD 分层架构
```
backend/
├── trigger-api/       # 触发层 - HTTP Controllers
├── domain/            # 领域层 - 核心业务逻辑
├── application/       # 应用层 - 业务编排
└── infrastructure/     # 基础设施层 - Repository实现、DAO
```

---

## 上午：版本管理模块 API 实现

### 1. 需求背景

前端版本历史页面调用 `/projects/{id}/versions` 接口，但后端原 ProjectController 缺少该接口，导致前端降级使用 Mock 数据。

### 2. 实现内容

#### 2.1 新增数据库表（已存在）

```sql
CREATE TABLE IF NOT EXISTS project_versions (
    id VARCHAR(50) PRIMARY KEY,
    project_id VARCHAR(50) NOT NULL,
    version_name VARCHAR(50) NOT NULL,
    description TEXT,
    status VARCHAR(20) DEFAULT 'ACTIVE',
    file_path VARCHAR(500),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

#### 2.2 Domain 层新增

**VersionEntity.java** - 版本实体
```java
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class VersionEntity {
    private String id;
    private String projectId;
    private String versionName;
    private String description;
    private String status;
    private String filePath;
    private LocalDateTime createdAt;
}
```

**IVersionRepository.java** - 版本仓储接口
```java
public interface IVersionRepository {
    List<VersionEntity> findByProjectId(String projectId);
    Optional<VersionEntity> findById(String id);
    void save(VersionEntity version);
    void deleteById(String id);
}
```

#### 2.3 Infrastructure 层新增

**VersionPO.java** - 持久化对象
```java
@Data
@TableName("project_versions")
public class VersionPO {
    @TableId(type = IdType.INPUT)
    private String id;
    private String projectId;
    private String versionName;
    private String description;
    private String status;
    private String filePath;
    private LocalDateTime createdAt;
}
```

**VersionMapper.java** - PO-Entity 转换器

**VersionDAO.java** - MyBatis-Plus DAO 接口

**VersionRepositoryImpl.java** - 仓储实现
```java
@Repository
public class VersionRepositoryImpl implements IVersionRepository {
    private final VersionDAO versionDAO;
    // 实现 findByProjectId, findById, save, deleteById
}
```

#### 2.4 ProjectDomainService 新增方法

```java
// 获取项目版本列表
public List<VersionEntity> getProjectVersions(String projectId) {
    getProject(projectId); // 验证项目存在
    return versionRepository.findByProjectId(projectId);
}

// 获取版本详情
public VersionEntity getVersion(String versionId) {
    return versionRepository.findById(versionId)
        .orElseThrow(() -> new IllegalArgumentException("版本不存在"));
}

// 创建版本
public VersionEntity createVersion(String projectId, String versionName, String description) {
    getProject(projectId); // 验证项目存在
    VersionEntity version = VersionEntity.builder()
        .id(generateVersionId())
        .projectId(projectId)
        .versionName(versionName)
        .description(description)
        .status("ACTIVE")
        .createdAt(LocalDateTime.now())
        .build();
    versionRepository.save(version);
    return version;
}
```

#### 2.5 ProjectController 新增 API

| 接口 | 方法 | 路径 |
|------|------|------|
| 获取版本列表 | GET | `/projects/{projectId}/versions` |
| 获取版本详情 | GET | `/projects/{projectId}/versions/{versionId}` |
| 创建版本 | POST | `/projects/{projectId}/versions` |

### 3. API 测试结果

```bash
# 获取版本列表
curl http://localhost:8080/projects/P1775701806138/versions \
  -H "Authorization: Bearer $TOKEN"
# 返回: {"code":200,"data":{"items":[...],"total":1}}

# 创建版本
curl -X POST http://localhost:8080/projects/P1775701806138/versions \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"versionName":"v1.0.0","description":"初始版本"}'
# 返回: {"code":200,"data":{"id":"V1775713567456",...}}
```

---

## 下午：版本下载 API 与 STOMP 升级

### 1. 版本下载 API 实现

#### 1.1 新增 DTO

**VersionDownloadVO.java**
```java
@Data
@Builder
public class VersionDownloadVO {
    private String downloadUrl;
    private String message;
    private Long fileSize;
}
```

**VersionArtifactsVO.java**
```java
@Data
@Builder
public class VersionArtifactsVO {
    private List<ArtifactItem> artifacts;
    private int total;

    @Data
    public static class ArtifactItem {
        private String name;
        private String path;
        private String type;
        private Long size;
    }
}
```

#### 1.2 新增 API 端点

| 接口 | 方法 | 路径 |
|------|------|------|
| 获取下载链接 | GET | `/projects/{projectId}/versions/{versionId}/download` |
| 获取版本产物 | GET | `/projects/{projectId}/versions/{versionId}/artifacts` |

#### 1.3 前后端字段对齐

⚠️ **重要**：以数据库字段类型为准

| 前端期望 | 后端实现 | 说明 |
|----------|----------|------|
| `versionNumber` (number) | 不存在 | 前端根据列表索引计算 |

前端 `ProjectVersionDTO` 期望 `versionNumber` 字段，但数据库 `project_versions` 表只有 `version_name` (VARCHAR)。处理方式：
- 后端仅返回数据库已有字段
- 前端根据版本列表的 `index + 1` 计算 `versionNumber`

### 2. WebSocket STOMP 协议升级（已完成）

#### 2.1 升级背景

原有 WebSocket 使用原生 Handler 模式，前端未使用 WebSocket 仍在轮询、服务端使用 `new Thread()`、缺少重连/心跳机制。

#### 2.2 STOMP 配置

**WebSocketConfig.java**
```java
@Configuration
@EnableWebSocketMessageBroker
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {
    @Override
    public void configureMessageBroker(MessageBrokerRegistry registry) {
        registry.enableSimpleBroker("/topic");           // 广播前缀
        registry.setApplicationDestinationPrefixes("/app"); // 应用前缀
    }

    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        registry.addEndpoint("/ws/generation")
                .setAllowedOrigins("*")
                .withSockJS();  // SockJS 降级支持
    }
}
```

#### 2.3 进度推送简化

**GenerationProgressListener.java** - 使用 SimpMessagingTemplate
```java
@Component
@RequiredArgsConstructor
public class GenerationProgressListener {
    private final MessageSendingOperations<String> messagingTemplate;

    @EventListener
    public void handleGenerationProgress(GenerationProgressEvent event) {
        String destination = "/topic/job/" + event.getJobDTO().getId() + "/progress";
        messagingTemplate.convertAndSend(destination, event.getJobDTO());
    }
}
```

#### 2.4 前端连接方式

```javascript
// STOMP over SockJS
const socket = new SockJS('/ws/generation');
const stompClient = Stomp.over(socket);

stompClient.connect({}, () => {
    stompClient.subscribe('/topic/job/{jobId}/progress', (message) => {
        const progress = JSON.parse(message.body);
        // 更新UI
    });
});
```

---

## 今日成果

### 功能完成
- ✅ 版本列表 API (`GET /projects/{id}/versions`)
- ✅ 版本详情 API (`GET /projects/{id}/versions/{versionId}`)
- ✅ 创建版本 API (`POST /projects/{id}/versions`)
- ✅ 版本下载 API (`GET /projects/{id}/versions/{vid}/download`)
- ✅ 版本产物 API (`GET /projects/{id}/versions/{vid}/artifacts`)

### 新增文件统计

| 层级 | 文件 | 说明 |
|------|------|------|
| Domain | VersionEntity.java | 版本实体 |
| Domain | IVersionRepository.java | 版本仓储接口 |
| Infrastructure | VersionPO.java | 持久化对象 |
| Infrastructure | VersionMapper.java | PO转换器 |
| Infrastructure | VersionDAO.java | DAO接口 |
| Infrastructure | VersionRepositoryImpl.java | 仓储实现 |
| API | VersionDTO.java | 响应DTO |
| API | VersionListData.java | 列表数据 |
| API | VersionDownloadVO.java | 下载响应 |
| API | VersionArtifactsVO.java | 产物响应 |
| API | CreateVersionRequest.java | 创建请求 |

**总计**：新增约 11 个 Java 文件

---

## 遇到的问题

### 1. Maven 构建时 JAR 文件被锁定

**问题**：`mvn clean` 时提示 `Failed to delete trigger-api-1.0.0-SNAPSHOT.jar`

**原因**：后端服务正在运行，JAR 文件被占用

**解决方案**：
```bash
# 先停止运行中的 Java 进程
taskkill /F /PID <pid>
```

### 2. 前端 versionNumber 字段问题

**问题**：前端期望 `versionNumber` (number)，但数据库没有该字段

**解决方案**：以数据库为准，后端不返回该字段；前端根据列表索引计算

### 3. Windows Git Bash 代理问题

**问题**：`curl` 请求通过代理导致连接失败

**解决方案**：使用 `--noproxy '*'` 参数绕过代理
```bash
curl --noproxy '*' http://localhost:8080/auth/login
```

---

## 明日计划

- [ ] 实现 Admin 用户管理 API (T4.1.1/T4.1.2)
- [ ] 实现 Admin 模板管理 API (T4.2.1-T4.2.4)
- [ ] AI 多智能体生成功能 (T3.2.4-T3.2.8)

---

## 项目进度

| 模块 | 进度 | 说明 |
|------|------|------|
| M1 基础架构 | 100% | DDD架构、数据库、Redis |
| M2 核心功能 | 96% | 用户、项目、模板、论文解析 |
| M3 AI 功能 | 52% | 论文解析、WebSocket、版本管理 |
| M4 模板后台 | 31% | 前端UI完成，Admin API缺失 |
| M5 测试优化 | 17% | 单元测试框架 |

**总体进度**：约 63%

---

## 前后端 API 对齐状态

| 模块 | 前端 | 后端 | 状态 |
|------|------|------|------|
| 用户认证 | authApi | AuthController | ✅ |
| 用户资料 | userApi | UserController | ✅ |
| 项目管理 | projectApi | ProjectController | ✅ |
| 版本管理 | versionApi | ProjectController | ✅ |
| 生成任务 | generationApi | GenerationController | ✅ |
| 模板 | templateApi | TemplateController | ✅ |
| Admin | adminApi | 无 | ❌ Mock |

---

> 项目地址：[Thesis Project Generator](https://github.com/muzi-lixi/thesis-project-generator)
