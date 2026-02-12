---
title: Cat Club 开发日记 #7 - 移除匿名用户，强制登录
date: 2026-02-11 17:31:44
categories:
  - [笔记, 项目, 宠物俱乐部]
tags:
  - Flutter
  - Riverpod
  - 权限系统
  - 会员等级
  - CloudBase
  - 数据库迁移
---

## 前言

之前为了降低用户使用门槛，Cat Club 支持了「匿名体验」功能——不需要注册就能直接进入应用玩耍。听起来很美好，但实际用下来发现一个致命问题：**匿名用户的数据会丢失**。今天的任务就是彻底移除匿名用户角色，让所有用户必须登录才能使用。

---

## 为什么要移除匿名用户？

### 数据持久化的隐患

深入分析了匿名用户的数据持久化机制后，发现了一条脆弱的链路：

```
CloudBase 服务端生成 UUID → Token 存储在 SharedPreferences → 下次启动自动恢复
```

这意味着：
- ✅ 正常使用没问题，Token 一直在本地
- ❌ **卸载重装** → SharedPreferences 被清空 → Token 丢失 → 数据永久丢不回来
- ❌ **清除应用数据** → 同上
- ❌ **换设备** → 无法迁移

用户辛辛苦苦养的猫、攒的金币、签到的天数，说没就没了。这对用户体验是毁灭性的打击。

### 决策：一刀切

与其做复杂的「匿名升级绑定手机号」流程（之前已经写了 `bind_phone_page.dart`），不如直接要求登录。CloudBase 支持手机验证码登录，体验已经足够丝滑，不需要匿名兜底。

---

## 实施过程：7 个阶段

整个移除工作涉及 **13 个文件修改 + 2 个文件删除 + 3 条数据库迁移 SQL**，我把它分成了 7 个阶段逐步推进。

### Phase 1：移除登录页入口

最直观的改动——把登录页的「匿名体验」按钮干掉。

```dart
// 删除前：auth_page.dart 里有这么一段
TextButton.icon(
  onPressed: _handleAnonymousLogin,
  icon: const Icon(Icons.visibility_off),
  label: const Text('匿名体验'),
)

// 删除后：干干净净，只剩手机号和邮箱登录
```

同时删除了 `_handleAnonymousLogin()` 方法，这个方法会调用 Provider 层的匿名登录逻辑。

### Phase 2：清理 Provider 层

三个文件需要改动：

**auth_provider.dart** — 删除 `signInAnonymously()` 方法（约 24 行）：

```dart
// 整个方法直接移除
Future<void> signInAnonymously() async {
  state = state.copyWith(isLoading: true);
  try {
    await _authService.signInAnonymously();
    // ... 创建用户文档等逻辑
  } catch (e) {
    // ...
  }
}
```

**user_provider.dart** — 统一新用户初始资源，不再区分匿名和注册用户：

```dart
// 之前：匿名用户只给 50 金币、0 钻石、1 宠物位
// 现在：所有用户统一 100 金币、10 钻石、4 宠物位
final user = UserModel(
  id: userId,
  isAnonymous: false,  // 永远是 false
  coins: 100,
  diamonds: 10,
  maxPets: 4,
  createdAt: DateTime.now(),
);
```

**permission_provider.dart** — 移除 `isAnonymous` 字段，`maxPets` 默认值从 1 改为 4。

### Phase 3：调整会员等级体系

这是改动最核心的部分。原来的四级体系：

| 等级 | 代码 | level |
|------|------|-------|
| 游客 | `anonymous` | 0 |
| 普通会员 | `registered` | 1 |
| VIP | `vip` | 2 |
| 尊享VIP | `premium_vip` | 3 |

调整后的三级体系：

| 等级 | 代码 | level |
|------|------|-------|
| 普通会员 | `registered` | 0 |
| VIP | `vip` | 1 |
| 尊享VIP | `premium_vip` | 2 |

关键在于**向后兼容**。数据库里已经有 `membershipTier = 'anonymous'` 的数据，不能让它们报错：

```dart
static MembershipTier fromCode(String? code) {
  if (code == null || code.isEmpty) return MembershipTier.registered;
  // 历史数据兼容：anonymous 映射为 registered
  if (code == 'anonymous') return MembershipTier.registered;
  return MembershipTier.values.firstWhere(
    (tier) => tier.code == code,
    orElse: () => MembershipTier.registered,
  );
}
```

同样在 `effectiveTier` 扩展方法中也加了兜底：

```dart
MembershipTier get effectiveTier {
  if (!isMembershipActive && tier.level > MembershipTier.registered.level) {
    return MembershipTier.registered;
  }
  // 兼容历史数据
  if (membershipTier == 'anonymous') {
    return MembershipTier.registered;
  }
  return tier;
}
```

### Phase 4：清理 UI 层

涉及 5 个文件，主要是移除各处的 `isAnonymous` 判断和 `MembershipTier.anonymous` 的 switch 分支。

**宠物选择器**（`pet_selector.dart`）的改动比较典型：

```dart
// 之前：匿名用户有特殊提示
if (permission.isAnonymous) {
  _showBindPhoneDialog();
} else {
  _showUpgradeDialog();
}

// 现在：统一的升级提示，适用于任何等级
_showUpgradeDialog();  // 通用化，不再区分匿名
```

**个人中心**（`profile_page.dart`）的昵称显示也简化了：

```dart
// 之前：匿名用户显示"游客"
final displayName = user?.isAnonymous == true ? '游客' : (user?.displayName ?? '未设置昵称');

// 现在：统一逻辑
final displayName = (user?.displayName as String?)?.isNotEmpty == true
    ? user!.displayName!
    : '未设置昵称';
```

### Phase 5：删除废弃文件

两个文件已经没有存在意义了：

- `bind_phone_page.dart` — 匿名用户绑定手机号的页面
- `upgrade_prompt_dialog.dart` — V1 版本的匿名升级提示对话框

同时从 `app_router.dart` 移除了 `bindPhone` 路由定义。

### Phase 6：编译修复

改完所有文件后跑编译，果然报了一个错：

```
Error: 'UserModel' isn't a type.
  UserModel? user;
  ^^^^^^^^^
```

原因是之前给 `check_in_service.dart` 添加了 `UserModel? user` 变量用于重试逻辑，但忘了加 import。加上一行导入就好了：

```dart
import '../data/models/user_model.dart';
```

编译通过：`√ Built build\app\outputs\flutter-apk\app-debug.apk` ✅

### Phase 7：数据库迁移

最后一步，通过 CloudBase MCP 工具直接执行 SQL 迁移。

先查了一下表结构，发现 `isAnonymous` 列根本不存在于数据库中——它只在 Dart 模型层定义，数据库里没有这个字段。不过 `membershipTier` 列的默认值确实是 `'anonymous'`，需要改。

```sql
-- 1. 查询现有匿名用户
SELECT id, displayName, membershipTier FROM users
WHERE membershipTier = 'anonymous';
-- 结果：1 条记录（匿名用户）

-- 2. 更新会员等级
UPDATE users SET membershipTier = 'registered'
WHERE membershipTier = 'anonymous';
-- RowsAffected: 1 ✅

-- 3. 修改列默认值
ALTER TABLE users ALTER COLUMN membershipTier SET DEFAULT 'registered';
-- ✅
```

干净利落，数据库迁移完成。

---

## 遇到的问题

### 1. 签到服务 getUser 返回 null

**问题**：签到时 `getUser()` 偶尔返回 null，导致签到失败。

**原因**：网络波动或新用户首次签到时数据还没同步。

**解决方案**：添加重试机制 + 用户创建兜底：

```dart
// 重试一次
UserModel? user;
try {
  user = await _cloudbaseService.getUser(userId);
} catch (e) {
  await Future.delayed(const Duration(milliseconds: 500));
  user = await _cloudbaseService.getUser(userId);
}

// 用户不存在则创建
if (user == null) {
  user = await _cloudbaseService.ensureUserExists(userId);
}
```

### 2. MembershipBadge 的 switch 编译错误

**问题**：移除 `MembershipTier.anonymous` 后，`membership_badge.dart` 里所有 switch 表达式都报错——Dart 要求 switch 覆盖所有枚举值。

**解决方案**：删除所有 `MembershipTier.anonymous =>` 分支即可，因为枚举值已经不存在了，Dart 编译器会自动检查完整性。

### 3. CloudBase MCP 环境未设置

**问题**：首次尝试执行 SQL 时，MCP 工具报错 `USER_CANCELLED`，环境 ID 未配置。

**解决方案**：重新调用 `mcp__cloudbase__login` 登录并选择环境后，SQL 正常执行。

---

## 今日成果

### 功能完成

- ✅ 移除登录页「匿名体验」按钮
- ✅ 清理 Provider 层所有匿名用户逻辑
- ✅ 会员等级体系从 4 级调整为 3 级
- ✅ 清理 UI 层所有匿名用户特殊处理
- ✅ 删除 2 个废弃文件 + 移除路由
- ✅ 签到服务添加重试和兜底机制
- ✅ CloudBase MySQL 数据库迁移完成
- ✅ 编译验证通过

### 代码变更

```
13 files modified, 2 files deleted
+214 insertions, -62 deletions
3 SQL migrations executed
```

---

## 心得体会

这次移除匿名用户的工作，表面上是「删功能」，实际上比「加功能」更需要谨慎。每一处对 `isAnonymous` 的引用都要追踪到底，每一个 `MembershipTier.anonymous` 的 switch 分支都不能漏掉。

最重要的教训是**数据持久化要在设计阶段就想清楚**。匿名登录看起来方便，但如果没有可靠的数据恢复机制（比如设备绑定、云端备份），用户数据就像建在沙滩上的城堡。与其后续补救，不如一开始就要求登录——现在手机验证码登录已经够方便了，不值得为了「少一步操作」承担数据丢失的风险。

向后兼容也是个重要课题。即使移除了匿名用户功能，数据库里仍然可能存在 `membershipTier = 'anonymous'` 的历史数据。在 `fromCode()` 和 `effectiveTier` 中保留兼容逻辑，确保老数据不会导致应用崩溃，这种防御性编程的习惯值得保持。

---

## 项目进度

| 模块 | 进度 | 说明 |
|------|------|------|
| 认证系统 | 95% | CloudBase HTTP API 登录，已移除匿名 |
| 宠物养成 | 80% | CRUD + 互动 + 状态衰减 |
| 商店系统 | 90% | 道具购买 + 背包管理 |
| 签到系统 | 95% | 7 天循环奖励 + 重试机制 |
| 会员系统 | 70% | 等级体系完成，购买流程待实现 |
| 社区功能 | 10% | 占位页面 |
| AI 生成 | 5% | 框架搭建 |

---

> 项目地址：[Cat Club](https://github.com/MuziGeek/cat-club)
