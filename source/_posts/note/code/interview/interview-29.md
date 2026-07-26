---
title: "面试训练营 Day 29 - 深入理解线程池原理"
date: 2025-01-21 16:17:28
categories:
  - ["笔记", "编程", "面试训练营"]
tags:
  - "JUC"
---
**2025-01-21**🌱上海: ☀️   🌡️+14°C 🌬️↖8km/h
## 深入理解线程池原理

### 线程池的创建

### 使用Executors工厂类创建
####  固定大小线程池（FixedThreadPool）
```java
// 创建一个固定大小为 5 的线程池
        ExecutorService executorService = Executors.newFixedThreadPool(5);
```
- `Executors.newFixedThreadPool(5)`：创建一个固定大小为 5 的线程池，核心线程数和最大线程数都为 5。
#### 单线程线程池（SingleThreadExecutor）
```java
// 创建一个单线程的线程池
        ExecutorService executorService = Executors.newSingleThreadExecutor();
```
- `Executors.newSingleThreadExecutor()`：创建一个只有一个核心线程的线程池，保证任务按顺序执行。
#### 可缓存线程池（CachedThreadPool）
```java
// 创建一个可缓存的线程池
        ExecutorService executorService = Executors.newCachedThreadPool();
```
- `Executors.newCachedThreadPool()`：创建一个可缓存的线程池，核心线程数为 0，最大线程数为 `Integer.MAX_VALUE`，线程空闲 60 秒后会被回收。
####  定时任务线程池（ScheduledThreadPool）
```java
  // 创建一个定时任务线程池
        ScheduledExecutorService scheduledExecutorService = Executors.newScheduledThreadPool(5);
        // 提交定时任务
        scheduledExecutorService.schedule(() -> {
            System.out.println("Task is running by " + Thread.currentThread().getName());
        }, 1, TimeUnit.SECONDS);
        // 关闭线程池
        scheduledExecutorService.shutdown();
```
- `Executors.newScheduledThreadPool(5)`：创建一个大小为 5 的定时任务线程池。
- `scheduledExecutorService.schedule()`：在延迟 1 秒后执行任务。
###  使用 `ThreadPoolExecutor` 类
构造函数源码
```java
public ThreadPoolExecutor(int corePoolSize,  
                          int maximumPoolSize,  
                          long keepAliveTime,  
                          TimeUnit unit,  
                          BlockingQueue<Runnable> workQueue,  
                          ThreadFactory threadFactory,  
                          RejectedExecutionHandler handler) {  
    if (corePoolSize < 0 ||  
        maximumPoolSize <= 0 ||  
        maximumPoolSize < corePoolSize ||  
        keepAliveTime < 0)  
        throw new IllegalArgumentException();  
    if (workQueue == null || threadFactory == null || handler == null)  
        throw new NullPointerException();  
    this.acc = System.getSecurityManager() == null ?  
            null :  
            AccessController.getContext();  
    this.corePoolSize = corePoolSize;  
    this.maximumPoolSize = maximumPoolSize;  
    this.workQueue = workQueue;  
    this.keepAliveTime = unit.toNanos(keepAliveTime);  
    this.threadFactory = threadFactory;  
    this.handler = handler;  
}
```
示例解释参数
```java
// 核心线程数，线程池会一直维护的线程数量，即使这些线程处于空闲状态，也不会被回收
        int corePoolSize = 2;
        // 最大线程数，线程池允许存在的最大线程数量，包括核心线程和非核心线程
        int maximumPoolSize = 4;
        // 非核心线程的空闲存活时间，即当非核心线程处于空闲状态超过这个时间，该线程会被回收
        long keepAliveTime = 10;
        // 时间单位，用于指定 keepAliveTime 的时间单位，例如 TimeUnit.SECONDS 表示秒
        TimeUnit unit = TimeUnit.SECONDS;
        // 任务等待队列，用于存储等待执行的任务，当核心线程都在执行任务时，新任务会先进入此队列等待
        BlockingQueue<Runnable> workQueue = new java.util.concurrent.LinkedBlockingQueue<>();
        // 线程工厂，用于创建新线程，可自定义线程的属性，如名称、优先级、是否为守护线程等
        ThreadFactory threadFactory = Executors.defaultThreadFactory();
        // 拒绝策略，当任务队列已满且线程池中的线程数达到最大线程数时，用于处理新提交的任务，例如抛出异常、丢弃任务等
        RejectedExecutionHandler handler = new ThreadPoolExecutor.AbortPolicy();

        ThreadPoolExecutor threadPoolExecutor = new ThreadPoolExecutor(
                // 核心线程数
                corePoolSize,
                // 最大线程数
                maximumPoolSize,
                // 非核心线程的空闲存活时间
                keepAliveTime,
                // 时间单位
                unit,
                // 任务等待队列
                workQueue,
                // 线程工厂
                threadFactory,
                // 拒绝策略
                handler);
```
了解不同的线程池创建方式，接下来讲一下为什么不推荐使用Executor工厂来创建线程池。
#### 为什么不推荐使用Executor创建线程池？
**总的来说，主要两个点不灵活无法定制线程池，还有就是默认使用无界队列，容易引发OOM。**

|对比项|Executors|ThreadPoolExecutor|
|---|---|---|
|灵活性|低，参数固定|高，可定制|
|队列类型|多为无界队列|可按需选择|
|资源耗尽风险|高，易耗尽内存或 CPU|可通过配置避免|
|线程工厂定制|难|易|
|拒绝策略定制|固定且不灵活|可按需选择|
|性能优化|难|可根据场景调整|
### 线程池的生命周期
先上源码
```java
// runState is stored in the high-order bits  
private static final int RUNNING    = -1 << COUNT_BITS;  
private static final int SHUTDOWN   =  0 << COUNT_BITS;  
private static final int STOP       =  1 << COUNT_BITS;  
private static final int TIDYING    =  2 << COUNT_BITS;  
private static final int TERMINATED =  3 << COUNT_BITS;
```
 从上面可以看出线程总共有五种状态，在线程池的生命周期中间会尽力RUNNING、SHUTDOWN、STOP、TIDYING、TERMINATED五个状态。
 - **RUNNING** 表示线程池处于运行状态，能够接受新提交的任务且能对已添加的任务进行处理。RUNNING状态是线程池的初始化状态，线程池一旦被创建就处于RUNNING状态。
    
- **SHUTDOWN** 线程处于关闭状态，不接受新任务，但可以处理已添加的任务。RUNNING状态的线程池调用shutdown后会进入SHUTDOWN状态。
    
- **STOP** 线程池处于停止状态，不接收任务，不处理已添加的任务，且会中断正在执行任务的线程。RUNNING状态的线程池调用了shutdownNow后会进入STOP状态。

- **TIDYING** 当所有任务已终止，且任务数量为0时，线程池会进入TIDYING。当线程池处于SHUTDOWN状态时，阻塞队列中的任务被执行完了，且线程池中没有正在执行的任务了，状态会由SHUTDOWN变为TIDYING。当线程处于STOP状态时，线程池中没有正在执行的任务时则会由STOP变为TIDYING。
    
- **TERMINATED** 线程终止状态。处于TIDYING状态的线程执行terminated()后进入TERMINATED状态。
    
![image.png](https://cdn.easymuzi.cn/img/20250121171136920.png)

### 线程池的工作流程
### 线程池源码分析
关于ThreadPoolExecutor源码，我们从头来分析
，首先就是一些常量定义
```java
private final AtomicInteger ctl = new AtomicInteger(ctlOf(RUNNING, 0));  
private static final int COUNT_BITS = Integer.SIZE - 3;  
private static final int COUNT_MASK   = (1 << COUNT_BITS) - 1;  
  
// runState is stored in the high-order bits  
//.....线程状态省略
  
// Packing and unpacking ctl  
private static int runStateOf(int c)     { return c & ~COUNT_MASK; }  
private static int workerCountOf(int c)  { return c & COUNT_MASK; }  
private static int ctlOf(int rs, int wc) { return rs | wc; }
```
线程池中有两个比较重要的参数会决定提交任务时任务的走向，分别是线程池的状态和线程数，但是在ThreadPoolExecutor中使用了一个AtomicInteger类型的整数ctl来表示这两个参数。估计很多人都会疑问，怎么使用一个整数表示两个参数呢，接下来我们就继续分析
首先因为涉及多线程的操作，所以这里为了保证原子性ctl参数使用了AtomicInteger类型，并且使用ctlOf方法计算出了ctl的初始值。那么是怎么计算的呢？
int类型在Java中占用4byte的内存，一个byte占用8bit，所以Java中的int类型占用32bit，对于这个32bit，可以进行高低位的拆分，ctl将32位的int拆分位了高3位和低29位，分别表示线程池的运行状态和线程池中的线程个数。
接下来通过进行位运算来验证一下ctl的工作方式。
```java
// 将-1左移29位得到RUNNING状态的值
private static final int RUNNING = -1 << COUNT_BITS;
```
首先看下RUNNING的值为-1左移29位，，在计算机中负数是以其绝对值的补码来表示的，补码是由反码加1得到的，
```java
1的原码：00000000 00000000 00000000 00000001 
											+ 
1的反码：11111111 11111111 11111111 11111110 
--------------------------------------- 
-1补码： 11111111 11111111 11111111 11111111
然后对-1<<29 得到RUNNING的值为
// 高三位表示线程状态，即高三位为111表示RUNNING 
11100000 00000000 00000000 00000000
```
然后通过上面代码可以知道ctl是由RUNNING|0（线程数）得到的值，所以计算可以得到
```java
RUNNING：  11100000 00000000 00000000 00000000
                                               |
线程数为0:  00000000 00000000 00000000 00000000
          ---------------------------------------
得到ctl：   11100000 00000000 00000000 00000000
```
通过上面计算可以得到ctl的初始值，然后通过下面方法可以将ctl拆解成运行状态和线程数
```java
private static final int COUNT_MASK   = (1 << COUNT_BITS) - 1;  
// runState is stored in the high-order bits  
//.....线程状态省略
// Packing and unpacking ctl  
private static int runStateOf(int c)     { return c & ~COUNT_MASK; }  
private static int workerCountOf(int c)  { return c & COUNT_MASK; }  
```
根据上面得到的`ctl`和`COUNT_MASK`反推运行状态。
先来看`COUNT_MASK`怎么计算得到的
1. 首先，计算 `1 << COUNT_BITS`：
    - `<<` 是左移运算符，将 1 的二进制表示向左移动 `COUNT_BITS` 位。
    - 1 的二进制表示是 `00000000 00000000 00000000 00000000 00000001`。
    - 当向左移动 29 位时，得到 `00100000 00000000 00000000 00000000 00000000`。
2. 然后，计算 `(1 << COUNT_BITS) - 1`：
    - 上一步结果为 `00100000 00000000 00000000 00000000 00000000`。
    - 减 1 操作，即将该二进制数减 1，得到 `00011111 11111111 11111111 11111111 11111111`。
然后再进行反推运行状态
```java
 COUNT_MASK:  00011111 11111111 11111111 11111111
                                                  
 ~COUNT_MASK: 11100000 00000000 00000000 00000000
                                                   &
 ctl:         11100000 00000000 00000000 00000000
             ----------------------------------------
 RUNNING:     11100000 00000000 00000000 00000000            
```
以上内容了解即可，只需要知道通过`runStateOf`和`workerCountOf`可以分别得到线程池的运行状态和线程池中的线程数即可。接下来继续分析源码
#### execute方法分析
先上源码
```java
   public void execute(Runnable command) {
        if (command == null)
            throw new NullPointerException();
        // 获取ctl的值
        int c = ctl.get();
        // 1.线程数小于corePoolSize
        if (workerCountOf(c) < corePoolSize) {
            // 线程池中线程数小于核心线程数，则尝试创建核心线程执行任务
            if (addWorker(command, true))
                return;
            c = ctl.get();
        }
        // 2.到此处说明线程池中线程数大于核心线程数或者创建线程失败
        if (isRunning(c) && workQueue.offer(command)) {
            // 如果线程是运行状态并且可以使用offer将任务加入阻塞队列未满，
            // offer是非阻塞操作。
            int recheck = ctl.get();
            // 重新检查线程池状态，因为上次检测后线程池状态可能发生改变，
            // 如果非运行状态就移除任务并执行拒绝策略
            if (! isRunning(recheck) && remove(command))
                reject(command);
            // 如果是运行状态，并且线程数是0，则创建线程
            else if (workerCountOf(recheck) == 0)
                // 线程数是0，则创建非核心线程，且不指定首次执行任务，这里的第二个参数其实没有实际意义
                addWorker(null, false);
        }
        // 3.阻塞队列已满，创建非核心线程执行任务
        else if (!addWorker(command, false))
            // 如果失败，则执行拒绝策略
            reject(command);
    }

```
逻辑流程如下
1. **核心线程创建**：
    - 首先检查线程池中的线程数是否小于核心线程数。
    - 若小于，调用 `addWorker` 方法创建新的线程并将任务交给该线程执行。
2. **阻塞队列处理**：
    - 若线程池中的线程数大于等于核心线程数，将任务添加到阻塞队列。
    - 再次检查线程池的运行状态，因为状态可能在之前检查后发生了变化。
    - 若线程池已关闭，从阻塞队列移除任务并执行拒绝策略。
    - 若线程池仍在运行，但线程池中的线程数为 0，调用 `addWorker` 方法创建新线程，传入任务参数为 `null`（仅创建线程，不指定任务），随后从阻塞队列取出任务并执行。
3. **非核心线程创建及拒绝策略**：
    - 若将任务添加到阻塞队列失败（阻塞队列已满），尝试创建非核心线程执行任务。
    - 若创建非核心线程失败，执行拒绝策略。
其实源码中也有注释讲解

![image.png](https://cdn.easymuzi.cn/img/20250121194833304.png)
接下来对创建线程的方法addWorker方法进行分析
#### addWorker方法
```java
   // 返回值表示是否成功创建了线程
   private boolean addWorker(Runnable firstTask, boolean core) {
        // 这里做了一个retry标记，相当于goto.
        retry:
        for (int c = ctl.get();;) {
            // Check if queue empty only if necessary.
            if (runStateAtLeast(c, SHUTDOWN)
                && (runStateAtLeast(c, STOP)
                    || firstTask != null
                    || workQueue.isEmpty()))
                return false;

            for (;;) {
                // 根据core来确定创建最大线程数，超过最大值则创建线程失败，
                // 注意这里的最大值可能有三个corePoolSize、maximumPoolSize和线程池线程的最大容量
                if (workerCountOf(c)
                    >= ((core ? corePoolSize : maximumPoolSize) & COUNT_MASK))
                    return false;
                // 通过CAS来将线程数+1，如果成功则跳出循环，执行下边逻辑    
                if (compareAndIncrementWorkerCount(c))
                    break retry;
                c = ctl.get();  // Re-read ctl
                // 线程池的状态发生了改变，退回retry重新执行
                if (runStateAtLeast(c, SHUTDOWN))
                    continue retry;
            }
        }
        
        // ...省略后半部分
       
        return workerStarted;
    }

```
逻辑流程如下
1. **线程数的限制**：
    - 根据创建的是核心线程还是非核心线程来确定线程数的上限，核心线程不能超过 `corePoolSize`，非核心线程不能超过 `maximumPoolSize`。
    - 无论创建何种线程，线程数都不能超过线程池允许的最大线程数 `COUNT_MASK`（考虑到 `maximumPoolSize` 可能大于 `COUNT_MASK` 的情况）。
    - 若线程数大于最大值，创建线程失败，返回 `false`。
2. **CAS 操作更新线程数**：
    - 尝试使用 CAS 操作将线程数加 1。
    - 若 CAS 操作成功，使用 `break retry` 终止名为 `retry` 的无限循环。
    - 若 CAS 操作失败，使用 `continue retry` 重新开始 `retry` 标识的 `for` 循环（`retry` 为自定义的循环标识，非 Java 关键字）。
接下来继续分析后半部分源码，这部分主要开始执行创建线程并执行任务的工作了
```java
   private boolean addWorker(Runnable firstTask, boolean core) {
        
        // ...省略前半部分

        boolean workerStarted = false;
        boolean workerAdded = false;
        Worker w = null;
        try {
            // 实例化一个Worker,内部封装了线程
            w = new Worker(firstTask);
            // 取出新建的线程
            final Thread t = w.thread;
            if (t != null) {
                // 这里使用ReentrantLock加锁保证线程安全
                final ReentrantLock mainLock = this.mainLock;
                mainLock.lock();
                try {
                    int c = ctl.get();
                    // 拿到锁后重新检查线程池状态，只有处于RUNNING状态或者
                    // 处于SHUTDOWN并且firstTask==null时候才会创建线程
                    if (isRunning(c) ||
                        (runStateLessThan(c, STOP) && firstTask == null)) {
                        // 线程不是处于NEW状态，说明线程已经启动，抛出异常
                        if (t.getState() != Thread.State.NEW)
                            throw new IllegalThreadStateException();
                        // 将线程加入线程队列，这里的worker是一个HashSet   
                        workers.add(w);
                        workerAdded = true;
                        int s = workers.size();
                        if (s > largestPoolSize)
                            largestPoolSize = s;
                    }
                } finally {
                    mainLock.unlock();
                }
                if (workerAdded) {
                    // 开启线程执行任务
                    t.start();
                    workerStarted = true;
                }
            }
        } finally {
            if (! workerStarted)
                addWorkerFailed(w);
        }
        return workerStarted;
    }
```
这部分逻辑主要是创建 `Worker` 来执行任务。`Worker` 是对线程的封装，创建后的 `Worker` 会被添加到 `ThreadPoolExecutor` 的 `workers` 这个 `HashSet` 中，线程池通过此 `HashSet` 管理其中的线程。这些线程在 `HashSet` 里，可能处于工作或空闲状态，当线程空闲时间达到指定时长，会按条件回收。
线程池如何保证Worker执行完任务后仍然不结束？线程最后又是怎么回收的呢？继续分析worker部分代码
#### Worker分析
```java
 private final class Worker
        extends AbstractQueuedSynchronizer
        implements Runnable
    {
        // 执行任务的线程
        final Thread thread;
        // 初始化Worker时传进来的任务，可能为null，如果不空，
        // 则创建和立即执行这个task，对应核心线程创建的情况
        Runnable firstTask;

        Worker(Runnable firstTask) {
            // 初始化时设置setate为-1
            setState(-1); // inhibit interrupts until runWorker
            this.firstTask = firstTask;
            // 通过线程工程创建线程
            this.thread = getThreadFactory().newThread(this);
        }
        
        // 线程的真正执行逻辑
        public void run() {
            runWorker(this);
        }
        
        // 判断线程是否是独占状态，如果不是意味着线程处于空闲状态
        protected boolean isHeldExclusively() {
            return getState() != 0;
        }

        // 获取锁
        protected boolean tryAcquire(int unused) {
            if (compareAndSetState(0, 1)) {
                setExclusiveOwnerThread(Thread.currentThread());
                return true;
            }
            return false;
        }
        // 释放锁
        protected boolean tryRelease(int unused) {
            setExclusiveOwnerThread(null);
            setState(0);
            return true;
        }
        // ...
    }

```
`Worker` 作为 `ThreadPoolExecutor` 的内部类，借助 `AQS` 实现独占锁功能，通过独占锁的独占和非独占状态，利用 `isHeldExclusively` 方法对线程执行状态进行区分，以此来判断线程是正在执行任务还是处于空闲状态，该设计为线程池中的线程状态管理提供了一种简洁有效的实现方式，将 `AQS` 的锁机制巧妙地应用于线程执行状态的标识，避免了复杂的状态管理逻辑。
同时`Worker`还实现了`Runnable`接口，所以它的执行逻辑就是在run方法中，run方法调用的是线程池中`runWorker(this)`方法，代码如下
#### runWorker方法分析
```java
    final void runWorker(Worker w) {
        Thread wt = Thread.currentThread();
        // 取出Worker中的任务，可能为空
        Runnable task = w.firstTask;
        w.firstTask = null;
        w.unlock(); // allow interrupts
        boolean completedAbruptly = true;
        try {
            // task不为null或者阻塞队列中有任务，通过循环不断的从阻塞队列中取出任务执行
            while (task != null || (task = getTask()) != null) {
                w.lock();
                // ...
                try {
                    // 任务执行前的hook点
                    beforeExecute(wt, task);
                    try {
                        // 执行任务
                        task.run();
                        // 任务执行后的hook点
                        afterExecute(task, null);
                    } catch (Throwable ex) {
                        afterExecute(task, ex);
                        throw ex;
                    }
                } finally {
                    task = null;
                    w.completedTasks++;
                    w.unlock();
                }
            }
            completedAbruptly = false;
        } finally {
            // 超时没有取到任务，则回收空闲超时的线程
            processWorkerExit(w, completedAbruptly);
        }
    }

```
`runWorker` 的核心逻辑是利用 “生产者 - 消费者” 模式，通过不断调用 `getTask` 方法从阻塞队列获取任务并执行，以此实现线程复用，减少线程创建开销。`getTask` 从阻塞队列取任务，若队列为空则阻塞。该方法根据是否回收线程设置等待超时时间，若阻塞队列长时间无任务，等待 `keepAliveTime` 后返回 `null` 。此时，线程空闲时间超 `keepAliveTime` ，会执行 `finally` 代码块，调用 `processWorkerExit` 方法移除 `Worker` 。
接下来分析下getTask方法

#### getTask方法分析
```java
    private Runnable getTask() {
        boolean timedOut = false; // Did the last poll() time out?

        for (;;) {
            int c = ctl.get();
            // ...
           

            // Flag1. 如果配置了allowCoreThreadTimeOut==true或者线程池中的
            // 线程数大于核心线程数，则timed为true，表示开启指定线程超时后被回收
            boolean timed = allowCoreThreadTimeOut || wc > corePoolSize;
            
            // ...

            try {
                // Flag2. 取出阻塞队列中的任务,注意如果timed为true，则会调用阻塞队列的poll方法，
                // 并设置超时时间为keepAliveTime，如果超时没有取到任务则会返回null。
                Runnable r = timed ?
                    workQueue.poll(keepAliveTime, TimeUnit.NANOSECONDS) :
                    workQueue.take();
                if (r != null)
                    return r;
                timedOut = true;
            } catch (InterruptedException retry) {
                timedOut = false;
            }
        }
    }

```
逻辑分析如下
1. **判断回收条件（Flag1）**：
    - 在代码的 `Flag1` 处，会判断线程池中的线程数是否大于核心线程数，或者是否开启了 `allowCoreThreadTimeOut`。
    - 若满足上述条件之一，表明需要开启线程空闲超时回收。
2. **调用阻塞队列的 poll 方法（Flag2）**：
    - 在 `Flag2` 处，当 `timed` 为 `true` 时，调用阻塞队列的 `poll` 方法，并传入超时时间 `keepAliveTime`。
    - `poll` 方法是阻塞方法，在没有任务时会阻塞线程。
    - 若在 `keepAliveTime` 内未获取到任务，`poll` 方法会返回 `null`，结束`runWorker`的循环。进而执行`runWorker`方法中回收线程的操作。
其实，阻塞队列就是使用`ReentrantLock`实现的“生产者-消费者”模式。
![image.png](https://cdn.easymuzi.cn/img/20250121202048078.png)
具体就不再进行分析了，接下来了解下线程池的拒绝策略
### ThreadPoolExecutor的拒绝策略
线程池的拒绝策略是在reject方法中实现的，实现代码如下：
```java
    final void reject(Runnable command) {
        handler.rejectedExecution(command, this);
    }
```
其实这里也用到了策略模式，`handler`是一个`RejectedExecutionHandler`类型的成员变量，`RejectedExecutionHandler`是一个接口，只有一个`rejectedExecution`方法。在实例化线程池时构造方法中传入对应的拒绝策略实例即可。前文已经提到了Java提供的几种默认实现分别为`DiscardPolicy`、`DiscardOldestPolicy`、`CallerRunsPolicy`以及`AbortPolicy`。
处理策略分别如下：
- `AbortPolicy` 通过抛出异常来表示任务被拒绝，适合需要明确知晓任务拒绝的开发和测试场景。
- `CallerRunsPolicy` 将任务回退给调用者线程执行，避免任务丢失，适用于对任务丢失敏感的系统。
- `DiscardPolicy` 直接丢弃任务，不做任何处理，适用于可接受部分任务丢失的情况。
- `DiscardOldestPolicy` 会丢弃最旧任务并添加新任务，适用于更倾向于处理最新任务的系统。
### ThreadPoolExecutor的shutdown
调用`shutdown`方法后，会将线程池标记为`SHUTDOWN`状态，上边`execute`的源码可以看出，只有线程池是`RUNNING`状态才接受任务，因此被标记位`SHUTDOWN`后，再提交任务会被线程池拒绝。`shutdown`的代码如下:
```java
    public void shutdown() {
        final ReentrantLock mainLock = this.mainLock;
        mainLock.lock();
        try {
            //检查是否可以关闭线程
            checkShutdownAccess();
            // 将线程池状态置为SHUTDOWN状态
            advanceRunState(SHUTDOWN);
            // 尝试中断空闲线程
            interruptIdleWorkers();
            // 空方法，线程池关闭的hook点
            onShutdown(); 
        } finally {
            mainLock.unlock();
        }
        tryTerminate();
    }
    
    private void interruptIdleWorkers() {
        interruptIdleWorkers(false);
    }    
```
修改线程池为`SHUTDOWN`状态后，会调用`interruptIdleWorkers`去中断空闲线程线程，具体实现逻辑是在`interruptIdleWorkers(boolean onlyOne)`方法中，如下：
```java
    private void interruptIdleWorkers(boolean onlyOne) {
        final ReentrantLock mainLock = this.mainLock;
        mainLock.lock();
        try {
            for (Worker w : workers) {
                Thread t = w.thread;
                // 尝试tryLock获取锁，如果拿锁成功说明线程是空闲状态
                if (!t.isInterrupted() && w.tryLock()) {
                    try {
                        // 中断线程
                        t.interrupt();
                    } catch (SecurityException ignore) {
                    } finally {
                        w.unlock();
                    }
                }
                if (onlyOne)
                    break;
            }
        } finally {
            mainLock.unlock();
        }
    }
```

## 你使用过哪些Java并发工具类
关于JUC并发，分别有并发工具类、并发容器、并发队列、调度框架。
1. **并发工具类**：比`synchronized`更高级，像`CountDownLatch`、`CyclicBarrier`、`Semaphore`，支持更丰富多线程操作。
2. **并发容器**：提供线程安全容器，如`ConcurrentHashMap`、`ConcurrentSkipListMap`（有序）、`CopyOnWriteArrayList`（线程安全动态数组）。
3. **并发队列**：以`BlockingQueue`实现为主，如`ArrayBlockingQueue`、`SynchorousQueue`，还有特定场景用的`PriorityBlockingQueue`。
4. **Executor 框架**：可创建多种线程池并调度任务运行，多数场景无需自行实现线程池与任务调度器。
接下来着重讲一下几个并发工具类。
### CountDownLatch
`CountDownLatch`的应用场景一般可以分为两种：
1. 某个线程需要在其他n个线程执行完毕后再继续执行
2. 多个工作线程等待某个线程的命令然后再同时执行同一个任务
#### 场景一
```java
package com.muzi.juctest;  
  
import java.util.concurrent.CountDownLatch;  
  
public class CountDownLatchTest {  
  
    public static void main(String[] args) throws InterruptedException {  
        // 采用 10 个工作线程去执行任务  
        final int threadCount = 10;  
        CountDownLatch countDownLatch = new CountDownLatch(threadCount);  
        for (int i = 0; i < threadCount; i++) {  
            new Thread(() -> {  
                // 执行具体任务  
                System.out.println("thread name:" +  Thread.currentThread().getName() + "，执行完毕！");  
                // 计数器减 1                countDownLatch.countDown();  
            }).start();  
        }  
  
        // 阻塞等待 10 个工作线程执行完毕  
        countDownLatch.await();  
        System.out.println("所有任务线程已执行完毕，准备进行结果汇总");  
    }  
}
```
![image.png](https://cdn.easymuzi.cn/img/20250121212417488.png)

#### 场景二
```java
package com.muzi.juctest;  
  
import java.util.concurrent.CountDownLatch;  
  
public class CountDownLatchTest2 {  
        public static void main(String[] args) throws InterruptedException {  
            // 使用一个计数器  
            CountDownLatch countDownLatch = new CountDownLatch(1);  
            final int threadCount = 10;  
            // 采用 10 个工作线程去执行任务  
            for (int i = 0; i < threadCount; i++) {  
                new Thread(() -> {  
                    try {  
                        // 阻塞等待计数器为 0                        countDownLatch.await();  
                    } catch (InterruptedException e) {  
                        e.printStackTrace();  
                    }  
                    // 发起某个服务请求，省略  
                    System.out.println("thread name:" +  Thread.currentThread().getName() + "，开始执行！");  
  
                }).start();  
            }  
  
            Thread.sleep(1000);  
            System.out.println("thread name:" +  Thread.currentThread().getName() + " 准备开始！");  
            // 将计数器减 1，运行完成后为 0            countDownLatch.countDown();  
        }  
}
```
**测试结果**
![image.png](https://cdn.easymuzi.cn/img/20250121212736809.png)



`CountDownLatch`类的主要方法，有以下几个：
- `public CountDownLatch(int count)`：核心构造方法，初始化的时候需要指定线程数
- `countDown()`：每调用一次，计数器值 -1，直到 count 被减为 0，表示所有线程全部执行完毕
- `await()`：等待计数器变为 0，即等待所有异步线程执行完毕，否则一直阻塞
- `await(long timeout, TimeUnit unit)`：支持指定时间内的等待，避免永久阻塞，`await()`的一个重载方法

### CyclicBarrier
主要应用场景就是一组线程到达一个屏障时被阻塞，知道满足要求的线程数都到达屏障时，然后屏障解除，后续被阻塞的线程就可以继续执行
```java
package com.muzi.juctest;  
  
import java.util.concurrent.CyclicBarrier;  
  
public class CyclicBarrierTest {  
  
    public static void main(String[] args) {  
        // 设定参与线程的个数为 5        int threadCount = 5;  
        CyclicBarrier cyclicBarrier = new CyclicBarrier(threadCount, new Runnable() {  
            @Override  
            public void run() {  
                System.out.println("所有的线程都已经准备就绪...");  
            }  
        });  
        for (int i = 0; i < threadCount; i++) {  
            new Thread(() -> {  
                System.out.println("thread name:" +  Thread.currentThread().getName() + "，已达到屏障！");  
                try {  
                    cyclicBarrier.await();  
                } catch (Exception e) {  
                    e.printStackTrace();  
                }  
                System.out.println("thread name:" +  Thread.currentThread().getName() + "，阻塞解除，继续执行！");  
            }).start();  
        }  
    }  
}
```
**测试结果**
![image.png](https://cdn.easymuzi.cn/img/20250121213223508.png)

`CyclicBarrier`类的主要方法，有以下几个：
- `public CyclicBarrier(int parties)`：构造方法，`parties`参数表示参与线程的个数
- `public CyclicBarrier(int parties, Runnable barrierAction)`：核心构造方法，`barrierAction`参数表示线程到达屏障时的回调方法
- `public void await()`：核心方法，每个线程调用`await()`方法告诉`CyclicBarrier`我已经到达了屏障，然后当前线程被阻塞，直到屏障解除，继续执行剩下的逻辑

### Semaphore
一般被称为信号量，可以用作令牌桶限流算法，可以保证同一时刻最多有N个线程访问资源。
```java
package com.muzi.juctest;  
  
import java.text.SimpleDateFormat;  
import java.util.Date;  
import java.util.concurrent.Semaphore;  
  
public class SemaphoreTest {  
  
    public static void main(String[] args) {  
        SimpleDateFormat format = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss");  
  
        // 同一时刻仅允许最多3个线程获取许可  
        final Semaphore semaphore = new Semaphore(3);  
        // 初始化 5 个线程生成  
        for (int i = 0; i < 5; i++) {  
            new Thread(() -> {  
                try {  
                    // 如果超过了许可数量,其他线程将在此等待  
                    semaphore.acquire();  
                    System.out.println(format.format(new Date()) +  " thread name:" +  Thread.currentThread().getName() + " 获取许可，开始执行任务");  
                    // 假设执行某项任务的耗时  
                    Thread.sleep(2000);  
                } catch (Exception e) {  
                    e.printStackTrace();  
                } finally {  
                    // 使用完后释放许可  
                    semaphore.release();  
                }  
            }).start();  
        }  
    }  
}
```
![image.png](https://cdn.easymuzi.cn/img/20250121213904095.png)


`Semaphore`类的主要方法，有以下几个：
- `public Semaphore(int permits)`：构造方法，`permits`参数表示同一时间能访问某个资源的线程数量
- `acquire()`：获取一个许可，在获取到许可之前或者被其他线程调用中断之前，线程将一直处于阻塞状态
- `tryAcquire(long timeout, TimeUnit unit)`：表示在指定时间内尝试获取一个许可，如果获取成功，返回`true`；反之`false`
- `release()`：释放一个许可，同时唤醒一个获取许可不成功的阻塞线程。

### Exchanger
主要用途是在两个线程之间进行数据交换（只能两个线程之间），无论调用时间先后，会互相等待线程到达。
```java
package com.muzi.juctest;  
  
import java.util.concurrent.Exchanger;  
  
public class ExchangerTest {  
  
    public static void main(String[] args) {  
        // 交换同步器  
        Exchanger<String> exchanger = new Exchanger<>();  
  
        // 线程1  
        new Thread(() -> {  
            try {  
                String value = "A";  
                System.out.println("thread name:" +  Thread.currentThread().getName() + " 原数据：" + value);  
                String newValue = exchanger.exchange(value);  
                System.out.println("thread name:" +  Thread.currentThread().getName() + " 交换后的数据：" + newValue);  
            } catch (InterruptedException e) {  
                e.printStackTrace();  
            }  
        }).start();  
  
        // 线程2  
        new Thread(() -> {  
            try {  
                String value = "B";  
                System.out.println("thread name:" +  Thread.currentThread().getName() + " 原数据：" + value);  
                String newValue = exchanger.exchange(value);  
                System.out.println("thread name:" +  Thread.currentThread().getName() + " 交换后的数据：" + newValue);  
            } catch (InterruptedException e) {  
                e.printStackTrace();  
            }  
        }).start();  
    }  
}
```
**测试结果**
![image.png](https://cdn.easymuzi.cn/img/20250121215546232.png)


`Exchanger`类的主要方法，有以下几个：
- `exchange(V x)`：等待另一个线程到达此交换点，然后将给定的对象传送给该线程，并接收该线程的对象，除非当前线程被中断，否则一直阻塞等待
- `exchange(V x, long timeout, TimeUnit unit)`：表示在指定的时间内等待另一个线程到达此交换点，如果超时会自动退出并抛超时异常

### 区别分析总结
| 工具类            | 用途                          | 核心特性                                                                               | 使用场景                                                      |
| -------------- | --------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------- |
| CountDownLatch | 使一个或多个线程等待其他线程完成一组操作后再继续执行  | 1. 构造时设置计数初始值  <br>2. 线程调用 `await()` 等待计数归零  <br>3. 其他线程完成任务后调用 `countDown()` 减少计数 | 1. 主线程等待子线程完成数据加载后再处理结果  <br>2. 多线程并发执行任务，等待所有任务完成后汇总结果   |
| CyclicBarrier  | 让一组线程相互等待，到达某个公共屏障点后再一起继续执行 | 1. 构造时设置参与线程数  <br>2. 线程调用 `await()` 等待其他线程到达屏障点  <br>3. 所有线程到达后，屏障打开，线程继续执行，可重用   | 1. 多线程计算不同部分，完成后一起汇总结果  <br>2. 多线程模拟并发场景，同时出发执行下一步操作      |
| Semaphore      | 控制同时访问特定资源的线程数量             | 1. 构造时设置许可数量  <br>2. 线程获取许可调用 `acquire()`，使用完释放许可调用 `release()`                    | 1. 数据库连接池，限制同时连接数  <br>2. 限制访问特定资源的并发线程数，避免资源耗尽           |
| Exchanger      | 用于两个线程之间交换数据                | 1. 两个线程调用 `exchange()` 方法，会阻塞直到对方也调用该方法  <br>2. 双方相遇时，交换各自的数据                      | 1. 生产者 - 消费者模式变体，两个线程交换数据后继续执行不同逻辑  <br>2. 遗传算法中，两个种群交换信息 |

### 扩展实现
之前写过一个通用压测方法，可以对限流方法进行压测
**压测工具类**

```java
@Slf4j  
public class LoadRunnerUtils {  
    @Data  
    public static class LoadRunnerResult {  
        // 请求总数  
        private int requests;  
        // 并发量  
        private int concurrency;  
        // 成功请求数  
        private int successRequests;  
        // 失败请求数  
        private int failRequests;  
        // 请求总耗时(ms)  
        private int timeTakenForTests;  
        // 每秒请求数（吞吐量）  
        private float requestsPerSecond;  
        // 每个请求平均耗时(ms)  
        private float timePerRequest;  
        // 最快的请求耗时(ms)  
        private float fastestCostTime;  
        // 最慢的请求耗时(ms)  
        private float slowestCostTime;  
    }  
  
    /**  
     * 对 command 执行压测  
     *  
     * @param requests    总请求数  
     * @param concurrency 并发数量  
     * @param command     需要执行的压测代码  
     * @param <T>  
     * @return 压测结果 {@link LoadRunnerResult}  
     * @throws InterruptedException  
     */    public static <T> LoadRunnerResult run(int requests, int concurrency, Runnable command) throws InterruptedException {  
        log.info("压测开始......");  
        //创建线程池，并将所有核心线程池都准备好  
        ThreadPoolExecutor poolExecutor = new ThreadPoolExecutor(concurrency, concurrency,  
                0L, TimeUnit.MILLISECONDS,  
                new LinkedBlockingQueue<Runnable>());  
        poolExecutor.prestartAllCoreThreads();  
  
        // 创建一个 CountDownLatch，用于阻塞当前线程池待所有请求处理完毕后，让当前线程继续向下走  
        CountDownLatch countDownLatch = new CountDownLatch(requests);  
  
        //成功请求数、最快耗时、最慢耗时 （这几个值涉及到并发操作，所以采用 AtomicInteger 避免并发修改导致数据错误）  
        AtomicInteger successRequests = new AtomicInteger(0);  
        AtomicInteger fastestCostTime = new AtomicInteger(Integer.MAX_VALUE);  
        AtomicInteger slowestCostTime = new AtomicInteger(Integer.MIN_VALUE);  
  
        long startTime = System.currentTimeMillis();  
        //循环中使用线程池处理被压测的方法  
        for (int i = 0; i < requests; i++) {  
            poolExecutor.execute(() -> {  
                try {  
                    long requestStartTime = System.currentTimeMillis();  
                    //执行被压测的方法  
                    command.run();  
  
                    //command执行耗时  
                    int costTime = (int) (System.currentTimeMillis() - requestStartTime);  
  
                    //请求最快耗时  
                    setFastestCostTime(fastestCostTime, costTime);  
  
                    //请求最慢耗时  
                    setSlowestCostTimeCostTime(slowestCostTime, costTime);  
  
                    //成功请求数+1  
                    successRequests.incrementAndGet();  
                } catch (Exception e) {  
                    log.error(e.getMessage());  
                } finally {  
                    countDownLatch.countDown();  
                }  
            });  
        }  
        //阻塞当前线程，等到压测结束后，该方法会被唤醒，线程继续向下走  
        countDownLatch.await();  
        //关闭线程池  
        poolExecutor.shutdown();  
  
        long endTime = System.currentTimeMillis();  
        log.info("压测结束，总耗时(ms):{}", (endTime - startTime));  
  
  
        //组装最后的结果返回  
        LoadRunnerResult result = new LoadRunnerResult();  
        result.setRequests(requests);  
        result.setConcurrency(concurrency);  
        result.setSuccessRequests(successRequests.get());  
        result.setFailRequests(requests - result.getSuccessRequests());  
        result.setTimeTakenForTests((int) (endTime - startTime));  
        result.setRequestsPerSecond((float) requests * 1000f / (float) (result.getTimeTakenForTests()));  
        result.setTimePerRequest((float) result.getTimeTakenForTests() / (float) requests);  
        result.setFastestCostTime(fastestCostTime.get());  
        result.setSlowestCostTime(slowestCostTime.get());  
        return result;  
    }  
  
    private static void setFastestCostTime(AtomicInteger fastestCostTime, int costTime) {  
        while (true) {  
            int fsCostTime = fastestCostTime.get();  
            if (fsCostTime < costTime) {  
                break;  
            }  
            if (fastestCostTime.compareAndSet(fsCostTime, costTime)) {  
                break;  
            }  
        }  
    }  
  
    private static void setSlowestCostTimeCostTime(AtomicInteger slowestCostTime, int costTime) {  
        while (true) {  
            int slCostTime = slowestCostTime.get();  
            if (slCostTime > costTime) {  
                break;  
            }  
            if (slowestCostTime.compareAndSet(slCostTime, costTime)) {  
                break;  
            }  
        }  
    }  
}
```

**限流接口类**

```java
@RestController  
public class TestController {  
  
    /**  
     * Juc中的Semaphore可以实现限流功能，可以将 Semaphore 想象成停车场入口的大爷，  
     * 大爷手里面拥有一定数量的停车卡（也可以说是令牌），卡的数量是多少呢？就是Semaphore构造方法中指定的，如下就是50个卡，  
     * 车主想进去停车，先要从大爷手中拿到一张卡，出来的时候，需要还给大爷，如果拿不到卡，就不能进去停车。  
     * <p>  
     * semaphore 内部提供了获取令牌，和还令牌的一些方法  
     */  
    private Semaphore semaphore = new Semaphore(50);  
  
    /**  
     * 来个案例，下面是一个下单的方法，这个方法最多只允许 50 个并发，若超过50个并发，则进来的请求，最多等待1秒，如果无法获取到令牌，则快速返回失败，请重试  
     *  
     * @return  
     */  
    @GetMapping("/placeOrder")  
    public String placeOrder() throws InterruptedException {  
  
        /**  
         * semaphore 在上面定义的，里面有50个令牌，也就是同时可以支持50个并发请求  
         * 下面的代码，尝试最多等待1秒去获取令牌，获取成功，则进入下单逻辑，获取失败，则返回系统繁忙，请稍后重试  
         */  
        boolean flag = this.semaphore.tryAcquire(1, 1L, TimeUnit.SECONDS);  
        // 获取到令牌，则进入下单逻辑  
        if (flag) {  
            try {  
                //这里休眠2秒，模拟下单的操作  
                TimeUnit.SECONDS.sleep(2);  
                return "下单成功";  
            } finally {  
                //这里一定不要漏掉了，令牌用完了，要还回去  
                this.semaphore.release();  
            }  
        } else {  
            return "系统繁忙，请稍后重试";  
        }  
    }  
  
}
```

**测试类**

```java
public class CurrentLimitTest {  
    public static void main(String[] args) throws InterruptedException {  
        // 记录成功量、失败量  
        AtomicInteger successNum = new AtomicInteger(0);  
        AtomicInteger failNum = new AtomicInteger(0);  
  
        //下面模拟200个人同时下单，运行，大家看结果  
        RestTemplate restTemplate = new RestTemplate();  
        Runnable requestPlaceOrder = () -> {  
            String result = restTemplate.getForObject("http://localhost:8080/placeOrder", String.class);  
            System.out.println(result);  
            if ("下单成功".equals(result)) {  
                successNum.incrementAndGet();  
            } else {  
                failNum.incrementAndGet();  
            }  
        };  
  
        //模拟100个人同时发送100个请求，待请求结束，看成功量、失败量  
        LoadRunnerUtils.LoadRunnerResult loadRunnerResult = LoadRunnerUtils.run(100, 100, requestPlaceOrder);  
        System.out.println(loadRunnerResult);  
  
        System.out.println("下单成功数：" + successNum.get());  
        System.out.println("下单失败数：" + failNum.get());  
    }  
}
```

**测试结果**

![image.png](https://cdn.easymuzi.cn/img/20250121221608939.png)

## 什么是Java的CAS操作？
### 什么是CAS
CAS 即比较交换，是 CPU 的原子指令，基于硬件平台汇编指令实现，如 intel CPU 使用 `cmpxchg` 指令。它是无锁的原子算法，属于乐观锁，无需加锁解锁，不存在阻塞，能提高 CPU 吞吐量。
其操作过程包含内存位置（V）、预期原值（A）和新值（B）三个参数。仅当 V 值等于 A 值时，才将 V 值设为 B；若 V 与 A 不同，表明有其他线程已更新，当前线程不操作，最后返回 V 真实值。多线程操作时仅一个线程能胜出更新，失败线程不挂起，可再次尝试或放弃。
相比锁，CAS 实现的程序虽更复杂，但具有非阻塞的特性，天生免疫死锁，线程间影响小，不存在锁竞争与线程调度开销，因此性能更优越。其核心原理是需给出期望值，若变量与期望值不符，说明已被修改，需重新读取并尝试修改。

### CAS的应用
#### 非阻塞算法
可以说JUC就是建立在CAS之上的，相对于`synchronized`这种阻塞算法，CAS是非阻塞算法的一种常见实现，所以JUC在性能上有了很大的提升。
可以通过`AtomicInteger`为例来进行分析,了解一下在不适用锁的情况下是如何保证线程安全的。
```java
public class AtomicInteger extends Number implements java.io.Serializable {
    private volatile int value;
    public final int get() {
        return value;
    }
    public final int getAndIncrement() {
        for (;;) {
            int current = get();
            int next = current + 1;
            if (compareAndSet(current, next))
                return current;
        }
    }
    public final boolean compareAndSet(int expect, int update) {
        return unsafe.compareAndSwapInt(this, valueOffset, expect, update);
    }
}
```
首先通过`volatile`来保证在无锁的情况下线程间的数据是可见的。这样就可以保证在获取变量的值的时候可以直接读取。
然后来看下++i是如何实现的
```java
public final int getAndIncrement() {
    for (;;) {
        int current = get();
        int next = current + 1;
        if (compareAndSet(current, next))
            return next;
    }
}
```

`getAndIncrement`方法采用了CAS操作，每次从内存中读取数据然后将此数据+1后的结果进行CAS操作，成功就返回，否则就重试直到成功为止。
`compareAndSet`方法则是利用JNI来完成CPU指令的操作，通过判断当前的值和期望的值也就是最开始的值是否一致，如果一致说明期间没有其他线程对该数据进行修改，则不会出现并发异常，那么就将this改成update更新后的数据。
JNI是通过调用C语言代码，然后C语言代码调用CPU的CAS指令来完成Java的非阻塞算法，其他原子性的操作都是利用类似的特性完成的。
```java
unsafe.compareAndSwapInt(this, valueOffset, expect, update);
```
那么底层是如何保证更新和判断的这两个步骤的原子性呢？

### CAS底层原理
如果我们使用同步来将这两个操作变成原子的，那么这样做就没有意义了，所以只能靠硬件来完成，硬件保证了一个从语义看起来需要多次操作的行为只通过一条处理器指令来完成，这类指令通常有：
1. **测试并设置（Tetst-and-Set）**
2. **获取并增加（Fetch-and-Increment）**
3. **交换（Swap）**
4. **比较并交换（Compare-and-Swap）**
5. **加载链接/条件存储（Load-Linked/Store-Conditional）**
那CPU是如何实现原子指令的呢？
### CPU实现原子指令的方式
#### 处理器自动保证基本内存操作的原子性
处理器自动保障基本内存操作的原子性，像从系统内存读写一个字节，任一处理器读取时，其他处理器无法访问该字节内存地址。奔腾 6 及更新处理器，能自动确保单处理器对同一缓存行进行 16/32/64 位操作的原子性。然而，**复杂内存操作（如跨总线宽度、缓存行、页表访问）无法自动保证原子性**，不过处理器可通过**总线锁定**与**缓存锁定机制**来保障这类复杂操作的原子性。接下来我们就了解这两种锁定方式
#### 通过总线锁定来保证原子性
**总线锁定**其实就是处理器使用了**总线锁**，所谓总线锁就是使用处理器提供的一个 LOCK# 信号，当一个处理器在总线上输出此信号时，其他处理器的请求将被阻塞住，那么该处理器可以独占共享内存。但是该方法成本太大。因此有了下面的方式。
#### 通过缓存锁定来保证原子性
在同一时刻我们只需保证对某个内存地址的操作是原子性即可，但总线锁定把CPU和内存之间通信锁住了，这使得锁定期间，其他处理器不能操作其他内存地址的数据，所以总线锁定的开销比较大，最近的处理器在某些场合下使用缓存锁定代替总线锁定。

所谓**缓存锁定** 是指内存区域如果被缓存在处理器的缓存行中，并且在Lock 操作期间被锁定，那么当它执行操作写回到内存时，处理器不在总线上输出 LOCK# 信号，而是修改内部的内存地址，并允许它的缓存一致性机制来保证操作的原子性，因为缓存一致性机制会阻止同时修改两个以上处理器缓存的内存区域数据（这里和 volatile 的可见性原理相同），当其他处理器回写已被锁定的缓存行的数据时，会使缓存行无效。

**有两种情况下处理器不会使用缓存锁定**
1. 当操作的数据不能被缓存在处理器内部，或操作的数据跨多个缓存行时，则处理器会调用总线锁定。
2. 有些处理器不支持缓存锁定，对于 Intel 486 和 Pentium 处理器，就是锁定的内存区域在处理器的缓存行也会调用总线锁定。

**锁总线是通过LOCK#信号实现的，锁缓存是通过缓存一致性协议实现的**。

#### CAS的对象创建
另外，CAS还有一个应用，就是在JVM创建对象的过程中。
对象创建在虚拟机中是非常频繁的，所以即使是仅仅修改一个指针所指向的位置，在并发情况下也不是线程安全的，可能正在给对象A分配内存空间，指针还没来得及修改，对象B又同时使用了原来的指针来分配内存的情况，这里就可以采用CAS失败重试的方式来保证更新操作的原子性。

### CAS存在的问题
#### 循环时间太长
如果CAS一致不成功可能导致自旋时间太长，则会给CPU带来非常大的开销，所以在JUC有些地方就限制了CAS自旋的次数，比如`BlockingQueue`的`SynchronousQueue`

#### 只能保证一个共享变量原子操作

了解了CAS的实现就知道它只能针对一个共享变量，如果多个共享变量就只能使用锁了，但是可以借用JDK提供了**AtomicReference**类来保证引用对象之间的原子性，你可以把多个变量放在一个对象里来进行CAS操作。

#### ABA问题
ABA问题简单来说，就是一个值A先更新成了B然后又改回来了变成A，然后CAS检查的时候发现没有改变，但实质上已经发生了改变，解决的方案一般就是加上版本号，可能通过版本号来判断一个值是否发生过改变。

JDK的`atomic`包里提供了一个类`AtomicStampedReference`来解决ABA问题。这个类的`compareAndSet`方法作用是首先检查当前引用是否等于预期引用，并且当前标志是否等于预期标志，如果全部相等，则以原子方式将该引用和该标志的值设置为给定的更新值。其实就类似于引入了版本概念，给每一个数据都有一个它唯一的版本号，通关检查版本号来判断数据是否被修改。
具体代码示例如下

```java
package com.muzi.juctest;  
  
import java.util.concurrent.atomic.AtomicStampedReference;  
  
public class ABAProblemSolution {  
    public static void main(String[] args) {  
        // 初始值为 100，初始版本号为 0        AtomicStampedReference<Integer> atomicStampedReference = new AtomicStampedReference<>(100, 0);  
  
        // 线程 1 先将值从 100 改为 200，再改回 100        new Thread(() -> {  
            int[] stampHolder = new int[1];  
            int value = atomicStampedReference.get(stampHolder);  
            int stamp = stampHolder[0];  
            System.out.println("Thread 1: read value: " + value + ", stamp: " + stamp);  
            // 先将值改为 200            atomicStampedReference.compareAndSet(value, 200, stamp, stamp + 1);  
            System.out.println("Thread 1: change value to 200, new stamp: " + (stamp + 1));  
            // 再将值改回 100            atomicStampedReference.compareAndSet(200, 100, stamp + 1, stamp + 2);  
            System.out.println("Thread 1: change value back to 100, new stamp: " + (stamp + 2));  
        }).start();  
  
        // 线程 2 试图将值从 100 改为 150，但会因为版本号不匹配而失败  
        new Thread(() -> {  
            int[] stampHolder = new int[1];  
            int value = atomicStampedReference.get(stampHolder);  
            int stamp = stampHolder[0];  
            try {  
                // 让线程 2 睡眠 100 毫秒，确保线程 1 完成修改操作  
                Thread.sleep(100);  
            } catch (InterruptedException e) {  
                e.printStackTrace();  
            }  
            boolean success = atomicStampedReference.compareAndSet(value, 150, stamp, stamp + 1);  
            System.out.println("Thread 2: try to change value to 150, success: " + success);  
        }).start();  
    }  
}
```

**测试结果**
![image.png](https://cdn.easymuzi.cn/img/20250121232946715.png)

#### 总线风暴问题
这个具体讲解看官方题解比较详细
如何解决，本质上偏向锁就是为了消除CAS，降低Cache一致性流量

### CAS在操作系统层面是如何保证原子性的？
CAS是一种基本的原子操作，用于解决并发问题。在操作系统层面，CAS 操作的原理是基于硬件提供的原子操作指令。在x86架构的CPU中，CAS 操作通常使用 cmpxchg 指令实现。  
  
**为啥cmpxchg指令可以保证原子性呢？主要由以下几个方面的保障：**  

1. `cmpxchg` 指令是一条原子指令。在 CPU 执行 `cmpxchg` 指令时，处理器会自动锁定总线，防止其他 CPU 访问共享变量，然后执行比较和交换操作，最后释放总线。  
2. `cmpxchg` 指令在执行期间，CPU 会自动禁止中断。这样可以确保 CAS 操作的原子性，避免中断或其他干扰对操作的影响。  
3. `cmpxchg` 指令是硬件实现的，可以保证其原子性和正确性。CPU 中的硬件电路确保了 `cmpxchg` 指令的正确执行，以及对共享变量的访问是原子的。
同时CAS的可见性保障也是因为`cmpxchg` 指令，这个指令是基于 CPU 缓存一致性协议实现的。在多核 CPU 中，所有核心的缓存都是一致的。当一个 CPU 核心执行 `cmpxchg` 指令时，其他 CPU 核心的缓存会自动更新，以确保对共享变量的访问是一致的。

### CAS一定有自旋么？
**不一定，但是通常为了提高CAS的成功率，会考虑做自旋。  最简单的自旋就是while(true)**  

通常情况下，CAS 操作都会采用自旋的方式，当 CAS 失败时，会重新尝试执行 CAS 操作，直到操作成功或达到最大重试次数为止。  
因为，CAS 操作一般都是在多线程并发访问时使用，如果直接阻塞线程，会导致性能下降，而采用自旋的方式，可以让 CPU 空转一段时间，等待锁被释放，从而避免线程切换和阻塞的开销。  
但是，如果自旋时间过长或者线程数过多，就会占用过多的 CPU 资源，导致系统性能下降，因此在使用 CAS 操作时，需要根据实际情况进行适当的调整。