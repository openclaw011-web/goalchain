# GoalChain — Demo Video Script (5 min)

## Production Notes
- Screen record at 1920x1080 60fps
- Use OBS or Loom
- Background music: subtle lo-fi (no copyright)
- Use a real Phantom wallet connected to Devnet
- Have a World Cup match in progress (or use historical replay)

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
1. Click into "Argentina vs France" market
2. Show the live score updating (WebSocket connection)
3. Show the odds movement chart changing as new events arrive
4. Connect Phantom wallet (already on Devnet)

**NARRATE:**
> "I'll connect my Phantom wallet on Solana Devnet."

---

## [1:30 – 2:30] Placing a Bet — On-Chain Transaction

**DEMO:**
1. Select "Argentina Win" outcome (showing 2.10x odds)
2. Enter "1 SOL" bet amount
3. Show potential payout: 2.10 SOL
4. Click "Place Bet"
5. Phantom wallet opens — show the transaction details
6. Approve — show transaction confirmation + Solana Explorer link
7. Show bet appearing in "My Bets" section

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

**SHOW:** Navigate to /verify/match_2026_arg_fra_0712

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
