/**
 * 日志跟踪器
 * 
 * 实现类似 tail -f 的日志跟踪功能
 */

import { v4 as uuidv4 } from 'uuid';
import { SessionManager } from '../session';
import {
  TailOptions,
  LogEntry,
  LogTailState,
  PollingStatus,
} from './types';

/**
 * 默认日志跟踪配置
 */
const DEFAULT_TAIL_OPTIONS: Required<TailOptions> = {
  lines: 100,
  follow: true,
  timeout: 300000, // 5 minutes
};

/**
 * 日志跟踪器
 */
export class LogTailer {
  private tails: Map<string, LogTailState> = new Map();
  private sessionManager: SessionManager;

  constructor(sessionManager: SessionManager) {
    this.sessionManager = sessionManager;
  }

  /**
   * 开始跟踪日志文件
   * 
   * @param sessionId 会话 ID
   * @param filePath 日志文件路径
   * @param options 跟踪选项
   * @returns 跟踪 ID
   */
  async startTailing(
    sessionId: string,
    filePath: string,
    options?: TailOptions
  ): Promise<string> {
    const tailId = uuidv4();
    const config = { ...DEFAULT_TAIL_OPTIONS, ...options };

    // 获取会话
    const session = this.sessionManager.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    // 创建跟踪状态
    const tailState: LogTailState = {
      id: tailId,
      filePath,
      sessionId,
      status: 'running',
      readPosition: 0,
      createdAt: new Date(),
      lastUpdatedAt: new Date(),
    };

    this.tails.set(tailId, tailState);

    // 启动 tail 命令
    await this.startTailCommand(tailState, config);

    return tailId;
  }

  /**
   * 获取日志条目
   * 
   * @param tailId 跟踪 ID
   * @param since 起始时间（可选）
   * @returns 日志条目数组
   */
  async getLogs(tailId: string, since?: Date): Promise<LogEntry[]> {
    const tailState = this.tails.get(tailId);
    if (!tailState) {
      throw new Error(`Tail ${tailId} not found`);
    }

    // 获取会话
    const session = this.sessionManager.getSession(tailState.sessionId);
    if (!session) {
      throw new Error(`Session ${tailState.sessionId} not found`);
    }

    // 执行命令获取日志内容
    const result = await this.sessionManager.executeCommand({
      sessionId: tailState.sessionId,
      command: `cat "${tailState.filePath}"`,
      timeout: 10000,
    });

    if (!result.success) {
      tailState.status = 'error';
      tailState.error = result.error || 'Failed to read log file';
      return [];
    }

    // 解析日志
    const lines = result.output.split('\n');
    const entries: LogEntry[] = [];

    for (const line of lines) {
      if (line.trim()) {
        const entry = this.parseLogLine(line);
        if (!since || entry.timestamp >= since) {
          entries.push(entry);
        }
      }
    }

    tailState.lastUpdatedAt = new Date();
    return entries;
  }

  /**
   * 获取增量日志
   * 
   * @param tailId 跟踪 ID
   * @returns 日志条目数组
   */
  async getIncrementalLogs(tailId: string): Promise<LogEntry[]> {
    const tailState = this.tails.get(tailId);
    if (!tailState) {
      throw new Error(`Tail ${tailId} not found`);
    }

    // 获取会话
    const session = this.sessionManager.getSession(tailState.sessionId);
    if (!session) {
      throw new Error(`Session ${tailState.sessionId} not found`);
    }

    // 执行命令获取增量内容
    const result = await this.sessionManager.executeCommand({
      sessionId: tailState.sessionId,
      command: `tail -c +${tailState.readPosition + 1} "${tailState.filePath}"`,
      timeout: 10000,
    });

    if (!result.success) {
      tailState.status = 'error';
      tailState.error = result.error || 'Failed to read log file';
      return [];
    }

    // 更新读取位置
    const newSize = await this.getFileSize(tailState.sessionId, tailState.filePath);
    if (newSize !== null) {
      tailState.readPosition = newSize;
    }

    tailState.lastUpdatedAt = new Date();

    // 解析日志
    const lines = result.output.split('\n');
    const entries: LogEntry[] = [];

    for (const line of lines) {
      if (line.trim()) {
        entries.push(this.parseLogLine(line));
      }
    }

    return entries;
  }

  /**
   * 停止跟踪
   */
  async stopTailing(tailId: string): Promise<void> {
    const tailState = this.tails.get(tailId);
    if (!tailState) {
      return;
    }

    tailState.status = 'stopped';
    tailState.lastUpdatedAt = new Date();
  }

  /**
   * 获取所有活跃的跟踪
   */
  getActiveTails(): LogTailState[] {
    return Array.from(this.tails.values()).filter((t) => t.status === 'running');
  }

  /**
   * 清理已停止的跟踪
   */
  cleanupStopped(): number {
    let cleaned = 0;
    for (const [id, tail] of this.tails) {
      if (tail.status === 'stopped' || tail.status === 'error') {
        this.tails.delete(id);
        cleaned++;
      }
    }
    return cleaned;
  }

  /**
   * 启动 tail 命令
   */
  private async startTailCommand(tailState: LogTailState, config: Required<TailOptions>): Promise<void> {
    // 获取文件初始大小
    const fileSize = await this.getFileSize(tailState.sessionId, tailState.filePath);
    if (fileSize !== null) {
      tailState.readPosition = fileSize;
    }

    // 如果需要显示初始行数
    if (config.lines > 0) {
      const result = await this.sessionManager.executeCommand({
        sessionId: tailState.sessionId,
        command: `tail -n ${config.lines} "${tailState.filePath}"`,
        timeout: 10000,
      });

      if (!result.success) {
        tailState.status = 'error';
        tailState.error = result.error || 'Failed to read initial log lines';
      }
    }
  }

  /**
   * 获取文件大小
   */
  private async getFileSize(sessionId: string, filePath: string): Promise<number | null> {
    const result = await this.sessionManager.executeCommand({
      sessionId,
      command: `stat -c %s "${filePath}" 2>/dev/null || wc -c < "${filePath}"`,
      timeout: 5000,
    });

    if (result.success) {
      return parseInt(result.output.trim(), 10);
    }
    return null;
  }

  /**
   * 解析日志行
   */
  private parseLogLine(line: string): LogEntry {
    // 尝试解析常见日志格式
    // 格式1: ISO 时间戳
    const isoMatch = line.match(/^(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)\s*(.*)$/);
    if (isoMatch) {
      return {
        timestamp: new Date(isoMatch[1]),
        content: isoMatch[2],
        level: this.detectLogLevel(isoMatch[2]),
      };
    }

    // 格式2: 常见日志格式 [LEVEL] message
    const levelMatch = line.match(/^\[(\w+)\]\s*(.*)$/);
    if (levelMatch) {
      return {
        timestamp: new Date(),
        content: levelMatch[2],
        level: levelMatch[1].toLowerCase() as any,
      };
    }

    // 默认格式
    return {
      timestamp: new Date(),
      content: line,
      level: this.detectLogLevel(line),
    };
  }

  /**
   * 检测日志级别
   */
  private detectLogLevel(content: string): 'info' | 'warn' | 'error' | 'debug' {
    const lowerContent = content.toLowerCase();
    
    if (lowerContent.includes('error') || lowerContent.includes('err') || lowerContent.includes('fatal')) {
      return 'error';
    }
    if (lowerContent.includes('warn') || lowerContent.includes('warning')) {
      return 'warn';
    }
    if (lowerContent.includes('debug') || lowerContent.includes('trace')) {
      return 'debug';
    }
    return 'info';
  }
}

/**
 * 创建日志跟踪器
 */
export function createLogTailer(sessionManager: SessionManager): LogTailer {
  return new LogTailer(sessionManager);
}
