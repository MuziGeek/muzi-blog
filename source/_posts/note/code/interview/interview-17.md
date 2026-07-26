---
title: "面试训练营 Day 17 - 谈谈你了解的最常见的几种设计模式，说说他们的应用场景"
date: 2025-01-15 15:49:13
categories:
  - ["笔记", "编程", "面试训练营"]
tags:
  - "设计模式"
---
**2025-01-15**🌱上海: ☀️   🌡️+6°C 🌬️↓18km/h
## 谈谈你了解的最常见的几种设计模式，说说他们的应用场景

### 设计模式总览

设计模式总共有23种，同时又分为三大类：

1. **创建型模式**（Creational Patterns）：**这类模式主要关注对象的创建过程**。它们分别是：

- **单例模式（Singleton）**
- **工厂方法模式（Factory Method）**
- 抽象工厂模式（Abstract Factory）
- **建造者模式（Builder）**
- 原型模式（Prototype）

2. **结构型模式**（Structural Patterns）：**这类模式主要关注类和对象之间的组合**。它们分别是：

- **适配器模式（Adapter）**
- 桥接模式（Bridge）
- 组合模式（Composite）
- **装饰模式（Decorator）**
- 外观模式（Facade）
- 享元模式（Flyweight）
- **代理模式（Proxy）**

3. **行为型模式**（Behavioral Patterns）：**这类模式主要关注对象之间的通信**。它们分别是：

- **职责链模式（Chain of Responsibility）**
- 命令模式（Command）
- 解释器模式（Interpreter）
- 迭代器模式（Iterator）
- 中介者模式（Mediator）
- 备忘录模式（Memento）
- **观察者模式（Observer）**
- 状态模式（State）
- **策略模式（Strategy）**
- **模板方法模式（Template Method）**
- 访问者模式（Visitor）

### 常用的设计模式

上面加粗的其实就是比较常用也是比较重要的几个设计模式了，接下来分下进行讲解

#### 单例模式（Singleton）

##### 概念

**单例设计模式**（Singleton Design Pattern）理解起来非常简单。一个类只允许创建一个对象（或者实例），那这个类就是一个**单例类**，这种设计模式就叫作单例设计模式，简称单例模式。

##### 示例

这里我们使用比较经典的双检锁进行实例的实现。

```java
public class DclSingleton {  
    // volatile如果不加可能会出现半初始化的对象
    // 现在用的高版本的 Java 已经在 JDK 内部实现中解决了这个问题（解决的方法很简单，只要把对象 new 操作和初始化操作设计为原子操作，就自然能禁止重排序）,为了兼容性我们加上
    private volatile static Singleton singleton;  
    private Singleton (){}  

    public static Singleton getInstance() {  
        if (singleton == null) {  
            synchronized (Singleton.class) {  
                if (singleton == null) {  
                    singleton = new Singleton();  
                }  
            }  
        }  
        return singleton;  
    }  
}

```

##### 应用场景

| **应用场景分类** | **具体示例**            | **单例模式作用**                    |
| ---------- | ------------------- | ----------------------------- |
| 资源管理       | 数据库连接池              | 控制连接数量，避免资源浪费，提升数据库访问效率       |
| 资源管理       | 文件系统操作（如日志记录）       | 保证统一文件操作，防止多位置写入导致数据混乱或文件损坏   |
| 配置管理       | 应用程序配置（如数据库配置、系统参数） | 方便各处获取统一配置信息，确保信息一致性          |
| 工具类        | 线程池                 | 共享线程池执行任务，避免线程频繁创建销毁，提升并发处理能力 |
| 工具类        | 缓存管理                | 实现数据高效缓存与共享，各模块通过单例进行缓存读写     |
| 全局状态管理     | 用户登录状态              | 各模块共享登录状态，依此决定某些操作是否执行        |
| 全局状态管理     | 游戏中的场景管理            | 方便各模块获取和修改场景信息，保证场景管理的唯一性     |

#### 工厂模式

##### 概念

一般情况下，工厂模式分为三种更加细分的类型：**简单工厂**、**工厂方法**和**抽象工厂**。

在 GoF 的《设计模式》一书中，它将简单工厂模式看作是工厂方法模式的一种特例，所以工厂模式只被分成了**工厂方法**和**抽象工厂**两类。

##### 实例

以工厂方法为例，通过配置加载工厂对象

```java
http=com.muzi.factoryMethod.resourceFactory.impl.HttpResourceLoader
file=com.muzi.factoryMethod.resourceFactory.impl.FileResourceLoader
classpath=com.muzi.factoryMethod.resourceFactory.impl.ClassPathResourceLoader
default=com.muzi.factoryMethod.resourceFactory.impl.DefaultResourceLoader
```

加载配置类，初始化工厂对象

```java
static {
    InputStream inputStream = Thread.currentThread().getContextClassLoader()
        .getResourceAsStream("resourceLoader.properties");
    Properties properties = new Properties();
    try {
        properties.load(inputStream);
        for (Map.Entry<Object,Object> entry : properties.entrySet()){
            String key = entry.getKey().toString();
            Class<?> clazz = Class.forName(entry.getValue().toString());
            IResourceLoader loader = (IResourceLoader) clazz.getConstructor().newInstance();
            resourceLoaderCache.put(key,loader);
        }
    } catch (IOException | ClassNotFoundException | NoSuchMethodException | InstantiationException |
             IllegalAccessException | InvocationTargetException e) {
        throw new RuntimeException(e);
    }
}
```

构造抽象产品类

```java
public abstract class AbstractResource {

    private String url;

    public AbstractResource(){}

    public AbstractResource(String url) {
        this.url = url;
    }

    protected void shared(){
        System.out.println("这是共享方法");
    }

    /**
     * 每个子类需要独自实现的方法
     * @return 字节流
     */
    public abstract InputStream getInputStream();
}
```

通过继承抽象产品类进行具体的实现

```java
public class ClasspathResource extends AbstractResource {

    public ClasspathResource() {
    }

    public ClasspathResource(String url) {
        super(url);
    }

    @Override
    public InputStream getInputStream() {
        return null;
    }
}
```

同时，加入生成不同类型的产品也需要继承抽象产品类，工厂类也需要面向产品的抽象进行编程

```java
public class ClassPathResourceLoader implements IResourceLoader {
    @Override
    public AbstractResource load(String url) {
        // 中间省略复杂的创建过程
        return new ClasspathResource(url);
    }
}
```

编写测试用例

```java
@Test
public void testFactoryMethod(){
    String url = "file://D://a.txt";
    ResourceLoader resourceLoader = new ResourceLoader();
    AbstractResource resource = resourceLoader.load(url);
    log.info("resource --> {}",resource.getClass().getName());
}
```

##### 应用场景

| **模式类型** | **应用场景**    | **举例**                                    |
| -------- | ----------- | ----------------------------------------- |
| 简单工厂模式   | 创建对象逻辑简单    | 图形绘制系统，依用户输入图形类型（圆、矩形、三角形）创建对应图形对象        |
| 简单工厂模式   | 减少对象创建的重复代码 | 电商系统多处需创建订单对象，将创建订单的重复操作封装在工厂类            |
| 工厂方法模式   | 对象创建逻辑复杂或多变 | 游戏开发中，不同游戏关卡按不同逻辑创建敌人对象，且逻辑可能变化           |
| 工厂方法模式   | 扩展性要求高      | 报表生成系统，需频繁添加新报表类型（日报、周报等），且添加时少影响现有代码     |
| 抽象工厂模式   | 创建一系列相关对象   | 跨平台图形界面开发，为不同操作系统创建风格、功能一致的按钮、文本框等组件      |
| 抽象工厂模式   | 系统有多个产品族    | 汽车制造系统，有豪华型和经济型产品族，各包含发动机、座椅等产品对象，依用户选择创建 |

#### 建造者模式

##### 概念

**Builder 模式**，中文翻译为**建造者模式**或者**构建者模式**，也有人叫它**生成器模式**。

实际上，建造者模式的原理和代码实现非常简单，掌握起来并不难，难点在于应用场景。比如，你有没有考虑过这样几个问题：**直接使用构造函数或者配合 set 方法就能创建对象**，为什么还需要建造者模式来创建呢？建造者模式和工厂模式都可以创建对象，那它们两个的区别在哪里呢？（建议自行搜索学习）

创建者模式主要包含以下四个角色：

1. 产品（Product）：表示将要被构建的复杂对象。
2. 抽象创建者（Abstract Builder）：定义构建产品的接口，通常包含创建和获取产品的方法。
3. 具体创建者（Concrete Builder）：实现抽象创建者定义的接口，为产品的各个部分提供具体实现。
4. 指挥者（Director）：负责调用具体创建者来构建产品的各个部分，控制构建过程。

##### 示例

```java
public class HtmlDocument {
    private String header = "";
    private String body = "";
    private String footer = "";

    public void addHeader(String header) {
        this.header = header;
    }

    public void addBody(String body) {
        this.body = body;
    }

    public void addFooter(String footer) {
        this.footer = footer;
    }

    @Override
    public String toString() {
        return "<html><head>" + header + "</head><body>" + body + "</body><footer>" + footer + "</footer></html>";
    }

    public static class Builder {
        protected HtmlDocument document;

        public Builder() {
            document = new HtmlDocument();
        }

        public Builder addHeader(String header) {
            document.addHeader(header);
            return this;
        }

        public Builder addBody(String body) {
            document.addBody(body);
            return this;
        }

        public Builder addFooter(String footer) {
            document.addFooter(footer);
            return this;
        }

        public HtmlDocument build() {
            return document;
        }
    }
}
```

构造HTML文档对象

```java
public class Main {
    public static void main(String[] args) {
        HtmlDocument.ArticleBuilder builder = new HtmlDocument.ArticleBuilder();
        HtmlDocument document = builder.addHeader("This is the header")
                                       .addBody("This is the body")
                                       .addFooter("This is the footer")
                                       .build();

        System.out.println("Constructed HTML Document: \n" + document);
    }
}
```

##### 应用场景

| **应用场景分类**         | **具体示例** | **说明**                       |
| ------------------ | -------- | ---------------------------- |
| 创建复杂对象             | 游戏角色创建   | 涉及外貌、能力、装备等多属性设置，不同角色创建细节不同  |
| 创建复杂对象             | 文档生成     | 如生成含封面、目录等多部分的报告，不同报告格式和内容有别 |
| 对象创建过程步骤固定，但具体实现不同 | 汽车制造     | 制造步骤固定，不同品牌型号汽车各步骤实现有差异      |
| 对象创建过程步骤固定，但具体实现不同 | 房屋建造     | 建造流程固定，不同类型房屋各流程实现有别         |
| 需要对创建过程进行精细控制      | 定制化产品生产  | 如定制电脑，可按客户需求精确控制组件选择和组装      |
| 需要对创建过程进行精细控制      | 旅行行程规划   | 依旅行者需求精细控制交通、住宿、景点等行程安排      |

#### 适配器模式

##### 概念

适配器设计模式（Adapter Design Pattern）是一种结构型设计模式，用于**解决两个不兼容接口之间的问题**。适配器允许**将一个类的接口转换为客户端期望的另一个接口，使得原本由于接口不兼容而不能一起工作的类可以一起工作。**

在适配器设计模式中，主要包含以下四个角色：

1. **目标接口（Target）**：这是客户端期望使用的接口，它定义了特定领域的操作和方法。
2. **需要适配的类（Adaptee）**：这是一个已存在的类，它具有客户端需要的功能，但其接口与目标接口不兼容。适配器的目标是使这个类的功能能够通过目标接口使用。
3. **适配器（Adapter）**：这是适配器模式的核心角色，它实现了目标接口并持有需要适配的类的一个实例。适配器通过封装Adaptee的功能，使其能够满足Target接口的要求。
4. **客户端（Client）**：这是使用目标接口的类。客户端与目标接口进行交互，不直接与需要适配的类交互。通过使用适配器，客户端可以间接地使用需要适配的类的功能。

适配器模式的主要目的是在不修改现有代码的情况下，使不兼容的接口能够协同工作。通过引入适配器角色，客户端可以使用目标接口与需要适配的类进行通信，从而实现解耦和扩展性。

适配器模式有两种实现方式：**类适配器**和**对象适配器**。

##### 示例

类适配器**使用继承来实现适配器功能。适配器类继承了原有的类（Adaptee）并实现了目标接口（Target）**。

```java
// 目标接口
interface Target {
    void request();
}

// 需要适配的类（Adaptee）
class Adaptee {
    void specificRequest() {
        System.out.println("Adaptee's specific request");
    }
}

// 类适配器
class ClassAdapter extends Adaptee implements Target {
    @Override
    public void request() {
        specificRequest();
    }
}

public class ClassAdapterExample {
    public static void main(String[] args) {
        Target target = new ClassAdapter();
        target.request();
    }
}
```

对象适配器**使用组合来实现适配器功能**。适配器类包含一个**原有类的实例（Adaptee）并实现了目标接口（Target）**。

```java
// 目标接口
interface Target {
    void request();
}

// 需要适配的类（Adaptee）
class Adaptee {
    void specificRequest() {
        System.out.println("Adaptee's specific request");
    }
}

// 对象适配器
class ObjectAdapter implements Target {
    private Adaptee adaptee;

    public ObjectAdapter(Adaptee adaptee) {
        this.adaptee = adaptee;
    }

    @Override
    public void request() {
        adaptee.specificRequest();
    }
}

public class ObjectAdapterExample {
    public static void main(String[] args) {
        Adaptee adaptee = new Adaptee();
        Target target = new ObjectAdapter(adaptee);
        target.request();
    }
}
```

适配器模式**可以用于解决不同系统、库或API之间的接口不兼容问题**，使得它们可以协同工作。在实际开发中，应根据具体需求选择使用类适配器还是对象适配器。

##### 应用场景

| **应用场景分类** | **具体示例**    | **说明**                                   |
| ---------- | ----------- | ---------------------------------------- |
| 系统集成       | 第三方库或遗留系统整合 | 新系统集成第三方库或遗留系统时，将不兼容接口适配成系统可用接口          |
| 系统集成       | 不同系统间的数据交互  | 实现不同数据格式和接口协议的系统间的数据交互，如 XML 与 JSON 格式转换 |
| 复用现有类      | 复用功能但接口不匹配  | 现有类功能符合需求但接口不匹配，通过适配器复用其功能               |
| 复用现有类      | 适配不同版本的类接口  | 软件升级后类接口变化，通过适配器让旧代码能使用新版本类              |
| 改善代码设计     | 分离接口和实现     | 将不同实现类适配到统一接口，提高代码可维护性和扩展性               |
| 改善代码设计     | 简化复杂接口      | 对外提供简化接口，降低耦合度，提高代码可读性和易用性               |

#### 代理模式

##### 概念

代理设计模式（Proxy Design Pattern）是一种结构型设计模式，它为其他对象**提供一个代理**，**以控制对这个对象的访问**。代理模式可以用于实现懒加载、安全访问控制、日志记录等功能。

在设计模式中，代理模式可以分为**静态代理和动态代理**。静态代理是指**代理类在编译时**就已经确定，而动态代理是指**代理类在运行时动态生成**。

##### 示例

以下是一个缓存代理的应用示例：

假设有一个数据查询接口，它从数据库或其他数据源中检索数据。在没有缓存代理的情况下，每次查询都需要访问数据库，这可能会导致较高的资源消耗和延迟。通过引入缓存代理，我们可以将查询结果存储在内存中，从而避免重复查询数据库。

首先，我们定义一个数据查询接口：

```java
public interface DataQuery {
    String query(String queryKey);
}
```

然后，实现一个真实的数据查询类，它从数据库中检索数据：

```java
public class DatabaseDataQuery implements DataQuery {
    @Override
    public String query(String queryKey) {
        // 查询数据库并返回结果
        return "Result from database: " + queryKey;
    }
}
```

接下来，我们创建一个缓存代理类，它实现了 DataQuery 接口，并在内部使用 HashMap 作为缓存：

```java
public class CachingDataQueryProxy implements DataQuery {
    private final DataQuery realDataQuery;
    private final Map<String, String> cache;

    public CachingDataQueryProxy(DataQuery realDataQuery) {
        this.realDataQuery = new DatabaseDataQuery();
        cache = new HashMap<>();
    }

    @Override
    public String query(String queryKey) {
        String result = cache.get(queryKey);
        if (result == null) {
            result = realDataQuery.query(queryKey);
            cache.put(queryKey, result);
            System.out.println("Result retrieved from database and added to cache.");
        } else {
            System.out.println("Result retrieved from cache.");
        }
        return result;
    }
}
```

最后，我们可以在客户端代码中使用缓存代理：

```java
public class Client {
    public static void main(String[] args) {
        DataQuery realDataQuery = new DatabaseDataQuery();
        DataQuery cachingDataQueryProxy = new CachingDataQueryProxy(realDataQuery);

        String queryKey = "example_key";

        // 第一次查询，从数据库中获取数据并将其缓存
        System.out.println(cachingDataQueryProxy.query(queryKey));

        // 第二次查询相同的数据，从缓存中获取
        System.out.println(cachingDataQueryProxy.query(queryKey));
    }
}
```

通过这个示例，你可以看到缓存代理如何提供缓存功能，以提高程序的执行效率。

##### 应用场景

| **应用场景分类** | **具体示例**      | **说明**                          |
| ---------- | ------------- | ------------------------------- |
| 远程代理       | 分布式系统中的远程服务调用 | 隐藏远程服务调用的复杂性，如跨区域电商系统中订单处理服务的调用 |
| 远程代理       | 访问远程资源        | 处理与远程资源的连接等操作，如本地应用访问云端数据库      |
| 虚拟代理       | 延迟加载大对象       | 避免过早创建资源消耗大的对象，如图像浏览应用的高分辨率图像加载 |
| 虚拟代理       | 处理资源受限的情况     | 在资源受限环境中按需创建对象，如移动地图应用按需加载地图数据  |
| 保护代理       | 访问控制          | 验证用户权限，如企业系统中敏感数据的访问控制          |
| 保护代理       | 数据过滤和验证       | 对输入数据进行验证，如用户注册系统对注册信息的验证       |
| 智能引用代理     | 对象引用计数和资源管理   | 管理对象引用计数并释放资源，如多线程应用中数据库连接的管理   |
| 智能引用代理     | 对象访问监控和日志记录   | 记录对象访问信息，如企业级应用中对关键业务对象的访问监控    |

#### 装饰器模式

##### 概念

装饰器设计模式（Decorator）是一种**结构型设计模式**，它允许**动态地为对象添加新的行为**。它通过创建一个包装器来实现，即**将对象放入一个装饰器类**中，再将装饰器类放入另一个装饰器类中，以此类推，形成一条**包装链**。这样，我们可以在**不改变原有对象**的情况下，**动态地添加新的行为或修改原有行为**。

##### 示例

实现装饰器设计模式的步骤如下：

1、定义一个接口或抽象类，作为被装饰对象的基类。

```java
public interface Component {
    void operation();
}
```

在这个示例中，我们定义了一个名为 `Component` 的接口，它包含一个名为 `operation` 的抽象方法，用于定义被装饰对象的基本行为。

2、定义一个具体的被装饰对象，实现基类中的方法。

```java
public class ConcreteComponent implements Component {
    @Override
    public void operation() {
        System.out.println("ConcreteComponent is doing something...");
    }
}
```

在这个示例中，我们定义了一个名为 `ConcreteComponent` 的具体实现类，实现了 `Component` 接口中的 `operation` 方法。

3、定义一个抽象装饰器类，继承基类，并将被装饰对象作为属性。

```java
public abstract class Decorator implements Component {

    protected Component component;

    public Decorator(Component component) {
        this.component = component;
    }

    @Override
    public void operation() {
        component.operation();
    }
}
```

在这个示例中，我们定义了一个名为 `Decorator` 的抽象类，实现了 `Component` 接口，并将被装饰对象作为属性。在 `operation` 方法中，我们调用被装饰对象的同名方法。

4、定义具体的装饰器类，继承抽象装饰器类，并实现增强逻辑。

```java
public class ConcreteDecoratorA extends Decorator {

    public ConcreteDecoratorA(Component component) {
        super(component);
    }

    @Override
    public void operation() {
        super.operation();
        System.out.println("ConcreteDecoratorA is adding new behavior...");
    }
}
```

在这个示例中，我们定义了一个名为 `ConcreteDecoratorA` 的具体装饰器类，继承了 `Decorator` 抽象类，并实现了 `operation` 方法的增强逻辑。在 `operation` 方法中，我们先调用被装饰对象的同名方法，然后添加新的行为。

5、使用装饰器增强被装饰对象。

```java
public class Main {
    public static void main(String[] args) {
        Component component = new ConcreteComponent();
        component = new ConcreteDecoratorA(component);
        component.operation();
    }
}
```

在这个示例中，我们先创建了一个被装饰对象 `ConcreteComponent`，然后通过 `ConcreteDecoratorA` 类创建了一个装饰器，并将被装饰对象作为参数传入。最后，调用装饰器的 `operation` 方法，这样就可以实现对被装饰对象的增强。

##### 应用场景

| 增强现有对象功能      | 为文件输入输出操作添加功能 | 在不修改原始文件操作类的基础上，添加缓冲、加密等功能    |
| ------------- | ------------- | ----------------------------- |
| 增强现有对象功能      | 为图形界面组件添加特效   | 为 GUI 组件添加阴影、发光等特效，丰富界面效果     |
| 动态添加或移除功能     | 游戏角色能力增强      | 动态为游戏角色添加或移除加速、隐身等特殊能力        |
| 动态添加或移除功能     | 电商系统中订单处理功能扩展 | 根据业务需求，动态为订单处理添加或移除折扣计算等功能    |
| 遵循开闭原则，减少子类数量 | 日志记录功能扩展      | 通过装饰器为多个业务逻辑方法添加日志记录功能，减少子类数量 |
| 遵循开闭原则，减少子类数量 | 权限验证功能复用      | 创建权限验证装饰器，复用权限验证功能，减少代码冗余     |

#### 责任链模式

##### 概念

将请求的发送和接收解耦，让多个接收对象都有机会处理这个请求。将这些接收对象串成一条链，并沿着这条链传递这个请求，**直到链上的某个接收对象能够处理它为止**，实际上，在常见的使用场景中，我们的责任链并不是和概念中的完全一样。

- 原始概念中，是直到链上的某个接收对象能够处理它为止。
- 实际使用中，链上的所有对象都可以对请求进行特殊处理。

##### 示例

```java
public abstract class Handler {
    protected Handler successor = null;
    public void setSuccessor(Handler successor) {
        this.successor = successor;
    }
    public final void handle() {
        boolean handled = doHandle();
        if (successor != null && !handled) {
            successor.handle();
        }
    }
    protected abstract boolean doHandle();
}

public class HandlerA extends Handler {
    @Override
    protected boolean doHandle() {
        boolean handled = false;
        //...
        return handled;
    }
}

public class HandlerB extends Handler {
    @Override
    protected boolean doHandle() {
        boolean handled = false;
        //...
        return handled;
    }
}
public class HandlerChain {
    private Handler head = null;
    private Handler tail = null;
    public void addHandler(Handler handler) {
        handler.setSuccessor(null);
        if (head == null) {
            head = handler;
            tail = handler;
            return;
        }
        tail.setSuccessor(handler);
        tail = handler;
    }
    public void handle() {
        if (head != null) {
            head.handle();
        }
    }
}

// 使用举例
public class Application {
    public static void main(String[] args) {
        HandlerChain chain = new HandlerChain();
        chain.addHandler(new HandlerA());
        chain.addHandler(new HandlerB());
        chain.handle();
    }
}
```

##### 应用场景

| **应用场景分类** | **具体示例**        | **说明**              |
| ---------- | --------------- | ------------------- |
| 审批流程       | 请假审批            | 根据请假天数不同，由不同领导按顺序审批 |
| 审批流程       | 费用报销审批          | 依据报销金额，经不同层级审批      |
| 事件处理       | 图形用户界面（GUI）事件处理 | 用户操作事件沿组件链传递处理      |
| 事件处理       | 游戏中的输入事件处理      | 玩家输入事件在游戏对象链中传递处理   |
| 过滤和验证      | 数据过滤            | 用户输入数据依次经多个过滤器处理    |
| 过滤和验证      | 请求验证            | 客户端请求依次经多个验证器验证     |

#### 观察者模式

##### 概念

观察者模式是一种行为设计模式，允许对象间存在**一对多的依赖关系**，当**一个对象的状态发生改变时，所有依赖它的对象都会得到通知并自动更新**。在这种模式中，**发生状态改变的对象被称为“主题”（Subject），依赖它的对象被称为“观察者”（Observer）。**

**观察者模式**（Observer Design Pattern）也被称为**发布订阅模式**（Publish-Subscribe Design Pattern）。

##### 示例

通过一个简单的例子来实现观察者模式。假设我们有一个气象站（WeatherStation），需要向许多不同的显示设备（如手机App、网站、电子屏幕等）提供实时天气数据。

首先，我们需要创建一个Subject接口，**表示主题**：

```java
public interface Subject {
    void registerObserver(Observer o);
    void removeObserver(Observer o);
    void notifyObservers();
}
```

接下来，我们创建一个Observer接口，**表示观察者**：

```java
public interface Observer {
    void update(float temperature, float humidity, float pressure);
}
```

现在，我们创建一个**具体的主题**，如WeatherStation，实现Subject接口：

```java
public class WeatherStation implements Subject {
    private ArrayList<Observer> observers;
    // 温度
    private float temperature;
    // 湿度
    private float humidity;
    // 大气压
    private float pressure;

    public WeatherStation() {
        observers = new ArrayList<>();
    }

    // 注册一个观察者的方法
    @Override
    public void registerObserver(Observer o) {
        observers.add(o);
    }

    // 移除一个观察者的方法
    @Override
    public void removeObserver(Observer o) {
        int index = observers.indexOf(o);
        if (index >= 0) {
            observers.remove(index);
        }
    }

    // 通知所有的观察者
    @Override
    public void notifyObservers() {
        // 循环所有的观察者，通知其当前的气象信息
        for (Observer o : observers) {
            o.update(temperature, humidity, pressure);
        }
    }

    // 修改气象内容
    public void measurementsChanged() {
        notifyObservers();
    }

    // 当测量值发生了变化的时候
    public void setMeasurements(float temperature, float humidity, float pressure) {
        this.temperature = temperature;
        this.humidity = humidity;
        this.pressure = pressure;
        // 测量值发生了变化
        measurementsChanged();
    }
}
```

最后，我们创建一个具体的观察者，如PhoneApp，实现Observer接口：

```java
public class PhoneApp implements Observer {
    private float temperature;
    private float humidity;
    private float pressure;
    private Subject weatherStation;

    public PhoneApp(Subject weatherStation) {
        this.weatherStation = weatherStation;
        weatherStation.registerObserver(this);
    }

    @Override
    public void update(float temperature, float humidity, float pressure) {
        this.temperature = temperature;
        this.humidity = humidity;
        this.pressure = pressure;
        display();
    }

    public void display() {
        System.out.println("PhoneApp: Temperature: " + temperature + "°C, Humidity: " + humidity + "%, Pressure: " + pressure + " hPa");
    }
}
```

现在我们可以创建一个WeatherStation实例并向其注册PhoneApp观察者。当WeatherStation的数据发生变化时，PhoneApp会收到通知并更新自己的显示。

```java
public class Main {
    public static void main(String[] args) {
        WeatherStation weatherStation = new WeatherStation();
        PhoneApp phoneApp = new PhoneApp(weatherStation);
        // 模拟气象站数据更新
        weatherStation.setMeasurements(25, 65, 1010);
        weatherStation.setMeasurements(22, 58, 1005);

        // 添加更多观察者  网站上显示-电子大屏
        WebsiteDisplay websiteDisplay = new WebsiteDisplay(weatherStation);
        ElectronicScreen electronicScreen = new ElectronicScreen(weatherStation);

        // 再次模拟气象站数据更新
        weatherStation.setMeasurements(18, 52, 1008);
    }
}
```

在这个例子中，我们**创建了一个WeatherStation实例**，并向其注册了PhoneApp、WebsiteDisplay和ElectronicScreen观察者。当WeatherStation的数据发生变化时，所有观察者都会收到通知并更新自己的显示。 这个例子展示了观察者模式的优点：

1. **观察者和主题之间的解耦**：主题只需要知道观察者实现了Observer接口，而无需了解具体的实现细节。
2. **可以动态添加和删除观察者**：通过调用registerObserver和removeObserver方法，可以在运行时添加和删除观察者。
3. **主题和观察者之间的通信是自动的**：当主题的状态发生变化时，观察者会自动得到通知并更新自己的状态。

##### 应用场景

| **应用场景分类**    | **具体示例**    | **说明**            |
| ------------- | ----------- | ----------------- |
| 消息通知系统        | 邮件订阅服务      | 主题更新时通知订阅用户接收新邮件  |
| 消息通知系统        | 即时通讯软件的群组通知 | 群状态改变时通知群成员       |
| 图形用户界面（GUI）设计 | 按钮状态变化通知    | 按钮状态改变时通知相关组件更新   |
| 图形用户界面（GUI）设计 | 窗口大小调整通知    | 窗口大小改变时通知内部组件调整   |
| 游戏开发          | 游戏角色状态变化    | 角色状态改变时通知相关游戏元素   |
| 游戏开发          | 游戏场景事件通知    | 场景事件发生时通知玩家和相关对象  |
| 系统架构中的模块通信    | 业务逻辑与数据层通信  | 数据层数据变化时通知业务逻辑层处理 |
| 系统架构中的模块通信    | 不同模块间的状态同步  | 一个模块状态改变时通知相关模块同步 |

#### 策略模式

##### 概念

定义一族算法类，将每个算法分别封装起来，让它们可以互相替换。策略模式可以使算法的变化独立于使用它们的客户端（这里的客户端代指使用算法的代码）

策略模式主要包含以下角色：

1. **策略接口（Strategy）**：定义所有支持的算法的公共接口。客户端使用这个接口与具体策略进行交互。
2. **具体策略（Concrete Strategy）**：实现策略接口的具体策略类。这些类封装了实际的算法逻辑。
3. **上下文（Context）**：持有一个策略对象，用于与客户端进行交互。上下文可以定义一些接口，让客户端不直接与策略接口交互，从而实现策略的封装。

##### 示例

一个简单的例子来说明策略模式：假设我们要实现一个计算器，支持**加法、减法和乘法运算**。我们可以使用策略模式将**各种运算独立为不同的策略**，并让客户端根据需要选择和使用不同的策略。

首先，我们定义一个策略接口`Operation`：

```java
public interface Operation {
    double execute(double num1, double num2);
}
```

接下来，我们创建具体策略类来实现加法、减法和乘法运算：

```java
public class Addition implements Operation {
    @Override
    public double execute(double num1, double num2) {
        return num1 + num2;
    }
}

public class Subtraction implements Operation {
    @Override
    public double execute(double num1, double num2) {
        return num1 - num2;
    }
}

public class Multiplication implements Operation {
    @Override
    public double execute(double num1, double num2) {
        return num1 * num2;
    }
}
```

然后，我们创建一个上下文类`Calculator`，让客户端可以使用这个类来执行不同的运算：

```java
public class Calculator {
    private Operation operation;

    public void setOperation(Operation operation) {
        this.operation = operation;
    }

    public double executeOperation(double num1, double num2) {
        return operation.execute(num1, num2);
    }
}
```

现在，客户端可以使用`Calculator`类来执行不同的运算，例如：

```java
public class Client {
    public static void main(String[] args) {
        Calculator calculator = new Calculator();

        calculator.setOperation(new Addition());
        System.out.println("10 + 5 = " + calculator.executeOperation(10, 5));

        calculator.setOperation(new Subtraction());
        System.out.println("10 - 5 = " + calculator.executeOperation(10, 5));

        calculator.setOperation(new Multiplication());
        System.out.println("10 * 5 = " + calculator.executeOperation(10,5));
    }
}
```

##### 应用场景

| 算法多样化且需要动态切换 | 游戏中的角色行为   | 不同角色的攻击、移动等行为可通过切换策略改变     |
| ------------ | ---------- | -------------------------- |
| 算法多样化且需要动态切换 | 电商系统中的促销活动 | 不同促销活动采用不同策略计算商品价格         |
| 代码复用与维护      | 数据排序算法     | 不同排序算法封装成策略类，提高复用性和可维护性    |
| 代码复用与维护      | 文件格式转换     | 不同文件格式转换逻辑封装成策略类，方便扩展      |
| 条件判断逻辑复杂     | 用户权限控制     | 不同角色的权限控制逻辑封装成策略类，简化判断     |
| 条件判断逻辑复杂     | 订单处理流程     | 不同订单类型和条件下的处理逻辑封装成策略类，优化代码 |

#### 模板方法模式

##### 概念

模板方法模式在一个方法中定义一个**算法骨架**，并将某些步骤**推迟到子类中实现**。模板方法模式可以让子类在不改变算法整体结构的情况下，**重新定义算法中的某些步骤**。

##### 示例

下面是一个简单的Java示例，展示了如何使用模板方法设计模式：

1、首先，创建一个抽象类，定义算法的骨架：

```java
public abstract class AbstractTemplate {
    // 模板方法，定义算法的骨架
    public final void templateMethod() {
        step1();
        step2();
        step3();
    }

    // 基本方法，定义算法中不会变化的步骤
    private void step1() {
        System.out.println("Step 1: Prepare the ingredients.");
    }

    // 抽象方法，定义算法中需要子类实现的步骤
    protected abstract void step2();

    // 基本方法，定义算法中不会变化的步骤
    private void step3() {
        System.out.println("Step 3: Serve the dish.");
    }
}
```

2、然后，创建具体的子类，实现抽象类中定义的抽象方法：

```java
public class ConcreteTemplateA extends AbstractTemplate {
    @Override
    protected void step2() {
        System.out.println("Step 2 (A): Cook the dish using method A.");
    }
}

public class ConcreteTemplateB extends AbstractTemplate {
    @Override
    protected void step2() {
        System.out.println("Step 2 (B): Cook the dish using method B.");
    }
}
```

3、最后，在客户端代码中使用模板方法：

```java
public class Main {
    public static void main(String[] args) {
        AbstractTemplate templateA = new ConcreteTemplateA();
        AbstractTemplate templateB = new ConcreteTemplateB();

        System.out.println("Using Template A:");
        templateA.templateMethod();

        System.out.println("\nUsing Template B:");
        templateB.templateMethod();
    }
}
```

运行上面的程序，输出如下：

```java
Using Template A:
Step 1: Prepare the ingredients.
Step 2 (A): Cook the dish using method A.
Step 3: Serve the dish.

Using Template B:
Step 1: Prepare the ingredients.
Step 2 (B): Cook the dish using method B.
Step 3: Serve the dish.
```

##### 应用场景


| **应用场景分类**               | **具体示例** | **说明**                   |
| ------------------------ | -------- | ------------------------ |
| 多个子类有相同的基本算法结构，但部分步骤实现不同 | 文件读取操作   | 不同类型文件读取流程相似，部分步骤实现不同    |
| 多个子类有相同的基本算法结构，但部分步骤实现不同 | 数据库操作    | 不同数据库操作流程相似，具体操作实现不同     |
| 固定算法流程，但需要根据不同业务场景进行定制化  | 游戏角色升级流程 | 不同角色升级流程相似，定制部分升级步骤      |
| 固定算法流程，但需要根据不同业务场景进行定制化  | 电商订单处理流程 | 不同订单处理流程相似，定制部分处理步骤      |
| 代码复用与扩展                  | 报表生成     | 不同报表生成流程相似，复用通用流程，扩展具体实现 |

## 你认为好的代码应该是什么样的？

呃，我认为好的代码可以一遍过Review code。（哈哈哈哈）

### 功能方面

- **能把事儿做对**：写代码就是为了实现一些功能，好代码得保证在各种情况下都能把这些功能实现得稳稳当当。就像一个计算器程序，不管输入啥数字、啥运算，算出来的结果都得是对的。要是算错了，那这代码肯定不行。
- **功能齐全没遗漏**：代码得把该有的功能都包含进去，不能缺这少那的。拿一个做外卖的 APP 代码来说，从用户选餐、下单、支付，到商家接单、配送，再到用户评价，这些环节一个都不能少，要是少了哪个环节，这个外卖系统就没法正常用了。

### 读起来方面

- **结构清楚像搭积木**：好代码的结构就像搭积木一样，一块一块的功能模块分得很清楚，每个模块都有自己明确的任务。就好比盖房子，客厅、卧室、厨房这些功能区域划分得明明白白，这样别人看代码的时候，一下子就能知道每个部分是干啥的，以后要改代码或者加功能也方便。
- **名字取得好懂**：代码里的变量名、函数名、类名，就像人的名字一样，得让人一看就知道是干啥的。比如，一个统计学生成绩总分的函数，取名叫 “calculateTotalScore”，这样大家一看名字就知道这个函数是用来算总分的，多清楚。
- **注释写得贴心**：注释就是给代码写的 “小说明”，在一些难懂的代码旁边，写几句注释，解释一下这段代码在干啥，为啥要这么写。就像给一篇文章加注解一样，帮助别人更好地理解代码的意思，特别是那些复杂的算法或者关键的步骤，加了注释就好懂多了。

### 维护方面

- **模块之间少牵连**：代码里各个模块之间别 “你依赖我，我依赖你” 的，依赖太多，牵一发而动全身，一个地方改了，可能好多地方都得跟着改，太麻烦。就像一个团队里，每个人都有自己独立的工作，互不干扰，这样谁要调整工作，也不会影响到别人。
- **每个模块专注一件事**：每个模块都应该专心做好自己的一件事，功能要集中。比如一个做图片处理的模块，就只负责处理图片，别又想着去处理音频啥的，这样这个模块的功能就很清晰，以后要修改或者扩展这个模块的功能，也容易操作。
- **守规矩好协作**：写代码要遵循一些大家都认可的设计原则和规范，就像大家都遵守交通规则一样，这样整个团队写出来的代码风格统一，大家一起合作的时候，就很容易看懂别人写的代码，也方便一起维护和开发。

### 性能方面

- **速度快不磨蹭**：好代码运行起来速度要快，不管是处理少量数据还是大量数据，都能在短时间内给出结果，不会让用户等得不耐烦。比如一个搜索引擎，用户输入关键词后，得马上把相关的搜索结果显示出来，要是半天没反应，用户肯定就不想用了。
- **能跟着业务一起长大**：随着业务的发展，用户越来越多，数据量越来越大，好代码得能适应这种变化，很容易就能扩展功能、提升性能。就像一个小店铺，生意越来越好，店面得能方便地扩大，增加新的商品和服务一样。

### 安全方面

- **数据保护得好**：代码要保证数据的安全，不能让用户的信息泄露出去，也不能被别人随便篡改。比如用户的账号密码、银行卡信息等，都得加密保存，防止黑客攻击。
- **权限管理不乱套**：对于不同的用户，要有不同的权限管理。就像一个公司，老板、经理、普通员工，他们能访问和操作的系统功能是不一样的，代码得能准确地控制这些权限，保证只有有相应权限的人才能做相应的事 。

## 工厂模式和抽象工厂模式有什么区别？

### 两者的概念区分

工厂模式**关注的是创建单一类型对象**，定义一个抽象方法，由子类实现具体对象的实例化。

抽象工厂模式**关注的是创建一族相关对象**，提供一个接口来创建一组相关的或互相依赖的对象，而无需指定它们的具体类。

工厂方法中，往往只需要创建**一种类型的产品**，但是如果需求改变，需要增加多**种类型的产品，即增加产品族**,就需要使用抽象工厂模式。

### 两者各自的实现

以下是使用 Java 代码分别通过工厂模式和抽象工厂模式实现汽车工厂的示例：

#### 工厂模式

1. **定义汽车接口**

```java
// 汽车接口
interface Car {
    void drive();
}
```

1. **实现具体的汽车类**

```java
// 具体的汽车类：宝马
class BMW implements Car {
    @Override
    public void drive() {
        System.out.println("驾驶宝马汽车");
    }
}

// 具体的汽车类：奔驰
class Mercedes implements Car {
    @Override
    public void drive() {
        System.out.println("驾驶奔驰汽车");
    }
}
```

1. **创建汽车工厂类**

```java
// 汽车工厂类
class CarFactory {
    public Car createCar(String carType) {
        if ("BMW".equalsIgnoreCase(carType)) {
            return new BMW();
        } else if ("Mercedes".equalsIgnoreCase(carType)) {
            return new Mercedes();
        }
        return null;
    }
}
```

1. **使用汽车工厂创建汽车**

```java
// 测试代码
public class FactoryPatternCarExample {
    public static void main(String[] args) {
        CarFactory factory = new CarFactory();
        Car bmw = factory.createCar("BMW");
        Car mercedes = factory.createCar("Mercedes");

        if (bmw!= null) {
            bmw.drive();
        }
        if (mercedes!= null) {
            mercedes.drive();
        }
    }
}
```

#### 抽象工厂模式

1. **定义汽车接口和不同类型的汽车接口**

```java
// 汽车接口
interface Car {
    void drive();
}

// SUV 汽车接口
interface SUVCar extends Car {
}

// 轿车接口
interface SedanCar extends Car {
}
```

1. **实现具体的汽车类**

```java
// 具体的 SUV 汽车类：宝马 X5
class BMWX5 implements SUVCar {
    @Override
    public void drive() {
        System.out.println("驾驶宝马 X5 SUV");
    }
}

// 具体的轿车类：宝马 5 系
class BMW5Series implements SedanCar {
    @Override
    public void drive() {
        System.out.println("驾驶宝马 5 系轿车");
    }
}

// 具体的 SUV 汽车类：奔驰 GLC
class MercedesGLC implements SUVCar {
    @Override
    public void drive() {
        System.out.println("驾驶奔驰 GLC SUV");
    }
}

// 具体的轿车类：奔驰 E 级
class MercedesEClass implements SedanCar {
    @Override
    public void drive() {
        System.out.println("驾驶奔驰 E 级轿车");
    }
}
```

1. **定义抽象汽车工厂接口**

```java
// 抽象汽车工厂接口
interface CarAbstractFactory {
    SUVCar createSUVCar();
    SedanCar createSedanCar();
}
```

1. **实现具体的汽车工厂类**

```java
// 宝马汽车工厂
class BMWCarFactory implements CarAbstractFactory {
    @Override
    public SUVCar createSUVCar() {
        return new BMWX5();
    }

    @Override
    public SedanCar createSedanCar() {
        return new BMW5Series();
    }
}

// 奔驰汽车工厂
class MercedesCarFactory implements CarAbstractFactory {
    @Override
    public SUVCar createSUVCar() {
        return new MercedesGLC();
    }

    @Override
    public SedanCar createSedanCar() {
        return new MercedesEClass();
    }
}
```

1. **使用抽象汽车工厂创建汽车**

```java
// 测试代码
public class AbstractFactoryPatternCarExample {
    public static void main(String[] args) {
        CarAbstractFactory bmwFactory = new BMWCarFactory();
        SUVCar bmwX5 = bmwFactory.createSUVCar();
        SedanCar bmw5Series = bmwFactory.createSedanCar();

        CarAbstractFactory mercedesFactory = new MercedesCarFactory();
        SUVCar mercedesGLC = mercedesFactory.createSUVCar();
        SedanCar mercedesEClass = mercedesFactory.createSedanCar();

        if (bmwX5!= null) {
            bmwX5.drive();
        }
        if (bmw5Series!= null) {
            bmw5Series.drive();
        }
        if (mercedesGLC!= null) {
            mercedesGLC.drive();
        }
        if (mercedesEClass!= null) {
            mercedesEClass.drive();
        }
    }
}
```

### 区别总结

- **工厂模式**：主要用于创建单一类型的汽车，通过一个工厂类根据传入的参数决定创建哪种具体的汽车。如果需要添加新的汽车类型，需要修改工厂类的`createCar`方法，不符合开闭原则。
- **抽象工厂模式**：用于创建一系列相关的汽车产品（如 SUV 和轿车）。每个具体的工厂类负责创建特定品牌的一系列汽车。当需要添加新的品牌汽车系列时，只需要创建新的具体工厂类，而不需要修改现有的代码，更符合开闭原则，具有更好的扩展性和灵活性。
