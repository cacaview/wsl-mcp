/**
 * 输出处理工具
 * 
 * 清理终端输出中的 ANSI 转义序列和其他控制字符
 */

/**
 * 清理终端输出
 * 
 * 移除 ANSI 转义序列、控制字符和其他不需要的内容
 */
export function cleanOutput(output: string): string {
  let result = output;

  // 移除 ANSI 颜色和样式序列
  // \x1b[...m - SGR (Select Graphic Rendition)
  result = result.replace(/\x1b\[[0-9;]*m/g, '');

  // 移除 ANSI 光标控制序列
  // \x1b[...A/B/C/D - 光标移动
  // \x1b[...H/f - 光标定位
  // \x1b[...J/K - 清屏/清行
  result = result.replace(/\x1b\[[0-9;]*[ABCDHfJK]/g, '');

  // 移除 OSC 序列 (Operating System Command)
  // \x1b]...BEL 或 \x1b]...ST
  result = result.replace(/\x1b\][^\x07\x1b]*(\x07|\x1b\\)/g, '');

  // 移除其他 ANSI 控制序列
  result = result.replace(/\x1b[()[\]#+.][A-Za-z0-9]?/g, '');
  result = result.replace(/\x1b[><=]/g, '');

  // 移除 CSI 序列 (Control Sequence Introducer)
  result = result.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');

  // 移除私有模式序列
  // [?2004h/l - bracketed paste mode
  // [?25h/l - cursor visibility
  // 注意：ESC 可能已经被移除，所以也要匹配残留的 [?... 模式
  // 注意：? 在正则中是特殊字符（表示0或1次），需要转义为 \?
  result = result.replace(/\[\?[0-9]+[hl]/g, '');
  // 匹配残留的 ?2004h/l 模式（? 需要转义）
  // 使用转义的 \? 来匹配字面量 ?
  result = result.replace(/\?[0-9]+[hl]/g, '');

  // 移除回车符（保留换行）
  result = result.replace(/\r\n/g, '\n');
  result = result.replace(/\r/g, '\n');

  // 移除退格符
  result = result.replace(/[\x08]/g, '');

  // 移除响铃符
  result = result.replace(/[\x07]/g, '');

  // 移除空转义序列
  result = result.replace(/\x1b(?!\[)/g, '');

  // 规范化换行符
  result = result.replace(/\n{3,}/g, '\n\n');

  // 移除行首/行尾空白
  result = result.split('\n').map(line => line.trimEnd()).join('\n');

  return result.trim();
}

/**
 * 清理命令回显
 * 
 * 从输出中移除命令回显行
 */
export function cleanCommandEcho(output: string, command: string): string {
  const lines = output.split('\n');
  const commandFirstWord = command.split(' ')[0];
  let commandEchoSkipped = false;

  return lines.filter(line => {
    const trimmed = line.trim();

    // 跳过空行
    if (trimmed === '') return false;

    // 跳过命令回显（第一行包含命令的第一个词）
    if (!commandEchoSkipped && commandFirstWord && trimmed.includes(commandFirstWord)) {
      commandEchoSkipped = true;
      return false;
    }

    return true;
  }).join('\n');
}

/**
 * 清理 Shell 提示符
 */
export function cleanPrompt(output: string): string {
  const lines = output.split('\n');

  return lines.filter(line => {
    const trimmed = line.trim();

    // 移除常见提示符模式
    // (base) user@host:~$
    // (base)user@host:~$ (无空格版本)
    // [READY]$
    // $
    // #
    // >
    // ❯
    if (trimmed.match(/^\(.+\)\s*[@$#]/)) return false;
    if (trimmed.match(/^\(.+\)[@$#]/)) return false;
    if (trimmed.match(/^\[.+\][@$#]/)) return false;
    if (trimmed.match(/^[$#>]\s*$/)) return false;
    if (trimmed.match(/^❯\s*$/)) return false;
    if (trimmed.match(/^~\s*$/)) return false;
    if (trimmed.match(/^%\s*$/)) return false;

    // 移除带颜色的提示符（清理后可能只剩下部分）
    if (trimmed.match(/^user@.*:\~?\$?\s*$/)) return false;
    if (trimmed.match(/^user@.*:\S+\$?\s*$/)) return false;
    
    // 移除包含提示符后跟 echo 命令的行
    // 例如：(base)user@host:~$echo'===EXIT...'
    if (trimmed.match(/^\(.*\).*@.*:.*\$echo/)) return false;
    if (trimmed.match(/^.*@.*:.*\$echo/)) return false;
    
    // 移除包含 echo 命令的提示符行
    if (trimmed.includes("echo'===")) return false;
    if (trimmed.includes('echo "===')) return false;

    return true;
  }).join('\n');
}

/**
 * 清理标记行
 */
export function cleanMarkers(output: string, markers: {
  startMarker: string;
  endMarker: string;
  exitMarker: string;
}): string {
  const lines = output.split('\n');

  return lines.filter(line => {
    const trimmed = line.trim();

    // 移除标记行
    if (trimmed.includes(markers.startMarker)) return false;
    if (trimmed.includes(markers.endMarker)) return false;
    if (trimmed.includes(markers.exitMarker)) return false;

    // 移除 echo 命令（用于输出标记）
    if (trimmed.match(/^echo\s+['"].*===/)) return false;

    return true;
  }).join('\n');
}

/**
 * 完整的输出清理
 */
export function fullCleanOutput(
  output: string, 
  command: string,
  markers?: {
    startMarker: string;
    endMarker: string;
    exitMarker: string;
  }
): string {
  let result = output;

  // 先清理 ANSI 序列
  result = cleanOutput(result);

  // 清理标记
  if (markers) {
    result = cleanMarkers(result, markers);
  }

  // 清理命令回显
  result = cleanCommandEcho(result, command);

  // 清理提示符
  result = cleanPrompt(result);

  // 最终清理
  result = result.trim();

  return result;
}
