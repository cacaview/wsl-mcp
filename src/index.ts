#!/usr/bin/env node

/**
 * WSL-MCP 入口文件
 * 
 * MCP 服务器，提供 WSL 终端管理功能
 */

import { createServer } from './server';

// 从环境变量读取配置
const config = {
  backendType: process.env.WSL_MCP_BACKEND as 'wsl' | 'docker' | 'msys2' | undefined,
  wslDistribution: process.env.WSL_MCP_WSL_DISTRIBUTION,
  maxSessions: process.env.WSL_MCP_MAX_SESSIONS
    ? parseInt(process.env.WSL_MCP_MAX_SESSIONS, 10)
    : undefined,
  defaultTimeout: process.env.WSL_MCP_DEFAULT_TIMEOUT
    ? parseInt(process.env.WSL_MCP_DEFAULT_TIMEOUT, 10)
    : undefined,
};

// 创建并启动服务器
const server = createServer(config);

server.start().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});

// 处理关闭信号
process.on('SIGINT', async () => {
  await server.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await server.stop();
  process.exit(0);
});
