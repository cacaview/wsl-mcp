/**
 * MCP 工具处理器
 *
 * 实现所有 MCP 工具的具体逻辑
 */

import { Backend, SystemInfo } from '../backends';
import { SessionManager, CommandResult, SessionListItem } from '../session';
import { OutputPoller, LogTailer, PollResult, ProcessListItem, LogEntry } from '../polling';
import { FileTransferManager } from '../transfer';
import { ToolName } from './definitions';

/**
 * 工具处理器上下文
 */
export interface ToolHandlerContext {
  backend: Backend;
  sessionManager: SessionManager;
  outputPoller: OutputPoller;
  logTailer: LogTailer;
  fileTransferManager: FileTransferManager;
}

/**
 * 工具调用参数
 */
export interface ToolCallArgs {
  [key: string]: unknown;
}

/**
 * 工具处理器结果
 */
export interface ToolResult {
  content: Array<{
    type: 'text';
    text: string;
  }>;
  isError?: boolean;
}

/**
 * 创建工具处理器
 */
export function createToolHandlers(context: ToolHandlerContext) {
  const { backend, sessionManager, outputPoller, logTailer, fileTransferManager } = context;

  return {
    /**
     * 处理工具调用
     */
    async handleToolCall(name: ToolName, args: ToolCallArgs): Promise<ToolResult> {
      try {
        switch (name) {
          case 'terminal_execute':
            return await handleExecute(args, sessionManager);
          
          case 'terminal_start_process':
            return await handleStartProcess(args, sessionManager, outputPoller);
          
          case 'terminal_poll_output':
            return await handlePollOutput(args, outputPoller);
          
          case 'terminal_stop_process':
            return await handleStopProcess(args, outputPoller);
          
          case 'terminal_list_processes':
            return await handleListProcesses(args, outputPoller);
          
          case 'terminal_tail_logs':
            return await handleTailLogs(args, sessionManager, logTailer);
          
          case 'terminal_get_logs':
            return await handleGetLogs(args, logTailer);
          
          case 'terminal_stop_tail':
            return await handleStopTail(args, logTailer);
          
          case 'terminal_new_session':
            return await handleNewSession(args, sessionManager);
          
          case 'terminal_list_sessions':
            return await handleListSessions(sessionManager);
          
          case 'terminal_close_session':
            return await handleCloseSession(args, sessionManager);
          
          case 'get_system_info':
            return await handleGetSystemInfo(backend);
          
          case 'get_directory_info':
            return await handleGetDirectoryInfo(args, sessionManager);
          
          case 'terminal_upload_file':
            return await handleUploadFile(args, fileTransferManager);
          
          case 'terminal_download_file':
            return await handleDownloadFile(args, fileTransferManager);
          
          case 'terminal_list_directory':
            return await handleListDirectory(args, fileTransferManager);

          case 'terminal_send_input':
            return await handleSendInput(args, sessionManager);
          
          default:
            return {
              content: [{ type: 'text', text: `Unknown tool: ${name}` }],
              isError: true,
            };
        }
      } catch (error: any) {
        return {
          content: [{ type: 'text', text: `Error: ${error.message}` }],
          isError: true,
        };
      }
    },
  };
}

/**
 * 处理命令执行
 */
async function handleExecute(args: ToolCallArgs, sessionManager: SessionManager): Promise<ToolResult> {
  const command = args.command as string;
  const sessionId = (args.session_id as string) || 'default';
  const timeout = (args.timeout as number) || 30000;

  const result = await sessionManager.executeCommand({
    sessionId,
    command,
    timeout,
  });

  return {
    content: [{
      type: 'text',
      text: formatCommandResult(result),
    }],
  };
}

/**
 * 处理启动后台进程
 */
async function handleStartProcess(
  args: ToolCallArgs,
  sessionManager: SessionManager,
  outputPoller: OutputPoller
): Promise<ToolResult> {
  const command = args.command as string;
  const sessionId = (args.session_id as string) || 'default';
  const pollInterval = (args.poll_interval as number) || 1000;
  const timeout = (args.timeout as number) || 300000;

  // 确保会话存在
  await sessionManager.getOrCreateSession(sessionId);

  const processId = await outputPoller.startProcess(sessionId, command, {
    interval: pollInterval,
    timeout,
  });

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        success: true,
        process_id: processId,
        session_id: sessionId,
        command,
        message: `Process started. Use terminal_poll_output with process_id "${processId}" to get output.`,
      }, null, 2),
    }],
  };
}

/**
 * 处理轮询输出
 */
async function handlePollOutput(args: ToolCallArgs, outputPoller: OutputPoller): Promise<ToolResult> {
  const processId = args.process_id as string;
  const incremental = args.incremental !== false;

  const result = await outputPoller.poll(processId, incremental);

  return {
    content: [{
      type: 'text',
      text: formatPollResult(result),
    }],
  };
}

/**
 * 处理停止进程
 */
async function handleStopProcess(args: ToolCallArgs, outputPoller: OutputPoller): Promise<ToolResult> {
  const processId = args.process_id as string;

  await outputPoller.stopProcess(processId);

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        success: true,
        process_id: processId,
        message: 'Process stopped.',
      }, null, 2),
    }],
  };
}

/**
 * 处理列出进程
 */
async function handleListProcesses(args: ToolCallArgs, outputPoller: OutputPoller): Promise<ToolResult> {
  const activeOnly = args.active_only !== false;

  const processes = activeOnly
    ? outputPoller.getActiveProcesses()
    : outputPoller.getAllProcesses();

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        success: true,
        count: processes.length,
        processes: processes.map(formatProcessItem),
      }, null, 2),
    }],
  };
}

/**
 * 处理日志跟踪
 */
async function handleTailLogs(
  args: ToolCallArgs,
  sessionManager: SessionManager,
  logTailer: LogTailer
): Promise<ToolResult> {
  const filePath = args.file_path as string;
  const sessionId = (args.session_id as string) || 'default';
  const lines = (args.lines as number) || 100;
  const follow = args.follow !== false;

  // 确保会话存在
  await sessionManager.getOrCreateSession(sessionId);

  const tailId = await logTailer.startTailing(sessionId, filePath, {
    lines,
    follow,
  });

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        success: true,
        tail_id: tailId,
        file_path: filePath,
        message: `Log tailing started. Use terminal_get_logs with tail_id "${tailId}" to get logs.`,
      }, null, 2),
    }],
  };
}

/**
 * 处理获取日志
 */
async function handleGetLogs(args: ToolCallArgs, logTailer: LogTailer): Promise<ToolResult> {
  const tailId = args.tail_id as string;
  const incremental = args.incremental !== false;

  const logs = incremental
    ? await logTailer.getIncrementalLogs(tailId)
    : await logTailer.getLogs(tailId);

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        success: true,
        tail_id: tailId,
        count: logs.length,
        logs: logs.map(formatLogEntry),
      }, null, 2),
    }],
  };
}

/**
 * 处理停止日志跟踪
 */
async function handleStopTail(args: ToolCallArgs, logTailer: LogTailer): Promise<ToolResult> {
  const tailId = args.tail_id as string;

  await logTailer.stopTailing(tailId);

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        success: true,
        tail_id: tailId,
        message: 'Log tailing stopped.',
      }, null, 2),
    }],
  };
}

/**
 * 处理创建会话
 */
async function handleNewSession(args: ToolCallArgs, sessionManager: SessionManager): Promise<ToolResult> {
  const session = await sessionManager.createSession({
    id: args.session_id as string,
    name: args.name as string,
    cwd: args.working_dir as string,
    shell: args.shell as string,
  });

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        success: true,
        session: formatSessionItem({
          id: session.id,
          name: session.name,
          status: session.status,
          createdAt: session.createdAt,
          lastActivityAt: session.lastActivityAt,
          cwd: session.cwd,
          lastCommand: session.lastCommand,
        }),
      }, null, 2),
    }],
  };
}

/**
 * 处理列出会话
 */
async function handleListSessions(sessionManager: SessionManager): Promise<ToolResult> {
  const sessions = sessionManager.listSessions();

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        success: true,
        count: sessions.length,
        sessions: sessions.map(formatSessionItem),
      }, null, 2),
    }],
  };
}

/**
 * 处理关闭会话
 */
async function handleCloseSession(args: ToolCallArgs, sessionManager: SessionManager): Promise<ToolResult> {
  const sessionId = args.session_id as string;

  await sessionManager.closeSession(sessionId);

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        success: true,
        session_id: sessionId,
        message: 'Session closed.',
      }, null, 2),
    }],
  };
}

/**
 * 处理获取系统信息
 */
async function handleGetSystemInfo(backend: Backend): Promise<ToolResult> {
  const info = await backend.getSystemInfo();

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        success: true,
        system: formatSystemInfo(info),
      }, null, 2),
    }],
  };
}

/**
 * 处理获取目录信息
 */
async function handleGetDirectoryInfo(args: ToolCallArgs, sessionManager: SessionManager): Promise<ToolResult> {
  const sessionId = (args.session_id as string) || 'default';
  const path = args.path as string || '.';

  const result = await sessionManager.executeCommand({
    sessionId,
    command: `ls -la "${path}" && echo "---" && pwd`,
    timeout: 10000,
  });

  if (!result.success) {
    return {
      content: [{
        type: 'text',
        text: `Failed to get directory info: ${result.error}`,
      }],
      isError: true,
    };
  }

  return {
    content: [{
      type: 'text',
      text: result.output,
    }],
  };
}

// 格式化函数

function formatCommandResult(result: CommandResult): string {
  const lines = [
    `Command: ${result.command}`,
    `Exit Code: ${result.exitCode}`,
    `Duration: ${result.duration}ms`,
    result.timedOut ? '⚠️ Command timed out' : '',
    '',
    '--- Output ---',
    result.output || '(no output)',
  ];
  return lines.filter(Boolean).join('\n');
}

function formatPollResult(result: PollResult): string {
  const lines = [
    `Process ID: ${result.processId}`,
    `Status: ${result.status}`,
    `Has New Content: ${result.hasNewContent}`,
    `Is Complete: ${result.isComplete}`,
    result.exitCode !== undefined ? `Exit Code: ${result.exitCode}` : '',
    result.error ? `Error: ${result.error}` : '',
    '',
    '--- Output ---',
    result.output || '(no output)',
  ];
  return lines.filter(Boolean).join('\n');
}

function formatProcessItem(item: ProcessListItem): Record<string, unknown> {
  return {
    id: item.id,
    session_id: item.sessionId,
    command: item.command,
    status: item.status,
    created_at: item.createdAt.toISOString(),
    last_updated: item.lastUpdatedAt.toISOString(),
    output_length: item.outputLength,
  };
}

function formatLogEntry(entry: LogEntry): Record<string, unknown> {
  return {
    timestamp: entry.timestamp.toISOString(),
    level: entry.level,
    content: entry.content,
  };
}

function formatSessionItem(item: SessionListItem): Record<string, unknown> {
  return {
    id: item.id,
    name: item.name,
    status: item.status,
    created_at: item.createdAt.toISOString(),
    last_activity: item.lastActivityAt.toISOString(),
    cwd: item.cwd,
    last_command: item.lastCommand,
  };
}

function formatSystemInfo(info: SystemInfo): Record<string, unknown> {
  return {
    backend: info.backend,
    os: info.os,
    os_version: info.osVersion,
    arch: info.arch,
    hostname: info.hostname,
    user: info.user,
    home_dir: info.homeDir,
    default_shell: info.defaultShell,
    wsl: info.wsl,
    docker: info.docker,
  };
}

/**
 * 处理上传文件
 */
async function handleUploadFile(
  args: ToolCallArgs,
  fileTransferManager: FileTransferManager
): Promise<ToolResult> {
  const remotePath = args.remote_path as string;
  const content = args.content as string;
  const sessionId = (args.session_id as string) || 'default';
  const overwrite = args.overwrite !== false;
  const createDirs = args.create_dirs !== false;
  const mode = args.mode as string | undefined;
  const timeout = (args.timeout as number) || 60000;

  const result = await fileTransferManager.uploadFile({
    remotePath,
    content,
    sessionId,
    overwrite,
    createDirs,
    mode,
    timeout,
  });

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        success: result.success,
        remote_path: result.remotePath,
        size: result.size,
        error: result.error,
      }, null, 2),
    }],
    isError: !result.success,
  };
}

/**
 * 处理下载文件
 */
async function handleDownloadFile(
  args: ToolCallArgs,
  fileTransferManager: FileTransferManager
): Promise<ToolResult> {
  const remotePath = args.remote_path as string;
  const sessionId = (args.session_id as string) || 'default';
  const maxSize = args.max_size as number | undefined;
  const timeout = (args.timeout as number) || 30000;

  const result = await fileTransferManager.downloadFile({
    remotePath,
    sessionId,
    maxSize,
    timeout,
  });

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        success: result.success,
        remote_path: result.remotePath,
        size: result.size,
        content: result.content,
        error: result.error,
      }, null, 2),
    }],
    isError: !result.success,
  };
}

/**
 * 按键名称到原始序列的映射表
 */
const KEY_MAP: Record<string, string> = {
  // 基本特殊键
  enter:      '\r',
  return:     '\r',
  tab:        '\t',
  escape:     '\x1b',
  esc:        '\x1b',
  backspace:  '\x7f',
  delete:     '\x1b[3~',
  space:      ' ',
  insert:     '\x1b[2~',
  home:       '\x1b[H',
  end:        '\x1b[F',
  page_up:    '\x1b[5~',
  pageup:     '\x1b[5~',
  page_down:  '\x1b[6~',
  pagedown:   '\x1b[6~',

  // 方向键
  up:          '\x1b[A',
  arrow_up:    '\x1b[A',
  down:        '\x1b[B',
  arrow_down:  '\x1b[B',
  right:       '\x1b[C',
  arrow_right: '\x1b[C',
  left:        '\x1b[D',
  arrow_left:  '\x1b[D',

  // Ctrl 组合键 (ctrl+a = \x01, ctrl+b = \x02, ...)
  'ctrl+a': '\x01', 'ctrl+b': '\x02', 'ctrl+c': '\x03', 'ctrl+d': '\x04',
  'ctrl+e': '\x05', 'ctrl+f': '\x06', 'ctrl+g': '\x07', 'ctrl+h': '\x08',
  'ctrl+i': '\x09', 'ctrl+j': '\x0a', 'ctrl+k': '\x0b', 'ctrl+l': '\x0c',
  'ctrl+m': '\x0d', 'ctrl+n': '\x0e', 'ctrl+o': '\x0f', 'ctrl+p': '\x10',
  'ctrl+q': '\x11', 'ctrl+r': '\x12', 'ctrl+s': '\x13', 'ctrl+t': '\x14',
  'ctrl+u': '\x15', 'ctrl+v': '\x16', 'ctrl+w': '\x17', 'ctrl+x': '\x18',
  'ctrl+y': '\x19', 'ctrl+z': '\x1a',

  // 功能键 (xterm 标准)
  f1:  '\x1bOP',   f2:  '\x1bOQ',   f3:  '\x1bOR',   f4:  '\x1bOS',
  f5:  '\x1b[15~', f6:  '\x1b[17~', f7:  '\x1b[18~', f8:  '\x1b[19~',
  f9:  '\x1b[20~', f10: '\x1b[21~', f11: '\x1b[23~', f12: '\x1b[24~',
};

/**
 * 将按键名称解析为原始序列，未知按键将原样返回
 */
function resolveKey(key: string): string {
  const normalized = key.toLowerCase().trim();
  return KEY_MAP[normalized] ?? key;
}

/**
 * 处理键盘模拟输入
 */
async function handleSendInput(
  args: ToolCallArgs,
  sessionManager: SessionManager
): Promise<ToolResult> {
  const sessionId = (args.session_id as string) || 'default';
  const text = args.text as string | undefined;
  const keys = args.keys as string[] | undefined;
  const delay = (args.delay as number) || 0;

  if (!text && (!keys || keys.length === 0)) {
    return {
      content: [{ type: 'text', text: 'Error: 必须提供 text 或 keys 中的至少一个' }],
      isError: true,
    };
  }

  const sent: string[] = [];

  // 先发送文本
  if (text !== undefined && text !== '') {
    await sessionManager.sendInput(sessionId, text);
    sent.push(`text: ${JSON.stringify(text)}`);
  }

  // 再依次发送按键
  if (keys && keys.length > 0) {
    for (let i = 0; i < keys.length; i++) {
      const raw = resolveKey(keys[i]);
      await sessionManager.sendInput(sessionId, raw);
      sent.push(`key: ${keys[i]}`);
      if (delay > 0 && i < keys.length - 1) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        success: true,
        session_id: sessionId,
        sent,
      }, null, 2),
    }],
  };
}

/**
 * 处理列出目录
 */
async function handleListDirectory(
  args: ToolCallArgs,
  fileTransferManager: FileTransferManager
): Promise<ToolResult> {
  const path = args.path as string;
  const sessionId = (args.session_id as string) || 'default';
  const recursive = args.recursive === true;
  const timeout = (args.timeout as number) || 30000;

  const result = await fileTransferManager.listDirectory({
    path,
    sessionId,
    recursive,
    timeout,
  });

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        success: result.success,
        path: result.path,
        files: result.files.map(f => ({
          path: f.path,
          is_directory: f.isDirectory,
          size: f.size,
          mode: f.mode,
        })),
        error: result.error,
      }, null, 2),
    }],
    isError: !result.success,
  };
}
