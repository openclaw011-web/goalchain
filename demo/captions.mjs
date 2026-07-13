// Burn the narration script into the assembled video as styled captions,
// producing a final that stands alone WITHOUT a voice track. If/when voice
// clips land in audio/, re-run assemble.mjs instead and skip this.
//
// Scene timing is read from segments/*.mp4 (produced by assemble.mjs), so the
// captions always line up with the actual cut. Long lines are split into
// sentence chunks spread across the scene proportionally to their length.
//
// Usage: node captions.mjs [input.mp4] [output.mp4]
import { readdirSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const INPUT = process.argv[2] ?? join(__dirname, '..', 'goalchain-demo-draft.mp4');
const OUTPUT = process.argv[3] ?? join(__dirname, '..', 'goalchain-demo-captioned.mp4');

const sh = (cmd) => execSync(cmd, { stdio: ['ignore', 'pipe', 'pipe'] }).toString();
const dur = (f) => Number(sh(`ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${f}"`).trim());

// The opening and closing cards carry their own on-screen copy — no captions.
const NARRATION = {
  '02-home': "GoalChain is a World Cup prediction market that runs entirely on Solana — powered by TxLINE, TxODDS's cryptographically verified sports data oracle.",
  '03-markets': "These markets aren't mock-ups. They're created automatically from TxLINE's live World Cup fixture feed.",
  '04-detail': "This is the real France vs Spain fixture. Behind this page: a market account on Solana Devnet, created from the TxLINE fixture ID, settled by the TxLINE oracle.",
  '05-bet-terminal': "Betting is a real on-chain transaction. The SOL moves into the market's own escrow account, held by the program itself. No house wallet. No custodian.",
  '06-explorer-bet': "Everything is verifiable on Solana Explorer — the place_bet instruction, the escrow balance increasing, the program logging the bet.",
  '07-backend': "The backend holds a real TxLINE subscription, activated on-chain. Both live streams — scores and odds — are connected, and a keeper bot auto-settles markets the moment results land.",
  '08-code': "Settlement is the crown jewel: settle_market CPIs into TxLINE's validate_stat, so the Merkle proof of the result is verified on-chain. Invalid proof? Everything reverts. No admin. No trust.",
  '09-tests': "The full lifecycle is proven by 26 on-chain tests — create, bet, lock, settle through the oracle, claim — with payouts verified to the lamport.",
  '10-payout': "Not just localnet: here's the deployed Devnet program refunding a bet straight out of market escrow — exactly 0.01 SOL, verifiable on Explorer.",
  '11-verify': 'Every settled market gets a public proof page — Merkle root, proof path, settlement transaction. Auditable by anyone.',
};

// Sentence-chunk a narration string across [start, end).
function chunks(text, start, end) {
  const parts = text.match(/[^.?!]+[.?!]+(\s|$)|[^.?!]+$/g).map((s) => s.trim()).filter(Boolean);
  const total = parts.reduce((n, p) => n + p.length, 0);
  const span = end - start - 0.3;
  const out = [];
  let t = start;
  for (const p of parts) {
    const d = Math.max(1.8, (p.length / total) * span);
    out.push({ start: t, end: Math.min(t + d, end - 0.1), text: p });
    t += d;
  }
  return out;
}

// ASS timestamps: h:mm:ss.cc
const ts = (s) => {
  const h = Math.floor(s / 3600);
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const sec = String(Math.floor(s % 60)).padStart(2, '0');
  const cs = String(Math.round((s % 1) * 100)).padStart(2, '0');
  return `${h}:${m}:${sec}.${cs}`;
};

// Proper .ass with PlayRes 1920x1080 — .srt force_style scales against a
// 288-line canvas and comes out 4x too large. BorderStyle=4 draws a
// semi-transparent box; libass wraps lines within the margins.
const header = `[Script Info]
PlayResX: 1920
PlayResY: 1080
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Cap,Liberation Sans,34,&H00E6EDF3,&H00FFFFFF,&H000A0E14,&H990A0E14,0,0,0,0,100,100,0,0,4,0,0,2,280,280,40,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

// Scenes whose own composition fills the bottom of the frame get top captions.
const TOP_CAPTIONS = new Set(['08-code']);

const segs = readdirSync(join(__dirname, 'segments')).filter((f) => /^\d\d-.*\.mp4$/.test(f)).sort();
let cursor = 0, count = 0, events = '';
for (const f of segs) {
  const name = f.replace('.mp4', '');
  const d = dur(join(__dirname, 'segments', f));
  const text = NARRATION[name];
  if (text) {
    const pos = TOP_CAPTIONS.has(name) ? '{\\an8}' : '';
    for (const c of chunks(text, cursor + 0.4, cursor + d)) {
      events += `Dialogue: 0,${ts(c.start)},${ts(c.end)},Cap,,0,0,0,,${pos}${c.text}\n`;
      count++;
    }
  }
  cursor += d;
}

const assPath = join(__dirname, 'captions.ass');
writeFileSync(assPath, header + events);
console.log(`captions.ass: ${count} cues over ${cursor.toFixed(1)}s`);

sh(`ffmpeg -y -v error -i "${INPUT}" -vf "ass='${assPath}'" -c:v libopenh264 -b:v 6M -maxrate 8M -pix_fmt yuv420p -c:a copy "${OUTPUT}"`);
console.log(`🎬 ${OUTPUT} (${dur(OUTPUT).toFixed(1)}s)`);
