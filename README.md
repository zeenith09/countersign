# ✍️ Countersign

Countersign is a prototype human-in-the-loop approval console for AI agents. When an agent proposes a $5,000 refund, a policy rule sends it to a reviewer. The reviewer sees the proposed amount, the agent’s reasoning, and the matched rule, then approves or denies the request with a reason. All three action tools are mocked.

## ✨ Features

- **Policy routing.** Ordered rules route each proposal to automatic allow, human review, or a block. Unsupported tools and invalid tool parameters are stored as blocked.
- **Review queue.** The queue shows pending actions. Reviewers can inspect the original parameters, follow recognized order or record references, and confirm a decision.
- **Decision history.** The console shows recent activity and audit events. Each audit entry links to the previous entry’s hash.
- **Demo agent.** An optional script proposes refunds, emails, and record deletions through the same gateway used by the console.

## 🛠️ Tech Stack

| Area                   | Tools                                                         |
| ---------------------- | ------------------------------------------------------------- |
| Console and API routes | Next.js App Router, React, TypeScript, Tailwind CSS           |
| Validation and storage | Zod, Prisma, PostgreSQL on Neon                               |
| Audit hashing          | SHA-256 via Node.js crypto                                    |
| Testing and CI         | Vitest, Playwright, axe-core, GitHub Actions, SonarQube Cloud |

## 📁 Project Structure

```text
src/app/          Console pages and HTTP routes
src/components/   Review dialogs, queue, history, and audit views
src/hooks/        Console state and decision requests
src/lib/          Policy, actions, audit chain, mock tools, and console data
prisma/           Schema, migrations, and seed data
scripts/          Demo agent and repository checks
tests/            Unit, database integration, and browser tests
docs/             Decision and execution contract
```

## 🔎 How a Review Works

1. **Submit.** The gateway validates the proposal, checks its tool and parameters, and evaluates the policy. The first matching rule wins. A supported, valid proposal with no match goes to review.
2. **Record.** One transaction stores the original action and its submission audit entry. For example, refunds over $500 enter the queue and record deletions are blocked.
3. **Decide.** The reviewer submits a decision for one action ID. A conditional update succeeds only while that action is pending. The winning transaction writes the decision and appends the audit entry under a PostgreSQL transaction-level advisory lock. A competing reviewer receives a conflict.
4. **Execute.** An approved or auto-allowed action runs its mock after commit. If a decision response is lost, the console reads the stored status before reporting what happened.

## 🔗 Key Components

| Component                                                | What to look for                                                                       |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| [Policy rules](src/lib/policy/policy.json)               | The threshold, email domain, rule order, and outcome for each supported tool           |
| [Submission gateway](src/lib/actions/submit-action.ts)   | Where a proposal is validated and routed                                               |
| [Decision transaction](src/lib/actions/decide-action.ts) | How two reviewers racing on the same action produce one decision                       |
| [Audit chain](src/lib/audit/chain.ts)                    | How entries are appended and how the verifier detects a broken link or changed payload |
| [Run contract](docs/run-contract.md)                     | What the console can report after a commit, conflict, or timeout                       |

## 🧪 Development and Testing

Use Node.js 22 and npm. For local development, configure a development database with a pooled runtime connection and a direct migration connection. Use the variable names in `.env.example`. Start the console with `npm run dev` once dependencies, the Prisma client, and the database schema are in place.

| Command                                  | Coverage                                                                                  |
| ---------------------------------------- | ----------------------------------------------------------------------------------------- |
| `npm run lint`                           | ESLint and import-boundary fixtures                                                       |
| `npm run typecheck`                      | Strict TypeScript checks                                                                  |
| `npm test`                               | Vitest policy, validation, route, and component tests                                     |
| `npm run test:e2e -- --project=chromium` | Browser review flows, stale and lost responses, mobile controls, and accessibility checks |

Real-Postgres integration tests exercise competing decisions, rollback, concurrent audit appends, and tamper detection. Use the dedicated test database configuration for those runs. CI provisions its own PostgreSQL service. See the [test workflow](.github/workflows/test.yml).

## 🚧 Prototype Limits

Use fictional data in a restricted demo environment. Reviewers type their names and the routes have no application authentication. Stored parameters, reasoning, and reviewer reasons can contain sensitive text. There is no PII masking or prompt-injection classifier.

A crash between commit and mock execution can leave an approved action unexecuted. There is no queue, outbox, or retry worker. The audit verifier checks the entries it receives and has no independent checkpoint for detecting a truncated tail. Connection exhaustion, crashed connections holding locks, and full hosted behavior remain unverified.

## 🎯 Future Enhancements

- Complete the 30-action evaluation against owner-approved expected outcomes.
- Explore an optional Python advisory service that is not yet implemented. Any access to action or decision data must be authorized and minimized. Retrieved content would be strictly advisory and must never allow, approve, or block an action; reviewers could still decide through the existing console if the service were unavailable.
