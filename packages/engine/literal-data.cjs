const acorn = require('acorn');

const MAX_TEXT_BYTES = 4 * 1024 * 1024;
const MAX_NODES = 200000;
const MAX_DEPTH = 128;
const forbidden = new Set(['__proto__', 'prototype', 'constructor']);

function dataError(code = 'INCOMPATIBLE_DATA') {
  const messages = {
    INCOMPATIBLE_DATA: '此行程使用桌面版尚不支援的資料格式；請改成純資料後再匯入。',
    INPUT_LIMIT: '行程資料超過桌面版可讀取的大小或複雜度上限。',
    UNSAFE_PATH: '行程包含不安全的檔案路徑或連結，無法匯入。',
    INVALID_TRIP: '行程資料未通過驗證；請先使用模板的資料檢查修正。',
    READ_FAILED: '無法讀取行程資料；請確認資料夾與檔案仍可使用。',
    SOURCE_CHANGED: '行程檔案在讀取期間改變，請重新匯入。',
  };
  return Object.assign(new Error(messages[code] || messages.INCOMPATIBLE_DATA), { code });
}

function budget() {
  let count = 0;
  return (depth) => { if (++count > MAX_NODES || depth > MAX_DEPTH) throw dataError('INPUT_LIMIT'); };
}

// Also used after JSON.parse: no prototype keys or unbounded nested structures.
function copyLiteral(value, visit = budget(), depth = 0) {
  visit(depth);
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.map((item) => copyLiteral(item, visit, depth + 1));
  if (!value || typeof value !== 'object') throw dataError();
  const out = {};
  for (const key of Object.keys(value)) {
    if (forbidden.has(key)) throw dataError();
    out[key] = copyLiteral(value[key], visit, depth + 1);
  }
  return out;
}

function parseLiteralModule(source) {
  if (typeof source !== 'string') throw dataError();
  if (Buffer.byteLength(source, 'utf8') > MAX_TEXT_BYTES) throw dataError('INPUT_LIMIT');
  let ast;
  try { ast = acorn.parse(source, { ecmaVersion: 2022, sourceType: 'script' }); }
  catch (e) { throw dataError(e instanceof RangeError ? 'INPUT_LIMIT' : 'INCOMPATIBLE_DATA'); }
  const constants = new Map();
  const visit = budget();
  function evaluate(node, depth = 0) {
    visit(depth);
    if (!node) throw dataError();
    switch (node.type) {
      case 'Literal':
        if (node.regex || node.bigint || (typeof node.value === 'number' && !Number.isFinite(node.value))) throw dataError();
        return node.value;
      case 'TemplateLiteral':
        if (node.expressions.length || node.quasis.length !== 1 || node.quasis[0].value.cooked === null) throw dataError();
        return node.quasis[0].value.cooked;
      case 'Identifier':
        if (!constants.has(node.name)) throw dataError();
        return copyLiteral(constants.get(node.name), visit, depth);
      case 'UnaryExpression':
        if (node.operator !== '-' || node.argument.type !== 'Literal' || typeof node.argument.value !== 'number' || !Number.isFinite(node.argument.value)) throw dataError();
        return -node.argument.value;
      case 'ArrayExpression':
        return node.elements.map((item) => evaluate(item, depth + 1));
      case 'ObjectExpression': {
        const value = {};
        for (const prop of node.properties) {
          if (prop.type !== 'Property' || prop.kind !== 'init' || prop.method || prop.computed) throw dataError();
          if (!['Identifier', 'Literal'].includes(prop.key.type)) throw dataError();
          const key = prop.key.type === 'Identifier' ? prop.key.name : String(prop.key.value);
          if (forbidden.has(key) || Object.hasOwn(value, key)) throw dataError();
          value[key] = evaluate(prop.value, depth + 1);
        }
        return value;
      }
      default: throw dataError();
    }
  }
  let exported = false;
  let result;
  for (const statement of ast.body) {
    if (statement.type === 'EmptyStatement') continue;
    if (statement.type === 'ExpressionStatement' && statement.directive === 'use strict' && !exported) continue;
    if (statement.type === 'VariableDeclaration' && statement.kind === 'const' && !exported) {
      for (const declaration of statement.declarations) {
        if (declaration.id.type !== 'Identifier' || !declaration.init || ['module', 'exports'].includes(declaration.id.name) || constants.has(declaration.id.name)) throw dataError();
        constants.set(declaration.id.name, evaluate(declaration.init));
      }
      continue;
    }
    let exportStatement = statement;
    if (statement.type === 'IfStatement') {
      // Recognize the conventional browser/CommonJS wrapper structurally only.
      // Its condition is never evaluated; the enclosed export uses the same
      // literal-only evaluator and duplicate-export checks as a direct export.
      const condition = statement.test;
      if (statement.alternate || condition.type !== 'BinaryExpression' || condition.operator !== '!=='
        || condition.left.type !== 'UnaryExpression' || condition.left.operator !== 'typeof'
        || condition.left.argument.type !== 'Identifier' || condition.left.argument.name !== 'module'
        || condition.right.type !== 'Literal' || condition.right.value !== 'undefined') throw dataError();
      exportStatement = statement.consequent;
      if (exportStatement.type === 'BlockStatement') {
        if (exportStatement.body.length !== 1) throw dataError();
        exportStatement = exportStatement.body[0];
      }
    }
    const assignment = exportStatement.type === 'ExpressionStatement' && exportStatement.expression;
    const left = assignment && assignment.left;
    if (exported || !assignment || assignment.type !== 'AssignmentExpression' || assignment.operator !== '=' || !left || left.type !== 'MemberExpression' || left.computed || left.object.type !== 'Identifier' || left.object.name !== 'module' || left.property.name !== 'exports') throw dataError();
    result = evaluate(assignment.right);
    exported = true;
  }
  if (!exported) throw dataError();
  return result;
}

module.exports = { parseLiteralModule, copyLiteral, dataError, MAX_TEXT_BYTES };
