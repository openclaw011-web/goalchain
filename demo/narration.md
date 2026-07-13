# Demo Narration Script

Voice: Google AI Studio → Generate speech (single-speaker). Suggested voice: **Charon** or **Enceladus**.
Style prompt: *Speak as a confident, measured product-demo narrator. Energetic but not salesy. Moderate pace.*

Save each clip as `demo/audio/<scene>.wav` (or `.mp3`) — the assembler matches by filename.
Timing does not need to be exact: `assemble.mjs` pads each scene to fit its narration.

| Scene file | Narration |
|---|---|
| `01-opening` | Sports prediction platforms ask you to trust them — to read the result honestly, to hold your funds, and to actually pay out. GoalChain replaces that trust with cryptographic proof. |
| `02-home` | GoalChain is a World Cup prediction market that runs entirely on Solana, powered by TxLINE — TxODDS's cryptographically verified sports data oracle. |
| `03-markets` | These markets aren't mock-ups. They're created automatically from TxLINE's live World Cup fixture feed. |
| `04-detail` | Here's the real France versus Spain fixture. Behind this page is a market account on Solana Devnet, created from the TxLINE fixture I-D, with settlement assigned to the TxLINE oracle. |
| `05-bet-terminal` | Betting is a real on-chain transaction. Here's an actual bet on this match — the SOL moves into the market's own escrow account, held by the program itself. No house wallet. No custodian. |
| `06-explorer-bet` | And everything is verifiable on Solana Explorer — the place-bet instruction, the escrow balance increasing, and the program logging the bet on the France–Spain market. |
| `07-backend` | Our backend holds a real TxLINE subscription, activated on-chain. Both live data streams — scores and odds — are connected right now, and a keeper bot stands ready to settle markets the moment results land. |
| `08-code` | Settlement is the crown jewel. The settle-market instruction makes a cross-program invocation into TxLINE's validate-stat, so the Merkle proof of the result is verified on-chain, inside the transaction. If the proof is invalid, everything reverts. No valid proof — no settlement. No admin. No trust. |
| `09-tests` | The full lifecycle is proven by twenty-six on-chain tests: create, bet, lock, settle through the oracle, and claim — with payouts verified to the lamport. |
| `10-payout` | And this isn't just a local test. Here's the deployed Devnet program moving real escrow — a bet refunded straight out of the market account, exactly zero point zero one SOL, verifiable on Explorer. |
| `11-verify` | Every settled market gets a public proof page — the Merkle root, the proof path, and the settlement transaction. Auditable by anyone. |
| `12-closing` | GoalChain. Live TxLINE data. P-D-A escrow. On-chain proof verification. Automatic settlement. Deployed, tested, and open source. Settle with proof. Win with confidence. |
