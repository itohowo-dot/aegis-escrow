import { TokenType } from 'sbtc-escrow-sdk';
import { formatAmount } from '../lib/config';
import type { Platform } from '../lib/usePlatform';
import { Skeleton } from './ui';

/**
 * Quiet one-line context bar under the header: live contract facts the user
 * needs before trusting the tool with funds. Reads only; skeletons while
 * loading, a single muted line if the API is unavailable.
 */
export function NetworkStrip({
  platform,
  burnHeight,
}: {
  platform: Platform;
  burnHeight: number | null;
}) {
  const { stats, config, error, loading } = platform;

  if (error) {
    return (
      <div className="strip" role="status">
        <span className="strip-item">Live contract data unavailable right now — retry in a few seconds (testnet API rate limit).</span>
      </div>
    );
  }

  if (loading || !stats || !config) {
    return (
      <div className="strip" aria-busy="true" aria-label="Loading contract data">
        <Skeleton w={132} />
        <Skeleton w={88} />
        <Skeleton w={110} />
        <Skeleton w={140} />
        <Skeleton w={120} />
      </div>
    );
  }

  return (
    <div className="strip">
      <span className="strip-item">
        Escrows <b className="tnum">{stats.totalEscrows.toLocaleString()}</b>
      </span>
      <span className="strip-item">
        Fee <b className="tnum">{config.platformFeeBps / 100}%</b>
      </span>
      <span className="strip-item">
        Released <b className="tnum">{stats.totalReleased.toLocaleString()}</b>
      </span>
      <span className="strip-item">
        Disputes <b className="tnum">{stats.activeDisputes.toLocaleString()}</b>
      </span>
      <span className="strip-item">
        STX volume <b className="tnum">{formatAmount(stats.totalVolumeStx, TokenType.STX)}</b>
      </span>
      {burnHeight !== null && (
        <span className="strip-item">
          Burn block <b className="tnum">{burnHeight.toLocaleString()}</b>
        </span>
      )}
      {config.isPaused && (
        <span className="strip-item">
          <span className="paused">Contract paused — writes disabled</span>
        </span>
      )}
    </div>
  );
}
