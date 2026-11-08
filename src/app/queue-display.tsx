const assessmentLabels = {
  not_assessed: "Risk not assessed",
  pending: "Assessment pending",
  unavailable: "Risk assessment unavailable",
  failed: "Assessment failed",
} as const;

export type AssessmentStatusValue = keyof typeof assessmentLabels;

export function AssessmentStatus({ status }: { status: AssessmentStatusValue }) {
  return <span>{assessmentLabels[status]}</span>;
}

export function formatAge(createdAt: Date, now: number): string {
  const seconds = Math.trunc((createdAt.getTime() - now) / 1000);
  if (Math.abs(seconds) < 60) return "Just now";

  const units = [
    { seconds: 86400, unit: "day" },
    { seconds: 3600, unit: "hour" },
    { seconds: 60, unit: "minute" },
  ] as const;
  const selected = units.find(({ seconds: size }) => Math.abs(seconds) >= size);
  if (!selected) return "Just now";

  return new Intl.RelativeTimeFormat("en", { numeric: "always" }).format(
    Math.trunc(seconds / selected.seconds),
    selected.unit,
  );
}
