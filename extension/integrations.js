/* Provider-neutral handoff contract and pure integration formatters. */
(function (root) {
  'use strict';

  const Core = root.BugDropCore || (typeof require === 'function' ? require('./core.js') : null);
  const CONTRACT_VERSION = 1;

  function text(value, fallback = '') {
    const cleaned = Core.redact(String(value || ''), 12000).trim();
    return cleaned || fallback;
  }

  const paragraph = value => ({
    type: 'paragraph',
    content: [{ type: 'text', text: String(value) }]
  });
  const heading = value => ({
    type: 'heading', attrs: { level: 2 },
    content: [{ type: 'text', text: value }]
  });
  const codeBlock = value => ({
    type: 'codeBlock', attrs: { language: 'text' },
    content: [{ type: 'text', text: String(value) }]
  });

  function timelineLine(event) {
    return [
      `[+${((event.ms || 0) / 1000).toFixed(1)}s]`,
      String(event.kind || 'event').toUpperCase() + ':',
      event.message || '',
      event.url ? '| ' + event.url : '',
      event.kind === 'network' ? `| ${event.method || 'OTHER'} ${event.status || 'failed'}` : '',
      event.role ? '| role ' + event.role : '',
      event.selector ? '| selector ' + event.selector : ''
    ].filter(Boolean).join(' ');
  }

  function jiraDescription(report) {
    const r = Core.portable(report);
    const lines = r.events.map(timelineLine);
    const content = [
      heading('Expected behavior'),
      paragraph(text(r.expected, 'Not provided.')),
      heading('Actual behavior'),
      paragraph(text(r.actual, 'Not provided.')),
      heading('Target'),
      paragraph(text(r.url, 'Not provided.')),
      heading('Environment'),
      codeBlock(JSON.stringify(r.environment || {}, null, 2)),
      heading('Captured timeline'),
      codeBlock(lines.join('\n') || 'No events retained.'),
      heading('Capture notes'),
      paragraph(text(r.stopReason, 'No capture notes.')),
      paragraph(`Events omitted at capture limit: ${r.droppedEvents}.`),
      paragraph(r.screenshots.length
        ? `${r.screenshots.length} reviewed screenshot(s) accompany this report.`
        : 'No screenshots accompany this report.')
    ];
    if (r.artifacts.length) {
      content.push(heading('Attachments'));
      content.push(codeBlock(r.artifacts.map(artifact => `${artifact.name} (${artifact.kind})`).join('\n')));
    }
    content.push(heading('Capture limitations'), paragraph(text(r.limitations)));
    return { version: 1, type: 'doc', content };
  }

  function requiredChoice(value, name, accepted = ['id', 'name']) {
    const id = text(value?.id, '').slice(0, 128);
    const key = text(value?.key, '').slice(0, 128);
    const itemName = text(value?.name, '').slice(0, 128);
    if (accepted.includes('id') && id) return { id };
    if (accepted.includes('key') && key) return { key };
    if (accepted.includes('name') && itemName) return { name: itemName };
    throw new Error(`${name} requires ${accepted.join(' or ')}.`);
  }

  function jiraIssue(report, configuration = {}) {
    const r = Core.portable(report);
    const fields = {
      project: requiredChoice(configuration.project, 'Jira project', ['id', 'key']),
      issuetype: requiredChoice(configuration.issueType, 'Jira issue type'),
      summary: text(r.title, 'Untitled bug').slice(0, 255),
      description: jiraDescription(r)
    };
    if (configuration.priority) fields.priority = requiredChoice(configuration.priority, 'Jira priority');
    if (Array.isArray(configuration.labels)) {
      const labels = configuration.labels
        .map(label => text(label, '').slice(0, 255))
        .filter(Boolean)
        .slice(0, 20);
      if (labels.length) fields.labels = labels;
    }
    return { fields };
  }

  function createHandoff(provider, report, options = {}) {
    if (provider !== 'jira-cloud') throw new Error('Unsupported integration provider.');
    const portable = Core.portable(report);
    portable.title = text(portable.title, 'Untitled bug').slice(0, 160);
    portable.url = portable.url ? Core.safeUrl(portable.url) : '';
    portable.expected = text(portable.expected);
    portable.actual = text(portable.actual);
    portable.stopReason = text(portable.stopReason);
    portable.limitations = text(portable.limitations);
    return {
      contractVersion: CONTRACT_VERSION,
      provider,
      report: portable,
      providerPayload: jiraIssue(portable, options)
    };
  }

  const api = { CONTRACT_VERSION, createHandoff, jiraDescription, jiraIssue, timelineLine };
  root.BugDropIntegrations = api;
  if (typeof module !== 'undefined') module.exports = api;
})(globalThis);
