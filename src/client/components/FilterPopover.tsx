import { Check, ChevronDown, Search, X } from "lucide-react";
import {
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { clsx } from "clsx";

export interface FilterOption<Value extends string> {
  value: Value;
  label: string;
}

interface PopoverControlOptions {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialFocusRef: RefObject<HTMLElement | null>;
}

function usePopoverControl({ open, onOpenChange, initialFocusRef }: PopoverControlOptions) {
  const rootRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const closeAndRestoreFocus = useCallback(() => {
    onOpenChange(false);
    queueMicrotask(() => triggerRef.current?.focus());
  }, [onOpenChange]);

  useEffect(() => {
    if (!open) return;
    initialFocusRef.current?.focus();
  }, [initialFocusRef, open]);

  useEffect(() => {
    if (!open) return;
    const mobileSheet = window.matchMedia("(max-width: 620px)").matches;
    const previousOverflow = document.body.style.overflow;
    if (mobileSheet) document.body.style.overflow = "hidden";

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node) || rootRef.current?.contains(target)) return;
      onOpenChange(false);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        closeAndRestoreFocus();
        return;
      }
      if (!mobileSheet || event.key !== "Tab") return;
      const focusable = [...(surfaceRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) ?? [])].filter((element) => !element.hidden);
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown, true);
      if (mobileSheet) document.body.style.overflow = previousOverflow;
    };
  }, [closeAndRestoreFocus, open, onOpenChange]);

  return { rootRef, surfaceRef, triggerRef, closeAndRestoreFocus };
}

export interface MultiSelectPopoverProps<Value extends string> {
  label: string;
  summary: string;
  options: readonly FilterOption<Value>[];
  selected: readonly Value[];
  onChange: (selected: Value[]) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  searchable?: boolean;
  searchPlaceholder?: string;
  align?: "start" | "end";
  className?: string;
}

export function MultiSelectPopover<Value extends string>({
  label,
  summary,
  options,
  selected,
  onChange,
  open,
  onOpenChange,
  searchable = false,
  searchPlaceholder = `Search ${label.toLocaleLowerCase()}…`,
  align = "start",
  className,
}: MultiSelectPopoverProps<Value>) {
  const popoverId = useId();
  const headingId = useId();
  const searchRef = useRef<HTMLInputElement>(null);
  const firstOptionRef = useRef<HTMLInputElement>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const handleOpenChange = useCallback((nextOpen: boolean) => {
    if (!nextOpen) setSearchQuery("");
    onOpenChange(nextOpen);
  }, [onOpenChange]);
  const initialFocusRef = searchable ? searchRef : firstOptionRef;
  const { rootRef, surfaceRef, triggerRef, closeAndRestoreFocus } = usePopoverControl({
    open,
    onOpenChange: handleOpenChange,
    initialFocusRef,
  });

  const visibleOptions = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLocaleLowerCase();
    if (!normalizedQuery) return options;
    return options.filter((option) => option.label.toLocaleLowerCase().includes(normalizedQuery));
  }, [options, searchQuery]);

  const toggleValue = (value: Value) => {
    onChange(selected.includes(value)
      ? selected.filter((selectedValue) => selectedValue !== value)
      : [...selected, value]);
  };

  return (
    <div ref={rootRef} className={clsx("filter-control", className)}>
      <button
        ref={triggerRef}
        type="button"
        className={clsx("filter-trigger", selected.length > 0 && "is-active")}
        aria-label={`${label}: ${summary}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? popoverId : undefined}
        onClick={() => handleOpenChange(!open)}
      >
        <span className="filter-trigger__label">{summary}</span>
        <ChevronDown aria-hidden="true" />
      </button>

      {open && (
        <>
          <div className="filter-sheet-backdrop" aria-hidden="true" onMouseDown={() => handleOpenChange(false)} />
          <div
            ref={surfaceRef}
            id={popoverId}
            className={clsx("filter-popover", `filter-popover--${align}`)}
            role="dialog"
            aria-modal={window.matchMedia("(max-width: 620px)").matches || undefined}
            aria-labelledby={headingId}
          >
            <header className="filter-popover__header">
              <div>
                <h3 id={headingId}>{label}</h3>
                {selected.length > 0 && <small>{selected.length} selected</small>}
              </div>
              <div className="filter-popover__header-actions">
                {selected.length > 0 && (
                  <button type="button" onClick={() => onChange([])}>Clear</button>
                )}
                <button type="button" className="filter-popover__close" aria-label={`Close ${label} filter`} onClick={closeAndRestoreFocus}>
                  <X aria-hidden="true" />
                </button>
              </div>
            </header>

            {searchable && (
              <label className="filter-popover__search">
                <Search aria-hidden="true" />
                <span className="sr-only">{searchPlaceholder}</span>
                <input
                  ref={searchRef}
                  value={searchQuery}
                  aria-label={searchPlaceholder}
                  placeholder={searchPlaceholder}
                  onChange={(event) => setSearchQuery(event.target.value)}
                />
                {searchQuery && (
                  <button type="button" aria-label={`Clear ${label} search`} onClick={() => setSearchQuery("")}>
                    <X aria-hidden="true" />
                  </button>
                )}
              </label>
            )}

            <div className="filter-popover__options" role="group" aria-label={`${label} options`}>
              {visibleOptions.map((option, index) => {
                const checked = selected.includes(option.value);
                return (
                  <label className={clsx("filter-option", checked && "is-selected")} key={option.value}>
                    <input
                      ref={index === 0 && !searchable ? firstOptionRef : undefined}
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleValue(option.value)}
                    />
                    <span className="filter-option__check" aria-hidden="true"><Check /></span>
                    <span>{option.label}</span>
                  </label>
                );
              })}
              {!visibleOptions.length && <p className="filter-popover__empty">No matching options.</p>}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export interface SingleSelectPopoverProps<Value extends string> {
  label: string;
  heading?: string;
  options: readonly FilterOption<Value>[];
  value: Value;
  onChange: (value: Value) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  variant?: "sort" | "drawer";
  triggerPrefix?: string;
  leadingIcon?: ReactNode;
  disabled?: boolean;
  align?: "start" | "end";
  className?: string;
}

export function SingleSelectPopover<Value extends string>({
  label,
  heading,
  options,
  value,
  onChange,
  open,
  onOpenChange,
  variant = "sort",
  triggerPrefix,
  leadingIcon,
  disabled = false,
  align = "end",
  className,
}: SingleSelectPopoverProps<Value>) {
  const popoverId = useId();
  const headingId = useId();
  const selectedOptionRef = useRef<HTMLButtonElement>(null);
  const { rootRef, surfaceRef, triggerRef, closeAndRestoreFocus } = usePopoverControl({
    open,
    onOpenChange,
    initialFocusRef: selectedOptionRef,
  });
  const currentLabel = options.find((option) => option.value === value)?.label ?? value;

  const navigateOptions = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const optionsInPopover = [...event.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]')];
    if (!optionsInPopover.length) return;
    const currentIndex = optionsInPopover.indexOf(document.activeElement as HTMLElement);
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? optionsInPopover.length - 1
        : event.key === "ArrowDown"
          ? (currentIndex + 1 + optionsInPopover.length) % optionsInPopover.length
          : (currentIndex - 1 + optionsInPopover.length) % optionsInPopover.length;
    optionsInPopover[nextIndex].focus();
    if (variant === "sort") onChange(options[nextIndex].value);
  };

  return (
    <div ref={rootRef} className={clsx("filter-control", "filter-control--single", `filter-control--${variant}`, className)}>
      <button
        ref={triggerRef}
        type="button"
        className={clsx("filter-trigger", "single-select-trigger", `filter-trigger--${variant}`)}
        aria-label={`${label}: ${currentLabel}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? popoverId : undefined}
        aria-disabled={disabled || undefined}
        onClick={() => {
          if (!disabled) onOpenChange(!open);
        }}
      >
        {leadingIcon && <span className="single-select-trigger__icon" aria-hidden="true">{leadingIcon}</span>}
        {triggerPrefix && <span className="single-select-trigger__prefix">{triggerPrefix}</span>}
        <span className="filter-trigger__label">{currentLabel}</span>
        <ChevronDown aria-hidden="true" />
      </button>

      {open && (
        <>
          <div className="filter-sheet-backdrop" aria-hidden="true" onMouseDown={() => onOpenChange(false)} />
          <div
            ref={surfaceRef}
            id={popoverId}
            className={clsx("filter-popover", "filter-popover--single", `filter-popover--${variant}`, `filter-popover--${align}`)}
            role="dialog"
            aria-modal={window.matchMedia("(max-width: 620px)").matches || undefined}
            aria-labelledby={headingId}
          >
            <header className="filter-popover__header">
              <h3 id={headingId}>{heading ?? label}</h3>
              <button type="button" className="filter-popover__close" aria-label={`Close ${heading ?? label}`} onClick={closeAndRestoreFocus}>
                <X aria-hidden="true" />
              </button>
            </header>
            <div className="filter-popover__options" role="radiogroup" aria-label={`${label} options`} onKeyDown={navigateOptions}>
              {options.map((option) => {
                const selectedOption = option.value === value;
                return (
                  <button
                    ref={selectedOption ? selectedOptionRef : undefined}
                    type="button"
                    role="radio"
                    aria-checked={selectedOption}
                    tabIndex={selectedOption ? 0 : -1}
                    className={clsx("filter-option", "filter-option--radio", selectedOption && "is-selected")}
                    key={option.value}
                    onClick={() => {
                      onChange(option.value);
                      closeAndRestoreFocus();
                    }}
                  >
                    <span className="filter-option__radio" aria-hidden="true" />
                    <span>{option.label}</span>
                    {selectedOption && <Check aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
