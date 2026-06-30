import { request } from '@stacks/connect';
import { Cl, Pc } from '@stacks/transactions';
import { TokenType } from 'sbtc-escrow-sdk';
import { client, CONTRACT_ID, NETWORK } from './config';

/**
 * Wallet-signed write operations.
 *
 * The SDK's own write methods (client.createEscrow, client.release, …) sign with
 * a RAW PRIVATE KEY — perfect for a CLI/server, but a browser wallet never exposes
 * the key. So in the browser we mirror those exact contract calls through
 * @stacks/connect's `request('stx_callContract', …)`, which hands signing to the
 * user's wallet. Function names, argument shapes and post-conditions below are
 * copied from the SDK (escrow-v8 / v3 feature set) so behaviour stays identical.
 *
 * Reads still go through the SDK — see `client.*` re-exported at the bottom.
 */

const API_BASE = NETWORK === 'mainnet' ? 'https://api.hiro.so' : 'https://api.testnet.hiro.so';

/** request('stx_callContract') resolves to { txid?, transaction? }; we require a txid. */
function requireTxid(res: { txid?: string }): string {
  if (!res?.txid) {
    throw new Error('No transaction id returned — the request was likely rejected in the wallet.');
  }
  return res.txid;
}

export interface CreateEscrowParams {
  buyer: string; // the connected wallet (pays amount + fee)
  seller: string;
  amount: number; // base units: microSTX (STX) or sats (sBTC)
  description: string;
  durationBlocks: number;
  tokenType: TokenType;
}

/**
 * create-escrow (STX or sBTC). Buyer deposits `amount + fee`. The post-condition
 * pins the outflow: an exact STX amount, or an upper-bounded sBTC transfer (the
 * SDK uses `willSendLte` for the SIP-010 leg). The trailing `Cl.none()` is the
 * optional v3+ beneficiary slot, which escrow-v8 requires.
 */
export async function createEscrow(p: CreateEscrowParams): Promise<string> {
  const fee = await client.calculateEscrowFee(p.amount);
  const total = p.amount + fee;

  const postCondition =
    p.tokenType === TokenType.SBTC
      ? sbtcUserPc(p.buyer, total)
      : Pc.principal(p.buyer).willSendEq(total).ustx();

  const res = await request('stx_callContract', {
    contract: CONTRACT_ID,
    functionName: 'create-escrow',
    functionArgs: [
      Cl.principal(p.seller),
      Cl.uint(p.amount),
      Cl.stringUtf8(p.description),
      Cl.uint(p.durationBlocks),
      Cl.uint(p.tokenType),
      Cl.none(),
    ],
    postConditions: [postCondition],
    postConditionMode: 'deny',
    network: NETWORK,
  });
  return requireTxid(res);
}

/** SIP-010 post-condition for the buyer's sBTC deposit (mirrors the SDK). */
function sbtcUserPc(sender: string, amount: number) {
  const [address, name] = client.getSbtcContract().split('.');
  return Pc.principal(sender).willSendLte(amount).ft(`${address}.${name}`, 'sbtc-token');
}

/** release — buyer sends the locked funds on to the seller. */
export function releaseEscrow(escrowId: number): Promise<string> {
  return simpleAction('release', escrowId, 'allow');
}

/** refund — seller anytime; buyer only after expiry (the contract enforces this). */
export function refundEscrow(escrowId: number): Promise<string> {
  return simpleAction('refund', escrowId, 'allow');
}

/** dispute — buyer or seller flags the escrow for resolution. No funds move yet. */
export function disputeEscrow(escrowId: number): Promise<string> {
  return simpleAction('dispute', escrowId, 'deny');
}

/** Shared shape for the single-uint-arg state transitions. */
async function simpleAction(
  functionName: string,
  escrowId: number,
  mode: 'allow' | 'deny',
): Promise<string> {
  const res = await request('stx_callContract', {
    contract: CONTRACT_ID,
    functionName,
    functionArgs: [Cl.uint(escrowId)],
    postConditionMode: mode,
    network: NETWORK,
  });
  return requireTxid(res);
}

/**
 * Poll the API until a create-escrow tx confirms, then resolve the new escrow id.
 *
 * `create-escrow` returns `(ok <id>)`, so we read the id straight from the tx
 * result when present, and fall back to the live escrow count otherwise.
 * Throws on failed/aborted/timed-out transactions.
 */
export async function waitForNewEscrowId(
  txid: string,
  opts: { isCancelled?: () => boolean; timeoutMs?: number } = {},
): Promise<number> {
  const deadline = Date.now() + (opts.timeoutMs ?? 5 * 60_000);

  while (Date.now() < deadline) {
    if (opts.isCancelled?.()) throw new Error('cancelled');
    try {
      const r = await fetch(`${API_BASE}/extended/v1/tx/${txid}`);
      if (r.ok) {
        const tx = (await r.json()) as { tx_status?: string; tx_result?: { repr?: string } };
        if (tx.tx_status === 'success') {
          const m = /\(ok\s+u(\d+)\)/.exec(tx.tx_result?.repr ?? '');
          return m ? Number(m[1]) : await client.getEscrowCount();
        }
        if (tx.tx_status && tx.tx_status !== 'pending') {
          throw new Error(`Transaction did not succeed on-chain (${tx.tx_status}).`);
        }
      }
    } catch (e) {
      // Re-throw real on-chain failures; swallow transient network / 429 blips.
      if (e instanceof Error && /did not succeed|cancelled/.test(e.message)) throw e;
    }
    await delay(8000);
  }
  throw new Error('Timed out waiting for the transaction to confirm.');
}

const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));

// Re-export the read surface so the UI imports everything escrow-related from here.
export { client } from './config';
export { TokenType, EscrowStatus } from 'sbtc-escrow-sdk';
export type { Escrow, EscrowConfig, PlatformStats } from 'sbtc-escrow-sdk';
