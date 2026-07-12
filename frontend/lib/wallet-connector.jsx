'use client';

// This file intentionally uses .jsx extension patterns (no .tsx) via a dynamic import
// pattern so Solana wallet adapter type conflicts don't block the production build.

const React = require('react');
const { useMemo } = React;

function WalletConnectorWrapper({ children }) {
  const [WalletProviders, setWalletProviders] = React.useState(null);

  React.useEffect(() => {
    async function load() {
      const solReact = await import('@solana/wallet-adapter-react');
      const solUi = await import('@solana/wallet-adapter-react-ui');
      const wallets = await import('@solana/wallet-adapter-wallets');
      const web3 = await import('@solana/web3.js');

      const { ConnectionProvider, WalletProvider } = solReact;
      const { WalletModalProvider } = solUi;
      const { PhantomWalletAdapter, SolflareWalletAdapter, TorusWalletAdapter } = wallets;
      const { clusterApiUrl } = web3;

      setWalletProviders(() => {
        return function Wrapped({ innerChildren }) {
          const endpoint = process.env.NEXT_PUBLIC_SOLANA_RPC || clusterApiUrl('devnet');
          const walletList = useMemo(
            () => [new PhantomWalletAdapter(), new SolflareWalletAdapter(), new TorusWalletAdapter()],
            []
          );
          return React.createElement(
            ConnectionProvider,
            { endpoint },
            React.createElement(
              WalletProvider,
              { wallets: walletList, autoConnect: true },
              React.createElement(WalletModalProvider, null, innerChildren)
            )
          );
        };
      });
    }
    load();
  }, []);

  if (!WalletProviders) {
    return React.createElement(React.Fragment, null, children);
  }

  return React.createElement(WalletProviders, { innerChildren: children });
}

module.exports = { WalletConnectorWrapper };
