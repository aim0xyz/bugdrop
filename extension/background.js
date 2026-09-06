importScripts('core.js', 'recorder.js', 'content.js');
const C = BugDropCore;
let queue = Promise.resolve();
let lastCaptureCallAt = 0;
const serial = task => { const result = queue.then(task); queue = result.catch(() => {}); return result; };
const migrate = report => {
  if (!report) return null;
  if (!Array.isArray(report.screenshots)) report.screenshots = report.screenshot ? [{ id: 'legacy-1', data: report.screenshot, reason: 'Manual screenshot', ms: 0 }] : [];
  delete report.screenshot;
  return report;
};
const read = async () => migrate((await chrome.storage.local.get('report')).report || null);
const save = report => chrome.storage.local.set({ report });
async function takeScreenshot(report, reason, automatic = false) {
  if (!report?.recording) throw new Error('Start recording before adding a screenshot.');
  if (report.screenshots.length >= C.MAX_SCREENSHOTS) {
    if (automatic) { report.autoScreenshotNote = `Automatic screenshot skipped at the ${C.MAX_SCREENSHOTS}-image limit.`; await save(report); return report; }
    throw new Error(`A capture can include up to ${C.MAX_SCREENSHOTS} screenshots.`);
  }
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (tab?.id !== report.tabId) {
    if (automatic) { report.autoScreenshotNote = 'Automatic screenshot skipped because the recorded tab was not visible.'; await save(report); return report; }
    throw new Error('Switch to the recorded tab before capturing a screenshot.');
  }
  const waitMs = Math.max(0, 1100 - (Date.now() - lastCaptureCallAt));
  if (waitMs) await new Promise(resolve => setTimeout(resolve, waitMs));
  const data = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'jpeg', quality: 65 });
  lastCaptureCallAt = Date.now();
  const [after] = await chrome.tabs.query({ active: true, windowId: tab.windowId });
  if (after?.id !== report.tabId) throw new Error('Tab changed during capture; screenshot discarded.');
  report.screenshots.push({ id: crypto.randomUUID(), data, reason: C.redact(reason, 240), ms: Date.now() - report.startedAt });
  report.lastAutoScreenshotAt = automatic ? Date.now() : report.lastAutoScreenshotAt;
  report.autoScreenshotNote = '';
  await save(report); return report;
}
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
    if (event) {
      report.events.push(event); await save(report);
      const isError = event.kind === 'error' || event.kind === 'console' && /^ERROR:/.test(event.message);
      const enabled = isError ? report.autoCapture?.errors : event.kind === 'network' ? report.autoCapture?.network : false;
      if (enabled && Date.now() - (report.lastAutoScreenshotAt || 0) >= 2000) await takeScreenshot(report, isError ? 'Automatic screenshot after an error' : `Automatic screenshot after ${event.method} ${event.status || 'failure'}`, true).catch(async error => { report.autoScreenshotNote = 'Automatic screenshot failed: ' + C.redact(error.message, 240); await save(report); });
    }
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
        origin: new URL(tab.url).origin, environment: {}, events: [], nextId: 1, droppedEvents: 0, screenshots: [],
        autoCapture: { errors: message.autoCapture?.errors === true, network: message.autoCapture?.network === true }, lastAutoScreenshotAt: 0, autoScreenshotNote: ''
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
      return await takeScreenshot(report, message.reason || 'Manual screenshot');
    }
    case 'MASK_MODE': {
      if (!report?.recording) throw new Error('Start recording before masking private areas.');
      const response = await chrome.tabs.sendMessage(report.tabId, { type: 'START_MASK_MODE' }, { documentId: report.documentId });
      if (!response?.ok) throw new Error('Could not start privacy masking.');
      return response;
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
      report.screenshots = report.screenshots.filter(image => image.id !== message.screenshotId); await save(report); return report;
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
chrome.tabs.onUpdated.addListener((tabId, change, tab) => {
  if (change.status === 'complete') serial(async () => {
    const report = await read();
    if (!report?.recording || report.tabId !== tabId) return;
    try {
      const [current] = await chrome.scripting.executeScript({ target: { tabId }, func: () => true });
      if (current.documentId === report.documentId) return;
      if (!/^https?:\/\//.test(tab.url || '') || new URL(tab.url).origin !== report.origin) throw new Error('origin changed');
      await chrome.scripting.executeScript({ target: { tabId }, files: ['core.js'] });
      const [injection] = await chrome.scripting.executeScript({ target: { tabId }, func: installContentRecorder, args: [report.channel] });
      report.documentId = injection.documentId; report.environment = injection.result; report.url = C.safeUrl(tab.url);
      const event = C.normalizeEvent({ kind:'navigation', message:'Page reloaded or navigated within the same site', url:tab.url }, report.nextId++, report.startedAt);
      if (event) report.events.push(event);
      await save(report);
      await chrome.scripting.executeScript({ target: { tabId, documentIds: [report.documentId] }, world: 'MAIN', func: installPageRecorder, args: [report.channel] });
      return;
    } catch { /* A cross-origin navigation revokes the temporary activeTab grant. */ }
    await finish(report, 'Stopped when navigation left the recorded site. Same-site reloads and navigation continue automatically.');
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
