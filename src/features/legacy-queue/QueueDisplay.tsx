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
