import { useCallback, useEffect, useRef, useState } from 'react';
import type { Escrow } from 'sbtc-escrow-sdk';
import { client } from './config';

/** Run `fn` over ids with bounded concurrency — the public Hiro API 429s easily. */
async function mapLimit<T>(ids: number[], limit: number, fn: (id: number) => Promise<T>) {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += limit) {
    out.push(...(await Promise.all(ids.slice(i, i + limit).map(fn))));
  }
  return out;
}

export interface EscrowFeed {
  escrows: Escrow[];
  total: number | null;
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  loadMore: () => void;
  /** Re-read a single escrow in place — used after an action confirms. */
  refreshOne: (id: number) => Promise<Escrow | null>;
}

const PAGE = 12;

/** Merge by id, newest first. Idempotent, so a repeated page can't duplicate rows. */
function merge(prev: Escrow[], incoming: Escrow[]): Escrow[] {
  const byId = new Map(prev.map((e) => [e.id, e]));
  for (const e of incoming) byId.set(e.id, e);
  return [...byId.values()].sort((a, b) => b.id - a.id);
}

/**
 * Newest-first feed of escrows.
 *
 * The contract exposes `get-escrow-count` and `get-escrow(id)` but no index, so
 * there is no server-side "escrows for address X". We walk ids downward from the
 * count in small pages; filtering by participant happens client-side over what
 * has been loaded, and the UI says so rather than implying a complete view.
 */
export function useEscrows(): EscrowFeed {
  const [escrows, setEscrows] = useState<Escrow[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [wanted, setWanted] = useState(PAGE);

  // Ids already requested. Survives StrictMode's remount, so the double-invoked
  // effect doesn't re-issue the same calls against a rate-limited API.
  const claimed = useRef(new Set<number>());

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      try {
        const count = await client.getEscrowCount();
        if (cancelled) return;
        setTotal(count);

        const ids: number[] = [];
        for (let id = count; id > Math.max(0, count - wanted); id--) {
          if (!claimed.current.has(id)) {
            claimed.current.add(id);
            ids.push(id);
          }
        }
        if (ids.length === 0) return;

        const page = await mapLimit(ids, 4, async (id) => {
          try {
            return await client.getEscrow(id);
          } catch {
            claimed.current.delete(id); // let a later attempt retry this one
            return null;
          }
        });

        const found = page.filter((e): e is Escrow => e !== null);
        // Merging even after cancel is harmless and idempotent — and it keeps
        // StrictMode's discarded first pass from stranding claimed ids.
        setEscrows((prev) => merge(prev, found));
        setError(null);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load escrows.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [wanted]);

  const refreshOne = useCallback(async (id: number) => {
    const fresh = await client.getEscrow(id).catch(() => null);
    if (fresh) setEscrows((prev) => merge(prev, [fresh]));
    return fresh;
  }, []);

  return {
    escrows,
    total,
    loading,
    error,
    hasMore: total !== null && escrows.length < total,
    loadMore: () => setWanted((w) => w + PAGE),
    refreshOne,
  };
}
