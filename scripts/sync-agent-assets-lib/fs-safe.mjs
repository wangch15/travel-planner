import fs from 'node:fs'
import path from 'node:path'

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

function readJsonIfExists(filePath, ops = fs) {
  if (!exists(filePath, ops)) return null
  try {
    return JSON.parse(ops.readFileSync(filePath, 'utf8'))
  } catch (error) {
    throw new Error(`Cannot parse ${filePath}: ${error.message}`)
  }
}

// 用字元碼排序，不用 localeCompare：語系不同的機器排出來的順序不同，產物就不再是相同的 bytes。
function compareCodePoint(a, b) {
  if (a < b) return -1
  return a > b ? 1 : 0
}

// state 檔可能被手改或 merge 壞掉；名稱只接受單一層的檔名，否則清除舊副本時可能刪到資料夾外面。
function isSafeEntryName(name) {
  return typeof name === 'string'
    && name !== '' && name !== '.' && name !== '..'
    && !/[\\/]/.test(name)
    && path.basename(name) === name
}

function isInsideDir(dir, target) {
  const relative = path.relative(dir, target)
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative)
}

// 只刪「上次由 sync 產生、這次來源已不存在」的項目；其他工具產生的內容（例如 spectra-*）從未記在 state 裡，不會被碰到。
// 呼叫前目標資料夾必須已是實體資料夾，否則刪除會穿過 symlink 刪到 .ai/ 正本。
function pruneStaleEntries({ previous, current, targetDirs, ops = fs }) {
  const stale = previous.filter((name) => isSafeEntryName(name) && !current.includes(name))
  for (const dir of targetDirs) {
    if (!exists(dir, ops) || ops.lstatSync(dir).isSymbolicLink()) continue
    for (const name of stale) {
      const target = path.join(dir, name)
      if (isInsideDir(dir, target)) removePathIfExists(target, ops)
    }
  }
}

// 目標資料夾必須是實體資料夾：
// - symlink（例如 .claude/skills -> ../.ai/skills）要先拿掉，否則往裡面寫檔會直接寫進 .ai/ 正本；
// - Windows 在 core.symlinks=false 下 clone，committed 的 symlink 會變成內容是路徑的純文字檔，也要換掉。
function ensureRealDir(dirPath, ops = fs) {
  try {
    const stat = ops.lstatSync(dirPath)
    if (stat.isSymbolicLink()) ops.unlinkSync(dirPath)
    else if (!stat.isDirectory()) ops.rmSync(dirPath, { force: true })
  } catch {}
  ensureDir(dirPath, ops)
}

function isSamePath(a, b, ops = fs) {
  try {
    return ops.realpathSync(a) === ops.realpathSync(b)
  } catch {
    return false
  }
}

// 逐項複製：只覆蓋來源有的項目，目標資料夾裡其他工具或使用者放的東西不動。
function copyEntries({ sourceDir, targetDir, entries, ops = fs }) {
  for (const entry of entries) {
    const sourcePath = path.join(sourceDir, entry)
    const targetPath = path.join(targetDir, entry)
    if (isSamePath(sourcePath, targetPath, ops)) continue
    ops.rmSync(targetPath, { recursive: true, force: true })
    ops.cpSync(sourcePath, targetPath, { recursive: true, force: true, dereference: true })
  }
}

function listEntries(dirPath, ops = fs) {
  if (!exists(dirPath, ops)) return []
  return ops.readdirSync(dirPath).filter((entry) => entry !== '.DS_Store').sort(compareCodePoint)
}

function isRealDirectory(dirPath, ops = fs) {
  try {
    const stat = ops.lstatSync(dirPath)
    return stat.isDirectory() && !stat.isSymbolicLink()
  } catch {
    return false
  }
}

export {
  exists,
  ensureDir,
  removePathIfExists,
  readJsonIfExists,
  compareCodePoint,
  isSafeEntryName,
  isInsideDir,
  pruneStaleEntries,
  ensureRealDir,
  isSamePath,
  copyEntries,
  listEntries,
  isRealDirectory,
}
