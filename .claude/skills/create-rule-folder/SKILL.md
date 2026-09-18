---
name: create-rule-folder
description: Use when creating persistent rule documentation for a large feature module, page logic, calculator, workflow, domain area, or long-lived project knowledge area.
---

# Create Rule Folder

## Overview

Create maintainable rule documentation for a project area so future agents preserve decisions, invariants, edge cases, and open questions across sessions.

The pattern has two parts:

1. **Local canonical docs** near the implementation. These are the source of truth.
2. **Global agent reference** under `.ai/rules/`. This is the searchable trigger that tells agents when and how to read the local docs.

## When To Use

Use this for:

- A large feature module
- A workflow or domain area
- A page with complex behavior
- A calculator, importer, parser, editor, or runtime subsystem
- Any area where decisions need to survive across agent sessions
- Any area where repeated bugs, exceptions, or semantic decisions are already accumulating

Do not use this for:

- Small one-off changes
- Pure copy or style edits
- Areas that already have clear rules docs and only need content updates

## Required Inputs

Before creating files, identify or infer:

- Area name, slug, and type
- Primary owner path and related paths
- Why this area needs persistent rules
- Where the canonical docs should live
- Whether future agents must read the docs before touching related code
- Whether a domain-specific command is justified

If the owner path or domain boundary is unclear, ask one concise question before creating files.

## Folder Pattern

Prefer placing the canonical docs near the owning code:

```text
<target-root>/docs/<area>-rules.md
<target-root>/docs/<area>-rules/
  open-questions.md
  <topic>.md
```

Create a global reference for large or long-lived areas:

```text
.ai/rules/<area>-rules-reference.md
```

The global agent reference is not the primary storage for detailed rules. It should stay short enough to work as a trigger and navigation header.

## Global Agent Reference

`.ai/rules/<area>-rules-reference.md` should define:

- Which paths or work types trigger this rule set
- The canonical local index and topic docs
- The read order before editing related code
- Cross-area docs that must also be read
- The requirement to update local docs when behavior changes
- The repo's agent asset sync command

Keep domain details in `<target-root>/docs/<area>-rules*.md` so `.ai/rules` does not become a large knowledge dump.

## Rule Classification

Classify rules with:

- `Invariant`: a hard rule that must not be broken
- `Decision`: a current design decision
- `Open Question`: unresolved behavior that agents must not guess

Important invariants and decisions should have tests or verification steps when practical.

## Local Index

`<area>-rules.md` is the local rule index. It should let an agent find the smallest necessary document without reading the whole folder.

Required sections:

- Scope
- Navigation
- How to find rules
- Maintenance rules

For complex areas, add one or both of:

- `Change-Type Matrix`: maps task categories to required docs.
- `File Classes`: explains which files are mainline rules, cases, and appendix material.

## Complex Area Extensions

Do not force every area to use this structure. Use it when a rules folder has enough volume or risk to justify it:

```text
<target-root>/docs/<area>-rules/
  cases/
    <bug-or-decision-case>.md
  appendix/
    <long-reference>.md
```

Recommended file classes:

- Mainline rules: active rules future agents should read before relevant work.
- `cases/`: bug background, reproduction notes, historical traps, corrective decisions, and linked tests.
- `appendix/`: long tables, old full explanations, schema examples, or reference material that should not stay on the main path.

Mainline rules may use rule cards:

```markdown
- Type: `Invariant` | `Decision` | `Open Question`
- Applies to: `<paths or behavior>`
- Rule: `<the current rule>`
- Why: `<short reason>`
- Enforced by: `<test, command, or docs-only risk>`
```

Use `docs-only risk` when a rule has no automated enforcement yet.

## Scaling Discipline

The common failure mode in a growing rules folder is not a wrong rule. It is **the index turning into a directory listing**. These rules exist to prevent that.

- `Invariant`: The index routes; it does not catalog. Full listings for `cases/` and `appendix/` belong in a `README.md` inside those folders, not in the index. The index is a fixed cost paid on every task, so embedding a listing makes every change read content unrelated to that change.
- `Invariant`: Every case must be referenced by at least one mainline rule. A case that only appears in an index is effectively unreachable, because the real lookup path is "index -> the mainline rule named by the Change-Type Matrix -> the case that rule links to". This is also the precondition for the rule above: once the listing moves out, backlinks are the only entry point.
- `Invariant`: A single Change-Type Matrix row must not list both a summary document and its detail documents. That makes every task read the same material twice. Give the summary document its own row, for the case where the layer of divergence is not yet known.
- `Invariant`: Every appendix file must be referenced by a mainline rule. An appendix with zero references that declares itself superseded is dead weight and should be deleted; git keeps it recoverable.
- `Decision`: When a mainline document contains a run of consecutive rule cards on one subject, and that subject has its own trigger conditions, split it into its own document and add a Change-Type Matrix row. The test is "would these cards be read together with the rest of this file", not line count.
- `Invariant`: Section numbers must be unique within a document, and heading depth must match numbering depth. Numbers collide as content grows. Two real examples found in one repo: a document with two `2.5.1` sections (one at `###`, one at `##`), and another with two `## 3.` sections. Neither raises an error; they just make anchors resolve to the wrong place and make grep unreliable.
- `Decision`: Rule cards nested under a numbered section are fine; that mix is not the problem. What to avoid is **renumbering rule cards** or letting two numbering schemes compete at the same level. Prefer rule cards for new structure, because their ids do not shift when neighbors are added or removed. Renumbering breaks every anchor into those sections; rule card ids do not.

## Maintenance Health Checks

Run these when reorganizing an existing rules folder, or when one has visibly grown. `<rules-dir>` is `<target-root>/docs/<area>-rules`.

Orphan cases, reachable only from an index:

```bash
for c in <rules-dir>/cases/*.md; do
  b=$(basename "$c"); [ "$b" = "README.md" ] && continue
  [ "$(grep -l "cases/$b" <rules-dir>/*.md 2>/dev/null | wc -l | tr -d ' ')" = "0" ] && echo "orphan: $b"
done
```

Duplicate section numbers, which make anchors resolve silently to the wrong place:

```bash
python3 - <<'EOF'
import glob, re
for f in sorted(glob.glob('<rules-dir>/**/*.md', recursive=True)):
    hs = [l for l in open(f, encoding='utf-8') if re.match(r'^#+ \d+(\.\d+)*[\.\s]', l)]
    nums = [re.match(r'^#+ ((?:\d+\.)*\d+)', h).group(1).rstrip('.') for h in hs]
    dup = sorted({n for n in nums if nums.count(n) > 1})
    if dup:
        print(f, 'duplicate section numbers:', dup)
EOF
```

Per-document reading cost, to decide what to split:

```bash
find <rules-dir> -name '*.md' -exec wc -c {} + | sort -rn | head -15
```

Whether internal links and anchors still resolve after a move or a renumber:

```bash
python3 - <<'EOF'
import glob, os, re
ROOT = '<rules-dir>'
def slug(h):
    t = h.lstrip('#').strip().lower()
    return re.sub(r'[^\w\s\u4e00-\u9fff-]', '', t).replace(' ', '-')
docs = glob.glob(f'{ROOT}/**/*.md', recursive=True) + glob.glob(f'{os.path.dirname(ROOT)}/*.md')
heads = {p: {slug(l) for l in open(p, encoding='utf-8') if l.startswith('#')} for p in docs}
bad = []
for f in docs:
    base = os.path.dirname(f)
    src = open(f, encoding='utf-8').read()
    for link, anchor in re.findall(r'\]\((\.{1,2}/[^)#\s]+\.md)(?:#([^)\s]+))?\)', src):
        tgt = os.path.normpath(os.path.join(base, link))
        if not os.path.exists(tgt):
            bad.append((f, 'missing file', tgt))
        elif anchor and anchor not in heads.get(tgt, set()):
            bad.append((f, 'dead anchor', f'{tgt}#{anchor}'))
print('broken links:', len(bad))
for b in bad:
    print(' ', *b)
EOF
```

## Workflow

If this is a reorganization of an **existing** rules folder rather than a new one, run `Maintenance Health Checks` first, decide from `Scaling Discipline` whether to move a listing, add backlinks, or split a file, then enter the relevant steps below.

1. Identify the area name, slug, owner path, related paths, and reason the docs are needed.
2. Read nearby docs and existing `.ai/rules` references.
3. Choose the canonical docs location near the owning code.
4. Create `open-questions.md`.
5. Create `<area>-rules.md` as the local index.
6. Add topic files only when the area already has enough detail to justify them.
7. For complex areas, add `Change-Type Matrix`, `cases/`, or `appendix/` only when they reduce required reading.
8. Create or update `.ai/rules/<area>-rules-reference.md` unless there is a clear reason future agents should not be forced to read it.
9. Run the agent asset sync command if `.ai/` changed.
10. Run the smallest useful verification command.

## Local Index Template

```markdown
# <Area> Rules

## Scope

- `<primary path>`
- `<related path>`

## Navigation

- `<topic>`: `<area>-rules/<topic>.md`
- Open questions: `<area>-rules/open-questions.md`

## How To Find Rules

1. Read this index first.
2. Read the nearest topic document for the touched behavior.
3. If no rule exists, add it to `open-questions.md` or define the rule in the same change.

## Maintenance Rules

1. Keep rules near the behavior they describe.
2. Mark each rule as `Invariant`, `Decision`, or `Open Question`.
3. Important `Invariant` and `Decision` rules should include a test or verification step when practical.
4. If an old rule is stale, update the canonical rule or move it to `Open Question`; do not append contradictions.
5. Run the agent asset sync command when `.ai/` files change.
```

## Global Reference Template

```markdown
# <Area> Rules Reference

When work touches any of these areas, read the local rules first:

- `<primary path>`
- `<related path>`

Canonical source:

- `<target-root>/docs/<area>-rules.md`
- `<target-root>/docs/<area>-rules/*.md`

Work rules:

- Read `<area>-rules.md` before editing related code, then read the smallest topic document for the touched behavior.
- If implementation and docs disagree, fix the implementation or update the docs in the same change.
- Add new rules, exceptions, and semantic decisions to the local docs.
- Prefer `Invariant`, `Decision`, and `Open Question` labels.
- Important `Invariant` and `Decision` rules should include tests or verification steps when practical.
- Run the agent asset sync command when `.ai/` files change.
```

## Command Guidance

Create a domain-specific command only when that area will be updated frequently. Commands should stay thin: they trigger the skill and summarize input, but they should not duplicate the full workflow.

## Completion Checklist

- Local canonical rules index exists or was updated.
- `open-questions.md` exists.
- Rules use `Invariant`, `Decision`, or `Open Question` labels.
- Global agent reference exists or omission is explicitly justified.
- Old rules were updated in place; contradictions were not appended.
- The index does not embed a full `cases/` or `appendix/` listing.
- Every case is referenced by at least one mainline rule.
- Every appendix file has a mainline reference; no zero-reference files remain.
- Internal links and anchors were fully validated after any move or renumber.
- `.ai/` changes were synced.
- The smallest useful verification command was run.
