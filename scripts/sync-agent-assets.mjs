import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const defaultRepoRoot = path.resolve(__dirname, '..')

const RULE_TARGETS = ['.agent', '.agents', '.claude', '.codex']
const SKILL_TARGETS = ['.agent', '.agents', '.claude', '.codex']
const COMMAND_TARGETS = ['.claude']
const WORKFLOW_TARGETS = ['.agent']

function resolveRepoPath(repoRoot, ...segments) {
  return path.join(repoRoot, ...segments)
}

function exists(targetPath, ops = fs) {
  try {
    ops.lstatSync(targetPath)
    return true
  } catch {
    return false
  }
}

function ensureDir(dirPath, ops = fs) {
  ops.mkdirSync(dirPath, { recursive: true })
}

function removePathIfExists(targetPath, ops = fs) {
  try {
    ops.lstatSync(targetPath)
    ops.rmSync(targetPath, { recursive: true, force: true })
  } catch {}
}

function syncDirectoryContents({ sourcePath, targetPath, ops = fs }) {
  ensureDir(targetPath, ops)

  const sourceEntries = new Set(ops.readdirSync(sourcePath))
  const targetEntries = new Set(ops.readdirSync(targetPath))

  for (const entry of targetEntries) {
    if (sourceEntries.has(entry)) continue
    ops.rmSync(path.join(targetPath, entry), { recursive: true, force: true })
  }

  for (const entry of sourceEntries) {
    const sourceEntryPath = path.join(sourcePath, entry)
    const targetEntryPath = path.join(targetPath, entry)
    ops.rmSync(targetEntryPath, { recursive: true, force: true })
    ops.cpSync(sourceEntryPath, targetEntryPath, {
      recursive: true,
      force: true,
      dereference: true,
    })
  }
}

function syncSharedDirectoryTarget({
  linkPath,
  sourcePath,
  targetRelativePath,
  ops = fs,
  preferCopy = false,
}) {
  if (!exists(sourcePath, ops)) return 'missing-source'
  ensureDir(path.dirname(linkPath), ops)

  try {
    const stat = ops.lstatSync(linkPath)
    if (!preferCopy && stat.isSymbolicLink()) {
      const currentTarget = ops.readlinkSync(linkPath)
      if (currentTarget === targetRelativePath) return 'symlink'
    }
    if (stat.isDirectory() && !stat.isSymbolicLink()) {
      syncDirectoryContents({ sourcePath, targetPath: linkPath, ops })
      return 'copy'
    }
    ops.rmSync(linkPath, { recursive: true, force: true })
  } catch {}

  if (!preferCopy) {
    try {
      ops.symlinkSync(targetRelativePath, linkPath, 'dir')
      return 'symlink'
    } catch {
      removePathIfExists(linkPath, ops)
    }
  }

  ops.cpSync(sourcePath, linkPath, {
    recursive: true,
    force: true,
    dereference: true,
  })
  return 'copy'
}

function stripFrontmatter(markdown) {
  const match = markdown.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n/)
  if (!match) return markdown.trim()
  return markdown.slice(match[0].length).trim()
}

function extractPreservedPreamble(document, title) {
  const marker = `# ${title}`
  const markerIndex = document.indexOf(marker)
  if (markerIndex <= 0) return ''

  const preamble = document.slice(0, markerIndex).trimEnd()
  return preamble ? `${preamble}\n\n` : ''
}

function formatSectionTitle(fileName) {
  const base = path.basename(fileName, '.md')
  return base
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function collectMarkdownFiles(dirPath, ops = fs) {
  if (!exists(dirPath, ops)) return []
  return ops.readdirSync(dirPath)
    .filter((file) => file.endsWith('.md') && file !== 'README.md')
    .sort((a, b) => a.localeCompare(b))
    .map((file) => path.join(dirPath, file))
}

function collectSkillDirs({ repoRoot = defaultRepoRoot, ops = fs } = {}) {
  const skillsDir = resolveRepoPath(repoRoot, '.ai', 'skills')
  if (!exists(skillsDir, ops)) return []
  return ops.readdirSync(skillsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b))
}

function renderSharedRulesSection({ repoRoot = defaultRepoRoot, ops = fs } = {}) {
  const rulesDir = resolveRepoPath(repoRoot, '.ai', 'rules')
  const sections = collectMarkdownFiles(rulesDir, ops).map((filePath) => {
    const content = ops.readFileSync(filePath, 'utf8')
    const stripped = stripFrontmatter(content)
    return `## ${formatSectionTitle(filePath)}\n\n${stripped}`
  })

  return [
    '## Shared Rules',
    '',
    'This section is generated from `.ai/rules/`. Do not edit it directly.',
    '',
    ...sections,
  ].join('\n')
}

function renderEntryDocument({
  title,
  introLine,
  existingDocument = '',
  repoRoot = defaultRepoRoot,
  ops = fs,
}) {
  const contextPath = resolveRepoPath(repoRoot, '.ai', 'entrypoints', 'project-context.md')
  const projectContext = exists(contextPath, ops)
    ? ops.readFileSync(contextPath, 'utf8').trim()
    : '## Project Overview\n\nAdd project context in `.ai/entrypoints/project-context.md`.'
  const sharedRules = renderSharedRulesSection({ repoRoot, ops })
  const preservedPreamble = extractPreservedPreamble(existingDocument, title)

  return [
    preservedPreamble.trimEnd(),
    preservedPreamble ? '' : '',
    `# ${title}`,
    '',
    '> AUTO-GENERATED by `scripts/sync-agent-assets.mjs`.',
    '> Edit `.ai/entrypoints/project-context.md` and `.ai/rules/*.md`, then run `pnpm sync:agent-assets` or `node scripts/sync-agent-assets.mjs`.',
    '',
    introLine,
    '',
    projectContext,
    '',
    sharedRules,
    '',
  ].filter((line, index) => !(index === 0 && line === '')).join('\n')
}

function writeEntryDocuments({ repoRoot = defaultRepoRoot, ops = fs } = {}) {
  const claudePath = resolveRepoPath(repoRoot, 'CLAUDE.md')
  const agentsPath = resolveRepoPath(repoRoot, 'AGENTS.md')
  const existingClaudeDoc = exists(claudePath, ops) ? ops.readFileSync(claudePath, 'utf8') : ''
  const existingAgentsDoc = exists(agentsPath, ops) ? ops.readFileSync(agentsPath, 'utf8') : ''

  const claudeDoc = renderEntryDocument({
    title: 'CLAUDE.md',
    introLine: 'This file provides shared project guidance to Claude Code when working in this repository.',
    existingDocument: existingClaudeDoc,
    repoRoot,
    ops,
  })

  const agentsDoc = renderEntryDocument({
    title: 'AGENTS.md',
    introLine: 'This file provides shared project guidance to coding agents when working in this repository.',
    existingDocument: existingAgentsDoc,
    repoRoot,
    ops,
  })

  ops.writeFileSync(claudePath, claudeDoc, 'utf8')
  ops.writeFileSync(agentsPath, agentsDoc, 'utf8')
}

function syncRules({ repoRoot = defaultRepoRoot, ruleTargets = RULE_TARGETS, ops = fs, preferCopy = false } = {}) {
  const sourcePath = resolveRepoPath(repoRoot, '.ai', 'rules')
  for (const root of ruleTargets) {
    syncSharedDirectoryTarget({
      linkPath: resolveRepoPath(repoRoot, root, 'rules'),
      sourcePath,
      targetRelativePath: '../.ai/rules',
      ops,
      preferCopy,
    })
  }
}

function syncSkills({
  repoRoot = defaultRepoRoot,
  skillTargets = SKILL_TARGETS,
  sharedSkills = collectSkillDirs({ repoRoot }),
  ops = fs,
  preferCopy = false,
} = {}) {
  for (const root of skillTargets) {
    const skillsRootPath = resolveRepoPath(repoRoot, root, 'skills')
    ensureDir(skillsRootPath, ops)
    let preferCopyForSkills = preferCopy

    try {
      const stat = ops.lstatSync(skillsRootPath)
      if (stat.isDirectory() && !stat.isSymbolicLink()) {
        preferCopyForSkills = true
      }
    } catch {}

    for (const skill of sharedSkills) {
      syncSharedDirectoryTarget({
        linkPath: resolveRepoPath(repoRoot, root, 'skills', skill),
        sourcePath: resolveRepoPath(repoRoot, '.ai', 'skills', skill),
        targetRelativePath: `../../.ai/skills/${skill}`,
        ops,
        preferCopy: preferCopyForSkills,
      })
    }
  }
}

function syncCommands({ repoRoot = defaultRepoRoot, commandTargets = COMMAND_TARGETS, ops = fs } = {}) {
  const sourceDir = resolveRepoPath(repoRoot, '.ai', 'commands')
  const commandFiles = collectMarkdownFiles(sourceDir, ops).map((filePath) => path.basename(filePath))

  for (const root of commandTargets) {
    const targetDir = resolveRepoPath(repoRoot, root, 'commands')
    ensureDir(targetDir, ops)

    for (const file of commandFiles) {
      ops.copyFileSync(
        resolveRepoPath(repoRoot, '.ai', 'commands', file),
        resolveRepoPath(repoRoot, root, 'commands', file),
      )
    }
  }
}

function syncWorkflows({ repoRoot = defaultRepoRoot, workflowTargets = WORKFLOW_TARGETS, ops = fs, preferCopy = false } = {}) {
  const sourcePath = resolveRepoPath(repoRoot, '.ai', 'workflows')
  if (!exists(sourcePath, ops)) return

  for (const root of workflowTargets) {
    syncSharedDirectoryTarget({
      linkPath: resolveRepoPath(repoRoot, root, 'workflows'),
      sourcePath,
      targetRelativePath: '../.ai/workflows',
      ops,
      preferCopy,
    })
  }
}

function syncAgentAssets({ repoRoot = defaultRepoRoot, ops = fs, preferCopy = false } = {}) {
  writeEntryDocuments({ repoRoot, ops })
  syncRules({ repoRoot, ops, preferCopy })
  syncSkills({ repoRoot, ops, preferCopy })
  syncCommands({ repoRoot, ops })
  syncWorkflows({ repoRoot, ops, preferCopy })
}

function main() {
  syncAgentAssets()
  console.log('Synced agent assets from .ai/')
}

main()
