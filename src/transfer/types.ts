/**
 * 文件传输类型定义
 */

/**
 * 文件传输选项
 */
export interface FileTransferOptions {
  /** 会话 ID */
  sessionId?: string;
  /** 超时时间（毫秒） */
  timeout?: number;
}

/**
 * 上传文件选项
 */
export interface UploadFileOptions extends FileTransferOptions {
  /** 远程文件路径 */
  remotePath: string;
  /** 文件内容（Base64 编码） */
  content: string;
  /** 是否覆盖已存在的文件 */
  overwrite?: boolean;
  /** 是否创建父目录 */
  createDirs?: boolean;
  /** 文件权限（八进制，如 "755"） */
  mode?: string;
}

/**
 * 下载文件选项
 */
export interface DownloadFileOptions extends FileTransferOptions {
  /** 远程文件路径 */
  remotePath: string;
  /** 最大文件大小（字节） */
  maxSize?: number;
}

/**
 * 上传文件结果
 */
export interface UploadFileResult {
  /** 是否成功 */
  success: boolean;
  /** 远程文件路径 */
  remotePath: string;
  /** 文件大小（字节） */
  size: number;
  /** 错误信息 */
  error?: string;
}

/**
 * 下载文件结果
 */
export interface DownloadFileResult {
  /** 是否成功 */
  success: boolean;
  /** 远程文件路径 */
  remotePath: string;
  /** 文件内容（Base64 编码） */
  content: string;
  /** 文件大小（字节） */
  size: number;
  /** 错误信息 */
  error?: string;
}

/**
 * 文件信息
 */
export interface FileInfo {
  /** 文件路径 */
  path: string;
  /** 是否是目录 */
  isDirectory: boolean;
  /** 文件大小（字节） */
  size: number;
  /** 修改时间 */
  modifiedTime: Date;
  /** 权限 */
  mode: string;
}

/**
 * 列出目录选项
 */
export interface ListDirectoryOptions extends FileTransferOptions {
  /** 目录路径 */
  path: string;
  /** 是否递归列出 */
  recursive?: boolean;
}

/**
 * 列出目录结果
 */
export interface ListDirectoryResult {
  /** 是否成功 */
  success: boolean;
  /** 目录路径 */
  path: string;
  /** 文件列表 */
  files: FileInfo[];
  /** 错误信息 */
  error?: string;
}
