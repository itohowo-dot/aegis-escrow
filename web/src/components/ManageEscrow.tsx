import { useEffect, useState } from 'react';
import {
  client,
  releaseEscrow,
  refundEscrow,
  disputeEscrow,
  EscrowStatus,
  type Escrow,
} from '../lib/escrow';
import { formatAmount, tokenSymbol } from '../lib/config';
import { shortAddress } from '../lib/wallet';
import { Button, CopyButton, Pill, Skeleton, errMsg, type PillTone } from './ui';
import type { Notice } from './Toast';

const STATUS_META: Record<number, { label: string; tone: PillTone }> = {
  [EscrowStatus.PENDING]: { label: 'Pending', tone: 'warn' },
  [EscrowStatus.RELEASED]: { label: 'Released', tone: 'ok' },
  [EscrowStatus.REFUNDED]: { label: 'Refunded', tone: 'neutral' },
  [EscrowStatus.DISPUTED]: { label: 'Disputed', tone: 'err' },
  [EscrowStatus.DELIVERED]: { label: 'Delivered', tone: 'info' },
};

export function ManageEscrow({
  address,
  setNotice,
  focusId,
}: {
  address: string | null;
  setNotice: (n: Notice) => void;
  focusId: number | null;
}) {
  const [idInput, setIdInput] = useState('');
  const [escrow, setEscrow] = useState<Escrow | null>(null);
  const [loading, setLoading] = useState(false);
  const [action, setAction] = useState<string | null>(null);

  async function loadById(id: number) {
    if (!Number.isInteger(id) || id < 1) {
      return setNotice({ kind: 'error', message: 'Enter a valid escrow id (a positive number).' });
    }
    setLoading(true);
    setEscrow(null);
    try {
      const data = await client.getEscrow(id);
      if (!data) setNotice({ kind: 'error', message: `No escrow #${id} on this contract.` });
      setEscrow(data);
    } catch (err) {
      setNotice({ kind: 'error', message: errMsg(err) });
    } finally {
      setLoading(false);
    }
  }

  /** Convenience: fetch the newest escrow on the contract. */
  async function loadLatest() {
    setLoading(true);
    setEscrow(null);
    try {
      const count = await client.getEscrowCount();
      if (count < 1) {
        setNotice({ kind: 'error', message: 'No escrows on this contract yet — create the first one.' });
        return;
      }
      setIdInput(String(count));
      const data = await client.getEscrow(count);
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

  const isPending = escrow?.status === EscrowStatus.PENDING;
  const meta = escrow ? STATUS_META[escrow.status] : null;

  return (
    <section className="panel" aria-labelledby="manage-title">
      <div className="panel-head">
        <h2 className="panel-title" id="manage-title">
          Manage escrow
        </h2>
        <p className="panel-desc">
          Look up any escrow by id — and act on it if you’re the buyer or seller.
        </p>
      </div>

      <form
        className="lookup"
        onSubmit={(e) => {
          e.preventDefault();
          void loadById(Number(idInput));
        }}
      >
        <input
          className="input tnum"
          type="number"
          min="1"
          placeholder="Id"
          value={idInput}
          onChange={(e) => setIdInput(e.target.value)}
          aria-label="Escrow id"
          disabled={loading}
        />
        <Button type="submit" variant="secondary" loading={loading} disabled={loading}>
          Look up
        </Button>
        <span className="lookup-spacer" />
        <Button type="button" variant="ghost" size="sm" onClick={loadLatest} disabled={loading}>
          Latest
        </Button>
      </form>

      {loading && <DetailSkeleton />}

      {!loading && !escrow && <HowItWorks />}

      {!loading && escrow && meta && (
        <div className="escrow-detail">
          <div className="detail-head">
            <h3>Escrow #{escrow.id}</h3>
            <Pill tone={meta.tone} dot>
              {meta.label}
            </Pill>
            <Pill tone="neutral">{tokenSymbol(escrow.tokenType)}</Pill>
            {role && <Pill tone="info">You’re the {role}</Pill>}
          </div>

          <p className="detail-amount tnum">
            {formatAmount(escrow.amount, escrow.tokenType)}
            <span className="fee-note">+ {formatAmount(escrow.feeAmount, escrow.tokenType)} fee</span>
          </p>

          <dl className="kv">
            <dt>Buyer</dt>
            <dd>
              <span className="mono addr" title={escrow.buyer}>
                {shortAddress(escrow.buyer)}
              </span>
              <CopyButton value={escrow.buyer} label="Copy buyer address" />
            </dd>
            <dt>Seller</dt>
            <dd>
              <span className="mono addr" title={escrow.seller}>
                {shortAddress(escrow.seller)}
              </span>
              <CopyButton value={escrow.seller} label="Copy seller address" />
            </dd>
            <dt>Description</dt>
            <dd>{escrow.description || '—'}</dd>
            <dt>Created at block</dt>
            <dd className="tnum">{escrow.createdAt.toLocaleString()}</dd>
            <dt>Expires at block</dt>
            <dd className="tnum">{escrow.expiresAt.toLocaleString()}</dd>
          </dl>

          {role && isPending ? (
            <>
              <div className="actions">
                <Button
                  variant="primary"
                  loading={action === 'Release'}
                  disabled={!!action}
                  onClick={() => run('Release', releaseEscrow)}
                  title="Buyer only — sends the locked funds to the seller"
                >
                  Release to seller
                </Button>
                <Button
                  variant="secondary"
                  loading={action === 'Refund'}
                  disabled={!!action}
                  onClick={() => run('Refund', refundEscrow)}
                  title="Seller any time · buyer after expiry"
                >
                  Refund
                </Button>
                <Button
                  variant="danger"
                  loading={action === 'Dispute'}
                  disabled={!!action}
                  onClick={() => run('Dispute', disputeEscrow)}
                  title="Flags the escrow for resolution — no funds move yet"
                >
                  Dispute
                </Button>
              </div>
              <p className="guard-note">
                The contract enforces who may do what — e.g. buyers can refund only after expiry. A
                disallowed call is rejected on-chain before any funds move.
              </p>
            </>
          ) : (
            <p className="guard-note">
              {!address
                ? 'Connect your wallet to act on an escrow you’re part of.'
                : !role
                  ? 'Only the buyer or seller can act on this escrow.'
                  : 'This escrow is settled — no further actions available.'}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

/** Empty state that teaches the lifecycle instead of saying “nothing here”. */
function HowItWorks() {
  return (
    <div className="empty">
      <p className="empty-title">How an escrow works</p>
      <ol className="steps">
        <li>
          <span>
            <b>Buyer locks funds.</b> The amount plus the platform fee moves into the contract,
            tied to a seller and an expiry block.
          </span>
        </li>
        <li>
          <span>
            <b>The trade happens.</b> When satisfied, the buyer releases to the seller. The seller
            can refund at any time; either side can dispute while it’s pending.
          </span>
        </li>
        <li>
          <span>
            <b>The contract settles.</b> Release pays the seller, refund returns the deposit — and
            after expiry the buyer can reclaim without the seller’s help.
          </span>
        </li>
      </ol>
    </div>
  );
}

/** Mirrors the detail layout while an escrow loads — no spinner-in-a-box. */
function DetailSkeleton() {
  return (
    <div className="escrow-detail" aria-hidden>
      <div className="detail-head">
        <Skeleton w={96} h={18} />
        <Skeleton w={72} h={20} />
        <Skeleton w={48} h={20} />
      </div>
      <p className="detail-amount" style={{ marginBottom: 10 }}>
        <Skeleton w={180} h={22} />
      </p>
      <dl className="kv">
        {Array.from({ length: 5 }).map((_, i) => (
          <FragmentRow key={i} />
        ))}
      </dl>
    </div>
  );
}

function FragmentRow() {
  return (
    <>
      <dt>
        <Skeleton w={80} />
      </dt>
      <dd>
        <Skeleton w="55%" />
      </dd>
    </>
  );
}
