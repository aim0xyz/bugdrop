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
  $('review').hidden = !report || report.recording;
  $('state').textContent = report?.recording ? '● RECORDING · ' + report.events.length + ' EVENTS' : report ? 'REPORT READY' : 'READY WHEN YOU ARE';
  $('state').classList.toggle('recording', !!report?.recording);
  $('description').textContent = report?.recording ? 'Reproduce the bug in the recorded tab, then come back here to stop and review.' : report ? 'Review your capture, export the evidence, or delete it to start a new recording.' : 'Capture the steps, errors, and failed requests your coding agent needs to investigate.';
}
function action(id, fn) {
  $(id).addEventListener('click', async () => {
    $(id).disabled = true; $('error').hidden = true;
    try { await fn(); await refresh(); } catch (error) { $('error').textContent = error.message; $('error').hidden = false; }
    finally { $(id).disabled = false; }
  });
}
const openReview = () => chrome.tabs.create({ url: chrome.runtime.getURL('review.html') });
action('start', async () => { const [tab] = await chrome.tabs.query({ active: true, currentWindow: true }); await command('START', { tabId: tab.id }); });
action('stop', async () => { await command('STOP'); await openReview(); window.close(); });
action('review', openReview);
action('screenshot', async () => { $('shot-consent').hidden = false; });
action('cancel-shot', async () => { $('shot-consent').hidden = true; });
action('confirm-shot', async () => { await command('SCREENSHOT'); $('shot-consent').hidden = true; $('screenshot').textContent = 'Screenshot added · replace…'; });
refresh().catch(error => { $('error').hidden = false; $('error').textContent = error.message; });
