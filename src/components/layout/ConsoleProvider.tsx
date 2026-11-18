"use client";

import { useState, type ReactNode } from "react";
import type { ConsoleStatus } from "../../lib/console/contract";
import { ConsoleContext } from "../../contexts/ConsoleContext";
import { useConsoleSnapshot } from "../../hooks/use-console-snapshot";
import { useReviewerProfile } from "../../hooks/use-reviewer-profile";

export function ConsoleProvider({ children }: { children: ReactNode }) {
  const snapshotState = useConsoleSnapshot();
  const reviewerProfile = useReviewerProfile();
  const [announcement, setAnnouncement] = useState("");
  const [activityFilter, setActivityFilter] = useState<"all" | ConsoleStatus>("all");
  const [revealVersion, setRevealVersion] = useState(0);
  const [generatorOpen, setGeneratorOpen] = useState(false);

  return (
    <ConsoleContext.Provider
      value={{
        ...snapshotState,
        ...reviewerProfile,
        announcement,
        announce: setAnnouncement,
        activityFilter,
        setActivityFilter,
        revealVersion,
        refreshReveals: () => setRevealVersion((version) => version + 1),
        generatorOpen,
        setGeneratorOpen,
      }}
    >
      {children}
    </ConsoleContext.Provider>
  );
}
