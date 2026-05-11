#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
UPLOADER_DIR="$SCRIPT_DIR/tools/uploader"

cd "$UPLOADER_DIR"

if [ ! -d node_modules ]; then
  npm install
fi

npm start
