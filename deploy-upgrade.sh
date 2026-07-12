#!/usr/bin/env bash
# GoalChain — one-command Devnet program upgrade
#
# Ships the claim/refund fix to the deployed program
# (C5vNdxLcaMriywhQJzv3Dv8PKDfkfnKWHvqCVnqgEQE5) and re-vendors the IDL
# into the backend and frontend. Idempotent — safe to re-run.
#
# Needs ~2.2 SOL on the upgrade-authority wallet (buffer rent, refunded
# after the upgrade lands). If the CLI faucet is rate-limited, grab SOL
# from https://faucet.solana.com and re-run.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
PROGRAM_ID="C5vNdxLcaMriywhQJzv3Dv8PKDfkfnKWHvqCVnqgEQE5"
NEEDED_SOL="2.2"

BAL=$(solana balance --url devnet | awk '{print $1}')
echo "Wallet balance: $BAL SOL (need ~$NEEDED_SOL for the upgrade buffer)"
if awk "BEGIN{exit !($BAL < $NEEDED_SOL)}"; then
  echo "Requesting airdrop..."
  if ! solana airdrop 2 --url devnet; then
    echo ""
    echo "❌ Faucet rate-limited. Get Devnet SOL at https://faucet.solana.com"
    echo "   (wallet: $(solana address)) and re-run ./deploy-upgrade.sh"
    exit 1
  fi
fi

cd "$ROOT/contracts/prediction-market"
echo "Building program..."
anchor build

echo "Upgrading $PROGRAM_ID on Devnet..."
anchor deploy --program-name prediction_market --provider.cluster devnet

echo "Re-vendoring IDL into backend/ and frontend/..."
cp target/idl/prediction_market.json "$ROOT/backend/idl/prediction_market.json"
cp target/idl/prediction_market.json "$ROOT/frontend/lib/idl/prediction_market.json"

echo ""
echo "✅ Program upgraded — claim_winnings / refund_bet payout fix is live."
echo "   https://explorer.solana.com/address/$PROGRAM_ID?cluster=devnet"
echo "   Remember to commit the re-vendored IDL if it changed."
