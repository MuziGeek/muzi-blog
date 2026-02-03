---
title: Cat Club 开发日记 #4 - 商店与签到系统
date: 2026-02-03 18:01:51
categories:
  - [笔记, 项目, 宠物俱乐部]
tags:
  - Flutter
  - Riverpod
  - Firebase
  - Firestore
  - 状态管理
---

## 前言

今天是 Cat Club 项目开发的第四天，主要目标是完成**道具商店系统**和**每日签到系统**。这两个功能是养成类游戏的核心经济系统，让用户有动力每天打开应用，同时也为后续的道具消费提供了入口。

---

## 上午：道具商店系统

### 1. 商店页面架构

商店采用 TabBar + TabBarView 的经典分类结构，将道具分为三类：

- **食物**：喂食宠物，恢复饱腹度
- **道具**：特殊效果道具
- **配饰**：装饰性道具（预留）

```dart
class ShopPage extends ConsumerStatefulWidget {
  // ...
}

class _ShopPageState extends ConsumerState<ShopPage>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('道具商店'),
        bottom: TabBar(
          controller: _tabController,
          tabs: const [
            Tab(text: '食物'),
            Tab(text: '道具'),
            Tab(text: '配饰'),
          ],
        ),
      ),
      body: Column(
        children: [
          _buildCurrencyBar(coins, diamonds),  // 货币栏
          Expanded(
            child: TabBarView(
              controller: _tabController,
              children: [
                _buildItemGrid(ItemCategory.food),
                _buildItemGrid(ItemCategory.special),
                _buildItemGrid(ItemCategory.accessory),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
```

### 2. 商品卡片设计

每个商品卡片需要展示：
- 道具图标（根据类别显示不同图标）
- 稀有度标签（普通/稀有/史诗/传说）
- 名称和价格

稀有度通过颜色区分，让用户一眼就能识别道具价值：

```dart
Widget _buildItemCard(ItemModel item) {
  final rarityColor = Color(item.rarityColorValue);

  return Container(
    decoration: BoxDecoration(
      border: Border.all(color: rarityColor.withOpacity(0.3), width: 2),
      boxShadow: [
        BoxShadow(color: rarityColor.withOpacity(0.1), blurRadius: 8),
      ],
    ),
    child: Column(
      children: [
        // 图标区域 + 稀有度标签
        // 名称 + 价格
      ],
    ),
  );
}
```

### 3. 购买流程

购买逻辑需要同时处理两件事：
1. 扣除用户货币（金币或钻石）
2. 将道具添加到背包

在 `UserNotifier` 中新增了 `purchaseItem` 方法：

```dart
Future<void> purchaseItem({
  required String itemId,
  required int price,
  required CurrencyType currency,
}) async {
  final userId = _getUserId();
  if (userId == null) throw Exception('用户未登录');

  // 使用 Firestore 事务确保原子性
  await _firestoreService.purchaseItem(
    userId: userId,
    itemId: itemId,
    price: price,
    currency: currency,
  );
}
```

---

## 下午：每日签到系统

### 1. 签到奖励配置

采用 7 天循环奖励机制，奖励逐日递增，第 7 天是大礼包：

| 天数 | 金币 | 钻石 | 道具 |
|------|------|------|------|
| 第1天 | 50 | - | - |
| 第2天 | 80 | - | - |
| 第3天 | 100 | - | 小鱼干 x2 |
| 第4天 | 120 | - | - |
| 第5天 | 150 | - | 猫零食 x2 |
| 第6天 | 180 | - | - |
| 第7天 | 300 | 10 | 高级鱼干 + 刷子 |

```dart
static const Map<int, CheckInReward> _rewardConfig = {
  1: CheckInReward(coins: 50, description: '第1天'),
  2: CheckInReward(coins: 80, description: '第2天'),
  3: CheckInReward(coins: 100, items: {'food_fish': 2}, description: '第3天'),
  // ...
  7: CheckInReward(
    coins: 300,
    diamonds: 10,
    items: {'food_premium_fish': 1, 'clean_brush': 1},
    description: '第7天 - 周奖励',
  ),
};
```

### 2. 签到服务实现

签到的核心逻辑需要处理：
- 判断今天是否已签到
- 计算连续签到天数（断签则重置为 1）
- 发放对应奖励

使用 Firestore 事务保证数据一致性：

```dart
Future<CheckInResult> checkIn(String userId) async {
  return _firestore.runTransaction<CheckInResult>((transaction) async {
    final doc = await transaction.get(userRef);
    final lastSignInDate = _parseDate(data['lastSignInDate']);
    final currentDays = data['consecutiveDays'] as int? ?? 0;

    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);

    // 检查是否已签到
    if (lastSignInDate != null) {
      final lastDate = DateTime(
        lastSignInDate.year,
        lastSignInDate.month,
        lastSignInDate.day,
      );

      if (lastDate == today) {
        return CheckInResult.failure('今日已签到');
      }

      // 判断是否连续
      final yesterday = today.subtract(const Duration(days: 1));
      final isConsecutive = lastDate == yesterday;
      final newDays = isConsecutive ? currentDays + 1 : 1;

      // 获取奖励并更新
      final reward = getRewardForDay(newDays);
      transaction.update(userRef, {
        'lastSignInDate': Timestamp.fromDate(now),
        'consecutiveDays': newDays,
        'coins': FieldValue.increment(reward.coins),
        // ...
      });
    }
  });
}
```

### 3. 签到对话框 UI

签到对话框需要展示 7 天的奖励预览，让用户看到坚持签到的好处：

```dart
Widget _buildCheckInContent(CheckInState state, List<CheckInReward> weeklyRewards) {
  return Column(
    children: [
      // 标题
      const Text('每日签到'),

      // 连续签到天数
      Container(
        decoration: BoxDecoration(
          gradient: LinearGradient(colors: [Color(0xFFFF6B6B), Color(0xFFFF8E53)]),
        ),
        child: Text('已连续签到 ${state.consecutiveDays} 天'),
      ),

      // 7天奖励展示
      Row(
        children: List.generate(7, (index) {
          return _buildDayCard(
            day: index + 1,
            reward: weeklyRewards[index],
            isCompleted: /* 是否已完成 */,
            isCurrent: /* 是否是今天 */,
          );
        }),
      ),

      // 签到按钮
      ElevatedButton(
        onPressed: state.hasCheckedInToday ? null : _handleCheckIn,
        child: Text(state.hasCheckedInToday ? '今日已签到' : '立即签到'),
      ),
    ],
  );
}
```

---

## 傍晚：宠物放生功能

### 二次确认机制

放生是不可逆操作，需要严格的确认机制。我采用了"输入宠物名称确认"的方式：

```dart
class ReleaseConfirmDialog extends StatefulWidget {
  final PetModel pet;

  @override
  State<ReleaseConfirmDialog> createState() => _ReleaseConfirmDialogState();
}

class _ReleaseConfirmDialogState extends State<ReleaseConfirmDialog> {
  final _nameController = TextEditingController();
  bool _isNameMatch = false;

  void _checkNameMatch() {
    setState(() {
      _isNameMatch = _nameController.text.trim() == widget.pet.name;
    });
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      content: Column(
        children: [
          // 宠物信息展示
          // 警告提示
          Text('此操作不可恢复，宠物数据将永久删除'),

          // 名称输入框
          TextField(
            controller: _nameController,
            decoration: InputDecoration(
              hintText: widget.pet.name,
              suffixIcon: _isNameMatch
                ? Icon(Icons.check_circle, color: Colors.green)
                : null,
            ),
          ),
        ],
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context, false), child: Text('取消')),
        ElevatedButton(
          onPressed: _isNameMatch ? () => Navigator.pop(context, true) : null,
          style: ElevatedButton.styleFrom(backgroundColor: Colors.red),
          child: const Text('确认放生'),
        ),
      ],
    );
  }
}
```

---

## 今日成果

### 功能完成

- ✅ 道具商店系统（完整购买流程）
- ✅ 每日签到系统（7天循环奖励）
- ✅ 宠物放生功能（二次确认机制）
- ✅ 宠物切换栏（多宠物管理）
- ✅ 商店路由集成

### 新增文件

```
lib/
├── presentation/
│   ├── pages/
│   │   ├── shop/
│   │   │   └── shop_page.dart           # 商店页面
│   │   └── home/
│   │       └── check_in_dialog.dart     # 签到对话框
│   └── widgets/
│       └── pet/
│           ├── pet_selector.dart        # 宠物切换栏
│           └── release_confirm_dialog.dart  # 放生确认
├── providers/
│   └── check_in_provider.dart           # 签到状态管理
└── services/
    └── check_in_service.dart            # 签到服务
```

---

## 遇到的问题

### 1. 签到对话框 7 天卡片溢出

**问题**：使用 GridView 展示 7 天奖励时，在小屏幕上会溢出。

**解决方案**：改用 Row + Expanded，让每个卡片自适应宽度：

```dart
Row(
  children: List.generate(7, (index) {
    return Expanded(
      child: Container(
        margin: const EdgeInsets.symmetric(horizontal: 2),
        // 卡片内容
      ),
    );
  }),
)
```

### 2. 连续签到天数计算

**问题**：需要正确区分"今天已签到"和"今天待签到"两种状态下的天数显示。

**解决方案**：

```dart
int currentDay;
if (state.consecutiveDays == 0) {
  currentDay = 1;  // 从未签到，当前是第1天
} else if (state.hasCheckedInToday) {
  currentDay = ((state.consecutiveDays - 1) % 7) + 1;  // 已签到
} else {
  currentDay = (state.consecutiveDays % 7) + 1;  // 待签到
}
```

---

## 明日计划

- [ ] Firebase Storage 启用（需升级 Blaze 计划）
- [ ] 完善照片上传功能
- [ ] Rive 动画集成研究
- [ ] 成就系统设计

---

## 心得体会

今天完成了两个核心经济系统，让我对"如何设计用户激励机制"有了更深的理解。

签到系统看似简单，但细节很多：连续签到的判断逻辑、7天循环的计算、奖励的递增设计... 这些都需要仔细考虑用户体验。比如第7天的大礼包，就是为了让用户有坚持签到一周的动力。

商店系统让我思考了游戏内经济平衡的问题。道具定价需要考虑：获取难度（签到每天能拿多少金币）、使用频率（喂食道具消耗快）、稀有度（史诗道具要有明显优势）等因素。虽然现在只是简单的数值配置，但后续可以根据用户行为数据进行调整。

放生功能的二次确认机制也很有意思。输入宠物名称确认这个设计，既能防止误操作，又能让用户在输入时产生"不舍得"的情感，这种微妙的心理设计在产品中很常见。

---

## 项目进度

| 模块 | 进度 | 说明 |
|------|------|------|
| 认证系统 | 100% | 邮箱 + Google 登录 |
| 宠物养成 | 85% | 核心交互完成，缺动画 |
| 背包系统 | 100% | Firestore 持久化 |
| 商店系统 | 100% | 完整购买流程 |
| 签到系统 | 100% | 7天循环奖励 |
| 照片上传 | 60% | UI 完成，需启用 Storage |
| 社区功能 | 0% | 待开发 |
| AI 生成 | 10% | 接口预留 |

---

> 项目地址：[Cat Club](https://github.com/user/cat-club)（待开源）
