"use client";

import { useEffect, useState } from "react";
import { z } from "zod";

const savedProfileSchema = z.object({
  reviewer: z.string().max(100),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});

export function useReviewerProfile() {
  const [reviewer, setReviewer] = useState("");
  const [reviewerDraft, setReviewerDraft] = useState("");
  const [profileColor, setProfileColor] = useState("#2c2782");
  const [profileColorDraft, setProfileColorDraft] = useState("#2c2782");
  const [profileError, setProfileError] = useState("");

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      try {
        const saved = window.localStorage.getItem("countersign.reviewer-profile");
        if (!saved) return;
        const profile = savedProfileSchema.safeParse(JSON.parse(saved));
        if (!profile.success) {
          setProfileError("Saved profile settings are invalid. Update them and save again.");
          return;
        }
        setReviewer(profile.data.reviewer);
        setProfileColor(profile.data.color);
      } catch {
        setProfileError("Could not load saved profile settings from this browser.");
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  function openProfileSettings() {
    setReviewerDraft(reviewer);
    setProfileColorDraft(profileColor);
  }

  function saveProfile(name: string, color: string) {
    setReviewer(name);
    setProfileColor(color);
    setProfileError("");
  }

  return {
    reviewer,
    setReviewer,
    reviewerDraft,
    setReviewerDraft,
    profileColor,
    setProfileColor,
    profileColorDraft,
    setProfileColorDraft,
    profileError,
    setProfileError,
    openProfileSettings,
    saveProfile,
  };
}
