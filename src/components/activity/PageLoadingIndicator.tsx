type LoadingKind = "activity" | "audit";

export function PageLoadingIndicator({
  message,
  kind,
  rows,
  compact = false,
}: {
  message: string;
  kind: LoadingKind;
  rows: number;
  compact?: boolean;
}) {
  return (
    <div
      className={`page-loading ${kind}-loading${compact ? " overview-activity-loading" : ""}`}
      role="status"
      aria-busy="true"
      aria-label={compact ? message : undefined}
    >
      {!compact && <p>{message}</p>}
      <div className="page-loading-rows" aria-hidden="true">
        {Array.from({ length: rows }, (_, row) => (
          <div className="page-loading-row" key={row}>
            {Array.from({ length: kind === "audit" ? 5 : 3 }, (_, cell) => (
              <span className={`page-loading-cell cell-${cell + 1}`} key={cell} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
