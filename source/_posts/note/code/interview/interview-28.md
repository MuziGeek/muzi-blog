---
title: "面试训练营 Day 28 - 通过源码深入了解HashMap"
date: 2025-01-20 21:49:33
categories:
  - ["笔记", "编程", "面试训练营"]
tags:
  - "Java"
---
**2025-01-20**🌱上海: ☀️   🌡️+8°C 🌬️←9km/h
说说Java中HashMap的原理?

### 通过源码深入了解HashMap

首先来了解一下比较重要一些变量定义

```java
    // 默认初始容量 - 必须是 2 的幂次方。
    static final int DEFAULT_INITIAL_CAPACITY = 1 << 4; // 即 16

    // 最大容量，如果构造函数中通过参数隐式指定了更高的值，则使用此最大容量。
    // 必须是小于等于 1 << 30 的 2 的幂次方。
    static final int MAXIMUM_CAPACITY = 1 << 30;

    // 构造函数中未指定时使用的负载因子。
    static final float DEFAULT_LOAD_FACTOR = 0.75f;

    // 在向存储单元添加元素时，存储单元使用树结构而不是链表结构的存储单元计数阈值。
    // 当向存储单元添加元素，且该存储单元至少有此数量的节点时，存储单元将转换为树结构。
    // 该值必须大于 2，并且应该至少为 8，以与移除元素时转换回普通存储单元的假设相匹配。
    static final int TREEIFY_THRESHOLD = 8;

    // 在调整大小操作期间将（拆分的）存储单元转换为非树结构存储单元的存储单元计数阈值。
    // 应该小于 TREEIFY_THRESHOLD，并且最多为 6，以与移除元素时的收缩检测相匹配。
    static final int UNTREEIFY_THRESHOLD = 6;

    // 存储单元可以树化的最小表容量。
    // （否则，如果存储单元中有太多节点，表将进行扩容。）
    // 应该至少是 4 * TREEIFY_THRESHOLD，以避免扩容和树化阈值之间的冲突。
    static final int MIN_TREEIFY_CAPACITY = 64;
```

**通过上面的变量定义可以思考以下几个问题**

- `DEFAULT_INITIAL_CAPACITY`初始容量为什么必须是2的n次方？
- `DEFAULT_LOAD_FACTOR`负载因子为什么选择0.75？同时为什么扩容会是两倍？
- `TREEIFY_THRESHOLD`为什么从链表转换为红黑树的阈值默认为8？是怎么从链表转换成红黑树的？

带着问题去学习，接下来我们就根据源码及图解等了解下HashMap的具体实现

### HashMap的结构

```java
 static class Node<K,V> implements Map.Entry<K,V> {
        final int hash;
        final K key;
        V value;
        Node<K,V> next;

        Node(int hash, K key, V value, Node<K,V> next) {
            this.hash = hash;
            this.key = key;
            this.value = value;
            this.next = next;
        }

        public final K getKey()        { return key; }
        public final V getValue()      { return value; }
        public final String toString() { return key + "=" + value; }

        public final int hashCode() {
            return Objects.hashCode(key) ^ Objects.hashCode(value);
        }

        public final V setValue(V newValue) {
            V oldValue = value;
            value = newValue;
            return oldValue;
        }

        public final boolean equals(Object o) {
            if (o == this)
                return true;

            return o instanceof Map.Entry<?, ?> e
                    && Objects.equals(key, e.getKey())
                    && Objects.equals(value, e.getValue());
        }
    }
```

从源码上可以看到，HashMap是由Node组成的一个单向链表，因为Node结构中只有next指向后继节点，那么我们可以用图来展示一个完成初始化的HashMap数组。（在jdk1.8之前，HashMap节点是由Entry组成的，原理结构和Node一致）

![image.png](https://cdn.easymuzi.cn/img/20250121002310242.png)




通过上面结构我们又可以思考几个问题

1. **为什么使用链表+数据？**

**数组的使用：**

使用数组可以进行快速索引，HashMap 内部使用数组来存储元素，数组的每个元素称为一个 桶（bucket）。使用数组的主要优点是可以通过计算元素的哈希值，将其映射到数组的一个索引位置，从而实现快速的查找、插入和删除操作。

同时对于一个给定的键值对 `(key, value)`，通过 `hash(key) % array.length` 可以得到该键值对应该存储在数组的哪个位置。在实际的 Java 实现中，为了提高性能，使用 `hash(key) & (array.length - 1)` 来计算索引，**因为 HashMap 的容量总是 2 的幂次方，这种方式等价于取模运算，而且效率更高。这就回答了上面hashMap的容量为什么总是2的幂次方的问题。（如果还是不理解最后再进行讲解）**在理想情况下，可以讲不同的键值对均匀分布在数据的不同位置，时间复杂度接近O(1).可以看下源码中的实现

```java
        if ((p = tab[i = (n - 1) & hash]) == null)
            tab[i] = newNode(hash, key, value, null);
```

**链表的使用：**

由于哈希函数的特性，不同的键可能会产生相同的哈希值，或者不同的哈希值映射到数组的同一个索引位置，这就是哈希冲突。为了解决哈希冲突，HashMap 在每个数组元素（桶）中使用链表来存储那些映射到相同索引位置的键值对。

当发生哈希冲突时，新插入的元素会添加到该桶对应的链表的末尾。查找时，先找到对应的桶，然后在链表中遍历查找目标元素。

在链表中的查找操作是线性的，时间复杂度是O(n) ，但当冲突较少时，链表的长度较短，性能影响不大。

当产生hash冲突的时候，hashmap的结构如下：

![image.png](https://cdn.easymuzi.cn/img/20250121002318127.png)


接下来根据源码分析下hashMap的PUT/GET方法

### Put方法

先放源码

```java
final V putVal(int hash, K key, V value, boolean onlyIfAbsent, boolean evict) {
    // 存储元素的数组和相关节点的引用，以及数组长度和索引
    Node<K,V>[] tab; Node<K,V> p; int n, i;
    // 如果表为空或长度为 0，则进行扩容操作
    if ((tab = table) == null || (n = tab.length) == 0)
        n = (tab = resize()).length;
    // 根据哈希值计算元素在数组中的索引，如果该位置为空，则直接将元素作为新节点添加
    if ((p = tab[i = (n - 1) & hash]) == null)
        tab[i] = newNode(hash, key, value, null);
    else {
        // 用于存储找到的已存在节点的引用，以及键的引用
        Node<K,V> e; K k;
        // 检查第一个节点是否与要插入的元素键相同
        if (p.hash == hash && ((k = p.key) == key || (key!= null && key.equals(k))))
            e = p;
        // 如果第一个节点是树节点，则调用树节点的插入方法
        else if (p instanceof TreeNode)
            e = ((TreeNode<K,V>)p).putTreeVal(this, tab, hash, key, value);
        else {
            // 遍历链表查找元素或找到插入位置
            for (int binCount = 0; ; ++binCount) {
                if ((e = p.next) == null) {
                    // 将元素添加到链表末尾
                    p.next = newNode(hash, key, value, null);
                    // 检查是否需要将链表转换为树
                    if (binCount >= TREEIFY_THRESHOLD - 1) // -1 for 1st
                        treeifyBin(tab, hash);
                    break;
                }
                // 检查链表中的节点是否与要插入的元素键相同
                if (e.hash == hash && ((k = e.key) == key || (key!= null && key.equals(k))))
                    break;
                p = e;
            }
        }
        // 如果找到已存在的元素映射
        if (e!= null) { 
            // 获取旧值
            V oldValue = e.value;
            // 如果允许替换或旧值为空，则替换为新值
            if (!onlyIfAbsent || oldValue == null)
                e.value = value;
            afterNodeAccess(e);
            // 返回旧值
            return oldValue;
        }
    }
    // 修改次数加 1
    ++modCount;
    // 如果元素数量超过阈值，进行扩容操作
    if (++size > threshold)
        resize();
    afterNodeInsertion(evict);
    // 表示插入新元素，返回 null
    return null;
}
```

大概流程如下

![image.png](https://cdn.easymuzi.cn/img/20250121002324909.png)


**当链表长度大于8的时候转换成红黑树结构如下图所示**

![image.png](https://cdn.easymuzi.cn/img/20250121002330529.png)


**详细的存储流程图**

![image.png](https://cdn.easymuzi.cn/img/20250121002336271.png)


通过上面的流程及源码中可以看到除了在hash冲突后形成链表及链表长度大于8之后转换为红黑树，还有就是当元素个数超过最大数组长度*负载因子时就会进行数据扩容，那具体是如何进行扩容的呢？我们来看下`resize`方法

### Resize方法

resize用于以下两种情况

1. 初始化table
2. 在table超过threshhold之后进行扩容

```java
final Node<K,V>[] resize() {
    // 保存旧的存储元素的数组
    Node<K,V>[] oldTab = table;
    // 获取旧数组的容量，如果旧数组为空则为 0
    int oldCap = (oldTab == null)? 0 : oldTab.length;
    // 获取旧的阈值
    int oldThr = threshold;
    // 新的容量和新的阈值
    int newCap, newThr = 0;
    // 如果旧容量大于 0
    if (oldCap > 0) {
        // 如果旧容量达到最大容量
        if (oldCap >= MAXIMUM_CAPACITY) {
            // 将阈值设为整数最大值，不再扩容
            threshold = Integer.MAX_VALUE;
            return oldTab;
        } 
        // 否则将容量和阈值翻倍，前提是新容量小于最大容量且旧容量大于等于默认初始容量
        else if ((newCap = oldCap << 1) < MAXIMUM_CAPACITY && oldCap >= DEFAULT_INITIAL_CAPACITY)
            newThr = oldThr << 1; // 阈值翻倍
    } 
    // 如果旧阈值大于 0，表示使用旧阈值作为新容量
    else if (oldThr > 0) 
        newCap = oldThr;
    // 否则使用默认的初始容量和根据负载因子计算的阈值
    else {               
        newCap = DEFAULT_INITIAL_CAPACITY;
        newThr = (int)(DEFAULT_LOAD_FACTOR * DEFAULT_INITIAL_CAPACITY);
    }
    // 如果新阈值为 0，根据新容量和负载因子计算
    if (newThr == 0) {
        float ft = (float)newCap * loadFactor;
        newThr = (newCap < MAXIMUM_CAPACITY && ft < (float)MAXIMUM_CAPACITY?
                (int)ft : Integer.MAX_VALUE);
    }
    // 更新阈值
    threshold = newThr;
    // 创建新的数组
    @SuppressWarnings({"rawtypes","unchecked"})
    Node<K,V>[] newTab = (Node<K,V>[])new Node[newCap];
    // 更新表为新数组
    table = newTab;
    // 如果旧数组不为空
    if (oldTab!= null) {
        // 遍历旧数组
        for (int j = 0; j < oldCap; ++j) {
            Node<K,V> e;
            // 获取旧数组中当前位置的元素
            if ((e = oldTab[j])!= null) {
                // 清除旧数组中该位置的元素
                oldTab[j] = null;
                // 如果该位置只有一个元素
                if (e.next == null)
                    // 将该元素重新定位到新数组中
                    newTab[e.hash & (newCap - 1)] = e;
                // 如果是树节点
                else if (e instanceof TreeNode)
                    // 处理树节点的拆分
                    ((TreeNode<K,V>)e).split(this, newTab, j, oldCap);
                else { // 保持顺序
                    // 用于存储低位置元素的链表头和尾
                    Node<K,V> loHead = null, loTail = null;
                    // 用于存储高位置元素的链表头和尾
                    Node<K,V> hiHead = null, hiTail = null;
                    Node<K,V> next;
                    // 遍历链表
                    do {
                        next = e.next;
                        // 根据元素的哈希值和旧容量的位运算结果将元素分类
                        if ((e.hash & oldCap) == 0) {
                            if (loTail == null)
                                loHead = e;
                            else
                                loTail.next = e;
                            loTail = e;
                        } else {
                            if (hiTail == null)
                                hiHead = e;
                            else
                                hiTail.next = e;
                            hiTail = e;
                        }
                    } while ((e = next)!= null);
                    // 将低位置元素存储到新数组原索引位置
                    if (loTail!= null) {
                        loTail.next = null;
                        newTab[j] = loHead;
                    }
                    // 将高位置元素存储到新数组原索引加旧容量的位置
                    if (hiTail!= null) {
                        hiTail.next = null;
                        newTab[j + oldCap] = hiHead;
                    }
                }
            }
        }
    }
    // 返回新数组
    return newTab;
}
```

我们来单独分析下中间链表拆分的代码

**首先**

```java
Node<K,V> loHead = null, loTail = null;
Node<K,V> hiHead = null, hiTail = null;
```

上面的代码定义了4个Node节点的引用，从变量命名大概可以猜到这里定义了两个链表（分别是两个头节点，两个尾节点），分别成为lo链表和hi链表。

**继续往下看**

```java
do {
      next = e.next;
      // 根据元素的哈希值和旧容量的位运算结果将元素分类
      if ((e.hash & oldCap) == 0) {
          if (loTail == null)
              loHead = e;
          else
              loTail.next = e;
          loTail = e;
      } else {
          if (hiTail == null)
              hiHead = e;
          else
              hiTail.next = e;
          hiTail = e;
      }
  } while ((e = next)!= null);
```

从上面的代码可以看出主要逻辑是在按照顺序遍历该存储桶位置上的链表中的节点，然后再分析下里面if-else语句的内容

```java
// 插入lo链表
if (loTail == null)
    loHead = e;
else
    loTail.next = e;
loTail = e;

// 插入hi链表
if (hiTail == null)
    hiHead = e;
else
    hiTail.next = e;
hiTail = e;
```

这样来看就很清晰了，首先准备了两个链表lo和hi，然后根据顺序遍历该存储桶上的链表的每个节点，如果`(e.hash & oldCap) == 0`，就放入lo链表，斗则就放入hi链表

**接着往下看**

```java
 // 将低位置元素存储到新数组原索引位置
    if (loTail!= null) {
        loTail.next = null;
        newTab[j] = loHead;
    }
    // 将高位置元素存储到新数组原索引加旧容量的位置
    if (hiTail!= null) {
        hiTail.next = null;
        newTab[j + oldCap] = hiHead;
    }
```

通过注释可以知道，这段代码就是将原来的链表拆分为两个链表，并将这两个链表分别放到新的table的j位置和j+oldCap上，j位置就是原链表再原Table中的位置，拆分的逻辑就是按照(`e.hash & oldCap) == 0`

具体流程可以参考下图

![image.png](https://cdn.easymuzi.cn/img/20250121002405005.png)


好了，那我们继续了解下Get方法

### Get方法

**先上源码**

```java
final Node<K,V> getNode(Object key) {
    // 存储元素的数组，以及节点引用和相关参数
    Node<K,V>[] tab; Node<K,V> first, e; int n, hash; K k;
    // 检查表不为空且长度大于 0，并根据键的哈希值找到第一个节点
    if ((tab = table)!= null && (n = tab.length) > 0 &&
        (first = tab[(n - 1) & (hash = hash(key))])!= null) {
        // 首先检查第一个节点是否是要查找的节点
        if (first.hash == hash && // 总是先检查第一个节点
            ((k = first.key) == key || (key!= null && key.equals(k))))
            return first;
        // 如果第一个节点有后续节点
        if ((e = first.next)!= null) {
            // 如果第一个节点是树节点，调用树节点的查找方法
            if (first instanceof TreeNode)
                return ((TreeNode<K,V>)first).getTreeNode(hash, key);
            // 遍历链表查找节点
            do {
                if (e.hash == hash &&
                    ((k = e.key) == key || (key!= null && key.equals(k))))
                    return e;
            } while ((e = e.next)!= null);
        }
    }
    // 未找到节点，返回 null
    return null;
}
```

**大概流程如下**

![image.png](https://cdn.easymuzi.cn/img/20250121002414117.png)


## 面试相关

### jdk1.7和jdk1.8hashmap实现的区别

### 1. 数据结构

- **Java 1.7**：

- `HashMap` 采用数组 + 链表的数据结构。数组的每个元素是一个链表的头节点，当发生哈希冲突时，新的元素会被添加到链表的头部。
- 这种方式在链表较长时，查找、插入和删除操作的时间复杂度会退化为 ，其中 `n` 是链表的长度。

- **Java 1.8**：

- 引入了红黑树，数据结构变为数组 + 链表 + 红黑树。当链表长度超过阈值（默认为 8）且数组容量大于等于 64 时，链表会转换为红黑树。
- 红黑树的查找、插入和删除操作的时间复杂度为 ，相比链表在元素较多时性能有显著提升。当元素数量减少到一定程度（默认为 6）时，红黑树会转换回链表。

### 2. 哈希冲突解决方式

- **Java 1.7**：

- 单纯使用链表解决哈希冲突，新元素总是插入到链表头部。在多线程环境下，如果发生扩容，可能会形成环形链表，导致死循环。

- **Java 1.8**：

- 除了链表，在满足条件时使用红黑树解决哈希冲突。并且在链表插入元素时，新元素会插入到链表尾部，避免了 Java 1.7 中在多线程扩容时可能出现的环形链表问题。

### 3. 扩容机制

- **Java 1.7**：

- 扩容时，会重新计算每个元素的哈希值，并将其分配到新的数组位置。这个过程比较耗时，因为需要遍历整个链表并重新计算哈希值。
- 扩容时，将原数组的元素复制到新数组，采用的是头插法，这在多线程环境下可能导致数据丢失或形成环形链表。

- **Java 1.8**：

- 扩容时，利用了元素哈希值和旧数组容量的关系，减少了重新计算哈希值的次数。通过 `(e.hash & oldCap) == 0` 来判断元素在新数组中的位置，要么在原索引位置，要么在原索引位置 + 旧数组容量的位置。
- 采用尾插法复制链表元素，避免了多线程环境下的环形链表问题。

### 4. 计算哈希值的方式

- **Java 1.7**：

- 对键的 `hashCode()` 进行了一系列复杂的扰动计算，以减少哈希冲突。
- 代码示例：

```java
static int hash(int h) {
    h ^= (h >>> 20) ^ (h >>> 12);
    return h ^ (h >>> 7) ^ (h >>> 4);
}
```

- **Java 1.8**：

- 计算方式相对简单，直接取键的 `hashCode()` 高 16 位和低 16 位进行异或运算。
- 代码示例：

```java
static final int hash(Object key) {
    int h;
    return (key == null)? 0 : (h = key.hashCode()) ^ (h >>> 16);
}
```

这样做既减少了计算量，又能在一定程度上降低哈希冲突。

### 5. 遍历方式

- **Java 1.7**：

- 使用 `Iterator` 遍历 `HashMap` 时，在遍历过程中如果对 `HashMap` 进行结构性修改（如添加或删除元素），会抛出 `ConcurrentModificationException`。

- **Java 1.8**：

- 同样在遍历过程中对 `HashMap` 进行结构性修改会抛出 `ConcurrentModificationException`，但在遍历链表或红黑树时的实现细节有所不同，以适应新的数据结构。例如，在遍历红黑树时会使用树节点的特定遍历方式。

### 为什么会出现JDK1.7中会形成环形链表（扩展了解）

其实总结来说就是因为1.7的扩容实现是头插法，头插法在多线程并发时候可能会导致指向循环。

jdk1.7中的扩展逻辑实现方法

```java
void transfer(Entry[] newTable, boolean rehash) {
    int newCapacity = newTable.length;
    for (Entry<K,V> e : table) {
          // 循环数组中元素，依次从原数组copy到newTable
        while(null != e) {
            Entry<K,V> next = e.next;
            if (rehash) {
                e.hash = null == e.key ? 0 : hash(e.key);
            }
            int i = indexFor(e.hash, newCapacity);
               // 注意这句代码很重要，头插法扩容,会将元素e扩容到newTable  
               // 的头位置，已有的newTable[i]会放到e的next。
               e.next = newTable[i];
            newTable[i] = e;
            e = next;
        }
    }
}
```

在多线程环境中，当多个线程同时进行扩容操作时，可能会出现指令重排序和线程切换的情况。

- **线程 A 执行部分扩容操作**：线程 A 开始扩容，它遍历原链表的一部分节点，并将它们按照头插法插入到新数组的链表中。假设线程 A 处理了节点 1、2、3，此时新数组链表顺序为 3 -> 2 -> 1。
- **线程切换到线程 B**：线程 B 开始执行扩容操作，它也遍历原链表，由于线程 A 还未完成扩容，原链表结构可能被部分修改。线程 B 同样使用头插法插入节点，在插入过程中，由于线程切换和指令重排序，可能会导致节点的指针指向出现错误。
- **线程 A 继续执行**：线程 A 继续执行剩余的扩容操作，由于之前线程 B 对链表结构的修改，线程 A 在插入节点时，可能会使链表的最后一个节点指向链表中间的某个节点，从而形成环形链表。

具体图解可以参考官方题解

## java中有哪些集合类？请简单介绍

java集合类主要位于java.util包中，分为两大类`Colletion`及其实现和`Map`接口及其实现。


| **集合类**           | **数据结构**   | **元素是否有序**      | **元素是否可重复** | **线程安全** | **性能特点**                         | **适用场景**                      |
| ----------------- | ---------- | --------------- | ----------- | -------- | -------------------------------- | ----------------------------- |
| ArrayList         | 动态数组       | 按插入顺序           | 是           | 否        | 随机访问快，插入 / 删除慢（中间操作）             | 频繁随机访问元素                      |
| LinkedList        | 双向链表       | 按插入顺序           | 是           | 否        | 插入 / 删除快（首尾操作），随机访问慢             | 频繁插入 / 删除元素                   |
| HashSet           | 哈希表        | 否               | 否           | 否        | 插入 / 删除 / 查询平均 O (1)             | 快速判断元素是否存在，元素去重               |
| TreeSet           | 红黑树        | 按元素顺序（自然 / 自定义） | 否           | 否        | 插入 / 删除 / 查询 O (log n)           | 元素需排序且不重复                     |
| HashMap           | 哈希表        | 无               | 键不重复，值可重复   | 否        | 键值对操作平均 O (1)                    | 根据键快速查找值                      |
| TreeMap           | 红黑树        | 按键顺序（自然 / 自定义）  | 键不重复，值可重复   | 否        | 键值对操作 O (log n)                  | 按键排序存储键值对                     |
| ConcurrentHashMap | 哈希表        | 无               | 键不重复，值可重复   | 是        | 多线程并发读 / 部分并发写性能好                | 多线程环境下的高效并发访问                 |
| LinkedHashMap     | 哈希表 + 双向链表 | 按插入顺序或访问顺序      | 键不重复，值可重复   | 否        | 在保持插入 / 访问顺序的同时，具有 HashMap 的性能优势 | 需要维护元素插入顺序或访问顺序的场景，如 LRU 缓存实现 |
| LinkedHashSet     | 哈希表 + 双向链表 | 按插入顺序           | 否           | 否        | 在保持插入顺序的同时，具有 HashSet 的性能优势      | 需要维护元素插入顺序的不重复元素集合            |

关于集合简单使用就不具体介绍了，这里讲几个集合类的特殊场景使用

### 扩展实现

之前我们学习Redis的时候了解了Redis的缓存淘汰策略，我们也可以通过集合类linkedHashMap实现LRU淘汰算法和使用HashMap和TreeSet实现LFU算法（包括我之前自己实现的多级缓存框架也有使用到）

### LRU（最少使用淘汰算法）

```java
package com.muzi.abstractinterfaceclass.CacheStrategy;

import java.util.LinkedHashMap;
import java.util.Map;

public class LRUCache<K, V> extends LinkedHashMap<K, V> {
    private final int capacity;

    public LRUCache(int capacity) {
        // 第三个参数 accessOrder 设为 true，表示按访问顺序排序
        super(capacity, 0.75f, true);
        this.capacity = capacity;
    }

    @Override
    protected boolean removeEldestEntry(Map.Entry<K, V> eldest) {
        // 当元素数量超过容量时，移除最旧的元素
        return size() > capacity;
    }

}
```

**测试方法**

```java
@Test
void testLRU() {
    LRUCache<String, Integer> cache = new LRUCache<>(3);
    cache.put("A", 1);
    cache.put("B", 2);
    cache.put("C", 3);
    System.out.println(cache); // {A=1, B=2, C=3}
    cache.get("A");
    cache.put("D", 4);
    System.out.println(cache); // {B=2, C=3, A=1, D=4}，B 是最旧的，被移除
}
```

**测试结果**

![image.png](https://cdn.easymuzi.cn/img/20250121002443742.png)


### LFU算法（使用频率最低淘汰算法）

构建一个Node类

```java
package com.muzi.abstractinterfaceclass.CacheStrategy;

// 定义 LFUCacheNode 类，用于存储键、值、使用频率和时间戳
public class LFUCacheNode<K, V> {
    K key;
     V value;
    public int frequency;
    public int timestamp;

    // 构造函数，初始化节点的键、值、使用频率和时间戳
    LFUCacheNode(K key, V value, int frequency, int timestamp) {
        this.key = key;
        this.value = value;
        this.frequency = frequency;
        this.timestamp = timestamp;
    }
}
```

构造LFU算法实现类

```java
package com.muzi.abstractinterfaceclass.CacheStrategy;


import java.util.HashMap;
import java.util.Map;
import java.util.TreeSet;



// 定义 LFUCache 类
public class LFUCache<K, V> {
    // 缓存的容量
    private final int capacity;
    // 时间戳，用于记录操作的先后顺序
    private int timestamp = 0;
    // 使用 HashMap 存储键和对应的 LFUCacheNode
    private final Map<K, LFUCacheNode<K, V>> cache = new HashMap<>();
    // 使用 TreeSet 存储 LFUCacheNode，根据使用频率和时间戳排序
    private final TreeSet<LFUCacheNode<K, V>> frequencySet = new TreeSet<>((a, b) -> {
        if (a.frequency == b.frequency) {
            return a.timestamp - b.timestamp;
        }
        return a.frequency - b.frequency;
    });

    // 构造函数，设置缓存的容量
    public LFUCache(int capacity) {
        this.capacity = capacity;
    }

    // 获取元素的方法
    public V get(K key) {
        // 如果缓存中不包含该键，返回 null
        if (!cache.containsKey(key)) {
            return null;
        }
        // 获取该键对应的节点
        LFUCacheNode<K, V> node = cache.get(key);
        // 从频率集合中移除该节点
        frequencySet.remove(node);
        // 增加该节点的使用频率
        node.frequency++;
        // 更新时间戳
        node.timestamp = ++timestamp;
        // 将更新后的节点重新添加到频率集合中
        frequencySet.add(node);
        // 返回该节点的值
        return node.value;
    }

    // 插入元素的方法
    public void put(K key, V value) {
        // 如果缓存容量为 0，不做任何操作
        if (capacity == 0) {
            return;
        }
        // 如果缓存中已经包含该键
        if (cache.containsKey(key)) {
            // 获取该键对应的节点
            LFUCacheNode<K, V> node = cache.get(key);
            // 从频率集合中移除该节点
            frequencySet.remove(node);
            // 更新节点的值
            node.value = value;
            // 增加该节点的使用频率
            node.frequency++;
            // 更新时间戳
            node.timestamp = ++timestamp;
            // 将更新后的节点重新添加到频率集合中
            frequencySet.add(node);
        } else {
            // 如果缓存已满
            if (cache.size() >= capacity) {
                // 移除使用频率最低且最旧的节点
                LFUCacheNode<K, V> removedNode = frequencySet.pollFirst();
                // 从缓存中移除该节点
                cache.remove(removedNode.key);
            }
            // 创建一个新节点，使用频率为 1，更新时间戳
            LFUCacheNode<K, V> newNode = new LFUCacheNode<>(key, value, 1, ++timestamp);
            // 将新节点添加到缓存中
            cache.put(key, newNode);
            // 将新节点添加到频率集合中
            frequencySet.add(newNode);
        }
    }
}
```

测试方法

```java
 // 测试代码
    @Test
    void testLFU() {
        // 创建一个容量为 3 的 LFU 缓存
        LFUCache<String, Integer> cache = new LFUCache<>(3);
        // 插入元素
        cache.put("A", 1);
        cache.put("B", 2);
        cache.put("C", 3);
        // 获取元素 A，此时 A 的使用频率变为 2
        System.out.println(cache.get("A"));
        // 插入元素 D，由于缓存已满，使用频率最低的 B 被淘汰
        cache.put("D", 4);
        // 获取元素 B，由于 B 已被淘汰，返回 null
        System.out.println(cache.get("B"));
    }
```

测试结果

![image.png](https://cdn.easymuzi.cn/img/20250121002500520.png)


### 集合去重的几种方法

#### 使用HashSet

`HashSet` 是一种不允许重复元素的集合，可以利用它来对其他集合进行去重。因为 `HashSet` 的 `add` 方法会返回一个布尔值，当添加元素时，如果元素已存在则添加失败，利用这个特性可以对集合元素进行去重。

**代码示例**

```java
  @Test
    void TestDuplicationRemoval(){
        List<Integer> listWithDuplicates = new ArrayList<>();
        listWithDuplicates.add(1);
        listWithDuplicates.add(2);
        listWithDuplicates.add(1);
        listWithDuplicates.add(3);
        listWithDuplicates.add(2);

        // 创建一个 HashSet 并添加元素
        Set<Integer> set = new HashSet<>();
        List<Integer> uniqueList = new ArrayList<>();
        for (Integer element : listWithDuplicates) {
            if (set.add(element)) {
                uniqueList.add(element);
            }
        }
        System.out.println(uniqueList);

    }
```

#### 使用Java8的StreamAPI

```java
// 使用 Stream 的 distinct 方法去重
        List<Integer> uniqueList = listWithDuplicates.stream()
                .distinct()
                .collect(Collectors.toList());
```

#### 使用TreeSet去重

```java
 // 使用 TreeSet 去重
        TreeSet<Integer> treeSet = new TreeSet<>(listWithDuplicates);
        List<Integer> uniqueList = new ArrayList<>(treeSet);
        System.out.println(uniqueList); 
```

#### 使用LinkedHashSet

```java
 // 使用 LinkedHashSet 去重
        Set<Integer> linkedHashSet = new LinkedHashSet<>(listWithDuplicates);
        List<Integer> uniqueList = new ArrayList<>(linkedHashSet);
        System.out.println(uniqueList); 
```