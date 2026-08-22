# OpenCode Architecture

This directory configures OpenCode for Seki-Sabaki. It is documentation for
maintainers and ChatGPT project chats, not a permanently loaded instruction
file.

## Ownership

- `AGENTS.md` owns durable project invariants and sensitive-domain triggers.
- `opencode.json` owns wiring, permissions, and lightweight command wrappers.
- `seki-dev` owns implementation orchestration; `seki-plan` owns read-only
  planning.
- Specialist agents own focused domain analysis and review.
- Skills provide detailed procedures and domain knowledge only when loaded.
- `verification-matrix` owns detailed risk-to-check policy; `test-verifier`
  applies it, runs checks, and reports results.
- `code-reviewer` performs strict review.
- `git-committer` alone owns authorized staging and commit creation.
- Permissions enforce command and file safety boundaries, including the explicit
  `git push*` deny required for every agent.

Agent specialization is intentionally model-independent. Agent definitions
should not normally specify a model; model selection stays external so changing
models does not require editing agents.

## ChatGPT to OpenCode Prompt Contract

A normal implementation prompt should focus on the task.

### Include

- Specific objective
- Explicit scope
- Task-specific behavior or invariants when relevant
- Acceptance criteria
- Product or design decisions already made

### Do not normally repeat

- Repository inspection, general Seki preservation, or user-change protection
- Git staging, commit routing, or no-push policy
- Generic testing, review, specialist-selection, formatting, or build workflows

### Repeat only for task-specific exceptions

- Do not create a commit for this task
- A specific test is mandatory
- Existing behavior is intentionally changing
- Unusually broad scope is explicitly allowed
- A release-specific constraint applies

Example:

> Extract X from Y while preserving Z.  
> Scope: A and B.  
> Acceptance: C.
