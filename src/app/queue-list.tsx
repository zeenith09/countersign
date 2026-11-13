"use client";

import { useState } from "react";
import type { Prisma } from "../generated/prisma/client";
import { AssessmentStatus } from "./queue-display";

export type QueueAction = {
	id: string;
	tool: string;
	parameters: Prisma.JsonValue;
	summary: string;
	agentReasoning: string;
	createdAt: string;
	age: string;
	policyRuleMatched: string | null;
};

export type DecisionOutcome = "approved" | "denied";

export type DecisionState = {
	actionId: string;
	message: string;
	refreshAvailable?: boolean;
	locked: boolean;
} | null;

export function ActionDetails({ action, onDecide, decisionState, submitting, onRefresh }: {
	action: QueueAction;
	onDecide: (id: string, outcome: DecisionOutcome) => void;
	decisionState: DecisionState;
	submitting: boolean;
	onRefresh: () => void;
}) {
	const state = decisionState?.actionId === action.id ? decisionState : null;
	return (
		<section aria-labelledby={`detail-${action.id}`} className="mt-4">
			<h4 id={`detail-${action.id}`}>Action details</h4>
			<p className="mt-2 wrap-break-words">{action.summary}</p>
			<h5 className="mt-4">Parameters</h5>
			<pre className="whitespace-pre-wrap wrap-break-words">
				{JSON.stringify(action.parameters, null, 2)}
			</pre>
			<div className="mt-4 flex flex-wrap gap-2">
				<button
					type="button"
					disabled={submitting || !!state?.locked}
					onClick={() => onDecide(action.id, "approved")}
					className="border px-2 focus-visible:outline-2 focus-visible:outline-offset-2"
				>
					Approve
				</button>
				<button
					type="button"
					disabled={submitting || !!state?.locked}
					onClick={() => onDecide(action.id, "denied")}
					className="border px-2 focus-visible:outline-2 focus-visible:outline-offset-2"
				>
					Deny
				</button>
				<button
					type="button"
					disabled
					title="Edit-then-approve is not available yet."
					className="border px-2 focus-visible:outline-2 focus-visible:outline-offset-2"
				>
					Edit
				</button>
			</div>
			{state && (
				<div role="status" className="mt-2">
					<p>{state.message}</p>
					{state.refreshAvailable && (
						<button type="button" onClick={onRefresh} className="underline focus-visible:outline-2 focus-visible:outline-offset-2">
							Refresh queue
						</button>
					)}
				</div>
			)}
		</section>
	);
}

export function QueueList({ actions, onDecide, decisionState, submitting, onRefresh }: {
	actions: QueueAction[];
	onDecide: (id: string, outcome: DecisionOutcome) => void;
	decisionState: DecisionState;
	submitting: boolean;
	onRefresh: () => void;
}) {
	const [selectedId, setSelectedId] = useState<string | null>(null);
	return (
		<ul className="mt-4 divide-y divide-current border-y">
			{actions.map((action) => (
				<li key={action.id} className="py-4">
					<h3 className="font-semibold">{action.tool}</h3>
					<p className="wrap-break-words">{action.summary}</p>
					<p className="mt-1 wrap-break-words">
						<span className="font-medium">Agent reasoning: </span>
						{action.agentReasoning}
					</p>
					<p className="mt-1">
						<time dateTime={action.createdAt}>{action.age}</time>
						{" · "}
						Pending approval
						{" · "}
						<AssessmentStatus status="not_assessed" />
					</p>
					<p>Matched rule: {action.policyRuleMatched ?? "Not recorded"}</p>
					<button
						type="button"
						disabled={submitting}
						aria-label={`Select ${action.tool}: ${action.agentReasoning}`}
						aria-pressed={selectedId === action.id}
						onClick={() =>
							setSelectedId((selected) =>
								selected === action.id ? null : action.id,
							)
						}
						className="mt-1 underline focus-visible:outline-2 focus-visible:outline-offset-2"
					>
						{selectedId === action.id ? "Selected" : "Select action"}
					</button>
					{selectedId === action.id && <ActionDetails action={action} onDecide={onDecide} decisionState={decisionState} submitting={submitting} onRefresh={onRefresh} />}
				</li>
			))}
		</ul>
	);
}
