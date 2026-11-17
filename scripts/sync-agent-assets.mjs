import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import {
  STRINGS,
} from './sync-agent-assets-lib/strings.mjs'
import {
  FRONTMATTER_PATTERN,
  parseRuleFrontmatter,
  readFrontmatterField,
} from './sync-agent-assets-lib/frontmatter.mjs'
import {
  exists,
  ensureDir,
  removePathIfExists,
  readJsonIfExists,
  compareCodePoint,
  isSafeEntryName,
  pruneStaleEntries,
  ensureRealDir,
  isSamePath,
  copyEntries,
  listEntries,
  isRealDirectory,
} from './sync-agent-assets-lib/fs-safe.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const defaultRepoRoot = path.resolve(__dirname, '..')

const RULE_TARGETS = ['.agent', '.agents', '.claude']
// Codex 的 .codex/rules/ 放的是 Starlark `.rules` 指令核准政策，不會讀 Markdown。
// 舊版把規則同步到這裡；現在只負責清掉那些副本。
const LEGACY_RULE_TARGETS = ['.codex']
const SKILL_TARGETS = ['.agent', '.agents', '.claude', '.codex']
const COMMAND_TARGETS = ['.claude']
// Codex 沒有 command 機制，把每個 command 包成一個 skill 給它。
const COMMAND_SKILL_TARGETS = ['.agents', '.codex']
const COMMAND_SKILL_PREFIX = 'source-command-'

// Spectra、OpenSpec 等工具會在入口檔插入 `<!-- NAME:START ... -->` … `<!-- NAME:END -->` 區塊。
// 只認行首的標記：行內程式碼裡提到標記的文字不是區塊。
const MANAGED_BLOCK_PATTERN = /^<!--\s*([A-Z][A-Z0-9_-]*):START\b[^>\n]*-->[\s\S]*?^<!--\s*\1:END\s*-->/gm
// command 包成 skill 時，檔名就是 skill 名稱的一部分，必須符合 skill 命名規則
const COMMAND_NAME_PATTERN = /^[a-z0-9][a-z0-9-]*$/
const WORKFLOW_TARGETS = ['.agent']

// Codex 預設只讀 32 KiB 的 project instructions（config.toml 的 project_doc_max_bytes）。
const CODEX_PROJECT_DOC_MAX_BYTES = 32 * 1024

// 專案層級的選擇；不放 CLI 參數，因為每次執行都得記得帶，容易漏。
const CONFIG_RELATIVE_PATH = ['.ai', 'agent-assets.config.json']
const CONFIG_CHOICES = { linkMode: ['copy', 'symlink'], locale: ['en', 'zh-TW'] }
// 預設複製：commit 進 git 的 symlink 在 Windows（core.symlinks=false）clone 下來會變成純文字檔。
const DEFAULT_CONFIG = { linkMode: 'copy', locale: 'en' }

// 記錄上次同步了哪些名稱，下次才知道哪些是改名或刪除後留下的舊副本。
// 不放時間戳：引擎與行程 repo 互相 merge 時，內容相同就不會衝突。
const SYNC_STATE_RELATIVE_PATH = ['.ai', '.agent-assets-sync.json']

function resolveRepoPath(repoRoot, ...segments) {
  return path.join(repoRoot, ...segments)
}

function readConfig({ repoRoot = defaultRepoRoot, ops = fs } = {}) {
  const raw = readJsonIfExists(resolveRepoPath(repoRoot, ...CONFIG_RELATIVE_PATH), ops) ?? {}
  const config = { ...DEFAULT_CONFIG, ...raw }
  for (const [key, choices] of Object.entries(CONFIG_CHOICES)) {
    if (!choices.includes(config[key])) {
      throw new Error(`.ai/agent-assets.config.json: ${key} must be one of ${choices.join(' | ')} (got ${JSON.stringify(config[key])})`)
    }
  }
  return config
}

const STATE_KEYS = ['rules', 'workflows', 'skills', 'commands', 'commandSkills']
const STATE_NAME_RULES = {
  commands: (name) => name.endsWith('.md'),
  commandSkills: (name) => name.startsWith(COMMAND_SKILL_PREFIX),
}

function readSyncState({ repoRoot = defaultRepoRoot, ops = fs } = {}) {
  const statePath = resolveRepoPath(repoRoot, ...SYNC_STATE_RELATIVE_PATH)
  const empty = Object.fromEntries(STATE_KEYS.map((key) => [key, []]))
  if (!exists(statePath, ops)) return { state: empty, warnings: [] }

  let raw
  try {
    raw = JSON.parse(ops.readFileSync(statePath, 'utf8'))
  } catch (error) {
    return {
      state: empty,
      warnings: [`Ignored .ai/.agent-assets-sync.json (${error.message}); it is rewritten after this sync. Stale copies from earlier renames may need manual removal.`],
    }
  }

  const state = Object.fromEntries(STATE_KEYS.map((key) => {
    const names = Array.isArray(raw?.[key]) ? raw[key] : []
    const isAllowed = STATE_NAME_RULES[key] ?? (() => true)
    return [key, names.filter((name) => isSafeEntryName(name) && isAllowed(name))]
  }))
  return { state, warnings: [] }
}

function writeSyncState({ repoRoot = defaultRepoRoot, ops = fs, state }) {
  const sorted = Object.fromEntries(
    STATE_KEYS.map((key) => [key, [...(state[key] ?? [])].sort(compareCodePoint)]),
  )
  ops.writeFileSync(resolveRepoPath(repoRoot, ...SYNC_STATE_RELATIVE_PATH), `${JSON.stringify(sorted, null, 2)}\n`, 'utf8')
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
  // 目標經由 symlink 解析回來源本身時，「先刪目標再複製」等於刪掉正本
  if (isSamePath(sourcePath, linkPath, ops) && ops.lstatSync(linkPath).isSymbolicLink()) {
    if (!preferCopy) return 'symlink'
    ops.unlinkSync(linkPath)
  } else if (isSamePath(sourcePath, linkPath, ops)) {
    return 'same'
  }

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

// 只移除同步產生的東西：指向 .ai/rules 的 symlink，或目錄內的 Markdown 檔。
// Codex 自己的 `.rules` 檔與其他內容一律保留。
function pruneLegacyRuleTarget({ targetPath, targetRelativePath, ops = fs }) {
  let stat
  try {
    stat = ops.lstatSync(targetPath)
  } catch {
    return 'absent'
  }

  if (stat.isSymbolicLink()) {
    if (ops.readlinkSync(targetPath) !== targetRelativePath) return 'kept'
    ops.unlinkSync(targetPath)
    return 'removed'
  }
  if (!stat.isDirectory()) return 'kept'

  for (const entry of ops.readdirSync(targetPath)) {
    const entryPath = path.join(targetPath, entry)
    if (!entry.endsWith('.md') || ops.lstatSync(entryPath).isDirectory()) continue
    ops.rmSync(entryPath, { force: true })
  }

  if (ops.readdirSync(targetPath).length > 0) return 'pruned'
  ops.rmdirSync(targetPath)
  return 'removed'
}

// 保留產生標題之前的內容，以及散落在舊檔其他位置的工具區塊（移到標題之前，避免下次重新產生時被吃掉）。
// canonicalHead 來自 `.ai/entrypoints/<name>-preamble.md`：有正本時以正本為準，舊檔的手寫前言不再沿用。
const toLf = (text) => text.replace(/\r\n/g, '\n')

function extractPreservedPreamble(rawDocument, title, rawCanonicalHead = null) {
  // 統一換行：Windows 上寫的前言檔是 CRLF 時，才比對得到 LF 舊檔裡的同一個區塊
  const document = toLf(rawDocument)
  const markerIndex = document.indexOf(`# ${title}`)
  const oldHead = markerIndex > 0 ? document.slice(0, markerIndex).trim() : ''
  const head = rawCanonicalHead === null ? oldHead : toLf(rawCanonicalHead)
  // code fence 裡舉例的區塊標記不是工具區塊，掃描前先拿掉
  const blocks = (blankFencedCode(document).match(MANAGED_BLOCK_PATTERN) ?? []).filter((block) => !head.includes(block))
  const preamble = [head, ...new Set(blocks)].filter(Boolean).join('\n\n')
  return preamble ? `${preamble}\n\n` : ''
}

function readCanonicalPreamble({ repoRoot = defaultRepoRoot, ops = fs, name }) {
  const filePath = resolveRepoPath(repoRoot, '.ai', 'entrypoints', `${name}-preamble.md`)
  return exists(filePath, ops) ? ops.readFileSync(filePath, 'utf8').trim() : null
}

const PACKAGE_MANAGER_RUN = { pnpm: 'pnpm', yarn: 'yarn', bun: 'bun run', npm: 'npm run' }
const LOCKFILES = [
  ['pnpm-lock.yaml', 'pnpm'],
  ['yarn.lock', 'yarn'],
  ['bun.lock', 'bun'],
  ['bun.lockb', 'bun'],
  ['package-lock.json', 'npm'],
]

// 指令要用專案實際的 package manager 寫；寫死 pnpm 時，npm 專案照抄會失敗。
function detectSyncCommand({ repoRoot = defaultRepoRoot, ops = fs } = {}) {
  const fallback = 'node scripts/sync-agent-assets.mjs'
  let packageJson
  try {
    packageJson = readJsonIfExists(resolveRepoPath(repoRoot, 'package.json'), ops)
  } catch {
    // 只為了產生一行提示；package.json 讀不了（BOM、JSON5）時不該讓整個 sync 失敗
    return fallback
  }
  if (!packageJson?.scripts?.['sync:agent-assets']) return fallback

  const declared = String(packageJson.packageManager ?? '').split('@')[0]
  const fromLockfile = LOCKFILES.find(([file]) => exists(resolveRepoPath(repoRoot, file), ops))?.[1]
  const manager = PACKAGE_MANAGER_RUN[declared] ? declared : (fromLockfile ?? 'npm')
  return `${PACKAGE_MANAGER_RUN[manager]} sync:agent-assets`
}

function checkRuleFrontmatter(rules) {
  return rules
    .filter((rule) => rule.hasGlobs && rule.paths.length === 0)
    .map((rule) => `.ai/rules/${rule.fileName} uses \`globs:\` but no \`paths:\`. Claude Code ignores \`globs\`, so this rule loads in every session; add \`paths:\` with the same patterns.`)
}

// CommonMark：fence 由同一種字元、長度不小於開頭、後面沒有其他文字的那一行關閉；
// 反引號 fence 的 info string 不能含反引號（```inline``` text 是行內程式碼，不是 fence）。
const FENCE_LINE_PATTERN = /^ {0,3}(`{3,}|~{3,})(.*)$/

// 逐行走過 Markdown，回呼收到每一行以及它是否在 code fence 內（fence 標記行本身也算在內）
function mapLinesWithFences(lines, callback) {
  let fence = null
  return lines.map((line) => {
    const fenceLine = line.match(FENCE_LINE_PATTERN)
    const marker = fenceLine?.[1]
    const isOpener = fenceLine && !fence && !(marker[0] === '`' && fenceLine[2].includes('`'))
    const isCloser = fenceLine && fence && marker[0] === fence.char && marker.length >= fence.length && fenceLine[2].trim() === ''
    if (isOpener) {
      fence = { char: marker[0], length: marker.length }
      return callback(line, true)
    }
    if (isCloser) {
      fence = null
      return callback(line, true)
    }
    return callback(line, Boolean(fence))
  })
}

function blankFencedCode(text) {
  return mapLinesWithFences(text.split('\n'), (line, inFence) => (inFence ? '' : line)).join('\n')
}

// 規則的 H1 已經拿來當段落標題，內文其餘標題降一級才不會和規則標題同層；code fence 內不動。
function demoteRuleBody(body) {
  const lines = body.split(/\r?\n/)
  const withoutTitle = /^#\s+/.test(lines[0] ?? '') ? lines.slice(1) : lines
  return mapLinesWithFences(withoutTitle, (line, inFence) => (!inFence && /^#{1,5}\s/.test(line) ? `#${line}` : line))
    .join('\n')
    .trim()
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
    .sort(compareCodePoint)
    .map((file) => path.join(dirPath, file))
}

function collectSkillDirs({ repoRoot = defaultRepoRoot, ops = fs } = {}) {
  const skillsDir = resolveRepoPath(repoRoot, '.ai', 'skills')
  if (!exists(skillsDir, ops)) return []
  // 只收有 SKILL.md 的資料夾：文件資料夾或改名後留下的空殼不是 skill。
  return ops.readdirSync(skillsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => exists(path.join(skillsDir, name, 'SKILL.md'), ops))
    .sort(compareCodePoint)
}

function readRuleTitle(body, filePath) {
  const heading = body.split(/\r?\n/, 1)[0].match(/^#\s+(.+)$/)
  return heading ? heading[1].trim() : formatSectionTitle(filePath)
}

function readRules({ repoRoot = defaultRepoRoot, ops = fs } = {}) {
  const rulesDir = resolveRepoPath(repoRoot, '.ai', 'rules')
  return collectMarkdownFiles(rulesDir, ops).map((filePath) => {
    const { paths, hasGlobs, body } = parseRuleFrontmatter(ops.readFileSync(filePath, 'utf8'))
    return {
      fileName: path.basename(filePath),
      title: readRuleTitle(body, filePath),
      paths,
      hasGlobs,
      body,
    }
  })
}

function renderRuleIndexLine(rule, alwaysOnLabel) {
  const scope = rule.paths.length > 0
    ? rule.paths.map((pattern) => `\`${pattern}\``).join(', ')
    : alwaysOnLabel
  return `- \`.ai/rules/${rule.fileName}\` — ${rule.title}: ${scope}`
}

// 索引放在內嵌規則之前：Codex 超過 project_doc_max_bytes 就不再往下讀，
// 被截掉的應該是內文，而不是告訴 agent 該去讀哪份規則的索引。
function renderSharedRulesSection({
  repoRoot = defaultRepoRoot,
  ops = fs,
  inlineAlwaysOnRules = true,
  strings = STRINGS.en,
} = {}) {
  const rules = readRules({ repoRoot, ops })
  const notes = inlineAlwaysOnRules ? strings.inlineNotes : strings.claudeNotes
  const alwaysOnLabel = inlineAlwaysOnRules ? strings.alwaysOnInlined : strings.alwaysOn
  const inlinedSections = inlineAlwaysOnRules
    ? rules
      .filter((rule) => rule.paths.length === 0)
      .map((rule) => `## ${rule.title}\n\n${demoteRuleBody(rule.body)}`)
    : []

  return [
    strings.sharedRules,
    '',
    strings.sectionGenerated,
    '',
    ...notes.flatMap((note) => [note, '']),
    strings.ruleIndex,
    '',
    ...rules.map((rule) => renderRuleIndexLine(rule, alwaysOnLabel)),
    ...inlinedSections.flatMap((section) => ['', section]),
  ].join('\n')
}

function renderEntryDocument({
  title,
  introLine,
  existingDocument = '',
  repoRoot = defaultRepoRoot,
  ops = fs,
  inlineAlwaysOnRules = true,
  syncCommand = detectSyncCommand({ repoRoot, ops }),
  strings = STRINGS.en,
}) {
  const contextPath = resolveRepoPath(repoRoot, '.ai', 'entrypoints', 'project-context.md')
  const projectContext = exists(contextPath, ops)
    ? ops.readFileSync(contextPath, 'utf8').trim()
    : strings.missingContext
  const sharedRules = renderSharedRulesSection({ repoRoot, ops, inlineAlwaysOnRules, strings })
  const canonicalHead = readCanonicalPreamble({ repoRoot, ops, name: title.replace(/\.md$/i, '').toLowerCase() })
  const preservedPreamble = extractPreservedPreamble(existingDocument, title, canonicalHead)

  const body = [
    `# ${title}`,
    '',
    strings.generated,
    strings.editThenRun(syncCommand),
    '',
    introLine,
    '',
    projectContext,
    '',
    sharedRules,
    '',
  ].join('\n')
  // preservedPreamble 已以空行結尾；沒有前言時檔案直接從標題開始
  return `${preservedPreamble}${body}`
}

function checkAgentsDocBudget(document) {
  const bytes = Buffer.byteLength(document, 'utf8')
  if (bytes <= CODEX_PROJECT_DOC_MAX_BYTES) return null
  return `AGENTS.md is ${bytes} bytes, over Codex's default project_doc_max_bytes (${CODEX_PROJECT_DOC_MAX_BYTES}); Codex will not read past that limit. Add \`paths\` frontmatter to large always-on rules or shorten .ai/entrypoints/project-context.md.`
}

function writeEntryDocuments({
  repoRoot = defaultRepoRoot,
  ops = fs,
  ruleTargets = RULE_TARGETS,
  locale = DEFAULT_CONFIG.locale,
} = {}) {
  const strings = STRINGS[locale]
  const claudePath = resolveRepoPath(repoRoot, 'CLAUDE.md')
  const agentsPath = resolveRepoPath(repoRoot, 'AGENTS.md')
  const existingClaudeDoc = exists(claudePath, ops) ? ops.readFileSync(claudePath, 'utf8') : ''
  const existingAgentsDoc = exists(agentsPath, ops) ? ops.readFileSync(agentsPath, 'utf8') : ''

  // Claude Code 會自己從 .claude/rules/ 載入規則；有同步到那裡時，CLAUDE.md 只放索引，避免同一份規則載入兩次。
  const claudeDoc = renderEntryDocument({
    title: 'CLAUDE.md',
    introLine: strings.introClaude,
    existingDocument: existingClaudeDoc,
    repoRoot,
    ops,
    inlineAlwaysOnRules: !ruleTargets.includes('.claude'),
    strings,
  })

  const agentsDoc = renderEntryDocument({
    title: 'AGENTS.md',
    introLine: strings.introAgents,
    existingDocument: existingAgentsDoc,
    repoRoot,
    ops,
    strings,
  })

  ops.writeFileSync(claudePath, claudeDoc, 'utf8')
  ops.writeFileSync(agentsPath, agentsDoc, 'utf8')

  return [checkAgentsDocBudget(agentsDoc), ...checkRuleFrontmatter(readRules({ repoRoot, ops }))].filter(Boolean)
}

// rules、workflows 這類「整個資料夾對應整個資料夾」的目標：
// 實體資料夾一律逐項複製並只清掉 sync 自己留下的舊項目，其他工具或使用者放進來的檔案不動；
// 只有在 symlink 模式且目標還不是實體資料夾時，才把整個資料夾 symlink 到 .ai/。
function syncFolderEntries({ sourceDir, targetDirs, targetRelativePath, previous = [], preferCopy, ops = fs }) {
  if (!exists(sourceDir, ops)) {
    // 來源整個被刪掉時，仍要清掉上次同步過去的副本（只動實體資料夾裡記錄過的名稱）
    for (const targetDir of targetDirs) {
      if (isRealDirectory(targetDir, ops)) pruneStaleEntries({ previous, current: [], targetDirs: [targetDir], ops })
    }
    return []
  }
  const entries = listEntries(sourceDir, ops)
  for (const targetDir of targetDirs) {
    ensureDir(path.dirname(targetDir), ops)
    if (!preferCopy && !isRealDirectory(targetDir, ops)) {
      syncSharedDirectoryTarget({ linkPath: targetDir, sourcePath: sourceDir, targetRelativePath, ops, preferCopy: false })
      continue
    }
    ensureRealDir(targetDir, ops)
    pruneStaleEntries({ previous, current: entries, targetDirs: [targetDir], ops })
    copyEntries({ sourceDir, targetDir, entries, ops })
  }
  return entries
}

function syncRules({
  repoRoot = defaultRepoRoot,
  ruleTargets = RULE_TARGETS,
  legacyRuleTargets = LEGACY_RULE_TARGETS,
  previousRules = [],
  ops = fs,
  preferCopy = false,
} = {}) {
  const entries = syncFolderEntries({
    sourceDir: resolveRepoPath(repoRoot, '.ai', 'rules'),
    targetDirs: ruleTargets.map((root) => resolveRepoPath(repoRoot, root, 'rules')),
    targetRelativePath: '../.ai/rules',
    previous: previousRules,
    preferCopy,
    ops,
  })

  for (const root of legacyRuleTargets) {
    if (ruleTargets.includes(root)) continue
    pruneLegacyRuleTarget({
      targetPath: resolveRepoPath(repoRoot, root, 'rules'),
      targetRelativePath: '../.ai/rules',
      ops,
    })
  }
  return entries
}

// 每個工具的 skills 根目錄一律是實體資料夾（兩種模式都是），裡面放其他工具的 skill；
// 每個同步出去的 skill 資料夾則完整對應它的來源。
function syncSkills({
  repoRoot = defaultRepoRoot,
  skillTargets = SKILL_TARGETS,
  sharedSkills = collectSkillDirs({ repoRoot }),
  previousSkills = [],
  ops = fs,
  preferCopy = false,
} = {}) {
  for (const root of skillTargets) {
    const skillsRootPath = resolveRepoPath(repoRoot, root, 'skills')
    ensureRealDir(skillsRootPath, ops)
    pruneStaleEntries({ previous: previousSkills, current: sharedSkills, targetDirs: [skillsRootPath], ops })

    for (const skill of sharedSkills) {
      syncSharedDirectoryTarget({
        linkPath: resolveRepoPath(repoRoot, root, 'skills', skill),
        sourcePath: resolveRepoPath(repoRoot, '.ai', 'skills', skill),
        targetRelativePath: `../../.ai/skills/${skill}`,
        ops,
        preferCopy,
      })
    }
  }
}

function collectCommandFiles({ repoRoot = defaultRepoRoot, ops = fs } = {}) {
  return collectMarkdownFiles(resolveRepoPath(repoRoot, '.ai', 'commands'), ops)
    .map((filePath) => path.basename(filePath))
}

function syncCommands({
  repoRoot = defaultRepoRoot,
  commandTargets = COMMAND_TARGETS,
  commandFiles = collectCommandFiles({ repoRoot }),
  previousCommands = [],
  ops = fs,
} = {}) {
  for (const root of commandTargets) {
    // command 一律逐檔複製；目標若是指向 .ai/commands 的 symlink，複製等於寫回正本，所以先換成實體資料夾
    const targetDir = resolveRepoPath(repoRoot, root, 'commands')
    ensureRealDir(targetDir, ops)
    pruneStaleEntries({ previous: previousCommands, current: commandFiles, targetDirs: [targetDir], ops })

    for (const file of commandFiles) {
      ops.copyFileSync(
        resolveRepoPath(repoRoot, '.ai', 'commands', file),
        resolveRepoPath(repoRoot, root, 'commands', file),
      )
    }
  }
}

function renderCommandSkill({ commandName, fileName, markdown }) {
  const skillName = `${COMMAND_SKILL_PREFIX}${commandName}`
  const description = readFrontmatterField(markdown, 'description')
    || `Run the ${commandName} command from .ai/commands/${fileName}`
  const body = markdown.replace(FRONTMATTER_PATTERN, '').trim()
  return [
    '---',
    `name: ${skillName}`,
    // JSON 字串也是合法的 YAML 雙引號字串，可安全處理冒號、引號等字元
    `description: ${JSON.stringify(description)}`,
    '---',
    '',
    `<!-- Generated from .ai/commands/${fileName} by scripts/sync-agent-assets.mjs. Edit the source, not this file. -->`,
    '',
    `Use this skill when the user asks to run the \`${commandName}\` command.`,
    '',
    body,
    '',
  ].join('\n')
}

function syncCommandSkills({
  repoRoot = defaultRepoRoot,
  targets = COMMAND_SKILL_TARGETS,
  commandFiles = collectCommandFiles({ repoRoot }),
  previousCommandSkills = [],
  ops = fs,
} = {}) {
  const warnings = []
  const wrapped = commandFiles.filter((fileName) => {
    if (COMMAND_NAME_PATTERN.test(path.basename(fileName, '.md'))) return true
    warnings.push(`.ai/commands/${fileName} was not wrapped as a Codex skill: rename it to lowercase letters, digits and hyphens.`)
    return false
  })
  const skillNames = wrapped.map((file) => `${COMMAND_SKILL_PREFIX}${path.basename(file, '.md')}`)

  for (const root of targets) {
    const skillsRootPath = resolveRepoPath(repoRoot, root, 'skills')
    ensureRealDir(skillsRootPath, ops)
    pruneStaleEntries({ previous: previousCommandSkills, current: skillNames, targetDirs: [skillsRootPath], ops })
  }

  for (const fileName of wrapped) {
    const commandName = path.basename(fileName, '.md')
    const markdown = ops.readFileSync(resolveRepoPath(repoRoot, '.ai', 'commands', fileName), 'utf8')
    const content = renderCommandSkill({ commandName, fileName, markdown })
    for (const root of targets) {
      const skillDir = resolveRepoPath(repoRoot, root, 'skills', `${COMMAND_SKILL_PREFIX}${commandName}`)
      ensureRealDir(skillDir, ops)
      ops.writeFileSync(path.join(skillDir, 'SKILL.md'), content, 'utf8')
    }
  }
  return { skillNames, warnings }
}

function syncWorkflows({
  repoRoot = defaultRepoRoot,
  workflowTargets = WORKFLOW_TARGETS,
  previousWorkflows = [],
  ops = fs,
  preferCopy = false,
} = {}) {
  return syncFolderEntries({
    sourceDir: resolveRepoPath(repoRoot, '.ai', 'workflows'),
    targetDirs: workflowTargets.map((root) => resolveRepoPath(repoRoot, root, 'workflows')),
    targetRelativePath: '../.ai/workflows',
    previous: previousWorkflows,
    preferCopy,
    ops,
  })
}

function syncAgentAssets({
  repoRoot = defaultRepoRoot,
  ruleTargets = RULE_TARGETS,
  ops = fs,
  config = readConfig({ repoRoot, ops }),
  preferCopy = config.linkMode === 'copy',
} = {}) {
  const { state: previous, warnings: stateWarnings } = readSyncState({ repoRoot, ops })
  const skills = collectSkillDirs({ repoRoot, ops })
  const commands = collectCommandFiles({ repoRoot, ops })

  const entryWarnings = writeEntryDocuments({ repoRoot, ops, ruleTargets, locale: config.locale })
  const rules = syncRules({ repoRoot, ruleTargets, ops, preferCopy, previousRules: previous.rules })
  syncSkills({ repoRoot, ops, preferCopy, sharedSkills: skills, previousSkills: previous.skills })
  syncCommands({ repoRoot, ops, commandFiles: commands, previousCommands: previous.commands })
  const { skillNames: commandSkills, warnings: commandWarnings } = syncCommandSkills({
    repoRoot,
    ops,
    commandFiles: commands,
    previousCommandSkills: previous.commandSkills,
  })
  const workflows = syncWorkflows({ repoRoot, ops, preferCopy, previousWorkflows: previous.workflows })
  writeSyncState({ repoRoot, ops, state: { rules, workflows, skills, commands, commandSkills } })
  return { warnings: [...stateWarnings, ...entryWarnings, ...commandWarnings] }
}

function main() {
  const { warnings } = syncAgentAssets()
  for (const warning of warnings) console.warn(`Warning: ${warning}`)
  console.log('Synced agent assets from .ai/')
}

const isDirectExecution =
  process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href

if (isDirectExecution) {
  main()
}

export {
  CODEX_PROJECT_DOC_MAX_BYTES,
  parseRuleFrontmatter,
  renderEntryDocument,
  renderSharedRulesSection,
  syncAgentAssets,
}
