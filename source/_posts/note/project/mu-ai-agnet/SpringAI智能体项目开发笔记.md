---
title: SpringAI智能体项目开发笔记
date: 2026-06-05 17:18:27
categories:
  - [项目, mu-ai-agnet]
tags:
  - AI Agent
---
**2026-06-05**🌱上海: 🌤️  🌡️+78°F 🌬️←12mph

开发中，有多种方式可以在应用程序中调用AI大模型。下面介绍4种主流的接入方式。

## SDK接入

引入POM依赖
``` 
<!-- Source: https://mvnrepository.com/artifact/com.alibaba/dashscope-sdk-java -->  
<dependency>  
    <groupId>com.alibaba</groupId>  
    <artifactId>dashscope-sdk-java</artifactId>  
    <version>2.22.17</version>  
    <scope>compile</scope>  
</dependency>
```

编写代码
``` java
public class SdkAiInvoke {  
  
    public static GenerationResult callWithMessage() throws ApiException, NoApiKeyException, InputRequiredException {  
        Generation gen = new Generation();  
        Message systemMsg = Message.builder()  
                .role(Role.SYSTEM.getValue())  
                .content("You are a helpful assistant.")  
                .build();  
        Message userMsg = Message.builder()  
                .role(Role.USER.getValue())  
                .content("你是谁？")  
                .build();  
        GenerationParam param = GenerationParam.builder()  
                // 若没有配置环境变量，请用百炼API Key将下行替换为：.apiKey("sk-xxx")  
                .apiKey(TestApiKey.API_KEY)  
                // 此处以qwen-plus为例，可按需更换模型名称。模型列表：https://help.aliyun.com/zh/model-studio/getting-started/models  
                .model("qwen-plus")  
                .messages(Arrays.asList(systemMsg, userMsg))  
                .resultFormat(GenerationParam.ResultFormat.MESSAGE)  
                .build();  
        return gen.call(param);  
    }  
  
    public static void main(String[] args) {  
        try {  
            GenerationResult result = callWithMessage();  
            System.out.println(JsonUtils.toJson(result));  
        } catch (ApiException | NoApiKeyException | InputRequiredException e) {  
            // 使用日志框架记录异常信息  
            System.err.println("An error occurred while calling the generation service: " + e.getMessage());  
        }  
        System.exit(0);  
    }  
}
```
