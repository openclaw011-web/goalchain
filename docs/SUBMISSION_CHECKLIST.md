# GoalChain — Hackathon Submission Checklist

## Superteam Earn Requirements

### 1. Demo Video (Up to 5 Minutes) ✅
- [x] **PRODUCED: `goalchain-demo-final.mp4` (2:53, repo root)** — 12 scenes, every frame real
      (live product UI, real Devnet txs on Explorer, live TxLINE connection, fresh 26-test run,
      deployed-binary payout verification), with **voice narration** (12 clips in `demo/audio/`,
      loudness-normalized to −16 LUFS, faststart for streaming).
      Reproducible pipeline in `demo/` (`record.mjs` → `assemble.mjs`).
      Caption-only fallback (`captions.mjs`) still available if a silent-friendly cut is needed.
- [ ] Upload to YouTube (unlisted) — title/description ready in `demo/youtube-metadata.md`

### 2. Public Repo ✅
- [x] Pushed to GitHub: **https://github.com/openclaw011-web/goalchain** (public, default branch `main`, CI running)
- [x] README.md is clear and comprehensive ✅
- [x] All code committed (clean tree on `main`)
- [x] No secret keys in repo (.env.example only; real TxLINE creds in gitignored backend/.env*)

### 3. Application Access
- [x] Frontend live on Vercel: **https://goalchain-opal.vercel.app**
- [x] Contract deployed to Devnet: `C5vNdxLcaMriywhQJzv3Dv8PKDfkfnKWHvqCVnqgEQE5`
- [~] Backend on Render — service **created** as `goalchain-api`
      (`https://goalchain-api.onrender.com`, `srv-d9ae9gmcjfls739nd730`, free plan,
      Blueprint from `render.yaml`; 3 secrets set: `TXLINE_JWT`, `TXLINE_API_TOKEN`,
      `SOLANA_KEEPER_PRIVATE_KEY` as base64). **First build failed — needs a fix + redeploy.**
- [ ] Point Vercel `NEXT_PUBLIC_API_URL` at the Render backend once it's live, then redeploy frontend
      (until then the frontend gracefully serves demo/mock data via `lib/api.ts` fallback)

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

**TxLINE Endpoints Used (verified against the live Devnet API with a real subscription):**
- `POST /auth/guest/start` — guest JWT
- On-chain `subscribe(service_level, weeks)` + `POST /api/token/activate` — real subscription (see `scripts/txline-subscribe.mjs`)
- `GET /api/fixtures/snapshot` — World Cup schedule (CompetitionId 72)
- `GET /api/scores/snapshot[/:fixtureId]` — current scores
- `GET /api/scores/stream` (SSE) — real-time score events
- `GET /api/odds/stream` (SSE) — live odds updates
- On-chain: `validate_stat` CPI (Devnet: `6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J`) — `settle_market` forwards keeper-built proof bytes verbatim

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
anchor deploy --program-name prediction_market --provider.cluster devnet
# Copy program ID from output → update frontend/lib/solana.ts and backend/.env
```

### Backend (Render — one click) ← chosen path
Render dashboard → **New → Blueprint** → select this repo. `render.yaml`
preconfigures the service (`plan: free`); you are prompted only for the secrets
(`TXLINE_JWT`, `TXLINE_API_TOKEN`, `SOLANA_KEEPER_PRIVATE_KEY` — values in
the local gitignored `backend/.env` / `.env.txline`). The keeper key must be the
**base64 encoding of the secret-key byte array** (`base64 ~/.config/solana/id.json`'s
JSON array of bytes), since `solana.service.ts` decodes it with `Buffer.from(key,'base64')`.
Already created as `goalchain-api` (`https://goalchain-api.onrender.com`).

### Backend (Railway alternative)
```bash
cd backend
railway init && railway up
# Set the same env vars as render.yaml in the Railway dashboard
```
> ⚠️ Railway's free trial has expired for this account — `railway init` now demands a
> paid plan. Use Render (above) unless you're adding a Railway subscription.

### Frontend (Vercel)
```bash
cd frontend
vercel deploy --prod
# frontend/vercel.json presets NEXT_PUBLIC_SOLANA_RPC and
# NEXT_PUBLIC_PREDICTION_PROGRAM_ID; set only:
# NEXT_PUBLIC_API_URL=https://<your-backend>.onrender.com/api
```

## Pre-Submission Final Check

- [x] `npm run build` passes in frontend with 0 errors
- [x] Backend tests pass: `cd backend && npm test` (95/95 incl. keeper bot + World-Cup market filter)
- [x] Contract compiles: `anchor build` (+ IDL generated)
- [x] Contract test suite passes: `anchor test --skip-build --provider.cluster localnet` (26/26)
- [x] Config + 6 demo markets live on Devnet (`scripts/bootstrap-devnet-markets.mjs`)
- [x] Real on-chain bet verified end-to-end (`scripts/smoke-test-bet.mjs` — 0.01 SOL into escrow)
- [x] Program upgrade deployed (claim/refund payout fix + settle_market proof pass-through) — tx `4HxXjqybbuaonvacMv156XMCW2B7DbNMi6KUNmRQd5XqM2AC3STaAM7oqmtDELz7Cnmq48TtDsxyQ7D3z99tBDqs`
- [x] PDA payout verified on the deployed binary (`scripts/verify-payout-devnet.mjs` — refund_bet moved 0.01 SOL out of escrow)
- [x] GitHub repo is public: https://github.com/openclaw011-web/goalchain
- [x] Live site URL responds with 200: **https://goalchain-opal.vercel.app** (all 5 routes verified in production; Render backend build pending — frontend serves demo data until then)
- [ ] Wallet connect works on deployed site
- [ ] Render backend build green + `/health` shows `txline.scoresConnected: true` and `keeper.running: true` (proves the 3 secrets took)
- [ ] TxLINE scores visible in deployed frontend (after `NEXT_PUBLIC_API_URL` points at the Render backend)
- [x] Demo video produced with voice narration (`goalchain-demo-final.mp4`, 2:53) — pending YouTube upload
- [ ] Submission form filled out on Superteam Earn
