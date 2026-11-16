"use client";

import { FormEvent, ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";

type Status = "pending" | "approved" | "denied" | "auto_allowed" | "blocked";
type Page = "overview" | "queue" | "activity" | "audit";
type Action = {
  id: string;
  tool: string;
  title: string;
  summary: string;
  reasoning: string;
  age: string;
  created: number;
  status: Status;
  risk: string;
  rule: string;
  ruleDescription: string;
  parameters: unknown;
};
type Activity = {
  id: string;
  title: string;
  detail: string;
  status: Status;
  actor: string;
  time: string;
};

const statusSchema = z.enum(["pending", "approved", "denied", "auto_allowed", "blocked"]);
const snapshotSchema = z.object({
  actions: z.array(z.object({
    id: z.string(), tool: z.string(), title: z.string(), summary: z.string(),
    reasoning: z.string(), age: z.string(), created: z.number(), status: z.literal("pending"),
    risk: z.string(), rule: z.string(), ruleDescription: z.string(), parameters: z.unknown(),
  })),
  counts: z.partialRecord(statusSchema, z.number().int().nonnegative()),
  activity: z.array(z.object({
    id: z.string(), title: z.string(), detail: z.string(),
    status: statusSchema,
    actor: z.string(), time: z.string(),
  })),
  audit: z.array(z.object({
    id: z.string(), sequence: z.string(), event: z.string(), hash: z.string(),
    createdAt: z.string(), principal: z.string(),
  })),
});
type Snapshot = z.infer<typeof snapshotSchema>;

async function fetchSnapshot(): Promise<Snapshot> {
  const response = await fetch("/api/console", { cache: "no-store" });
  if (!response.ok) throw new Error("Console data could not be loaded.");
  const parsed = snapshotSchema.safeParse(await response.json());
  if (!parsed.success) throw new Error("The console received an invalid response.");
  return parsed.data;
}

const scenarios = [
  { value: "pending", label: "High-value refund", expected: "Review scenario", description: "A refund proposal for policy evaluation.", payload: { agentId: "demo-agent", tool: "issue_refund", parameters: { orderId: "ORDER-1005", amount: 750, currency: "USD" }, agentReasoning: "Customer requested a refund." } },
  { value: "allowed", label: "Internal email", expected: "Internal email scenario", description: "A message to the fictional internal domain.", payload: { agentId: "demo-agent", tool: "send_email", parameters: { to: "support@countersign.example", subject: "Order review requested", body: "Please review the order." }, agentReasoning: "Request an internal review." } },
  { value: "blocked", label: "Delete record", expected: "Deletion scenario", description: "A record deletion proposal for policy evaluation.", payload: { agentId: "demo-agent", tool: "delete_record", parameters: { recordId: "RECORD-1006" }, agentReasoning: "Remove a duplicate record." } },
];

const statusLabel: Record<Status, string> = {
  pending: "Pending review",
  approved: "Human-approved",
  denied: "Human-denied",
  auto_allowed: "Auto-allowed",
  blocked: "Blocked",
};

function profileTextColor(hexColor: string): string {
  const channels = hexColor.slice(1).match(/.{2}/g)?.map((channel) => Number.parseInt(channel, 16) / 255) ?? [];
  const [red, green, blue] = channels.map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );
  const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  const whiteContrast = 1.05 / (luminance + 0.05);
  const darkContrast = (luminance + 0.05) / 0.07;
  return whiteContrast >= darkContrast ? "#ffffff" : "#201e4f";
}

function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const paths: Record<string, ReactNode> = {
    overview: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </>
    ),
    queue: (
      <>
        <path d="M4 7.5h16v11H4z" />
        <path d="m4 7.5 2.5-4h11l2.5 4M8 12h8" />
      </>
    ),
    activity: (
      <>
        <path d="M3 12a9 9 0 1 0 3-6.7" />
        <path d="M3 4v6h6M12 7v5l3 2" />
      </>
    ),
    audit: (
      <>
        <path d="M7 3h10v4H7z" />
        <path d="M5 5H3v16h14v-2M8 11h8M8 15h6" />
        <path d="m17 14 4 4-4 4" />
      </>
    ),
    plus: <path d="M12 5v14M5 12h14" />,
    arrow: (
      <>
        <path d="M5 12h14M14 7l5 5-5 5" />
      </>
    ),
    shield: <path d="M12 3 4.5 6v5.5c0 4.7 3.2 7.9 7.5 9.5 4.3-1.6 7.5-4.8 7.5-9.5V6L12 3Z" />,
    x: <path d="m6 6 12 12M18 6 6 18" />,
    copy: (
      <>
        <rect x="8" y="8" width="11" height="11" rx="2" />
        <path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    bolt: <path d="m13 2-9 12h8l-1 8 9-12h-8l1-8Z" />,
    menu: <path d="M4 7h16M4 12h16M4 17h16" />,
    chevron: <path d="m9 18 6-6-6-6" />,
    code: <path d="m8 9-3 3 3 3M16 9l3 3-3 3M14 5l-4 14" />,
    spark: (
      <>
        <path d="m12 3 1.2 4.2L17 9l-3.8 1.8L12 15l-1.2-4.2L7 9l3.8-1.8L12 3Z" />
        <path d="m19 16 .6 2.2L22 19l-2.4.8L19 22l-.6-2.2L16 19l2.4-.8L19 16Z" />
      </>
    ),
  };
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </svg>
  );
}

function Badge({ status }: { status: Status }) {
  return (
    <span className={`badge badge-${status}`}>
      <span className="badge-dot" />
      {statusLabel[status]}
    </span>
  );
}

function JsonCode({ value }: { value: unknown }) {
  const json = JSON.stringify(value, null, 2);
  const parts = json.split(
    /("(?:\\.|[^"\\])*"(?=\s*:)|"(?:\\.|[^"\\])*"|\b(?:true|false|null)\b|-?\d+(?:\.\d+)?)/g,
  );
  return (
    <code>
      {parts.map((part, i) => {
        let className = "";
        if (/^".*"$/.test(part))
          className =
            part.match(/"\s*$/) && json.indexOf(`${part}:`) >= 0 ? "json-key" : "json-string";
        if (/^(true|false|null)$/.test(part)) className = "json-bool";
        if (/^-?\d/.test(part)) className = "json-number";
        return (
          <span className={className} key={i}>
            {part}
          </span>
        );
      })}
    </code>
  );
}

function Metric({
  label,
  value,
  tone,
  onClick,
}: {
  label: string;
  value: number | null;
  tone: string;
  onClick?: () => void;
}) {
  const content = (
    <>
      <div className={`metric-icon ${tone}`}>
        <Icon
          name={
            tone === "green"
              ? "check"
              : tone === "red"
                ? "x"
                : tone === "amber"
                  ? "queue"
                  : "shield"
          }
          size={16}
        />
      </div>
      <div>
        <strong>{value === null ? "—" : String(value).padStart(2, "0")}</strong>
        <span>{label}</span>
      </div>
    </>
  );
  return onClick ? (
    <button className="metric metric-button" type="button" onClick={onClick}>
      {content}
    </button>
  ) : (
    <div className="metric">{content}</div>
  );
}

function NavItem({
  page,
  current,
  label,
  icon,
  count,
  onClick,
}: {
  page: Page;
  current: Page;
  label: string;
  icon: string;
  count?: number;
  onClick: (p: Page) => void;
}) {
  return (
    <button
      className={`nav-item ${page === current ? "active" : ""}`}
      onClick={() => onClick(page)}
      aria-current={page === current ? "page" : undefined}
    >
      <Icon name={icon} />
      <span>{label}</span>
      {count !== undefined && <span className="nav-count">{count}</span>}
    </button>
  );
}

export default function App() {
  const [page, setPage] = useState<Page>("queue");
  const [mobileNav, setMobileNav] = useState(false);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [snapshotError, setSnapshotError] = useState("");
  const [selected, setSelected] = useState<Action | null>(null);
  const [decision, setDecision] = useState<"approved" | "denied" | null>(null);
  const [reviewer, setReviewer] = useState("");
  const [reviewerDraft, setReviewerDraft] = useState("");
  const [profileColor, setProfileColor] = useState("#2c2782");
  const [profileColorDraft, setProfileColorDraft] = useState("#2c2782");
  const [profileError, setProfileError] = useState("");
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [reasonError, setReasonError] = useState("");
  const [decisionMessage, setDecisionMessage] = useState("");
  const [lockedIds, setLockedIds] = useState<string[]>([]);
  const [announcement, setAnnouncement] = useState("");
  const [decisionState, setDecisionState] = useState<"idle" | "loading" | "success" | "error">(
    "idle",
  );
  const [copied, setCopied] = useState(false);
  const [activityFilter, setActivityFilter] = useState<"all" | Status>("all");
  const [queueSort, setQueueSort] = useState<"oldest" | "newest">("oldest");
  const [generatorTab, setGeneratorTab] = useState<"demo" | "manual">("demo");
  const [scenario, setScenario] = useState("pending");
  const [manualJson, setManualJson] = useState(JSON.stringify(scenarios[0].payload, null, 2));
  const [jsonError, setJsonError] = useState("");
  const [generationState, setGenerationState] = useState<
    "idle" | "receiving" | "evaluating" | "persisting" | "done" | "error"
  >("idle");
  const [receipt, setReceipt] = useState<{ status: Status; title: string; detail: string } | null>(
    null,
  );
  const detailDialog = useRef<HTMLDialogElement>(null);
  const decisionDialog = useRef<HTMLDialogElement>(null);
  const generatorDialog = useRef<HTMLDialogElement>(null);
  const profileDialog = useRef<HTMLDialogElement>(null);
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const reviewerRef = useRef<HTMLInputElement>(null);
  const inFlightDecision = useRef(false);
  const inFlightGeneration = useRef(false);
  const selectedScenario = scenarios.find((s) => s.value === scenario) ?? scenarios[0];
  const generating = generationState === "receiving" || generationState === "evaluating" || generationState === "persisting";

  const actions = snapshot?.actions ?? [];
  const sortedActions = [...actions].sort((a, b) => {
    const timeDifference = queueSort === "oldest" ? a.created - b.created : b.created - a.created;
    return timeDifference || a.id.localeCompare(b.id);
  });
  const activity = snapshot?.activity ?? [];
  const counts = {
    pending: snapshot ? snapshot.counts.pending ?? 0 : null,
    approved: snapshot ? snapshot.counts.approved ?? 0 : null,
    denied: snapshot ? snapshot.counts.denied ?? 0 : null,
    auto: snapshot ? snapshot.counts.auto_allowed ?? 0 : null,
    blocked: snapshot ? snapshot.counts.blocked ?? 0 : null,
  };
  const loadSnapshot = useCallback(async () => {
    try {
      setSnapshot(await fetchSnapshot());
      setSnapshotError("");
      return true;
    } catch (error) {
      setSnapshotError(error instanceof Error ? error.message : "Console data could not be loaded.");
      return false;
    }
  }, []);

  useEffect(() => {
    let active = true;
    void fetchSnapshot().then((result) => {
      if (active) setSnapshot(result);
    }).catch((error: unknown) => {
      if (active) setSnapshotError(error instanceof Error ? error.message : "Console data could not be loaded.");
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      try {
        const saved = window.localStorage.getItem("countersign.reviewer-profile");
        if (!saved) return;
        const profile = z.object({
          reviewer: z.string().max(100),
          color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
        }).safeParse(JSON.parse(saved));
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

  useEffect(() => {
    if (selected && !detailDialog.current?.open && !decision) detailDialog.current?.showModal();
  }, [selected, decision]);

  useEffect(() => {
    if (selected && decision && !decisionDialog.current?.open) decisionDialog.current?.showModal();
  }, [selected, decision]);

  function openAction(action: Action) {
    setSelected(action);
    setDecisionState("idle");
    setDecisionMessage("");
    setCopied(false);
  }

  function closeDetail() {
    detailDialog.current?.close();
    setSelected(null);
  }

  function openDecision(outcome: "approved" | "denied") {
    detailDialog.current?.close();
    setDecision(outcome);
    setReasonError("");
    setDecisionState("idle");
    setDecisionMessage("");
  }

  function cancelDecision() {
    decisionDialog.current?.close();
    setDecision(null);
  }

  async function readStatus(id: string): Promise<string | null> {
    try {
      const response = await fetch(`/api/actions/${encodeURIComponent(id)}`, { cache: "no-store" });
      if (!response.ok) return null;
      const result = z.object({ status: statusSchema }).safeParse(await response.json());
      return result.success ? result.data.status : null;
    } catch {
      return null;
    }
  }

  async function submitDecision(event: FormEvent) {
    event.preventDefault();
    if (!selected || !decision || inFlightDecision.current || lockedIds.includes(selected.id)) return;
    const reason = reasons[selected.id]?.trim();
    if (!reason) {
      setReasonError("Enter a reason specific to this action.");
      reasonRef.current?.focus();
      return;
    }
    if (!reviewer.trim()) {
      setReasonError("Enter the reviewer name before confirming.");
      reviewerRef.current?.focus();
      return;
    }
    setReasonError("");
    setDecisionMessage("");
    setDecisionState("loading");
    inFlightDecision.current = true;
    const id = selected.id;
    try {
      const response = await fetch(`/api/actions/${encodeURIComponent(id)}/decision`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewer, outcome: decision, reason }),
      });
      if (response.ok) {
        const status = await readStatus(id);
        const message = status ? `Decision committed. Current status: ${status}.` : "Decision committed, but its stored status could not be refreshed.";
        setDecisionState("success");
        setDecisionMessage(message);
        setAnnouncement(message);
        setLockedIds((ids) => [...ids, id]);
        await loadSnapshot();
        decisionDialog.current?.close();
        setSelected(null);
        setDecision(null);
        setReasons((current) => { const next = { ...current }; delete next[id]; return next; });
        requestAnimationFrame(() => document.getElementById("console-announcement")?.focus());
      } else if (response.status === 409 || response.status >= 500) {
        const status = await readStatus(id);
        setLockedIds((ids) => [...ids, id]);
        setDecisionState("error");
        setDecisionMessage(`${response.status === 409 ? "This action is no longer pending." : "The server could not confirm the decision."} Current status: ${status ?? "unknown"}. Refresh before continuing.`);
      } else {
        setDecisionState("error");
        setDecisionMessage(`Decision rejected (HTTP ${response.status}). Check the reviewer and reason.`);
      }
    } catch {
      const status = await readStatus(id);
      setLockedIds((ids) => [...ids, id]);
      setDecisionState("error");
      setDecisionMessage(`Network error. Current status: ${status ?? "unknown"}. Refresh before continuing.`);
    } finally {
      inFlightDecision.current = false;
    }
  }

  function formatJson() {
    try {
      const parsed: unknown = JSON.parse(manualJson);
      setManualJson(JSON.stringify(parsed, null, 2));
      setJsonError("");
    } catch (error) {
      setJsonError(error instanceof Error ? error.message : "Invalid JSON");
    }
  }

  async function generateAction() {
    if (inFlightGeneration.current) return;
    let payload: unknown;
    try {
      payload = generatorTab === "manual" ? JSON.parse(manualJson) : selectedScenario.payload;
      if (!payload || Array.isArray(payload) || typeof payload !== "object") throw new Error("The proposal must be a JSON object.");
    } catch (error) {
      setJsonError(error instanceof Error ? error.message : "Invalid JSON");
      setGenerationState("error");
      return;
    }
    setJsonError("");
    setReceipt(null);
    setGenerationState("receiving");
    inFlightGeneration.current = true;
    try {
      const response = await fetch("/api/actions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const body: unknown = await response.json();
      const result = z.object({ actionId: z.string(), status: z.enum(["pending", "auto_allowed", "blocked"]), outcome: z.enum(["needs_approval", "allow", "block"]), ruleId: z.string() }).safeParse(body);
      if (result.success && (
        (response.status === 201 && result.data.status === "pending" && result.data.outcome === "needs_approval") ||
        (response.status === 201 && result.data.status === "auto_allowed" && result.data.outcome === "allow") ||
        (response.status === 403 && result.data.status === "blocked" && result.data.outcome === "block")
      )) {
        const status = result.data.status;
        setReceipt({ status, title: status === "pending" ? "Awaiting human review" : status === "auto_allowed" ? "Policy auto-allowed this action" : "Gateway blocked this action", detail: `Action ${result.data.actionId}; matched rule: ${result.data.ruleId}.` });
        setGenerationState("done");
        await loadSnapshot();
      } else {
        setGenerationState("error");
        const message = z.object({ message: z.string() }).safeParse(body);
        setJsonError(response.status >= 500 || response.ok || response.status === 403 ? "Submission could not be confirmed; it may have been stored. Check activity and the queue before submitting again." : message.success ? message.data.message : `Submission rejected (HTTP ${response.status}).`);
      }
    } catch {
      setGenerationState("error");
      setJsonError("Network error: submission status is unknown and it may have been stored. Check activity and the queue before submitting again.");
    } finally {
      inFlightGeneration.current = false;
    }
  }

  function navigate(next: Page) {
    setPage(next);
    setMobileNav(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function showActivityStatus(status: Status) {
    setActivityFilter(status);
    navigate("activity");
  }

  function openProfileSettings() {
    setReviewerDraft(reviewer);
    setProfileColorDraft(profileColor);
    profileDialog.current?.showModal();
  }

  function saveProfileSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = reviewerDraft.trim();
    if (!name) {
      setProfileError("Enter a reviewer name before saving.");
      return;
    }
    try {
      window.localStorage.setItem(
        "countersign.reviewer-profile",
        JSON.stringify({ reviewer: name, color: profileColorDraft }),
      );
      setReviewer(name);
      setProfileColor(profileColorDraft);
      setProfileError("");
      setAnnouncement("Reviewer profile saved in this browser.");
      profileDialog.current?.close();
    } catch {
      setProfileError("Could not save your profile in this browser. Check storage settings and try again.");
    }
  }

  return (
    <div className="redesign app-shell">
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
          onClick={() => setMobileNav(true)}
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
              onClick={() => setMobileNav(false)}
              aria-label="Close navigation"
            >
              <Icon name="x" />
            </button>
          </div>
          <NavItem
            page="overview"
            current={page}
            label="Overview"
            icon="overview"
            onClick={navigate}
          />
          <NavItem
            page="queue"
            current={page}
            label="Approval queue"
            icon="queue"
            count={snapshot ? actions.length : undefined}
            onClick={navigate}
          />
          <NavItem
            page="activity"
            current={page}
            label="Activity history"
            icon="activity"
            onClick={navigate}
          />
          <NavItem page="audit" current={page} label="Audit log" icon="audit" onClick={navigate} />
        </nav>
        <div className="header-actions">
          <div className="system-status">
            <div>
              <strong>{snapshotError ? "Data unavailable" : snapshot ? "Data loaded" : "Loading"}</strong>
              <small>Console snapshot</small>
            </div>
          </div>
          <button className="header-generate" onClick={() => generatorDialog.current?.showModal()}>
            <Icon name="plus" size={16} />
            <span>New action</span>
          </button>
          <button className="profile profile-button" type="button" onClick={openProfileSettings} aria-label="Edit reviewer profile">
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
          onClick={() => setMobileNav(false)}
        />
      )}

      <main>
        <div className="page">
          <p id="console-announcement" role="status" aria-live="polite" tabIndex={-1}>{announcement}</p>
          {snapshotError && <p role="alert">{snapshotError} <button type="button" onClick={() => void loadSnapshot()}>Retry loading</button></p>}
          {!snapshot && !snapshotError && <p role="status">Loading console data. Please wait.</p>}
          {page === "queue" && (
            <>
              <section className="page-heading">
                <div>
                  <p className="eyebrow">Human review</p>
                  <h1>Approval queue</h1>
                  <p>Review actions held by policy before any mocked tool can run.</p>
                </div>
                <button
                  className="primary-button desktop-heading-button"
                  onClick={() => generatorDialog.current?.showModal()}
                >
                  <Icon name="plus" size={17} />
                  Generate incoming action
                </button>
              </section>
              <section className="metrics" aria-label="Action counts">
                <Metric label="Pending" value={counts.pending} tone="amber" onClick={() => showActivityStatus("pending")} />
                <Metric label="Human-approved" value={counts.approved} tone="green" onClick={() => showActivityStatus("approved")} />
                <Metric label="Human-denied" value={counts.denied} tone="red" onClick={() => showActivityStatus("denied")} />
                <Metric label="Auto-allowed" value={counts.auto} tone="blue" onClick={() => showActivityStatus("auto_allowed")} />
                <Metric label="Blocked" value={counts.blocked} tone="slate" onClick={() => showActivityStatus("blocked")} />
              </section>
              <section className="queue-section" aria-labelledby="pending-heading">
                <div className="section-heading">
                  <div>
                    <h2 id="pending-heading">Pending actions</h2>
                    <p>{snapshot ? `${actions.length} actions require a human decision` : "Loading pending actions."}</p>
                  </div>
                  <button
                    className="sort-label"
                    type="button"
                    aria-label={`Sort pending actions: ${queueSort === "oldest" ? "oldest first" : "newest first"}`}
                    onClick={() => setQueueSort((sort) => (sort === "oldest" ? "newest" : "oldest"))}
                  >
                    {queueSort === "oldest" ? "Oldest first" : "Newest first"}
                    <span aria-hidden="true">{queueSort === "oldest" ? "↓" : "↑"}</span>
                  </button>
                </div>
                {!snapshot ? null : actions.length === 0 ? (
                  <div className="empty">
                    <div className="empty-icon">
                      <Icon name="check" />
                    </div>
                    <h3>Queue is clear</h3>
                    <p>No actions are waiting for human review. Check again for new submissions.</p>
                  </div>
                ) : (
                  <div className="queue-list">
                    {sortedActions.map((action) => (
                      <article
                        className="action-card"
                        key={action.id}
                        onClick={() => openAction(action)}
                      >
                        <div className="card-main">
                          <div className="tool-icon">
                            <Icon
                              name={
                                action.tool === "send_email"
                                  ? "arrow"
                                  : action.tool.includes("refund")
                                    ? "activity"
                                    : "bolt"
                              }
                              size={19}
                            />
                          </div>
                          <div className="card-content">
                            <div className="card-title-row">
                              <div>
                                <span className="tool-name">{action.tool}</span>
                                <h3>{action.title}</h3>
                              </div>
                              <Badge status={action.status} />
                            </div>
                            <p className="summary">{action.summary}</p>
                            <div className="reasoning">
                              <span>Agent reasoning</span>
                              <p>{action.reasoning}</p>
                            </div>
                            <div className="card-meta">
                              <span>
                                <i /> {action.age}
                              </span>
                              <span>{action.risk}</span>
                              <span className="id-text">{action.id}</span>
                            </div>
                            <div className="policy-row">
                              <Icon name="shield" size={17} />
                              <div>
                                <span>Matched policy</span>
                                <strong>{action.rule}</strong>
                                <p>{action.ruleDescription}</p>
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="card-action">
                          <button
                            className="review-button"
                            onClick={(e) => {
                              e.stopPropagation();
                              openAction(action);
                            }}
                          >
                            Review action <Icon name="arrow" size={16} />
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>
              <section className="policy-receipt">
                <div className="receipt-icon">
                  <Icon name="shield" />
                </div>
                <div>
                  <h2>Policy outcomes stay out of this queue</h2>
                  <p>
                    Auto-allowed and blocked proposals appear in activity history, clearly separated
                    from human decisions.
                  </p>
                </div>
                <button onClick={() => navigate("activity")}>
                  View activity <Icon name="arrow" size={15} />
                </button>
              </section>
            </>
          )}

          {page === "overview" && (
            <Overview counts={counts} activity={activity} onNavigate={navigate} onStatusClick={showActivityStatus} />
          )}
          {page === "activity" && (
            <ActivityPage
              activity={activity}
              filter={activityFilter}
              setFilter={setActivityFilter}
            />
          )}
          {page === "audit" && <AuditPage entries={snapshot?.audit ?? []} />}
        </div>
      </main>

      <dialog
        ref={detailDialog}
        className="dialog detail-dialog"
        aria-labelledby="detail-dialog-title"
        onClick={(event) => {
          if (event.target === event.currentTarget) closeDetail();
        }}
        onCancel={(event) => {
          event.preventDefault();
          closeDetail();
        }}
      >
        {selected && (
          <div className="dialog-inner">
            <div className="dialog-header">
              <div className="dialog-title">
                <div className="tool-icon large">
                  <Icon name="bolt" />
                </div>
                <div>
                  <span className="tool-name">{selected.tool}</span>
                  <h2 id="detail-dialog-title">{selected.title}</h2>
                </div>
              </div>
              <button
                className="icon-button"
                onClick={closeDetail}
                aria-label="Close action details"
              >
                <Icon name="x" />
              </button>
            </div>
            <div className="dialog-body">
              <div className="detail-summary">
                <div>
                  <span>Action summary</span>
                  <p>{selected.summary}</p>
                </div>
                <Badge status={selected.status} />
              </div>
              <div className="detail-grid">
                <div className="detail-block wide">
                  <span>Agent reasoning</span>
                  <p>{selected.reasoning}</p>
                </div>
                <div className="detail-block">
                  <span>Risk assessment</span>
                  <strong>{selected.risk}</strong>
                  <small>No score has been provided.</small>
                </div>
                <div className="detail-block">
                  <span>Action identifier</span>
                  <strong className="mono">{selected.id}</strong>
                  <small>Submitted {selected.age}</small>
                </div>
              </div>
              <div className="matched-rule">
                <Icon name="shield" />
                <div>
                  <span>Matched policy rule</span>
                  <strong>{selected.rule}</strong>
                  <p>{selected.ruleDescription}</p>
                </div>
                {lockedIds.includes(selected.id) && (
                  <p role="status">{decisionMessage || "This action needs a status refresh before another decision."} <button type="button" onClick={() => window.location.reload()}>Refresh console</button></p>
                )}
              </div>
              <div className="code-heading">
                <div>
                  <span>Submitted parameters</span>
                  <small>Read-only · Exact gateway payload</small>
                </div>
                <button
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(JSON.stringify(selected.parameters, null, 2));
                      setCopied(true);
                    } catch {
                      setAnnouncement("Could not copy JSON. Select the parameters and copy them manually.");
                    }
                  }}
                >
                  <Icon name={copied ? "check" : "copy"} size={15} />
                  {copied ? "Copied" : "Copy JSON"}
                </button>
              </div>
              <pre className="code-block">
                <JsonCode value={selected.parameters} />
              </pre>
            </div>
            <div className="dialog-footer">
              <p>
                <Icon name="shield" size={15} />A reason is required. The mocked tool runs only
                after approval commits.
              </p>
              <div>
                <button className="button deny" disabled={lockedIds.includes(selected.id)} onClick={() => openDecision("denied")}>
                  <Icon name="x" size={16} />
                  Deny
                </button>
                <button className="button approve" disabled={lockedIds.includes(selected.id)} onClick={() => openDecision("approved")}>
                  <Icon name="check" size={16} />
                  Approve
                </button>
              </div>
            </div>
          </div>
        )}
      </dialog>

      <dialog
        ref={decisionDialog}
        className="dialog decision-dialog"
        aria-labelledby="decision-dialog-title"
        onClick={(event) => {
          if (event.target === event.currentTarget && decisionState !== "loading") cancelDecision();
        }}
        onCancel={(event) => {
          event.preventDefault();
          if (decisionState !== "loading") cancelDecision();
        }}
      >
        {selected && decision && (
          <form onSubmit={submitDecision}>
            <div className={`decision-hero ${decision}`}>
              <div className="decision-symbol">
                <Icon name={decision === "approved" ? "check" : "x"} size={22} />
              </div>
              <div>
                <p>Confirm {decision === "approved" ? "approval" : "denial"}</p>
                <h2 id="decision-dialog-title">{selected.title}</h2>
                <span>
                  {selected.tool} · {selected.id}
                </span>
              </div>
              <button
                type="button"
                className="icon-button"
                onClick={cancelDecision}
                aria-label="Cancel decision"
                disabled={decisionState === "loading"}
              >
                <Icon name="x" />
              </button>
            </div>
            <div className="decision-body">
              <p className="decision-copy">
                You are recording a{" "}
                <strong>{decision === "approved" ? "human approval" : "human denial"}</strong>. This
                decision and its audit entry commit together.
              </p>
              <label>
                Reviewer name
                <input
                  ref={reviewerRef}
                  value={reviewer}
                  onChange={(e) => setReviewer(e.target.value)}
                  maxLength={100}
                  required
                  disabled={decisionState === "loading"}
                  autoComplete="name"
                />
              </label>
              <label>
                Reason for this {decision === "approved" ? "approval" : "denial"}
                <span className="required">Required</span>
                <textarea
                  ref={reasonRef}
                  value={reasons[selected.id] ?? ""}
                  onChange={(e) => setReasons((r) => ({ ...r, [selected.id]: e.target.value }))}
                  aria-invalid={!!reasonError}
                  aria-describedby={reasonError ? "reason-error" : "reason-help"}
                  placeholder={
                    decision === "approved"
                      ? "Why is this action appropriate to proceed?"
                      : "Why should this action not proceed?"
                  }
                  disabled={decisionState === "loading"}
                  maxLength={2000}
                  required
                  autoFocus
                />
              </label>
              {reasonError ? (
                <p id="reason-error" className="field-error" role="alert">
                  {reasonError}
                </p>
              ) : (
                <p id="reason-help" className="field-help">
                  This reason applies only to this action and will not carry over.
                </p>
              )}
              <div className={`live-status ${decisionState}`} aria-live="polite">
                {decisionState === "loading" && (
                  <>
                    <span className="spinner" />
                    Submitting decision to the server…
                  </>
                )}
                {decisionState === "success" && (
                  <>
                    <Icon name="check" size={16} />
                    {decisionMessage}
                  </>
                )}
                {decisionState === "error" && (
                  <>{decisionMessage}</>
                )}
              </div>
            </div>
            <div className="decision-footer">
              <button
                type="button"
                className="button secondary"
                onClick={cancelDecision}
                disabled={decisionState === "loading"}
              >
                Cancel
              </button>
              <button
                className={`button ${decision === "approved" ? "approve" : "deny"}`}
                disabled={decisionState === "loading" || lockedIds.includes(selected.id)}
              >
                {decisionState === "loading"
                  ? "Confirming…"
                  : `Confirm ${decision === "approved" ? "approval" : "denial"}`}
              </button>
            </div>
          </form>
        )}
      </dialog>

      <dialog
        ref={generatorDialog}
        className="dialog generator-dialog"
        aria-labelledby="generator-dialog-title"
        onClick={(event) => {
          if (event.target === event.currentTarget && !inFlightGeneration.current) {
            generatorDialog.current?.close();
          }
        }}
        onCancel={(event) => {
          if (inFlightGeneration.current) event.preventDefault();
        }}
        onClose={() => {
          setGenerationState("idle");
          setReceipt(null);
        }}
      >
        <div className="dialog-header">
          <div className="dialog-title">
            <div className="tool-icon large purple">
              <Icon name="spark" />
            </div>
            <div>
              <span className="tool-name">Action gateway</span>
              <h2 id="generator-dialog-title">Generate incoming action</h2>
            </div>
          </div>
          <button
            className="icon-button"
            onClick={() => generatorDialog.current?.close()}
            aria-label="Close generator"
            disabled={generating}
          >
            <Icon name="x" />
          </button>
        </div>
        <div className="generator-body">
          <p className="generator-intro">
            Send a bounded mock proposal through the same gateway and deterministic policy flow. The
            policy engine—not this interface—determines the outcome.
          </p>
          <div
            className="tabs"
            role="tablist"
            aria-label="Generator mode"
            onKeyDown={(event) => {
              if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
              event.preventDefault();
              const next = generatorTab === "demo" ? "manual" : "demo";
              setGeneratorTab(next);
              setJsonError("");
              setReceipt(null);
              setGenerationState("idle");
              document.getElementById(`generator-tab-${next}`)?.focus();
            }}
          >
            <button
              id="generator-tab-demo"
              role="tab"
              aria-selected={generatorTab === "demo"}
              aria-controls="generator-panel-demo"
              tabIndex={generatorTab === "demo" ? 0 : -1}
              disabled={generating}
              onClick={() => {
                setGeneratorTab("demo");
                setJsonError("");
                setReceipt(null);
                setGenerationState("idle");
              }}
            >
              <Icon name="spark" size={16} />
              Automatic demo
            </button>
            <button
              id="generator-tab-manual"
              role="tab"
              aria-selected={generatorTab === "manual"}
              aria-controls="generator-panel-manual"
              tabIndex={generatorTab === "manual" ? 0 : -1}
              disabled={generating}
              onClick={() => {
                setGeneratorTab("manual");
                setJsonError("");
                setReceipt(null);
                setGenerationState("idle");
              }}
            >
              <Icon name="code" size={16} />
              Manual JSON
            </button>
          </div>
          {generatorTab === "demo" ? (
            <div id="generator-panel-demo" role="tabpanel" aria-labelledby="generator-tab-demo" className="scenario-list">
              <div className="generator-label">
                <span>Choose a demo scenario</span>
                <small>One proposal per run</small>
              </div>
              {scenarios.map((item) => (
                <label
                  className={`scenario ${scenario === item.value ? "selected" : ""}`}
                  key={item.value}
                >
                  <input
                    type="radio"
                    name="scenario"
                    value={item.value}
                    checked={scenario === item.value}
                    disabled={generating}
                    onChange={() => {
                      setScenario(item.value);
                      setReceipt(null);
                      setGenerationState("idle");
                    }}
                  />
                  <span className={`scenario-icon ${item.value}`}>
                    <Icon
                      name={
                        item.value === "allowed"
                          ? "check"
                          : item.value === "blocked"
                            ? "x"
                            : "queue"
                      }
                    />
                  </span>
                  <span className="scenario-copy">
                    <strong>{item.label}</strong>
                    <small>{item.description}</small>
                  </span>
                  <span className="expected">{item.expected}</span>
                </label>
              ))}
            </div>
          ) : (
            <div id="generator-panel-manual" role="tabpanel" aria-labelledby="generator-tab-manual" className="manual-editor">
              <div className="generator-label">
                <label htmlFor="json-input">Proposal JSON</label>
                <button onClick={formatJson} disabled={generating}>Format JSON</button>
              </div>
              <div className="editor-wrap">
                <div className="editor-lines" aria-hidden="true">
                  {manualJson.split("\n").map((_, i) => (
                    <span key={i}>{i + 1}</span>
                  ))}
                </div>
                <textarea
                  id="json-input"
                  disabled={generating}
                  spellCheck={false}
                  value={manualJson}
                  onChange={(e) => {
                    setManualJson(e.target.value);
                    setJsonError("");
                    setReceipt(null);
                    setGenerationState("idle");
                  }}
                  aria-invalid={!!jsonError}
                />
              </div>
              <div className="syntax-preview" aria-label="Syntax-highlighted JSON preview">
                <span>Syntax preview</span>
                <pre>
                  <JsonCode
                    value={(() => {
                      try {
                        return JSON.parse(manualJson);
                      } catch {
                        return { error: "Preview unavailable until the JSON is valid." };
                      }
                    })()}
                  />
                </pre>
              </div>
              {jsonError ? (
                <p className="field-error" role="alert">
                  {jsonError}
                </p>
              ) : (
                <p className="field-help">
                  JSON only. Input is validated by the gateway; policy determines the outcome.
                </p>
              )}
            </div>
          )}
          {generatorTab === "demo" && jsonError && <p className="field-error" role="alert">{jsonError}</p>}
          {(generationState !== "idle" || receipt) && (
            <div className="lifecycle" aria-live="polite">
              <div className="lifecycle-track">
                <div className={`life-step ${generationState === "done" ? "complete" : generationState === "receiving" ? "active" : ""}`}>
                  <span>
                    <Icon name="arrow" size={14} />
                  </span>
                  <div>
                    <strong>Gateway request</strong>
                    <small>Submitting the proposal</small>
                  </div>
                </div>
                <i />
                <div
                  className={`life-step ${generationState === "done" ? "complete" : ""}`}
                >
                  <span>
                    <Icon name="shield" size={14} />
                  </span>
                  <div>
                    <strong>Policy evaluated</strong>
                    <small>Deterministic first match</small>
                  </div>
                </div>
                <i />
                <div
                  className={`life-step ${generationState === "done" ? "complete" : generationState === "persisting" ? "active" : ""}`}
                >
                  <span>
                    <Icon name="check" size={14} />
                  </span>
                  <div>
                    <strong>Outcome persisted</strong>
                    <small>Database response is authoritative</small>
                  </div>
                </div>
              </div>
              {receipt && (
                <div className={`generated-receipt ${receipt.status}`}>
                  <Icon
                    name={
                      receipt.status === "blocked"
                        ? "x"
                        : receipt.status === "pending"
                          ? "queue"
                          : "check"
                    }
                  />
                  <div>
                    <strong>{receipt.title}</strong>
                    <p>{receipt.detail}</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        <div className="generator-footer">
          <p>
            <Icon name="shield" size={15} />
            Tools are mocked. No real side effect is performed.
          </p>
          <div>
            <button className="button secondary" disabled={generating} onClick={() => generatorDialog.current?.close()}>
              Close
            </button>
            <button
              className="button primary"
              onClick={generateAction}
              disabled={!["idle", "done", "error"].includes(generationState)}
            >
              {["receiving", "evaluating", "persisting"].includes(generationState)
                ? "Processing…"
                : "Submit to gateway"}
              <Icon name="arrow" size={16} />
            </button>
          </div>
        </div>
      </dialog>

      <dialog
        ref={profileDialog}
        className="dialog profile-dialog"
        aria-labelledby="profile-dialog-title"
        onClick={(event) => {
          if (event.target === event.currentTarget) profileDialog.current?.close();
        }}
        onClose={() => setProfileError("")}
      >
        <form onSubmit={saveProfileSettings}>
          <div className="dialog-header">
            <div className="dialog-title">
              <div
                className="avatar profile-dialog-avatar"
                style={{
                  backgroundColor: profileColorDraft,
                  color: profileTextColor(profileColorDraft),
                }}
              >
                {reviewerDraft.trim().slice(0, 2).toUpperCase() || "—"}
              </div>
              <div>
                <span className="tool-name">Console preferences</span>
                <h2 id="profile-dialog-title">Reviewer profile</h2>
              </div>
            </div>
            <button type="button" className="icon-button" aria-label="Close reviewer profile" onClick={() => profileDialog.current?.close()}>
              <Icon name="x" />
            </button>
          </div>
          <div className="profile-dialog-body">
            <label htmlFor="reviewer-name">Profile name</label>
            <input
              id="reviewer-name"
              value={reviewerDraft}
              onChange={(event) => setReviewerDraft(event.target.value)}
              maxLength={100}
              autoComplete="name"
              required
              autoFocus
            />
            <label htmlFor="reviewer-color">Profile color</label>
            <div className="profile-color-control">
              <input
                id="reviewer-color"
                type="color"
                value={profileColorDraft}
                onChange={(event) => setProfileColorDraft(event.target.value)}
              />
              <span>{profileColorDraft.toUpperCase()}</span>
            </div>
            <div className="theme-coming-soon">
              <span>Dark / light mode</span>
              <button type="button" disabled aria-disabled="true" aria-label="Dark and light mode coming soon">
                <span />
              </button>
              <strong>Coming soon</strong>
            </div>
            {profileError && <p className="field-error" role="alert">{profileError}</p>}
          </div>
          <div className="decision-footer">
            <button type="button" className="button secondary" onClick={() => profileDialog.current?.close()}>
              Cancel
            </button>
            <button type="submit" className="button primary">
              Save profile
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}

function Overview({
  counts,
  activity,
  onNavigate,
  onStatusClick,
}: {
  counts: { pending: number | null; approved: number | null; denied: number | null; auto: number | null; blocked: number | null };
  activity: Activity[];
  onNavigate: (p: Page) => void;
  onStatusClick: (status: Status) => void;
}) {
  return (
    <>
      <section className="page-heading">
        <div>
          <p className="eyebrow">Governance workspace</p>
          <h1>Overview</h1>
          <p>Human review and deterministic policy outcomes, at a glance.</p>
        </div>
        <button className="secondary-button" onClick={() => onNavigate("queue")}>
          Open approval queue <Icon name="arrow" size={16} />
        </button>
      </section>
      <section className="metrics overview-metrics">
        <Metric label="Pending" value={counts.pending} tone="amber" onClick={() => onStatusClick("pending")} />
        <Metric label="Human-approved" value={counts.approved} tone="green" onClick={() => onStatusClick("approved")} />
        <Metric label="Human-denied" value={counts.denied} tone="red" onClick={() => onStatusClick("denied")} />
        <Metric label="Auto-allowed" value={counts.auto} tone="blue" onClick={() => onStatusClick("auto_allowed")} />
        <Metric label="Blocked" value={counts.blocked} tone="slate" onClick={() => onStatusClick("blocked")} />
      </section>
      <div className="overview-grid">
        <section className="overview-hero">
          <div className="hero-grid" />
          <div className="hero-content">
            <span className="hero-kicker">
              <i /> Live governance posture
            </span>
            <h2>Every consequential action has a clear path.</h2>
            <p>
              Policy outcomes stay distinct from human decisions, with database-authoritative status
              and an auditable reason for every review.
            </p>
            <button onClick={() => onNavigate("queue")}>
              Review {counts.pending ?? "—"} pending actions <Icon name="arrow" size={16} />
            </button>
          </div>
        </section>
        <section className="recent-panel">
          <div className="section-heading">
            <div>
              <h2>Recent activity</h2>
              <p>Latest recorded outcomes</p>
            </div>
            <button onClick={() => onNavigate("activity")}>View all</button>
          </div>
          <ActivityList items={activity.slice(0, 5)} />
        </section>
      </div>
    </>
  );
}

function ActivityPage({
  activity,
  filter,
  setFilter,
}: {
  activity: Activity[];
  filter: "all" | Status;
  setFilter: (f: "all" | Status) => void;
}) {
  const filtered = filter === "all" ? activity : activity.filter((item) => item.status === filter);
  const filters: Array<{ key: typeof filter; label: string }> = [
    { key: "all", label: "All activity" },
    { key: "pending", label: "Pending" },
    { key: "approved", label: "Approved" },
    { key: "denied", label: "Denied" },
    { key: "auto_allowed", label: "Auto-allowed" },
    { key: "blocked", label: "Blocked" },
  ];
  return (
    <>
      <section className="page-heading">
        <div>
          <p className="eyebrow">Recorded actions</p>
          <h1>Activity history</h1>
          <p>Human decisions and policy outcomes are recorded separately. Showing up to 100 recent actions by submission time.</p>
        </div>
      </section>
      <div className="filter-tabs" role="group" aria-label="Filter activity">
        {filters.map((item) => (
          <button
            key={item.key}
            aria-pressed={filter === item.key}
            onClick={() => setFilter(item.key)}
          >
            {item.label}
            <span>
              {item.key === "all"
                ? activity.length
                : activity.filter((a) => a.status === item.key).length}
            </span>
          </button>
        ))}
      </div>
      <section className="activity-card">
        <div className="activity-table-head">
          <span>Action</span>
          <span>Outcome</span>
          <span>Decision source</span>
          <span>Time</span>
        </div>
        <ActivityList items={filtered} detailed />
      </section>
    </>
  );
}

function ActivityList({ items, detailed = false }: { items: Activity[]; detailed?: boolean }) {
  return (
    <div className={`activity-list ${detailed ? "detailed" : ""}`}>
      {items.map((item) => (
        <article className="activity-item" key={item.id}>
          <div className={`activity-icon ${item.status}`}>
            <Icon
              name={item.status === "pending" ? "queue" : item.status === "approved" || item.status === "auto_allowed" ? "check" : "x"}
              size={15}
            />
          </div>
          <div className="activity-title">
            <strong>{item.title}</strong>
            <span>{item.detail}</span>
          </div>
          <div className="activity-outcome">
            <Badge status={item.status} />
          </div>
          <div className="activity-actor">
            <strong>
              {item.status === "pending"
                ? "Awaiting human decision"
                : item.status === "approved" || item.status === "denied"
                  ? "Human decision"
                  : "Policy outcome"}
            </strong>
            <span>{item.actor}</span>
          </div>
          <time>{item.time}</time>
        </article>
      ))}
    </div>
  );
}

function AuditPage({ entries }: { entries: Snapshot["audit"] }) {
  return (
    <>
      <section className="page-heading">
        <div>
          <p className="eyebrow">Immutable record</p>
          <h1>Audit log</h1>
          <p>Latest 100 recorded hash-chained events.</p>
        </div>
        <span className="integrity-pill">
          <Icon name="shield" size={15} />
          Chain not verified in this view
        </span>
      </section>
      <section className="audit-card">
        <div className="audit-head">
          <span>Sequence</span>
          <span>Event</span>
          <span>Principal</span>
          <span>Record hash</span>
          <span>Timestamp</span>
        </div>
        {entries.map((item) => (
          <div className="audit-row" key={item.id}>
            <code>#{item.sequence}</code>
            <div>
              <strong>{item.event}</strong>
            </div>
            <span>{item.principal}</span>
            <code title={item.hash}>{item.hash.slice(0, 8)}…{item.hash.slice(-4)}</code>
            <time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString()}</time>
          </div>
        ))}
      </section>
    </>
  );
}
