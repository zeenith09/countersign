# Run contract: one proposed action

This is a prototype of an approval pattern, not a secure or compliant product.
This contract describes the intended handoff; gaps in the current code are listed below.

## Goal and input

Process one proposed action, keyed by its action ID. The proposal contains an
agent ID, registered tool name, original JSON parameters, and agent reasoning.
For a pending action, the reviewer supplies a name, approve/deny outcome, and
non-empty reason. An approval may also supply validated edited parameters.

## Constraints and limits

- The gateway validates input, rejects unsupported tools, and applies the
  deterministic, first-match policy. An unmatched supported action requires
  approval. Original parameters are retained; edits belong to the decision.
- Only a pending action can be decided. One READ COMMITTED interactive
  transaction conditionally updates it, inserts the decision, and appends the
  audit entry under a transaction-level advisory lock taken last.
- Tools are mocked. Only the winning approval request executes a tool, after
  commit, using edited parameters if present. Denial, conflict, and busy do not
  execute. Auto-allowed proposals execute after their submission commits.
- Reviewer names are self-asserted, not authenticated. There is no queue,
  outbox, or retry workflow: a crash between commit and execution can leave an
  approved action unexecuted.

## Source of truth

The database action row, conditionally updated and read inside the decision
transaction, determines whether the action can be decided and supplies the tool
and original parameters. The console's queue snapshot and the agent's account
are not authoritative. After conflict, busy, timeout, or uncertainty, re-read
the action by ID; after a successful decision response, also re-read by ID and
show the stored status before refreshing the queue. If the decision response
succeeded but the status read fails, say the decision was committed but its
stored status could not be refreshed; do not call the outcome unknown.

## Completion evidence

Report `approved` or `denied` only after commit, and show the status read back
from the database. If that read fails after a successful decision response,
report that commit was confirmed but the stored status remains unverified.
Report `executed` only with the mocked tool's result. Otherwise distinguish
`approved, not yet executed` from `unknown`; approval itself is not evidence
that execution happened.

## Owner

The demo agent proposes; the gateway and policy route the proposal; a human
reviewer chooses approve or deny; the decision endpoint invokes the mocked tool
only for an approved winner. The database stores the authoritative state.

## Five questions, against the current code

| Question | Approve path | Deny path |
| --- | --- | --- |
| **Owner** | The agent proposes; the reviewer requests approval; the endpoint calls the registered mock. | The agent proposes; the reviewer requests denial; no tool is called. |
| **Transition** | Gateway stores a pending proposal and submission audit; console posts its ID; [`decideAction`](../src/lib/actions/decide-action.ts) commits; [decision route](../src/app/api/actions/%5Bid%5D/decision/route.ts) calls the mock. | Same submission and review handoff; after commit the route responds without calling a tool. |
| **State** | `pending` becomes `approved`; one decision and `action_decided` audit entry are inserted atomically. Tool execution has no persisted state. | `pending` becomes `denied`; one decision and `action_decided` audit entry are inserted atomically. |
| **Evidence** | The committed rows evidence approval. The mock returns `{ mocked: true, tool }`, but the route discards it; its log contains the action ID. | The committed rows evidence denial; the route returns the action ID and outcome. |
| **Control** | Zod validates the request; conditional update permits one winner; a conflict, missing action, invalid edit, or busy result stops execution. | The same conditional update and transaction stop duplicate decisions; denial rejects edits and never calls a tool. |

## Current mismatches and limits

1. **Execution evidence is lost:** the decision route ignores the mock's result
   and returns approval only. It cannot demonstrate `executed`, distinguish
   `approved, not yet executed` from completed execution, or recover that
   distinction later from the database.
2. **Post-commit failure is ambiguous:** if the process stops or the mock throws
   after approval commits, no execution result is returned or stored. The
   console can re-read the decision status but cannot verify execution.
3. **Conflict wording overstates attribution:** on any 409 the
   [console](../src/features/legacy-queue/DecisionQueue.tsx) says “Already decided by someone
   else,” even if an earlier request by the same reviewer succeeded, the row is
   in another non-pending state, or the status re-read fails. On failure it also
   says `unknown`, but still asserts someone else decided it.
4. **Uncertainty is not retained per action:** the console stores only one
   decision message/lock. Deciding a different action replaces it, so returning
   to an unresolved stale item can enable its buttons again without a refresh.
   The server's conditional update remains the final guard.
5. **Submission uncertainty lacks recovery by ID:** the gateway generates the
   action ID inside storage and a failed/lost submission response may not expose
   it. The demo agent stops on failure rather than re-reading that action; a
   fresh submission is not an idempotent retry of the original.

The current UI does not offer edited parameters; the endpoint supports them for
approved decisions. The contract does not claim that a log line is durable
execution evidence.
