/**
 * 会话类型定义
 */

import type { IPty } from 'node-pty';
import type { Backend } from '../backends';

/**
 * 会话状态
 */
export type SessionStatus = 'initializing' | 'ready' | 'busy' | 'error' | 'closed';

/**
 * 会话选项
 */
export interface SessionOptions {
  /** 会话 ID */
  id?: string;
  /** 工作目录 */
  cwd?: string;
  /** 环境变量 */
  env?: Record<string, string>;
  /** Shell 路径 */
  shell?: string;
  /** 终端列数 */
  cols?: number;
  /** 终端行数 */
  rows?: number;
  /** 会话名称 */
  name?: string;
}

/**
 * 终端会话
 */
export interface TerminalSession {
  /** 会话 ID */
  id: string;
  /** 会话名称 */
  name: string;
  /** 后端实例 */
  backend: Backend;
  /** PTY 进程 */
  ptyProcess: IPty;
  /** 输出缓冲区 */
  outputBuffer: string;
  /** 输出缓冲区最大长度 */
  maxBufferSize: number;
  /** 当前状态 */
  status: SessionStatus;
  /** 最后执行的命令 */
  lastCommand: string;
  /** 创建时间 */
  createdAt: Date;
  /** 最后活动时间 */
  lastActivityAt: Date;
  /** 当前工作目录 */
  cwd: string;
  /** 环境变量 */
  env: Record<string, string>;
  /** 错误信息 */
  error?: string;
}

/**
 * 命令执行上下文
 */
export interface CommandContext {
  /** 会话 ID */
  sessionId: string;
  /** 命令 */
  command: string;
  /** 超时时间 */
  timeout?: number;
  /** 工作目录 */
  cwd?: string;
  /** 环境变量 */
  env?: Record<string, string>;
}

/**
 * 命令执行结果
 */
export interface CommandResult {
  /** 会话 ID */
  sessionId: string;
  /** 命令 */
  command: string;
  /** 输出内容 */
  output: string;
  /** 退出码 */
  exitCode: number | null;
  /** 是否成功 */
  success: boolean;
  /** 执行时长（毫秒） */
  duration: number;
  /** 是否超时 */
  timedOut: boolean;
  /** 错误信息 */
  error?: string;
}

/**
 * 会话管理器配置
 */
export interface SessionManagerConfig {
  /** 最大会话数 */
  maxSessions?: number;
  /** 默认超时时间（毫秒） */
  defaultTimeout?: number;
  /** 会话过期时间（毫秒） */
  sessionExpiry?: number;
  /** 输出缓冲区最大长度 */
  maxBufferSize?: number;
  /** 命令完成标记前缀 */
  markerPrefix?: string;
}

/**
 * 会话列表项
 */
export interface SessionListItem {
  /** 会话 ID */
  id: string;
  /** 会话名称 */
  name: string;
  /** 状态 */
  status: SessionStatus;
  /** 创建时间 */
  createdAt: Date;
  /** 最后活动时间 */
  lastActivityAt: Date;
  /** 当前工作目录 */
  cwd: string;
  /** 最后执行的命令 */
  lastCommand: string;
}
