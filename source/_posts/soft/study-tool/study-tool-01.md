---
title: "自动化Obsidian文章生成Anki记忆卡片"
date: 2025-01-26 15:44:05
categories:
  - ["软件", "学习工具"]
tags:
  - "Obsidian"
  - "Anki"
---
**2025-01-26**🌱上海: ⛅️  🌡️+9°C 🌬️↓17km/h

前两天在群里了解到了Anki记忆卡片，首先大概介绍下Anki记忆卡片主要是干什么的？

Anki记忆卡采用了SM2算法可以在短时间内快速记忆一些知识点，有点类似闪念，或者说就是自定义的刷题卡片。

## 一、工具安装

首先我们下载两个主要工具，以下是**官网下载地址：**

[Obsidian - Sharpen your thinking](https://obsidian.md/)

[Anki - powerful, intelligent flashcards](https://apps.ankiweb.net/)

后续还需要安装它们所需的**核心插件**。

Anki端：anki connector 插件

Obsidian端：Export to Anki

## 二、插件安装配置

### Anki

下载好Anki后，按键ctrl+shift+A，或者点击设置，找到插件点击进去

![image.png](https://cdn.easymuzi.cn/img/20250126154618701.png)


插件页面，按照下面点击

![image.png](https://cdn.easymuzi.cn/img/20250126154624493.png)


搜索ankiconnect，或者直接在上面代码中输入`2055492159`

![image.png](https://cdn.easymuzi.cn/img/20250126154629990.png)


安装好之后

![image.png](https://cdn.easymuzi.cn/img/20250126154636288.png)


然后配置Anki插件进行连接，点击插件，修改设置

![image.png](https://cdn.easymuzi.cn/img/20250126154641687.png)


代码如下

```json
{
    "apiKey": null,
    "apiLogPath": null,
    "webBindAddress": "127.0.0.1",
    "webBindPort": 8765,
    "webCorsOrigin": "http://localhost",
    "webCorsOriginList": [
        "http://localhost",
        "app://obsidian.md"
    ]
}
```

配置好后进行重启anki

接下来我们进行ob插件安装配置

### Obsidian

打开ob，点击设置

![image.png](https://cdn.easymuzi.cn/img/20250126154707574.png)


点击第三方插件，第一次进入需要关闭安全模式，关闭后搜索`Export to Anki`安装好后进行配置修改

![image.png](https://cdn.easymuzi.cn/img/20250126154718628.png)


打开插件设置页面

![image.png](https://cdn.easymuzi.cn/img/20250126154725523.png)


第一步先进行同步操作，就是把Anki的默认卡牌类型同步过来（也可以自己设置但是不推荐，默认的够用了）,页面下拉找到Acition列，点击如下按钮

![image.png](https://cdn.easymuzi.cn/img/20250126154731281.png)


同步完成之后，往上拉

![image.png](https://cdn.easymuzi.cn/img/20250126154735959.png)


进行文章匹配规则自定义修改，就是根据匹配规则把文章的内容自动生成卡片，正则表达式放下面

```java
^#{4}\s(.+)\n*((?:\n(?:^[^\n#].{0,2}$|^[^\n#].{3}(?<!<!--).*))+)
```

上面是把文章中的四级标题匹配成正面卡片问题，标题下内容为背面答案。其他设置按照我的设置就行。

![image.png](https://cdn.easymuzi.cn/img/20250126154759388.png)


## 三、核心配置

### 联动配置

之后回到文章页面进行测试，可以按照我的格式进行创建文件夹和文件

![image.png](https://cdn.easymuzi.cn/img/20250126154805179.png)


```
TARGET DECK 
Code::Mysql
```

以上语法为 1.目标牌组 2.父牌组::子牌组

后续添加文件夹和文件按照我的格式就行，这里我使用了自定义的模板创建（配置更为复杂，不是很建议）

然后根据自己的需要进行文章编写，（注意匹配的是四级标题）

![image.png](https://cdn.easymuzi.cn/img/20250126154813702.png)


然后点击左侧边栏的卡牌按键

![image.png](https://cdn.easymuzi.cn/img/20250126154825077.png)


生成完成后会自动生成一个id，这里对应的是anki卡牌id

![image.png](https://cdn.easymuzi.cn/img/20250126154831611.png)


打开anki查看是否完成

![image.png](https://cdn.easymuzi.cn/img/20250126154837491.png)


看到生成成功了，然后接下来我们修改卡片格式，点击卡片

![image.png](https://cdn.easymuzi.cn/img/20250126154844249.png)


点击样式，修改模板

![image.png](https://cdn.easymuzi.cn/img/20250126154848703.png)


代码放下面了

```css
.card {
 font-family: arial;
 font-size: 20px;
 text-align: left;
 color: black;
 background-color: white;
}

em {
 #color:white; 
 background-color: #69E147;
 border-radius: 5px;
 padding: 2px 5px;
}

strong {
 color:red;
 font-weight: bolder;
 text-shadow: 2px 2px 5px #ffe600;
}

code {
 color:black;
 font-weight: bolder;
 text-shadow: 2px 2px 5px gray;
}

mark {
 border-radius: 5px;
 padding: 2px 5px;
}

blockquote {
 background-color: #ECECEC;
 padding: 2px 5px;
 border: 2px solid #7F7F7F;
 border-radius: 5px;
}
```

接下来进行卡片跳转到ob文章配置

### 跳转配置

点击一个牌组，进行卡片显示测试

![image.png](https://cdn.easymuzi.cn/img/20250126154901503.png)


![image.png](https://cdn.easymuzi.cn/img/20250126154905924.png)


显示如下，点击Obsidian进行跳转测试

![image.png](https://cdn.easymuzi.cn/img/20250126154910534.png)


自动跳转成功

![image.png](https://cdn.easymuzi.cn/img/20250126154915063.png)


但是有个问题，这个跳转只可以跳转到文章页面，并不能定位到具体问题

这里我们需要下载quicker，下载地址

[Quicker软件 您的指尖工具箱 - Quicker](https://getquicker.net/)

### 定位问题标题跳转

下载好之后，打开导入我下面配置好的动作组

[卡片定位 - by 木子金又二丨 - 动作信息 - Quicker](https://getquicker.net/Sharedaction?code=f4a4f491-290e-4b5c-7411-08dd3c4f34db)

具体怎么安装自己查看官网教程

![image.png](https://cdn.easymuzi.cn/img/20250126154926546.png)


安装好后你的quicker面板就有了一个快捷指令，卡片跳转这个是我整的一个比较复杂的指令，一般用不到，只需要用卡片定位就行

![image.png](https://cdn.easymuzi.cn/img/20250126154931273.png)

### 定位测试

安装好动作后，操作测试，首先点击Obsidian进行跳转文章页面

![image.png](https://cdn.easymuzi.cn/img/20250126154936495.png)


然后选中问题标题

![image.png](https://cdn.easymuzi.cn/img/20250126154941906.png)


按出quicker面板，或者把卡片定位动作设置一个快捷键，点击卡片定位

![image.png](https://cdn.easymuzi.cn/img/20250126154947096.png)


ok，自动定位完成

![image.png](https://cdn.easymuzi.cn/img/20250126154951921.png)


以上就是基本的操作互联，后续还可以定义模板文件，然后定义列表文件，还能编写一个跳转到列表的动作组（不建议配置，浪费时间收益小不太实用）

**卡片列表代码如下**

![image.png](https://cdn.easymuzi.cn/img/20250126154959292.png)


**显示如下**

![image.png](https://cdn.easymuzi.cn/img/20250126155004554.png)
