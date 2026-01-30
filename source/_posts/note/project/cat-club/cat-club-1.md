---
title: Cat Club 开发日记 #1 - 项目启动与环境搭建
date: 2026-01-29 18:00:00
categories:
  - [笔记, 项目, 宠物俱乐部]
tags:
  - Flutter
  - Firebase
  - 宠物养成
  - 个人项目
---

## 前言

今天正式开始开发 **Cat Club**（猫咪俱乐部）—— 一款虚拟宠物陪伴应用。这个项目的灵感来源于我对宠物的喜爱，希望通过 AI 技术为用户创造独特的虚拟宠物体验。

项目的核心理念是：
- 🎨 **AI 智能生成**：上传宠物照片，AI 自动生成卡通形象
- 💝 **情感陪伴**：通过互动养成建立情感连接
- 🌟 **永久纪念**：为已故宠物提供温馨的纪念模式

---

## 技术栈选择

经过调研，我选择了以下技术栈：

| 技术 | 选择 | 理由 |
|------|------|------|
| 前端框架 | Flutter | 跨平台、高性能、丰富生态 |
| 状态管理 | Riverpod | 类型安全、可测试性强 |
| 路由 | go_router | 声明式路由、深链接支持 |
| 后端服务 | Firebase | 快速开发、实时同步、免运维 |
| AI 生成 | Replicate API | 灵活的模型选择、按需付费 |

---

## Day 1 开发记录

### 1. 环境配置踩坑

首次运行项目就遇到了一堆依赖问题，花了不少时间解决：

#### Firebase 依赖版本过旧

项目模板的 Firebase 版本太老，需要全面升级：

```yaml
# pubspec.yaml 升级后
dependencies:
  firebase_core: ^4.4.0      # 原 2.x
  firebase_auth: ^6.1.0      # 原 4.x
  cloud_firestore: ^6.1.0    # 原 4.x
  firebase_storage: ^13.0.0  # 原 11.x
```

#### Kotlin 版本问题

Android 构建时报错找不到 Kotlin 版本：

```kotlin
// settings.gradle.kts
// 错误：2.2.20 不存在
// 修复：改为 2.0.21
plugins {
    id("org.jetbrains.kotlin.android") version "2.0.21" apply false
}
```

#### Maven 仓库网络问题

国内网络访问 Google Maven 仓库超时，配置了阿里云镜像：

```kotlin
// settings.gradle.kts
dependencyResolutionManagement {
    repositories {
        maven { url = uri("https://maven.aliyun.com/repository/google") }
        maven { url = uri("https://maven.aliyun.com/repository/central") }
        google()
        mavenCentral()
    }
}
```

### 2. Google 登录集成

这是今天的重头戏。Flutter 集成 Google 登录需要以下步骤：

#### Step 1: 获取 SHA-1 指纹

```bash
cd android
./gradlew signingReport
```

获取到调试签名：`81:E0:2F:F3:C5:AB:C6:9B:EA:88:CB:40:4C:A6:9B:5C:15:36:41:73`

#### Step 2: Firebase Console 配置

1. 进入 Firebase Console → Authentication → Sign-in method
2. 启用 Google 登录
3. 添加 SHA-1 指纹
4. 重新下载 `google-services.json`

#### Step 3: 代码实现

```dart
// auth_service.dart
Future<UserCredential?> signInWithGoogle() async {
  final GoogleSignInAccount? googleUser = await GoogleSignIn().signIn();
  if (googleUser == null) return null;

  final GoogleSignInAuthentication googleAuth =
      await googleUser.authentication;

  final credential = GoogleAuthProvider.credential(
    accessToken: googleAuth.accessToken,
    idToken: googleAuth.idToken,
  );

  return await _auth.signInWithCredential(credential);
}
```

### 3. 项目架构

采用 Clean Architecture 分层：

```
lib/
├── core/          # 核心基础设施
│   ├── constants/ # 常量定义
│   ├── theme/     # 主题配置
│   └── utils/     # 工具类
├── data/          # 数据层
│   └── models/    # 数据模型 (freezed)
├── providers/     # 状态管理 (Riverpod)
├── services/      # 服务层
└── presentation/  # 表示层
    ├── pages/     # 页面
    ├── widgets/   # 组件
    └── router/    # 路由
```

---

## 今日成果

- ✅ 项目环境配置完成
- ✅ Firebase 集成（Auth、Firestore、Storage）
- ✅ 邮箱注册/登录功能
- ✅ Google 登录功能
- ✅ 基础页面框架（启动页、登录页、注册页）

---

## 遇到的问题

1. **Firebase 重复初始化崩溃**：在 `main.dart` 添加 try-catch 处理
2. **CardTheme API 变更**：Flutter 3.x 需要使用 `CardThemeData`
3. **image_cropper 版本冲突**：升级到 11.0.0 解决

---

## 明日计划

- [ ] 实现宠物创建页面
- [ ] 完成宠物房间主页
- [ ] 添加基础互动功能（喂食、抚摸）
- [ ] 实现状态条显示

---

## 心得体会

第一天主要在和各种依赖版本做斗争，这也是 Flutter 开发的常态。好在最终都解决了，项目能够正常运行。

Google 登录的集成比想象中顺利，Firebase 的文档还是比较完善的。明天开始进入核心功能开发，期待看到第一只虚拟宠物诞生！

---

> 项目地址：[Cat Club](https://github.com/xxx/cat-club)（待开源）
