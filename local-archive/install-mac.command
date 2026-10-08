#!/bin/bash
source "$(dirname "$0")/scripts/mac-common.sh"
printf '安装当前锁定版本的依赖…\n'
if command -v pnpm >/dev/null 2>&1; then
  pnpm install --frozen-lockfile --ignore-scripts
elif command -v npx >/dev/null 2>&1; then
  npx --yes pnpm@11.19.0 install --frozen-lockfile --ignore-scripts
else
  printf '未找到 pnpm 或 npx。请重新安装带 npm 的 Node.js 24 LTS。\n' >&2; exit 1
fi
if [ ! -f vendor/singlefile.js ]; then node scripts/build.mjs; fi
if ! node --no-warnings scripts/doctor.mjs --browser-only; then
  printf '安装与此版本匹配的 Chromium；无需另装 Chrome…\n'
  node node_modules/playwright/cli.js install chromium
fi
node --no-warnings scripts/doctor.mjs
printf '\n环境已安装。以后双击 start-mac.command 启动软件。\n'
