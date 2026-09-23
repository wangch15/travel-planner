# Desktop navigation, onboarding and providers

User explicitly requests all eight changes in one implementation batch. Preserve existing proposal/version/backup/publish gates and the supplied v2 logo. Work in the existing lamprey template worktree; real trip content stays untouched during verification.

## Design

- Sidebar hierarchy is trip → conversations. Trip row has collapse, name and one more trigger; conversation rows have their own more/context menu. Low-frequency actions move into a fixed/top-layer accessible dropdown (keyboard arrows/Home/End/Escape, outside dismissal, focus return). Compact rail keeps settings at the bottom. Sidebar toggle follows the brand.
- Default demo is seeded once in the trip list. Deletion persists; settings offers explicit restore. Formal trip removal is a confirmed, reversible move into ignored local trash, with restart-safe restore and no implicit remote/site deletion.
- Startup renders a checking state and rechecks persisted provider login automatically. Expired login, missing CLI and transient connection errors stay distinct. Startup never opens login or sends a model request.
- Settings follow supplied Orca reference: restrained neutral surfaces, one section heading, horizontal setting rows, concise descriptions, status badges and contextual actions. No wall of maintenance buttons. Keep light/dark and minimum desktop width.
- Tool setup shows concrete prerequisites/steps and command preview; the human starts the fixed installer/terminal flow and handles system/browser approval. Bundled Wrangler directly opens Cloudflare connection; successful installation requires recheck.
- Claude Code and Gemini use real official CLI transports and OAuth setup with explicit credential scope. Provider/model switching stays available in chat, identity/session binding prevents silent cross-provider history reuse. Unsupported features must be labelled/disabled, not simulated. No automatic paid API fallback or unrestricted shell access.

## Work and checks

Parent: UI/navigation, startup diagnosis, IPC integration and provider selection. Parallel bounded service tasks: trip trash; tool support; CLI providers. Test safe-service boundaries with temporary fixtures/fake processes; exercise native menu keyboard/context actions, demo deletion across reopen, login restoration, trip trash undo and provider switching. Verify light/dark/narrow desktop in one batched visual pass, repair concrete findings, then package once stable. No real trip deletion, external publication, account authorization or provider model charge in automated verification.


## Result

Implemented all eight requested areas. Root501 + engine92 + desktop198 (including20 provider transport tests) =791 unit tests passed. Native navigation smoke verifies startup login restore, persisted provider choice, stale response suppression, keyboard/context menus, trip/conversation tree, demo deletion persistence, real temporary trip trash/restore and explicit tool installation confirmation. Existing workflow, batch, versions, batch-safety, UI layout, startup, preview and updater smokes passed. Light/dark/narrow settings and chat screenshots inspected; fixed alignment and condensed project metadata after the first pass.

Provider review gates: Claude supports Pro/Max and rejects detected managed policy; Gemini login ACP initializes without authenticating until user action. No real provider model request, successful OAuth authorization, system installer or real trip mutation was performed. Gemini account switching and both new providers' images/effort/native recovery/automatic quota waiting are explicitly unsupported and surfaced. Read providers/PROTOCOL.md for primary sources and actual probe scope.

Local artifact is 0.2.0 macOS arm64, unsigned and not notarized. Native Windows remains a later user hardware test. No private Git push, website publish, commit or public release was made in this batch. Original private trip repository remains clean.
