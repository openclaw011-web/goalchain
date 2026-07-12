# GoalChain Technical Architecture

## Overview

GoalChain is a three-layer system:

1. **Solana Anchor Program** — the settlement engine
2. **Node.js Backend** — TxLINE ingestion + keeper bot  
3. **Next.js Frontend** — user interface

---

## Solana Program Design

### Program ID (Devnet)
Deployed at: `GoaLcHaiN...` (set after anchor deploy)

### Account Model

```
MarketConfig (PDA: ["config"])
  - admin: Pubkey
  - fee_bps: u16          (e.g. 100 = 1%)
  - total_markets: u64
  - total_volume: u64

Market (PDA: ["market", match_id_bytes])
  - match_id: String (32 bytes max)
  - market_type: MarketType enum
  - status: MarketStatus enum
  - created_at: i64
  - lock_time: i64
  - resolve_time: i64
  - winning_outcome: u8 (0xFF = unresolved)
  - outcomes: [outcome_label; 3]
  - total_pool: u64
  - outcome_pools: [u64; 3]
  - fee_collected: u64
  - bump: u8

Bet (PDA: ["bet", market, bettor])
  - market: Pubkey
  - bettor: Pubkey
  - outcome: u8
  - amount: u64
  - placed_at: i64
  - claimed: bool
  - bump: u8
```

### Instructions

#### create_market
```
Accounts:
  - admin (signer, mut)
  - market (init, PDA)
  - config (mut)
  - system_program

Args:
  - match_id: String
  - market_type: MarketType
  - lock_time: i64
  - resolve_time: i64
  - outcome_labels: [String; 3]
```

#### place_bet  
```
Accounts:
  - bettor (signer, mut)
  - market (mut)
  - bet (init_if_needed, PDA)
  - escrow (PDA mut — holds SOL)
  - system_program

Args:
  - outcome: u8 (0,1,2)
  - amount: u64 (lamports)

Validation:
  - market.status == Open
  - Clock::get().unix_timestamp < market.lock_time
  - 0 <= outcome <= 2
  - amount > 0
```

#### lock_market
```
Accounts:
  - market (mut)
  - admin OR permissionless if past lock_time

Validation:
  - Clock::get().unix_timestamp >= market.lock_time
  - market.status == Open
```

#### settle_market  
```
Accounts:
  - settler (signer — keeper bot or anyone)
  - market (mut)
  - txline_fixture_account (TxLINE program account)
  - stat_proof (TxLINE program account)
  - txline_program (TxLINE program ID: 6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J)

Args:
  - proof_data: Vec<u8>  (Merkle proof bytes from TxLINE API)

Logic:
  1. market.status == Locked
  2. CPI into txline_program.validate_stat(proof_data)
  3. Parse returned outcome from txline accounts
  4. Set market.winning_outcome
  5. market.status = Settled
  6. Emit MarketSettled event
```

#### claim_winnings
```
Accounts:
  - bettor (signer, mut)
  - market
  - bet (mut)
  - escrow (PDA, mut)
  - system_program

Validation:
  - market.status == Settled
  - bet.bettor == bettor.key()
  - bet.outcome == market.winning_outcome
  - !bet.claimed

Logic:
  - payout = (bet.amount / market.outcome_pools[winning]) * market.total_pool
  - payout -= fee
  - Transfer from escrow PDA to bettor
  - bet.claimed = true
```

---

## TxLINE Integration Points

### 1. SSE Stream (Backend)

```
GET https://txline.txodds.com/api/scores/soccer/stream
Headers:
  Authorization: Bearer {guest_jwt}
  X-Api-Token: {api_token}

Event format (inferred from docs):
{
  "type": "score_update",
  "matchId": "match_2026_arg_fra_0712",
  "homeScore": 2,
  "awayScore": 1,
  "minute": 67,
  "period": "second_half",
  "events": [
    { "type": "goal", "team": "home", "player": "Messi", "minute": 23 },
    { "type": "goal", "team": "away", "player": "Mbappe", "minute": 45 },
    { "type": "goal", "team": "home", "player": "Di Maria", "minute": 67 }
  ]
}
```

### 2. Proof Endpoint (Backend → Solana)

```
GET https://txline.txodds.com/api/scores/soccer/proof/{matchId}
Response:
{
  "matchId": "...",
  "finalScore": { "home": 2, "away": 1 },
  "merkleLeaf": "...",
  "merkleProof": ["...", "..."],
  "merkleRoot": "...",
  "signature": "...",  // ed25519 from TxLINE
  "solanaSlot": 348201447
}
```

### 3. On-Chain CPI

```rust
// In settle_market instruction handler:
let cpi_program = ctx.accounts.txline_program.to_account_info();
let cpi_accounts = txline_cpi::accounts::ValidateStat {
    fixture_account: ctx.accounts.txline_fixture_account.to_account_info(),
    stat_proof: ctx.accounts.stat_proof.to_account_info(),
};
let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
txline_cpi::validate_stat(cpi_ctx, proof_data)?;
```

---

## Backend Service Architecture

```
src/
├── index.ts              # Express + WebSocket server setup
├── services/
│   ├── txline.service.ts # SSE connection manager, auth, event parsing
│   ├── market.service.ts # Market lifecycle (create, lock, settle)
│   ├── keeper.service.ts # Automated settlement trigger (cron-based)
│   └── solana.service.ts # Anchor program client, account reads
├── routes/
│   ├── markets.ts        # GET /api/markets, GET /api/markets/:id
│   ├── fixtures.ts       # GET /api/fixtures
│   ├── live.ts           # GET /api/live (SSE relay), WebSocket hub
│   ├── stats.ts          # GET /api/stats, GET /api/leaderboard
│   └── proofs.ts         # GET /api/markets/:id/proof
├── db/
│   ├── schema.ts         # SQLite schema definitions
│   └── migrations/       # DB migrations
└── types/
    └── txline.ts         # TxLINE data types
```

---

## Frontend Page Architecture

```
app/
├── layout.tsx            # Root layout (wallet provider, query client)
├── page.tsx              # Landing — hero + live ticker + featured markets
├── markets/
│   ├── page.tsx          # Market directory — filter by status/type
│   └── [id]/
│       └── page.tsx      # Market detail — bet form, odds chart, events
├── leaderboard/
│   └── page.tsx          # Top predictors table
└── verify/
    └── [matchId]/
        └── page.tsx      # TxLINE proof display + on-chain verification
```

---

## Settlement Flow Sequence

```
1. TxLINE SSE → Backend receives match_end event
2. Backend keeper: fetchProof(matchId) → TxLINE proof API
3. Backend keeper: buildSettleTransaction(proof) for each open market
4. Backend keeper: sendTransaction() → Solana Devnet
5. Anchor program: validate market.status == Locked
6. Anchor program: CPI → TxLINE validate_stat(proof_data)
7. TxLINE on-chain program: verify Merkle proof
8. Anchor program: set market.winning_outcome
9. Anchor program: emit MarketSettled { market, outcome, total_pool }
10. Frontend: listens for account change → updates UI
11. Winners: call claim_winnings() — escrow released to wallet
```

---

## Judging Optimizations

These are the features specifically designed to score maximum points:

### Core Functionality (40%)
- Full SSE stream integration with reconnect + backpressure
- Real-time WebSocket relay to frontend  
- Automatic keeper bot settlement
- On-chain CPI to TxLINE validate_stat

### User Experience (30%)
- Live score ticker with TxLINE data
- Real-time odds updates
- Countdown to market lock
- Claim flow with transaction confirmation

### Code Quality (30%)  
- Full TypeScript everywhere
- Comprehensive test suite (Anchor tests + Jest)
- Extensive inline documentation
- Error handling for every TxLINE edge case
- Deterministic settlement logic

### Bonus: Merkle Proof Verification
- ProofVerifier component shows step-by-step verification
- Raw JSON display of TxLINE proof
- Links to Solana Explorer for settlement tx
