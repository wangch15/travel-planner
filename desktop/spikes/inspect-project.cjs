const fs = require('node:fs/promises');
const { constants } = require('node:fs');
const path = require('node:path');
const { SCHEMA_VERSION, DEPLOY_NAME } = require('../../scripts/lib/schema.js');

const MAX_JSON_BYTES = 256 * 1024;
const MAX_TRIPS = 250;
const DATA_FILES = ['data.js', 'details.js', 'dining.js', 'map-lists.js', 'photos.json'];

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

// Fixed metadata only. No require/import of anything inside the selected project.
// These checks bound the read-only spike; they are not an OS sandbox for an agent.
async function entry(root, segments) {
  let file = root;
  let stat;
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    if (!segment || segment === '.' || segment === '..' || /[\\/\0]/.test(segment)) fail('invalid-path');
    file = path.join(file, segment);
    stat = await fs.lstat(file);
    if (stat.isSymbolicLink() || (stat.isFile() && stat.nlink > 1)) fail('linked-path');
    if (i < segments.length - 1 && !stat.isDirectory()) fail('invalid-path');
  }
  const resolved = await fs.realpath(file);
  const relative = path.relative(root, resolved);
  if (relative.startsWith(`..${path.sep}`) || relative === '..' || path.isAbsolute(relative)) fail('linked-path');
  return { file, stat };
}

async function json(root, segments) {
  const { file, stat } = await entry(root, segments);
  if (!stat.isFile()) fail('config-invalid');
  if (stat.size > MAX_JSON_BYTES) fail('file-too-large');
  const handle = await fs.open(file, constants.O_RDONLY | (constants.O_NOFOLLOW || 0) | (constants.O_NONBLOCK || 0));
  try {
    const opened = await handle.stat();
    if (!opened.isFile() || opened.nlink > 1 || opened.ino !== stat.ino || opened.dev !== stat.dev) fail('linked-path');
    const buffer = Buffer.alloc(MAX_JSON_BYTES + 1);
    let size = 0;
    while (size < buffer.length) {
      const { bytesRead } = await handle.read(buffer, size, buffer.length - size, size);
      if (!bytesRead) break;
      size += bytesRead;
    }
    if (size > MAX_JSON_BYTES) fail('file-too-large');
    let value;
    try { value = JSON.parse(buffer.toString('utf8', 0, size)); } catch { fail('config-invalid'); }
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail('config-invalid');
    return value;
  } finally {
    await handle.close();
  }
}

function text(value, max = 160) {
  return typeof value === 'string' && value.trim() && value.length <= max && !/[\x00-\x1f\x7f]/.test(value) ? value : null;
}

function validDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
    && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

async function metadata(root, slug) {
  const result = {
    slug, title: slug, dates: null, schemaVersion: null, deployment: null,
    localDeploymentRecord: 'unknown', metadataStatus: 'needs-attention',
    contentValidation: 'not-run', issues: [],
  };
  try {
    const config = await json(root, ['trips', slug, 'trip.config.json']);
    result.title = text(config.title) || slug;
    if (!text(config.title)) result.issues.push('title-invalid');
    result.schemaVersion = Number.isSafeInteger(config.schemaVersion) ? config.schemaVersion : null;
    if (result.schemaVersion !== SCHEMA_VERSION) result.issues.push('schema-unsupported');
    if (validDate(config.dates?.start) && validDate(config.dates?.end) && config.dates.start <= config.dates.end) {
      result.dates = { start: config.dates.start, end: config.dates.end };
    } else result.issues.push('dates-invalid');
    const target = config.deploy?.target || 'workers';
    if (['workers', 'pages'].includes(target) && text(config.deploy?.name, 63)
      && DEPLOY_NAME.test(config.deploy.name)) {
      result.deployment = { target, name: config.deploy.name, remoteVerified: false };
    } else result.issues.push('deployment-invalid');
    for (const name of DATA_FILES) {
      try {
        if (!(await entry(root, ['trips', slug, name])).stat.isFile()) fail('data-files-missing');
      } catch (error) {
        result.issues.push(error.code === 'linked-path' ? 'linked-path' : 'data-files-missing');
      }
    }
    // Presence is not proof that the record is valid, current, or belongs to this target.
    try {
      const record = await entry(root, ['.local', 'deployments', `${slug}.json`]);
      result.localDeploymentRecord = record.stat.isFile() ? 'present' : 'unknown';
    } catch (error) {
      result.localDeploymentRecord = error.code === 'ENOENT' ? 'missing' : 'unknown';
    }
  } catch (error) {
    const known = ['linked-path', 'file-too-large', 'config-invalid'];
    result.issues.push(known.includes(error.code) ? error.code : 'config-unreadable');
  }
  result.issues = [...new Set(result.issues)];
  if (!result.issues.length) result.metadataStatus = 'readable';
  return result;
}

async function inspectProject(selectedPath) {
  const base = { readOnly: true, ownership: 'unverified', contentValidation: 'not-run' };
  try {
    if (typeof selectedPath !== 'string' || !path.isAbsolute(selectedPath)) fail('invalid-path');
    const root = await fs.realpath(selectedPath);
    if (!(await fs.stat(root)).isDirectory()) fail('not-project');
    const pkg = await json(root, ['package.json']);
    for (const file of ['build.js', 'check.js']) {
      try {
        if (!(await entry(root, ['scripts', file])).stat.isFile()) fail('not-project');
      } catch { fail('not-project'); }
    }
    const tripsDir = await entry(root, ['trips']);
    if (!tripsDir.stat.isDirectory()) fail('not-project');
    const names = [];
    let limited = false;
    const dir = await fs.opendir(tripsDir.file);
    for await (const child of dir) {
      if (child.name.startsWith('_') || child.name.startsWith('.') || (!child.isDirectory() && !child.isSymbolicLink())) continue;
      if (names.length === MAX_TRIPS) { limited = true; break; }
      names.push(child.name);
    }
    const trips = [];
    for (const slug of names.sort()) trips.push(await metadata(root, slug));
    return {
      ...base, ok: true, root, projectName: text(pkg.name, 100) || path.basename(root),
      engineVersion: text(pkg.version, 64), trips, limited,
    };
  } catch (error) {
    const known = ['invalid-path', 'not-project', 'linked-path', 'file-too-large', 'config-invalid'];
    return { ...base, ok: false, code: known.includes(error.code) ? error.code : 'project-unreadable' };
  }
}

module.exports = { inspectProject };
