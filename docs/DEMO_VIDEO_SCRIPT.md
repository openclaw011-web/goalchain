# GoalChain — Demo Video Script (5 min)

## Production Notes
- Screen record at 1920x1080 60fps
- Use OBS or Loom
- Background music: subtle lo-fi (no copyright)
- Use a real Phantom wallet connected to Devnet
- Have a World Cup match in progress (or use historical replay)

## Pre-Flight (run before recording)

```bash
# 1. Everything running locally
./deploy-local.sh                     # backend :3001 + frontend :3000

# 2. Demo markets already live on Devnet (idempotent — safe to re-run)
cd scripts && node bootstrap-devnet-markets.mjs

# 3. Devnet SOL in your Phantom wallet (faucet.solana.com)
```

**Concrete assets to show (all real, already on Devnet):**
- Program: `C5vNdxLcaMriywhQJzv3Dv8PKDfkfnKWHvqCVnqgEQE5`
  https://explorer.solana.com/address/C5vNdxLcaMriywhQJzv3Dv8PKDfkfnKWHvqCVnqgEQE5?cluster=devnet
- Demo market to click: **ARG vs BRA** (`/markets/market-match-1`, on-chain id 101,
  market PDA `5SuVuPFq7pet5WnNhiAESfRyERcfaFmVnjvkjKjiHiua`)
- Backup real bet tx (if the live demo hiccups):
  https://explorer.solana.com/tx/2PVPRzPMtxs2Z31er4mj96s211NzHrvUpdhipPWRv2UHfbkrWWrkcd5sa6RntEFcFY9ModVZMc7g3NtG8a9V5t4K?cluster=devnet
- For the settlement/claim segment, show the test suite proving the full
  lifecycle against the TxLINE CPI interface (25 tests incl. Create → Bet →
  Lock → Settle-via-CPI → Claim with verified payouts):
  `cd contracts/prediction-market && anchor test --skip-build --provider.cluster localnet`

---

## [0:00 – 0:30] Hook — The Problem

**SHOW:** A real sports betting site (screenshot, not interactive)

**NARRATE:**
> "Traditional sports prediction platforms have one critical weakness — you have to trust them.
> Trust that they'll read the result correctly. Trust that they won't disappear with your funds.
> Trust that the Oracle isn't compromised.
> 
> GoalChain eliminates trust entirely."

**SHOW:** GoalChain homepage loading with LIVE score ticker running across the top

---

## [0:30 – 1:30] The Platform — User Experience

**SHOW:** Markets page with live match cards

**NARRATE:**
> "GoalChain is a fully on-chain World Cup prediction market powered by TxLINE's real-time verified data feed.
> Right now you can see live markets for every active World Cup match.
> These odds update in real time — directly from TxLINE's cryptographically signed consensus feed."

**DEMO:**
1. Click into the "Argentina vs Brazil" market (`/markets/market-match-1` — a REAL Devnet market, id 101)
2. Show the live score ticker and odds movement chart
3. Connect Phantom wallet (already on Devnet)

**NARRATE:**
> "I'll connect my Phantom wallet on Solana Devnet."

---

## [1:30 – 2:30] Placing a Bet — On-Chain Transaction

**DEMO:**
1. Select "ARG" outcome
2. Enter "1 SOL" bet amount, show the payout preview
3. Click "Review Prediction" → "Confirm & Sign"
4. Phantom opens — show the REAL place_bet transaction (program C5vN…EQE5)
5. Approve — the success screen shows the tx signature with a working
   Solana Explorer link; open it and show the escrow transfer
6. Point at the market PDA balance increasing on Explorer

**NARRATE:**
> "I'm betting 1 SOL on Argentina to win. This SOL goes directly into a PDA escrow account
> on Solana — not to us, not to any intermediary. The smart contract holds it.
>
> Transaction confirmed. My bet is now locked on-chain. If Argentina wins, I can claim
> 2.10 SOL directly from the escrow — no approval needed from anyone."

---

## [2:30 – 3:30] The Magic — TxLINE Settlement

**SHOW:** Match ends (use a historical replay or time-jump)

**SHOW:** Backend logs scrolling — show TxLINE SSE event arriving

**NARRATE:**
> "When the match ends, here's where GoalChain does something no other hackathon project does.
>
> Watch what happens in the backend — we're receiving TxLINE's cryptographically signed match result via Server-Sent Events in real-time.
>
> But TxLINE doesn't just send us a score. They send a Merkle proof — a cryptographic fingerprint
> anchored on Solana's blockchain."

**SHOW:** The GoalChain keeper bot triggering settlement

**NARRATE:**
> "Our keeper bot automatically fetches the Merkle proof from TxLINE's API, then calls our
> Anchor smart contract's `settle_market` instruction."

**SHOW CODE:**
```rust
// settle_market instruction calls TxLINE on-chain via CPI
txline_cpi::validate_stat(cpi_ctx, proof_data)?;
```

**NARRATE:**
> "The Anchor program CPIs directly into TxLINE's `validate_stat` instruction on Solana.
> The TxLINE program verifies the Merkle proof on-chain. If it passes — the match outcome
> is now cryptographically confirmed on the blockchain. No admin needed. No trust needed."

---

## [3:30 – 4:00] Claiming Winnings

**SHOW:** Market page now showing "Settled — Argentina Won"

**DEMO:**
1. Show "Claim Winnings" button appearing
2. Click claim — Phantom opens
3. Approve transaction
4. Show 2.10 SOL arriving in wallet

**NARRATE:**
> "The market is now settled. Winners can claim their share directly from the escrow.
> The payout is proportional — and the math is deterministic on-chain."

---

## [4:00 – 4:30] Proof Verifier

**SHOW:** Navigate to /verify/match-7 (settled CRO vs MEX match)

**NARRATE:**
> "This is the Proof Verifier page — one of our unique features.
> Anyone can come here and see exactly how the result was determined.
> The TxLINE Merkle proof, the Solana transaction, the settlement slot number.
> Full transparency. Full auditability."

**SHOW:** The step-by-step verification chain on screen

**SHOW:** Click Solana Explorer link for the settlement transaction

---

## [4:30 – 5:00] Closing — The Stack

**SHOW:** Architecture diagram

**NARRATE:**
> "GoalChain uses:
> — TxLINE's SSE feed for real-time score and odds data
> — TxLINE's proof API for settlement evidence
> — A direct CPI into TxLINE's on-chain `validate_stat` for trustless verification
> — Anchor smart contract on Solana Devnet for escrow and payout
> — Next.js frontend with Phantom wallet integration
>
> Everything is deployed and working. The code is on GitHub. The contract is on Devnet.
> 
> This is GoalChain — the first fully trustless World Cup prediction market.
> Settle with proof. Win with confidence."

---

## Production Checklist
- [ ] Live site URL visible throughout
- [ ] GitHub repo URL shown at end
- [ ] Solana Explorer links working on Devnet
- [ ] TxLINE proof API response visible in browser/terminal
- [ ] No blank loading screens — have mock data loaded
- [ ] Show backend terminal with live SSE events
- [ ] Wallet showing actual SOL balance change
