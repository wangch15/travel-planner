const acorn = require('acorn');
const { isDeepStrictEqual, types } = require('node:util');
const { parseLiteralModule, dataError, MAX_TEXT_BYTES } = require('./literal-data.cjs');

const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const DAY_FIELDS = new Set(['title', 'theme', 'lead', 'stops', 'alts', 'cautions', 'color']);

function invalidEdit() {
  return Object.assign(new Error('單日修改資料不完整、超出範圍，或來源包含無法安全修改的共用資料。'), { code: 'INVALID_DAY_EDIT' });
}

// Inspect descriptors before copying so accessors/toJSON never run. This API
// accepts plain JSON data, including dense arrays, not arbitrary JS objects.
function copyProposal(input) {
  let nodes = 0;
  let bytes = 0;
  const ancestors = new Set();
  function copy(value, depth = 0) {
    if (++nodes > 200000 || depth > 128) throw dataError('INPUT_LIMIT');
    if (typeof value === 'string') {
      bytes += Buffer.byteLength(value, 'utf8');
      if (bytes > MAX_TEXT_BYTES) throw dataError('INPUT_LIMIT');
      return value;
    }
    if (value === null || typeof value === 'boolean') return value;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (!value || typeof value !== 'object' || types.isProxy(value) || ancestors.has(value)) throw invalidEdit();
    const array = Array.isArray(value);
    const prototype = Object.getPrototypeOf(value);
    if (array ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) throw invalidEdit();
    const keys = Reflect.ownKeys(value);
    if (array && (value.length > 200000 || keys.length !== value.length + 1)) throw invalidEdit();
    const result = array ? [] : {};
    ancestors.add(value);
    for (const key of keys) {
      if (array && key === 'length') continue;
      if (typeof key !== 'string' || FORBIDDEN_KEYS.has(key)) throw invalidEdit();
      if (array && (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length)) throw invalidEdit();
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) throw invalidEdit();
      bytes += Buffer.byteLength(key, 'utf8');
      if (bytes > MAX_TEXT_BYTES) throw dataError('INPUT_LIMIT');
      result[key] = copy(descriptor.value, depth + 1);
    }
    ancestors.delete(value);
    return result;
  }
  return copy(input);
}

// Only called on copyProposal's bounded, accessor-free JSON tree. Keep -0 as
// numeric syntax; JSON.stringify would silently convert it to positive zero.
function serializeProposal(value, depth = 0) {
  if (Object.is(value, -0)) return '-0';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  const array = Array.isArray(value);
  const entries = array ? value : Object.keys(value);
  if (!entries.length) return array ? '[]' : '{}';
  const indentation = '  '.repeat(depth + 1);
  const lines = entries.map((entry) => indentation + (array
    ? serializeProposal(entry, depth + 1)
    : JSON.stringify(entry) + ': ' + serializeProposal(value[entry], depth + 1)));
  return (array ? '[' : '{') + '\n' + lines.join(',\n') + '\n'
    + '  '.repeat(depth) + (array ? ']' : '}');
}

// The literal parser already established the full grammar and reference order.
// Walk only expression values: object keys and const bindings are not usages.
function editableDayExpression(source, index) {
  const ast = acorn.parse(source, { ecmaVersion: 2022, sourceType: 'script' });
  const constants = new Map();
  const references = new Map();
  let exported;
  function countReferences(node) {
    if (node.type === 'Identifier') references.set(node.name, (references.get(node.name) || 0) + 1);
    else if (node.type === 'ArrayExpression') node.elements.forEach(countReferences);
    else if (node.type === 'ObjectExpression') node.properties.forEach((property) => countReferences(property.value));
    else if (node.type === 'UnaryExpression') countReferences(node.argument);
  }
  for (const statement of ast.body) {
    if (statement.type === 'VariableDeclaration') {
      for (const declaration of statement.declarations) {
        constants.set(declaration.id.name, declaration.init);
        countReferences(declaration.init);
      }
      continue;
    }
    let candidate = statement;
    if (candidate.type === 'IfStatement') candidate = candidate.consequent;
    if (candidate.type === 'BlockStatement') candidate = candidate.body[0];
    if (candidate.type === 'ExpressionStatement' && candidate.expression.type === 'AssignmentExpression') {
      exported = candidate.expression.right;
      countReferences(exported);
    }
  }
  function resolveExclusive(node) {
    while (node && node.type === 'Identifier') {
      if (references.get(node.name) !== 1) throw invalidEdit();
      node = constants.get(node.name);
    }
    if (!node) throw invalidEdit();
    return node;
  }
  const exportObject = resolveExclusive(exported);
  if (exportObject.type !== 'ObjectExpression') throw invalidEdit();
  const property = exportObject.properties.find((entry) => (entry.key.name ?? entry.key.value) === 'DAYS');
  if (!property) throw invalidEdit();
  const days = resolveExclusive(property.value);
  if (days.type !== 'ArrayExpression') throw invalidEdit();
  const selected = resolveExclusive(days.elements[index]);
  if (selected.type !== 'ObjectExpression') throw invalidEdit();
  return selected;
}

/** Propose a replacement for exactly one day; never execute code or write files. */
function replaceDay(source, dayId, replacementDay) {
  const original = parseLiteralModule(source);
  if (!Number.isSafeInteger(dayId) || !original || !Array.isArray(original.DAYS)) throw invalidEdit();
  const matches = original.DAYS.flatMap((day, index) => day && day.id === dayId ? [index] : []);
  if (matches.length !== 1) throw invalidEdit();
  const index = matches[0];
  const before = original.DAYS[index];
  const after = copyProposal(replacementDay);
  if (!after || Array.isArray(after) || typeof after !== 'object'
    || after.id !== dayId || after.id !== before.id || after.date !== before.date || typeof after.date !== 'string') throw invalidEdit();
  for (const key of Object.keys(after)) {
    if (!Object.hasOwn(before, key) && !DAY_FIELDS.has(key)) throw invalidEdit();
  }
  for (const key of ['title', 'theme', 'lead', 'color']) {
    if (Object.hasOwn(after, key) && typeof after[key] !== 'string') throw invalidEdit();
  }
  for (const key of ['stops', 'alts', 'cautions']) {
    if (Object.hasOwn(after, key) && !Array.isArray(after[key])) throw invalidEdit();
  }
  const selected = editableDayExpression(source, index);
  if (isDeepStrictEqual(before, after)) return { source, before, after, changed: false };
  const indentation = source.slice(source.lastIndexOf('\n', selected.start - 1) + 1, selected.start).match(/^[\t ]*/)[0];
  const newline = source.includes('\r\n') ? '\r\n' : '\n';
  const serialized = serializeProposal(after).replace(/\n/g, newline + indentation);
  const candidate = source.slice(0, selected.start) + serialized + source.slice(selected.end);
  const parsed = parseLiteralModule(candidate);
  const expected = { ...original, DAYS: original.DAYS.map((day, position) => position === index ? after : day) };
  if (!isDeepStrictEqual(parsed, expected)) throw invalidEdit();
  return { source: candidate, before, after, changed: true };
}

module.exports = { replaceDay };
