/**
 * 轮询类型定义
 */

/**
 * 轮询状态
 */
export type PollingStatus = 'running' | 'paused' | 'completed' | 'error' | 'stopped';

/**
 * 轮询选项
 */
export interface PollingOptions {
  /** 轮询间隔（毫秒） */
  interval?: number;
  /** 最大轮询次数 */
  maxPolls?: number;
  /** 是否增量输出 */
  incremental?: boolean;
  /** 超时时间（毫秒） */
  timeout?: number;
  /** 缓冲区最大长度 */
  maxBufferSize?: number;
}

/**
 * 轮询结果
 */
export interface PollResult {
  /** 进程 ID */
  processId: string;
  /** 会话 ID */
  sessionId: string;
  /** 输出内容 */
  output: string;
  /** 是否有新内容 */
  hasNewContent: boolean;
  /** 是否已完成 */
  isComplete: boolean;
  /** 退出码（如果已完成） */
  exitCode?: number;
  /** 时间戳 */
  timestamp: Date;
  /** 状态 */
  status: PollingStatus;
  /** 错误信息 */
  error?: string;
}

/**
 * 后台进程信息
 */
export interface BackgroundProcess {
  /** 进程 ID */
  id: string;
  /** 会话 ID */
  sessionId: string;
  /** 命令 */
  command: string;
  /** 状态 */
  status: PollingStatus;
  /** 输出缓冲区 */
  outputBuffer: string;
  /** 已读取位置 */
  readPosition: number;
  /** 创建时间 */
  createdAt: Date;
  /** 最后更新时间 */
  lastUpdatedAt: Date;
  /** 退出码 */
  exitCode?: number;
  /** 错误信息 */
  error?: string;
  /** 轮询间隔 */
  interval: number;
}

/**
 * 日志跟踪选项
 */
export interface TailOptions {
  /** 初始显示行数 */
  lines?: number;
  /** 是否持续跟踪 */
  follow?: boolean;
  /** 超时时间 */
  timeout?: number;
}

/**
 * 日志条目
 */
export interface LogEntry {
  /** 时间戳 */
  timestamp: Date;
  /** 内容 */
  content: string;
  /** 日志级别 */
  level?: 'info' | 'warn' | 'error' | 'debug';
}

/**
 * 日志跟踪状态
 */
export interface LogTailState {
  /** 跟踪 ID */
  id: string;
  /** 文件路径 */
  filePath: string;
  /** 会话 ID */
  sessionId: string;
  /** 状态 */
  status: PollingStatus;
  /** 已读取位置 */
  readPosition: number;
  /** 创建时间 */
  createdAt: Date;
  /** 最后更新时间 */
  lastUpdatedAt: Date;
  /** 错误信息 */
  error?: string;
}

/**
 * 进程列表项
 */
export interface ProcessListItem {
  /** 进程 ID */
  id: string;
  /** 会话 ID */
  sessionId: string;
  /** 命令 */
  command: string;
  /** 状态 */
  status: PollingStatus;
  /** 创建时间 */
  createdAt: Date;
  /** 最后更新时间 */
  lastUpdatedAt: Date;
  /** 输出长度 */
  outputLength: number;
}
