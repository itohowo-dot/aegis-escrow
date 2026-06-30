# Aegis Escrow — CLI

A tiny CLI that exercises [`sbtc-escrow-sdk`](https://www.npmjs.com/package/sbtc-escrow-sdk)
against the live Stacks **testnet**. It reads on-chain escrow data with zero
setup, and can optionally create an escrow if you provide a funded testnet key.

The SDK talks to the sBTC Escrow contract (`escrow-v8` on testnet) — trustless
payment escrow for STX and sBTC: lock funds, release on agreement, refund/dispute
otherwise.

## Setup

```bash
npm install
```

That's it for the read commands — no wallet, no key needed.

## Read commands (work immediately)

```bash
npm run config         # contract config: fee bps, amount limits, pause state
npm run stats          # platform-wide volumes & fees
npm run get 1          # fetch escrow #1
npm run fee 1000000    # platform fee for an amount (base units: microSTX/sats)
```

> The public Hiro API rate-limits aggressively (HTTP 429). If you hit it, wait a
> few seconds and rerun.

## Write command (optional)

Creating an escrow broadcasts a real transaction, so it needs a signing key:

1. `cp .env.example .env`
2. Create a throwaway **testnet** wallet (Leather/Xverse) and fund it from the
   [faucet](https://explorer.hiro.so/sandbox/faucet?chain=testnet).
3. Put the wallet's private key in `SIGNER_KEY` and a seller address in
   `SELLER_ADDRESS`.
4. Run:

```bash
npm run create         # creates a 1 STX escrow, prints txid + explorer link
```

Then read it back with `npm run get <newId>` once it confirms (~1 block).

## How the SDK is used

The whole integration is one client (see [src/index.ts](src/index.ts)):

```ts
import { EscrowClient, TokenType } from 'sbtc-escrow-sdk';

const client = new EscrowClient({ network: 'testnet' });

// read (no key)
const stats  = await client.getPlatformStats();
const escrow = await client.getEscrow(1);
const fee    = await client.calculateEscrowFee(1_000_000);

// write (needs a private key)
const res = await client.createEscrow(
  { seller: 'ST...', amount: 1_000_000, description: 'Payment',
    durationBlocks: 144, tokenType: TokenType.STX },
  { senderKey: process.env.SIGNER_KEY! },
);
```

Other client methods worth knowing: `release`, `refund`, `dispute`, `deliver`,
`extendEscrow`, `getConfig`, `getUserStats`, `getStatus`, `isExpired`,
`getExplorerTxUrl`. Pass `{ network: 'mainnet' }` to target the mainnet
deployment instead.

## Notes

- Amounts are in **base units**: microSTX (6 decimals) for STX, sats (8 decimals)
  for sBTC.
- Peer deps `@stacks/transactions` and `@stacks/network` (v7) are installed
  alongside the SDK.
