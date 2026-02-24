/**
 * WSL 后端实现
 * 
 * 提供与 Windows Subsystem for Linux 的交互能力
 */

import * as pty from 'node-pty';
import { spawn, ChildProcess } from 'child_process';
import {
  Backend,
  BackendType,
  SystemInfo,
  PtyOptions,
  ExecuteOptions,
  ExecuteResult,
  BackendConfig,
} from './types';

/**
 * WSL 后端配置
 */
export interface WslBackendConfig {
  /** WSL 发行版名称 */
  distribution?: string;
  /** 默认 shell */
  shell?: string;
  /** WSL 可执行文件路径 */
  wslPath?: string;
}

/**
 * WSL 后端实现
 */
export class WslBackend implements Backend {
  readonly type: BackendType = 'wsl';

  private distribution?: string;
  private defaultShell: string;
  private wslExecutable: string;
  private _systemInfo?: SystemInfo;

  constructor(config?: WslBackendConfig) {
    this.distribution = config?.distribution;
    this.defaultShell = config?.shell || '/bin/bash';
    this.wslExecutable = config?.wslPath || 'wsl.exe';
  }

  /**
   * 检查 WSL 是否可用
   */
  async isAvailable(): Promise<boolean> {
    return new Promise((resolve) => {
      const proc = spawn(this.wslExecutable, ['--status'], {
        windowsHide: true,
      });
      
      proc.on('close', (code) => resolve(code === 0));
      proc.on('error', () => resolve(false));
      
      // 设置超时
      setTimeout(() => {
        proc.kill();
        resolve(false);
      }, 5000);
    });
  }

  /**
   * 获取系统信息
   */
  async getSystemInfo(): Promise<SystemInfo> {
    if (this._systemInfo) {
      return this._systemInfo;
    }

    const info: SystemInfo = {
      backend: 'wsl',
      os: 'Linux',
      arch: process.arch,
      defaultShell: this.defaultShell,
    };

    try {
      // 获取基本信息
      const [osInfo, hostname, user, homeDir] = await Promise.all([
        this.execute('uname -a'),
        this.execute('hostname'),
        this.execute('whoami'),
        this.execute('echo $HOME'),
      ]);

      info.osVersion = osInfo.stdout.trim();
      info.hostname = hostname.stdout.trim();
      info.user = user.stdout.trim();
      info.homeDir = homeDir.stdout.trim();

      // 获取 WSL 特有信息
      const distroInfo = await this.getDistributions();
      info.wsl = {
        distribution: this.distribution || distroInfo.default,
        distributions: distroInfo.all,
        wslVersion: await this.getWslVersion(),
      };

      this._systemInfo = info;
    } catch (error) {
      console.error('Failed to get system info:', error);
    }

    return info;
  }

  /**
   * 创建 PTY 会话
   */
  async createPty(options: PtyOptions): Promise<IPty> {
    const args = this.buildWslArgs(['--exec', options.shell]);

    const ptyProcess = pty.spawn(this.wslExecutable, args, {
      name: options.term || 'xterm-256color',
      cols: options.cols || 160,
      rows: options.rows || 40,
      cwd: options.cwd || process.cwd(),
      env: {
        ...process.env,
        ...options.env,
        TERM: options.term || 'xterm-256color',
        COLORTERM: 'truecolor',
      },
    });

    return ptyProcess;
  }

  /**
   * 执行命令（无状态）
   */
  async execute(command: string, options?: ExecuteOptions): Promise<ExecuteResult> {
    const startTime = Date.now();
    const timeout = options?.timeout || 30000;

    return new Promise((resolve, reject) => {
      // 构建 WSL 命令参数
      const args = this.buildWslArgs(['--exec', 'sh', '-c', command]);

      const proc = spawn(this.wslExecutable, args, {
        cwd: options?.cwd,
        env: { ...process.env, ...options?.env },
        windowsHide: true,
      });

      let stdout = '';
      let stderr = '';
      let timedOut = false;

      // 设置超时
      const timeoutId = setTimeout(() => {
        timedOut = true;
        proc.kill();
      }, timeout);

      proc.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      // 如果有输入，写入 stdin
      if (options?.input) {
        proc.stdin?.write(options.input);
        proc.stdin?.end();
      }

      proc.on('close', (code) => {
        clearTimeout(timeoutId);
        resolve({
          stdout,
          stderr,
          exitCode: code,
          command,
          duration: Date.now() - startTime,
          timedOut,
          cwd: options?.cwd,
        });
      });

      proc.on('error', (error) => {
        clearTimeout(timeoutId);
        reject(error);
      });
    });
  }

  /**
   * 获取默认 shell
   */
  getDefaultShell(): string {
    return this.defaultShell;
  }

  /**
   * 获取默认工作目录
   */
  getDefaultCwd(): string {
    return process.cwd();
  }

  /**
   * 构建 WSL 命令参数
   */
  private buildWslArgs(baseArgs: string[]): string[] {
    const args: string[] = [];
    
    if (this.distribution) {
      args.push('-d', this.distribution);
    }
    
    return [...args, ...baseArgs];
  }

  /**
   * 获取可用的 WSL 发行版列表
   */
  private async getDistributions(): Promise<{ default: string | undefined; all: string[] }> {
    return new Promise((resolve) => {
      const proc = spawn(this.wslExecutable, ['--list', '--verbose'], {
        windowsHide: true,
      });

      let output = '';
      
      proc.stdout?.on('data', (data) => {
        output += data.toString();
      });

      proc.on('close', () => {
        try {
          // 解析输出，格式类似：
          // NAME            STATE           VERSION
          // * Ubuntu        Running         2
          //   Debian        Stopped         2
          const lines = output.split('\n').filter(line => line.trim());
          const distributions: string[] = [];
          let defaultDistro: string | undefined;

          for (const line of lines.slice(1)) { // 跳过标题行
            const match = line.match(/^\s*(\*?)\s*(\S+)/);
            if (match) {
              const name = match[2];
              distributions.push(name);
              if (match[1] === '*') {
                defaultDistro = name;
              }
            }
          }

          resolve({ default: defaultDistro, all: distributions });
        } catch {
          resolve({ default: undefined, all: [] });
        }
      });

      proc.on('error', () => {
        resolve({ default: undefined, all: [] });
      });
    });
  }

  /**
   * 获取 WSL 版本
   */
  private async getWslVersion(): Promise<number> {
    return new Promise((resolve) => {
      const proc = spawn(this.wslExecutable, ['--version'], {
        windowsHide: true,
      });

      let output = '';
      
      proc.stdout?.on('data', (data) => {
        output += data.toString();
      });

      proc.on('close', () => {
        // WSL 2 是默认的现代版本
        // 如果 --version 命令存在，说明是 WSL 2
        resolve(output.includes('WSL') ? 2 : 1);
      });

      proc.on('error', () => {
        resolve(1);
      });
    });
  }
}

/**
 * 创建 WSL 后端实例
 */
export function createWslBackend(config?: WslBackendConfig): WslBackend {
  return new WslBackend(config);
}
