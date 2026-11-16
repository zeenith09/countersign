"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchConsoleSnapshot } from "../api-client";
import type { ConsoleSnapshot } from "../contract";

export function useConsoleSnapshot() {
  const [snapshot, setSnapshot] = useState<ConsoleSnapshot | null>(null);
  const [snapshotError, setSnapshotError] = useState("");

  const loadSnapshot = useCallback(async () => {
    try {
      setSnapshot(await fetchConsoleSnapshot());
      setSnapshotError("");
    } catch (error) {
      setSnapshotError(error instanceof Error ? error.message : "Console data could not be loaded.");
    }
  }, []);

  useEffect(() => {
    let active = true;
    void fetchConsoleSnapshot().then((result) => {
      if (active) setSnapshot(result);
    }).catch((error: unknown) => {
      if (active) {
        setSnapshotError(error instanceof Error ? error.message : "Console data could not be loaded.");
      }
    });
    return () => { active = false; };
  }, []);

  return { snapshot, snapshotError, loadSnapshot };
}
