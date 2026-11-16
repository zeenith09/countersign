"use client";

import type { ConsolePage } from "../view-model";
import { Icon, NavItem, profileTextColor } from "./ConsoleElements";

export function ConsoleHeader({
  page,
  mobileNav,
  hasSnapshot,
  pendingCount,
  snapshotError,
  reviewer,
  profileColor,
  onNavigate,
  onMobileNavChange,
  onOpenGenerator,
  onOpenProfile,
}: {
  page: ConsolePage;
  mobileNav: boolean;
  hasSnapshot: boolean;
  pendingCount: number;
  snapshotError: string;
  reviewer: string;
  profileColor: string;
  onNavigate: (page: ConsolePage) => void;
  onMobileNavChange: (open: boolean) => void;
  onOpenGenerator: () => void;
  onOpenProfile: () => void;
}) {
  return (
    <>
      <header className="global-header">
        <div className="brand">
          <div className="brand-mark">
            <span />
            <span />
          </div>
          <div>
            <strong>Countersign</strong>
            <small>Approval console</small>
          </div>
        </div>
        <button
          className="icon-button menu-button"
          onClick={() => onMobileNavChange(true)}
          aria-label="Open navigation"
        >
          <Icon name="menu" />
        </button>
        <nav
          className={`header-navigation ${mobileNav ? "mobile-open" : ""}`}
          aria-label="Main navigation"
        >
          <div className="mobile-nav-head">
            <span>Navigate workspace</span>
            <button
              className="icon-button mobile-close"
              onClick={() => onMobileNavChange(false)}
              aria-label="Close navigation"
            >
              <Icon name="x" />
            </button>
          </div>
          <NavItem page="overview" current={page} label="Overview" icon="overview" onClick={onNavigate} />
          <NavItem
            page="queue"
            current={page}
            label="Approval queue"
            icon="queue"
            count={hasSnapshot ? pendingCount : undefined}
            onClick={onNavigate}
          />
          <NavItem page="activity" current={page} label="Activity history" icon="activity" onClick={onNavigate} />
          <NavItem page="audit" current={page} label="Audit log" icon="audit" onClick={onNavigate} />
        </nav>
        <div className="header-actions">
          <div className="system-status">
            <div>
              <strong>{snapshotError ? "Data unavailable" : hasSnapshot ? "Data loaded" : "Loading"}</strong>
              <small>Console snapshot</small>
            </div>
          </div>
          <button className="header-generate" onClick={onOpenGenerator}>
            <Icon name="plus" size={16} />
            <span>New action</span>
          </button>
          <button
            className="profile profile-button"
            type="button"
            onClick={onOpenProfile}
          >
            <div
              className="avatar"
              style={{ backgroundColor: profileColor, color: profileTextColor(profileColor) }}
            >
              {reviewer.trim().slice(0, 2).toUpperCase() || "—"}
            </div>
            <div>
              <strong>{reviewer.trim() || "Reviewer not set"}</strong>
              <small>Self-reported reviewer</small>
            </div>
          </button>
        </div>
      </header>
      {mobileNav && (
        <button
          className="nav-backdrop"
          aria-label="Close navigation"
          onClick={() => onMobileNavChange(false)}
        />
      )}
    </>
  );
}
