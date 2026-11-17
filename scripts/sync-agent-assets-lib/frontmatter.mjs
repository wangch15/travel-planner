const FRONTMATTER_PATTERN = /^---\r?\n(?:([\s\S]*?)\r?\n)?---(?:\r?\n|$)/

function unquote(value) {
  const trimmed = value.trim()
  const quoted = trimmed.match(/^(['"])(.*)\1$/)
  return quoted ? quoted[2] : trimmed
}

// 只在引號與 `{}` 之外的逗號切開：`*.{ts,tsx}` 這類 brace expansion 是同一個 pattern。
function splitInlineList(value) {
  const inner = unquote(value).replace(/^\[(.*)\]$/, '$1')
  const items = []
  let current = ''
  let braceDepth = 0
  let quote = null

  for (const char of inner) {
    if (quote) {
      if (char === quote) quote = null
    } else if (char === '"' || char === "'") {
      quote = char
    } else if (char === '{') {
      braceDepth += 1
    } else if (char === '}') {
      braceDepth -= 1
    } else if (char === ',' && braceDepth === 0) {
      items.push(current)
      current = ''
      continue
    }
    current += char
  }

  return [...items, current].map(unquote).filter(Boolean)
}

// 只解析 `paths`：Claude Code 只讀這個欄位，其他欄位（例如 Antigravity 的 trigger）原樣保留在檔案裡。
function parseRuleFrontmatter(markdown) {
  const match = markdown.match(FRONTMATTER_PATTERN)
  if (!match) return { paths: [], hasGlobs: false, body: markdown.trim() }

  const paths = []
  let isReadingPathsList = false
  // Cursor 風格的 `globs:` Claude Code 不認，只記下來拿去警告
  let hasGlobs = false
  for (const line of (match[1] ?? '').split(/\r?\n/)) {
    if (/^globs:/.test(line)) hasGlobs = true
    const listItem = line.match(/^\s*-\s+(.+)$/)
    if (isReadingPathsList && listItem) {
      paths.push(unquote(listItem[1]))
      continue
    }

    const pathsField = line.match(/^paths:\s*(.*)$/)
    isReadingPathsList = Boolean(pathsField) && pathsField[1].trim() === ''
    if (pathsField && !isReadingPathsList) paths.push(...splitInlineList(pathsField[1]))
  }

  return { paths: paths.filter(Boolean), hasGlobs, body: markdown.slice(match[0].length).trim() }
}

// 讀一個單純的 YAML 純量：支援 `|` / `>` 多行、單雙引號、未加引號值後面的 `# 註解`。
// 多行一律合成一行，因為 skill 的 description 是一行觸發說明。
function readYamlScalar(lines, index, field) {
  const raw = lines[index].slice(field.length + 1).trim()
  if (/^[|>][+-]?\d*$/.test(raw)) {
    const continuation = []
    for (const line of lines.slice(index + 1)) {
      if (line.trim() !== '' && !/^\s/.test(line)) break
      continuation.push(line.trim())
    }
    return continuation.filter(Boolean).join(' ')
  }
  // 引號值先完整取出引號內文，後面可能還接著 `# 註解`
  const doubleQuoted = raw.match(/^"((?:[^"\\]|\\.)*)"\s*(?:#.*)?$/)
  if (doubleQuoted) {
    try {
      return JSON.parse(`"${doubleQuoted[1]}"`)
    } catch {
      return doubleQuoted[1]
    }
  }
  const singleQuoted = raw.match(/^'((?:[^']|'')*)'\s*(?:#.*)?$/)
  if (singleQuoted) return singleQuoted[1].replace(/''/g, "'")
  return raw.replace(/\s+#.*$/, '').trim()
}

function readFrontmatterField(markdown, field) {
  const lines = (markdown.match(FRONTMATTER_PATTERN)?.[1] ?? '').split(/\r?\n/)
  const index = lines.findIndex((item) => item.startsWith(`${field}:`))
  return index === -1 ? '' : readYamlScalar(lines, index, field)
}

export {
  FRONTMATTER_PATTERN,
  unquote,
  splitInlineList,
  parseRuleFrontmatter,
  readYamlScalar,
  readFrontmatterField,
}
