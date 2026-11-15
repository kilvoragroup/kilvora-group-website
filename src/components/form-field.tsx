import type { InputHTMLAttributes } from "react";

import { cx } from "@/lib/cx";

type FormFieldProps = {
  id: string;
  name: string;
  label: string;
  type?: "text" | "email" | "password";
  autoComplete: InputHTMLAttributes<HTMLInputElement>["autoComplete"];
  required?: boolean;
  requiredLabel?: string;
  defaultValue?: string;
  maxLength?: number;
  hint?: string;
  error?: string;
};

/**
 * Campo de formulário acessível: rótulo associado, dica e erro ligados por
 * `aria-describedby`, `aria-invalid` quando há erro. Sem estado próprio.
 */
export function FormField({
  id,
  name,
  label,
  type = "text",
  autoComplete,
  required = false,
  requiredLabel,
  defaultValue,
  maxLength,
  hint,
  error,
}: FormFieldProps) {
  const hintId = hint ? `${id}-dica` : undefined;
  const errorId = error ? `${id}-erro` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(" ") || undefined;

  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold">
        {label}
        {required && requiredLabel && (
          <span className="text-muted-foreground font-normal"> ({requiredLabel})</span>
        )}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        autoComplete={autoComplete}
        required={required}
        aria-required={required || undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        defaultValue={defaultValue}
        maxLength={maxLength}
        className={cx(
          "bg-background text-foreground h-11 w-full rounded-md border px-3 text-base",
          "focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
          error ? "border-danger" : "border-input",
        )}
      />
      {error && (
        <p id={errorId} className="text-danger text-sm">
          {error}
        </p>
      )}
      {hint && (
        <p id={hintId} className="text-muted-foreground text-sm">
          {hint}
        </p>
      )}
    </div>
  );
}
