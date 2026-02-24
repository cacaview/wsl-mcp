# WSL-MCP

[![npm version](https://badge.fury.io/js/wsl-mcp.svg)](https://www.npmjs.com/package/wsl-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub](https://img.shields.io/badge/GitHub-cacaview%2Fwsl--mcp-blue)](https://github.com/cacaview/wsl-mcp)

一个支持持久化会话和终端轮询的 MCP (Model Context Protocol) 终端管理服务器。

## 特性

- **WSL 原生支持** - 专门针对 Windows + WSL 环境优化
- **Docker 后端支持** - 支持容器化隔离环境
- **持久化会话** - 终端会话保持，环境变量和工作目录持久化
- **终端轮询** - 支持长时间运行进程的输出轮询（核心创新功能）
- **日志跟踪** - 类似 `tail -f` 的日志持续输出功能
- **文件传输** - 支持文件上传/下载（Base64 编码）
- **多后端支持** - 自动检测：WSL 优先 → Docker 备选

## 安装

### 使用 npx（推荐）

无需安装，直接使用 npx 运行：

```bash
npx wsl-mcp
```

### 在 MCP 客户端中配置

在 MCP 客户端（如 Claude Desktop、Kilo Code 等）配置中添加：

```json
{
  "mcpServers": {
    "wsl-mcp": {
      "command": "npx",
      "args": ["-y", "wsl-mcp"],
      "env": {
        "WSL_MCP_WSL_DISTRIBUTION": "Ubuntu"
      }
    }
  }
}
```

> **注意**: 使用 `-y` 标志可以自动确认 npx 的安装提示，适合自动化场景。

### 全局安装

```bash
npm install -g wsl-mcp
wsl-mcp
```

### 从源码安装

```bash
# 克隆仓库
git clone https://github.com/cacaview/wsl-mcp.git
cd wsl-mcp

# 安装依赖
npm install

# 构建
npm run build
```

## 使用方法

### 作为 MCP 服务器

在 MCP 客户端配置中添加：

```json
{
  "mcpServers": {
    "wsl": {
      "command": "node",
      "args": ["/path/to/wsl-mcp/dist/index.js"],
      "env": {
        "WSL_MCP_WSL_DISTRIBUTION": "Ubuntu"
      }
    }
  }
}
```

### 环境变量

| 变量名                       | 描述                        | 默认值     |
| ---------------------------- | --------------------------- | ---------- |
| `WSL_MCP_BACKEND`          | 后端类型 (wsl/docker/msys2) | `wsl`    |
| `WSL_MCP_WSL_DISTRIBUTION` | WSL 发行版名称              | 默认发行版 |
| `WSL_MCP_MAX_SESSIONS`     | 最大会话数                  | `10`     |
| `WSL_MCP_DEFAULT_TIMEOUT`  | 默认超时时间 (ms)           | `30000`  |

## MCP 工具

### 命令执行

#### `terminal_execute`

在持久化终端会话中执行命令。

```json
{
  "command": "ls -la",
  "session_id": "default",
  "timeout": 30000
}
```

### 后台进程管理

#### `terminal_start_process`

启动后台进程并开始轮询输出。

```json
{
  "command": "npm run dev",
  "session_id": "default",
  "poll_interval": 1000
}
```

#### `terminal_poll_output`

获取后台进程的输出。

```json
{
  "process_id": "xxx-xxx-xxx",
  "incremental": true
}
```

#### `terminal_stop_process`

停止后台进程。

#### `terminal_list_processes`

列出所有后台进程。

### 日志跟踪

#### `terminal_tail_logs`

开始跟踪日志文件。

```json
{
  "file_path": "/var/log/app.log",
  "lines": 100,
  "follow": true
}
```

#### `terminal_get_logs`

获取跟踪的日志内容。

#### `terminal_stop_tail`

停止日志跟踪。

### 会话管理

#### `terminal_new_session`

创建新的终端会话。

#### `terminal_list_sessions`

列出所有会话。

#### `terminal_close_session`

关闭会话。

### 文件传输

#### `terminal_upload_file`

上传文件到远程系统（Base64 编码）。

```json
{
  "remote_path": "/home/user/file.txt",
  "content": "SGVsbG8gV1NMLU1DUA==",
  "mode": "644",
  "overwrite": true
}
```

#### `terminal_download_file`

从远程系统下载文件（返回 Base64 编码）。

```json
{
  "remote_path": "/home/user/file.txt",
  "max_size": 10485760
}
```

#### `terminal_list_directory`

列出远程目录内容。

```json
{
  "path": "/home/user",
  "recursive": false
}
```

### 系统信息

#### `get_system_info`

获取系统信息（操作系统、Shell、用户等）。

#### `get_directory_info`

获取目录信息（路径、是否存在、文件列表）。

## 开发

```bash
# 开发模式
pnpm dev

# 运行测试
pnpm test

# 类型检查
pnpm typecheck

# 代码检查
pnpm lint
```

## 架构

```
src/
├── index.ts          # 入口文件
├── server.ts         # MCP 服务器
├── backends/         # 后端实现
│   ├── types.ts      # 类型定义
│   ├── wsl.ts        # WSL 后端
│   ├── docker.ts     # Docker 后端
│   └── index.ts      # 后端工厂
├── session/          # 会话管理
│   ├── types.ts
│   └── manager.ts
├── polling/          # 轮询机制
│   ├── types.ts
│   ├── output-poller.ts
│   └── log-tailer.ts
├── transfer/         # 文件传输
│   ├── types.ts
│   └── manager.ts
├── utils/            # 工具函数
│   ├── errors.ts
│   └── output.ts
└── tools/            # MCP 工具
    ├── definitions.ts
    └── handlers.ts
```

## 文档

- [架构设计](docs/architecture.md) - 详细的系统架构说明
- [测试报告](docs/test-report.md) - 完整的工具测试报告
- [市场调研](docs/market-research.md) - 类似项目对比分析

## 许可证

MIT
