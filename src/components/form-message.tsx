import { cx } from "@/lib/cx";

type FormMessageProps = {
  tone: "error" | "success";
  message: string;
  id?: string;
};

/**
 * Mensagem de formulário anunciada aos leitores de ecrã: erros com `role="alert"`,
 * confirmações com `role="status"` (educada).
 */
export function FormMessage({ tone, message, id }: FormMessageProps) {
  return (
    <p
      id={id}
      role={tone === "error" ? "alert" : "status"}
      className={cx(
        "rounded-md border px-4 py-3 text-sm",
        tone === "error" ? "border-danger bg-danger/10" : "border-success bg-success/10",
      )}
    >
      {message}
    </p>
  );
}
