'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { validIsoDate, validateAnswers, safeRegex } = require('../../server/services/v22Validation');
const { rateLimitV22, _buckets } = require('../../server/middleware/v22RateLimit');

test('strict ISO calendar dates reject invalid dates and leap days', () => {
  assert.equal(validIsoDate('2024-02-29'), true);
  assert.equal(validIsoDate('2025-02-29'), false);
  assert.equal(validIsoDate('2026-13-01'), false);
  assert.equal(validIsoDate('2026-1-01'), false);
});
test('answer validation accepts unanswered -1 and option indexes 0-3 only', () => {
  assert.equal(validateAnswers([-1, 0, 3], 3), true);
  assert.equal(validateAnswers([-2], 1), false);
  assert.equal(validateAnswers([4], 1), false);
  assert.equal(validateAnswers([0, 1], 1), false);
  assert.equal(validateAnswers('0', 1), false);
});
test('search strings are escaped before regex use', () => {
  const escaped = safeRegex('a.*(b)');
  assert.equal(new RegExp(escaped).test('a.*(b)'), true);
  assert.equal(new RegExp(escaped).test('axxxb'), false);
});
test('rate limiter allows configured requests and blocks excess requests', () => {
  _buckets.clear();
  const middleware = rateLimitV22({ windowMs: 60_000, max: 2, key: () => 'test-suite' });
  function invoke() {
    let next = false, status = 200, body = null;
    const req = { ip: '127.0.0.1' };
    const res = { setHeader() {}, status(s) { status = s; return this; }, json(v) { body = v; return this; } };
    middleware(req, res, () => { next = true; });
    return { next, status, body };
  }
  assert.equal(invoke().next, true);
  assert.equal(invoke().next, true);
  const third = invoke();
  assert.equal(third.status, 429);
  assert.equal(third.body.message.includes('Too many'), true);
  _buckets.clear();
});
