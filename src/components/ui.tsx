import { cloneElement, isValidElement, useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { AlertCircle, X, Inbox, LoaderCircle } from 'lucide-react';
export function ErrorNotice({ error }: { error: unknown }) {
  return error ? (
    <div className="notice error" role="alert">
      <AlertCircle size={17} />
      <span>{error instanceof Error ? error.message : String(error)}</span>
    </div>
  ) : null;
}
export function Loading() {
  return (
    <div className="empty">
      <LoaderCircle className="spin" size={24} />
      <span>Loading workspace…</span>
    </div>
  );
}
export function Empty({
  title = 'Nothing here yet',
  detail = 'New records will appear here.',
}: {
  title?: string;
  detail?: string;
}) {
  return (
    <div className="empty">
      <Inbox size={28} />
      <strong>{title}</strong>
      <span>{detail}</span>
    </div>
  );
}
export function Status({ value }: { value: string }) {
  return (
    <span className={`status status-${value.toLowerCase()}`}>
      {value.replaceAll('_', ' ').toLowerCase()}
    </span>
  );
}
export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el && !el.open) el.showModal();
    return () => {
      if (el?.open) el.close();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClose={(event) => {
        // StrictMode cleanup can queue a native close event before reopening.
        // A stale event must not dismiss the currently open form.
        if (!event.currentTarget.open) onClose();
      }}
      className="modal"
    >
      <div className="modal-heading">
        <h2>{title}</h2>
        <button className="icon-button" type="button" aria-label="Close dialog" onClick={onClose}>
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function PageHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <header className="page-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </header>
  );
}
export function useDebounced<T>(value: T, delay = 350) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  const generatedId = useId();
  if (!isValidElement<{ id?: string; 'aria-describedby'?: string }>(children))
    return <div className="field">{children}</div>;
  const id = children.props.id || generatedId;
  const describedBy =
    [children.props['aria-describedby'], hint ? `${generatedId}-hint` : undefined]
      .filter(Boolean)
      .join(' ') || undefined;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {cloneElement(children, { id, 'aria-describedby': describedBy })}
      {hint && <small id={`${generatedId}-hint`}>{hint}</small>}
    </div>
  );
}
