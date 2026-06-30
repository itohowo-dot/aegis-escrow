/**
 * sbtc-escrow-sdk demo CLI
 * ------------------------
 * A tiny project that exercises the SDK against the live Stacks testnet.
 *
 * Read commands work with zero setup (no wallet, no key):
 *   npm run stats          -> platform-wide volumes & fees
 *   npm run config         -> contract config (fee bps, limits, pause state)
 *   npm run get 1          -> fetch escrow #1
 *   npm run fee 1000000    -> compute the platform fee for an amount
 *
 * The write command needs a funded testnet key in .env (see .env.example):
 *   npm run create         -> create a new STX escrow on testnet
 */
import 'dotenv/config';
import {
  EscrowClient,
  TokenType,
  EscrowStatus,
  type NetworkType,
} from 'sbtc-escrow-sdk';

const NETWORK = (process.env.NETWORK as NetworkType) ?? 'testnet';

// One client, reused by every command. No contractAddress/contractName passed,
// so the SDK uses its current default deployment for the network
// (escrow-v8 on testnet / escrow-mainnet-v3 on mainnet).
const client = new EscrowClient({ network: NETWORK });

// ---- formatting helpers -------------------------------------------------

const STATUS_LABEL: Record<number, string> = {
  [EscrowStatus.PENDING]: 'PENDING',
  [EscrowStatus.RELEASED]: 'RELEASED',
  [EscrowStatus.REFUNDED]: 'REFUNDED',
  [EscrowStatus.DISPUTED]: 'DISPUTED',
  [EscrowStatus.DELIVERED]: 'DELIVERED',
};

/** STX has 6 decimals (microSTX), sBTC has 8 (sats). */
function humanAmount(raw: number, token: TokenType): string {
  if (token === TokenType.STX) return `${(raw / 1e6).toLocaleString()} STX`;
  return `${(raw / 1e8).toLocaleString()} sBTC`;
}

function heading(title: string) {
  console.log(`\n${title}`);
  console.log('─'.repeat(title.length));
}

// ---- commands -----------------------------------------------------------

async function cmdStats() {
  heading(`Platform stats (${NETWORK})`);
  const stats = await client.getPlatformStats();
  console.log(`Total escrows ......... ${stats.totalEscrows}`);
  console.log(`Volume (STX) .......... ${humanAmount(stats.totalVolumeStx, TokenType.STX)}`);
  console.log(`Volume (sBTC) ......... ${humanAmount(stats.totalVolumeSbtc, TokenType.SBTC)}`);
  console.log(`Fees collected (STX) .. ${humanAmount(stats.totalFeesCollectedStx, TokenType.STX)}`);
  console.log(`Fees collected (sBTC) . ${humanAmount(stats.totalFeesCollectedSbtc, TokenType.SBTC)}`);
  console.log(`Released .............. ${stats.totalReleased}`);
  console.log(`Refunded .............. ${stats.totalRefunded}`);
  console.log(`Active disputes ....... ${stats.activeDisputes}`);
}

async function cmdConfig() {
  heading(`Contract config (${NETWORK})`);
  const c = await client.getConfig();
  console.log(`Contract .............. ${client.getContractId()}`);
  console.log(`Owner ................. ${c.owner}`);
  console.log(`Fee recipient ......... ${c.feeRecipient}`);
  console.log(`Platform fee .......... ${c.platformFeeBps} bps (${c.platformFeeBps / 100}%)`);
  console.log(`Paused ................ ${c.isPaused}`);
  console.log(`STX amount range ...... ${humanAmount(c.minAmountStx, TokenType.STX)} – ${humanAmount(c.maxAmountStx, TokenType.STX)}`);
  console.log(`sBTC amount range ..... ${humanAmount(c.minAmountSbtc, TokenType.SBTC)} – ${humanAmount(c.maxAmountSbtc, TokenType.SBTC)}`);
  console.log(`Max duration .......... ${c.maxDuration} blocks`);
  console.log(`Dispute timeout ....... ${c.disputeTimeout} blocks`);
  console.log(`Explorer .............. ${client.getExplorerContractUrl()}`);
}

async function cmdGet(idArg?: string) {
  const id = Number(idArg);
  if (!Number.isInteger(id) || id < 1) {
    console.error('Usage: npm run get <escrowId>   (e.g. npm run get 1)');
    process.exit(1);
  }
  heading(`Escrow #${id} (${NETWORK})`);
  const escrow = await client.getEscrow(id);
  if (!escrow) {
    console.log(`No escrow with id ${id} on this contract yet.`);
    return;
  }
  console.log(`Status ................ ${STATUS_LABEL[escrow.status] ?? escrow.status}`);
  console.log(`Buyer ................. ${escrow.buyer}`);
  console.log(`Seller ................ ${escrow.seller}`);
  console.log(`Amount ................ ${humanAmount(escrow.amount, escrow.tokenType)}`);
  console.log(`Fee ................... ${humanAmount(escrow.feeAmount, escrow.tokenType)}`);
  console.log(`Description ........... ${escrow.description}`);
  console.log(`Created at block ...... ${escrow.createdAt}`);
  console.log(`Expires at block ...... ${escrow.expiresAt}`);
}

async function cmdFee(amountArg?: string) {
  const amount = Number(amountArg);
  if (!Number.isFinite(amount) || amount <= 0) {
    console.error('Usage: npm run fee <amount>   (base units: microSTX or sats, e.g. npm run fee 1000000)');
    process.exit(1);
  }
  heading('Fee calculation');
  const fee = await client.calculateEscrowFee(amount);
  console.log(`Amount ................ ${amount.toLocaleString()} base units`);
  console.log(`Platform fee .......... ${fee.toLocaleString()} base units`);
  console.log(`Buyer deposits ........ ${(amount + fee).toLocaleString()} base units (amount + fee)`);
}

async function cmdCreate() {
  const senderKey = process.env.SIGNER_KEY;
  const seller = process.env.SELLER_ADDRESS;
  if (!senderKey || !seller) {
    console.error('Set SIGNER_KEY and SELLER_ADDRESS in .env first (see .env.example).');
    console.error('Read commands (stats/config/get/fee) need none of that — try `npm run stats`.');
    process.exit(1);
  }
  if (NETWORK !== 'testnet') {
    console.error('Refusing to auto-create on a non-testnet network. Set NETWORK=testnet.');
    process.exit(1);
  }

  heading('Creating STX escrow on testnet');
  const amount = 1_000_000; // 1 STX in microSTX
  const result = await client.createEscrow(
    {
      seller,
      amount,
      description: 'sbtc-escrow-sdk demo escrow',
      durationBlocks: 144, // ~1 day of burn blocks on v3+ testnet contract
      tokenType: TokenType.STX,
    },
    { senderKey },
  );

  if (result.success) {
    console.log(`Broadcast OK. txid: ${result.txid}`);
    console.log(`Explorer: ${client.getExplorerTxUrl(result.txid)}`);
    console.log('Wait ~1 block, then read it back with `npm run get <newId>`.');
  } else {
    console.error(`Broadcast failed: ${result.error}`);
    process.exit(1);
  }
}

// ---- dispatch -----------------------------------------------------------

async function main() {
  const [cmd, arg] = process.argv.slice(2);
  switch (cmd) {
    case 'stats':  return cmdStats();
    case 'config': return cmdConfig();
    case 'get':    return cmdGet(arg);
    case 'fee':    return cmdFee(arg);
    case 'create': return cmdCreate();
    default:
      console.log('sbtc-escrow-sdk demo — commands:');
      console.log('  npm run stats           platform volumes & fees');
      console.log('  npm run config          contract config');
      console.log('  npm run get <id>        fetch one escrow');
      console.log('  npm run fee <amount>    compute platform fee (base units)');
      console.log('  npm run create          create a testnet escrow (.env required)');
  }
}

main().catch((err) => {
  console.error('\nError:', err instanceof Error ? err.message : err);
  process.exit(1);
});
