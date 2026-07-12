# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

GoalChain — a trustless World Cup prediction market on Solana (hackathon project for TxODDS x Superteam Earn). Users bet SOL on match outcomes; settlement is done on-chain by CPI into the TxLINE oracle program, which verifies match results via Merkle proofs. Deployed on Devnet.

## Commands

There is no root package.json — each of `backend/`, `frontend/`, and `contracts/prediction-market/` is its own npm project. Run commands from the relevant directory.

### Backend (`backend/`)
```bash
npm run dev        # tsx watch, hot reload
npm run build      # tsc → dist/
npm start          # node dist/index.js
npm test           # jest (ESM mode)
npm test -- src/__tests__/market.service.test.ts   # single test file
npm run lint       # eslint src/
```

### Frontend (`frontend/`)
```bash
npm run dev        # next dev (port 3000)
npm run build      # next build
npm run lint       # next lint
```

### Contracts (`contracts/prediction-market/`)
```bash
anchor build       # also generates target/idl + target/types (idl-build feature)
anchor test --skip-build --provider.cluster localnet   # 25 mocha tests on a local validator
anchor deploy --program-name prediction_market --provider.cluster devnet                # needs ~2.1 SOL for buffer rent
cargo check --manifest-path programs/prediction-market/Cargo.toml   # what CI runs
```
Anchor.toml's default cluster is devnet — plain `anchor test` will try to **deploy to devnet**; always pass `--provider.cluster localnet` for tests.

### Devnet operations (`scripts/`)
```bash
node scripts/bootstrap-devnet-markets.mjs  # idempotent: init config + create demo markets 101-110
node scripts/smoke-test-bet.mjs            # places a real 0.01 SOL bet on market 101
```

### Whole-stack
- `./deploy-local.sh` — builds and starts backend + frontend locally
- `./deploy-prod.sh` — Vercel (frontend) / Render or Railway (backend) deploy helper
- CI (`.github/workflows/ci.yml`): backend jest tests, frontend build, contract `cargo check`; deploys on push to `main`.

## Architecture

Three layers connected by the Solana program ID and the TxLINE oracle:

1. **Anchor program** (`contracts/prediction-market/programs/prediction-market/src/`) — `lib.rs` holds all instructions; `state.rs` accounts/enums; `errors.rs` error codes.
   - Market lifecycle: **Open → Locked → Settled** (or **Cancelled** → `refund_bet`).
   - PDAs: `MarketConfig ["config"]`, `Market ["market", u64-LE(market_id)]`, `Bet ["bet", market, bettor, [outcome_index]]`.
   - **Escrow model:** the Market PDA itself holds all escrowed SOL in its lamport balance — there is no separate vault account. Payouts debit the PDA via signer seeds.
   - `settle_market` CPIs into the TxLINE devnet program (`6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J`) `validate_stat` instruction with Merkle proof bytes; if the proof fails, the market stays Locked. This CPI is the core of the trustless design.

2. **Backend** (`backend/src/`) — Express + WebSocket relay + SQLite (better-sqlite3).
   - `index.ts` wires everything: `TxlineService` (SSE ingestion from TxLINE with reconnect/backpressure) emits events → `MarketService` (market lifecycle, DB) → `SolanaService` (on-chain reads/settlement keeper). REST routes in `routes/`, DB schema/bridge in `db/schema.ts`.
   - TxLINE auth is mocked in dev (real auth requires signing a Solana tx); config defaults in `config.ts` make the server run with no `.env`.

3. **Frontend** (`frontend/`) — Next.js 14 App Router, Tailwind, Solana wallet-adapter, zustand + react-query.
   - `lib/api.ts` silently falls back to `lib/mock-data.ts` on **any** fetch failure (5s timeout). The UI therefore "works" with the backend down — don't mistake mock data for live data when testing.

## Gotchas

- **Program ID is duplicated across the stack.** `C5vNdxLcaMriywhQJzv3Dv8PKDfkfnKWHvqCVnqgEQE5` appears in `lib.rs` (`declare_id!`), `Anchor.toml`, `backend/src/config.ts`, both deploy scripts, and frontend env (`NEXT_PUBLIC_PREDICTION_PROGRAM_ID`). After redeploying the program, update all of them **and re-vendor the IDL** (`backend/idl/` and `frontend/lib/idl/` are copies of `target/idl/prediction_market.json`).
- **PDA payouts must move lamports directly.** The market PDA holds escrow and carries account data, so `system_instruction::transfer` from it fails ("`from` must not carry data"). `claim_winnings`/`refund_bet` debit/credit `try_borrow_mut_lamports` directly — keep it that way.
- **Backend is ESM** (`"type": "module"`): relative imports in `.ts` files use `.js` extensions; jest is configured with the ts-jest ESM preset and needs `NODE_OPTIONS='--experimental-vm-modules'` (already in the npm scripts — use `npm test`, not bare `jest`).
- **Solana platform-tools cargo (1.84) predates edition2024.** `Cargo.lock` pins blake3 1.5.5, indexmap 2.9, proc-macro-crate 3.2, zeroize 1.8.2, unicode-segmentation 1.12. Don't `cargo update` these without checking `anchor build` still works.
- **Frontend pins `@types/react` 18 via npm `overrides`** — wallet-adapter transitively pulls React 19 types which break JSX type-checking. Keep the override when adding deps.
- **PDA seeds:** Market = `["market", u64-LE(market_id)]`; Bet = `["bet", market, bettor, [outcome_index]]` (one bet per outcome per wallet); Config = `["config"]`.
- Backend tests live in `backend/src/__tests__/`; contract tests in `contracts/prediction-market/tests/` (mocha/chai via `anchor test`). Contract test imports use default-import form (`import anchorPkg from ...`) because Node 22.18+ native type-stripping loads the file as ESM where anchor's named exports aren't visible.
- All three tiers agree on port **3001** for the backend API.

## Reference docs

`docs/ARCHITECTURE.md` (account model, instruction specs, settlement flow), `docs/TXLINE_INTEGRATION.md` (oracle endpoints and CPI details).
