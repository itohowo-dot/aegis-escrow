import { EscrowStatus, type Escrow, type EscrowConfig } from 'sbtc-escrow-sdk';
import { blockOrNull, humanizeBlocks } from './chain';

/**
 * The escrow state machine, mirrored from the contract (escrow-v8 / v7+ rules).
 *
 *   PENDING ──deliver(seller)──▶ DELIVERED ──┐
 *      │                             │       ├─release(buyer)──▶ RELEASED
 *      ├─release(buyer)──────────────┘       ├─refund──────────▶ REFUNDED
 *      ├─refund(seller any time; buyer only after expiry + review window)
 *      └─dispute(buyer|seller)───────────────┴─────────────────▶ DISPUTED
 *
 * Gating here is deliberate: the contract rejects disallowed calls anyway, but
 * offering a button that is guaranteed to fail on-chain — and cost a wallet
 * round-trip to find out — is not an acceptable UX.
 */

export type Role = 'buyer' | 'seller' | null;
export type ActionKind = 'deliver' | 'release' | 'refund' | 'dispute' | 'extend';

export interface Derived {
  /** PENDING or DELIVERED — funds still held, transitions possible. */
  isOpen: boolean;
  isExpired: boolean;
  blocksToExpiry: number | null;
  /** Block the post-delivery review window closes on (v7+). */
  reviewEndsAt: number | null;
  inReviewWindow: boolean;
  deliveredAt: number | null;
  completedAt: number | null;
  disputedAt: number | null;
}

export interface Action {
  kind: ActionKind;
  label: string;
  /** Shown when the action is offered. */
  hint: string;
  /** Set when the user holds the role but conditions aren't met yet. */
  blockedReason?: string;
}

export function derive(
  escrow: Escrow,
  config: EscrowConfig | null,
  burnHeight: number | null,
): Derived {
  const deliveredAt = blockOrNull(escrow.deliveredAt);
  const reviewPeriod = config?.reviewPeriod;
  const reviewEndsAt =
    deliveredAt !== null && reviewPeriod !== undefined ? deliveredAt + reviewPeriod : null;

  return {
    isOpen: escrow.status === EscrowStatus.PENDING || escrow.status === EscrowStatus.DELIVERED,
    isExpired: burnHeight !== null && burnHeight > escrow.expiresAt,
    blocksToExpiry: burnHeight !== null ? escrow.expiresAt - burnHeight : null,
    reviewEndsAt,
    inReviewWindow: reviewEndsAt !== null && burnHeight !== null && burnHeight <= reviewEndsAt,
    deliveredAt,
    completedAt: blockOrNull(escrow.completedAt),
    disputedAt: blockOrNull(escrow.disputedAt),
  };
}

/**
 * Actions this role may take right now, plus ones they own but can't use yet
 * (returned with `blockedReason` so the UI can explain instead of going silent).
 */
export function actionsFor(escrow: Escrow, role: Role, d: Derived): Action[] {
  if (!role || !d.isOpen) return [];

  const out: Action[] = [];
  const pending = escrow.status === EscrowStatus.PENDING;

  if (role === 'seller' && pending) {
    out.push({
      kind: 'deliver',
      label: 'Mark delivered',
      hint: 'Signals delivery on-chain and starts the buyer’s review window.',
    });
  }

  if (role === 'buyer') {
    out.push({
      kind: 'release',
      label: 'Release to seller',
      hint: 'Pays the locked funds to the seller. This is final.',
    });
  }

  if (role === 'seller') {
    out.push({
      kind: 'refund',
      label: 'Refund buyer',
      hint: 'Returns the deposit to the buyer. Available to you at any time.',
    });
  } else if (role === 'buyer') {
    // Buyer's refund is time-gated: expiry must pass, and any review window
    // opened by a seller's deliver() must have fully elapsed.
    let blockedReason: string | undefined;
    if (!d.isExpired) {
      blockedReason =
        d.blocksToExpiry !== null
          ? `You can refund yourself once this expires in ${humanizeBlocks(d.blocksToExpiry)}.`
          : 'You can refund yourself once this escrow expires.';
    } else if (d.inReviewWindow) {
      blockedReason = 'The seller marked this delivered — refund is paused until the review window closes.';
    }
    out.push({
      kind: 'refund',
      label: 'Refund to me',
      hint: 'Returns your deposit. Allowed after expiry.',
      blockedReason,
    });
  }

  out.push({
    kind: 'dispute',
    label: 'Dispute',
    hint: 'Flags the escrow for resolution. No funds move.',
  });

  if (role === 'buyer' && pending) {
    out.push({
      kind: 'extend',
      label: 'Extend',
      hint: 'Pushes the expiry further out.',
      blockedReason: d.isExpired ? 'Already expired — it can no longer be extended.' : undefined,
    });
  }

  return out;
}

/** One-line plain-language summary of where the escrow stands. */
export function statusNarrative(escrow: Escrow, d: Derived): string {
  switch (escrow.status) {
    case EscrowStatus.RELEASED:
      return 'Funds were released to the seller.';
    case EscrowStatus.REFUNDED:
      return 'Funds were returned to the buyer.';
    case EscrowStatus.DISPUTED:
      return 'Flagged for resolution — funds stay locked until an admin resolves it.';
    case EscrowStatus.DELIVERED:
      return d.inReviewWindow
        ? 'Seller marked this delivered. The buyer is reviewing.'
        : 'Seller marked this delivered. The review window has closed.';
    case EscrowStatus.PENDING:
    default:
      if (d.isExpired) return 'Past expiry — the buyer can now refund without the seller.';
      if (d.blocksToExpiry !== null) return `Funds locked. Expires in ${humanizeBlocks(d.blocksToExpiry)}.`;
      return 'Funds are locked in the contract.';
  }
}
