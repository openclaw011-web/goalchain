# TxLINE Integration Guide

## Overview

GoalChain integrates with TxLINE at three levels:
1. Off-chain data streaming (SSE)
2. REST API for snapshots and proofs
3. On-chain CPI via `validate_stat`

---

## Authentication

TxLINE uses a two-credential system:

```typescript
// Step 1: Get guest JWT (ephemeral, renew on 401)
const { token: jwt } = await axios.post(
  'https://txline.txodds.com/auth/guest/start'
).then(r => r.data);

// Step 2: On-chain subscription tx (done once)
// (See Quickstart docs for Anchor subscription code)

// Step 3: Activate API token (tied to subscription tx)
const { token: apiToken } = await axios.post(
  'https://txline.txodds.com/api/token/activate',
  { txSig, walletSignature, leagues: [] },
  { headers: { Authorization: `Bearer ${jwt}` } }
).then(r => r.data);

// All data API calls:
const headers = {
  'Authorization': `Bearer ${jwt}`,
  'X-Api-Token': apiToken,
};
```

---

## API Endpoints Used

> These are the paths **verified against the live TxLINE Devnet API** with a
> real subscription (see `scripts/txline-subscribe.mjs`). The subscription
> itself is an on-chain `subscribe(service_level_id, weeks)` call on the
> txoracle program — free tier (level 1) costs 0 TXL but requires the TXL
> Token-2022 ATA to exist.

### Fixtures
```
GET /api/fixtures/snapshot
Response: raw array of entries:
  [{
    FixtureId: number,          // numeric id — we use it as on-chain market_id
    Competition: string,        // "World Cup" (CompetitionId 72)
    CompetitionId: number,
    Participant1: string, Participant2: string,
    Participant1IsHome: boolean,
    StartTime: number (epoch ms),
    GameState: string | number,
  }, ...]
```
Normalised in `backend/src/services/txline.service.ts` (fetchFixtures).

### Scores Snapshot
```
GET /api/scores/snapshot[/:fixtureId]
Response: {
  matches: [{
    matchId: string,
    status: "not_started" | "first_half" | "half_time" | "second_half" | "full_time",
    minute: number,
    homeScore: number,
    awayScore: number,
    events: MatchEvent[]
  }]
}
```

### SSE Scores Stream
```
GET /api/scores/stream
Content-Type: text/event-stream

Events:
- data: { type: "score_update", matchId, homeScore, awayScore, minute }
- data: { type: "match_event", matchId, event: { type, team, player, minute } }
- data: { type: "match_start", matchId, kickoff }
- data: { type: "match_end", matchId, finalScore }
- data: { type: "heartbeat" }
```

### SSE Odds Stream  
```
GET /api/odds/stream
Content-Type: text/event-stream

Events:
- data: { type: "odds_update", matchId, home, draw, away, timestamp }
```

### Settlement Proof
```
(path to be confirmed — the proof material corresponds to the daily
 insert_scores_root / insert_batch_root anchors in the txoracle program;
 see scripts/idl/txoracle.json)
GET /api/scores/proof/{matchId}   # assumed shape below
Response: {
  matchId: string,
  finalScore: { home: number, away: number },
  winner: "home" | "away" | "draw",
  merkleLeaf: string,       // hex string
  merkleProof: string[],    // array of hex strings
  merkleRoot: string,       // hex string
  verified: boolean,
  solanaSlot: number,
  timestamp: string
}
```

---

## On-Chain CPI to validate_stat

TxLINE's Solana program exposes a `validate_stat` instruction that verifies Merkle proofs on-chain. Our Anchor program calls this via CPI in `settle_market`.

### TxLINE Program IDs
- **Mainnet**: `9ExbZjAapQww1vfcisDmrngPinHTEfpjYRWMunJgcKaA`
- **Devnet**: `6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J`

### Real validate_stat signature (from the on-chain IDL)

`anchor idl fetch 6pW64...yP2J` → `scripts/idl/txoracle.json`:

```
validate_stat(
  ts: i64,
  fixture_summary: ScoresBatchSummary,
  fixture_proof: Vec<ProofNode>,
  main_tree_proof: Vec<ProofNode>,
  predicate: TraderPredicate,
  stat_a: StatTerm,
  stat_b: Option<StatTerm>,
  op: Option<BinaryExpression>,
)
Accounts: [daily_scores_merkle_roots (readonly)]
Discriminator: [107,197,232,90,191,136,105,185]
              = sha256("global:validate_stat")[..8]  (standard Anchor)
```

### CPI Call Pattern (actual code — settle_market)

`settle_market(winning_outcome: u8, proof_data: Vec<u8>)` treats the proof
payload as **opaque bytes**, assembled off-chain by the keeper and appended
verbatim after the discriminator. Proof serialization therefore lives
entirely off-chain — a change in TxLINE's payload never requires a program
redeploy.

```rust
// Discriminator: standard Anchor derivation, matches the deployed IDL.
let discriminator = anchor_lang::solana_program::hash::hash(b"global:validate_stat")
    .to_bytes()[..8]
    .to_vec();

// Instruction data: discriminator || proof_data (keeper-built borsh args)
let mut instruction_data = discriminator;
instruction_data.extend_from_slice(&proof_data);

let cpi_ix = Instruction {
    program_id: ctx.accounts.txline_program.key(),   // enforced == TXLINE_DEVNET
    accounts: vec![
        AccountMeta::new_readonly(ctx.accounts.txline_state.key(), false),
        AccountMeta::new(ctx.accounts.txline_proof_account.key(), false),
    ],
    data: instruction_data,
};

invoke(&cpi_ix, &[...])?;   // failure reverts settle_market — market stays Locked
```

`txline_state` is TxLINE's `daily_scores_merkle_roots` account; the second
meta lands in TxLINE's `remaining_accounts` and is ignored by it. The keeper
(`backend/src/services/solana.service.ts` `settleMarket`) borsh-serializes
the `validate_stat` args listed above into `proof_data`.

---

## Free Tier Setup (Devnet)

For hackathon development on Devnet:

```bash
# 1. Generate a devnet wallet
solana-keygen new --outfile ~/.config/solana/devnet-goalchain.json
solana config set --keypair ~/.config/solana/devnet-goalchain.json
solana config set --url devnet

# 2. Fund with devnet SOL
solana airdrop 2

# 3. Subscribe on-chain (free tier, service level 1)
# Run the script in scripts/subscribe-devnet.ts
npx ts-node scripts/subscribe-devnet.ts

# 4. Activate API token
# Script outputs the API token — save to .env
```

---

## Error Handling

| Error | Cause | Resolution |
|---|---|---|
| 401 on data API | Guest JWT expired | Re-request from `/auth/guest/start` |
| 403 on activation | Wrong wallet / message / network | Check signing wallet matches subscribe tx |
| SSE disconnect | Network timeout | Reconnect with exponential backoff |
| `validate_stat` fails | Invalid proof or wrong matching | Check proof bytes and matchId alignment |

---

## Testing Without Live API

For CI/testing, use the mock TxLINE server:

```typescript
// backend/src/__mocks__/txline.ts
export const MOCK_MATCHES = [
  {
    matchId: 'match_2026_arg_fra_0712',
    homeTeam: { name: 'Argentina', code: 'ARG', flag: '🇦🇷' },
    awayTeam: { name: 'France', code: 'FRA', flag: '🇫🇷' },
    status: 'full_time',
    homeScore: 2,
    awayScore: 1,
    winner: 'home',
  }
];

export const MOCK_PROOF = {
  matchId: 'match_2026_arg_fra_0712',
  merkleRoot: '7f3a9b2c1d8e4f5a6b7c8d9e0f1a2b3c4d5e6f70',
  merkleProof: ['3a1b2c3d...', '9c8d7e6f...'],
  verified: true,
};
```
