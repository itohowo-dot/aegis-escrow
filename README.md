# Aegis Escrow

Trustless **STX & sBTC escrow** on the Stacks blockchain — lock funds in a smart
contract, release them when both sides agree, refund or dispute otherwise. No
intermediary holds the money; the contract does.

This repo is a reference integration of the
[`sbtc-escrow-sdk`](https://www.npmjs.com/package/sbtc-escrow-sdk), built two ways:

| Package | What it is | Signing |
| --- | --- | --- |
| [`cli/`](cli) | A Node/TypeScript CLI that reads on-chain data and can create escrows | Raw private key (server-side) |
| [`web/`](web) | A React + Vite dApp to create and manage escrows from a browser wallet | Wallet (Leather / Xverse) via `@stacks/connect` |

Both target Stacks **testnet** by default (contract `escrow-v8`), so reads work
with zero setup.

## The two signing models (why two apps)

The SDK is the single source of truth for **reading** the contract — both apps use
`EscrowClient` for stats, config, fee math, and fetching escrows. They differ only
in how **writes** are signed:

- **CLI** uses the SDK's own write methods (`client.createEscrow`, `client.release`…),
  which sign with a raw private key — ideal for backends and scripts.
- **Web** can't see a private key (the wallet keeps it), so it mirrors the SDK's
  exact contract calls through `@stacks/connect`'s `request('stx_callContract', …)`
  and lets the wallet sign. Same contract, same args, same post-conditions.

## Quick start

### CLI (no wallet needed)

```bash
cd cli
npm install
npm run config        # contract config
npm run stats         # platform volumes & fees
npm run get 1         # fetch escrow #1
npm run fee 1000000   # platform fee for an amount (base units)
```

Creating an escrow from the CLI needs a funded testnet key — see [cli/README.md](cli/README.md).

### Web app

```bash
cd web
npm install
npm run dev           # http://localhost:5173
```

Then:

1. Install a Stacks wallet ([Leather](https://leather.io) or
   [Xverse](https://www.xverse.app)) and switch it to **testnet**.
2. Fund it from the [testnet faucet](https://explorer.hiro.so/sandbox/faucet?chain=testnet).
3. **Connect wallet**, create an escrow, then look it up and release/refund/dispute it.

## How the SDK shows up in code

```ts
import { EscrowClient, TokenType } from 'sbtc-escrow-sdk';

const client = new EscrowClient({ network: 'testnet' });

// reads — no key, used by both apps
await client.getPlatformStats();
await client.getEscrow(1);
await client.calculateEscrowFee(1_000_000);

// write — CLI path (raw key)
await client.createEscrow(
  { seller, amount: 1_000_000, description: '…', durationBlocks: 144, tokenType: TokenType.STX },
  { senderKey: process.env.SIGNER_KEY! },
);
```

The browser equivalent of that `createEscrow` lives in
[web/src/lib/escrow.ts](web/src/lib/escrow.ts).

## Notes

- Amounts are **base units**: microSTX (6 decimals) for STX, sats (8 decimals) for sBTC.
- The public Hiro API rate-limits aggressively (HTTP 429); retry after a few seconds.
- Testnet only by default. Flip `NETWORK` to `'mainnet'` in each app to target the
  live deployment — do that deliberately.
