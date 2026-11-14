#!/bin/zsh
set -e

cd "$(dirname "$0")"

if [ ! -d "node_modules" ]; then
  npm install
fi

npm run build
(sleep 2; open "http://127.0.0.1:8788") &
npm start
