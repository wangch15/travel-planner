# Desktop navigation and settings reference study

Date: 2026-09-22. Scope: refine Travel Planner's existing desktop workbench, preserving the approved neutral light/dark direction and v2 mark.

## Evidence

- Codex: actual app sidebar and settings screen inspected through `orca computer get-app-state` screenshots. The current app exposes only a shallow accessibility tree; attempted navigation clicks were refused by the tool's focus check. User opened settings manually, after which the settings layout was inspected.
- Orca: actual sidebar inspected through Computer Use. Settings studied from the screenshot the user supplied in this session, because opening settings would interrupt their current Orca CLI workspace. This is screenshot-based inspection, not an interactive walkthrough.
- No account settings, permission toggles or provider choices were changed in either reference app. Their private content and screenshots were not copied into this public repository.

## Observations and implemented choices

| Reference observation | Travel Planner application |
|---|---|
| Search and primary action remain easy to find | Sidebar trip search, Cmd/Ctrl K, then new trip action |
| Project groups organize a long list | Collapsible project group, trip count, separate demo group, secondary date labels |
| Bottom utility/account entry stays anchored | AI connection entry and settings remain at the bottom; compact rail retains shortcuts |
| Current selection is quiet but distinct | Neutral selected row with fine border and readable text; keyboard focus remains separate |
| Settings navigation groups tasks | Workspace: projects/AI; Application: appearance/about |
| Settings content has a bounded reading width | 850px maximum, centered in the available content column |
| Title and explanation precede related controls | Consistent section heading, supporting text and subtle divider; grouped account/theme controls |
| Labels and descriptions are left, actions right | Existing settings row structure preserved; controls stack at narrow widths |
| Return is a stable navigation action | Fixed back entry, Escape to return, original focus restored |

Additional continuity: reopening settings returns to the last section and remembers each section's scroll position during the current app session. Cmd/Ctrl comma opens settings. The unified app header shows settings context instead of a trip title while settings are open.

A settings search is deliberately unnecessary for the current four categories. No nonfunctional switches or reference-app-specific developer controls were added.

## Verification

Native Electron smoke checks light/dark appearance, grouped navigation, trip search and empty search, panel collapse/resize, settings entry/return, model/draft behavior, and modal interactions. Reference screenshots are observational evidence only; no claim of interactive inspection of Orca settings or Windows native verification.
