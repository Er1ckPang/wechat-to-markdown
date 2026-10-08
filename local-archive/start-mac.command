#!/bin/bash
source "$(dirname "$0")/scripts/mac-common.sh"
if [ ! -f node_modules/playwright/package.json ]; then
  printf '首次使用请先双击 install-mac.command 安装环境。\n' >&2; exit 1
fi
node --no-warnings scripts/start.mjs
