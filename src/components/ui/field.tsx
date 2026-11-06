import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

const control = "block w-full rounded-control border-2 border-outline bg-surface px-4 py-3 text-base text-ink placeholder:text-ink-2/70 focus:border-focus";

export function Label({ htmlFor, children, hint }: { htmlFor: string; children: ReactNode; hint?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-2 block font-semibold">
      {children}
      {hint ? <span className="mt-1 block text-meta font-normal text-ink-2">{hint}</span> : null}
    </label>
  );
}

export function FieldError({ id, children }: { id: string; children?: ReactNode }) {
  if (!children) return null;
  return (
    <p id={id} role="alert" className="mt-2 text-meta font-semibold text-error">
      {children}
    </p>
  );
}

export function Input({ className = "", invalid, ...props }: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return <input {...props} aria-invalid={invalid || undefined} className={`${control} ${invalid ? "border-error" : ""} ${className}`} />;
}

export function Textarea({ className = "", invalid, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }) {
  return <textarea {...props} aria-invalid={invalid || undefined} className={`${control} min-h-32 ${invalid ? "border-error" : ""} ${className}`} />;
}

export function Select({ className = "", invalid, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }) {
  return <select {...props} aria-invalid={invalid || undefined} className={`${control} ${invalid ? "border-error" : ""} ${className}`} />;
}

export function Checkbox({ id, label, ...props }: InputHTMLAttributes<HTMLInputElement> & { id: string; label: ReactNode }) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-start gap-3 py-2">
      <input id={id} type="checkbox" {...props} className="mt-1 size-5 shrink-0 accent-action" />
      <span>{label}</span>
    </label>
  );
}
