import { explorerTx } from '../lib/config';
import { AlertIcon, CheckCircleIcon, ExternalIcon, XIcon } from './ui';

export type Notice =
  | { kind: 'success'; message: string; txid?: string }
  | { kind: 'error'; message: string }
  | null;

/** Single-slot notification, bottom-right. Errors interrupt (role=alert). */
export function Toast({ notice, onDismiss }: { notice: Notice; onDismiss: () => void }) {
  if (!notice) return null;
  const isError = notice.kind === 'error';

  return (
    <div
      className={`toast ${isError ? 'toast-err' : 'toast-ok'}`}
      role={isError ? 'alert' : 'status'}
    >
      <span className="toast-icon">{isError ? <AlertIcon /> : <CheckCircleIcon />}</span>
      <div className="toast-body">
        {notice.message}
        {notice.kind === 'success' && notice.txid && (
          <>
            <br />
            <a href={explorerTx(notice.txid)} target="_blank" rel="noreferrer">
              View on explorer <ExternalIcon />
            </a>
          </>
        )}
      </div>
      <button type="button" className="icon-btn" onClick={onDismiss} aria-label="Dismiss notification">
        <XIcon />
      </button>
    </div>
  );
}
