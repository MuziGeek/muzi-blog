---
title: "Cat Club 开发日记 #5 - 腾讯云 CloudBase 迁移文档整理"
date: 2026-02-05 09:59:55
categories:
  - ["笔记", "项目", "宠物俱乐部"]
tags:
  - "Flutter"
  - "CloudBase"
  - "腾讯云"
  - "Firebase"
  - "云迁移"
---

# Cat-club-5

## 前言

今天的主要工作是整理腾讯云 CloudBase 迁移文档。项目正在从 Firebase 迁移到腾讯云 CloudBase，为了方便后续开发时快速了解迁移状态和开发指南，我将所有相关信息整理到了 `CLAUDE.md` 中。

---

## 上午：CloudBase 迁移信息收集

### 1. 学习 CloudBase Skills

首先通过 Claude Code 的 Skills 系统学习了 CloudBase 的开发规范：

| Skill 名称 | 用途 |
|------------|------|
| `cloudbase-guidelines` | CloudBase 开发总纲，平台选择、认证、数据库等 |
| `http-api-cloudbase` | HTTP API 调用方式，适用于原生应用 |

**关键发现**：Flutter/原生应用**不支持 CloudBase SDK**，必须使用 HTTP API 方式！

```dart
// ❌ 错误：SDK 方式（仅 Web/小程序可用）
import 'package:cloudbase_ce/cloudbase_ce.dart';

// ✅ 正确：HTTP API 方式（Flutter/原生应用）
import 'package:http/http.dart' as http;
final response = await http.post(
  Uri.parse('$apiBaseUrl/auth/v1/signin'),
  headers: {'Authorization': 'Bearer $publishableKey'},
  body: jsonEncode({'email': email, 'password': password}),
);
```

### 2. 分析现有 CloudBase 实现

项目中已经完成了三个核心服务的 CloudBase 迁移：

| 服务 | 文件 | 实现方式 |
|------|------|----------|
| 认证服务 | `cloudbase_auth_http_service.dart` | HTTP API |
| 数据库服务 | `cloudbase_service.dart` | SDK（待优化）|
| 存储服务 | `storage_service.dart` | 腾讯云 COS |

**认证服务**支持的登录方式非常完整：

- ✅ 用户名/邮箱/手机号 + 密码登录
- ✅ 邮箱 OTP 验证码登录
- ✅ 手机短信验证码登录（推荐）
- ✅ 匿名登录
- ✅ OAuth 第三方登录
- ✅ Token 刷新

---

## 下午：CLAUDE.md 文档更新

### 1. 添加迁移计划章节

在 `CLAUDE.md` 中新增了完整的 CloudBase 迁移文档，包括：

```markdown
## 🔄 腾讯云 CloudBase 迁移计划

### CloudBase 环境信息
envId: 'cat-hub-6gcp6yje9dd382c7'
region: 'ap-shanghai'
apiBaseUrl: 'https://cat-hub-6gcp6yje9dd382c7.api.tcloudbasegateway.com'
```

### 2. 迁移对照表

| 功能模块 | Firebase (原) | CloudBase (新) | 迁移状态 |
|----------|---------------|----------------|----------|
| 认证服务 | Firebase Auth | CloudBase HTTP API Auth | ✅ 已完成 |
| 数据库 | Firestore | CloudBase 文档数据库 | ✅ 已完成 |
| 存储服务 | Firebase Storage | 腾讯云 COS | ✅ 已完成 |
| 云函数 | Cloud Functions | CloudBase 云函数 | 📋 待迁移 |
| 推送通知 | FCM | 待定 | 📋 待迁移 |

### 3. 待迁移文件清单

识别出 13 个仍在使用 Firebase 的文件：

| 文件路径 | 使用的服务 | 优先级 |
|----------|-----------|--------|
| `lib/main.dart` | Firebase 初始化 | 高 |
| `lib/services/auth_service.dart` | Firebase Auth | 中 |
| `lib/services/firestore_service.dart` | Firestore | 中 |
| `lib/providers/auth_provider.dart` | Firebase Auth | 中 |
| `lib/services/check_in_service.dart` | Firestore | 中 |
| `lib/services/ai_generation_service.dart` | Firebase Storage | 低 |

---

## 今日成果

### 功能完成

- ✅ CloudBase Skills 学习和整理
- ✅ 现有 CloudBase 实现分析
- ✅ CLAUDE.md 迁移文档编写
- ✅ 待迁移文件清单整理
- ✅ 开发指南和 API 端点记录

### 文档新增内容

```java
CLAUDE.md 新增章节：
├── 🔄 腾讯云 CloudBase 迁移计划
│   ├── 迁移背景
│   ├── CloudBase 环境信息
│   ├── 迁移对照表
│   ├── 已完成的 CloudBase 服务实现
│   │   ├── 认证服务 (HTTP API)
│   │   ├── 数据库服务 (SDK)
│   │   └── 存储服务 (COS)
│   └── 待迁移的 Firebase 服务
└── CloudBase 开发指南
    ├── 关键 Skill 参考
    ├── Flutter/原生应用限制说明
    ├── CloudBase MCP 工具
    ├── 认证 API 端点参考
    ├── 手机号格式要求
    └── 控制台入口链接
```

---

## 重要发现

### 1. Flutter 不能使用 CloudBase SDK

这是最关键的发现！CloudBase 官方 SDK 只支持 Web 和小程序，原生应用必须使用 HTTP API。

项目中的 `cloudbase_ce` 包虽然能编译，但实际上是社区维护的非官方包，稳定性存疑。后续应该统一使用 HTTP API 方式。

### 2. 手机号格式要求

CloudBase 认证 API 对手机号格式有严格要求：

```dart
// ✅ 正确格式：国家码 + 空格 + 手机号
final formattedPhone = '+86 13800138000';

// ❌ 错误格式
final phone = '13800138000';       // 缺少国家码
final phone = '+8613800138000';    // 缺少空格
```

### 3. 默认推荐手机验证码登录

对于国内用户，手机验证码登录是最推荐的方式：

- ✅ 用户体验最友好
- ✅ 无需记忆密码
- ✅ 注册登录一体化
- ✅ 安全性高

---

## 明日计划

- [ ] 切换 `main.dart` 初始化，从 Firebase 切换到 CloudBase
- [ ] 统一认证 Provider，使用 CloudBase HTTP Auth
- [ ] 清理 Firebase 相关依赖
- [ ] 测试完整的认证流程

---

## 心得体会

今天主要是文档整理工作，虽然没有写代码，但这类工作非常重要。

项目从 Firebase 迁移到 CloudBase 涉及多个服务模块，如果不做好文档记录，后续开发时很容易混乱。现在有了完整的迁移对照表和开发指南，下次继续开发时可以快速上手。

另外，通过 Skills 系统学习 CloudBase 开发规范的体验很不错。相比于自己去翻官方文档，Skills 提供的是经过整理的最佳实践，更加高效。

---

## 项目进度

| 模块 | 进度 | 说明 |
|------|------|------|
| 认证系统 | 90% | CloudBase HTTP API 已实现，待切换 |
| 数据库 | 85% | CloudBase SDK 已实现，部分功能待迁移 |
| 存储服务 | 100% | 腾讯云 COS 已完成 |
| 宠物交互 | 100% | 手势交互系统完成 |
| 商店系统 | 100% | 道具购买完成 |
| 签到系统 | 100% | 7 天循环奖励完成 |
| 成就系统 | 100% | 成就触发和展示完成 |
| 文档整理 | 100% | 迁移文档已完成 |

---

> 项目地址：[Cat Club](https://github.com/xxx/cat-club)（待开源）
