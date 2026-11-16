// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConsoleSnapshot } from "../../../src/features/console/contract";
import { fetchConsoleSnapshot } from "../../../src/features/console/api-client";
import { useConsoleSnapshot } from "../../../src/features/console/hooks/use-console-snapshot";

vi.mock("../../../src/features/console/api-client", () => ({
  fetchConsoleSnapshot: vi.fn(),
  fetchActionStatus: vi.fn(),
  postActionDecision: vi.fn(),
  postActionProposal: vi.fn(),
}));

const snapshot: ConsoleSnapshot = {
  actions: [],
  counts: { pending: 0, approved: 0, denied: 0, auto_allowed: 0, blocked: 0 },
  activity: [],
  audit: [],
};

const fetchSnapshotMock = vi.mocked(fetchConsoleSnapshot);

describe("useConsoleSnapshot", () => {
  beforeEach(() => {
    fetchSnapshotMock.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("loads the initial snapshot and can refresh it on demand", async () => {
    fetchSnapshotMock.mockResolvedValueOnce(snapshot).mockResolvedValueOnce({
      ...snapshot,
      counts: { ...snapshot.counts, pending: 2 },
    });

    const { result } = renderHook(() => useConsoleSnapshot());
    await waitFor(() => expect(result.current.snapshot).toEqual(snapshot));
    expect(result.current.snapshotError).toBe("");

    await act(async () => result.current.loadSnapshot());
    expect(result.current.snapshot?.counts.pending).toBe(2);
    expect(fetchSnapshotMock).toHaveBeenCalledTimes(2);
  });

  it("surfaces initial errors and uses a clear fallback for non-Error refresh failures", async () => {
    fetchSnapshotMock.mockRejectedValueOnce(new Error("offline"));
    const { result } = renderHook(() => useConsoleSnapshot());

    await waitFor(() => expect(result.current.snapshotError).toBe("offline"));
    fetchSnapshotMock.mockRejectedValueOnce("unexpected failure");

    await act(async () => result.current.loadSnapshot());
    expect(result.current.snapshotError).toBe("Console data could not be loaded.");
  });

  it("ignores an initial response after the hook unmounts", async () => {
    let resolveSnapshot!: (value: ConsoleSnapshot) => void;
    fetchSnapshotMock.mockImplementationOnce(
      () => new Promise((resolve) => { resolveSnapshot = resolve; }),
    );
    const { result, unmount } = renderHook(() => useConsoleSnapshot());

    unmount();
    await act(async () => {
      resolveSnapshot(snapshot);
    });
    expect(result.current.snapshot).toBeNull();
  });
});
