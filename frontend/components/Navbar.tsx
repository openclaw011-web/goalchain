'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import WalletButton from './WalletButton';
import { motion } from 'framer-motion';

const navLinks = [
  { href: '/', label: 'Home' },
  { href: '/markets', label: 'Markets' },
  { href: '/leaderboard', label: 'Leaderboard' },
];

export default function Navbar() {
  const pathname = usePathname();

  return (
    <nav className="sticky top-0 z-50 backdrop-blur-xl bg-goalchain-navy/80 border-b border-goalchain-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="w-8 h-8 rounded-lg bg-goalchain-green/15 border border-goalchain-green/30 flex items-center justify-center group-hover:bg-goalchain-green/20 transition-colors">
              <span className="text-lg font-bold text-goalchain-green">G</span>
            </div>
            <div>
              <span className="text-lg font-bold text-white tracking-tight">GoalChain</span>
              <span className="hidden sm:inline text-xs text-goalchain-text-muted ml-2">Powered by TxLINE</span>
            </div>
          </Link>

          {/* Nav Links - Desktop */}
          <div className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => {
              const isActive = pathname === link.href || (link.href !== '/' && pathname.startsWith(link.href));
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`relative px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200 ${
                    isActive
                      ? 'text-goalchain-green'
                      : 'text-goalchain-text-muted hover:text-white hover:bg-goalchain-surface-light'
                  }`}
                >
                  {link.label}
                  {isActive && (
                    <motion.div
                      layoutId="nav-active"
                      className="absolute -bottom-[17px] left-0 right-0 h-0.5 bg-goalchain-green"
                    />
                  )}
                </Link>
              );
            })}
          </div>

          {/* Wallet & Mobile Menu */}
          <div className="flex items-center gap-3">
            <WalletButton />
          </div>
        </div>
      </div>
    </nav>
  );
}
