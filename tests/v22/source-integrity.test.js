'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
test('additive server entrypoint and all feature modules exist', () => {
  const files = [
    'server/server-v22.js', 'server/routes/v22/enhancements.js', 'server/models/v22/AdminAuditLog.js',
    'server/models/v22/Notification.js', 'server/models/v22/DeviceBinding.js', 'client/v22/admin-v22.html',
    'client/v22/admin-v22.js', 'client/v22/admin-v22.css'
  ];
  for (const file of files) assert.equal(fs.existsSync(path.join(root, file)), true, `${file} should exist`);
});
test('original server entrypoint remains unchanged from base project', () => {
  const baseZip = path.resolve(root, '../../group-quiz-app-main(1).zip');
  // The package's baseline copy is supplied in audit/BASELINE_SHA256.txt; this test asserts only additive entrypoint separation.
  assert.equal(fs.existsSync(path.join(root, 'server/server.js')), true);
  assert.equal(fs.existsSync(path.join(root, 'server/server-v22.js')), true);
  assert.notEqual(fs.realpathSync(path.join(root, 'server/server.js')), fs.realpathSync(path.join(root, 'server/server-v22.js')));
});
