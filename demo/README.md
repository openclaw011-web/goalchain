# Demo Video Production Kit

Fully reproducible pipeline for the GoalChain submission video. Every frame is the
real product: the local prod build backed by live TxLINE data, real Devnet
transactions on Solana Explorer, and terminal replays of genuine command output
(`out-*.txt` — captured, not fabricated).

## Pipeline

```bash
# 0. stack running: backend :3001 (live TxLINE creds), frontend :3000 (npm start)
npm install                    # playwright (chromium downloads on first install)

# 1. record the 12 scenes → scenes/*.webm
node record.mjs                # or `node record.mjs 04-detail` for one scene

# 2. narration → audio/<scene>.wav   (script + voice settings: narration.md)

# 3. assemble → goalchain-demo.mp4 (pads each scene to fit its narration)
node assemble.mjs
```

| File | Purpose |
|---|---|
| `record.mjs` | Playwright scene recorder (12 scenes, 1080p) |
| `assemble.mjs` | ffmpeg segment builder + concat (openh264) |
| `narration.md` | Per-scene voiceover script |
| `opening/closing/code/terminal.html` | Styled cards & terminal replay shell |
| `out-*.txt` | Real captured outputs replayed in terminal scenes |
