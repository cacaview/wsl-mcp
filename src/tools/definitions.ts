/**
 * MCP 工具定义
 * 
 * 定义所有 MCP 工具的 schema
 */

/**
 * 工具定义列表
 */
export const TOOL_DEFINITIONS = {
  // 命令执行工具
  terminal_execute: {
    name: 'terminal_execute',
    description: '在持久化终端会话中执行命令。会话保持上下文，适合需要多步操作的场景。',
    inputSchema: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: '要执行的命令',
        },
        session_id: {
          type: 'string',
          description: "会话 ID（默认: 'default'）",
          default: 'default',
        },
        timeout: {
          type: 'number',
          description: '超时时间（毫秒，默认: 30000）',
          default: 30000,
        },
        working_dir: {
          type: 'string',
          description: '工作目录',
        },
      },
      required: ['command'],
    },
  },

  // 启动后台进程
  terminal_start_process: {
    name: 'terminal_start_process',
    description: '启动后台进程并开始轮询输出。适合长时间运行的进程如开发服务器、构建任务等。',
    inputSchema: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: "要执行的命令，如 'npm run dev'",
        },
        session_id: {
          type: 'string',
          description: '会话 ID',
          default: 'default',
        },
        poll_interval: {
          type: 'number',
          description: '轮询间隔（毫秒，默认: 1000）',
          default: 1000,
        },
        timeout: {
          type: 'number',
          description: '超时时间（毫秒，默认: 300000）',
          default: 300000,
        },
      },
      required: ['command'],
    },
  },

  // 轮询输出
  terminal_poll_output: {
    name: 'terminal_poll_output',
    description: '获取后台进程的输出。支持增量获取，只返回上次轮询后的新内容。',
    inputSchema: {
      type: 'object',
      properties: {
        process_id: {
          type: 'string',
          description: '进程 ID（由 start_process 返回）',
        },
        incremental: {
          type: 'boolean',
          description: '是否增量输出（默认: true）',
          default: true,
        },
      },
      required: ['process_id'],
    },
  },

  // 停止进程
  terminal_stop_process: {
    name: 'terminal_stop_process',
    description: '停止后台进程。',
    inputSchema: {
      type: 'object',
      properties: {
        process_id: {
          type: 'string',
          description: '进程 ID',
        },
      },
      required: ['process_id'],
    },
  },

  // 列出进程
  terminal_list_processes: {
    name: 'terminal_list_processes',
    description: '列出所有后台进程。',
    inputSchema: {
      type: 'object',
      properties: {
        active_only: {
          type: 'boolean',
          description: '是否只显示活跃进程（默认: true）',
          default: true,
        },
      },
    },
  },

  // 跟踪日志
  terminal_tail_logs: {
    name: 'terminal_tail_logs',
    description: '跟踪日志文件，类似 tail -f。支持持续获取日志内容。',
    inputSchema: {
      type: 'object',
      properties: {
        file_path: {
          type: 'string',
          description: '日志文件路径',
        },
        session_id: {
          type: 'string',
          description: '会话 ID',
          default: 'default',
        },
        lines: {
          type: 'number',
          description: '初始显示行数（默认: 100）',
          default: 100,
        },
        follow: {
          type: 'boolean',
          description: '是否持续跟踪（默认: true）',
          default: true,
        },
      },
      required: ['file_path'],
    },
  },

  // 获取日志
  terminal_get_logs: {
    name: 'terminal_get_logs',
    description: '获取跟踪的日志内容。',
    inputSchema: {
      type: 'object',
      properties: {
        tail_id: {
          type: 'string',
          description: '跟踪 ID',
        },
        incremental: {
          type: 'boolean',
          description: '是否增量获取（默认: true）',
          default: true,
        },
      },
      required: ['tail_id'],
    },
  },

  // 停止日志跟踪
  terminal_stop_tail: {
    name: 'terminal_stop_tail',
    description: '停止日志跟踪。',
    inputSchema: {
      type: 'object',
      properties: {
        tail_id: {
          type: 'string',
          description: '跟踪 ID',
        },
      },
      required: ['tail_id'],
    },
  },

  // 创建会话
  terminal_new_session: {
    name: 'terminal_new_session',
    description: '创建新的终端会话。',
    inputSchema: {
      type: 'object',
      properties: {
        session_id: {
          type: 'string',
          description: '会话 ID（可选，自动生成）',
        },
        name: {
          type: 'string',
          description: '会话名称',
        },
        working_dir: {
          type: 'string',
          description: '工作目录',
        },
        shell: {
          type: 'string',
          description: 'Shell 路径',
        },
      },
    },
  },

  // 列出会话
  terminal_list_sessions: {
    name: 'terminal_list_sessions',
    description: '列出所有终端会话。',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },

  // 关闭会话
  terminal_close_session: {
    name: 'terminal_close_session',
    description: '关闭终端会话。',
    inputSchema: {
      type: 'object',
      properties: {
        session_id: {
          type: 'string',
          description: '会话 ID',
        },
      },
      required: ['session_id'],
    },
  },

  // 获取系统信息
  get_system_info: {
    name: 'get_system_info',
    description: '获取系统信息，包括操作系统、Shell、用户等。',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },

  // 获取目录信息
  get_directory_info: {
    name: 'get_directory_info',
    description: '获取目录信息。',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: '目录路径（默认: 当前目录）',
        },
        session_id: {
          type: 'string',
          description: '会话 ID',
          default: 'default',
        },
      },
    },
  },

  // 上传文件
  terminal_upload_file: {
    name: 'terminal_upload_file',
    description: '上传文件到远程系统。将 Base64 编码的内容写入指定路径。',
    inputSchema: {
      type: 'object',
      properties: {
        remote_path: {
          type: 'string',
          description: '远程文件路径',
        },
        content: {
          type: 'string',
          description: '文件内容（Base64 编码）',
        },
        session_id: {
          type: 'string',
          description: '会话 ID',
          default: 'default',
        },
        overwrite: {
          type: 'boolean',
          description: '是否覆盖已存在的文件（默认: true）',
          default: true,
        },
        create_dirs: {
          type: 'boolean',
          description: '是否创建父目录（默认: true）',
          default: true,
        },
        mode: {
          type: 'string',
          description: '文件权限（八进制，如 "755"）',
        },
        timeout: {
          type: 'number',
          description: '超时时间（毫秒，默认: 60000）',
          default: 60000,
        },
      },
      required: ['remote_path', 'content'],
    },
  },

  // 下载文件
  terminal_download_file: {
    name: 'terminal_download_file',
    description: '从远程系统下载文件。返回 Base64 编码的内容。',
    inputSchema: {
      type: 'object',
      properties: {
        remote_path: {
          type: 'string',
          description: '远程文件路径',
        },
        session_id: {
          type: 'string',
          description: '会话 ID',
          default: 'default',
        },
        max_size: {
          type: 'number',
          description: '最大文件大小（字节，默认: 10MB）',
          default: 10485760,
        },
        timeout: {
          type: 'number',
          description: '超时时间（毫秒，默认: 30000）',
          default: 30000,
        },
      },
      required: ['remote_path'],
    },
  },

  // 列出目录
  terminal_list_directory: {
    name: 'terminal_list_directory',
    description: '列出远程目录内容。',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: '目录路径',
        },
        session_id: {
          type: 'string',
          description: '会话 ID',
          default: 'default',
        },
        recursive: {
          type: 'boolean',
          description: '是否递归列出（默认: false）',
          default: false,
        },
        timeout: {
          type: 'number',
          description: '超时时间（毫秒，默认: 30000）',
          default: 30000,
        },
      },
      required: ['path'],
    },
  },
} as const;

/**
 * 工具名称类型
 */
export type ToolName = keyof typeof TOOL_DEFINITIONS;
