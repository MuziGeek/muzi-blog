---
title: "Cat Club 开发日记 #3 - 商店系统与签到功能"
date: 2026-02-03 18:00:00
categories:
  - ["笔记", "项目", "宠物俱乐部"]
tags:
  - "Flutter"
  - "Firebase"
  - "Riverpod"
  - "AI生成"
---

# Cat-club-3

## 前言

今天是开发的第三天，完成了几个重要的功能模块：**每日签到系统**、**道具商店**、**照片上传服务**，以及**AI 卡通形象生成服务**的完善。这些功能让应用的养成体验更加完整。

---

## 上午：基础服务开发

### 1. StorageService - 照片上传服务

为后续的 AI 生成功能做准备，封装了 Firebase Storage 操作：

```dart
// lib/services/storage_service.dart
class StorageService {
  final FirebaseStorage _storage = FirebaseStorage.instance;
  final ImagePicker _picker = ImagePicker();

  /// 选择并裁剪图片（一站式）
  Future<File?> pickAndCropImage({
    required ImageSourceType source,
    CropAspectRatio? aspectRatio,
  }) async {
    final pickedFile = await pickImage(source: source);
    if (pickedFile == null) return null;
    return cropImage(imageFile: pickedFile, aspectRatio: aspectRatio);
  }

  /// 上传宠物照片
  Future<String?> uploadPetPhoto({
    required String userId,
    required File imageFile,
    UploadProgressCallback? onProgress,
  }) async {
    // 上传到 Firebase Storage 并返回下载 URL
  }
}
```

支持的功能：
- 📷 相机拍照 / 相册选择
- ✂️ 图片裁剪（使用 image_cropper）
- ☁️ 上传到 Firebase Storage
- 📊 上传进度回调

### 2. CheckInService - 签到服务

实现了 7 天循环的签到奖励机制：

```dart
// lib/services/check_in_service.dart
class CheckInService {
  /// 签到奖励配置（7天循环）
  static const Map<int, CheckInReward> _rewardConfig = {
    1: CheckInReward(coins: 50, description: '第1天'),
    2: CheckInReward(coins: 80, description: '第2天'),
    3: CheckInReward(coins: 100, items: {'food_fish': 2}, description: '第3天'),
    4: CheckInReward(coins: 120, description: '第4天'),
    5: CheckInReward(coins: 150, items: {'food_treat': 2}, description: '第5天'),
    6: CheckInReward(coins: 180, description: '第6天'),
    7: CheckInReward(
      coins: 300,
      diamonds: 10,
      items: {'food_premium_fish': 1, 'clean_brush': 1},
      description: '第7天 - 周奖励',
    ),
  };

  /// 执行签到（原子操作）
  Future<CheckInResult> checkIn(String userId) async {
    return _firestore.runTransaction<CheckInResult>((transaction) async {
      // 检查是否已签到
      // 计算连续天数
      // 发放奖励（金币 + 钻石 + 道具）
      // 更新用户数据
    });
  }
}
```

奖励规则：

| 天数 | 金币 | 钻石 | 道具 |
|------|------|------|------|
| 1-2 天 | 50-80 | - | - |
| 3 天 | 100 | - | 小鱼干 x2 |
| 5 天 | 150 | - | 美味肉条 x2 |
| 7 天 | 300 | 10 | 高级鱼罐头 + 美容刷 |

---

## 下午：UI 组件开发

### 3. 签到对话框

设计了带动画效果的签到弹窗：

```dart
// lib/presentation/pages/home/check_in_dialog.dart
class CheckInDialog extends ConsumerStatefulWidget {
  // 7天奖励网格展示
  // 签到按钮（已签到置灰）
  // 签到成功动画 + 奖励展示
}
```

交互流程：
1. 进入主页时自动检测是否已签到
2. 未签到则弹出签到对话框
3. 点击 " 立即签到 " 执行签到
4. 显示奖励动画（金币飞入效果）
5. 道具自动添加到背包

### 4. 道具商店页面

完整的商店系统，支持分类浏览和购买：

```dart
// lib/presentation/pages/shop/shop_page.dart
class ShopPage extends ConsumerStatefulWidget {
  // TabBar: 食物 / 道具 / 配饰
  // 货币显示栏（金币 + 钻石）
  // 商品网格（卡片式展示）
  // 商品详情底部弹窗
  // 购买确认 + 余额检查
}
```

商店功能：
- 🏷️ 三个分类标签页（食物/道具/配饰）
- 💰 顶部实时显示金币和钻石余额
- 🎨 商品卡片展示稀有度颜色
- 📋 点击商品显示详情弹窗（效果说明）
- 🛒 一键购买（自动扣款 + 添加到背包）

### 5. 主页入口集成

在宠物房间页面添加了签到和商店入口：

```dart
// lib/presentation/pages/home/pet_room_page.dart
Widget _buildTopBar() {
  return Row(
    children: [
      // 签到按钮（日历图标）
      GestureDetector(
        onTap: () => showCheckInDialog(context),
        child: Container(
          decoration: BoxDecoration(
            color: hasCheckedInToday ? Colors.grey[200] : Color(0xFFFFE0E0),
          ),
          child: Icon(
            hasCheckedInToday ? Icons.check_circle : Icons.calendar_today,
          ),
        ),
      ),

      // 金币显示（点击进入商店）
      GestureDetector(
        onTap: () => context.push(AppRoutes.shop),
        child: CurrencyDisplay(coins: coins, diamonds: diamonds),
      ),
    ],
  );
}
```

---

## AI 生成服务完善

### 6. Replicate API 集成

完善了 AI 卡通形象生成服务：

```dart
// lib/services/ai_generation_service.dart
class AiGenerationService {
  // SDXL 模型配置
  static const String _sdxlModel = 'stability-ai/sdxl:...';

  /// 从照片生成卡通形象
  Future<List<String>> generateCartoonAvatars({
    required String imageUrl,
    required String style,      // cute / anime / realistic
    required PetFeatures features,
    required String apiKey,
    GenerationProgressCallback? onProgress,
  }) async {
    // 1. 创建 Replicate prediction
    // 2. 轮询等待结果（进度回调）
    // 3. 返回 4 张候选图片 URL
  }

  /// 使用 GPT-4 Vision 提取宠物特征
  Future<PetFeatures> extractFeatures({
    required String imageUrl,
    required String openAiApiKey,
  }) async {
    // 调用 GPT-4V 分析照片
    // 返回：物种、毛色、眼睛颜色、特殊标记等
  }
}
```

支持的风格：

| 风格 | 描述 | Prompt 关键词 |
|------|------|---------------|
| cute | 可爱风 | chibi, kawaii, big sparkly eyes |
| anime | 动漫风 | anime style, studio ghibli inspired |
| realistic | 写实风 | semi-realistic, detailed fur texture |

---

## 遇到的问题

### 1. 类型转换错误

Firestore 返回的数据是 `dynamic`，多处报错：

```java
error - The argument type 'dynamic' can't be assigned to the parameter type 'Map'
error - The argument type 'dynamic' can't be assigned to the parameter type 'int'
```

**解决方案**：显式类型转换

```dart
// 修复前
final inventory = Map<String, int>.from(data['inventory'] ?? {});

// 修复后
final inventory = Map<String, int>.from((data['inventory'] ?? {}) as Map);
```

### 2. StreamProvider 没有 Notifier

商店购买功能调用 `userProvider.notifier` 报错，因为 `userProvider` 是 `StreamProvider`。

**解决方案**：使用正确的 Provider

```dart
// 修复前
await ref.read(userProvider.notifier).purchaseItem(...);

// 修复后
await ref.read(userNotifierProvider.notifier).purchaseItem(...);
```

### 3. Android 模拟器无法连接

`flutter devices` 显示 `emulator-5554 is offline`。

**排查过程**：
1. 检查 `flutter doctor` → Android SDK 路径正确
2. `adb devices` → 设备列表为空
3. 发现模拟器进程未运行

**解决方案**：

```bash
# 重启 ADB 服务
D:/Android/SDK/platform-tools/adb.exe kill-server
D:/Android/SDK/platform-tools/adb.exe start-server

# 手动启动模拟器
D:/Android/SDK/emulator/emulator.exe -avd Medium_Phone_API_36.1

# 确认连接
adb devices  # 显示 emulator-5554 device
```

---

## 今日成果

### 功能完成

- ✅ **StorageService** - 图片选择、裁剪、上传
- ✅ **CheckInService** - 7 天循环签到奖励
- ✅ **CheckInDialog** - 签到弹窗 UI（动画效果）
- ✅ **ShopPage** - 道具商店（分类/购买/详情）
- ✅ **AiGenerationService** - Replicate API 集成
- ✅ **主页入口集成** - 签到图标 + 商店入口

### 新增文件

```java
lib/
├── services/
│   ├── storage_service.dart      # 图片上传服务
│   └── check_in_service.dart     # 签到服务
├── providers/
│   └── check_in_provider.dart    # 签到状态管理
└── presentation/pages/
    ├── home/
    │   └── check_in_dialog.dart  # 签到弹窗
    └── shop/
        └── shop_page.dart        # 道具商店
```

### 修改文件

```java
lib/
├── services/
│   ├── ai_generation_service.dart  # 完善 API 调用
│   └── firestore_service.dart      # 修复类型转换
├── providers/
│   └── user_provider.dart          # 添加购买方法
├── presentation/
│   ├── router/app_router.dart      # 添加商店路由
│   └── pages/
│       ├── home/pet_room_page.dart # 添加签到/商店入口
│       └── profile/profile_page.dart # 修复类型错误
```

---

## 项目进度

| 模块 | 进度 | 说明 |
|------|------|------|
| 认证系统 | 100% | 邮箱 + Google 登录 |
| 导航系统 | 100% | 底部导航 + ShellRoute |
| 互动系统 | 100% | 点击/长按/双击/拖拽 |
| 状态系统 | 100% | 五维属性 + 离线衰减 |
| 多宠物管理 | 100% | PetSelector 切换 |
| 背包系统 | 100% | Firestore 持久化 ✨ |
| **签到系统** | **100%** | **7 天循环奖励** ✨ |
| **道具商店** | **100%** | **分类购买** ✨ |
| 宠物创建 | 67% | 待：照片上传 |
| 用户中心 | 60% | 待：资料编辑 |
| **AI 生成** | **80%** | **API 已集成，待 UI** ✨ |
| 社区功能 | 0% | 占位页面 |

**整体完成度：约 80%**

---

## 明日计划

- [ ] 完成 AI 生成的 UI 流程（上传照片 → 选择风格 → 预览 → 保存）
- [ ] 添加照片上传入口到宠物创建页
- [ ] 实现用户资料编辑功能
- [ ] 添加单元测试（至少 50% 覆盖率）

---

## 心得体会

今天的开发效率很高，一口气完成了签到和商店两个完整的功能模块。签到系统的实现比想象中简单，Firestore 的事务操作保证了数据一致性。

商店页面的 UI 设计花了一些心思，特别是商品卡片的稀有度颜色和详情弹窗的效果展示。Flutter 的 `showModalBottomSheet` 非常适合做这种详情页。

遇到的类型转换问题提醒我：Dart 的强类型特性虽然有时候麻烦，但确实能在编译期发现很多潜在 bug。以后要更注意 Firestore 数据的类型处理。

下一步最期待的是 AI 生成功能的 UI 实现。技术层面已经准备好了（Replicate API + GPT-4 Vision），就差把流程串起来。想象一下用户上传一张真实猫咪照片，几秒后就能看到 4 张不同风格的卡通形象… 这才是这个 App 的核心卖点！

---

> 项目地址：[Cat Club](https://github.com/xxx/cat-club)（待开源）
