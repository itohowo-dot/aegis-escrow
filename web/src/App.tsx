import { useEffect, useMemo, useState } from 'react';
import { getStxAddress } from './lib/wallet';
import { usePlatform } from './lib/usePlatform';
import { useEscrows } from './lib/useEscrows';
import { useBurnHeight } from './lib/chain';
import { NETWORK, explorerContract } from './lib/config';
import { Header } from './components/Header';
import { NetworkStrip } from './components/NetworkStrip';
import { CreateEscrow } from './components/CreateEscrow';
import { EscrowList } from './components/EscrowList';
import { EscrowDetail } from './components/EscrowDetail';
import { Toast, type Notice } from './components/Toast';

export default function App() {
  const [address, setAddress] = useState<string | null>(getStxAddress());
  const [notice, setNotice] = useState<Notice>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const platform = usePlatform();
  const feed = useEscrows();
  const burnHeight = useBurnHeight();

  const selected = useMemo(
    () => feed.escrows.find((e) => e.id === selectedId) ?? null,
    [feed.escrows, selectedId],
  );

  // Land on something real instead of an empty detail slot.
  useEffect(() => {
    if (selectedId === null && feed.escrows.length > 0) setSelectedId(feed.escrows[0].id);
  }, [feed.escrows, selectedId]);

  return (
    <>
      <Header address={address} setAddress={setAddress} setNotice={setNotice} />

      <div className="container">
        <NetworkStrip platform={platform} burnHeight={burnHeight} />

        <main className="layout">
          <div className="col">
            <CreateEscrow
              address={address}
              config={platform.config}
              setNotice={setNotice}
              onEscrowConfirmed={(id) => {
                setSelectedId(id);
                void feed.refreshOne(id);
              }}
            />
          </div>

          <div className="col">
            <EscrowList
              feed={feed}
              address={address}
              burnHeight={burnHeight}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
            {selected && (
              <EscrowDetail
                key={selected.id}
                escrow={selected}
                config={platform.config}
                address={address}
                burnHeight={burnHeight}
                setNotice={setNotice}
                onActed={(id) => void feed.refreshOne(id)}
              />
            )}
          </div>
        </main>

        <footer className="app-footer">
          <span>
            Reads via{' '}
            <a href="https://www.npmjs.com/package/sbtc-escrow-sdk" target="_blank" rel="noreferrer">
              sbtc-escrow-sdk
            </a>
            , writes signed with{' '}
            <a href="https://www.npmjs.com/package/@stacks/connect" target="_blank" rel="noreferrer">
              @stacks/connect
            </a>{' '}
            · {NETWORK} ·{' '}
            <a href={explorerContract()} target="_blank" rel="noreferrer">
              contract
            </a>
          </span>
        </footer>
      </div>

      <Toast notice={notice} onDismiss={() => setNotice(null)} />
    </>
  );
}
