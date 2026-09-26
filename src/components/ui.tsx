"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { X, RefreshCw } from "lucide-react";
import { initials } from "@/lib/domain/logic";
export function Avatar({
  name,
  src,
  size = "normal",
  self = false,
}: {
  name: string;
  src?: string | null;
  size?: "small" | "normal" | "large";
  self?: boolean;
}) {
  let hash = 0;
  for (const c of name) hash += c.charCodeAt(0);
  return (
    <span className={`avatar ${size} tone-${hash % 5} ${self ? "self" : ""}`}>
      {src ? <img src={src} alt="" /> : initials(name)}
    </span>
  );
}
export function Sheet({
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
    const d = ref.current;
    d?.showModal();
    return () => d?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="sheet"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="sheet-head">
        <h2>{title}</h2>
        <button className="icon-button" aria-label="Close" onClick={onClose}>
          <X />
        </button>
      </div>
      <div className="sheet-body">{children}</div>
    </dialog>
  );
}
export function ErrorMessage({
  error,
  retry,
}: {
  error: string;
  retry?: () => void;
}) {
  return (
    <div className="error-message" role="alert">
      <span>{error}</span>
      {retry && (
        <button onClick={retry}>
          <RefreshCw size={15} />
          Retry
        </button>
      )}
    </div>
  );
}
export function Check({
  label,
  checked,
  onChange,
  description,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  description?: string;
}) {
  return (
    <label className="check-row">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>
        {label}
        {description && <small>{description}</small>}
      </span>
    </label>
  );
}
export function Loading() {
  return (
    <div className="loading-state">
      <span className="spinner" />
      One moment…
    </div>
  );
}
