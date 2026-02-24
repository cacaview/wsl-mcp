/**
 * 会话管理器
 *
 * 管理终端会话的创建、执行、关闭等操作
 * 参考 mcp-shellkeeper 的实现
 */

import { v4 as uuidv4 } from 'uuid';
import type { IPty } from 'node-pty';
import { Backend } from '../backends';
import {
  TerminalSession,
  SessionOptions,
  SessionStatus,
  CommandContext,
  CommandResult,
  SessionManagerConfig,
  SessionListItem,
} from './types';
import { cleanOutput, cleanMarkers, cleanCommandEcho, cleanPrompt } from '../utils/output';
import { Errors, TerminalError, ErrorCode } from '../utils/errors';

/**
 * 默认配置
 */
const DEFAULT_CONFIG: Required<SessionManagerConfig> = {
  maxSessions: 10,
  defaultTimeout: 30000,
  sessionExpiry: 3600000, // 1 hour
  maxBufferSize: 1024 * 1024, // 1MB
  markerPrefix: '__WSL_MCP_MARKER__',
};

/**
 * 延迟函数
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 会话管理器
 */
export class SessionManager {
  private sessions: Map<string, TerminalSession> = new Map();
  private config: Required<SessionManagerConfig>;
  private backend: Backend;

  constructor(backend: Backend, config?: SessionManagerConfig) {
    this.backend = backend;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 创建新会话
   */
  async createSession(options?: SessionOptions): Promise<TerminalSession> {
    // 检查最大会话数
    if (this.sessions.size >= this.config.maxSessions) {
      throw Errors.maxSessionsReached(this.config.maxSessions);
    }

    const sessionId = options?.id || uuidv4();
    
    // 检查会话是否已存在
    if (this.sessions.has(sessionId)) {
      throw Errors.sessionAlreadyExists(sessionId);
    }

    let ptyProcess: IPty;
    try {
      // 创建 PTY
      ptyProcess = await this.backend.createPty({
        shell: options?.shell || this.backend.getDefaultShell(),
        cwd: options?.cwd || this.backend.getDefaultCwd(),
        env: options?.env,
        cols: options?.cols || 160,
        rows: options?.rows || 40,
      });
    } catch (error) {
      throw Errors.sessionCreateFailed(
        error instanceof Error ? error.message : 'Unknown error',
        error instanceof Error ? error : undefined
      );
    }

    // 创建会话对象
    const session: TerminalSession = {
      id: sessionId,
      name: options?.name || `session-${sessionId.slice(0, 8)}`,
      backend: this.backend,
      ptyProcess,
      outputBuffer: '',
      maxBufferSize: this.config.maxBufferSize,
      status: 'initializing',
      lastCommand: '',
      createdAt: new Date(),
      lastActivityAt: new Date(),
      cwd: options?.cwd || this.backend.getDefaultCwd(),
      env: options?.env || {},
    };

    // 监听输出
    ptyProcess.onData((data) => {
      this.handleOutput(session, data);
    });

    // 监听退出
    ptyProcess.onExit(({ exitCode }) => {
      this.handleExit(session, exitCode);
    });

    // 等待会话就绪
    await sleep(500);
    session.status = 'ready';

    // 保存会话
    this.sessions.set(sessionId, session);

    return session;
  }

  /**
   * 获取会话
   */
  getSession(id: string): TerminalSession | undefined {
    return this.sessions.get(id);
  }

  /**
   * 获取或创建会话
   */
  async getOrCreateSession(id: string = 'default', options?: SessionOptions): Promise<TerminalSession> {
    let session = this.sessions.get(id);
    if (!session) {
      session = await this.createSession({ ...options, id });
    }
    return session;
  }

  /**
   * 列出所有会话
   */
  listSessions(): SessionListItem[] {
    return Array.from(this.sessions.values()).map((session) => ({
      id: session.id,
      name: session.name,
      status: session.status,
      createdAt: session.createdAt,
      lastActivityAt: session.lastActivityAt,
      cwd: session.cwd,
      lastCommand: session.lastCommand,
    }));
  }

  /**
   * 关闭会话
   */
  async closeSession(id: string): Promise<void> {
    const session = this.sessions.get(id);
    if (!session) {
      return;
    }

    try {
      session.ptyProcess.kill();
    } catch (error) {
      // 忽略关闭错误
    }

    session.status = 'closed';
    this.sessions.delete(id);
  }

  /**
   * 关闭所有会话
   */
  async closeAllSessions(): Promise<void> {
    const closePromises = Array.from(this.sessions.keys()).map((id) => this.closeSession(id));
    await Promise.all(closePromises);
  }

  /**
   * 在会话中执行命令
   * 参考 mcp-shellkeeper 的实现方式
   */
  async executeCommand(context: CommandContext): Promise<CommandResult> {
    // 验证命令
    if (!context.command || context.command.trim() === '') {
      throw Errors.commandEmpty();
    }

    const session = await this.getOrCreateSession(context.sessionId);
    
    if (session.status === 'busy') {
      throw Errors.sessionBusy(context.sessionId || 'default');
    }

    if (session.status === 'closed') {
      throw Errors.sessionClosed(context.sessionId || 'default');
    }

    session.status = 'busy';
    session.lastCommand = context.command;
    session.lastActivityAt = new Date();

    const startTime = Date.now();
    const timeout = context.timeout || this.config.defaultTimeout;

    // 清空输出缓冲区
    session.outputBuffer = '';

    // 等待一下确保缓冲区清空
    await sleep(100);

    // 生成唯一标记
    const timestamp = Date.now();
    const startMarker = `===START${timestamp}===`;
    const endMarker = `===END${timestamp}===`;
    const exitMarker = `===EXIT${timestamp}===`;

    // 发送命令和标记
    session.ptyProcess.write(`echo '${startMarker}'\n`);
    await sleep(50);
    session.ptyProcess.write(`${context.command}\n`);
    await sleep(50);
    session.ptyProcess.write(`echo '${exitMarker}'$?\n`);
    await sleep(50);
    session.ptyProcess.write(`echo '${endMarker}'\n`);

    // 等待命令完成
    const startTimeWait = Date.now();
    let foundEnd = false;

    while (Date.now() - startTimeWait < timeout) {
      const output = session.outputBuffer;

      if (output.includes(endMarker)) {
        await sleep(200);  // 等待更多输出
        foundEnd = true;
        break;
      }

      await sleep(100);
    }

    if (!foundEnd) {
      session.status = 'ready';
      return {
        sessionId: session.id,
        command: context.command,
        output: '',
        exitCode: null,
        success: false,
        duration: Date.now() - startTime,
        timedOut: true,
        error: `Command timeout after ${timeout}ms`,
      };
    }

    session.status = 'ready';

    const output = session.outputBuffer;

    // 解析输出
    const startIdx = output.lastIndexOf(startMarker);
    const endIdx = output.lastIndexOf(endMarker);

    if (startIdx === -1 || endIdx === -1 || startIdx >= endIdx) {
      return {
        sessionId: session.id,
        command: context.command,
        output: cleanOutput(output),
        exitCode: 0,
        success: true,
        duration: Date.now() - startTime,
        timedOut: false,
      };
    }

    // 提取退出码
    let exitCode = 0;
    const exitMarkerPattern = new RegExp(`${exitMarker}(\\d+)`);
    const exitMatch = output.match(exitMarkerPattern);
    if (exitMatch) {
      exitCode = parseInt(exitMatch[1], 10);
    }

    // 提取实际输出
    let result = output.substring(startIdx + startMarker.length, endIdx);

    // 使用工具函数清理输出
    // 1. 先清理 ANSI 转义序列
    result = cleanOutput(result);
    
    // 2. 清理标记行
    result = cleanMarkers(result, { startMarker, endMarker, exitMarker });
    
    // 3. 清理命令回显
    result = cleanCommandEcho(result, context.command);
    
    // 4. 清理 shell 提示符
    result = cleanPrompt(result);

    return {
      sessionId: session.id,
      command: context.command,
      output: result,
      exitCode,
      success: exitCode === 0,
      duration: Date.now() - startTime,
      timedOut: false,
    };
  }

  /**
   * 处理输出
   */
  private handleOutput(session: TerminalSession, data: string): void {
    session.outputBuffer += data;
    session.lastActivityAt = new Date();

    // 限制缓冲区大小
    if (session.outputBuffer.length > session.maxBufferSize) {
      session.outputBuffer = session.outputBuffer.slice(-session.maxBufferSize);
    }
  }

  /**
   * 处理退出
   */
  private handleExit(session: TerminalSession, exitCode: number): void {
    session.status = 'closed';
    session.error = `Process exited with code ${exitCode}`;
    this.sessions.delete(session.id);
  }
}

/**
 * 创建会话管理器
 */
export function createSessionManager(backend: Backend, config?: SessionManagerConfig): SessionManager {
  return new SessionManager(backend, config);
}
