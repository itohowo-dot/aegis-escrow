import { useMemo, useRef, useState } from 'react';
import { EscrowStatus, type Escrow } from 'sbtc-escrow-sdk';
import type { EscrowFeed } from '../lib/useEscrows';
import { formatAmount } from '../lib/config';
import { humanizeBlocks } from '../lib/chain';
import { useRowStagger } from '../lib/motion';
import { Button, Pill, Skeleton } from './ui';
import { StatusPill } from './StatusPill';

type Filter = 'all' | 'mine';

export function EscrowList({
  feed,
  address,
  burnHeight,
  selectedId,
  onSelect,
}: {
  feed: EscrowFeed;
  address: string | null;
  burnHeight: number | null;
  selectedId: number | null;
  onSelect: (id: number) => void;
}) {
  const [filter, setFilter] = useState<Filter>('all');
  const { escrows, total, loading, error, hasMore, loadMore } = feed;
  const listRef = useRef<HTMLElement>(null);

  const mineCount = useMemo(
    () => (address ? escrows.filter((e) => e.buyer === address || e.seller === address).length : 0),
    [escrows, address],
  );

  const rows = useMemo(
    () =>
      filter === 'mine' && address
        ? escrows.filter((e) => e.buyer === address || e.seller === address)
        : escrows,
    [escrows, filter, address],
  );

  useRowStagger(listRef, rows.length);

  return (
    <section className="panel" aria-labelledby="list-title" ref={listRef}>
      <div className="panel-head list-head">
        <div>
          <h2 className="panel-title" id="list-title">
            Escrows
          </h2>
          <p className="panel-desc">
            {total !== null ? `${total.toLocaleString()} on this contract` : 'Reading the contract…'}
          </p>
        </div>

        {address && (
          <div className="seg seg-inline" role="radiogroup" aria-label="Filter escrows">
            {(['all', 'mine'] as Filter[]).map((f) => (
              <button
                key={f}
                type="button"
                role="radio"
                aria-checked={filter === f}
                className="seg-btn"
                onClick={() => setFilter(f)}
              >
                {f === 'all' ? 'All' : `Yours${mineCount ? ` (${mineCount})` : ''}`}
              </button>
            ))}
          </div>
        )}
      </div>

      {error && (
        <p className="guard-note">
          Couldn’t load escrows — the public testnet API rate-limits aggressively. Try again in a
          few seconds.
        </p>
      )}

      <ul className="rows" role="list">
        {rows.map((e) => (
          <Row
            key={e.id}
            escrow={e}
            address={address}
            burnHeight={burnHeight}
            selected={e.id === selectedId}
            onSelect={() => onSelect(e.id)}
          />
        ))}
        {loading && escrows.length === 0 && <RowSkeletons />}
      </ul>

      {!loading && rows.length === 0 && !error && (
        <p className="guard-note">
          {filter === 'mine'
            ? `None of the ${escrows.length} most recent escrows involve your wallet.`
            : 'No escrows on this contract yet — create the first one.'}
        </p>
      )}

      {hasMore && (
        <div className="rows-foot">
          <Button variant="ghost" size="sm" onClick={loadMore} loading={loading} disabled={loading}>
            Load older
          </Button>
          <span className="field-hint">
            Showing {escrows.length} of {total}
            {filter === 'mine' && ' · “Yours” filters what’s loaded'}
          </span>
        </div>
      )}
    </section>
  );
}

function Row({
  escrow,
  address,
  burnHeight,
  selected,
  onSelect,
}: {
  escrow: Escrow;
  address: string | null;
  burnHeight: number | null;
  selected: boolean;
  onSelect: () => void;
}) {
  const role =
    address && escrow.buyer === address
      ? 'Buyer'
      : address && escrow.seller === address
        ? 'Seller'
        : null;

  const isOpen =
    escrow.status === EscrowStatus.PENDING || escrow.status === EscrowStatus.DELIVERED;
  const expired = burnHeight !== null && burnHeight > escrow.expiresAt;
  const toExpiry = burnHeight !== null ? escrow.expiresAt - burnHeight : null;

  return (
    <li>
      <button
        type="button"
        className={`row${selected ? ' is-selected' : ''}`}
        onClick={onSelect}
        aria-current={selected || undefined}
      >
        <span className="row-id tnum">#{escrow.id}</span>
        <span className="row-amount tnum">{formatAmount(escrow.amount, escrow.tokenType)}</span>
        {/* status + role travel together so the row can fold onto two lines */}
        <span className="row-status">
          <StatusPill status={escrow.status} />
          {isOpen && expired && <Pill tone="err">Expired</Pill>}
          {role && <span className="row-role">{role}</span>}
        </span>
        <span className="row-time">
          {isOpen && toExpiry !== null
            ? expired
              ? `${humanizeBlocks(toExpiry)} ago`
              : `in ${humanizeBlocks(toExpiry)}`
            : ''}
        </span>
      </button>
    </li>
  );
}

function RowSkeletons() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <li key={i} className="row row-skel" aria-hidden>
          <Skeleton w={28} />
          <Skeleton w={92} />
          <Skeleton w={70} h={20} />
          <Skeleton w={54} />
        </li>
      ))}
    </>
  );
}
