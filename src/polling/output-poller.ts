/**
 * 输出轮询器
 * 
 * 核心创新功能：支持长时间运行进程的输出轮询
 */

import { v4 as uuidv4 } from 'uuid';
import { SessionManager } from '../session';
import {
  PollingOptions,
  PollResult,
  BackgroundProcess,
  PollingStatus,
  ProcessListItem,
} from './types';

/**
 * 默认轮询配置
 */
const DEFAULT_OPTIONS: Required<Omit<PollingOptions, 'timeout'>> & { timeout: number } = {
  interval: 1000,
  maxPolls: Infinity,
  incremental: true,
  timeout: 300000, // 5 minutes
  maxBufferSize: 10 * 1024 * 1024, // 10MB
};

/**
 * 输出轮询器
 */
export class OutputPoller {
  private processes: Map<string, BackgroundProcess> = new Map();
  private sessionManager: SessionManager;

  constructor(sessionManager: SessionManager) {
    this.sessionManager = sessionManager;
  }

  /**
   * 启动后台进程并开始轮询
   * 
   * @param sessionId 会话 ID
   * @param command 要执行的命令
   * @param options 轮询选项
   * @returns 进程 ID
   */
  async startProcess(
    sessionId: string,
    command: string,
    options?: PollingOptions
  ): Promise<string> {
    const processId = uuidv4();
    const config = { ...DEFAULT_OPTIONS, ...options };

    // 获取会话
    const session = this.sessionManager.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    // 创建进程记录
    const process: BackgroundProcess = {
      id: processId,
      sessionId,
      command,
      status: 'running',
      outputBuffer: '',
      readPosition: 0,
      createdAt: new Date(),
      lastUpdatedAt: new Date(),
      interval: config.interval,
    };

    this.processes.set(processId, process);

    // 启动命令执行（不等待完成）
    this.executeBackgroundCommand(process, config).catch((error) => {
      process.status = 'error';
      process.error = error.message;
      process.lastUpdatedAt = new Date();
    });

    return processId;
  }

  /**
   * 获取轮询输出
   * 
   * @param processId 进程 ID
   * @param incremental 是否增量输出
   * @returns 轮询结果
   */
  async poll(processId: string, incremental: boolean = true): Promise<PollResult> {
    const process = this.processes.get(processId);
    if (!process) {
      throw new Error(`Process ${processId} not found`);
    }

    const now = new Date();
    let output: string;
    let hasNewContent = false;

    if (incremental) {
      // 增量输出：只返回上次读取后的新内容
      output = process.outputBuffer.slice(process.readPosition);
      hasNewContent = output.length > 0;
      process.readPosition = process.outputBuffer.length;
    } else {
      // 完整输出
      output = process.outputBuffer;
      hasNewContent = process.outputBuffer.length > process.readPosition;
      process.readPosition = process.outputBuffer.length;
    }

    process.lastUpdatedAt = now;

    return {
      processId: process.id,
      sessionId: process.sessionId,
      output,
      hasNewContent,
      isComplete: process.status === 'completed' || process.status === 'error',
      exitCode: process.exitCode,
      timestamp: now,
      status: process.status,
      error: process.error,
    };
  }

  /**
   * 停止后台进程
   */
  async stopProcess(processId: string): Promise<void> {
    const process = this.processes.get(processId);
    if (!process) {
      return;
    }

    // 发送中断信号
    const session = this.sessionManager.getSession(process.sessionId);
    if (session) {
      session.ptyProcess.write('\x03'); // Ctrl+C
    }

    process.status = 'stopped';
    process.lastUpdatedAt = new Date();
  }

  /**
   * 获取所有活跃的进程
   */
  getActiveProcesses(): ProcessListItem[] {
    return Array.from(this.processes.values())
      .filter((p) => p.status === 'running')
      .map((p) => ({
        id: p.id,
        sessionId: p.sessionId,
        command: p.command,
        status: p.status,
        createdAt: p.createdAt,
        lastUpdatedAt: p.lastUpdatedAt,
        outputLength: p.outputBuffer.length,
      }));
  }

  /**
   * 获取所有进程
   */
  getAllProcesses(): ProcessListItem[] {
    return Array.from(this.processes.values()).map((p) => ({
      id: p.id,
      sessionId: p.sessionId,
      command: p.command,
      status: p.status,
      createdAt: p.createdAt,
      lastUpdatedAt: p.lastUpdatedAt,
      outputLength: p.outputBuffer.length,
    }));
  }

  /**
   * 清理已完成的进程
   */
  cleanupCompleted(): number {
    let cleaned = 0;
    for (const [id, process] of this.processes) {
      if (process.status === 'completed' || process.status === 'error' || process.status === 'stopped') {
        this.processes.delete(id);
        cleaned++;
      }
    }
    return cleaned;
  }

  /**
   * 执行后台命令
   */
  private async executeBackgroundCommand(
    process: BackgroundProcess,
    config: Required<PollingOptions>
  ): Promise<void> {
    const session = this.sessionManager.getSession(process.sessionId);
    if (!session) {
      throw new Error(`Session ${process.sessionId} not found`);
    }

    // 监听输出
    const outputListener = (data: string) => {
      process.outputBuffer += data;
      process.lastUpdatedAt = new Date();

      // 限制缓冲区大小
      if (process.outputBuffer.length > config.maxBufferSize) {
        const excess = process.outputBuffer.length - config.maxBufferSize;
        process.outputBuffer = process.outputBuffer.slice(excess);
        process.readPosition = Math.max(0, process.readPosition - excess);
      }
    };

    session.ptyProcess.onData(outputListener);

    try {
      // 执行命令
      const result = await this.sessionManager.executeCommand({
        sessionId: process.sessionId,
        command: process.command,
        timeout: config.timeout,
      });

      process.exitCode = result.exitCode;
      process.status = result.success ? 'completed' : 'error';
      process.error = result.error;
    } catch (error: any) {
      process.status = 'error';
      process.error = error.message;
    } finally {
      session.ptyProcess.removeListener('data', outputListener);
      process.lastUpdatedAt = new Date();
    }
  }
}

/**
 * 创建输出轮询器
 */
export function createOutputPoller(sessionManager: SessionManager): OutputPoller {
  return new OutputPoller(sessionManager);
}
