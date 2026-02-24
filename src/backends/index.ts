/**
 * 后端工厂
 *
 * 用于创建和管理不同类型的后端实例
 */

import { Backend, BackendConfig, BackendType } from './types';
import { WslBackend, WslBackendConfig, createWslBackend } from './wsl';
import { DockerBackend, DockerBackendConfig, createDockerBackend } from './docker';

export { Backend, BackendConfig, BackendType };
export { WslBackend, WslBackendConfig, createWslBackend };
export { DockerBackend, DockerBackendConfig, createDockerBackend };
export * from './types';

/**
 * 后端创建选项
 */
export interface CreateBackendOptions {
  /** 后端类型 */
  type: BackendType;
  /** WSL 配置 */
  wsl?: WslBackendConfig;
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

/**
 * 创建后端实例
 * 
 * @param options 创建选项
 * @returns 后端实例
 */
export async function createBackend(options: CreateBackendOptions): Promise<Backend> {
  switch (options.type) {
    case 'wsl':
      return createWslBackend(options.wsl);
    
    case 'docker':
      return createDockerBackend(options.docker);
    
    case 'msys2':
      throw new Error('MSYS2 backend is not yet implemented');
    
    default:
      throw new Error(`Unknown backend type: ${options.type}`);
  }
}

/**
 * 自动检测并创建最佳后端
 *
 * 按优先级尝试：WSL -> Docker -> MSYS2
 */
export async function createAutoBackend(): Promise<Backend> {
  // 尝试 WSL
  const wslBackend = createWslBackend();
  if (await wslBackend.isAvailable()) {
    return wslBackend;
  }

  // 尝试 Docker
  const dockerBackend = createDockerBackend();
  if (await dockerBackend.isAvailable()) {
    return dockerBackend;
  }

  // 尝试 MSYS2（未来实现）
  // const msys2Backend = createMsys2Backend();
  // if (await msys2Backend.isAvailable()) {
  //   return msys2Backend;
  // }

  throw new Error('No available backend found. Please ensure WSL or Docker is installed and configured.');
}

/**
 * 检测可用的后端
 */
export async function detectAvailableBackends(): Promise<BackendType[]> {
  const available: BackendType[] = [];

  // 检查 WSL
  const wslBackend = createWslBackend();
  if (await wslBackend.isAvailable()) {
    available.push('wsl');
  }

  // 检查 Docker
  const dockerBackend = createDockerBackend();
  if (await dockerBackend.isAvailable()) {
    available.push('docker');
  }

  // 检查 MSYS2（未来实现）
  // const msys2Backend = createMsys2Backend();
  // if (await msys2Backend.isAvailable()) {
  //   available.push('msys2');
  // }

  return available;
}
