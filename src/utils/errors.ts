/**
 * 错误处理工具
 * 
 * 提供统一的错误处理和错误类型定义
 */

/**
 * 错误代码枚举
 */
export enum ErrorCode {
  // 会话相关错误
  SESSION_NOT_FOUND = 'SESSION_NOT_FOUND',
  SESSION_ALREADY_EXISTS = 'SESSION_ALREADY_EXISTS',
  SESSION_BUSY = 'SESSION_BUSY',
  SESSION_CLOSED = 'SESSION_CLOSED',
  MAX_SESSIONS_REACHED = 'MAX_SESSIONS_REACHED',
  SESSION_CREATE_FAILED = 'SESSION_CREATE_FAILED',

  // 命令相关错误
  COMMAND_TIMEOUT = 'COMMAND_TIMEOUT',
  COMMAND_FAILED = 'COMMAND_FAILED',
  COMMAND_EMPTY = 'COMMAND_EMPTY',

  // 进程相关错误
  PROCESS_NOT_FOUND = 'PROCESS_NOT_FOUND',
  PROCESS_ALREADY_RUNNING = 'PROCESS_ALREADY_RUNNING',
  PROCESS_START_FAILED = 'PROCESS_START_FAILED',

  // 文件相关错误
  FILE_NOT_FOUND = 'FILE_NOT_FOUND',
  FILE_READ_ERROR = 'FILE_READ_ERROR',
  FILE_WRITE_ERROR = 'FILE_WRITE_ERROR',

  // 后端相关错误
  BACKEND_NOT_AVAILABLE = 'BACKEND_NOT_AVAILABLE',
  BACKEND_ERROR = 'BACKEND_ERROR',
  WSL_NOT_AVAILABLE = 'WSL_NOT_AVAILABLE',
  DOCKER_NOT_AVAILABLE = 'DOCKER_NOT_AVAILABLE',

  // 通用错误
  INVALID_PARAMETER = 'INVALID_PARAMETER',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

/**
 * 终端错误类
 */
export class TerminalError extends Error {
  public readonly code: ErrorCode;
  public readonly details?: Record<string, unknown>;

  constructor(code: ErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'TerminalError';
    this.code = code;
    this.details = details;
  }

  /**
   * 转换为 JSON 格式
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      details: this.details,
    };
  }
}

/**
 * 创建错误工厂函数
 */
export const Errors = {
  sessionNotFound: (sessionId: string) =>
    new TerminalError(
      ErrorCode.SESSION_NOT_FOUND,
      `Session not found: ${sessionId}`,
      { sessionId }
    ),

  sessionAlreadyExists: (sessionId: string) =>
    new TerminalError(
      ErrorCode.SESSION_ALREADY_EXISTS,
      `Session already exists: ${sessionId}`,
      { sessionId }
    ),

  sessionBusy: (sessionId: string) =>
    new TerminalError(
      ErrorCode.SESSION_BUSY,
      `Session is busy: ${sessionId}`,
      { sessionId }
    ),

  sessionClosed: (sessionId: string) =>
    new TerminalError(
      ErrorCode.SESSION_CLOSED,
      `Session is closed: ${sessionId}`,
      { sessionId }
    ),

  maxSessionsReached: (maxSessions: number) =>
    new TerminalError(
      ErrorCode.MAX_SESSIONS_REACHED,
      `Maximum number of sessions reached: ${maxSessions}`,
      { maxSessions }
    ),

  sessionCreateFailed: (reason: string, error?: Error) =>
    new TerminalError(
      ErrorCode.SESSION_CREATE_FAILED,
      `Failed to create session: ${reason}`,
      { reason, originalError: error?.message }
    ),

  commandTimeout: (command: string, timeout: number) =>
    new TerminalError(
      ErrorCode.COMMAND_TIMEOUT,
      `Command timed out after ${timeout}ms: ${command}`,
      { command, timeout }
    ),

  commandFailed: (command: string, exitCode: number, output?: string) =>
    new TerminalError(
      ErrorCode.COMMAND_FAILED,
      `Command failed with exit code ${exitCode}: ${command}`,
      { command, exitCode, output }
    ),

  commandEmpty: () =>
    new TerminalError(
      ErrorCode.COMMAND_EMPTY,
      'Command cannot be empty',
      {}
    ),

  processNotFound: (processId: string) =>
    new TerminalError(
      ErrorCode.PROCESS_NOT_FOUND,
      `Process not found: ${processId}`,
      { processId }
    ),

  processAlreadyRunning: (processId: string) =>
    new TerminalError(
      ErrorCode.PROCESS_ALREADY_RUNNING,
      `Process is already running: ${processId}`,
      { processId }
    ),

  processStartFailed: (command: string, reason: string) =>
    new TerminalError(
      ErrorCode.PROCESS_START_FAILED,
      `Failed to start process: ${reason}`,
      { command, reason }
    ),

  fileNotFound: (path: string) =>
    new TerminalError(
      ErrorCode.FILE_NOT_FOUND,
      `File not found: ${path}`,
      { path }
    ),

  fileReadError: (path: string, reason: string) =>
    new TerminalError(
      ErrorCode.FILE_READ_ERROR,
      `Failed to read file: ${reason}`,
      { path, reason }
    ),

  fileWriteError: (path: string, reason: string) =>
    new TerminalError(
      ErrorCode.FILE_WRITE_ERROR,
      `Failed to write file: ${reason}`,
      { path, reason }
    ),

  backendNotAvailable: (backendName: string) =>
    new TerminalError(
      ErrorCode.BACKEND_NOT_AVAILABLE,
      `Backend not available: ${backendName}`,
      { backendName }
    ),

  backendError: (backendName: string, reason: string) =>
    new TerminalError(
      ErrorCode.BACKEND_ERROR,
      `Backend error: ${reason}`,
      { backendName, reason }
    ),

  wslNotAvailable: () =>
    new TerminalError(
      ErrorCode.WSL_NOT_AVAILABLE,
      'WSL is not available on this system',
      {}
    ),

  dockerNotAvailable: () =>
    new TerminalError(
      ErrorCode.DOCKER_NOT_AVAILABLE,
      'Docker is not available on this system',
      {}
    ),

  invalidParameter: (paramName: string, reason: string) =>
    new TerminalError(
      ErrorCode.INVALID_PARAMETER,
      `Invalid parameter '${paramName}': ${reason}`,
      { paramName, reason }
    ),

  internalError: (message: string, error?: Error) =>
    new TerminalError(
      ErrorCode.INTERNAL_ERROR,
      message,
      { originalError: error?.message, stack: error?.stack }
    ),

  unknownError: (error: unknown) =>
    new TerminalError(
      ErrorCode.UNKNOWN_ERROR,
      `Unknown error: ${error instanceof Error ? error.message : String(error)}`,
      { originalError: error instanceof Error ? error.message : String(error) }
    ),
};

/**
 * 错误处理装饰器
 */
export function withErrorHandling<T extends (...args: unknown[]) => Promise<unknown>>(
  fn: T,
  errorHandler?: (error: unknown) => TerminalError
): T {
  return (async (...args: Parameters<T>) => {
    try {
      return await fn(...args);
    } catch (error) {
      if (error instanceof TerminalError) {
        throw error;
      }
      throw errorHandler ? errorHandler(error) : Errors.unknownError(error);
    }
  }) as T;
}

/**
 * 重试配置
 */
export interface RetryConfig {
  maxRetries: number;
  delay: number;
  backoff?: boolean;
  retryOn?: ErrorCode[];
}

/**
 * 带重试的执行函数
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config: RetryConfig
): Promise<T> {
  let lastError: TerminalError | null = null;
  let delay = config.delay;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof TerminalError) {
        // 检查是否应该重试
        if (config.retryOn && !config.retryOn.includes(error.code)) {
          throw error;
        }
        lastError = error;
      } else {
        lastError = Errors.unknownError(error);
      }

      // 最后一次尝试不等待
      if (attempt < config.maxRetries) {
        await sleep(delay);
        if (config.backoff) {
          delay *= 2;
        }
      }
    }
  }

  throw lastError;
}

/**
 * 延迟函数
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 安全执行函数，返回结果或错误
 */
export async function safeExecute<T>(
  fn: () => Promise<T>
): Promise<{ success: true; data: T } | { success: false; error: TerminalError }> {
  try {
    const data = await fn();
    return { success: true, data };
  } catch (error) {
    if (error instanceof TerminalError) {
      return { success: false, error };
    }
    return { success: false, error: Errors.unknownError(error) };
  }
}
