import type { ConsoleAction, ConsoleSnapshot, ConsoleStatus } from "./contract";

export type ConsolePage = "overview" | "queue" | "activity" | "audit";

export type ConsoleCounts = {
  pending: number | null;
  approved: number | null;
  denied: number | null;
  auto: number | null;
  blocked: number | null;
};

export function getConsoleCounts(snapshot: ConsoleSnapshot | null): ConsoleCounts {
  return {
    pending: snapshot ? snapshot.counts.pending ?? 0 : null,
    approved: snapshot ? snapshot.counts.approved ?? 0 : null,
    denied: snapshot ? snapshot.counts.denied ?? 0 : null,
    auto: snapshot ? snapshot.counts.auto_allowed ?? 0 : null,
    blocked: snapshot ? snapshot.counts.blocked ?? 0 : null,
  };
}

export function sortPendingActions(
  actions: ConsoleAction[],
  order: "oldest" | "newest",
): ConsoleAction[] {
  return [...actions].sort((a, b) => {
    const timeDifference = order === "oldest" ? a.created - b.created : b.created - a.created;
    return timeDifference || a.id.localeCompare(b.id);
  });
}

export function filterActivity(
  activity: ConsoleSnapshot["activity"],
  status: "all" | ConsoleStatus,
): ConsoleSnapshot["activity"] {
  return status === "all" ? activity : activity.filter((item) => item.status === status);
}
