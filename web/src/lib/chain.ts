import { useEffect, useState } from 'react';
import { NETWORK } from './config';

export const API_BASE =
  NETWORK === 'mainnet' ? 'https://api.hiro.so' : 'https://api.testnet.hiro.so';

/**
 * escrow-v8 is a v3-feature contract: `durationBlocks` and `expiresAt` are
 * measured in BURN blocks (Bitcoin chain), not Stacks blocks. Everything here
 * works in burn blocks so on-screen countdowns match what the contract enforces.
 */
export const BURN_BLOCKS_PER_DAY = 144;

/** Current burn block height, or null until it loads. */
export function useBurnHeight(): number | null {
  const [height, setHeight] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch(`${API_BASE}/v2/info`);
        if (!r.ok) return;
        const info = (await r.json()) as { burn_block_height?: number };
        if (alive && typeof info.burn_block_height === 'number') setHeight(info.burn_block_height);
      } catch {
        /* transient — keep the last known height */
      }
    };
    void load();
    // Bitcoin blocks land ~every 10 min; 2 min keeps countdowns honest without
    // hammering the rate-limited public API.
    const t = setInterval(load, 120_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  return height;
}

/** "~2 days" / "~5 hours" / "~20 min" for a burn-block span. */
export function humanizeBlocks(blocks: number): string {
  const n = Math.abs(blocks);
  if (n < 1) return 'moments';
  if (n < 6) return `~${n * 10} min`;
  const hours = n / 6;
  if (hours < 48) return `~${Math.round(hours)} hour${Math.round(hours) === 1 ? '' : 's'}`;
  const days = n / BURN_BLOCKS_PER_DAY;
  return `~${days < 10 ? days.toFixed(1) : Math.round(days)} days`;
}

/** The SDK returns NaN (not null) for unset block fields on some escrows. */
export const blockOrNull = (v: number | null | undefined): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;
