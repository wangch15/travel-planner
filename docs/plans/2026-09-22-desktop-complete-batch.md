# Desktop complete feature batch

User requests the remaining approved features be completed as one continuous task, not stopping after each milestone. Existing version management and real Codex continuity remain the foundation.

## Deliverables

1. Private selected-trip backup: review exact files/repo/branch, fresh PRIVATE check, scoped commit/push and remote receipt verification. No unrelated staged files, forced push, skipped hooks, or imported code execution. Managed Workers publish and explicit existing-site adoption, immutable preview/source/account checks.
2. Persistent new planning trips with optional dates and private brief; no invented coordinates/facts. Planning chat can refine and produce a schema-validated candidate, human plan/research/preview gates before materialization/publish.
3. Text/image references and safe public-URL sources; opaque per-trip attachments, limits, no credential leakage or local-network fetch. Source-backed research with citations, checked dates and explicit unresolved facts; route feasibility review before accepting route-changing proposals.
4. Multi-day AI candidates, per-model effort, Markdown presentation, elapsed/status and saved/unsaved feedback. Existing selective diffs/version history preserved.
5. Durable jobs: quota waiting with explicit opt-in and ordinaryUsageAllowed from same account, bounded polling/backoff; paused/unknown reconciliation, no blind resubmission. Explicit context handoff with visible summary, old history retained. No hidden background daemon.
6. Environment/setup diagnostics and official links; actual macOS app distribution plus Windows build recipe/artifact where possible; version/update check against official repository, no unsigned automatic replacement or unapproved releases.
7. Integrate all services into one UI and IPC boundary; run fake-project native end-to-end and focused security/compatibility tests. Confirm originals untouched. Clearly isolate required human credentials/signing/Windows hardware validation from implemented code.

## Work ownership

- desktop_backup_publish: services/backup.cjs, publishing.cjs, tests; parent wires main/UI.
- desktop_newtrip_attachments: services/new-trip.cjs, attachments.cjs, tests; parent wires main/UI.
- Parent: Codex/research/jobs, renderer/main integration, packaging/environment, docs and overall verification.

Subtasks use isolated files per parallel-agent skill. Review independently after integration. No actual remote mutations, real trip writes, signing or account authorization performed by tests. User approval of features is not approval to publish a real website or push private data now.

## Implemented and verified (2026-09-22)

All seven deliverable groups are wired into the native application. Additional approved polish includes per-trip named/archived conversations, conversation-ID-bound drafts, complete private archive import to a new trip, official tool login, private GitHub download/create with explicit confirmation, repo-local GitHub noreply identity confirmation, and native signed-update check/download/install controls.

Verification: root501 + engine92 + desktop164 =757 tests passed. Native UI/startup/preview/workflow/versions/batch/batch-safety/updater passed with temporary projects and fake external mutation services. Packaged macOS app smoke passed. Real synthetic research used actual hosted web search, fetched official source and matched a short excerpt; real image attachment and multi-day candidates validated without writing their source. Existing real trip repository remains clean.

The native batch found and fixed an old-preview/workspace-selection race. Other regression gates cover preflight stop, stop during host source fetch, target/context-bound research, quota opt-out claim races, conversation draft isolation, remote-operation close barriers and update failure recovery.

External gates remain explicit: human OAuth, per-action private backup/public website approval, owner signing/notarization credentials and release publication, and native Windows testing. The shipped local macOS artifact is unsigned; no real project push/deploy, remote repo creation, release upload or auto-update installation was performed by validation. Background quota waiting requires the App to stay open. Day versions are local data.js history, not photo/docs/config or remote website rollback; full trip archives are unencrypted and exclude App chats/account profiles/version storage.
