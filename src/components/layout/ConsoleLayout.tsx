"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { GeneratorDialog } from "../dialogs/GeneratorDialog";
import { ReviewerProfileDialog } from "../dialogs/ReviewerProfileDialog";
import { ConsoleHeader } from "../header/ConsoleHeader";
import { ConsoleProvider } from "./ConsoleProvider";
import { useConsoleData } from "../../hooks/use-console-data";
import { consolePagePaths } from "../../lib/console/routes";
import type { ConsolePage } from "../../lib/console/view-model";

function pageForPath(pathname: string): ConsolePage {
  switch (pathname.replace(/\/+$/, "") || "/") {
    case "/approval":
      return "queue";
    case "/history":
      return "activity";
    case "/log":
      return "audit";
    default:
      return "overview";
  }
}

function prefersReducedMotion() {
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function ConsoleFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const {
    activityFilter,
    announce,
    announcement,
    generatorOpen,
    loadSnapshot,
    profileColor,
    profileColorDraft,
    profileError,
    revealVersion,
    reviewer,
    reviewerDraft,
    saveProfile,
    setGeneratorOpen,
    setProfileColorDraft,
    setReviewerDraft,
    snapshot,
    snapshotError,
    openProfileSettings,
  } = useConsoleData();
  const [mobileNav, setMobileNav] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const pageContent = useRef<HTMLDivElement>(null);
  const page = pageForPath(pathname);

  useEffect(() => {
    const revealTargets = pageContent.current?.querySelectorAll<HTMLElement>("[data-reveal]");
    if (!revealTargets) return;

    if (prefersReducedMotion() || !("IntersectionObserver" in window)) {
      revealTargets.forEach((element) => element.classList.add("is-visible"));
      return;
    }

    const observer = new IntersectionObserver(
      (entries, currentObserver) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          currentObserver.unobserve(entry.target);
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -24px 0px" },
    );

    revealTargets.forEach((element) => {
      element.classList.add("reveal-on-scroll");
      if (!element.classList.contains("is-visible")) observer.observe(element);
    });

    return () => observer.disconnect();
  }, [activityFilter, pathname, revealVersion, snapshot]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? "auto" : "smooth" });
  }, [pathname]);

  function navigate(nextPage: ConsolePage) {
    setMobileNav(false);
    if (pathname !== consolePagePaths[nextPage]) {
      router.push(consolePagePaths[nextPage], { scroll: false });
    }
  }

  function openProfile() {
    openProfileSettings();
    setProfileOpen(true);
  }

  function profileSaved(name: string, color: string) {
    saveProfile(name, color);
    announce("Reviewer profile saved in this browser.");
  }

  return (
    <div className="redesign app-shell">
      <ConsoleHeader
        page={page}
        mobileNav={mobileNav}
        hasSnapshot={snapshot !== null}
        pendingCount={snapshot?.actions.length ?? 0}
        snapshotError={snapshotError}
        reviewer={reviewer}
        profileColor={profileColor}
        onNavigate={navigate}
        onMobileNavChange={setMobileNav}
        onOpenGenerator={() => setGeneratorOpen(true)}
        onOpenProfile={openProfile}
      />
      <main>
        <div className="page page-transition" key={pathname} ref={pageContent}>
          <p id="console-announcement" role="status" aria-live="polite" tabIndex={-1}>
            {announcement}
          </p>
          {snapshotError && (
            <p role="alert">
              {snapshotError}{" "}
              <button type="button" onClick={() => void loadSnapshot()}>
                Retry loading
              </button>
            </p>
          )}
          {children}
        </div>
      </main>
      <GeneratorDialog
        open={generatorOpen}
        onOpenChange={setGeneratorOpen}
        onSubmitted={loadSnapshot}
      />
      <ReviewerProfileDialog
        open={profileOpen}
        reviewerDraft={reviewerDraft}
        profileColorDraft={profileColorDraft}
        profileError={profileError}
        onOpenChange={setProfileOpen}
        onSaved={profileSaved}
        onReviewerDraftChange={setReviewerDraft}
        onProfileColorDraftChange={setProfileColorDraft}
      />
    </div>
  );
}

export function ConsoleLayout({ children }: { children: ReactNode }) {
  return (
    <ConsoleProvider>
      <ConsoleFrame>{children}</ConsoleFrame>
    </ConsoleProvider>
  );
}
