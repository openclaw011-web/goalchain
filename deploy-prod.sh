#!/usr/bin/env bash
# GoalChain — Production deployment script
# Deploys frontend to Vercel and backend to Render/Railway
set -eu

ROOT="$(cd "$(dirname "$0")" && pwd)"
echo "🚀 GoalChain — Production Deployment"
echo "======================================"

PROGRAM_ID="C5vNdxLcaMriywhQJzv3Dv8PKDfkfnKWHvqCVnqgEQE5"
echo "📋 On-chain program: $PROGRAM_ID"

# ─── Frontend (Vercel) ───
echo ""
echo "Step 1: Deploy frontend to Vercel..."
if ! command -v vercel &>/dev/null; then
  echo "  ⚠️  vercel CLI not found. Install: npm i -g vercel"
  echo "  Then run: cd frontend && vercel --prod"
else
  cd "$ROOT/frontend"
  echo "  Running: vercel --prod"
  echo "  (You may need to run 'vercel login' first)"
  vercel --prod --yes \
    -e NEXT_PUBLIC_API_URL=https://goalchain-api.onrender.com/api \
    -e NEXT_PUBLIC_SOLANA_RPC=https://api.devnet.solana.com \
    -e NEXT_PUBLIC_PREDICTION_PROGRAM_ID=$PROGRAM_ID \
    2>&1 || echo "  ⚠️  Vercel deploy failed — run manually: cd frontend && vercel --prod"
fi

# ─── Backend (Render) ───
echo ""
echo "Step 2: Deploy backend..."
echo "  Option A — Render (https://render.com):"
echo "    1. Create a new Web Service, link your repo"
echo "    2. Root directory: backend/"
echo "    3. Build command: npm install && npm run build"
echo "    4. Start command: node dist/index.js"
echo "    5. Environment variables:"
echo "       PORT=3001"
echo "       SOLANA_RPC_URL=https://api.devnet.solana.com"
echo "       SOLANA_PROGRAM_ID=$PROGRAM_ID"
echo "       NODE_ENV=production"
echo ""
echo "  Option B — Railway (https://railway.app):"
echo "    cd backend && railway up"

# ─── Summary ───
echo ""
echo "📋 Deployment Checklist:"
echo "  ✅ Smart contract deployed: $PROGRAM_ID (Devnet)"
echo "  ⬜ Frontend: deploy to Vercel (see above)"
echo "  ⬜ Backend: deploy to Render/Railway (see above)"
echo "  ⬜ Set NEXT_PUBLIC_API_URL in Vercel to your backend URL"
echo "  ⬜ Set TXLINE_API_TOKEN and TXLINE_JWT in backend env"
echo ""
echo "📌 Solana Explorer:"
echo "  https://explorer.solana.com/address/$PROGRAM_ID?cluster=devnet"
