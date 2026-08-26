# 01 — Agent Passport Execution Plan

> **ENTRY POINT:** Start here. This is the product, build, proof, publication, launch, and migration plan. File `02` defines how this plan must be executed and revised.

**Status:** PROPOSED. Writing, stabilization review, a plan-only branch/push, and a draft PR containing only this folder are authorized. Product execution, goal creation, publishing, outreach, merge, and source migration are not yet authorized.

**Required operating reference:** Read [02 — The Nolan Approach](./02-NOLAN-APPROACH.md) before every stage and again whenever new evidence changes the route.

This is the control plan for turning Agent Passport from an interesting prototype into a used, externally proven product. Update it at every evidence boundary. Transfer durable truths to permanent product documentation when proven.

## A. Direction

### Ending we are building toward

An external founder can install the public Agent Passport package, connect a real provider, approve bounded access, let an agent perform a real read-only action, revoke access, and prove that reuse and revocation work. The package is published to npm, the product has credible evidence and at least one reference user, and launch claims say only what the evidence supports.

### Product thesis

Agent Passport is the permission and identity layer between people, agents, and provider accounts. The initial wedge is not a universal identity platform. It is one trustworthy, low-friction delegated-access flow that a real builder prefers to rebuilding OAuth and permissions.

### Boundaries that must hold

- The standalone `/Users/obiihej/dev/agent-passport` repository remains the source of truth until an explicit migration gate is passed.
- Orchestrator first consumes Agent Passport through its public SDK/API. It does not receive private shortcuts, shared database access, or raw provider credentials.
- No inflated claims, fake traction, pretend integrations, or demo state described as durable production behavior.
- No npm publish, public launch, direct outreach, tweet, repository migration, unrelated remote change, or merge without the user's explicit authorization for that action. The current exception is limited to pushing these two plan files and opening their draft PR.
- Security, revocation, auditability, and least privilege are acceptance criteria, not later polish.
- The ending is fixed; implementation details beyond the evidence horizon remain revisable.

## B. Starting Context

### Known Ground

- The landing page is live, but its waitlist endpoint currently returns `404`; the front door cannot be treated as working.
- The SDK compiles and dry-packs, but it is version `0.0.0`, mock-only, unpublished, and lacks adequate tests and release automation.
- The Composio demo contains a real adapter path, while identity and grant state remain in memory. That is demo evidence, not a safe hosted product.
- No external-founder golden-path proof has been established.
- Orchestrator needs Agent Passport eventually, but importing unfinished source now would mix product validation with repository restructuring.
- Broad launch before external proof would create attention without a trustworthy conversion path.

### Assumptions We Are Carrying

| Assumption | Why it is reasonable now | Evidence that could change it |
|---|---|---|
| Founders have painful delegated-auth work worth removing. | The problem is common and Egoist provides category validation. | Interviews show indifference, rare usage, or a different primary pain. |
| One provider and one read-only action are enough for the first proof. | They test the permission lifecycle without multiplying scope. | The committed partner's real workflow requires another narrow provider/action. |
| A public SDK/API boundary should precede source migration. | It forces Orchestrator to experience the same contract as external users. | A concrete technical blocker proves the boundary cannot support the golden path. |
| Orchestrator is a useful reference consumer. | It creates a demanding internal customer and exposes integration friction. | Orchestrator-specific needs distort the public product or delay external proof. |
| A design-partner sprint should precede broad promotion. | Evidence and language from use are more valuable than speculative reach. | A qualified user is already ready to run the complete flow immediately. |

### What We Are Not Planning Yet

- Multi-provider breadth, enterprise administration, marketplaces, MCP expansion, or a universal passport model.
- The final Agent Passport location inside the Orchestrator repository.
- A complete repository-migration procedure.
- A broad Twitter/X calendar, Product Hunt launch, or large founder campaign.
- Exact implementation tickets for stages whose design depends on customer or runtime evidence not yet collected.

## C. The Next Location

The first location is **a trustworthy front door, a frozen v0 proof contract, and one committed external design partner with a concrete workflow**.

We have reached it only when all of the following are observable:

1. A real waitlist submission succeeds end to end and produces inspectable durable evidence.
2. The frozen v0 contract and acceptance test explicitly require: an Access Request; an authenticated user; approval or denial; a client-bound, expiring Access Grant; provider references without raw OAuth-token transfer; one safe real provider read; durable identity, grant, and audit state; revocation; and denied reuse after revocation.
3. Claims across the landing page, README, SDK, and demo match current behavior.
4. One external founder agrees to attempt the flow and supplies the actual provider/action/use case.
5. The root orchestrator records the findings in **Review and Replan** and presents the changed plan to the user.

Reaching this location does not automatically authorize the next stage.

## D. Active Storyboard

Only Move 1 is fully committed in this draft. Later moves preserve the original campaign direction but remain conditional.

| Move | Plan | Evidence / stop condition | What it should reveal |
|---|---|---|---|
| **1 — Reach the first location** | Repair the front door; freeze the smallest v0 contract; audit claims; identify and speak with a tightly selected founder set; secure one real design partner. | The five observable conditions in **The Next Location** are met. | The real workflow, language, friction, and exact golden-path boundary. |
| **2 — Build the partner-shaped golden path** `[Depends on Move 1]` | Implement durable identity/grant/audit state and one provider's read-only lifecycle; add revocation and contract tests. Keep the public boundary provider-neutral where evidence supports it. | The partner completes the flow; revoke blocks reuse; records survive process restart; no raw provider credential crosses into Orchestrator. | Whether the product removes meaningful integration work and where trust breaks. |
| **3 — Prove the public contract** `[Depends on Move 2]` | Make Orchestrator a reference consumer through the same public SDK/API; have a clean external environment install the packed package and repeat the flow. | Internal and external consumers pass the same acceptance flow without private shortcuts. | Whether the SDK/API is genuinely portable and ready to publish. |
| **4 — Publish and launch from evidence** `[Depends on Move 3]` | Prepare release automation, publish the npm package with explicit approval, produce a reproducible quickstart, and promote using verified outcomes and partner language. | Clean install works from the registry; docs reproduce the flow; every public claim maps to evidence. | Whether distribution converts attention into qualified usage. |
| **5 — Decide the Orchestrator source move** `[Deferred]` | Compare keeping the standalone repository against moving it to a top-level `orchestrator/agent-passport/` boundary. Migrate only if ownership, release, and product proof justify it. | Explicit architecture decision and user authorization. | The lowest-friction long-term ownership model. |

### Granular campaign baseline

This is the fuller execution plan produced by the startup-team review. Nolan changes when its details become active, not whether these fronts exist. Move 1 currently activates Phases 0 and 1. Later phases are directional until the preceding location supplies their missing evidence.

#### Phase 0 — Repair the front door and lock v0 `[Active when authorized]`

1. Fix and verify the waitlist route.
2. Define the exact v0 contract:
   - Access Request
   - authenticated user
   - approve or deny
   - client-bound Access Grant
   - expiration
   - revocation
   - provider references only—never raw OAuth tokens
3. Audit every public claim against working evidence.
4. Keep the standalone repository authoritative during proof.

**Exit gate:** Acquisition works, the contract is unambiguous, and nothing public claims nonexistent functionality.

#### Phase 1 — Recruit one design partner `[Parallel with Phase 0 when authorized]`

1. Identify 15 technical founders at small AI startups with repeated Gmail, Calendar, Slack, Notion, or GitHub onboarding.
2. Draft personal founder-to-founder messages.
3. With explicit outreach approval, seek five substantive replies.
4. Observe three existing onboarding flows.
5. Secure one written design-partner commitment around one real workflow.

No broad launch. No fake “available now” language.

Primary offer:

> I’ll wire Agent Passport into one real workflow with you and measure whether it removes onboarding steps.

**Exit gate:** One external startup and one actual customer workflow are selected.

#### Phase 2 — Build the golden path `[Depends on Phases 0–1]`

Build only this:

```text
External app
    → creates Access Request
    → user signs in
    → connects the evidence-selected provider
    → approves or denies access
    → app receives a client-bound, expiring Access Grant when approved
    → performs one safe real read action
    → user revokes
    → further access fails
```

The provider and action come from the committed design partner's workflow. Gmail through Composio is the current candidate, not a locked implementation choice.

Required work:

- Durable user, client, request, grant, profile, and audit storage.
- Hosted approval and denial UI.
- Expiry and revocation enforcement.
- SDK converted from mock data to the hosted API.
- Tests for state transitions and security boundaries.
- One clean-install example.
- Instrumentation for start, approval, abandonment, failure, revoke, and reuse.

**Exit gate:** The flow passes internally from a clean environment with recorded proof.

#### Phase 3 — Use Orchestrator as the reference consumer `[Depends on Phase 2]`

Orchestrator integrates through the same public SDK/API offered to outside developers.

Rules:

- No direct Passport database access.
- No raw credential transfer.
- Passport proves identity and permission.
- Orchestrator still enforces tenancy and action authorization.
- Current boundary hypothesis: provider connections and credential custody remain Orchestrator responsibilities. Confirm or revise this at the Phase 3 evidence boundary before implementation.

**Exit gate:** Orchestrator completes the public flow without privileged internal shortcuts.

#### Phase 4 — External proof and npm publication `[Depends on Phases 2–3]`

1. Give the design partner a packed prerelease for the first private integration.
2. Put their real user through the golden path.
3. Prove revocation.
4. Prove a returning user avoids at least one repeated setup step.
5. Finish package metadata, exports, build-before-publish, tests, CI, provenance, and npm ownership.
6. With explicit publication approval, publish `@agent-passport/sdk`.
7. Verify installation in a blank project and complete the quickstart.

**Exit gate:** Exact npm URL, clean install, external developer, external user, successful provider action, successful revocation, and measured reuse.

#### Phase 5 — Launch from evidence `[Depends on Phase 4]`

Sequence:

1. Founder build note and design-partner invitation.
2. Honest request → approval → revoke demo.
3. External case study with actual timings.
4. npm and quickstart announcement.
5. Technical Twitter/X thread.
6. Broader “bring your approved access with you” launch.
7. Show HN only after strangers can reproduce it.

**Exit gate:** Launch material is approved, reproducible, and tied to verified usage. Success means adoption and reuse—not impressions, stars, or waitlist count.

#### Phase 6 — Decide and execute the Orchestrator source move `[Deferred; separate approval]`

Do this after product proof, not before it.

Recommended boundary to test:

```text
orchestrator/
├── agent-passport/   # independent product workspace
├── backend/
├── web/
└── marketing/
```

Migration requirements:

- Preserve Git history.
- Preserve npm ownership and release automation.
- Preserve deployment and secrets boundaries.
- Add routing, CI, Makefile, and ownership rules.
- Archive the standalone repository only after verified cutover.
- Keep one source of truth.
- Do not scatter Passport across existing `web/` and `backend/`.
- Do not make Passport merely “Orchestrator login.”

**Exit gate:** The user approves the architecture decision; cutover is verified; history, releases, deployments, and ownership remain intact.

### Move 1 campaign shape

The two lanes may run in parallel, but neither may expand beyond the first location:

- **Product-truth lane:** fix waitlist, write the v0 lifecycle acceptance test, label mock/demo behavior, and produce a claim-to-evidence ledger.
- **Design-partner lane:** form a focused list of roughly 15 relevant founders, seek five substantive replies and three walkthroughs, and stop when one qualified partner commits. These are search targets, not invented traction.

The root decides whether evidence from one lane changes the other. If it does, this plan is updated before more work is launched.

## E. Agent Operating Contract

The root agent is the staff-level orchestrator and single reporting surface to the user.

### Briefing rule

Every delegated task must have:

- one narrow question or deliverable;
- explicit file or system ownership;
- evidence required;
- a stop condition;
- prohibited actions;
- a short result format: **found, changed, proved, unresolved, recommended next move**.

Agents do not receive an entire stage when a smaller brief will do. Recursive delegation is prohibited unless the root explicitly scopes it and can observe it.

### Visibility rule

- No invisible or unattended background work.
- The root monitors active agents, reads their actual output, rejects weak or off-goal work, and independently checks material claims.
- Agent output is input, not truth. It enters the plan only after the root's smell test and evidence check.
- The root tells the user what each agent found, changed, failed to prove, and how it affected the route.
- No stage is described as done while an agent or long-running process for that stage is still active.

### Model rule

- Preferred bounded worker model: Sonnet, when that model is actually available in the active agent environment.
- If Sonnet is unavailable, the root discloses the substitute before launching workers; it does not silently imply Sonnet was used.
- The user may choose Ultra Code for the root orchestration role. Model strength does not replace scope, evidence, or review gates.

### Suggested roles, activated only when needed

- **Root / external hire:** owns outcome, sequencing, plan updates, user reporting, and acceptance.
- **Product/API worker:** owns one bounded server or lifecycle slice.
- **SDK/release worker:** owns package contract, tests, packing, and release readiness; cannot publish.
- **Orchestrator integration worker:** owns the reference consumer; cannot create private coupling.
- **Founder/GTM worker:** owns one bounded research, outreach-draft, or evidence-synthesis brief; cannot contact or post without approval.

## F. Stage Loop

For every stage:

1. Read [02 — The Nolan Approach](./02-NOLAN-APPROACH.md) and this plan.
2. Recheck the live facts the stage depends on.
3. State the next location, active assumptions, prohibited actions, and agent briefs.
4. Execute only the bounded move authorized by the user or an approved goal section.
5. Verify outputs directly; stop runaway, circular, or low-value work.
6. Update **Review and Replan** with findings and changed assumptions.
7. Report the evidence, rejected work, remaining uncertainty, and proposed next move to the user.
8. Do not cross a public-action, structural-migration, spending, credential, or irreversible gate without explicit approval.

## G. Goal Binding

No Codex goal has been created.

If the user approves this plan for chasing, bind execution to Nolan locations rather than pretending the entire route is known. Each goal section must name its observable location, stop there, update this file, and propagate the evidence to the user before proceeding. Do not mark a section complete because tasks were performed; mark it complete only when its location is proven.

## H. Review and Replan

Update this section immediately after reaching a location or encountering evidence that changes the route.

| Date / move | What reality showed | Evidence | What changes | Proposed next move |
|---|---|---|---|---|
| 2026-08-26 / plan creation | Current product truth supports a narrow proof-first route; later implementation and migration details exceed the evidence horizon. | Live repository and product inspection summarized in **Known Ground**. | Preserve the six-part campaign, fully scope only Move 1, and defer detailed downstream planning. | User reviews this plan; no execution begins without approval. |
| 2026-08-26 / stabilization review | The plan had stale authorization language, a scattered first proof contract, an over-fixed provider choice, and one unsettled ownership statement framed as fact. | Independent editor verdict: `REVISE`. | Record the plan-only draft-PR authority; centralize the proof contract; make provider/action evidence-selected; label credential ownership as a hypothesis. | Independent editor re-reviews the same artifact before PR creation. |

### Current decision gate

The user decides whether this plan is satisfactory and whether to authorize a traced goal or the first bounded section. Until then, the next move is review only.
