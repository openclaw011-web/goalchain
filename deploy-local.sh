#!/usr/bin/env bash
# GoalChain — One-click local deployment script
# Usage: ./deploy-local.sh
set -eu

ROOT="$(cd "$(dirname "$0")" && pwd)"
echo "🏟️  GoalChain — Local Deployment"
echo "================================"

# 1. Backend
echo ""
echo "📡 Starting backend (port 3001)..."
cd "$ROOT/backend"
npm run build 2>/dev/null
node dist/index.js &
BACKEND_PID=$!
echo "   Backend PID: $BACKEND_PID"
sleep 2

# 2. Frontend
echo ""
echo "🖥️  Starting frontend (port 3000)..."
cd "$ROOT/frontend"
npm run dev &
FRONTEND_PID=$!
echo "   Frontend PID: $FRONTEND_PID"
sleep 3

echo ""
echo "✅ GoalChain is running!"
echo "   Frontend:  http://localhost:3000"
echo "   Backend:   http://localhost:3001"
echo "   API docs:  http://localhost:3001/api/markets"
echo "   Program:   C5vNdxLcaMriywhQJzv3Dv8PKDfkfnKWHvqCVnqgEQE5 (Devnet)"
echo ""
echo "Press Ctrl+C to stop all services."

cleanup() {
  echo ""
  echo "🛑 Shutting down..."
  kill $BACKEND_PID $FRONTEND_PID 2>/dev/null || true
  exit 0
}
trap cleanup SIGINT SIGTERM

wait
