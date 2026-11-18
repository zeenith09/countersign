"use client";

import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { postActionProposal } from "../../lib/console/api-client";
import type { ConsoleStatus } from "../../lib/console/contract";
import { Icon, JsonCode } from "../ui/ConsoleElements";

const scenarios = [
	{
		value: "pending",
		label: "High-value refund",
		expected: "Review scenario",
		description: "A refund proposal for policy evaluation.",
		payload: {
			agentId: "demo-agent",
			tool: "issue_refund",
			parameters: { orderId: "ORDER-1005", amount: 750, currency: "USD" },
			agentReasoning: "Customer requested a refund.",
		},
	},
	{
		value: "allowed",
		label: "Internal email",
		expected: "Internal email scenario",
		description: "A message to the fictional internal domain.",
		payload: {
			agentId: "demo-agent",
			tool: "send_email",
			parameters: {
				to: "support@countersign.example",
				subject: "Order review requested",
				body: "Please review the order.",
			},
			agentReasoning: "Request an internal review.",
		},
	},
	{
		value: "blocked",
		label: "Delete record",
		expected: "Deletion scenario",
		description: "A record deletion proposal for policy evaluation.",
		payload: {
			agentId: "demo-agent",
			tool: "delete_record",
			parameters: { recordId: "RECORD-1006" },
			agentReasoning: "Remove a duplicate record.",
		},
	},
];

type GenerationState =
	| "idle"
	| "receiving"
	| "evaluating"
	| "persisting"
	| "done"
	| "error";
type Receipt = {
	status: Extract<ConsoleStatus, "pending" | "auto_allowed" | "blocked">;
	title: string;
	detail: string;
};

export function GeneratorDialog({
	open,
	onOpenChange,
	onSubmitted,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSubmitted: () => Promise<void>;
}) {
	const dialog = useRef<HTMLDialogElement>(null);
	const inFlight = useRef(false);
	const [generatorTab, setGeneratorTab] = useState<"demo" | "manual">("demo");
	const [scenario, setScenario] = useState("pending");
	const [manualJson, setManualJson] = useState(
		JSON.stringify(scenarios[0].payload, null, 2),
	);
	const [jsonError, setJsonError] = useState("");
	const [generationState, setGenerationState] =
		useState<GenerationState>("idle");
	const [receipt, setReceipt] = useState<Receipt | null>(null);
	const selectedScenario =
		scenarios.find((item) => item.value === scenario) ?? scenarios[0];
	const generating = ["receiving", "evaluating", "persisting"].includes(
		generationState,
	);

	useEffect(() => {
		if (open && !dialog.current?.open) dialog.current?.showModal();
		if (!open && dialog.current?.open) dialog.current.close();
	}, [open]);

	function handleClose() {
		setGenerationState("idle");
		setReceipt(null);
		onOpenChange(false);
	}

	function formatJson() {
		try {
			setManualJson(JSON.stringify(JSON.parse(manualJson), null, 2));
			setJsonError("");
		} catch (error) {
			setJsonError(error instanceof Error ? error.message : "Invalid JSON");
		}
	}

	async function generateAction() {
		if (inFlight.current) return;
		let payload: unknown;
		try {
			payload =
				generatorTab === "manual"
					? JSON.parse(manualJson)
					: selectedScenario.payload;
			if (!payload || Array.isArray(payload) || typeof payload !== "object") {
				throw new Error("The proposal must be a JSON object.");
			}
		} catch (error) {
			setJsonError(error instanceof Error ? error.message : "Invalid JSON");
			setGenerationState("error");
			return;
		}
		setJsonError("");
		setReceipt(null);
		setGenerationState("receiving");
		inFlight.current = true;
		try {
			const response = await postActionProposal(payload);
			const body: unknown = await response.json();
			const result = z
				.object({
					actionId: z.string(),
					status: z.enum(["pending", "auto_allowed", "blocked"]),
					outcome: z.enum(["needs_approval", "allow", "block"]),
					ruleId: z.string(),
				})
				.safeParse(body);
			if (
				result.success &&
				((response.status === 201 &&
					result.data.status === "pending" &&
					result.data.outcome === "needs_approval") ||
					(response.status === 201 &&
						result.data.status === "auto_allowed" &&
						result.data.outcome === "allow") ||
					(response.status === 403 &&
						result.data.status === "blocked" &&
						result.data.outcome === "block"))
			) {
				const status = result.data.status;
				setReceipt({
					status,
					title:
						status === "pending"
							? "Awaiting human review"
							: status === "auto_allowed"
								? "Policy auto-allowed this action"
								: "Gateway blocked this action",
					detail: `Action ${result.data.actionId}; matched rule: ${result.data.ruleId}.`,
				});
				setGenerationState("done");
				await onSubmitted();
			} else {
				setGenerationState("error");
				const message = z.object({ message: z.string() }).safeParse(body);
				setJsonError(
					response.status >= 500 || response.ok || response.status === 403
						? "Submission could not be confirmed; it may have been stored. Check activity and the queue before submitting again."
						: message.success
							? message.data.message
							: `Submission rejected (HTTP ${response.status}).`,
				);
			}
		} catch {
			setGenerationState("error");
			setJsonError(
				"Network error: submission status is unknown and it may have been stored. Check activity and the queue before submitting again.",
			);
		} finally {
			inFlight.current = false;
		}
	}

	return (
		<dialog
			ref={dialog}
			className="dialog generator-dialog"
			aria-labelledby="generator-dialog-title"
			onClick={(event) => {
				if (event.target === event.currentTarget && !inFlight.current)
					dialog.current?.close();
			}}
			onCancel={(event) => {
				if (inFlight.current) event.preventDefault();
			}}
			onClose={handleClose}
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
					onClick={() => dialog.current?.close()}
					aria-label="Close generator"
					disabled={generating}
				>
					<Icon name="x" />
				</button>
			</div>
			<div className="generator-body">
				<p className="generator-intro">
					Send a bounded mock proposal through the same gateway and
					deterministic policy flow. The policy engine—not this
					interface—determines the outcome.
				</p>
				<div
					className="tabs"
					role="tablist"
					tabIndex={-1}
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
					<div
						id="generator-panel-demo"
						role="tabpanel"
						aria-labelledby="generator-tab-demo"
						className="scenario-list"
					>
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
					<div
						id="generator-panel-manual"
						role="tabpanel"
						aria-labelledby="generator-tab-manual"
						className="manual-editor"
					>
						<div className="generator-label">
							<label htmlFor="json-input">Proposal JSON</label>
							<button onClick={formatJson} disabled={generating}>
								Format JSON
							</button>
						</div>
						<div className="editor-wrap">
							<div className="editor-lines" aria-hidden="true">
								{manualJson.split("\n").map((_, index) => (
									<span key={index}>{index + 1}</span>
								))}
							</div>
							<textarea
								id="json-input"
								disabled={generating}
								spellCheck={false}
								value={manualJson}
								onChange={(event) => {
									setManualJson(event.target.value);
									setJsonError("");
									setReceipt(null);
									setGenerationState("idle");
								}}
								aria-invalid={!!jsonError}
							/>
						</div>
						<div
							className="syntax-preview"
							aria-label="Syntax-highlighted JSON preview"
						>
							<span>Syntax preview</span>
							<pre
								role="region"
								aria-label="Scrollable syntax preview"
								tabIndex={0}
							>
								<JsonCode
									value={(() => {
										try {
											return JSON.parse(manualJson);
										} catch {
											return {
												error: "Preview unavailable until the JSON is valid.",
											};
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
								JSON only. Input is validated by the gateway; policy determines
								the outcome.
							</p>
						)}
					</div>
				)}
				{generatorTab === "demo" && jsonError && (
					<p className="field-error" role="alert">
						{jsonError}
					</p>
				)}
				{(generationState !== "idle" || receipt) && (
					<div className="lifecycle" aria-live="polite">
						<div className="lifecycle-track">
							<div
								className={`life-step ${generationState === "done" ? "complete" : generationState === "receiving" ? "active" : ""}`}
							>
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
					<button
						className="button secondary"
						disabled={generating}
						onClick={() => dialog.current?.close()}
					>
						Close
					</button>
					<button
						className="button primary"
						onClick={() => void generateAction()}
						disabled={!["idle", "done", "error"].includes(generationState)}
					>
						{generating ? "Processing…" : "Submit to gateway"}
						<Icon name="arrow" size={16} />
					</button>
				</div>
			</div>
		</dialog>
	);
}
