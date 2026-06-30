import { EscrowClient, type NetworkType } from 'sbtc-escrow-sdk';

/** The whole app targets testnet. Switch to 'mainnet' to point at the live deployment. */
export const NETWORK: NetworkType = 'testnet';

/**
 * One shared SDK client, used for ALL read-only calls (no wallet/key needed):
 * platform stats, config, fee math, fetching escrows.
 */
export const client = new EscrowClient({ network: NETWORK });

/** "address.name" of the escrow contract the SDK is pointed at (e.g. ...escrow-v8). */
export const CONTRACT_ID = client.getContractId() as `${string}.${string}`;

/** Explorer links, courtesy of the SDK. */
export const explorerTx = (txid: string) => client.getExplorerTxUrl(txid);
export const explorerContract = () => client.getExplorerContractUrl();

/** STX has 6 decimals (microSTX). */
export const STX_DECIMALS = 6;
export const microToStx = (micro: number) => micro / 10 ** STX_DECIMALS;
export const stxToMicro = (stx: number) => Math.round(stx * 10 ** STX_DECIMALS);

/** sBTC has 8 decimals (sats). */
export const SBTC_DECIMALS = 8;

import { TokenType } from 'sbtc-escrow-sdk';

const DECIMALS = { [TokenType.STX]: STX_DECIMALS, [TokenType.SBTC]: SBTC_DECIMALS };
const SYMBOL = { [TokenType.STX]: 'STX', [TokenType.SBTC]: 'sBTC' };

/** UI amount (e.g. "1.5") → base units for the given token. */
export const toBaseUnits = (amount: number, token: TokenType) =>
  Math.round(amount * 10 ** DECIMALS[token]);

/** base units → human string like "1.5 STX" / "0.001 sBTC". */
export const formatAmount = (base: number, token: TokenType) =>
  `${(base / 10 ** DECIMALS[token]).toLocaleString(undefined, {
    maximumFractionDigits: DECIMALS[token],
  })} ${SYMBOL[token]}`;

export const tokenSymbol = (token: TokenType) => SYMBOL[token];
