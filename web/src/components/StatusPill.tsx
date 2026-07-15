import { EscrowStatus } from 'sbtc-escrow-sdk';
import { Pill, type PillTone } from './ui';

export const STATUS_META: Record<number, { label: string; tone: PillTone }> = {
  [EscrowStatus.PENDING]: { label: 'Pending', tone: 'warn' },
  [EscrowStatus.RELEASED]: { label: 'Released', tone: 'ok' },
  [EscrowStatus.REFUNDED]: { label: 'Refunded', tone: 'neutral' },
  [EscrowStatus.DISPUTED]: { label: 'Disputed', tone: 'err' },
  [EscrowStatus.DELIVERED]: { label: 'Delivered', tone: 'info' },
};

export function StatusPill({ status }: { status: number }) {
  const meta = STATUS_META[status] ?? { label: `Status ${status}`, tone: 'neutral' as PillTone };
  return (
    <Pill tone={meta.tone} dot>
      {meta.label}
    </Pill>
  );
}
