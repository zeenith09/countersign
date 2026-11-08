"use client";

import { useState } from "react";
import type { Prisma } from "../generated/prisma/client";
import { summarizeAction } from "./action-summary";
import { AssessmentStatus } from "./queue-display";

type QueueAction = {
  id: string;
  tool: string;
  parameters: Prisma.JsonValue;
  summary: string;
  createdAt: string;
  age: string;
};

export function QueueList({ actions }: { actions: QueueAction[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  return (
    <ul className="mt-4 divide-y divide-current border-y">
      {actions.map((action) => (
        <li key={action.id} className="py-4">
          <h3 className="font-semibold">{action.tool}</h3>
          <p className="break-words">{action.summary}</p>
          <p className="mt-1">
            <time dateTime={action.createdAt}>{action.age}</time>
            {" · "}
            <AssessmentStatus status="not_assessed" />
          </p>
          <button
            type="button"
            aria-label={`Select ${action.tool}: ${action.summary}`}
            aria-pressed={selectedId === action.id}
            onClick={() => setSelectedId((selected) => selected === action.id ? null : action.id)}
            className="mt-1 underline focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            {selectedId === action.id ? "Selected" : "Select action"}
          </button>
          {selectedId === action.id && (
            <section aria-labelledby={`detail-${action.id}`} className="mt-4">
              <h4 id={`detail-${action.id}`}>Action details</h4>
              <p className="mt-2 break-words">
                {summarizeAction(action.tool, action.parameters)}
              </p>
              <h5 className="mt-4">Parameters</h5>
              <pre className="whitespace-pre-wrap break-words">
                {JSON.stringify(action.parameters, null, 2)}
              </pre>
              <h5 className="mt-4">Agent reasoning</h5>
              <p className="break-words">{action.summary}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" className="border px-2 focus-visible:outline-2 focus-visible:outline-offset-2">
                  Approve
                </button>
                <button type="button" className="border px-2 focus-visible:outline-2 focus-visible:outline-offset-2">
                  Deny
                </button>
                <button type="button" className="border px-2 focus-visible:outline-2 focus-visible:outline-offset-2">
                  Edit
                </button>
              </div>
            </section>
          )}
        </li>
      ))}
    </ul>
  );
}
