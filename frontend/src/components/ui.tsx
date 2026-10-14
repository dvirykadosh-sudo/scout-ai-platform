"use client";

import { cloneElement, isValidElement, useEffect, useId, useRef, type ReactElement, type ReactNode } from "react";

export function Field({
  label,
  htmlFor,
  error,
  hint,
  children,
  className = "",
}: {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  // connect the hint and the error message to the control, so screen readers read them with it
  let control = children;
  if (isValidElement(children) && typeof children.type === "string") {
    const props = (children as ReactElement<{ "aria-describedby"?: string; "aria-invalid"?: boolean }>).props;
    const ids = [props["aria-describedby"], hint && !error ? `${htmlFor}-hint` : "", error ? `${htmlFor}-err` : ""].filter(Boolean).join(" ");
    control = cloneElement(children as ReactElement<Record<string, unknown>>, {
      ...(ids ? { "aria-describedby": [...new Set(ids.split(" "))].join(" ") } : {}),
      ...(error ? { "aria-invalid": true } : {}),
    });
  }
  return (
    <div className={`field ${error ? "has-error" : ""} ${className}`}>
      <label htmlFor={htmlFor}>{label}</label>
      {control}
      {hint && !error && (
        <p className="hint" id={`${htmlFor}-hint`}>
          {hint}
        </p>
      )}
      {error && (
        <p className="error-text" id={`${htmlFor}-err`} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? "modal-wide" : ""}`}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      {open && (
        <div className="modal-body">
          <div className="modal-head">
            <h2 id={titleId}>{title}</h2>
            <button type="button" className="icon-btn" aria-label="סגירה" onClick={onClose}>
              ×
            </button>
          </div>
          <div className="modal-content">{children}</div>
          {footer && <div className="modal-foot">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}

export function Skeleton({ lines = 4, label = "טוען..." }: { lines?: number; label?: string }) {
  return (
    <div className="card skeleton" role="status" aria-busy="true" aria-live="polite">
      <span className="sr-only">{label}</span>
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className="skeleton-line" style={{ width: `${95 - ((i * 13) % 40)}%` }} />
      ))}
    </div>
  );
}

export function PageTitle({ children, lead }: { children: ReactNode; lead?: string }) {
  return (
    <div className="page-title">
      <h1>{children}</h1>
      {lead && <p className="lead">{lead}</p>}
    </div>
  );
}
