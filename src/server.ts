/**
 * MCP 服务器
 *
 * 实现 Model Context Protocol 服务器
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { createBackend, Backend } from './backends';
import { SessionManager, createSessionManager } from './session';
import { OutputPoller, LogTailer, createOutputPoller, createLogTailer } from './polling';
import { FileTransferManager, createFileTransferManager } from './transfer';
import { TOOL_DEFINITIONS, ToolName, createToolHandlers } from './tools';

/**
 * 服务器配置
 */
export interface ServerConfig {
  /** 后端类型 */
  backendType?: 'wsl' | 'docker' | 'msys2';
  /** WSL 发行版 */
  wslDistribution?: string;
  /** 最大会话数 */
  maxSessions?: number;
  /** 默认超时 */
  defaultTimeout?: number;
}

/**
 * WSL-MCP 服务器
 */
export class WslMcpServer {
  private server: Server;
  private backend: Backend | null = null;
  private sessionManager: SessionManager | null = null;
  private outputPoller: OutputPoller | null = null;
  private logTailer: LogTailer | null = null;
  private fileTransferManager: FileTransferManager | null = null;
  private config: ServerConfig;

  constructor(config: ServerConfig = {}) {
    this.config = config;

    // 创建 MCP 服务器实例
    this.server = new Server(
      {
        name: 'wsl-mcp',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // 设置请求处理器
    this.setupHandlers();
  }

  /**
   * 启动服务器
   */
  async start(): Promise<void> {
    // 初始化后端
    this.backend = await createBackend({
      type: this.config.backendType || 'wsl',
      wsl: {
        distribution: this.config.wslDistribution,
      },
    });

    // 检查后端是否可用
    const isAvailable = await this.backend.isAvailable();
    if (!isAvailable) {
      throw new Error('Backend is not available. Please ensure WSL is installed and running.');
    }

    // 初始化会话管理器
    this.sessionManager = createSessionManager(this.backend, {
      maxSessions: this.config.maxSessions,
      defaultTimeout: this.config.defaultTimeout,
    });

    // 初始化轮询器
    this.outputPoller = createOutputPoller(this.sessionManager);
    this.logTailer = createLogTailer(this.sessionManager);

    // 初始化文件传输管理器
    this.fileTransferManager = createFileTransferManager(this.sessionManager);

    // 连接传输层
    const transport = new StdioServerTransport();
    await this.server.connect(transport);

    console.error('WSL-MCP server started');
  }

  /**
   * 停止服务器
   */
  async stop(): Promise<void> {
    // 关闭所有会话
    if (this.sessionManager) {
      await this.sessionManager.closeAllSessions();
    }

    console.error('WSL-MCP server stopped');
  }

  /**
   * 设置请求处理器
   */
  private setupHandlers(): void {
    // 列出工具
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: Object.values(TOOL_DEFINITIONS).map((def) => ({
          name: def.name,
          description: def.description,
          inputSchema: def.inputSchema,
        })),
      };
    });

    // 调用工具
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      if (!this.backend || !this.sessionManager || !this.outputPoller || !this.logTailer || !this.fileTransferManager) {
        throw new Error('Server not initialized');
      }

      const handlers = createToolHandlers({
        backend: this.backend,
        sessionManager: this.sessionManager,
        outputPoller: this.outputPoller,
        logTailer: this.logTailer,
        fileTransferManager: this.fileTransferManager,
      });

      return await handlers.handleToolCall(name as ToolName, args || {});
    });
  }
}

/**
 * 创建服务器实例
 */
export function createServer(config?: ServerConfig): WslMcpServer {
  return new WslMcpServer(config);
}
