---
title: 配置Graphiti知识图谱MCP服务
date: 2025-07-23 11:43:55
categories:
  - - 笔记
    - AI
tags:
  - MCP
  - AI
---
**2025-07-23**🌱上海: ⛅️  🌡️+28°C 🌬️↖13km/h

# 下载地址
## Graphiti
[getzep/graphiti: Build Real-Time Knowledge Graphs for AI Agents](https://github.com/getzep/graphiti)
## Neo4j
[Neo4j Desktop Download | Free Graph Database Download](https://neo4j.com/download/)

# 本地安装
## 下载Neo4j
先从官网下载桌面版Neo4j软件 
下载好后进行新建Instance
![image.png](https://cdn.easymuzi.cn/img/20250723120957635.png)
创建好后，如下所示
![image.png](https://cdn.easymuzi.cn/img/20250723135515574.png)
需要注意的地方就是这个路径不能有中文，但是下载好默认设置的，保证用户名文件夹不是中文就行。
## git拉取项目

```
git clone https://github.com/getzep/graphiti.git
```
项目拉取完成后，进入项目中的mcp_server文件夹下。
```
cd graphiti/mcp_server
```
执行安装依赖
```
uv sync
```
这里前置条件需要安装uv，已安装忽略下条命令
```
curl -LsSf https://astral.sh/uv/install.sh | sh
```
如果是windows powershell终端窗口执行下面命令
```
powershell -c "irm https://astral.sh/uv/install.ps1 | iex"
```
# 修改环境变量
打开当前mcp_server文件夹下.env.example文件
复制内容新建.env文件
![image.png](https://cdn.easymuzi.cn/img/20250723140428039.png)
主要修改的配置就是
```
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=demodemo

# OpenAI API Configuration
# Required for LLM operations
OPENAI_API_KEY=your_openai_api_key_here
MODEL_NAME=gpt-4.1-mini

# Optional: Only needed for non-standard OpenAI endpoints
# OPENAI_BASE_URL=https://api.openai.com/v1
```
可以参考我的使用了ds的模型
![image.png](https://cdn.easymuzi.cn/img/20250723141717132.png)
接下来就可以执行启动命令了
```
uv run graphiti_mcp_server.py --model deepseek-reasoner --transport sse
```
启动成功如下
![image.png](https://cdn.easymuzi.cn/img/20250723141810868.png)
# 集成IDE

## Claude Code

```
{
  "mcpServers": {
    "graphiti-memory": {
      "command": "npx",
      "args": ["mcp-remote", "http://localhost:8000/sse"]
    }
  }
}
```

## Cursor
```
{
  "mcpServers": {
    "graphiti-memory": {
      "url": "http://localhost:8000/sse"
    }
  }
}
```

以上由于是本地部署服务，所以需要先启动服务，再进行操作。后续可以修改MCP配置参数或者通过docker部署 