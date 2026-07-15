import { useEffect, useRef, useState } from 'react';
import type { EscrowConfig } from 'sbtc-escrow-sdk';
import { createEscrow, waitForNewEscrowId, TokenType } from '../lib/escrow';
import { formatAmount, toBaseUnits, tokenSymbol } from '../lib/config';
import { Button, errMsg } from './ui';
import type { Notice } from './Toast';

/** Testnet ST… / mainnet SP… standard principal. */
const STACKS_ADDRESS = /^S[TP][0-9A-Z]{38,40}$/;

type FieldErrors = { seller?: string; amount?: string; duration?: string };

export function CreateEscrow({
  address,
  config,
  setNotice,
  onEscrowConfirmed,
}: {
  address: string | null;
  config: EscrowConfig | null;
  setNotice: (n: Notice) => void;
  onEscrowConfirmed: (id: number) => void;
}) {
  const [token, setToken] = useState<TokenType>(TokenType.STX);
  const [seller, setSeller] = useState('');
  const [amount, setAmount] = useState('1');
  const [duration, setDuration] = useState('144');
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [phase, setPhase] = useState<'idle' | 'signing' | 'confirming'>('idle');

  const mounted = useRef(true);
  useEffect(() => () => void (mounted.current = false), []);

  const busy = phase !== 'idle';
  const sym = tokenSymbol(token);

  // Live deposit preview from the on-chain fee bps. The exact fee is
  // re-computed via the SDK at signing time; this keeps the number honest
  // enough to show before the wallet opens.
  const amt = Number(amount);
  const base = amt > 0 ? toBaseUnits(amt, token) : 0;
  const estFee = config && base > 0 ? Math.floor((base * config.platformFeeBps) / 10_000) : null;

  const blocks = Number(duration);
  const durationDays =
    Number.isFinite(blocks) && blocks > 0
      ? (blocks / 144).toLocaleString(undefined, { maximumFractionDigits: 1 })
      : null;

  function validate(): FieldErrors {
    const next: FieldErrors = {};
    const s = seller.trim();

    if (!s) next.seller = 'Enter the seller’s Stacks address.';
    else if (!STACKS_ADDRESS.test(s)) next.seller = 'That doesn’t look like a Stacks address (ST… / SP…).';
    else if (address && s === address) next.seller = 'Seller must be different from your connected wallet.';

    if (!(amt > 0)) next.amount = 'Amount must be greater than 0.';
    else if (config) {
      const min = token === TokenType.STX ? config.minAmountStx : config.minAmountSbtc;
      const max = token === TokenType.STX ? config.maxAmountStx : config.maxAmountSbtc;
      if (base < min || base > max) {
        next.amount = `Contract allows ${formatAmount(min, token)} – ${formatAmount(max, token)}.`;
      }
    }

    if (!Number.isInteger(blocks) || blocks < 1) next.duration = 'Whole number of blocks, at least 1.';
    else if (config && blocks > config.maxDuration) {
      next.duration = `Contract maximum is ${config.maxDuration.toLocaleString()} blocks.`;
    }

    return next;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!address) return;

    const next = validate();
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setNotice(null);
    setPhase('signing');
    try {
      const txid = await createEscrow({
        buyer: address,
        seller: seller.trim(),
        amount: base,
        description: description.trim() || 'Aegis Escrow payment',
        durationBlocks: blocks,
        tokenType: token,
      });
      setNotice({ kind: 'success', message: 'Transaction submitted — waiting for confirmation…', txid });
      setDescription('');

      setPhase('confirming');
      const id = await waitForNewEscrowId(txid, { isCancelled: () => !mounted.current });
      if (!mounted.current) return;
      setNotice({ kind: 'success', message: `Escrow #${id} confirmed — loaded in the panel on the right.`, txid });
      onEscrowConfirmed(id);
    } catch (err) {
      if (mounted.current) setNotice({ kind: 'error', message: errMsg(err) });
    } finally {
      if (mounted.current) setPhase('idle');
    }
  }

  return (
    <section className="panel" aria-labelledby="create-title">
      <div className="panel-head">
        <h2 className="panel-title" id="create-title">
          Create escrow
        </h2>
        <p className="panel-desc">
          Lock funds for a seller. The contract holds them until you release — or refunds after
          expiry.
        </p>
      </div>

      <form className="form" onSubmit={handleSubmit} noValidate>
        <div className="field">
          <span className="field-label" id="token-label">
            Token
          </span>
          <div className="seg" role="radiogroup" aria-labelledby="token-label">
            {[TokenType.STX, TokenType.SBTC].map((t) => (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={token === t}
                className="seg-btn"
                disabled={busy}
                onClick={() => {
                  setToken(t);
                  setErrors((prev) => ({ ...prev, amount: undefined }));
                }}
              >
                {tokenSymbol(t)}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label className="field-label" htmlFor="seller">
            Seller address
          </label>
          <input
            id="seller"
            className="input mono"
            placeholder="ST2CY5…  (receives the funds on release)"
            value={seller}
            disabled={busy}
            aria-invalid={errors.seller ? 'true' : undefined}
            aria-describedby={errors.seller ? 'seller-error' : undefined}
            onChange={(e) => {
              setSeller(e.target.value);
              setErrors((prev) => ({ ...prev, seller: undefined }));
            }}
            spellCheck={false}
            autoComplete="off"
          />
          {errors.seller && (
            <span className="field-error" id="seller-error">
              {errors.seller}
            </span>
          )}
        </div>

        <div className="field-row">
          <div className="field">
            <label className="field-label" htmlFor="amount">
              Amount
            </label>
            <div className="input-unit">
              <input
                id="amount"
                className="input"
                type="number"
                min="0"
                step={token === TokenType.SBTC ? '0.00000001' : '0.000001'}
                value={amount}
                disabled={busy}
                aria-invalid={errors.amount ? 'true' : undefined}
                aria-describedby={errors.amount ? 'amount-error' : undefined}
                onChange={(e) => {
                  setAmount(e.target.value);
                  setErrors((prev) => ({ ...prev, amount: undefined }));
                }}
              />
              <span className="unit">{sym}</span>
            </div>
            {errors.amount && (
              <span className="field-error" id="amount-error">
                {errors.amount}
              </span>
            )}
          </div>

          <div className="field">
            <label className="field-label" htmlFor="duration">
              Duration
            </label>
            <div className="input-unit">
              <input
                id="duration"
                className="input"
                type="number"
                min="1"
                step="1"
                value={duration}
                disabled={busy}
                aria-invalid={errors.duration ? 'true' : undefined}
                aria-describedby={errors.duration ? 'duration-error' : 'duration-hint'}
                onChange={(e) => {
                  setDuration(e.target.value);
                  setErrors((prev) => ({ ...prev, duration: undefined }));
                }}
              />
              <span className="unit">blocks</span>
            </div>
            {errors.duration ? (
              <span className="field-error" id="duration-error">
                {errors.duration}
              </span>
            ) : (
              <span className="field-hint" id="duration-hint">
                {durationDays ? `≈ ${durationDays} day${durationDays === '1' ? '' : 's'} · ` : ''}
                buyer can refund after this many blocks
              </span>
            )}
          </div>
        </div>

        <div className="field">
          <label className="field-label" htmlFor="description">
            Description <span className="muted">(optional)</span>
          </label>
          <input
            id="description"
            className="input"
            placeholder="What is this payment for?"
            value={description}
            disabled={busy}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={256}
          />
        </div>

        {base > 0 && (
          <div className="fee-box" aria-live="polite">
            <div className="fee-row">
              <span>Escrow amount</span>
              <span>{formatAmount(base, token)}</span>
            </div>
            <div className="fee-row">
              <span>Platform fee{config ? ` (${config.platformFeeBps / 100}%)` : ''}</span>
              <span>{estFee !== null ? formatAmount(estFee, token) : '—'}</span>
            </div>
            <div className="fee-row total">
              <span>You deposit</span>
              <span>{estFee !== null ? formatAmount(base + estFee, token) : formatAmount(base, token)}</span>
            </div>
          </div>
        )}

        <Button type="submit" variant="primary" block loading={busy} disabled={!address || busy}>
          {phase === 'signing'
            ? 'Confirm in your wallet…'
            : phase === 'confirming'
              ? 'Waiting for the chain…'
              : address
                ? `Create ${sym} escrow`
                : 'Connect wallet to create'}
        </Button>

        <p className="field-hint" style={{ margin: 0 }}>
          Your wallet shows the exact amounts before anything is signed
          {token === TokenType.SBTC ? ' · requires testnet sBTC in your wallet' : ''}.
        </p>
      </form>
    </section>
  );
}
