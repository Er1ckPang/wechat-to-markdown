#!/bin/bash
# Compatible with the Bash 3.2 shipped by macOS; never source arbitrary shell profiles.
set -euo pipefail
task_app_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
cd "$task_app_root"
export PATH="$PATH:/opt/homebrew/bin:/usr/local/bin"
export LANG="${LANG:-en_US.UTF-8}"
task_pause_on_exit() {
  task_exit_status=$?
  if [ "$task_exit_status" -ne 0 ]; then printf '\n操作未完成，请查看上面的提示。安装与排障见 public/mac-guide.html。\n'; fi
  if [ -t 0 ] && [ "${WX2MD_NO_PAUSE:-0}" != '1' ]; then read -r -p '按回车关闭此窗口… ' task_reply || true; fi
}
trap task_pause_on_exit EXIT
if [ "$(uname -s)" != 'Darwin' ]; then printf '此启动文件用于 Mac；Windows 请双击启动工具.cmd。\n' >&2; exit 1; fi
task_node_usable() {
  "$1" -e 'const [major,minor]=process.versions.node.split(".").map(Number);process.exit(major>22||(major===22&&minor>=13)?0:1)' >/dev/null 2>&1
}
task_node="$(command -v node || true)"
if [ -z "$task_node" ] || ! task_node_usable "$task_node"; then
  for task_node_bin in /opt/homebrew/opt/node@24/bin /usr/local/opt/node@24/bin /opt/homebrew/bin /usr/local/bin; do
    if [ -x "$task_node_bin/node" ] && task_node_usable "$task_node_bin/node"; then
      export PATH="$task_node_bin:$PATH"
      task_node="$task_node_bin/node"
      break
    fi
  done
fi
if [ -z "$task_node" ]; then
  printf '未找到 Node.js。请从 https://nodejs.org/en/download 安装 macOS 版 Node.js 24 LTS，然后重新打开终端。\n' >&2
  exit 1
fi
node -e 'const [major,minor]=process.versions.node.split(".").map(Number);if(major<22||(major===22&&minor<13)){console.error("需要 Node.js 22.13+，建议安装 Node.js 24 LTS。");process.exit(1)}'
