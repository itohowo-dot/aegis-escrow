import { useEffect, useRef, useState } from 'react';

/* ------------------------------------------------------------------ icons */

type IconProps = { size?: number };

function Svg({ size = 14, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  );
}

export const ShieldIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
  </Svg>
);

export const ExternalIcon = (p: IconProps) => (
  <Svg size={p.size ?? 12}>
    <path d="M15 3h6v6" />
    <path d="M10 14 21 3" />
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
  </Svg>
);

export const CopyIcon = (p: IconProps) => (
  <Svg size={p.size ?? 13}>
    <rect x="9" y="9" width="13" height="13" rx="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </Svg>
);

export const CheckIcon = (p: IconProps) => (
  <Svg size={p.size ?? 13}>
    <path d="M20 6 9 17l-5-5" />
  </Svg>
);

export const XIcon = (p: IconProps) => (
  <Svg size={p.size ?? 14}>
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </Svg>
);

export const CheckCircleIcon = (p: IconProps) => (
  <Svg size={p.size ?? 16}>
    <circle cx="12" cy="12" r="10" />
    <path d="m9 12 2 2 4-4" />
  </Svg>
);

export const AlertIcon = (p: IconProps) => (
  <Svg size={p.size ?? 16}>
    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
    <path d="M12 9v4" />
    <path d="M12 17h.01" />
  </Svg>
);

/* ------------------------------------------------------------- primitives */

export function Spinner() {
  return <span className="spinner" aria-hidden />;
}

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md';
  loading?: boolean;
  block?: boolean;
};

export function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
  block = false,
  className,
  children,
  disabled,
  ...rest
}: ButtonProps) {
  const classes = [
    'btn',
    `btn-${variant}`,
    size === 'sm' && 'btn-sm',
    block && 'btn-block',
    className,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <button className={classes} disabled={disabled || loading} aria-busy={loading} {...rest}>
      {loading && <Spinner />}
      {children}
    </button>
  );
}

export type PillTone = 'ok' | 'err' | 'warn' | 'info' | 'neutral';

export function Pill({
  tone,
  dot = false,
  children,
}: {
  tone: PillTone;
  dot?: boolean;
  children: React.ReactNode;
}) {
  return (
    <span className={`pill pill-${tone}`}>
      {dot && <span className="pill-dot" aria-hidden />}
      {children}
    </span>
  );
}

export function Skeleton({ w, h = 14 }: { w: number | string; h?: number }) {
  return <span className="skel" style={{ display: 'inline-block', width: w, height: h }} aria-hidden />;
}

/** Copies `value`; flips to a check mark for a moment as feedback. */
export function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number>();
  useEffect(() => () => window.clearTimeout(timer.current), []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable — quietly do nothing */
    }
  }

  return (
    <button
      type="button"
      className={`icon-btn${copied ? ' copied' : ''}`}
      onClick={copy}
      aria-label={copied ? 'Copied' : label}
      title={copied ? 'Copied' : label}
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
    </button>
  );
}

/* ------------------------------------------------------------------ utils */

export function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'string') return e;
  return 'Something went wrong.';
}
