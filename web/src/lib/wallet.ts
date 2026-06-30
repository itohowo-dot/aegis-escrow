import { connect, disconnect, getLocalStorage, isConnected } from '@stacks/connect';

/**
 * Thin wrapper around @stacks/connect's session model.
 *
 * `connect()` opens the wallet (Leather / Xverse), and on approval persists the
 * granted addresses to localStorage. We read the STX address back from there.
 */

/** Opens the wallet picker and returns the connected STX address (or null if cancelled). */
export async function connectWallet(): Promise<string | null> {
  await connect();
  return getStxAddress();
}

/** Current connected STX address, or null. Reads the persisted connect session. */
export function getStxAddress(): string | null {
  const data = getLocalStorage();
  return data?.addresses?.stx?.[0]?.address ?? null;
}

/** Clears the connect session. */
export function disconnectWallet(): void {
  disconnect();
}

export { isConnected };

/** ST1234…WXYZ */
export function shortAddress(addr: string): string {
  return addr.length > 12 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;
}
