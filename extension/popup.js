const $ = id => document.getElementById(id);
async function command(type, data = {}) {
  const result = await chrome.runtime.sendMessage({ type, ...data });
  if (!result?.ok) throw new Error(result?.error || 'Extension unavailable. Reload it and try again.');
  return result.data;
}
async function refresh() {
  const report = await command('GET');
  $('start').hidden = !!report;
  $('stop').hidden = !report?.recording;
  $('screenshot').hidden = !report?.recording;
  $('mask').hidden = !report?.recording;
  $('capture-options').hidden = !!report;
  $('review').hidden = !report || report.recording;
  $('new-report').hidden = !report || report.recording;
  $('state').textContent = report?.recording ? '● RECORDING · ' + report.events.length + ' EVENTS' : report ? 'REPORT READY' : 'READY WHEN YOU ARE';
  $('state').classList.toggle('recording', !!report?.recording);
  $('description').textContent = report?.recording ? `Reproduce the bug in the recorded tab. ${report.screenshots?.length || 0} of ${BugDropCore.MAX_SCREENSHOTS} screenshots saved.` : report ? 'Review your capture, export the evidence, or delete it to start a new recording.' : 'Capture the steps, errors, and failed requests your coding agent needs to investigate.';
}
function action(id, fn) {
  $(id).addEventListener('click', async () => {
    $(id).disabled = true; $('error').hidden = true;
    try { await fn(); await refresh(); } catch (error) { $('error').textContent = error.message; $('error').hidden = false; }
    finally { $(id).disabled = false; }
  });
}
const openReview = () => chrome.tabs.create({ url: chrome.runtime.getURL('review.html') });
action('start', async () => { const [tab] = await chrome.tabs.query({ active: true, currentWindow: true }); await command('START', { tabId: tab.id, autoCapture: { errors: $('auto-errors').checked, network: $('auto-network').checked } }); });
action('stop', async () => { await command('STOP'); await openReview(); window.close(); });
action('review', openReview);
action('new-report', async () => {
  const report = await command('GET');
  if (!report || report.recording) return;
  if (!confirm('Delete the last report and all of its screenshots from this browser?')) return;
  await command('DELETE', { id: report.id });
});
action('screenshot', async () => { $('shot-consent').hidden = false; });
action('mask', async () => { await command('MASK_MODE'); window.close(); });
action('cancel-shot', async () => { $('shot-consent').hidden = true; });
action('confirm-shot', async () => { const report = await command('SCREENSHOT'); $('shot-consent').hidden = true; $('screenshot').textContent = `Add screenshot… (${report.screenshots.length}/${BugDropCore.MAX_SCREENSHOTS})`; });
refresh().catch(error => { $('error').hidden = false; $('error').textContent = error.message; });
