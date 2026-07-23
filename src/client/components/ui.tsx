import { AlertCircle, Check, ExternalLink, LoaderCircle, X } from "lucide-react";
import {
  type ButtonHTMLAttributes,
  type ImgHTMLAttributes,
  type ReactNode,
  forwardRef,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { clsx } from "clsx";
import { initials as makeInitials } from "../format";

export function CompanyLogo({
  src,
  name,
  initials,
  size = "md",
  className,
}: {
  src: string | null;
  name: string;
  initials?: string;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const imageSrc = src && failedSrc !== src ? src : null;
  return (
    <span className={clsx("company-logo", `company-logo--${size}`, imageSrc ? "company-logo--image" : "company-logo--fallback", className)} aria-hidden="true">
      {imageSrc ? (
        <img
          src={imageSrc}
          alt=""
          loading="lazy"
          onError={(event) => {
            event.currentTarget.hidden = true;
            setFailedSrc(imageSrc);
          }}
        />
      ) : (
        <span>{initials || makeInitials(name)}</span>
      )}
    </span>
  );
}

export function Button({
  variant = "primary",
  size = "md",
  loading,
  children,
  className,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "quiet" | "danger";
  size?: "sm" | "md";
  loading?: boolean;
}) {
  return (
    <button
      className={clsx("button", `button--${variant}`, `button--${size}`, className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <LoaderCircle className="spin" aria-hidden="true" />}
      {children}
    </button>
  );
}

export const IconButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { label: string; children: ReactNode }>(function IconButton({
  label,
  children,
  className,
  ...props
}, ref) {
  return (
    <button ref={ref} className={clsx("icon-button", className)} aria-label={label} title={label} {...props}>
      {children}
    </button>
  );
});

export function Tag({
  children,
  tone = "neutral",
  title,
}: {
  children: ReactNode;
  tone?: "neutral" | "teal" | "amber" | "red" | "blue" | "ink";
  title?: string;
}) {
  return <span className={clsx("tag", `tag--${tone}`)} title={title}>{children}</span>;
}

export function StatusDot({ status }: { status: "healthy" | "degraded" | "failing" | "stale" | "unsupported" }) {
  return <span className={clsx("status-dot", `status-dot--${status}`)} aria-hidden="true" />;
}

export function EmptyState({
  title,
  body,
  action,
  compact = false,
}: {
  title: string;
  body: string;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={clsx("empty-state", compact && "empty-state--compact")}>
      <span className="empty-state__mark" aria-hidden="true"><Check /></span>
      <h3>{title}</h3>
      <p>{body}</p>
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="error-state" role="alert">
      <AlertCircle aria-hidden="true" />
      <div><strong>We couldn’t load the workspace.</strong><p>{message}</p></div>
      <Button variant="secondary" onClick={onRetry}>Try again</Button>
    </div>
  );
}

export function Dialog({
  open,
  title,
  description,
  onClose,
  children,
  size = "md",
}: {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  const titleId = useId();
  const descriptionId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = [...(dialogRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) ?? [])].filter((element) => element.getClientRects().length > 0);
      if (!focusable.length) {
        event.preventDefault();
        closeRef.current?.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previous?.focus();
    };
  }, [open]);
  if (!open) return null;
  return (
    <div className="dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section
        ref={dialogRef}
        className={clsx("dialog", `dialog--${size}`)}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
      >
        <header className="dialog__header">
          <div>
            <h2 id={titleId}>{title}</h2>
            {description && <p id={descriptionId}>{description}</p>}
          </div>
          <IconButton ref={closeRef} label="Close dialog" onClick={onClose}><X /></IconButton>
        </header>
        {children}
      </section>
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className={clsx("toggle", checked && "toggle--checked")}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      disabled={disabled}
    >
      <span />
    </button>
  );
}

export function OutboundLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return (
    <a className={clsx("outbound-link", className)} href={href} target="_blank" rel="noreferrer">
      {children}<ExternalLink aria-hidden="true" />
    </a>
  );
}

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={clsx("field", className)}>
      <span className="field__label">{label}</span>
      {children}
      {hint && <span className="field__hint">{hint}</span>}
    </label>
  );
}

export type NativeImageProps = ImgHTMLAttributes<HTMLImageElement>;
