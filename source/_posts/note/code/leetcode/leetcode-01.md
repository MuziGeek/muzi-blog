---
title: "LeetCode 1 - \"LeetCode 1 - \\\"LeetCode 1 - 两数之和\\\"\""
date: 2026-06-03 23:43:53
categories:
  - ["笔记", "编程", "算法"]
tags:
  - "LeetCode"
  - "算法"
---
## 一、题目描述（LeetCode 1.两数之和）

给定一个整数数组 `nums` 和一个整数目标值 `target`，在数组中找出和为目标值的**两个整数**，并返回它们的数组下标。

约束条件：

- 每种输入只会对应一个答案
    
- 不能使用两次相同的元素
    
- 可按任意顺序返回答案
    

示例：

- 输入：`nums = [2,7,11,15], target = 9`，输出：`[0,1]`
    
- 输入：`nums = [3,2,4], target = 6`，输出：`[1,2]`
    
- 输入：`nums = [3,3], target = 6`，输出：`[0,1]`
    

## 二、两种解题思路 & Java代码

### 1. 暴力枚举法（新手理解，不推荐面试）

#### 思路

双重循环遍历数组，外层遍历每个元素，内层遍历当前元素之后的所有元素，判断两数之和是否等于目标值，匹配成功直接返回下标。

#### 复杂度

时间复杂度：`O(n²)`，空间复杂度：`O(1)`

#### 代码

```java
class Solution {
    public int[] twoSum(int[] nums, int target) {
        int n = nums.length;
        for (int i = 0; i < n; i++) {
            for (int j = i + 1; j < n; j++) {
                if (nums[i] + nums[j] == target) {
                    return new int[]{i, j};
                }
            }
        }
        return new int[]{};
    }
}
```

### 2. HashMap哈希表法（面试最优解）

#### 核心思路

利用哈希表 `O(1)` 极速查询的特性，**空间换时间**。遍历数组时，计算当前元素的补数 `complement = target - nums[i]`：

1. 若补数已存在于哈希表中，直接返回补数下标和当前下标
    
2. 若不存在，将当前元素（key）和下标（value）存入哈希表
    

#### 复杂度

时间复杂度：`O(n)`，空间复杂度：`O(n)`

#### 代码

```java
import java.util.HashMap;
import java.util.Map;

class Solution {
    public int[] twoSum(int[] nums, int target) {
        // key：数组元素值，value：元素对应下标
        Map<Integer, Integer> map = new HashMap<>();
        for (int i = 0; i < nums.length; i++) {
            int complement = target - nums[i];
            // 补数存在，直接返回结果
            if (map.containsKey(complement)) {
                return new int[]{map.get(complement), i};
            }
            // 存入当前元素和下标
            map.put(nums[i], i);
        }
        return new int[]{};
    }
}
```

## 三、两数之和高频变体总结

### 1. 基础高频变体

- **两数之和 II（有序数组）**：数组有序，要求空间O(1)，舍弃哈希表，使用**双指针法**
    
- **两数之和 III（数据结构设计）**：设计类，支持添加数字、查找两数之和，核心为哈希表计数
    

### 2. 进阶算法变体

- **三数之和、四数之和**：排序+双指针，去重遍历求解
    
- **两数之和 IV（BST输入）**：二叉搜索树中序遍历转有序数组，再双指针查找
    
- **双数组两数之和**：一个数组存哈希表，遍历另一个数组匹配补数
    

### 3. 特殊场景变体

- 差值为k的数对、两数乘积为定值、最接近目标值的两数之和
    
- 统计满足条件的数对数量（哈希表统计频率）
    

## 四、HashMap 算法使用核心准则（必背）

### 核心结论

**只要题目需要：快速查找、建立映射、统计次数、空间换时间 → 第一时间想到 HashMap**

数组查找是 `O(n)`，HashMap 查找是 `O(1)`，是算法提速核心神器。

### 四大必用 HashMap 场景

1. **快速判断元素是否存在**：关键词：是否存在、包含、有无；例题：两数之和找补数、数组去重判断
    
2. **建立值-信息映射**：关键词：返回下标、记录位置；存储规则：key=数值，value=下标
    
3. **统计元素频率次数**：关键词：出现次数、高频统计；核心代码：`map.getOrDefault(num, 0) + 1`
    
4. **空间换时间优化循环**：将暴力O(n²)双层循环，优化为O(n)单层遍历
    

### 秒杀口诀

**要查找，用哈希；要映射，用哈希；要计数，用哈希；要提速，用哈希。**

### 避坑：什么时候不用 HashMap？

- 数组有序 + 要求空间O(1) → 优先双指针
    
- 仅需排序、基础遍历求和 → 无需哈希结构
    
- 简单去重、无需记录附加信息 → 优先 HashSet
    

### HashMap & HashSet 区分

- **HashMap**：键值对（key-value），需存储下标、次数等附加信息时使用
    
- **HashSet**：仅存储key，只做去重、存在性判断时使用
    

## 五、两数之和万能解题思维

- 无序数组、需要返回下标、追求高效 → **HashMap 哈希表**
    
- 有序数组、要求常数级空间 → **双指针**
