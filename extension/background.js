importScripts('core.js', 'recorder.js', 'content.js');
const C = BugDropCore;
let queue = Promise.resolve();
const serial = task => { const result = queue.then(task); queue = result.catch(() => {}); return result; };
const read = async () => (await chrome.storage.local.get('report')).report || null;
const save = report => chrome.storage.local.set({ report });
async function finish(report, reason) {
  if (!report?.recording) return report;
  report.recording = false; report.endedAt = Date.now(); report.stopReason = reason;
  await save(report);
  await chrome.action.setBadgeText({ text: '' });
  await chrome.tabs.sendMessage(report.tabId, { type: 'STOP_CAPTURE' }, { documentId: report.documentId }).catch(() => {});
  return report;
}
async function handle(message, sender) {
  const report = await read();
  if (message.type === 'EVENT') {
    if (!report?.recording || sender.tab?.id !== report.tabId || sender.frameId !== 0 || sender.documentId !== report.documentId || message.channel !== report.channel) return;
    if (report.events.length >= C.MAX_EVENTS) {
      report.droppedEvents++; await finish(report, 'Stopped at the 300-event limit. Start a focused capture for more evidence.'); return;
    }
    const event = C.normalizeEvent(message.event, report.nextId++, report.startedAt);
    if (event) { report.events.push(event); await save(report); }
    return;
  }
  // Only extension UI pages can issue recording, export-management, or screenshot commands.
  if (sender.tab && !sender.url?.startsWith(chrome.runtime.getURL(''))) throw new Error('UI command rejected.');
  switch (message.type) {
    case 'GET': return report;
    case 'START': {
      if (report?.recording) throw new Error('Stop the current capture first.');
      if (report && !message.replace) throw new Error('Review or delete the existing report before starting another capture.');
      const tab = await chrome.tabs.get(message.tabId);
      if (!/^https?:\/\//.test(tab.url || '')) throw new Error('Open an ordinary http or https webpage first. Browser settings and extension pages cannot be recorded.');
      const next = {
        id: crypto.randomUUID(), title: C.redact(tab.title || 'Untitled bug', 160),
        url: C.safeUrl(tab.url), tabId: tab.id, channel: 'bugdrop:' + crypto.randomUUID(),
        recording: true, startedAt: Date.now(), endedAt: null,
        environment: {}, events: [], nextId: 1, droppedEvents: 0, screenshot: null
      };
      try {
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['core.js'] });
        const [injection] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: installContentRecorder, args: [next.channel] });
        next.documentId = injection.documentId; next.environment = injection.result;
        await save(next);
        await chrome.scripting.executeScript({ target: { tabId: tab.id, documentIds: [next.documentId] }, world: 'MAIN', func: installPageRecorder, args: [next.channel] });
        await chrome.action.setBadgeBackgroundColor({ color: '#f05238' });
        await chrome.action.setBadgeText({ text: 'REC' });
        return next;
      } catch (error) {
        await finish(next, 'Capture could not start on this page.');
        throw new Error('Cannot record this page: ' + error.message);
      }
    }
    case 'STOP': return await finish(report, 'Stopped by reporter.');
    case 'SCREENSHOT': {
      if (!report?.recording) throw new Error('Start recording before adding a screenshot.');
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (tab?.id !== report.tabId) throw new Error('Switch to the recorded tab before capturing a screenshot.');
      const screenshot = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'jpeg', quality: 65 });
      const [after] = await chrome.tabs.query({ active: true, windowId: tab.windowId });
      if (after?.id !== report.tabId) throw new Error('Tab changed during capture; screenshot discarded.');
      report.screenshot = screenshot; await save(report); return report;
    }
    case 'EDIT': {
      if (!report || report.recording || message.id !== report.id) throw new Error('This report changed. Reload the review page.');
      report.title = C.redact(message.title, 160);
      report.expected = C.redact(message.expected, 4000);
      report.actual = C.redact(message.actual, 4000);
      await save(report); return report;
    }
    case 'REMOVE_EVENT': {
      if (!report || report.recording || message.id !== report.id) throw new Error('This report changed. Reload the review page.');
      report.events = report.events.filter(e => e.id !== message.eventId); await save(report); return report;
    }
    case 'REMOVE_SCREENSHOT': {
      if (!report || report.recording || message.id !== report.id) throw new Error('This report changed. Reload the review page.');
      report.screenshot = null; await save(report); return report;
    }
    case 'DELETE': {
      if (message.id !== report?.id) throw new Error('This report changed. Reload first.');
      await finish(report, 'Deleted'); await chrome.storage.local.remove('report'); return null;
    }
    default: throw new Error('Unknown command.');
  }
}
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  serial(() => handle(message, sender)).then(data => respond({ ok: true, data }), error => respond({ ok: false, error: error.message }));
  return true;
});
chrome.tabs.onUpdated.addListener((tabId, change) => {
  if (change.status) serial(async () => {
    const report = await read();
    if (!report?.recording || report.tabId !== tabId) return;
    // Chrome can emit loading for history.pushState too. Compare documents,
    // rather than mistaking an SPA route change for a full navigation.
    try {
      const [current] = await chrome.scripting.executeScript({ target: { tabId }, func: () => true });
      if (current.documentId === report.documentId) return;
    } catch { /* A cross-origin navigation may revoke activeTab. */ }
    await finish(report, 'Stopped when the page navigated or reloaded. Start another capture on the new page.');
  });
});
chrome.tabs.onRemoved.addListener(tabId => serial(async () => {
  const report = await read(); if (report?.tabId === tabId) await finish(report, 'Recorded tab was closed.');
}));
chrome.runtime.onStartup.addListener(() => serial(async () => {
  await finish(await read(), 'Browser restarted.');
}));
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
});
