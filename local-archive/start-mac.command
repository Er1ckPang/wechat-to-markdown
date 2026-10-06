#!/bin/bash
set -e
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo 'Install Node.js 24 LTS first: https://nodejs.org/en/download'; exit 1
fi
node -e "const [major,minor] = process.versions.node.split('.').map(Number); if (major < 22 || (major === 22 && minor < 13)) { console.error('Node.js 22.13+ is required.'); process.exit(1); }"
if node scripts/check-running.mjs; then
  open http://127.0.0.1:17880; exit 0
else
  task_running_status=$?
  if [ "$task_running_status" -ne 2 ]; then exit "$task_running_status"; fi
fi
if [ ! -f node_modules/playwright/package.json ]; then
  if command -v pnpm >/dev/null 2>&1; then pnpm install --frozen-lockfile --ignore-scripts;
  else npm install --ignore-scripts; fi
fi
if [ ! -f vendor/singlefile.js ]; then node scripts/build.mjs; fi
mkdir -p logs
nohup node --no-warnings src/server.mjs >logs/runtime.log 2>logs/errors.log &
for i in $(seq 1 30); do
  if node scripts/check-running.mjs; then break; fi
  sleep 0.3
done
node scripts/check-running.mjs
open http://127.0.0.1:17880
