---
title: Thesis Project Generator 开发日记 #2 - 管理后台与模板管理
date: 2026-04-09 18:30:00
categories:
  - [笔记, 项目, 毕设项目生成平台]
tags:
  - Java
  - Spring Boot
  - DDD架构
  - Admin
  - Template
  - Next.js
---

# Thesis Project Generator - 开发日记 #2

## 前言

本次开发主要完成了管理后台的多个页面（仪表盘、用户管理、模板管理）以及个人资料页面的实现，同时完成了版本下载 API 的增强。

---

## 一、管理后台仪表盘

### 1.1 页面结构

访问路径：`/admin`

页面组成：
- 统计卡片（4个）：用户总数、项目总数、生成次数、模板数量
- 用户活跃度图表（模拟数据）
- 系统状态指示

### 1.2 前端实现

```typescript
// app/(dashboard)/admin/page.tsx
const statsCards = [
  { title: '用户总数', value: statsData.totalUsers, icon: Users },
  { title: '项目总数', value: statsData.totalProjects, icon: FolderKanban },
  { title: '生成次数', value: statsData.totalGenerations, icon: Sparkles },
  { title: '模板数量', value: statsData.totalTemplates, icon: LayoutTemplate },
];
```

### 1.3 API 对接

```typescript
// 目前使用 Mock 数据
// 后续需要实现 adminApi.getStats()
const { data: statsData } = useAdminStats();
```

---

## 二、用户管理页面

### 2.1 页面结构

访问路径：`/admin/users`

功能：
- 用户列表展示（分页）
- 角色筛选（全部/管理员/普通用户）
- 搜索用户（按昵称）
- 修改用户角色

### 2.2 前端实现

```typescript
// 角色筛选
<Select value={roleFilter} onValueChange={setRoleFilter}>
  <SelectTrigger><SelectValue placeholder="角色" /></SelectTrigger>
  <SelectContent>
    <SelectItem value="all">全部</SelectItem>
    <SelectItem value="ADMIN">管理员</SelectItem>
    <SelectItem value="USER">普通用户</SelectItem>
  </SelectContent>
</Select>

// 角色修改
const handleRoleChange = async (userId: string, newRole: string) => {
  await adminApi.updateUserRole(userId, newRole);
};
```

### 2.3 后端 API（已实现）

| 接口 | 方法 | 路径 |
|------|------|------|
| 获取用户列表 | GET | `/admin/users` |
| 修改用户角色 | PUT | `/admin/users/{id}/role` |
| 获取统计数据 | GET | `/admin/stats` |

---

## 三、模板管理页面

### 3.1 页面结构

访问路径：`/admin/templates`

功能：
- 模板列表展示
- 分类筛选（全部/管理系统/电商/博客/其他）
- 启用/禁用模板
- 使用统计展示

### 3.2 模板 DTO

```typescript
interface AdminTemplateDTO {
  id: string;
  name: string;
  description: string;
  category: string;
  techStack: string;
  usageCount: number;
  isActive: boolean;
  createdAt: string;
}
```

### 3.3 启用/禁用功能

```typescript
const handleToggleActive = async (templateId: string, currentStatus: boolean) => {
  const newStatus = !currentStatus;
  await adminApi.toggleTemplateActive(templateId, newStatus);
  // 乐观更新
  setTemplates(prev =>
    prev.map(t => t.id === templateId ? { ...t, isActive: newStatus } : t)
  );
};
```

---

## 四、个人资料页面

### 4.1 页面结构

访问路径：`/profile`

功能：
- 头像展示
- 昵称编辑
- 安全设置（密码修改入口）
- 账户注销

### 4.2 前端实现

```typescript
// 昵称更新
const handleNicknameUpdate = async () => {
  try {
    await userApi.updateProfile({ nickname: nicknameInput });
    toast({ title: '更新成功' });
  } catch (error) {
    toast({ title: '更新失败', variant: 'destructive' });
  }
};

// 注销账户
const handleDeleteAccount = async () => {
  if (confirm('确定要注销账户吗？此操作不可恢复。')) {
    await userApi.deleteAccount();
    // 跳转到首页
  }
};
```

---

## 五、版本下载 UI 增强

### 5.1 功能点

- 下载进度条
- 格式选择（ZIP / TAR.GZ）
- 下载状态展示

### 5.2 前端实现

```typescript
const handleDownload = async (format: 'zip' | 'tar.gz') => {
  setDownloadProgress(0);

  // 模拟下载进度
  const interval = setInterval(() => {
    setDownloadProgress(prev => Math.min(prev + 10, 90));
  }, 500);

  try {
    const response = await versionApi.downloadVersion(projectId, versionId, format);
    // 处理下载
    setDownloadProgress(100);
  } finally {
    clearInterval(interval);
  }
};
```

---

## 六、论文管理页面

### 6.1 页面结构

访问路径：`/papers`

功能：
- 拖拽上传论文
- 上传进度追踪
- 论文列表展示
- 解析状态查看

### 6.2 前端实现

```typescript
// 拖拽上传
<Dropzone
  onDrop={async (files) => {
    for (const file of files) {
      await uploadWithProgress(file);
    }
  }}
>
  <div className="flex flex-col items-center gap-2">
    <Upload className="h-8 w-8 text-muted-foreground" />
    <span>拖拽论文文件或点击上传</span>
    <span className="text-xs text-muted-foreground">支持 PDF、DOCX</span>
  </div>
</Dropzone>
```

---

## 今日成果

### 功能完成
- ✅ 管理后台仪表盘 (`/admin`)
- ✅ 用户管理页面 (`/admin/users`)
- ✅ 模板管理页面 (`/admin/templates`)
- ✅ 个人资料页面 (`/profile`)
- ✅ 论文管理页面 (`/papers`)
- ✅ 版本下载 UI 增强

### 项目进度更新

| 模块 | 进度 | 说明 |
|------|------|------|
| M1 基础架构 | 100% | ✅ |
| M2 核心功能 | 96% | ✅ |
| M3 AI 功能 | 54% | 论文管理页面完成 |
| M4 模板后台 | 62% | Admin 页面完成 |
| M5 测试优化 | 17% | 单元测试框架 |

**总体进度**: ~60%

---

## 明日计划

- [ ] 完成 Admin 用户管理 API (T4.1.1/T4.1.2)
- [ ] 完成 Admin 模板管理 API (T4.2.1-T4.2.4)
- [ ] AI 多智能体生成功能 (T3.2.4-T3.2.8)

---

> 项目地址：[Thesis Project Generator](https://github.com/muzi-lixi/thesis-project-generator)
