import { useEffect, useRef, useState } from 'react';
import {
  client,
  createEscrow,
  releaseEscrow,
  refundEscrow,
  disputeEscrow,
  waitForNewEscrowId,
  EscrowStatus,
  TokenType,
  type Escrow,
  type EscrowConfig,
  type PlatformStats,
} from './lib/escrow';
import {
  connectWallet,
  disconnectWallet,
  getStxAddress,
  shortAddress,
} from './lib/wallet';
import {
  CONTRACT_ID,
  NETWORK,
  explorerContract,
  explorerTx,
  formatAmount,
  microToStx,
  toBaseUnits,
  tokenSymbol,
} from './lib/config';

type Notice =
  | { kind: 'success'; message: string; txid?: string }
  | { kind: 'error'; message: string }
  | null;

const STATUS_META: Record<number, { label: string; tone: string }> = {
  [EscrowStatus.PENDING]: { label: 'Pending', tone: 'amber' },
  [EscrowStatus.RELEASED]: { label: 'Released', tone: 'green' },
  [EscrowStatus.REFUNDED]: { label: 'Refunded', tone: 'slate' },
  [EscrowStatus.DISPUTED]: { label: 'Disputed', tone: 'red' },
  [EscrowStatus.DELIVERED]: { label: 'Delivered', tone: 'blue' },
};

export default function App() {
  const [address, setAddress] = useState<string | null>(getStxAddress());
  const [notice, setNotice] = useState<Notice>(null);
  // Set by Create after confirmation; consumed by Manage to auto-load the escrow.
  const [focusId, setFocusId] = useState<number | null>(null);

  return (
    <div className="app">
      <Header address={address} setAddress={setAddress} setNotice={setNotice} />

      {notice && (
        <div className={`banner banner--${notice.kind}`} role="status">
          <span>{notice.message}</span>
          {notice.kind === 'success' && notice.txid && (
            <a href={explorerTx(notice.txid)} target="_blank" rel="noreferrer">
              View on explorer ↗
            </a>
          )}
          <button className="banner__close" onClick={() => setNotice(null)} aria-label="Dismiss">
            ×
          </button>
        </div>
      )}

      <main className="grid">
        <PlatformCard />
        <CreateCard
          address={address}
          setNotice={setNotice}
          onEscrowConfirmed={(id) => setFocusId(id)}
        />
        <ManageCard address={address} setNotice={setNotice} focusId={focusId} />
      </main>

      <Footer />
    </div>
  );
}

/* ---------------------------------------------------------------- Header */

function Header({
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
      const addr = await connectWallet();
      setAddress(addr);
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
    <header className="header">
      <div className="brand">
        <span className="brand__mark" aria-hidden>
          ◆
        </span>
        <div>
          <h1 className="brand__name">Aegis Escrow</h1>
          <p className="brand__tag">Trustless STX &amp; sBTC escrow on Stacks</p>
        </div>
      </div>

      <div className="header__right">
        <span className="net-badge">{NETWORK}</span>
        {address ? (
          <button className="btn btn--ghost mono" onClick={handleDisconnect} title={address}>
            {shortAddress(address)} · Disconnect
          </button>
        ) : (
          <button className="btn btn--primary" onClick={handleConnect} disabled={busy}>
            {busy ? 'Connecting…' : 'Connect wallet'}
          </button>
        )}
      </div>
    </header>
  );
}

/* ----------------------------------------------------------- Platform card */

function PlatformCard() {
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [config, setConfig] = useState<EscrowConfig | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        // Reads go through the SDK — no wallet required.
        const [s, c] = await Promise.all([client.getPlatformStats(), client.getConfig()]);
        if (alive) {
          setStats(s);
          setConfig(c);
        }
      } catch (e) {
        if (alive) setError(errMsg(e));
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <section className="card">
      <h2 className="card__title">Platform</h2>
      <p className="card__sub">
        Live, read-only data straight from{' '}
        <a href={explorerContract()} target="_blank" rel="noreferrer" className="mono">
          {CONTRACT_ID.split('.')[1]}
        </a>{' '}
        via the SDK.
      </p>

      {error && <p className="muted">Couldn’t load stats: {error}</p>}
      {!stats && !error && <p className="muted">Loading…</p>}

      {stats && (
        <div className="stat-grid">
          <Stat label="Total escrows" value={stats.totalEscrows.toLocaleString()} />
          <Stat label="STX volume" value={`${microToStx(stats.totalVolumeStx).toLocaleString()} STX`} />
          <Stat label="Released" value={stats.totalReleased.toLocaleString()} />
          <Stat label="Active disputes" value={stats.activeDisputes.toLocaleString()} />
        </div>
      )}

      {config && (
        <p className="card__foot muted">
          Platform fee <strong>{config.platformFeeBps / 100}%</strong> · dispute timeout{' '}
          {config.disputeTimeout.toLocaleString()} blocks ·{' '}
          {config.isPaused ? 'paused' : 'active'}
        </p>
      )}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <div className="stat__value">{value}</div>
      <div className="stat__label">{label}</div>
    </div>
  );
}

/* ------------------------------------------------------------- Create card */

function CreateCard({
  address,
  setNotice,
  onEscrowConfirmed,
}: {
  address: string | null;
  setNotice: (n: Notice) => void;
  onEscrowConfirmed: (id: number) => void;
}) {
  const [token, setToken] = useState<TokenType>(TokenType.STX);
  const [seller, setSeller] = useState('');
  const [amount, setAmount] = useState('1');
  const [description, setDescription] = useState('');
  const [duration, setDuration] = useState('144');
  const [phase, setPhase] = useState<'idle' | 'signing' | 'confirming'>('idle');

  const mounted = useRef(true);
  useEffect(() => () => void (mounted.current = false), []);

  const busy = phase !== 'idle';
  const disabled = !address || busy;
  const sym = tokenSymbol(token);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!address) return;

    const amt = Number(amount);
    const blocks = Number(duration);
    if (!seller.trim()) return setNotice({ kind: 'error', message: 'Enter a seller address.' });
    if (!(amt > 0)) return setNotice({ kind: 'error', message: 'Amount must be greater than 0.' });
    if (!Number.isInteger(blocks) || blocks < 1)
      return setNotice({ kind: 'error', message: 'Duration must be a positive number of blocks.' });

    setNotice(null);
    setPhase('signing');
    try {
      const txid = await createEscrow({
        buyer: address,
        seller: seller.trim(),
        amount: toBaseUnits(amt, token),
        description: description.trim() || 'Aegis Escrow payment',
        durationBlocks: blocks,
        tokenType: token,
      });
      setNotice({ kind: 'success', message: 'Submitted — waiting for confirmation…', txid });
      setDescription('');

      // Track the tx, then hand the new id to the Manage panel.
      setPhase('confirming');
      const id = await waitForNewEscrowId(txid, { isCancelled: () => !mounted.current });
      if (!mounted.current) return;
      setNotice({ kind: 'success', message: `Escrow #${id} created and loaded below.`, txid });
      onEscrowConfirmed(id);
    } catch (err) {
      if (mounted.current) setNotice({ kind: 'error', message: errMsg(err) });
    } finally {
      if (mounted.current) setPhase('idle');
    }
  }

  return (
    <section className="card">
      <h2 className="card__title">Create escrow</h2>
      <p className="card__sub">
        Lock funds for a seller. They release only when you say so — or refund after expiry.
      </p>

      <form className="form" onSubmit={handleSubmit}>
        <div className="seg" role="tablist" aria-label="Token">
          {[TokenType.STX, TokenType.SBTC].map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={token === t}
              className={`seg__btn ${token === t ? 'is-active' : ''}`}
              onClick={() => setToken(t)}
            >
              {tokenSymbol(t)}
            </button>
          ))}
        </div>

        <label className="field">
          <span>Seller address</span>
          <input
            className="mono"
            placeholder="ST… (recipient of the funds)"
            value={seller}
            onChange={(e) => setSeller(e.target.value)}
          />
        </label>

        <div className="field-row">
          <label className="field">
            <span>Amount ({sym})</span>
            <input
              type="number"
              min="0"
              step={token === TokenType.SBTC ? '0.00000001' : '0.000001'}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </label>
          <label className="field">
            <span>Duration (blocks)</span>
            <input
              type="number"
              min="1"
              step="1"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
            />
          </label>
        </div>

        <label className="field">
          <span>Description</span>
          <input
            placeholder="What is this payment for?"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={256}
          />
        </label>

        <button className="btn btn--primary btn--block" disabled={disabled}>
          {phase === 'signing'
            ? 'Awaiting wallet…'
            : phase === 'confirming'
              ? 'Confirming on-chain…'
              : address
                ? `Create ${sym} escrow`
                : 'Connect wallet to create'}
        </button>
        <p className="muted small">
          You deposit the amount plus the platform fee.
          {token === TokenType.SBTC && ' Requires testnet sBTC in your wallet.'}
        </p>
      </form>
    </section>
  );
}

/* ------------------------------------------------------------- Manage card */

function ManageCard({
  address,
  setNotice,
  focusId,
}: {
  address: string | null;
  setNotice: (n: Notice) => void;
  focusId: number | null;
}) {
  const [idInput, setIdInput] = useState('1');
  const [escrow, setEscrow] = useState<Escrow | null>(null);
  const [loading, setLoading] = useState(false);
  const [action, setAction] = useState<string | null>(null);

  async function loadById(id: number) {
    if (!Number.isInteger(id) || id < 1) {
      return setNotice({ kind: 'error', message: 'Enter a valid escrow id.' });
    }
    setLoading(true);
    setEscrow(null);
    try {
      const data = await client.getEscrow(id);
      if (!data) setNotice({ kind: 'error', message: `No escrow #${id} found.` });
      setEscrow(data);
    } catch (err) {
      setNotice({ kind: 'error', message: errMsg(err) });
    } finally {
      setLoading(false);
    }
  }

  // When Create confirms a new escrow, jump straight to it.
  useEffect(() => {
    if (focusId == null) return;
    setIdInput(String(focusId));
    void loadById(focusId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId]);

  async function run(name: string, fn: (id: number) => Promise<string>) {
    if (!escrow) return;
    setAction(name);
    setNotice(null);
    try {
      const txid = await fn(escrow.id);
      setNotice({ kind: 'success', message: `${name} submitted for escrow #${escrow.id}.`, txid });
    } catch (err) {
      setNotice({ kind: 'error', message: errMsg(err) });
    } finally {
      setAction(null);
    }
  }

  const role =
    escrow && address
      ? address === escrow.buyer
        ? 'buyer'
        : address === escrow.seller
          ? 'seller'
          : null
      : null;

  const isParticipant = role !== null;
  const isPending = escrow?.status === EscrowStatus.PENDING;
  const meta = escrow ? STATUS_META[escrow.status] : null;

  return (
    <section className="card card--wide">
      <h2 className="card__title">Manage escrow</h2>
      <p className="card__sub">Look up any escrow, and act on it if you’re the buyer or seller.</p>

      <form
        className="lookup"
        onSubmit={(e) => {
          e.preventDefault();
          void loadById(Number(idInput));
        }}
      >
        <input
          type="number"
          min="1"
          value={idInput}
          onChange={(e) => setIdInput(e.target.value)}
          aria-label="Escrow id"
        />
        <button className="btn btn--secondary" disabled={loading}>
          {loading ? 'Loading…' : 'Look up'}
        </button>
      </form>

      {escrow && meta && (
        <div className="escrow">
          <div className="escrow__head">
            <h3>Escrow #{escrow.id}</h3>
            <span className={`pill pill--${meta.tone}`}>{meta.label}</span>
            <span className="pill pill--slate">{tokenSymbol(escrow.tokenType)}</span>
            {role && <span className="pill pill--blue">You are the {role}</span>}
          </div>

          <dl className="kv">
            <Row k="Amount" v={formatAmount(escrow.amount, escrow.tokenType)} />
            <Row k="Fee" v={formatAmount(escrow.feeAmount, escrow.tokenType)} />
            <Row k="Buyer" v={<code>{shortAddress(escrow.buyer)}</code>} />
            <Row k="Seller" v={<code>{shortAddress(escrow.seller)}</code>} />
            <Row k="Description" v={escrow.description || '—'} />
            <Row k="Created / expires" v={`block ${escrow.createdAt} → ${escrow.expiresAt}`} />
          </dl>

          {isParticipant && isPending ? (
            <div className="actions">
              <button
                className="btn btn--primary"
                disabled={!!action}
                onClick={() => run('Release', releaseEscrow)}
              >
                {action === 'Release' ? '…' : 'Release to seller'}
              </button>
              <button
                className="btn btn--secondary"
                disabled={!!action}
                onClick={() => run('Refund', refundEscrow)}
              >
                {action === 'Refund' ? '…' : 'Refund'}
              </button>
              <button
                className="btn btn--danger"
                disabled={!!action}
                onClick={() => run('Dispute', disputeEscrow)}
              >
                {action === 'Dispute' ? '…' : 'Dispute'}
              </button>
            </div>
          ) : (
            <p className="muted small">
              {!address
                ? 'Connect your wallet to act on an escrow you’re part of.'
                : !isParticipant
                  ? 'Only the buyer or seller can act on this escrow.'
                  : 'This escrow is no longer pending — no actions available.'}
            </p>
          )}
          <p className="muted small">
            The contract enforces who may do what (e.g. buyers can only refund after expiry); a
            disallowed call will be rejected on-chain.
          </p>
        </div>
      )}
    </section>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <>
      <dt>{k}</dt>
      <dd>{v}</dd>
    </>
  );
}

/* ----------------------------------------------------------------- Footer */

function Footer() {
  return (
    <footer className="footer muted small">
      Reads via{' '}
      <a href="https://www.npmjs.com/package/sbtc-escrow-sdk" target="_blank" rel="noreferrer">
        sbtc-escrow-sdk
      </a>{' '}
      · writes signed with{' '}
      <a href="https://www.npmjs.com/package/@stacks/connect" target="_blank" rel="noreferrer">
        @stacks/connect
      </a>{' '}
      · {NETWORK} ·{' '}
      <a href={explorerContract()} target="_blank" rel="noreferrer">
        contract
      </a>
    </footer>
  );
}

/* ------------------------------------------------------------------ utils */

function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'string') return e;
  return 'Something went wrong.';
}
