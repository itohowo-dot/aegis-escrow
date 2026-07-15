import { useEffect, useState } from 'react';
import { client } from './config';
import type { EscrowConfig, PlatformStats } from 'sbtc-escrow-sdk';

export interface Platform {
  stats: PlatformStats | null;
  config: EscrowConfig | null;
  error: string | null;
  loading: boolean;
}

/**
 * One shared fetch of platform stats + contract config (SDK reads, no wallet).
 * Fetched once at app mount; the config also powers the create-form fee
 * estimate and amount/duration validation.
 */
export function usePlatform(): Platform {
  const [state, setState] = useState<Platform>({
    stats: null,
    config: null,
    error: null,
    loading: true,
  });

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [stats, config] = await Promise.all([client.getPlatformStats(), client.getConfig()]);
        if (alive) setState({ stats, config, error: null, loading: false });
      } catch (e) {
        if (alive)
          setState({
            stats: null,
            config: null,
            error: e instanceof Error ? e.message : 'failed to load',
            loading: false,
          });
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return state;
}
