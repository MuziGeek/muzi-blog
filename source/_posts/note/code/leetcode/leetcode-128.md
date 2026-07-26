---
title: "LeetCode 128 - 最长连续序列"
date: 2026-06-03 23:43:53
categories:
  - ["笔记", "编程", "算法"]
tags:
  - "LeetCode"
  - "算法"
---

# LeetCode 128

## 一、题目要求

- 给定未排序整数数组，找出数字连续的最长序列长度
- 要求时间复杂度 **O(n)**
- 例：`[100,4,200,1,3,2]` → 最长序列 `[1,2,3,4]` → 输出 4

## 二、最优解法思路

### 核心思想

1. **HashSet 去重 + O (1) 查找**
2. **只从连续序列的起点开始遍历**（保证 O (n)）
3. 起点判断：`num - 1 不在集合中`

### 算法步骤

1. 将数组存入 HashSet 去重
2. 遍历每个数字，判断是否为起点
3. 若是起点，向后查找连续数字，统计长度
4. 更新最大长度并返回

## 三、Java 代码

```java
class Solution {
    public int longestConsecutive(int[] nums) {
        Set<Integer> numSet = new HashSet<>();
        for (int num : nums) numSet.add(num);
        int maxLen = 0;

        for (int num : numSet) {
            // 判断是否为序列起点
            if (!numSet.contains(num - 1)) {
                int curNum = num;
                int curLen = 1;
                // 向后找连续数
                while (numSet.contains(curNum + 1)) {
                    curNum++;
                    curLen++;
                }
                maxLen = Math.max(maxLen, curLen);
            }
        }
        return maxLen;
    }
}
```

## 四、关键问题解答

### 1. 为什么用 HashSet 不用 HashMap？

- **HashSet**：存单个元素，用于**判断存在性**
- **HashMap**：存键值对，用于**存储映射关系**
- 本题只需「存在与否」，无需额外信息 → **HashSet 更简洁、省空间**

### 2. 为什么判断 `num - 1` 而不是 `num + 1`？

- `num - 1` 不存在 → **找到序列起点**
- 一个序列**只有一个起点**，只统计一次 → **O(n)**
- 若用 `num + 1`，每个数都会重复统计 → **O (n²) 超时**

### 3. 单独数字（如 99）为什么也算起点？

- 单个数字本身就是**长度为 1 的连续序列**
- 算法会自动计算长度，不影响最终结果

## 五、Hash 结构使用场景总结

### 👉 使用 HashSet

- 只需**去重**
- 只需**判断元素是否存在**
- 不需要存储额外信息
- 代表题目：最长连续序列、存在重复元素

### 👉 使用 HashMap

- 需要**存储映射关系**（key → value）
- 需要记录**出现次数**
- 需要记录**元素下标**
- 代表题目：两数之和、最长无重复子串、前缀和

### 黄金判断口诀

**只查有没有 → HashSet**

**要存对应关系 → HashMap**

## 六、复杂度分析

- **时间复杂度**：O (n) 每个数字最多访问 2 次
- **空间复杂度**：O (n) HashSet 存储元素
