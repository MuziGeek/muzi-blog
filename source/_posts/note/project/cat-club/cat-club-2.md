---
title: Cat Club 开发日记 #2 - 核心养成功能与沉浸式交互
date: 2026-01-30 18:00:00
categories:
  - [笔记, 项目, 宠物俱乐部]
tags:
  - Flutter
  - 手势交互
  - Riverpod
  - 拖拽
---

# Cat-club-2

## 前言

今天是开发的第二天，效率爆棚！不仅完成了核心养成功能，还把交互方式从传统按钮升级为沉浸式手势交互。用户现在可以通过点击、长按、双击、拖拽等方式与宠物互动，体验更加自然。

---

## 上午：核心功能开发

### 1. 路由守卫实现

使用 go_router 的 `redirect` 回调实现认证保护：

```dart
GoRouter(
  refreshListenable: GoRouterRefreshStream(authStateStream),
  redirect: (context, state) {
    final isLoggedIn = authState.valueOrNull != null;
    final isAuthPage = ['/login', '/register', '/'].contains(state.uri.path);

    if (!isLoggedIn && !isAuthPage) return '/login';
    if (isLoggedIn && isAuthPage) return '/pet-room';
    return null;
  },
  // ...
);
```

这样未登录用户访问任何受保护页面都会被重定向到登录页。

### 2. 底部导航栏

使用 `ShellRoute` 实现导航容器：

```dart
ShellRoute(
  builder: (context, state, child) => MainShellPage(child: child),
  routes: [
    GoRoute(path: '/pet-room', builder: ...),
    GoRoute(path: '/community', builder: ...),
    GoRoute(path: '/profile', builder: ...),
  ],
)
```

三个 Tab：首页（宠物房间）、社区、我的。

### 3. 状态衰减机制

这是养成游戏的核心——宠物状态会随时间衰减：

```dart
class StatusDecayCalculator {
  // 每小时衰减速率
  static const Map<String, double> decayRates = {
    'happiness': 2.0,    // 心情
    'hunger': 3.0,       // 饱腹度
    'energy': 1.5,       // 精力
    'cleanliness': 2.0,  // 清洁度
    'health': 0.5,       // 健康
  };

  static PetStatus calculateDecay(PetModel pet) {
    final hoursPassed = DateTime.now()
        .difference(pet.lastInteractionAt).inHours
        .clamp(0, 24);  // 最多计算24小时

    // 纪念模式不衰减
    if (pet.isMemorial) return pet.status;

    return PetStatus(
      happiness: (pet.status.happiness - hoursPassed * 2).clamp(0, 100),
      hunger: (pet.status.hunger - hoursPassed * 3).clamp(0, 100),
      // ...
    );
  }
}
```

### 4. Firestore 序列化踩坑

freezed 生成的 `toJson()` 和 Firestore 不太兼容，花了不少时间调试：

**问题**：嵌套对象序列化失败、DateTime 格式不对、枚举值不匹配

**解决方案**：手动构建 Firestore 数据结构

```dart
Map<String, dynamic> _petToFirestore(PetModel pet) {
  return {
    'id': pet.id,
    'name': pet.name,
    'species': pet.species.name,  // 枚举转字符串
    'status': {
      'happiness': pet.status.happiness,
      'hunger': pet.status.hunger,
      // ...
    },
    'createdAt': Timestamp.fromDate(pet.createdAt),  // DateTime 转 Timestamp
    // ...
  };
}
```

---

## 下午：沉浸式交互重构

这是今天最兴奋的部分！把无聊的按钮交互改成手势交互。

### 交互设计

| 交互 | 手势 | 效果 |
|------|------|------|
| 抚摸 | 单击宠物 | 心情 +15, 亲密度 +10 |
| 休息 | 长按宠物 2 秒 | 精力 +30 |
| 玩耍 | 双击宠物 | 心情 +20, 精力 -10 |
| 喂食 | 拖拽食物到宠物 | 饱腹度 +N |
| 清洁 | 拖拽毛巾到宠物 | 清洁度 +N |

### InteractivePetWidget 实现

核心是组合使用 `GestureDetector` 和 `DragTarget`：

```dart
class InteractivePetWidget extends StatefulWidget {
  final PetModel pet;
  final VoidCallback? onPet;
  final VoidCallback? onRest;
  final VoidCallback? onPlay;
  final void Function(ItemModel)? onItemDropped;

  // ...
}

class _InteractivePetWidgetState extends State<InteractivePetWidget> {

  @override
  Widget build(BuildContext context) {
    return DragTarget<ItemModel>(
      onAcceptWithDetails: (details) => _handleItemDropped(details.data),
      builder: (context, candidateData, rejectedData) {
        return GestureDetector(
          onTap: _handleTap,           // 抚摸
          onLongPress: _handleLongPress, // 休息
          onDoubleTap: _handleDoubleTap, // 玩耍
          child: _buildPetAvatar(),
        );
      },
    );
  }

  void _handleTap() {
    HapticFeedback.lightImpact();  // 触感反馈
    _playFeedbackAnimation();       // 视觉反馈
    widget.onPet?.call();
  }
}
```

### 背包系统

实现了可拖拽的道具卡片：

```dart
class DraggableItemCard extends StatelessWidget {
  final ItemModel item;

  @override
  Widget build(BuildContext context) {
    return Draggable<ItemModel>(
      data: item,
      onDragStarted: () => HapticFeedback.selectionClick(),
      feedback: _buildCard(isDragging: true),  // 拖拽时的样式
      childWhenDragging: Opacity(opacity: 0.3, child: _buildCard()),
      child: _buildCard(),
    );
  }
}
```

### 动画反馈

添加了缩放和弹跳动画，让交互更有 " 手感 "：

```dart
late AnimationController _animationController;
late Animation<double> _scaleAnimation;
late Animation<double> _bounceAnimation;

void _playFeedbackAnimation() {
  _animationController.forward().then((_) {
    _animationController.reverse();
  });
}

// 在 build 中使用
Transform.translate(
  offset: Offset(0, -_bounceAnimation.value),
  child: Transform.scale(
    scale: _scaleAnimation.value,
    child: petAvatar,
  ),
)
```

---

## 今日成果

### 功能完成

- ✅ 路由守卫（未登录重定向）
- ✅ 底部导航栏（ShellRoute）
- ✅ 个人中心页面 + 设置页面
- ✅ 清洁互动功能
- ✅ 状态衰减机制
- ✅ **沉浸式手势交互**
  - 点击抚摸
  - 长按休息
  - 双击玩耍
  - 拖拽喂食/清洁
- ✅ 背包系统（悬浮按钮 + 弹窗 + 可拖拽道具）

### 新增文件

```java
lib/
├── core/utils/
│   └── status_decay_calculator.dart    # 状态衰减计算
├── providers/
│   └── inventory_provider.dart         # 背包状态管理
├── presentation/
│   ├── pages/
│   │   ├── main/main_shell_page.dart   # 导航容器
│   │   ├── community/community_page.dart
│   │   └── profile/
│   │       ├── profile_page.dart
│   │       └── settings_page.dart
│   └── widgets/
│       ├── pet/
│       │   └── interactive_pet_widget.dart  # 可交互宠物
│       └── inventory/
│           ├── inventory_fab.dart           # 背包按钮
│           ├── inventory_popup.dart         # 道具弹窗
│           └── draggable_item_card.dart     # 可拖拽道具
```

---

## 效果展示

交互流程：

1. 点击右下角背包按钮 → 弹出道具面板
2. 拖拽 " 小鱼干 " 到宠物身上
3. 宠物区域高亮 + 提示 " 松开使用 "
4. 松手 → 宠物播放进食动画 + 显示 " 饱腹度 +20"
5. 道具数量 -1

手势交互让整个体验更像是在 " 撸猫 "，而不是在点按钮！

---

## 遇到的问题

### 1. DragTarget 和 GestureDetector 冲突

一开始把 `GestureDetector` 放在 `DragTarget` 外面，导致拖拽无法触发。

**解决**：`DragTarget` 在外，`GestureDetector` 在内。

### 2. 动态类型问题

Firestore 返回的数据是 `dynamic`，直接用会报类型错误。

**解决**：显式类型转换

```dart
final int coins = (user?.coins as int?) ?? 0;
```

### 3. withOpacity 废弃警告

Flutter 新版本废弃了 `Color.withOpacity()`，建议用 `withValues()`。暂时忽略，不影响功能。

---

## 明日计划

- [ ] 背包数据持久化（Firestore）
- [ ] 道具商店页面
- [ ] 多宠物切换
- [ ] 学习 Rive 动画，替换静态图标

---

## 心得体会

今天的开发体验非常棒！手势交互的实现比想象中简单，Flutter 的 `GestureDetector` 和 `Draggable` 组合起来非常强大。

最满意的是拖拽喂食的交互——从背包拖出食物，悬停在宠物上看到高亮反馈，松手后看到宠物 " 吃东西 " 的动画。这种交互比点按钮有趣多了！

下一步计划学习 Rive 动画，把静态图标替换成真正的动画。想象一下，点击宠物时它会眯起眼睛享受抚摸，长按时会慢慢躺下睡觉… 期待！

---

## 项目进度

| 模块 | 进度 | 说明 |
|------|------|------|
| 认证系统 | 100% | 邮箱 + Google 登录 |
| 宠物创建 | 100% | 预设形象 |
| 核心养成 | 90% | 待：状态持久化 |
| 背包系统 | 70% | 待：Firestore 存储 |
| 商店系统 | 0% | 待开发 |
| AI 生成 | 0% | 待开发 |
| 社区功能 | 0% | 待开发 |

---

> 项目地址：[Cat Club](https://github.com/xxx/cat-club)（待开源）
