import { useState } from 'react';
import { EscrowStatus, type Escrow, type EscrowConfig } from 'sbtc-escrow-sdk';
import {
  releaseEscrow,
  refundEscrow,
  disputeEscrow,
  deliverEscrow,
  extendEscrow,
} from '../lib/escrow';
import { formatAmount, tokenSymbol } from '../lib/config';
import { humanizeBlocks } from '../lib/chain';
import { actionsFor, derive, statusNarrative, type Action, type Role } from '../lib/lifecycle';
import { shortAddress } from '../lib/wallet';
import { Button, CopyButton, Pill, errMsg } from './ui';
import { StatusPill } from './StatusPill';
import type { Notice } from './Toast';

export function EscrowDetail({
  escrow,
  config,
  address,
  burnHeight,
  setNotice,
  onActed,
}: {
  escrow: Escrow;
  config: EscrowConfig | null;
  address: string | null;
  burnHeight: number | null;
  setNotice: (n: Notice) => void;
  onActed: (id: number) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [extending, setExtending] = useState(false);
  const [extraBlocks, setExtraBlocks] = useState('144');

  const role: Role =
    address && escrow.buyer === address
      ? 'buyer'
      : address && escrow.seller === address
        ? 'seller'
        : null;

  const d = derive(escrow, config, burnHeight);
  const actions = actionsFor(escrow, role, d);
  const usable = actions.filter((a) => !a.blockedReason);
  const blocked = actions.filter((a) => a.blockedReason);

  async function run(a: Action, fn: () => Promise<string>) {
    setBusy(a.kind);
    setNotice(null);
    try {
      const txid = await fn();
      setNotice({
        kind: 'success',
        message: `${a.label} submitted for escrow #${escrow.id}. It updates once the chain confirms.`,
        txid,
      });
      setExtending(false);
      // Re-read after ~1 block so the status reflects the action.
      setTimeout(() => onActed(escrow.id), 12_000);
    } catch (err) {
      setNotice({ kind: 'error', message: errMsg(err) });
    } finally {
      setBusy(null);
    }
  }

  function invoke(a: Action) {
    switch (a.kind) {
      case 'release':
        return run(a, () => releaseEscrow(escrow.id));
      case 'refund':
        return run(a, () => refundEscrow(escrow.id));
      case 'dispute':
        return run(a, () => disputeEscrow(escrow.id));
      case 'deliver':
        return run(a, () => deliverEscrow(escrow.id));
      case 'extend':
        return setExtending((v) => !v);
    }
  }

  const variant = (k: string) =>
    k === 'release' ? 'primary' : k === 'dispute' ? 'danger' : 'secondary';

  return (
    <section className="panel" aria-labelledby="detail-title">
      <div className="detail-head">
        <h2 className="panel-title" id="detail-title">
          Escrow #{escrow.id}
        </h2>
        <StatusPill status={escrow.status} />
        <Pill tone="neutral">{tokenSymbol(escrow.tokenType)}</Pill>
        {d.isOpen && d.isExpired && <Pill tone="err">Expired</Pill>}
        {role && <Pill tone="info">You’re the {role}</Pill>}
      </div>

      <p className="narrative">{statusNarrative(escrow, d)}</p>

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
      </dl>

      <Timeline escrow={escrow} d={d} burnHeight={burnHeight} />

      {usable.length > 0 && (
        <div className="actions">
          {usable.map((a) => (
            <Button
              key={a.kind}
              variant={variant(a.kind) as 'primary' | 'secondary' | 'danger'}
              loading={busy === a.kind}
              disabled={!!busy}
              onClick={() => invoke(a)}
              title={a.hint}
            >
              {a.label}
            </Button>
          ))}
        </div>
      )}

      {extending && (
        <form
          className="extend-row"
          onSubmit={(e) => {
            e.preventDefault();
            const n = Number(extraBlocks);
            if (!Number.isInteger(n) || n < 1) {
              return setNotice({ kind: 'error', message: 'Enter a whole number of blocks to add.' });
            }
            void run({ kind: 'extend', label: 'Extend', hint: '' }, () =>
              extendEscrow(escrow.id, n),
            );
          }}
        >
          <label className="field-label" htmlFor="extra-blocks">
            Add blocks
          </label>
          <div className="input-unit">
            <input
              id="extra-blocks"
              className="input tnum"
              type="number"
              min="1"
              step="1"
              value={extraBlocks}
              onChange={(e) => setExtraBlocks(e.target.value)}
            />
            <span className="unit">blocks</span>
          </div>
          <Button type="submit" variant="primary" size="sm" loading={busy === 'extend'}>
            Confirm extend
          </Button>
          <span className="field-hint">
            ≈ {humanizeBlocks(Number(extraBlocks) || 0)} later
          </span>
        </form>
      )}

      {blocked.map((a) => (
        <p key={a.kind} className="guard-note">
          {a.blockedReason}
        </p>
      ))}

      {!role && (
        <p className="guard-note">
          {!address
            ? 'Connect your wallet to act on an escrow you’re part of.'
            : 'Only the buyer or seller can act on this escrow.'}
        </p>
      )}

      {role && !d.isOpen && <p className="guard-note">This escrow is settled — nothing left to do.</p>}
    </section>
  );
}

/**
 * The lifecycle as it actually happened, from the contract's own block numbers.
 * Steps that haven't occurred are shown pending so the path stays legible.
 */
function Timeline({
  escrow,
  d,
  burnHeight,
}: {
  escrow: Escrow;
  d: ReturnType<typeof derive>;
  burnHeight: number | null;
}) {
  const settledLabel =
    escrow.status === EscrowStatus.RELEASED
      ? 'Released to seller'
      : escrow.status === EscrowStatus.REFUNDED
        ? 'Refunded to buyer'
        : escrow.status === EscrowStatus.DISPUTED
          ? 'Disputed'
          : 'Settled';

  const steps: { label: string; block: number | null; done: boolean; note?: string }[] = [
    { label: 'Created', block: escrow.createdAt, done: true },
    {
      label: 'Delivery signaled',
      block: d.deliveredAt,
      done: d.deliveredAt !== null,
      note:
        d.reviewEndsAt !== null
          ? d.inReviewWindow
            ? `review closes at block ${d.reviewEndsAt.toLocaleString()}`
            : 'review window closed'
          : 'seller hasn’t marked delivery',
    },
  ];

  if (d.completedAt !== null || d.disputedAt !== null || !d.isOpen) {
    steps.push({
      label: settledLabel,
      block: d.completedAt ?? d.disputedAt,
      done: true,
    });
  } else {
    steps.push({
      label: 'Expires',
      block: escrow.expiresAt,
      done: d.isExpired,
      note:
        d.blocksToExpiry === null
          ? undefined
          : d.isExpired
            ? `passed ${humanizeBlocks(d.blocksToExpiry)} ago — buyer can refund`
            : `${humanizeBlocks(d.blocksToExpiry)} from now`,
    });
  }

  return (
    <div className="timeline">
      <div className="timeline-head">
        <span className="empty-title" style={{ margin: 0 }}>
          Lifecycle
        </span>
        {burnHeight !== null && (
          <span className="field-hint tnum">burn block {burnHeight.toLocaleString()}</span>
        )}
      </div>
      <ol className="tl">
        {steps.map((s) => (
          <li key={s.label} className={s.done ? 'is-done' : ''}>
            <span className="tl-label">{s.label}</span>
            <span className="tl-block tnum">
              {s.block !== null ? `block ${s.block.toLocaleString()}` : '—'}
            </span>
            {s.note && <span className="tl-note">{s.note}</span>}
          </li>
        ))}
      </ol>
    </div>
  );
}
