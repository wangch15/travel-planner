const { isDeepStrictEqual } = require('node:util');
const { parseLiteralModule } = require('./literal-data.cjs');
const { copyProposal, serializeProposal, exportObjectNode, invalidEdit } = require('./day-edit.cjs');
const { ID } = require('./stay-guides.cjs');

const KEY = 'STAY_GUIDES';
const keyOf = (property) => property.key.name ?? property.key.value;

/** Propose data.js with a replaced STAY_GUIDES array; never execute code or write files.
 * Source outside the STAY_GUIDES expression is preserved. A trip without the export
 * gets a new `const STAY_GUIDES` before the export statement plus a shorthand key. */
function replaceStayGuides(source, guides) {
  const original = parseLiteralModule(source);
  if (!original || typeof original !== 'object' || Array.isArray(original)) throw invalidEdit();
  const after = copyProposal(guides);
  if (!Array.isArray(after)) throw invalidEdit();
  const before = Object.hasOwn(original, KEY) ? original[KEY] : [];
  if (isDeepStrictEqual(before, after)) return { source, before, after, changed: false };

  const { ast, exportObject, resolveExclusive, constants } = exportObjectNode(source);
  const newline = source.includes('\r\n') ? '\r\n' : '\n';
  const property = exportObject.properties.find((entry) => keyOf(entry) === KEY);
  let candidate;
  if (property) {
    const node = resolveExclusive(property.value);
    if (node.type !== 'ArrayExpression') throw invalidEdit();
    const indentation = source.slice(source.lastIndexOf('\n', node.start - 1) + 1, node.start).match(/^[\t ]*/)[0];
    const serialized = serializeProposal(after).replace(/\n/g, newline + indentation);
    candidate = source.slice(0, node.start) + serialized + source.slice(node.end);
  } else {
    // A const with the same name that is not exported would collide; refuse instead of guessing.
    if (constants.has(KEY)) throw invalidEdit();
    const statement = ast.body.find((s) => s.type !== 'VariableDeclaration' && s.start <= exportObject.start && s.end >= exportObject.end)
      || ast.body.filter((s) => s.type !== 'VariableDeclaration' && s.type !== 'EmptyStatement').at(-1);
    if (!statement) throw invalidEdit();
    const last = exportObject.properties.at(-1);
    const keyInsert = last ? { at: last.end, text: ', ' + KEY } : { at: exportObject.start + 1, text: ' ' + KEY + ' ' };
    const declaration = 'const ' + KEY + ' = ' + serializeProposal(after).replace(/\n/g, newline) + ';' + newline + newline;
    // keyInsert lies after the declaration point, so apply it first to keep offsets valid.
    const withKey = source.slice(0, keyInsert.at) + keyInsert.text + source.slice(keyInsert.at);
    candidate = withKey.slice(0, statement.start) + declaration + withKey.slice(statement.start);
  }
  const parsed = parseLiteralModule(candidate);
  if (!isDeepStrictEqual(parsed, { ...original, [KEY]: after })) throw invalidEdit();
  return { source: candidate, before, after, changed: true };
}

/** AI 回覆的是「要新增或整份取代的指南」與 {id, remove:true} 刪除標記，不是整個陣列；
 * 沒提到的指南維持原樣，避免一次回覆漏掉就把別的住宿指南刪掉。 */
function mergeStayGuides(current, upserts) {
  if (!Array.isArray(upserts)) throw invalidEdit();
  const result = Array.isArray(current) ? current.slice() : [];
  for (const entry of upserts) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry) || typeof entry.id !== 'string' || !ID.test(entry.id)) throw invalidEdit();
    const index = result.findIndex((g) => g && g.id === entry.id);
    if (entry.remove === true) {
      if (Object.keys(entry).some((k) => !['id', 'remove'].includes(k))) throw invalidEdit();
      if (index >= 0) result.splice(index, 1);
    } else if (index >= 0) result[index] = entry;
    else result.push(entry);
  }
  return result;
}

module.exports = { replaceStayGuides, mergeStayGuides };
