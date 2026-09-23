# Settings hierarchy and editable paused drafts

Implement the user's requested settings reevaluation in the existing worktree. Keep the established monochrome identity, supplied logo and proposal/backup/publish consent boundaries.

- Draft editing is independent from sending readiness. A loaded paused conversation accepts draft input; restart preserves it. Sending remains blocked until the interrupted result is handled. Active mutations and unreadable/loading conversations still protect drafts.
- One project acquisition section offers local folder and GitHub. GitHub download/create is progressive inline setup. The current project owns its expandable trip rows; remove the duplicate selected-trip settings section.
- AI defaults (provider and model) are separate from authentication and active chats. All three providers have independently usable connection rows; status badges follow titles. Connecting another provider does not switch or archive the active chat. New conversations use saved defaults, existing conversations retain provider/model.
- Combine private backup and public publishing into one settings destination with clearly named tabs and unchanged separate confirmation gates. Keep public-link warning specific to publishing.
- Consistent32px controls,8px action gaps, compact horizontal rows, aligned trailing actions. Tools group title left / recheck right, tool version adjacent to name.
- Verify paused drafting+restart preservation, independent provider auth, saved defaults and conversation provider restoration with fake services; inspect light/dark/narrow settings in one batched visual pass. No actual account login, private project mutation or external publication in tests.


## Verification / outcome

The paused input regression reproduced red before the change; workflow now verifies typing after interruption, no automatic send, and preserved text after explicit restart. Provider login/default/old-session restoration tested natively with fake accounts. Project hierarchy, adjacent badges/versions, 32px controls, grouped actions and sync tabs inspected in dark/light/860px captures.201 desktop and92 engine unit tests passed, including independent default persistence and invalid provider-state rejection. Existing batch/navigation/layout/version/safety/updater native gates passed. No model request, actual OAuth, private trip write, push or publish performed by these tests. Local desktop version0.3.0; unsigned macOS artifact, native Windows remains unverified.
