import { useState } from 'react';
import { connectWallet, disconnectWallet, shortAddress } from '../lib/wallet';
import { CONTRACT_ID, NETWORK, explorerContract } from '../lib/config';
import { Button, CopyButton, ExternalIcon, ShieldIcon, errMsg } from './ui';
import type { Notice } from './Toast';

export function Header({
  address,
  setAddress,
  setNotice,
}: {
  address: string | null;
  setAddress: (a: string | null) => void;
  setNotice: (n: Notice) => void;
}) {
  const [busy, setBusy] = useState(false);

  async function handleConnect() {
    setBusy(true);
    try {
      setAddress(await connectWallet());
    } catch (e) {
      setNotice({ kind: 'error', message: errMsg(e) });
    } finally {
      setBusy(false);
    }
  }

  function handleDisconnect() {
    disconnectWallet();
    setAddress(null);
  }

  return (
    <header className="app-header">
      <div className="container header-inner">
        <div className="brand">
          <span className="brand-mark">
            <ShieldIcon size={16} />
          </span>
          <h1 className="brand-name">Aegis Escrow</h1>
          <span className="net-chip">{NETWORK}</span>
        </div>

        <div className="header-right">
          <a className="header-link" href={explorerContract()} target="_blank" rel="noreferrer">
            <span className="mono">{CONTRACT_ID.split('.')[1]}</span>
            <ExternalIcon />
          </a>

          {address ? (
            <>
              <span className="wallet-chip" title={address}>
                <span className="wallet-dot" aria-hidden />
                <span className="mono">{shortAddress(address)}</span>
                <CopyButton value={address} label="Copy wallet address" />
              </span>
              <Button size="sm" variant="ghost" onClick={handleDisconnect}>
                Disconnect
              </Button>
            </>
          ) : (
            <Button variant="primary" onClick={handleConnect} loading={busy}>
              {busy ? 'Connecting…' : 'Connect wallet'}
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
