type Step = { title: string; text: string };

export function ProcessSteps({ steps }: { steps: Step[] }) {
  return (
    <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {steps.map((step, index) => (
        <li key={step.title} className="border-border bg-background rounded-lg border p-5">
          <p className="text-muted-foreground text-sm font-semibold tabular-nums">
            {String(index + 1).padStart(2, "0")}
          </p>
          <h3 className="text-title mt-2 font-semibold">{step.title}</h3>
          <p className="text-muted-foreground mt-1">{step.text}</p>
        </li>
      ))}
    </ol>
  );
}
