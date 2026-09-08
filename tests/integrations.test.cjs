const { test } = require('node:test');
const assert = require('node:assert/strict');
const I = require('../extension/integrations.js');

const report = {
  title: 'Checkout fails',
  expected: 'The payment screen opens.',
  actual: 'A server error appears.',
  url: 'https://example.com/checkout?token=private',
  environment: { browser: 'Chromium' },
  events: [{ kind: 'network', ms: 1250, message: 'Checkout failed', method: 'POST', status: 503, url: 'https://example.com/api/checkout' }],
  screenshots: [{ id: 'shot-1', data: 'data:image/jpeg;base64,abc', reason: 'Failure', ms: 1300 }],
  artifacts: [],
  droppedEvents: 0,
  stopReason: 'Stopped by reporter.'
};

test('Jira issue payload uses ADF and keeps captured text in text nodes', () => {
  const issue = I.jiraIssue(report, { project: { id: '10001' }, issueType: { name: 'Bug' }, labels: ['bugdrop', 'qa'] });
  assert.deepEqual(issue.fields.project, { id: '10001' });
  assert.deepEqual(issue.fields.issuetype, { name: 'Bug' });
  assert.equal(issue.fields.summary, 'Checkout fails');
  assert.equal(issue.fields.description.type, 'doc');
  assert.equal(issue.fields.description.version, 1);
  assert.deepEqual(issue.fields.labels, ['bugdrop', 'qa']);
  const serialized = JSON.stringify(issue);
  assert.ok(serialized.includes('POST 503'));
  assert.ok(!serialized.includes('token=private'));
});

test('handoff includes only the portable report and provider payload', () => {
  const handoff = I.createHandoff('jira-cloud', { ...report, tabId: 99, channel: 'secret' }, { project: { key: 'BUG' }, issueType: { id: '10004' } });
  assert.equal(handoff.contractVersion, 1);
  assert.equal(handoff.provider, 'jira-cloud');
  assert.equal(handoff.report.schemaVersion, 2);
  assert.equal(handoff.report.screenshots.length, 1);
  assert.equal(handoff.report.tabId, undefined);
  assert.equal(handoff.report.channel, undefined);
  assert.ok(!JSON.stringify(handoff).includes('token=private'));
  assert.deepEqual(handoff.providerPayload.fields.project, { key: 'BUG' });
});

test('Jira payload rejects missing routing configuration and unsupported providers', () => {
  assert.throws(() => I.jiraIssue(report, {}), /Jira project/);
  assert.throws(() => I.createHandoff('unknown', report), /Unsupported/);
});

test('Jira summary, labels, and choices are bounded and redacted', () => {
  const issue = I.jiraIssue({ ...report, title: 'x'.repeat(400) }, {
    project: { id: '10001' }, issueType: { id: '10004' },
    labels: ['token=private', ...Array.from({ length: 29 }, (_, index) => `label-${index}`)]
  });
  assert.equal(issue.fields.summary.length, 255);
  assert.equal(issue.fields.labels.length, 20);
  assert.ok(!JSON.stringify(issue).includes('token=private'));
});
