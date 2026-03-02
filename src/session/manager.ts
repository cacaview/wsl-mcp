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
  CommandContext,
  CommandResult,
  SessionManagerConfig,
  SessionListItem,
} from './types';
import { Errors } from '../utils/errors';

/**
 * shell 安全引用（单引号）
 */
function shellQuote(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}' `;
}

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
      cwd: options?.cwd || '',  // 空字符串表示使用 WSL 默认目录（用户家目录）
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
   *
   * 使用 backend.execute()（spawn 方式）代替 PTY write，
   * 规避 Windows ConPTY + WSL 下 PTY stdin 无法传入 bash 的已知问题。
   * 通过特殊标记追踪命令执行后的新 cwd，保证 cd 命令跨调用生效。
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

    try {
      // 构建完整命令：如有 virtualCwd 则先 cd，然后执行用户命令，
      // 最后用 printf 输出当前目录供追踪
      const cwdMark = '__MCP_CWD_MARK__';
      const cwdPart = session.cwd ? `cd ${shellQuote(session.cwd)} 2>/dev/null && ` : '';
      const fullCommand = `${cwdPart}(${context.command}); printf '\\n${cwdMark}:%s\\n' "$(pwd)"`;

      const result = await session.backend.execute(fullCommand, {
        timeout,
        env: Object.keys(session.env).length > 0 ? session.env : undefined,
      });

      // 解析并剥离 cwd 标记，更新 session.cwd
      const cwdRegex = new RegExp(`\n${cwdMark}:(.+)\n?$`);
      const cwdMatch = result.stdout.match(cwdRegex);
      let output = result.stdout;
      if (cwdMatch) {
        session.cwd = cwdMatch[1].trim();
        output = result.stdout.slice(0, result.stdout.lastIndexOf(`\n${cwdMark}:`));
      }

      // stderr 不并入输出：用户可通过 command 2>&1 自行合并
      // wsl.exe 自身也会向 stderr 输出代理/Docker 警告，并不属于命令输出

      session.lastActivityAt = new Date();

      return {
        sessionId: session.id,
        command: context.command,
        output: output.trim(),
        exitCode: result.exitCode,
        success: (result.exitCode ?? 1) === 0,
        duration: Date.now() - startTime,
        timedOut: result.timedOut || false,
      };
    } catch (error: any) {
      return {
        sessionId: session.id,
        command: context.command,
        output: '',
        exitCode: 1,
        success: false,
        duration: Date.now() - startTime,
        timedOut: false,
        error: error.message,
      };
    } finally {
      session.status = 'ready';
    }
  }

  /**
   * 向会话发送原始输入（键盘模拟）
   */
  async sendInput(sessionId: string, rawInput: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      // 会话不存在时自动创建
      const newSession = await this.getOrCreateSession(sessionId);
      newSession.ptyProcess.write(rawInput);
      newSession.lastActivityAt = new Date();
      return;
    }

    if (session.status === 'closed') {
      throw Errors.sessionClosed(sessionId);
    }

    session.ptyProcess.write(rawInput);
    session.lastActivityAt = new Date();
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
