const test = require('node:test');
const assert = require('node:assert/strict');
const { findBestMatchingRule, buildTrackingNumber } = require('./automaticCourierAssignment');

test('findBestMatchingRule prefers an exact city rule over a state rule', () => {
  const rules = [
    { state: 'Punjab', city: 'Rawalpindi', courier: 'Leopards', priority: 1, status: 'Active' },
    { state: 'Punjab', city: 'Lahore', courier: 'TCS', priority: 1, status: 'Active' }
  ];

  const best = findBestMatchingRule(rules, 'Punjab', 'Lahore');
  assert.equal(best.courier, 'TCS');
});

test('findBestMatchingRule falls back to the state rule when no city rule exists', () => {
  const rules = [
    { state: 'Punjab', city: 'All', courier: 'Leopards', priority: 1, status: 'Active' },
    { state: 'All', city: 'All', courier: 'Pakistan Post', priority: 99, status: 'Active' }
  ];

  const best = findBestMatchingRule(rules, 'Punjab', 'Islamabad');
  assert.equal(best.courier, 'Leopards');
});

test('findBestMatchingRule uses the default all/all rule when no better match exists', () => {
  const rules = [
    { state: 'All', city: 'All', courier: 'Pakistan Post', priority: 99, status: 'Active' }
  ];

  const best = findBestMatchingRule(rules, 'Sindh', 'Karachi');
  assert.equal(best.courier, 'Pakistan Post');
});

test('buildTrackingNumber returns a tracking code with the expected prefix', () => {
  const tracking = buildTrackingNumber();
  assert.match(tracking, /^TRK-/);
});
