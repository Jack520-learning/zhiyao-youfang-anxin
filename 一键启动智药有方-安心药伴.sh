#!/usr/bin/env bash
set -e

cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  printf '%s\n' "未找到 Node.js。请先安装 Node.js 20.19 或更高版本。"
  exit 1
fi

if [ ! -d "node_modules" ]; then
  npm install
fi

npm run launch
