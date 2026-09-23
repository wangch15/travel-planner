# Claude Code / Gemini CLI providers

Verified 2026-09-23. The current Gemini CLI adapter is legacy pending the `agy` migration and proof of App-only keyring isolation; see `docs/plans/2026-09-23-desktop-native-cli-profiles.md`. This directory is the provider boundary; project files and
credentials from other applications are never inputs to it.

## Host contract

`createProvider(id, absoluteStateDirectory, options)` returns
`{account, editor, capabilities}`. IDs are `claude` and `gemini`.
`resolveCommand(id)` may return `{command,args,env}` for a managed executable;
only its PATH is reused. All subprocesses have `shell:false`.

Accounts emit `changed` with `provider`, `state`, and a normalized email label.
`connect/refresh/models` do not start model requests. Gemini's connected state
means that the App profile has cached OAuth and account metadata; it does not
claim that the server has validated an unexpired session or remaining quota.
`login()` returns `browserOpened:true` and `waiting-login`; the official CLI owns
the browser and OAuth callback. No token copying, API-key fallback, or parsing of
credential values is implemented. Claude supports isolated logout/switch;
Gemini advertises `switchAccount:false` until an isolated official logout flow
is implemented.

`editor.generate` follows the Codex editor input/result contract. Pass bounded
host messages as `history: [{role:'user'|'assistant',text}]` when continuing a
provider-prefixed thread. The latest 20 messages fitting 48,000 characters are
sent; the entire request is limited to 512 KB. Native session resume is disabled.
Recovery returns `unknown`, so the host must never automatically replay an
uncertain request. Effort controls are explicitly unsupported.

Images: Claude accepts up to six PNG/JPEG/WebP attachments (8 MiB each). The
host passes each stored attachment's `mime`, `size` and absolute `localPath`;
the adapter re-checks type, size and file identity, then sends one
`--input-format stream-json` user message whose content is the JSON request as a
text block followed by base64 `image` blocks. Claude requests always use this
input format, with or without images. Verified 2026-09-23 against Claude Code
2.1.280 with the full isolation flags below: the image was read correctly and
`init.tools` still listed only `StructuredOutput`. Gemini still rejects images
with `MODEL_NO_IMAGES` before launching.

All six modes are implemented: discussion, edit-day, edit-all, planning,
materialize, research. Host validators and user preview/save gates still decide
whether a decoded answer can become project data. These adapters never save
project data. Models are official CLI aliases, not a live entitlement list.

## Audited protocols and restrictions

Claude Code **2.1.278** was used to audit the flags below. The installed Claude version is now diagnostic only: login requires a compatible official auth-status response and turns still require the effective tool policy and structured stream to match. Unknown behavior fails closed rather than requiring each new patch version to be allowlisted. Claude Code uses `--print --output-format stream-json --verbose`,
`--json-schema`, and `result.structured_output`. Ordinary requests expose no
built-in tools; research/materialize expose only `WebSearch`. `StructuredOutput`
is accepted as the CLI's output mechanism. `--safe-mode`, `--restricted`, empty
setting sources, strict empty MCP config, disabled slash commands, and
`dontAsk`/`permission-prompts none` prevent customizations and tool approvals.
The App uses `CLAUDE_CONFIG_DIR`, whose documented keychain namespace is also
specific to that directory. On macOS it preserves the OS user home for Security/Keychain
lookup; overriding HOME to the App profile broke default-keychain resolution.
`ANTHROPIC_CONFIG_DIR` and `XDG_CONFIG_HOME` remain App-specific too, so restoring
the system home does not adopt other Anthropic profiles. `--bare` is deliberately avoided because it disables
subscription OAuth. See [CLI reference](https://code.claude.com/docs/en/cli-reference),
[credential storage](https://code.claude.com/docs/en/authentication), and
[environment variables](https://code.claude.com/docs/en/env-vars).

Only Claude Pro/Max accounts are accepted. Teams/Enterprise can receive remote
managed settings that outrank host settings. Detected machine managed settings
also fail closed. See [server-managed settings](https://code.claude.com/docs/en/server-managed-settings)
and [managed policy locations](https://code.claude.com/docs/en/managed-settings).

Gemini CLI **0.46.0** uses newline-delimited `init`, `message`, `tool_use`, and
`result` events. The App supplies an isolated `GEMINI_CLI_HOME` and system settings
files: no MCP, extensions, hooks, agents, skills, IDE context, memory discovery,
or API environment credentials. Core tools are an explicit empty allowlist, or
only hosted `google_web_search` for research/materialize. Admin policy denies
all other tools. Existing machine admin policy directories fail closed because
Gemini otherwise ignores `--admin-policy` when machine policies exist. See
[headless protocol](https://geminicli.com/docs/cli/headless/),
[policy engine](https://geminicli.com/docs/reference/policy-engine/), and
[authentication](https://geminicli.com/docs/get-started/authentication/).

Gemini OAuth uses official ACP `initialize` then
`authenticate({methodId:'oauth-personal'})`. The login configuration has blank
`selectedType` and `useExternal:true` so startup cannot authenticate before that
RPC. Generation keeps `NO_BROWSER=1` so stale credentials cannot unexpectedly
start browser login. JSON input encodes every `@` as `\u0040`, preventing CLI
file-reference preprocessing while preserving the original JSON values.

These details were also traced in installed 0.46.0 source, corresponding to
[ACP dispatcher](https://github.com/google-gemini/gemini-cli/blob/v0.46.0/packages/cli/src/acp/acpRpcDispatcher.ts),
[CLI startup](https://github.com/google-gemini/gemini-cli/blob/v0.46.0/packages/cli/src/gemini.tsx),
[tool registry](https://github.com/google-gemini/gemini-cli/blob/v0.46.0/packages/core/src/config/config.ts),
and [policy loading](https://github.com/google-gemini/gemini-cli/blob/v0.46.0/packages/core/src/policy/config.ts).

## Evidence and limits

Tests spawn fake Node executables and exercise all modes, malformed/oversized
streams, prohibited tools, cancellation, timeout, policy tampering, model/version
gates, account labels, and OAuth protocol framing. Real installed CLI checks were
limited to versions, help, isolated Claude auth status, and unauthenticated Gemini
ACP initialization. The user later completed real Claude authorization; the 0.3.3 read-only probe below confirmed its saved account. No real model response is claimed.
The initial ACP probe with preselected OAuth entered a manual authorization
prompt; it was stopped, no credential was obtained, and the separate login
configuration was added and verified to initialize without authentication.

This is a capability-checked CLI policy boundary (the legacy Gemini adapter remains pinned to 0.46.0), not an OS sandbox against a malicious same
user replacing executables or App state during execution. Transport failure,
unexpected tools, config changes, unsupported versions, or invalid output reject
the turn. The host must show that result without applying a proposal.


## 2026-09-23 macOS Keychain compatibility fix

Read-only `/usr/bin/security default-keychain -d user` reproduced the issue: normal OS home resolved the existing default Keychain; a temporary HOME failed. The corrected Claude runtime resolves the same default Keychain as the normal environment while retaining the App's CLAUDE_CONFIG_DIR. An actual Claude2.1.278 `auth status --json` under an empty temporary App profile reported loggedIn:false, confirming the probe did not adopt an existing subscription login. No Keychain creation/reset, credential value read/write, OAuth authorization, or model request was performed by the probe. Login completion still requires the user to retry the official flow.

The separate shared Anthropic configuration root is documented in [profile resolution](https://platform.claude.com/docs/en/manage-claude/wif-reference). Gemini continues to use its isolated HOME; this compatibility exception is only for macOS Claude.

## Claude login completion

Claude Code 2.1.278's bundled `auth login` command awaits its OAuth callback,
credential save attempt, and account validation before it prints `Login successful.` and
exits 0. The browser's completion page alone does not establish that the App's
isolated profile has saved credentials. The App checks the official `auth status`
result after either CLI exit outcome and makes a bounded follow-up check before
reporting an incomplete login. An official logged-in status takes precedence over
the login command's exit result. Unsupported authentication methods and plans
stay rejected without trying an API key.

On a failed login, the subprocess reduces stderr to a fixed category: credential
store, OAuth callback, network, managed policy, or generic command failure. Raw
stderr and browser URLs never enter account events or error messages. Cancellation
and account switching invalidate any in-flight completion checks.

The App-owned profile's read-only `auth status --json` was still `loggedIn:false`
after the reported browser completion, with `authMethod:none` and no account
email. The previous attempt's exact CLI error cannot be recovered because the
earlier process code discarded stderr. A user-driven retry with this diagnostic
code is needed to identify which failure category occurred; no OAuth flow or
model request was launched during this investigation. The CLI status contract is
documented in the [official CLI reference](https://code.claude.com/docs/en/cli-reference).

## 0.3.3: CLI-owned authentication

Root cause confirmed with pinned Claude Code 2.1.278: the App incorrectly set
`CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST=1`. The bundled OAuth reader returns no
stored token in that mode, expecting host-supplied credentials instead. The
App delegates OAuth entirely to the CLI, so the flag is now omitted from every
Claude subprocess (login, status, logout, and generation). It cannot leak in
from the parent environment because runtime environment keys are allowlisted.

A read-only A/B check against the same App-owned profile returned loggedIn:false
with the flag and loggedIn:true / claude.ai / firstParty / pro without it. The
actual App account adapter then returned connected; a new empty profile still
returned needs-login. No token values were read, copied, or supplied by the App
or diagnostic, and no OAuth flow or model request was started by the diagnostic.
This supersedes the earlier hypothesis that the completed login had not saved.

Safe mode, restricted tools, empty setting sources, strict MCP, credential-env
filtering, App-specific Claude and Anthropic directories, machine-policy checks,
and the Pro/Max account gate remain in place. Host-managed authentication is
not a tool sandbox and is not needed for those restrictions.
