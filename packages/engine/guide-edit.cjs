const { isDeepStrictEqual } = require('node:util');
const { parseLiteralModule } = require('./literal-data.cjs');
const { copyProposal, serializeProposal, exportObjectNode, invalidEdit } = require('./day-edit.cjs');
const { ID } = require('./stay-guides.cjs');

const keyOf = (property) => property.key.name ?? property.key.value;
const isPlain = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const EXPORT_NAME = /^[A-Z][A-Z_]{0,40}$/;

/** Propose data.js with one top-level export replaced; never execute code or write files.
 * Source outside that expression is preserved. A missing export gets a new const
 * before the export statement plus a shorthand key. kind is 'array' or 'object'. */
function replaceExport(source, key, value, kind = 'array') {
  if (!EXPORT_NAME.test(key) || key === 'DAYS') throw invalidEdit();
  const original = parseLiteralModule(source);
  if (!isPlain(original)) throw invalidEdit();
  const after = copyProposal(value);
  if (kind === 'array' ? !Array.isArray(after) : !isPlain(after)) throw invalidEdit();
  const before = Object.hasOwn(original, key) ? original[key] : (kind === 'array' ? [] : {});
  if (isDeepStrictEqual(before, after)) return { source, before, after, changed: false };

  const { ast, exportObject, resolveExclusive, constants } = exportObjectNode(source);
  const newline = source.includes('\r\n') ? '\r\n' : '\n';
  const property = exportObject.properties.find((entry) => keyOf(entry) === key);
  let candidate;
  if (property) {
    const node = resolveExclusive(property.value);
    if (node.type !== (kind === 'array' ? 'ArrayExpression' : 'ObjectExpression')) throw invalidEdit();
    const indentation = source.slice(source.lastIndexOf('\n', node.start - 1) + 1, node.start).match(/^[\t ]*/)[0];
    const serialized = serializeProposal(after).replace(/\n/g, newline + indentation);
    candidate = source.slice(0, node.start) + serialized + source.slice(node.end);
  } else {
    // A const with the same name that is not exported would collide; refuse instead of guessing.
    if (constants.has(key)) throw invalidEdit();
    const statement = ast.body.find((s) => s.type !== 'VariableDeclaration' && s.start <= exportObject.start && s.end >= exportObject.end)
      || ast.body.filter((s) => s.type !== 'VariableDeclaration' && s.type !== 'EmptyStatement').at(-1);
    if (!statement) throw invalidEdit();
    const last = exportObject.properties.at(-1);
    const keyInsert = last ? { at: last.end, text: ', ' + key } : { at: exportObject.start + 1, text: ' ' + key + ' ' };
    const declaration = 'const ' + key + ' = ' + serializeProposal(after).replace(/\n/g, newline) + ';' + newline + newline;
    // keyInsert lies after the declaration point, so apply it first to keep offsets valid.
    const withKey = source.slice(0, keyInsert.at) + keyInsert.text + source.slice(keyInsert.at);
    candidate = withKey.slice(0, statement.start) + declaration + withKey.slice(statement.start);
  }
  const parsed = parseLiteralModule(candidate);
  if (!isDeepStrictEqual(parsed, { ...original, [key]: after })) throw invalidEdit();
  return { source: candidate, before, after, changed: true };
}

const replaceStayGuides = (source, guides) => replaceExport(source, 'STAY_GUIDES', guides, 'array');

/** Change only PLACES[key].note in data.js (null removes it); coordinates, names and
 * every other character of the file stay as written, including comments. */
function replacePlaceNote(source, key, note) {
  if (typeof key !== 'string' || !key || (note !== null && (typeof note !== 'string' || !note.trim() || note.length > 300))) throw invalidEdit();
  const original = parseLiteralModule(source);
  const place = original?.PLACES?.[key];
  if (!isPlain(place)) throw invalidEdit();
  if ((place.note ?? null) === note) return { source, changed: false };
  const { exportObject, resolveExclusive } = exportObjectNode(source);
  const placesProperty = exportObject.properties.find((entry) => keyOf(entry) === 'PLACES');
  if (!placesProperty) throw invalidEdit();
  const places = resolveExclusive(placesProperty.value);
  if (places.type !== 'ObjectExpression') throw invalidEdit();
  const entry = places.properties.find((p) => keyOf(p) === key);
  if (!entry) throw invalidEdit();
  const node = resolveExclusive(entry.value);
  if (node.type !== 'ObjectExpression') throw invalidEdit();
  const existing = node.properties.find((p) => keyOf(p) === 'note');
  let candidate;
  if (existing && note !== null) {
    candidate = source.slice(0, existing.value.start) + JSON.stringify(note) + source.slice(existing.value.end);
  } else if (existing) {
    // Remove "note: ..." together with the comma that separates it from a neighbour.
    const index = node.properties.indexOf(existing);
    const [from, to] = index > 0 ? [node.properties[index - 1].end, existing.end]
      : node.properties[1] ? [existing.start, node.properties[1].start] : [existing.start, existing.end];
    candidate = source.slice(0, from) + source.slice(to);
  } else {
    const last = node.properties.at(-1);
    candidate = last ? source.slice(0, last.end) + ', note: ' + JSON.stringify(note) + source.slice(last.end)
      : source.slice(0, node.start + 1) + ' note: ' + JSON.stringify(note) + ' ' + source.slice(node.start + 1);
  }
  const expectedPlace = { ...place }; if (note === null) delete expectedPlace.note; else expectedPlace.note = note;
  const parsed = parseLiteralModule(candidate);
  if (!isDeepStrictEqual(parsed, { ...original, PLACES: { ...original.PLACES, [key]: expectedPlace } })) throw invalidEdit();
  return { source: candidate, changed: true };
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

module.exports = { replaceExport, replaceStayGuides, replacePlaceNote, mergeStayGuides };
