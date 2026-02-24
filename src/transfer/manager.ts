/**
 * 文件传输管理器
 * 
 * 通过终端会话实现文件上传和下载
 */

import { SessionManager } from '../session/manager';
import { CommandContext } from '../session/types';
import { Errors } from '../utils/errors';
import {
  UploadFileOptions,
  UploadFileResult,
  DownloadFileOptions,
  DownloadFileResult,
  ListDirectoryOptions,
  ListDirectoryResult,
  FileInfo,
} from './types';

/**
 * 默认最大文件大小（10MB）
 */
const DEFAULT_MAX_FILE_SIZE = 10 * 1024 * 1024;

/**
 * 文件传输管理器
 */
export class FileTransferManager {
  private sessionManager: SessionManager;
  private maxFileSize: number;

  constructor(sessionManager: SessionManager, maxFileSize?: number) {
    this.sessionManager = sessionManager;
    this.maxFileSize = maxFileSize || DEFAULT_MAX_FILE_SIZE;
  }

  /**
   * 上传文件
   * 
   * 将 Base64 编码的内容上传到远程路径
   */
  async uploadFile(options: UploadFileOptions): Promise<UploadFileResult> {
    const { remotePath, content, overwrite = true, createDirs = true, mode, sessionId, timeout } = options;

    try {
      // 解码 Base64 内容
      const buffer = Buffer.from(content, 'base64');
      const size = buffer.length;

      // 检查文件大小
      if (size > this.maxFileSize) {
        return {
          success: false,
          remotePath,
          size: 0,
          error: `File size (${size} bytes) exceeds maximum allowed size (${this.maxFileSize} bytes)`,
        };
      }

      // 创建父目录
      if (createDirs) {
        const dirPath = remotePath.substring(0, remotePath.lastIndexOf('/'));
        if (dirPath) {
          await this.executeCommand(sessionId, `mkdir -p "${dirPath}"`, timeout);
        }
      }

      // 删除已存在的文件
      if (overwrite) {
        await this.executeCommand(sessionId, `rm -f "${remotePath}"`, timeout);
      }

      // 使用 base64 解码方式写入文件
      // 将内容分块传输，避免命令行过长
      const chunkSize = 8000; // 每块大小
      const chunks: string[] = [];
      
      for (let i = 0; i < content.length; i += chunkSize) {
        chunks.push(content.substring(i, i + chunkSize));
      }

      // 先清空文件
      await this.executeCommand(sessionId, `echo -n "" > "${remotePath}"`, timeout);

      // 分块追加写入
      for (const chunk of chunks) {
        // 使用 printf 追加 base64 内容
        const result = await this.executeCommand(
          sessionId,
          `printf '%s' '${chunk}' >> "${remotePath}"`,
          timeout
        );
        
        if (!result.success) {
          return {
            success: false,
            remotePath,
            size: 0,
            error: `Failed to write chunk: ${result.error}`,
          };
        }
      }

      // 解码 base64 内容到最终文件
      const tempPath = `${remotePath}.b64`;
      await this.executeCommand(sessionId, `mv "${remotePath}" "${tempPath}"`, timeout);
      
      const decodeResult = await this.executeCommand(
        sessionId,
        `base64 -d "${tempPath}" > "${remotePath}" && rm -f "${tempPath}"`,
        timeout
      );

      if (!decodeResult.success) {
        return {
          success: false,
          remotePath,
          size: 0,
          error: `Failed to decode base64 content: ${decodeResult.error}`,
        };
      }

      // 设置文件权限
      if (mode) {
        await this.executeCommand(sessionId, `chmod ${mode} "${remotePath}"`, timeout);
      }

      return {
        success: true,
        remotePath,
        size,
      };
    } catch (error) {
      return {
        success: false,
        remotePath,
        size: 0,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 下载文件
   * 
   * 将远程文件内容以 Base64 编码返回
   */
  async downloadFile(options: DownloadFileOptions): Promise<DownloadFileResult> {
    const { remotePath, maxSize, sessionId, timeout } = options;
    const effectiveMaxSize = maxSize || this.maxFileSize;

    try {
      // 检查文件是否存在
      const checkResult = await this.executeCommand(
        sessionId,
        `test -f "${remotePath}" && echo "exists" || echo "not_found"`,
        timeout
      );

      if (checkResult.output.trim() === 'not_found') {
        return {
          success: false,
          remotePath,
          content: '',
          size: 0,
          error: `File not found: ${remotePath}`,
        };
      }

      // 获取文件大小 - 使用 echo 包装输出更可靠
      const sizeResult = await this.executeCommand(
        sessionId,
        `echo "SIZE=$(wc -c < "${remotePath}")"`,
        timeout
      );

      // 从输出中提取数字（格式: SIZE=54）
      const sizeMatch = sizeResult.output.match(/SIZE=(\d+)/);
      const size = sizeMatch ? parseInt(sizeMatch[1], 10) : NaN;
      
      if (isNaN(size) || size <= 0) {
        return {
          success: false,
          remotePath,
          content: '',
          size: 0,
          error: `Failed to get file size`,
        };
      }

      // 检查文件大小
      if (size > effectiveMaxSize) {
        return {
          success: false,
          remotePath,
          content: '',
          size,
          error: `File size (${size} bytes) exceeds maximum allowed size (${effectiveMaxSize} bytes)`,
        };
      }

      // 读取并编码文件
      const encodeResult = await this.executeCommand(
        sessionId,
        `base64 "${remotePath}"`,
        timeout
      );

      if (!encodeResult.success) {
        return {
          success: false,
          remotePath,
          content: '',
          size: 0,
          error: `Failed to encode file: ${encodeResult.error}`,
        };
      }

      // 从输出中提取 base64 内容
      // 移除所有非 base64 字符，只保留 A-Za-z0-9+/=
      // 这会同时清理 ANSI 序列、提示符、标记等
      const base64Only = encodeResult.output.replace(/[^A-Za-z0-9+/=]/g, '');
      
      // 计算预期的 base64 长度（基于文件大小）
      // base64 编码后大小约为原始大小的 4/3
      const expectedLength = Math.ceil(size * 4 / 3);
      
      // 取预期长度的 base64 内容
      const content = base64Only.substring(0, expectedLength);

      return {
        success: true,
        remotePath,
        content,
        size,
      };
    } catch (error) {
      return {
        success: false,
        remotePath,
        content: '',
        size: 0,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 列出目录内容
   */
  async listDirectory(options: ListDirectoryOptions): Promise<ListDirectoryResult> {
    const { path, recursive = false, sessionId, timeout } = options;

    try {
      // 检查目录是否存在
      const checkResult = await this.executeCommand(
        sessionId,
        `test -d "${path}" && echo "exists" || echo "not_found"`,
        timeout
      );

      if (checkResult.output.trim() === 'not_found') {
        return {
          success: false,
          path,
          files: [],
          error: `Directory not found: ${path}`,
        };
      }

      // 使用 ls -la 获取详细信息
      const lsOptions = recursive ? '-laR' : '-la';
      const listResult = await this.executeCommand(
        sessionId,
        `ls ${lsOptions} "${path}"`,
        timeout
      );

      if (!listResult.success) {
        return {
          success: false,
          path,
          files: [],
          error: `Failed to list directory: ${listResult.error}`,
        };
      }

      // 解析 ls 输出
      const files = this.parseLsOutput(listResult.output);

      return {
        success: true,
        path,
        files,
      };
    } catch (error) {
      return {
        success: false,
        path,
        files: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 解析 ls -la 输出
   */
  private parseLsOutput(output: string): FileInfo[] {
    const files: FileInfo[] = [];
    const lines = output.split('\n');

    for (const line of lines) {
      // 跳过空行和总计行
      if (!line.trim() || line.startsWith('total ') || line.startsWith('ls:')) {
        continue;
      }

      // 解析 ls -la 格式
      // drwxr-xr-x  2 user group 4096 Jan 1 12:00 dirname
      // -rw-r--r--  1 user group 1234 Jan 1 12:00 filename
      const match = line.match(/^([d\-l][rwxs\-]{9})\s+(\d+)\s+(\S+)\s+(\S+)\s+(\d+)\s+(\w+\s+\d+\s+[\d:]+)\s+(.+)$/);
      
      if (match) {
        const [, mode, , , , size, , name] = match;
        
        // 跳过 . 和 ..
        if (name === '.' || name === '..') {
          continue;
        }

        files.push({
          path: name,
          isDirectory: mode.startsWith('d'),
          size: parseInt(size, 10),
          modifiedTime: new Date(), // 简化处理
          mode: mode.substring(1), // 移除第一个字符（d/-/l）
        });
      }
    }

    return files;
  }

  /**
   * 执行命令
   */
  private async executeCommand(
    sessionId?: string,
    command?: string,
    timeout?: number
  ) {
    return this.sessionManager.executeCommand({
      command: command || '',
      sessionId: sessionId || 'default',
      timeout: timeout || 30000,
    });
  }
}

/**
 * 创建文件传输管理器
 */
export function createFileTransferManager(
  sessionManager: SessionManager,
  maxFileSize?: number
): FileTransferManager {
  return new FileTransferManager(sessionManager, maxFileSize);
}
