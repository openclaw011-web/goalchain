# ⚽ GoalChain — Trustless World Cup Prediction Markets

> **TxODDS x Superteam Earn Hackathon Submission**
> Track: Prediction Markets and Settlement | Prize Pool: $18,000 USDT

[![Solana](https://img.shields.io/badge/Solana-Devnet-9945FF?logo=solana)](https://devnet.solana.com)
[![TxLINE](https://img.shields.io/badge/Powered_by-TxLINE-00ff88)](https://txline.txodds.com)
[![License](https://img.shields.io/badge/License-MIT-blue)](./LICENSE)

---

## What is GoalChain?

GoalChain is a **fully trustless, on-chain prediction market** for the 2026 FIFA World Cup. Users predict match outcomes (winner, total goals, first scorer) and have their winnings **automatically settled** using cryptographic Merkle proofs from TxLINE — no trusted admin, no manual resolution.

### The Core Innovation

1. A user bets SOL on "Argentina wins vs Brazil"
2. When the match ends, TxLINE streams the verified result with a Merkle proof anchored on Solana
3. A keeper bot (or anyone) calls `settle_market` on our Anchor program
4. Our program CPIs into TxLINE's `validate_stat` instruction — confirming the outcome is cryptographically true
5. All winners can now claim their proportional share of the pool — **with no trust required**

### On-Chain Evidence (Devnet — verify it yourself)

| What | Where |
|---|---|
| Program | [`C5vNdxLcaMriywhQJzv3Dv8PKDfkfnKWHvqCVnqgEQE5`](https://explorer.solana.com/address/C5vNdxLcaMriywhQJzv3Dv8PKDfkfnKWHvqCVnqgEQE5?cluster=devnet) |
| Live demo market (ARG vs BRA, id 101) | [`5SuVuPFq7pet5WnNhiAESfRyERcfaFmVnjvkjKjiHiua`](https://explorer.solana.com/address/5SuVuPFq7pet5WnNhiAESfRyERcfaFmVnjvkjKjiHiua?cluster=devnet) |
| Real bet into escrow (0.01 SOL) | [transaction](https://explorer.solana.com/tx/2PVPRzPMtxs2Z31er4mj96s211NzHrvUpdhipPWRv2UHfbkrWWrkcd5sa6RntEFcFY9ModVZMc7g3NtG8a9V5t4K?cluster=devnet) |
| Test suites | 25/25 on-chain lifecycle tests (incl. settle-via-CPI → claim payouts) · 88/88 backend · frontend builds clean |

---

## Architecture

```
┌────────────────────────────────────────────────────┐
│                    GoalChain                        │
├──────────┬──────────────┬───────────────────────────┤
│ Frontend │   Backend    │    Solana Program          │
│ Next.js  │  Node/TS     │    (Anchor 0.31)           │
│ Vercel   │  Railway     │    Devnet                  │
└──────────┴──┬───────────┴────────────┬──────────────┘
              │                        │
              ▼                        ▼
       ┌──────────────┐    ┌──────────────────────┐
       │   TxLINE     │    │   TxLINE Program     │
       │  SSE Stream  │    │  validate_stat CPI   │
       │  (Real-time) │    │  (On-chain Oracle)   │
       └──────────────┘    └──────────────────────┘
```

### Components

| Layer | Tech | Purpose |
|---|---|---|
| **Smart Contract** | Rust + Anchor 0.31 | Market creation, escrow, settlement, payout |
| **Backend** | Node.js + TypeScript | TxLINE SSE ingestion, WebSocket relay, keeper bot |
| **Frontend** | Next.js 14 + Tailwind | User interface, wallet connect, bet placement |
| **Oracle** | TxLINE (TxODDS) | Cryptographically verified match data |
| **Blockchain** | Solana Devnet | Settlement, escrow, trustless payout |

---

## TxLINE Integration

We use TxLINE in **three complementary ways**:

### 1. Real-Time SSE Feed (Off-Chain)
```typescript
// backend/src/services/txline.service.ts
const stream = new EventSource(`${TXLINE_API}/api/scores/soccer/stream`, {
  headers: { Authorization: `Bearer ${jwt}`, 'X-Api-Token': apiToken }
});
stream.onmessage = (event) => processMatchEvent(JSON.parse(event.data));
```

### 2. Odds Feed for Market Making
```typescript
// Auto-populate initial odds from TxLINE consensus odds
const odds = await fetchOddsSnapshot(matchId);
await createMarket({ matchId, homeOdds: odds.home, awayOdds: odds.away, drawOdds: odds.draw });
```

### 3. On-Chain Proof Verification (The Crown Jewel)
```rust
// settle_market(winning_outcome: u8, proof_data: Vec<u8>)
// proof_data = borsh-serialized validate_stat args, built off-chain by the
// keeper and forwarded verbatim after the Anchor discriminator — so a
// TxLINE payload change never requires redeploying our program.
let mut instruction_data =
    hash(b"global:validate_stat").to_bytes()[..8].to_vec();
instruction_data.extend_from_slice(&proof_data);
invoke(&Instruction { program_id: TXLINE_DEVNET, accounts, data: instruction_data }, ..)?;
// CPI failure reverts settle_market — no valid proof, no settlement ✓
```

---

## Market Types

| Type | Description | Example |
|---|---|---|
| `match_winner` | Who wins the match? | Argentina / Draw / Brazil |
| `over_under_goals` | Total goals over/under a threshold | Over 2.5 / Under 2.5 |
| `first_scorer` | Which team scores first? | Team A / Team B / No Goals |
| `btts` | Both teams to score? | Yes / No |

---

## Quick Start

### Prerequisites
- Node.js 20+
- Rust + Cargo
- Solana CLI
- Anchor 0.31.x
- A Solana wallet (Phantom/Backpack)

### 1. Clone & Install
```bash
git clone https://github.com/yourusername/goalchain
cd goalchain

# Backend
cd backend && npm install

# Frontend  
cd ../frontend && npm install

# Contracts
cd ../contracts/prediction-market && npm install
```

### 2. Configure
```bash
# Backend
cp backend/.env.example backend/.env
# Add your TxLINE API token and Solana keypair

# Frontend
cp frontend/.env.example frontend/.env.local
# Set NEXT_PUBLIC_API_URL and NEXT_PUBLIC_SOLANA_RPC
```

### 3. Deploy Contract (Devnet)
```bash
cd contracts/prediction-market
anchor build
anchor deploy --program-name prediction_market --provider.cluster devnet
```

> Already deployed at [`C5vNdxLcaMriywhQJzv3Dv8PKDfkfnKWHvqCVnqgEQE5`](https://explorer.solana.com/address/C5vNdxLcaMriywhQJzv3Dv8PKDfkfnKWHvqCVnqgEQE5?cluster=devnet) — skip this step unless you fork the program.

### 3b. Bootstrap Demo Markets (Devnet)
```bash
cd scripts && npm install
node bootstrap-devnet-markets.mjs   # idempotent: initializes config + creates demo markets
node smoke-test-bet.mjs             # optional: places a real 0.01 SOL bet to verify the flow
```

### 3c. Run the On-Chain Test Suite (25 tests, local validator)
```bash
cd contracts/prediction-market
anchor test --skip-build --provider.cluster localnet
```

### 4. Run Backend
```bash
cd backend
npm run dev
# Server starts at http://localhost:3001
```

### 5. Run Frontend
```bash
cd frontend
npm run dev
# App starts at http://localhost:3000
```

---

## TxLINE Endpoints Used (verified against the live Devnet API)

| Endpoint | Purpose |
|---|---|
| `POST /auth/guest/start` | Get guest JWT for auth |
| On-chain `subscribe(service_level, weeks)` | Activate subscription (see `scripts/txline-subscribe.mjs`) |
| `POST /api/token/activate` | Wallet-signed API-token activation |
| `GET /api/fixtures/snapshot` | Fixture schedule (raw array, incl. World Cup `CompetitionId 72`) |
| `GET /api/scores/snapshot[/:fixtureId]` | Current match scores |
| `GET /api/scores/stream` | Real-time SSE score stream |
| `GET /api/odds/stream` | Real-time SSE odds stream |
| On-chain `validate_stat` CPI | Trustless outcome verification |

**Network:** TxLINE Devnet (real subscription, free tier) + Solana Devnet

---

## Settlement Flow

```
Match Ends → TxLINE emits result with Merkle proof
                    ↓
        Keeper bot fetches proof from TxLINE API
                    ↓
        Keeper calls settle_market(proof) on-chain
                    ↓
        Anchor program CPIs into TxLINE validate_stat
                    ↓
        TxLINE program verifies Merkle proof on-chain
                    ↓
        Market marked Settled with winning_outcome
                    ↓
        Winners call claim_winnings() — funds released from PDA
```

---

## Project Structure

```
goalchain/
├── contracts/
│   └── prediction-market/      # Anchor program (Rust)
│       ├── programs/
│       │   └── prediction-market/
│       │       └── src/
│       │           ├── lib.rs      # Program entrypoint
│       │           ├── state.rs    # Account structs
│       │           ├── errors.rs   # Error codes
│       │           └── instructions/
│       └── tests/              # TypeScript anchor tests
├── backend/
│   └── src/
│       ├── services/
│       │   ├── txline.service.ts   # TxLINE SSE + API
│       │   ├── market.service.ts   # Market lifecycle
│       │   └── solana.service.ts   # On-chain reads/writes
│       ├── routes/             # REST API routes
│       └── db/                 # SQLite persistence
├── frontend/
│   ├── app/                    # Next.js App Router pages
│   ├── components/             # Reusable React components
│   └── lib/                    # API client, Solana hooks
└── docs/
    ├── ARCHITECTURE.md
    ├── TXLINE_INTEGRATION.md
    └── SMART_CONTRACT.md
```

---

## Judging Criteria Coverage

| Criterion | How GoalChain Delivers |
|---|---|
| **Core Functionality** | Live TxLINE SSE ingestion, real-time WebSocket relay, on-chain settlement via CPI into validate_stat |
| **User Experience** | Clean, responsive UI with live score ticker, real-time odds, clear bet flow, and proof verification screen |
| **Code Quality** | Full TypeScript, Anchor idioms, comprehensive tests, extensive comments, error handling |
| **Bonus: Merkle Proof Verification** | ProofVerifier component + on-chain CPI validation — the "Experimental Verification Layer" |
| **Bonus: Custom Settlement Engine** | Full AMM + on-chain settlement via TxLINE CPI — not just a UI on top of TxLINE |

---

## Team Experience with TxLINE

**What worked great:**
- SSE stream schema is clean and well-typed
- Merkle proof structure is elegant for on-chain verification
- Free hackathon tier is genuinely useful

**Pain points / feedback:**
- Initial on-chain subscription flow requires a Solana wallet — harder to mock in tests
- Would love a webhook option as alternative to SSE for server environments
- More example code for the CPI validate_stat integration would help

---

## License

MIT — See [LICENSE](./LICENSE)

---

*Built with ❤️ for the TxODDS x Superteam World Cup Hackathon 2026*
