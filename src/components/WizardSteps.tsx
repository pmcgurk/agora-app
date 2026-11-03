export default function WizardSteps({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="flex items-center justify-center gap-2 text-sm" aria-label="Setup progress">
      {steps.map((label, index) => (
        <li
          key={label}
          aria-current={index === current ? "step" : undefined}
          className={`rounded-full px-3 py-1 ${index === current ? "bg-primary text-white" : index < current ? "bg-secondary text-primary" : "text-muted"}`}
        >
          {index + 1}. {label}
        </li>
      ))}
    </ol>
  );
}
