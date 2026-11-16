"use client";

import type { ReactNode } from "react";
import type { ConsolePage } from "../view-model";
import type { ConsoleStatus } from "../contract";

export const statusLabel: Record<ConsoleStatus, string> = {
  pending: "Pending review",
  approved: "Human-approved",
  denied: "Human-denied",
  auto_allowed: "Auto-allowed",
  blocked: "Blocked",
};

export function profileTextColor(hexColor: string): string {
  const channels = hexColor.slice(1).match(/.{2}/g)?.map((channel) => Number.parseInt(channel, 16) / 255) ?? [];
  const [red, green, blue] = channels.map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );
  const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  const whiteContrast = 1.05 / (luminance + 0.05);
  const darkContrast = (luminance + 0.05) / 0.07;
  return whiteContrast >= darkContrast ? "#ffffff" : "#201e4f";
}

export function Icon({ name, size = 18 }: { name: string; size?: number }) {
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
    arrow: <path d="M5 12h14M14 7l5 5-5 5" />,
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

export function Badge({ status }: { status: ConsoleStatus }) {
  return (
    <span className={`badge badge-${status}`}>
      <span className="badge-dot" />
      {statusLabel[status]}
    </span>
  );
}

export function JsonCode({ value }: { value: unknown }) {
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

export function Metric({
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

export function NavItem({
  page,
  current,
  label,
  icon,
  count,
  onClick,
}: {
  page: ConsolePage;
  current: ConsolePage;
  label: string;
  icon: string;
  count?: number;
  onClick: (page: ConsolePage) => void;
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
