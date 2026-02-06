---
title: Cat Club 开发日记 #6 - 腾讯云 CloudBase 完整迁移
date: 2026-02-06 10:03:39
categories:
  - [笔记, 项目, 宠物俱乐部]
tags:
  - Flutter
  - 腾讯云
  - CloudBase
  - MySQL
  - 认证
  - 架构迁移
---

## 前言

今天完成了一项重大的架构变更——将项目从 Google Firebase 完整迁移到腾讯云 CloudBase。这次迁移涉及认证系统、数据库、存储服务等核心模块，共修改 32 个文件，是项目迄今为止最大规模的重构工作。

---

## 上午：Firebase 依赖清理与 CloudBase 认证

### 1. 移除 Firebase 依赖

首先需要清理所有 Firebase 相关的代码和配置：

```dart
// 删除的文件
lib/config/firebase_options.dart      // Firebase 配置
lib/firebase_options.dart             // Firebase 选项
lib/services/auth_service.dart        // Firebase Auth 服务
lib/services/firestore_service.dart   // Firestore 服务
lib/services/cloudbase_auth_service.dart // CloudBase SDK 服务
```

同时更新 `pubspec.yaml`，移除 Firebase 相关依赖包：

```yaml
# 移除的依赖
dependencies:
  # firebase_core: ^4.4.0      # 移除
  # firebase_auth: ^6.1.0      # 移除
  # cloud_firestore: ^6.1.0    # 移除
  # firebase_storage: ^13.0.0  # 移除
```

### 2. CloudBase HTTP API 认证服务

由于 CloudBase SDK 不支持 Flutter 原生应用，必须使用 HTTP API 方式：

```dart
/// CloudBase HTTP API 认证服务
class CloudbaseAuthHttpService {
  /// 手机验证码登录
  Future<CloudbaseAuthState> signInWithPhone(String phone, String code) async {
    // 1. 发送验证码
    final verifyResult = await _sendPhoneOtp(phone);

    // 2. 验证验证码
    final token = await _verifyOtp(verifyResult.verificationId, code);

    // 3. 登录获取 Token
    return await _signInWithVerificationToken(token);
  }

  /// 邮箱密码登录
  Future<CloudbaseAuthState> signInWithPassword({
    required String email,
    required String password,
  }) async {
    final response = await http.post(
      Uri.parse('$_baseUrl/auth/v1/signin'),
      headers: {
        'Authorization': 'Bearer ${CloudbaseConfig.publishableKey}',
        'Content-Type': 'application/json',
      },
      body: jsonEncode({
        'email': email,
        'password': password,
      }),
    );
    // ...处理响应
  }
}
```

⚠️ **重要提醒**：手机号必须包含国家码和空格，格式为 `+86 13800138000`

---

## 下午：数据库迁移与 Provider 重构

### 1. Firestore → CloudBase MySQL

这次最大的变化是从 Firestore（NoSQL）迁移到 CloudBase MySQL（关系型数据库）：

| 对比项 | Firestore | CloudBase MySQL |
|--------|-----------|-----------------|
| 类型 | NoSQL 文档数据库 | 关系型数据库 |
| 查询 | 集合查询 | SQL + REST API |
| 结构 | 灵活 Schema | 固定表结构 |
| 事务 | 支持 | 支持 |

CloudbaseService 核心实现：

```dart
/// REST API 请求 (用于 MySQL REST 接口)
Future<List<Map<String, dynamic>>> _restGet(
  String table, {
  Map<String, String>? filters,
  int? limit,
  String? orderBy,
}) async {
  final token = await _getAuthToken();
  final uri = Uri.parse('$_baseUrl/rest/v1/$table')
      .replace(queryParameters: queryParams);

  final response = await http.get(uri, headers: {
    'Authorization': 'Bearer $token',
    'Content-Type': 'application/json',
  });
  // ...
}
```

### 2. Provider 层全面重构

所有 Provider 都需要切换数据源：

```dart
// 用户 Provider - 切换到 CloudBase
final userNotifierProvider = AsyncNotifierProvider<UserNotifier, UserModel?>(() {
  return UserNotifier();
});

class UserNotifier extends AsyncNotifier<UserModel?> {
  @override
  Future<UserModel?> build() async {
    final cloudbaseService = ref.watch(cloudbaseServiceProvider);
    final authState = await ref.watch(cloudbaseAuthStateHttpProvider.future);

    if (authState?.user == null) return null;
    return await cloudbaseService.getUser(authState!.user!.uid);
  }
}
```

---

## 今日成果

### 功能完成

- ✅ Firebase 依赖完全移除（5 个文件）
- ✅ CloudBase HTTP API 认证服务
- ✅ 手机验证码 / 邮箱密码 / 匿名登录
- ✅ Token 自动刷新和本地持久化
- ✅ CloudBase MySQL 数据服务
- ✅ 用户/宠物/背包/成就/签到 CRUD
- ✅ 所有 Provider 迁移完成
- ✅ 登录/注册页面适配

### 代码变更统计

| 指标 | 数值 |
|------|------|
| 修改文件数 | 32 |
| 新增代码行 | ~1,693 |
| 删除代码行 | ~1,778 |
| 净变化 | -85 行 |

### 新增文件

```
lib/services/
└── cloudbase_auth_http_service.dart  # CloudBase HTTP API 认证
```

### 删除文件

```
lib/
├── config/firebase_options.dart
├── firebase_options.dart
└── services/
    ├── auth_service.dart
    ├── firestore_service.dart
    └── cloudbase_auth_service.dart
```

---

## 遇到的问题

### 1. Flutter 不支持 CloudBase SDK

**问题**：CloudBase 官方 SDK（@cloudbase/js-sdk）仅支持 Web 和微信小程序，不支持 Flutter 原生应用。

**解决方案**：使用 CloudBase HTTP API 直接调用，封装 `CloudbaseAuthHttpService`：

```dart
// 直接使用 HTTP 请求而非 SDK
final response = await http.post(
  Uri.parse('${CloudbaseConfig.apiBaseUrl}/auth/v1/signin'),
  headers: {'Authorization': 'Bearer ${CloudbaseConfig.publishableKey}'},
  body: jsonEncode(requestBody),
);
```

### 2. 手机号格式要求

**问题**：CloudBase API 要求手机号必须包含国家码和空格，否则返回 400 错误。

**解决方案**：

```dart
// 格式化手机号
String formatPhone(String phone) {
  if (phone.startsWith('+86')) return phone;
  return '+86 $phone';  // 注意：国家码和号码之间有空格
}
```

### 3. Token 持久化

**问题**：认证状态需要在应用重启后保持。

**解决方案**：使用 SharedPreferences 存储 Token：

```dart
Future<void> _saveAuthState(CloudbaseAuthState state) async {
  final prefs = await SharedPreferences.getInstance();
  await prefs.setString('access_token', state.accessToken ?? '');
  await prefs.setString('refresh_token', state.refreshToken ?? '');
  await prefs.setInt('expires_at', DateTime.now()
      .add(Duration(seconds: state.expiresIn ?? 0))
      .millisecondsSinceEpoch);
}
```

---

## 明日计划

- [ ] 完整功能测试（登录、注册、数据操作）
- [ ] 错误处理优化（网络错误、Token 过期）
- [ ] STS 临时密钥方案（COS 上传安全优化）
- [ ] 性能优化（请求缓存、批量操作）

---

## 心得体会

这次迁移工作量比预期大很多，主要有几点感悟：

**1. 技术选型要考虑平台限制**

CloudBase SDK 不支持 Flutter 是个坑，好在 HTTP API 功能完整，但需要自己封装更多逻辑。以后选择 BaaS 服务时，一定要先确认目标平台的支持情况。

**2. NoSQL → SQL 的思维转换**

从 Firestore 的集合/文档模型切换到 MySQL 的表/行模型，需要重新思考数据结构。不过关系型数据库在复杂查询场景下确实更强大。

**3. HTTP API 的好处**

虽然没有 SDK 方便，但 HTTP API 更通用，调试也更直观。用 Postman 测试接口后再写代码，效率反而更高。

---

## 项目进度

| 模块 | 进度 | 说明 |
|------|------|------|
| 认证系统 | 100% | CloudBase HTTP API 完成 |
| 数据服务 | 100% | MySQL REST API 完成 |
| 存储服务 | 100% | 腾讯云 COS 完成 |
| 宠物养成 | 90% | 核心功能完成 |
| 签到系统 | 100% | 完成 |
| 成就系统 | 100% | 完成 |
| 社区功能 | 0% | 待开发 |
| AI 生成 | 0% | 待开发 |

---

## 技术栈总结

迁移后的技术栈：

| 层级 | 原方案 | 现方案 |
|------|--------|--------|
| 认证 | Firebase Auth | CloudBase HTTP API |
| 数据库 | Firestore (NoSQL) | CloudBase MySQL |
| 存储 | Firebase Storage | 腾讯云 COS |
| 状态管理 | Riverpod | Riverpod（不变） |
| 路由 | go_router | go_router（不变） |

---

> 项目地址：[Cat Club](https://github.com/xxx/cat-club)（待开源）
