# GoalChain — World Cup Prediction Markets on Solana

**GoalChain** is a World Cup 2026 prediction market platform built on Solana, powered by **TxLINE** for cryptographically verifiable match results. Users connect their Solana wallet, browse match prediction markets, place SOL/USDC bets, and winnings are auto-settled via smart contracts using TxLINE Merkle proofs.

Built for the **TxODDS/Superteam World Cup Hackathon** — Prediction Markets track.

## Tech Stack

- **Framework:** Next.js 14 (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS
- **Blockchain:** @solana/wallet-adapter, @coral-xyz/anchor
- **Charts:** recharts
- **State:** zustand
- **Data Fetching:** @tanstack/react-query
- **Animations:** framer-motion
- **Dates:** date-fns

## Pages

| Route | Description |
|-------|-------------|
| `/` | Landing page with live ticker, stats, featured markets |
| `/markets` | Browse all prediction markets with filters & search |
| `/markets/[id]` | Individual market: match details, odds chart, bet form, proof |
| `/leaderboard` | Top predictors ranked by USDC won, accuracy, ROI |
| `/verify/[matchId]` | TxLINE Merkle proof verification for settled matches |

## Key Components

- **`<WalletButton />`** — Solana wallet connection (Phantom, Backpack, Solflare)
- **`<LiveTicker />`** — Scrolling horizontal ticker with live World Cup scores
- **`<MarketCard />`** — Match preview with teams, odds, pool size, countdown
- **`<BetForm />`** — Multi-step bet placement with outcome selection, amount input, Solana tx signing
- **`<OddsChart />`** — Real-time odds movement chart (recharts)
- **`<ProofVerifier />`** — TxLINE Merkle proof display with verification steps
- **`<MatchScore />`** — Live match score with teams, events, minute tracker
- **`<PoolDistribution />`** — Bar chart showing bet distribution across outcomes

## Getting Started

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build
```

The app will be available at [http://localhost:3000](http://localhost:3000).

## Configuration

Copy `.env.local.example` to `.env.local` and set:

| Variable | Default | Description |
|----------|---------|-------------|
| `NEXT_PUBLIC_API_URL` | `http://localhost:3001/api` | Backend API endpoint |
| `NEXT_PUBLIC_WS_URL` | `ws://localhost:3001` | WebSocket URL for live updates |
| `NEXT_PUBLIC_SOLANA_RPC` | `https://api.devnet.solana.com` | Solana RPC endpoint |
| `NEXT_PUBLIC_PREDICTION_PROGRAM_ID` | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` | Prediction market program ID |

## Mock Data

The app includes comprehensive mock data for World Cup 2026, including:
- 10 matches across groups A–H with real teams (Argentina, France, Brazil, England, etc.)
- Live, upcoming, and settled market states
- Mock odds, pool sizes, and odds history
- 10 leaderboard entries with realistic stats
- Merkle proof examples for settled matches

When the backend API at `NEXT_PUBLIC_API_URL` is unreachable, the app falls back to mock data automatically.

## Design

- **Dark theme** — Deep navy (`#0a0e1a`) background
- **Accent** — Electric green (`#00ff88`) for CTAs, highlights
- **Typography** — Inter for UI, JetBrains Mono for data/monospace
- **Components** — Glassmorphism cards, subtle borders, smooth animations
- **Responsive** — Mobile-first, works on all screen sizes

## Project Structure

```
frontend/
├── app/
│   ├── layout.tsx          # Root layout with providers
│   ├── globals.css         # Global styles + Tailwind
│   ├── page.tsx            # Landing page
│   ├── markets/
│   │   ├── page.tsx        # Browse markets
│   │   └── [id]/page.tsx   # Market detail + bet form
│   ├── leaderboard/
│   │   └── page.tsx        # Leaderboard
│   └── verify/
│       └── [matchId]/page.tsx  # Proof verification
├── components/
│   ├── WalletButton.tsx    # Solana wallet connection
│   ├── LiveTicker.tsx      # Scrolling score ticker
│   ├── MarketCard.tsx      # Market preview card
│   ├── BetForm.tsx         # Bet placement form
│   ├── OddsChart.tsx       # Odds movement chart
│   ├── ProofVerifier.tsx   # Merkle proof display
│   ├── MatchScore.tsx      # Live match score
│   ├── PoolDistribution.tsx # Pool distribution chart
│   ├── Navbar.tsx          # Navigation bar
│   ├── Skeletons.tsx       # Loading skeletons
│   └── ErrorBoundary.tsx   # Error boundaries
├── lib/
│   ├── types.ts            # TypeScript types
│   ├── mock-data.ts        # World Cup 2026 mock data
│   ├── api.ts              # API client with mock fallback
│   ├── solana.ts           # Solana/Anchor client
│   ├── store.ts            # Zustand store
│   └── providers.tsx       # Wallet + Query providers
└── public/
```

## Prize Track

This project is submitted for the **Prediction Markets** track of the TxODDS/Superteam World Cup Hackathon ($12k first prize).
