import type { Metadata } from 'next';
import { Providers } from '@/lib/providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'GoalChain — World Cup Prediction Markets on Solana',
  description:
    'Predict World Cup 2026 matches, place bets with SOL/USDC, and win. Powered by TxLINE verifiable sports data on Solana.',
  keywords: [
    'world cup',
    'prediction market',
    'solana',
    'txline',
    'betting',
    'football',
    'soccer',
    'crypto',
    'defi',
  ],
  openGraph: {
    title: 'GoalChain — World Cup Prediction Markets on Solana',
    description: 'Predict World Cup 2026 matches and win USDC. Powered by TxLINE.',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-goalchain-navy text-white font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
