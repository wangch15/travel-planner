const test = require('node:test');
const assert = require('node:assert/strict');
const { diagnosePreviewFailure, problemFile } = require('../preview-diagnosis.cjs');

const base = { appVersion: '0.1.6', platform: 'darwin arm64', update: { state: 'current', migrating: false }, backup: null };

test('validation problems are grouped by the file a person would open', () => {
  assert.equal(problemFile('PLACES.kyoto-inn 缺 name'), 'data.js');
  assert.equal(problemFile('Day 2 stop 1 缺 time'), 'data.js');
  assert.equal(problemFile('Day 2 meal 0 缺 slot/time/plan/fallback'), 'dining.js');
  assert.equal(problemFile('Day 1 缺餐食規劃（sections.dining 已開啟）'), 'dining.js');
  assert.equal(problemFile('Day 3 的清單少了 x：先更新實際 Maps 清單再改 map-lists.js'), 'map-lists.js');
  assert.equal(problemFile('Day 3 缺 Google Maps 清單'), 'map-lists.js');
  assert.equal(problemFile('DETAILS.x summary 太短'), 'details.js');
  assert.equal(problemFile('x 缺 detail'), 'details.js');
  assert.equal(problemFile('Day 1 alt 0 的 x 沒有詳細說明'), 'details.js');
  assert.equal(problemFile('PHOTOS.x[0] 缺來源頁面連結'), 'photos.json');
  assert.equal(problemFile('basemap.json 缺 meta.bbox：重跑 npm run basemap'), 'basemap.json');
  assert.equal(problemFile('deploy.name 不合法：x'), 'trip.config.json');
  assert.equal(problemFile('trip.config.schemaVersion 是 1，引擎需要 2'), 'trip.config.json');
  assert.equal(problemFile('something new'), null);
});

test('invalid data explains where the problems are and offers the last backup only when it works', () => {
  const problems = ['PLACES.secret-inn 缺 name', 'Day 1 stop 0 缺 time', 'DETAILS.secret-inn 缺 refs', '未知的新規則'];
  const usable = diagnosePreviewFailure({ ...base, code: 'INVALID_TRIP', problems, backup: { usable: true, pendingFiles: 2 } });
  assert.equal(usable.reason, 'invalid');
  assert.deepEqual(usable.areas.map(a => [a.file, a.count]), [['data.js', 2], ['details.js', 1], [null, 1]]);
  assert.match(usable.explanation, /4 個地方/);
  assert.match(usable.explanation, /每日行程與地點（data\.js）2 處/);
  assert.deepEqual(usable.problems, problems, '逐項問題留給擁有者在本機看');
  assert.deepEqual(usable.actions, ['last-backup', 'retry', 'copy-report']);
  assert.match(usable.backupNote, /上次備份.*可以正常顯示/);

  const broken = diagnosePreviewFailure({ ...base, code: 'INVALID_TRIP', problems, backup: { usable: false, pendingFiles: 2 } });
  assert.deepEqual(broken.actions, ['retry', 'copy-report']);
  assert.match(broken.backupNote, /上次備份的版本也有問題/);
  const nothingPending = diagnosePreviewFailure({ ...base, code: 'INVALID_TRIP', problems, backup: { usable: true, pendingFiles: 0 } });
  assert.deepEqual(nothingPending.actions, ['retry', 'copy-report'], '沒有未備份的修改時，回去也不會改變什麼');
});

test('an outdated data format points to updating the trip folder, a newer one to updating the App', () => {
  const outdated = diagnosePreviewFailure({ ...base, code: 'INVALID_TRIP', problems: ['trip.config.schemaVersion 是 1，引擎需要 2'], update: { state: 'update-available', migrating: true }, backup: { usable: true, pendingFiles: 1 } });
  assert.equal(outdated.reason, 'outdated');
  assert.deepEqual(outdated.actions, ['project-update', 'retry', 'copy-report']);
  assert.match(outdated.explanation, /更新旅程資料夾/);
  const newer = diagnosePreviewFailure({ ...base, code: 'INVALID_TRIP', problems: [], update: { state: 'app-older', migrating: false } });
  assert.equal(newer.reason, 'app-older');
  assert.deepEqual(newer.actions, ['app-update', 'retry', 'copy-report']);
});

test('unreadable, linked, oversized and changing files each get a plain explanation naming the file', () => {
  const unreadable = diagnosePreviewFailure({ ...base, code: 'INCOMPATIBLE_DATA', file: 'dining.js' });
  assert.equal(unreadable.reason, 'unreadable');
  assert.match(unreadable.explanation, /餐食（dining\.js）/);
  assert.match(unreadable.explanation, /括號|引號/);
  assert.match(diagnosePreviewFailure({ ...base, code: 'UNSAFE_PATH', file: 'data.js' }).explanation, /捷徑或連結/);
  assert.match(diagnosePreviewFailure({ ...base, code: 'INPUT_LIMIT' }).explanation, /大小/);
  assert.match(diagnosePreviewFailure({ ...base, code: 'READ_FAILED', file: 'photos/secret-inn-1.jpg' }).explanation, /照片檔/);
  const changed = diagnosePreviewFailure({ ...base, code: 'SOURCE_CHANGED' });
  assert.deepEqual(changed.actions, ['retry']);
  assert.equal(diagnosePreviewFailure({ ...base, code: 'preview-timeout' }).reason, 'unknown');
});

test('the copy for a helper keeps only technical facts, never trip content, names or paths', () => {
  const d = diagnosePreviewFailure({ ...base, code: 'INVALID_TRIP', file: null,
    problems: ['PLACES.secret-inn 缺 name', 'DETAILS.secret-inn ref 網址不合法：https://private.example/booking?code=ABC123'],
    backup: { usable: false, pendingFiles: 3 } });
  assert.match(d.report, /0\.1\.6/);
  assert.match(d.report, /darwin arm64/);
  assert.match(d.report, /INVALID_TRIP/);
  assert.match(d.report, /data\.js.*1 處/);
  assert.match(d.report, /details\.js.*1 處/);
  for (const secret of ['secret-inn', 'private.example', 'ABC123', 'booking']) assert.doesNotMatch(d.report, new RegExp(secret));
  const photo = diagnosePreviewFailure({ ...base, code: 'READ_FAILED', file: 'photos/secret-inn-1.jpg' });
  assert.doesNotMatch(photo.report, /secret-inn/);
  assert.match(photo.report, /照片檔/);
  const odd = diagnosePreviewFailure({ ...base, code: 'weird code with /Users/someone/path' });
  assert.doesNotMatch(odd.report, /Users|someone/);
});
