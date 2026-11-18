"use client";

import { createContext } from "react";
import type { ConsoleSnapshot, ConsoleStatus } from "../lib/console/contract";

export type ConsoleContextValue = {
  snapshot: ConsoleSnapshot | null;
  snapshotError: string;
  loadSnapshot: () => Promise<void>;
  announcement: string;
  announce: (message: string) => void;
  activityFilter: "all" | ConsoleStatus;
  setActivityFilter: (filter: "all" | ConsoleStatus) => void;
  revealVersion: number;
  refreshReveals: () => void;
  generatorOpen: boolean;
  setGeneratorOpen: (open: boolean) => void;
  reviewer: string;
  setReviewer: (reviewer: string) => void;
  profileColor: string;
  setProfileColor: (color: string) => void;
  reviewerDraft: string;
  setReviewerDraft: (reviewer: string) => void;
  profileColorDraft: string;
  setProfileColorDraft: (color: string) => void;
  profileError: string;
  setProfileError: (message: string) => void;
  openProfileSettings: () => void;
  saveProfile: (reviewer: string, color: string) => void;
};

export const ConsoleContext = createContext<ConsoleContextValue | null>(null);
