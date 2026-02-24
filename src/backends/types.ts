/**
 * 后端类型定义
 * 
 * 定义了所有后端实现必须遵循的接口
 */

import type { IPty } from 'node-pty';

/**
 * 后端类型
 */
export type BackendType = 'wsl' | 'docker' | 'msys2';

/**
 * 系统信息
 */
export interface SystemInfo {
  /** 后端类型 */
  backend: BackendType;
  /** 操作系统类型 */
  os: string;
  /** 操作系统版本 */
  osVersion?: string;
  /** 内核版本 */
  kernel?: string;
  /** 主机名 */
  hostname?: string;
  /** CPU 架构 */
  arch: string;
  /** 总内存（字节） */
  totalMemory?: number;
  /** 可用内存（字节） */
  freeMemory?: number;
  /** 默认 shell */
  defaultShell: string;
  /** 用户名 */
  user?: string;
  /** 主目录 */
  homeDir?: string;
  /** WSL 特有信息 */
  wsl?: {
    distribution?: string;
    distributions?: string[];
    wslVersion?: number;
  };
  /** Docker 特有信息 */
  docker?: {
    version?: string;
    containerId?: string;
    imageName?: string;
  };
}

/**
 * PTY 创建选项
 */
export interface PtyOptions {
  /** Shell 路径 */
  shell: string;
  /** 工作目录 */
  cwd?: string;
  /** 环境变量 */
  env?: Record<string, string>;
  /** 终端列数 */
  cols?: number;
  /** 终端行数 */
  rows?: number;
  /** 终端类型 */
  term?: string;
}

/**
 * 命令执行选项
 */
export interface ExecuteOptions {
  /** 工作目录 */
  cwd?: string;
  /** 超时时间（毫秒） */
  timeout?: number;
  /** 环境变量 */
  env?: Record<string, string>;
  /** 输入数据 */
  input?: string;
}

/**
 * 命令执行结果
 */
export interface ExecuteResult {
  /** 标准输出 */
  stdout: string;
  /** 标准错误 */
  stderr: string;
  /** 退出码 */
  exitCode: number | null;
  /** 执行的命令 */
  command: string;
  /** 执行时长（毫秒） */
  duration: number;
  /** 是否超时 */
  timedOut?: boolean;
  /** 工作目录 */
  cwd?: string;
}

/**
 * 后端接口
 * 
 * 所有后端实现必须遵循此接口
 */
export interface Backend {
  /** 后端类型 */
  readonly type: BackendType;

  /**
   * 检查后端是否可用
   */
  isAvailable(): Promise<boolean>;

  /**
   * 获取系统信息
   */
  getSystemInfo(): Promise<SystemInfo>;

  /**
   * 创建 PTY 会话
   */
  createPty(options: PtyOptions): Promise<IPty>;

  /**
   * 执行命令（无状态）
   */
  execute(command: string, options?: ExecuteOptions): Promise<ExecuteResult>;

  /**
   * 获取默认 shell
   */
  getDefaultShell(): string;

  /**
   * 获取默认工作目录
   */
  getDefaultCwd(): string;
}

/**
 * 后端配置
 */
export interface BackendConfig {
  /** 后端类型 */
  type: BackendType;
  /** WSL 配置 */
  wsl?: {
    distribution?: string;
    shell?: string;
  };
  /** Docker 配置 */
  docker?: {
    image?: string;
    container?: string;
    shell?: string;
  };
  /** MSYS2 配置 */
  msys2?: {
    path?: string;
    shell?: string;
  };
}
