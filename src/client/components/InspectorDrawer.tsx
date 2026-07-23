import { clsx } from "clsx";
import { ArrowLeft, X } from "lucide-react";
import {
  type CSSProperties,
  type ReactNode,
  type RefObject,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { IconButton } from "./ui";

export type InspectorMode = "role" | "company";
export type InspectorPresentation = "responsive" | "rail" | "overlay";

export interface InspectorBackAction {
  label: string;
  onClick: () => void;
}

export interface InspectorDrawerProps {
  /** Keep the shell mounted and switch this value when moving between role and company content. */
  mode: InspectorMode;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  open?: boolean;
  header?: ReactNode;
  headerActions?: ReactNode;
  backAction?: InspectorBackAction;
  closeLabel?: string;
  presentation?: InspectorPresentation;
  overlayBreakpoint?: number;
  initialFocusRef?: RefObject<HTMLElement | null>;
  className?: string;
  rootClassName?: string;
  bodyClassName?: string;
  themeClassName?: string;
  theme?: string;
  style?: CSSProperties;
}

const focusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex=\"-1\"])",
].join(", ");

let bodyLockDepth = 0;
let bodyOverflowBeforeLock = "";

function lockBodyScroll(): () => void {
  if (bodyLockDepth === 0) {
    bodyOverflowBeforeLock = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  bodyLockDepth += 1;

  return () => {
    bodyLockDepth = Math.max(0, bodyLockDepth - 1);
    if (bodyLockDepth === 0) {
      document.body.style.overflow = bodyOverflowBeforeLock;
      bodyOverflowBeforeLock = "";
    }
  };
}

function canReceiveFocus(element: HTMLElement): boolean {
  if (element.hidden || element.getAttribute("aria-hidden") === "true") return false;
  const style = window.getComputedStyle(element);
  return style.display !== "none" && style.visibility !== "hidden";
}

function responsiveOverlayQuery(breakpoint: number): string {
  return `(max-width: ${Math.max(1, Math.round(breakpoint))}px)`;
}

export function InspectorDrawer({
  mode,
  title,
  description,
  onClose,
  children,
  open = true,
  header,
  headerActions,
  backAction,
  closeLabel = "Close details",
  presentation = "responsive",
  overlayBreakpoint = 1600,
  initialFocusRef,
  className,
  rootClassName,
  bodyClassName,
  themeClassName,
  theme,
  style,
}: InspectorDrawerProps) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const [matchesOverlayBreakpoint, setMatchesOverlayBreakpoint] = useState(() => {
    if (presentation === "overlay") return true;
    if (presentation === "rail") return false;
    return window.matchMedia(responsiveOverlayQuery(overlayBreakpoint)).matches;
  });

  const overlay = presentation === "overlay"
    || (presentation === "responsive" && matchesOverlayBreakpoint);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (presentation !== "responsive") return;
    const query = window.matchMedia(responsiveOverlayQuery(overlayBreakpoint));
    const update = () => setMatchesOverlayBreakpoint(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, [overlayBreakpoint, presentation]);

  useEffect(() => {
    if (!open) return;
    restoreFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;

    return () => {
      const target = restoreFocusRef.current;
      restoreFocusRef.current = null;
      if (target?.isConnected) target.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
    const focusTarget = backRef.current ?? initialFocusRef?.current ?? closeRef.current ?? panelRef.current;
    focusTarget?.focus();
  }, [initialFocusRef, mode, open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onCloseRef.current();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  useEffect(() => {
    if (!open || !overlay) return;
    const unlockBodyScroll = lockBodyScroll();

    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusable = [...panel.querySelectorAll<HTMLElement>(focusableSelector)]
        .filter(canReceiveFocus);
      const first = focusable[0] ?? panel;
      const last = focusable.at(-1) ?? panel;
      const current = document.activeElement;

      if (!panel.contains(current)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && current === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && current === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", trapFocus);
    return () => {
      document.removeEventListener("keydown", trapFocus);
      unlockBodyScroll();
    };
  }, [initialFocusRef, open, overlay]);

  if (!open) return null;

  return (
    <div
      className={clsx(
        "inspector-shell",
        `inspector-shell--${mode}`,
        overlay ? "inspector-shell--overlay" : "inspector-shell--rail",
        "inspector-shell--mobile-fullscreen",
        rootClassName,
      )}
      data-inspector-mode={mode}
      data-inspector-presentation={overlay ? "overlay" : "rail"}
    >
      {overlay && (
        <div
          className="inspector-backdrop"
          aria-hidden="true"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) onCloseRef.current();
          }}
        />
      )}
      <aside
        ref={panelRef}
        className={clsx(
          "inspector-panel",
          `inspector-panel--${mode}`,
          overlay ? "inspector-panel--overlay" : "inspector-panel--rail",
          "inspector-panel--mobile-fullscreen",
          themeClassName,
          className,
        )}
        style={style}
        data-inspector-theme={theme}
        role="dialog"
        aria-modal={overlay || undefined}
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
      >
        <header className="inspector-header">
          <div className="inspector-header__back-slot">
            {backAction && (
              <button
                ref={backRef}
                type="button"
                className="inspector-header__back"
                onClick={backAction.onClick}
              >
                <ArrowLeft aria-hidden="true" />
                <span>{backAction.label}</span>
              </button>
            )}
          </div>

          <div className="inspector-header__content">
            <h2
              id={titleId}
              className={clsx("inspector-header__title", header && "sr-only")}
              aria-live="polite"
            >
              {title}
            </h2>
            {description && (
              <p
                id={descriptionId}
                className={clsx("inspector-header__description", header && "sr-only")}
              >
                {description}
              </p>
            )}
            {header}
          </div>

          <div className="inspector-header__action-slot">{headerActions}</div>
          <IconButton
            ref={closeRef}
            className="inspector-header__close"
            label={closeLabel}
            onClick={onClose}
          >
            <X aria-hidden="true" />
          </IconButton>
        </header>

        <div ref={bodyRef} className={clsx("inspector-body", bodyClassName)}>{children}</div>
      </aside>
    </div>
  );
}
