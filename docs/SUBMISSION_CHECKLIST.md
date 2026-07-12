# GoalChain — Hackathon Submission Checklist

## Superteam Earn Requirements

### 1. Demo Video (Up to 5 Minutes) ✅
- [ ] Record with Loom/YouTube — follow DEMO_VIDEO_SCRIPT.md
- [ ] Show live TxLINE data flowing in (SSE stream visible)
- [ ] Show wallet bet placement (real Solana tx)
- [ ] Show settlement via TxLINE proof
- [ ] Show ProofVerifier page
- [ ] Upload to YouTube (unlisted) or Loom

### 2. Public Repo ✅
- [ ] Push to GitHub: `https://github.com/YOUR_USERNAME/goalchain`
- [ ] README.md is clear and comprehensive ✅
- [ ] All code committed
- [ ] No secret keys in repo (.env.example only)

### 3. Application Access ✅
- [ ] Deploy frontend to Vercel: `npx vercel --prod`
- [ ] Deploy backend to Railway or Render
- [ ] Contract deployed to Devnet: `anchor deploy --provider.cluster devnet`
- [ ] Working URL to share with judges

### 4. Brief Technical Documentation ✅
Copy this into the Superteam submission form:

---
**GoalChain** is a fully trustless World Cup prediction market on Solana.

**Core Idea:** Users predict match outcomes (match winner, total goals, BTTS) with SOL locked in PDA escrow. When a match ends, our Anchor program CPIs into TxLINE's `validate_stat` instruction — verifying the result cryptographically on-chain before releasing winnings to winners.

**Business/Technical Highlights:**
- On-chain escrow via PDA — funds never touch our wallets
- Automatic settlement via keeper bot (no human admin)
- TxLINE CPI is the trust anchor — if `validate_stat` passes, outcome is cryptographically verified
- Real-time score ticker and odds updates via TxLINE SSE stream
- ProofVerifier page shows full Merkle proof trail for every settled market

**TxLINE Endpoints Used:**
- `POST /auth/guest/start` — authentication
- `GET /api/fixtures` — World Cup schedule
- `GET /api/scores/soccer/snapshot` — current scores
- `GET /api/scores/soccer/stream` (SSE) — real-time score events
- `GET /api/odds/stream` (SSE) — live odds updates
- `GET /api/scores/soccer/proof/:matchId` — Merkle proof for settlement
- On-chain: `validate_stat` CPI (Devnet: `6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J`)

**Network:** Solana Devnet for contract; TxLINE Devnet/Mainnet free tier

---

### 5. Feedback on TxLINE API ✅
Copy into submission form:

---
**What we liked most:**
- SSE stream design is very clean — single connection, typed events, heartbeat keeps it alive
- Merkle proof structure is elegant and perfect for on-chain CPI integration
- Free hackathon tier with no credit card was truly friction-free
- The normalized JSON schema across competitions scales really well

**Where we hit friction:**
- Initial on-chain subscription requires a live Solana wallet tx — hard to mock in automated tests; a test-mode endpoint or mock JWT option would help CI pipelines enormously
- We'd love a webhook option as an alternative to SSE for backend environments where SSE reconnect logic is extra work
- More example code for the on-chain CPI `validate_stat` call would help (we reverse-engineered the discriminator)
- The IDL/types in the devnet runnable examples could be more prominently linked from the quickstart

---

## Technical Deployment Steps

### Contract (Devnet)
```bash
cd contracts/prediction-market
anchor build
anchor deploy --provider.cluster devnet
# Copy program ID from output → update frontend/lib/solana.ts and backend/.env
```

### Backend (Railway)
```bash
cd backend
railway init
railway up
# Set env vars in Railway dashboard:
# TXLINE_API_URL, TXLINE_API_TOKEN, TXLINE_JWT
# SOLANA_RPC, PROGRAM_ID, KEEPER_KEYPAIR_BASE64
```

### Frontend (Vercel)
```bash
cd frontend
vercel deploy --prod
# Set env vars:
# NEXT_PUBLIC_API_URL=https://your-backend.railway.app
# NEXT_PUBLIC_SOLANA_RPC=https://api.devnet.solana.com
# NEXT_PUBLIC_PREDICTION_PROGRAM_ID=C5vNdxLcaMriywhQJzv3Dv8PKDfkfnKWHvqCVnqgEQE5
```

## Pre-Submission Final Check

- [x] `npm run build` passes in frontend with 0 errors
- [x] Backend tests pass: `cd backend && npm test` (79/79)
- [x] Contract compiles: `anchor build` (+ IDL generated)
- [x] Contract test suite passes: `anchor test --skip-build --provider.cluster localnet` (25/25)
- [x] Config + 6 demo markets live on Devnet (`scripts/bootstrap-devnet-markets.mjs`)
- [x] Real on-chain bet verified end-to-end (`scripts/smoke-test-bet.mjs` — 0.01 SOL into escrow)
- [ ] Program upgrade with claim/refund fix deployed (needs ~2.1 SOL Devnet for buffer rent; run `anchor deploy --provider.cluster devnet` once the faucet allows)
- [ ] Live site URL responds with 200
- [ ] Wallet connect works on deployed site
- [ ] TxLINE scores visible in deployed frontend (needs real TXLINE_JWT/TXLINE_API_TOKEN)
- [ ] Demo video is unlisted on YouTube with good audio
- [ ] GitHub repo is public
- [ ] Submission form filled out on Superteam Earn
