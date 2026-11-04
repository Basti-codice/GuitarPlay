#!/usr/bin/env bash
# GuitarPlay launcher for macOS / Linux
cd "$(dirname "$0")"
command -v node >/dev/null || { echo "Node.js 20+ is required: https://nodejs.org"; exit 1; }
[ -d node_modules ] || npm install
[ -d dist ] || npm run build
echo "GuitarPlay: http://localhost:4173"
npm run preview
