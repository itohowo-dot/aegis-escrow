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
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const count = total ?? (await client.getEscrowCount());
        if (!alive.current) return;
        setTotal(count);

        const ids: number[] = [];
        for (let id = count - escrows.length; id > 0 && ids.length < wanted - escrows.length; id--) {
          ids.push(id);
        }
        if (ids.length === 0) {
          setLoading(false);
          return;
        }

        const page = (await mapLimit(ids, 4, (id) => client.getEscrow(id).catch(() => null))).filter(
          (e): e is Escrow => e !== null,
        );
        if (!alive.current) return;
        setEscrows((prev) => [...prev, ...page]);
        setError(null);
      } catch (e) {
        if (alive.current) setError(e instanceof Error ? e.message : 'Failed to load escrows.');
      } finally {
        if (alive.current) setLoading(false);
      }
    })();
    // Intentionally keyed on `wanted` only: each bump loads exactly one more page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wanted]);

  const refreshOne = useCallback(async (id: number) => {
    const fresh = await client.getEscrow(id).catch(() => null);
    if (fresh && alive.current) {
      setEscrows((prev) => prev.map((e) => (e.id === id ? fresh : e)));
    }
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
