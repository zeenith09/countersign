"use client";

import { useState } from "react";
import { AssessmentStatus } from "./queue-display";

type QueueAction = {
  id: string;
  tool: string;
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
        </li>
      ))}
    </ul>
  );
}
