/**
 * Docker 后端实现
 * 
 * 通过 Docker Desktop 运行 Linux 容器
 */

import type { IPty } from 'node-pty';
import { Backend, BackendConfig, SystemInfo, PtyOptions } from './types';

/**
 * Docker 后端配置
 */
export interface DockerBackendConfig {
  /** Docker 镜像 */
  image?: string;
  /** 容器名称前缀 */
  containerPrefix?: string;
  /** 是否使用特权模式 */
  privileged?: boolean;
  /** 挂载卷 */
  mounts?: Array<{
    source: string;
    target: string;
  }>;
}

/**
 * Docker 后端
 */
export class DockerBackend implements Backend {
  private config: DockerBackendConfig;
  private containerId: string | null = null;
  private available: boolean | null = null;

  constructor(config?: DockerBackendConfig) {
    this.config = {
      image: 'ubuntu:latest',
      containerPrefix: 'wsl-mcp-',
      privileged: false,
      mounts: [],
      ...config,
    };
  }

  /**
   * 检查 Docker 是否可用
   */
  async isAvailable(): Promise<boolean> {
    if (this.available !== null) {
      return this.available;
    }

    try {
      const result = await this.runCommand('docker --version');
      this.available = result.includes('Docker version');
      return this.available;
    } catch {
      this.available = false;
      return false;
    }
  }

  /**
   * 获取默认 Shell
   */
  getDefaultShell(): string {
    return '/bin/bash';
  }

  /**
   * 获取默认工作目录
   */
  getDefaultCwd(): string {
    return '/root';
  }

  /**
   * 获取系统信息
   */
  async getSystemInfo(): Promise<SystemInfo> {
    // 确保容器已启动
    await this.ensureContainer();

    const info = await this.runCommand(
      'uname -a && echo "---" && cat /etc/os-release 2>/dev/null | head -5'
    );

    const lines = info.split('\n');
    const unameLine = lines[0] || '';

    // 解析 uname 输出
    const parts = unameLine.split(' ');
    const os = parts[0] || 'Linux';
    const hostname = parts[1] || 'docker';
    const arch = parts[parts.length - 2] || 'x86_64';

    // 解析发行版信息
    let osVersion = 'Unknown';
    for (const line of lines) {
      if (line.startsWith('PRETTY_NAME=')) {
        osVersion = line.replace('PRETTY_NAME=', '').replace(/"/g, '');
        break;
      }
      if (line.startsWith('VERSION=')) {
        osVersion = line.replace('VERSION=', '').replace(/"/g, '');
      }
    }

    return {
      backend: 'docker',
      os,
      osVersion,
      arch,
      hostname,
      user: 'root',
      homeDir: '/root',
      defaultShell: '/bin/bash',
      wsl: false,
      docker: true,
    };
  }

  /**
   * 创建 PTY 进程
   */
  async createPty(options: PtyOptions): Promise<IPty> {
    // 确保容器已启动
    await this.ensureContainer();

    // 动态导入 node-pty
    const pty = await import('node-pty');

    // 构建 docker exec 命令
    const shell = options.shell || this.getDefaultShell();
    const cwd = options.cwd || this.getDefaultCwd();

    const args = [
      'exec',
      '-it',
      this.containerId!,
      shell,
    ];

    // 使用 wsl.exe 运行 docker 命令
    return pty.spawn('docker', args, {
      name: 'xterm-256color',
      cols: options.cols || 160,
      rows: options.rows || 40,
      cwd: process.cwd(),
      env: process.env as Record<string, string>,
    });
  }

  /**
   * 确保容器已启动
   */
  private async ensureContainer(): Promise<void> {
    if (this.containerId) {
      // 检查容器是否还在运行
      try {
        const result = await this.runCommand(
          `docker ps -q --filter "id=${this.containerId}"`
        );
        if (result.trim()) {
          return; // 容器仍在运行
        }
      } catch {
        // 忽略错误，重新创建容器
      }
      this.containerId = null;
    }

    // 创建新容器
    await this.createContainer();
  }

  /**
   * 创建容器
   */
  private async createContainer(): Promise<void> {
    const containerName = `${this.config.containerPrefix}${Date.now()}`;
    
    // 构建创建命令
    const args = [
      'run',
      '-d',
      '--name', containerName,
    ];

    // 添加挂载
    if (this.config.mounts) {
      for (const mount of this.config.mounts) {
        args.push('-v', `${mount.source}:${mount.target}`);
      }
    }

    // 特权模式
    if (this.config.privileged) {
      args.push('--privileged');
    }

    // 添加镜像
    args.push(this.config.image!);

    // 保持容器运行
    args.push('tail', '-f', '/dev/null');

    try {
      const result = await this.runCommand(`docker ${args.join(' ')}`);
      this.containerId = result.trim();
    } catch (error) {
      throw new Error(`Failed to create Docker container: ${error}`);
    }
  }

  /**
   * 运行命令并获取输出
   */
  private runCommand(command: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const { exec } = require('child_process');
      exec(command, { encoding: 'utf8' }, (error: Error | null, stdout: string, stderr: string) => {
        if (error) {
          reject(new Error(`${error.message}\n${stderr}`));
        } else {
          resolve(stdout);
        }
      });
    });
  }

  /**
   * 清理容器
   */
  async cleanup(): Promise<void> {
    if (this.containerId) {
      try {
        await this.runCommand(`docker stop ${this.containerId}`);
        await this.runCommand(`docker rm ${this.containerId}`);
      } catch {
        // 忽略清理错误
      }
      this.containerId = null;
    }
  }
}

/**
 * 创建 Docker 后端
 */
export function createDockerBackend(config?: DockerBackendConfig): DockerBackend {
  return new DockerBackend(config);
}
